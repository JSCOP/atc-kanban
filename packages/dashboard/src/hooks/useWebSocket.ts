import { useEffect } from 'react';
import { wsClient } from '../api/ws';
import { useBoardStore } from '../stores/board-store';
import { useAgentStore } from '../stores/agent-store';
import { useEventStore } from '../stores/event-store';
import { useProjectStore } from '../stores/project-store';
import { useWorkspaceStore } from '../stores/workspace-store';

export function useWebSocket() {
  const boardStore = useBoardStore();
  const agentStore = useAgentStore();
  const eventStore = useEventStore();
  const workspaceStore = useWorkspaceStore();
  const selectedProjectId = useProjectStore((s) => s.selectedProjectId);
  const addProject = useProjectStore((s) => s.addProject);
  const removeProject = useProjectStore((s) => s.removeProject);

  useEffect(() => {
    // Connect to WebSocket
    wsClient.connect();

    // Subscribe to messages
    const unsubscribe = wsClient.subscribe((message) => {
      switch (message.type) {
        case 'task:created':
          // Only add task if it belongs to the selected project
          if (message.task.projectId === selectedProjectId) {
            boardStore.addTask(message.task);
          }
          break;
        case 'task:updated':
          if (message.task.projectId === selectedProjectId) {
            boardStore.updateTask(message.task);
          }
          break;
        case 'task:deleted':
          boardStore.removeTask(message.taskId);
          break;
        case 'task:moved':
          boardStore.moveTask(message.taskId, message.status);
          break;
        case 'agent:connected':
          agentStore.updateAgent(message.agent);
          break;
        case 'agent:disconnected':
          agentStore.removeAgent(message.agentId);
          break;
        case 'agent:heartbeat':
          // Update agent's last heartbeat
          const agent = agentStore.agents.find((a) => a.id === message.agentId);
          if (agent) {
            agentStore.updateAgent({ ...agent, lastHeartbeat: message.timestamp });
          }
          break;
        case 'event:created':
          eventStore.addEvent(message.event);
          break;
        case 'project:created':
          addProject(message.project);
          break;
        case 'project:deleted':
          removeProject(message.projectId);
          break;
        case 'workspace:created':
          workspaceStore.updateWorkspace(message.workspace);
          break;
        case 'workspace:deleted':
          workspaceStore.removeWorkspace(message.workspaceId);
          break;
        case 'workspace:updated':
          workspaceStore.updateWorkspace(message.workspace);
          break;
      }
    });

    // Cleanup on unmount
    return () => {
      unsubscribe();
    };
  }, [selectedProjectId]);
}
