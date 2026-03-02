import { useEffect, useRef, useState } from 'react';
import { AgentActivityPanel } from '../components/agents/AgentActivityPanel';
import { OpenCodeChatPanel } from '../components/agents/OpenCodeChatPanel';
import { useAgentStore } from '../stores/agent-store';
import { useWorkspaceStore } from '../stores/workspace-store';
import type { Agent, DiscoveredInstance } from '../types';

const statusColors = {
  active: 'bg-green-500',
  disconnected: 'bg-red-500',
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

function getFolderName(path: string): string {
  return path.split(/[/\\]/).pop() || path;
}

function AgentCard({
  agent,
  onUntrack,
  onExit,
  onHealthCheck,
  onChat,
  onActivity,
  onRename,
  onRoleChange,
}: {
  agent: Agent;
  onUntrack: (id: string) => void;
  onExit?: (id: string) => void;
  onHealthCheck?: (id: string) => void;
  onChat?: (id: string) => void;
  onActivity?: (id: string) => void;
  onRename?: (id: string, newName: string) => void;
  onRoleChange?: (id: string, role: 'main' | 'worker') => void;
}) {
  const isMain = agent.role === 'main';
  const isActive = agent.status === 'active';
  const isOpenCode = agent.connectionType === 'opencode';
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(agent.name);
  const [copied, setCopied] = useState(false);
  const [copiedSession, setCopiedSession] = useState(false);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-colors">
      {/* Header: Icon + Name + Status + Type */}
      <div className="flex items-start gap-3 mb-3">
        <div
          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
            isMain
              ? 'bg-gradient-to-br from-yellow-500 to-orange-500'
              : 'bg-gradient-to-br from-blue-500 to-purple-500'
          }`}
        >
          {isMain ? (
            <svg
              className="w-4 h-4 text-white"
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
              className="w-4 h-4 text-white"
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
        <div className="flex-1 min-w-0">
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
              className="bg-gray-800 border border-blue-500 rounded px-2 py-0.5 text-white font-medium text-sm focus:outline-none w-full"
            />
          ) : (
            <div className="flex items-center gap-2">
              <h3
                className="font-medium text-white text-sm truncate cursor-pointer hover:text-blue-400 transition-colors flex items-center gap-1 group"
                onClick={() => {
                  setEditName(agent.name);
                  setEditing(true);
                }}
                title="Click to rename"
              >
                {agent.name}
                <svg
                  className="w-3 h-3 text-gray-600 group-hover:text-blue-400 transition-colors opacity-0 group-hover:opacity-100"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                  />
                </svg>
              </h3>
            </div>
          )}
          {agent.sessionTitle && agent.sessionTitle !== agent.name && (
            <p className="text-xs text-purple-400 truncate mt-0.5" title={agent.sessionTitle}>
              {agent.sessionTitle}
            </p>
          )}
          <div className="flex items-center gap-2 mt-0.5">
            <span className={`w-1.5 h-1.5 rounded-full ${statusColors[agent.status]}`} />
            <span className={`text-xs ${isActive ? 'text-green-400' : 'text-red-400'}`}>
              {isActive ? 'Online' : 'Offline'}
            </span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded ${connectionTypeColors[agent.connectionType]}`}
            >
              {agent.connectionType.toUpperCase()}
            </span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded font-semibold uppercase ${
                isMain
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
              }`}
            >
              {isMain ? 'MAIN' : 'WORKER'}
            </span>
          </div>
        </div>
      </div>

      {/* Info Row: Port, Stats */}
      <div className="flex items-center justify-between text-xs text-gray-500 mb-3">
        <div className="flex items-center gap-3">
          <span>Port {extractPort(agent.serverUrl)}</span>
          {isOpenCode && agent.serverUrl && (
            <button
              onClick={() => {
                navigator.clipboard.writeText(agent.serverUrl);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1"
              title="Copy URL"
            >
              {copied ? (
                <svg
                  className="w-3 h-3 text-green-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              ) : (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              )}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 text-gray-400">
          <span className="text-green-400">✓{agent.tasksCompleted}</span>
          <span className="text-red-400">✗{agent.tasksFailed}</span>
        </div>
      </div>

      {/* Metadata Section */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] mb-3">
        {agent.cwd && (
          <div className="flex items-center gap-1" title={agent.cwd}>
            <svg className="w-3 h-3 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
            </svg>
            <span className="text-gray-500">CWD:</span>
            <span className="text-gray-300 font-medium">{getFolderName(agent.cwd)}</span>
          </div>
        )}
        {agent.processId && (
          <div className="flex items-center gap-1">
            <span className="text-gray-500">PID:</span>
            <span className="text-gray-300 font-mono">{agent.processId}</span>
          </div>
        )}
        {agent.sessionId && (
          <div className="flex items-center gap-1" title={agent.sessionId}>
            <span className="text-gray-500">Session:</span>
            <span className="text-gray-300 font-mono">{agent.sessionTitle || agent.sessionId.slice(0, 8)}</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(agent.sessionId);
                setCopiedSession(true);
                setTimeout(() => setCopiedSession(false), 2000);
              }}
              className="text-gray-500 hover:text-gray-300 transition-colors"
              title="Copy Session ID"
            >
              {copiedSession ? (
                <svg className="w-3 h-3 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </div>
        )}
        <div className="flex items-center gap-1">
          <span className="text-gray-500">Uptime:</span>
          <span className="text-gray-300">{formatDuration(agent.connectedAt)}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-gray-500">Heartbeat:</span>
          <span className="text-gray-300">{formatDuration(agent.lastHeartbeat)}</span>
        </div>
      </div>
      {/* Current Task */}
      {agent.currentTaskId && (
        <div className="mb-3 p-2 bg-gray-800/50 rounded text-xs">
          <span className="text-gray-500">Task: </span>
          <span className="text-gray-300 truncate">
            {agent.currentTaskTitle || agent.currentTaskId.slice(0, 8)}
          </span>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-1.5 pt-3 border-t border-gray-800">
        {isOpenCode && onHealthCheck && (
          <button
            onClick={() => onHealthCheck(agent.id)}
            className="text-[10px] px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors"
            title="Health Check"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </button>
        )}
        {isActive && onChat && isOpenCode && (
          <button
            onClick={() => onChat(agent.id)}
            className="text-[10px] px-2 py-1 bg-purple-600/80 hover:bg-purple-500 text-white rounded transition-colors flex items-center gap-1"
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
        {onActivity && (
          <button
            onClick={() => onActivity(agent.id)}
            className="text-[10px] px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded transition-colors flex items-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
              />
            </svg>
            Activity
          </button>
        )}
        <div className="flex-1" />
        {isActive && onRoleChange && (
          <button
            onClick={() => onRoleChange(agent.id, isMain ? 'worker' : 'main')}
            className={`text-[10px] px-2 py-1 rounded transition-colors border ${
              isMain
                ? 'bg-gray-600/20 hover:bg-gray-600/30 text-gray-400 border-gray-600/30'
                : 'bg-amber-600/20 hover:bg-amber-600/30 text-amber-400 border-amber-600/30'
            }`}
          >
            {isMain ? '⬇ Demote' : '⬆ Promote'}
          </button>
        )}
        {!isActive && (
          <button
            onClick={() => onUntrack(agent.id)}
            className="text-[10px] px-2 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer"
            title="Remove from database"
          >
            Delete
          </button>
        )}
        {isActive && (
          <>
            <button
              onClick={() => onUntrack(agent.id)}
              className="text-[10px] px-2 py-1 rounded bg-gray-600/20 text-gray-400 hover:bg-gray-600/30 transition-colors cursor-pointer"
              title="Disconnect — remove from dashboard (process keeps running)"
            >
              Disconnect
            </button>
            {isOpenCode && onExit && (
              <button
                onClick={() => {
                  if (confirm('Exit will terminate the OpenCode process. Continue?')) {
                    onExit(agent.id);
                  }
                }}
                className="text-[10px] px-2 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer"
                title="Exit — terminate OpenCode process"
              >
                Exit
              </button>
            )}
          </>
        )}
      </div>
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
  onSpawn: (input: { name?: string; cwd?: string }) => Promise<void>;
  loading: boolean;
}) {
  const [name, setName] = useState('');
  const [selectedWorkspace, setSelectedWorkspace] = useState('');
  const [result, setResult] = useState<string | null>(null);
  const { workspaces } = useWorkspaceStore();
  const activeWorkspaces = workspaces.filter((w) => w.status === 'active');


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);
    try {
      await onSpawn({
        name: name.trim() || undefined,
        cwd: selectedWorkspace || undefined,
      });
      setResult('Agent spawned successfully!');
      setName('');
      setSelectedWorkspace('');
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
          <label className="block text-sm font-medium text-gray-400 mb-1">Workspace</label>
          <select
            value={selectedWorkspace}
            onChange={(e) => setSelectedWorkspace(e.target.value)}
            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:border-blue-500"
          >
            <option value="">Server default directory</option>
            {activeWorkspaces.map((ws) => (
              <option key={ws.id} value={ws.repoRoot} title={ws.repoRoot}>
                {ws.repoRoot.split(/[/\\]/).pop() || ws.repoRoot}
              </option>
            ))}
          </select>
          {activeWorkspaces.length === 0 && (
            <p className="text-xs text-gray-600 mt-1">No active workspaces. Create one in Settings.</p>
          )}
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

interface CollapsibleSectionProps {
  id: string;
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  count: number;
  activeCount: number;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

function CollapsibleSection({
  id,
  title,
  subtitle,
  icon,
  count,
  activeCount,
  expanded,
  onToggle,
  children,
}: CollapsibleSectionProps) {
  return (
    <div className="border border-gray-800 rounded-xl overflow-hidden bg-gray-900/30">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800/50 transition-colors text-left"
      >
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {icon}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-white text-sm">{title}</span>
            {subtitle && (
              <span className="text-xs text-gray-500 truncate hidden sm:inline" title={subtitle}>
                {subtitle}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Status dots summary */}
          <div className="flex items-center gap-1">
            {activeCount > 0 && (
              <>
                {Array.from({ length: Math.min(activeCount, 5) }).map((_, i) => (
                  <div key={`active-${i}`} className="w-1.5 h-1.5 rounded-full bg-green-500" />
                ))}
                {activeCount > 5 && <span className="text-[10px] text-green-500 ml-0.5">+</span>}
              </>
            )}
            {count - activeCount > 0 && (
              <>
                {Array.from({ length: Math.min(count - activeCount, 3) }).map((_, i) => (
                  <div key={`inactive-${i}`} className="w-1.5 h-1.5 rounded-full bg-red-500" />
                ))}
                {count - activeCount > 3 && (
                  <span className="text-[10px] text-red-500 ml-0.5">+</span>
                )}
              </>
            )}
          </div>
          {/* Count badge */}
          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">
            {count}
          </span>
        </div>
      </button>
      <div
        className={`overflow-hidden transition-all duration-200 ease-in-out ${expanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <div className="p-4 pt-0">{children}</div>
      </div>
    </div>
  );
}

export function AgentsPage() {
  const {
    agents,
    loading,
    fetchAgents,
    removeAgentApi,
    untrackAgent,
    registerOpenCodeAgent,
    checkAgentHealth,
    spawnOpenCodeAgent,
    discoveredInstances,
    detectedProcesses,
    scanning,
    scanForAgents,
    trackDiscoveredAgent,
    renameAgent,
    updateAgentRole,
    reloading,
    reloadAgents,
    purgeDisconnected,
  } = useAgentStore();
  const { workspaces, fetchWorkspaces } = useWorkspaceStore();
  const [registerLoading, setRegisterLoading] = useState(false);
  const [spawnLoading, setSpawnLoading] = useState(false);
  const [selectedChatAgentId, setSelectedChatAgentId] = useState<string | null>(null);
  const [selectedActivityAgentId, setSelectedActivityAgentId] = useState<string | null>(null);

  // Collapsible state - empty set means all collapsed by default
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  const selectedChatAgent = agents.find((a) => a.id === selectedChatAgentId);
  const selectedActivityAgent = agents.find((a) => a.id === selectedActivityAgentId);

  // Auto-scan once on mount
  const hasScanRef = useRef(false);
  useEffect(() => {
    fetchAgents();
    fetchWorkspaces();
    if (!hasScanRef.current) {
      hasScanRef.current = true;
      scanForAgents();
    }
    const interval = setInterval(fetchAgents, 30000);
    return () => clearInterval(interval);
  }, [fetchAgents, scanForAgents, fetchWorkspaces]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

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

  const handleActivity = (agentId: string) => {
    setSelectedActivityAgentId(agentId);
  };

  const handleSpawn = async (input: { name?: string; cwd?: string }) => {
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

  const handleRoleChange = async (agentId: string, role: 'main' | 'worker') => {
    await updateAgentRole(agentId, role);
  };
  const handleUntrack = async (agentId: string) => {
    await untrackAgent(agentId);
  };

  const handleExit = async (agentId: string) => {
    await removeAgentApi(agentId);
  };

  const unregisteredDiscovered = discoveredInstances.filter((d) => !d.alreadyRegistered);

  // TUI-only processes: running but no HTTP server (can't be tracked)
  const tuiOnlyProcesses = detectedProcesses.filter((p) => !p.hasHttpServer);

  // Disconnected agents for cleanup section
  const disconnectedAgents = agents.filter((a) => a.status === 'disconnected');

  // Filter out idle instances (no title, no CWD) from workspace display — these are idle opencode instances
  const displayAgents = agents.filter((a) => a.sessionTitle || a.cwd || a.status === 'disconnected');

  // Group agents by workspace repo → worktree, with CWD fallback
  // Flattened: repoRoot -> agents (removed worktree sub-grouping since CWD fallback makes them equal)
  const agentWorkspaceMap = new Map<string, Agent[]>();
  const unassignedAgents: Agent[] = [];

  for (const agent of displayAgents) {
    const ws = workspaces.find((w) => w.agentId === agent.id && w.status === 'active');
    if (ws) {
      // Active workspace match → group by repoRoot
      if (!agentWorkspaceMap.has(ws.repoRoot)) {
        agentWorkspaceMap.set(ws.repoRoot, []);
      }
      agentWorkspaceMap.get(ws.repoRoot)!.push(agent);
    } else if (agent.cwd) {
      // CWD fallback → group by cwd directory
      if (!agentWorkspaceMap.has(agent.cwd)) {
        agentWorkspaceMap.set(agent.cwd, []);
      }
      agentWorkspaceMap.get(agent.cwd)!.push(agent);
    } else {
      // No workspace, no CWD → unassigned
      unassignedAgents.push(agent);
    }
  }

  // Calculate total counts
  const totalAgents = agents.length;
  const activeAgents = agents.filter((a) => a.status === 'active').length;
  const disconnectedCount = agents.filter((a) => a.status === 'disconnected').length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">
            Agents
            <span className="ml-2 text-sm font-normal text-gray-500">
              ({activeAgents}/{totalAgents})
            </span>
          </h1>
          <p className="text-gray-400 text-sm mt-1">Monitor your agent fleet status</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Reload button */}
          <button
            onClick={() => reloadAgents()}
            disabled={reloading}
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
            title="Reload agents (health check + re-discover)"
          >
            {reloading ? (
              <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            )}
            {reloading ? 'Reloading...' : 'Reload'}
          </button>
          {/* Clean up disconnected agents */}
          {disconnectedCount > 0 && (
            <button
              onClick={() => purgeDisconnected()}
              className="px-3 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg font-medium transition-colors flex items-center gap-2"
              title={`Remove ${disconnectedCount} disconnected agent${disconnectedCount > 1 ? 's' : ''}`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Clean Up ({disconnectedCount})
            </button>
          )}
          {/* Scan for new agents */}
          <button
            onClick={() => scanForAgents()}
            disabled={scanning}
            className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
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
            {scanning ? 'Scanning...' : 'Scan'}
          </button>
        </div>
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
          {/* Workspace-grouped agents - Collapsible */}
          <div className="space-y-3">
            {Array.from(agentWorkspaceMap.entries()).map(([repoRoot, groupAgents]) => {
              const groupId = `workspace-${repoRoot}`;
              const activeCount = groupAgents.filter((a) => a.status === 'active').length;
              return (
                <CollapsibleSection
                  key={repoRoot}
                  id={groupId}
                  title={getFolderName(repoRoot)}
                  subtitle={repoRoot}
                  icon={
                    <svg
                      className="w-5 h-5 text-gray-500"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
                      />
                    </svg>
                  }
                  count={groupAgents.length}
                  activeCount={activeCount}
                  expanded={expandedGroups.has(groupId)}
                  onToggle={() => toggleGroup(groupId)}
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {groupAgents.map((agent) => (
                      <AgentCard
                        key={agent.id}
                        agent={agent}
                        onUntrack={handleUntrack}
                        onExit={handleExit}
                        onHealthCheck={
                          agent.connectionType === 'opencode' ? handleHealthCheck : undefined
                        }
                        onChat={
                          agent.connectionType === 'opencode' && agent.status === 'active'
                            ? handleChat
                            : undefined
                        }
                        onRename={handleRename}
                        onActivity={handleActivity}
                        onRoleChange={
                          agent.connectionType === 'opencode' ? handleRoleChange : undefined
                        }
                      />
                    ))}
                  </div>
                </CollapsibleSection>
              );
            })}
          </div>

          {/* Unassigned agents (no workspace) - Collapsible */}
          {unassignedAgents.length > 0 && (
            <CollapsibleSection
              id="unassigned"
              title="Unassigned"
              icon={
                <svg
                  className="w-5 h-5 text-gray-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
              }
              count={unassignedAgents.length}
              activeCount={unassignedAgents.filter((a) => a.status === 'active').length}
              expanded={expandedGroups.has('unassigned')}
              onToggle={() => toggleGroup('unassigned')}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {unassignedAgents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    onUntrack={handleUntrack}
                    onExit={handleExit}
                    onHealthCheck={
                      agent.connectionType === 'opencode' ? handleHealthCheck : undefined
                    }
                    onChat={
                      agent.connectionType === 'opencode' && agent.status === 'active'
                        ? handleChat
                        : undefined
                    }
                    onRename={handleRename}
                    onActivity={handleActivity}
                    onRoleChange={
                      agent.connectionType === 'opencode' ? handleRoleChange : undefined
                    }
                  />
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Discovered Instances - Collapsible (default collapsed) */}
          {unregisteredDiscovered.length > 0 && (
            <CollapsibleSection
              id="discovered"
              title={`Discovered Instances (${unregisteredDiscovered.length})`}
              subtitle="Unregistered OpenCode instances found via port scan"
              icon={
                <svg
                  className="w-5 h-5 text-blue-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
              }
              count={unregisteredDiscovered.length}
              activeCount={unregisteredDiscovered.length}
              expanded={expandedGroups.has('discovered')}
              onToggle={() => toggleGroup('discovered')}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {unregisteredDiscovered.map((instance) => (
                  <div
                    key={instance.serverUrl}
                    className="bg-gray-900 border border-dashed border-gray-700 rounded-lg p-4 flex items-center justify-between"
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
            </CollapsibleSection>
          )}

          {/* TUI-Only Processes - Collapsible (default collapsed) */}
          {tuiOnlyProcesses.length > 0 && (
            <CollapsibleSection
              id="tui-only"
              title={`TUI-Only Processes (${tuiOnlyProcesses.length})`}
              subtitle="Running without HTTP server - cannot be tracked"
              icon={
                <svg
                  className="w-5 h-5 text-yellow-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              }
              count={tuiOnlyProcesses.length}
              activeCount={tuiOnlyProcesses.length}
              expanded={expandedGroups.has('tui-only')}
              onToggle={() => toggleGroup('tui-only')}
            >
              <div className="bg-yellow-500/5 border border-yellow-500/20 rounded-lg p-3 mb-3">
                <p className="text-sm text-yellow-300/80">
                  These OpenCode instances are running in TUI mode without an HTTP server. They
                  cannot be tracked or controlled remotely.
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {tuiOnlyProcesses.map((proc) => (
                  <div
                    key={proc.pid}
                    className="bg-gray-900 border border-dashed border-yellow-700/40 rounded-lg p-4"
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
            </CollapsibleSection>
          )}

          {/* Disconnected Agents — cleanup section */}
          {disconnectedAgents.length > 0 && (
            <CollapsibleSection
              id="disconnected"
              title={`Disconnected (${disconnectedAgents.length})`}
              subtitle="Offline agents in database — clean up as needed"
              icon={
                <svg
                  className="w-5 h-5 text-red-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              }
              count={disconnectedAgents.length}
              activeCount={0}
              expanded={expandedGroups.has('disconnected')}
              onToggle={() => toggleGroup('disconnected')}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {disconnectedAgents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    onUntrack={handleUntrack}
                    onExit={handleExit}
                    onRename={handleRename}
                    onActivity={handleActivity}
                  />
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Disconnected Agents — cleanup section */}
          {disconnectedAgents.length > 0 && (
            <CollapsibleSection
              id="disconnected"
              title={`Disconnected (${disconnectedAgents.length})`}
              subtitle="Offline agents in database — clean up as needed"
              icon={
                <svg
                  className="w-5 h-5 text-gray-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              }
              count={disconnectedAgents.length}
              activeCount={0}
              expanded={expandedGroups.has('disconnected')}
              onToggle={() => toggleGroup('disconnected')}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                {disconnectedAgents.map((agent) => (
                  <AgentCard
                    key={agent.id}
                    agent={agent}
                    onUntrack={handleUntrack}
                    onExit={handleExit}
                    onRename={handleRename}
                    onActivity={handleActivity}
                  />
                ))}
              </div>
            </CollapsibleSection>
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

      {selectedActivityAgent && (
        <AgentActivityPanel
          agent={selectedActivityAgent}
          onClose={() => setSelectedActivityAgentId(null)}
        />
      )}
    </div>
  );
}
