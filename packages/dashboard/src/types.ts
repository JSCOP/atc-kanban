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
  requiresReview: boolean;
  assignedAgentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskDetail extends Task {
  dependsOn: string[];
  blockedBy: string[];
  comments: { id: number; taskId: string; agentId: string; content: string; createdAt: string }[];
  progressLogs: {
    id: number;
    taskId: string;
    agentId: string;
    message: string;
    createdAt: string;
  }[];
}

export interface Agent {
  id: string;
  name: string;
  role: 'main' | 'worker';
  agentType: string | null;
  connectionType: 'mcp' | 'opencode';
  serverUrl: string | null;
  status: 'active' | 'disconnected';
  connectedAt: string;
  lastHeartbeat: string;
  processId: number | null;
  cwd: string | null;
  sessionId: string | null;
  sessionTitle: string | null;
  spawnedPid: number | null;
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
  requiresReview?: boolean;
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
  repoRoot: string | null;
  baseBranch: string | null;
  autoDispatch: boolean;
  createdAt: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  repoRoot?: string;
  baseBranch?: string;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  repoRoot?: string;
  baseBranch?: string;
  autoDispatch?: boolean;
}

export interface Workspace {
  id: string;
  taskId: string | null;
  agentId: string | null;
  worktreePath: string;
  branchName: string;
  baseBranch: string;
  repoRoot: string;
  status: 'active' | 'archived' | 'deleted';
  createdAt: string;
}

export interface RegisterOpenCodeAgentInput {
  name: string;
  serverUrl: string;
}

export interface DispatchTaskInput {
  taskId: string;
  agentId: string;
  prompt?: string;
  opencodeAgent?: string;
  sessionId?: string;
}

export interface DispatchResult {
  success: boolean;
  agentId: string;
  taskId: string;
  sessionId: string | null;
  message: string;
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
  | { type: 'workspace:created'; workspace: Workspace }
  | { type: 'workspace:deleted'; workspaceId: string }
  | { type: 'workspace:updated'; workspace: Workspace };

// ── OpenCode Session Message Types ───────────────────────────────────────────

export interface OpenCodeMessagePart {
  type: string;
  text?: string;
}

export interface OpenCodeMessage {
  id: string;
  role: 'user' | 'assistant';
  parts: OpenCodeMessagePart[];
  content: string;
  createdAt: string;
}

 // ── Discovery Types ──────────────────────────────────────────────────────────

export interface DiscoveredInstance {
  serverUrl: string;
  port: number;
  healthy: boolean;
  alreadyRegistered: boolean;
  existingAgentId: string | null;
}

export interface DetectedProcess {
  pid: number;
  command: string;
  hasHttpServer: boolean;
  extractedPort: number | null;
  listenPorts: number[];
}

export interface DiscoveryResult {
  discovered: DiscoveredInstance[];
  processes: DetectedProcess[];
  scannedRange: [number, number];
  duration: number;
}

// ── Filesystem Browser Types ────────────────────────────────────────────────

export interface FsRoot {
  path: string;
  label: string;
  kind: 'drive' | 'root';
}

export interface FsEntry {
  name: string;
  path: string;
  isDirectory: boolean;
  isGitRepo: boolean;
  size?: number;
}

export interface BrowseResult {
  path: string;
  parent: string | null;
  entries: FsEntry[];
}
