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
import { getCachedEvents, fetchIcsEvents, LAST_REFRESH_KEY } from './services/calendar';
import { fetchGoogleEvents, clearTokenCache } from './services/google-calendar';
import { forgetAccount } from './services/google-auth';
import type { GoogleAccount } from './types';

export type View = 'today' | 'reports' | 'calendar' | 'settings';

const SETTINGS_KEY = 'app';

const DEFAULT_SETTINGS: Settings = {
  people: DEFAULT_PEOPLE,
  feeds: [],
  googleClientId: null,
  googleAccounts: [],
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
  const hasIcs = s.settings.feeds.length > 0;
  const hasGoogle = s.settings.googleAccounts.length > 0 && !!s.settings.googleClientId;
  if (!hasIcs && !hasGoogle) return;

  const db = await getDb();
  const errors: string[] = [];
  const all: CalendarEvent[] = [];
  let anySuccess = false;

  if (hasIcs) {
    const ics = await fetchIcsEvents(s.settings.feeds);
    all.push(...ics.events);
    errors.push(...ics.errors);
    if (ics.errors.length < s.settings.feeds.length) anySuccess = true;
  }
  if (hasGoogle) {
    const g = await fetchGoogleEvents(
      s.settings.googleAccounts,
      s.settings.googleClientId,
      Math.max(31, s.settings.reminderHorizonDays),
    );
    all.push(...g.events);
    errors.push(...g.errors);
    if (g.events.length > 0 || g.errors.length === 0) anySuccess = true;
  }

  // Only overwrite the cache if at least one source returned cleanly, so a
  // transient network failure doesn't wipe the last-good offline copy.
  if (anySuccess) {
    await db.replaceCalendarEvents(all);
    await db.setSetting(LAST_REFRESH_KEY, new Date().toISOString());
    patch({ events: all, calendarError: errors.length ? errors.join('; ') : null });
  } else {
    patch({ calendarError: errors.length ? errors.join('; ') : null });
  }
  void reschedule();
}

// ---- Google accounts ------------------------------------------------------

export async function setGoogleClientId(clientId: string | null): Promise<void> {
  await updateSettings({ googleClientId: clientId?.trim() || null });
}

export async function addGoogleAccount(account: GoogleAccount): Promise<void> {
  const existing = get(app).settings.googleAccounts.filter((a) => a.id !== account.id);
  await updateSettings({ googleAccounts: [...existing, account] });
  void refreshCalendar();
}

export async function updateGoogleAccount(account: GoogleAccount): Promise<void> {
  const accounts = get(app).settings.googleAccounts.map((a) => (a.id === account.id ? account : a));
  await updateSettings({ googleAccounts: accounts });
  void refreshCalendar();
}

export async function removeGoogleAccount(accountId: string): Promise<void> {
  await forgetAccount(accountId);
  clearTokenCache(accountId);
  const accounts = get(app).settings.googleAccounts.filter((a) => a.id !== accountId);
  await updateSettings({ googleAccounts: accounts });
  void refreshCalendar();
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
