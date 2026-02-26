export type TaskStatus = 'todo' | 'locked' | 'in_progress' | 'review' | 'done' | 'failed';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  labels: string[];
  assignedAgentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDetail extends Task {
  dependsOn: string[];
  blockedBy: string[];
  comments: { id: number; taskId: string; agentId: string; content: string; createdAt: string }[];
  progressLogs: { id: number; taskId: string; agentId: string; message: string; createdAt: string }[];
}

export interface Agent {
  id: string;
  name: string;
  role: 'main' | 'worker';
  agentType: string | null;
  status: 'active' | 'disconnected';
  connectedAt: string;
  lastHeartbeat: string;
  processId: number | null;
  currentTaskId: string | null;
  currentTaskTitle: string | null;
  tasksCompleted: number;
  tasksFailed: number;
}

export interface ATCEvent {
  id: number;
  type: string;
  taskId: string | null;
  agentId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface BoardSummary {
  todo: number;
  locked: number;
  inProgress: number;
  review: number;
  done: number;
  failed: number;
  agents: Agent[];
  recentEvents: ATCEvent[];
}

export interface CreateTaskInput {
  title: string;
  description?: string;
  priority?: TaskPriority;
  labels?: string[];
  projectId?: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  labels?: string[];
  assignedAgentId?: string | null;
}

export interface Project {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
}

export type WebSocketMessage = 
  | { type: 'task:created'; task: Task }
  | { type: 'task:updated'; task: Task }
  | { type: 'task:deleted'; taskId: string }
  | { type: 'task:assigned'; taskId: string; agentId: string }
  | { type: 'task:released'; taskId: string }
  | { type: 'task:moved'; taskId: string; status: TaskStatus }
  | { type: 'agent:connected'; agent: Agent }
  | { type: 'agent:disconnected'; agentId: string }
  | { type: 'agent:heartbeat'; agentId: string; timestamp: string }
  | { type: 'event:created'; event: ATCEvent }
  | { type: 'project:created'; project: Project }
  | { type: 'project:deleted'; projectId: string }
