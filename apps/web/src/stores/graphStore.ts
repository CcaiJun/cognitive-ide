import { create } from 'zustand';
import type { GraphNode, GraphEdge, GraphData } from '@cognition-ide/shared-types';
import { api } from '../lib/api';

interface GraphState {
  // Data
  currentProject: string | null;
  projectPath: string | null;
  graphData: GraphData | null;
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNodeId: string | null;
  hoveredNodeId: string | null;

  // UI state
  isLoading: boolean;
  error: string | null;
  cognitionStatus: 'ready' | 'analyzing' | 'error';
  unverifiedChanges: number;

  // Layout
  zoom: number;
  panX: number;
  panY: number;

  // Layer visibility
  showDomain: boolean;
  showInfra: boolean;
  showShared: boolean;
  showExternal: boolean;
  showEdgeLabels: boolean;
  showMiniMap: boolean;

  // Actions
  loadProject: (path: string) => Promise<void>;
  selectNode: (nodeId: string | null) => void;
  hoverNode: (nodeId: string | null) => void;
  setZoom: (zoom: number) => void;
  setPan: (x: number, y: number) => void;
  updateNodeStatus: (nodeId: string, status: string) => void;
  applyGraphUpdate: (update: { nodes_modified: { id: string; status: string; [k: string]: unknown }[]; edges_added: GraphEdge[]; edges_removed: string[] }) => void;
  toggleLayer: (layer: 'showDomain' | 'showInfra' | 'showShared' | 'showExternal' | 'showEdgeLabels' | 'showMiniMap') => void;
}

export const useGraphStore = create<GraphState>((set, get) => ({
  currentProject: null,
  projectPath: null,
  graphData: null,
  nodes: [],
  edges: [],
  selectedNodeId: null,
  hoveredNodeId: null,
  isLoading: false,
  error: null,
  cognitionStatus: 'ready',
  unverifiedChanges: 0,
  zoom: 1,
  panX: 0,
  panY: 0,
  showDomain: true,
  showInfra: true,
  showShared: true,
  showExternal: true,
  showEdgeLabels: false,
  showMiniMap: true,

  loadProject: async (path: string) => {
    set({ isLoading: true, error: null });
    try {
      const response = await api.loadProject(path);
      set({
        currentProject: response.project_id,
        projectPath: path,
        graphData: response.graph_data,
        nodes: response.graph_data.nodes || [],
        edges: response.graph_data.edges || [],
        cognitionStatus: response.cognition_status as any,
        unverifiedChanges: response.unverified_changes,
        isLoading: false,
      });
      // Persist project path to localStorage for page refresh recovery
      try { localStorage.setItem('cognitive-ide-project-path', path); } catch {}
    } catch (e: any) {
      set({ isLoading: false, error: e.message || 'Failed to load project' });
    }
  },

  selectNode: (nodeId) => {
    set({ selectedNodeId: nodeId });
    // Load cognition data when node selected
    if (nodeId) {
      const project = get().currentProject;
      if (project) {
        // Trigger cognition store load via import
        import('../stores/cognitionStore').then(({ useCognitionStore }) => {
          useCognitionStore.getState().loadCognitionNode(nodeId, project);
        });
      }
    }
  },

  hoverNode: (nodeId) => set({ hoveredNodeId: nodeId }),
  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(5, zoom)) }),
  setPan: (x, y) => set({ panX: x, panY: y }),

  updateNodeStatus: (nodeId, status) => {
    set((state) => ({
      nodes: state.nodes.map((n) =>
        n.id === nodeId ? { ...n, status: status as any } : n
      ),
    }));
  },

  applyGraphUpdate: (update) => {
    set((state) => ({
      nodes: state.nodes.map((n) => {
        const modified = update.nodes_modified.find((m) => m.id === n.id);
        if (modified) {
          const { id: _id, ...rest } = modified;
          return { ...n, ...rest } as GraphNode;
        }
        return n;
      }),
      edges: [
        ...state.edges.filter((e) => !update.edges_removed.includes(e.id)),
        ...update.edges_added,
      ],
    }));
  },

  toggleLayer: (layer) => {
    set((state) => ({ [layer]: !state[layer] } as Partial<GraphState>));
  },
}));