import { useEffect } from 'react';
import { useAgentStore } from '../stores/agent-store';

const statusColors = {
  active: 'bg-green-500',
  disconnected: 'bg-red-500',
};

const statusText = {
  active: 'Online',
  disconnected: 'Offline',
};

function formatDuration(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  return `${diffDay}d ago`;
}

function AgentCard({ agent }: { agent: import('../types').Agent }) {
  const isMain = agent.role === 'main';
  const isActive = agent.status === 'active';

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 card-hover">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            isMain 
              ? 'bg-gradient-to-br from-yellow-500 to-orange-500' 
              : 'bg-gradient-to-br from-blue-500 to-purple-500'
          }`}>
            {isMain ? (
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            )}
          </div>
          <div>
            <h3 className="font-semibold text-white">{agent.name}</h3>
            <p className="text-sm text-gray-500">{agent.agentType || 'Unknown Type'}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${statusColors[agent.status]}`} />
          <span className={`text-sm ${isActive ? 'text-green-400' : 'text-red-400'}`}>
            {statusText[agent.status]}
          </span>
        </div>
      </div>

      {agent.currentTaskId && (
        <div className="mb-4 p-3 bg-gray-800/50 rounded-lg">
          <p className="text-xs text-gray-500 mb-1">Current Task</p>
          <p className="text-sm text-gray-300 truncate">{agent.currentTaskTitle || agent.currentTaskId}</p>
        </div>
      )}

      <div className="grid grid-cols-3 gap-4 pt-4 border-t border-gray-800">
        <div>
          <p className="text-2xl font-bold text-white">{agent.tasksCompleted}</p>
          <p className="text-xs text-gray-500">Completed</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-red-400">{agent.tasksFailed}</p>
          <p className="text-xs text-gray-500">Failed</p>
        </div>
        <div>
          <p className="text-sm font-mono text-gray-400">{agent.processId ?? '—'}</p>
          <p className="text-xs text-gray-500">PID</p>
        </div>
      </div>
    </div>
  );
}

export function AgentsPage() {
  const { agents, loading, fetchAgents } = useAgentStore();

  useEffect(() => {
    fetchAgents();
    const interval = setInterval(fetchAgents, 30000);
    return () => clearInterval(interval);
  }, [fetchAgents]);

  const mainAgent = agents.find((a) => a.role === 'main');
  const workerAgents = agents.filter((a) => a.role === 'worker');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Agents</h1>
        <p className="text-gray-400 text-sm mt-1">Monitor your agent fleet status</p>
      </div>

      {loading && agents.length === 0 ? (
        <div className="flex items-center justify-center h-64">
          <div className="flex items-center gap-3 text-gray-400">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Loading agents...
          </div>
        </div>
      ) : (
        <>
          {mainAgent && (
            <div>
              <h2 className="text-lg font-semibold text-white mb-4">Main Agent</h2>
              <div className="max-w-md">
                <AgentCard agent={mainAgent} />
              </div>
            </div>
          )}

          {workerAgents.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-white mb-4">Worker Agents ({workerAgents.length})</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {workerAgents.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} />
                ))}
              </div>
            </div>
          )}

          {agents.length === 0 && (
            <div className="text-center py-16 text-gray-500">
              <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <p className="text-lg">No agents connected</p>
              <p className="text-sm mt-1">Agents will appear here when they connect</p>
            </div>
          )}
        </>
      )}
    </div>
  );
}
