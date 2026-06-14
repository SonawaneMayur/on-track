# BUILD.md — Family Task & Routine App

A personal, on-device task/routine app for one family (2 parents + kids).
Editable tasks, voice control, calendar awareness, and timely reminders.
**Not** a product, not multi-tenant, not cloud-synced.

---

## Goals

- Editable tasks/routines for parents and kids (replaces the printed charts).
- Mark complete by tap **or** voice; reminders read aloud via voice.
- Awareness of the family's real calendar events.
- Reliable reminders that fire even when the app is closed.
- Runs on both iOS and Android from a single codebase (portability).
- Data lives on the device. Sensible security for a personal app.

## Non-Goals (explicitly out of scope — do not build)

- **No accounts / OAuth / login.** Four known users on their own devices.
- **No backend server, no database in the cloud, no multi-device sync.**
- **No "scalability" engineering.** Fixed, tiny user count forever. Optimize for
  simplicity and longevity, not throughput.
- **No bundled speech ML model by default.** Use the OS's on-device engines.
- **No app-store ambitions required** (can sideload / TestFlight / internal track).

---

## Architecture Decision Record

### Stack: Capacitor + a lightweight web layer
- Single web codebase (HTML/CSS/JS or a light framework — Svelte or Lit; **avoid
  React-scale tooling**, it's overkill here) wrapped by **Capacitor** into native
  iOS + Android shells.
- Rationale: reuses the existing chart HTML, one codebase for both platforms
  (portability), and native plugins cover the gaps a pure web app can't (reliable
  notifications, calendar, speech).

### Data: on-device only
- Use **SQLite** (`@capacitor-community/sqlite`) for tasks, completion records, and
  week history. IndexedDB is acceptable if SQLite proves heavy, but history queries
  are cleaner in SQL.
- No remote storage. No accounts. Each device is self-contained.
- **Backup story (see open question B):** an export/import to a JSON file (or the
  user's own cloud drive) is the only "sync" — manual, user-controlled, no server.

### Calendar: private iCal (ICS) feed, no OAuth
- Each parent provides a **secret read-only iCal URL** (Google Calendar →
  Settings → "Secret address in iCal format"; iCloud has an equivalent).
- The app fetches the `.ics` over HTTPS and parses events **locally**. Works on any
  device regardless of which account it's signed into — including a kid's tablet
  or a device with no family calendar synced. This is the requirement that ruled
  out reading the OS calendar.
- **Not OAuth.** No Google login flow, no SDK, no token refresh.
- Read-only. Cache the last successful fetch so the app works offline between
  refreshes; refresh on app open and on a timer.
- **Known limitation:** Google's secret ICS feed is not real-time and can lag by
  hours. Acceptable for next-day planning and "silence reminders during today's
  events." If sub-minute freshness is ever required, that is the one case that
  justifies revisiting OAuth — document it, don't build for it now.

### Speech: OS-native, on-device
- **STT:** iOS `SFSpeechRecognizer` (on-device mode), Android `SpeechRecognizer`
  with offline preference. Via a Capacitor speech-recognition plugin.
- **TTS:** iOS `AVSpeechSynthesizer`, Android `TextToSpeech`. Via a Capacitor TTS
  plugin.
- These are already local and lightweight. **Do not ship Whisper by default.**
- Fallback only: if a needed language's on-device STT is poor, evaluate
  `whisper.cpp` (tiny/base) behind a plugin — but treat as a later, optional spike.

### Notifications: native local notifications
- `@capacitor/local-notifications` for scheduled reminders that fire with the app
  closed. This is the main reason for going native over a pure PWA (iOS PWA
  background notifications are unreliable).
- Schedule per-task reminders; support "before time" lead reminders and a
  "you missed this" follow-up.

---

## Data Model (starting point)

```
Task
  id            text  (uuid)
  owner         text  ('dad' | 'mom' | 'kid:<name>' | 'family')
  title         text
  section       text  ('morning' | 'body' | 'home' | 'night' | ...)
  scheduled_at  text  (local time 'HH:MM', nullable for anytime tasks)
  recurrence    text  ('daily' | 'weekdays' | 'weekends' | 'custom-cron')
  remind_lead   int   (minutes before scheduled_at to nudge; nullable)
  active        bool

Completion
  id            text
  task_id       text  (fk Task.id)
  date          text  ('YYYY-MM-DD')
  owner         text
  done_at       text  (timestamp, nullable)
  status        text  ('done' | 'missed' | 'skipped')

CalendarEvent (cached read-only mirror, refreshed on app open)
  id, title, starts_at, ends_at, source
```

Week history = query `Completion` by date range. Totals = count of `done` per
task per week. No separate "totals" table; compute it.

---

## Feature Phases (ship in order — each is usable on its own)

**Phase 1 — Editable tasks + tap-to-complete + local notifications**
The core. Tasks editable in-app, tap a cell to mark done (persists), scheduled
reminders fire. This alone replaces the paper charts and is worth shipping before
anything else.

**Phase 2 — Reports**
Achieved-vs-missed reports over day / week / month / year, per person and overall.
Pure queries over the `Completion` table — no new infrastructure. Show completion
rate, streaks, and best/worst tasks. (See "Reporting" below and open question E.)

**Phase 3 — Calendar awareness**
Fetch + parse the ICS feed; show today's events alongside tasks; silence task
reminders that fall inside a calendar event (the chosen adjustment rule).

**Phase 4 — Voice**
STT to add/complete/query tasks ("mark brush teeth done", "what's left tonight").
TTS to read reminders aloud. **Command-based, not a chatbot** — parse a small set
of intents, no on-device LLM. (See open question C.)

> Voice is the most work for the least daily payoff. Kids enjoy it; it is not why
> the app succeeds. Build it last.

---

## Reporting

All reports are computed from the `Completion` table — no extra storage.

- **Granularity:** day, week, month, year (and "all time").
- **Metrics:** done vs missed counts, completion rate (%), current/longest streak
  per task, best and worst tasks/people for the period.
- **Breakdowns:** per person (`dad`/`mom`/each kid) and family total; per section
  (morning/home/night) so you can see *where* things slip.
- **Definition of "missed" (open question E):** a task is `missed` when its day has
  ended (or `scheduled_at` + grace passes) with no `done` record. A nightly local
  job, or lazy evaluation when a report is opened, writes the `missed` rows. Pick
  one; lazy-on-read is simpler and avoids a background job.

---

## Security model (right-sized for personal use)

- Data stays on device; nothing leaves it without an explicit user export.
- **The secret ICS URL is a credential** — anyone with it can read that calendar.
  Store it in OS secure storage (iOS Keychain / Android Keystore via a secure
  storage plugin), **never** in plain Preferences/localStorage. Never log it, never
  put it in a URL the app itself exposes.
- ICS fetch is read-only and outbound HTTPS only; the app accepts no inbound
  connections and runs no server.
- No OAuth tokens, no API keys under this design — the ICS URL is the only secret.
- If a backup-to-cloud feature is added later, the file is the user's own; the app
  holds no credentials for it (use the OS share/document picker, not stored creds).
- Keep dependencies minimal; pin versions; review plugin permissions.

---

## Decisions log + remaining questions

**Resolved:**
- **OAuth: dropped.** No Google login.
- **Calendar source: private ICS feed URL**, fetched + parsed locally. Chosen
  specifically so the app works on devices not signed into the family calendars.
- **Calendar adjustment: display events + silence reminders during them.** No
  rescheduling.
- **Editable task list:** core, Phase 1.
- **Speech / notifications:** OS-native, on-device.

**Remaining (do not block Phase 1):**

**B. Backup** — if the device dies, is losing history acceptable, or do you want
  manual export/import to a file or your own cloud drive?

**C. Voice scope** — confirm command-based (fixed intents: add / complete / query).
  Not a conversational LLM assistant.

**E. "Missed" computation** — lazy-on-read (simpler) vs a nightly job. Recommend
  lazy-on-read.

**F. ICS staleness** — confirm you accept that calendar data may lag a few hours.
  If not, calendar awareness requires OAuth after all.

---

## Claude Code working agreement

- `git init` on day one; commit per working feature. This is the real backup of the
  *code* (device storage is the backup of the *data*).
- Pin Node + Capacitor versions; **verify current plugin package names/versions in
  Claude Code** — the calendar/speech community plugins change; don't trust a name
  from this doc without checking it resolves and is maintained.
- Build Phase 1 end-to-end and run it on a real device before touching Phase 2.
- Keep the web layer framework-light. If a dependency's only justification is
  "best practice for big apps," it does not belong here.
