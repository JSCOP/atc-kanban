import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { BoardSummary } from '../types';

export function SettingsPage() {
  const [health, setHealth] = useState<{ status: string; timestamp: string } | null>(null);
  const [summary, setSummary] = useState<BoardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/health').then((r) => r.json()),
      api.getBoardSummary(),
    ])
      .then(([h, s]) => {
        setHealth(h);
        setSummary(s);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

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

      {/* Server Status */}
      <div className="bg-gray-800 rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Server Status</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500">Status</p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`w-2 h-2 rounded-full ${health?.status === 'ok' ? 'bg-green-500' : 'bg-red-500'}`} />
              <span className="text-gray-300">{health?.status === 'ok' ? 'Online' : 'Offline'}</span>
            </div>
          </div>
          <div>
            <p className="text-xs text-gray-500">Server Time</p>
            <p className="mt-1 text-gray-300 font-mono text-sm">
              {health?.timestamp ? new Date(health.timestamp).toLocaleString() : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* Project Info */}
      <div className="bg-gray-800 rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Project</h2>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500">Name</p>
            <p className="mt-1 text-gray-300">Default Project</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Project ID</p>
            <p className="mt-1 text-gray-300 font-mono text-sm">default</p>
          </div>
        </div>
      </div>

      {/* Configuration */}
      <div className="bg-gray-800 rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Configuration</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-300">Lock TTL</p>
              <p className="text-xs text-gray-500">How long a task lock lasts before auto-expiry</p>
            </div>
            <span className="text-gray-400 font-mono bg-gray-900 px-3 py-1 rounded">30 minutes</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-300">Heartbeat Timeout</p>
              <p className="text-xs text-gray-500">Agent disconnects after this period without heartbeat</p>
            </div>
            <span className="text-gray-400 font-mono bg-gray-900 px-3 py-1 rounded">60 seconds</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-300">Lock Check Interval</p>
              <p className="text-xs text-gray-500">How often expired locks are cleaned up</p>
            </div>
            <span className="text-gray-400 font-mono bg-gray-900 px-3 py-1 rounded">30 seconds</span>
          </div>
        </div>
      </div>

      {/* Stats */}
      {summary && (
        <div className="bg-gray-800 rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">Statistics</h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-gray-900 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-gray-100">
                {summary.todo + summary.locked + summary.inProgress + summary.review + summary.done + summary.failed}
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
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">MCP Configuration</h2>
        <p className="text-xs text-gray-500 mb-2">Add this to your agent's MCP config to connect:</p>
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
