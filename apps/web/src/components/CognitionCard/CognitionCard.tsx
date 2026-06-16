import React, { useState } from 'react';
import type { CognitionNode } from '@cognition-ide/shared-types';
import { useCognitionStore } from '../../stores/cognitionStore';
import { useGraphStore } from '../../stores/graphStore';

interface CognitionCardProps {
  node: CognitionNode;
}

const CognitionCard: React.FC<CognitionCardProps> = ({ node }) => {
  const [expandedSection, setExpandedSection] = useState<string | null>('interfaces');
  const { verifyNode, loadImpactRadius } = useCognitionStore();
  const { currentProject } = useGraphStore();

  const healthColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 50) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const riskLevelColor = (level: string) => {
    if (level === 'high') return 'text-red-400 bg-red-500/10';
    if (level === 'medium') return 'text-yellow-400 bg-yellow-500/10';
    return 'text-green-400 bg-green-500/10';
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-cognition-500" />
            <h3 className="text-sm font-semibold text-cognition-200">{node.node_id}</h3>
          </div>
          <p className="text-xs text-dark-400 mt-1 leading-relaxed">
            {node.responsibility?.summary || 'No description'}
          </p>
        </div>
        <button
          onClick={() => verifyNode(node.node_id, currentProject || '', 'developer')}
          className={`text-[10px] px-2 py-0.5 rounded ${
            node.human_verified
              ? 'bg-green-500/20 text-green-400'
              : 'bg-dark-800 text-dark-400 hover:bg-dark-700'
          }`}
        >
          {node.human_verified ? '✓ Verified' : '✓? Unverified'}
        </button>
      </div>

      {/* Health bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between text-[10px]">
          <span className="text-dark-400">健康度</span>
          <span className="text-dark-300">{node.testing?.coverage_percent || 0}%</span>
        </div>
        <div className="h-1.5 bg-dark-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${healthColor(node.testing?.coverage_percent || 0)}`}
            style={{ width: `${node.testing?.coverage_percent || 0}%` }}
          />
        </div>
        <div className="flex items-center justify-between text-[10px] text-dark-500">
          <span>Lines: {node.lines}</span>
          <span>Language: {node.language}</span>
        </div>
      </div>

      {/* Interfaces */}
      <CollapsibleSection
        title="📋 接口"
        count={node.interfaces?.length || 0}
        expanded={expandedSection === 'interfaces'}
        onToggle={() => setExpandedSection(expandedSection === 'interfaces' ? null : 'interfaces')}
      >
        {node.interfaces?.map((iface, i) => (
          <div key={i} className="py-1.5 border-b border-dark-800/50 last:border-0">
            <div className="flex items-center gap-2">
              <span className={`text-[9px] px-1 rounded ${
                iface.access === 'public' ? 'bg-blue-500/20 text-blue-400' :
                iface.access === 'private' ? 'bg-red-500/20 text-red-400' :
                'bg-yellow-500/20 text-yellow-400'
              }`}>
                {iface.access}
              </span>
              <span className="text-xs font-mono text-cognition-300">{iface.name}</span>
            </div>
            <div className="text-[10px] text-dark-500 font-mono mt-0.5 truncate">{iface.signature}</div>
            {iface.side_effects?.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {iface.side_effects.map((se, j) => (
                  <span key={j} className="text-[9px] px-1 bg-orange-500/10 text-orange-400 rounded">
                    {se}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </CollapsibleSection>

      {/* Dependencies */}
      <CollapsibleSection
        title="🔗 依赖"
        count={node.dependencies?.length || 0}
        expanded={expandedSection === 'dependencies'}
        onToggle={() => setExpandedSection(expandedSection === 'dependencies' ? null : 'dependencies')}
      >
        {node.dependencies?.map((dep, i) => (
          <div key={i} className="flex items-center gap-2 py-1">
            <span className={`w-1.5 h-1.5 rounded-full ${dep.required ? 'bg-red-400' : 'bg-dark-500'}`} />
            <span className="text-xs text-dark-300">{dep.node_id}</span>
            <span className="text-[10px] text-dark-500 truncate">{dep.used_for}</span>
          </div>
        ))}
      </CollapsibleSection>

      {/* Risks */}
      <CollapsibleSection
        title="⚠️ 风险"
        count={node.risks?.length || 0}
        expanded={expandedSection === 'risks'}
        onToggle={() => setExpandedSection(expandedSection === 'risks' ? null : 'risks')}
      >
        {node.risks?.map((risk, i) => (
          <div key={i} className="py-1.5 border-b border-dark-800/50 last:border-0">
            <div className="flex items-center gap-2">
              <span className={`text-[9px] px-1.5 py-0.5 rounded ${riskLevelColor(risk.level)}`}>
                {risk.level}
              </span>
              <span className="text-xs text-dark-200">{risk.title}</span>
            </div>
            <p className="text-[10px] text-dark-500 mt-1">{risk.description}</p>
            {risk.mitigation && (
              <p className="text-[10px] text-green-400/70 mt-0.5">💡 {risk.mitigation}</p>
            )}
          </div>
        ))}
      </CollapsibleSection>

      {/* Decisions */}
      <CollapsibleSection
        title="📝 决策日志"
        count={node.decisions?.length || 0}
        expanded={expandedSection === 'decisions'}
        onToggle={() => setExpandedSection(expandedSection === 'decisions' ? null : 'decisions')}
      >
        {node.decisions?.map((dec, i) => (
          <div key={i} className="py-1.5 border-b border-dark-800/50 last:border-0">
            <div className="text-xs text-dark-200 font-medium">{dec.title}</div>
            <div className="text-[10px] text-dark-500 mt-0.5">
              <span className="text-dark-400">背景:</span> {dec.context}
            </div>
            <div className="text-[10px] text-cognition-400 mt-0.5">
              <span className="text-dark-400">决策:</span> {dec.decision}
            </div>
          </div>
        ))}
      </CollapsibleSection>

      {/* Testing */}
      {node.testing && (
        <div className="px-1">
          <div className="text-[10px] text-dark-500 flex items-center justify-between">
            <span>🧪 测试覆盖: {node.testing.coverage_percent}%</span>
            <span>{node.testing.test_files?.length || 0} files</span>
          </div>
          {node.testing.uncovered_cases?.length > 0 && (
            <div className="mt-1">
              {node.testing.uncovered_cases.map((uc, i) => (
                <div key={i} className="text-[10px] text-orange-400/70 py-0.5">• {uc}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2 pt-2 border-t border-dark-800">
        <button
          onClick={() => loadImpactRadius(node.node_id)}
          className="flex-1 py-1.5 text-xs bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition-colors"
        >
          🔴 影响半径
        </button>
        <button className="flex-1 py-1.5 text-xs bg-cognition-500/10 text-cognition-400 rounded hover:bg-cognition-500/20 transition-colors">
          🤖 AI 分析
        </button>
      </div>
    </div>
  );
};

// Collapsible section component
interface CollapsibleSectionProps {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

const CollapsibleSection: React.FC<CollapsibleSectionProps> = ({ title, count, expanded, onToggle, children }) => (
  <div className="border border-dark-800 rounded-lg overflow-hidden">
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between px-3 py-2 text-xs hover:bg-dark-800/50 transition-colors"
    >
      <span className="text-dark-300 font-medium">
        {title} <span className="text-dark-500">({count})</span>
      </span>
      <span className="text-dark-500 text-[10px]">{expanded ? '▼' : '▶'}</span>
    </button>
    {expanded && (
      <div className="px-3 pb-2 panel-slide-in">
        {children}
      </div>
    )}
  </div>
);

export default CognitionCard;