// Local-time date helpers. Everything in onTrack is local to the device — there
// is no server and no timezone juggling. Dates are 'YYYY-MM-DD' strings.

import type { Recurrence } from './types';

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** 'YYYY-MM-DD' for a Date in local time. */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayKey(): string {
  return toDateKey(new Date());
}

/** Parse a 'YYYY-MM-DD' key into a local Date at midnight. */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key: string, days: number): string {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

/** 0 = Sunday .. 6 = Saturday for a date key. */
export function weekday(key: string): number {
  return fromDateKey(key).getDay();
}

export function isWeekend(key: string): boolean {
  const w = weekday(key);
  return w === 0 || w === 6;
}

/** Does a recurrence rule include the given date? */
export function recurrenceMatches(rec: Recurrence, key: string): boolean {
  const w = weekday(key);
  switch (rec) {
    case 'daily':
      return true;
    case 'weekdays':
      return w >= 1 && w <= 5;
    case 'weekends':
      return w === 0 || w === 6;
    default:
      if (rec.startsWith('days:')) {
        const days = rec
          .slice(5)
          .split(',')
          .map((s) => Number(s.trim()))
          .filter((n) => !Number.isNaN(n));
        return days.includes(w);
      }
      return false;
  }
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function describeRecurrence(rec: Recurrence): string {
  switch (rec) {
    case 'daily':
      return 'Every day';
    case 'weekdays':
      return 'Weekdays';
    case 'weekends':
      return 'Weekends';
    default:
      if (rec.startsWith('days:')) {
        const labels = rec
          .slice(5)
          .split(',')
          .map((s) => WEEKDAY_NAMES[Number(s.trim())])
          .filter(Boolean);
        return labels.join(', ') || 'Custom';
      }
      return 'Custom';
  }
}

/** 'HH:MM' -> minutes since midnight, or null. */
export function timeToMinutes(hhmm: string | null): number | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return null;
  return h * 60 + m;
}

/** Build a local Date for a date key + 'HH:MM'. */
export function atTime(key: string, hhmm: string): Date {
  const d = fromDateKey(key);
  const [h, m] = hhmm.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
}

export function formatTime(hhmm: string | null): string {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${pad2(m)} ${ampm}`;
}

export function formatDateKeyLong(key: string): string {
  const d = fromDateKey(key);
  return d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });
}

export function formatDateKeyShort(key: string): string {
  const d = fromDateKey(key);
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' });
}

/** Start-of-week (Monday) date key for the week containing `key`. */
export function startOfWeek(key: string): string {
  const w = weekday(key); // 0=Sun
  const back = w === 0 ? 6 : w - 1; // make Monday the first day
  return addDays(key, -back);
}

export function startOfMonth(key: string): string {
  const d = fromDateKey(key);
  return toDateKey(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function startOfYear(key: string): string {
  const d = fromDateKey(key);
  return toDateKey(new Date(d.getFullYear(), 0, 1));
}

/** Inclusive list of date keys between two keys. */
export function dateRange(fromKey: string, toKey: string): string[] {
  const out: string[] = [];
  let cur = fromKey;
  let guard = 0;
  while (cur <= toKey && guard < 4000) {
    out.push(cur);
    cur = addDays(cur, 1);
    guard++;
  }
  return out;
}
