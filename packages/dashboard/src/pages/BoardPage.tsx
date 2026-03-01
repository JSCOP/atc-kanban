import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiClient } from '../api/client';
import { CreateTaskModal } from '../components/board/CreateTaskModal';
import { DispatchDialog } from '../components/board/DispatchDialog';
import { KanbanColumn } from '../components/board/KanbanColumn';
import { TaskCard } from '../components/board/TaskCard';
import { TaskDetailPanel } from '../components/board/TaskDetailPanel';
import { useRealtimeBoard } from '../hooks/useRealtimeBoard';
import { useProjectStore } from '../stores/project-store';
import type { Task, TaskStatus } from '../types';

const columns: TaskStatus[] = ['todo', 'locked', 'in_progress', 'review', 'done', 'failed'];

const columnTitles: Record<TaskStatus, string> = {
  todo: 'TODO',
  locked: 'LOCKED',
  in_progress: 'IN PROGRESS',
  review: 'REVIEW',
  done: 'DONE',
  failed: 'FAILED',
};

export function BoardPage() {
  const { tasks, summary, loading, fetchTasks, fetchSummary } = useRealtimeBoard();
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [dispatchTask, setDispatchTask] = useState<Task | null>(null);
  const [activeTask, setActiveTask] = useState<Task | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState<string>(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
  const [dateTo, setDateTo] = useState<string>('');

  const handleRefresh = useCallback(() => {
    fetchTasks(selectedProjectId);
    fetchSummary(selectedProjectId);
  }, [fetchTasks, fetchSummary, selectedProjectId]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
  );

  // Listen for dependency navigation from TaskDetailPanel
  useEffect(() => {
    const handleOpenTask = (e: CustomEvent<string>) => {
      setSelectedTaskId(e.detail);
    };
    window.addEventListener('openTaskPanel', handleOpenTask as EventListener);
    return () => {
      window.removeEventListener('openTaskPanel', handleOpenTask as EventListener);
    };
  }, []);

  const filteredTasks = useMemo(() => {
    if (!dateFrom && !dateTo) return tasks;
    return tasks.filter((t) => {
      const created = new Date(t.createdAt).getTime();
      if (dateFrom) {
        const from = new Date(dateFrom + 'T00:00:00').getTime();
        if (created < from) return false;
      }
      if (dateTo) {
        const to = new Date(dateTo + 'T23:59:59.999').getTime();
        if (created > to) return false;
      }
      return true;
    });
  }, [tasks, dateFrom, dateTo]);

  const tasksByStatus = useMemo(() => {
    return columns.reduce(
      (acc, status) => {
        acc[status] = filteredTasks.filter((t) => t.status === status);
        return acc;
      },
      {} as Record<TaskStatus, Task[]>,
    );
  }, [filteredTasks]);

  const handleDragStart = (event: DragStartEvent) => {
    const task = event.active.data.current?.task as Task;
    if (task) {
      setActiveTask(task);
      setIsDragging(true);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setIsDragging(false);
    setActiveTask(null);

    if (!over) return;

    const taskId = active.id as string;
    const newStatus = over.id as TaskStatus;
    const task = tasks.find((t) => t.id === taskId);

    if (task && task.status !== newStatus && newStatus === 'todo') {
      try {
        await apiClient.updateTask(taskId, { status: newStatus });
      } catch (err) {
        console.error('Failed to move task:', err);
      }
    }
  };

  const handleTaskClick = (task: Task) => {
    if (!isDragging) {
      setSelectedTaskId(task.id);
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Board</h1>
          <p className="text-gray-400 text-sm mt-1">Manage and track your tasks</p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Task
        </button>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"
            />
          </svg>
          <span>Filter</span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-300 focus:border-blue-500 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-gray-500">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-gray-300 focus:border-blue-500 focus:outline-none"
          />
        </div>
        {(dateFrom || dateTo) && (
          <button
            onClick={() => {
              setDateFrom('');
              setDateTo('');
            }}
            className="text-xs text-gray-500 hover:text-gray-300 px-2 py-1"
          >
            Clear
          </button>
        )}
        {(dateFrom || dateTo) && (
          <span className="text-xs text-gray-500">
            ({filteredTasks.length} of {tasks.length} tasks)
          </span>
        )}
      </div>

      {loading && tasks.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex items-center gap-3 text-gray-400">
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
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
            Loading tasks...
          </div>
        </div>
      ) : (
        <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
          <div className="flex-1 overflow-x-auto overflow-y-hidden">
            <div className="flex gap-4 min-w-max h-full pb-4">
              {columns.map((status) => (
                <KanbanColumn
                  key={status}
                  status={status}
                  title={columnTitles[status]}
                  tasks={tasksByStatus[status] || []}
                  count={tasksByStatus[status]?.length || 0}
                  onTaskClick={handleTaskClick}
                  onDispatch={setDispatchTask}
                />
              ))}
            </div>
          </div>

          <DragOverlay>
            {activeTask ? (
              <div className="opacity-90 rotate-3">
                <TaskCard task={activeTask} onClick={() => {}} draggable={false} />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      <CreateTaskModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleRefresh}
      />

      <DispatchDialog
        isOpen={dispatchTask !== null}
        onClose={() => setDispatchTask(null)}
        task={dispatchTask}
        onSuccess={handleRefresh}
      />

      {selectedTaskId && (
        <TaskDetailPanel
          taskId={selectedTaskId}
          onClose={() => setSelectedTaskId(null)}
          onTaskUpdated={handleRefresh}
        />
      )}
    </div>
  );
}
