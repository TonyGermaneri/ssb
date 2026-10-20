<script setup lang="ts">
import { computed } from 'vue'
import { activeVoices } from '../audio/engine'
import { useBoard } from '../stores/board'
import { fmtSec, midiNoteName, padHue } from '../lib/format'
import { hueColor, paintScore, paintWave, type Box } from '../lib/gridPaint'
import DataGrid, { type GridRow } from './DataGrid.vue'
import { carrierSlot, type Patch, type Sound } from '../types'

/** Patch catalog as a spreadsheet: a row click loads the patch, ☰ shows it in the rack (where patches are edited). */
const board = useBoard()

const SCHEMA = [
  { name: 'id', hidden: true },
  { name: 'fav', title: '♥', width: 34 },
  { name: 'play', title: '▶', width: 38 },
  { name: 'menu', title: '☰', width: 34 }, // edit in the rack, drawn by DataGrid
  { name: 'like', title: '≈', width: 30 }, // order the list by likeness to this patch
  { name: 'n', title: '#', type: 'number', width: 44 },
  { name: 'sim', title: 'SIM', width: 54 }, // painted: how like the ≈ patch, or the description, it is
  { name: 'name', title: 'NAME', width: 180 },
  { name: 'vcos', title: 'VCOS', width: 150 }, // painted: each slot's waveform
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
  board.shownPatches.map((p, i) => {
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
      play: '▷', // ◉ while it plays: DataGrid draws it from `playing`
      menu: '',
      like: '',
      n: i + 1,
      sim: '',
      name: p.name,
      vcos: '',
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
/** load it first, so it plays with its own header (volume, glide, mono, effects) */
// ── what the cards show, painted ──
const hueOf = (s: Sound) => padHue(s.settings.tag, s.settings.name, board.theme.padHues)
const patchOf = (id: string) => board.patches.find((p) => p.id === id)
const painters = {
  /** the three slots side by side: each sound's waveform in its colour, a mod-only one dim, an empty one a line */
  vcos: (ctx: CanvasRenderingContext2D, box: Box, row: GridRow) => {
    const p = patchOf(row.id)
    if (!p) return
    const w = (box.width - 8) / 3
    p.slots.forEach((x, i) => {
      const snd = x ? board.layerSound(x.layer) : undefined
      const b = { x: box.x + i * (w + 4), y: box.y, width: w, height: box.height }
      paintWave(ctx, snd && board.peaksOf(snd.audioId), b, snd ? hueColor(hueOf(snd), 58, x!.audible || i === 0 ? 0.85 : 0.35) : 'rgba(255, 255, 255, 0.15)')
    })
  },
  sim: (ctx: CanvasRenderingContext2D, box: Box, row: GridRow) => paintScore(ctx, box, board.patchScores?.get(row.id), board.theme),
}
const buttons = computed(() => {
  const to = board.similarTo.patches
  return {
    menu: { icon: 'menu' as const, title: 'Edit in the rack', lit: new Set(board.master.rack && board.master.patchId ? [board.master.patchId] : []) },
    like: { icon: 'similar' as const, title: 'Order by likeness to this patch', lit: new Set(to?.kind === 'item' ? [to.id] : []) },
  }
})
function onButton(id: string, column: string) {
  if (column === 'menu') board.editPatch(id)
  else if (column === 'like') {
    const to = board.similarTo.patches
    if (to?.kind === 'item' && to.id === id) board.clearSimilar()
    else board.showSimilar(id)
  }
}
/** behind the rows: the selected patch's main VCO */
const backdrop = computed(() => {
  const p: Patch | null = board.selectedPatch
  const c = p && carrierSlot(p)
  const snd = c ? board.layerSound(c.layer) : undefined
  return snd ? { peaks: board.peaksOf(snd.audioId), hue: hueOf(snd) } : null
})

function onPlay(id: string) {
  if (board.master.patchId !== id) board.selectPatch(id)
  board.pressPatch(id)
  setTimeout(() => board.releasePatch(id), 150)
}
</script>

<template>
  <!-- (stored as ssb-patch-grid-2 since the ☰ and VCOS columns: the grid remembers widths by column position) -->
  <DataGrid
    name="ssb-patch-grid-2"
    :schema="SCHEMA"
    :rows="rows"
    :editable="['name', 'tag']"
    :playing="playing"
    :selected-id="board.master.patchId"
    :noun="['patch', 'patches']"
    :accent="['root', 'vco1']"
    :buttons="buttons"
    :painters="painters"
    :backdrop="backdrop"
    :order="board.similarTo.patches"
    hint="▷ / double-click = load and play · click a row to load the patch · ☰ = edit it in the rack · ≈ = order by likeness to that patch · ⇧ / ⌘-click to pick several, Delete to remove them · double-click name or tags to edit · click a column title to sort"
    @edit="onEdit"
    @play="onPlay"
    @select="board.selectPatch"
    @delete="board.removePatches"
    @fav="(id: string) => board.toggleFav('patch', id)"
    @button="onButton"
  />
</template>
