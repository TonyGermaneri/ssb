<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useBoard } from '../stores/board'
import { padHue } from '../lib/format'
import type { Patch } from '../types'
import PatchButton from './PatchButton.vue'

/** Patch catalog as cards, virtualised by rows. Patches are edited in the rack (☰ on a card shows it there). */
const board = useBoard()
const PAD_W = 152
const PAD_H = 104
const TILE = 4 + 4 // tile padding + gap

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

const perRow = computed(() => Math.max(1, Math.floor((width.value - 16) / (PAD_W * board.master.scale + TILE))))
const number = computed(() => new Map(board.patches.map((p, i) => [p.id, i + 1])))
const rows = computed(() => {
  const out: { key: string; patches: Patch[] }[] = []
  const list = board.shownPatches
  for (let i = 0; i < list.length; i += perRow.value) {
    const patches = list.slice(i, i + perRow.value)
    out.push({ key: patches.map((p) => p.id).join('|'), patches })
  }
  return out
})
const hue = (p: Patch) => padHue(p.tag, p.name, board.theme.padHues)
</script>

<template>
  <div v-if="!board.patches.length" class="empty">
    <div class="cart">
      <div class="big">NO PATCHES YET</div>
      <div class="small">
        a patch = up to 3 VCOs (sounds) + the header knobs. Press 1 / 2 / 3 on a sound, NEW PATCH in a sound's panel,
        or + next to the header's patch selector.
      </div>
      <button v-if="board.sounds.length" class="hw-btn" @click="board.newPatch((board.selected ?? board.sounds[0]).id)">
        <v-icon size="14" icon="mdi-plus-box-multiple" /> NEW PATCH FROM "{{ (board.selected ?? board.sounds[0]).settings.name }}"
      </button>
    </div>
  </div>
  <div v-else-if="!board.visiblePatches.length" class="empty">
    <div class="cart small">NO PATCHES MATCH THE TAG FILTER</div>
  </div>
  <div v-else ref="wrap" class="grid" :style="{ '--pad-scale': board.master.scale }">
    <v-virtual-scroll :items="rows" item-key="key" :item-height="Math.round(PAD_H * board.master.scale + 24)" height="100%">
      <template #default="{ item }">
        <div class="row">
          <div v-for="p in item.patches" :key="p.id" class="tile">
            <PatchButton :patch="p" :hue="hue(p)" :number="number.get(p.id) ?? 0" :score="board.patchScores?.get(p.id)" />
          </div>
        </div>
      </template>
    </v-virtual-scroll>
  </div>
</template>

<style scoped>
.grid {
  height: 100%;
}
.row {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  padding: 4px 8px 0;
}
.tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 2px;
}
.empty {
  display: grid;
  place-items: center;
  min-height: 50vh;
  padding: 16px;
}
.cart {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  max-width: 640px;
  padding: 32px 40px;
  border-radius: 10px;
  border: 2px dashed color-mix(in srgb, var(--c-primary) 45%, transparent);
  background: rgba(0, 0, 0, 0.25);
  color: var(--c-primary);
  font-family: 'Orbitron', sans-serif;
  text-align: center;
}
.big {
  font-size: 20px;
  font-weight: 900;
  letter-spacing: 0.2em;
}
.small {
  font-family: 'VT323', monospace;
  font-size: 17px;
  color: var(--text-dim);
}
</style>
