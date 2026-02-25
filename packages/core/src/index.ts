// ── Database ─────────────────────────────────────────────────────────────────
export { getConnection, getRawDb, closeConnection, initializeDatabase } from './db/connection.js';
export * as schema from './db/schema.js';

import { initializeDatabase } from './db/connection.js';
import { AgentRegistry } from './services/agent-registry.js';
import { DependencyResolver } from './services/dependency-resolver.js';
// ── Services ─────────────────────────────────────────────────────────────────
import { EventBus } from './services/event-bus.js';
import { LockEngine } from './services/lock-engine.js';
import { ProjectService } from './services/project-service.js';
import { RoleManager } from './services/role-manager.js';
import { TaskService } from './services/task-service.js';

export {
  EventBus,
  AgentRegistry,
  RoleManager,
  DependencyResolver,
  TaskService,
  LockEngine,
  ProjectService,
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
  RegisterAgentInput,
  RegisterAgentResult,
  TaskLock,
  ClaimResult,
  EventType,
  ATCEvent,
  TaskComment,
  ProgressLog,
  Project,
  BoardSummary,
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
  projectService: ProjectService;
  lockEngine: LockEngine;
}

/**
 * Initialize all ATC services. Single entry point.
 */
export function createServices(
  options: {
    dbPath?: string;
    lockTtlMinutes?: number;
    heartbeatTimeoutSeconds?: number;
  } = {},
): ATCServices {
  const { lockTtlMinutes = 30, heartbeatTimeoutSeconds = 60 } = options;

  const db = initializeDatabase(options.dbPath);
  const eventBus = new EventBus(db);
  const agentRegistry = new AgentRegistry(db, eventBus, heartbeatTimeoutSeconds);
  const roleManager = new RoleManager(agentRegistry);
  const dependencyResolver = new DependencyResolver(db);
  const taskService = new TaskService(db, eventBus, dependencyResolver, agentRegistry);
  const projectService = new ProjectService(db);
  const lockEngine = new LockEngine(db, eventBus, dependencyResolver, lockTtlMinutes);

  return {
    db,
    eventBus,
    agentRegistry,
    roleManager,
    dependencyResolver,
    taskService,
    projectService,
    lockEngine,
  };
}
