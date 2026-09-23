<script setup lang="ts">
import { useBoard } from '../stores/board'

/** The two catalogs. */
const board = useBoard()
</script>

<template>
  <nav class="tabs">
    <button :class="{ on: board.master.tab === 'sounds' }" @click="board.master.tab = 'sounds'">
      <v-icon size="15" icon="mdi-waveform" /> SOUNDS <b>{{ board.sounds.length }}</b>
    </button>
    <button :class="{ on: board.master.tab === 'patches' }" @click="board.master.tab = 'patches'">
      <v-icon size="15" icon="mdi-layers-triple" /> PATCHES <b>{{ board.patches.length }}</b>
    </button>
  </nav>
</template>

<style scoped>
.tabs {
  display: flex;
  gap: 2px;
  padding: 6px 22px 0;
  background: color-mix(in srgb, var(--panel-lo) 70%, #000);
}
button {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 18px 5px;
  border-radius: 6px 6px 0 0;
  font-family: 'Orbitron', sans-serif;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.16em;
  color: var(--ink-mute);
  background: #141317;
  border: 1px solid #000;
  border-bottom: 0;
}
button b {
  font-family: 'VT323', monospace;
  font-size: 15px;
  font-weight: 400;
  color: var(--text-faint);
}
button.on {
  color: var(--c-primary);
  background: linear-gradient(180deg, var(--panel-hi), var(--panel-lo));
  text-shadow: 0 0 6px color-mix(in srgb, var(--c-primary) 50%, transparent);
}
button.on b {
  color: var(--c-secondary);
}
</style>
