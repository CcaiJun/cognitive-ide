import React, { useRef, useCallback } from 'react';
import Editor from '@monaco-editor/react';
import { useEditorStore, type OpenFile } from '../../stores/editorStore';

const CodeViewer: React.FC = () => {
  const { openFiles, activeFilePath, setActiveFile, closeFile } = useEditorStore();
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const activeFile = openFiles.find(f => f.path === activeFilePath) || null;

  const handleEditorMount = useCallback((editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    monaco.editor.defineTheme('cognition-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment', foreground: '546e7a', fontStyle: 'italic' },
        { token: 'keyword', foreground: 'a78bfa' },
        { token: 'string', foreground: '22c55e' },
        { token: 'number', foreground: 'f97316' },
        { token: 'type', foreground: '3377ff' },
      ],
      colors: {
        'editor.background': '#0a0e1a',
        'editor.foreground': '#e2e8f0',
        'editor.lineHighlightBackground': '#111827',
        'editorLineNumber.foreground': '#334155',
        'editorOverviewRuler.border': '#1e293b',
      },
    });
    monaco.editor.setTheme('cognition-dark');
  }, []);

  // No files open
  if (openFiles.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-[#0a0e1a]">
        <div className="text-center text-gray-500">
          <div className="text-5xl mb-4">📄</div>
          <h3 className="text-base font-medium text-gray-300">文件预览</h3>
          <p className="text-sm mt-2 text-gray-400">在左侧文件树中点击文件</p>
          <p className="text-xs mt-1 text-gray-600">查看文件内容与语法高亮</p>
        </div>
      </div>
    );
  }

  // Loading
  if (activeFile?.loading) {
    return (
      <div className="h-full flex flex-col bg-[#0a0e1a]">
        <TabBar openFiles={openFiles} activeFilePath={activeFilePath} onSwitch={setActiveFile} onClose={closeFile} />
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <span className="animate-spin text-2xl mr-3">⟳</span>
          <span className="text-sm">加载中...</span>
        </div>
      </div>
    );
  }

  // Error
  if (activeFile?.error) {
    return (
      <div className="h-full flex flex-col bg-[#0a0e1a]">
        <TabBar openFiles={openFiles} activeFilePath={activeFilePath} onSwitch={setActiveFile} onClose={closeFile} />
        <div className="flex-1 flex items-center justify-center text-red-400">
          <div className="text-center">
            <div className="text-2xl mb-2">⚠️</div>
            <p className="text-sm">{activeFile.error}</p>
          </div>
        </div>
      </div>
    );
  }

  // Binary
  if (activeFile?.isBinary) {
    return (
      <div className="h-full flex flex-col bg-[#0a0e1a]">
        <TabBar openFiles={openFiles} activeFilePath={activeFilePath} onSwitch={setActiveFile} onClose={closeFile} />
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <div className="text-4xl mb-3">🖼️</div>
            <h3 className="text-sm font-medium text-gray-300">{activeFile.name}</h3>
            <p className="text-xs mt-1">二进制文件，无法预览</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#0a0e1a]">
      <TabBar openFiles={openFiles} activeFilePath={activeFilePath} onSwitch={setActiveFile} onClose={closeFile} />
      {/* File info bar */}
      {activeFile && (
        <div className="h-[26px] flex items-center gap-3 px-3 bg-[#0d1225] border-b border-gray-800/50 text-[10px] text-gray-500 shrink-0">
          <span className="px-1.5 py-0.5 rounded bg-[#a78bfa]/20 text-[#a78bfa] lowercase">{activeFile.language}</span>
          <span className="truncate max-w-[400px]">{activeFile.path}</span>
          <span className="ml-auto">{activeFile.size > 1024 ? `${(activeFile.size / 1024).toFixed(1)}KB` : `${activeFile.size}B`}</span>
          {activeFile.truncated && <span className="text-yellow-500">文件过大</span>}
        </div>
      )}
      {/* Editor */}
      <div className="flex-1 overflow-hidden">
        {activeFile && !activeFile.isBinary && (
          <Editor
            key={activeFile.path}
            height="100%"
            language={activeFile.language}
            value={activeFile.content}
            onMount={handleEditorMount}
            theme="cognition-dark"
            options={{
              readOnly: true,
              fontSize: 13,
              lineHeight: 22,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              lineNumbers: 'on',
              renderWhitespace: 'selection',
              bracketPairColorization: { enabled: true },
              padding: { top: 8 },
              wordWrap: 'on',
              folding: true,
              glyphMargin: false,
              overviewRulerLanes: 0,
              hideCursorInOverviewRuler: true,
              overviewRulerBorder: false,
              scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
            }}
            loading={
              <div className="h-full flex items-center justify-center text-gray-500 text-sm">
                加载编辑器...
              </div>
            }
          />
        )}
      </div>
    </div>
  );
};

// Tab bar sub-component
const TabBar: React.FC<{
  openFiles: OpenFile[];
  activeFilePath: string | null;
  onSwitch: (path: string) => void;
  onClose: (path: string) => void;
}> = ({ openFiles, activeFilePath, onSwitch, onClose }) => (
  <div className="h-[36px] flex items-stretch bg-[#111827] border-b border-gray-800 overflow-x-auto shrink-0"
       style={{ scrollbarWidth: 'none' }}>
    {openFiles.map(file => (
      <div
        key={file.path}
        className={`flex items-center gap-1.5 px-3 cursor-pointer border-r border-gray-800 group min-w-0 shrink-0 ${
          file.path === activeFilePath
            ? 'bg-[#0a0e1a] text-gray-200 border-t-2 border-t-[#a78bfa]'
            : 'text-gray-500 hover:text-gray-300 hover:bg-[#0d1225]'
        }`}
        onClick={() => onSwitch(file.path)}
      >
        <span className="text-[10px] shrink-0">{fileIcon(file.name)}</span>
        <span className="text-xs truncate max-w-[120px]">{file.name}</span>
        {file.loading && <span className="animate-spin text-[10px]">⟳</span>}
        {file.truncated && <span className="text-[9px] text-yellow-500">⚠</span>}
        <button
          className="text-gray-600 hover:text-gray-300 hover:bg-gray-700 rounded w-4 h-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
          onClick={e => { e.stopPropagation(); onClose(file.path); }}
        >
          ×
        </button>
      </div>
    ))}
  </div>
);

function fileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    ts: '🔷', tsx: '⚛️', js: '🟨', jsx: '⚛️', py: '🐍', go: '🔵', rs: '🦀',
    java: '☕', rb: '💎', php: '🐘', c: '⚙️', cpp: '⚙️',
    json: '📋', yaml: '📋', yml: '📋', toml: '📋',
    md: '📝', txt: '📄', html: '🌐', css: '🎨', sql: '🗃️', sh: '⚡',
    vue: '💚', svelte: '🧡',
  };
  return map[ext] || '📄';
}

export default CodeViewer;