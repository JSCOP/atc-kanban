// ── Database ─────────────────────────────────────────────────────────────────
export { getConnection, getRawDb, closeConnection, initializeDatabase } from './db/connection.js';
export * as schema from './db/schema.js';
export { eq } from 'drizzle-orm';

import { initializeDatabase } from './db/connection.js';
import { AgentRegistry, isProcessAlive } from './services/agent-registry.js';
import { DependencyResolver } from './services/dependency-resolver.js';
// ── Services ─────────────────────────────────────────────────────────────────
import { EventBus } from './services/event-bus.js';
import { LockEngine } from './services/lock-engine.js';
import { OpenCodeBridge } from './services/opencode-bridge.js';
import { ProjectService } from './services/project-service.js';
import { RoleManager } from './services/role-manager.js';
import { TaskService } from './services/task-service.js';
import { WorkspaceService } from './services/workspace-service.js';

export {
  EventBus,
  AgentRegistry,
  isProcessAlive,
  RoleManager,
  DependencyResolver,
  TaskService,
  LockEngine,
  OpenCodeBridge,
  ProjectService,
  WorkspaceService,
};

// ── Types ────────────────────────────────────────────────────────────────────
export type {
  Task,
  TaskDetail,
  TaskStatus,
  TaskPriority,
  CreateTaskInput,
  UpdateTaskInput,
  Agent,
  AgentInfo,
  AgentRole,
  AgentStatus,
  AgentType,
  ConnectionType,
  WorkspaceMode,
  RegisterAgentInput,
  RegisterAgentResult,
  RegisterOpenCodeAgentInput,
  TaskLock,
  ClaimResult,
  EventType,
  ATCEvent,
  TaskComment,
  ProgressLog,
  Project,
  BoardSummary,
  Workspace,
  WorkspaceStatus,
  CreateWorkspaceInput,
  MergeResult,
  SyncResult,
  DispatchTaskInput,
  DispatchResult,
  OpenCodeMessage,
  OpenCodeMessagePart,
  OpenCodeSession,
  SpawnOpenCodeInput,
  SpawnOpenCodeResult,
} from './types.js';

export { ATCError } from './types.js';

// ── Service Container ────────────────────────────────────────────────────────

export interface ATCServices {
  db: ReturnType<typeof import('./db/connection.js').getConnection>;
  eventBus: EventBus;
  agentRegistry: AgentRegistry;
  roleManager: RoleManager;
  dependencyResolver: DependencyResolver;
  taskService: TaskService;
  opencodeBridge: OpenCodeBridge;
  projectService: ProjectService;
  lockEngine: LockEngine;
  workspaceService: WorkspaceService;
}

/**
 * Initialize all ATC services. Single entry point.
 */
export function createServices(
  options: {
    dbPath?: string;
    lockTtlMinutes?: number;
  } = {},
): ATCServices {
  const { lockTtlMinutes = 30 } = options;

  const db = initializeDatabase(options.dbPath);
  const eventBus = new EventBus(db);
  const agentRegistry = new AgentRegistry(db, eventBus);
  const roleManager = new RoleManager(agentRegistry);
  const dependencyResolver = new DependencyResolver(db);
  const taskService = new TaskService(db, eventBus, dependencyResolver, agentRegistry);
  const opencodeBridge = new OpenCodeBridge(db, eventBus, taskService, agentRegistry);
  const projectService = new ProjectService(db);
  const lockEngine = new LockEngine(db, eventBus, dependencyResolver, lockTtlMinutes);
  const workspaceService = new WorkspaceService(db, eventBus);
  lockEngine.setWorkspaceService(workspaceService);
  lockEngine.setProjectService(projectService);
  projectService.setWorkspaceService(workspaceService);
  opencodeBridge.setLockEngine(lockEngine);

  return {
    db,
    eventBus,
    agentRegistry,
    roleManager,
    dependencyResolver,
    taskService,
    opencodeBridge,
    projectService,
    lockEngine,
    workspaceService,
  };
}
