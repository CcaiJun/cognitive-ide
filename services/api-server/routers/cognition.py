"""Cognition router — CRUD for cognition nodes, impact radius, symbol index, verification."""

from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.database import get_db
from models.models import CognitionNodeModel, ProjectModel, RiskModel, DecisionModel
from services.graph_engine import graph_engine
from schemas.cognition import (
    GetCognitionNodeResponse,
    ImpactRadiusSchema,
    ImpactNodeSchema,
    VerifyNodeRequest,
    SymbolIndexSchema,
    CognitionNodeSchema,
)

router = APIRouter()


@router.get("/nodes/{node_id}", response_model=GetCognitionNodeResponse)
async def get_cognition_node(
    node_id: str,
    project_id: str = Query(..., description="Project ID to resolve .cognition/ path"),
    db: AsyncSession = Depends(get_db),
):
    """Get full cognition data for a specific node.

    First tries .cognition/ YAML files, falls back to DB.
    """
    # Try .cognition/ YAML first
    project = await _get_project(db, project_id)
    if project and project.project_path:
        from cognition_layer.reader import CognitionReader
        reader = CognitionReader(project.project_path)
        if reader.project_exists():
            node = reader.load_cognition_node(node_id)
            if node:
                code_snippets = _load_code_snippets(project.project_path, node.file_path)
                return GetCognitionNodeResponse(
                    node_id=node.node_id,
                    cognition=node,
                    code_snippets=code_snippets,
                )

    # Fallback: DB
    result = await db.execute(
        select(CognitionNodeModel).where(CognitionNodeModel.id == node_id)
    )
    node_model = result.scalars().first()
    if not node_model:
        raise HTTPException(status_code=404, detail="Cognition node not found")

    cognition = _db_node_to_schema(node_model, db)
    code_snippets = _load_code_snippets(
        node_model.project_id if not project else project.project_path,
        node_model.file_path,
    )

    return GetCognitionNodeResponse(
        node_id=node_model.id,
        cognition=await cognition,
        code_snippets=code_snippets,
    )


@router.get("/nodes/{node_id}/impact", response_model=ImpactRadiusSchema)
async def get_impact_radius(
    node_id: str,
    depth: int = Query(2, ge=1, le=5, description="Impact depth"),
):
    """Calculate and return the impact radius for a node."""
    impact = graph_engine.calculate_impact_radius(node_id, depth=depth)
    if impact is None:
        raise HTTPException(status_code=404, detail="Node not found in graph")

    return ImpactRadiusSchema(
        center_node_id=node_id,
        direct=[
            ImpactNodeSchema(
                node_id=d.get("node_id", ""),
                node_label=d.get("node_label", ""),
                reason=d.get("reason", ""),
                distance=1,
            )
            for d in impact.get("direct", [])
        ],
        indirect=[
            ImpactNodeSchema(
                node_id=d.get("node_id", ""),
                node_label=d.get("node_label", ""),
                reason=d.get("reason", ""),
                distance=d.get("distance", 2),
            )
            for d in impact.get("indirect", [])
        ],
        cognition_updates=impact.get("cognition_updates", []),
    )


@router.put("/nodes/{node_id}/verify")
async def verify_cognition_node(
    node_id: str,
    request: VerifyNodeRequest,
    project_id: str = Query(None, description="Project ID (optional, uses request body if omitted)"),
    db: AsyncSession = Depends(get_db),
):
    # Prefer query param, fall back to empty string
    pid = project_id or ""

    # Update in DB
    result = await db.execute(
        select(CognitionNodeModel).where(CognitionNodeModel.id == node_id)
    )
    node_model = result.scalars().first()

    if node_model:
        from datetime import datetime
        node_model.human_verified = True
        node_model.verified_by = request.verified_by
        node_model.verified_at = datetime.utcnow()
        node_model.status = "active"
        await db.commit()

    # Update in .cognition/ YAML
    project = await _get_project(db, pid)
    if project and project.project_path:
        from cognition_layer.writer import CognitionWriter
        writer = CognitionWriter(project.project_path)
        writer.update_cognition_node(node_id, {
            "human_verified": True,
            "verified_by": request.verified_by,
            "verified_at": datetime.utcnow().isoformat(),
        })

    # Update in graph engine
    graph_engine.update_node_status(pid, node_id, "active")
    if node_model:
        graph_engine.update_node_property(pid, node_id, "verified", True)

    # Broadcast update via WebSocket
    from routers.ws import broadcast_graph_update
    await broadcast_graph_update(pid, {
        "nodes_modified": [{"id": node_id, "status": "active", "verified": True}],
        "edges_added": [],
        "edges_removed": [],
    })

    return {"status": "verified", "node_id": node_id, "verified_by": request.verified_by}


@router.get("/symbols", response_model=SymbolIndexSchema)
async def get_symbol_index(
    project_id: str = Query(..., description="Project ID"),
    db: AsyncSession = Depends(get_db),
):
    """Get the symbol index for a project."""
    project = await _get_project(db, project_id)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Try .cognition/ YAML first
    if project.project_path:
        from cognition_layer.reader import CognitionReader
        reader = CognitionReader(project.project_path)
        if reader.project_exists():
            index = reader.load_symbol_index()
            return index

    # Fallback: empty
    return SymbolIndexSchema()


# ---- Helpers ----

async def _get_project(db: AsyncSession, project_id: str) -> ProjectModel:
    result = await db.execute(
        select(ProjectModel).where(ProjectModel.id == project_id)
    )
    return result.scalars().first()


def _load_code_snippets(project_path: str, file_path: str) -> dict:
    """Load code snippets for a cognition node."""
    import os
    snippets = {"interface": "", "implementation": ""}
    if not project_path or not file_path:
        return snippets

    abs_path = os.path.join(project_path, file_path) if not os.path.isabs(file_path) else file_path
    if os.path.isfile(abs_path):
        try:
            with open(abs_path, "r", encoding="utf-8", errors="ignore") as f:
                content = f.read()
            snippets["implementation"] = content[:10000]  # Cap at 10K chars
        except Exception:
            pass
    return snippets


async def _db_node_to_schema(node_model: CognitionNodeModel, db: AsyncSession) -> CognitionNodeSchema:
    """Convert a DB ORM node to a CognitionNodeSchema."""
    from schemas.cognition import ResponsibilitySchema

    cognition_data = node_model.cognition_data or {}

    return CognitionNodeSchema(
        node_id=node_model.id,
        file_path=node_model.file_path,
        language=node_model.language,
        lines=node_model.lines,
        responsibility=ResponsibilitySchema(
            summary=node_model.responsibility_summary,
            detail=node_model.responsibility_detail,
        ),
        human_verified=node_model.human_verified,
        verified_by=node_model.verified_by,
        verified_at=node_model.verified_at,
        **{k: v for k, v in cognition_data.items()
           if k not in ("node_id", "file_path", "language", "lines", "responsibility",
                        "human_verified", "verified_by", "verified_at")},
    )