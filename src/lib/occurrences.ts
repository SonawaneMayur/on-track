// Expand tasks into dated occurrences and resolve each to a status. This is the
// single source of truth used by both the Today view and Reports.
//
// "Missed" is computed lazily here (BUILD.md open question E → lazy-on-read):
// an occurrence with no completion row is `missed` once its day has ended (or
// its scheduled time + grace has passed), otherwise `pending`. Nothing is
// written to the DB to mark a miss.

import type { Completion, Occurrence, Owner, Task } from './types';
import { FAMILY_OWNER } from './types';
import { addDays, atTime, recurrenceMatches, todayKey } from './time';

const MISS_GRACE_MIN = 30;

function completionKey(taskId: string, date: string, owner: Owner): string {
  return `${taskId}|${date}|${owner}`;
}

/** Is a task scheduled on a given date for its owner? */
export function taskOccursOn(task: Task, dateKey: string): boolean {
  return task.active && recurrenceMatches(task.recurrence, dateKey);
}

function resolveStatus(task: Task, dateKey: string, completion: Completion | null): Occurrence['status'] {
  if (completion) return completion.status;
  const today = todayKey();
  if (dateKey > today) return 'pending';
  if (dateKey < today) return 'missed';
  // Today: pending until scheduled time + grace passes.
  if (task.scheduledAt) {
    const deadline = atTime(dateKey, task.scheduledAt);
    deadline.setMinutes(deadline.getMinutes() + MISS_GRACE_MIN);
    return Date.now() > deadline.getTime() ? 'missed' : 'pending';
  }
  // Anytime task: only "missed" once the day is over (handled above), so today
  // it stays pending.
  return 'pending';
}

/**
 * Build occurrences for the given tasks across an inclusive date range,
 * optionally filtered to a single owner. FAMILY tasks always appear.
 */
export function buildOccurrences(
  tasks: Task[],
  completions: Completion[],
  fromKey: string,
  toKey: string,
  ownerFilter?: Owner | null,
): Occurrence[] {
  const byKey = new Map<string, Completion>();
  for (const c of completions) byKey.set(completionKey(c.taskId, c.date, c.owner), c);

  const out: Occurrence[] = [];
  for (const task of tasks) {
    if (ownerFilter && ownerFilter !== task.owner && task.owner !== FAMILY_OWNER) continue;
    let dateKey = fromKey;
    let guard = 0;
    while (dateKey <= toKey && guard < 4000) {
      if (taskOccursOn(task, dateKey)) {
        const completion = byKey.get(completionKey(task.id, dateKey, task.owner)) ?? null;
        out.push({ task, date: dateKey, status: resolveStatus(task, dateKey, completion), completion });
      }
      dateKey = addDays(dateKey, 1);
      guard++;
    }
  }
  return out;
}

/** Convenience: occurrences for a single day. */
export function occurrencesForDate(
  tasks: Task[],
  completions: Completion[],
  dateKey: string,
  ownerFilter?: Owner | null,
): Occurrence[] {
  return buildOccurrences(tasks, completions, dateKey, dateKey, ownerFilter);
}
