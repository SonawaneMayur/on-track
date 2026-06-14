// Phase 3 — calendar awareness. Fetch each secret ICS feed over HTTPS, parse
// locally, cache to the DB. Read-only, outbound-only. The last successful fetch
// is kept so the app works offline between refreshes.
import { Capacitor } from '@capacitor/core';
import type { CalendarEvent, CalendarFeed } from '../types';
import { getDb } from '../db';
import { fromDateKey } from '../time';
import { parseIcs } from './ics-parser';
import { getFeedUrl } from './securestore';

export const LAST_REFRESH_KEY = 'calendar:lastRefresh';

async function fetchIcs(url: string): Promise<string> {
  // On native, Capacitor's WebView fetch is fine for outbound HTTPS GET.
  const res = await fetch(url, { method: 'GET' });
  if (!res.ok) throw new Error(`ICS fetch failed: ${res.status}`);
  return res.text();
}

/** Refresh all feeds. Returns the merged event list (also cached). On failure
 *  for a feed, the previously cached events for other feeds are preserved. */
export async function refreshCalendars(feeds: CalendarFeed[]): Promise<{ events: CalendarEvent[]; errors: string[] }> {
  const db = await getDb();
  const errors: string[] = [];
  const all: CalendarEvent[] = [];

  for (const feed of feeds) {
    const url = await getFeedUrl(feed.id);
    if (!url) continue;
    try {
      const text = await fetchIcs(url);
      const events = parseIcs(text, feed.label || feed.id);
      all.push(...events);
    } catch (e) {
      errors.push(`${feed.label}: ${(e as Error).message}`);
    }
  }

  if (errors.length < feeds.length) {
    // At least one feed succeeded (or there were none) — commit the new cache.
    await db.replaceCalendarEvents(all);
    await db.setSetting(LAST_REFRESH_KEY, new Date().toISOString());
  }
  return { events: all, errors };
}

export async function getCachedEvents(): Promise<CalendarEvent[]> {
  const db = await getDb();
  return db.getCalendarEvents();
}

/** Events overlapping a given local date key. */
export function eventsOnDate(events: CalendarEvent[], dateKey: string): CalendarEvent[] {
  const dayStart = fromDateKey(dateKey).getTime();
  const dayEnd = dayStart + 24 * 60 * 60 * 1000;
  return events
    .filter((e) => {
      const s = new Date(e.startsAt).getTime();
      const en = new Date(e.endsAt).getTime();
      return s < dayEnd && en > dayStart;
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** Is a given instant inside any (non all-day) event window? Used to silence
 *  reminders that fall during a calendar event. */
export function isInsideEvent(events: CalendarEvent[], when: Date): boolean {
  const t = when.getTime();
  return events.some((e) => {
    if (e.allDay) return false;
    return new Date(e.startsAt).getTime() <= t && t <= new Date(e.endsAt).getTime();
  });
}

export function calendarSupported(): boolean {
  // fetch is available everywhere we run; native may need CORS-free direct
  // fetch which the WebView allows. Browsers may hit CORS on third-party ICS.
  return typeof fetch === 'function' && Capacitor.getPlatform() !== 'unknown';
}
