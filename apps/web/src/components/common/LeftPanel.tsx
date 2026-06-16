import React, { useState } from 'react';
import { useGraphStore } from '../../stores/graphStore';
import FileTree from '../FileTree/FileTree';
import type { GraphNode } from '@cognition-ide/shared-types';

type PanelTab = 'modules' | 'files';

const LeftPanel: React.FC = () => {
  const { nodes, selectedNodeId, selectNode } = useGraphStore();
  const [activeTab, setActiveTab] = useState<PanelTab>('modules');
  const [filter, setFilter] = useState('');
  const [groupBy, setGroupBy] = useState<'type' | 'none'>('type');

  // Get project root path from graphStore
  const projectPath = useGraphStore(s => s.projectPath);

  // Group nodes by type
  const grouped = nodes.reduce<Record<string, GraphNode[]>>((acc, node) => {
    const key = groupBy === 'type' ? node.type : 'all';
    if (!acc[key]) acc[key] = [];
    acc[key].push(node);
    return acc;
  }, {});

  const filteredNodes = filter
    ? nodes.filter((n) => n.label.toLowerCase().includes(filter.toLowerCase()) || n.responsibility.toLowerCase().includes(filter.toLowerCase()))
    : nodes;

  const typeColors: Record<string, string> = {
    domain: 'bg-blue-500',
    infrastructure: 'bg-green-500',
    shared: 'bg-yellow-500',
    external: 'bg-gray-500',
  };

  const typeLabels: Record<string, string> = {
    domain: '🏢 业务模块',
    infrastructure: '🔧 基础设施',
    shared: '📦 共享模块',
    external: '🔗 外部依赖',
  };

  return (
    <div className="h-full flex flex-col bg-dark-900 border-r border-dark-800">
      {/* Tab bar */}
      <div className="flex border-b border-dark-800">
        <button
          onClick={() => setActiveTab('modules')}
          className={`flex-1 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'modules'
              ? 'text-cognition-400 border-cognition-400'
              : 'text-dark-400 border-transparent hover:text-dark-200'
          }`}
        >
          🧠 模块
        </button>
        <button
          onClick={() => setActiveTab('files')}
          className={`flex-1 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
            activeTab === 'files'
              ? 'text-cognition-400 border-cognition-400'
              : 'text-dark-400 border-transparent hover:text-dark-200'
          }`}
        >
          📂 文件
        </button>
      </div>

      {/* Modules tab */}
      {activeTab === 'modules' && (
        <>
          <div className="p-3 border-b border-dark-800">
            <input
              type="text"
              placeholder="🔍 搜索模块..."
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full h-7 px-2 text-xs bg-dark-800 rounded border border-dark-700 focus:border-cognition-500 focus:outline-none text-dark-200 placeholder-dark-500"
            />
            <div className="flex items-center gap-2 mt-2">
              <button
                onClick={() => setGroupBy(groupBy === 'type' ? 'none' : 'type')}
                className={`text-[10px] px-2 py-0.5 rounded ${groupBy === 'type' ? 'bg-cognition-600 text-white' : 'bg-dark-800 text-dark-400'}`}
              >
                按类型分组
              </button>
              <span className="text-[10px] text-dark-500">{nodes.length} 模块</span>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {groupBy === 'type' ? (
              Object.entries(grouped).map(([groupType, groupNodes]) => (
                <div key={groupType} className="mb-2">
                  <div className="text-[10px] text-dark-500 uppercase font-medium mb-1 px-1">
                    {typeLabels[groupType] || groupType} ({groupNodes.length})
                  </div>
                  {groupNodes
                    .filter((n) => !filter || n.label.toLowerCase().includes(filter.toLowerCase()))
                    .map((node) => (
                      <NodeItem
                        key={node.id}
                        node={node}
                        isSelected={selectedNodeId === node.id}
                        onClick={() => selectNode(node.id)}
                        colorClass={typeColors[node.type] || 'bg-gray-500'}
                      />
                    ))}
                </div>
              ))
            ) : (
              filteredNodes.map((node) => (
                <NodeItem
                  key={node.id}
                  node={node}
                  isSelected={selectedNodeId === node.id}
                  onClick={() => selectNode(node.id)}
                  colorClass={typeColors[node.type] || 'bg-gray-500'}
                />
              ))
            )}
          </div>
        </>
      )}

      {/* Files tab */}
      {activeTab === 'files' && (
        <div className="flex-1 overflow-hidden">
          <FileTree rootPath={projectPath || ''} />
        </div>
      )}
    </div>
  );
};

interface NodeItemProps {
  node: GraphNode;
  isSelected: boolean;
  onClick: () => void;
  colorClass: string;
}

const NodeItem: React.FC<NodeItemProps> = ({ node, isSelected, onClick, colorClass }) => {
  return (
    <div
      onClick={onClick}
      className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-xs transition-colors ${
        isSelected
          ? 'bg-cognition-600/30 text-cognition-200 border border-cognition-500/50'
          : 'hover:bg-dark-800 text-dark-300 border border-transparent'
      }`}
    >
      <div className={`w-2 h-2 rounded-full shrink-0 ${colorClass}`} />
      <span className="truncate font-medium">{node.label}</span>
      {node.status === 'pending_review' && (
        <span className="ml-auto text-[10px] text-orange-400">●</span>
      )}
      {!node.verified && (
        <span className="ml-auto text-[10px] text-dark-500">✓?</span>
      )}
    </div>
  );
};

export default LeftPanel;
