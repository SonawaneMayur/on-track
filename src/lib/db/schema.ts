// SQLite schema. Kept deliberately small — four known users, one device.
// History/totals are computed from `completions`, never stored separately.

export const SCHEMA_VERSION = 1;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS tasks (
  id           TEXT PRIMARY KEY,
  owner        TEXT NOT NULL,
  title        TEXT NOT NULL,
  section      TEXT NOT NULL,
  scheduled_at TEXT,
  recurrence   TEXT NOT NULL DEFAULT 'daily',
  remind_lead  INTEGER,
  active       INTEGER NOT NULL DEFAULT 1,
  sort_order   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS completions (
  id       TEXT PRIMARY KEY,
  task_id  TEXT NOT NULL,
  date     TEXT NOT NULL,
  owner    TEXT NOT NULL,
  done_at  TEXT,
  status   TEXT NOT NULL DEFAULT 'done',
  UNIQUE(task_id, date, owner)
);
CREATE INDEX IF NOT EXISTS idx_completions_date ON completions(date);
CREATE INDEX IF NOT EXISTS idx_completions_task ON completions(task_id);

CREATE TABLE IF NOT EXISTS calendar_events (
  id        TEXT PRIMARY KEY,
  title     TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at   TEXT NOT NULL,
  source    TEXT NOT NULL,
  all_day   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;
