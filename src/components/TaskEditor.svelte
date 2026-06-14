<script lang="ts">
  import Modal from './Modal.svelte';
  import type { Person, Section, Task } from '../lib/types';
  import { FAMILY_OWNER, SECTIONS } from '../lib/types';
  import { deleteTask, saveTask } from '../lib/store';

  let {
    task,
    people,
    defaultOwner,
    onClose,
  }: {
    task: Task | null;
    people: Person[];
    defaultOwner: string | null;
    onClose: () => void;
  } = $props();

  const isNew = task === null;

  let title = $state(task?.title ?? '');
  let owner = $state(task?.owner ?? defaultOwner ?? people[0]?.id ?? FAMILY_OWNER);
  let section = $state<Section>(task?.section ?? 'morning');
  let hasTime = $state(task?.scheduledAt != null);
  let scheduledAt = $state(task?.scheduledAt ?? '08:00');
  let active = $state(task?.active ?? true);

  // Recurrence editing: a base mode + custom weekday set.
  const initRec = task?.recurrence ?? 'daily';
  let recMode = $state<'daily' | 'weekdays' | 'weekends' | 'custom'>(
    initRec === 'daily' || initRec === 'weekdays' || initRec === 'weekends'
      ? initRec
      : 'custom',
  );
  let customDays = $state<number[]>(
    initRec.startsWith('days:')
      ? initRec.slice(5).split(',').map(Number).filter((n) => !Number.isNaN(n))
      : [1, 2, 3, 4, 5],
  );

  let remindLead = $state<number | null>(task?.remindLead ?? null);

  const DOW = [
    { n: 0, l: 'S' },
    { n: 1, l: 'M' },
    { n: 2, l: 'T' },
    { n: 3, l: 'W' },
    { n: 4, l: 'T' },
    { n: 5, l: 'F' },
    { n: 6, l: 'S' },
  ];

  function toggleDay(n: number) {
    customDays = customDays.includes(n)
      ? customDays.filter((d) => d !== n)
      : [...customDays, n].sort();
  }

  function recurrenceValue(): string {
    if (recMode === 'custom') return `days:${[...customDays].sort((a, b) => a - b).join(',')}`;
    return recMode;
  }

  let canSave = $derived(title.trim().length > 0 && (recMode !== 'custom' || customDays.length > 0));

  async function save() {
    const next: Task = {
      id: task?.id ?? crypto.randomUUID(),
      owner,
      title: title.trim(),
      section,
      scheduledAt: hasTime ? scheduledAt : null,
      recurrence: recurrenceValue(),
      remindLead: hasTime ? remindLead : null,
      active,
      sortOrder: task?.sortOrder ?? Date.now(),
    };
    await saveTask(next);
    onClose();
  }

  async function remove() {
    if (task && confirm(`Delete "${task.title}"? This also removes its history.`)) {
      await deleteTask(task.id);
      onClose();
    }
  }
</script>

<Modal title={isNew ? 'New task' : 'Edit task'} {onClose}>
  <label class="field">
    <span>Title</span>
    <input
      bind:value={title}
      placeholder="e.g. Brush teeth"
      autocomplete="off"
      autocapitalize="sentences"
    />
  </label>

  <label class="field">
    <span>Who</span>
    <select bind:value={owner}>
      {#each people as p (p.id)}
        <option value={p.id}>{p.emoji} {p.name}</option>
      {/each}
      <option value={FAMILY_OWNER}>🏡 Family</option>
    </select>
  </label>

  <div class="field">
    <span>Section</span>
    <div class="row wrap">
      {#each SECTIONS as s (s.id)}
        <button
          class="chip"
          class:active={section === s.id}
          onclick={() => (section = s.id)}
          type="button"
        >
          {s.emoji} {s.label}
        </button>
      {/each}
    </div>
  </div>

  <div class="field">
    <span>Repeats</span>
    <div class="row wrap">
      {#each [['daily', 'Every day'], ['weekdays', 'Weekdays'], ['weekends', 'Weekends'], ['custom', 'Custom']] as [mode, label] (mode)}
        <button
          class="chip"
          class:active={recMode === mode}
          onclick={() => (recMode = mode as typeof recMode)}
          type="button"
        >
          {label}
        </button>
      {/each}
    </div>
    {#if recMode === 'custom'}
      <div class="row" style="margin-top:10px; gap:6px;">
        {#each DOW as d (d.n)}
          <button
            class="dow"
            class:active={customDays.includes(d.n)}
            onclick={() => toggleDay(d.n)}
            type="button"
            aria-label={`day ${d.n}`}
          >
            {d.l}
          </button>
        {/each}
      </div>
    {/if}
  </div>

  <div class="field">
    <label class="toggle">
      <span>Scheduled time</span>
      <input type="checkbox" bind:checked={hasTime} />
    </label>
    {#if hasTime}
      <div class="row wrap" style="margin-top:8px;">
        <input type="time" bind:value={scheduledAt} class="time" />
        <select bind:value={remindLead} class="lead">
          <option value={null}>No reminder</option>
          <option value={0}>At time</option>
          <option value={5}>5 min before</option>
          <option value={10}>10 min before</option>
          <option value={15}>15 min before</option>
          <option value={30}>30 min before</option>
        </select>
      </div>
    {:else}
      <p class="faint" style="margin:6px 0 0; font-size:13px;">
        Anytime task — appears in the list with no reminder.
      </p>
    {/if}
  </div>

  {#if !isNew}
    <label class="toggle" style="margin-top:6px;">
      <span>Active</span>
      <input type="checkbox" bind:checked={active} />
    </label>
  {/if}

  {#snippet footer()}
    {#if !isNew}
      <button class="btn danger" onclick={remove} type="button">Delete</button>
    {/if}
    <button class="btn primary block" onclick={save} disabled={!canSave} type="button">
      {isNew ? 'Add task' : 'Save'}
    </button>
  {/snippet}
</Modal>

<style>
  .field {
    display: block;
    margin-bottom: 16px;
  }
  .field > span {
    display: block;
    font-size: 13px;
    color: var(--text-dim);
    margin-bottom: 7px;
    font-weight: 600;
  }
  input,
  select {
    width: 100%;
    background: var(--bg-card-2);
    border: 1px solid var(--line);
    color: var(--text);
    border-radius: var(--radius-sm);
    padding: 12px 12px;
  }
  .time {
    width: auto;
    flex: 1 1 120px;
  }
  .lead {
    width: auto;
    flex: 2 1 160px;
  }
  .toggle {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 15px;
    font-weight: 600;
  }
  .toggle input {
    width: auto;
  }
  .dow {
    width: 38px;
    height: 38px;
    border-radius: 50%;
    border: 1px solid var(--line);
    background: var(--bg-card-2);
    color: var(--text-dim);
    font-weight: 700;
  }
  .dow.active {
    background: var(--accent);
    color: #fff;
    border-color: transparent;
  }
  input[type='checkbox'] {
    width: 22px;
    height: 22px;
    accent-color: var(--accent);
  }
</style>
