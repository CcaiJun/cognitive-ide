import { create } from 'zustand';
import { api } from '../lib/api';

export interface OpenFile {
  path: string;
  name: string;
  content: string;
  language: string;
  size: number;
  isBinary: boolean;
  truncated: boolean;
  loading: boolean;
  error?: string;
}

interface EditorState {
  openFiles: OpenFile[];
  activeFilePath: string | null;

  openFile: (path: string) => Promise<void>;
  closeFile: (path: string) => void;
  setActiveFile: (path: string) => void;
  closeAllFiles: () => void;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  openFiles: [],
  activeFilePath: null,

  openFile: async (path: string) => {
    // Already open? Just activate it
    const existing = get().openFiles.find(f => f.path === path);
    if (existing) {
      set({ activeFilePath: path });
      return;
    }

    // Add a loading placeholder
    const name = path.split('/').pop() || path;
    const placeholder: OpenFile = {
      path, name, content: '', language: 'plaintext',
      size: 0, isBinary: false, truncated: false, loading: true,
    };
    set(s => ({
      openFiles: [...s.openFiles, placeholder],
      activeFilePath: path,
    }));

    // Fetch content
    try {
      const data = await api.getFileContent(path);
      set(s => ({
        openFiles: s.openFiles.map(f =>
          f.path === path ? {
            ...f,
            content: data.content || '',
            language: data.language || 'plaintext',
            size: data.size || 0,
            isBinary: data.is_binary || false,
            truncated: data.truncated || false,
            loading: false,
          } : f
        ),
      }));
    } catch (e: any) {
      set(s => ({
        openFiles: s.openFiles.map(f =>
          f.path === path ? { ...f, loading: false, error: e.message || 'Failed to load file' } : f
        ),
      }));
    }
  },

  closeFile: (path: string) => {
    set(s => {
      const remaining = s.openFiles.filter(f => f.path !== path);
      const newActive = s.activeFilePath === path
        ? (remaining.length > 0 ? remaining[remaining.length - 1].path : null)
        : s.activeFilePath;
      return { openFiles: remaining, activeFilePath: newActive };
    });
  },

  setActiveFile: (path: string) => set({ activeFilePath: path }),

  closeAllFiles: () => set({ openFiles: [], activeFilePath: null }),
}));
