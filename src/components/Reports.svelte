<script lang="ts">
  import { app } from '../lib/store';
  import { computeReport, type RangeKind } from '../lib/services/reports';
  import { SECTIONS } from '../lib/types';
  import { todayKey } from '../lib/time';
  import PersonPicker from './PersonPicker.svelte';

  let kind = $state<RangeKind>('week');

  const RANGES: { id: RangeKind; label: string }[] = [
    { id: 'day', label: 'Day' },
    { id: 'week', label: 'Week' },
    { id: 'month', label: 'Month' },
    { id: 'year', label: 'Year' },
    { id: 'all', label: 'All' },
  ];

  let earliest = $derived(
    $app.completions.reduce((min, c) => (c.date < min ? c.date : min), todayKey()),
  );

  let report = $derived(
    computeReport(
      $app.tasks,
      $app.completions,
      kind,
      $app.selectedOwner,
      earliest,
      $app.settings.people,
    ),
  );

  function sectionLabel(id: string): string {
    return SECTIONS.find((s) => s.id === id)?.label ?? id;
  }
  function sectionEmoji(id: string): string {
    return SECTIONS.find((s) => s.id === id)?.emoji ?? '•';
  }
  function pct(r: number): number {
    return Math.round(r * 100);
  }
</script>

<div class="content">
  <PersonPicker />

  <div class="scroll-x" style="margin-top:12px;">
    {#each RANGES as r (r.id)}
      <button class="chip" class:active={kind === r.id} onclick={() => (kind = r.id)}>
        {r.label}
      </button>
    {/each}
  </div>

  <div class="card hero" style="margin-top:14px;">
    <div class="ring" style={`--pct:${pct(report.rate)}`}>
      <span>{pct(report.rate)}%</span>
    </div>
    <div class="stats">
      <div class="stat"><b style="color:var(--green)">{report.done}</b><span>done</span></div>
      <div class="stat"><b style="color:#fca5a5">{report.missed}</b><span>missed</span></div>
      <div class="stat"><b>{report.skipped}</b><span>skipped</span></div>
    </div>
  </div>

  {#if report.done + report.missed === 0}
    <div class="card note">No completed or missed tasks in this period yet.</div>
  {:else}
    {#if report.bestTask || report.worstTask}
      <div class="row" style="gap:12px; margin-top:14px;">
        {#if report.bestTask}
          <div class="card pill good">
            <div class="plabel">🏆 Best</div>
            <div class="pname">{report.bestTask.title}</div>
            <div class="muted">{pct(report.bestTask.rate)}% · streak {report.bestTask.longestStreak}</div>
          </div>
        {/if}
        {#if report.worstTask}
          <div class="card pill bad">
            <div class="plabel">📉 Needs work</div>
            <div class="pname">{report.worstTask.title}</div>
            <div class="muted">{pct(report.worstTask.rate)}% · {report.worstTask.missed} missed</div>
          </div>
        {/if}
      </div>
    {/if}

    {#if report.perPerson.length > 1}
      <div class="section-title">By person</div>
      <div class="card pad">
        {#each report.perPerson as p (p.owner)}
          <div class="bar-row">
            <div class="bar-label">{p.name}</div>
            <div class="bar"><div class="fill" style={`width:${pct(p.rate)}%`}></div></div>
            <div class="bar-val">{pct(p.rate)}%</div>
          </div>
        {/each}
      </div>
    {/if}

    <div class="section-title">By section</div>
    <div class="card pad">
      {#each report.perSection as s (s.section)}
        <div class="bar-row">
          <div class="bar-label">{sectionEmoji(s.section)} {sectionLabel(s.section)}</div>
          <div class="bar"><div class="fill" style={`width:${pct(s.rate)}%`}></div></div>
          <div class="bar-val">{pct(s.rate)}%</div>
        </div>
      {/each}
    </div>

    <div class="section-title">Every task</div>
    <div class="card">
      {#each report.perTask as t (t.taskId)}
        <div class="task-stat">
          <div class="ts-main">
            <div class="ts-title">{t.title}</div>
            <div class="muted" style="font-size:13px;">
              {t.done} done · {t.missed} missed
              {#if t.currentStreak > 0}· 🔥 {t.currentStreak}{/if}
            </div>
          </div>
          <div class="ts-rate" class:low={t.rate < 0.5}>{pct(t.rate)}%</div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .hero {
    display: flex;
    align-items: center;
    gap: 20px;
    padding: 18px;
  }
  .ring {
    width: 84px;
    height: 84px;
    border-radius: 50%;
    display: grid;
    place-items: center;
    flex: 0 0 auto;
    background: conic-gradient(var(--green) calc(var(--pct) * 1%), var(--bg-card-2) 0);
  }
  .ring span {
    width: 66px;
    height: 66px;
    border-radius: 50%;
    background: var(--bg-card);
    display: grid;
    place-items: center;
    font-size: 19px;
    font-weight: 800;
  }
  .stats {
    display: flex;
    gap: 22px;
  }
  .stat {
    display: flex;
    flex-direction: column;
  }
  .stat b {
    font-size: 26px;
  }
  .stat span {
    color: var(--text-dim);
    font-size: 13px;
  }
  .note {
    margin-top: 16px;
    padding: 20px;
    text-align: center;
    color: var(--text-dim);
  }
  .pill {
    flex: 1 1 0;
    padding: 14px;
    min-width: 0;
  }
  .plabel {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-dim);
  }
  .pname {
    font-weight: 700;
    font-size: 16px;
    margin: 4px 0 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .pill.good {
    border-color: rgba(34, 197, 94, 0.4);
  }
  .pill.bad {
    border-color: rgba(239, 68, 68, 0.35);
  }
  .pad {
    padding: 14px 16px;
  }
  .bar-row {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 7px 0;
  }
  .bar-label {
    width: 110px;
    font-size: 14px;
    font-weight: 600;
    flex: 0 0 auto;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .bar {
    flex: 1 1 auto;
    height: 10px;
    border-radius: 999px;
    background: var(--bg-card-2);
    overflow: hidden;
  }
  .fill {
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, var(--accent), var(--green));
  }
  .bar-val {
    width: 42px;
    text-align: right;
    font-size: 13px;
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }
  .task-stat {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border-bottom: 1px solid var(--line);
  }
  .task-stat:last-child {
    border-bottom: none;
  }
  .ts-title {
    font-weight: 600;
  }
  .ts-rate {
    font-weight: 800;
    font-size: 17px;
    color: var(--green);
    font-variant-numeric: tabular-nums;
  }
  .ts-rate.low {
    color: #fca5a5;
  }
</style>
