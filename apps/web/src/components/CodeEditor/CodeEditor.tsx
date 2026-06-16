import React, { useRef, useCallback, useMemo } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { useCognitionStore } from '../../stores/cognitionStore';

const CodeEditor: React.FC = () => {
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const { implementationCode, currentNode } = useCognitionStore();

  // Determine language from file path
  const language = useMemo(() => {
    if (!currentNode?.file_path) return 'typescript';
    const ext = currentNode.file_path.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'ts': case 'tsx': return 'typescript';
      case 'js': case 'jsx': return 'javascript';
      case 'py': return 'python';
      case 'go': return 'go';
      case 'rs': return 'rust';
      case 'java': return 'java';
      case 'yaml': case 'yml': return 'yaml';
      case 'json': return 'json';
      case 'md': return 'markdown';
      default: return 'plaintext';
    }
  }, [currentNode?.file_path]);

  // Monaco editor mount handler — register cognition lens provider
  const handleEditorMount: OnMount = useCallback((editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // ---- Cognition Lens: hover provider ----
    // Shows cognition summary when hovering over function/class names
    monaco.languages.registerHoverProvider(['typescript', 'javascript', 'python'], {
      provideHover: (model, position) => {
        const word = model.getWordAtPosition(position);
        if (!word || !currentNode) return null;

        // Match word against node interfaces
        const matchedIface = currentNode.interfaces?.find(
          (iface) => iface.name === word.word
        );
        if (matchedIface) {
          return {
            contents: [
              { value: `**${matchedIface.name}** \`${matchedIface.access}\`` },
              { value: matchedIface.signature || '' },
              { value: `*Side effects: ${matchedIface.side_effects?.join(', ') || 'none'}*` },
              { value: `🧠 ${currentNode.responsibility?.summary || ''}` },
            ],
          };
        }

        // Match word against key types
        const matchedType = currentNode.key_types?.find(
          (kt) => kt.name === word.word
        );
        if (matchedType) {
          return {
            contents: [
              { value: `**${matchedType.name}** (type)` },
              { value: `Defined in: \`${matchedType.definition_in}\`` },
              ...(matchedType.fields?.length
                ? [{ value: `Fields: \`${matchedType.fields?.join('`, `')}\`` }]
                : []),
            ],
          };
        }

        return null;
      },
    });

    // ---- Cognition decorations: highlight interfaces & risks ----
    if (currentNode && implementationCode) {
      const decorations: any[] = [];

      // Highlight interface function names
      currentNode.interfaces?.forEach((iface) => {
        const matchIndex = implementationCode.indexOf(iface.name);
        if (matchIndex >= 0) {
          const line = implementationCode.substring(0, matchIndex).split('\n').length;
          decorations.push({
            range: new monaco.Range(line, 1, line, 1),
            options: {
              isWholeLine: true,
              className: 'cognition-interface-line',
              glyphMarginClassName: 'cognition-interface-glyph',
              glyphMarginHoverMessage: { value: `📋 Interface: ${iface.name} (${iface.access})` },
              overviewRuler: {
                color: '#3377ff',
                position: monaco.editor.OverviewRulerLane.Left,
              },
            },
          });
        }
      });

      // Highlight risk lines
      currentNode.risks?.forEach((risk) => {
        if (risk.description) {
          const keywords = risk.description.split(/\s+/).filter(w => w.length > 4);
          keywords.forEach((kw) => {
            const idx = implementationCode.indexOf(kw);
            if (idx >= 0) {
              const line = implementationCode.substring(0, idx).split('\n').length;
              decorations.push({
                range: new monaco.Range(line, 1, line, 1),
                options: {
                  isWholeLine: true,
                  className: risk.level === 'high' ? 'cognition-risk-high-line' : 'cognition-risk-medium-line',
                  glyphMarginClassName: risk.level === 'high' ? 'cognition-risk-high-glyph' : 'cognition-risk-medium-glyph',
                  glyphMarginHoverMessage: { value: `⚠️ Risk (${risk.level}): ${risk.title}` },
                  overviewRuler: {
                    color: risk.level === 'high' ? '#ef4444' : '#eab308',
                    position: monaco.editor.OverviewRulerLane.Right,
                  },
                },
              });
            }
          });
        }
      });

      editor.createDecorationsCollection(decorations);
    }

    // ---- Custom theme for cognition highlights ----
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

    // Editor settings
    editor.updateOptions({
      fontSize: 13,
      lineHeight: 22,
      minimap: { enabled: true, scale: 1 },
      glyphMargin: true,
      folding: true,
      lineNumbers: 'on',
      scrollBeyondLastLine: false,
      renderWhitespace: 'selection',
      bracketPairColorization: { enabled: true },
      padding: { top: 8 },
    });
  }, [currentNode, implementationCode]);

  // Empty state — no node selected
  if (!currentNode) {
    return (
      <div className="h-full flex items-center justify-center bg-[#0a0e1a]">
        <div className="text-center text-gray-500">
          <div className="text-5xl mb-3">📝</div>
          <h3 className="text-base font-medium text-gray-300">代码编辑器</h3>
          <p className="text-sm mt-2">选择一个模块查看代码</p>
          <p className="text-xs mt-1 text-gray-600">点击星系图谱中的节点</p>
          <div className="mt-4 text-xs text-gray-700 max-w-[260px] mx-auto leading-relaxed">
            <div>🧠 认知透镜 — 悬停函数名查看认知摘要</div>
            <div className="mt-1">📋 接口高亮 — 左侧蓝色标记</div>
            <div className="mt-1">⚠️ 风险高亮 — 左侧红/黄标记</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#0a0e1a]">
      {/* File tab bar */}
      <div className="h-9 flex items-center justify-between px-3 bg-[#111827] border-b border-gray-800 shrink-0">
        <div className="flex items-center gap-3">
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#a78bfa]/20 text-[#a78bfa]">
            {language}
          </span>
          <span className="text-xs text-gray-300 truncate max-w-[220px]">
            {currentNode.file_path || 'unknown'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {currentNode.human_verified && (
            <span className="text-[10px] text-green-400 flex items-center gap-1">
              ✓ verified
            </span>
          )}
          {currentNode.testing && (
            <span className="text-[10px] text-gray-500">
              Coverage: {currentNode.testing.coverage_percent}%
            </span>
          )}
          <span className="text-[10px] text-gray-600">
            {currentNode.lines || 0} lines
          </span>
        </div>
      </div>

      {/* Cognition inline hint banner */}
      {currentNode.responsibility?.summary && (
        <div className="px-3 py-1.5 bg-[#a78bfa]/5 border-b border-[#a78bfa]/10 flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-[#a78bfa]">🧠</span>
          <span className="text-[11px] text-gray-400 leading-snug truncate">
            {currentNode.responsibility.summary}
          </span>
          {currentNode.risks?.filter(r => r.level === 'high').length ? (
            <span className="text-[10px] text-red-400 ml-auto shrink-0">
              ⚠ {currentNode.risks.filter(r => r.level === 'high').length} high risks
            </span>
          ) : null}
        </div>
      )}

      {/* Monaco Editor */}
      <div className="flex-1 overflow-hidden">
        <Editor
          height="100%"
          language={language}
          value={implementationCode || '// No code available for this module'}
          onChange={() => {}}
          onMount={handleEditorMount}
          theme="cognition-dark"
          options={{
            readOnly: true,
            fontSize: 13,
            lineHeight: 22,
            minimap: { enabled: true },
            glyphMargin: true,
            scrollBeyondLastLine: false,
          }}
          loading={
            <div className="h-full flex items-center justify-center text-gray-500 text-sm">
              Loading editor...
            </div>
          }
        />
      </div>

      {/* Cognition legend bar */}
      <div className="h-6 flex items-center gap-4 px-3 bg-[#111827] border-t border-gray-800 text-[9px] text-gray-600 shrink-0">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-[#3377ff]" /> Interface
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-[#ef4444]" /> High Risk
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-sm bg-[#eab308]" /> Medium Risk
        </span>
        <span className="ml-auto">
          {currentNode.node_id} · {currentNode.language}
        </span>
      </div>

      {/* Cognition-specific CSS */}
      <style>{`
        .cognition-interface-glyph {
          background: #3377ff;
          border-radius: 2px;
          margin-left: 3px;
          width: 6px !important;
        }
        .cognition-risk-high-glyph {
          background: #ef4444;
          border-radius: 2px;
          margin-left: 3px;
          width: 6px !important;
        }
        .cognition-risk-medium-glyph {
          background: #eab308;
          border-radius: 2px;
          margin-left: 3px;
          width: 6px !important;
        }
        .cognition-interface-line {
          background: rgba(51, 119, 255, 0.04);
        }
        .cognition-risk-high-line {
          background: rgba(239, 68, 68, 0.06);
        }
        .cognition-risk-medium-line {
          background: rgba(234, 179, 8, 0.04);
        }
      `}</style>
    </div>
  );
};

export default CodeEditor;
