<script setup lang="ts">
import { computed } from 'vue'
import { activeVoices } from '../audio/engine'
import { useBoard } from '../stores/board'
import { fmtSec, midiNoteName } from '../lib/format'
import DataGrid, { type GridRow } from './DataGrid.vue'
import { carrierSlot } from '../types'

/** Patch catalog as a spreadsheet. */
const board = useBoard()

const SCHEMA = [
  { name: 'id', hidden: true },
  { name: 'fav', title: '♥', width: 34 },
  { name: 'play', title: '▶', width: 38 },
  { name: 'n', title: '#', type: 'number', width: 44 },
  { name: 'name', title: 'NAME', width: 180 },
  { name: 'tag', title: 'TAGS', width: 200 },
  { name: 'vco1', title: 'VCO 1', width: 150 },
  { name: 'vco2', title: 'VCO 2', width: 150 },
  { name: 'vco3', title: 'VCO 3', width: 150 },
  { name: 'root', title: 'ROOT', width: 60 },
  { name: 'voice', title: 'VOICE', width: 70 },
  { name: 'glide', title: 'GLIDE', width: 70 },
  { name: 'bpm', title: 'BPM', type: 'number', width: 60 },
  { name: 'fx', title: 'FX', width: 150 },
  { name: 'mod', title: 'MOD', type: 'number', width: 60 },
]

const playing = computed(() => {
  const out = new Set<string>()
  for (const v of activeVoices.value) {
    const p = board.patchIdOfLayer(v.soundId) ?? board.patchIdOfLayer(v.voice.groupId ?? '')
    if (p) out.add(p)
  }
  return out
})

const rows = computed<GridRow[]>(() =>
  board.visiblePatches.map((p, i) => {
    const main = carrierSlot(p)?.layer
    const soundName = (id: string) => board.byId(id)?.settings.name ?? '(missing)'
    const slotName = (i: number) => {
      const x = p.slots[i]
      return x ? `${soundName(x.layer.soundId)}${i > 0 && !x.audible ? ' (mod)' : ''}` : ''
    }
    const h = p.header
    const fx = [h.fx.chorusMix && 'CHO', h.fx.delayMix && 'DLY', h.fx.reverbMix && 'REV'].filter(Boolean).join(' ') || '—'
    return {
      id: p.id,
      fav: p.fav ? '♥' : '♡',
      play: playing.value.has(p.id) ? '◉' : '▷',
      n: i + 1,
      name: p.name,
      tag: p.tag,
      vco1: slotName(0),
      vco2: slotName(1),
      vco3: slotName(2),
      root: main ? midiNoteName(main.settings.rootNote) : '',
      voice: `${h.mono ? 'MONO' : 'POLY'}${h.mpe ? '+MPE' : ''}`,
      glide: fmtSec(h.glide),
      bpm: h.bpm,
      fx,
      mod: h.mod.routes.length + (main?.settings.mod.routes.length ?? 0),
    }
  }),
)

function onEdit(id: string, column: string, value: string) {
  const p = board.patches.find((x) => x.id === id)
  if (!p) return
  if (column === 'name' && value.trim()) p.name = value.trim()
  if (column === 'tag') p.tag = value
}
function onPlay(id: string) {
  board.pressPatch(id)
  setTimeout(() => board.releasePatch(id), 150)
}
</script>

<template>
  <DataGrid
    name="ssb-patch-grid"
    :schema="SCHEMA"
    :rows="rows"
    :editable="['name', 'tag']"
    :playing="playing"
    :selected-id="board.master.patchId"
    :accent="['root', 'vco1']"
    hint="▷ / double-click = audition · click a row to select the patch (its layers open in the rack) · double-click name or tags to edit · click a column title to sort"
    @edit="onEdit"
    @play="onPlay"
    @select="board.selectPatch"
    @fav="(id: string) => board.toggleFav('patch', id)"
  />
</template>
