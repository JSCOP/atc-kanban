import { useEventStore } from '../../stores/event-store';

const eventTypes = [
  { value: '', label: 'All Types' },
  { value: 'task_created', label: 'Task Created' },
  { value: 'task_assigned', label: 'Task Assigned' },
  { value: 'task_completed', label: 'Task Completed' },
  { value: 'task_failed', label: 'Task Failed' },
  { value: 'agent_connected', label: 'Agent Connected' },
  { value: 'agent_disconnected', label: 'Agent Disconnected' },
];

export function EventFilter() {
  const { filters, setFilters } = useEventStore();

  return (
    <div className="flex flex-wrap gap-4">
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-400">Type:</label>
        <select
          value={filters.type || ''}
          onChange={(e) => setFilters({ ...filters, type: e.target.value || undefined })}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500"
        >
          {eventTypes.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-400">Agent:</label>
        <input
          type="text"
          value={filters.agentId || ''}
          onChange={(e) => setFilters({ ...filters, agentId: e.target.value || undefined })}
          placeholder="Agent ID"
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-200 focus:outline-none focus:border-blue-500 w-40"
        />
      </div>
    </div>
  );
}
