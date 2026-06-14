<script lang="ts">
  import { app, setView, type View } from '../lib/store';

  const TABS: { id: View; label: string; icon: string }[] = [
    { id: 'today', label: 'Today', icon: '✅' },
    { id: 'reports', label: 'Reports', icon: '📊' },
    { id: 'calendar', label: 'Calendar', icon: '📅' },
    { id: 'settings', label: 'Settings', icon: '⚙️' },
  ];

  let view = $derived($app.view);
</script>

<nav class="nav">
  {#each TABS as t (t.id)}
    <button class="tab" class:active={view === t.id} onclick={() => setView(t.id)}>
      <span class="ic">{t.icon}</span>
      <span class="lbl">{t.label}</span>
    </button>
  {/each}
</nav>

<style>
  .nav {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 25;
    height: calc(var(--nav-h) + var(--safe-bottom));
    padding-bottom: var(--safe-bottom);
    display: flex;
    background: rgba(17, 23, 43, 0.92);
    backdrop-filter: blur(12px);
    border-top: 1px solid var(--line);
  }
  .tab {
    flex: 1 1 0;
    background: none;
    border: none;
    color: var(--text-faint);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    font-size: 11px;
    font-weight: 600;
  }
  .tab .ic {
    font-size: 20px;
    filter: grayscale(0.6) opacity(0.7);
    transition: filter 0.15s ease;
  }
  .tab.active {
    color: var(--accent);
  }
  .tab.active .ic {
    filter: none;
  }
</style>
