import type {
  ATCEvent,
  Agent,
  BoardSummary,
  BrowseResult,
  CreateProjectInput,
  CreateTaskInput,
  DiscoveryResult,
  DispatchResult,
  DispatchTaskInput,
  FsRoot,
  OpenCodeMessage,
  Project,
  RegisterOpenCodeAgentInput,
  Task,
  TaskDetail,
  UpdateProjectInput,
  UpdateTaskInput,
  Workspace,
} from '../types';

const API_BASE = '/api';

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
    },
    ...options,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error || `HTTP ${response.status}`);
  }

  return response.json();
}

// Server wraps responses, so unwrap them
export const api = {
  // Tasks
  getTasks: async (projectId?: string) => {
    const params = projectId ? `?projectId=${projectId}` : '';
    const res = await fetchApi<{ tasks: Task[] }>(`/tasks${params}`);
    return res.tasks;
  },
  getTask: async (id: string) => {
    const res = await fetchApi<{ task: TaskDetail }>(`/tasks/${id}`);
    return res.task;
  },
  createTask: async (input: CreateTaskInput) => {
    const res = await fetchApi<{ task: Task }>('/tasks', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return res.task;
  },
  updateTask: async (id: string, input: UpdateTaskInput) => {
    const res = await fetchApi<{ task: Task }>(`/tasks/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
    return res.task;
  },
  deleteTask: (id: string) => fetchApi<{ ok: boolean }>(`/tasks/${id}`, { method: 'DELETE' }),
  forceRelease: (id: string) =>
    fetchApi<{ ok: boolean }>(`/tasks/${id}/force-release`, { method: 'POST' }),
  adminMoveTask: async (id: string, status: string, reason?: string) => {
    const res = await fetchApi<{ task: TaskDetail }>(`/tasks/${id}/admin-move`, {
      method: 'POST',
      body: JSON.stringify({ status, reason }),
    });
    return res.task;
  },

  // Agents
  getAgents: async () => {
    const res = await fetchApi<{ agents: Agent[] }>('/agents');
    return res.agents;
  },
  reloadAgents: async () => {
    const res = await fetchApi<{ agents: Agent[] }>('/agents/reload', { method: 'POST' });
    return res.agents;
  },
  purgeDisconnectedAgents: async () => {
    const res = await fetchApi<{ removed: number; total: number }>('/agents/disconnected', { method: 'DELETE' });
    return res;
  },
  disconnectAgent: (id: string) => fetchApi<{ ok: boolean }>(`/agents/${id}`, { method: 'DELETE' }),
  untrackAgent: (id: string) => fetchApi<{ ok: boolean }>(`/agents/${id}/untrack`, { method: 'POST' }),
  toastAgent: (id: string, message?: string) =>
    fetchApi<{ ok: boolean; port: string }>(`/agents/${id}/toast`, {
      method: 'POST',
      body: JSON.stringify(message ? { message } : {}),
    }),
  toastIdentifyAll: () =>
    fetchApi<{ results: { agentId: string; name: string; port: string; ok: boolean }[] }>(
      '/agents/toast-identify',
      { method: 'POST' },
    ),
  renameAgent: async (id: string, name: string) => {
    const res = await fetchApi<{ agent: Agent }>(`/agents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
    return res.agent;
  },
  async updateAgentRole(agentId: string, role: 'main' | 'worker'): Promise<Agent> {
    const data = await fetchApi<{ agent: Agent }>(`/agents/${agentId}/role`, {
      method: 'PATCH',
      body: JSON.stringify({ role }),
    });
    return data.agent;
  },
  registerOpenCodeAgent: async (input: RegisterOpenCodeAgentInput) => {
    const res = await fetchApi<{ agent: Agent }>('/agents/opencode', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return res.agent;
  },
  checkAgentHealth: async (id: string) => {
    const res = await fetchApi<{ agent: Agent }>(`/agents/${id}/health`, { method: 'POST' });
    return res.agent;
  },
  getAgentActivity: async (agentId: string, since?: string, limit?: number) => {
    const params = new URLSearchParams();
    if (since) params.set('since', since);
    if (limit) params.set('limit', String(limit));
    const qs = params.toString();
    const res = await fetchApi<{ activity: ATCEvent[] }>(`/agents/${agentId}/activity${qs ? `?${qs}` : ''}`);
    return res.activity;
  },
  getOpenCodeAgentTypes: async (id: string) => {
    const res = await fetchApi<{ agents: { name: string; description?: string }[] }>(
      `/agents/${id}/opencode-agents`,
    );
    return res.agents;
  },
  getSessionMessages: async (agentId: string) => {
    const res = await fetchApi<{ messages: OpenCodeMessage[] }>(
      `/agents/${agentId}/session-messages`,
    );
    return res.messages;
  },
  listSessions: async (agentId: string) => {
    const res = await fetchApi<{ sessions: { id: string; title?: string; createdAt?: string }[] }>(
      `/agents/${agentId}/sessions`,
    );
    return res.sessions;
  },
  createSession: async (agentId: string, title?: string) => {
    const res = await fetchApi<{ session: { id: string } }>(`/agents/${agentId}/sessions`, {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
    return res.session;
  },
  getSessionMessagesBySessionId: async (agentId: string, sessionId: string) => {
    const res = await fetchApi<{ messages: OpenCodeMessage[] }>(
      `/agents/${agentId}/sessions/${sessionId}/messages`,
    );
    return res.messages;
  },
  sendSessionMessage: async (agentId: string, sessionId: string, message: string, opencodeAgent?: string) => {
    await fetchApi<{ ok: boolean }>(`/agents/${agentId}/sessions/${sessionId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ message, opencodeAgent }),
    });
  },

  // Events
  getEvents: async (params?: {
    limit?: number;
    type?: string;
    offset?: number;
    agentId?: string;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.limit) searchParams.set('limit', String(params.limit));
    if (params?.offset) searchParams.set('offset', String(params.offset));
    if (params?.type) searchParams.set('type', params.type);
    if (params?.agentId) searchParams.set('agentId', params.agentId);
    const qs = searchParams.toString();
    const res = await fetchApi<{ events: ATCEvent[] }>(`/events${qs ? `?${qs}` : ''}`);
    return res.events;
  },

  // Board
  getBoardSummary: (projectId?: string) => {
    const params = projectId ? `?projectId=${projectId}` : '';
    return fetchApi<BoardSummary>(`/board/summary${params}`);
  },

  // Projects
  getProjects: async () => {
    const res = await fetchApi<{ projects: Project[] }>('/projects');
    return res.projects;
  },
  getProject: async (id: string) => {
    const res = await fetchApi<{ project: Project }>(`/projects/${id}`);
    return res.project;
  },
  createProject: async (input: CreateProjectInput) => {
    const res = await fetchApi<{ project: Project }>('/projects', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return res.project;
  },
  updateProject: async (id: string, input: UpdateProjectInput) => {
    const res = await fetchApi<{ project: Project }>(`/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
    return res.project;
  },
  deleteProject: (id: string) => fetchApi<{ ok: boolean }>(`/projects/${id}`, { method: 'DELETE' }),

  // Workspaces
  getWorkspaces: async (status?: string) => {
    const params = status ? `?status=${status}` : '';
    const res = await fetchApi<{ workspaces: Workspace[] }>(`/workspaces${params}`);
    return res.workspaces;
  },
  getWorkspaceForTask: async (taskId: string) => {
    const res = await fetchApi<{ workspace: Workspace | null }>(`/workspaces/by-task/${taskId}`);
    return res.workspace;
  },
  archiveWorkspace: (id: string) => fetchApi<{ ok: boolean }>(`/workspaces/${id}/archive`, { method: 'POST' }),
  deleteWorkspace: (id: string) => fetchApi<{ ok: boolean }>(`/workspaces/${id}`, { method: 'DELETE' }),
  createWorkspace: async (repoRoot: string, baseBranch = 'main') => {
    const res = await fetchApi<{ workspace: Workspace }>('/workspaces', {
      method: 'POST',
      body: JSON.stringify({ repoRoot, baseBranch }),
    });
    return res.workspace;
  },

  // Dispatch
  dispatchTask: async (input: DispatchTaskInput) => {
    const res = await fetchApi<{ result: DispatchResult }>('/dispatch', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return res.result;
  },

  // Task Assignment
  assignAgent: async (taskId: string, agentId: string | null) => {
    const res = await fetchApi<{ task: Task }>(`/tasks/${taskId}/assign`, {
      method: 'POST',
      body: JSON.stringify({ agentId }),
    });
    return res.task;
  },

  // Spawn
  spawnOpenCode: async (input: { name?: string; cwd?: string; port?: number }) => {
    return fetchApi<{ agentId: string; serverUrl: string; port: number; pid: number }>(
      '/agents/spawn',
      { method: 'POST', body: JSON.stringify(input) },
    );
  },
  killSpawnedAgent: (id: string) =>
    fetchApi<{ ok: boolean }>(`/agents/${id}/kill`, { method: 'POST' }),
  getSpawnedAgents: async () => {
    const res = await fetchApi<{ spawned: { agentId: string; pid: number }[] }>('/agents/spawned');
    return res.spawned;
  },

  // Discovery
  discoverAgents: async () => {
    return fetchApi<DiscoveryResult>('/agents/discover');
  },
  trackDiscoveredAgent: async (serverUrl: string, name?: string) => {
    return fetchApi<{ agentId: string }>('/agents/discover/track', {
      method: 'POST',
      body: JSON.stringify({ serverUrl, name }),
    });
  },

  // Admin
  shutdownServer: () =>
    fetchApi<{ ok: boolean; message: string }>('/admin/shutdown', { method: 'POST' }),
  restartServer: () =>
    fetchApi<{ ok: boolean; message: string }>('/admin/restart', { method: 'POST' }),
  getServerInfo: () =>
    fetchApi<{
      pid: number;
      uptime: number;
      nodeVersion: string;
      argv: string[];
      cwd: string;
      memoryUsage: { rss: number; heapUsed: number; heapTotal: number };
    }>('/admin/info'),

  // Filesystem
  getFsRoots: async () => {
    const res = await fetchApi<{ roots: FsRoot[] }>('/fs');
    return res.roots;
  },
  browsePath: async (dirPath: string, showHidden?: boolean) => {
    const params = new URLSearchParams({ path: dirPath });
    if (showHidden) params.set('showHidden', '1');
    const res = await fetchApi<BrowseResult>(`/fs/browse?${params.toString()}`);
    return res;
  },
};

// Backward compat alias
export const apiClient = api;
