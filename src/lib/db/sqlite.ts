// Native backend — on-device SQLite via @capacitor-community/sqlite.
import {
  CapacitorSQLite,
  SQLiteConnection,
  type SQLiteDBConnection,
} from '@capacitor-community/sqlite';
import type { CalendarEvent, Completion, Task } from '../types';
import type { DB, DbDump } from './index';
import { SCHEMA_SQL, SCHEMA_VERSION } from './schema';

const DB_NAME = 'ontrack';

export class SqliteBackend implements DB {
  private sqlite = new SQLiteConnection(CapacitorSQLite);
  private db!: SQLiteDBConnection;

  async init(): Promise<void> {
    const ret = await this.sqlite.checkConnectionsConsistency().catch(() => ({ result: false }));
    const isConn = (await this.sqlite.isConnection(DB_NAME, false)).result;
    if (ret.result && isConn) {
      this.db = await this.sqlite.retrieveConnection(DB_NAME, false);
    } else {
      this.db = await this.sqlite.createConnection(DB_NAME, false, 'no-encryption', SCHEMA_VERSION, false);
    }
    await this.db.open();
    await this.db.execute(SCHEMA_SQL);
  }

  async getTasks(): Promise<Task[]> {
    const res = await this.db.query('SELECT * FROM tasks ORDER BY sort_order, title;');
    return (res.values ?? []).map(rowToTask);
  }

  async upsertTask(t: Task): Promise<void> {
    await this.db.run(
      `INSERT INTO tasks (id, owner, title, section, scheduled_at, recurrence, remind_lead, active, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         owner=excluded.owner, title=excluded.title, section=excluded.section,
         scheduled_at=excluded.scheduled_at, recurrence=excluded.recurrence,
         remind_lead=excluded.remind_lead, active=excluded.active, sort_order=excluded.sort_order;`,
      [t.id, t.owner, t.title, t.section, t.scheduledAt, t.recurrence, t.remindLead, t.active ? 1 : 0, t.sortOrder],
    );
  }

  async deleteTask(id: string): Promise<void> {
    await this.db.run('DELETE FROM tasks WHERE id = ?;', [id]);
    await this.db.run('DELETE FROM completions WHERE task_id = ?;', [id]);
  }

  async getCompletions(fromDate: string, toDate: string): Promise<Completion[]> {
    const res = await this.db.query(
      'SELECT * FROM completions WHERE date >= ? AND date <= ? ORDER BY date;',
      [fromDate, toDate],
    );
    return (res.values ?? []).map(rowToCompletion);
  }

  async setCompletion(c: Completion): Promise<void> {
    await this.db.run(
      `INSERT INTO completions (id, task_id, date, owner, done_at, status)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(task_id, date, owner) DO UPDATE SET
         done_at=excluded.done_at, status=excluded.status;`,
      [c.id, c.taskId, c.date, c.owner, c.doneAt, c.status],
    );
  }

  async deleteCompletion(taskId: string, date: string, owner: string): Promise<void> {
    await this.db.run('DELETE FROM completions WHERE task_id = ? AND date = ? AND owner = ?;', [
      taskId,
      date,
      owner,
    ]);
  }

  async getCalendarEvents(): Promise<CalendarEvent[]> {
    const res = await this.db.query('SELECT * FROM calendar_events ORDER BY starts_at;');
    return (res.values ?? []).map(rowToEvent);
  }

  async replaceCalendarEvents(events: CalendarEvent[]): Promise<void> {
    await this.db.execute('DELETE FROM calendar_events;');
    for (const e of events) {
      await this.db.run(
        'INSERT INTO calendar_events (id, title, starts_at, ends_at, source, all_day) VALUES (?, ?, ?, ?, ?, ?);',
        [e.id, e.title, e.startsAt, e.endsAt, e.source, e.allDay ? 1 : 0],
      );
    }
  }

  async getSetting(key: string): Promise<string | null> {
    const res = await this.db.query('SELECT value FROM settings WHERE key = ?;', [key]);
    return res.values?.[0]?.value ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.db.run(
      `INSERT INTO settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value=excluded.value;`,
      [key, value],
    );
  }

  async exportAll(): Promise<DbDump> {
    const tasks = await this.getTasks();
    const completions = await this.getCompletions('0000-00-00', '9999-99-99');
    const res = await this.db.query('SELECT key, value FROM settings;');
    const settings: Record<string, string> = {};
    for (const row of res.values ?? []) settings[row.key] = row.value;
    return { version: SCHEMA_VERSION, exportedAt: new Date().toISOString(), tasks, completions, settings };
  }

  async importAll(dump: DbDump): Promise<void> {
    await this.db.execute('DELETE FROM tasks; DELETE FROM completions; DELETE FROM settings;');
    for (const t of dump.tasks) await this.upsertTask(t);
    for (const c of dump.completions) await this.setCompletion(c);
    for (const [k, v] of Object.entries(dump.settings)) await this.setSetting(k, v);
  }
}

interface Row {
  [k: string]: any;
}

function rowToTask(r: Row): Task {
  return {
    id: r.id,
    owner: r.owner,
    title: r.title,
    section: r.section,
    scheduledAt: r.scheduled_at ?? null,
    recurrence: r.recurrence,
    remindLead: r.remind_lead ?? null,
    active: r.active === 1 || r.active === true,
    sortOrder: r.sort_order ?? 0,
  };
}

function rowToCompletion(r: Row): Completion {
  return {
    id: r.id,
    taskId: r.task_id,
    date: r.date,
    owner: r.owner,
    doneAt: r.done_at ?? null,
    status: r.status,
  };
}

function rowToEvent(r: Row): CalendarEvent {
  return {
    id: r.id,
    title: r.title,
    startsAt: r.starts_at,
    endsAt: r.ends_at,
    source: r.source,
    allDay: r.all_day === 1 || r.all_day === true,
  };
}
