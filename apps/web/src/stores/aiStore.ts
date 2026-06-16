import { create } from 'zustand';
import type { ChatMessage, CognitionDraft, CodeChange, ImpactAnalysis } from '@cognition-ide/shared-types';
import { api } from '../lib/api';

interface AIState {
  // Chat
  messages: ChatMessage[];
  isStreaming: boolean;
  inputValue: string;

  // Development request
  currentRequestId: string | null;
  requestStatus: 'idle' | 'loading' | 'cognition_draft_ready' | 'code_ready' | 'error';
  cognitionDraft: CognitionDraft | null;
  codeChanges: CodeChange[] | null;
  impactAnalysis: ImpactAnalysis | null;
  questionsForHuman: string[];

  // Context loading
  contextFiles: { path: string; size: string; status: 'pending' | 'loading' | 'done' }[];
  showContextLoading: boolean;

  // Actions
  sendMessage: (message: string, nodeId?: string, projectId?: string) => Promise<void>;
  submitDevRequest: (targetNode: string, instruction: string, contextDepth?: number) => Promise<void>;
  executeChanges: (requestId: string, cognitionApproved: boolean, codeApproved: boolean, commitMessage: string) => Promise<void>;
  setInputValue: (value: string) => void;
  clearChat: () => void;
  setContextFiles: (files: { path: string; size: string }[]) => void;
}

export const useAIStore = create<AIState>((set) => ({
  messages: [],
  isStreaming: false,
  inputValue: '',
  currentRequestId: null,
  requestStatus: 'idle',
  cognitionDraft: null,
  codeChanges: null,
  impactAnalysis: null,
  questionsForHuman: [],
  contextFiles: [],
  showContextLoading: false,

  sendMessage: async (message: string, nodeId?: string, projectId?: string) => {
    const userMsg: ChatMessage = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };
    set((state) => ({ messages: [...state.messages, userMsg], isStreaming: true }));

    try {
      const response: any = await api.chat(message, nodeId, projectId);
      const content = typeof response === 'string' ? response : response?.response || JSON.stringify(response);
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content,
        timestamp: new Date().toISOString(),
      };
      set((state) => ({
        messages: [...state.messages, assistantMsg],
        isStreaming: false,
      }));
    } catch (e: any) {
      const errorMsg: ChatMessage = {
        role: 'assistant',
        content: `Error: ${e.message || 'AI request failed'}`,
        timestamp: new Date().toISOString(),
      };
      set((state) => ({
        messages: [...state.messages, errorMsg],
        isStreaming: false,
      }));
    }
  },

  submitDevRequest: async (targetNode: string, instruction: string, contextDepth: number = 2) => {
    set({ requestStatus: 'loading', showContextLoading: true });
    try {
      const response: any = await api.aiDevelop(targetNode, instruction, contextDepth);
      set({
        currentRequestId: response.request_id,
        requestStatus: response.status === 'cognition_draft_ready' ? 'cognition_draft_ready' : 'loading',
        cognitionDraft: response.cognition_draft || null,
        impactAnalysis: response.impact_radius ? {
          affected_modules: [...(response.impact_radius.direct || []).map((d: any) => d.node_id), ...(response.impact_radius.indirect || []).map((d: any) => d.node_id)],
          affected_tests: [],
          new_risks: [],
          estimated_complexity: 'medium' as const,
        } : null,
        questionsForHuman: response.questions_for_human || [],
        showContextLoading: false,
      });
    } catch (e: any) {
      set({ requestStatus: 'error', showContextLoading: false });
    }
  },

  executeChanges: async (requestId: string, cognitionApproved: boolean, codeApproved: boolean, commitMessage: string) => {
    try {
      const result: any = await api.executeChanges(requestId, cognitionApproved, codeApproved, commitMessage);
      if (result.status === 'committed') {
        set({ requestStatus: 'idle', currentRequestId: null, cognitionDraft: null, codeChanges: null });
      }
    } catch (e: any) {
      console.error('Execute changes failed:', e);
    }
  },

  setInputValue: (value) => set({ inputValue: value }),
  clearChat: () => set({ messages: [], currentRequestId: null, requestStatus: 'idle' }),

  setContextFiles: (files) => set({
    contextFiles: files.map((f) => ({ ...f, status: 'pending' as const })),
    showContextLoading: true,
  }),
}));
