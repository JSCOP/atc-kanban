import { create } from 'zustand';
import type { ATCEvent } from '../types';
import { apiClient } from '../api/client';

const PAGE_SIZE = 50;

interface EventState {
  events: ATCEvent[];
  loading: boolean;
  error: string | null;
  hasMore: boolean;
  offset: number;
  filters: {
    type?: string;
    agentId?: string;
  };
  fetchEvents: (reset?: boolean) => Promise<void>;
  addEvent: (event: ATCEvent) => void;
  setFilters: (filters: { type?: string; agentId?: string }) => void;
  loadMore: () => Promise<void>;
}

export const useEventStore = create<EventState>((set, get) => ({
  events: [],
  loading: false,
  error: null,
  hasMore: true,
  offset: 0,
  filters: {},

  fetchEvents: async (reset = false) => {
    const { filters, offset } = get();
    const currentOffset = reset ? 0 : offset;

    set({ loading: true, error: null });
    if (reset) {
      set({ events: [], offset: 0, hasMore: true });
    }

    try {
      const events = await apiClient.getEvents({
        limit: PAGE_SIZE,
        offset: currentOffset,
        ...filters,
      });

      set((state) => ({
        events: reset ? events : [...state.events, ...events],
        loading: false,
        hasMore: events.length === PAGE_SIZE,
        offset: currentOffset + events.length,
      }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to fetch events', loading: false });
    }
  },

  addEvent: (event) => {
    set((state) => ({
      events: [event, ...state.events].slice(0, 500), // Keep last 500 events
    }));
  },

  setFilters: (filters) => {
    set({ filters, offset: 0, events: [], hasMore: true });
    get().fetchEvents(true);
  },

  loadMore: async () => {
    const { loading, hasMore } = get();
    if (loading || !hasMore) return;
    await get().fetchEvents(false);
  },
}));
