import React, { useState, useMemo } from 'react';
import type { CognitionNode, InterfaceDef, Risk } from '@cognition-ide/shared-types';

interface CognitionDiffProps {
  before: Partial<CognitionNode>;
  after: Partial<CognitionNode>;
  codeDiff?: string;
  onApproveCognition: () => void;
  onApproveAll: () => void;
  onReject: () => void;
  onRequestExplanation: (field: string) => void;
}

type Column = 'before' | 'after' | 'code';
type ChangeType = 'added' | 'removed' | 'modified' | 'unchanged';

interface DiffEntry {
  field: string;
  label: string;
  changeType: ChangeType;
  beforeValue: string;
  afterValue: string;
  detail?: React.ReactNode;
}

const CognitionDiff: React.FC<CognitionDiffProps> = ({
  before,
  after,
  codeDiff,
  onApproveCognition,
  onApproveAll,
  onReject,
  onRequestExplanation,
}) => {
  const [activeColumn, setActiveColumn] = useState<Column>('after');
  const [expandedField, setExpandedField] = useState<string | null>(null);

  // Build diff entries by comparing before/after
  const diffEntries = useMemo<DiffEntry[]>(() => {
    const entries: DiffEntry[] = [];

    // Responsibility
    const bResp = before.responsibility?.summary || '';
    const aResp = after.responsibility?.summary || '';
    if (bResp !== aResp) {
      entries.push({
        field: 'responsibility',
        label: '📋 职责描述',
        changeType: bResp && aResp ? 'modified' : aResp ? 'added' : 'removed',
        beforeValue: bResp || '(空)',
        afterValue: aResp || '(空)',
      });
    }

    // Interfaces
    const bIfaces = before.interfaces || [];
    const aIfaces = after.interfaces || [];
    const ifaceAdded = aIfaces.filter(a => !bIfaces.some(b => b.name === a.name));
    const ifaceRemoved = bIfaces.filter(b => !aIfaces.some(a => a.name === b.name));
    const ifaceModified = aIfaces.filter(a => {
      const b = bIfaces.find(bb => bb.name === a.name);
      return b && (b.signature !== a.signature || b.access !== a.access);
    });

    if (ifaceAdded.length || ifaceRemoved.length || ifaceModified.length) {
      entries.push({
        field: 'interfaces',
        label: '📋 接口',
        changeType: ifaceRemoved.length ? 'modified' : 'added',
        beforeValue: `${bIfaces.length} 个`,
        afterValue: `${aIfaces.length} 个`,
        detail: (
          <div className="space-y-1 mt-1">
            {ifaceAdded.map((iface, i) => (
              <InterfaceRow key={`add-${i}`} iface={iface} type="added" />
            ))}
            {ifaceModified.map((iface, i) => (
              <InterfaceRow key={`mod-${i}`} iface={iface} type="modified" />
            ))}
            {ifaceRemoved.map((iface, i) => (
              <InterfaceRow key={`rem-${i}`} iface={iface} type="removed" />
            ))}
          </div>
        ),
      });
    }

    // Dependencies
    const bDeps = before.dependencies || [];
    const aDeps = after.dependencies || [];
    const depAdded = aDeps.filter(a => !bDeps.some(b => b.node_id === a.node_id));
    const depRemoved = bDeps.filter(b => !aDeps.some(a => a.node_id === b.node_id));
    if (depAdded.length || depRemoved.length) {
      entries.push({
        field: 'dependencies',
        label: '🔗 依赖',
        changeType: depRemoved.length ? 'modified' : 'added',
        beforeValue: `${bDeps.length} 个`,
        afterValue: `${aDeps.length} 个`,
        detail: (
          <div className="space-y-0.5 mt-1">
            {depAdded.map((d, i) => (
              <div key={`da-${i}`} className="text-[10px] text-green-400">+ {d.node_id}: {d.used_for}</div>
            ))}
            {depRemoved.map((d, i) => (
              <div key={`dr-${i}`} className="text-[10px] text-red-400">− {d.node_id}: {d.used_for}</div>
            ))}
          </div>
        ),
      });
    }

    // Risks
    const bRisks = before.risks || [];
    const aRisks = after.risks || [];
    const riskAdded = aRisks.filter(a => !bRisks.some(b => b.id === a.id));
    const riskRemoved = bRisks.filter(b => !aRisks.some(a => a.id === b.id));
    if (riskAdded.length || riskRemoved.length) {
      entries.push({
        field: 'risks',
        label: '⚠️ 风险',
        changeType: 'modified',
        beforeValue: `${bRisks.length} 个`,
        afterValue: `${aRisks.length} 个`,
        detail: (
          <div className="space-y-0.5 mt-1">
            {riskAdded.map((r, i) => (
              <RiskRow key={`ra-${i}`} risk={r} type="added" />
            ))}
            {riskRemoved.map((r, i) => (
              <RiskRow key={`rr-${i}`} risk={r} type="removed" />
            ))}
          </div>
        ),
      });
    }

    // Decisions
    const bDecisions = before.decisions || [];
    const aDecisions = after.decisions || [];
    const decAdded = aDecisions.filter(a => !bDecisions.some(b => b.id === a.id));
    if (decAdded.length) {
      entries.push({
        field: 'decisions',
        label: '📝 决策',
        changeType: 'added',
        beforeValue: `${bDecisions.length} 个`,
        afterValue: `${aDecisions.length} 个`,
        detail: (
          <div className="space-y-0.5 mt-1">
            {decAdded.map((d, i) => (
              <div key={`dc-${i}`} className="text-[10px] text-blue-400">+ {d.title}: {d.decision}</div>
            ))}
          </div>
        ),
      });
    }

    // If no changes detected, add an "unchanged" entry
    if (entries.length === 0) {
      entries.push({
        field: 'none',
        label: '无变更',
        changeType: 'unchanged',
        beforeValue: '—',
        afterValue: '—',
      });
    }

    return entries;
  }, [before, after]);

  const changeTypeStyle: Record<ChangeType, string> = {
    added: 'text-green-400 bg-green-500/10',
    removed: 'text-red-400 bg-red-500/10',
    modified: 'text-yellow-400 bg-yellow-500/10',
    unchanged: 'text-gray-500 bg-gray-500/5',
  };

  const changeTypeLabel: Record<ChangeType, string> = {
    added: '新增',
    removed: '删除',
    modified: '修改',
    unchanged: '无变更',
  };

  const totalChanges = diffEntries.filter(e => e.changeType !== 'unchanged').length;

  return (
    <div className="h-full flex flex-col">
      {/* Header with column switcher + action buttons */}
      <div className="px-3 py-2 border-b border-gray-800 flex items-center justify-between shrink-0">
        <h3 className="text-xs font-medium text-[#a78bfa]">📊 认知差异对比</h3>
        <div className="flex items-center gap-2">
          {/* Column tabs */}
          <div className="flex bg-[#111827] rounded overflow-hidden text-[10px]">
            {(['before', 'after', 'code'] as Column[]).map((col) => (
              <button
                key={col}
                onClick={() => setActiveColumn(col)}
                className={`px-2 py-0.5 transition-colors ${
                  activeColumn === col
                    ? col === 'before' ? 'bg-gray-700 text-gray-200'
                      : col === 'after' ? 'bg-[#a78bfa]/30 text-[#c4b5fd]'
                        : 'bg-green-600/30 text-green-300'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {col === 'before' ? '修改前' : col === 'after' ? '修改后' : '代码 Diff'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Change summary badge */}
      <div className="px-3 py-1.5 bg-[#111827] border-b border-gray-800 flex items-center justify-between shrink-0 text-[10px]">
        <span className="text-gray-500">
          {totalChanges > 0
            ? `${totalChanges} 项变更`
            : '无变更检测'}
        </span>
        <div className="flex gap-1">
          {diffEntries.filter(e => e.changeType !== 'unchanged').map((entry) => (
            <span key={entry.field} className={`px-1.5 rounded ${changeTypeStyle[entry.changeType]}`}>
              {changeTypeLabel[entry.changeType]}
            </span>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {/* Before column */}
        {activeColumn === 'before' && (
          <div className="space-y-2">
            {diffEntries.map((entry) => (
              <DiffFieldCard
                key={entry.field}
                entry={entry}
                side="before"
                expanded={expandedField === entry.field}
                onToggle={() => setExpandedField(expandedField === entry.field ? null : entry.field)}
              />
            ))}
          </div>
        )}

        {/* After column (with diff highlights) */}
        {activeColumn === 'after' && (
          <div className="space-y-2">
            {diffEntries.map((entry) => (
              <DiffFieldCard
                key={entry.field}
                entry={entry}
                side="after"
                expanded={expandedField === entry.field}
                onToggle={() => setExpandedField(expandedField === entry.field ? null : entry.field)}
              />
            ))}
          </div>
        )}

        {/* Code diff column */}
        {activeColumn === 'code' && (
          <div>
            {codeDiff ? (
              <pre className="text-[11px] font-mono leading-relaxed whitespace-pre-wrap bg-[#0a0e1a] p-3 rounded-lg border border-gray-800 overflow-x-auto">
                {codeDiff.split('\n').map((line, i) => {
                  let cls = 'text-gray-400';
                  if (line.startsWith('+') && !line.startsWith('+++')) cls = 'text-green-400 bg-green-500/5';
                  else if (line.startsWith('-') && !line.startsWith('---')) cls = 'text-red-400 bg-red-500/5';
                  else if (line.startsWith('@@')) cls = 'text-[#a78bfa]';
                  else if (line.startsWith('diff') || line.startsWith('---') || line.startsWith('+++')) cls = 'text-gray-600 font-medium';
                  return (
                    <div key={i} className={`${cls} px-1 -mx-1`}>
                      {line || ' '}
                    </div>
                  );
                })}
              </pre>
            ) : (
              <div className="text-center text-gray-600 py-8">
                <div className="text-2xl mb-2">📄</div>
                <p className="text-xs">暂无代码差异</p>
                <p className="text-[10px] mt-1">AI 将在认知确认后生成代码变更</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Action bar */}
      {totalChanges > 0 && (
        <div className="px-3 py-2 border-t border-gray-800 flex items-center justify-between shrink-0">
          <button
            onClick={() => {
              const field = expandedField || diffEntries.find(e => e.changeType !== 'unchanged')?.field;
              if (field) onRequestExplanation(field);
            }}
            className="text-[10px] text-gray-500 hover:text-gray-300 flex items-center gap-1"
          >❓ 为什么</button>
          <div className="flex gap-2">
            <button
              onClick={onReject}
              className="text-[10px] px-3 py-1.5 bg-red-500/20 text-red-400 rounded-md hover:bg-red-500/30 transition-colors"
            >✕ 拒绝</button>
            <button
              onClick={onApproveCognition}
              className="text-[10px] px-3 py-1.5 bg-[#a78bfa]/20 text-[#a78bfa] rounded-md hover:bg-[#a78bfa]/30 transition-colors"
            >✓ 认知</button>
            <button
              onClick={onApproveAll}
              className="text-[10px] px-3 py-1.5 bg-green-500/20 text-green-400 rounded-md hover:bg-green-500/30 transition-colors"
            >✓ 全部</button>
          </div>
        </div>
      )}
    </div>
  );
};

// ---- Sub-components ----

const DiffFieldCard: React.FC<{
  entry: DiffEntry;
  side: 'before' | 'after';
  expanded: boolean;
  onToggle: () => void;
}> = ({ entry, side, expanded, onToggle }) => {
  const borderColor: Record<ChangeType, string> = {
    added: 'border-green-500/30',
    removed: 'border-red-500/30',
    modified: 'border-yellow-500/30',
    unchanged: 'border-gray-800',
  };

  const value = side === 'before' ? entry.beforeValue : entry.afterValue;

  return (
    <div className={`rounded-lg border ${borderColor[entry.changeType]} bg-[#111827] overflow-hidden`}>
      <button
        onClick={onToggle}
        className="w-full px-3 py-2 flex items-center justify-between text-left hover:bg-[#1e293b] transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-300">{entry.label}</span>
          {entry.changeType !== 'unchanged' && (
            <span className={`text-[9px] px-1 rounded ${
              entry.changeType === 'added' ? 'bg-green-500/20 text-green-400' :
              entry.changeType === 'removed' ? 'bg-red-500/20 text-red-400' :
              'bg-yellow-500/20 text-yellow-400'
            }`}>
              {entry.changeType === 'added' ? '+' : entry.changeType === 'removed' ? '−' : '~'}
            </span>
          )}
        </div>
        <span className="text-[10px] text-gray-500 truncate max-w-[120px]">{value}</span>
      </button>

      {expanded && (
        <div className="px-3 pb-2 text-xs">
          <div className={`p-2 rounded ${
            side === 'before' ? 'bg-gray-800/50 text-gray-400' : 'bg-[#1e293b] text-gray-300'
          }`}>
            {side === 'before' ? (
              <div className="whitespace-pre-wrap">{entry.beforeValue}</div>
            ) : (
              <div>
                <div className="whitespace-pre-wrap">{entry.afterValue}</div>
                {entry.detail}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

const InterfaceRow: React.FC<{ iface: InterfaceDef; type: 'added' | 'modified' | 'removed' }> = ({ iface, type }) => {
  const color = type === 'added' ? 'text-green-400' : type === 'removed' ? 'text-red-400' : 'text-yellow-400';
  const prefix = type === 'added' ? '+' : type === 'removed' ? '−' : '~';
  const accessColor = iface.access === 'public' ? 'text-blue-400' : iface.access === 'private' ? 'text-red-400' : 'text-yellow-400';

  return (
    <div className={`text-[10px] ${color} flex items-center gap-1.5`}>
      <span>{prefix}</span>
      <span className="font-mono">{iface.name}</span>
      <span className={`text-[8px] ${accessColor}`}>({iface.access})</span>
      {iface.signature && (
        <span className="text-gray-600 truncate flex-1 text-[9px]">{iface.signature}</span>
      )}
    </div>
  );
};

const RiskRow: React.FC<{ risk: Risk; type: 'added' | 'removed' }> = ({ risk, type }) => {
  const color = type === 'added' ? 'text-orange-400' : 'text-gray-500';
  const prefix = type === 'added' ? '+' : '−';
  const levelColor = risk.level === 'high' ? 'text-red-400' : risk.level === 'medium' ? 'text-yellow-400' : 'text-green-400';

  return (
    <div className={`text-[10px] ${color} flex items-center gap-1.5`}>
      <span>{prefix}</span>
      <span>{risk.title}</span>
      <span className={`text-[8px] ${levelColor}`}>({risk.level})</span>
    </div>
  );
};

export default CognitionDiff;
