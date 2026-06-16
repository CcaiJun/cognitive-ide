"""Projects router — load project, list projects, get graph data."""

import asyncio
import uuid
from fastapi import APIRouter, HTTPException, Depends, Query, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.database import get_db
from models.models import ProjectModel, CognitionNodeModel
from services.graph_engine import graph_engine
from services.analyzer import analyzer
from schemas.cognition import (
    LoadProjectRequest,
    LoadProjectResponse,
    GraphDataSchema,
    GraphNodeSchema,
    GraphEdgeSchema,
)

router = APIRouter()

# ---- In-memory init progress tracker ----
_init_jobs: dict[str, dict] = {}  # job_id -> {status, progress, message, total, current, project_id}


@router.post("/load", response_model=LoadProjectResponse)
async def load_project(
    request: LoadProjectRequest,
    db: AsyncSession = Depends(get_db),
):
    """Load a project: scan files, analyze code, build cognition graph."""
    import os
    import uuid

    project_path = request.project_path
    force = request.force_reanalyze

    # Check if project already exists in DB
    result = await db.execute(
        select(ProjectModel).where(ProjectModel.project_path == project_path)
    )
    project = result.scalars().first()

    if project and not force:
        # Try existing graph data first; if graph engine has no data (e.g. server restart),
        # rebuild from DB or re-analyze
        graph_data = graph_engine.get_graph_data(project.id)
        if not graph_data or not graph_data.get("nodes"):
            # Graph engine empty — try rebuild from DB cognition_nodes
            db_graph = await _rebuild_graph_from_db(db, project)
            if db_graph and db_graph.get("nodes"):
                graph_engine.load_graph(project.id, db_graph)
                graph_data = db_graph
            else:
                # Fallback: re-analyze from .cognition/ files
                try:
                    graph_data = await analyzer.analyze_project(project_path, project.id, force=False)
                    graph_engine.load_graph(project.id, graph_data)
                except Exception:
                    graph_data = {"nodes": [], "edges": []}
        unverified = graph_engine.get_unverified_count(project.id)
        return LoadProjectResponse(
            project_id=project.id,
            graph_data=GraphDataSchema(**graph_data) if graph_data else GraphDataSchema(),
            cognition_status="ready",
            unverified_changes=unverified,
        )

    # Create or update project record
    project_name = os.path.basename(project_path)
    if not project:
        project = ProjectModel(
            id=str(uuid.uuid4())[:8],
            name=project_name,
            project_path=project_path,
            language="typescript",
        )
        db.add(project)
        await db.commit()
        await db.refresh(project)

    # Analyze project — scan files and build cognition layer
    try:
        graph_data = await analyzer.analyze_project(project_path, project.id, force=force)
        graph_engine.load_graph(project.id, graph_data)

        # Sync cognition nodes to DB
        await _sync_nodes_to_db(db, project.id, graph_data)

    except FileNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

    unverified = graph_engine.get_unverified_count(project.id)
    return LoadProjectResponse(
        project_id=project.id,
        graph_data=GraphDataSchema(**graph_data),
        cognition_status="ready",
        unverified_changes=unverified,
    )


@router.get("/")
async def list_projects(db: AsyncSession = Depends(get_db)):
    """List all loaded projects."""
    result = await db.execute(select(ProjectModel).order_by(ProjectModel.updated_at.desc()))
    projects = result.scalars().all()
    return [
        {
            "id": p.id,
            "name": p.name,
            "language": p.language,
            "framework": p.framework,
            "project_path": p.project_path,
            "cognition_version": p.cognition_version,
            "node_count": graph_engine.get_node_count(p.id),
            "edge_count": graph_engine.get_edge_count(p.id),
            "updated_at": p.updated_at.isoformat() if p.updated_at else None,
        }
        for p in projects
    ]


@router.get("/{project_id}")
async def get_project(project_id: str, db: AsyncSession = Depends(get_db)):
    """Get project details."""
    result = await db.execute(
        select(ProjectModel).where(ProjectModel.id == project_id)
    )
    project = result.scalars().first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Also read from .cognition/ if available
    project_path = project.project_path
    config_data = None
    if project_path:
        from cognition_layer.reader import CognitionReader
        reader = CognitionReader(project_path)
        if reader.project_exists():
            config = reader.load_project_config()
            if config:
                config_data = config.model_dump()

    response = {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "language": project.language,
        "framework": project.framework,
        "project_path": project.project_path,
        "cognition_version": project.cognition_version,
        "created_at": project.created_at.isoformat() if project.created_at else None,
        "updated_at": project.updated_at.isoformat() if project.updated_at else None,
        "node_count": graph_engine.get_node_count(project_id),
        "edge_count": graph_engine.get_edge_count(project_id),
    }
    if config_data:
        response["cognition_config"] = config_data

    return response


@router.get("/{project_id}/graph", response_model=GraphDataSchema)
async def get_project_graph(project_id: str, db: AsyncSession = Depends(get_db)):
    """Get the cognition graph for a project."""
    # Verify project exists
    result = await db.execute(
        select(ProjectModel).where(ProjectModel.id == project_id)
    )
    project = result.scalars().first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    graph_data = graph_engine.get_graph_data(project_id)
    if not graph_data:
        raise HTTPException(status_code=404, detail="Graph not loaded for this project")

    return GraphDataSchema(**graph_data)


# ---- Helper: sync cognition nodes from graph data to DB ----

async def _sync_nodes_to_db(db: AsyncSession, project_id: str, graph_data: dict):
    """Sync graph node data into cognition_nodes table."""
    for node_data in graph_data.get("nodes", []):
        node_id = node_data.get("id", "")
        result = await db.execute(
            select(CognitionNodeModel).where(
                CognitionNodeModel.id == node_id,
                CognitionNodeModel.project_id == project_id,
            )
        )
        existing = result.scalars().first()

        if existing:
            existing.responsibility_summary = node_data.get("responsibility", "")
            existing.lines = node_data.get("lines", 0)
            existing.health_score = node_data.get("health_score", 0.0)
            existing.risk_count = node_data.get("risk_count", 0)
            existing.test_coverage = node_data.get("test_coverage", 0.0)
            existing.status = node_data.get("status", "active")
            existing.human_verified = node_data.get("verified", False)
        else:
            new_node = CognitionNodeModel(
                id=node_id,
                project_id=project_id,
                file_path=node_data.get("id", ""),
                language=node_data.get("language", "typescript"),
                lines=node_data.get("lines", 0),
                module_type=node_data.get("type", "domain"),
                responsibility_summary=node_data.get("responsibility", ""),
                health_score=node_data.get("health_score", 0.0),
                risk_count=node_data.get("risk_count", 0),
                test_coverage=node_data.get("test_coverage", 0.0),
                status=node_data.get("status", "active"),
                human_verified=node_data.get("verified", False),
            )
            db.add(new_node)

    # Sync edges
    from models.models import DependencyEdgeModel
    # Clear existing edges for this project's nodes
    node_ids = [n.get("id", "") for n in graph_data.get("nodes", [])]
    if node_ids:
        await db.execute(
            DependencyEdgeModel.__table__.delete().where(
                DependencyEdgeModel.source_id.in_(node_ids)
            )
        )
    for edge_data in graph_data.get("edges", []):
        edge_id = edge_data.get("id", "")
        if not edge_id:
            continue
        new_edge = DependencyEdgeModel(
            id=edge_id,
            source_id=edge_data.get("source", ""),
            target_id=edge_data.get("target", ""),
            edge_type=edge_data.get("type", "depends_on"),
            label=edge_data.get("label", ""),
        )
        db.add(new_edge)

    await db.commit()


async def _rebuild_graph_from_db(db: AsyncSession, project: ProjectModel) -> dict | None:
    """Rebuild graph data from DB cognition_nodes + dependency_edges tables."""
    result = await db.execute(
        select(CognitionNodeModel).where(CognitionNodeModel.project_id == project.id)
    )
    nodes = result.scalars().all()
    if not nodes:
        return None

    graph_nodes = []
    for n in nodes:
        graph_nodes.append({
            "id": n.id,
            "label": n.id,
            "type": n.module_type,
            "responsibility": n.responsibility_summary,
            "language": n.language,
            "lines": n.lines,
            "complexity": "medium",
            "verified": n.human_verified,
            "status": n.status,
            "health_score": n.health_score,
            "risk_count": n.risk_count,
            "test_coverage": n.test_coverage,
        })

    # Load edges
    from models.models import DependencyEdgeModel
    result = await db.execute(
        select(DependencyEdgeModel).where(
            DependencyEdgeModel.source_id.in_([n.id for n in nodes])
        )
    )
    edges = result.scalars().all()
    graph_edges = []
    for e in edges:
        graph_edges.append({
            "id": e.id,
            "source": e.source_id,
            "target": e.target_id,
            "type": e.edge_type,
            "label": e.description or "",
        })

    return {"nodes": graph_nodes, "edges": graph_edges}


# ---- Initialization endpoints ----

@router.post("/init")
async def init_project(
    project_path: str,
    force: bool = False,
    db: AsyncSession = Depends(get_db),
    background_tasks: BackgroundTasks = BackgroundTasks(),
):
    """Initialize a project: scan files, analyze code, generate .cognition/."""
    import os
    if not os.path.isdir(project_path):
        raise HTTPException(404, f"Directory not found: {project_path}")

    job_id = f"init-{uuid.uuid4().hex[:8]}"
    _init_jobs[job_id] = {
        "status": "starting",
        "progress": 0,
        "message": "正在初始化...",
        "total": 0,
        "current": 0,
        "project_path": project_path,
        "project_id": None,
    }

    background_tasks.add_task(_run_init_job, job_id, project_path, force)
    return {"job_id": job_id, "status": "starting"}


@router.get("/init/{job_id}")
async def get_init_status(job_id: str):
    """Get the progress of an initialization job."""
    job = _init_jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Init job not found")
    return job


async def _run_init_job(job_id: str, project_path: str, force: bool):
    """Background task: run project analysis with progress tracking."""
    import os
    job = _init_jobs[job_id]
    try:
        job["status"] = "scanning"
        job["message"] = "正在扫描文件结构..."
        job["progress"] = 10

        # Get or create project
        from core.database import async_session
        async with async_session() as db:
            result = await db.execute(
                select(ProjectModel).where(ProjectModel.project_path == project_path)
            )
            project = result.scalars().first()
            if not project:
                project = ProjectModel(
                    id=str(uuid.uuid4())[:8],
                    name=os.path.basename(project_path),
                    project_path=project_path,
                    language="unknown",
                )
                db.add(project)
                await db.commit()
                await db.refresh(project)

            job["project_id"] = project.id
            job["status"] = "analyzing"
            job["message"] = "正在分析代码结构..."
            job["progress"] = 30

            graph_data = await analyzer.analyze_project(project_path, project.id, force=force)

            job["progress"] = 70
            job["message"] = "正在构建认知图谱..."
            job["total"] = len(graph_data.get("nodes", []))

            graph_engine.load_graph(project.id, graph_data)

            job["progress"] = 85
            job["message"] = "正在同步到数据库..."

            await _sync_nodes_to_db(db, project.id, graph_data)

            # Update project language if it was unknown
            if project.language == "unknown":
                from cognition_layer.reader import CognitionReader
                reader = CognitionReader(project_path)
                config = reader.load_project_config()
                if config and config.language:
                    project.language = config.language
                    await db.commit()

            job["status"] = "completed"
            job["progress"] = 100
            job["message"] = f"初始化完成：{len(graph_data.get('nodes', []))} 个模块，{len(graph_data.get('edges', []))} 条依赖"
            job["current"] = job["total"]

    except Exception as e:
        job["status"] = "error"
        job["message"] = f"初始化失败: {str(e)[:200]}"