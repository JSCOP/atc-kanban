import { useDroppable } from '@dnd-kit/core';
import type { Task, TaskStatus } from '../../types';
import { TaskCard } from './TaskCard';

interface KanbanColumnProps {
  status: TaskStatus;
  title: string;
  tasks: Task[];
  count: number;
  onTaskClick: (task: Task) => void;
  onDispatch?: (task: Task) => void;
  isActive?: boolean;
}

const statusColors: Record<TaskStatus, string> = {
  todo: 'border-gray-600 bg-gray-600/10',
  locked: 'border-orange-600 bg-orange-600/10',
  in_progress: 'border-yellow-600 bg-yellow-600/10',
  review: 'border-blue-600 bg-blue-600/10',
  done: 'border-green-600 bg-green-600/10',
  failed: 'border-red-600 bg-red-600/10',
};

const statusLabels: Record<TaskStatus, string> = {
  todo: 'TODO',
  locked: 'LOCKED',
  in_progress: 'IN PROGRESS',
  review: 'REVIEW',
  done: 'DONE',
  failed: 'FAILED',
};

export function KanbanColumn({
  status,
  title,
  tasks,
  count,
  onTaskClick,
  onDispatch,
  isActive,
}: KanbanColumnProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: status,
    disabled: status !== 'todo', // Only allow dropping in todo column
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col bg-gray-900/50 rounded-xl border border-gray-800 min-w-[280px] max-w-[320px] flex-1 ${
        isOver ? 'ring-2 ring-blue-500/50 border-blue-500/50' : ''
      } ${isActive ? 'opacity-50' : ''}`}
    >
      <div
        className={`p-4 border-b border-gray-800 flex items-center justify-between ${statusColors[status]}`}
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-sm text-gray-200">
            {title || statusLabels[status]}
          </span>
          <span className="px-2 py-0.5 bg-gray-800 rounded-full text-xs text-gray-400 font-mono">
            {count}
          </span>
        </div>
      </div>

      <div className="p-3 space-y-2 min-h-[200px]">
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            onClick={() => onTaskClick(task)}
            onDispatch={onDispatch}
            draggable={status === 'todo'}
          />
        ))}
        {tasks.length === 0 && (
          <div className="text-center py-8 text-gray-600 text-sm">No tasks</div>
        )}
      </div>
    </div>
  );
}
