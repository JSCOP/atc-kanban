import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import type { getConnection } from '../db/connection.js';
import { projects, tasks } from '../db/schema.js';
import type { Project } from '../types.js';
import { ATCError } from '../types.js';

type DbType = ReturnType<typeof getConnection>;

export class ProjectService {
  private db: DbType;

  constructor(db: DbType) {
    this.db = db;
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

  createProject(input: { name: string; description?: string }): Project {
    const name = input.name?.trim();

    if (!name) {
      throw new ATCError('PROJECT_NAME_REQUIRED', 'Project name is required');
    }

    const id = uuidv4();
    const createdAt = new Date().toISOString();

    this.db
      .insert(projects)
      .values({
        id,
        name,
        description: input.description ?? null,
        createdAt,
      })
      .run();

    return this.getProject(id);
  }

  updateProject(id: string, input: { name?: string; description?: string }): Project {
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

  private rowToProject(row: typeof projects.$inferSelect): Project {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      createdAt: row.createdAt,
    };
  }
}
