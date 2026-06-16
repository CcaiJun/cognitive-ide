import axios from 'axios';
import type {
  LoadProjectResponse,
  GetCognitionNodeResponse,
  AIDevelopResponse,
  ExecuteChangesResponse,
  GraphData,
} from '@cognition-ide/shared-types';

const http = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// Response interceptor — unwrap data, surface errors
http.interceptors.response.use(
  (response) => response.data,
  (error) => {
    const msg = error.response?.data?.detail || error.message || 'Unknown error';
    return Promise.reject(new Error(msg));
  },
);

export const api = {
  // ---- Projects ----
  loadProject: (projectPath: string, forceReanalyze = false): Promise<LoadProjectResponse> =>
    http.post('/projects/load', {
      project_path: projectPath,
      force_reanalyze: forceReanalyze,
    }),

  getProject: (projectId: string) =>
    http.get(`/projects/${projectId}`),

  listProjects: () =>
    http.get('/projects/'),

  getProjectGraph: (projectId: string): Promise<GraphData> =>
    http.get(`/projects/${projectId}/graph`),

  // ---- Cognition ----
  getCognitionNode: (nodeId: string, projectId: string): Promise<GetCognitionNodeResponse> =>
    http.get(`/cognition/nodes/${nodeId}`, { params: { project_id: projectId } }),

  getImpactRadius: (nodeId: string, depth = 2) =>
    http.get(`/cognition/nodes/${nodeId}/impact`, { params: { depth } }),

  verifyNode: (nodeId: string, projectId: string, verifiedBy = 'developer') =>
    http.put(`/cognition/nodes/${nodeId}/verify`, {
      verified_by: verifiedBy,
    }, { params: { project_id: projectId } }),

  getSymbolIndex: (projectId: string) =>
    http.get('/cognition/symbols', { params: { project_id: projectId } }),

  // ---- AI ----
  aiDevelop: (targetNode: string, instruction: string, contextDepth = 2, preferredModel = ''): Promise<AIDevelopResponse> =>
    http.post('/ai/develop', {
      target_node: targetNode,
      instruction,
      context_depth: contextDepth,
      preferred_model: preferredModel || null,
    }),

  executeChanges: (requestId: string, cognitionApproved: boolean, codeApproved: boolean, commitMessage = 'feat: AI-generated changes', cognitionModifications?: Record<string, unknown>): Promise<ExecuteChangesResponse> =>
    http.post(`/ai/develop/${requestId}/execute`, {
      cognition_approved: cognitionApproved,
      code_approved: codeApproved,
      commit_message: commitMessage,
      cognition_modifications: cognitionModifications || null,
    }),

  getAIRequestStatus: (requestId: string) =>
    http.get(`/ai/develop/${requestId}`),

  chat: (message: string, nodeId = '', projectId = '', preferredModel = ''): Promise<{ response: string }> =>
    http.post('/ai/chat', {
      message,
      node_id: nodeId || null,
      project_id: projectId || null,
      preferred_model: preferredModel || null,
    }),

  // ---- File Management ----
  createEntry: (parentPath: string, name: string, isDir = true): Promise<any> =>
    http.post('/fs/create', { parent_path: parentPath, name, is_dir: isDir }),

  renameEntry: (oldPath: string, newName: string): Promise<any> =>
    http.put('/fs/rename', { old_path: oldPath, new_name: newName }),

  deleteEntry: (path: string): Promise<any> =>
    http.delete('/fs/delete', { data: { path } }),

  getFileTree: (path: string, maxDepth = 4): Promise<any> =>
    http.get('/fs/tree', { params: { path, max_depth: maxDepth } }),

  getFileContent: (path: string): Promise<any> =>
    http.get('/fs/file', { params: { path } }),

  // ---- Initialization ----
  initProject: (projectPath: string, force = false): Promise<any> =>
    http.post('/projects/init', null, { params: { project_path: projectPath, force } }),

  getInitStatus: (jobId: string): Promise<any> =>
    http.get(`/projects/init/${jobId}`),

  // ---- Filesystem ----
  browseDirectory: (path: string, depth = 1): Promise<any> =>
    http.get('/fs/browse', { params: { path, depth } }),

  suggestWorkspaces: (path: string): Promise<any> =>
    http.get('/fs/suggest', { params: { path } }),

  getHomeDirectory: (): Promise<string> =>
    http.get('/fs/home'),

  getCommonRoots: (): Promise<string[]> =>
    http.get('/fs/common-roots'),

  // ---- Settings ----
  getAISettings: (): Promise<any> =>
    http.get('/settings/ai'),

  updateAISettings: (data: Record<string, string>): Promise<any> =>
    http.put('/settings/ai', data),

  testAIConnection: (): Promise<any> =>
    http.post('/settings/ai/test'),

  listSettings: (category?: string): Promise<any> =>
    http.get('/settings/', { params: category ? { category } : {} }),

  // ---- Health ----
  healthCheck: () =>
    http.get('/health'),
};