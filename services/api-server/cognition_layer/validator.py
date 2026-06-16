"""CognitionValidator — Validate cognition YAML files and Pydantic models."""

from __future__ import annotations

from pathlib import Path
from typing import List, Tuple

import yaml
from pydantic import ValidationError

from schemas.cognition import (
    CognitionNodeSchema,
    ProjectConfigSchema,
    SymbolIndexSchema,
    CognitionSnapshotSchema,
)


class ValidationResult:
    """Result of a validation check."""

    def __init__(self, is_valid: bool, errors: List[str] = None, warnings: List[str] = None):
        self.is_valid = is_valid
        self.errors = errors or []
        self.warnings = warnings or []

    def __repr__(self):
        return f"ValidationResult(valid={self.is_valid}, errors={len(self.errors)}, warnings={len(self.warnings)})"

    def __bool__(self):
        return self.is_valid


class CognitionValidator:
    """Validate cognition YAML files and data structures."""

    @staticmethod
    def validate_project_config(data: dict) -> ValidationResult:
        errors, warnings = [], []
        if not data.get("project_id"):
            errors.append("Missing required field: project_id")
        if not data.get("name"):
            warnings.append("Missing recommended field: name")
        if not data.get("language"):
            warnings.append("Missing recommended field: language, defaulting to 'typescript'")
        modules = data.get("modules", [])
        if not modules:
            warnings.append("No modules defined in project config")
        module_paths = set()
        for m in modules:
            path, name = m.get("path", ""), m.get("name", "")
            if not path:
                errors.append(f"Module '{name}' missing path")
            if path in module_paths:
                errors.append(f"Duplicate module path: {path}")
            module_paths.add(path)
            if m.get("type", "domain") not in ("domain", "infrastructure", "shared", "external"):
                errors.append(f"Module '{name}' has invalid type")
        try:
            ProjectConfigSchema(**data)
        except ValidationError as e:
            for err in e.errors():
                errors.append(f"Schema: {err['loc']} - {err['msg']}")
        return ValidationResult(is_valid=len(errors) == 0, errors=errors, warnings=warnings)

    @staticmethod
    def validate_cognition_node(data: dict) -> ValidationResult:
        errors, warnings = [], []
        if not data.get("node_id"):
            errors.append("Missing required field: node_id")
        if not data.get("file_path"):
            errors.append("Missing required field: file_path")
        if not data.get("responsibility"):
            warnings.append("Missing recommended field: responsibility")
        iface_names = set()
        for iface in data.get("interfaces", []):
            name = iface.get("name", "")
            if not name:
                errors.append("Interface missing name")
            if name in iface_names:
                warnings.append(f"Duplicate interface: {name}")
            iface_names.add(name)
            if iface.get("access", "public") not in ("public", "private", "protected"):
                errors.append(f"Interface '{name}' invalid access")
        dep_ids = set()
        for dep in data.get("dependencies", []):
            nid = dep.get("node_id", "")
            if not nid:
                errors.append("Dependency missing node_id")
            if nid in dep_ids:
                warnings.append(f"Duplicate dependency: {nid}")
            dep_ids.add(nid)
        risk_ids = set()
        for risk in data.get("risks", []):
            rid = risk.get("id", "")
            if not rid:
                errors.append("Risk missing id")
            if rid in risk_ids:
                errors.append(f"Duplicate risk id: {rid}")
            risk_ids.add(rid)
            if risk.get("level", "medium") not in ("low", "medium", "high"):
                errors.append(f"Risk '{rid}' invalid level")
        try:
            CognitionNodeSchema(**data)
        except ValidationError as e:
            for err in e.errors():
                field = "->".join(str(loc) for loc in err["loc"])
                if err["type"] in ("missing", "value_error"):
                    errors.append(f"Schema: {field} - {err['msg']}")
                else:
                    warnings.append(f"Schema: {field} - {err['msg']}")
        return ValidationResult(is_valid=len(errors) == 0, errors=errors, warnings=warnings)

    @staticmethod
    def validate_symbol_index(data: dict) -> ValidationResult:
        errors, warnings = [], []
        symbols = data.get("symbols", [])
        if not symbols:
            warnings.append("Symbol index is empty")
        seen = set()
        for sym in symbols:
            name, sym_type = sym.get("name", ""), sym.get("type", "")
            if not name:
                errors.append("Symbol missing name")
            if sym_type not in ("function", "interface", "class", "type", "variable"):
                errors.append(f"Symbol '{name}' invalid type: {sym_type}")
            key = (name, sym_type, sym.get("file", ""))
            if key in seen:
                warnings.append(f"Duplicate symbol: {name}")
            seen.add(key)
        try:
            SymbolIndexSchema(**data)
        except ValidationError as e:
            for err in e.errors():
                errors.append(f"Schema: {err['loc']} - {err['msg']}")
        return ValidationResult(is_valid=len(errors) == 0, errors=errors, warnings=warnings)

    @staticmethod
    def validate_snapshot(data: dict) -> ValidationResult:
        errors, warnings = [], []
        if not data.get("snapshot_id"):
            errors.append("Missing snapshot_id")
        if not data.get("commit_hash"):
            errors.append("Missing commit_hash")
        for change in data.get("changes", []):
            if change.get("change_type", "") not in ("modified", "added", "removed"):
                errors.append(f"Invalid change_type: {change.get('change_type')}")
        try:
            CognitionSnapshotSchema(**data)
        except ValidationError as e:
            for err in e.errors():
                errors.append(f"Schema: {err['loc']} - {err['msg']}")
        return ValidationResult(is_valid=len(errors) == 0, errors=errors, warnings=warnings)

    @staticmethod
    def validate_cognition_yaml_file(file_path: str) -> ValidationResult:
        path = Path(file_path)
        if not path.exists():
            return ValidationResult(is_valid=False, errors=[f"File not found: {file_path}"])
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f)
        except yaml.YAMLError as e:
            return ValidationResult(is_valid=False, errors=[f"YAML parse error: {e}"])
        if not isinstance(data, dict):
            return ValidationResult(is_valid=False, errors=["YAML content is not a mapping"])
        if "project_id" in data and "modules" in data:
            return CognitionValidator.validate_project_config(data)
        elif "node_id" in data:
            return CognitionValidator.validate_cognition_node(data)
        elif "symbols" in data:
            return CognitionValidator.validate_symbol_index(data)
        elif "snapshot_id" in data or "commit_hash" in data:
            return CognitionValidator.validate_snapshot(data)
        return ValidationResult(is_valid=False, errors=["Unable to determine cognition file type"])

    @staticmethod
    def validate_cognition_directory(project_root: str) -> Tuple[ValidationResult, List[ValidationResult]]:
        cognition_dir = Path(project_root) / ".cognition"
        overall_errors, overall_warnings, file_results = [], [], []
        if not cognition_dir.exists():
            return ValidationResult(is_valid=False, errors=[f".cognition/ not found"]), []
        config_path = cognition_dir / "project.yaml"
        if config_path.exists():
            r = CognitionValidator.validate_cognition_yaml_file(str(config_path))
            file_results.append(r)
            overall_errors.extend(r.errors)
            overall_warnings.extend(r.warnings)
        for yf in cognition_dir.rglob("*.cognition.yaml"):
            r = CognitionValidator.validate_cognition_yaml_file(str(yf))
            file_results.append(r)
            overall_errors.extend(r.errors)
            overall_warnings.extend(r.warnings)
        sip = cognition_dir / "symbol_index.yaml"
        if sip.exists():
            r = CognitionValidator.validate_cognition_yaml_file(str(sip))
            file_results.append(r)
            overall_errors.extend(r.errors)
            overall_warnings.extend(r.warnings)
        for sf in (cognition_dir / "snapshots").glob("*.yaml"):
            r = CognitionValidator.validate_cognition_yaml_file(str(sf))
            file_results.append(r)
            overall_errors.extend(r.errors)
            overall_warnings.extend(r.warnings)
        return ValidationResult(is_valid=len(overall_errors) == 0, errors=overall_errors, warnings=overall_warnings), file_results