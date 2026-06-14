// Central application state. One writable store holds everything the UI needs;
// action functions mutate it and persist through the DB layer. Kept simple on
// purpose — four users, one device (BUILD.md: optimise for simplicity).
import { writable, get } from 'svelte/store';
import type {
  CalendarEvent,
  Completion,
  Occurrence,
  Owner,
  Settings,
  Task,
} from './types';
import { getDb } from './db';
import type { DbDump } from './db';
import { buildSeedTasks, DEFAULT_PEOPLE } from './seed';
import { addDays, todayKey } from './time';
import { occurrencesForDate } from './occurrences';
import { rescheduleAll } from './services/notifications';
import { getCachedEvents, refreshCalendars } from './services/calendar';

export type View = 'today' | 'reports' | 'calendar' | 'settings';

const SETTINGS_KEY = 'app';

const DEFAULT_SETTINGS: Settings = {
  people: DEFAULT_PEOPLE,
  feeds: [],
  silenceDuringEvents: true,
  reminderHorizonDays: 14,
  voiceEnabled: true,
  ttsVoice: null,
};

export interface AppState {
  ready: boolean;
  view: View;
  selectedDate: string;
  selectedOwner: Owner | null; // null = everyone
  tasks: Task[];
  completions: Completion[]; // window around selectedDate, for Today/Calendar
  events: CalendarEvent[];
  settings: Settings;
  calendarError: string | null;
}

const initial: AppState = {
  ready: false,
  view: 'today',
  selectedDate: todayKey(),
  selectedOwner: null,
  tasks: [],
  completions: [],
  events: [],
  settings: DEFAULT_SETTINGS,
  calendarError: null,
};

export const app = writable<AppState>(initial);

function patch(p: Partial<AppState>): void {
  app.update((s) => ({ ...s, ...p }));
}

// ---- Loading --------------------------------------------------------------

const COMPLETION_WINDOW_BACK = 730; // ~2y of history kept hot for Today/Reports

async function loadSettings(): Promise<Settings> {
  const db = await getDb();
  const raw = await db.getSetting(SETTINGS_KEY);
  if (!raw) return DEFAULT_SETTINGS;
  try {
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Settings) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

async function persistSettings(settings: Settings): Promise<void> {
  const db = await getDb();
  await db.setSetting(SETTINGS_KEY, JSON.stringify(settings));
}

async function loadCompletionWindow(): Promise<Completion[]> {
  const db = await getDb();
  return db.getCompletions(addDays(todayKey(), -COMPLETION_WINDOW_BACK), addDays(todayKey(), 31));
}

export async function bootstrap(): Promise<void> {
  const db = await getDb();
  const settings = await loadSettings();

  let tasks = await db.getTasks();
  if (tasks.length === 0) {
    // First run — seed a starter chart so the app is immediately useful.
    tasks = buildSeedTasks();
    for (const t of tasks) await db.upsertTask(t);
    await persistSettings(settings);
  }

  const completions = await loadCompletionWindow();
  const events = await getCachedEvents();

  patch({ ready: true, tasks, completions, events, settings });
  void reschedule();
  void refreshCalendar();
}

// ---- Navigation -----------------------------------------------------------

export function setView(view: View): void {
  patch({ view });
}

export function setSelectedDate(date: string): void {
  patch({ selectedDate: date });
}

export function setOwner(owner: Owner | null): void {
  patch({ selectedOwner: owner });
}

// ---- Tasks ----------------------------------------------------------------

export async function saveTask(task: Task): Promise<void> {
  const db = await getDb();
  await db.upsertTask(task);
  const tasks = await db.getTasks();
  patch({ tasks });
  void reschedule();
}

export async function deleteTask(id: string): Promise<void> {
  const db = await getDb();
  await db.deleteTask(id);
  const tasks = await db.getTasks();
  patch({ tasks, completions: await loadCompletionWindow() });
  void reschedule();
}

// ---- Completions ----------------------------------------------------------

export async function setStatus(
  task: Task,
  date: string,
  status: Completion['status'] | 'clear',
): Promise<void> {
  const db = await getDb();
  const owner = task.owner;
  if (status === 'clear') {
    await db.deleteCompletion(task.id, date, owner);
  } else {
    const existing = get(app).completions.find(
      (c) => c.taskId === task.id && c.date === date && c.owner === owner,
    );
    const completion: Completion = {
      id: existing?.id ?? crypto.randomUUID(),
      taskId: task.id,
      date,
      owner,
      doneAt: status === 'done' ? new Date().toISOString() : null,
      status,
    };
    await db.setCompletion(completion);
  }
  patch({ completions: await loadCompletionWindow() });
}

/** Tap-to-complete toggle: pending/missed -> done, done -> clear. */
export async function toggleDone(task: Task, date: string): Promise<void> {
  const cur = get(app).completions.find(
    (c) => c.taskId === task.id && c.date === date && c.owner === task.owner,
  );
  await setStatus(task, date, cur?.status === 'done' ? 'clear' : 'done');
}

// ---- Derived helpers (not stores; call with current state) ----------------

export function occurrencesFor(state: AppState, dateKey: string): Occurrence[] {
  return occurrencesForDate(state.tasks, state.completions, dateKey, state.selectedOwner);
}

export async function fetchCompletions(from: string, to: string): Promise<Completion[]> {
  const db = await getDb();
  return db.getCompletions(from, to);
}

// ---- Settings -------------------------------------------------------------

export async function updateSettings(patchSettings: Partial<Settings>): Promise<void> {
  const next = { ...get(app).settings, ...patchSettings };
  await persistSettings(next);
  patch({ settings: next });
  void reschedule();
}

// ---- Cross-cutting actions ------------------------------------------------

export async function reschedule(): Promise<void> {
  const s = get(app);
  await rescheduleAll(s.tasks, s.events, s.settings);
}

export async function refreshCalendar(): Promise<void> {
  const s = get(app);
  if (s.settings.feeds.length === 0) return;
  const { events, errors } = await refreshCalendars(s.settings.feeds);
  patch({ events, calendarError: errors.length ? errors.join('; ') : null });
  void reschedule();
}

export async function exportData(): Promise<DbDump> {
  const db = await getDb();
  return db.exportAll();
}

export async function importData(dump: DbDump): Promise<void> {
  const db = await getDb();
  await db.importAll(dump);
  await bootstrap();
}
