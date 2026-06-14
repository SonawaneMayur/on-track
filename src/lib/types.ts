// Domain types for onTrack. Mirrors the data model in BUILD.md.

/** A person is a parent or a kid. `family` is a virtual owner, not a Person. */
export type Role = 'parent' | 'kid';

export interface Person {
  id: string; // slug, e.g. 'dad', 'mom', 'kid:ava'
  name: string;
  role: Role;
  color: string; // hex, used for chips/accents
  emoji: string;
}

/** The virtual owner meaning "shared / whole household". */
export const FAMILY_OWNER = 'family' as const;
export type Owner = string; // a Person.id or FAMILY_OWNER

export type Section = 'morning' | 'body' | 'home' | 'night' | 'anytime';

export const SECTIONS: { id: Section; label: string; emoji: string }[] = [
  { id: 'morning', label: 'Morning', emoji: '🌅' },
  { id: 'body', label: 'Body & Health', emoji: '🪥' },
  { id: 'home', label: 'Home & Chores', emoji: '🏠' },
  { id: 'night', label: 'Night', emoji: '🌙' },
  { id: 'anytime', label: 'Anytime', emoji: '⭐' },
];

/**
 * Recurrence is stored as a small string DSL:
 *   'daily' | 'weekdays' | 'weekends' | 'days:1,3,5'
 * where day numbers are 0=Sun .. 6=Sat.
 */
export type Recurrence = string;

export interface Task {
  id: string;
  owner: Owner;
  title: string;
  section: Section;
  scheduledAt: string | null; // 'HH:MM' local, null for anytime
  recurrence: Recurrence;
  remindLead: number | null; // minutes before scheduledAt to nudge
  active: boolean;
  sortOrder: number;
}

export type CompletionStatus = 'done' | 'missed' | 'skipped';

export interface Completion {
  id: string;
  taskId: string;
  date: string; // 'YYYY-MM-DD'
  owner: Owner;
  doneAt: string | null; // ISO timestamp
  status: CompletionStatus;
}

export interface CalendarEvent {
  id: string;
  title: string;
  startsAt: string; // ISO
  endsAt: string; // ISO
  source: string; // which calendar/url label
  allDay: boolean;
}

/** A task occurrence on a specific date, with its resolved status. */
export interface Occurrence {
  task: Task;
  date: string; // 'YYYY-MM-DD'
  status: CompletionStatus | 'pending';
  completion: Completion | null;
}

export interface CalendarFeed {
  id: string;
  label: string;
  // The URL itself is a secret and lives in secure storage, keyed by feed id.
}

export interface Settings {
  people: Person[];
  feeds: CalendarFeed[];
  silenceDuringEvents: boolean;
  reminderHorizonDays: number; // how far ahead to schedule concrete reminders
  voiceEnabled: boolean;
  ttsVoice: string | null;
}
