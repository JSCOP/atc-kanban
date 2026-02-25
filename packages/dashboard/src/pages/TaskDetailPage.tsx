import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { api } from '../api/client';
import type { TaskDetail } from '../types';

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

export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api.getTask(id)
      .then(setTask)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const handleForceRelease = async () => {
    if (!id) return;
    try {
      await api.forceRelease(id);
      const updated = await api.getTask(id);
      setTask(updated);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDelete = async () => {
    if (!id || !confirm('Delete this task?')) return;
    try {
      await api.deleteTask(id);
      navigate('/');
    } catch (e: any) {
      setError(e.message);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="p-6">
        <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4 text-red-400">
          {error || 'Task not found'}
        </div>
        <Link to="/" className="mt-4 inline-block text-blue-400 hover:text-blue-300">
          ← Back to Board
        </Link>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link to="/" className="text-gray-400 hover:text-gray-200 transition-colors">
          ← Back
        </Link>
        <h1 className="text-2xl font-bold text-gray-100 flex-1">{task.title}</h1>
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${priorityColors[task.priority]}`}>
          {task.priority}
        </span>
      </div>

      {/* Status & Meta */}
      <div className="bg-gray-800 rounded-lg p-5 space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Status</p>
            <span className={`inline-block mt-1 px-3 py-1 rounded text-sm font-medium ${statusColors[task.status]}`}>
              {task.status.replace('_', ' ')}
            </span>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Assigned</p>
            <p className="mt-1 text-gray-300 font-mono text-sm">
              {task.assignedAgentId ? task.assignedAgentId.slice(0, 8) : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Created</p>
            <p className="mt-1 text-gray-300 font-mono text-sm">{timeAgo(task.createdAt)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">Updated</p>
            <p className="mt-1 text-gray-300 font-mono text-sm">{timeAgo(task.updatedAt)}</p>
          </div>
        </div>

        {task.labels.length > 0 && (
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide mb-2">Labels</p>
            <div className="flex gap-2 flex-wrap">
              {task.labels.map((label) => (
                <span key={label} className="px-2 py-1 bg-gray-700 text-gray-300 rounded text-xs">
                  {label}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Description */}
      {task.description && (
        <div className="bg-gray-800 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Description</h2>
          <p className="text-gray-300 whitespace-pre-wrap">{task.description}</p>
        </div>
      )}

      {/* Dependencies */}
      {(task.dependsOn.length > 0 || task.blockedBy.length > 0) && (
        <div className="bg-gray-800 rounded-lg p-5 space-y-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Dependencies</h2>
          {task.dependsOn.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Depends on:</p>
              <div className="flex gap-2 flex-wrap">
                {task.dependsOn.map((depId) => (
                  <Link key={depId} to={`/tasks/${depId}`}
                    className="px-2 py-1 bg-blue-900/30 text-blue-400 rounded text-xs font-mono hover:bg-blue-900/50 transition-colors">
                    {depId.slice(0, 8)}
                  </Link>
                ))}
              </div>
            </div>
          )}
          {task.blockedBy.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-1">Blocks:</p>
              <div className="flex gap-2 flex-wrap">
                {task.blockedBy.map((blockId) => (
                  <Link key={blockId} to={`/tasks/${blockId}`}
                    className="px-2 py-1 bg-orange-900/30 text-orange-400 rounded text-xs font-mono hover:bg-orange-900/50 transition-colors">
                    {blockId.slice(0, 8)}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Progress Log */}
      {task.progressLogs.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Progress Log</h2>
          <div className="space-y-3">
            {task.progressLogs.map((log) => (
              <div key={log.id} className="flex gap-3 text-sm">
                <span className="text-gray-500 font-mono shrink-0 w-16">{timeAgo(log.createdAt)}</span>
                <span className="text-gray-500 font-mono shrink-0">{log.agentId.slice(0, 8)}</span>
                <span className="text-gray-300">{log.message}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Review Comments */}
      {task.comments.length > 0 && (
        <div className="bg-gray-800 rounded-lg p-5">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Review Comments</h2>
          <div className="space-y-3">
            {task.comments.map((comment) => (
              <div key={comment.id} className="bg-gray-900 rounded p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs text-blue-400 font-mono">{comment.agentId.slice(0, 8)}</span>
                  <span className="text-xs text-gray-500">{timeAgo(comment.createdAt)}</span>
                </div>
                <p className="text-gray-300 text-sm">{comment.content}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
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
      </div>

      {/* ID */}
      <p className="text-xs text-gray-600 font-mono">ID: {task.id}</p>
    </div>
  );
}
