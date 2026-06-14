<script lang="ts">
  import { app, occurrencesFor } from '../lib/store';
  import type { Occurrence } from '../lib/types';
  import { SECTIONS } from '../lib/types';
  import {
    addDays,
    formatDateKeyLong,
    todayKey,
    fromDateKey,
  } from '../lib/time';
  import { setSelectedDate } from '../lib/store';
  import { eventsOnDate } from '../lib/services/calendar';
  import PersonPicker from './PersonPicker.svelte';
  import TaskRow from './TaskRow.svelte';
  import TaskEditor from './TaskEditor.svelte';

  let editing = $state<Occurrence | 'new' | null>(null);

  let selectedDate = $derived($app.selectedDate);
  let people = $derived($app.settings.people);

  // A 7-day strip centred on today, navigable.
  let strip = $derived(
    Array.from({ length: 7 }, (_, i) => addDays(todayKey(), i - 3)),
  );

  let occ = $derived(occurrencesFor($app, selectedDate));
  let events = $derived(eventsOnDate($app.events, selectedDate));

  let doneCount = $derived(occ.filter((o) => o.status === 'done').length);
  let total = $derived(occ.length);
  let pct = $derived(total ? Math.round((doneCount / total) * 100) : 0);

  function sectionOcc(sectionId: string): Occurrence[] {
    return occ
      .filter((o) => o.task.section === sectionId)
      .sort(
        (a, b) =>
          (a.task.scheduledAt ?? '99:99').localeCompare(b.task.scheduledAt ?? '99:99') ||
          a.task.title.localeCompare(b.task.title),
      );
  }

  function dayNum(key: string): number {
    return fromDateKey(key).getDate();
  }
  function dayLetter(key: string): string {
    return fromDateKey(key).toLocaleDateString(undefined, { weekday: 'narrow' });
  }
</script>

<div class="content">
  <div class="scroll-x" style="margin-bottom:6px;">
    {#each strip as d (d)}
      <button
        class="day"
        class:active={d === selectedDate}
        class:today={d === todayKey()}
        onclick={() => setSelectedDate(d)}
      >
        <span class="dl">{dayLetter(d)}</span>
        <span class="dn">{dayNum(d)}</span>
      </button>
    {/each}
  </div>

  <PersonPicker />

  <div class="card progress" style="margin-top:14px;">
    <div>
      <div class="pdate">{formatDateKeyLong(selectedDate)}</div>
      <div class="muted" style="font-size:14px;">
        {#if total === 0}
          Nothing scheduled
        {:else}
          {doneCount} of {total} done
        {/if}
      </div>
    </div>
    <div class="ring" style={`--pct:${pct}`}>
      <span>{pct}%</span>
    </div>
  </div>

  {#if events.length}
    <div class="section-title">📅 On the calendar</div>
    <div class="card">
      {#each events as e (e.id)}
        <div class="event">
          <span class="dot"></span>
          <div>
            <div class="etitle">{e.title}</div>
            <div class="faint" style="font-size:13px;">
              {#if e.allDay}
                All day
              {:else}
                {new Date(e.startsAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                – {new Date(e.endsAt).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
              {/if}
              <span class="faint">· {e.source}</span>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  {#each SECTIONS as s (s.id)}
    {@const items = sectionOcc(s.id)}
    {#if items.length}
      <div class="section-title">{s.emoji} {s.label}</div>
      <div class="card">
        {#each items as o (o.task.id + o.date)}
          <TaskRow occ={o} {people} showOwner={$app.selectedOwner === null} onEdit={(x) => (editing = x)} />
        {/each}
      </div>
    {/if}
  {/each}

  {#if total === 0}
    <div class="empty card">
      <div style="font-size:40px;">🗓️</div>
      <p>No tasks here yet.</p>
      <button class="btn primary" onclick={() => (editing = 'new')}>Add a task</button>
    </div>
  {/if}
</div>

<button class="fab" onclick={() => (editing = 'new')} aria-label="Add task">＋</button>

{#if editing}
  <TaskEditor
    task={editing === 'new' ? null : editing.task}
    {people}
    defaultOwner={$app.selectedOwner}
    onClose={() => (editing = null)}
  />
{/if}

<style>
  .day {
    flex: 0 0 auto;
    width: 46px;
    height: 60px;
    border-radius: 14px;
    border: 1px solid var(--line);
    background: var(--bg-card);
    color: var(--text-dim);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
  }
  .day .dl {
    font-size: 12px;
    text-transform: uppercase;
  }
  .day .dn {
    font-size: 18px;
    font-weight: 700;
    color: var(--text);
  }
  .day.today {
    border-color: var(--accent);
  }
  .day.active {
    background: var(--accent);
    border-color: transparent;
  }
  .day.active .dl,
  .day.active .dn {
    color: #fff;
  }
  .progress {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 18px;
  }
  .pdate {
    font-size: 18px;
    font-weight: 700;
  }
  .ring {
    width: 62px;
    height: 62px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    background: conic-gradient(
      var(--green) calc(var(--pct) * 1%),
      var(--bg-card-2) 0
    );
  }
  .ring span {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: var(--bg-card);
    display: grid;
    place-items: center;
    font-size: 14px;
    font-weight: 700;
  }
  .event {
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 12px 14px;
    border-bottom: 1px solid var(--line);
  }
  .event:last-child {
    border-bottom: none;
  }
  .event .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #8b5cf6;
    flex: 0 0 auto;
  }
  .etitle {
    font-weight: 600;
  }
  .empty {
    text-align: center;
    padding: 36px 20px;
    margin-top: 24px;
  }
  .empty p {
    color: var(--text-dim);
  }
  .fab {
    position: fixed;
    right: max(18px, env(safe-area-inset-right));
    bottom: calc(var(--nav-h) + var(--safe-bottom) + 16px);
    width: 58px;
    height: 58px;
    border-radius: 50%;
    border: none;
    background: var(--accent);
    color: #fff;
    font-size: 30px;
    line-height: 1;
    box-shadow: 0 8px 24px rgba(59, 130, 246, 0.45);
    z-index: 30;
  }
  .fab:active {
    transform: scale(0.94);
  }
</style>
