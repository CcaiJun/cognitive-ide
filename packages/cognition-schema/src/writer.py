"""CognitionWriter — Write and serialize .cognition/ YAML files to disk."""

from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, List

import yaml

from schemas.cognition import (
    CognitionNodeSchema,
    ProjectConfigSchema,
    SymbolIndexSchema,
    CognitionSnapshotSchema,
)


class CognitionWriter:
    """Write cognition data to .cognition/ YAML files on disk."""

    def __init__(self, project_root: str):
        self.project_root = Path(project_root)
        self.cognition_dir = self.project_root / ".cognition"

    def ensure_cognition_dir(self) -> Path:
        """Ensure .cognition/ directory structure exists."""
        dirs = [
            self.cognition_dir,
            self.cognition_dir / "snapshots",
            self.cognition_dir / "decisions",
        ]
        for d in dirs:
            d.mkdir(parents=True, exist_ok=True)
        return self.cognition_dir

    def write_project_config(self, config: ProjectConfigSchema) -> Path:
        """Write .cognition/project.yaml."""
        self.ensure_cognition_dir()
        path = self.cognition_dir / "project.yaml"

        data = {
            "cognition_version": config.cognition_version,
            "project_id": config.project_id,
            "name": config.name,
            "description": config.description,
            "language": config.language,
            "framework": config.framework,
            "generation": {
                "auto_analyze": config.generation.auto_analyze,
                "ai_model": config.generation.ai_model,
                "human_review_required": config.generation.human_review_required,
            },
            "modules": [
                {"path": m.path, "name": m.name, "type": m.type}
                for m in config.modules
            ],
        }

        return self._write_yaml(path, data)

    def write_cognition_node(self, node: CognitionNodeSchema) -> Path:
        """Write a cognition node YAML file.

        Writes to .cognition/{node_id}.cognition.yaml
        """
        self.ensure_cognition_dir()
        path = self.cognition_dir / f"{node.node_id}.cognition.yaml"

        data = self._cognition_node_to_dict(node)
        return self._write_yaml(path, data)

    def write_cognition_node_alongside_file(self, node: CognitionNodeSchema) -> Path:
        """Write a cognition node YAML file alongside its source file.

        Writes to {file_path}.cognition.yaml next to the source file.
        """
        if node.file_path:
            source_path = self.project_root / node.file_path
            path = Path(str(source_path) + ".cognition.yaml")
            path.parent.mkdir(parents=True, exist_ok=True)
        else:
            self.ensure_cognition_dir()
            path = self.cognition_dir / f"{node.node_id}.cognition.yaml"

        data = self._cognition_node_to_dict(node)
        return self._write_yaml(path, data)

    def write_symbol_index(self, index: SymbolIndexSchema) -> Path:
        """Write .cognition/symbol_index.yaml."""
        self.ensure_cognition_dir()
        path = self.cognition_dir / "symbol_index.yaml"

        data = {
            "symbols": [
                {
                    "name": s.name,
                    "type": s.type,
                    "node_id": s.node_id,
                    "file": s.file,
                    "line": s.line,
                }
                for s in index.symbols
            ]
        }

        return self._write_yaml(path, data)

    def write_snapshot(self, snapshot: CognitionSnapshotSchema) -> Path:
        """Write a cognition snapshot YAML file."""
        self.ensure_cognition_dir()
        path = self.cognition_dir / "snapshots" / f"{snapshot.commit_hash}.yaml"

        data = {
            "snapshot_id": snapshot.snapshot_id,
            "commit_hash": snapshot.commit_hash,
            "commit_message": snapshot.commit_message,
            "generated_at": snapshot.generated_at.isoformat() if isinstance(snapshot.generated_at, datetime) else str(snapshot.generated_at),
            "graph_summary": snapshot.graph_summary.model_dump() if hasattr(snapshot.graph_summary, 'model_dump') else snapshot.graph_summary,
            "changes": [
                c.model_dump() if hasattr(c, 'model_dump') else c
                for c in snapshot.changes
            ],
            "human_review_status": snapshot.human_review_status,
            "reviewed_by": snapshot.reviewed_by,
        }

        return self._write_yaml(path, data)

    def write_decision(self, decision_id: str, decision_data: Dict) -> Path:
        """Write a decision record to .cognition/decisions/."""
        self.ensure_cognition_dir()
        path = self.cognition_dir / "decisions" / f"{decision_id}.yaml"
        return self._write_yaml(path, decision_data)

    def update_cognition_node(self, node_id: str, updates: Dict) -> Optional[Path]:
        """Update specific fields of an existing cognition node.

        Reads the existing file, applies updates, and writes back.
        """
        from packages.cognition_schema.src.reader import CognitionReader

        reader = CognitionReader(str(self.project_root))
        node = reader.load_cognition_node(node_id)
        if node is None:
            return None

        # Apply updates to the node data
        current_dict = self._cognition_node_to_dict(node)
        current_dict = self._deep_merge(current_dict, updates)

        # Parse back into schema for validation
        updated_node = CognitionNodeSchema(**current_dict)
        return self.write_cognition_node(updated_node)

    def delete_cognition_node(self, node_id: str) -> bool:
        """Delete a cognition node YAML file."""
        path = self.cognition_dir / f"{node_id}.cognition.yaml"
        if path.exists():
            path.unlink()
            return True
        return False

    # ---- Private helpers ----

    def _cognition_node_to_dict(self, node: CognitionNodeSchema) -> Dict:
        """Convert a CognitionNodeSchema to a YAML-friendly dict."""
        data = {
            "node_id": node.node_id,
            "file_path": node.file_path,
            "language": node.language,
            "lines": node.lines,
            "last_analyzed_at": node.last_analyzed_at.isoformat() if isinstance(node.last_analyzed_at, datetime) else str(node.last_analyzed_at),
            "analyzed_by": node.analyzed_by,
            "human_verified": node.human_verified,
            "verified_by": node.verified_by,
            "verified_at": node.verified_at.isoformat() if node.verified_at and isinstance(node.verified_at, datetime) else node.verified_at,
            "responsibility": {
                "summary": node.responsibility.summary,
                "detail": node.responsibility.detail,
            },
            "interfaces": [
                {
                    "name": i.name,
                    "signature": i.signature,
                    "access": i.access,
                    "side_effects": i.side_effects,
                    "callers": [{"node_id": c.node_id, "file": c.file} for c in i.callers],
                    "preconditions": i.preconditions,
                    "complexity": i.complexity,
                }
                for i in node.interfaces
            ],
            "key_types": [
                {"name": k.name, "definition_in": k.definition_in, "fields": k.fields}
                for k in node.key_types
            ],
            "dependencies": [
                {
                    "node_id": d.node_id,
                    "interface_file": d.interface_file,
                    "used_for": d.used_for,
                    "required": d.required,
                }
                for d in node.dependencies
            ],
            "decisions": [
                {
                    "id": dec.id,
                    "title": dec.title,
                    "context": dec.context,
                    "decision": dec.decision,
                    "consequences": dec.consequences,
                    "linked_issue": dec.linked_issue,
                }
                for dec in node.decisions
            ],
            "risks": [
                {
                    "id": r.id,
                    "level": r.level,
                    "title": r.title,
                    "description": r.description,
                    "mitigation": r.mitigation,
                    "status": r.status,
                }
                for r in node.risks
            ],
            "testing": {
                "coverage_percent": node.testing.coverage_percent if node.testing else 0,
                "test_files": node.testing.test_files if node.testing else [],
                "uncovered_cases": node.testing.uncovered_cases if node.testing else [],
            } if node.testing else None,
            "performance": {
                "average_latency_ms": node.performance.average_latency_ms if node.performance else 0,
                "p99_latency_ms": node.performance.p99_latency_ms if node.performance else None,
                "bottleneck": node.performance.bottleneck if node.performance else None,
            } if node.performance else None,
        }

        if node.data_flow:
            data["data_flow"] = {
                "description": node.data_flow.description,
                "steps": [
                    {
                        "action": s.action,
                        "input": s.input,
                        "output": s.output,
                        "calls": s.calls,
                        "writes_to": s.writes_to,
                        "publishes": s.publishes,
                    }
                    for s in node.data_flow.steps
                ],
            }

        # Remove None values for cleaner YAML
        data = self._remove_none(data)
        return data

    def _write_yaml(self, path: Path, data: Dict) -> Path:
        """Write data to a YAML file with proper formatting."""
        path.parent.mkdir(parents=True, exist_ok=True)

        with open(path, "w", encoding="utf-8") as f:
            yaml.dump(
                data,
                f,
                default_flow_style=False,
                sort_keys=False,
                allow_unicode=True,
                width=120,
            )

        return path

    def _deep_merge(self, base: Dict, override: Dict) -> Dict:
        """Deep merge two dicts. Override values take precedence."""
        result = base.copy()
        for key, value in override.items():
            if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                result[key] = self._deep_merge(result[key], value)
            else:
                result[key] = value
        return result

    def _remove_none(self, obj):
        """Recursively remove None values from dicts/lists."""
        if isinstance(obj, dict):
            return {k: self._remove_none(v) for k, v in obj.items() if v is not None}
        elif isinstance(obj, list):
            return [self._remove_none(item) for item in obj]
        return obj