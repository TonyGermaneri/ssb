<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import canvasDatagrid, { type CanvasDatagrid } from 'canvas-datagrid'
import { activeVoices, buffers } from '../audio/engine'
import { useBoard } from '../stores/board'
import { midiNoteName, padHue } from '../lib/format'
import { gridStyle, mix } from '../theme/gridStyle'
import { TRIGGER_MODES, type SoundSettings, type TriggerMode } from '../types'
import ControlPanel from './ControlPanel.vue'

const board = useBoard()
const host = ref<HTMLDivElement>()
let grid: CanvasDatagrid | null = null

interface Row {
  id: string
  play: string
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

const SCHEMA = [
  { name: 'id', hidden: true },
  { name: 'play', title: '▶', width: 38 },
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

const rows = computed<Row[]>(() =>
  board.visible.map((snd, i) => {
    const s = snd.settings
    const note = board.noteFor.get(snd.id)
    const dur = buffers.get(snd.audioId)?.duration ?? 0
    return {
      id: snd.id,
      play: playing.value.has(snd.id) ? '◉' : '▷',
      n: i + 1,
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
  }),
)

/** Push rows into the grid: in place when the row set is unchanged (keeps sort, scroll, selection). */
function sync(next: Row[]) {
  if (!grid) return
  const cur = grid.data as Row[] | undefined
  if (cur && cur.length === next.length && cur.every((r) => next.some((n) => n.id === r.id))) {
    const byId = new Map(next.map((r) => [r.id, r]))
    for (const r of cur) Object.assign(r, byId.get(r.id))
    grid.draw()
  } else grid.data = next.map((r) => ({ ...r }))
}

function applyTheme() {
  if (!grid) return
  // fill the host (default 'auto' grows the grid to fit every row, so it never scrolls)
  Object.assign(grid.style, gridStyle(board.theme), { height: '100%', width: '100%' })
  grid.draw()
}

const selected = computed(() => board.selected)
const hue = computed(() =>
  selected.value ? padHue(selected.value.settings.tag, selected.value.settings.name, board.theme.padHues) : 0,
)

onMounted(() => {
  grid = canvasDatagrid({
    parentNode: host.value!,
    name: 'ssb-grid', // remembers column widths
    schema: SCHEMA,
    showNewRow: false,
    showRowHeaders: false,
    allowGroupingColumns: false,
    allowGroupingRows: false,
    allowFreezingColumns: false,
    selectionMode: 'row',
    editable: true,
  })
  applyTheme()
  sync(rows.value)
  // re-draw once the LED / label fonts are ready
  document.fonts?.ready.then(() => grid?.draw())

  const g = grid
  // canvas-datagrid only wheel-scrolls once it has keyboard focus; scroll it ourselves until then
  // (focusing it on hover would steal the pad shortcut keys)
  host.value!.addEventListener(
    'wheel',
    (e) => {
      if (g.hasFocus) return
      const line = e.deltaMode === 1 ? 17 : 1
      g.scrollTop += e.deltaY * line
      g.scrollLeft += e.deltaX * line
      e.preventDefault()
    },
    { passive: false, capture: true },
  )
  const idOf = (cell: { data?: Row } | undefined) => cell?.data?.id
  g.addEventListener('beforebeginedit', (e) => {
    if (!EDIT[e.cell?.header?.name ?? '']) e.preventDefault()
  })
  g.addEventListener('endedit', (e) => {
    const id = idOf(e.cell)
    const s = id && board.byId(id)?.settings
    if (!s || e.abort) return
    EDIT[e.cell.header?.name ?? '']?.(s, String(e.value ?? ''))
    sync(rows.value) // normalise what was typed
  })
  // clicking a row selects that patch; the ▷ column also plays it
  g.addEventListener('click', (e) => {
    const id = idOf(e.cell)
    if (!id || e.cell.isHeader) return
    if (id !== board.master.selectedId) board.select(id)
    if (e.cell.header?.name !== 'play') return
    board.press(id)
    setTimeout(() => board.release(id), 150)
  })
  // double-click a read-only cell to play too
  g.addEventListener('dblclick', (e) => {
    const id = idOf(e.cell)
    if (!id || e.cell.isHeader || EDIT[e.cell.header?.name ?? '']) return
    board.press(id)
    setTimeout(() => board.release(id), 150)
  })
  // keyboard selection too. Hidden columns (id) are left out of selectedData, so map the row's # back to the pad.
  g.addEventListener('selectionchanged', (e) => {
    const row = e.selectedData?.find((r: Partial<Row> | null) => r?.n) as Partial<Row> | undefined
    const id = row?.n ? board.visible[row.n - 1]?.id : undefined
    if (id && id !== board.master.selectedId) board.select(id)
  })
  // playing rows light up; the selected patch gets a tint
  g.addEventListener('rendercell', (e) => {
    const row = e.row as Row | undefined
    if (!row || e.cell.isHeader || e.cell.isColumnHeader) return
    const t = board.theme
    if (playing.value.has(row.id)) e.ctx.fillStyle = mix(t.panel[2], t.primary, e.cell.selected ? 0.45 : 0.32)
    else if (row.id === board.master.selectedId && !e.cell.selected) e.ctx.fillStyle = mix(t.panel[2], t.secondary, 0.1)
  })
  g.addEventListener('rendertext', (e) => {
    const row = e.row as Row | undefined
    if (!row || e.cell.isHeader) return
    const name = e.cell.header?.name
    if (name === 'play') e.ctx.fillStyle = playing.value.has(row.id) ? board.theme.danger : board.theme.text[3]
    else if (name === 'key' || name === 'midi') e.ctx.fillStyle = board.theme.primary
    else if (playing.value.has(row.id)) e.ctx.fillStyle = board.theme.text[1]
  })
})

watch(rows, sync, { deep: true })
watch(() => board.theme, applyTheme)
watch(() => board.master.selectedId, () => grid?.draw())

onBeforeUnmount(() => {
  grid?.dispose?.()
  grid = null
})
</script>

<template>
  <div class="grid-mode">
    <div class="grid-shell">
      <div ref="host" class="grid-host" />
      <p class="hint">
        ▷ / double-click = play · select a row to edit it on the right · double-click an editable cell (name, tag,
        mode, rpt, vol, pan, pitch, speed, cutoff, choke) to type · click a column title to sort
      </p>
    </div>
    <aside v-if="selected" class="side">
      <ControlPanel :key="selected.id" :sound="selected" :hue="hue" />
    </aside>
  </div>
</template>

<style scoped>
.grid-mode {
  display: flex;
  gap: 12px;
  padding: 12px;
  /* --strip-h is the header's live height (it wraps on narrow windows) */
  height: calc(100vh - var(--strip-h, 90px) - 2px);
  min-height: 360px;
}
.grid-shell {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.grid-host {
  flex: 1;
  min-height: 0;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid #000;
  box-shadow:
    0 8px 20px rgba(0, 0, 0, 0.5),
    inset 0 0 0 1px rgba(255, 255, 255, 0.06);
}
.hint {
  margin: 0;
  font-family: 'VT323', monospace;
  font-size: 14px;
  letter-spacing: 0.06em;
  color: var(--text-faint);
  text-transform: uppercase;
}
.side {
  flex: none;
  overflow-y: auto;
  padding-right: 2px;
}
</style>
