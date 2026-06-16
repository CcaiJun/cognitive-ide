"""WebSocket router — real-time graph updates, AI streaming, cognition diffs."""

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Dict, Set
import asyncio
import json

router = APIRouter()


class ConnectionManager:
    """Manage WebSocket connections per project."""

    def __init__(self):
        self.active_connections: Dict[str, Set[WebSocket]] = {}  # project_id -> set of ws
        self.node_subscriptions: Dict[str, Set[WebSocket]] = {}  # node_id -> set of ws

    async def connect(self, websocket: WebSocket, project_id: str):
        await websocket.accept()
        if project_id not in self.active_connections:
            self.active_connections[project_id] = set()
        self.active_connections[project_id].add(websocket)

    def disconnect(self, websocket: WebSocket, project_id: str):
        if project_id in self.active_connections:
            self.active_connections[project_id].discard(websocket)

    async def broadcast_to_project(self, project_id: str, message: dict):
        if project_id in self.active_connections:
            data = json.dumps(message)
            disconnected = set()
            for ws in self.active_connections[project_id]:
                try:
                    await ws.send_text(data)
                except Exception:
                    disconnected.add(ws)
            self.active_connections[project_id] -= disconnected

    async def send_to_subscribers(self, node_id: str, message: dict):
        if node_id in self.node_subscriptions:
            data = json.dumps(message)
            disconnected = set()
            for ws in self.node_subscriptions[node_id]:
                try:
                    await ws.send_text(data)
                except Exception:
                    disconnected.add(ws)
            self.node_subscriptions[node_id] -= disconnected


manager = ConnectionManager()


@router.websocket("/ws/{project_id}")
async def websocket_endpoint(websocket: WebSocket, project_id: str):
    """Main WebSocket endpoint for real-time project updates."""
    await manager.connect(websocket, project_id)
    try:
        while True:
            data = await websocket.receive_text()
            try:
                event = json.loads(data)
                event_type = event.get("type")

                if event_type == "file_change":
                    # Forward to sync service for analysis
                    from services.sync_service import sync_service
                    await sync_service.handle_file_change(
                        project_id=project_id,
                        path=event.get("path", ""),
                        content=event.get("content", ""),
                    )

                elif event_type == "ai_request":
                    # Stream AI response
                    from services.ai_orchestrator import ai_orchestrator
                    request_id = event.get("request_id", "")
                    instruction = event.get("instruction", "")
                    async for chunk in ai_orchestrator.stream_chat(instruction, project_id=project_id):
                        await websocket.send_text(json.dumps({
                            "type": "ai_stream",
                            "request_id": request_id,
                            "chunk": chunk,
                            "done": False,
                        }))
                    await websocket.send_text(json.dumps({
                        "type": "ai_stream",
                        "request_id": request_id,
                        "chunk": "",
                        "done": True,
                    }))

                elif event_type == "subscribe_node":
                    node_id = event.get("node_id", "")
                    if node_id not in manager.node_subscriptions:
                        manager.node_subscriptions[node_id] = set()
                    manager.node_subscriptions[node_id].add(websocket)

                elif event_type == "unsubscribe_node":
                    node_id = event.get("node_id", "")
                    if node_id in manager.node_subscriptions:
                        manager.node_subscriptions[node_id].discard(websocket)

            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({"type": "error", "message": "Invalid JSON"}))

    except WebSocketDisconnect:
        manager.disconnect(websocket, project_id)


async def broadcast_graph_update(project_id: str, updates: dict):
    """Helper to broadcast graph updates to all connected clients."""
    await manager.broadcast_to_project(project_id, {"type": "graph_update", "updates": updates})


async def broadcast_cognition_diff(project_id: str, node_id: str, diff: dict, requires_review: bool):
    """Helper to broadcast cognition diffs."""
    await manager.broadcast_to_project(project_id, {
        "type": "cognition_diff",
        "node_id": node_id,
        "diff": diff,
        "requires_human_review": requires_review,
    })


async def broadcast_impact_preview(project_id: str, node_id: str, impact: dict):
    """Helper to broadcast impact radius previews."""
    await manager.broadcast_to_project(project_id, {
        "type": "impact_preview",
        "node_id": node_id,
        "impact": impact,
    })