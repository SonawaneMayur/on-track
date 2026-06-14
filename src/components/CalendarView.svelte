<script lang="ts">
  import { app, refreshCalendar } from '../lib/store';
  import { addDays, formatDateKeyLong, todayKey } from '../lib/time';
  import { eventsOnDate, LAST_REFRESH_KEY } from '../lib/services/calendar';
  import { getDb } from '../lib/db';

  let refreshing = $state(false);
  let lastRefresh = $state<string | null>(null);

  $effect(() => {
    void (async () => {
      const db = await getDb();
      lastRefresh = await db.getSetting(LAST_REFRESH_KEY);
    })();
  });

  let days = $derived(Array.from({ length: 14 }, (_, i) => addDays(todayKey(), i)));
  let hasFeeds = $derived($app.settings.feeds.length > 0);

  async function doRefresh() {
    refreshing = true;
    await refreshCalendar();
    const db = await getDb();
    lastRefresh = await db.getSetting(LAST_REFRESH_KEY);
    refreshing = false;
  }

  function timeLabel(iso: string): string {
    return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
</script>

<div class="content">
  <div class="row spread" style="margin-bottom:6px;">
    <div class="muted" style="font-size:13px;">
      {#if lastRefresh}
        Updated {new Date(lastRefresh).toLocaleString(undefined, { hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric' })}
      {:else}
        Not synced yet
      {/if}
    </div>
    {#if hasFeeds}
      <button class="btn ghost" onclick={doRefresh} disabled={refreshing}>
        {#if refreshing}<span class="spinner" style="width:16px;height:16px;"></span>{:else}↻ Refresh{/if}
      </button>
    {/if}
  </div>

  {#if $app.calendarError}
    <div class="card err">⚠️ {$app.calendarError}</div>
  {/if}

  {#if !hasFeeds}
    <div class="card intro">
      <div style="font-size:38px;">📅</div>
      <h3>Add a calendar feed</h3>
      <p class="muted">
        Paste a private iCal (ICS) URL in Settings to see family events here and
        silence task reminders during them. Read-only, on-device — no Google login.
      </p>
    </div>
  {:else}
    {#each days as d (d)}
      {@const evts = eventsOnDate($app.events, d)}
      {#if evts.length}
        <div class="section-title">{formatDateKeyLong(d)}</div>
        <div class="card">
          {#each evts as e (e.id)}
            <div class="ev">
              <div class="time">
                {#if e.allDay}all day{:else}{timeLabel(e.startsAt)}{/if}
              </div>
              <div class="dot"></div>
              <div class="info">
                <div class="t">{e.title}</div>
                <div class="faint" style="font-size:12px;">{e.source}</div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {/each}

    {#if $app.events.length === 0}
      <div class="card intro">
        <p class="muted">No upcoming events in the cached feed.</p>
      </div>
    {/if}
  {/if}
</div>

<style>
  .intro {
    text-align: center;
    padding: 32px 22px;
    margin-top: 16px;
  }
  .intro h3 {
    margin: 8px 0 6px;
  }
  .intro p {
    font-size: 14px;
  }
  .err {
    padding: 12px 14px;
    margin-bottom: 12px;
    color: #fca5a5;
    border-color: rgba(239, 68, 68, 0.35);
    background: var(--red-soft);
  }
  .ev {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--line);
  }
  .ev:last-child {
    border-bottom: none;
  }
  .time {
    width: 64px;
    flex: 0 0 auto;
    font-size: 13px;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }
  .dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #8b5cf6;
    flex: 0 0 auto;
  }
  .info .t {
    font-weight: 600;
  }
</style>
