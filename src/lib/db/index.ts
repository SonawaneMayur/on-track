// Storage abstraction. The UI and services never touch SQL or localStorage
// directly — they call this typed interface. Two backends implement it:
//   - SqliteBackend  (native iOS/Android, @capacitor-community/sqlite)
//   - WebBackend     (browser dev/preview, localStorage)
// Reports and occurrence expansion are computed in TS over the rows returned
// here, so there is exactly one implementation of the business logic.

import { Capacitor } from '@capacitor/core';
import type { CalendarEvent, Completion, Task } from '../types';

export interface DB {
  init(): Promise<void>;

  getTasks(): Promise<Task[]>;
  upsertTask(task: Task): Promise<void>;
  deleteTask(id: string): Promise<void>;

  /** Inclusive date range, both 'YYYY-MM-DD'. */
  getCompletions(fromDate: string, toDate: string): Promise<Completion[]>;
  setCompletion(c: Completion): Promise<void>;
  deleteCompletion(taskId: string, date: string, owner: string): Promise<void>;

  getCalendarEvents(): Promise<CalendarEvent[]>;
  replaceCalendarEvents(events: CalendarEvent[]): Promise<void>;

  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;

  /** Whole-database export/import — the manual backup story from BUILD.md. */
  exportAll(): Promise<DbDump>;
  importAll(dump: DbDump): Promise<void>;
}

export interface DbDump {
  version: number;
  exportedAt: string;
  tasks: Task[];
  completions: Completion[];
  settings: Record<string, string>;
}

let instance: DB | null = null;

/** Lazily create the right backend for the current platform. */
export async function getDb(): Promise<DB> {
  if (instance) return instance;
  if (Capacitor.isNativePlatform()) {
    const { SqliteBackend } = await import('./sqlite');
    instance = new SqliteBackend();
  } else {
    const { WebBackend } = await import('./webstore');
    instance = new WebBackend();
  }
  await instance.init();
  return instance;
}
