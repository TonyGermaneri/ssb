<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useBoard } from '../stores/board'
import { padHue } from '../lib/format'
import type { Patch } from '../types'
import PatchButton from './PatchButton.vue'
import Rack from './Rack.vue'

/** Patch catalog as cards, virtualised by rows (an open patch gets a full row showing its layers). */
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
  const out: { key: string; patches: Patch[]; open: boolean }[] = []
  let cur: Patch[] = []
  const flush = () => {
    if (cur.length) out.push({ key: cur.map((p) => p.id).join('|'), patches: cur, open: false })
    cur = []
  }
  for (const p of board.visiblePatches) {
    if (board.openPanels.has(p.id)) {
      flush()
      out.push({ key: `open:${p.id}`, patches: [p], open: true })
    } else {
      cur.push(p)
      if (cur.length >= perRow.value) flush()
    }
  }
  flush()
  return out
})
const hue = (p: Patch) => padHue(p.tag, p.name, board.theme.padHues)
</script>

<template>
  <div v-if="!board.patches.length" class="empty">
    <div class="cart">
      <div class="big">NO PATCHES YET</div>
      <div class="small">
        a patch = sounds as layers (main + up to 3 VCOs) + the header knobs. Open a sound's panel and press NEW PATCH, or
        use + next to the header's patch selector.
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
        <div class="row" :class="{ open: item.open }">
          <div v-for="p in item.patches" :key="p.id" class="tile" :class="{ open: item.open }">
            <div v-if="item.open" class="editor">
              <div class="editor-bar">
                <input
                  :value="p.name"
                  class="name"
                  spellcheck="false"
                  title="Patch name"
                  @change="(e) => (p.name = (e.target as HTMLInputElement).value.trim() || p.name)"
                  @keydown.stop
                />
                <input
                  :value="p.tag"
                  class="tags"
                  spellcheck="false"
                  placeholder="tags, comma, separated"
                  title="Patch tags"
                  @change="(e) => (p.tag = (e.target as HTMLInputElement).value)"
                  @keydown.stop
                />
                <v-spacer />
                <button class="hw-btn" title="Duplicate patch" @click="board.duplicatePatch(p.id)">
                  <v-icon size="14" icon="mdi-content-copy" /> DUPLICATE
                </button>
                <button class="hw-btn danger" title="Delete patch" @click="board.removePatch(p.id)">
                  <v-icon size="14" icon="mdi-delete" /> DELETE
                </button>
              </div>
              <Rack :patch="p" inline />
            </div>
            <PatchButton :patch="p" :hue="hue(p)" :open="item.open" :number="number.get(p.id) ?? 0" @toggle="board.togglePanel(p.id)" />
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
.tile.open {
  flex-basis: 100%;
  align-items: flex-start;
  min-width: 0;
}
.editor {
  width: 100%;
  margin-bottom: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  background: linear-gradient(180deg, var(--panel-hi), var(--panel-lo));
  border: 1px solid #000;
}
.editor-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}
.editor-bar input {
  height: 28px;
  padding: 0 8px;
  border-radius: 3px;
  font-family: 'VT323', monospace;
  font-size: 18px;
  color: var(--c-primary);
  background: var(--lcd-bg);
  border: 1px solid #000;
  outline: none;
}
.editor-bar .name {
  width: 220px;
}
.editor-bar .tags {
  width: 280px;
  color: var(--c-secondary);
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
