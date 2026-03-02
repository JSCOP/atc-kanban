import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Agent } from '../types';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProxyResponse {
  status: number;
  ok: boolean;
  data: unknown;
  error?: string;
}

interface ResponseData {
  status: number;
  ok: boolean;
  data: unknown;
  error?: string;
  timestamp: string;
  duration: number;
}

type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';

interface PathParam {
  name: string;
  description: string;
}

interface QueryParam {
  name: string;
  description: string;
  optional?: boolean;
}

interface EndpointDefinition {
  key: string;
  category: string;
  method: HttpMethod;
  path: string;
  description: string;
  pathParams?: PathParam[];
  queryParams?: QueryParam[];
  bodyExample?: unknown;
  dangerous?: boolean;
  sseNote?: boolean;
}

// ── Proxy helper ──────────────────────────────────────────────────────────────

async function proxyFetch(url: string, method = 'GET', body?: unknown): Promise<ProxyResponse> {
  const res = await fetch('/api/opencode-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, method, body }),
  });
  return res.json();
}

// ── Endpoint catalog ──────────────────────────────────────────────────────────

const ENDPOINTS: EndpointDefinition[] = [
  // 1. Global
  {
    key: 'global-health',
    category: 'Global',
    method: 'GET',
    path: '/global/health',
    description: 'Server health and version',
  },
  {
    key: 'global-event',
    category: 'Global',
    method: 'GET',
    path: '/global/event',
    description: 'Global events SSE stream',
    sseNote: true,
  },

  // 2. Project
  {
    key: 'project-list',
    category: 'Project',
    method: 'GET',
    path: '/project',
    description: 'List all projects',
  },
  {
    key: 'project-current',
    category: 'Project',
    method: 'GET',
    path: '/project/current',
    description: 'Get current project',
  },

  // 3. Path & VCS
  {
    key: 'path-get',
    category: 'Path & VCS',
    method: 'GET',
    path: '/path',
    description: 'Get current path',
  },
  {
    key: 'vcs-get',
    category: 'Path & VCS',
    method: 'GET',
    path: '/vcs',
    description: 'Get VCS info',
  },

  // 4. Instance
  {
    key: 'instance-dispose',
    category: 'Instance',
    method: 'POST',
    path: '/instance/dispose',
    description: 'Dispose current instance',
    dangerous: true,
    bodyExample: {},
  },

  // 5. Config
  {
    key: 'config-get',
    category: 'Config',
    method: 'GET',
    path: '/config',
    description: 'Get config',
  },
  {
    key: 'config-update',
    category: 'Config',
    method: 'PATCH',
    path: '/config',
    description: 'Update config',
    bodyExample: {},
  },
  {
    key: 'config-providers',
    category: 'Config',
    method: 'GET',
    path: '/config/providers',
    description: 'List providers and default models',
  },

  // 6. Provider
  {
    key: 'provider-list',
    category: 'Provider',
    method: 'GET',
    path: '/provider',
    description: 'List all providers',
  },
  {
    key: 'provider-auth',
    category: 'Provider',
    method: 'GET',
    path: '/provider/auth',
    description: 'Get provider auth methods',
  },

  // 7. Sessions
  {
    key: 'session-list',
    category: 'Sessions',
    method: 'GET',
    path: '/session',
    description: 'List all sessions',
  },
  {
    key: 'session-create',
    category: 'Sessions',
    method: 'POST',
    path: '/session',
    description: 'Create session',
    bodyExample: { parentID: '', title: 'My New Session' },
  },
  {
    key: 'session-status',
    category: 'Sessions',
    method: 'GET',
    path: '/session/status',
    description: 'Session status',
  },
  {
    key: 'session-get',
    category: 'Sessions',
    method: 'GET',
    path: '/session/:id',
    description: 'Get session',
    pathParams: [{ name: 'id', description: 'Session ID' }],
  },
  {
    key: 'session-delete',
    category: 'Sessions',
    method: 'DELETE',
    path: '/session/:id',
    description: 'Delete session',
    pathParams: [{ name: 'id', description: 'Session ID' }],
    dangerous: true,
  },
  {
    key: 'session-update',
    category: 'Sessions',
    method: 'PATCH',
    path: '/session/:id',
    description: 'Update session',
    pathParams: [{ name: 'id', description: 'Session ID' }],
    bodyExample: { title: 'Updated Title' },
  },
  {
    key: 'session-children',
    category: 'Sessions',
    method: 'GET',
    path: '/session/:id/children',
    description: 'Get child sessions',
    pathParams: [{ name: 'id', description: 'Session ID' }],
  },
  {
    key: 'session-todo',
    category: 'Sessions',
    method: 'GET',
    path: '/session/:id/todo',
    description: 'Get todo list',
    pathParams: [{ name: 'id', description: 'Session ID' }],
  },
  {
    key: 'session-fork',
    category: 'Sessions',
    method: 'POST',
    path: '/session/:id/fork',
    description: 'Fork session',
    pathParams: [{ name: 'id', description: 'Session ID' }],
    bodyExample: { messageID: '' },
  },
  {
    key: 'session-abort',
    category: 'Sessions',
    method: 'POST',
    path: '/session/:id/abort',
    description: 'Abort session',
    pathParams: [{ name: 'id', description: 'Session ID' }],
    bodyExample: {},
  },
  {
    key: 'session-share',
    category: 'Sessions',
    method: 'POST',
    path: '/session/:id/share',
    description: 'Share session',
    pathParams: [{ name: 'id', description: 'Session ID' }],
    bodyExample: {},
  },
  {
    key: 'session-unshare',
    category: 'Sessions',
    method: 'DELETE',
    path: '/session/:id/share',
    description: 'Unshare session',
    pathParams: [{ name: 'id', description: 'Session ID' }],
    dangerous: true,
  },
  {
    key: 'session-diff',
    category: 'Sessions',
    method: 'GET',
    path: '/session/:id/diff',
    description: 'Get session diff',
    pathParams: [{ name: 'id', description: 'Session ID' }],
    queryParams: [{ name: 'messageID', description: 'Message ID', optional: true }],
  },
  {
    key: 'session-summarize',
    category: 'Sessions',
    method: 'POST',
    path: '/session/:id/summarize',
    description: 'Summarize session',
    pathParams: [{ name: 'id', description: 'Session ID' }],
    bodyExample: { providerID: 'anthropic', modelID: 'claude-sonnet-4-5' },
  },
  {
    key: 'session-revert',
    category: 'Sessions',
    method: 'POST',
    path: '/session/:id/revert',
    description: 'Revert message',
    pathParams: [{ name: 'id', description: 'Session ID' }],
    bodyExample: { messageID: '', partID: '' },
  },
  {
    key: 'session-unrevert',
    category: 'Sessions',
    method: 'POST',
    path: '/session/:id/unrevert',
    description: 'Unrevert messages',
    pathParams: [{ name: 'id', description: 'Session ID' }],
    bodyExample: {},
  },
  {
    key: 'session-init',
    category: 'Sessions',
    method: 'POST',
    path: '/session/:id/init',
    description: 'Analyze app, create AGENTS.md',
    pathParams: [{ name: 'id', description: 'Session ID' }],
    bodyExample: { messageID: '', providerID: 'anthropic', modelID: 'claude-sonnet-4-5' },
  },

  // 8. Messages
  {
    key: 'message-list',
    category: 'Messages',
    method: 'GET',
    path: '/session/:id/message',
    description: 'List messages',
    pathParams: [{ name: 'id', description: 'Session ID' }],
    queryParams: [{ name: 'limit', description: 'Max messages to return', optional: true }],
  },
  {
    key: 'message-send',
    category: 'Messages',
    method: 'POST',
    path: '/session/:id/message',
    description: 'Send message (sync)',
    pathParams: [{ name: 'id', description: 'Session ID' }],
    bodyExample: {
      parts: [{ type: 'text', text: 'Hello, can you help me?' }],
      agent: '',
      model: '',
      noReply: false,
    },
  },
  {
    key: 'message-get',
    category: 'Messages',
    method: 'GET',
    path: '/session/:id/message/:messageID',
    description: 'Get message',
    pathParams: [
      { name: 'id', description: 'Session ID' },
      { name: 'messageID', description: 'Message ID' },
    ],
  },
  {
    key: 'message-prompt-async',
    category: 'Messages',
    method: 'POST',
    path: '/session/:id/prompt_async',
    description: 'Send message (async)',
    pathParams: [{ name: 'id', description: 'Session ID' }],
    bodyExample: {
      parts: [{ type: 'text', text: 'Hello, can you help me?' }],
      agent: '',
      model: '',
    },
  },
  {
    key: 'message-command',
    category: 'Messages',
    method: 'POST',
    path: '/session/:id/command',
    description: 'Execute slash command',
    pathParams: [{ name: 'id', description: 'Session ID' }],
    bodyExample: { command: 'compact', arguments: [], agent: '', model: '' },
  },
  {
    key: 'message-shell',
    category: 'Messages',
    method: 'POST',
    path: '/session/:id/shell',
    description: 'Run shell command',
    pathParams: [{ name: 'id', description: 'Session ID' }],
    bodyExample: { agent: 'default', command: 'ls -la', model: '' },
  },

  // 9. Commands
  {
    key: 'command-list',
    category: 'Commands',
    method: 'GET',
    path: '/command',
    description: 'List all commands',
  },

  // 10. Files
  {
    key: 'find-text',
    category: 'Files',
    method: 'GET',
    path: '/find',
    description: 'Search text in files',
    queryParams: [{ name: 'pattern', description: 'Search pattern (required)' }],
  },
  {
    key: 'find-file',
    category: 'Files',
    method: 'GET',
    path: '/find/file',
    description: 'Find files by name',
    queryParams: [
      { name: 'query', description: 'File name query (required)' },
      { name: 'type', description: 'File type filter', optional: true },
      { name: 'directory', description: 'Directory to search', optional: true },
      { name: 'limit', description: 'Max results', optional: true },
    ],
  },
  {
    key: 'find-symbol',
    category: 'Files',
    method: 'GET',
    path: '/find/symbol',
    description: 'Find workspace symbols',
    queryParams: [{ name: 'query', description: 'Symbol query (required)' }],
  },
  {
    key: 'file-list',
    category: 'Files',
    method: 'GET',
    path: '/file',
    description: 'List files/directories',
    queryParams: [{ name: 'path', description: 'Directory path', optional: true }],
  },
  {
    key: 'file-content',
    category: 'Files',
    method: 'GET',
    path: '/file/content',
    description: 'Read file content',
    queryParams: [{ name: 'path', description: 'File path (required)' }],
  },
  {
    key: 'file-status',
    category: 'Files',
    method: 'GET',
    path: '/file/status',
    description: 'Get tracked file status',
  },

  // 11. Tools (Experimental)
  {
    key: 'tool-ids',
    category: 'Tools (Experimental)',
    method: 'GET',
    path: '/experimental/tool/ids',
    description: 'List tool IDs',
  },
  {
    key: 'tool-list',
    category: 'Tools (Experimental)',
    method: 'GET',
    path: '/experimental/tool',
    description: 'List tools for model',
    queryParams: [
      { name: 'provider', description: 'Provider ID', optional: true },
      { name: 'model', description: 'Model ID', optional: true },
    ],
  },

  // 12. LSP, Formatters & MCP
  {
    key: 'lsp-status',
    category: 'LSP, Formatters & MCP',
    method: 'GET',
    path: '/lsp',
    description: 'LSP server status',
  },
  {
    key: 'formatter-status',
    category: 'LSP, Formatters & MCP',
    method: 'GET',
    path: '/formatter',
    description: 'Formatter status',
  },
  {
    key: 'mcp-status',
    category: 'LSP, Formatters & MCP',
    method: 'GET',
    path: '/mcp',
    description: 'MCP server status',
  },
  {
    key: 'mcp-add',
    category: 'LSP, Formatters & MCP',
    method: 'POST',
    path: '/mcp',
    description: 'Add MCP server',
    bodyExample: { name: 'my-mcp', config: {} },
  },

  // 13. Agents
  {
    key: 'agent-list',
    category: 'Agents',
    method: 'GET',
    path: '/agent',
    description: 'List all agents',
  },

  // 14. Logging
  {
    key: 'log-write',
    category: 'Logging',
    method: 'POST',
    path: '/log',
    description: 'Write log entry',
    bodyExample: {
      service: 'my-service',
      level: 'info',
      message: 'Hello from API tester',
      extra: {},
    },
  },

  // 15. TUI
  {
    key: 'tui-append-prompt',
    category: 'TUI',
    method: 'POST',
    path: '/tui/append-prompt',
    description: 'Append text to prompt',
    bodyExample: { text: 'Add this text to the current prompt' },
  },
  {
    key: 'tui-open-help',
    category: 'TUI',
    method: 'POST',
    path: '/tui/open-help',
    description: 'Open help dialog',
    bodyExample: {},
  },
  {
    key: 'tui-open-sessions',
    category: 'TUI',
    method: 'POST',
    path: '/tui/open-sessions',
    description: 'Open session selector',
    bodyExample: {},
  },
  {
    key: 'tui-open-themes',
    category: 'TUI',
    method: 'POST',
    path: '/tui/open-themes',
    description: 'Open theme selector',
    bodyExample: {},
  },
  {
    key: 'tui-open-models',
    category: 'TUI',
    method: 'POST',
    path: '/tui/open-models',
    description: 'Open model selector',
    bodyExample: {},
  },
  {
    key: 'tui-submit-prompt',
    category: 'TUI',
    method: 'POST',
    path: '/tui/submit-prompt',
    description: 'Submit prompt',
    bodyExample: {},
  },
  {
    key: 'tui-clear-prompt',
    category: 'TUI',
    method: 'POST',
    path: '/tui/clear-prompt',
    description: 'Clear prompt',
    bodyExample: {},
  },
  {
    key: 'tui-execute-command',
    category: 'TUI',
    method: 'POST',
    path: '/tui/execute-command',
    description: 'Execute command',
    bodyExample: { command: '/compact' },
  },
  {
    key: 'tui-show-toast',
    category: 'TUI',
    method: 'POST',
    path: '/tui/show-toast',
    description: 'Show toast',
    bodyExample: { title: 'Hello!', message: 'Toast from API tester', variant: 'success' },
  },
  {
    key: 'tui-control-next',
    category: 'TUI',
    method: 'GET',
    path: '/tui/control/next',
    description: 'Wait for next control request',
  },
  {
    key: 'tui-control-response',
    category: 'TUI',
    method: 'POST',
    path: '/tui/control/response',
    description: 'Respond to control request',
    bodyExample: { body: {} },
  },
  // Kept from original — not in official docs but exists
  {
    key: 'tui-select-session',
    category: 'TUI',
    method: 'POST',
    path: '/tui/select-session',
    description: 'Navigate TUI to session',
    bodyExample: { sessionID: '' },
  },

  // 16. Auth
  {
    key: 'auth-set',
    category: 'Auth',
    method: 'PUT',
    path: '/auth/:id',
    description: 'Set auth credentials',
    pathParams: [{ name: 'id', description: 'Provider ID' }],
    bodyExample: { token: 'your-api-key' },
  },

  // 17. Events
  {
    key: 'event-stream',
    category: 'Events',
    method: 'GET',
    path: '/event',
    description: 'SSE event stream',
    sseNote: true,
  },

  // 18. Docs
  {
    key: 'doc-openapi',
    category: 'Docs',
    method: 'GET',
    path: '/doc',
    description: 'OpenAPI 3.1 spec',
  },
];

// ── Category ordering ─────────────────────────────────────────────────────────

const CATEGORY_ORDER = [
  'Global',
  'Project',
  'Path & VCS',
  'Instance',
  'Config',
  'Provider',
  'Sessions',
  'Messages',
  'Commands',
  'Files',
  'Tools (Experimental)',
  'LSP, Formatters & MCP',
  'Agents',
  'Logging',
  'TUI',
  'Auth',
  'Events',
  'Docs',
];

const CATEGORY_COLORS: Record<string, string> = {
  Global: 'bg-emerald-500',
  Project: 'bg-blue-500',
  'Path & VCS': 'bg-cyan-500',
  Instance: 'bg-red-500',
  Config: 'bg-violet-500',
  Provider: 'bg-indigo-500',
  Sessions: 'bg-purple-500',
  Messages: 'bg-sky-500',
  Commands: 'bg-teal-500',
  Files: 'bg-lime-500',
  'Tools (Experimental)': 'bg-orange-500',
  'LSP, Formatters & MCP': 'bg-pink-500',
  Agents: 'bg-amber-500',
  Logging: 'bg-gray-400',
  TUI: 'bg-yellow-500',
  Auth: 'bg-rose-500',
  Events: 'bg-fuchsia-500',
  Docs: 'bg-slate-400',
};

// ── Method badge colors ───────────────────────────────────────────────────────

const METHOD_COLORS: Record<HttpMethod, string> = {
  GET: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  POST: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  PATCH: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  DELETE: 'bg-red-500/10 text-red-400 border-red-500/20',
  PUT: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
};

const STATUS_COLORS: Record<number, string> = {
  200: 'text-emerald-400',
  201: 'text-emerald-400',
  204: 'text-emerald-400',
  400: 'text-amber-400',
  401: 'text-amber-400',
  403: 'text-amber-400',
  404: 'text-amber-400',
  500: 'text-red-400',
};

// ── EndpointCard ──────────────────────────────────────────────────────────────

interface EndpointCardProps {
  endpoint: EndpointDefinition;
  baseUrl: string;
  isExpanded: boolean;
  onToggle: () => void;
  response: ResponseData | null;
  loading: boolean;
  onSend: (params: {
    pathValues: Record<string, string>;
    queryValues: Record<string, string>;
    bodyValue: string;
  }) => void;
  availableSessions: { id: string; title?: string }[];
  onLoadSessions: () => void;
  loadingSessions: boolean;
}

function EndpointCard({
  endpoint,
  baseUrl,
  isExpanded,
  onToggle,
  response,
  loading,
  onSend,
  availableSessions,
  onLoadSessions,
  loadingSessions,
}: EndpointCardProps) {
  const [pathValues, setPathValues] = useState<Record<string, string>>({});
  const [queryValues, setQueryValues] = useState<Record<string, string>>({});
  const [bodyValue, setBodyValue] = useState(
    endpoint.bodyExample !== undefined ? JSON.stringify(endpoint.bodyExample, null, 2) : '{}',
  );
  const [copied, setCopied] = useState(false);

  const hasPathParams = (endpoint.pathParams?.length ?? 0) > 0;
  const hasQueryParams = (endpoint.queryParams?.length ?? 0) > 0;
  const hasBody =
    endpoint.method === 'POST' || endpoint.method === 'PATCH' || endpoint.method === 'PUT';

  const buildUrl = () => {
    let url = baseUrl + endpoint.path;
    for (const [key, value] of Object.entries(pathValues)) {
      url = url.replace(`:${key}`, encodeURIComponent(value));
    }
    const queryEntries = Object.entries(queryValues).filter(([, v]) => v.trim() !== '');
    if (queryEntries.length > 0) {
      const params = new URLSearchParams();
      for (const [key, value] of queryEntries) {
        params.set(key, value);
      }
      url += `?${params.toString()}`;
    }
    return url;
  };

  const handleSessionSelect = (sessionId: string) => {
    if (hasPathParams && endpoint.pathParams?.some((p) => p.name === 'id')) {
      setPathValues((prev) => ({ ...prev, id: sessionId }));
    }
  };

  const canSend = () => {
    if (!baseUrl) return false;
    if (hasPathParams) {
      for (const param of endpoint.pathParams!) {
        if (!pathValues[param.name]?.trim()) return false;
      }
    }
    return true;
  };

  const handleCopyResponse = () => {
    if (!response) return;
    const text = response.error ?? JSON.stringify(response.data, null, 2);
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const statusColor = response
    ? (STATUS_COLORS[response.status] ?? (response.ok ? 'text-emerald-400' : 'text-red-400'))
    : '';

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      {/* Header Row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800/50 transition-colors text-left"
      >
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded border flex-shrink-0 ${METHOD_COLORS[endpoint.method]}`}
        >
          {endpoint.method}
        </span>
        {endpoint.dangerous && (
          <span className="text-amber-400 flex-shrink-0" title="Dangerous — use with caution">
            ⚠️
          </span>
        )}
        {endpoint.sseNote && (
          <span className="text-xs text-gray-500 flex-shrink-0 italic">[SSE]</span>
        )}
        <code className="text-sm font-mono text-gray-300 flex-shrink-0">{endpoint.path}</code>
        <span className="text-sm text-gray-500 flex-1 truncate">{endpoint.description}</span>
        {response && (
          <span className={`text-xs font-mono font-semibold flex-shrink-0 ${statusColor}`}>
            {response.status}
          </span>
        )}
      </button>

      {/* Expanded Content */}
      <div
        className={`overflow-hidden transition-all duration-200 ease-in-out ${isExpanded ? 'max-h-[3000px] opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <div className="p-4 pt-0 space-y-4">
          {/* SSE Note */}
          {endpoint.sseNote && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400 text-sm">
              ℹ️ This is an SSE (Server-Sent Events) stream endpoint — not fully testable in this UI.
              The request will be sent but the streaming response cannot be displayed here.
            </div>
          )}

          {/* Dangerous Warning */}
          {endpoint.dangerous && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              ⚠️ <strong>Dangerous endpoint</strong> — this action may be irreversible. Proceed with
              caution.
            </div>
          )}

          {/* Session ID Selector for endpoints with :id param */}
          {hasPathParams && endpoint.pathParams?.some((p) => p.name === 'id') && (
            <div className="flex items-center gap-2 p-3 bg-gray-800/50 rounded-lg">
              <span className="text-xs text-gray-400 flex-shrink-0">Quick select session:</span>
              <select
                onChange={(e) => handleSessionSelect(e.target.value)}
                className="flex-1 px-2 py-1 text-sm bg-gray-800 border border-gray-700 rounded text-gray-200 focus:outline-none focus:border-blue-500"
              >
                <option value="">Select a session...</option>
                {availableSessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title ? `${s.title} — ` : ''}
                    {s.id.slice(0, 20)}...
                  </option>
                ))}
              </select>
              <button
                onClick={onLoadSessions}
                disabled={loadingSessions || !baseUrl}
                className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors disabled:opacity-50 flex-shrink-0"
              >
                {loadingSessions ? 'Loading...' : 'Load Sessions'}
              </button>
            </div>
          )}

          {/* Path Parameters */}
          {hasPathParams && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                Path Parameters
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {endpoint.pathParams?.map((param) => (
                  <div key={param.name}>
                    <label className="block text-xs text-gray-500 mb-1">
                      <span className="text-gray-300">{param.name}</span>
                      <span className="text-gray-600 ml-1">({param.description})</span>
                    </label>
                    <input
                      type="text"
                      value={pathValues[param.name] || ''}
                      onChange={(e) =>
                        setPathValues((prev) => ({ ...prev, [param.name]: e.target.value }))
                      }
                      placeholder={param.description}
                      className="w-full px-3 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Query Parameters */}
          {hasQueryParams && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                Query Parameters
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {endpoint.queryParams?.map((param) => (
                  <div key={param.name}>
                    <label className="block text-xs text-gray-500 mb-1">
                      <span className="text-gray-300">{param.name}</span>
                      {param.optional && <span className="text-gray-600 ml-1">(optional)</span>}
                      <span className="text-gray-600 ml-1">— {param.description}</span>
                    </label>
                    <input
                      type="text"
                      value={queryValues[param.name] || ''}
                      onChange={(e) =>
                        setQueryValues((prev) => ({ ...prev, [param.name]: e.target.value }))
                      }
                      placeholder={param.description}
                      className="w-full px-3 py-1.5 text-sm bg-gray-800 border border-gray-700 rounded text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Body */}
          {hasBody && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-gray-400 uppercase tracking-wide">
                Request Body (JSON)
              </h4>
              <textarea
                value={bodyValue}
                onChange={(e) => setBodyValue(e.target.value)}
                rows={6}
                className="w-full px-3 py-2 text-sm bg-gray-800 border border-gray-700 rounded text-gray-200 font-mono focus:outline-none focus:border-blue-500 resize-y"
              />
            </div>
          )}

          {/* URL Preview */}
          <div className="p-3 bg-gray-950 rounded border border-gray-800">
            <span className="text-xs text-gray-500">URL:</span>
            <code className="block text-sm font-mono text-gray-300 mt-1 break-all">
              {buildUrl()}
            </code>
          </div>

          {/* Send Button */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => onSend({ pathValues, queryValues, bodyValue })}
              disabled={loading || !canSend()}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
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
              {loading ? 'Sending...' : 'Send Request'}
            </button>
            {!baseUrl && <span className="text-xs text-amber-400">Select a target URL first</span>}
          </div>

          {/* Response Panel */}
          {response && (
            <div className="border border-gray-800 rounded-lg overflow-hidden">
              <div className="flex items-center gap-3 px-4 py-2 bg-gray-800/50 border-b border-gray-800">
                <span className="text-xs text-gray-400">Response</span>
                <span className={`text-sm font-mono font-semibold ${statusColor}`}>
                  {response.status}
                </span>
                <span className="text-xs text-gray-500">{response.ok ? 'OK' : 'Error'}</span>
                <span className="text-xs text-gray-600 ml-auto">{response.duration}ms</span>
                <span className="text-xs text-gray-600">{response.timestamp}</span>
                <button
                  onClick={handleCopyResponse}
                  className="text-xs px-2 py-0.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                >
                  {copied ? '✓ Copied' : 'Copy'}
                </button>
              </div>
              <div className="p-4 bg-gray-950 max-h-96 overflow-y-auto">
                {response.error ? (
                  <div className="text-red-400 text-sm">{response.error}</div>
                ) : (
                  <pre className="font-mono text-sm text-gray-300 overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(response.data, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── CategorySection ───────────────────────────────────────────────────────────

interface CategorySectionProps {
  category: string;
  endpoints: EndpointDefinition[];
  expandedEndpoint: string | null;
  onToggle: (key: string) => void;
  responses: Record<string, ResponseData>;
  loadingEndpoints: Record<string, boolean>;
  onSend: (
    endpoint: EndpointDefinition,
    params: {
      pathValues: Record<string, string>;
      queryValues: Record<string, string>;
      bodyValue: string;
    },
  ) => void;
  baseUrl: string;
  availableSessions: { id: string; title?: string }[];
  onLoadSessions: () => void;
  loadingSessions: boolean;
}

function CategorySection({
  category,
  endpoints,
  expandedEndpoint,
  onToggle,
  responses,
  loadingEndpoints,
  onSend,
  baseUrl,
  availableSessions,
  onLoadSessions,
  loadingSessions,
}: CategorySectionProps) {
  const [allExpanded, setAllExpanded] = useState(false);
  const dotColor = CATEGORY_COLORS[category] ?? 'bg-gray-500';

  const handleExpandAll = () => {
    setAllExpanded(true);
    // Expand all endpoints in this category by toggling each that isn't expanded
    for (const ep of endpoints) {
      if (expandedEndpoint !== ep.key) {
        onToggle(ep.key);
      }
    }
  };

  const handleCollapseAll = () => {
    setAllExpanded(false);
    // Collapse any expanded endpoint in this category
    for (const ep of endpoints) {
      if (expandedEndpoint === ep.key) {
        onToggle(ep.key);
      }
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-semibold text-gray-200 flex items-center gap-2 flex-1">
          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotColor}`} />
          {category}
          <span className="text-sm font-normal text-gray-500">({endpoints.length})</span>
        </h2>
        <button
          onClick={handleExpandAll}
          className="text-xs px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded transition-colors"
        >
          Expand All
        </button>
        <button
          onClick={handleCollapseAll}
          className="text-xs px-2 py-1 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded transition-colors"
        >
          Collapse All
        </button>
      </div>
      <div className="space-y-2">
        {endpoints.map((endpoint) => (
          <EndpointCard
            key={endpoint.key}
            endpoint={endpoint}
            baseUrl={baseUrl}
            isExpanded={expandedEndpoint === endpoint.key}
            onToggle={() => onToggle(endpoint.key)}
            response={responses[endpoint.key] ?? null}
            loading={loadingEndpoints[endpoint.key] ?? false}
            onSend={(params) => onSend(endpoint, params)}
            availableSessions={availableSessions}
            onLoadSessions={onLoadSessions}
            loadingSessions={loadingSessions}
          />
        ))}
      </div>
    </div>
  );
}

// ── ApiTesterPage ─────────────────────────────────────────────────────────────

export function ApiTesterPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgentId, setSelectedAgentId] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [loadingAgents, setLoadingAgents] = useState(true);
  const [expandedEndpoint, setExpandedEndpoint] = useState<string | null>(null);
  const [responses, setResponses] = useState<Record<string, ResponseData>>({});
  const [loadingEndpoints, setLoadingEndpoints] = useState<Record<string, boolean>>({});
  const [availableSessions, setAvailableSessions] = useState<{ id: string; title?: string }[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);

  const baseUrl = selectedAgentId
    ? (agents.find((a) => a.id === selectedAgentId)?.serverUrl ?? '')
    : customUrl;

  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgents = async () => {
    try {
      const data = await api.getAgents();
      const opencodeAgents = data.filter((a) => a.connectionType === 'opencode' && a.serverUrl);
      setAgents(opencodeAgents);
    } catch (err) {
      console.error('Failed to load agents:', err);
    } finally {
      setLoadingAgents(false);
    }
  };

  const handleLoadSessions = async () => {
    if (!baseUrl) return;
    setLoadingSessions(true);
    try {
      const result = await proxyFetch(`${baseUrl}/session`, 'GET');
      if (result.ok && result.data) {
        const rawData = result.data;
        const sessionsArray = Array.isArray(rawData) ? rawData : [];
        const sessions = sessionsArray
          .map((s: Record<string, unknown>) => ({
            id: String(s.id ?? ''),
            title: s.title ? String(s.title) : undefined,
          }))
          .slice(0, 50);
        setAvailableSessions(sessions);
      }
    } catch (err) {
      console.error('Failed to load sessions:', err);
    } finally {
      setLoadingSessions(false);
    }
  };

  const handleSend = async (
    endpoint: EndpointDefinition,
    params: {
      pathValues: Record<string, string>;
      queryValues: Record<string, string>;
      bodyValue: string;
    },
  ) => {
    const key = endpoint.key;
    setLoadingEndpoints((prev) => ({ ...prev, [key]: true }));
    const startTime = performance.now();

    try {
      // Build URL
      let url = baseUrl + endpoint.path;
      for (const [paramKey, value] of Object.entries(params.pathValues)) {
        url = url.replace(`:${paramKey}`, encodeURIComponent(value));
      }
      const queryEntries = Object.entries(params.queryValues).filter(([, v]) => v.trim() !== '');
      if (queryEntries.length > 0) {
        const queryParams = new URLSearchParams();
        for (const [k, v] of queryEntries) {
          queryParams.set(k, v);
        }
        url += `?${queryParams.toString()}`;
      }

      // Parse body
      let body: unknown = undefined;
      if (endpoint.method === 'POST' || endpoint.method === 'PATCH' || endpoint.method === 'PUT') {
        try {
          body = JSON.parse(params.bodyValue);
        } catch {
          setResponses((prev) => ({
            ...prev,
            [key]: {
              status: 0,
              ok: false,
              data: null,
              error: 'Invalid JSON in request body',
              timestamp: new Date().toLocaleTimeString(),
              duration: 0,
            },
          }));
          return;
        }
      }

      const result = await proxyFetch(url, endpoint.method, body);
      const duration = Math.round(performance.now() - startTime);

      setResponses((prev) => ({
        ...prev,
        [key]: {
          status: result.status,
          ok: result.ok,
          data: result.data,
          error: result.error,
          timestamp: new Date().toLocaleTimeString(),
          duration,
        },
      }));
    } catch (err) {
      const duration = Math.round(performance.now() - startTime);
      setResponses((prev) => ({
        ...prev,
        [key]: {
          status: 0,
          ok: false,
          data: null,
          error: err instanceof Error ? err.message : 'Request failed',
          timestamp: new Date().toLocaleTimeString(),
          duration,
        },
      }));
    } finally {
      setLoadingEndpoints((prev) => ({ ...prev, [key]: false }));
    }
  };

  const toggleEndpoint = (key: string) => {
    setExpandedEndpoint((prev) => (prev === key ? null : key));
  };

  const totalEndpoints = ENDPOINTS.length;
  const testedCount = Object.keys(responses).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">API Tester</h1>
        <p className="text-gray-400 text-sm mt-1">
          Test OpenCode HTTP REST API endpoints —{' '}
          <span className="text-gray-300">{totalEndpoints} endpoints</span> across{' '}
          <span className="text-gray-300">{CATEGORY_ORDER.length} categories</span>
          {testedCount > 0 && (
            <span className="ml-2 text-emerald-400">· {testedCount} tested this session</span>
          )}
        </p>
      </div>

      {/* Target Selector — sticky */}
      <div className="sticky top-0 z-10 bg-gray-950/95 backdrop-blur border border-gray-800 rounded-lg p-4">
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-400 mb-1.5">
              Target OpenCode Instance
            </label>
            <div className="flex items-center gap-3">
              <select
                value={selectedAgentId}
                onChange={(e) => {
                  setSelectedAgentId(e.target.value);
                  if (e.target.value) setCustomUrl('');
                }}
                disabled={loadingAgents}
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 focus:outline-none focus:border-blue-500 disabled:opacity-50"
              >
                <option value="">Select an agent...</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name} — {agent.serverUrl}
                  </option>
                ))}
              </select>
              <span className="text-gray-500 flex-shrink-0">or</span>
              <input
                type="text"
                value={customUrl}
                onChange={(e) => {
                  setCustomUrl(e.target.value);
                  if (e.target.value) setSelectedAgentId('');
                }}
                placeholder="http://127.0.0.1:4096"
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 placeholder-gray-600 focus:outline-none focus:border-blue-500"
              />
            </div>
            {loadingAgents && <p className="text-xs text-gray-500 mt-1.5">Loading agents...</p>}
          </div>
          <div className="flex items-end">
            <div className="px-4 py-2 bg-gray-800 rounded-lg">
              <span className="text-xs text-gray-500">Target:</span>
              <code className="ml-2 text-sm font-mono text-blue-400">
                {baseUrl || 'Not selected'}
              </code>
            </div>
          </div>
        </div>
      </div>

      {/* Endpoint Categories */}
      <div className="space-y-8">
        {CATEGORY_ORDER.map((category) => {
          const categoryEndpoints = ENDPOINTS.filter((e) => e.category === category);
          if (categoryEndpoints.length === 0) return null;
          return (
            <CategorySection
              key={category}
              category={category}
              endpoints={categoryEndpoints}
              expandedEndpoint={expandedEndpoint}
              onToggle={toggleEndpoint}
              responses={responses}
              loadingEndpoints={loadingEndpoints}
              onSend={handleSend}
              baseUrl={baseUrl}
              availableSessions={availableSessions}
              onLoadSessions={handleLoadSessions}
              loadingSessions={loadingSessions}
            />
          );
        })}
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-gray-600 pt-4 pb-8">
        All requests are proxied through ATC to avoid CORS issues. · {totalEndpoints} endpoints
        total.
      </div>
    </div>
  );
}
