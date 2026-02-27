import { execSync } from 'node:child_process';
import { normalize } from 'node:path';
import { and, eq, isNull } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import type { getConnection } from '../db/connection.js';
import { workspaces } from '../db/schema.js';
import type { CreateWorkspaceInput, Workspace } from '../types.js';
import { ATCError } from '../types.js';
import type { EventBus } from './event-bus.js';

type DbType = ReturnType<typeof getConnection>;

export class WorkspaceService {
  private db: DbType;
  private eventBus: EventBus;

  constructor(db: DbType, eventBus: EventBus) {
    this.db = db;
    this.eventBus = eventBus;
  }

  /**
   * Detect git repository root from any subdirectory.
   * Returns null if not a git repo.
   */
  getGitRoot(dirPath: string): string | null {
    try {
      const raw = execSync('git rev-parse --show-toplevel', {
        cwd: dirPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      return this.normalizePath(raw);
    } catch {
      return null;
    }
  }

  /**
   * Register a git repo as a workspace.
   */
  async createWorkspace(input: CreateWorkspaceInput): Promise<Workspace> {
    const repoRoot = this.normalizePath(input.repoRoot);

    // Validate it's a git repo
    const gitRoot = this.getGitRoot(repoRoot);
    if (!gitRoot) {
      throw new ATCError('NOT_A_GIT_REPO', `Path is not a git repository: ${repoRoot}`, 400);
    }

    // Check for duplicate active workspace for same repo_root
    const existing = this.db
      .select()
      .from(workspaces)
      .where(
        and(
          eq(workspaces.repoRoot, repoRoot),
          eq(workspaces.status, 'active'),
          isNull(workspaces.taskId),
        ),
      )
      .get();

    if (existing) {
      throw new ATCError(
        'WORKSPACE_ALREADY_EXISTS',
        `An active workspace already exists for repo: ${repoRoot}`,
        409,
      );
    }

    const id = uuidv4();
    const baseBranch = input.baseBranch ?? 'main';
    const createdAt = new Date().toISOString();

    this.db
      .insert(workspaces)
      .values({
        id,
        taskId: null,
        agentId: null,
        worktreePath: repoRoot,
        branchName: baseBranch,
        baseBranch,
        repoRoot,
        status: 'active',
        createdAt,
      })
      .run();

    await this.eventBus.publish('WORKSPACE_CREATED', {
      payload: { workspaceId: id, repoRoot, baseBranch },
    });

    return this.getWorkspace(id);
  }

  /**
   * List all workspaces with optional filters.
   */
  listWorkspaces(filters?: { repoRoot?: string; status?: string }): Workspace[] {
    const conditions = [];

    if (filters?.repoRoot) {
      conditions.push(eq(workspaces.repoRoot, this.normalizePath(filters.repoRoot)));
    }

    if (filters?.status) {
      conditions.push(eq(workspaces.status, filters.status as 'active' | 'archived' | 'deleted'));
    }

    const rows = this.db
      .select()
      .from(workspaces)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .all();

    return rows.map((row) => this.rowToWorkspace(row));
  }

  /**
   * Get single workspace by ID.
   * Throws ATCError WORKSPACE_NOT_FOUND if not found.
   */
  getWorkspace(id: string): Workspace {
    const row = this.db.select().from(workspaces).where(eq(workspaces.id, id)).get();

    if (!row) {
      throw new ATCError('WORKSPACE_NOT_FOUND', `Workspace ${id} not found`, 404);
    }

    return this.rowToWorkspace(row);
  }

  /**
   * Soft-delete a workspace and archive any active worktrees.
   */
  async deleteWorkspace(id: string): Promise<void> {
    const workspace = this.getWorkspace(id);

    // Archive any active worktrees (child workspaces with same repo_root and a taskId)
    const activeWorktrees = this.db
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.repoRoot, workspace.repoRoot), eq(workspaces.status, 'active')))
      .all();

    for (const worktree of activeWorktrees) {
      if (worktree.id !== id) {
        this.db
          .update(workspaces)
          .set({ status: 'archived' })
          .where(eq(workspaces.id, worktree.id))
          .run();
      }
    }

    // Soft-delete the workspace itself
    this.db.update(workspaces).set({ status: 'deleted' }).where(eq(workspaces.id, id)).run();

    await this.eventBus.publish('WORKSPACE_DELETED', {
      payload: { workspaceId: id, repoRoot: workspace.repoRoot },
    });
  }

  /**
   * Find workspace matching agent's working directory.
   * Returns null if no match found.
   */
  findWorkspaceForCwd(cwd: string): Workspace | null {
    const gitRoot = this.getGitRoot(cwd);
    if (!gitRoot) {
      return null;
    }

    const normalizedGitRoot = this.normalizePath(gitRoot);

    const row = this.db
      .select()
      .from(workspaces)
      .where(
        and(
          eq(workspaces.repoRoot, normalizedGitRoot),
          eq(workspaces.status, 'active'),
          isNull(workspaces.taskId),
        ),
      )
      .get();

    return row ? this.rowToWorkspace(row) : null;
  }

  /**
   * Create a git worktree for a task.
   */
  async createWorktreeForTask(
    repoRoot: string,
    baseBranch: string,
    taskId: string,
    agentId: string,
  ): Promise<Workspace> {
    const normalizedRepoRoot = this.normalizePath(repoRoot);
    const shortId = taskId.slice(0, 8);
    const branchName = `task/${shortId}`;
    const worktreePath = `${normalizedRepoRoot}/.worktrees/task-${shortId}`;

    const execOpts = {
      cwd: normalizedRepoRoot,
      encoding: 'utf-8' as const,
      stdio: ['pipe', 'pipe', 'pipe'] as ['pipe', 'pipe', 'pipe'],
    };

    // Always prune stale worktree entries first
    try {
      execSync('git worktree prune', execOpts);
    } catch (err) {
      throw new ATCError(
        'GIT_WORKTREE_PRUNE_FAILED',
        `Failed to prune worktrees: ${(err as Error).message}`,
        500,
      );
    }

    // Check if branch already exists
    let branchExists = false;
    try {
      execSync(`git rev-parse --verify ${branchName}`, execOpts);
      branchExists = true;
    } catch {
      branchExists = false;
    }

    // Create the worktree
    try {
      if (branchExists) {
        execSync(`git worktree add "${worktreePath}" ${branchName}`, execOpts);
      } else {
        execSync(`git worktree add -b ${branchName} "${worktreePath}" ${baseBranch}`, execOpts);
      }
    } catch (err) {
      throw new ATCError(
        'GIT_WORKTREE_CREATE_FAILED',
        `Failed to create worktree: ${(err as Error).message}`,
        500,
      );
    }

    const id = uuidv4();
    const createdAt = new Date().toISOString();

    this.db
      .insert(workspaces)
      .values({
        id,
        taskId,
        agentId,
        worktreePath,
        branchName,
        baseBranch,
        repoRoot: normalizedRepoRoot,
        status: 'active',
        createdAt,
      })
      .run();

    return this.getWorkspace(id);
  }

  /**
   * Remove a task worktree and update DB record.
   */
  async removeWorktree(workspaceId: string): Promise<void> {
    const workspace = this.getWorkspace(workspaceId);

    const execOpts = {
      cwd: workspace.repoRoot,
      encoding: 'utf-8' as const,
      stdio: ['pipe', 'pipe', 'pipe'] as ['pipe', 'pipe', 'pipe'],
    };

    // Remove the worktree
    try {
      execSync(`git worktree remove --force "${workspace.worktreePath}"`, execOpts);
    } catch (err) {
      throw new ATCError(
        'GIT_WORKTREE_REMOVE_FAILED',
        `Failed to remove worktree: ${(err as Error).message}`,
        500,
      );
    }

    // Prune stale entries
    try {
      execSync('git worktree prune', execOpts);
    } catch {
      // Non-fatal: prune failure shouldn't block the operation
    }

    // Optionally delete the branch (non-fatal)
    try {
      execSync(`git branch -D ${workspace.branchName}`, execOpts);
    } catch {
      // Branch may not exist or may be checked out elsewhere — ignore
    }

    // Mark workspace as deleted
    this.db
      .update(workspaces)
      .set({ status: 'deleted' })
      .where(eq(workspaces.id, workspaceId))
      .run();
  }

  /**
   * Normalize path separators (Windows compat).
   */
  private normalizePath(p: string): string {
    return normalize(p).replace(/\\/g, '/');
  }

  /**
   * Convert DB row to Workspace type.
   */
  private rowToWorkspace(row: typeof workspaces.$inferSelect): Workspace {
    return {
      id: row.id,
      taskId: row.taskId,
      agentId: row.agentId,
      worktreePath: row.worktreePath,
      branchName: row.branchName,
      baseBranch: row.baseBranch,
      repoRoot: row.repoRoot,
      status: row.status as 'active' | 'archived' | 'deleted',
      createdAt: row.createdAt,
    };
  }
}
