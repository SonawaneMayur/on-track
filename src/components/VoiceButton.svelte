<script lang="ts">
  import { app, occurrencesFor, setStatus, saveTask } from '../lib/store';
  import { todayKey } from '../lib/time';
  import { listenOnce, speak, sttAvailable } from '../lib/services/speech';
  import { parseIntent } from '../lib/services/voice-intents';
  import type { Section, Task } from '../lib/types';
  import { FAMILY_OWNER } from '../lib/types';

  type Phase = 'idle' | 'listening' | 'working' | 'result';
  let phase = $state<Phase>('idle');
  let heard = $state('');
  let reply = $state('');
  let available = $state(true);

  $effect(() => {
    void sttAvailable().then((v) => (available = v));
  });

  async function run() {
    if (phase === 'listening') return;
    heard = '';
    reply = '';
    phase = 'listening';
    try {
      const transcript = await listenOnce();
      heard = transcript;
      phase = 'working';
      await handle(transcript);
    } catch (e) {
      reply = (e as Error).message || 'Sorry, I could not hear that.';
      phase = 'result';
      await speak(reply);
    }
    setTimeout(() => {
      if (phase === 'result') phase = 'idle';
    }, 4200);
  }

  async function handle(transcript: string) {
    const occ = occurrencesFor($app, todayKey());
    const intent = parseIntent(transcript, occ);

    if (intent.kind === 'complete') {
      await setStatus(intent.occurrence.task, todayKey(), 'done');
      reply = `Marked ${intent.occurrence.task.title} done. Nice!`;
    } else if (intent.kind === 'query') {
      const left = intent.remaining;
      if (left.length === 0) {
        reply = intent.section ? `Nothing left for ${intent.section}.` : 'Everything is done. Great job!';
      } else {
        const names = left.slice(0, 5).map((o) => o.task.title).join(', ');
        reply = `${left.length} left${intent.section ? ` for ${intent.section}` : ''}: ${names}.`;
      }
    } else if (intent.kind === 'add') {
      const owner = $app.selectedOwner ?? FAMILY_OWNER;
      const task: Task = {
        id: crypto.randomUUID(),
        owner,
        title: intent.title,
        section: (intent.section as Section) ?? 'anytime',
        scheduledAt: null,
        recurrence: 'daily',
        remindLead: null,
        active: true,
        sortOrder: Date.now(),
      };
      await saveTask(task);
      reply = `Added ${intent.title}.`;
    } else {
      reply = `I didn't catch a command. Try “mark brush teeth done” or “what's left tonight”.`;
    }

    phase = 'result';
    await speak(reply);
  }
</script>

{#if $app.settings.voiceEnabled && available}
  <button
    class="mic"
    class:listening={phase === 'listening'}
    onclick={run}
    aria-label="Voice command"
  >
    {#if phase === 'listening'}🎙️{:else if phase === 'working'}…{:else}🎤{/if}
  </button>
{/if}

{#if phase !== 'idle' && phase !== 'result' && heard}
  <div class="bubble card">“{heard}”</div>
{/if}
{#if phase === 'result' && reply}
  <div class="bubble card reply">{reply}</div>
{/if}

<style>
  .mic {
    position: fixed;
    left: max(18px, env(safe-area-inset-left));
    bottom: calc(var(--nav-h) + var(--safe-bottom) + 16px);
    width: 54px;
    height: 54px;
    border-radius: 50%;
    border: 1px solid var(--line);
    background: var(--bg-card);
    color: #fff;
    font-size: 22px;
    z-index: 30;
    box-shadow: var(--shadow);
  }
  .mic.listening {
    background: var(--red);
    border-color: transparent;
    animation: pulse 1.1s ease-in-out infinite;
  }
  @keyframes pulse {
    0%,
    100% {
      box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.5);
    }
    50% {
      box-shadow: 0 0 0 12px rgba(239, 68, 68, 0);
    }
  }
  .bubble {
    position: fixed;
    left: 50%;
    transform: translateX(-50%);
    bottom: calc(var(--nav-h) + var(--safe-bottom) + 82px);
    max-width: 88%;
    padding: 12px 16px;
    z-index: 31;
    font-size: 15px;
    text-align: center;
    animation: fade 0.2s ease;
  }
  .bubble.reply {
    background: var(--accent-soft);
    border-color: var(--accent);
  }
</style>
