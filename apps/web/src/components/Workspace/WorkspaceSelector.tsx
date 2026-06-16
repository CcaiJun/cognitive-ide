import React, { useEffect, useState, useRef } from 'react';
import { api } from '../../lib/api';

interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size?: number;
  children?: DirEntry[];
}

interface WorkspaceCandidate {
  path: string;
  name: string;
  language: string;
  has_cognition: boolean;
  reason: string;
}

interface Props {
  onSelect: (path: string) => void;
  onClose?: () => void;
}

const WorkspaceSelector: React.FC<Props> = ({ onSelect, onClose }) => {
  const [currentPath, setCurrentPath] = useState('');
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [suggestions, setSuggestions] = useState<WorkspaceCandidate[]>([]);
  const [pathInput, setPathInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<'suggest' | 'browse'>('suggest');
  const [history, setHistory] = useState<string[]>([]);
  const [initJob, setInitJob] = useState<{ jobId: string; status: string; progress: number; message: string } | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<{ path: string; name: string; isDir: boolean } | null>(null);
  const [showCreateInput, setShowCreateInput] = useState(false);
  const [createName, setCreateName] = useState('');
  const [actionMsg, setActionMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    loadHome();
  }, []);

  const loadHome = async () => {
    try {
      const home = await api.getHomeDirectory();
      setCurrentPath(home);
      setPathInput(home);
      await loadSuggestions(home);
      await loadDirectory(home);
    } catch (e) {
      console.error('Failed to load home:', e);
    }
  };

  const loadDirectory = async (path: string) => {
    setLoading(true);
    try {
      const data = await api.browseDirectory(path, 1);
      setEntries(data.entries || []);
      setCurrentPath(data.path);
      setPathInput(data.path);
    } catch (e: any) {
      console.error('Browse failed:', e.message);
    } finally {
      setLoading(false);
    }
  };

  const loadSuggestions = async (path: string) => {
    try {
      const data = await api.suggestWorkspaces(path);
      setSuggestions(data);
    } catch (e) {
      setSuggestions([]);
    }
  };

  const navigateTo = (path: string) => {
    setHistory(prev => [...prev, currentPath]);
    loadDirectory(path);
    loadSuggestions(path);
  };

  const goUp = () => {
    if (currentPath === '/') return;
    const parent = currentPath.split('/').slice(0, -1).join('/') || '/';
    navigateTo(parent);
  };

  const goBack = () => {
    if (history.length === 0) return;
    const prev = history[history.length - 1];
    setHistory(h => h.slice(0, -1));
    loadDirectory(prev);
    loadSuggestions(prev);
  };

  const handlePathSubmit = () => {
    if (pathInput.trim()) {
      navigateTo(pathInput.trim());
    }
  };

  const langIcon: Record<string, string> = {
    typescript: '🔷',
    javascript: '🟨',
    python: '🐍',
    go: '🔵',
    rust: '🦀',
    java: '☕',
    ruby: '💎',
    unknown: '📁',
  };

  // Cleanup polling on unmount
  useEffect(() => {
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // ---- File management handlers ----
  const handleCreate = async () => {
    if (!createName.trim()) return;
    try {
      await api.createEntry(currentPath, createName.trim(), true);
      setActionMsg({ type: 'ok', text: `已创建文件夹「${createName.trim()}」` });
      setShowCreateInput(false);
      setCreateName('');
      await loadDirectory(currentPath);
    } catch (e: any) {
      setActionMsg({ type: 'err', text: '创建失败: ' + (e.message || '未知错误') });
    }
  };

  const handleRename = async (oldPath: string) => {
    if (!renameValue.trim()) return;
    try {
      await api.renameEntry(oldPath, renameValue.trim());
      setActionMsg({ type: 'ok', text: `已重命名为「${renameValue.trim()}」` });
      setRenamingPath(null);
      setRenameValue('');
      await loadDirectory(currentPath);
    } catch (e: any) {
      setActionMsg({ type: 'err', text: '重命名失败: ' + (e.message || '未知错误') });
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await api.deleteEntry(deleteConfirm.path);
      setActionMsg({ type: 'ok', text: `已删除「${deleteConfirm.name}」` });
      setDeleteConfirm(null);
      await loadDirectory(currentPath);
    } catch (e: any) {
      setActionMsg({ type: 'err', text: '删除失败: ' + (e.message || '未知错误') });
    }
  };

  const startRename = (path: string, currentName: string) => {
    setRenamingPath(path);
    setRenameValue(currentName);
    setActionMsg(null);
  };

  const handleSelect = async (path: string, hasCognition?: boolean) => {
    // If project already has .cognition/, just load directly
    if (hasCognition) {
      onSelect(path);
      return;
    }
    // Otherwise: trigger initialization
    try {
      setInitJob({ jobId: '', status: 'starting', progress: 0, message: '正在启动初始化...' });
      const res = await api.initProject(path, false);
      const jobId = res.job_id;
      setInitJob({ jobId, status: 'starting', progress: 0, message: '正在启动...' });

      // Poll progress
      pollRef.current = setInterval(async () => {
        try {
          const status = await api.getInitStatus(jobId);
          setInitJob({ jobId, status: status.status, progress: status.progress, message: status.message });
          if (status.status === 'completed' || status.status === 'error') {
            if (pollRef.current) clearInterval(pollRef.current);
            pollRef.current = null;
            if (status.status === 'completed') {
              // Load the project into the graph
              setTimeout(() => onSelect(path), 500);
            }
          }
        } catch (e) {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setInitJob(prev => prev ? { ...prev, status: 'error', message: '进度查询失败' } : null);
        }
      }, 1000);
    } catch (e: any) {
      setInitJob({ jobId: '', status: 'error', progress: 0, message: '初始化启动失败: ' + e.message });
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-[720px] max-h-[80vh] bg-dark-900 border border-dark-700 rounded-xl shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-800">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            📁 选择工作区
          </h2>
          {onClose && (
            <button onClick={onClose} className="w-8 h-8 rounded-lg bg-dark-800 hover:bg-dark-700 text-dark-400 hover:text-white flex items-center justify-center transition-colors">
              ✕
            </button>
          )}
        </div>

        {/* Path bar */}
        <div className="px-6 py-3 border-b border-dark-800 flex items-center gap-2">
          <button onClick={goBack} disabled={history.length === 0} className="px-2 py-1 text-xs bg-dark-800 hover:bg-dark-700 text-dark-300 rounded disabled:opacity-30 transition-colors" title="后退">
            ←
          </button>
          <button onClick={goUp} className="px-2 py-1 text-xs bg-dark-800 hover:bg-dark-700 text-dark-300 rounded transition-colors" title="上级目录">
            ↑
          </button>
          <input
            type="text"
            value={pathInput}
            onChange={e => setPathInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handlePathSubmit()}
            className="flex-1 h-8 px-3 bg-dark-800 border border-dark-700 rounded-lg text-sm text-white focus:border-cognition-500 focus:outline-none transition-colors"
            placeholder="输入路径..."
          />
          <button onClick={handlePathSubmit} className="px-3 py-1.5 text-xs bg-cognition-600 hover:bg-cognition-500 text-white rounded-lg transition-colors">
            前往
          </button>
        </div>

        {/* View tabs */}
        <div className="flex px-6 gap-1 border-b border-dark-800">
          <button
            onClick={() => setView('suggest')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              view === 'suggest' ? 'text-cognition-400 border-cognition-400' : 'text-dark-400 border-transparent hover:text-dark-200'
            }`}
          >
            💡 推荐项目
          </button>
          <button
            onClick={() => setView('browse')}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              view === 'browse' ? 'text-cognition-400 border-cognition-400' : 'text-dark-400 border-transparent hover:text-dark-200'
            }`}
          >
            📂 浏览目录
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 min-h-[300px]">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-dark-400 text-sm">
              <span className="animate-spin mr-2">⟳</span> 加载中...
            </div>
          ) : view === 'suggest' ? (
            suggestions.length > 0 ? (
              <div className="space-y-2">
                {suggestions.map(s => (
                  <button
                    key={s.path}
                    onClick={() => handleSelect(s.path, s.has_cognition)}
                    className="w-full text-left p-4 bg-dark-800 hover:bg-dark-750 border border-dark-700 hover:border-cognition-600 rounded-lg transition-colors group"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{langIcon[s.language] || '📁'}</span>
                        <div>
                          <div className="text-sm font-medium text-white group-hover:text-cognition-300">{s.name}</div>
                          <div className="text-xs text-dark-500 mt-0.5">{s.path}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {s.has_cognition && (
                          <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-[10px]">
                            已初始化
                          </span>
                        )}
                        {s.reason && (
                          <span className="px-2 py-0.5 bg-dark-700 text-dark-400 rounded text-[10px]">
                            {s.reason}
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className="text-center py-12 text-dark-400 text-sm">
                当前目录下未发现项目
                <br />
                <span className="text-xs text-dark-500">试试切换到"浏览目录"手动查找</span>
              </div>
            )
          ) : (
            /* Browse view */
            <div className="space-y-1">
              {/* New folder button */}
              <div className="mb-2 flex items-center gap-2">
                {showCreateInput ? (
                  <div className="flex items-center gap-2 flex-1">
                    <span className="text-sm">📁</span>
                    <input
                      autoFocus
                      type="text"
                      value={createName}
                      onChange={e => setCreateName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setShowCreateInput(false); setCreateName(''); } }}
                      className="flex-1 h-7 px-2 bg-dark-800 border border-cognition-500 rounded text-sm text-white focus:outline-none"
                      placeholder="输入文件夹名称..."
                    />
                    <button onClick={handleCreate} className="px-2 py-1 text-xs bg-cognition-600 hover:bg-cognition-500 text-white rounded">创建</button>
                    <button onClick={() => { setShowCreateInput(false); setCreateName(''); }} className="px-2 py-1 text-xs bg-dark-700 hover:bg-dark-600 text-dark-300 rounded">取消</button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setShowCreateInput(true); setCreateName(''); setActionMsg(null); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-dark-800 hover:bg-dark-700 text-dark-300 hover:text-cognition-400 border border-dark-700 rounded-lg transition-colors"
                  >
                    <span>＋</span> 新建文件夹
                  </button>
                )}
                {actionMsg && (
                  <span className={`text-xs ${actionMsg.type === 'ok' ? 'text-green-400' : 'text-red-400'}`}>
                    {actionMsg.text}
                  </span>
                )}
              </div>

              {entries.length === 0 ? (
                <div className="text-center py-12 text-dark-400 text-sm">目录为空</div>
              ) : (
                entries.map(e => (
                  renamingPath === e.path ? (
                    /* Inline rename input */
                    <div key={e.path} className="px-3 py-2 rounded-lg bg-dark-800 flex items-center gap-2">
                      <span className="text-sm">{e.is_dir ? '📁' : '📄'}</span>
                      <input
                        autoFocus
                        type="text"
                        value={renameValue}
                        onChange={ev => setRenameValue(ev.target.value)}
                        onKeyDown={ev => { if (ev.key === 'Enter') handleRename(e.path); if (ev.key === 'Escape') setRenamingPath(null); }}
                        className="flex-1 h-7 px-2 bg-dark-700 border border-cognition-500 rounded text-sm text-white focus:outline-none"
                      />
                      <button onClick={() => handleRename(e.path)} className="px-2 py-1 text-xs bg-cognition-600 hover:bg-cognition-500 text-white rounded">确认</button>
                      <button onClick={() => setRenamingPath(null)} className="px-2 py-1 text-xs bg-dark-700 hover:bg-dark-600 text-dark-300 rounded">取消</button>
                    </div>
                  ) : (
                    /* Normal entry row */
                    <div
                      key={e.path}
                      className={`px-3 py-2 rounded-lg flex items-center gap-3 transition-colors group ${
                        e.is_dir
                          ? 'bg-dark-800 hover:bg-dark-750 cursor-pointer'
                          : 'bg-dark-900 cursor-default opacity-70'
                      }`}
                    >
                      <button
                        onClick={() => e.is_dir ? navigateTo(e.path) : undefined}
                        className="flex items-center gap-3 flex-1 min-w-0"
                      >
                        <span className="text-sm shrink-0">{e.is_dir ? '📁' : '📄'}</span>
                        <span className={`text-sm truncate ${e.is_dir ? 'text-dark-200 group-hover:text-cognition-300' : 'text-dark-400'}`}>
                          {e.name}
                        </span>
                      </button>
                      {!e.is_dir && (e.size ?? 0) > 0 && (
                        <span className="text-xs text-dark-600 shrink-0">
                          {(e.size ?? 0) > 1024 ? `${((e.size ?? 0) / 1024).toFixed(0)}KB` : `${e.size}B`}
                        </span>
                      )}
                      {/* Action buttons (hover) */}
                      <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={ev => { ev.stopPropagation(); startRename(e.path, e.name); }}
                          className="w-6 h-6 rounded flex items-center justify-center text-xs text-dark-400 hover:text-cognition-400 hover:bg-dark-700 transition-colors"
                          title="重命名"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={ev => { ev.stopPropagation(); setDeleteConfirm({ path: e.path, name: e.name, isDir: e.is_dir }); setActionMsg(null); }}
                          className="w-6 h-6 rounded flex items-center justify-center text-xs text-dark-400 hover:text-red-400 hover:bg-dark-700 transition-colors"
                          title="删除"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>
                  )
                ))
              )}
            </div>
          )}
        </div>

        {/* Footer: open current directory */}
        <div className="px-6 py-4 border-t border-dark-800 flex items-center justify-between">
          <div className="text-xs text-dark-500 truncate max-w-[400px]">
            当前: {currentPath}
          </div>
          <div className="flex items-center gap-3">
            {view === 'browse' && (
              <button
                onClick={() => handleSelect(currentPath)}
                className="px-4 py-2 text-sm bg-dark-800 hover:bg-dark-700 text-dark-300 hover:text-white rounded-lg border border-dark-700 transition-colors"
              >
                📂 打开此目录
              </button>
            )}
            <button
              onClick={() => handleSelect(currentPath)}
              className="px-5 py-2 text-sm bg-cognition-600 hover:bg-cognition-500 text-white rounded-lg font-medium transition-colors"
            >
              ✅ 选择当前目录
            </button>
          </div>
        </div>

        {/* Init progress overlay */}
        {initJob && (
          <div className="px-6 py-4 border-t border-cognition-800 bg-dark-850">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-dark-200">
                {initJob.status === 'completed' ? '✅' : initJob.status === 'error' ? '❌' : '⏳'}
                {' '}{initJob.message}
              </span>
              <span className="text-xs text-dark-400">{initJob.progress}%</span>
            </div>
            <div className="w-full h-2 bg-dark-700 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  initJob.status === 'error' ? 'bg-red-500' : initJob.status === 'completed' ? 'bg-green-500' : 'bg-cognition-500'
                }`}
                style={{ width: `${initJob.progress}%` }}
              />
            </div>
            {initJob.status === 'error' && (
              <button onClick={() => setInitJob(null)} className="mt-2 text-xs text-red-400 hover:text-red-300">关闭</button>
            )}
          </div>
        )}
      </div>

      {/* Delete confirmation dialog */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="w-[400px] bg-dark-900 border border-dark-700 rounded-xl shadow-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center text-lg">
                ⚠️
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">确认删除</h3>
                <p className="text-xs text-dark-400 mt-0.5">此操作不可撤销</p>
              </div>
            </div>
            <div className="mb-5 p-3 bg-dark-800 rounded-lg border border-dark-700">
              <div className="flex items-center gap-2">
                <span className="text-sm">{deleteConfirm.isDir ? '📁' : '📄'}</span>
                <span className="text-sm font-medium text-white">{deleteConfirm.name}</span>
              </div>
              <p className="text-xs text-dark-500 mt-1 truncate">{deleteConfirm.path}</p>
            </div>
            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 text-sm bg-dark-800 hover:bg-dark-700 text-dark-300 hover:text-white rounded-lg border border-dark-700 transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleDelete}
                className="px-5 py-2 text-sm bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition-colors"
              >
                🗑️ 确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WorkspaceSelector;
