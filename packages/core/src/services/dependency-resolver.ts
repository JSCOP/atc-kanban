import { eq, and } from 'drizzle-orm';
import { taskDependencies, tasks } from '../db/schema.js';
import type { getConnection } from '../db/connection.js';
import { ATCError } from '../types.js';

type DbType = ReturnType<typeof getConnection>;

export class DependencyResolver {
  private db: DbType;

  constructor(db: DbType) {
    this.db = db;
  }

  /**
   * Set dependencies for a task. Validates no cycles.
   */
  setDependencies(taskId: string, dependsOn: string[]): void {
    // Validate all dependency tasks exist
    for (const depId of dependsOn) {
      if (depId === taskId) {
        throw new ATCError('SELF_DEPENDENCY', 'A task cannot depend on itself');
      }

      const depTask = this.db
        .select()
        .from(tasks)
        .where(eq(tasks.id, depId))
        .get();

      if (!depTask) {
        throw new ATCError('DEPENDENCY_NOT_FOUND', `Dependency task ${depId} not found`, 404);
      }
    }

    // Check for cycles before inserting
    for (const depId of dependsOn) {
      if (this.wouldCreateCycle(taskId, depId)) {
        throw new ATCError(
          'CIRCULAR_DEPENDENCY',
          `Adding dependency ${taskId} → ${depId} would create a cycle`,
        );
      }
    }

    // Clear existing dependencies
    this.db
      .delete(taskDependencies)
      .where(eq(taskDependencies.taskId, taskId))
      .run();

    // Insert new dependencies
    for (const depId of dependsOn) {
      this.db
        .insert(taskDependencies)
        .values({ taskId, dependsOn: depId })
        .run();
    }
  }

  /**
   * Check if adding an edge taskId → depId would create a cycle.
   * Uses DFS from depId to see if we can reach taskId.
   */
  private wouldCreateCycle(taskId: string, depId: string): boolean {
    const visited = new Set<string>();
    const stack = [depId];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === taskId) return true;
      if (visited.has(current)) continue;
      visited.add(current);

      // Get all tasks that `current` depends on
      const deps = this.db
        .select({ dependsOn: taskDependencies.dependsOn })
        .from(taskDependencies)
        .where(eq(taskDependencies.taskId, current))
        .all();

      for (const dep of deps) {
        stack.push(dep.dependsOn);
      }
    }

    return false;
  }

  /**
   * Check if all dependencies of a task are met (status = 'done').
   */
  areDependenciesMet(taskId: string): boolean {
    const deps = this.db
      .select({
        dependsOn: taskDependencies.dependsOn,
      })
      .from(taskDependencies)
      .where(eq(taskDependencies.taskId, taskId))
      .all();

    if (deps.length === 0) return true;

    for (const dep of deps) {
      const task = this.db
        .select({ status: tasks.status })
        .from(tasks)
        .where(eq(tasks.id, dep.dependsOn))
        .get();

      if (!task || task.status !== 'done') {
        return false;
      }
    }

    return true;
  }

  /**
   * Get direct dependencies of a task.
   */
  getDependencies(taskId: string): string[] {
    return this.db
      .select({ dependsOn: taskDependencies.dependsOn })
      .from(taskDependencies)
      .where(eq(taskDependencies.taskId, taskId))
      .all()
      .map((r) => r.dependsOn);
  }

  /**
   * Get tasks that are blocked by a given task.
   */
  getBlockedBy(taskId: string): string[] {
    return this.db
      .select({ taskId: taskDependencies.taskId })
      .from(taskDependencies)
      .where(eq(taskDependencies.dependsOn, taskId))
      .all()
      .map((r) => r.taskId);
  }
}
