import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { ATCEvent, Agent } from '../../types';

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function eventTypeColor(type: string): string {
  if (type.includes('CLAIMED') || type.includes('CONNECTED')) return 'text-green-400';
  if (type.includes('FAILED') || type.includes('DISCONNECTED') || type.includes('EXPIRED'))
    return 'text-red-400';
  if (type.includes('PROGRESS')) return 'text-blue-400';
  if (type.includes('REVIEWED') || type.includes('OVERRIDE')) return 'text-yellow-400';
  if (type.includes('WORKSPACE')) return 'text-purple-400';
  return 'text-gray-400';
}

function eventTypeLabel(type: string): string {
  return type.replace(/_/g, ' ');
}

export function AgentActivityPanel({
  agent,
  onClose,
}: {
  agent: Agent;
  onClose: () => void;
}) {
  const [events, setEvents] = useState<ATCEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const fetchActivity = async () => {
      try {
        const activity = await api.getAgentActivity(agent.id, undefined, 100);
        if (!cancelled) {
          setEvents(activity);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    };

    fetchActivity();
    const interval = setInterval(fetchActivity, 10000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [agent.id]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-gray-900 border-l border-gray-800 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-800">
          <div>
            <h2 className="text-lg font-semibold text-white">{agent.name}</h2>
            <p className="text-xs text-gray-500">
              {agent.connectionType.toUpperCase()} · {agent.role} · Activity Log
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Events */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex items-center justify-center h-32 text-gray-500">
              <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              Loading activity...
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <p>No activity recorded for this agent</p>
            </div>
          ) : (
            events.map((event) => (
              <div
                key={event.id}
                className="bg-gray-800/50 rounded-lg p-3 border border-gray-700/50"
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-xs font-semibold uppercase tracking-wider ${eventTypeColor(event.type)}`}
                  >
                    {eventTypeLabel(event.type)}
                  </span>
                  <span className="text-xs text-gray-600">{formatTime(event.createdAt)}</span>
                </div>
                {event.taskId && (
                  <p className="text-xs text-gray-500 mb-1">
                    Task:{' '}
                    <span className="text-gray-400 font-mono">{event.taskId.slice(0, 8)}</span>
                  </p>
                )}
                {event.payload && Object.keys(event.payload).length > 0 && (
                  <pre className="text-xs text-gray-400 bg-gray-900/50 rounded p-2 mt-1 overflow-x-auto max-h-24">
                    {JSON.stringify(event.payload, null, 2)}
                  </pre>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
