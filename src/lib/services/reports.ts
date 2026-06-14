// Phase 2 — reports, computed purely from occurrences (no extra storage).
import type { Occurrence, Owner, Person, Task } from '../types';
import { FAMILY_OWNER } from '../types';
import { buildOccurrences } from '../occurrences';
import {
  addDays,
  startOfMonth,
  startOfWeek,
  startOfYear,
  todayKey,
} from '../time';

export type RangeKind = 'day' | 'week' | 'month' | 'year' | 'all';

export interface DateRange {
  from: string;
  to: string;
  label: string;
}

export function rangeFor(kind: RangeKind, anchor: string, earliest: string): DateRange {
  switch (kind) {
    case 'day':
      return { from: anchor, to: anchor, label: 'Today' };
    case 'week': {
      const from = startOfWeek(anchor);
      return { from, to: addDays(from, 6), label: 'This week' };
    }
    case 'month':
      return { from: startOfMonth(anchor), to: anchor, label: 'This month' };
    case 'year':
      return { from: startOfYear(anchor), to: anchor, label: 'This year' };
    case 'all':
      return { from: earliest, to: anchor, label: 'All time' };
  }
}

export interface TaskStat {
  taskId: string;
  title: string;
  owner: Owner;
  section: string;
  done: number;
  missed: number;
  skipped: number;
  total: number; // done + missed (skipped excluded from rate)
  rate: number; // 0..1
  currentStreak: number;
  longestStreak: number;
}

export interface PersonStat {
  owner: Owner;
  name: string;
  done: number;
  missed: number;
  rate: number;
}

export interface SectionStat {
  section: string;
  done: number;
  missed: number;
  rate: number;
}

export interface Report {
  range: DateRange;
  done: number;
  missed: number;
  skipped: number;
  rate: number;
  perTask: TaskStat[];
  perPerson: PersonStat[];
  perSection: SectionStat[];
  bestTask: TaskStat | null;
  worstTask: TaskStat | null;
}

function rate(done: number, missed: number): number {
  const denom = done + missed;
  return denom === 0 ? 0 : done / denom;
}

/** Streaks are computed over the most recent occurrences of a task, newest-first. */
function streaks(occ: Occurrence[]): { current: number; longest: number } {
  // occ assumed sorted ascending by date.
  let longest = 0;
  let run = 0;
  for (const o of occ) {
    if (o.status === 'done') {
      run++;
      longest = Math.max(longest, run);
    } else if (o.status === 'skipped' || o.status === 'pending') {
      // neutral — don't break or extend
    } else {
      run = 0;
    }
  }
  // current streak: walk backwards from the most recent non-pending
  let current = 0;
  for (let i = occ.length - 1; i >= 0; i--) {
    const s = occ[i].status;
    if (s === 'pending') continue;
    if (s === 'skipped') continue;
    if (s === 'done') current++;
    else break;
  }
  return { current, longest };
}

export function buildReport(
  occurrences: Occurrence[],
  range: DateRange,
  people: Person[],
): Report {
  const nameOf = (owner: Owner): string =>
    owner === FAMILY_OWNER ? 'Family' : (people.find((p) => p.id === owner)?.name ?? owner);

  // Group occurrences by task for per-task stats + streaks.
  const byTask = new Map<string, Occurrence[]>();
  for (const o of occurrences) {
    const arr = byTask.get(o.task.id) ?? [];
    arr.push(o);
    byTask.set(o.task.id, arr);
  }

  const perTask: TaskStat[] = [];
  for (const [taskId, occ] of byTask) {
    occ.sort((a, b) => a.date.localeCompare(b.date));
    const done = occ.filter((o) => o.status === 'done').length;
    const missed = occ.filter((o) => o.status === 'missed').length;
    const skipped = occ.filter((o) => o.status === 'skipped').length;
    const s = streaks(occ);
    const t = occ[0].task;
    perTask.push({
      taskId,
      title: t.title,
      owner: t.owner,
      section: t.section,
      done,
      missed,
      skipped,
      total: done + missed,
      rate: rate(done, missed),
      currentStreak: s.current,
      longestStreak: s.longest,
    });
  }
  perTask.sort((a, b) => b.rate - a.rate || b.done - a.done);

  // Totals.
  const done = occurrences.filter((o) => o.status === 'done').length;
  const missed = occurrences.filter((o) => o.status === 'missed').length;
  const skipped = occurrences.filter((o) => o.status === 'skipped').length;

  // Per person.
  const personMap = new Map<Owner, PersonStat>();
  for (const o of occurrences) {
    const owner = o.task.owner;
    const ps = personMap.get(owner) ?? { owner, name: nameOf(owner), done: 0, missed: 0, rate: 0 };
    if (o.status === 'done') ps.done++;
    else if (o.status === 'missed') ps.missed++;
    personMap.set(owner, ps);
  }
  const perPerson = [...personMap.values()]
    .map((p) => ({ ...p, rate: rate(p.done, p.missed) }))
    .sort((a, b) => b.rate - a.rate);

  // Per section.
  const sectionMap = new Map<string, SectionStat>();
  for (const o of occurrences) {
    const sec = o.task.section;
    const ss = sectionMap.get(sec) ?? { section: sec, done: 0, missed: 0, rate: 0 };
    if (o.status === 'done') ss.done++;
    else if (o.status === 'missed') ss.missed++;
    sectionMap.set(sec, ss);
  }
  const perSection = [...sectionMap.values()]
    .map((s) => ({ ...s, rate: rate(s.done, s.missed) }))
    .sort((a, b) => a.rate - b.rate);

  // Best / worst — only consider tasks with a meaningful sample (>=3 occurrences).
  const ranked = perTask.filter((t) => t.total >= 3);
  const bestTask = ranked.length ? ranked[0] : (perTask[0] ?? null);
  const worstTask = ranked.length ? ranked[ranked.length - 1] : null;

  return {
    range,
    done,
    missed,
    skipped,
    rate: rate(done, missed),
    perTask,
    perPerson,
    perSection,
    bestTask,
    worstTask,
  };
}

/** Pull the data and build a report for a kind + owner filter. */
export function computeReport(
  tasks: Task[],
  allCompletions: import('../types').Completion[],
  kind: RangeKind,
  ownerFilter: Owner | null,
  earliest: string,
  people: Person[],
): Report {
  const anchor = todayKey();
  const range = rangeFor(kind, anchor, earliest);
  const occ = buildOccurrences(tasks, allCompletions, range.from, range.to, ownerFilter);
  return buildReport(occ, range, people);
}
