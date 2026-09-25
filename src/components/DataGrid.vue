<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import canvasDatagrid, { type CanvasDatagrid } from 'canvas-datagrid'
import { useBoard } from '../stores/board'
import { gridStyle, mix } from '../theme/gridStyle'

/**
 * Themed canvas-datagrid for a catalog (sounds or patches). Rows need a hidden \`id\` and a 1-based \`n\` (the row's
 * place in \`rows\`, shown as #). ↑ / ↓ move the selection; ⇧ / ⌘ gather rows for Delete, which asks first.
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
  /** what a row is, singular and plural, for the delete prompt */
  noun: [string, string]
}>()
const emit = defineEmits<{
  edit: [id: string, column: string, value: string]
  play: [id: string]
  select: [id: string]
  fav: [id: string]
  /** confirmed: delete these rows */
  delete: [ids: string[]]
}>()

const board = useBoard()
const host = ref<HTMLDivElement>()
let grid: CanvasDatagrid | null = null

/** rows Delete / Backspace asked to remove (kept while the prompt fades out, so its count doesn't change) */
const doomed = ref<string[]>([])
const asking = ref(false)
function confirmDelete() {
  if (!asking.value) return
  asking.value = false
  emit('delete', doomed.value)
}
/** Enter confirms, unless it lands on a button (which clicks itself) */
function onEnter(e: KeyboardEvent) {
  if ((e.target as HTMLElement).tagName !== 'BUTTON') confirmDelete()
}
/** the prompt opens with DELETE focused (Enter confirms, Esc cancels); the grid has the keys again after */
const deleteButton = ref<HTMLButtonElement>()
watch(asking, (open) => setTimeout(() => (open ? deleteButton.value?.focus() : grid?.focus()), 60))

/** Push rows in place when the row set is unchanged (keeps sort, scroll and selection). */
function sync(next: GridRow[]) {
  if (!grid) return
  const cur = grid.data as GridRow[] | undefined
  if (cur && cur.length === next.length && cur.every((r) => next.some((n) => n.id === r.id))) {
    const byId = new Map(next.map((r) => [r.id, r]))
    for (const r of cur) Object.assign(r, byId.get(r.id))
    grid.draw()
  } else {
    grid.selectNone(true) // a selection is row indexes, which now point elsewhere
    grid.data = next.map((r) => ({ ...r }))
  }
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
  /** the row a ⇧-click or ⇧-arrow selection stretches from */
  let anchor = -1
  // clicking a row selects it; the ▷ column also plays it. ⇧-click selects a run of rows and ⌘-click adds or
  // removes one (to Delete them together); neither changes what the board has selected.
  g.addEventListener('click', (e) => {
    const id = idOf(e.cell)
    const y = e.cell.rowIndex ?? -1
    if (!id || e.cell.isHeader || y < 0) return
    if (col(e) === 'fav') return emit('fav', id) // ♥ column toggles without selecting
    if (e.NativeEvent?.shiftKey) {
      e.preventDefault()
      return rowTo(y, true)
    }
    if (e.NativeEvent?.metaKey || e.NativeEvent?.ctrlKey) return
    anchor = y
    if (id !== props.selectedId) emit('select', id)
    if (col(e) === 'play') emit('play', id)
  })

  /** Make view row `y` the active row and select it, or the rows from the anchor to it. */
  function rowTo(y: number, extend: boolean) {
    const last = g.viewData.length - 1
    if (last < 0) return
    y = Math.max(0, Math.min(last, y))
    if (!extend || anchor < 0 || anchor > last) anchor = extend ? g.activeCell.rowIndex : y
    g.selectNone(true)
    for (let r = Math.min(anchor, y); r <= Math.max(anchor, y); r++) g.selectRow(r, false, false, true)
    g.setActiveCell(Math.max(0, g.activeCell.columnIndex), y)
    g.scrollIntoView(undefined, y)
    g.draw()
    const id = (g.viewData[y] as GridRow | undefined)?.id
    if (!extend && id && id !== props.selectedId) emit('select', id)
  }
  const selectedIds = () => g.selectedRows.flatMap((r: GridRow | undefined) => (r?.id ? [r.id] : []))
  const JUMPS = ['PageUp', 'PageDown', 'Home', 'End']
  g.addEventListener('keydown', (e) => {
    const k: string = e.NativeEvent?.key ?? ''
    const shift = !!e.NativeEvent?.shiftKey
    const mod = !!(e.NativeEvent?.metaKey || e.NativeEvent?.ctrlKey)
    // Delete / Backspace remove the selected rows (after asking), never blank their cells
    if (k === 'Delete' || k === 'Backspace') {
      e.preventDefault()
      const ids = selectedIds()
      if (ids.length) {
        doomed.value = ids
        asking.value = true
      }
      return
    }
    // ↑ / ↓ move the selection (⇧ stretches it); the board's selection follows
    if ((k === 'ArrowUp' || k === 'ArrowDown') && !mod) {
      e.preventDefault()
      rowTo(g.activeCell.rowIndex + (k === 'ArrowDown' ? 1 : -1), shift)
    } else if ((JUMPS.includes(k) || ((k === 'ArrowUp' || k === 'ArrowDown') && mod)) && !shift) {
      // the grid knows its page size: let it move, then select where it landed
      queueMicrotask(() => rowTo(g.activeCell.rowIndex, false))
    }
  })
  // double-click a read-only cell to play too
  g.addEventListener('dblclick', (e) => {
    const id = idOf(e.cell)
    if (id && !e.cell.isHeader && !props.editable.includes(col(e))) emit('play', id)
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
    <v-dialog v-model="asking" max-width="420">
      <div class="ask" tabindex="-1" @keydown.stop @keydown.enter="onEnter" @keydown.esc="asking = false">
        <h3><v-icon icon="mdi-delete-alert" color="error" size="20" /> DELETE</h3>
        <p>Are you sure you want to delete {{ doomed.length }} {{ noun[doomed.length === 1 ? 0 : 1] }}?</p>
        <p class="dim">⌘Z brings them back.</p>
        <footer>
          <button class="hw-btn" @click="asking = false">CANCEL</button>
          <button ref="deleteButton" class="hw-btn danger" @click="confirmDelete">DELETE {{ doomed.length }}</button>
        </footer>
      </div>
    </v-dialog>
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
.ask {
  padding: 14px 16px;
  border-radius: 8px;
  color: var(--text);
  background: linear-gradient(180deg, var(--panel-hi) 0%, var(--panel-lo) 100%);
  border: 1px solid #000;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
}
.ask h3 {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 10px;
  font-family: 'Orbitron', sans-serif;
  font-weight: 900;
  font-size: 14px;
  letter-spacing: 0.18em;
  color: var(--c-danger, #ff5252);
}
.ask p {
  margin: 0 0 6px;
  font-size: 14px;
}
.ask .dim {
  color: var(--text-faint);
  font-size: 12px;
}
.ask footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
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
