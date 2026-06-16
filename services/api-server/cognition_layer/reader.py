"""CognitionReader — Read and parse .cognition/ YAML files from disk."""

from __future__ import annotations

from pathlib import Path
from typing import Optional, Dict, List

import yaml

from schemas.cognition import (
    CognitionNodeSchema,
    ProjectConfigSchema,
    SymbolIndexSchema,
    CognitionSnapshotSchema,
    ModuleBoundarySchema,
    ResponsibilitySchema,
)


class CognitionReader:
    """Read and parse .cognition/ directory contents into Pydantic models."""

    def __init__(self, project_root: str):
        self.project_root = Path(project_root)
        self.cognition_dir = self.project_root / ".cognition"

    def project_exists(self) -> bool:
        return self.cognition_dir.exists() and self.cognition_dir.is_dir()

    def load_project_config(self) -> Optional[ProjectConfigSchema]:
        config_path = self.cognition_dir / "project.yaml"
        if not config_path.exists():
            return None
        data = self._load_yaml(config_path)
        if not data:
            return None
        modules = [
            ModuleBoundarySchema(
                path=m.get("path", ""),
                name=m.get("name", ""),
                type=m.get("type", "domain"),
            )
            for m in data.get("modules", [])
        ]
        generation = data.get("generation", {})
        return ProjectConfigSchema(
            cognition_version=data.get("cognition_version", "1.0"),
            project_id=data.get("project_id", self.project_root.name),
            name=data.get("name", self.project_root.name),
            description=data.get("description", ""),
            language=data.get("language", "typescript"),
            framework=data.get("framework", ""),
            generation=generation,
            modules=modules,
        )

    def load_cognition_node(self, node_id: str) -> Optional[CognitionNodeSchema]:
        # Search in .cognition/ directory first
        cognition_file = self.cognition_dir / f"{node_id}.cognition.yaml"
        if cognition_file.exists():
            return self._parse_cognition_file(cognition_file)
        # Search all cognition files for matching node_id
        for yaml_file in self.cognition_dir.rglob("*.cognition.yaml"):
            if yaml_file.name == "project.yaml" or yaml_file.name == "symbol_index.yaml":
                continue
            data = self._load_yaml(yaml_file)
            if data and data.get("node_id") == node_id:
                return self._dict_to_cognition_node(data)
        # Search alongside source files
        for source_file in self.project_root.rglob("*.cognition.yaml"):
            if self.cognition_dir in source_file.parents:
                continue
            data = self._load_yaml(source_file)
            if data and data.get("node_id") == node_id:
                return self._dict_to_cognition_node(data)
        return None

    def load_all_cognition_nodes(self) -> List[CognitionNodeSchema]:
        nodes = []
        seen_ids = set()
        # From .cognition/ directory
        for yaml_file in self.cognition_dir.rglob("*.cognition.yaml"):
            if yaml_file.name in ("project.yaml", "symbol_index.yaml"):
                continue
            data = self._load_yaml(yaml_file)
            if data and "node_id" in data:
                nid = data["node_id"]
                if nid not in seen_ids:
                    try:
                        nodes.append(self._dict_to_cognition_node(data))
                        seen_ids.add(nid)
                    except Exception:
                        continue
        # From source directories
        for yaml_file in self.project_root.rglob("*.cognition.yaml"):
            if self.cognition_dir in yaml_file.parents:
                continue
            data = self._load_yaml(yaml_file)
            if data and "node_id" in data:
                nid = data["node_id"]
                if nid not in seen_ids:
                    try:
                        nodes.append(self._dict_to_cognition_node(data))
                        seen_ids.add(nid)
                    except Exception:
                        continue
        return nodes

    def load_symbol_index(self) -> SymbolIndexSchema:
        index_path = self.cognition_dir / "symbol_index.yaml"
        if not index_path.exists():
            return SymbolIndexSchema()
        data = self._load_yaml(index_path)
        if not data:
            return SymbolIndexSchema()
        return SymbolIndexSchema(symbols=data.get("symbols", []))

    def load_snapshot(self, commit_hash: str) -> Optional[CognitionSnapshotSchema]:
        snapshot_path = self.cognition_dir / "snapshots" / f"{commit_hash}.yaml"
        if not snapshot_path.exists():
            for f in (self.cognition_dir / "snapshots").glob("*.yaml"):
                if f.stem.startswith(commit_hash[:7]):
                    snapshot_path = f
                    break
            else:
                return None
        data = self._load_yaml(snapshot_path)
        if not data:
            return None
        return CognitionSnapshotSchema(
            snapshot_id=data.get("snapshot_id", ""),
            commit_hash=data.get("commit_hash", commit_hash),
            commit_message=data.get("commit_message", ""),
            generated_at=data.get("generated_at", ""),
            graph_summary=data.get("graph_summary", {}),
            changes=data.get("changes", []),
            human_review_status=data.get("human_review_status", "pending"),
            reviewed_by=data.get("reviewed_by"),
        )

    def load_latest_snapshot(self) -> Optional[CognitionSnapshotSchema]:
        snapshots_dir = self.cognition_dir / "snapshots"
        if not snapshots_dir.exists():
            return None
        yaml_files = sorted(snapshots_dir.glob("*.yaml"), key=lambda f: f.stat().st_mtime, reverse=True)
        if not yaml_files:
            return None
        data = self._load_yaml(yaml_files[0])
        if not data:
            return None
        return CognitionSnapshotSchema(
            snapshot_id=data.get("snapshot_id", ""),
            commit_hash=data.get("commit_hash", ""),
            commit_message=data.get("commit_message", ""),
            generated_at=data.get("generated_at", ""),
            graph_summary=data.get("graph_summary", {}),
            changes=data.get("changes", []),
            human_review_status=data.get("human_review_status", "pending"),
            reviewed_by=data.get("reviewed_by"),
        )

    def list_decisions(self) -> List[Dict]:
        decisions_dir = self.cognition_dir / "decisions"
        if not decisions_dir.exists():
            return []
        decisions = []
        for f in sorted(decisions_dir.glob("*.yaml")):
            data = self._load_yaml(f)
            if data:
                decisions.append(data)
        return decisions

    # ---- Private helpers ----

    def _load_yaml(self, path: Path) -> Optional[Dict]:
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f)
            return data if isinstance(data, dict) else None
        except Exception as e:
            print(f"[CognitionReader] Error loading {path}: {e}")
            return None

    def _parse_cognition_file(self, path: Path) -> Optional[CognitionNodeSchema]:
        data = self._load_yaml(path)
        if not data:
            return None
        return self._dict_to_cognition_node(data)

    def _dict_to_cognition_node(self, data: Dict) -> CognitionNodeSchema:
        responsibility = data.get("responsibility", {})
        if isinstance(responsibility, str):
            responsibility = {"summary": responsibility, "detail": ""}
        return CognitionNodeSchema(
            node_id=data.get("node_id", ""),
            file_path=data.get("file_path", ""),
            language=data.get("language", "typescript"),
            lines=data.get("lines", 0),
            last_analyzed_at=data.get("last_analyzed_at", ""),
            analyzed_by=data.get("analyzed_by", "analyzer-v1"),
            human_verified=data.get("human_verified", False),
            verified_by=data.get("verified_by"),
            verified_at=data.get("verified_at"),
            responsibility=ResponsibilitySchema(**responsibility) if responsibility else ResponsibilitySchema(summary=""),
            interfaces=data.get("interfaces", []),
            key_types=data.get("key_types", []),
            dependencies=data.get("dependencies", []),
            data_flow=data.get("data_flow"),
            decisions=data.get("decisions", []),
            risks=data.get("risks", []),
            testing=data.get("testing"),
            performance=data.get("performance"),
        )