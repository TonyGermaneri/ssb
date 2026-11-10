<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import canvasDatagrid, { type CanvasDatagrid, type GridEvent } from 'canvas-datagrid'
import { useBoard } from '../stores/board'
import { gridStyle, rgba } from '../theme/gridStyle'
import { isAkwfAudioId, isTableAudioId, isWaveAudioId } from '../lib/akwf'
import { isSynthAudioId } from '../audio/synthWaves'
import { patchLayers, type Sound } from '../types'

/**
 * EXPORT: one list of every sound and patch on the board, to tick what goes into the .zip. A patch takes every sound
 * its slots use with it (counted below the list), and those sounds their samples; the .zip is a board IMPORT BOARD
 * reads. Click a row to tick it, ⇧-click to tick (or untick) a run; the filter and the TYPE chips narrow the list,
 * and ALL / NONE act on what's shown.
 */
const emit = defineEmits<{ close: [] }>()
const board = useBoard()

interface Row {
  id: string
  /** 's:' + sound id or 'p:' + patch id */
  key: string
  kind: 'SOUND' | 'PATCH'
  name: string
  tag: string
  about: string
  sel: string
  mine: boolean
}
const sourceOf = (s: Sound) =>
  s.zones?.length ? `SFZ · ${s.zones.length} zones` : isWaveAudioId(s.audioId) ? 'AKWF wave' : isTableAudioId(s.audioId) ? 'AKWF wavetable' : isSynthAudioId(s.audioId) ? 'generator' : `sample · ${s.fileName ?? ''}`
const rows: Row[] = (() => {
  const byId = new Map(board.sounds.map((s) => [s.id, s]))
  const out: Row[] = board.patches.map((p) => ({
    id: p.id,
    key: `p:${p.id}`,
    kind: 'PATCH',
    name: p.name,
    tag: p.tag ?? '',
    about: patchLayers(p)
      .map((l) => byId.get(l.soundId)?.settings.name ?? l.settings.name)
      .join(' · '),
    sel: '',
    mine: true,
  }))
  for (const s of board.sounds)
    out.push({
      id: s.id,
      key: `s:${s.id}`,
      kind: 'SOUND',
      name: s.settings.name,
      tag: s.settings.tag ?? '',
      about: sourceOf(s),
      sel: '',
      mine: !isAkwfAudioId(s.audioId) || !!s.zones?.length,
    })
  return out
})()

// ── what's ticked ──
const chosen = ref(new Set<string>())
const KINDS = [
  { id: 'all', label: 'ALL' },
  { id: 'patches', label: 'PATCHES' },
  { id: 'sounds', label: 'SOUNDS' },
  { id: 'mine', label: 'MY SAMPLES', title: 'Sounds that are samples or SFZ instruments (not the built-in AKWF wavetables)' },
] as const
const kind = ref<(typeof KINDS)[number]['id']>('all')
const filter = ref('')
const shown = computed(() => {
  const words = filter.value.toLowerCase().split(/\s+/).filter(Boolean)
  return rows.filter((r) => {
    if (kind.value === 'patches' && r.kind !== 'PATCH') return false
    if (kind.value === 'sounds' && r.kind !== 'SOUND') return false
    if (kind.value === 'mine' && (r.kind !== 'SOUND' || !r.mine)) return false
    const text = `${r.kind} ${r.name} ${r.tag} ${r.about}`.toLowerCase()
    return words.every((w) => text.includes(w))
  })
})
const ids = (prefix: 's:' | 'p:') => [...chosen.value].filter((k) => k.startsWith(prefix)).map((k) => k.slice(2))
const plan = computed(() => board.exportPlan(ids('s:'), ids('p:')))
const counts = computed(() => ({ sounds: ids('s:').length, patches: ids('p:').length }))
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

function setAll(on: boolean) {
  const next = new Set(chosen.value)
  for (const r of shown.value) on ? next.add(r.key) : next.delete(r.key)
  chosen.value = next
}

// ── the grid ──
const host = ref<HTMLDivElement>()
let grid: CanvasDatagrid | null = null
let anchor: string | null = null
function applyTheme() {
  if (!grid) return
  Object.assign(grid.style, gridStyle(board.theme), { width: '100%', height: '100%' })
  grid.draw()
}
onMounted(() => {
  const g = canvasDatagrid({
    parentNode: host.value!,
    name: 'ssb-export',
    schema: [
      { name: 'sel', title: '✓', width: 34 },
      { name: 'kind', title: 'TYPE', width: 72 },
      { name: 'name', title: 'NAME', width: 230 },
      { name: 'tag', title: 'TAG', width: 220 },
      { name: 'about', title: 'MADE OF', width: 384 },
      { name: 'id', hidden: true },
      { name: 'key', hidden: true },
      { name: 'mine', hidden: true },
    ],
    showNewRow: false,
    showRowHeaders: false,
    allowGroupingColumns: false,
    allowGroupingRows: false,
    allowFreezingColumns: false,
    editable: false,
    selectionMode: 'row',
  })
  grid = g
  applyTheme()
  g.data = shown.value
  document.fonts?.ready.then(() => grid?.draw())
  // a press on a row ticks it (⇧: the run from the last one pressed, to the same state); the grid's own selection
  // doesn't move -- the ticks are the selection. Column titles still sort.
  g.addEventListener('mousedown', (e: GridEvent) => {
    const row = e.cell?.data as Row | undefined
    if (!row || e.cell.isHeader || e.cell.isColumnHeader) return
    e.preventDefault()
    g.focus()
    const next = new Set(chosen.value)
    const on = !next.has(row.key)
    const view = g.viewData as Row[]
    const a = anchor ? view.findIndex((r) => r.key === anchor) : -1
    const b = view.findIndex((r) => r.key === row.key)
    if (e.NativeEvent?.shiftKey && a >= 0 && b >= 0) {
      const state = next.has(anchor!)
      for (let i = Math.min(a, b); i <= Math.max(a, b); i++) state ? next.add(view[i].key) : next.delete(view[i].key)
    } else {
      on ? next.add(row.key) : next.delete(row.key)
      anchor = row.key
    }
    chosen.value = next
  })
  g.addEventListener('formattext', (e: GridEvent) => {
    if (e.cell.header?.name === 'sel' && !e.cell.isHeader && !e.cell.isColumnHeader) e.cell.formattedValue = ''
  })
  // the tick box, and a tint on ticked rows
  g.addEventListener('afterrendercell', (e: GridEvent) => {
    const row = e.row as Row | undefined
    if (!row || e.cell.isHeader || e.cell.isColumnHeader) return
    const on = chosen.value.has(row.key)
    const { ctx, cell } = e
    const t = board.theme
    ctx.save()
    if (on) {
      ctx.fillStyle = rgba(t.primary, 0.1)
      ctx.fillRect(cell.x, cell.y, cell.width, cell.height)
    }
    if (cell.header?.name === 'sel') {
      const s = 14
      const x = Math.round(cell.x + (cell.width - s) / 2) + 0.5
      const y = Math.round(cell.y + (cell.height - s) / 2) + 0.5
      ctx.strokeStyle = on ? t.primary : t.text[3]
      ctx.lineWidth = 1.5
      ctx.strokeRect(x, y, s, s)
      if (on) {
        ctx.fillStyle = t.primary
        ctx.fillRect(x + 3, y + 3, s - 6, s - 6)
      }
    }
    ctx.restore()
  })
  // canvas-datagrid wheel-scrolls once focused: scroll it ourselves until then
  host.value!.addEventListener(
    'wheel',
    (e) => {
      if (g.hasFocus) return
      g.scrollTop += e.deltaY * (e.deltaMode === 1 ? 17 : 1)
      e.preventDefault()
    },
    { passive: false, capture: true },
  )
})
onBeforeUnmount(() => {
  grid?.dispose?.()
  grid = null
})
watch(shown, (list) => grid && (grid.data = list))
watch(chosen, () => grid?.draw())
watch(() => board.theme, applyTheme)

// ── export ──
const busy = ref(false)
const missing = ref<string[]>([])
async function run(everything: boolean) {
  busy.value = true
  missing.value = []
  try {
    const r = everything ? await board.exportBoard() : await board.exportSelection(ids('s:'), ids('p:'))
    if (r.missing.length) missing.value = r.missing
    else {
      board.toast = everything ? 'Exported the whole board' : `Exported ${summary.value}`
      emit('close')
    }
  } catch (e) {
    board.toast = `Export failed: ${(e as Error).message}`
  } finally {
    busy.value = false
  }
}
const summary = computed(() => {
  const parts = []
  if (counts.value.patches) parts.push(plural(counts.value.patches, 'patch', 'patches'))
  if (counts.value.sounds) parts.push(plural(counts.value.sounds, 'sound'))
  return parts.join(' and ') || 'nothing ticked'
})
const nothing = computed(() => !counts.value.sounds && !counts.value.patches)
</script>

<template>
  <div class="export" @keydown.stop>
    <header>
      <h3><v-icon icon="mdi-download" size="18" /> EXPORT</h3>
      <span class="sub">Tick what goes into the .zip — a board IMPORT BOARD reads</span>
      <v-spacer />
      <button class="hw-btn icon" title="Close" @click="emit('close')"><v-icon size="16" icon="mdi-close" /></button>
    </header>
    <div class="bar">
      <div class="kinds">
        <button v-for="k in KINDS" :key="k.id" class="chip" :class="{ on: kind === k.id }" :title="'title' in k ? k.title : undefined" @click="kind = k.id">
          {{ k.label }}
        </button>
      </div>
      <input v-model="filter" class="filter" placeholder="filter: name, tag, type…" spellcheck="false" />
      <button class="hw-btn" :title="`Tick the ${shown.length} rows shown`" @click="setAll(true)">ALL</button>
      <button class="hw-btn" :title="`Untick the ${shown.length} rows shown`" @click="setAll(false)">NONE</button>
    </div>
    <div ref="host" class="grid-host" />
    <footer>
      <div class="plan">
        <b>{{ summary }}</b>
        <span v-if="plan.extra" class="extra">+{{ plural(plan.extra, 'sound') }} the patches use</span>
        <span class="dim">· {{ plural(plan.audio.length, 'sample') }} to pack (AKWF wavetables and generators travel by name)</span>
        <div v-if="missing.length" class="missing">
          <v-icon icon="mdi-alert" size="14" /> Exported, but no audio could be found for {{ plural(missing.length, 'sound') }} — an import
          drops them: {{ missing.slice(0, 6).join(', ') }}{{ missing.length > 6 ? `, and ${missing.length - 6} more` : '' }}
        </div>
      </div>
      <button class="hw-btn" :disabled="busy" title="Every sound and patch on the board" @click="run(true)">EVERYTHING</button>
      <button class="hw-btn primary" :disabled="busy || nothing" @click="run(false)">
        {{ busy ? 'EXPORTING…' : nothing ? 'EXPORT' : `EXPORT ${summary.toUpperCase()}` }}
      </button>
    </footer>
  </div>
</template>

<style scoped>
.export {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 8px;
  background: linear-gradient(180deg, var(--panel-hi), var(--panel-lo));
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.6);
  color: var(--text);
}
header {
  display: flex;
  align-items: center;
  gap: 10px;
}
h3 {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0;
  font-family: 'Orbitron', sans-serif;
  font-size: 13px;
  letter-spacing: 0.15em;
  color: var(--text-head);
}
.sub,
.dim {
  font-size: 12px;
  color: var(--text-mute);
}
.bar {
  display: flex;
  align-items: center;
  gap: 6px;
}
.kinds {
  display: flex;
  gap: 3px;
}
.chip {
  padding: 1px 7px;
  border-radius: 3px;
  font-family: 'VT323', monospace;
  font-size: 15px;
  color: var(--ink-dim);
  background: #111;
  border: 1px solid #000;
}
.chip.on {
  color: var(--c-secondary);
}
.filter {
  flex: 1;
  min-width: 0;
  padding: 3px 8px;
  border-radius: 4px;
  font-family: 'VT323', monospace;
  font-size: 17px;
  color: var(--c-primary);
  background: var(--lcd-bg);
  border: 1px solid #000;
  outline: none;
}
.grid-host {
  position: relative;
  height: min(56vh, 460px);
  border-radius: 4px;
  overflow: hidden;
  background: var(--panel-lo);
  border: 1px solid #000;
}
footer {
  display: flex;
  align-items: center;
  gap: 8px;
}
.plan {
  flex: 1;
  min-width: 0;
  font-size: 13px;
}
.plan b {
  color: var(--c-primary);
  font-weight: normal;
  font-family: 'VT323', monospace;
  font-size: 17px;
}
.extra,
.plan .dim {
  margin-left: 6px;
}
.extra {
  color: var(--c-secondary);
}
.missing {
  margin-top: 4px;
  color: var(--c-danger);
}
.hw-btn.primary {
  color: var(--c-primary);
}
</style>
