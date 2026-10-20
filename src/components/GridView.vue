<script setup lang="ts">
import { computed, effectScope, onBeforeUnmount, type ComputedRef } from 'vue'
import { activeVoices, audioDuration, clock } from '../audio/engine'
import { useBoard } from '../stores/board'
import { midiNoteName, padHue } from '../lib/format'
import { hueColor, paintWave, type Box } from '../lib/gridPaint'
import DataGrid, { type GridRow } from './DataGrid.vue'
import ControlPanel from './ControlPanel.vue'
import { TRIGGER_MODES, type Sound, type SoundSettings, type TriggerMode } from '../types'

const board = useBoard()

interface Row {
  [k: string]: unknown
  id: string
  grip: string
  fav: string
  play: string
  menu: string
  v1: string
  v2: string
  v3: string
  n: number
  key: string
  name: string
  wave: string
  tag: string
  file: string
  length: string
  mode: string
  repeat: string
  volume: number
  pan: number
  pitch: number
  speed: number
  cutoff: number
  choke: number
  midi: string
  mod: number
}

/** a row dragged by its grip carries the sound as the pads do: the rack's slots (and the header's VCOs) take it */
const SOUND_TYPE = 'application/x-ssb-sound'

const SCHEMA = [
  { name: 'id', hidden: true },
  { name: 'grip', title: ' ', width: 26 }, // ⠿, drawn by DataGrid (a blank title would show the name)
  { name: 'fav', title: '♥', width: 34 },
  { name: 'play', title: '▶', width: 38 },
  { name: 'menu', title: '☰', width: 34 }, // the sound's control panel, drawn by DataGrid
  // the selected patch's VCO slots: lit where this sound is, a click puts it in or takes it out
  { name: 'v1', title: '1', width: 30 },
  { name: 'v2', title: '2', width: 30 },
  { name: 'v3', title: '3', width: 30 },
  { name: 'n', title: '#', type: 'number', width: 44 },
  { name: 'key', title: 'KEY', width: 52 },
  { name: 'name', title: 'NAME', width: 170 },
  { name: 'wave', title: 'WAVE', width: 120 }, // painted: the sound's waveform, and its playhead while it plays
  { name: 'tag', title: 'TAG', width: 110 },
  { name: 'file', title: 'FILE', width: 170 },
  { name: 'length', title: 'LEN', width: 70 },
  { name: 'mode', title: 'MODE', width: 90 },
  { name: 'repeat', title: 'RPT', width: 60 },
  { name: 'volume', title: 'VOL %', type: 'number', width: 70 },
  { name: 'pan', title: 'PAN', type: 'number', width: 60 },
  { name: 'pitch', title: 'PITCH', type: 'number', width: 70 },
  { name: 'speed', title: 'SPEED', type: 'number', width: 70 },
  { name: 'cutoff', title: 'CUTOFF', type: 'number', width: 84 },
  { name: 'choke', title: 'CHOKE', type: 'number', width: 70 },
  { name: 'midi', title: 'MIDI', width: 60 },
  { name: 'mod', title: 'MOD', type: 'number', width: 60 },
]

/** Editable columns → how a typed value lands in the pad's settings. */
const num = (v: string, lo: number, hi: number) => {
  const n = parseFloat(v)
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : null
}
const EDIT: Record<string, (s: SoundSettings, v: string) => void> = {
  name: (s, v) => v.trim() && (s.name = v.trim()),
  tag: (s, v) => (s.tag = v.trim()),
  mode: (s, v) => {
    const m = v.trim().toLowerCase() as TriggerMode
    if (TRIGGER_MODES.includes(m)) s.mode = m
  },
  repeat: (s, v) => {
    const n = v.trim() === '∞' ? 0 : num(v, 0, 16)
    if (n !== null) s.repeat = Math.round(n)
  },
  volume: (s, v) => {
    const n = num(v, 0, 150)
    if (n !== null) s.volume = n / 100
  },
  pan: (s, v) => {
    const n = num(v, -100, 100)
    if (n !== null) s.pan = n / 100
  },
  pitch: (s, v) => {
    const n = num(v, -24, 24)
    if (n !== null) s.pitch = Math.round(n)
  },
  speed: (s, v) => {
    const n = num(v, 0.25, 4)
    if (n !== null) s.speed = n
  },
  cutoff: (s, v) => {
    const n = num(v, 20, 20000)
    if (n !== null) s.cutoff = n
  },
  choke: (s, v) => {
    const n = num(v, 0, 8)
    if (n !== null) s.choke = Math.round(n)
  },
}

const playing = computed(() => new Set(activeVoices.value.map((v) => v.soundId)))
/** the sound in each VCO slot of the selected patch, as DataGrid's toggles: like ◉, drawn without touching the rows */
const vcos = computed(() => {
  const slots = board.selectedPatch?.slots ?? []
  return Object.fromEntries([0, 1, 2].map((i) => [`v${i + 1}`, new Set(slots[i] ? [slots[i]!.layer.soundId] : [])]))
})

/**
 * Each sound's row, kept until something it shows changes: with every AKWF wave a board has thousands of rows, and a
 * knob turned on one sound should rebuild that one (DataGrid copies only the rows that are new objects). # is set as
 * the rows are listed; ◉ for a playing row is drawn by DataGrid from `playing`, so voices don't touch the rows.
 */
const scope = effectScope()
onBeforeUnmount(() => scope.stop())
const rowCache = new WeakMap<Sound, ComputedRef<Row>>()
function rowOf(snd: Sound): Row {
  let c = rowCache.get(snd)
  if (!c) rowCache.set(snd, (c = scope.run(() => computed(() => makeRow(snd)))!))
  return c.value
}
const rows = computed<Row[]>(() =>
  board.visible.map((snd, i) => {
    const r = rowOf(snd)
    r.n = i + 1
    return r
  }),
)

function makeRow(snd: Sound): Row {
  const s = snd.settings
  const note = board.noteFor.get(snd.id)
  const dur = audioDuration(snd.audioId)
  return {
    id: snd.id,
    grip: '',
    fav: snd.fav ? '♥' : '♡',
    play: '▷',
    menu: '',
    v1: '',
    v2: '',
    v3: '',
    n: 0,
    key: (board.keyFor.get(snd.id) ?? '').toUpperCase(),
    name: s.name,
    wave: '',
    tag: s.tag,
    file: snd.zones?.length ? `${snd.fileName} · ${snd.zones.length} zones` : snd.fileName,
    length: `${dur.toFixed(2)}s`,
    mode: s.mode.toUpperCase(),
    repeat: s.repeat === 0 ? '∞' : String(s.repeat),
    volume: Math.round(s.volume * 100),
    pan: Math.round(s.pan * 100),
    pitch: s.pitch,
    speed: Math.round(s.speed * 100) / 100,
    cutoff: Math.round(s.cutoff),
    choke: s.choke,
    midi: note === undefined ? '' : midiNoteName(note),
    mod: s.mod.routes.length,
  }
}

function onEdit(id: string, column: string, value: string) {
  const s = board.byId(id)?.settings
  if (s) EDIT[column]?.(s, value)
}
function onPlay(id: string) {
  board.press(id)
  setTimeout(() => board.release(id), 150)
}
/** 1 / 2 / 3: this sound into that VCO slot of the selected patch, or out of it if it's there (as on a pad) */
const onToggle = (id: string, column: string) => board.toggleSlot(Number(column.slice(1)) - 1, id)

// ── what the cards show, painted ──
const hueOf = (snd: Sound) => padHue(snd.settings.tag, snd.settings.name, board.theme.padHues)
/** 0..1 through the newest voice's play (finite repeats) or its current loop cycle, as the pads' progress bars */
function progressOf(id: string): number {
  const v = activeVoices.value.filter((x) => x.soundId === id).at(-1)?.voice
  if (!v) return -1
  const elapsed = clock.value - v.t0
  if (Number.isFinite(v.endTime)) return Math.min(1, Math.max(0, elapsed / (v.endTime - v.t0)))
  return v.cycle > 0 ? (((elapsed % v.cycle) + v.cycle) % v.cycle) / v.cycle : -1
}
const painters = {
  wave: (ctx: CanvasRenderingContext2D, box: Box, row: GridRow) => {
    const snd = board.byId(row.id)
    if (!snd) return
    const on = playing.value.has(row.id)
    paintWave(ctx, board.peaksOf(snd.audioId), box, hueColor(hueOf(snd), on ? 66 : 58, on ? 1 : 0.8), on ? progressOf(row.id) : -1)
  },
}
/** ☰: the control panel beside (or under) the grid shows the selected sound; ☰ on its row again puts it away */
const panelShown = computed(() => board.master.gridPanel && !!board.selected)
const buttons = computed(() => ({
  menu: { icon: 'menu' as const, title: 'Controls', lit: new Set(panelShown.value && board.selected ? [board.selected.id] : []) },
}))
function onButton(id: string, column: string) {
  if (column !== 'menu') return
  if (panelShown.value && board.master.selectedId === id) board.master.gridPanel = false
  else {
    board.select(id)
    board.master.gridPanel = true
  }
}
/** behind the rows: the selected sound's waveform */
const backdrop = computed(() => (board.selected ? { peaks: board.peaksOf(board.selected.audioId), hue: hueOf(board.selected) } : null))
</script>

<template>
  <!-- (stored as ssb-sounds-2 since the ☰ and WAVE columns: the grid remembers widths by column position) -->
  <DataGrid
    name="ssb-sounds-2"
    :schema="SCHEMA"
    :rows="rows"
    :editable="Object.keys(EDIT)"
    :playing="playing"
    :selected-id="board.master.selectedId"
    :noun="['clip', 'clips']"
    :accent="['key', 'midi']"
    :drag-type="SOUND_TYPE"
    :toggles="vcos"
    :buttons="buttons"
    :painters="painters"
    :animate="playing.size > 0"
    :backdrop="backdrop"
    reorder
    hint="▷ / double-click = play · ☰ = controls · drag ⠿ into a VCO slot, or onto a row to move it there (unsorted) · 1 2 3 = put in that VCO of the patch (again = take out) · ⇧ / ⌘-click to pick several, Delete to remove them · double-click an editable cell (name, tag, mode, rpt, vol, pan, pitch, speed, cutoff, choke) to type · click a column title to sort"
    @edit="onEdit"
    @play="onPlay"
    @select="board.select"
    @delete="board.removeSounds"
    @fav="(id: string) => board.toggleFav('sound', id)"
    @toggle="onToggle"
    @button="onButton"
    @move="board.move"
  >
    <template #default="{ narrow }">
      <!-- the selected sound's panel: beside a wide grid, under a narrow one -->
      <aside v-if="panelShown && board.selected" class="side" :class="{ under: narrow }">
        <ControlPanel :key="board.selected.id" :sound="board.selected" :hue="hueOf(board.selected)" :wide="narrow" />
      </aside>
    </template>
  </DataGrid>
</template>

<style scoped>
.side {
  flex: none;
  overflow-y: auto;
  scrollbar-width: thin;
}
.side.under {
  max-height: 52%;
}
</style>
