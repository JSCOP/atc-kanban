import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { Agent, OpenCodeMessage, TaskDetail } from '../../types';
import { WorkspaceInfo } from './WorkspaceInfo';
import { api } from '../../api/client';
import type { Agent, OpenCodeMessage, TaskDetail } from '../../types';

interface TaskDetailPanelProps {
  taskId: string;
  onClose: () => void;
  onTaskUpdated: () => void;
}

const statusColors: Record<string, string> = {
  todo: 'bg-gray-600 text-gray-100',
  locked: 'bg-orange-600 text-orange-100',
  in_progress: 'bg-yellow-600 text-yellow-100',
  review: 'bg-blue-600 text-blue-100',
  done: 'bg-green-600 text-green-100',
  failed: 'bg-red-600 text-red-100',
};

const priorityColors: Record<string, string> = {
  critical: 'bg-red-500/20 text-red-400 border border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  low: 'bg-gray-500/20 text-gray-400 border border-gray-500/30',
};

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

export function TaskDetailPanel({ taskId, onClose, onTaskUpdated }: TaskDetailPanelProps) {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState<string>('');
  const [assigning, setAssigning] = useState(false);

  const [opencodeAgentTypes, setOpencodeAgentTypes] = useState<
    { name: string; description?: string }[]
  >([]);
  const [selectedOpencodeAgent, setSelectedOpencodeAgent] = useState('');
  const [customPrompt, setCustomPrompt] = useState('');
  const [dispatching, setDispatching] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [dispatchSuccess, setDispatchSuccess] = useState<string | null>(null);

  const [sessionMessages, setSessionMessages] = useState<OpenCodeMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const [reviewComment, setReviewComment] = useState('');
  const [reviewing, setReviewing] = useState(false);

  const fetchTask = async () => {
    try {
      const t = await api.getTask(taskId);
      setTask(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch task');
    }
  };

  useEffect(() => {
    setLoading(true);
    api
      .getTask(taskId)
      .then(setTask)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [taskId]);

  useEffect(() => {
    api
      .getAgents()
      .then(setAgents)
      .catch(() => setAgents([]));
  }, []);

  useEffect(() => {
    if (task?.assignedAgentId) {
      const assignedAgent = agents.find((a) => a.id === task.assignedAgentId);
      if (assignedAgent && assignedAgent.connectionType === 'opencode' && assignedAgent.sessionId) {
        setMessagesLoading(true);
        api
          .getSessionMessages(assignedAgent.id)
          .then(setSessionMessages)
          .catch(() => setSessionMessages([]))
          .finally(() => setMessagesLoading(false));
      } else {
        setSessionMessages([]);
      }
    } else {
      setSessionMessages([]);
    }
  }, [task?.assignedAgentId, agents]);

  useEffect(() => {
    if (!task?.assignedAgentId) return;
    const assignedAgent = agents.find((a) => a.id === task.assignedAgentId);
    if (!assignedAgent || assignedAgent.connectionType !== 'opencode' || !assignedAgent.sessionId) {
      return;
    }

    const interval = setInterval(() => {
      api
        .getSessionMessages(assignedAgent.id)
        .then(setSessionMessages)
        .catch(() => {});
    }, 5000);

    return () => clearInterval(interval);
  }, [task?.assignedAgentId, agents]);

  useEffect(() => {
    const assignedAgent = agents.find((a) => a.id === selectedAgentId);
    if (assignedAgent && assignedAgent.connectionType === 'opencode') {
      api
        .getOpenCodeAgentTypes(assignedAgent.id)
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
  }, [selectedAgentId, agents]);

  const handleAssign = async () => {
    setAssigning(true);
    setError(null);
    try {
      await api.assignAgent(taskId, selectedAgentId || null);
      await fetchTask();
      onTaskUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to assign agent');
    } finally {
      setAssigning(false);
    }
  };

  const handleUnassign = async () => {
    setAssigning(true);
    setError(null);
    try {
      await api.assignAgent(taskId, null);
      setSelectedAgentId('');
      await fetchTask();
      onTaskUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to unassign agent');
    } finally {
      setAssigning(false);
    }
  };

  const handleDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAgentId) return;

    setDispatching(true);
    setDispatchError(null);
    setDispatchSuccess(null);

    try {
      const result = await api.dispatchTask({
        taskId,
        agentId: selectedAgentId,
        prompt: customPrompt.trim() || undefined,
        opencodeAgent: selectedOpencodeAgent || undefined,
      });

      if (result.success) {
        setDispatchSuccess(result.message);
        setCustomPrompt('');
        setSelectedOpencodeAgent('');
        await fetchTask();
        onTaskUpdated();
      } else {
        setDispatchError(result.message);
      }
    } catch (err) {
      setDispatchError(err instanceof Error ? err.message : 'Failed to dispatch task');
    } finally {
      setDispatching(false);
    }
  };

  const handleForceRelease = async () => {
    try {
      await api.forceRelease(taskId);
      const updated = await api.getTask(taskId);
      setTask(updated);
      onTaskUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to release');
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this task?')) return;
    try {
      await api.deleteTask(taskId);
      onClose();
      onTaskUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    }
  };

  const handleReview = async (verdict: 'approve' | 'reject') => {
    setReviewing(true);
    setError(null);
    try {
      const response = await fetch(`/api/tasks/${taskId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verdict, comment: reviewComment.trim() || undefined }),
      });
      if (!response.ok) {
        const text = await response.text();
        throw new Error(text || `HTTP ${response.status}`);
      }
      setReviewComment('');
      await fetchTask();
      onTaskUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to review');
    } finally {
      setReviewing(false);
    }
  };

  const handleDependencyClick = (depTaskId: string) => {
    // Close current and let parent reopen with new taskId
    onClose();
    // Use a small timeout to allow the close animation
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('openTaskPanel', { detail: depTaskId }));
    }, 300);
  };

  const assignedAgent = task?.assignedAgentId
    ? agents.find((a) => a.id === task.assignedAgentId)
    : null;

  const selectedAgent = agents.find((a) => a.id === selectedAgentId);
  const isSelectedOpenCode = selectedAgent?.connectionType === 'opencode';

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-40 animate-fade-in"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className="fixed top-0 right-0 h-full w-full max-w-2xl bg-gray-900 border-l border-gray-700 shadow-2xl z-50 overflow-hidden animate-slide-in-right">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700 bg-gray-900">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-100 truncate">{task?.title || 'Task'}</h1>
            {task && (
              <>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${priorityColors[task.priority]}`}
                >
                  {task.priority}
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${statusColors[task.status]}`}
                >
                  {task.status.replace('_', ' ')}
                </span>
              </>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-200 hover:bg-gray-800 rounded-lg transition-colors shrink-0 ml-4"
            aria-label="Close panel"
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

        {/* Scrollable Content */}
        <div className="h-[calc(100%-65px)] overflow-y-auto p-6 space-y-6">
          {loading && (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
            </div>
          )}

          {error && !loading && (
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 text-red-400">
              {error}
            </div>
          )}

          {task && !loading && (
            <>
              {/* Agent Assignment & Dispatch Controls */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Agent Assignment */}
                <div className="bg-gray-800 rounded-lg p-5">
                  <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
                    Agent Assignment
                  </h2>
                  {assignedAgent ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-gray-200 font-medium">{assignedAgent.name}</p>
                          <p className="text-xs text-gray-500">
                            {assignedAgent.connectionType === 'opencode' ? 'OpenCode' : 'MCP'} •{' '}
                            {assignedAgent.role}
                          </p>
                        </div>
                        <button
                          onClick={handleUnassign}
                          disabled={assigning}
                          className="px-3 py-1.5 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors disabled:opacity-50"
                        >
                          Unassign
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <select
                        value={selectedAgentId}
                        onChange={(e) => setSelectedAgentId(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:border-blue-500"
                      >
                        <option value="">Select an agent</option>
                        {agents
                          .filter((a) => a.status === 'active')
                          .map((agent) => (
                            <option key={agent.id} value={agent.id}>
                              {agent.name} ({agent.role}, {agent.connectionType})
                            </option>
                          ))}
                      </select>
                      <button
                        onClick={handleAssign}
                        disabled={assigning || !selectedAgentId}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {assigning ? 'Assigning...' : 'Assign Agent'}
                      </button>
                    </div>
                  )}
                </div>

                {/* Dispatch Controls */}
                {isSelectedOpenCode && (
                  <div className="bg-gray-800 rounded-lg p-5">
                    <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-4">
                      Dispatch Task
                    </h2>
                    <form onSubmit={handleDispatch} className="space-y-3">
                      {dispatchError && (
                        <div className="p-2 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-sm">
                          {dispatchError}
                        </div>
                      )}
                      {dispatchSuccess && (
                        <div className="p-2 bg-green-500/10 border border-green-500/20 rounded text-green-400 text-sm">
                          {dispatchSuccess}
                        </div>
                      )}
                      {opencodeAgentTypes.length > 0 && (
                        <select
                          value={selectedOpencodeAgent}
                          onChange={(e) => setSelectedOpencodeAgent(e.target.value)}
                          disabled={dispatching}
                          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:border-blue-500 disabled:opacity-50"
                        >
                          <option value="">Select agent type (optional)</option>
                          {opencodeAgentTypes.map((type) => (
                            <option key={type.name} value={type.name}>
                              {type.name}
                              {type.description ? ` - ${type.description}` : ''}
                            </option>
                          ))}
                        </select>
                      )}
                      <textarea
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        placeholder="Custom prompt (optional)..."
                        rows={2}
                        disabled={dispatching}
                        className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 disabled:opacity-50 resize-none"
                      />
                      <button
                        type="submit"
                        disabled={dispatching}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {dispatching ? 'Dispatching...' : 'Dispatch'}
                      </button>
                    </form>
                  </div>
                )}
              </div>

              {/* Task Meta Grid */}
              <div className="bg-gray-800 rounded-lg p-5">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Status</p>
                    <span
                      className={`inline-block mt-1 px-2 py-1 rounded text-sm font-medium ${statusColors[task.status]}`}
                    >
                      {task.status.replace('_', ' ')}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Priority</p>
                    <span
                      className={`inline-block mt-1 px-2 py-1 rounded text-sm font-medium ${priorityColors[task.priority]}`}
                    >
                      {task.priority}
                    </span>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Assigned Agent</p>
                    <p className="mt-1 text-gray-300 text-sm">
                      {assignedAgent ? assignedAgent.name : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Created</p>
                    <p className="mt-1 text-gray-300 font-mono text-sm">
                      {timeAgo(task.createdAt)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 uppercase tracking-wide">Updated</p>
                    <p className="mt-1 text-gray-300 font-mono text-sm">
                      {timeAgo(task.updatedAt)}
                    </p>
                  </div>
                </div>

                {task.labels.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-700">
                    <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Labels</p>
                    <div className="flex gap-2 flex-wrap">
                      {task.labels.map((label) => (
                        <span
                          key={label}
                          className="px-2 py-1 bg-gray-700 text-gray-300 rounded text-xs"
                        >
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Workspace Info */}
              <WorkspaceInfo taskId={task.id} />

              {/* Session Messages */}

              {/* Session Messages */}
              {assignedAgent?.connectionType === 'opencode' && assignedAgent.sessionId && (
                <div className="bg-gray-800 rounded-lg p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
                      Session Messages
                    </h2>
                    <span className="px-2 py-1 bg-gray-700 text-gray-300 rounded-full text-xs">
                      {sessionMessages.length}
                    </span>
                  </div>
                  {messagesLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500" />
                    </div>
                  ) : sessionMessages.length === 0 ? (
                    <p className="text-gray-500 text-sm py-4">No messages yet</p>
                  ) : (
                    <div className="space-y-3 max-h-96 overflow-y-auto">
                      {sessionMessages.map((msg) => (
                        <div
                          key={msg.id}
                          className={`p-3 rounded-lg ${
                            msg.role === 'user'
                              ? 'bg-blue-900/20 border border-blue-500/20'
                              : 'bg-gray-900 border border-gray-700'
                          }`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className={`text-xs font-medium ${
                                msg.role === 'user' ? 'text-blue-400' : 'text-gray-400'
                              }`}
                            >
                              {msg.role}
                            </span>
                            <span className="text-xs text-gray-500">{timeAgo(msg.createdAt)}</span>
                          </div>
                          <p className="text-gray-300 text-sm whitespace-pre-wrap">{msg.content}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Description */}
              {task.description && (
                <div className="bg-gray-800 rounded-lg p-5">
                  <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
                    Description
                  </h2>
                  <p className="text-gray-300 whitespace-pre-wrap">{task.description}</p>
                </div>
              )}

              {/* Dependencies */}
              {(task.dependsOn.length > 0 || task.blockedBy.length > 0) && (
                <div className="bg-gray-800 rounded-lg p-5 space-y-3">
                  <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
                    Dependencies
                  </h2>
                  {task.dependsOn.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Depends on:</p>
                      <div className="flex gap-2 flex-wrap">
                        {task.dependsOn.map((depId) => (
                          <button
                            key={depId}
                            onClick={() => handleDependencyClick(depId)}
                            className="px-2 py-1 bg-blue-900/30 text-blue-400 rounded text-xs font-mono hover:bg-blue-900/50 transition-colors"
                          >
                            {depId.slice(0, 8)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  {task.blockedBy.length > 0 && (
                    <div>
                      <p className="text-xs text-gray-500 mb-1">Blocks:</p>
                      <div className="flex gap-2 flex-wrap">
                        {task.blockedBy.map((blockId) => (
                          <button
                            key={blockId}
                            onClick={() => handleDependencyClick(blockId)}
                            className="px-2 py-1 bg-orange-900/30 text-orange-400 rounded text-xs font-mono hover:bg-orange-900/50 transition-colors"
                          >
                            {blockId.slice(0, 8)}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Progress Log */}
              {task.progressLogs.length > 0 && (
                <div className="bg-gray-800 rounded-lg p-5">
                  <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
                    Progress Log
                  </h2>
                  <div className="space-y-3">
                    {task.progressLogs.map((log) => (
                      <div key={log.id} className="flex gap-3 text-sm">
                        <span className="text-gray-500 font-mono shrink-0 w-16">
                          {timeAgo(log.createdAt)}
                        </span>
                        <span className="text-gray-500 font-mono shrink-0">
                          {log.agentId.slice(0, 8)}
                        </span>
                        <span className="text-gray-300">{log.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Review Comments */}
              {task.comments.length > 0 && (
                <div className="bg-gray-800 rounded-lg p-5">
                  <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
                    Review Comments
                  </h2>
                  <div className="space-y-3">
                    {task.comments.map((comment) => (
                      <div key={comment.id} className="bg-gray-900 rounded p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs text-blue-400 font-mono">
                            {comment.agentId.slice(0, 8)}
                          </span>
                          <span className="text-xs text-gray-500">
                            {timeAgo(comment.createdAt)}
                          </span>
                        </div>
                        <p className="text-gray-300 text-sm">{comment.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Review Controls for review status */}
              {task.status === 'review' && (
                <div className="bg-gray-800 rounded-lg p-5">
                  <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
                    Review Task
                  </h2>
                  <div className="space-y-3">
                    <textarea
                      value={reviewComment}
                      onChange={(e) => setReviewComment(e.target.value)}
                      placeholder="Add review comment (optional)..."
                      rows={2}
                      disabled={reviewing}
                      className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 disabled:opacity-50 resize-none"
                    />
                    <div className="flex gap-3">
                      <button
                        onClick={() => handleReview('approve')}
                        disabled={reviewing}
                        className="px-4 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        {reviewing ? 'Processing...' : 'Approve'}
                      </button>
                      <button
                        onClick={() => handleReview('reject')}
                        disabled={reviewing}
                        className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 items-center">
                {['locked', 'in_progress'].includes(task.status) && (
                  <button
                    onClick={handleForceRelease}
                    className="px-4 py-2 bg-orange-600 hover:bg-orange-500 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Force Release
                  </button>
                )}
                {['todo', 'done', 'failed'].includes(task.status) && (
                  <button
                    onClick={handleDelete}
                    className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Delete
                  </button>
                )}
                <p className="text-xs text-gray-600 font-mono ml-auto">ID: {task.id}</p>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}
