<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useBoard } from '../stores/board'
import type { Sound } from '../types'
import SoundTile from './SoundTile.vue'

const board = useBoard()
defineEmits<{ add: [] }>()

/*
 * Virtualised card view: pads are packed into rows (how many fit comes from the measured width and pad scale;
 * an open pad takes a row of its own for its full-width panel), and v-virtual-scroll only renders the rows on
 * screen — so thousands of pads stay a few dozen DOM nodes.
 */
const PAD_W = 152
const PAD_H = 104
const TILE_PAD = 4 // tile padding, left + right
const GAP = 4
const SIDE = 24 // grid padding, left + right

const wrap = ref<HTMLElement>()
const width = ref(1200)
let ro: ResizeObserver | undefined
watch(wrap, (el) => {
  ro?.disconnect()
  if (!el) return
  width.value = el.clientWidth
  ro = new ResizeObserver(() => (width.value = el.clientWidth))
  ro.observe(el)
})
onBeforeUnmount(() => ro?.disconnect())

const perRow = computed(() => {
  const tile = PAD_W * board.master.scale + TILE_PAD + GAP
  return Math.max(1, Math.floor((width.value - SIDE + GAP) / tile))
})

interface Row {
  key: string
  sounds: Sound[]
  open: boolean
}
const rows = computed<Row[]>(() => {
  const out: Row[] = []
  let cur: Sound[] = []
  const flush = () => {
    if (cur.length) out.push({ key: cur.map((s) => s.id).join('|'), sounds: cur, open: false })
    cur = []
  }
  for (const s of board.visible) {
    if (board.openPanels.has(s.id)) {
      flush()
      out.push({ key: `open:${s.id}`, sounds: [s], open: true })
    } else {
      cur.push(s)
      if (cur.length >= perRow.value) flush()
    }
  }
  flush()
  return out
})
/** first guess at a row's height; v-virtual-scroll measures the real ones as they render */
const rowHeight = computed(() => Math.round(PAD_H * board.master.scale + 8))
</script>

<template>
  <div v-if="!board.loaded" class="empty">
    <div class="cart">LOADING…</div>
  </div>
  <div v-else-if="!board.sounds.length" class="empty">
    <button class="cart" @click="$emit('add')">
      <div class="slot" />
      <div class="big">INSERT SOUNDS</div>
      <div class="small">drop audio files, SFZ instruments or folders anywhere · or click to browse</div>
    </button>
  </div>
  <div v-else-if="!board.visible.length" class="empty">
    <div class="cart small">NO PADS MATCH THE TAG FILTER</div>
  </div>
  <div v-else ref="wrap" class="grid" :style="{ '--pad-scale': board.master.scale }">
    <v-virtual-scroll :items="rows" item-key="key" :item-height="rowHeight" height="100%">
      <template #default="{ item }">
        <div class="row" :class="{ open: item.open, last: item === rows[rows.length - 1] }">
          <SoundTile v-for="s in item.sounds" :key="s.id" :sound="s" />
        </div>
      </template>
    </v-virtual-scroll>
  </div>
</template>

<style scoped>
/* fills the list pane; the virtual scroller scrolls inside it */
.grid {
  height: 100%;
}
.row {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  padding: 4px 8px 0;
}
/* room under the final row (each row is alone in its virtual-scroll item, so not :last-child) */
.row.last {
  padding-bottom: 40px;
}
.empty {
  display: grid;
  place-items: center;
  min-height: 60vh;
  padding: 16px;
}
.cart {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  padding: 36px 48px;
  max-width: 100%;
  border-radius: 10px;
  border: 2px dashed color-mix(in srgb, var(--c-primary) 45%, transparent);
  background: rgba(0, 0, 0, 0.25);
  color: var(--c-primary);
  font-family: 'Orbitron', sans-serif;
  cursor: pointer;
  text-align: center;
}
.cart:hover {
  background: color-mix(in srgb, var(--c-primary) 6%, transparent);
}
.slot {
  width: 160px;
  height: 10px;
  border-radius: 5px;
  background: #050406;
  box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.9), 0 1px 0 rgba(255, 255, 255, 0.1);
}
.big {
  font-size: 22px;
  font-weight: 900;
  letter-spacing: 0.2em;
  text-shadow: 0 0 10px color-mix(in srgb, var(--c-primary) 60%, transparent);
  animation: pulse 1.6s ease-in-out infinite;
}
.small {
  font-family: 'VT323', monospace;
  font-size: 18px;
  color: var(--text-dim);
  letter-spacing: 0.05em;
}
@keyframes pulse {
  50% {
    opacity: 0.55;
  }
}
</style>
