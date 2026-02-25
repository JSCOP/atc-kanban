import type { Agent } from '../../types';
import { AgentStatusBadge } from './AgentStatusBadge';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

interface AgentCardProps {
  agent: Agent;
}

export function AgentCard({ agent }: AgentCardProps) {
  const isMain = agent.role === 'main';
  const isOnline = agent.status === 'active';

  return (
    <div className={`bg-gray-800 rounded-lg p-5 border transition-colors ${
      isOnline ? 'border-gray-700' : 'border-gray-800 opacity-60'
    }`}>
      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl">{isMain ? '👑' : '🔧'}</span>
        <div className="flex-1 min-w-0">
          <h3 className="text-gray-100 font-semibold truncate">{agent.name}</h3>
          <p className="text-xs text-gray-500">{agent.agentType || 'unknown'}</p>
        </div>
        <AgentStatusBadge status={agent.status} />
      </div>

      <div className="space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-500">Connected</span>
          <span className="text-gray-400 font-mono">{timeAgo(agent.connectedAt)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Last heartbeat</span>
          <span className="text-gray-400 font-mono">{timeAgo(agent.lastHeartbeat)}</span>
        </div>
        {agent.currentTaskTitle && (
          <div className="flex justify-between">
            <span className="text-gray-500">Current task</span>
            <span className="text-blue-400 truncate ml-2">{agent.currentTaskTitle}</span>
          </div>
        )}
        <div className="flex justify-between pt-2 border-t border-gray-700">
          <span className="text-gray-500">Completed</span>
          <span className="text-green-400 font-mono">{agent.tasksCompleted}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">Failed</span>
          <span className="text-red-400 font-mono">{agent.tasksFailed}</span>
        </div>
      </div>
    </div>
  );
}
