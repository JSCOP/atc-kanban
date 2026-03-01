import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useProjectStore } from '../stores/project-store';
import { useWorkspaceStore } from '../stores/workspace-store';
import type { BoardSummary, Workspace } from '../types';

type WorkspaceFilter = 'all' | 'active' | 'archived' | 'deleted';

export function SettingsPage() {
  const { currentProject } = useProjectStore();
  const workspaceStore = useWorkspaceStore();
  const [health, setHealth] = useState<{ status: string; timestamp: string } | null>(null);
  const [summary, setSummary] = useState<BoardSummary | null>(null);
  const [wsFilter, setWsFilter] = useState<WorkspaceFilter>('all');
  const [loading, setLoading] = useState(true);
  const [serverInfo, setServerInfo] = useState<{
    pid: number;
    uptime: number;
    nodeVersion: string;
    cwd: string;
    memoryUsage: { rss: number; heapUsed: number; heapTotal: number };
  } | null>(null);
  const [actionLoading, setActionLoading] = useState<'shutdown' | 'restart' | null>(null);
  const [actionResult, setActionResult] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [workspaceActionLoading, setWorkspaceActionLoading] = useState<string | null>(null);

  const loadData = useCallback(() => {
    Promise.all([
      fetch('/api/health').then((r) => r.json()),
      api.getBoardSummary(),
      api.getWorkspaces(),
      api.getServerInfo().catch(() => null),
    ])
      .then(([h, s, w, info]) => {
        setHealth(h);
        setSummary(s);
        workspaceStore.fetchWorkspaces();
        setServerInfo(info);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const formatUptime = (seconds: number) => {
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const parts: string[] = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(' ');
  };

  const formatBytes = (bytes: number) => {
    const mb = bytes / 1024 / 1024;
    return `${mb.toFixed(1)} MB`;
  };

  const handleShutdown = async () => {
    if (!confirm('Shut down the server? The dashboard will become unavailable.')) return;
    setActionLoading('shutdown');
    setActionResult(null);
    try {
      await api.shutdownServer();
      setActionResult({ type: 'success', message: 'Server is shutting down...' });
    } catch {
      setActionResult({ type: 'error', message: 'Failed to send shutdown signal' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleRestart = async () => {
    if (!confirm('Restart the server? The dashboard will briefly disconnect.')) return;
    setActionLoading('restart');
    setActionResult(null);
    try {
      await api.restartServer();
      setActionResult({ type: 'success', message: 'Server is restarting... Refreshing in 3s.' });
      setTimeout(() => window.location.reload(), 3000);
    } catch {
      setActionResult({ type: 'error', message: 'Failed to send restart signal' });
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteWorkspace = async (workspace: Workspace) => {
    const confirmed = window.confirm(
      'Delete this workspace? This will also archive all other active workspaces in the same repository. This action is a soft-delete (data is preserved in DB).',
    );
    if (!confirmed) return;

    setWorkspaceActionLoading(workspace.id);
    try {
      await workspaceStore.deleteWorkspaceApi(workspace.id);
    } catch {
      // Error already logged in store
    } finally {
      setWorkspaceActionLoading(null);
    }
  };

  const handleArchiveWorkspace = async (workspace: Workspace) => {
    const confirmed = window.confirm(
      'Archive this workspace? It will be marked as archived and won\'t be used for new tasks.',
    );
    if (!confirmed) return;

    setWorkspaceActionLoading(workspace.id);
    try {
      await workspaceStore.archiveWorkspaceApi(workspace.id);
    } catch {
      // Error already logged in store
    } finally {
      setWorkspaceActionLoading(null);
    }
  };

  const filteredWorkspaces = useMemo(() => {
    if (wsFilter === 'all') return workspaceStore.workspaces;
    return workspaceStore.workspaces.filter((ws) => ws.status === wsFilter);
  }, [workspaceStore.workspaces, wsFilter]);

  const filterTabs: { key: WorkspaceFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'active', label: 'Active' },
    { key: 'archived', label: 'Archived' },
    { key: 'deleted', label: 'Deleted' },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-100">Settings</h1>

      {/* Server Status + Controls */}
      <div className="bg-gray-800 rounded-lg p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
            Server Status
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRestart}
              disabled={actionLoading !== null}
              className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {actionLoading === 'restart' ? 'Restarting...' : 'Restart Server'}
            </button>
            <button
              onClick={handleShutdown}
              disabled={actionLoading !== null}
              className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-500 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              {actionLoading === 'shutdown' ? 'Shutting down...' : 'Shutdown Server'}
            </button>
          </div>
        </div>

        {actionResult && (
          <div
            className={`p-2 rounded-lg text-sm ${actionResult.type === 'success' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}
          >
            {actionResult.message}
          </div>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-500">Status</p>
            <div className="flex items-center gap-2 mt-1">
              <span
                className={`w-2 h-2 rounded-full ${health?.status === 'ok' ? 'bg-green-500' : 'bg-red-500'}`}
              />
              <span className="text-gray-300">
                {health?.status === 'ok' ? 'Online' : 'Offline'}
              </span>
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-500">PID</p>
            <p className="mt-1 text-gray-300 font-mono text-sm">{serverInfo?.pid ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Uptime</p>
            <p className="mt-1 text-gray-300 font-mono text-sm">
              {serverInfo ? formatUptime(serverInfo.uptime) : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Memory (RSS)</p>
            <p className="mt-1 text-gray-300 font-mono text-sm">
              {serverInfo ? formatBytes(serverInfo.memoryUsage.rss) : '—'}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500">Server Time</p>
            <p className="mt-1 text-gray-300 font-mono text-sm">
              {health?.timestamp ? new Date(health.timestamp).toLocaleString() : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Node Version</p>
            <p className="mt-1 text-gray-300 font-mono text-sm">{serverInfo?.nodeVersion ?? '—'}</p>
          </div>
        </div>
      </div>

      {/* Project Info */}
      <div className="bg-gray-800 rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Project</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500">Name</p>
            <p className="mt-1 text-gray-300">{currentProject?.name ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Project ID</p>
            <p className="mt-1 text-gray-300 font-mono text-sm">{currentProject?.id ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Repository Path</p>
            <p className="mt-1 text-gray-300 font-mono text-sm truncate" title={currentProject?.repoRoot ?? undefined}>
              {currentProject?.repoRoot ?? 'Not linked'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Base Branch</p>
            <p className="mt-1 text-gray-300 font-mono text-sm">{currentProject?.baseBranch ?? '—'}</p>
          </div>
        </div>
      </div>

      {/* Configuration */}
      <div className="bg-gray-800 rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
          Configuration
        </h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-300">Lock TTL</p>
              <p className="text-xs text-gray-500">How long a task lock lasts before auto-expiry</p>
            </div>
            <span className="text-gray-400 font-mono bg-gray-900 px-3 py-1 rounded">
              30 minutes
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-300">Process Health Check</p>
              <p className="text-xs text-gray-500">
                Agent health determined by OS process ID (PID) monitoring
              </p>
            </div>
            <span className="text-gray-400 font-mono bg-gray-900 px-3 py-1 rounded">every 10s</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-300">Lock Check Interval</p>
              <p className="text-xs text-gray-500">How often expired locks are cleaned up</p>
            </div>
            <span className="text-gray-400 font-mono bg-gray-900 px-3 py-1 rounded">
              30 seconds
            </span>
          </div>
        </div>
      </div>

      {/* Workspaces */}
      <div className="bg-gray-800 rounded-lg p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Workspaces</h2>
          {/* Filter Tabs */}
          <div className="flex flex-wrap gap-1">
            {filterTabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setWsFilter(tab.key)}
                className={`px-3 py-1 text-[11px] font-medium rounded-full transition-colors cursor-pointer ${
                  wsFilter === tab.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-700/50 text-gray-400 hover:bg-gray-700 hover:text-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {filteredWorkspaces.length === 0 ? (
          <p className="text-sm text-gray-500">
            {wsFilter === 'all'
              ? 'No workspaces registered'
              : `No ${wsFilter} workspaces found`}
          </p>
        ) : (
          <div className="space-y-3">
            {filteredWorkspaces.map((ws) => (
              <div
                key={ws.id}
                className={`bg-gray-900 rounded-lg p-3 transition-opacity ${
                  ws.status === 'deleted' ? 'opacity-50' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <span className="text-sm font-mono text-gray-300 truncate flex-1" title={ws.repoRoot}>
                    {ws.repoRoot}
                  </span>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Action Buttons */}
                    {ws.status !== 'deleted' && workspaceActionLoading !== ws.id && (
                      <>
                        {ws.status === 'active' && (
                          <button
                            onClick={() => handleArchiveWorkspace(ws)}
                            disabled={workspaceActionLoading === ws.id}
                            className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/10 rounded transition-colors cursor-pointer"
                            title="Archive workspace"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                            </svg>
                            Archive
                          </button>
                        )}
                        <button
                          onClick={() => handleDeleteWorkspace(ws)}
                          disabled={workspaceActionLoading === ws.id}
                          className="flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors cursor-pointer"
                          title="Delete workspace"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                          Delete
                        </button>
                      </>
                    )}
                    {workspaceActionLoading === ws.id && (
                      <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                    )}
                    {/* Status Badge */}
                    <span
                      className={`text-xs px-2 py-0.5 rounded ${
                        ws.status === 'active'
                          ? 'bg-green-500/20 text-green-400'
                          : ws.status === 'archived'
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : 'bg-red-500/20 text-red-400'
                      }`}
                    >
                      {ws.status}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs text-gray-500">
                  <div>
                    Branch: <span className="text-gray-400">{ws.branchName}</span>
                  </div>
                  <div>
                    Base: <span className="text-gray-400">{ws.baseBranch}</span>
                  </div>
                  <div>
                    Task:{" "}
                    <span className="text-gray-400">{ws.taskId ? ws.taskId.slice(0, 8) : '—'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Stats */}
      {summary && (
        <div className="bg-gray-800 rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
            Statistics
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-gray-900 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-gray-100">
                {summary.todo +
                  summary.locked +
                  summary.inProgress +
                  summary.review +
                  summary.done +
                  summary.failed}
              </p>
              <p className="text-xs text-gray-500 mt-1">Total Tasks</p>
            </div>
            <div className="bg-gray-900 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-green-400">{summary.done}</p>
              <p className="text-xs text-gray-500 mt-1">Completed</p>
            </div>
            <div className="bg-gray-900 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-blue-400">{summary.agents.length}</p>
              <p className="text-xs text-gray-500 mt-1">Agents</p>
            </div>
          </div>
        </div>
      )}

      {/* MCP Config */}
      <div className="bg-gray-800 rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
          MCP Configuration
        </h2>
        <p className="text-xs text-gray-500 mb-2">
          Add this to your agent's MCP config to connect:
        </p>
        <pre className="bg-gray-950 rounded-lg p-4 text-sm text-gray-300 font-mono overflow-x-auto">
          {`{
  "mcpServers": {
    "atc": {
      "command": "node",
      "args": ["path/to/packages/server/dist/index.js", "--mcp"]
    }
  }
}`}
        </pre>
      </div>
    </div>
  );
}
