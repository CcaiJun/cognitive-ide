import React, { useState } from 'react';
import CognitionCard from '../CognitionCard/CognitionCard';
import ImpactPreview from '../ImpactPreview/ImpactPreview';
import AIPanel from '../AIPanel/AIPanel';
import CognitionDiff from '../CognitionDiff/CognitionDiff';
import { useGraphStore } from '../../stores/graphStore';
import { useCognitionStore } from '../../stores/cognitionStore';
import { useAIStore } from '../../stores/aiStore';

type Tab = 'cognition' | 'impact' | 'ai';

const RightPanel: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('cognition');
  const { selectedNodeId, currentProject } = useGraphStore();
  const { currentNode, showImpactPreview } = useCognitionStore();
  const { requestStatus, cognitionDraft, executeChanges, currentRequestId } = useAIStore();

  // Load cognition data when a node is selected
  React.useEffect(() => {
    if (selectedNodeId && currentProject) {
      useCognitionStore.getState().loadCognitionNode(selectedNodeId, currentProject);
    }
  }, [selectedNodeId, currentProject]);

  // Auto-switch to impact tab when preview is shown
  React.useEffect(() => {
    if (showImpactPreview) setActiveTab('impact');
  }, [showImpactPreview]);

  // Auto-switch to AI tab when request is in progress
  React.useEffect(() => {
    if (requestStatus === 'cognition_draft_ready' || requestStatus === 'loading') {
      setActiveTab('ai');
    }
  }, [requestStatus]);

  const tabs: { key: Tab; label: string; icon: string; badge?: number }[] = [
    { key: 'cognition', label: '认知卡片', icon: '🧠' },
    { key: 'impact', label: '影响半径', icon: '🔴' },
    { key: 'ai', label: 'AI 助手', icon: '🤖', badge: requestStatus !== 'idle' ? 1 : undefined },
  ];

  return (
    <div className="h-full flex flex-col bg-[#0f1729] border-l border-gray-800">
      {/* Tab bar */}
      <div className="flex border-b border-gray-800 shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-2 text-xs font-medium transition-colors relative ${
              activeTab === tab.key
                ? 'text-[#c4b5fd] border-b-2 border-[#a78bfa] bg-[#111827]/50'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <span className="mr-1">{tab.icon}</span>
            {tab.label}
            {tab.badge && (
              <span className="absolute top-1 right-2 w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'cognition' && (
          <div className="h-full overflow-y-auto p-3">
            {selectedNodeId && currentNode ? (
              <CognitionCard node={currentNode} />
            ) : (
              <div className="text-center text-gray-500 text-sm py-8">
                <div className="text-3xl mb-2">🧠</div>
                <p>点击图谱中的模块节点</p>
                <p className="text-xs mt-1">查看认知卡片</p>
              </div>
            )}
          </div>
        )}

        {activeTab === 'impact' && (
          <div className="h-full overflow-y-auto p-3">
            <ImpactPreview />
          </div>
        )}

        {activeTab === 'ai' && (
          <div className="h-full flex flex-col">
            {/* Show CognitionDiff when draft is ready */}
            {requestStatus === 'cognition_draft_ready' && cognitionDraft && currentNode ? (
              <div className="flex-1 overflow-hidden">
                <CognitionDiff
                  before={currentNode}
                  after={{
                    ...currentNode,
                    responsibility: cognitionDraft.responsibility_change
                      ? { ...currentNode.responsibility, summary: cognitionDraft.responsibility_change }
                      : currentNode.responsibility,
                    interfaces: [
                      ...(currentNode.interfaces || []),
                      ...(cognitionDraft.interfaces_added || []),
                    ],
                    risks: [
                      ...(currentNode.risks || []),
                      ...(cognitionDraft.risks_added || []),
                    ],
                    decisions: [
                      ...(currentNode.decisions || []),
                      ...(cognitionDraft.decisions_added || []),
                    ],
                  }}
                  onApproveCognition={() => {
                    if (currentRequestId) executeChanges(currentRequestId, true, false, 'feat: AI cognition update');
                  }}
                  onApproveAll={() => {
                    if (currentRequestId) executeChanges(currentRequestId, true, true, 'feat: AI-generated changes');
                  }}
                  onReject={() => {
                    useAIStore.setState({ requestStatus: 'idle', currentRequestId: null, cognitionDraft: null });
                  }}
                  onRequestExplanation={(field) => {
                    useAIStore.getState().sendMessage(
                      `请解释为什么需要修改"${field}"字段`,
                      selectedNodeId || undefined
                    );
                  }}
                />
              </div>
            ) : (
              <div className="flex-1 overflow-hidden">
                <AIPanel />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default RightPanel;