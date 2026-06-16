"""AI router — AI development requests, context assembly, streaming responses."""

import uuid
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from core.database import get_db
from models.models import AIRequestModel, CognitionNodeModel, ProjectModel
from services.ai_orchestrator import ai_orchestrator
from services.graph_engine import graph_engine
from schemas.cognition import (
    AIDevelopRequest,
    AIDevelopResponse,
    ExecuteChangesRequest,
    ExecuteChangesResponse,
    ChatRequest,
    ChatResponse,
    CognitionDraftSchema,
    ImpactRadiusSchema,
    ImpactNodeSchema,
    AIRequestStatus,
)

router = APIRouter()


@router.post("/develop", response_model=AIDevelopResponse)
async def ai_develop(
    request: AIDevelopRequest,
    db: AsyncSession = Depends(get_db),
):
    """Submit an AI development request: analyze impact, generate cognition draft."""
    request_id = f"req-{uuid.uuid4().hex[:8]}"
    target_node = request.target_node
    instruction = request.instruction

    # Ensure AI orchestrator has latest DB settings
    await ai_orchestrator.reload_settings(db)

    # Find the node and its project
    result = await db.execute(
        select(CognitionNodeModel).where(CognitionNodeModel.id == target_node)
    )
    node = result.scalars().first()
    if not node:
        raise HTTPException(status_code=404, detail=f"Node '{target_node}' not found")

    project_id = node.project_id

    # Get project path for .cognition/ access
    project_path = None
    proj_result = await db.execute(
        select(ProjectModel).where(ProjectModel.id == project_id)
    )
    project = proj_result.scalars().first()
    if project:
        project_path = project.project_path

    # Calculate impact radius
    impact_data = graph_engine.calculate_impact_radius(
        target_node, depth=request.context_depth
    )

    # Assemble context for AI
    context_pkg = await ai_orchestrator.assemble_context(
        target_node=target_node,
        instruction=instruction,
        impact=impact_data,
        db=db,
        project_path=project_path,
    )

    # Call AI to generate cognition draft
    try:
        ai_result = await ai_orchestrator.generate_cognition_draft(
            context=context_pkg,
            preferred_model=request.preferred_model,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI request failed: {str(e)}")

    # Build response schemas
    cognition_draft = None
    if ai_result.get("cognition_draft"):
        try:
            cognition_draft = CognitionDraftSchema(**ai_result["cognition_draft"])
        except Exception:
            cognition_draft = CognitionDraftSchema(
                responsibility_change=ai_result["cognition_draft"].get("responsibility_change", ""),
                questions_for_human=ai_result.get("questions_for_human", []),
            )

    impact_radius = None
    if impact_data:
        impact_radius = ImpactRadiusSchema(
            center_node_id=target_node,
            direct=[
                ImpactNodeSchema(
                    node_id=d.get("node_id", ""),
                    node_label=d.get("node_label", ""),
                    reason=d.get("reason", ""),
                    distance=1,
                )
                for d in impact_data.get("direct", [])
            ],
            indirect=[
                ImpactNodeSchema(
                    node_id=d.get("node_id", ""),
                    node_label=d.get("node_label", ""),
                    reason=d.get("reason", ""),
                    distance=d.get("distance", 2),
                )
                for d in impact_data.get("indirect", [])
            ],
        )

    # Store request in DB
    ai_request = AIRequestModel(
        id=request_id,
        project_id=project_id,
        target_node=target_node,
        instruction=instruction,
        context_depth=request.context_depth,
        preferred_model=request.preferred_model or "",
        status="cognition_draft_ready",
        cognition_draft=ai_result.get("cognition_draft", {}),
        impact_analysis=ai_result.get("impact_analysis", {}),
        questions_for_human=ai_result.get("questions_for_human", []),
    )
    db.add(ai_request)
    await db.commit()

    # Broadcast via WebSocket
    from routers.ws import broadcast_graph_update
    await broadcast_graph_update(project_id, {
        "ai_request": {
            "request_id": request_id,
            "target_node": target_node,
            "status": "cognition_draft_ready",
        },
    })

    return AIDevelopResponse(
        request_id=request_id,
        status=AIRequestStatus.cognition_draft_ready,
        cognition_draft=cognition_draft,
        impact_radius=impact_radius,
        questions_for_human=ai_result.get("questions_for_human", []),
    )


@router.post("/develop/{request_id}/execute", response_model=ExecuteChangesResponse)
async def execute_ai_changes(
    request_id: str,
    request: ExecuteChangesRequest,
    db: AsyncSession = Depends(get_db),
):
    """Execute an approved AI development request: write code, update cognition, commit."""
    result = await db.execute(
        select(AIRequestModel).where(AIRequestModel.id == request_id)
    )
    ai_request = result.scalars().first()
    if not ai_request:
        raise HTTPException(status_code=404, detail="AI request not found")

    if not request.cognition_approved or not request.code_approved:
        ai_request.status = "error"
        await db.commit()
        raise HTTPException(status_code=400, detail="Both cognition and code must be approved")

    # Get project path
    proj_result = await db.execute(
        select(ProjectModel).where(ProjectModel.id == ai_request.project_id)
    )
    project = proj_result.scalars().first()
    project_path = project.project_path if project else None

    # Execute changes
    try:
        exec_result = await ai_orchestrator.execute_changes(
            ai_request=ai_request,
            cognition_modifications=request.cognition_modifications or {},
            commit_message=request.commit_message,
            project_path=project_path,
        )
    except Exception as e:
        ai_request.status = "error"
        await db.commit()
        raise HTTPException(status_code=500, detail=f"Execution failed: {str(e)}")

    # Update request status
    ai_request.status = "committed"
    await db.commit()

    # Reload graph after changes
    if project_path:
        from services.analyzer import analyzer
        try:
            graph_data = await analyzer.analyze_project(
                project_path, ai_request.project_id, force=False
            )
            graph_engine.load_graph(ai_request.project_id, graph_data)
        except Exception:
            pass

    # Broadcast update
    from routers.ws import broadcast_graph_update
    await broadcast_graph_update(ai_request.project_id, {
        "ai_executed": {
            "request_id": request_id,
            "commit_hash": exec_result.get("commit_hash", ""),
            "files_changed": exec_result.get("files_changed", []),
        },
    })

    return ExecuteChangesResponse(
        status="committed",
        commit_hash=exec_result.get("commit_hash"),
        files_changed=exec_result.get("files_changed", []),
    )


@router.get("/develop/{request_id}")
async def get_ai_request_status(request_id: str, db: AsyncSession = Depends(get_db)):
    """Get the status of an AI development request."""
    result = await db.execute(
        select(AIRequestModel).where(AIRequestModel.id == request_id)
    )
    ai_request = result.scalars().first()
    if not ai_request:
        raise HTTPException(status_code=404, detail="AI request not found")

    return {
        "request_id": ai_request.id,
        "status": ai_request.status,
        "target_node": ai_request.target_node,
        "instruction": ai_request.instruction,
        "cognition_draft": ai_request.cognition_draft,
        "impact_analysis": ai_request.impact_analysis,
        "questions_for_human": ai_request.questions_for_human,
        "created_at": ai_request.created_at.isoformat() if ai_request.created_at else None,
    }


@router.post("/chat", response_model=ChatResponse)
async def ai_chat(
    request: ChatRequest,
    db: AsyncSession = Depends(get_db),
):
    """Chat with the AI about project cognition."""
    # Ensure AI orchestrator has latest DB settings
    await ai_orchestrator.reload_settings(db)

    project_path = None
    if request.project_id:
        proj_result = await db.execute(
            select(ProjectModel).where(ProjectModel.id == request.project_id)
        )
        project = proj_result.scalars().first()
        if project:
            project_path = project.project_path

    response_text = await ai_orchestrator.chat(
        message=request.message,
        node_id=request.node_id or "",
        project_id=request.project_id or "",
        preferred_model=request.preferred_model,
        project_path=project_path,
    )

    return ChatResponse(response=response_text)