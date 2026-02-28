// ── Task Types ──────────────────────────────────────────────────────────────

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
  comments: TaskComment[];
  progressLogs: ProgressLog[];
}

export interface CreateTaskInput {
  projectId?: string;
  title: string;
  description?: string;
  priority?: TaskPriority;
  labels?: string[];
  dependsOn?: string[];
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  priority?: TaskPriority;
  labels?: string[];
}

// ── Agent Types ─────────────────────────────────────────────────────────────

export type AgentRole = 'main' | 'worker';
export type AgentStatus = 'active' | 'disconnected';
export type AgentType = 'claude_code' | 'codex' | 'gemini' | 'opencode' | 'custom';
export type ConnectionType = 'mcp' | 'opencode';

export interface Agent {
  id: string;
  name: string;
  role: AgentRole;
  agentType: string | null;
  connectionType: ConnectionType;
  serverUrl: string | null;
  agentToken: string;
  status: AgentStatus;
  connectedAt: string;
  lastHeartbeat: string;
  processId: number | null;
  cwd: string | null;
  sessionId: string | null;
  spawnedPid: number | null;
}

export interface AgentInfo extends Agent {
  currentTaskId: string | null;
  currentTaskTitle: string | null;
  tasksCompleted: number;
  tasksFailed: number;
}

export interface RegisterAgentInput {
  name: string;
  role: AgentRole;
  agentType?: string;
  processId?: number;
  cwd?: string;
  sessionId?: string;
}

export interface RegisterOpenCodeAgentInput {
  name: string;
  serverUrl: string;
}

export interface RegisterAgentResult {
  agentId: string;
  agentToken: string;
  role: AgentRole;
  reconnected?: boolean;
}

// ── Lock Types ──────────────────────────────────────────────────────────────

export interface TaskLock {
  taskId: string;
  agentId: string;
  lockToken: string;
  lockedAt: string;
  expiresAt: string;
}

export interface ClaimResult {
  lockToken: string;
  task: TaskDetail;
  workspace?: { worktreePath: string; branchName: string };
}

// ── Event Types ─────────────────────────────────────────────────────────────

export type EventType =
  | 'TASK_CREATED'
  | 'TASK_CLAIMED'
  | 'TASK_RELEASED'
  | 'STATUS_CHANGED'
  | 'PROGRESS_REPORTED'
  | 'TASK_REVIEWED'
  | 'AGENT_CONNECTED'
  | 'AGENT_DISCONNECTED'
  | 'LOCK_EXPIRED'
  | 'WORKSPACE_CREATED'
  | 'WORKSPACE_MERGED'
  | 'WORKSPACE_ARCHIVED'
  | 'WORKSPACE_DELETED';

export interface ATCEvent {
  id: number;
  type: EventType;
  taskId: string | null;
  agentId: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

// ── Comment / Progress Types ────────────────────────────────────────────────

export interface TaskComment {
  id: number;
  taskId: string;
  agentId: string;
  content: string;
  createdAt: string;
}

export interface ProgressLog {
  id: number;
  taskId: string;
  agentId: string;
  message: string;
  createdAt: string;
}

// ── Project Types ───────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
}

// ── Board Summary ───────────────────────────────────────────────────────────

export interface BoardSummary {
  todo: number;
  locked: number;
  inProgress: number;
  review: number;
  done: number;
  failed: number;
  agents: AgentInfo[];
  recentEvents: ATCEvent[];
}

// ── Error Types ─────────────────────────────────────────────────────────────

export class ATCError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode = 400,
  ) {
    super(message);
    this.name = 'ATCError';
  }
}

// ── Workspace Types ───────────────────────────────────────────────────────

export type WorkspaceStatus = 'active' | 'archived' | 'deleted';

export interface Workspace {
  id: string;
  taskId: string | null;
  agentId: string | null;
  worktreePath: string;
  branchName: string;
  baseBranch: string;
  repoRoot: string;
  status: WorkspaceStatus;
  createdAt: string;
}

export interface CreateWorkspaceInput {
  repoRoot: string;
  baseBranch?: string;
}

export interface MergeResult {
  merged: boolean;
  commitHash?: string;
  conflictDetails?: string;
}

export interface SyncResult {
  synced: boolean;
  conflictDetails?: string;
}

// ── OpenCode Dispatch Types ──────────────────────────────────────────────

export interface DispatchTaskInput {
  taskId: string;
  agentId: string;
  prompt?: string;
  opencodeAgent?: string; // OpenCode agent type: 'build', 'plan', etc.
}

export interface DispatchResult {
  success: boolean;
  agentId: string;
  taskId: string;
  sessionId: string | null;
  message: string;
}

// ── OpenCode Session Message Types ───────────────────────────────────────

export interface OpenCodeMessagePart {
  type: string;
  text?: string;
}

export interface OpenCodeMessage {
  id: string;
  role: 'user' | 'assistant';
  parts: OpenCodeMessagePart[];
  content: string; // flattened text from parts
  createdAt: string;
}

export interface OpenCodeSession {
  id: string;
  title?: string;
  messages: OpenCodeMessage[];
}

// ── OpenCode Spawn Types ─────────────────────────────────────────────────

export interface SpawnOpenCodeInput {
  name: string;
  cwd: string;
  port?: number; // 0 = random
}

export interface SpawnOpenCodeResult {
  agentId: string;
  serverUrl: string;
  port: number;
  pid: number;
}
