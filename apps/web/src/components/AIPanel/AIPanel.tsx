import React, { useRef, useEffect, useState } from 'react';
import { useAIStore } from '../../stores/aiStore';
import { useGraphStore } from '../../stores/graphStore';
import { useCognitionStore } from '../../stores/cognitionStore';

// Quick-action presets for common development tasks
const QUICK_ACTIONS = [
  { label: '添加接口', icon: '📋', instruction: '为这个模块添加一个新的公共接口' },
  { label: '优化性能', icon: '⚡', instruction: '分析这个模块的性能瓶颈并提出优化建议' },
  { label: '补充测试', icon: '🧪', instruction: '为未覆盖的关键路径补充单元测试' },
  { label: '修复风险', icon: '🔧', instruction: '针对高优先级风险提出修复方案' },
  { label: '重构依赖', icon: '🔗', instruction: '分析依赖关系，建议解耦方案' },
  { label: '添加文档', icon: '📖', instruction: '为关键接口和类型补充文档注释' },
];

const AIPanel: React.FC = () => {
  const {
    messages, isStreaming, inputValue,
    requestStatus, cognitionDraft, questionsForHuman,
    sendMessage, submitDevRequest, executeChanges,
    setInputValue, currentRequestId,
    contextFiles, showContextLoading,
  } = useAIStore();
  const { selectedNodeId, currentProject } = useGraphStore();
  const { currentNode, loadImpactRadius } = useCognitionStore();
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [devInstruction, setDevInstruction] = useState('');
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [mode, setMode] = useState<'chat' | 'develop'>('chat');

  // Auto-scroll
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!inputValue.trim()) return;
    sendMessage(inputValue, selectedNodeId || undefined, currentProject || undefined);
    setInputValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleDevRequest = () => {
    if (!devInstruction.trim() || !selectedNodeId) return;
    submitDevRequest(selectedNodeId, devInstruction);
    setDevInstruction('');
  };

  const handleDevKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleDevRequest();
    }
  };

  const handleQuickAction = (instruction: string) => {
    if (mode === 'develop') {
      setDevInstruction(instruction);
    } else {
      setInputValue(instruction);
    }
    setShowQuickActions(false);
  };

  const handleApproveCognition = () => {
    if (currentRequestId) {
      executeChanges(currentRequestId, true, false, 'feat: AI cognition update');
    }
  };

  const handleApproveAll = () => {
    if (currentRequestId) {
      executeChanges(currentRequestId, true, true, 'feat: AI-generated changes');
    }
  };

  const handleReject = () => {
    // Reset request state
    useAIStore.setState({ requestStatus: 'idle', currentRequestId: null, cognitionDraft: null });
  };

  return (
    <div className="h-full flex flex-col bg-[#0f1729]">
      {/* Mode switcher + status */}
      <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-sm">🤖</span>
          <div className="flex bg-[#111827] rounded-md overflow-hidden text-[10px]">
            <button
              onClick={() => setMode('chat')}
              className={`px-2.5 py-1 transition-colors ${
                mode === 'chat' ? 'bg-[#a78bfa]/20 text-[#a78bfa]' : 'text-gray-500 hover:text-gray-300'
              }`}
            >💬 对话</button>
            <button
              onClick={() => setMode('develop')}
              className={`px-2.5 py-1 transition-colors ${
                mode === 'develop' ? 'bg-[#a78bfa]/20 text-[#a78bfa]' : 'text-gray-500 hover:text-gray-300'
              }`}
            >⚡ 开发</button>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <div className={`w-1.5 h-1.5 rounded-full ${
            requestStatus === 'idle' ? 'bg-green-500' :
            requestStatus === 'loading' ? 'bg-yellow-500 animate-pulse' :
            requestStatus === 'cognition_draft_ready' ? 'bg-blue-500 animate-pulse' :
            'bg-red-500'
          }`} />
          <span className="text-gray-500">
            {requestStatus === 'idle' ? '就绪' :
             requestStatus === 'loading' ? '分析中...' :
             requestStatus === 'cognition_draft_ready' ? '待确认' :
             '错误'}
          </span>
          <button
            onClick={() => setShowQuickActions(!showQuickActions)}
            className="text-gray-500 hover:text-gray-300 ml-1"
            title="快速操作"
          >⚡</button>
        </div>
      </div>

      {/* Quick actions panel */}
      {showQuickActions && (
        <div className="px-3 py-2 border-b border-gray-800 bg-[#111827]/50 shrink-0">
          <div className="text-[10px] text-gray-500 mb-1.5">快速操作</div>
          <div className="flex flex-wrap gap-1">
            {QUICK_ACTIONS.map((action, i) => (
              <button
                key={i}
                onClick={() => handleQuickAction(action.instruction)}
                className="text-[10px] px-2 py-1 bg-[#1e293b] text-gray-400 rounded hover:bg-[#334155] hover:text-gray-200 transition-colors flex items-center gap-1"
              >
                <span>{action.icon}</span>
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Context loading progress */}
      {showContextLoading && contextFiles.length > 0 && (
        <div className="px-3 py-2 border-b border-gray-800 shrink-0">
          <div className="text-[10px] text-gray-500 mb-1">📂 上下文加载</div>
          <div className="space-y-0.5 max-h-20 overflow-y-auto">
            {contextFiles.map((file, i) => (
              <div key={i} className="flex items-center gap-2 text-[10px]">
                <span className={`w-1.5 h-1.5 rounded-full ${
                  file.status === 'done' ? 'bg-green-500' :
                  file.status === 'loading' ? 'bg-yellow-500 animate-pulse' :
                  'bg-gray-600'
                }`} />
                <span className="text-gray-400 truncate flex-1">{file.path}</span>
                <span className="text-gray-600">{file.size}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Cognition draft review */}
      {requestStatus === 'cognition_draft_ready' && cognitionDraft && (
        <div className="border-b border-[#a78bfa]/30 bg-[#a78bfa]/5 p-3 shrink-0 max-h-[240px] overflow-y-auto">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs font-medium text-[#a78bfa]">📋 认知变更草案</div>
            <div className="flex gap-1.5">
              <button
                onClick={handleApproveCognition}
                className="text-[10px] px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded hover:bg-blue-500/30"
              >✓ 认知</button>
              <button
                onClick={handleApproveAll}
                className="text-[10px] px-2 py-0.5 bg-green-500/20 text-green-400 rounded hover:bg-green-500/30"
              >✓ 全部</button>
              <button
                onClick={handleReject}
                className="text-[10px] px-2 py-0.5 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30"
              >✕ 拒绝</button>
            </div>
          </div>

          {cognitionDraft.responsibility_change && (
            <div className="mb-2 p-2 bg-[#1e293b] rounded">
              <div className="text-[10px] text-gray-500">职责变更:</div>
              <div className="text-xs text-[#c4b5fd]">{cognitionDraft.responsibility_change}</div>
            </div>
          )}

          {cognitionDraft.interfaces_added?.length > 0 && (
            <div className="mb-2">
              <div className="text-[10px] text-gray-500 mb-0.5">新增接口:</div>
              {cognitionDraft.interfaces_added.map((iface: any, i: number) => (
                <div key={i} className="text-xs text-green-400 py-0.5 flex items-center gap-1">
                  <span className="text-green-500">+</span>
                  <span className="font-mono">{iface.name}</span>
                  <span className="text-gray-600 text-[10px]">{iface.access}</span>
                </div>
              ))}
            </div>
          )}

          {cognitionDraft.interfaces_modified?.length > 0 && (
            <div className="mb-2">
              <div className="text-[10px] text-gray-500 mb-0.5">修改接口:</div>
              {cognitionDraft.interfaces_modified.map((iface: any, i: number) => (
                <div key={i} className="text-xs text-yellow-400 py-0.5 flex items-center gap-1">
                  <span className="text-yellow-500">~</span>
                  <span className="font-mono">{iface.name}</span>
                </div>
              ))}
            </div>
          )}

          {cognitionDraft.risks_added?.length > 0 && (
            <div className="mb-2">
              <div className="text-[10px] text-gray-500 mb-0.5">新增风险:</div>
              {cognitionDraft.risks_added.map((risk: any, i: number) => (
                <div key={i} className="text-xs text-orange-400 py-0.5 flex items-center gap-1">
                  <span>⚠️</span>
                  <span>{risk.title}</span>
                  <span className="text-[10px] text-gray-500">({risk.level})</span>
                </div>
              ))}
            </div>
          )}

          {questionsForHuman.length > 0 && (
            <div className="mt-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded">
              <div className="text-[10px] text-yellow-400 mb-1">❓ 需要确认:</div>
              {questionsForHuman.map((q, i) => (
                <div key={i} className="text-xs text-gray-300 py-0.5">{q}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Message history */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {messages.length === 0 && (
          <div className="text-center text-gray-600 py-8">
            <div className="text-3xl mb-2">🤖</div>
            <p className="text-xs">AI 助手已就绪</p>
            <p className="text-[10px] mt-1">选择节点后可进行对话或开发请求</p>
            <div className="mt-3 text-[10px] text-gray-700 space-y-1">
              <div>💬 对话模式 — 自由问答</div>
              <div>⚡ 开发模式 — AI生成认知+代码变更</div>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] px-3 py-2 rounded-lg text-xs leading-relaxed ${
              msg.role === 'user'
                ? 'bg-[#a78bfa]/20 text-[#c4b5fd]'
                : 'bg-[#1e293b] text-gray-300'
            }`}>
              {msg.role === 'assistant' && (
                <span className="text-[10px] text-gray-500 block mb-1">🤖 AI</span>
              )}
              <div className="whitespace-pre-wrap">{msg.content}</div>
              <span className="text-[8px] text-gray-600 block mt-1">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </span>
            </div>
          </div>
        ))}

        {isStreaming && (
          <div className="flex justify-start">
            <div className="bg-[#1e293b] px-3 py-2 rounded-lg text-xs text-gray-500">
              <span className="animate-pulse">● ● ●</span>
            </div>
          </div>
        )}

        <div ref={chatEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t border-gray-800 shrink-0">
        {mode === 'chat' ? (
          <div className="p-2">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={selectedNodeId ? `询问关于 ${selectedNodeId} 的问题...` : '输入问题...'}
                className="flex-1 h-8 px-3 text-xs bg-[#111827] border border-gray-700 rounded-md text-gray-300 placeholder-gray-600 focus:border-[#a78bfa] focus:outline-none transition-colors"
              />
              <button
                onClick={handleSend}
                disabled={!inputValue.trim() || isStreaming}
                className="h-8 px-3 text-xs bg-[#a78bfa]/20 text-[#a78bfa] rounded-md hover:bg-[#a78bfa]/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >发送</button>
            </div>
          </div>
        ) : (
          <div className="p-2">
            {selectedNodeId ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-[10px] text-gray-500">
                  <span>⚡ 开发请求 →</span>
                  <span className="text-[#a78bfa]">{selectedNodeId}</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={devInstruction}
                    onChange={(e) => setDevInstruction(e.target.value)}
                    onKeyDown={handleDevKeyDown}
                    placeholder="描述你想做的变更..."
                    className="flex-1 h-8 px-3 text-xs bg-[#111827] border border-gray-700 rounded-md text-gray-300 placeholder-gray-600 focus:border-[#a78bfa] focus:outline-none transition-colors"
                  />
                  <button
                    onClick={handleDevRequest}
                    disabled={!devInstruction.trim() || requestStatus === 'loading'}
                    className="h-8 px-3 text-xs bg-[#a78bfa]/20 text-[#a78bfa] rounded-md hover:bg-[#a78bfa]/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >⚡ 提交</button>
                </div>
                {currentNode && (
                  <div className="flex items-center gap-2 text-[10px]">
                    <button
                      onClick={() => loadImpactRadius(selectedNodeId)}
                      className="text-orange-400 hover:text-orange-300"
                    >🔴 查看影响半径</button>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-gray-500 text-center py-2">
                请先在图谱中选择一个目标节点
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AIPanel;
