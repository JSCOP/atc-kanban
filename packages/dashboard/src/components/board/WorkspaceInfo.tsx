import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import type { Workspace } from '../../types';

interface WorkspaceInfoProps {
  taskId: string;
}

export function WorkspaceInfo({ taskId }: WorkspaceInfoProps) {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api
      .getWorkspaceForTask(taskId)
      .then(setWorkspace)
      .catch(() => setWorkspace(null))
      .finally(() => setLoading(false));
  }, [taskId]);

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-5">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
          Workspace
        </h2>
        <div className="flex items-center justify-center py-4">
          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500" />
        </div>
      </div>
    );
  }

  if (!workspace) return null;

  const statusColors: Record<string, string> = {
    active: 'bg-green-600 text-green-100',
    archived: 'bg-yellow-600 text-yellow-100',
    deleted: 'bg-red-600 text-red-100',
  };

  return (
    <div className="bg-gray-800 rounded-lg p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Workspace</h2>
        <span
          className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[workspace.status] || 'bg-gray-600 text-gray-100'}`}
        >
          {workspace.status}
        </span>
      </div>
      <div className="space-y-2">
        <div>
          <p className="text-xs text-gray-500">Branch</p>
          <p className="text-sm text-gray-200 font-mono">{workspace.branchName}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Base Branch</p>
          <p className="text-sm text-gray-200 font-mono">{workspace.baseBranch}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Worktree Path</p>
          <p className="text-sm text-gray-200 font-mono break-all">{workspace.worktreePath}</p>
        </div>
      </div>
    </div>
  );
}
