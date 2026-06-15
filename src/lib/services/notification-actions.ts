// Handles taps on a reminder's action buttons (✓ Done / ⏰ Snooze / 🔊 Read).
// Runs on native only. "Done" updates tracking straight from the notification —
// no need to open the app — which is what makes it usable while driving.
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { get } from 'svelte/store';
import type { Task } from '../types';
import { app, setStatus } from '../store';
import { getDb } from '../db';
import { todayKey } from '../time';
import { speak } from './speech';
import { ACTION_TYPE_ID } from './notifications';

async function resolveTask(taskId: string): Promise<Task | null> {
  const inMemory = get(app).tasks.find((t) => t.id === taskId);
  if (inMemory) return inMemory;
  // Cold start via a notification action — state may not be loaded yet.
  const db = await getDb();
  return (await db.getTasks()).find((t) => t.id === taskId) ?? null;
}

async function snooze(taskId: string, dateKey: string, title: string): Promise<void> {
  const at = new Date(Date.now() + 10 * 60 * 1000);
  await LocalNotifications.schedule({
    notifications: [
      {
        id: Math.floor(Math.random() * 2_000_000_000) + 1,
        title: 'onTrack reminder',
        body: `Time to ${title.charAt(0).toLowerCase() + title.slice(1)}.`,
        actionTypeId: ACTION_TYPE_ID,
        schedule: { at, allowWhileIdle: true },
        extra: { taskId, dateKey, title },
      },
    ],
  });
}

export async function initNotificationHandlers(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await LocalNotifications.addListener('localNotificationActionPerformed', async (event) => {
    const extra = (event.notification.extra ?? {}) as { taskId?: string; dateKey?: string; title?: string };
    if (!extra.taskId) return;
    const dateKey = extra.dateKey ?? todayKey();
    const title = extra.title ?? 'this task';
    const actionId = event.actionId;

    if (actionId === 'snooze') {
      await snooze(extra.taskId, dateKey, title);
      return;
    }
    if (actionId === 'read') {
      await speak(`Reminder: time to ${title.charAt(0).toLowerCase() + title.slice(1)}.`);
      return;
    }
    // 'done', or the default body tap — mark it complete.
    const task = await resolveTask(extra.taskId);
    if (task) await setStatus(task, dateKey, 'done');
  });
}
