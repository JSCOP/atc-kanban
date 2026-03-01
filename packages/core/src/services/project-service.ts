import { normalize } from 'node:path';
import { and, eq, isNotNull } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import type { getConnection } from '../db/connection.js';
import { projects, tasks } from '../db/schema.js';
import type { Project } from '../types.js';
import { ATCError } from '../types.js';
import type { WorkspaceService } from './workspace-service.js';

type DbType = ReturnType<typeof getConnection>;

export class ProjectService {
  private db: DbType;
  private workspaceService: WorkspaceService | null = null;

  constructor(db: DbType) {
    this.db = db;
  }

  /**
   * Inject WorkspaceService for git repo validation during project creation.
   * Called after service container is assembled to avoid circular deps.
   */
  setWorkspaceService(ws: WorkspaceService): void {
    this.workspaceService = ws;
  }

  listProjects(): Project[] {
    const rows = this.db.select().from(projects).orderBy(projects.createdAt).all();
    return rows.map((row) => this.rowToProject(row));
  }

  getProject(id: string): Project {
    const row = this.db.select().from(projects).where(eq(projects.id, id)).get();

    if (!row) {
      throw new ATCError('PROJECT_NOT_FOUND', `Project ${id} not found`, 404);
    }

    return this.rowToProject(row);
  }

  createProject(input: {
    name: string;
    description?: string;
    repoRoot?: string;
    baseBranch?: string;
  }): Project {
    const name = input.name?.trim();

    if (!name) {
      throw new ATCError('PROJECT_NAME_REQUIRED', 'Project name is required');
    }

    let normalizedRepoRoot: string | null = null;
    const baseBranch = input.baseBranch?.trim() || null;

    if (input.repoRoot) {
      normalizedRepoRoot = this.validateAndNormalizeRepoRoot(input.repoRoot);
      this.checkRepoRootUniqueness(normalizedRepoRoot);
    }

    const id = uuidv4();
    const createdAt = new Date().toISOString();

    this.db
      .insert(projects)
      .values({
        id,
        name,
        description: input.description ?? null,
        repoRoot: normalizedRepoRoot,
        baseBranch,
        createdAt,
      })
      .run();

    return this.getProject(id);
  }

  updateProject(
    id: string,
    input: { name?: string; description?: string; repoRoot?: string; baseBranch?: string },
  ): Project {
    this.getProject(id);

    const updateData: Partial<typeof projects.$inferInsert> = {};

    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) {
        throw new ATCError('PROJECT_NAME_REQUIRED', 'Project name is required');
      }
      updateData.name = name;
    }

    if (input.description !== undefined) {
      updateData.description = input.description;
    }

    if (input.repoRoot !== undefined) {
      if (input.repoRoot) {
        const normalizedRepoRoot = this.validateAndNormalizeRepoRoot(input.repoRoot);
        this.checkRepoRootUniqueness(normalizedRepoRoot, id);
        updateData.repoRoot = normalizedRepoRoot;
      } else {
        // Allow clearing repoRoot by passing empty string
        updateData.repoRoot = null;
      }
    }

    if (input.baseBranch !== undefined) {
      updateData.baseBranch = input.baseBranch || null;
    }

    if (Object.keys(updateData).length > 0) {
      this.db.update(projects).set(updateData).where(eq(projects.id, id)).run();
    }

    return this.getProject(id);
  }

  deleteProject(id: string): void {
    if (id === 'default') {
      throw new ATCError('CANNOT_DELETE_DEFAULT_PROJECT', 'Cannot delete default project');
    }

    this.getProject(id);

    const task = this.db.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, id)).get();
    if (task) {
      throw new ATCError('PROJECT_HAS_TASKS', 'Cannot delete project with existing tasks');
    }

    this.db.delete(projects).where(eq(projects.id, id)).run();
  }

  /**
   * Validate that the path is a git repo and normalize it.
   */
  private validateAndNormalizeRepoRoot(repoRoot: string): string {
    const normalized = this.normalizePath(repoRoot);

    if (!this.workspaceService) {
      // Without WorkspaceService, skip git validation but still normalize
      return normalized;
    }

    const gitRoot = this.workspaceService.getGitRoot(normalized);
    if (!gitRoot) {
      throw new ATCError('NOT_A_GIT_REPO', `Path is not a git repository: ${normalized}`, 400);
    }

    return gitRoot;
  }

  /**
   * Check that no other project uses this repoRoot.
   */
  private checkRepoRootUniqueness(repoRoot: string, excludeProjectId?: string): void {
    const existing = this.db
      .select()
      .from(projects)
      .where(and(eq(projects.repoRoot, repoRoot), isNotNull(projects.repoRoot)))
      .all();

    const conflict = existing.find((p) => p.id !== excludeProjectId);
    if (conflict) {
      throw new ATCError(
        'REPO_ALREADY_LINKED',
        `Repository ${repoRoot} is already linked to project "${conflict.name}"`,
        409,
      );
    }
  }

  /**
   * Normalize path separators (Windows compat).
   */
  private normalizePath(p: string): string {
    return normalize(p).replace(/\\/g, '/');
  }

  private rowToProject(row: typeof projects.$inferSelect): Project {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      repoRoot: row.repoRoot ?? null,
      baseBranch: row.baseBranch ?? null,
      createdAt: row.createdAt,
    };
  }
}
