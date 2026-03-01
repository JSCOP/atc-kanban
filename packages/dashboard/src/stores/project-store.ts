import { create } from 'zustand';
import { apiClient } from '../api/client';
import type { CreateProjectInput, Project } from '../types';

const STORAGE_KEY = 'atc-selected-project';

interface ProjectState {
  projects: Project[];
  selectedProjectId: string;
  loading: boolean;
  error: string | null;
  fetchProjects: () => Promise<void>;
  selectProject: (id: string) => void;
  createProject: (input: CreateProjectInput) => Promise<Project>;
  deleteProject: (id: string) => Promise<void>;
  addProject: (project: Project) => void;
  removeProject: (projectId: string) => void;
  getSelectedProject: () => Project | undefined;
}

function getSavedProjectId(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem(STORAGE_KEY) || '';
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  selectedProjectId: getSavedProjectId(),
  loading: false,
  error: null,

  fetchProjects: async () => {
    set({ loading: true, error: null });
    try {
      const projects = await apiClient.getProjects();
      set({ projects, loading: false });
    } catch (err) {
      set({
        error: err instanceof Error ? err.message : 'Failed to fetch projects',
        loading: false,
      });
    }
  },

  selectProject: (id: string) => {
    localStorage.setItem(STORAGE_KEY, id);
    set({ selectedProjectId: id });
  },

  createProject: async (input: CreateProjectInput) => {
    const project = await apiClient.createProject(input);
    set((state) => ({
      projects: [...state.projects, project],
    }));
    return project;
  },

  deleteProject: async (id: string) => {
    await apiClient.deleteProject(id);
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== id),
      selectedProjectId:
        state.selectedProjectId === id
          ? (state.projects.find((p) => p.id !== id)?.id ?? '')
          : state.selectedProjectId,
    }));
  },

  addProject: (project: Project) => {
    set((state) => ({
      projects: state.projects.some((p) => p.id === project.id)
        ? state.projects
        : [...state.projects, project],
    }));
  },

  removeProject: (projectId: string) => {
    set((state) => ({
      projects: state.projects.filter((p) => p.id !== projectId),
      selectedProjectId:
        state.selectedProjectId === projectId
          ? (state.projects.find((p) => p.id !== projectId)?.id ?? '')
          : state.selectedProjectId,
    }));
  },

  getSelectedProject: () => {
    const { projects, selectedProjectId } = get();
    return projects.find((p) => p.id === selectedProjectId);
  },
}));
