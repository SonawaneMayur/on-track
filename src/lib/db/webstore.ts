// Web backend — used only for browser dev/preview. Persists to localStorage as
// JSON. Same interface as the native SQLite backend so the rest of the app is
// platform-agnostic. (On device, SqliteBackend is used instead.)
import type { CalendarEvent, Completion, Task } from '../types';
import type { DB, DbDump } from './index';
import { SCHEMA_VERSION } from './schema';

const KEY = 'ontrack:web';

interface Store {
  tasks: Task[];
  completions: Completion[];
  events: CalendarEvent[];
  settings: Record<string, string>;
}

export class WebBackend implements DB {
  private store: Store = { tasks: [], completions: [], events: [], settings: {} };

  async init(): Promise<void> {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.store = { tasks: [], completions: [], events: [], settings: {}, ...JSON.parse(raw) };
    } catch {
      /* corrupt store — start fresh */
    }
  }

  private flush(): void {
    localStorage.setItem(KEY, JSON.stringify(this.store));
  }

  async getTasks(): Promise<Task[]> {
    return [...this.store.tasks].sort(
      (a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title),
    );
  }

  async upsertTask(t: Task): Promise<void> {
    const i = this.store.tasks.findIndex((x) => x.id === t.id);
    if (i >= 0) this.store.tasks[i] = t;
    else this.store.tasks.push(t);
    this.flush();
  }

  async deleteTask(id: string): Promise<void> {
    this.store.tasks = this.store.tasks.filter((t) => t.id !== id);
    this.store.completions = this.store.completions.filter((c) => c.taskId !== id);
    this.flush();
  }

  async getCompletions(fromDate: string, toDate: string): Promise<Completion[]> {
    return this.store.completions
      .filter((c) => c.date >= fromDate && c.date <= toDate)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async setCompletion(c: Completion): Promise<void> {
    const i = this.store.completions.findIndex(
      (x) => x.taskId === c.taskId && x.date === c.date && x.owner === c.owner,
    );
    if (i >= 0) this.store.completions[i] = c;
    else this.store.completions.push(c);
    this.flush();
  }

  async deleteCompletion(taskId: string, date: string, owner: string): Promise<void> {
    this.store.completions = this.store.completions.filter(
      (c) => !(c.taskId === taskId && c.date === date && c.owner === owner),
    );
    this.flush();
  }

  async getCalendarEvents(): Promise<CalendarEvent[]> {
    return [...this.store.events].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }

  async replaceCalendarEvents(events: CalendarEvent[]): Promise<void> {
    this.store.events = events;
    this.flush();
  }

  async getSetting(key: string): Promise<string | null> {
    return this.store.settings[key] ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    this.store.settings[key] = value;
    this.flush();
  }

  async exportAll(): Promise<DbDump> {
    return {
      version: SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      tasks: this.store.tasks,
      completions: this.store.completions,
      settings: this.store.settings,
    };
  }

  async importAll(dump: DbDump): Promise<void> {
    this.store.tasks = dump.tasks;
    this.store.completions = dump.completions;
    this.store.settings = dump.settings;
    this.flush();
  }
}
