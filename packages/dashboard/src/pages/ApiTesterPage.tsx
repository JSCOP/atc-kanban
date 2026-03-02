import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Agent } from '../types';

interface EndpointDefinition {
  key: string;
  category: 'Session' | 'TUI' | 'System';
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  description: string;
  pathParams?: { name: string; description: string }[];
  queryParams?: { name: string; description: string; optional?: boolean }[];
  bodyParams?: { name: string; type: string; example: unknown }[];
  bodyExample?: unknown;
}

interface ResponseData {
  status: number;
  ok: boolean;
  data: unknown;
  error?: string;
  timestamp: string;
  duration: number;
}

const ENDPOINTS: EndpointDefinition[] = [
  // Session endpoints
  {
    key: 'session-list',
    category: 'Session',
    method: 'GET',
    path: '/session',
    description: 'List all sessions',
    queryParams: [
      { name: 'directory', description: 'Filter by directory', optional: true },
      { name: 'start', description: 'Pagination start', optional: true },
      { name: 'search', description: 'Search query', optional: true },
      { name: 'limit', description: 'Result limit', optional: true },
    ],
  },
  {
    key: 'session-status',
    category: 'Session',
    method: 'GET',
    path: '/session/status',
    description: 'Per-instance busy sessions',
  },
  {
    key: 'session-get',
    category: 'Session',
    method: 'GET',
    path: '/session/:id',
    description: 'Get single session',
    pathParams: [{ name: 'id', description: 'Session ID' }],
  },
  {
    key: 'session-update',
    category: 'Session',
    method: 'PATCH',
    path: '/session/:id',
    description: 'Update session title',
    pathParams: [{ name: 'id', description: 'Session ID' }],
    bodyExample: { title: 'New Session Title' },
  },
  {
    key: 'session-create',
    category: 'Session',
    method: 'POST',
    path: '/session',
    description: 'Create new session',
    bodyExample: { title: 'My New Session' },
  },
  {
    key: 'session-prompt',
    category: 'Session',
    method: 'POST',
    path: '/session/:id/prompt_async',
    description: 'Send prompt to session',
    pathParams: [{ name: 'id', description: 'Session ID' }],
    bodyExample: {
      messages: [
        {
          role: 'user',
          parts: [{ type: 'text', text: 'Hello, can you help me with...' }],
        },
      ],
    },
  },
  {
    key: 'session-abort',
    category: 'Session',
    method: 'POST',
    path: '/session/:id/abort',
    description: 'Abort session',
    pathParams: [{ name: 'id', description: 'Session ID' }],
  },
  {
    key: 'session-delete',
    category: 'Session',
    method: 'DELETE',
    path: '/session/:id',
    description: 'Delete session',
    pathParams: [{ name: 'id', description: 'Session ID' }],
  },

  // TUI endpoints
  {
    key: 'tui-select-session',
    category: 'TUI',
    method: 'POST',
    path: '/tui/select-session',
    description: 'Navigate TUI to session',
    bodyExample: { sessionID: 'session-id-here' },
  },
  {
    key: 'tui-append-prompt',
    category: 'TUI',
    method: 'POST',
    path: '/tui/append-prompt',
    description: 'Append text to prompt',
    bodyExample: { text: 'Add this text to the current prompt' },
  },
  {
    key: 'tui-submit-prompt',
    category: 'TUI',
    method: 'POST',
    path: '/tui/submit-prompt',
    description: 'Submit current prompt',
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
    key: 'tui-show-toast',
    category: 'TUI',
    method: 'POST',
    path: '/tui/show-toast',
    description: 'Show toast notification',
    bodyExample: { title: 'Hello from ATC!' },
  },

  // System endpoints
  {
    key: 'system-app',
    category: 'System',
    method: 'GET',
    path: '/app',
    description: 'App info',
  },
  {
    key: 'system-path',
    category: 'System',
    method: 'GET',
    path: '/path',
    description: 'Directory info',
  },
  {
    key: 'system-health',
    category: 'System',
    method: 'GET',
    path: '/global/health',
    description: 'Health check',
  },
];

const methodColors = {
  GET: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  POST: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  PATCH: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  DELETE: 'bg-red-500/10 text-red-400 border-red-500/20',
};

const statusColors: Record<number, string> = {
  200: 'text-emerald-400',
  201: 'text-emerald-400',
  204: 'text-emerald-400',
  400: 'text-amber-400',
  401: 'text-amber-400',
  403: 'text-amber-400',
  404: 'text-amber-400',
  500: 'text-red-400',
};

async function proxyFetch(url: string, method = 'GET', body?: unknown): Promise<unknown> {
  const res = await fetch('/api/opencode-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, method, body }),
  });
  return res.json();
}

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
    endpoint.bodyExample ? JSON.stringify(endpoint.bodyExample, null, 2) : '{}',
  );
  const [selectedSessionId, setSelectedSessionId] = useState('');

  const hasPathParams = endpoint.pathParams && endpoint.pathParams.length > 0;
  const hasQueryParams = endpoint.queryParams && endpoint.queryParams.length > 0;
  const hasBody = endpoint.method === 'POST' || endpoint.method === 'PATCH';

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
    setSelectedSessionId(sessionId);
    if (hasPathParams) {
      const idParam = endpoint.pathParams?.find((p) => p.name === 'id');
      if (idParam) {
        setPathValues((prev) => ({ ...prev, id: sessionId }));
      }
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

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden">
      {/* Header Row */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-800/50 transition-colors text-left"
      >
        <svg
          className={`w-4 h-4 text-gray-500 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span
          className={`text-xs font-semibold px-2 py-0.5 rounded border ${methodColors[endpoint.method]}`}
        >
          {endpoint.method}
        </span>
        <code className="text-sm font-mono text-gray-300">{endpoint.path}</code>
        <span className="text-sm text-gray-500 flex-1">{endpoint.description}</span>
      </button>

      {/* Expanded Content */}
      <div
        className={`overflow-hidden transition-all duration-200 ease-in-out ${isExpanded ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <div className="p-4 pt-0 space-y-4">
          {/* Session ID Selector for endpoints with :id param */}
          {hasPathParams && endpoint.pathParams?.some((p) => p.name === 'id') && (
            <div className="flex items-center gap-2 p-3 bg-gray-800/50 rounded-lg">
              <span className="text-xs text-gray-400">Quick select:</span>
              <select
                value={selectedSessionId}
                onChange={(e) => handleSessionSelect(e.target.value)}
                className="flex-1 px-2 py-1 text-sm bg-gray-800 border border-gray-700 rounded text-gray-200 focus:outline-none focus:border-blue-500"
              >
                <option value="">Select a session...</option>
                {availableSessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title || s.id.slice(0, 8)}... ({s.id.slice(0, 16)}...)
                  </option>
                ))}
              </select>
              <button
                onClick={onLoadSessions}
                disabled={loadingSessions}
                className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded transition-colors disabled:opacity-50"
              >
                {loadingSessions ? 'Loading...' : 'Load Sessions'}
              </button>
            </div>
          )}

          {/* Path Parameters */}
          {hasPathParams && (
            <div className="space-y-2">
              <h4 className="text-xs font-medium text-gray-400 uppercase">Path Parameters</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {endpoint.pathParams?.map((param) => (
                  <div key={param.name}>
                    <label className="block text-xs text-gray-500 mb-1">
                      {param.name}
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
              <h4 className="text-xs font-medium text-gray-400 uppercase">Query Parameters</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {endpoint.queryParams?.map((param) => (
                  <div key={param.name}>
                    <label className="block text-xs text-gray-500 mb-1">
                      {param.name}
                      {param.optional && <span className="text-gray-600 ml-1">(optional)</span>}
                      <span className="text-gray-600 ml-1">({param.description})</span>
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
              <h4 className="text-xs font-medium text-gray-400 uppercase">Request Body (JSON)</h4>
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
                <span
                  className={`text-sm font-mono font-semibold ${statusColors[response.status] || 'text-gray-400'}`}
                >
                  {response.status}
                </span>
                <span className="text-xs text-gray-500">{response.ok ? 'OK' : 'Error'}</span>
                <span className="text-xs text-gray-600 ml-auto">{response.duration}ms</span>
                <span className="text-xs text-gray-600">{response.timestamp}</span>
              </div>
              <div className="p-4 bg-gray-950">
                {response.error ? (
                  <div className="text-red-400 text-sm">{response.error}</div>
                ) : (
                  <pre className="font-mono text-sm text-gray-300 overflow-x-auto">
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
    ? agents.find((a) => a.id === selectedAgentId)?.serverUrl || ''
    : customUrl;

  useEffect(() => {
    loadAgents();
  }, []);

  const loadAgents = async () => {
    try {
      const data = await api.getAgents();
      // Filter to only OpenCode agents with serverUrl
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
    const startTime = performance.now();
    try {
      const result = (await proxyFetch(`${baseUrl}/session`, 'GET')) as {
        status: number;
        ok: boolean;
        data: unknown;
        error?: string;
      };
      const duration = Math.round(performance.now() - startTime);

      if (result.ok && result.data) {
        // OpenCode returns a direct array from GET /session
        const rawData = result.data;
        const sessionsArray = Array.isArray(rawData) ? rawData : [];
        const sessions = sessionsArray
          .map((s: Record<string, unknown>) => ({ id: String(s.id || ''), title: s.title ? String(s.title) : undefined }))
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
      if (endpoint.method === 'POST' || endpoint.method === 'PATCH') {
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

      const result = (await proxyFetch(url, endpoint.method, body)) as {
        status: number;
        ok: boolean;
        data: unknown;
        error?: string;
      };
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

  const categories: Array<'Session' | 'TUI' | 'System'> = ['Session', 'TUI', 'System'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">API Tester</h1>
        <p className="text-gray-400 text-sm mt-1">Test OpenCode HTTP REST API endpoints</p>
      </div>

      {/* Target Selector */}
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
              <span className="text-gray-500">or</span>
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
      <div className="space-y-6">
        {categories.map((category) => {
          const categoryEndpoints = ENDPOINTS.filter((e) => e.category === category);
          return (
            <div key={category} className="space-y-3">
              <h2 className="text-lg font-semibold text-gray-200 flex items-center gap-2">
                <span
                  className={`w-2 h-2 rounded-full ${
                    category === 'Session'
                      ? 'bg-purple-500'
                      : category === 'TUI'
                        ? 'bg-amber-500'
                        : 'bg-emerald-500'
                  }`}
                />
                {category} Endpoints
                <span className="text-sm font-normal text-gray-500">
                  ({categoryEndpoints.length})
                </span>
              </h2>
              <div className="space-y-2">
                {categoryEndpoints.map((endpoint) => (
                  <EndpointCard
                    key={endpoint.key}
                    endpoint={endpoint}
                    baseUrl={baseUrl}
                    isExpanded={expandedEndpoint === endpoint.key}
                    onToggle={() => toggleEndpoint(endpoint.key)}
                    response={responses[endpoint.key] || null}
                    loading={loadingEndpoints[endpoint.key] || false}
                    onSend={(params) => handleSend(endpoint, params)}
                    availableSessions={availableSessions}
                    onLoadSessions={handleLoadSessions}
                    loadingSessions={loadingSessions}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer note */}
      <div className="text-center text-xs text-gray-600 pt-4">
        All requests are proxied through ATC to avoid CORS issues.
      </div>
    </div>
  );
}
