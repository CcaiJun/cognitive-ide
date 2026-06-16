import React, { useEffect, useState, useCallback } from 'react';
import { api } from '../../lib/api';
import { useEditorStore } from '../../stores/editorStore';

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: TreeNode[];
  size?: number;
  language?: string;
}

interface Props {
  rootPath: string;
}

// File icon mapping by extension
const fileIcon = (name: string): string => {
  const ext = name.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    ts: '🔷', tsx: '⚛️', js: '🟨', jsx: '⚛️', py: '🐍', go: '🔵', rs: '🦀',
    java: '☕', rb: '💎', php: '🐘', c: '⚙️', cpp: '⚙️', h: '⚙️',
    json: '📋', yaml: '📋', yml: '📋', toml: '📋',
    md: '📝', txt: '📄', log: '📄',
    html: '🌐', css: '🎨', scss: '🎨', less: '🎨',
    sql: '🗃️', sh: '⚡', bash: '⚡',
    vue: '💚', svelte: '🧡',
    svg: '🖼️', png: '🖼️', jpg: '🖼️', gif: '🖼️',
    lock: '🔒', env: '🔐', gitignore: '🙈',
    Dockerfile: '🐳', dockerfile: '🐳',
  };
  return map[ext] || '📄';
};

const dirIcon = (isOpen: boolean): string => isOpen ? '📂' : '📁';

// Tree node component (recursive)
const TreeNodeView: React.FC<{
  node: TreeNode;
  depth: number;
  onFileClick: (path: string) => void;
}> = ({ node, depth, onFileClick }) => {
  const [isOpen, setIsOpen] = useState(depth < 1);

  const handleClick = () => {
    if (node.type === 'directory') {
      setIsOpen(!isOpen);
    } else {
      onFileClick(node.path);
    }
  };

  return (
    <div>
      <div
        onClick={handleClick}
        className="flex items-center gap-1.5 py-1 px-2 rounded cursor-pointer hover:bg-dark-800 group transition-colors"
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
      >
        {/* Arrow for directories */}
        {node.type === 'directory' ? (
          <span className={`text-[10px] text-dark-500 w-3 transition-transform ${isOpen ? 'rotate-90' : ''}`}>
            ▶
          </span>
        ) : (
          <span className="w-3" />
        )}
        {/* Icon */}
        <span className="text-xs shrink-0">
          {node.type === 'directory' ? dirIcon(isOpen) : fileIcon(node.name)}
        </span>
        {/* Name */}
        <span className={`text-xs truncate ${node.type === 'directory' ? 'text-dark-200 font-medium' : 'text-dark-400 group-hover:text-dark-200'}`}>
          {node.name}
        </span>
        {/* Size for files */}
        {node.type === 'file' && (node.size ?? 0) > 0 && (
          <span className="text-[10px] text-dark-600 ml-auto shrink-0 hidden group-hover:inline">
            {(node.size ?? 0) > 1024 ? `${((node.size ?? 0) / 1024).toFixed(0)}KB` : `${node.size}B`}
          </span>
        )}
      </div>
      {/* Children */}
      {node.type === 'directory' && isOpen && node.children && (
        <div>
          {node.children.map(child => (
            <TreeNodeView key={child.path} node={child} depth={depth + 1} onFileClick={onFileClick} />
          ))}
        </div>
      )}
    </div>
  );
};

// Main FileTree component
const FileTree: React.FC<Props> = ({ rootPath }) => {
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openFile = useEditorStore(s => s.openFile);

  const loadTree = useCallback(async () => {
    if (!rootPath) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getFileTree(rootPath, 4);
      setTree(data);
    } catch (e: any) {
      setError(e.message || 'Failed to load file tree');
    } finally {
      setLoading(false);
    }
  }, [rootPath]);

  useEffect(() => {
    loadTree();
  }, [loadTree]);

  const handleFileClick = (path: string) => {
    openFile(path);
  };

  if (!rootPath) {
    return (
      <div className="flex items-center justify-center h-full text-dark-500 text-xs">
        请先选择项目文件夹
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-dark-500 text-xs">
        <span className="animate-spin mr-2">⟳</span> 加载文件树...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2">
        <span className="text-red-400 text-xs">{error}</span>
        <button onClick={loadTree} className="text-xs text-cognition-400 hover:text-cognition-300">重试</button>
      </div>
    );
  }

  if (!tree || !tree.children || tree.children.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-dark-500 text-xs">
        目录为空
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto py-1">
      {/* Root label */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold text-dark-300">
        <span>📁</span>
        <span className="uppercase tracking-wider">{tree.name}</span>
      </div>
      {/* Tree */}
      {tree.children.map(child => (
        <TreeNodeView key={child.path} node={child} depth={0} onFileClick={handleFileClick} />
      ))}
    </div>
  );
};

export default FileTree;
