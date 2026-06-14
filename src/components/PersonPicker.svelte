<script lang="ts">
  import { app, setOwner } from '../lib/store';
  import { FAMILY_OWNER } from '../lib/types';

  // null = Everyone. FAMILY_OWNER is a real selectable owner for shared tasks.
  let people = $derived($app.settings.people);
  let selected = $derived($app.selectedOwner);
</script>

<div class="scroll-x">
  <button class="chip" class:active={selected === null} onclick={() => setOwner(null)}>
    👪 Everyone
  </button>
  {#each people as p (p.id)}
    <button
      class="chip"
      class:active={selected === p.id}
      style={selected === p.id ? `background:${p.color}` : ''}
      onclick={() => setOwner(p.id)}
    >
      {p.emoji} {p.name}
    </button>
  {/each}
  <button
    class="chip"
    class:active={selected === FAMILY_OWNER}
    style={selected === FAMILY_OWNER ? 'background:#8b5cf6' : ''}
    onclick={() => setOwner(FAMILY_OWNER)}
  >
    🏡 Family
  </button>
</div>
