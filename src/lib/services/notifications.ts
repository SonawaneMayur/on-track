// Phase 1 — native local notifications. This is the main reason for going
// native over a PWA: reminders must fire with the app closed.
//
// Strategy: schedule *concrete* one-shot notifications across a rolling horizon
// (default 14 days) rather than OS repeat rules. This lets us (a) honour the
// "silence during calendar events" rule per-occurrence, and (b) stay under
// iOS's 64 pending-notification limit by capping to the soonest N. We reschedule
// on every app resume so the horizon keeps rolling forward.
import { Capacitor } from '@capacitor/core';
import { LocalNotifications, type LocalNotificationSchema } from '@capacitor/local-notifications';
import type { CalendarEvent, Settings, Task } from '../types';
import { FAMILY_OWNER } from '../types';
import { addDays, atTime, recurrenceMatches, todayKey } from '../time';
import { isInsideEvent } from './calendar';

const MAX_PENDING = 60; // keep clear of the iOS 64 ceiling

export async function ensurePermission(): Promise<boolean> {
  if (!Capacitor.isNativePlatform()) return false;
  const cur = await LocalNotifications.checkPermissions();
  if (cur.display === 'granted') return true;
  const req = await LocalNotifications.requestPermissions();
  return req.display === 'granted';
}

/** Stable positive 31-bit notification id from a string seed. */
function notifId(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h & 0x7fffffff) || 1;
}

interface PlannedReminder {
  task: Task;
  fireAt: Date;
  kind: 'lead' | 'at';
}

/** Build the list of concrete reminders for the horizon (sorted soonest-first). */
function planReminders(tasks: Task[], events: CalendarEvent[], settings: Settings): PlannedReminder[] {
  const horizon = Math.max(1, settings.reminderHorizonDays || 14);
  const now = Date.now();
  const plans: PlannedReminder[] = [];

  for (const task of tasks) {
    if (!task.active || !task.scheduledAt) continue;
    for (let d = 0; d < horizon; d++) {
      const dateKey = addDays(todayKey(), d);
      if (!recurrenceMatches(task.recurrence, dateKey)) continue;

      const at = atTime(dateKey, task.scheduledAt);
      // "at time" reminder
      pushIfFuture(plans, task, at, 'at', now, events, settings);
      // optional lead reminder
      if (task.remindLead != null && task.remindLead > 0) {
        const lead = new Date(at.getTime() - task.remindLead * 60 * 1000);
        pushIfFuture(plans, task, lead, 'lead', now, events, settings);
      }
    }
  }

  plans.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime());
  return plans.slice(0, MAX_PENDING);
}

function pushIfFuture(
  plans: PlannedReminder[],
  task: Task,
  fireAt: Date,
  kind: 'lead' | 'at',
  now: number,
  events: CalendarEvent[],
  settings: Settings,
): void {
  if (fireAt.getTime() <= now + 30_000) return; // too soon / past
  if (settings.silenceDuringEvents && isInsideEvent(events, fireAt)) return;
  plans.push({ task, fireAt, kind });
}

/** Action type attached to every reminder so the notification shows buttons. */
export const ACTION_TYPE_ID = 'ONTRACK_TASK';

let actionsRegistered = false;
async function registerNotificationActions(): Promise<void> {
  if (actionsRegistered || !Capacitor.isNativePlatform()) return;
  await LocalNotifications.registerActionTypes({
    types: [
      {
        id: ACTION_TYPE_ID,
        actions: [
          // Background: completes without opening the app — one tap, hands-free.
          { id: 'done', title: '✓ Done' },
          { id: 'snooze', title: '⏰ Snooze 10 min' },
          // Foreground: opens the app and reads the task aloud (driving aid).
          { id: 'read', title: '🔊 Read aloud', foreground: true },
        ],
      },
    ],
  });
  actionsRegistered = true;
}

function ownerName(task: Task, settings: Settings): string | null {
  if (task.owner === FAMILY_OWNER) return null;
  return settings.people.find((p) => p.id === task.owner)?.name ?? null;
}

/** Phrase the reminder so iOS "Announce Notifications" reads it naturally over
 *  AirPods/CarPlay (e.g. "Time for Leo to brush teeth"). */
function phrase(task: Task, kind: 'lead' | 'at', settings: Settings): { title: string; body: string } {
  const who = ownerName(task, settings);
  const t = task.title.charAt(0).toLowerCase() + task.title.slice(1);
  if (kind === 'lead') {
    const mins = task.remindLead ? `${task.remindLead} minute${task.remindLead === 1 ? '' : 's'}` : 'a moment';
    return {
      title: 'onTrack — coming up',
      body: who ? `In ${mins}, ${who} needs to ${t}.` : `In ${mins}: ${task.title}.`,
    };
  }
  return {
    title: 'onTrack reminder',
    body: who ? `Time for ${who} to ${t}.` : `Time to ${t}.`,
  };
}

function toSchema(p: PlannedReminder, settings: Settings): LocalNotificationSchema {
  const seed = `${p.task.id}|${p.fireAt.toISOString()}|${p.kind}`;
  const { title, body } = phrase(p.task, p.kind, settings);
  // dateKey is the local day the reminder is for — used by the action handler.
  const d = p.fireAt;
  const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return {
    id: notifId(seed),
    title,
    body,
    actionTypeId: ACTION_TYPE_ID,
    schedule: { at: p.fireAt, allowWhileIdle: true },
    extra: { taskId: p.task.id, dateKey, title: p.task.title },
  };
}

/** Cancel everything and reschedule from scratch for the current state. */
export async function rescheduleAll(tasks: Task[], events: CalendarEvent[], settings: Settings): Promise<number> {
  if (!Capacitor.isNativePlatform()) return 0;
  const granted = await ensurePermission();
  if (!granted) return 0;
  await registerNotificationActions();

  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) {
    await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  }

  const plans = planReminders(tasks, events, settings);
  if (plans.length) {
    await LocalNotifications.schedule({ notifications: plans.map((p) => toSchema(p, settings)) });
  }
  return plans.length;
}

export async function cancelAll(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const pending = await LocalNotifications.getPending();
  if (pending.notifications.length) {
    await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
  }
}

export function notificationsSupported(): boolean {
  return Capacitor.isNativePlatform();
}
