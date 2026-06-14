<script lang="ts">
  import { Capacitor } from '@capacitor/core';
  import { app, updateSettings, exportData, importData, refreshCalendar } from '../lib/store';
  import type { CalendarFeed, Person } from '../lib/types';
  import {
    setFeedUrl,
    deleteFeedUrl,
    isSecureStorageAvailable,
  } from '../lib/services/securestore';
  import { ensurePermission, notificationsSupported } from '../lib/services/notifications';
  import GoogleCalendars from './GoogleCalendars.svelte';

  let people = $derived($app.settings.people);
  let feeds = $derived($app.settings.feeds);
  let settings = $derived($app.settings);

  // --- People ---
  const COLORS = ['#EC4899', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#14B8A6'];

  async function addKid() {
    const next: Person = {
      id: `kid:${crypto.randomUUID().slice(0, 6)}`,
      name: 'New kid',
      role: 'kid',
      color: COLORS[people.length % COLORS.length],
      emoji: '🙂',
    };
    await updateSettings({ people: [...people, next] });
  }

  async function patchPerson(id: string, p: Partial<Person>) {
    await updateSettings({ people: people.map((x) => (x.id === id ? { ...x, ...p } : x)) });
  }

  async function removePerson(id: string) {
    if (people.length <= 1) return;
    if (confirm('Remove this person? Their tasks stay but become unassigned in lists.')) {
      await updateSettings({ people: people.filter((x) => x.id !== id) });
    }
  }

  // --- Calendar feeds ---
  let newLabel = $state('');
  let newUrl = $state('');
  let savingFeed = $state(false);

  async function addFeed() {
    if (!newLabel.trim() || !newUrl.trim()) return;
    savingFeed = true;
    const feed: CalendarFeed = { id: crypto.randomUUID(), label: newLabel.trim() };
    await setFeedUrl(feed.id, newUrl.trim());
    await updateSettings({ feeds: [...feeds, feed] });
    newLabel = '';
    newUrl = '';
    savingFeed = false;
    void refreshCalendar();
  }

  async function removeFeed(feed: CalendarFeed) {
    await deleteFeedUrl(feed.id);
    await updateSettings({ feeds: feeds.filter((f) => f.id !== feed.id) });
  }

  // --- Notifications ---
  let notifStatus = $state<'unknown' | 'granted' | 'denied'>('unknown');
  async function requestNotif() {
    const ok = await ensurePermission();
    notifStatus = ok ? 'granted' : 'denied';
  }

  // --- Backup ---
  let importText = $state('');
  let backupMsg = $state('');

  async function doExport() {
    const dump = await exportData();
    const json = JSON.stringify(dump, null, 2);
    const fname = `ontrack-backup-${new Date().toISOString().slice(0, 10)}.json`;
    if (!Capacitor.isNativePlatform()) {
      const blob = new Blob([json], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fname;
      a.click();
      URL.revokeObjectURL(a.href);
      backupMsg = 'Backup downloaded.';
    } else {
      try {
        await navigator.clipboard.writeText(json);
        backupMsg = 'Backup copied to clipboard — paste it somewhere safe.';
      } catch {
        importText = json;
        backupMsg = 'Copy the text below to save your backup.';
      }
    }
  }

  async function doImport() {
    try {
      const dump = JSON.parse(importText);
      if (!dump.tasks) throw new Error('not an onTrack backup');
      if (!confirm('Replace ALL current data with this backup?')) return;
      await importData(dump);
      backupMsg = 'Backup restored.';
      importText = '';
    } catch (e) {
      backupMsg = `Import failed: ${(e as Error).message}`;
    }
  }
</script>

<div class="content">
  <!-- People -->
  <div class="section-title">People</div>
  <div class="card pad">
    {#each people as p (p.id)}
      <div class="person">
        <input class="emoji" bind:value={p.emoji} onchange={() => patchPerson(p.id, { emoji: p.emoji })} maxlength="2" />
        <input class="name" bind:value={p.name} onchange={() => patchPerson(p.id, { name: p.name })} />
        <div class="swatches">
          {#each COLORS as c (c)}
            <button
              class="sw"
              class:on={p.color === c}
              style={`background:${c}`}
              onclick={() => patchPerson(p.id, { color: c })}
              aria-label="color"
            ></button>
          {/each}
        </div>
        {#if people.length > 1}
          <button class="rm" onclick={() => removePerson(p.id)} aria-label="Remove">✕</button>
        {/if}
      </div>
    {/each}
    <button class="btn ghost block" onclick={addKid} style="margin-top:10px;">＋ Add person</button>
  </div>

  <!-- Reminders -->
  <div class="section-title">Reminders</div>
  <div class="card pad">
    {#if notificationsSupported()}
      <div class="row spread setting">
        <div><div class="slabel">Notifications</div><div class="muted sm">Reminders fire with the app closed</div></div>
        <button class="btn ghost" onclick={requestNotif}>
          {notifStatus === 'granted' ? 'Enabled ✓' : 'Enable'}
        </button>
      </div>
    {:else}
      <div class="muted sm" style="padding:4px 0;">
        Background reminders run on iOS/Android. In the browser preview they're disabled.
      </div>
    {/if}
    <label class="row spread setting">
      <div><div class="slabel">Silence during events</div><div class="muted sm">Skip reminders that land inside a calendar event</div></div>
      <input type="checkbox" checked={settings.silenceDuringEvents} onchange={(e) => updateSettings({ silenceDuringEvents: e.currentTarget.checked })} />
    </label>
    <label class="row spread setting">
      <div><div class="slabel">Schedule ahead</div><div class="muted sm">Days of reminders to pre-schedule</div></div>
      <select value={settings.reminderHorizonDays} onchange={(e) => updateSettings({ reminderHorizonDays: Number(e.currentTarget.value) })}>
        {#each [7, 14, 21, 30] as d (d)}<option value={d}>{d} days</option>{/each}
      </select>
    </label>
  </div>

  <!-- Calendar feeds -->
  <div class="section-title">Calendar feeds</div>
  <div class="card pad">
    {#if !isSecureStorageAvailable()}
      <div class="muted sm warn">
        ⚠️ Secure storage (Keychain/Keystore) is only on device. In this preview the
        URL is kept in the session and cleared on reload.
      </div>
    {/if}
    {#each feeds as f (f.id)}
      <div class="row spread feed">
        <div><div class="slabel">{f.label}</div><div class="muted sm">🔒 secret URL stored securely</div></div>
        <button class="rm" onclick={() => removeFeed(f)} aria-label="Remove feed">✕</button>
      </div>
    {/each}
    <input class="full" placeholder="Label (e.g. Mom's calendar)" bind:value={newLabel} />
    <input class="full" placeholder="https://…/basic.ics (secret iCal URL)" bind:value={newUrl} autocapitalize="off" autocomplete="off" spellcheck="false" />
    <button class="btn ghost block" onclick={addFeed} disabled={savingFeed || !newLabel || !newUrl}>＋ Add feed</button>
    <p class="muted sm" style="margin:10px 2px 0;">
      Google Calendar → Settings → “Secret address in iCal format”. Read-only; nothing is sent anywhere but the calendar host.
    </p>
  </div>

  <!-- Google Calendar (OAuth) -->
  <GoogleCalendars />

  <!-- Backup -->
  <div class="section-title">Backup</div>
  <div class="card pad">
    <p class="muted sm" style="margin-top:0;">
      Data lives only on this device. Export a JSON file to keep a copy or move to a new device.
    </p>
    <div class="row" style="gap:10px;">
      <button class="btn ghost" onclick={doExport}>⬆️ Export</button>
      <button class="btn ghost" onclick={doImport} disabled={!importText.trim()}>⬇️ Restore</button>
    </div>
    <textarea class="full" rows="3" placeholder="Paste a backup here to restore…" bind:value={importText}></textarea>
    {#if backupMsg}<div class="muted sm">{backupMsg}</div>{/if}
  </div>

  <div class="version">onTrack · on-device · v1.0</div>
</div>

<style>
  .pad {
    padding: 14px 16px;
  }
  .person {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 0;
    border-bottom: 1px solid var(--line);
  }
  .person:last-of-type {
    border-bottom: none;
  }
  .emoji {
    width: 44px;
    text-align: center;
    background: var(--bg-card-2);
    border: 1px solid var(--line);
    color: var(--text);
    border-radius: 8px;
    padding: 8px 0;
    font-size: 18px;
  }
  .name {
    flex: 1 1 auto;
    min-width: 0;
    background: var(--bg-card-2);
    border: 1px solid var(--line);
    color: var(--text);
    border-radius: 8px;
    padding: 9px 10px;
  }
  .swatches {
    display: flex;
    gap: 4px;
  }
  .sw {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 2px solid transparent;
    padding: 0;
  }
  .sw.on {
    border-color: #fff;
  }
  .rm {
    background: none;
    border: none;
    color: var(--text-faint);
    font-size: 16px;
    padding: 6px;
  }
  .setting,
  .feed {
    padding: 11px 0;
    border-bottom: 1px solid var(--line);
  }
  .setting:last-child,
  .feed:last-child {
    border-bottom: none;
  }
  .slabel {
    font-weight: 600;
  }
  .sm {
    font-size: 12.5px;
  }
  .warn {
    background: var(--red-soft);
    border-radius: 8px;
    padding: 10px;
    margin-bottom: 8px;
  }
  .full {
    width: 100%;
    background: var(--bg-card-2);
    border: 1px solid var(--line);
    color: var(--text);
    border-radius: var(--radius-sm);
    padding: 11px 12px;
    margin-top: 8px;
  }
  textarea.full {
    resize: vertical;
  }
  select {
    background: var(--bg-card-2);
    border: 1px solid var(--line);
    color: var(--text);
    border-radius: 8px;
    padding: 8px 10px;
  }
  input[type='checkbox'] {
    width: 24px;
    height: 24px;
    accent-color: var(--accent);
  }
  .version {
    text-align: center;
    color: var(--text-faint);
    font-size: 12px;
    margin: 26px 0 6px;
  }
</style>
