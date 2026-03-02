import { create } from 'zustand';
import { apiClient } from '../api/client';
import type { Agent, DetectedProcess, DiscoveredInstance, RegisterOpenCodeAgentInput } from '../types';

interface AgentState {
  agents: Agent[];
  loading: boolean;
  error: string | null;
  fetchAgents: () => Promise<void>;
  updateAgent: (agent: Agent) => void;
  removeAgent: (agentId: string) => void;
  removeAgentApi: (agentId: string) => Promise<void>;
  untrackAgent: (agentId: string) => Promise<void>;
  registerOpenCodeAgent: (input: RegisterOpenCodeAgentInput) => Promise<Agent>;
  checkAgentHealth: (agentId: string) => Promise<void>;
  spawnOpenCodeAgent: (input: { name?: string; cwd?: string }) => Promise<{ agentId: string; serverUrl: string; port: number; pid: number }>;
  killSpawnedAgent: (agentId: string) => Promise<void>;
  getMainAgent: () => Agent | undefined;
  getWorkerAgents: () => Agent[];
  // Discovery
  discoveredInstances: DiscoveredInstance[];
  detectedProcesses: DetectedProcess[];
  scanning: boolean;
  scanForAgents: () => Promise<void>;
  trackDiscoveredAgent: (serverUrl: string, name?: string) => Promise<void>;
  renameAgent: (agentId: string, newName: string) => Promise<void>;
  updateAgentRole: (agentId: string, role: 'main' | 'worker') => Promise<void>;
  // Reload & cleanup
  reloading: boolean;
  reloadAgents: () => Promise<void>;
  purgeDisconnected: () => Promise<number>;
  toastAgent: (agentId: string, message?: string) => Promise<{ ok: boolean; port: string }>;
  toastIdentifyAll: () => Promise<{ results: { agentId: string; name: string; port: string; ok: boolean }[] }>;
}


export const useAgentStore = create<AgentState>((set, get) => ({
  agents: [],
  loading: false,
  error: null,
  discoveredInstances: [],
  detectedProcesses: [],
  scanning: false,

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

  removeAgentApi: async (agentId) => {
    try {
      await apiClient.disconnectAgent(agentId);
      set((state) => ({
        agents: state.agents.filter((a) => a.id !== agentId),
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to remove agent' });
    }
  },
  untrackAgent: async (agentId) => {
    try {
      await apiClient.untrackAgent(agentId);
      set((state) => ({
        agents: state.agents.filter((a) => a.id !== agentId),
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to untrack agent' });
    }
  },

  registerOpenCodeAgent: async (input) => {
    const agent = await apiClient.registerOpenCodeAgent(input);
    set((state) => ({
      agents: state.agents.some((a) => a.id === agent.id)
        ? state.agents.map((a) => (a.id === agent.id ? agent : a))
        : [...state.agents, agent],
    }));
    return agent;
  },

  checkAgentHealth: async (agentId) => {
    const agent = await apiClient.checkAgentHealth(agentId);
    set((state) => ({
      agents: state.agents.map((a) => (a.id === agent.id ? agent : a)),
    }));
  },

  spawnOpenCodeAgent: async (input) => {
    const result = await apiClient.spawnOpenCode(input);
    // Refresh agents list to include the newly spawned agent
    await get().fetchAgents();
    return result;
  },

  killSpawnedAgent: async (agentId) => {
    await apiClient.killSpawnedAgent(agentId);
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

  scanForAgents: async () => {
    set({ scanning: true });
    try {
      const result = await apiClient.discoverAgents();
      set({ discoveredInstances: result.discovered, detectedProcesses: result.processes ?? [], scanning: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to scan for agents',
        scanning: false,
      });
    }
  },

  trackDiscoveredAgent: async (serverUrl, name) => {
    try {
      await apiClient.trackDiscoveredAgent(serverUrl, name);
      // Refresh agents to include newly tracked agent, then re-scan
      await get().fetchAgents();
      // Remove from discovered list
      set((state) => ({
        discoveredInstances: state.discoveredInstances.filter((d) => d.serverUrl !== serverUrl),
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to track agent' });
    }
  },

  renameAgent: async (agentId, newName) => {
    try {
      const agent = await apiClient.renameAgent(agentId, newName);
      set((state) => ({
        agents: state.agents.map((a) => (a.id === agentId ? { ...a, ...agent } : a)),
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to rename agent' });
    }
  },

  updateAgentRole: async (agentId, role) => {
    const updated = await apiClient.updateAgentRole(agentId, role);
    set((state) => ({
      agents: state.agents.map((a) => (a.id === agentId ? { ...a, ...updated } :
        // If promoting to main, demote other main agents
        role === 'main' && a.role === 'main' ? { ...a, role: 'worker' as const } : a
      )),
    }));
  },

  reloading: false,

  reloadAgents: async () => {
    set({ reloading: true, error: null });
    try {
      const agents = await apiClient.reloadAgents();
      set({ agents, reloading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to reload agents', reloading: false });
    }
  },

  purgeDisconnected: async () => {
    try {
      const { removed } = await apiClient.purgeDisconnectedAgents();
      if (removed > 0) {
        // Remove disconnected agents from local state
        set((state) => ({
          agents: state.agents.filter((a) => a.status !== 'disconnected'),
        }));
      }
      return removed;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to purge agents' });
      return 0;
    }
  },
  toastAgent: async (agentId, message) => {
    try {
      return await apiClient.toastAgent(agentId, message);
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to toast agent' });
      return { ok: false, port: '' };
    }
  },
  toastIdentifyAll: async () => {
    try {
      return await apiClient.toastIdentifyAll();
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to identify ports' });
      return { results: [] };
    }
  },
}));
