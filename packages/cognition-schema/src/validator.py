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
        """Validate a project config dict against the schema."""
        errors = []
        warnings = []

        # Required fields check
        if not data.get("project_id"):
            errors.append("Missing required field: project_id")
        if not data.get("name"):
            warnings.append("Missing recommended field: name")
        if not data.get("language"):
            warnings.append("Missing recommended field: language, defaulting to 'typescript'")

        # Validate modules
        modules = data.get("modules", [])
        if not modules:
            warnings.append("No modules defined in project config")

        module_paths = set()
        for m in modules:
            path = m.get("path", "")
            name = m.get("name", "")
            if not path:
                errors.append(f"Module '{name}' missing path")
            if path in module_paths:
                errors.append(f"Duplicate module path: {path}")
            module_paths.add(path)

            module_type = m.get("type", "domain")
            if module_type not in ("domain", "infrastructure", "shared", "external"):
                errors.append(f"Module '{name}' has invalid type: {module_type}")

        # Validate generation config
        gen = data.get("generation", {})
        if gen.get("ai_model") and not isinstance(gen.get("ai_model"), str):
            errors.append("generation.ai_model must be a string")

        # Pydantic validation
        try:
            ProjectConfigSchema(**data)
        except ValidationError as e:
            for err in e.errors():
                errors.append(f"Schema validation: {err['loc']} - {err['msg']}")

        return ValidationResult(is_valid=len(errors) == 0, errors=errors, warnings=warnings)

    @staticmethod
    def validate_cognition_node(data: dict) -> ValidationResult:
        """Validate a cognition node dict against the schema."""
        errors = []
        warnings = []

        # Required fields
        if not data.get("node_id"):
            errors.append("Missing required field: node_id")
        if not data.get("file_path"):
            errors.append("Missing required field: file_path")
        if not data.get("responsibility"):
            warnings.append("Missing recommended field: responsibility")
        elif isinstance(data.get("responsibility"), str):
            # Simple string responsibility is ok but detailed is better
            warnings.append("responsibility should be an object with 'summary' and 'detail'")

        # Validate interfaces
        interfaces = data.get("interfaces", [])
        iface_names = set()
        for iface in interfaces:
            name = iface.get("name", "")
            if not name:
                errors.append("Interface missing name")
            if name in iface_names:
                warnings.append(f"Duplicate interface name: {name}")
            iface_names.add(name)

            access = iface.get("access", "public")
            if access not in ("public", "private", "protected"):
                errors.append(f"Interface '{name}' has invalid access level: {access}")

        # Validate dependencies
        deps = data.get("dependencies", [])
        dep_ids = set()
        for dep in deps:
            node_id = dep.get("node_id", "")
            if not node_id:
                errors.append("Dependency missing node_id")
            if node_id in dep_ids:
                warnings.append(f"Duplicate dependency: {node_id}")
            dep_ids.add(node_id)

        # Validate risks
        risk_ids = set()
        for risk in data.get("risks", []):
            risk_id = risk.get("id", "")
            if not risk_id:
                errors.append("Risk missing id")
            if risk_id in risk_ids:
                errors.append(f"Duplicate risk id: {risk_id}")
            risk_ids.add(risk_id)

            level = risk.get("level", "medium")
            if level not in ("low", "medium", "high"):
                errors.append(f"Risk '{risk_id}' has invalid level: {level}")

            status = risk.get("status", "open")
            if status not in ("open", "mitigated", "closed"):
                errors.append(f"Risk '{risk_id}' has invalid status: {status}")

        # Validate decisions
        dec_ids = set()
        for dec in data.get("decisions", []):
            dec_id = dec.get("id", "")
            if not dec_id:
                errors.append("Decision missing id")
            if dec_id in dec_ids:
                errors.append(f"Duplicate decision id: {dec_id}")
            dec_ids.add(dec_id)

        # Pydantic validation
        try:
            CognitionNodeSchema(**data)
        except ValidationError as e:
            for err in e.errors():
                # Convert Pydantic errors to warnings if they're not critical
                field = "->".join(str(loc) for loc in err["loc"])
                if err["type"] in ("missing", "value_error"):
                    errors.append(f"Schema validation: {field} - {err['msg']}")
                else:
                    warnings.append(f"Schema validation: {field} - {err['msg']}")

        return ValidationResult(is_valid=len(errors) == 0, errors=errors, warnings=warnings)

    @staticmethod
    def validate_symbol_index(data: dict) -> ValidationResult:
        """Validate a symbol index dict."""
        errors = []
        warnings = []

        symbols = data.get("symbols", [])
        if not symbols:
            warnings.append("Symbol index is empty")

        seen = set()
        for sym in symbols:
            name = sym.get("name", "")
            sym_type = sym.get("type", "")
            node_id = sym.get("node_id", "")
            file = sym.get("file", "")
            line = sym.get("line", 0)

            if not name:
                errors.append("Symbol missing name")
            if sym_type not in ("function", "interface", "class", "type", "variable"):
                errors.append(f"Symbol '{name}' has invalid type: {sym_type}")
            if not node_id:
                warnings.append(f"Symbol '{name}' missing node_id reference")
            if not file:
                warnings.append(f"Symbol '{name}' missing file reference")
            if line <= 0:
                warnings.append(f"Symbol '{name}' has invalid line number: {line}")

            key = (name, sym_type, file)
            if key in seen:
                warnings.append(f"Duplicate symbol entry: {name} ({sym_type}) in {file}")
            seen.add(key)

        # Pydantic validation
        try:
            SymbolIndexSchema(**data)
        except ValidationError as e:
            for err in e.errors():
                errors.append(f"Schema validation: {err['loc']} - {err['msg']}")

        return ValidationResult(is_valid=len(errors) == 0, errors=errors, warnings=warnings)

    @staticmethod
    def validate_snapshot(data: dict) -> ValidationResult:
        """Validate a cognition snapshot dict."""
        errors = []
        warnings = []

        if not data.get("snapshot_id"):
            errors.append("Missing required field: snapshot_id")
        if not data.get("commit_hash"):
            errors.append("Missing required field: commit_hash")

        # Validate changes
        for change in data.get("changes", []):
            ct = change.get("change_type", "")
            if ct not in ("modified", "added", "removed"):
                errors.append(f"Invalid change_type: {ct}")

        # Pydantic validation
        try:
            CognitionSnapshotSchema(**data)
        except ValidationError as e:
            for err in e.errors():
                errors.append(f"Schema validation: {err['loc']} - {err['msg']}")

        return ValidationResult(is_valid=len(errors) == 0, errors=errors, warnings=warnings)

    @staticmethod
    def validate_cognition_yaml_file(file_path: str) -> ValidationResult:
        """Load and validate a cognition YAML file."""
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

        # Determine file type and validate accordingly
        if "project_id" in data and "modules" in data:
            return CognitionValidator.validate_project_config(data)
        elif "node_id" in data:
            return CognitionValidator.validate_cognition_node(data)
        elif "symbols" in data:
            return CognitionValidator.validate_symbol_index(data)
        elif "snapshot_id" in data or "commit_hash" in data:
            return CognitionValidator.validate_snapshot(data)
        else:
            return ValidationResult(
                is_valid=False,
                errors=["Unable to determine cognition file type. Missing identifying fields."],
            )

    @staticmethod
    def validate_cognition_directory(project_root: str) -> Tuple[ValidationResult, List[ValidationResult]]:
        """Validate the entire .cognition/ directory of a project."""
        from packages.cognition_schema.src.reader import CognitionReader

        root = Path(project_root)
        cognition_dir = root / ".cognition"

        overall_errors = []
        overall_warnings = []
        file_results = []

        # Check directory exists
        if not cognition_dir.exists():
            return ValidationResult(
                is_valid=False,
                errors=[f".cognition/ directory not found at {cognition_dir}"],
            ), []

        # Validate project.yaml
        config_path = cognition_dir / "project.yaml"
        if config_path.exists():
            result = CognitionValidator.validate_cognition_yaml_file(str(config_path))
            file_results.append(result)
            overall_errors.extend(result.errors)
            overall_warnings.extend(result.warnings)
        else:
            overall_warnings.append("project.yaml not found in .cognition/")

        # Validate all cognition node files
        for yaml_file in cognition_dir.rglob("*.cognition.yaml"):
            result = CognitionValidator.validate_cognition_yaml_file(str(yaml_file))
            file_results.append(result)
            overall_errors.extend(result.errors)
            overall_warnings.extend(result.warnings)

        # Validate symbol index
        symbol_index_path = cognition_dir / "symbol_index.yaml"
        if symbol_index_path.exists():
            result = CognitionValidator.validate_cognition_yaml_file(str(symbol_index_path))
            file_results.append(result)
            overall_errors.extend(result.errors)
            overall_warnings.extend(result.warnings)

        # Validate snapshots
        snapshots_dir = cognition_dir / "snapshots"
        if snapshots_dir.exists():
            for snapshot_file in snapshots_dir.glob("*.yaml"):
                result = CognitionValidator.validate_cognition_yaml_file(str(snapshot_file))
                file_results.append(result)
                overall_errors.extend(result.errors)
                overall_warnings.extend(result.warnings)

        overall_result = ValidationResult(
            is_valid=len(overall_errors) == 0,
            errors=overall_errors,
            warnings=overall_warnings,
        )

        return overall_result, file_results