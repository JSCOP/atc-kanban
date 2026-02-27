import { useEffect, useRef, useState } from 'react';
import { OpenCodeChatPanel } from '../components/agents/OpenCodeChatPanel';
import { useAgentStore } from '../stores/agent-store';
import type { Agent, DetectedProcess, DiscoveredInstance } from '../types';

const statusColors = {
  active: 'bg-green-500',
  disconnected: 'bg-red-500',
};

const statusText = {
  active: 'Online',
  disconnected: 'Offline',
};

const connectionTypeColors = {
  mcp: 'bg-blue-500/20 text-blue-400',
  opencode: 'bg-purple-500/20 text-purple-400',
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

function extractPort(url: string | null): string {
  if (!url) return '—';
  try {
    return new URL(url).port || '80';
  } catch {
    return '—';
  }
}


function AgentCard({
  agent,
  onRemove,
  onHealthCheck,
  onChat,
  onRename,
}: {
  agent: Agent;
  onRemove: (id: string) => void;
  onHealthCheck?: (id: string) => void;
  onChat?: (id: string) => void;
  onRename?: (id: string, newName: string) => void;
}) {
  const isMain = agent.role === 'main';
  const isActive = agent.status === 'active';
  const isOpenCode = agent.connectionType === 'opencode';
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(agent.name);
  const [copied, setCopied] = useState(false);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 card-hover">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              isMain
                ? 'bg-gradient-to-br from-yellow-500 to-orange-500'
                : 'bg-gradient-to-br from-blue-500 to-purple-500'
            }`}
          >
            {isMain ? (
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"
                />
              </svg>
            ) : (
              <svg
                className="w-5 h-5 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            )}
          </div>
          <div>
            {editing ? (
              <input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                onBlur={() => {
                  setEditing(false);
                  if (editName.trim() && editName.trim() !== agent.name) {
                    onRename?.(agent.id, editName.trim());
                  } else {
                    setEditName(agent.name);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    setEditing(false);
                    if (editName.trim() && editName.trim() !== agent.name) {
                      onRename?.(agent.id, editName.trim());
                    } else {
                      setEditName(agent.name);
                    }
                  }
                  if (e.key === 'Escape') {
                    setEditing(false);
                    setEditName(agent.name);
                  }
                }}
                className="bg-gray-800 border border-blue-500 rounded px-1 py-0.5 text-white font-semibold text-sm focus:outline-none w-full"
              />
            ) : (
              <h3
                className="font-semibold text-white group/name cursor-pointer flex items-center gap-1"
                onClick={() => { setEditName(agent.name); setEditing(true); }}
                title="Click to rename"
              >
                {agent.name}
                <svg className="w-3 h-3 text-gray-600 group-hover/name:text-blue-400 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </h3>
            )}
            <p className="text-sm text-gray-500">{agent.agentType || 'Unknown Type'}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`text-xs px-2 py-0.5 rounded ${connectionTypeColors[agent.connectionType]}`}
          >
            {agent.connectionType.toUpperCase()}
          </span>
          <button
            onClick={() => onRemove(agent.id)}
            className="text-xs px-2.5 py-1 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer"
            title={isActive ? 'Disconnect and remove agent' : 'Remove agent'}
          >
            {isActive ? 'Disconnect' : 'Remove'}
          </button>
          <div className={`w-2 h-2 rounded-full ${statusColors[agent.status]}`} />
          <span className={`text-sm ${isActive ? 'text-green-400' : 'text-red-400'}`}>
            {statusText[agent.status]}
          </span>
        </div>
      </div>

      {agent.currentTaskId && (
        <div className="mb-4 p-3 bg-gray-800/50 rounded-lg">
          <p className="text-xs text-gray-500 mb-1">Current Task</p>
          <p className="text-sm text-gray-300 truncate">
            {agent.currentTaskTitle || agent.currentTaskId}
          </p>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-gray-800">
        <div>
          <p className="text-2xl font-bold text-white">{agent.tasksCompleted}</p>
          <p className="text-xs text-gray-500">Completed</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-red-400">{agent.tasksFailed}</p>
          <p className="text-xs text-gray-500">Failed</p>
        </div>
        {isOpenCode ? (
          <>
            <div>
              <p className="text-2xl font-bold text-white">{extractPort(agent.serverUrl)}</p>
              <p className="text-xs text-gray-500">Port</p>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p
                  className="text-sm font-mono text-gray-400 truncate max-w-[120px]"
                  title={agent.serverUrl ?? undefined}
                >
                  {agent.serverUrl ?? '—'}
                </p>
                {agent.serverUrl && (
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(agent.serverUrl);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="p-1 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors cursor-pointer"
                    title="Copy URL"
                  >
                    {copied ? (
                      <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    )}
                  </button>
                )}
              </div>
              <p className="text-xs text-gray-500">Server URL</p>
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="text-sm font-mono text-gray-400">{agent.processId ?? '—'}</p>
              <p className="text-xs text-gray-500">PID</p>
            </div>
            <div>
              <p
                className="text-sm font-mono text-gray-400 truncate"
                title={agent.cwd ?? undefined}
              >
                {agent.cwd ?? '—'}
              </p>
              <p className="text-xs text-gray-500">CWD</p>
            </div>
          </>
        )}
      </div>

      {isOpenCode && agent.serverUrl && (
        <p className="text-xs text-gray-600 mt-2">
          💡 Connect directly: opencode --server {agent.serverUrl}
        </p>
      )}

      {isOpenCode && onHealthCheck && (
        <div className="mt-4 pt-4 border-t border-gray-800 flex items-center gap-2">
          <button
            onClick={() => onHealthCheck(agent.id)}
            className="text-xs px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors"
          >
            Health Check
          </button>
          {isActive && onChat && (
            <button
              onClick={() => onChat(agent.id)}
              className="text-xs px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors flex items-center gap-1"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              Chat
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function RegisterOpenCodeForm({
  onRegister,
  loading,
}: {
  onRegister: (input: { name: string; serverUrl: string }) => Promise<void>;
  loading: boolean;
}) {
  const [name, setName] = useState('');
  const [serverUrl, setServerUrl] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !serverUrl.trim()) return;
    await onRegister({ name: name.trim(), serverUrl: serverUrl.trim() });
    setName('');
    setServerUrl('');
  };

  return (
    <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h3 className="text-lg font-semibold text-white mb-4">Register OpenCode Agent</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Agent name"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">Server URL</label>
          <input
            type="text"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="http://localhost:3000"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={loading || !name.trim() || !serverUrl.trim()}
        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? 'Registering...' : 'Register Agent'}
      </button>
    </form>
  );
}

function SpawnOpenCodeForm({
  onSpawn,
  loading,
}: {
  onSpawn: (input: { name: string; cwd: string }) => Promise<void>;
  loading: boolean;
}) {
  const [name, setName] = useState('');
  const [cwd, setCwd] = useState('');
  const [result, setResult] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);
    try {
      await onSpawn({
        name: name.trim() || (undefined as unknown as string),
        cwd: cwd.trim() || (undefined as unknown as string),
      });
      setResult('Agent spawned successfully!');
      setName('');
      setCwd('');
      setTimeout(() => setResult(null), 3000);
    } catch (err) {
      setResult(err instanceof Error ? err.message : 'Failed to spawn agent');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-gray-900 border border-gray-800 rounded-xl p-5">
      <h3 className="text-lg font-semibold text-white mb-1">Spawn New OpenCode Process</h3>
      <p className="text-xs text-gray-500 mb-4">
        Automatically start a new opencode server and register it as an agent
      </p>
      {result && (
        <div
          className={`p-2 mb-3 rounded-lg text-sm ${result.includes('success') ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}
        >
          {result}
        </div>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">Name (optional)</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Auto-generated if empty"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-400 mb-1">
            Working Directory (optional)
          </label>
          <input
            type="text"
            value={cwd}
            onChange={(e) => setCwd(e.target.value)}
            placeholder="Defaults to server CWD"
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={loading}
        className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
        {loading ? 'Spawning...' : 'Spawn Agent'}
      </button>
    </form>
  );
}

export function AgentsPage() {
  const {
    agents,
    loading,
    fetchAgents,
    removeAgentApi,
    registerOpenCodeAgent,
    checkAgentHealth,
    spawnOpenCodeAgent,
    discoveredInstances,
    detectedProcesses,
    scanning,
    scanForAgents,
    trackDiscoveredAgent,
    renameAgent,
  } = useAgentStore();
  const [registerLoading, setRegisterLoading] = useState(false);
  const [spawnLoading, setSpawnLoading] = useState(false);
  const [selectedChatAgentId, setSelectedChatAgentId] = useState<string | null>(null);

  const selectedChatAgent = agents.find((a) => a.id === selectedChatAgentId);

  // Auto-scan once on mount
  const hasScanRef = useRef(false);
  useEffect(() => {
    fetchAgents();
    if (!hasScanRef.current) {
      hasScanRef.current = true;
      scanForAgents();
    }
    const interval = setInterval(fetchAgents, 30000);
    return () => clearInterval(interval);
  }, [fetchAgents, scanForAgents]);

  const handleRegister = async (input: { name: string; serverUrl: string }) => {
    setRegisterLoading(true);
    try {
      await registerOpenCodeAgent(input);
    } finally {
      setRegisterLoading(false);
    }
  };

  const handleHealthCheck = async (agentId: string) => {
    await checkAgentHealth(agentId);
  };

  const handleChat = (agentId: string) => {
    setSelectedChatAgentId(agentId);
  };

  const handleSpawn = async (input: { name: string; cwd: string }) => {
    setSpawnLoading(true);
    try {
      await spawnOpenCodeAgent(input);
    } finally {
      setSpawnLoading(false);
    }
  };

  const handleTrack = async (instance: DiscoveredInstance) => {
    await trackDiscoveredAgent(instance.serverUrl);
  };

  const handleRename = async (agentId: string, newName: string) => {
    await renameAgent(agentId, newName);
  };

  const unregisteredDiscovered = discoveredInstances.filter((d) => !d.alreadyRegistered);

  // TUI-only processes: running but no HTTP server (can't be tracked)
  const tuiOnlyProcesses = detectedProcesses.filter((p) => !p.hasHttpServer);

  const mainAgent = agents.find((a) => a.role === 'main');
  const workerAgents = agents.filter((a) => a.role === 'worker' && a.connectionType === 'mcp');
  const opencodeAgents = agents.filter((a) => a.connectionType === 'opencode');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Agents</h1>
          <p className="text-gray-400 text-sm mt-1">Monitor your agent fleet status</p>
        </div>
        <button
          onClick={() => scanForAgents()}
          disabled={scanning}
          className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
        >
          {scanning ? (
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          )}
          {scanning ? 'Scanning...' : 'Scan for Agents'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <RegisterOpenCodeForm onRegister={handleRegister} loading={registerLoading} />
        <SpawnOpenCodeForm onSpawn={handleSpawn} loading={spawnLoading} />
      </div>

      {loading && agents.length === 0 ? (
        <div className="flex items-center justify-center h-64">
          <div className="flex items-center gap-3 text-gray-400">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
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
            Loading agents...
          </div>
        </div>
      ) : (
        <>
          {mainAgent && (
            <div>
              <h2 className="text-lg font-semibold text-white mb-4">Main Agent</h2>
              <div className="max-w-md">
                <AgentCard agent={mainAgent} onRemove={removeAgentApi} onRename={handleRename} />
              </div>
            </div>
          )}

          {workerAgents.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-white mb-4">
                MCP Worker Agents ({workerAgents.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {workerAgents.map((agent) => (
                  <AgentCard key={agent.id} agent={agent} onRemove={removeAgentApi} onRename={handleRename} />
                ))}
              </div>
            </div>
          )}

          {opencodeAgents.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-white mb-4">
                OpenCode Agents ({opencodeAgents.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {opencodeAgents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    onRemove={removeAgentApi}
                    onHealthCheck={handleHealthCheck}
                    onChat={handleChat}
                    onRename={handleRename}
                  />
                ))}
              </div>
            </div>
          )}

          {unregisteredDiscovered.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-white mb-4">
                Discovered Instances ({unregisteredDiscovered.length})
              </h2>
              <p className="text-xs text-gray-500 mb-3">
                Unregistered OpenCode instances found via port scan + PID detection
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {unregisteredDiscovered.map((instance) => (
                  <div
                    key={instance.serverUrl}
                    className="bg-gray-900 border border-dashed border-gray-700 rounded-xl p-5 flex items-center justify-between"
                  >
                    <div>
                      <p className="text-sm font-mono text-gray-300">{instance.serverUrl}</p>
                      <p className="text-xs text-gray-500">Port {instance.port}</p>
                    </div>
                    <button
                      onClick={() => handleTrack(instance)}
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs rounded-lg transition-colors"
                    >
                      Track
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tuiOnlyProcesses.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold text-yellow-400 mb-4">
                TUI-Only Processes ({tuiOnlyProcesses.length})
              </h2>
              <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-xl p-4 mb-4">
                <p className="text-sm text-yellow-300/80">
                  These OpenCode instances are running in TUI mode without an HTTP server.
                  They cannot be tracked or controlled remotely.
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  To make them discoverable, restart with:{' '}
                  <code className="bg-gray-800 px-1.5 py-0.5 rounded text-yellow-300 font-mono">
                    opencode --port 4096
                  </code>{' '}
                  or{' '}
                  <code className="bg-gray-800 px-1.5 py-0.5 rounded text-yellow-300 font-mono">
                    opencode serve
                  </code>
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {tuiOnlyProcesses.map((proc) => (
                  <div
                    key={proc.pid}
                    className="bg-gray-900 border border-dashed border-yellow-700/40 rounded-xl p-5"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400">
                        TUI Mode
                      </span>
                      <span className="text-xs text-gray-500">PID {proc.pid}</span>
                    </div>
                    <p className="text-sm font-mono text-gray-400 truncate" title={proc.command}>
                      {proc.command}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {agents.length === 0 && (
            <div className="text-center py-16 text-gray-500">
              <svg
                className="w-16 h-16 mx-auto mb-4 opacity-50"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              <p className="text-lg">No agents connected</p>
              <p className="text-sm mt-1">Agents will appear here when they connect</p>
            </div>
          )}
        </>
      )}

      {selectedChatAgent && (
        <OpenCodeChatPanel agent={selectedChatAgent} onClose={() => setSelectedChatAgentId(null)} />
      )}
    </div>
  );
}
