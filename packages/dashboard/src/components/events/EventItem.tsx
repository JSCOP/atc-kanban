import type { ATCEvent } from '../../types';

interface EventItemProps {
  event: ATCEvent;
}

const eventTypeConfig: Record<string, { icon: string; color: string }> = {
  TASK_CREATED: { icon: '📋', color: 'text-blue-400' },
  TASK_CLAIMED: { icon: '🟢', color: 'text-green-400' },
  TASK_RELEASED: { icon: '🔄', color: 'text-yellow-400' },
  STATUS_CHANGED: { icon: '🔵', color: 'text-blue-400' },
  PROGRESS_REPORTED: { icon: '📝', color: 'text-gray-400' },
  TASK_REVIEWED: { icon: '✅', color: 'text-green-400' },
  AGENT_CONNECTED: { icon: '🟢', color: 'text-green-400' },
  AGENT_DISCONNECTED: { icon: '🔴', color: 'text-red-400' },
  LOCK_EXPIRED: { icon: '⚠️', color: 'text-orange-400' },
};

function formatRelativeTime(dateString: string): string {
  const diff = Date.now() - new Date(dateString).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function EventItem({ event }: EventItemProps) {
  const config = eventTypeConfig[event.type] || { icon: 'ℹ️', color: 'text-gray-400' };

  return (
    <div className="flex gap-4 p-4 hover:bg-gray-800/50 transition-colors border-b border-gray-800/50">
      <div className="flex-shrink-0 mt-0.5">
        <div className="w-9 h-9 bg-gray-800 rounded-lg flex items-center justify-center text-lg">
          {config.icon}
        </div>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`text-sm font-medium ${config.color}`}>
            {event.type.replace(/_/g, ' ')}
          </span>
          <span className="text-xs text-gray-600 font-mono">#{event.id}</span>
        </div>

        <p className="text-sm text-gray-400 truncate">
          {typeof event.payload === 'object' && event.payload
            ? Object.entries(event.payload)
                .map(([k, v]) => `${k}: ${v}`)
                .join(', ')
            : ''}
        </p>

        <div className="flex items-center gap-4 text-xs mt-1">
          <span className="text-gray-500 font-mono">{formatRelativeTime(event.createdAt)}</span>
          {event.taskId && (
            <span className="text-blue-400/70 font-mono">task:{event.taskId.slice(0, 8)}</span>
          )}
          {event.agentId && (
            <span className="text-purple-400/70 font-mono">agent:{event.agentId.slice(0, 8)}</span>
          )}
        </div>
      </div>
    </div>
  );
}
