"""Pydantic schemas for API request/response validation and cognition layer data models."""

from __future__ import annotations

from datetime import datetime
from typing import Optional, List as TypingList
from enum import Enum

from pydantic import BaseModel, Field


# ============================================================
# Enums
# ============================================================

class ModuleType(str, Enum):
    domain = "domain"
    infrastructure = "infrastructure"
    shared = "shared"
    external = "external"


class RiskLevel(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class NodeStatus(str, Enum):
    active = "active"
    pending_review = "pending_review"
    analyzing = "analyzing"
    error = "error"


class AccessLevel(str, Enum):
    public = "public"
    private = "private"
    protected = "protected"


class ChangeType(str, Enum):
    modified = "modified"
    added = "added"
    removed = "removed"


class EdgeType(str, Enum):
    depends_on = "depends_on"
    calls = "calls"
    inherits = "inherits"
    data_flow = "data_flow"
    event_subscription = "event_subscription"


class ReviewStatus(str, Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"


class AIRequestStatus(str, Enum):
    pending = "pending"
    cognition_draft_ready = "cognition_draft_ready"
    code_ready = "code_ready"
    committed = "committed"
    error = "error"


class Complexity(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


# ============================================================
# Cognition Layer — Nested Models
# ============================================================

class ResponsibilitySchema(BaseModel):
    summary: str = Field(..., description="One-line responsibility summary")
    detail: str = Field(default="", description="Detailed responsibility description")


class CallerSchema(BaseModel):
    node_id: str
    file: str


class InterfaceSchema(BaseModel):
    name: str
    signature: str
    access: AccessLevel = AccessLevel.public
    side_effects: TypingList[str] = Field(default_factory=list)
    callers: TypingList[CallerSchema] = Field(default_factory=list)
    preconditions: TypingList[str] = Field(default_factory=list)
    complexity: Optional[str] = None


class KeyTypeSchema(BaseModel):
    name: str
    definition_in: str
    fields: TypingList[str] = Field(default_factory=list)


class DependencySchema(BaseModel):
    node_id: str
    interface_file: str
    used_for: str
    required: bool = True


class DataFlowStepSchema(BaseModel):
    action: str
    input: Optional[object] = None  # str or list
    output: Optional[str] = None
    calls: Optional[str] = None
    writes_to: Optional[str] = None
    publishes: Optional[str] = None


class DataFlowSchema(BaseModel):
    description: str
    steps: TypingList[DataFlowStepSchema] = Field(default_factory=list)


class DecisionSchema(BaseModel):
    id: str = Field(..., pattern=r"^DEC-[A-Z0-9-]+$")
    title: str
    context: str
    decision: str
    consequences: str
    linked_issue: Optional[str] = None


class RiskSchema(BaseModel):
    id: str = Field(..., pattern=r"^RISK-[A-Z0-9-]+$")
    level: RiskLevel
    title: str
    description: str
    mitigation: Optional[str] = None
    status: str = "open"  # open, mitigated, closed


class TestingSchema(BaseModel):
    coverage_percent: float = Field(default=0.0, ge=0, le=100)
    test_files: TypingList[str] = Field(default_factory=list)
    uncovered_cases: TypingList[str] = Field(default_factory=list)


class PerformanceSchema(BaseModel):
    average_latency_ms: float = 0.0
    p99_latency_ms: Optional[float] = None
    bottleneck: Optional[str] = None


# ============================================================
# Cognition Node — Full Schema
# ============================================================

class CognitionNodeSchema(BaseModel):
    """Complete cognition data for a single module/file."""
    node_id: str
    file_path: str
    language: str = "typescript"
    lines: int = 0
    last_analyzed_at: datetime = Field(default_factory=datetime.utcnow)
    analyzed_by: str = "analyzer-v1"
    human_verified: bool = False
    verified_by: Optional[str] = None
    verified_at: Optional[datetime] = None
    responsibility: ResponsibilitySchema
    interfaces: TypingList[InterfaceSchema] = Field(default_factory=list)
    key_types: TypingList[KeyTypeSchema] = Field(default_factory=list)
    dependencies: TypingList[DependencySchema] = Field(default_factory=list)
    data_flow: Optional[DataFlowSchema] = None
    decisions: TypingList[DecisionSchema] = Field(default_factory=list)
    risks: TypingList[RiskSchema] = Field(default_factory=list)
    testing: Optional[TestingSchema] = None
    performance: Optional[PerformanceSchema] = None


# ============================================================
# Project Config Schema
# ============================================================

class ModuleBoundarySchema(BaseModel):
    path: str
    name: str
    type: ModuleType = ModuleType.domain


class GenerationConfigSchema(BaseModel):
    auto_analyze: bool = True
    ai_model: str = "gpt-4o"
    human_review_required: TypingList[str] = Field(
        default_factory=lambda: ["interface_change", "new_dependency", "risk_level:high"]
    )


class ProjectConfigSchema(BaseModel):
    """Schema for .cognition/project.yaml"""
    cognition_version: str = "1.0"
    project_id: str
    name: str
    description: str = ""
    language: str = "typescript"
    framework: str = ""
    generation: GenerationConfigSchema = Field(default_factory=GenerationConfigSchema)
    modules: TypingList[ModuleBoundarySchema] = Field(default_factory=list)


# ============================================================
# Symbol Index Schema
# ============================================================

class SymbolEntrySchema(BaseModel):
    name: str
    type: str  # function, interface, class, type, variable
    node_id: str
    file: str
    line: int


class SymbolIndexSchema(BaseModel):
    """Schema for .cognition/symbol_index.yaml"""
    symbols: TypingList[SymbolEntrySchema] = Field(default_factory=list)


# ============================================================
# Snapshot Schema
# ============================================================

class SnapshotChangeSchema(BaseModel):
    node_id: str
    change_type: ChangeType
    interfaces_added: TypingList[str] = Field(default_factory=list)
    interfaces_removed: TypingList[str] = Field(default_factory=list)
    dependencies_added: TypingList[str] = Field(default_factory=list)
    risks_added: TypingList[str] = Field(default_factory=list)


class SnapshotGraphSummarySchema(BaseModel):
    total_nodes: int = 0
    total_edges: int = 0
    new_nodes: int = 0
    modified_nodes: int = 0
    removed_nodes: int = 0


class CognitionSnapshotSchema(BaseModel):
    """Schema for .cognition/snapshots/<commit_hash>.yaml"""
    snapshot_id: str
    commit_hash: str
    commit_message: str = ""
    generated_at: datetime = Field(default_factory=datetime.utcnow)
    graph_summary: SnapshotGraphSummarySchema = Field(default_factory=SnapshotGraphSummarySchema)
    changes: TypingList[SnapshotChangeSchema] = Field(default_factory=list)
    human_review_status: ReviewStatus = ReviewStatus.pending
    reviewed_by: Optional[str] = None


# ============================================================
# Graph Data Schemas
# ============================================================

class GraphNodeSchema(BaseModel):
    id: str
    label: str
    type: ModuleType = ModuleType.domain
    responsibility: str = ""
    language: Optional[str] = None
    lines: Optional[int] = None
    complexity: Optional[str] = None
    verified: Optional[bool] = None
    status: Optional[NodeStatus] = NodeStatus.active
    health_score: Optional[float] = None
    risk_count: Optional[int] = None
    test_coverage: Optional[float] = None
    x: Optional[float] = None
    y: Optional[float] = None


class GraphEdgeSchema(BaseModel):
    id: str
    source: str
    target: str
    type: EdgeType = EdgeType.depends_on
    label: Optional[str] = None
    weight: Optional[int] = 1
    required: Optional[bool] = True


class GraphDataSchema(BaseModel):
    nodes: TypingList[GraphNodeSchema] = Field(default_factory=list)
    edges: TypingList[GraphEdgeSchema] = Field(default_factory=list)


# ============================================================
# Impact Radius Schema
# ============================================================

class ImpactNodeSchema(BaseModel):
    node_id: str
    node_label: str
    reason: str
    distance: int


class ImpactRadiusSchema(BaseModel):
    center_node_id: str
    direct: TypingList[ImpactNodeSchema] = Field(default_factory=list)
    indirect: TypingList[ImpactNodeSchema] = Field(default_factory=list)
    cognition_updates: TypingList[str] = Field(default_factory=list)


# ============================================================
# AI Collaboration Schemas
# ============================================================

class CognitionDraftSchema(BaseModel):
    responsibility_change: Optional[str] = None
    interfaces_added: TypingList[InterfaceSchema] = Field(default_factory=list)
    interfaces_modified: TypingList[dict] = Field(default_factory=list)
    interfaces_removed: TypingList[str] = Field(default_factory=list)
    dependencies_added: TypingList[DependencySchema] = Field(default_factory=list)
    dependencies_removed: TypingList[str] = Field(default_factory=list)
    risks_added: TypingList[RiskSchema] = Field(default_factory=list)
    decisions_added: TypingList[DecisionSchema] = Field(default_factory=list)


class CodeChangeSchema(BaseModel):
    file_path: str
    operation: str  # modify, create, delete
    diff: str
    explanation: str


class ImpactAnalysisSchema(BaseModel):
    affected_modules: TypingList[str] = Field(default_factory=list)
    affected_tests: TypingList[str] = Field(default_factory=list)
    new_risks: TypingList[str] = Field(default_factory=list)
    estimated_complexity: Complexity = Complexity.medium


class AIResponseSchema(BaseModel):
    request_id: str
    cognition_draft: Optional[CognitionDraftSchema] = None
    code_changes: TypingList[CodeChangeSchema] = Field(default_factory=list)
    impact_analysis: Optional[ImpactAnalysisSchema] = None
    questions_for_human: TypingList[str] = Field(default_factory=list)


# ============================================================
# API Request/Response Schemas
# ============================================================

class LoadProjectRequest(BaseModel):
    project_path: str
    force_reanalyze: bool = False


class LoadProjectResponse(BaseModel):
    project_id: str
    graph_data: GraphDataSchema
    cognition_status: str = "ready"
    unverified_changes: int = 0


class GetCognitionNodeResponse(BaseModel):
    node_id: str
    cognition: CognitionNodeSchema
    code_snippets: dict = Field(default_factory=lambda: {"interface": "", "implementation": ""})


class AIDevelopRequest(BaseModel):
    target_node: str
    instruction: str
    context_depth: int = 2
    preferred_model: Optional[str] = None


class AIDevelopResponse(BaseModel):
    request_id: str
    status: AIRequestStatus
    cognition_draft: Optional[CognitionDraftSchema] = None
    impact_radius: Optional[ImpactRadiusSchema] = None
    code_changes: Optional[TypingList[CodeChangeSchema]] = None
    questions_for_human: TypingList[str] = Field(default_factory=list)


class ExecuteChangesRequest(BaseModel):
    cognition_approved: bool
    cognition_modifications: Optional[dict] = None
    code_approved: bool
    commit_message: str = "feat: AI-generated changes"


class ExecuteChangesResponse(BaseModel):
    status: str  # committed, error
    commit_hash: Optional[str] = None
    files_changed: TypingList[str] = Field(default_factory=list)


class VerifyNodeRequest(BaseModel):
    verified_by: str = "developer"


class ChatRequest(BaseModel):
    message: str
    node_id: Optional[str] = None
    project_id: Optional[str] = None
    preferred_model: Optional[str] = None


class ChatResponse(BaseModel):
    response: str