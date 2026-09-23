<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import canvasDatagrid, { type CanvasDatagrid } from 'canvas-datagrid'
import { useBoard } from '../stores/board'
import { gridStyle, mix } from '../theme/gridStyle'

/**
 * Themed canvas-datagrid for a catalog (sounds or patches). Rows need a hidden \`id\` and a 1-based \`n\` (the row's
 * place in \`rows\`, used to map keyboard selection back, since hidden columns aren't in selectedData).
 */
export interface GridRow {
  id: string
  n: number
  [k: string]: unknown
}

const props = defineProps<{
  schema: { name: string; title?: string; type?: string; width?: number; hidden?: boolean }[]
  rows: GridRow[]
  /** column names the user may type into */
  editable: string[]
  /** localStorage key for column widths */
  name: string
  playing: Set<string>
  selectedId: string | null
  /** columns drawn in the theme's LED colour */
  accent?: string[]
  hint: string
}>()
const emit = defineEmits<{
  edit: [id: string, column: string, value: string]
  play: [id: string]
  select: [id: string]
  fav: [id: string]
}>()

const board = useBoard()
const host = ref<HTMLDivElement>()
let grid: CanvasDatagrid | null = null

/** Push rows in place when the row set is unchanged (keeps sort, scroll and selection). */
function sync(next: GridRow[]) {
  if (!grid) return
  const cur = grid.data as GridRow[] | undefined
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

onMounted(() => {
  const g = canvasDatagrid({
    parentNode: host.value!,
    name: props.name,
    schema: props.schema,
    showNewRow: false,
    showRowHeaders: false,
    allowGroupingColumns: false,
    allowGroupingRows: false,
    allowFreezingColumns: false,
    selectionMode: 'row',
    editable: true,
  })
  grid = g
  applyTheme()
  sync(props.rows)
  document.fonts?.ready.then(() => grid?.draw())

  // canvas-datagrid only wheel-scrolls once focused; scroll it ourselves until then (focus would steal pad keys)
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
  const idOf = (cell: { data?: GridRow } | undefined) => cell?.data?.id
  const col = (e: { cell: { header?: { name: string } } }) => e.cell.header?.name ?? ''
  g.addEventListener('beforebeginedit', (e) => {
    if (!props.editable.includes(col(e))) e.preventDefault()
  })
  g.addEventListener('endedit', (e) => {
    const id = idOf(e.cell)
    if (!id || e.abort) return
    emit('edit', id, col(e), String(e.value ?? ''))
    sync(props.rows)
  })
  // clicking a row selects it; the ▷ column also plays it
  g.addEventListener('click', (e) => {
    const id = idOf(e.cell)
    if (!id || e.cell.isHeader) return
    if (col(e) === 'fav') return emit('fav', id) // ♥ column toggles without selecting
    if (id !== props.selectedId) emit('select', id)
    if (col(e) === 'play') emit('play', id)
  })
  // double-click a read-only cell to play too
  g.addEventListener('dblclick', (e) => {
    const id = idOf(e.cell)
    if (id && !e.cell.isHeader && !props.editable.includes(col(e))) emit('play', id)
  })
  g.addEventListener('selectionchanged', (e) => {
    const row = e.selectedData?.find((r: Partial<GridRow> | null) => r?.n) as Partial<GridRow> | undefined
    const id = row?.n ? props.rows[row.n - 1]?.id : undefined
    if (id && id !== props.selectedId) emit('select', id)
  })
  // playing rows light up; the selected row gets a tint
  g.addEventListener('rendercell', (e) => {
    const row = e.row as GridRow | undefined
    if (!row || e.cell.isHeader || e.cell.isColumnHeader) return
    const t = board.theme
    if (props.playing.has(row.id)) e.ctx.fillStyle = mix(t.panel[2], t.primary, e.cell.selected ? 0.45 : 0.32)
    else if (row.id === props.selectedId && !e.cell.selected) e.ctx.fillStyle = mix(t.panel[2], t.secondary, 0.1)
  })
  g.addEventListener('rendertext', (e) => {
    const row = e.row as GridRow | undefined
    if (!row || e.cell.isHeader) return
    const name = e.cell.header?.name ?? ''
    if (name === 'play') e.ctx.fillStyle = props.playing.has(row.id) ? board.theme.danger : board.theme.text[3]
    else if (name === 'fav') e.ctx.fillStyle = row.fav === '♥' ? '#ff3d6e' : board.theme.text[4]
    else if (props.accent?.includes(name)) e.ctx.fillStyle = board.theme.primary
    else if (props.playing.has(row.id)) e.ctx.fillStyle = board.theme.text[1]
  })
})

watch(() => props.rows, sync, { deep: true })
watch(() => board.theme, applyTheme)
watch(
  () => [props.selectedId, props.playing],
  () => grid?.draw(),
)

onBeforeUnmount(() => {
  grid?.dispose?.()
  grid = null
})
</script>

<template>
  <div class="grid-mode">
    <div class="grid-shell">
      <div ref="host" class="grid-host" />
      <p class="hint">{{ hint }}</p>
    </div>
    <slot />
  </div>
</template>

<style scoped>
.grid-mode {
  display: flex;
  gap: 12px;
  padding: 12px;
  height: 100%;
  min-height: 300px;
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
</style>
