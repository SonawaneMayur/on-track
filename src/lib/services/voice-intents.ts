// Phase 4 — command-based voice intents. NOT a chatbot, NOT an LLM. We parse a
// small fixed set of intents and fuzzy-match against the day's task titles.
import type { Occurrence } from '../types';

export type Intent =
  | { kind: 'complete'; occurrence: Occurrence }
  | { kind: 'query'; section: string | null; remaining: Occurrence[] }
  | { kind: 'add'; title: string; section: string | null }
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

function normalise(s: string): string {
  return s
    .toLowerCase()
    .replace(/['’]/g, '') // drop apostrophes so "what's" -> "whats"
    .replace(/[^a-z0-9 ]/g, ' ')
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

/**
 * Parse a transcript against today's occurrences. `occurrences` should be the
 * occurrences for the relevant day/person.
 */
export function parseIntent(transcriptRaw: string, occurrences: Occurrence[]): Intent {
  const transcript = normalise(transcriptRaw);
  if (!transcript) return { kind: 'unknown', transcript: transcriptRaw };

  // QUERY: "what's left", "what is left tonight", "what do I have"
  if (/\b(what'?s? (is )?left|what do i have|what'?s? remaining|anything left)\b/.test(transcript)) {
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

  // ADD: "add task X", "add X", "new task X". Keep the title mostly intact —
  // only strip the leading command words and a trailing section hint.
  const addMatch = transcript.match(/\b(?:add|new|create)\b\s+(?:a\s+)?(?:task|reminder)?\s*(.+)$/);
  if (addMatch && addMatch[1]) {
    const sectionWords = Object.keys(SECTION_WORDS).join('|');
    const title = addMatch[1]
      .replace(new RegExp(`\\b(?:in the|for the|tonight|this) (?:${sectionWords})\\b`, 'g'), '')
      .replace(new RegExp(`\\b(?:${sectionWords})\\b$`), '')
      .replace(/\s+/g, ' ')
      .trim();
    if (title) return { kind: 'add', title: titleCase(title), section: detectSection(transcript) };
  }

  return { kind: 'unknown', transcript: transcriptRaw };
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
