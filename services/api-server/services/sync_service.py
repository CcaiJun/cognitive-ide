"""Sync Service — file change detection, cognition layer synchronization."""

from __future__ import annotations

import os
import json
from typing import Dict, Optional
from pathlib import Path

from core.config import settings
from services.graph_engine import graph_engine


class SyncService:
    """Monitor file changes and synchronize the cognition layer."""

    def __init__(self):
        self._watched_projects: Dict[str, dict] = {}

    async def initialize(self):
        """Initialize the sync service."""
        pass

    async def handle_file_change(self, project_id: str, path: str, content: str):
        """Handle a file change event from WebSocket."""
        # Step 1: Write file to disk
        # (In production, this would be more sophisticated)
        file_path = path
        if not os.path.isabs(file_path):
            # Resolve relative to project root
            if project_id in self._watched_projects:
                file_path = os.path.join(self._watched_projects[project_id].get("root", ""), path)

        # Step 2: Mark affected cognition node as pending_review
        # Find which node this file belongs to
        node_id = self._find_node_for_file(project_id, path)
        if node_id:
            graph_engine.update_node_status(project_id, node_id, "pending_review")

            # Step 3: Broadcast graph update
            from routers.ws import broadcast_graph_update
            await broadcast_graph_update(project_id, {
                "nodes_modified": [{"id": node_id, "status": "pending_review"}],
                "edges_added": [],
                "edges_removed": [],
            })

        # Step 4: Trigger async analysis (in background)
        # TODO: queue analysis task for the changed file

    def _find_node_for_file(self, project_id: str, file_path: str) -> Optional[str]:
        """Find the cognition node that contains a given file."""
        if project_id not in graph_engine._nodes:
            return None

        # Simple heuristic: match file path prefix with node labels
        path_lower = file_path.lower()
        for node_id, node in graph_engine._nodes[project_id].items():
            if node.label.lower() in path_lower:
                return node_id
        return None

    def watch_project(self, project_id: str, root_path: str):
        """Register a project for file watching."""
        self._watched_projects[project_id] = {"root": root_path}

    def unwatch_project(self, project_id: str):
        """Stop watching a project."""
        self._watched_projects.pop(project_id, None)


# Singleton instance
sync_service = SyncService()