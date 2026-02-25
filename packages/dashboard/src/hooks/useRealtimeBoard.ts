import { useEffect } from 'react';
import { useBoardStore } from '../stores/board-store';
import { useProjectStore } from '../stores/project-store';

export function useRealtimeBoard() {
  const { fetchTasks, fetchSummary } = useBoardStore();
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);

  useEffect(() => {
    // Fetch tasks and summary for the selected project
    fetchTasks(selectedProjectId);
    fetchSummary(selectedProjectId);

    // Refresh summary periodically
    const intervalId = setInterval(() => {
      fetchSummary(selectedProjectId);
    }, 30000);

    return () => {
      clearInterval(intervalId);
    };
  }, [fetchTasks, fetchSummary, selectedProjectId]);

  return useBoardStore();
}
