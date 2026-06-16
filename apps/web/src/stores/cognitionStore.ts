import { create } from 'zustand';
import type { CognitionNode } from '@cognition-ide/shared-types';
import { api } from '../lib/api';

interface CognitionState {
  currentNode: CognitionNode | null;
  isLoading: boolean;
  error: string | null;
  implementationCode: string;
  interfaceCode: string;
  impactRadius: {
    center_node_id: string;
    direct: { node_id: string; node_label: string; reason: string; distance: number }[];
    indirect: { node_id: string; node_label: string; reason: string; distance: number }[];
    cognition_updates: string[];
  } | null;
  showImpactPreview: boolean;
  symbolIndex: { name: string; type: string; node_id: string; file: string; line: number }[];

  loadCognitionNode: (nodeId: string, projectId: string) => Promise<void>;
  loadImpactRadius: (nodeId: string, depth?: number) => Promise<void>;
  verifyNode: (nodeId: string, projectId: string, verifiedBy: string) => Promise<void>;
  loadSymbolIndex: (projectId: string) => Promise<void>;
  setShowImpactPreview: (show: boolean) => void;
  clearCognition: () => void;
}

export const useCognitionStore = create<CognitionState>((set, get) => ({
  currentNode: null,
  isLoading: false,
  error: null,
  implementationCode: '',
  interfaceCode: '',
  impactRadius: null,
  showImpactPreview: false,
  symbolIndex: [],

  loadCognitionNode: async (nodeId: string, projectId: string) => {
    set({ isLoading: true, error: null });
    try {
      const response: any = await api.getCognitionNode(nodeId, projectId);
      set({
        currentNode: response.cognition,
        implementationCode: response.code_snippets?.implementation || '',
        interfaceCode: response.code_snippets?.interface || '',
        isLoading: false,
      });
    } catch (e: any) {
      set({ isLoading: false, error: e.message || 'Failed to load cognition node' });
    }
  },

  loadImpactRadius: async (nodeId: string, depth = 2) => {
    try {
      const impact: any = await api.getImpactRadius(nodeId, depth);
      set({ impactRadius: impact, showImpactPreview: true });
    } catch (e: any) {
      console.error('Failed to load impact radius:', e);
    }
  },

  verifyNode: async (nodeId: string, projectId: string, verifiedBy: string) => {
    try {
      await api.verifyNode(nodeId, projectId, verifiedBy);
      const current = get().currentNode;
      if (current) {
        set({
          currentNode: {
            ...current,
            human_verified: true,
            verified_by: verifiedBy,
          },
        });
      }
    } catch (e: any) {
      console.error('Failed to verify node:', e);
    }
  },

  loadSymbolIndex: async (projectId: string) => {
    try {
      const result: any = await api.getSymbolIndex(projectId);
      set({ symbolIndex: result.symbols || [] });
    } catch (e: any) {
      console.error('Failed to load symbol index:', e);
    }
  },

  setShowImpactPreview: (show) => set({ showImpactPreview: show }),
  clearCognition: () => set({
    currentNode: null,
    implementationCode: '',
    interfaceCode: '',
    impactRadius: null,
    showImpactPreview: false,
  }),
}));
