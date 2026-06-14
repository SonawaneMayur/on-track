// Minimal iCalendar (RFC 5545) parser — enough for read-only event display.
// Handles line unfolding, VEVENT extraction, DTSTART/DTEND with DATE and
// DATE-TIME (incl. trailing Z = UTC), and basic escape sequences.
import type { CalendarEvent } from '../types';

/** Unfold folded lines: a leading space/tab continues the previous line. */
function unfold(raw: string): string[] {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && out.length) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

function unescapeText(v: string): string {
  return v
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

interface ParsedProp {
  name: string;
  params: Record<string, string>;
  value: string;
}

function parseLine(line: string): ParsedProp | null {
  const colon = line.indexOf(':');
  if (colon === -1) return null;
  const left = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const parts = left.split(';');
  const name = parts[0].toUpperCase();
  const params: Record<string, string> = {};
  for (let i = 1; i < parts.length; i++) {
    const eq = parts[i].indexOf('=');
    if (eq !== -1) params[parts[i].slice(0, eq).toUpperCase()] = parts[i].slice(eq + 1);
  }
  return { name, params, value };
}

/** Parse a DTSTART/DTEND value into {date, allDay}. Returns ISO + allDay flag. */
function parseDate(prop: ParsedProp): { iso: string; allDay: boolean } | null {
  const v = prop.value.trim();
  const isDateOnly = prop.params['VALUE'] === 'DATE' || /^\d{8}$/.test(v);
  if (isDateOnly) {
    const m = v.match(/^(\d{4})(\d{2})(\d{2})/);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return { iso: d.toISOString(), allDay: true };
  }
  const m = v.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!m) {
    const fallback = new Date(v);
    return Number.isNaN(fallback.getTime()) ? null : { iso: fallback.toISOString(), allDay: false };
  }
  const [, y, mo, da, h, mi, s, z] = m;
  let d: Date;
  if (z === 'Z') {
    d = new Date(Date.UTC(+y, +mo - 1, +da, +h, +mi, +s));
  } else {
    // Floating or TZID local time — interpret in device local time. Good enough
    // for next-day planning per BUILD.md's accepted ICS staleness.
    d = new Date(+y, +mo - 1, +da, +h, +mi, +s);
  }
  return { iso: d.toISOString(), allDay: false };
}

export function parseIcs(raw: string, sourceLabel: string): CalendarEvent[] {
  const lines = unfold(raw);
  const events: CalendarEvent[] = [];
  let inEvent = false;
  let cur: Partial<CalendarEvent> & { _start?: { iso: string; allDay: boolean }; _end?: { iso: string; allDay: boolean } } = {};

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      cur = {};
      continue;
    }
    if (line === 'END:VEVENT') {
      if (cur._start) {
        const startsAt = cur._start.iso;
        const endsAt = cur._end?.iso ?? startsAt;
        events.push({
          id: cur.id || `${sourceLabel}:${startsAt}:${cur.title ?? ''}`,
          title: cur.title || '(busy)',
          startsAt,
          endsAt,
          source: sourceLabel,
          allDay: cur._start.allDay,
        });
      }
      inEvent = false;
      continue;
    }
    if (!inEvent) continue;
    const prop = parseLine(line);
    if (!prop) continue;
    switch (prop.name) {
      case 'UID':
        cur.id = `${sourceLabel}:${prop.value}`;
        break;
      case 'SUMMARY':
        cur.title = unescapeText(prop.value);
        break;
      case 'DTSTART':
        cur._start = parseDate(prop) ?? undefined;
        break;
      case 'DTEND':
        cur._end = parseDate(prop) ?? undefined;
        break;
    }
  }
  return events;
}
