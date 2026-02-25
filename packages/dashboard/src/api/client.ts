import type { Task, TaskDetail, Agent, ATCEvent, BoardSummary, CreateTaskInput, UpdateTaskInput, Project, CreateProjectInput, UpdateProjectInput } from '../types';

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
  deleteTask: (id: string) =>
    fetchApi<{ ok: boolean }>(`/tasks/${id}`, { method: 'DELETE' }),
  forceRelease: (id: string) =>
    fetchApi<{ ok: boolean }>(`/tasks/${id}/force-release`, { method: 'POST' }),

  // Agents
  getAgents: async () => {
    const res = await fetchApi<{ agents: Agent[] }>('/agents');
    return res.agents;
  },

  // Events
  getEvents: async (params?: { limit?: number; type?: string; offset?: number; agentId?: string }) => {
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
  deleteProject: (id: string) =>
    fetchApi<{ ok: boolean }>(`/projects/${id}`, { method: 'DELETE' }),
};

// Backward compat alias
export const apiClient = api;
