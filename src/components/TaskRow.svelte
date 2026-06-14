<script lang="ts">
  import type { Occurrence, Person } from '../lib/types';
  import { FAMILY_OWNER } from '../lib/types';
  import { formatTime, describeRecurrence } from '../lib/time';
  import { setStatus, toggleDone } from '../lib/store';

  let {
    occ,
    people,
    showOwner = false,
    onEdit,
  }: {
    occ: Occurrence;
    people: Person[];
    showOwner?: boolean;
    onEdit: (occ: Occurrence) => void;
  } = $props();

  let menuOpen = $state(false);

  let owner = $derived(
    occ.task.owner === FAMILY_OWNER
      ? { name: 'Family', color: '#8b5cf6', emoji: '🏡' }
      : (people.find((p) => p.id === occ.task.owner) ?? {
          name: occ.task.owner,
          color: '#64748b',
          emoji: '•',
        }),
  );

  let done = $derived(occ.status === 'done');
  let missed = $derived(occ.status === 'missed');
  let skipped = $derived(occ.status === 'skipped');

  async function pick(status: 'skipped' | 'clear') {
    menuOpen = false;
    await setStatus(occ.task, occ.date, status);
  }
</script>

<div class="task-row" class:done class:missed class:skipped>
  <button
    class="check"
    style={`--c:${owner.color}`}
    onclick={() => toggleDone(occ.task, occ.date)}
    aria-label={done ? 'Mark not done' : 'Mark done'}
  >
    {#if done}✓{:else if skipped}–{/if}
  </button>

  <button class="meta" onclick={() => onEdit(occ)}>
    <div class="title">{occ.task.title}</div>
    <div class="sub">
      {#if occ.task.scheduledAt}<span>{formatTime(occ.task.scheduledAt)}</span>{/if}
      <span class="faint">{describeRecurrence(occ.task.recurrence)}</span>
      {#if showOwner}
        <span class="owner" style={`color:${owner.color}`}>{owner.emoji} {owner.name}</span>
      {/if}
      {#if missed}<span class="badge red">missed</span>{/if}
      {#if skipped}<span class="badge">skipped</span>{/if}
    </div>
  </button>

  <div class="kebab-wrap">
    <button class="kebab" onclick={() => (menuOpen = !menuOpen)} aria-label="More">⋯</button>
    {#if menuOpen}
      <div class="menu card" role="menu">
        <button onclick={() => onEdit(occ)}>✏️ Edit</button>
        <button onclick={() => pick('skipped')}>⏭️ Skip today</button>
        <button onclick={() => pick('clear')}>↩️ Clear status</button>
      </div>
    {/if}
  </div>
</div>

{#if menuOpen}
  <button class="scrim" onclick={() => (menuOpen = false)} aria-label="Close menu"></button>
{/if}

<style>
  .task-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 12px;
    border-bottom: 1px solid var(--line);
    position: relative;
  }
  .task-row:last-child {
    border-bottom: none;
  }
  .check {
    flex: 0 0 auto;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    border: 2px solid var(--c);
    background: transparent;
    color: #fff;
    font-size: 15px;
    font-weight: 800;
    display: grid;
    place-items: center;
    transition: all 0.12s ease;
  }
  .done .check {
    background: var(--c);
  }
  .skipped .check {
    border-style: dashed;
    color: var(--text-faint);
  }
  .meta {
    flex: 1 1 auto;
    text-align: left;
    background: none;
    border: none;
    color: inherit;
    padding: 0;
    min-width: 0;
  }
  .title {
    font-size: 16px;
    font-weight: 600;
    color: var(--text);
  }
  .done .title {
    text-decoration: line-through;
    color: var(--text-dim);
  }
  .sub {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: var(--text-dim);
    margin-top: 3px;
  }
  .owner {
    font-weight: 600;
  }
  .badge {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 2px 7px;
    border-radius: 999px;
    background: var(--bg-card-2);
    color: var(--text-dim);
  }
  .badge.red {
    background: var(--red-soft);
    color: #fca5a5;
  }
  .kebab-wrap {
    position: relative;
    flex: 0 0 auto;
  }
  .kebab {
    background: none;
    border: none;
    color: var(--text-faint);
    font-size: 22px;
    width: 32px;
    height: 32px;
    line-height: 1;
  }
  .menu {
    position: absolute;
    right: 0;
    top: 34px;
    z-index: 40;
    display: flex;
    flex-direction: column;
    min-width: 170px;
    padding: 6px;
  }
  .menu button {
    text-align: left;
    background: none;
    border: none;
    color: var(--text);
    padding: 11px 12px;
    border-radius: 8px;
    font-size: 15px;
  }
  .menu button:active {
    background: var(--bg-card-2);
  }
  .scrim {
    position: fixed;
    inset: 0;
    z-index: 30;
    background: transparent;
    border: none;
  }
</style>
