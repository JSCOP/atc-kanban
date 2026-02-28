import { execSync } from 'node:child_process';
import { normalize } from 'node:path';
import { and, eq, isNull } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import type { getConnection } from '../db/connection.js';
import { workspaces } from '../db/schema.js';
import type { CreateWorkspaceInput, MergeResult, SyncResult, Workspace } from '../types.js';
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

  findByTaskId(taskId: string): Workspace | null {
    const row = this.db
      .select()
      .from(workspaces)
      .where(and(eq(workspaces.taskId, taskId), eq(workspaces.status, 'active')))
      .get();
    return row ? this.rowToWorkspace(row) : null;
  }

  async archiveWorktree(workspaceId: string): Promise<void> {
    const workspace = this.getWorkspace(workspaceId);
    if (workspace.status !== 'active') {
      throw new ATCError(
        'INVALID_WORKSPACE_STATUS',
        `Workspace ${workspaceId} is not active (current: ${workspace.status})`,
        400,
      );
    }
    this.db
      .update(workspaces)
      .set({ status: 'archived' })
      .where(eq(workspaces.id, workspaceId))
      .run();
    await this.eventBus.publish('WORKSPACE_ARCHIVED', {
      payload: { workspaceId, repoRoot: workspace.repoRoot, branchName: workspace.branchName },
    });
  }

  async mergeWorktree(workspaceId: string): Promise<MergeResult> {
    const workspace = this.getWorkspace(workspaceId);
    if (workspace.status !== 'active') {
      throw new ATCError(
        'INVALID_WORKSPACE_STATUS',
        `Workspace ${workspaceId} is not active (current: ${workspace.status})`,
        400,
      );
    }
    if (!workspace.taskId) {
      throw new ATCError('NOT_A_TASK_WORKTREE', 'Cannot merge a root workspace', 400);
    }

    const repoRoot = this.normalizePath(workspace.repoRoot);
    const workspacePath = this.normalizePath(workspace.worktreePath);
    const tempWorktreePath = this.normalizePath(`${repoRoot}/.worktrees/.merge-tmp`);
    const shortId = workspace.taskId.slice(0, 8);

    const repoExecOpts = {
      cwd: repoRoot,
      encoding: 'utf-8' as const,
      stdio: ['pipe', 'pipe', 'pipe'] as ['pipe', 'pipe', 'pipe'],
    };

    const getGitError = (err: unknown): string => {
      if (typeof err === 'object' && err !== null && 'stderr' in err) {
        const stderr = (err as { stderr?: string | Buffer }).stderr;
        if (typeof stderr === 'string') {
          return stderr.trim();
        }
        if (stderr instanceof Buffer) {
          return stderr.toString('utf-8').trim();
        }
      }
      if (err instanceof Error) {
        return err.message;
      }
      return String(err);
    };

    try {
      let mergeTreeAvailable = true;
      try {
        execSync(
          `git merge-tree --write-tree ${workspace.baseBranch} ${workspace.branchName}`,
          repoExecOpts,
        );
      } catch (err) {
        const details = getGitError(err);
        const isUnavailable =
          details.includes('not a git command') ||
          details.includes('unknown option') ||
          details.includes('usage: git merge-tree');
        if (isUnavailable) {
          mergeTreeAvailable = false;
        } else {
          return { merged: false, conflictDetails: details };
        }
      }

      try {
        execSync('git worktree remove --force ".worktrees/.merge-tmp"', repoExecOpts);
      } catch {
        // Temp worktree may not exist.
      }

      execSync(
        `git worktree add --detach "${tempWorktreePath}" ${workspace.baseBranch}`,
        repoExecOpts,
      );

      let commitHash: string;
      try {
        const tempExecOpts = {
          cwd: tempWorktreePath,
          encoding: 'utf-8' as const,
          stdio: ['pipe', 'pipe', 'pipe'] as ['pipe', 'pipe', 'pipe'],
        };

        execSync(`git checkout -B ${workspace.baseBranch}`, tempExecOpts);
        try {
          execSync(`git merge --squash ${workspace.branchName}`, tempExecOpts);
        } catch (err) {
          const details = getGitError(err);
          if (!mergeTreeAvailable) {
            return { merged: false, conflictDetails: details };
          }
          throw err;
        }
        execSync(`git commit -m "merge: task/${shortId} - squash merge from worktree"`, {
          ...tempExecOpts,
          env: {
            ...process.env,
            GIT_AUTHOR_NAME: 'atc-bot',
            GIT_AUTHOR_EMAIL: 'atc@local',
            GIT_COMMITTER_NAME: 'atc-bot',
            GIT_COMMITTER_EMAIL: 'atc@local',
          },
        });
        commitHash = execSync('git rev-parse HEAD', tempExecOpts).trim();
      } finally {
        try {
          execSync(`git worktree remove --force "${tempWorktreePath}"`, repoExecOpts);
        } catch {
          // Best-effort cleanup.
        }
        try {
          execSync('git worktree prune', repoExecOpts);
        } catch {
          // Best-effort cleanup.
        }
      }

      await this.archiveWorktree(workspaceId);

      try {
        execSync('git checkout --detach', {
          cwd: workspacePath,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch {
        // Best-effort to allow branch deletion.
      }

      try {
        execSync(`git branch -D ${workspace.branchName}`, repoExecOpts);
      } catch {
        // Non-fatal cleanup.
      }

      await this.eventBus.publish('WORKSPACE_MERGED', {
        payload: {
          workspaceId,
          repoRoot,
          branchName: workspace.branchName,
          baseBranch: workspace.baseBranch,
          commitHash,
        },
      });

      return { merged: true, commitHash };
    } catch (err) {
      if (err instanceof ATCError) {
        throw err;
      }
      throw new ATCError('GIT_MERGE_FAILED', `Failed to merge workspace: ${getGitError(err)}`, 500);
    }
  }

  async syncWithBase(workspaceId: string): Promise<SyncResult> {
    const workspace = this.getWorkspace(workspaceId);
    if (workspace.status !== 'active') {
      throw new ATCError('INVALID_WORKSPACE_STATUS', `Workspace ${workspaceId} is not active`, 400);
    }
    if (!workspace.taskId) {
      throw new ATCError('NOT_A_TASK_WORKTREE', 'Cannot sync a root workspace', 400);
    }

    const worktreePath = this.normalizePath(workspace.worktreePath);
    const repoRoot = this.normalizePath(workspace.repoRoot);
    const execOpts = {
      cwd: worktreePath,
      encoding: 'utf-8' as const,
      stdio: ['pipe', 'pipe', 'pipe'] as ['pipe', 'pipe', 'pipe'],
    };

    try {
      execSync(`git fetch origin ${workspace.baseBranch}`, {
        ...execOpts,
        cwd: repoRoot,
      });
    } catch {
      // No remote configured — skip fetch, use local base branch
    }

    try {
      execSync(`git rebase ${workspace.baseBranch}`, execOpts);
      return { synced: true };
    } catch (err) {
      try {
        execSync('git rebase --abort', execOpts);
      } catch {
        // Already clean
      }
      return {
        synced: false,
        conflictDetails: (err as Error).message,
      };
    }
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
