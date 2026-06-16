import React from 'react';
import { useGraphStore } from '../../stores/graphStore';
import { useCognitionStore } from '../../stores/cognitionStore';

const StatusBar: React.FC = () => {
  const { currentProject, nodes, unverifiedChanges } = useGraphStore();
  const { currentNode } = useCognitionStore();

  return (
    <footer className="h-6 flex items-center justify-between px-3 bg-dark-900 border-t border-dark-800 text-[10px] text-dark-500 shrink-0">
      {/* Left */}
      <div className="flex items-center gap-4">
        <span>项目: {currentProject || '未加载'}</span>
        <span>认知节点: {nodes.length}</span>
        {unverifiedChanges > 0 && (
          <span className="text-orange-400">待审核: {unverifiedChanges}</span>
        )}
      </div>

      {/* Center */}
      <div className="flex items-center gap-4">
        {currentNode && (
          <span className="text-cognition-400">
            当前: {currentNode.node_id} — {currentNode.responsibility?.summary || ''}
          </span>
        )}
      </div>

      {/* Right */}
      <div className="flex items-center gap-4">
        <span>Cognitive IDE v0.1.0-alpha</span>
      </div>
    </footer>
  );
};

export default StatusBar;