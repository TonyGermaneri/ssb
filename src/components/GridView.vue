<script setup lang="ts">
import { computed, effectScope, onBeforeUnmount, type ComputedRef } from 'vue'
import { activeVoices, audioDuration } from '../audio/engine'
import { useBoard } from '../stores/board'
import { midiNoteName, padHue } from '../lib/format'
import DataGrid from './DataGrid.vue'
import ControlPanel from './ControlPanel.vue'
import { TRIGGER_MODES, type Sound, type SoundSettings, type TriggerMode } from '../types'

const board = useBoard()

interface Row {
  [k: string]: unknown
  id: string
  grip: string
  fav: string
  play: string
  v1: string
  v2: string
  v3: string
  n: number
  key: string
  name: string
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
  // the selected patch's VCO slots: lit where this sound is, a click puts it in or takes it out
  { name: 'v1', title: '1', width: 30 },
  { name: 'v2', title: '2', width: 30 },
  { name: 'v3', title: '3', width: 30 },
  { name: 'n', title: '#', type: 'number', width: 44 },
  { name: 'key', title: 'KEY', width: 52 },
  { name: 'name', title: 'NAME', width: 170 },
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
    v1: '',
    v2: '',
    v3: '',
    n: 0,
    key: (board.keyFor.get(snd.id) ?? '').toUpperCase(),
    name: s.name,
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
</script>

<template>
  <!-- (stored as ssb-sounds since the grip and VCO columns: 'ssb-grid' remembered widths by column position) -->
  <DataGrid
    name="ssb-sounds"
    :schema="SCHEMA"
    :rows="rows"
    :editable="Object.keys(EDIT)"
    :playing="playing"
    :selected-id="board.master.selectedId"
    :noun="['clip', 'clips']"
    :accent="['key', 'midi']"
    :drag-type="SOUND_TYPE"
    :toggles="vcos"
    hint="▷ / double-click = play · drag ⠿ into a VCO slot · 1 2 3 = put in that VCO of the patch (again = take out) · select a row to edit it in the rack · ⇧ / ⌘-click to pick several, Delete to remove them · double-click an editable cell (name, tag, mode, rpt, vol, pan, pitch, speed, cutoff, choke) to type · click a column title to sort"
    @edit="onEdit"
    @play="onPlay"
    @select="board.select"
    @delete="board.removeSounds"
    @fav="(id: string) => board.toggleFav('sound', id)"
    @toggle="onToggle"
  >
    <!-- the rack shows the patch; with the list full width the selected sound is edited here -->
    <aside v-if="board.selected && !board.master.rack" class="side">
      <ControlPanel :key="board.selected.id" :sound="board.selected" :hue="padHue(board.selected.settings.tag, board.selected.settings.name, board.theme.padHues)" />
    </aside>
  </DataGrid>
</template>

<style scoped>
.side {
  flex: none;
  overflow-y: auto;
  scrollbar-width: thin;
}
</style>
