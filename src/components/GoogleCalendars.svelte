<script lang="ts">
  import { app, setGoogleClientId, addGoogleAccount, updateGoogleAccount, removeGoogleAccount } from '../lib/store';
  import type { GoogleAccount } from '../lib/types';
  import { signIn, googleAuthSupported, redirectUriFor } from '../lib/services/google-auth';
  import { listCalendars } from '../lib/services/google-calendar';

  let clientId = $state($app.settings.googleClientId ?? '');
  let accounts = $derived($app.settings.googleAccounts);
  let busy = $state(false);
  let error = $state('');
  let supported = googleAuthSupported();

  let redirectHint = $derived(clientId.trim() ? redirectUriFor(clientId.trim()) : '');

  async function saveClientId() {
    await setGoogleClientId(clientId);
  }

  async function connect() {
    error = '';
    const cid = clientId.trim();
    if (!cid) {
      error = 'Enter your Google OAuth client ID first.';
      return;
    }
    await setGoogleClientId(cid);
    busy = true;
    try {
      const res = await signIn(cid);
      const cals = await listCalendars(cid, res.accountId);
      // Default to importing the primary calendar (id === account email).
      const calendars = cals.map((c) => ({ ...c, selected: c.selected || c.id === res.email }));
      const account: GoogleAccount = {
        id: res.accountId,
        email: res.email,
        calendars,
        connectedAt: new Date().toISOString(),
      };
      await addGoogleAccount(account);
    } catch (e) {
      error = (e as Error).message;
    } finally {
      busy = false;
    }
  }

  async function toggleCal(account: GoogleAccount, calId: string) {
    const calendars = account.calendars.map((c) =>
      c.id === calId ? { ...c, selected: !c.selected } : c,
    );
    await updateGoogleAccount({ ...account, calendars });
  }

  async function disconnect(account: GoogleAccount) {
    if (confirm(`Disconnect ${account.email}?`)) await removeGoogleAccount(account.id);
  }
</script>

<div class="section-title">Google Calendar</div>
<div class="card pad">
  {#if !supported}
    <div class="muted sm warn">
      ⚠️ Google sign-in runs on the iOS/Android app (it needs the secure in-app
      browser and Keychain). This browser preview can configure the client ID but
      can't complete sign-in.
    </div>
  {/if}

  <div class="slabel">OAuth client ID</div>
  <div class="muted sm" style="margin:2px 0 8px;">
    From Google Cloud Console → Credentials. Not a secret. One-time consent stores
    a refresh token in the Keychain/Keystore, then refreshes silently.
  </div>
  <input
    class="full"
    placeholder="000000-xxxx.apps.googleusercontent.com"
    bind:value={clientId}
    onchange={saveClientId}
    autocapitalize="off"
    autocomplete="off"
    spellcheck="false"
  />
  {#if redirectHint}
    <div class="muted sm" style="margin-top:6px;">
      Redirect URI to register: <code>{redirectHint}</code>
    </div>
  {/if}

  {#each accounts as a (a.id)}
    <div class="account">
      <div class="row spread">
        <div>
          <div class="slabel">🟢 {a.email}</div>
          <div class="muted sm">{a.calendars.filter((c) => c.selected).length} of {a.calendars.length} calendars importing</div>
        </div>
        <button class="rm" onclick={() => disconnect(a)} aria-label="Disconnect">✕</button>
      </div>
      <div class="cals">
        {#each a.calendars as c (c.id)}
          <label class="cal">
            <input type="checkbox" checked={c.selected} onchange={() => toggleCal(a, c.id)} />
            <span class="swatch" style={`background:${c.color ?? '#8b5cf6'}`}></span>
            <span class="cname">{c.summary}</span>
          </label>
        {/each}
      </div>
    </div>
  {/each}

  {#if error}<div class="muted sm err">{error}</div>{/if}

  <button class="btn primary block" onclick={connect} disabled={busy || !supported} style="margin-top:12px;">
    {#if busy}<span class="spinner" style="width:16px;height:16px;"></span> Connecting…{:else}
      {accounts.length ? '＋ Connect another account' : 'Connect Google account'}
    {/if}
  </button>
</div>

<style>
  .pad {
    padding: 14px 16px;
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
    margin-bottom: 12px;
  }
  .err {
    color: #fca5a5;
    margin-top: 8px;
  }
  .full {
    width: 100%;
    background: var(--bg-card-2);
    border: 1px solid var(--line);
    color: var(--text);
    border-radius: var(--radius-sm);
    padding: 11px 12px;
  }
  code {
    background: var(--bg-card-2);
    padding: 2px 6px;
    border-radius: 6px;
    font-size: 11.5px;
    word-break: break-all;
  }
  .account {
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--line);
  }
  .rm {
    background: none;
    border: none;
    color: var(--text-faint);
    font-size: 16px;
    padding: 6px;
  }
  .cals {
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .cal {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 2px;
  }
  .cal input {
    width: 20px;
    height: 20px;
    accent-color: var(--accent);
  }
  .swatch {
    width: 12px;
    height: 12px;
    border-radius: 3px;
    flex: 0 0 auto;
  }
  .cname {
    font-size: 14px;
  }
</style>
