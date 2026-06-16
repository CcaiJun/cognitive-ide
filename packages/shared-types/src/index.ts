// ============================================================
// Cognitive IDE — Shared Type Definitions
// ============================================================

// ----- Cognition Layer Types -----

export interface ProjectConfig {
  cognition_version: string;
  project_id: string;
  name: string;
  description: string;
  language: string;
  framework: string;
  generation: {
    auto_analyze: boolean;
    ai_model: string;
    human_review_required: string[];
  };
  modules: ModuleBoundary[];
}

export interface ModuleBoundary {
  path: string;
  name: string;
  type: 'domain' | 'infrastructure' | 'shared' | 'external';
}

export type RiskLevel = 'low' | 'medium' | 'high';
export type NodeStatus = 'active' | 'pending_review' | 'analyzing' | 'error';
export type ModuleType = 'domain' | 'infrastructure' | 'shared' | 'external';
export type ChangeType = 'modified' | 'added' | 'removed';
export type AccessLevel = 'public' | 'private' | 'protected';

// ----- Cognition Node -----

export interface CognitionNode {
  node_id: string;
  file_path: string;
  language: string;
  lines: number;
  last_analyzed_at: string;
  analyzed_by: string;
  human_verified: boolean;
  verified_by: string | null;
  verified_at: string | null;
  responsibility: Responsibility;
  interfaces: InterfaceDef[];
  key_types: KeyType[];
  dependencies: Dependency[];
  data_flow?: DataFlow;
  decisions: Decision[];
  risks: Risk[];
  testing?: TestingInfo;
  performance?: PerformanceInfo;
}

export interface Responsibility {
  summary: string;
  detail: string;
}

export interface InterfaceDef {
  name: string;
  signature: string;
  access: AccessLevel;
  side_effects: string[];
  callers: Caller[];
  preconditions?: string[];
  complexity?: string;
}

export interface Caller {
  node_id: string;
  file: string;
}

export interface KeyType {
  name: string;
  definition_in: string;
  fields?: string[];
}

export interface Dependency {
  node_id: string;
  interface_file: string;
  used_for: string;
  required: boolean;
}

export interface DataFlow {
  description: string;
  steps: DataFlowStep[];
}

export interface DataFlowStep {
  action: string;
  input?: string | string[];
  output?: string;
  calls?: string;
  writes_to?: string;
  publishes?: string;
}

export interface Decision {
  id: string;
  title: string;
  context: string;
  decision: string;
  consequences: string;
  linked_issue?: string;
}

export interface Risk {
  id: string;
  level: RiskLevel;
  title: string;
  description: string;
  mitigation?: string;
  status: 'open' | 'mitigated' | 'closed';
}

export interface TestingInfo {
  coverage_percent: number;
  test_files: string[];
  uncovered_cases: string[];
}

export interface PerformanceInfo {
  average_latency_ms: number;
  p99_latency_ms?: number;
  bottleneck?: string;
}

// ----- Graph Types -----

export interface GraphNode {
  id: string;
  label: string;
  type: ModuleType;
  responsibility: string;
  language?: string;
  lines?: number;
  complexity?: string;
  verified?: boolean;
  status?: NodeStatus;
  health_score?: number;
  risk_count?: number;
  test_coverage?: number;
  // Layout position
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;
}

export type EdgeType = 'depends_on' | 'calls' | 'inherits' | 'data_flow' | 'event_subscription';

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: EdgeType;
  label?: string;
  weight?: number;
  required?: boolean;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ----- Impact Radius -----

export interface ImpactRadius {
  center_node_id: string;
  direct: ImpactNode[];
  indirect: ImpactNode[];
  cognition_updates: string[];
}

export interface ImpactNode {
  node_id: string;
  node_label: string;
  reason: string;
  distance: number;
}

// ----- AI Collaboration Types -----

export interface AIRequest {
  target_node: string;
  instruction: string;
  context_depth: number;
  preferred_model?: string;
}

export interface CognitionDraft {
  responsibility_change?: string;
  interfaces_added: InterfaceDef[];
  interfaces_modified: InterfaceChange[];
  interfaces_removed: string[];
  dependencies_added: Dependency[];
  dependencies_removed: string[];
  risks_added: Risk[];
  decisions_added: Decision[];
}

export interface InterfaceChange {
  name: string;
  changes: string;
  old_signature?: string;
  new_signature?: string;
}

export interface CodeChange {
  file_path: string;
  operation: 'modify' | 'create' | 'delete';
  diff: string;
  explanation: string;
}

export interface AIResponse {
  request_id: string;
  cognition_draft: CognitionDraft;
  code_changes: CodeChange[];
  impact_analysis: ImpactAnalysis;
  questions_for_human: string[];
}

export interface ImpactAnalysis {
  affected_modules: string[];
  affected_tests: string[];
  new_risks: string[];
  estimated_complexity: 'low' | 'medium' | 'high';
}

export interface ContextPackage {
  architecture: {
    project_description: string;
    module_boundaries: ModuleBoundary[];
    tech_stack: string[];
  };
  target: {
    node_id: string;
    cognition: CognitionNode;
    implementation: string;
  };
  dependencies: {
    node_id: string;
    interface_file: string;
  }[];
  tests?: {
    file_path: string;
    content: string;
  }[];
  instruction: string;
  history?: ChatMessage[];
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

// ----- Symbol Index -----

export interface SymbolEntry {
  name: string;
  type: 'function' | 'interface' | 'class' | 'type' | 'variable';
  node_id: string;
  file: string;
  line: number;
}

export interface SymbolIndex {
  symbols: SymbolEntry[];
}

// ----- Snapshot -----

export interface CognitionSnapshot {
  snapshot_id: string;
  commit_hash: string;
  commit_message: string;
  generated_at: string;
  graph_summary: {
    total_nodes: number;
    total_edges: number;
    new_nodes: number;
    modified_nodes: number;
    removed_nodes: number;
  };
  changes: SnapshotChange[];
  human_review_status: 'pending' | 'approved' | 'rejected';
  reviewed_by: string | null;
}

export interface SnapshotChange {
  node_id: string;
  change_type: ChangeType;
  interfaces_added: string[];
  interfaces_removed: string[];
  dependencies_added: string[];
  risks_added: string[];
}

// ----- WebSocket Events -----

export type WSClientEvent =
  | { type: 'file_change'; path: string; content: string; timestamp: string }
  | { type: 'ai_request'; request_id: string; instruction: string }
  | { type: 'ai_confirm'; request_id: string; cognition_approved: boolean; code_approved: boolean }
  | { type: 'subscribe_node'; node_id: string }
  | { type: 'unsubscribe_node'; node_id: string };

export type WSServerEvent =
  | { type: 'graph_update'; updates: { nodes_modified: { id: string; status: NodeStatus }[]; edges_added: GraphEdge[]; edges_removed: string[] } }
  | { type: 'ai_stream'; request_id: string; chunk: string; done: boolean }
  | { type: 'cognition_diff'; node_id: string; diff: { before: Partial<CognitionNode>; after: Partial<CognitionNode> }; requires_human_review: boolean }
  | { type: 'impact_preview'; node_id: string; impact: ImpactRadius }
  | { type: 'analysis_progress'; node_id: string; progress: number; status: string }
  | { type: 'node_updated'; node: GraphNode };

// ----- API Types -----

export interface LoadProjectResponse {
  project_id: string;
  graph_data: GraphData;
  cognition_status: 'ready' | 'analyzing' | 'error';
  unverified_changes: number;
}

export interface GetCognitionNodeResponse {
  node_id: string;
  cognition: CognitionNode;
  code_snippets: {
    interface: string;
    implementation: string;
  };
}

export interface AIDevelopRequest {
  target_node: string;
  instruction: string;
  context_depth?: number;
  preferred_model?: string;
}

export interface AIDevelopResponse {
  request_id: string;
  status: 'cognition_draft_ready' | 'code_ready' | 'error';
  cognition_draft?: CognitionDraft;
  impact_radius?: ImpactRadius;
  code_changes?: CodeChange[];
  questions_for_human?: string[];
}

export interface ExecuteChangesRequest {
  request_id: string;
  cognition_approved: boolean;
  cognition_modifications?: Record<string, unknown>;
  code_approved: boolean;
  commit_message: string;
}

export interface ExecuteChangesResponse {
  status: 'committed' | 'error';
  commit_hash?: string;
  files_changed: string[];
}