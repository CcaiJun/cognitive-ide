import React, { useEffect, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import NavBar from './components/common/NavBar';
import LeftPanel from './components/common/LeftPanel';
import GalaxyGraph from './components/GalaxyGraph/GalaxyGraph';
import CodeViewer from './components/CodeViewer/CodeViewer';
import RightPanel from './components/common/RightPanel';
import StatusBar from './components/common/StatusBar';
import SettingsPage from './components/Settings/SettingsPage';
import WorkspaceSelector from './components/Workspace/WorkspaceSelector';
import { useGraphStore } from './stores/graphStore';
import { useEditorStore } from './stores/editorStore';

type CenterTab = 'graph' | 'files';

const App: React.FC = () => {
  const { loadProject, currentProject } = useGraphStore();
  const openFiles = useEditorStore(s => s.openFiles);
  const [showSettings, setShowSettings] = useState(false);
  const [showWorkspace, setShowWorkspace] = useState(false);
  const [centerTab, setCenterTab] = useState<CenterTab>('graph');

  // Switch to files tab when a file is opened
  useEffect(() => {
    if (openFiles.length > 0) {
      setCenterTab('files');
    }
  }, [openFiles.length]);

  // Show workspace selector on first load if no project loaded
  useEffect(() => {
    const savedPath = localStorage.getItem('cognitive-ide-project-path');
    if (savedPath) {
      // Auto-restore project from saved path
      loadProject(savedPath).catch(() => {
        // Saved path failed (deleted/renamed), clear and show selector
        localStorage.removeItem('cognitive-ide-project-path');
        setShowWorkspace(true);
      });
    } else if (!currentProject) {
      setShowWorkspace(true);
    }
  }, []);

  const handleSelectWorkspace = async (path: string) => {
    setShowWorkspace(false);
    try {
      await loadProject(path);
    } catch (e) {
      console.error('Failed to load project:', e);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-dark-950">
      <NavBar
        onOpenSettings={() => setShowSettings(true)}
        onOpenWorkspace={() => setShowWorkspace(true)}
      />

      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal" autoSaveId="cognitive-ide-layout">
          <Panel defaultSize={15} minSize={10} maxSize={25}>
            <LeftPanel />
          </Panel>

          <PanelResizeHandle className="w-px bg-dark-800 hover:bg-cognition-500 transition-colors" />

          <Panel defaultSize={55} minSize={30}>
            {/* Center panel with tabs */}
            <div className="h-full flex flex-col">
              {/* Tab bar */}
              <div className="h-[36px] flex items-center bg-[#111827] border-b border-dark-800 shrink-0">
                <button
                  onClick={() => setCenterTab('graph')}
                  className={`px-4 h-full text-xs font-medium border-b-2 transition-colors ${
                    centerTab === 'graph'
                      ? 'text-[#a78bfa] border-[#a78bfa]'
                      : 'text-gray-500 border-transparent hover:text-gray-300'
                  }`}
                >
                  🌌 图谱
                </button>
                <button
                  onClick={() => setCenterTab('files')}
                  className={`px-4 h-full text-xs font-medium border-b-2 transition-colors relative ${
                    centerTab === 'files'
                      ? 'text-[#a78bfa] border-[#a78bfa]'
                      : 'text-gray-500 border-transparent hover:text-gray-300'
                  }`}
                >
                  📄 文件
                  {openFiles.length > 0 && (
                    <span className="ml-1.5 px-1.5 py-0 text-[10px] rounded-full bg-[#a78bfa]/20 text-[#a78bfa]">
                      {openFiles.length}
                    </span>
                  )}
                </button>
              </div>
              {/* Content */}
              <div className="flex-1 overflow-hidden">
                {centerTab === 'graph' ? <GalaxyGraph /> : <CodeViewer />}
              </div>
            </div>
          </Panel>

          <PanelResizeHandle className="w-px bg-dark-800 hover:bg-cognition-500 transition-colors" />

          <Panel defaultSize={30} minSize={20} maxSize={40}>
            <RightPanel />
          </Panel>
        </PanelGroup>
      </div>

      <StatusBar />

      {showSettings && <SettingsPage onClose={() => setShowSettings(false)} />}
      {showWorkspace && <WorkspaceSelector onSelect={handleSelectWorkspace} onClose={() => setShowWorkspace(false)} />}
    </div>
  );
};

export default App;