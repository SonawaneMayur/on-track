<script lang="ts">
  import type { Snippet } from 'svelte';

  let {
    title,
    onClose,
    children,
    footer,
  }: {
    title: string;
    onClose: () => void;
    children: Snippet;
    footer?: Snippet;
  } = $props();

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window on:keydown={onKey} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onClose} role="presentation">
  <div
    class="sheet card fade-in"
    onclick={(e) => e.stopPropagation()}
    role="dialog"
    aria-modal="true"
    aria-label={title}
    tabindex="-1"
  >
    <div class="head">
      <h2>{title}</h2>
      <button class="x" onclick={onClose} aria-label="Close">✕</button>
    </div>
    <div class="body">
      {@render children()}
    </div>
    {#if footer}
      <div class="foot">{@render footer()}</div>
    {/if}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: rgba(4, 7, 16, 0.6);
    backdrop-filter: blur(3px);
    display: flex;
    align-items: flex-end;
    justify-content: center;
  }
  .sheet {
    width: 100%;
    max-width: 560px;
    max-height: 92vh;
    display: flex;
    flex-direction: column;
    border-bottom-left-radius: 0;
    border-bottom-right-radius: 0;
    animation: rise 0.22s cubic-bezier(0.2, 0.9, 0.3, 1);
  }
  @media (min-width: 600px) {
    .backdrop {
      align-items: center;
    }
    .sheet {
      border-radius: var(--radius);
    }
  }
  @keyframes rise {
    from {
      transform: translateY(24px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 18px 18px 8px;
  }
  .head h2 {
    font-size: 20px;
  }
  .x {
    background: var(--bg-card-2);
    border: 1px solid var(--line);
    color: var(--text-dim);
    border-radius: 50%;
    width: 34px;
    height: 34px;
    font-size: 14px;
  }
  .body {
    padding: 8px 18px 18px;
    overflow-y: auto;
  }
  .foot {
    padding: 14px 18px calc(18px + var(--safe-bottom));
    border-top: 1px solid var(--line);
    display: flex;
    gap: 10px;
  }
</style>
