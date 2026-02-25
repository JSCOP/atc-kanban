import { create } from 'zustand';
import type { Agent } from '../types';
import { apiClient } from '../api/client';

interface AgentState {
  agents: Agent[];
  loading: boolean;
  error: string | null;
  fetchAgents: () => Promise<void>;
  updateAgent: (agent: Agent) => void;
  removeAgent: (agentId: string) => void;
  getMainAgent: () => Agent | undefined;
  getWorkerAgents: () => Agent[];
}

export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  loading: false,
  error: null,

  fetchAgents: async () => {
    set({ loading: true, error: null });
    try {
      const agents = await apiClient.getAgents();
      set({ agents, loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch agents', loading: false });
    }
  },

  updateAgent: (agent) => {
    set((state) => ({
      agents: state.agents.some((a) => a.id === agent.id)
        ? state.agents.map((a) => (a.id === agent.id ? agent : a))
        : [...state.agents, agent],
    }));
  },

  removeAgent: (agentId) => {
    set((state) => ({
      agents: state.agents.filter((a) => a.id !== agentId),
    }));
  },

  getMainAgent: () => {
    return get().agents.find((a) => a.role === 'main');
  },

  getWorkerAgents: () => {
    return get().agents.filter((a) => a.role === 'worker');
  },
}));
