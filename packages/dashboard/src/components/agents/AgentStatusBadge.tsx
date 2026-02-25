interface AgentStatusBadgeProps {
  status: 'active' | 'disconnected';
}

export function AgentStatusBadge({ status }: AgentStatusBadgeProps) {
  const isOnline = status === 'active';

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${
      isOnline
        ? 'bg-green-500/10 text-green-400 border border-green-500/20'
        : 'bg-red-500/10 text-red-400 border border-red-500/20'
    }`}>
      <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
      {isOnline ? 'Online' : 'Offline'}
    </span>
  );
}
