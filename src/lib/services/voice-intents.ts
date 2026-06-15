// Phase 4 — command-based voice intents. NOT a chatbot, NOT an LLM. Everything
// is parsed on-device from a small grammar and fuzzy-matched against the day's
// task titles. Richer "add" commands extract a time, owner, and recurrence so
// you can say e.g. "add brush teeth at 8pm for Leo every weekday".
import type { Occurrence } from '../types';

export interface PersonLite {
  id: string;
  name: string;
}

export type Intent =
  | { kind: 'complete'; occurrence: Occurrence }
  | { kind: 'query'; section: string | null; remaining: Occurrence[] }
  | {
      kind: 'add';
      title: string;
      section: string | null;
      scheduledAt: string | null;
      recurrence: string;
      owner: string | null;
    }
  | { kind: 'unknown'; transcript: string };

const SECTION_WORDS: Record<string, string> = {
  morning: 'morning',
  night: 'night',
  tonight: 'night',
  evening: 'night',
  home: 'home',
  chore: 'home',
  chores: 'home',
  body: 'body',
  health: 'body',
};

const DAY_NAMES: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’]/g, '') // drop apostrophes so "what's" -> "whats"
    .replace(/[^a-z0-9: ]/g, ' ') // keep ':' so "5:30pm" survives
    .replace(/\s+/g, ' ')
    .trim();
}

/** Token-overlap similarity between two strings, 0..1. */
function similarity(a: string, b: string): number {
  const ta = new Set(normalise(a).split(' ').filter(Boolean));
  const tb = new Set(normalise(b).split(' ').filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / Math.max(ta.size, tb.size);
}

function detectSection(text: string): string | null {
  for (const word of Object.keys(SECTION_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(text)) return SECTION_WORDS[word];
  }
  return null;
}

function bestMatch(phrase: string, occ: Occurrence[]): { occ: Occurrence; score: number } | null {
  let best: { occ: Occurrence; score: number } | null = null;
  for (const o of occ) {
    const score = similarity(phrase, o.task.title);
    if (!best || score > best.score) best = { occ: o, score };
  }
  return best;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

interface Extracted {
  value: string | null;
  text: string; // text with the matched span removed
}

/** Pull a clock time out of free text: "at 8pm", "8:30 am", "7 oclock", "noon". */
function extractTime(text: string): Extracted {
  if (/\bnoon\b/.test(text)) return { value: '12:00', text: text.replace(/\b(at )?noon\b/, ' ') };
  if (/\bmidnight\b/.test(text)) return { value: '00:00', text: text.replace(/\b(at )?midnight\b/, ' ') };

  // "at 8", "at 8:30", "8 pm", "8:30am", "7 oclock" — require either a leading
  // "at", an am/pm marker, or "oclock" so we don't grab numbers in the title.
  const re = /\b(at )?(\d{1,2})(?::(\d{2}))?\s*(am|pm|oclock)?\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const hadAt = !!m[1];
    const marker = m[4];
    if (!hadAt && !marker) continue; // bare number inside the title — skip
    let h = Number(m[2]);
    const min = m[3] ? Number(m[3]) : 0;
    if (h > 23 || min > 59) continue;
    if (marker === 'pm' && h < 12) h += 12;
    if (marker === 'am' && h === 12) h = 0;
    const cleaned = text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length);
    return { value: `${pad2(h)}:${pad2(min)}`, text: cleaned };
  }
  return { value: null, text };
}

/** Pull a recurrence rule: daily / weekdays / weekends / specific day names. */
function extractRecurrence(text: string): Extracted {
  if (/\bevery ?day\b|\bdaily\b/.test(text)) {
    return { value: 'daily', text: text.replace(/\bevery ?day\b|\bdaily\b/g, ' ') };
  }
  if (/\b(every )?weekdays?\b/.test(text)) {
    return { value: 'weekdays', text: text.replace(/\b(on )?(every )?weekdays?\b/g, ' ') };
  }
  if (/\b(every )?weekends?\b/.test(text)) {
    return { value: 'weekends', text: text.replace(/\b(on )?(every )?weekends?\b/g, ' ') };
  }
  // Specific day names ("every monday", "on mondays and fridays").
  const found = new Set<number>();
  let cleaned = text;
  const dayRe = new RegExp(`\\b(${Object.keys(DAY_NAMES).join('|')})s?\\b`, 'g');
  let m: RegExpExecArray | null;
  while ((m = dayRe.exec(text))) {
    const n = DAY_NAMES[m[1]];
    if (n !== undefined) found.add(n);
  }
  if (found.size) {
    cleaned = cleaned.replace(dayRe, ' ').replace(/\b(every|on|and)\b/g, ' ');
    return { value: `days:${[...found].sort().join(',')}`, text: cleaned };
  }
  return { value: null, text };
}

/** Pull "for <name>" matching a known person; returns the person id. */
function extractOwner(text: string, people: PersonLite[]): { id: string | null; text: string } {
  for (const p of people) {
    const name = normalise(p.name);
    if (!name) continue;
    const re = new RegExp(`\\bfor ${name}\\b|\\b${name}s\\b`);
    if (re.test(text)) {
      return { id: p.id, text: text.replace(re, ' ') };
    }
  }
  return { id: null, text };
}

/**
 * Parse a transcript against today's occurrences. `occurrences` should be the
 * occurrences for the relevant day/person. `people` enables "for <name>".
 */
export function parseIntent(
  transcriptRaw: string,
  occurrences: Occurrence[],
  people: PersonLite[] = [],
): Intent {
  const transcript = normalise(transcriptRaw);
  if (!transcript) return { kind: 'unknown', transcript: transcriptRaw };

  // QUERY: "what's left", "what is left tonight", "what do I have"
  if (/\b(whats? (is )?left|what do i have|whats? remaining|anything left)\b/.test(transcript)) {
    const section = detectSection(transcript);
    const remaining = occurrences.filter(
      (o) => o.status === 'pending' && (!section || o.task.section === section),
    );
    return { kind: 'query', section, remaining };
  }

  // COMPLETE: "mark X done", "X done", "complete X", "finished X", "did X"
  const completeMatch = transcript.match(
    /\b(?:mark|complete|completed|finish|finished|did|done)\b\s*(.*?)\s*(?:\bas\b)?\s*(?:\bdone\b|\bcomplete\b)?$/,
  );
  if (/\b(done|complete|finished|completed)\b/.test(transcript) || /^did /.test(transcript) || /^mark /.test(transcript)) {
    const phrase = (completeMatch?.[1] || transcript)
      .replace(/\b(mark|complete|completed|finish|finished|did|done|as|the|my)\b/g, '')
      .trim();
    const candidates = occurrences.filter((o) => o.status !== 'done');
    const match = bestMatch(phrase || transcript, candidates.length ? candidates : occurrences);
    if (match && match.score >= 0.34) {
      return { kind: 'complete', occurrence: match.occ };
    }
  }

  // ADD: "add [task] X [at <time>] [for <name>] [every <recurrence>] [<section>]"
  const addMatch = transcript.match(/\b(?:add|new|create)\b\s+(?:a\s+)?(?:task|reminder)?\s*(.+)$/);
  if (addMatch && addMatch[1]) {
    let rest = addMatch[1];
    const section = detectSection(rest);

    const owner = extractOwner(rest, people);
    rest = owner.text;
    const time = extractTime(rest);
    rest = time.text;
    const rec = extractRecurrence(rest);
    rest = rec.text;

    const sectionWords = Object.keys(SECTION_WORDS).join('|');
    const title = rest
      .replace(new RegExp(`\\b(?:in the|for the|tonight|this) (?:${sectionWords})\\b`, 'g'), '')
      .replace(new RegExp(`\\b(?:${sectionWords})\\b`, 'g'), '')
      .replace(/\b(?:at|for|am|pm|oclock)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (title) {
      return {
        kind: 'add',
        title: titleCase(title),
        section,
        scheduledAt: time.value,
        recurrence: rec.value ?? 'daily',
        owner: owner.id,
      };
    }
  }

  return { kind: 'unknown', transcript: transcriptRaw };
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
