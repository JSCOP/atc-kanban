import { useNavigate, useParams } from 'react-router-dom';
import { TaskDetailPanel } from '../components/board/TaskDetailPanel';

export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  if (!id) return <div className="p-6 text-gray-400">Task not found</div>;

  return (
    <div className="h-full relative">
      <TaskDetailPanel taskId={id} onClose={() => navigate('/')} onTaskUpdated={() => {}} />
    </div>
  );
}
