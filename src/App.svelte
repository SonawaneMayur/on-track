<script lang="ts">
  import { app } from './lib/store';
  import Today from './components/Today.svelte';
  import Reports from './components/Reports.svelte';
  import CalendarView from './components/CalendarView.svelte';
  import Settings from './components/Settings.svelte';
  import BottomNav from './components/BottomNav.svelte';
  import VoiceButton from './components/VoiceButton.svelte';

  let view = $derived($app.view);

  const TITLES: Record<string, { title: string; sub: string }> = {
    today: { title: '✅ onTrack', sub: 'Tap to complete · everything stays on this device' },
    reports: { title: '📊 Reports', sub: 'Done vs missed, streaks, and where things slip' },
    calendar: { title: '📅 Calendar', sub: 'Family events from your private iCal feeds' },
    settings: { title: '⚙️ Settings', sub: 'People, reminders, feeds, and backup' },
  };
</script>

<div class="shell">
  {#if !$app.ready}
    <div class="boot">
      <div class="spinner"></div>
      <p class="muted">Loading onTrack…</p>
    </div>
  {:else}
    <header class="appbar">
      <h1>{TITLES[view].title}</h1>
      <div class="sub">{TITLES[view].sub}</div>
    </header>

    {#if view === 'today'}
      <Today />
    {:else if view === 'reports'}
      <Reports />
    {:else if view === 'calendar'}
      <CalendarView />
    {:else if view === 'settings'}
      <Settings />
    {/if}

    {#if view === 'today'}
      <VoiceButton />
    {/if}

    <BottomNav />
  {/if}
</div>

<style>
  .boot {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
  }
</style>
