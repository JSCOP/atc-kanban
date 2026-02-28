import { useEffect, useState } from 'react';
import { apiClient } from '../../api/client';
import type { Agent, Task } from '../../types';

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
interface DispatchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  task: Task | null;
  onSuccess: () => void;
}

export function DispatchDialog({ isOpen, onClose, task, onSuccess }: DispatchDialogProps) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [opencodeAgentTypes, setOpencodeAgentTypes] = useState<
    { name: string; description?: string }[]
  >([]);
  const [selectedOpencodeAgent, setSelectedOpencodeAgent] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [sessions, setSessions] = useState<{ id: string; title?: string; createdAt?: string }[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [sessionsLoading, setSessionsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      apiClient
        .getAgents()
        .then((a) => {
          const availableAgents = a.filter(
            (agent) => agent.connectionType === 'opencode' && agent.status === 'active',
          );
          setAgents(availableAgents);
          if (availableAgents.length > 0 && !selectedAgentId) {
            setSelectedAgentId(availableAgents[0].id);
          }
        })
        .catch((err) => {
          setError('Failed to fetch agents');
        });
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedAgentId) {
      apiClient
        .getOpenCodeAgentTypes(selectedAgentId)
        .then((types) => {
          setOpencodeAgentTypes(types);
          setSelectedOpencodeAgent('');
        })
        .catch(() => {
          setOpencodeAgentTypes([]);
          setSelectedOpencodeAgent('');
        });
    } else {
      setOpencodeAgentTypes([]);
      setSelectedOpencodeAgent('');
    }
  }, [selectedAgentId]);

  useEffect(() => {
    if (selectedAgentId) {
      setSessionsLoading(true);
      apiClient.listSessions(selectedAgentId)
        .then((sess) => {
          setSessions(sess);
          setSelectedSessionId('');
        })
        .catch(() => {
          setSessions([]);
          setSelectedSessionId('');
        })
        .finally(() => setSessionsLoading(false));
    } else {
      setSessions([]);
      setSelectedSessionId('');
    }
  }, [selectedAgentId]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedAgentId('');
      setSelectedOpencodeAgent('');
      setCustomPrompt('');
      setError(null);
      setSuccess(null);
      setOpencodeAgentTypes([]);
      setSessions([]);
      setSelectedSessionId('');
    }
  }, [isOpen]);

  if (!isOpen || !task) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgentId) {
      setError('Please select an agent');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await apiClient.dispatchTask({
        taskId: task.id,
        agentId: selectedAgentId,
        prompt: customPrompt.trim() || undefined,
        opencodeAgent: selectedOpencodeAgent || undefined,
        sessionId: selectedSessionId || undefined,
      });

      if (result.success) {
        setSuccess(result.message);
        onSuccess();
        setTimeout(() => {
          onClose();
        }, 1500);
      } else {
        setError(result.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to dispatch task');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setError(null);
      setSuccess(null);
      onClose();
    }
  };

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      {/* Modal */}
      <div className="relative bg-gray-900 border border-gray-700 rounded-xl shadow-2xl w-full max-w-lg animate-slide-in">
        <div className="flex items-center justify-between p-6 border-b border-gray-800">
          <h2 className="text-xl font-semibold text-white">Dispatch Task</h2>
          <button
            onClick={handleClose}
            disabled={loading}
            className="text-gray-400 hover:text-gray-200 disabled:opacity-50"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 text-sm">
              {success}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">Task</label>
            <input
              type="text"
              value={task.title}
              readOnly
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-gray-400 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              OpenCode Agent *
            </label>
            <select
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              disabled={loading || agents.length === 0}
              required
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
            >
              {agents.length === 0 ? (
                <option value="">No available OpenCode agents</option>
              ) : (
                <>
                  <option value="">Select an agent</option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name} ({agent.status})
                    </option>
                  ))}
                </>
              )}
            </select>
          </div>

          {selectedAgent && opencodeAgentTypes.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Agent Type (optional)
              </label>
              <select
                value={selectedOpencodeAgent}
                onChange={(e) => setSelectedOpencodeAgent(e.target.value)}
                disabled={loading}
                className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
              >
                <option value="">Select agent type (optional)</option>
                {opencodeAgentTypes.map((type) => (
                  <option key={type.name} value={type.name}>
                    {type.name}
                    {type.description ? ` - ${type.description}` : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          {selectedAgentId && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">
                Session
              </label>
              <select
                value={selectedSessionId}
                onChange={(e) => setSelectedSessionId(e.target.value)}
                disabled={loading || sessionsLoading}
                className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
              >
                <option value="">New session (recommended)</option>
                {sessions.map((sess) => (
                  <option key={sess.id} value={sess.id}>
                    {sess.title || 'Untitled'} ({sess.createdAt ? timeAgo(sess.createdAt) : 'unknown'})
                    {sess.id === selectedAgent?.sessionId ? ' (active)' : ''}
                  </option>
                ))}
              </select>
              {selectedSessionId && (
                <p className="text-xs text-amber-400 mt-1">
                  ⚠ Reusing a session will mix context from previous conversations.
                </p>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1.5">
              Custom Prompt (optional)
            </label>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="Override the default task prompt with custom instructions..."
              rows={4}
              disabled={loading}
              className="w-full px-4 py-2.5 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 disabled:opacity-50 resize-none"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="px-4 py-2 text-gray-300 hover:text-white disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !selectedAgentId}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {loading && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
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
              )}
              Dispatch
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
