// First-run defaults — a sensible family chart so the app is useful immediately.
// All of this is fully editable in-app; it just beats staring at an empty list.
import type { Person, Task } from './types';

export const DEFAULT_PEOPLE: Person[] = [
  { id: 'mom', name: 'Mom', role: 'parent', color: '#EC4899', emoji: '👩' },
  { id: 'dad', name: 'Dad', role: 'parent', color: '#3B82F6', emoji: '👨' },
  { id: 'kid:ava', name: 'Ava', role: 'kid', color: '#10B981', emoji: '🦄' },
  { id: 'kid:leo', name: 'Leo', role: 'kid', color: '#F59E0B', emoji: '🚀' },
];

function id(): string {
  return crypto.randomUUID();
}

interface SeedDef {
  owner: string;
  title: string;
  section: Task['section'];
  scheduledAt: string | null;
  recurrence: string;
  remindLead: number | null;
}

const DEFS: SeedDef[] = [
  // Kids — morning
  { owner: 'kid:ava', title: 'Brush teeth', section: 'body', scheduledAt: '07:30', recurrence: 'daily', remindLead: 0 },
  { owner: 'kid:ava', title: 'Get dressed', section: 'morning', scheduledAt: '07:40', recurrence: 'weekdays', remindLead: null },
  { owner: 'kid:ava', title: 'Make bed', section: 'morning', scheduledAt: null, recurrence: 'daily', remindLead: null },
  { owner: 'kid:ava', title: 'Pack school bag', section: 'morning', scheduledAt: '08:00', recurrence: 'weekdays', remindLead: 10 },
  { owner: 'kid:leo', title: 'Brush teeth', section: 'body', scheduledAt: '07:30', recurrence: 'daily', remindLead: 0 },
  { owner: 'kid:leo', title: 'Get dressed', section: 'morning', scheduledAt: '07:40', recurrence: 'weekdays', remindLead: null },
  { owner: 'kid:leo', title: 'Feed the cat', section: 'home', scheduledAt: '07:50', recurrence: 'daily', remindLead: 5 },
  // Kids — night
  { owner: 'kid:ava', title: 'Homework', section: 'night', scheduledAt: '17:30', recurrence: 'weekdays', remindLead: 15 },
  { owner: 'kid:ava', title: 'Brush teeth', section: 'night', scheduledAt: '20:00', recurrence: 'daily', remindLead: 0 },
  { owner: 'kid:leo', title: 'Tidy toys', section: 'home', scheduledAt: '19:30', recurrence: 'daily', remindLead: null },
  { owner: 'kid:leo', title: 'Brush teeth', section: 'night', scheduledAt: '20:00', recurrence: 'daily', remindLead: 0 },
  // Family / parents
  { owner: 'family', title: 'Family dinner', section: 'night', scheduledAt: '18:30', recurrence: 'daily', remindLead: 10 },
  { owner: 'mom', title: 'Take vitamins', section: 'body', scheduledAt: '08:00', recurrence: 'daily', remindLead: 0 },
  { owner: 'dad', title: 'Trash & recycling out', section: 'home', scheduledAt: '21:00', recurrence: 'days:0', remindLead: 30 },
  { owner: 'dad', title: 'Water the plants', section: 'home', scheduledAt: null, recurrence: 'days:1,4', remindLead: null },
];

export function buildSeedTasks(): Task[] {
  return DEFS.map((d, i) => ({
    id: id(),
    owner: d.owner,
    title: d.title,
    section: d.section,
    scheduledAt: d.scheduledAt,
    recurrence: d.recurrence,
    remindLead: d.remindLead,
    active: true,
    sortOrder: i,
  }));
}
