import { create } from 'zustand';
import { apiClient } from '../api/client';
import type { Workspace } from '../types';

interface WorkspaceState {
  workspaces: Workspace[];
  loading: boolean;
  error: string | null;
  fetchWorkspaces: (status?: string) => Promise<void>;
  updateWorkspace: (workspace: Workspace) => void;
  removeWorkspace: (workspaceId: string) => void;
  deleteWorkspaceApi: (workspaceId: string) => Promise<void>;
  archiveWorkspaceApi: (workspaceId: string) => Promise<void>;
}

export const useWorkspaceStore = create<WorkspaceState>((set) => ({
  workspaces: [],
  loading: false,
  error: null,

  fetchWorkspaces: async (status) => {
    set({ loading: true, error: null });
    try {
      const workspaces = await apiClient.getWorkspaces(status);
      set({ workspaces, loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to fetch workspaces',
        loading: false,
      });
    }
  },

  updateWorkspace: (workspace) => {
    set((state) => ({
      workspaces: state.workspaces.some((w) => w.id === workspace.id)
        ? state.workspaces.map((w) => (w.id === workspace.id ? workspace : w))
        : [...state.workspaces, workspace],
    }));
  },

  removeWorkspace: (workspaceId) => {
    set((state) => ({
      workspaces: state.workspaces.filter((w) => w.id !== workspaceId),
    }));
  },

  deleteWorkspaceApi: async (workspaceId: string) => {
    try {
      await apiClient.deleteWorkspace(workspaceId);
      set((state) => ({
        workspaces: state.workspaces.filter((w) => w.id !== workspaceId),
      }));
    } catch (err) {
      console.error('Failed to delete workspace:', err);
      throw err;
    }
  },

  archiveWorkspaceApi: async (workspaceId: string) => {
    try {
      await apiClient.archiveWorkspace(workspaceId);
      // Re-fetch to get updated status
      const workspaces = await apiClient.getWorkspaces();
      set({ workspaces });
    } catch (err) {
      console.error('Failed to archive workspace:', err);
      throw err;
    }
  },
}));
