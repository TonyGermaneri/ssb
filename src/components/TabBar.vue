<script setup lang="ts">
import { computed } from 'vue'
import { useBoard } from '../stores/board'
import type { ListView } from '../types'

/** The two catalogs as tabs, and the list's own controls: cards or grid (each tab keeps its own), and card size. */
const board = useBoard()

const VIEWS: { id: ListView; label: string; icon: string; title: string }[] = [
  { id: 'pads', label: 'CARDS', icon: 'mdi-view-grid', title: 'Show the list as cards' },
  { id: 'grid', label: 'GRID', icon: 'mdi-table', title: 'Show the list as a spreadsheet: sort, type values, see waveforms' },
]
const scale = computed(() => `${Math.round(board.master.scale * 100)}%`)
function nudge(dir: number) {
  const s = Math.round((board.master.scale + dir * 0.1) * 100) / 100
  board.master.scale = Math.min(2, Math.max(0.5, s))
}
</script>

<template>
  <nav class="tabs">
    <button class="tab" :class="{ on: board.master.tab === 'sounds' }" @click="board.master.tab = 'sounds'">
      <v-icon size="15" icon="mdi-waveform" /> SOUNDS <b>{{ board.sounds.length }}</b>
    </button>
    <button class="tab" :class="{ on: board.master.tab === 'patches' }" @click="board.master.tab = 'patches'">
      <v-icon size="15" icon="mdi-layers-triple" /> PATCHES <b>{{ board.patches.length }}</b>
    </button>
    <div class="tools">
      <div v-if="board.listView === 'pads'" class="scale" title="Card size (scroll or click − / +; double-click = 100%)" @wheel.prevent="nudge($event.deltaY < 0 ? 1 : -1)">
        <button class="chip" @click="nudge(-1)">−</button>
        <span class="lcd" @dblclick="board.master.scale = 1">{{ scale }}</span>
        <button class="chip" @click="nudge(1)">+</button>
      </div>
      <div class="seg" role="group" aria-label="List view">
        <button
          v-for="v in VIEWS"
          :key="v.id"
          class="chip"
          :class="{ on: board.listView === v.id }"
          :aria-pressed="board.listView === v.id"
          :title="v.title"
          @click="board.listView = v.id"
        >
          <v-icon size="13" :icon="v.icon" /> {{ v.label }}
        </button>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.tabs {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  padding: 6px 22px 0;
  background: color-mix(in srgb, var(--panel-lo) 70%, #000);
}
.tab {
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
.tab b {
  font-family: 'VT323', monospace;
  font-size: 15px;
  font-weight: 400;
  color: var(--text-faint);
}
.tab.on {
  color: var(--c-primary);
  background: linear-gradient(180deg, var(--panel-hi), var(--panel-lo));
  text-shadow: 0 0 6px color-mix(in srgb, var(--c-primary) 50%, transparent);
}
.tab.on b {
  color: var(--c-secondary);
}
/* the list's own controls, right of the tabs, sitting on the same baseline */
.tools {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 4px;
}
.seg,
.scale {
  display: flex;
  align-items: center;
  gap: 2px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 20px;
  padding: 0 8px;
  border-radius: 3px;
  font-family: 'VT323', monospace;
  font-size: 15px;
  letter-spacing: 0.08em;
  color: var(--ink-dim);
  background: #111;
  border: 1px solid #000;
  white-space: nowrap;
}
.chip:hover {
  color: var(--text);
}
.chip.on {
  color: var(--c-secondary);
  text-shadow: 0 0 4px color-mix(in srgb, var(--c-secondary) 70%, transparent);
  box-shadow: inset 0 0 8px color-mix(in srgb, var(--c-secondary) 25%, transparent);
}
.scale .chip {
  width: 20px;
  padding: 0;
  justify-content: center;
}
.lcd {
  min-width: 44px;
  height: 20px;
  padding: 0 4px;
  border-radius: 3px;
  font-family: 'VT323', monospace;
  font-size: 16px;
  line-height: 20px;
  text-align: center;
  color: var(--c-secondary);
  background: var(--lcd-bg);
  cursor: ns-resize;
}
</style>
