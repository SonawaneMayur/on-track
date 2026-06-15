# Hands-free & driving

onTrack is built to be usable without looking at the screen. Three pieces work
together:

## 1. Reminders read themselves aloud (iOS)

Turn on **Settings (iOS) → Notifications → Announce Notifications**, and enable
**onTrack** in the list. With AirPods or CarPlay connected, Siri reads each
reminder out loud — and onTrack phrases them to sound natural, e.g.
*"Time for Leo to brush teeth."* No setup inside onTrack required.

## 2. Action buttons on every reminder

Long-press (or pull down) a reminder to get buttons — also available as taps in
CarPlay / on the lock screen:

- **✓ Done** — marks the task complete **without opening the app**, and updates
  your tracking/streaks.
- **⏰ Snooze 10 min** — re-fires the reminder in ten minutes.
- **🔊 Read aloud** — opens onTrack and speaks the task.

## 3. "Hey Siri, onTrack" — open already listening

onTrack registers a deep link, `ontrack://voice`, that opens the app and
immediately starts listening for a command. Bind it to a Siri phrase once:

1. Open the **Shortcuts** app → **+** → **Add Action**.
2. Search **Web → Open URLs** → set the URL to `ontrack://voice`.
3. Name the shortcut something like **"onTrack"** and/or record a phrase.
4. Now say **"Hey Siri, onTrack"** → the app opens listening, and you can say:
   - *"Mark brush teeth done"*
   - *"What's left tonight?"*
   - *"Add take out trash at 9 for Dad every Sunday"*

(On Android, create the same thing with Google Assistant routines / an app
shortcut pointing at `ontrack://voice`.)

### What the voice grammar understands (all on-device)

| You say | It does |
|---|---|
| "mark *<task>* done", "*<task>* done", "finished *<task>*" | completes the closest-matching task |
| "what's left", "what's left tonight / this morning" | reads back what's still pending |
| "add *<title>* at *<time>* for *<name>* every *<recurrence>*" | creates the task with time, owner, and repeat |

Recurrence words it knows: *every day, weekdays, weekends,* and specific days
(*every Monday and Friday*). Times like *8pm, 5:30pm, 7 o'clock, noon* all work.

> This is a fixed on-device command grammar — private, free, works offline, and
> nothing is sent to a server. It is not a free-form chatbot by design.

## Beyond this (not built)

True "act with the app fully closed" Siri/CarPlay (Swift **App Intents** that
read live data via an App Group) is a larger native effort and is **not** in the
current build — the deep-link approach above covers the same driving use case
without it. See the note in the README if you want to pursue full App Intents.
