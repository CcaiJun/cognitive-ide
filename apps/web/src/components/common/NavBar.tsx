import React from 'react';
import { useGraphStore } from '../../stores/graphStore';

interface NavBarProps {
  onOpenSettings?: () => void;
  onOpenWorkspace?: () => void;
}

const NavBar: React.FC<NavBarProps> = ({ onOpenSettings, onOpenWorkspace }) => {
  const { currentProject, cognitionStatus, unverifiedChanges } = useGraphStore();

  return (
    <header className="h-12 flex items-center justify-between px-4 bg-dark-900 border-b border-dark-800 shrink-0">
      {/* Left: Logo + Project selector */}
      <div className="flex items-center gap-4">
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded bg-cognition-500 flex items-center justify-center text-xs font-bold">
            C
          </div>
          <span className="text-sm font-semibold text-cognition-300">Cognitive IDE</span>
        </div>

        {/* Project selector */}
        <button
          onClick={onOpenWorkspace}
          className="h-6 px-3 bg-dark-800 rounded text-xs text-dark-300 flex items-center gap-2 cursor-pointer hover:bg-dark-700 transition-colors"
        >
          <span className="text-dark-400">📁</span>
          <span>{currentProject || '选择工作区...'}</span>
        </button>

        {/* Search */}
        <div className="h-6 px-3 bg-dark-800 rounded text-xs flex items-center gap-2 cursor-pointer hover:bg-dark-700 transition-colors">
          <span className="text-dark-400">🔍</span>
          <span className="text-dark-400">Search symbols...</span>
          <span className="text-dark-500 text-[10px] ml-2">⌘K</span>
        </div>
      </div>

      {/* Right: Status + Settings + Avatar */}
      <div className="flex items-center gap-3">
        {/* AI Status */}
        <div className="flex items-center gap-1.5 text-xs">
          <div className={`w-2 h-2 rounded-full ${cognitionStatus === 'ready' ? 'bg-green-500' : cognitionStatus === 'analyzing' ? 'bg-yellow-500 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-dark-400">
            {cognitionStatus === 'ready' ? 'AI Ready' : cognitionStatus === 'analyzing' ? 'Analyzing...' : 'Error'}
          </span>
        </div>

        {/* Unverified changes badge */}
        {unverifiedChanges > 0 && (
          <div className="h-5 px-2 bg-orange-500/20 text-orange-400 rounded text-xs flex items-center">
            {unverifiedChanges} pending
          </div>
        )}

        {/* Settings button */}
        <button
          onClick={onOpenSettings}
          className="w-7 h-7 rounded-lg bg-dark-800 hover:bg-dark-700 text-dark-400 hover:text-cognition-400 flex items-center justify-center transition-colors"
          title="设置"
        >
          ⚙️
        </button>

        {/* User avatar */}
        <div className="w-7 h-7 rounded-full bg-cognition-600 flex items-center justify-center text-xs font-medium">
          D
        </div>
      </div>
    </header>
  );
};

export default NavBar;