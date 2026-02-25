import { EventEmitter } from 'node:events';
import { eq, desc, gt, and, inArray } from 'drizzle-orm';
import type { ATCEvent, EventType } from '../types.js';
import { events } from '../db/schema.js';
import type { getConnection } from '../db/connection.js';

type DbType = ReturnType<typeof getConnection>;

export class EventBus extends EventEmitter {
  private db: DbType;

  constructor(db: DbType) {
    super();
    this.setMaxListeners(100);
    this.db = db;
  }

  /**
   * Emit and persist an event.
   */
  async publish(
    type: EventType,
    options: {
      taskId?: string;
      agentId?: string;
      payload?: Record<string, unknown>;
    } = {},
  ): Promise<ATCEvent> {
    const now = new Date().toISOString();

    const [inserted] = this.db
      .insert(events)
      .values({
        type,
        taskId: options.taskId ?? null,
        agentId: options.agentId ?? null,
        payload: options.payload ? JSON.stringify(options.payload) : null,
        createdAt: now,
      })
      .returning()
      .all();

    const event: ATCEvent = {
      id: inserted.id,
      type: type as EventType,
      taskId: inserted.taskId,
      agentId: inserted.agentId,
      payload: options.payload || {},
      createdAt: inserted.createdAt,
    };

    // Emit to in-memory listeners (WebSocket broadcaster etc.)
    this.emit('event', event);
    this.emit(type, event);

    return event;
  }

  /**
   * Poll events since a given timestamp.
   */
  pollEvents(options: {
    since?: string;
    types?: EventType[];
    limit?: number;
  } = {}): ATCEvent[] {
    const { since, types, limit = 50 } = options;

    const conditions = [];
    if (since) {
      conditions.push(gt(events.createdAt, since));
    }
    if (types && types.length > 0) {
      conditions.push(inArray(events.type, types));
    }

    const rows = this.db
      .select()
      .from(events)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(events.createdAt))
      .limit(limit)
      .all();

    return rows.map((row) => ({
      id: row.id,
      type: row.type as EventType,
      taskId: row.taskId,
      agentId: row.agentId,
      payload: row.payload ? JSON.parse(row.payload) : {},
      createdAt: row.createdAt,
    }));
  }

  /**
   * Get recent events (for board summary, etc.)
   */
  getRecentEvents(limit: number = 20): ATCEvent[] {
    return this.pollEvents({ limit });
  }
}
