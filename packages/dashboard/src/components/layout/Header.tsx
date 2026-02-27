import { useEffect } from 'react';
import { useAgentStore } from '../../stores/agent-store';
import { useProjectStore } from '../../stores/project-store';

export function Header() {
  const { agents, fetchAgents } = useAgentStore();
  const { projects, selectedProjectId } = useProjectStore();
  const selectedProject = projects.find((p) => p.id === selectedProjectId);

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  const mainAgent = agents.find((a) => a.role === 'main');
  const isMainOnline = mainAgent?.status === 'active';

  return (
    <header className="h-16 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
          <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        </div>
        <h1 className="text-lg font-semibold text-white">
          {selectedProject?.name || 'ATC Dashboard'}
        </h1>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Project:</span>
          <span className="text-sm font-medium text-white">
            {selectedProject?.name || 'Default Project'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Main Agent:</span>
          <div className="flex items-center gap-2">
            <div className="relative">
              <div
                className={`w-2 h-2 rounded-full ${isMainOnline ? 'bg-green-500' : 'bg-red-500'}`}
              />
              {isMainOnline && (
                <div className="absolute inset-0 w-2 h-2 rounded-full bg-green-500 animate-pulse-ring" />
              )}
            </div>
            <span
              className={`text-sm font-medium ${isMainOnline ? 'text-green-400' : 'text-red-400'}`}
            >
              {isMainOnline ? 'Online' : 'Offline'}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
