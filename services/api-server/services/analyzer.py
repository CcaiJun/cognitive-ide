"""Analyzer — project scanning, code analysis, and cognition layer generation.

Integrates with CognitionReader/Writer/Validator for .cognition/ YAML management.
"""

from __future__ import annotations

import os
import uuid
import re
from typing import Dict, List, Optional
from pathlib import Path

from core.config import settings
from cognition_layer.reader import CognitionReader
from cognition_layer.writer import CognitionWriter
from cognition_layer.validator import CognitionValidator
from schemas.cognition import (
    CognitionNodeSchema,
    ProjectConfigSchema,
    ModuleBoundarySchema,
    GenerationConfigSchema,
    ResponsibilitySchema,
    InterfaceSchema,
    CallerSchema,
    DependencySchema,
    RiskSchema,
    DecisionSchema,
    SymbolIndexSchema,
    SymbolEntrySchema,
    DataFlowSchema,
    DataFlowStepSchema,
    KeyTypeSchema,
    TestingSchema,
    PerformanceSchema,
    ModuleType,
    AccessLevel,
)


class Analyzer:
    """Analyze project source code to generate cognition nodes and edges."""

    # Map file extensions to languages
    _EXT_LANG = {
        ".ts": "typescript", ".tsx": "typescript",
        ".js": "javascript", ".jsx": "javascript",
        ".py": "python", ".go": "go", ".rs": "rust",
        ".java": "java", ".kt": "kotlin",
        ".vue": "vue", ".svelte": "svelte",
        ".rb": "ruby", ".php": "php", ".c": "c", ".cpp": "cpp", ".h": "c",
        ".cs": "csharp", ".swift": "swift", ".scala": "scala",
        ".sh": "shell", ".bash": "shell", ".zsh": "shell",
        ".sql": "sql", ".graphql": "graphql",
        ".yaml": "yaml", ".yml": "yaml", ".json": "json",
        ".toml": "toml", ".ini": "ini", ".cfg": "config",
        ".md": "markdown", ".txt": "text",
        ".html": "html", ".css": "css", ".scss": "css", ".less": "css",
        ".xml": "xml", ".dockerfile": "dockerfile",
        ".proto": "protobuf",
    }

    # Extensions that are plain text but not source code (skip interface extraction)
    _TEXT_ONLY_EXT = {".md", ".txt", ".yaml", ".yml", ".json", ".toml", ".ini", ".cfg", ".xml", ".log"}

    # Common infrastructure/shared module name patterns
    _INFRA_PATTERNS = {"api", "config", "middleware", "route", "router", "server", "app", "main", "cli", "db", "database", "migrate", "migration"}
    _SHARED_PATTERNS = {"shared", "common", "utils", "helpers", "types", "constants", "lib", "core", "base", "model", "dto", "entity", "interface", "types"}

    def __init__(self):
        self._readers: Dict[str, CognitionReader] = {}
        self._writers: Dict[str, CognitionWriter] = {}

    def _get_reader(self, project_root: str) -> CognitionReader:
        if project_root not in self._readers:
            self._readers[project_root] = CognitionReader(project_root)
        return self._readers[project_root]

    def _get_writer(self, project_root: str) -> CognitionWriter:
        if project_root not in self._writers:
            self._writers[project_root] = CognitionWriter(project_root)
        return self._writers[project_root]

    # ------------------------------------------------------------------
    # Main entry: analyze a project
    # ------------------------------------------------------------------

    async def analyze_project(self, project_path: str, project_id: str, force: bool = False) -> dict:
        """Scan a project directory and return graph data {nodes, edges}.

        Also generates/updates .cognition/ YAML files on disk.
        """
        project_dir = Path(project_path)
        if not project_dir.exists():
            raise FileNotFoundError(f"Project path not found: {project_path}")

        reader = self._get_reader(project_path)
        writer = self._get_writer(project_path)

        # Step 1: If .cognition/ already exists and no force, read existing data
        if reader.project_exists() and not force:
            config = reader.load_project_config()
            nodes_data = reader.load_all_cognition_nodes()
            symbol_index = reader.load_symbol_index()
            if config and nodes_data:
                graph_data = self._cognition_nodes_to_graph(nodes_data, project_id)
                return graph_data

        # Step 2: Discover module boundaries
        modules = self._discover_modules(project_dir)

        # Step 3: Analyze each module → cognition node
        cognition_nodes: List[CognitionNodeSchema] = []
        for mod in modules:
            node = await self._analyze_module(mod, project_dir, project_id)
            cognition_nodes.append(node)

        # Step 4: Cross-module dependency analysis
        self._resolve_cross_dependencies(cognition_nodes, modules)

        # Step 5: Build symbol index
        symbol_index = self._build_symbol_index(cognition_nodes)

        # Step 6: Write .cognition/ directory
        config = ProjectConfigSchema(
            project_id=project_id,
            name=project_dir.name,
            description="",
            language=self._detect_primary_language(project_dir),
            modules=[
                ModuleBoundarySchema(path=m["relative_path"], name=m["name"], type=m["type"])
                for m in modules
            ],
        )
        writer.write_project_config(config)

        for node in cognition_nodes:
            writer.write_cognition_node(node)

        writer.write_symbol_index(symbol_index)

        # Step 7: Convert to graph data
        graph_data = self._cognition_nodes_to_graph(cognition_nodes, project_id)
        return graph_data

    # ------------------------------------------------------------------
    # Module discovery
    # ------------------------------------------------------------------

    def _discover_modules(self, project_dir: Path) -> List[Dict]:
        """Discover module boundaries in the project."""
        modules = []
        src_dirs = ["src", "lib", "app", "pkg", "internal", "services", "packages"]

        for src_name in src_dirs:
            src_path = project_dir / src_name
            if src_path.exists() and src_path.is_dir():
                for child in sorted(src_path.iterdir()):
                    if child.is_dir() and not child.name.startswith((".", "__", "node_modules")):
                        source_files = [f for f in child.rglob("*") if f.suffix in self._EXT_LANG]
                        if source_files:
                            modules.append({
                                "name": child.name,
                                "path": str(child),
                                "relative_path": f"{src_name}/{child.name}",
                                "type": self._classify_module(child.name),
                                "files": source_files,
                            })

        # Fallback: treat whole project as one module
        if not modules:
            all_source = [f for f in project_dir.rglob("*") if f.suffix in self._EXT_LANG
                          and "node_modules" not in str(f) and ".git" not in str(f)]
            if all_source:
                modules.append({
                    "name": project_dir.name,
                    "path": str(project_dir),
                    "relative_path": ".",
                    "type": "domain",
                    "files": all_source,
                })

        # Ultimate fallback: no recognized source files at all — still create a module
        # so the project shows up in the graph (e.g., data-only projects, configs, docs)
        if not modules:
            all_files = [f for f in project_dir.rglob("*") if f.is_file()
                         and "node_modules" not in str(f) and ".git" not in str(f)
                         and ".cognition" not in str(f)]
            if all_files:
                modules.append({
                    "name": project_dir.name,
                    "path": str(project_dir),
                    "relative_path": ".",
                    "type": "domain",
                    "files": all_files[:50],  # Cap at 50 to avoid huge analysis
                })

        return modules

    def _classify_module(self, name: str) -> str:
        if name in self._INFRA_PATTERNS:
            return "infrastructure"
        if name in self._SHARED_PATTERNS:
            return "shared"
        return "domain"

    def _detect_primary_language(self, project_dir: Path) -> str:
        ext_counts: Dict[str, int] = {}
        for f in project_dir.rglob("*"):
            if f.is_file() and f.suffix in self._EXT_LANG:
                lang = self._EXT_LANG[f.suffix]
                ext_counts[lang] = ext_counts.get(lang, 0) + 1
        if not ext_counts:
            return "unknown"
        return max(ext_counts, key=ext_counts.get)

    # ------------------------------------------------------------------
    # Per-module analysis
    # ------------------------------------------------------------------

    async def _analyze_module(self, module: Dict, project_dir: Path, project_id: str) -> CognitionNodeSchema:
        """Analyze a single module and produce a CognitionNodeSchema."""
        name = module["name"]
        rel_path = module["relative_path"]
        files = module["files"]
        module_type = module["type"]

        # Count total lines
        total_lines = 0
        for f in files:
            try:
                total_lines += sum(1 for _ in open(f, "r", encoding="utf-8", errors="ignore"))
            except Exception:
                pass

        # Extract interfaces (functions, classes, exports) via regex
        interfaces: List[InterfaceSchema] = []
        key_types: List[KeyTypeSchema] = []
        symbols_for_index: List[SymbolEntrySchema] = []

        for f in files:
            try:
                content = f.read_text(encoding="utf-8", errors="ignore")
            except Exception:
                continue

            lang = self._EXT_LANG.get(f.suffix, "unknown")
            file_interfaces = self._extract_interfaces(content, lang, f, rel_path)
            interfaces.extend(file_interfaces)

            file_types = self._extract_types(content, lang, f, rel_path)
            key_types.extend(file_types)

        # Build responsibility from module context
        responsibility = ResponsibilitySchema(
            summary=self._generate_responsibility_summary(name, module_type, interfaces),
            detail=f"模块 {name} 位于 {rel_path}，包含 {len(files)} 个源文件，{len(interfaces)} 个接口。",
        )

        # Risks heuristic
        risks = self._detect_risks(name, module_type, total_lines, interfaces)

        node_id = f"{name.replace('_', '-')}"
        return CognitionNodeSchema(
            node_id=node_id,
            file_path=rel_path,
            language=self._detect_primary_language(project_dir),
            lines=total_lines,
            responsibility=responsibility,
            interfaces=interfaces[:20],  # Cap at 20 for readability
            key_types=key_types[:15],
            risks=risks,
        )

    # ------------------------------------------------------------------
    # Interface / type extraction via regex (language-aware)
    # ------------------------------------------------------------------

    def _extract_interfaces(self, content: str, lang: str, filepath: Path, rel_path: str) -> List[InterfaceSchema]:
        """Extract exported functions, methods, and class constructors."""
        interfaces = []
        name_stem = filepath.stem

        if lang in ("typescript", "javascript", "vue", "svelte"):
            # Export functions: export function foo(...) / export async function foo(...)
            for m in re.finditer(r'export\s+(?:async\s+)?function\s+(\w+)\s*\(([^)]*)\)', content):
                fname, params = m.group(1), m.group(2)
                interfaces.append(InterfaceSchema(
                    name=fname,
                    signature=f"function {fname}({params})",
                    access=AccessLevel.public,
                    complexity=self._estimate_complexity(params),
                ))
            # Export classes: export class Foo { ... }
            for m in re.finditer(r'export\s+class\s+(\w+)', content):
                cname = m.group(1)
                interfaces.append(InterfaceSchema(
                    name=cname,
                    signature=f"class {cname}",
                    access=AccessLevel.public,
                    complexity="medium",
                ))
            # Arrow functions: export const foo = (...) => ...
            for m in re.finditer(r'export\s+const\s+(\w+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>', content):
                fname, params = m.group(1), m.group(2)
                interfaces.append(InterfaceSchema(
                    name=fname,
                    signature=f"const {fname} = ({params}) => ...",
                    access=AccessLevel.public,
                    complexity=self._estimate_complexity(params),
                ))

        elif lang == "python":
            # def foo(self, ...):
            for m in re.finditer(r'(?:async\s+)?def\s+(\w+)\s*\(([^)]*)\)', content):
                fname, params = m.group(1), m.group(2)
                if fname.startswith("_"):
                    continue  # Skip private
                access = AccessLevel.private if fname.startswith("__") else AccessLevel.public
                interfaces.append(InterfaceSchema(
                    name=fname,
                    signature=f"def {fname}({params})",
                    access=access,
                    complexity=self._estimate_complexity(params),
                ))
            # class Foo:
            for m in re.finditer(r'class\s+(\w+)', content):
                cname = m.group(1)
                if cname.startswith("_"):
                    continue
                interfaces.append(InterfaceSchema(
                    name=cname,
                    signature=f"class {cname}",
                    access=AccessLevel.public,
                    complexity="medium",
                ))

        elif lang == "go":
            # func (r *Receiver) Name(...) ...
            for m in re.finditer(r'func\s+(?:\([^)]+\)\s+)?(\w+)\s*\(([^)]*)\)', content):
                fname, params = m.group(1), m.group(2)
                if fname[0].isupper():
                    interfaces.append(InterfaceSchema(
                        name=fname,
                        signature=f"func {fname}({params})",
                        access=AccessLevel.public,
                        complexity=self._estimate_complexity(params),
                    ))

        return interfaces

    def _extract_types(self, content: str, lang: str, filepath: Path, rel_path: str) -> List[KeyTypeSchema]:
        """Extract key type definitions (interfaces, type aliases, enums)."""
        types = []

        if lang in ("typescript", "javascript"):
            for m in re.finditer(r'export\s+(?:interface|type)\s+(\w+)', content):
                types.append(KeyTypeSchema(name=m.group(1), definition_in=rel_path, fields=[]))
            for m in re.finditer(r'export\s+enum\s+(\w+)', content):
                types.append(KeyTypeSchema(name=m.group(1), definition_in=rel_path, fields=[]))

        elif lang == "python":
            for m in re.finditer(r'class\s+(\w+)\s*\([^)]*Model[^)]*\)', content):
                types.append(KeyTypeSchema(name=m.group(1), definition_in=rel_path, fields=[]))
            for m in re.finditer(r'class\s+(\w+)\s*\([^)]*Base[^)]*\)', content):
                types.append(KeyTypeSchema(name=m.group(1), definition_in=rel_path, fields=[]))

        return types

    # ------------------------------------------------------------------
    # Cross-module dependency resolution
    # ------------------------------------------------------------------

    def _resolve_cross_dependencies(self, nodes: List[CognitionNodeSchema], modules: List[Dict]):
        """Resolve dependencies between modules based on import/require statements."""
        node_map = {n.node_id: n for n in nodes}
        mod_map = {m["name"]: m for m in modules}

        for node in nodes:
            # Read source files for import statements
            module_info = mod_map.get(node.node_id.replace("-", "_"))
            if not module_info:
                # Try exact match
                module_info = mod_map.get(node.node_id)
            if not module_info:
                continue

            for f in module_info.get("files", []):
                try:
                    content = f.read_text(encoding="utf-8", errors="ignore")
                except Exception:
                    continue

                # Find imports referencing other modules
                imported_modules = self._extract_import_targets(content, node.language)
                for target_name in imported_modules:
                    target_id = target_name.replace("_", "-")
                    if target_id in node_map and target_id != node.node_id:
                        # Check if dependency already exists
                        existing = [d for d in node.dependencies if d.node_id == target_id]
                        if not existing:
                            node.dependencies.append(DependencySchema(
                                node_id=target_id,
                                interface_file=f"src/{target_name}",
                                used_for="跨模块引用",
                                required=True,
                            ))

    def _extract_import_targets(self, content: str, lang: str) -> List[str]:
        """Extract module names from import statements."""
        targets = []
        if lang in ("typescript", "javascript"):
            for m in re.finditer(r'(?:import|require)\s+.*?[\'"]([^\'"]+)[\'"]', content):
                path = m.group(1)
                # Extract the module name from relative imports like '../order/...'
                parts = path.strip("./").split("/")
                if len(parts) >= 2:
                    targets.append(parts[-2] if parts[-1] == "index" else parts[-1])
                elif parts and parts[0]:
                    targets.append(parts[0])
        elif lang == "python":
            for m in re.finditer(r'(?:from|import)\s+(\w+)', content):
                targets.append(m.group(1))
        return list(set(targets))

    # ------------------------------------------------------------------
    # Symbol index
    # ------------------------------------------------------------------

    def _build_symbol_index(self, nodes: List[CognitionNodeSchema]) -> SymbolIndexSchema:
        """Build a symbol index from all cognition nodes."""
        symbols = []
        for node in nodes:
            for iface in node.interfaces:
                symbols.append(SymbolEntrySchema(
                    name=iface.name,
                    type="function" if "function" in iface.signature or "def " in iface.signature else "class",
                    node_id=node.node_id,
                    file=node.file_path,
                    line=0,  # Line number not available from regex analysis
                ))
            for kt in node.key_types:
                symbols.append(SymbolEntrySchema(
                    name=kt.name,
                    type="type",
                    node_id=node.node_id,
                    file=node.file_path,
                    line=0,
                ))
        return SymbolIndexSchema(symbols=symbols)

    # ------------------------------------------------------------------
    # Heuristics
    # ------------------------------------------------------------------

    def _generate_responsibility_summary(self, name: str, module_type: str, interfaces: List[InterfaceSchema]) -> str:
        """Generate a one-line responsibility summary."""
        type_desc = {
            "domain": "领域服务",
            "infrastructure": "基础设施",
            "shared": "共享模块",
            "external": "外部集成",
        }
        iface_names = [i.name for i in interfaces[:3]]
        iface_str = "、".join(iface_names) if iface_names else "核心功能"
        return f"{name} {type_desc.get(module_type, '模块')}——{iface_str}"

    def _estimate_complexity(self, params_str: str) -> str:
        """Estimate interface complexity from parameter count."""
        if not params_str.strip():
            return "low"
        param_count = len([p for p in params_str.split(",") if p.strip()])
        if param_count <= 1:
            return "low"
        elif param_count <= 3:
            return "medium"
        return "high"

    def _detect_risks(self, name: str, module_type: str, lines: int, interfaces: List[InterfaceSchema]) -> List[RiskSchema]:
        """Heuristic risk detection."""
        risks = []
        risk_id = 0

        # Large module risk
        if lines > 500:
            risk_id += 1
            risks.append(RiskSchema(
                id=f"RISK-{risk_id:03d}",
                level="medium",
                title="模块过大",
                description=f"{name} 模块有 {lines} 行代码，建议拆分",
                mitigation="提取子模块，保持单一职责",
                status="open",
            ))

        # High-complexity interfaces
        high_complexity = [i for i in interfaces if i.complexity == "high"]
        if len(high_complexity) >= 3:
            risk_id += 1
            risks.append(RiskSchema(
                id=f"RISK-{risk_id:03d}",
                level="high",
                title="高复杂度接口集中",
                description=f"{name} 有 {len(high_complexity)} 个高复杂度接口",
                mitigation="重构接口，降低参数数量，提取辅助函数",
                status="open",
            ))

        # Infrastructure with many interfaces
        if module_type == "infrastructure" and len(interfaces) > 10:
            risk_id += 1
            risks.append(RiskSchema(
                id=f"RISK-{risk_id:03d}",
                level="low",
                title="基础设施模块接口过多",
                description=f"{name} 作为基础设施模块暴露了 {len(interfaces)} 个接口",
                mitigation="审查接口是否全部需要公开暴露",
                status="open",
            ))

        return risks

    # ------------------------------------------------------------------
    # Convert cognition nodes → graph data
    # ------------------------------------------------------------------

    def _cognition_nodes_to_graph(self, nodes: List[CognitionNodeSchema], project_id: str) -> dict:
        """Convert CognitionNodeSchema list to graph data format for the graph engine."""
        graph_nodes = []
        graph_edges = []

        for node in nodes:
            # Determine module type enum value
            try:
                mod_type = ModuleType(node.file_path.split("/")[1] if "/" in node.file_path else "domain")
            except ValueError:
                mod_type = ModuleType.domain

            # Infer type from file path heuristics if not explicit
            for part in node.file_path.split("/"):
                if part in self._INFRA_PATTERNS:
                    mod_type = ModuleType.infrastructure
                    break
                if part in self._SHARED_PATTERNS:
                    mod_type = ModuleType.shared
                    break

            graph_nodes.append({
                "id": node.node_id,
                "label": node.node_id,
                "type": mod_type.value,
                "responsibility": node.responsibility.summary,
                "language": node.language,
                "lines": node.lines,
                "verified": node.human_verified,
                "status": "active" if node.human_verified else "pending_review",
                "health_score": self._compute_health_score(node),
                "risk_count": len(node.risks),
                "test_coverage": node.testing.coverage_percent if node.testing else 0.0,
                "complexity": max(
                    (i.complexity for i in node.interfaces if i.complexity),
                    default="medium",
                ),
            })

            for dep in node.dependencies:
                graph_edges.append({
                    "id": f"{node.node_id}->{dep.node_id}",
                    "source": node.node_id,
                    "target": dep.node_id,
                    "type": "depends_on",
                    "label": dep.used_for,
                    "weight": 2 if dep.required else 1,
                    "required": dep.required,
                })

        return {"nodes": graph_nodes, "edges": graph_edges}

    def _compute_health_score(self, node: CognitionNodeSchema) -> float:
        """Compute a health score [0-100] for a cognition node."""
        score = 100.0
        # Deduct for risks
        for risk in node.risks:
            if risk.level == "high":
                score -= 15
            elif risk.level == "medium":
                score -= 8
            else:
                score -= 3
        # Deduct for no verification
        if not node.human_verified:
            score -= 10
        # Deduct for low test coverage
        if node.testing and node.testing.coverage_percent < 50:
            score -= 15
        elif node.testing and node.testing.coverage_percent < 80:
            score -= 5
        # Deduct for large size
        if node.lines > 500:
            score -= 10
        return max(0.0, min(100.0, score))


# Singleton instance
analyzer = Analyzer()