import { create } from 'zustand';
import type { Task, BoardSummary, TaskStatus } from '../types';
import { apiClient } from '../api/client';

interface BoardState {
  tasks: Task[];
  summary: BoardSummary | null;
  loading: boolean;
  error: string | null;
  fetchTasks: (projectId?: string) => Promise<void>;
  fetchSummary: (projectId?: string) => Promise<void>;
  addTask: (task: Task) => void;
  updateTask: (task: Task) => void;
  removeTask: (taskId: string) => void;
  moveTask: (taskId: string, newStatus: TaskStatus) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useBoardStore = create<BoardState>((set, get) => ({
  tasks: [],
  summary: null,
  loading: false,
  error: null,

  fetchTasks: async (projectId?: string) => {
    set({ loading: true, error: null });
    try {
      const tasks = await apiClient.getTasks(projectId);
      set({ tasks, loading: false });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch tasks', loading: false });
    }
  },

  fetchSummary: async (projectId?: string) => {
    try {
      const summary = await apiClient.getBoardSummary(projectId);
      set({ summary });
    } catch (err) {
      console.error('Failed to fetch board summary:', err);
    }
  },

  addTask: (task) => {
    set((state) => ({
      tasks: [...state.tasks, task],
    }));
  },

  updateTask: (task) => {
    set((state) => ({
      tasks: state.tasks.map((t) => (t.id === task.id ? task : t)),
    }));
  },

  removeTask: (taskId) => {
    set((state) => ({
      tasks: state.tasks.filter((t) => t.id !== taskId),
    }));
  },

  moveTask: (taskId, newStatus) => {
    set((state) => ({
      tasks: state.tasks.map((t) =>
        t.id === taskId ? { ...t, status: newStatus, updatedAt: new Date().toISOString() } : t,
      ),
    }));
  },

  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
}));
