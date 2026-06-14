// Google Calendar API (read-only). Lists a connected account's calendars and
// fetches events, mapped into onTrack's CalendarEvent shape so Google and ICS
// events flow through exactly the same cache, display, and reminder-silencing.
//
// Unlike the ICS feed (which can lag hours), the API is live — this is the
// freshness win that BUILD.md said would be the one reason to revisit OAuth.
import type { CalendarEvent, GoogleAccount, GoogleCalendarRef } from '../types';
import { getAccessToken, type AccessToken } from './google-auth';

const API = 'https://www.googleapis.com/calendar/v3';

// Cache live access tokens in memory so we refresh at most once per ~hour.
const tokenCache = new Map<string, AccessToken>();

async function authHeader(clientId: string, accountId: string): Promise<Record<string, string>> {
  let tok = tokenCache.get(accountId);
  if (!tok || tok.expiresAt < Date.now() + 60_000) {
    tok = await getAccessToken(clientId, accountId);
    tokenCache.set(accountId, tok);
  }
  return { Authorization: `Bearer ${tok.token}` };
}

interface GCalListResp {
  items?: { id: string; summary: string; backgroundColor?: string; selected?: boolean }[];
}

/** Fetch the account's calendar list so the user can choose which to import. */
export async function listCalendars(clientId: string, accountId: string): Promise<GoogleCalendarRef[]> {
  const headers = await authHeader(clientId, accountId);
  const res = await fetch(`${API}/users/me/calendarList?minAccessRole=reader`, { headers });
  if (!res.ok) throw new Error(`calendarList failed: ${res.status}`);
  const data = (await res.json()) as GCalListResp;
  return (data.items ?? []).map((c) => ({
    id: c.id,
    summary: c.summary,
    color: c.backgroundColor ?? null,
    selected: c.selected ?? false,
  }));
}

interface GCalEvent {
  id: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  status?: string;
}

function mapEvent(e: GCalEvent, sourceLabel: string): CalendarEvent | null {
  if (e.status === 'cancelled') return null;
  const startDateTime = e.start?.dateTime;
  const startDate = e.start?.date;
  if (!startDateTime && !startDate) return null;
  const allDay = !startDateTime;
  const startsAt = startDateTime
    ? new Date(startDateTime).toISOString()
    : new Date(`${startDate}T00:00:00`).toISOString();
  const endRaw = e.end?.dateTime ?? (e.end?.date ? `${e.end.date}T00:00:00` : null);
  const endsAt = endRaw ? new Date(endRaw).toISOString() : startsAt;
  return {
    id: `google:${sourceLabel}:${e.id}`,
    title: e.summary || '(busy)',
    startsAt,
    endsAt,
    source: sourceLabel,
    allDay,
  };
}

/** Fetch events for all selected calendars across [now, now + horizonDays]. */
export async function fetchGoogleEvents(
  accounts: GoogleAccount[],
  clientId: string | null,
  horizonDays: number,
): Promise<{ events: CalendarEvent[]; errors: string[] }> {
  const events: CalendarEvent[] = [];
  const errors: string[] = [];
  if (!clientId) return { events, errors };

  const timeMin = new Date();
  timeMin.setHours(0, 0, 0, 0);
  const timeMax = new Date(timeMin.getTime() + horizonDays * 24 * 60 * 60 * 1000);

  for (const account of accounts) {
    const selected = account.calendars.filter((c) => c.selected);
    let headers: Record<string, string>;
    try {
      headers = await authHeader(clientId, account.id);
    } catch (e) {
      errors.push(`${account.email}: ${(e as Error).message}`);
      continue;
    }
    for (const cal of selected) {
      try {
        const params = new URLSearchParams({
          timeMin: timeMin.toISOString(),
          timeMax: timeMax.toISOString(),
          singleEvents: 'true',
          orderBy: 'startTime',
          maxResults: '250',
        });
        const res = await fetch(
          `${API}/calendars/${encodeURIComponent(cal.id)}/events?${params.toString()}`,
          { headers },
        );
        if (!res.ok) throw new Error(`${res.status}`);
        const data = (await res.json()) as { items?: GCalEvent[] };
        const label = account.calendars.length > 1 ? cal.summary : account.email;
        for (const item of data.items ?? []) {
          const mapped = mapEvent(item, label);
          if (mapped) events.push(mapped);
        }
      } catch (e) {
        errors.push(`${cal.summary}: ${(e as Error).message}`);
      }
    }
  }
  return { events, errors };
}

export function clearTokenCache(accountId?: string): void {
  if (accountId) tokenCache.delete(accountId);
  else tokenCache.clear();
}
