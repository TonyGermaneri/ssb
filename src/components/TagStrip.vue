<script setup lang="ts">
import { computed } from 'vue'
import { useBoard } from '../stores/board'
import { padHue } from '../lib/format'

/** Faceted tag filter: two rows of chips with counts; picking a tag narrows the rest (AND). */
const board = useBoard()
const favOnly = computed(() => (board.master.tab === 'patches' ? board.master.favPatches : board.master.favSounds))
function toggleFav() {
  if (board.master.tab === 'patches') board.master.favPatches = !board.master.favPatches
  else board.master.favSounds = !board.master.favSounds
}

function onWheel(e: WheelEvent) {
  // vertical wheel scrolls the chip rows sideways
  const el = e.currentTarget as HTMLElement
  if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
    el.scrollLeft += e.deltaY
    e.preventDefault()
  }
}
</script>

<template>
  <div class="tagstrip">
    <div class="lead">
      <h5>TAGS</h5>
      <button
        class="chip all"
        :class="{ on: !board.currentFilter.length }"
        title="Show everything"
        @click="board.clearCurrentTags()"
      >
        ALL <b>{{ board.currentTotal }}</b>
      </button>
      <button
        class="chip fav"
        :class="{ on: favOnly }"
        title="Show favourites only"
        @click="toggleFav"
      >
        ♥ FAV
      </button>
      <span v-if="board.currentFilter.length || favOnly" class="shown">{{ board.currentShown }} SHOWN</span>
    </div>
    <div class="chips" @wheel="onWheel">
      <button
        v-for="f in board.currentFacets"
        :key="f.name"
        class="chip"
        :class="{ on: f.selected }"
        :style="{ '--hue': padHue(f.name, f.name, board.theme.padHues) }"
        :title="f.selected ? `Remove ${f.name} from the filter` : `Show pads tagged ${f.name}`"
        @click="board.toggleCurrentTag(f.name)"
      >
        <i class="dot" />
        {{ f.name }}
        <b>{{ f.count }}</b>
        <span v-if="f.selected" class="x">✕</span>
      </button>
      <span v-if="!board.currentFacets.length" class="empty">NO TAGS YET (COMMA-SEPARATED, IN EACH ITEM'S PANEL)</span>
    </div>
  </div>
</template>

<style scoped>
.tagstrip {
  display: flex;
  align-items: stretch;
  gap: 8px;
  padding: 4px 22px;
  background: linear-gradient(180deg, var(--panel-lo), color-mix(in srgb, var(--panel-lo) 70%, #000));
  border-bottom: 2px solid #000;
  box-shadow: 0 3px 8px rgba(0, 0, 0, 0.45);
}
.lead {
  flex: none;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
  min-width: 70px;
}
h5 {
  margin: 0;
  font-family: 'Orbitron', sans-serif;
  font-size: 7px;
  font-weight: 900;
  letter-spacing: 0.2em;
  color: var(--text-head);
  opacity: 0.75;
}
.shown {
  font-family: 'VT323', monospace;
  font-size: 13px;
  color: var(--c-primary);
}
/* two rows of chips, flowing sideways */
.chips {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-auto-flow: column;
  grid-template-rows: repeat(2, 20px);
  grid-auto-columns: max-content;
  gap: 3px 4px;
  align-content: center;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: thin;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 20px;
  padding: 0 7px;
  border-radius: 10px;
  font-family: 'VT323', monospace;
  font-size: 15px;
  line-height: 1;
  color: var(--ink-dim);
  background: #141317;
  border: 1px solid #000;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.07);
  white-space: nowrap;
}
.chip:hover {
  color: var(--text);
  border-color: color-mix(in srgb, var(--c-primary) 40%, #000);
}
.chip b {
  font-weight: 400;
  color: var(--text-mute);
}
.chip.on {
  color: #111;
  background: var(--c-primary);
  box-shadow: 0 0 8px color-mix(in srgb, var(--c-primary) 55%, transparent);
}
.chip.on b {
  color: #3a2a00;
}
.chip.all,
.chip.fav {
  align-self: flex-start;
}
.chip.fav.on {
  color: #fff;
  background: #d8245a;
  box-shadow: 0 0 8px #ff3d6e;
}
.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: hsl(var(--hue) 85% 55%);
  box-shadow: 0 0 4px hsl(var(--hue) 85% 55%);
}
.x {
  font-size: 12px;
}
.empty {
  grid-row: 1 / span 2;
  align-self: center;
  font-family: 'VT323', monospace;
  font-size: 14px;
  color: var(--text-faint);
}
</style>
