<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import canvasDatagrid, { type CanvasDatagrid, type GridCell } from 'canvas-datagrid'
import { useBoard } from '../stores/board'
import { activeVoices, levels } from '../audio/engine'
import { CELL_ALPHA, gridStyle, mix, rgba } from '../theme/gridStyle'
import { Backdrop, type Box } from '../lib/gridPaint'

/**
 * Themed canvas-datagrid for a catalog (sounds or patches). Rows need a hidden \`id\` and a 1-based \`n\` (the row's
 * place in \`rows\`, shown as #). ↑ / ↓ move the selection; ⇧ / ⌘ gather rows for Delete, which asks first.
 * With \`dragType\`, a \`grip\` column (⠿) drags its row out (and, with \`reorder\`, onto another row to move it);
 * \`toggles\` columns are buttons labelled with their title, \`buttons\` columns icon buttons, \`painters\` columns
 * drawn by the parent. Behind the rows a backdrop paints \`backdrop\`'s waveform, and the master's spectrum and scope
 * while sound plays.
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
  /** dragging a row by its \`grip\` cell carries the row's id as this type (pressing anywhere else still drag-selects) */
  dragType?: string
  /** click-to-toggle columns, drawn as buttons labelled with the column's title: lit for the row ids in its set */
  toggles?: Record<string, ReadonlySet<string>>
  /** icon-button columns (a click emits \`button\`, nothing else): the icon, and the rows it's lit for */
  buttons?: Record<string, { icon: 'menu' | 'similar'; lit?: ReadonlySet<string>; title: string }>
  /** columns the parent draws into (no text), behind nothing but the cell's own background */
  painters?: Record<string, (ctx: CanvasRenderingContext2D, box: Box, row: GridRow) => void>
  /** redraw every frame (playheads move) */
  animate?: boolean
  /** a row dragged by its grip can be dropped on another to move it there (while the grid isn't sorted) */
  reorder?: boolean
  /** painted big and faint behind the rows: the selected item's waveform */
  backdrop?: { peaks?: Float32Array; hue?: number } | null
}>()
const emit = defineEmits<{
  edit: [id: string, column: string, value: string]
  play: [id: string]
  select: [id: string]
  fav: [id: string]
  toggle: [id: string, column: string]
  button: [id: string, column: string]
  /** a row dropped onto another (reorder) */
  move: [from: string, to: string]
  /** confirmed: delete these rows */
  delete: [ids: string[]]
}>()

const board = useBoard()
const host = ref<HTMLDivElement>()
const back = ref<HTMLCanvasElement>()
/** the slot (a panel) goes under the grid when there isn't room beside it */
const root = ref<HTMLDivElement>()
const narrow = ref(false)
const NARROW = 980
/** what a dragged row looks like under the pointer (off screen until then) */
const ghost = ref<HTMLDivElement>()
let grid: CanvasDatagrid | null = null

const GRIP = 'grip'
/** a column whose cells are controls: the grip, a toggle or a button */
const special = (column: string) =>
  (column === GRIP && !!props.dragType) || !!props.toggles?.[column] || !!props.buttons?.[column]
/** a column drawn here or by the parent, not as text (nor sorted by) */
const drawn = (column: string) => special(column) || !!props.painters?.[column]
/** what a cell under the pointer does: 'grip', 'toggle', 'button', or '' for the grid's own clicks and drags */
function kindOf(cell: GridCell | undefined) {
  const column = cell?.header?.name ?? ''
  if (!cell?.data || cell.isHeader || cell.isColumnHeader || !special(column)) return ''
  return column === GRIP ? 'grip' : props.buttons?.[column] ? 'button' : 'toggle'
}

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

/** the source row each grid row was last copied from: rows a parent keeps (unchanged) aren't copied again */
const pushed = new Map<string, GridRow>()
/**
 * Push rows in place when the row set is unchanged (keeps sort, scroll and selection), copying only the rows that
 * changed. Everything here is linear in the rows: a board has thousands, and this runs whenever one of them changes.
 */
function sync(next: GridRow[]) {
  if (!grid) return
  const cur = grid.data as GridRow[] | undefined
  const byId = new Map(next.map((r) => [r.id, r]))
  if (cur && cur.length === next.length && cur.every((r) => byId.has(r.id))) {
    let changed = false
    for (const r of cur) {
      const src = byId.get(r.id)!
      if (pushed.get(r.id) === src && r.n === src.n) continue
      Object.assign(r, src)
      pushed.set(r.id, src)
      changed = true
    }
    if (changed) grid.draw()
  } else {
    grid.selectNone(true) // a selection is row indexes, which now point elsewhere
    grid.data = next.map((r) => ({ ...r }))
    pushed.clear()
    for (const r of next) pushed.set(r.id, r)
  }
}

function applyTheme() {
  if (!grid) return
  // fill the host (default 'auto' grows the grid to fit every row, so it never scrolls)
  Object.assign(grid.style, gridStyle(board.theme), { height: '100%', width: '100%' })
  grid.draw()
  paintBack()
}

// ── the backdrop: a canvas under the (transparent) grid ──
const backdrop = new Backdrop()
function paintBack() {
  const c = back.value
  if (!c) return
  const dpr = window.devicePixelRatio || 1
  const w = c.clientWidth
  const h = c.clientHeight
  if (!w || !h) return
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr)
    c.height = Math.round(h * dpr)
  }
  const ctx = c.getContext('2d')!
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  backdrop.paint(ctx, w, h, board.theme, {
    peaks: props.backdrop?.peaks,
    hue: props.backdrop?.hue,
    live: activeVoices.value.length > 0,
    level: Math.max(...levels.value),
  })
}
/** while sound plays (or bars still fall, or playheads move): repaint every frame; a hidden page gets no frames */
let ticking = 0
function tick() {
  ticking = 0
  paintBack()
  if (props.animate) grid?.draw()
  if (activeVoices.value.length || backdrop.busy || props.animate) schedule()
}
function schedule() {
  if (ticking) return
  ticking = document.hidden ? window.setTimeout(tick, 33) : requestAnimationFrame(tick)
}
const stopTicking = () => {
  if (!ticking) return
  cancelAnimationFrame(ticking)
  clearTimeout(ticking)
  ticking = 0
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
  backObserver = new ResizeObserver(() => paintBack())
  backObserver.observe(host.value!)
  sizeObserver = new ResizeObserver(() => (narrow.value = (root.value?.clientWidth ?? 0) < NARROW))
  sizeObserver.observe(root.value!)

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

  // ⠿ drags its row out (into a VCO slot). A press there mustn't start the grid's drag-select, which a press anywhere
  // else still does, so the grid never sees it; the canvas is draggable only while the pointer is over a grip.
  const canvas = g.canvas
  let dragRow: GridRow | null = null
  g.addEventListener('mousedown', (e) => {
    const kind = kindOf(e.cell)
    dragRow = kind === 'grip' ? (e.cell.data as GridRow) : null
    canvas.draggable = !!dragRow
    if (kind) e.preventDefault() // (nor does pressing a toggle move the selection)
  })
  canvas.addEventListener('dragstart', (e) => {
    if (!dragRow || !props.dragType || !e.dataTransfer) return e.preventDefault()
    e.dataTransfer.setData(props.dragType, dragRow.id)
    e.dataTransfer.effectAllowed = 'copyMove'
    ghost.value!.textContent = `⠿ ${String(dragRow.name ?? dragRow.id)}`
    e.dataTransfer.setDragImage(ghost.value!, 12, 14)
  })
  canvas.addEventListener('dragend', () => {
    dragRow = null
    canvas.draggable = false
    dropAt = null
  })
  // reorder: a dragged row dropped onto another moves there (sorted, the order shown isn't the board's: no drop)
  const rowUnder = (e: DragEvent) => {
    const r = canvas.getBoundingClientRect()
    const cell = g.getCellAt(e.clientX - r.left, e.clientY - r.top)
    return cell?.data && !cell.isHeader && !cell.isColumnHeader ? cell : undefined
  }
  canvas.addEventListener('dragover', (e) => {
    if (!props.reorder || !props.dragType || !e.dataTransfer?.types.includes(props.dragType) || g.orderBy) return
    const cell = rowUnder(e)
    if (!cell) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dropAt?.id !== cell.data.id) {
      dropAt = { id: cell.data.id, y: cell.y }
      g.draw()
    }
  })
  canvas.addEventListener('dragleave', () => {
    dropAt = null
    g.draw()
  })
  canvas.addEventListener('drop', (e) => {
    const from = props.dragType ? e.dataTransfer?.getData(props.dragType) : ''
    const to = dropAt?.id
    dropAt = null
    g.draw()
    if (!from || !to || from === to) return
    e.preventDefault()
    emit('move', from, to)
  })
  // where a dragged row would land: a line along the top of the row under it
  g.addEventListener('afterdraw', () => {
    if (!dropAt) return
    const ctx = g.ctx
    ctx.save()
    ctx.fillStyle = board.theme.primary
    ctx.shadowColor = board.theme.primary
    ctx.shadowBlur = 8
    ctx.fillRect(0, dropAt.y - 1, g.width, 3)
    ctx.restore()
  })
  /** the cursor this put on the canvas ('' while the grid's own shows), and the grid's from under it */
  let ours = ''
  let theirs = ''
  // runs after the grid's own window mousemove (added first), which has found the cell under the pointer
  const onHover = () => {
    const kind = kindOf(g.currentCell)
    canvas.draggable = kind === 'grip'
    const want = kind === 'grip' ? 'grab' : kind ? 'pointer' : ''
    if (canvas.style.cursor !== ours) theirs = canvas.style.cursor // the grid has changed it since
    if (want) canvas.style.cursor = ours = want
    else if (ours) {
      canvas.style.cursor = theirs
      ours = ''
    }
  }
  window.addEventListener('mousemove', onHover)
  unhover = () => window.removeEventListener('mousemove', onHover)

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
    if ((e.cell.isHeader || e.cell.isColumnHeader) && drawn(col(e))) return e.preventDefault() // nothing to sort by
    if (!id || e.cell.isHeader || y < 0) return
    if (col(e) === 'fav') return emit('fav', id) // ♥ column toggles without selecting
    if (kindOf(e.cell) === 'toggle') {
      e.preventDefault()
      return emit('toggle', id, col(e))
    }
    if (kindOf(e.cell) === 'button') {
      e.preventDefault()
      return emit('button', id, col(e))
    }
    if (e.NativeEvent?.shiftKey) {
      e.preventDefault()
      return rowTo(y, true)
    }
    if (e.NativeEvent?.metaKey || e.NativeEvent?.ctrlKey) return
    if (kindOf(e.cell) === 'grip') {
      // the press never reached the grid, so it selects the row here
      e.preventDefault()
      return rowTo(y, false)
    }
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
    if (id && !e.cell.isHeader && !props.editable.includes(col(e)) && !special(col(e))) emit('play', id)
  })
  // ▷ turns ◉ while a row plays: drawn from `playing`, not kept in the rows, which needn't change as voices come and go
  g.addEventListener('formattext', (e) => {
    const row = e.row as GridRow | undefined
    if (!row || e.cell.isHeader || e.cell.isColumnHeader) return
    if (drawn(col(e))) e.cell.formattedValue = '' // drawn below, or by the parent
    else if (col(e) === 'play' && props.playing.has(row.id)) e.cell.formattedValue = '◉'
  })
  // the grip's dots, and each toggle as a button with its column's title on it, lit when its set has the row
  g.addEventListener('afterrendercell', (e) => {
    const row = e.row as GridRow | undefined
    const column = col(e)
    if (!row || e.cell.isHeader || e.cell.isColumnHeader || !drawn(column)) return
    const { ctx, cell } = e
    const t = board.theme
    ctx.save()
    const paint = props.painters?.[column]
    const button = props.buttons?.[column]
    if (paint) paint(ctx, { x: cell.x + 3, y: cell.y + 3, width: cell.width - 6, height: cell.height - 6 }, row)
    else if (button) {
      const on = !!button.lit?.has(row.id)
      const cx = Math.round(cell.x + cell.width / 2)
      const cy = Math.round(cell.y + cell.height / 2)
      ctx.fillStyle = on ? t.primary : t.text[3]
      if (on) {
        ctx.shadowColor = t.primary
        ctx.shadowBlur = 6
      }
      if (button.icon === 'menu') for (let i = -1; i <= 1; i++) ctx.fillRect(cx - 6, cy + i * 4 - 1, 12, 2)
      else {
        // ≈: two waves
        ctx.strokeStyle = ctx.fillStyle
        ctx.lineWidth = 1.6
        for (const dy of [-3, 3]) {
          ctx.beginPath()
          for (let i = 0; i <= 12; i++) {
            const px = cx - 6 + i
            const py = cy + dy + Math.sin((i / 12) * Math.PI * 2) * -2
            if (i) ctx.lineTo(px, py)
            else ctx.moveTo(px, py)
          }
          ctx.stroke()
        }
      }
    } else if (column === GRIP) {
      // two columns of three dots
      const cx = Math.round(cell.x + cell.width / 2)
      const cy = Math.round(cell.y + cell.height / 2)
      ctx.fillStyle = t.text[3]
      for (let i = 0; i < 6; i++) ctx.fillRect(cx - 3 + (i % 2) * 5, cy - 6 + (i >> 1) * 5, 2, 2)
    } else {
      const on = props.toggles![column].has(row.id)
      const s = 17
      const x = Math.round(cell.x + (cell.width - s) / 2) + 0.5
      const y = Math.round(cell.y + (cell.height - s) / 2) + 0.5
      ctx.beginPath()
      ctx.roundRect(x, y, s, s, 3)
      if (on) {
        ctx.shadowColor = t.primary
        ctx.shadowBlur = 8
      }
      ctx.fillStyle = on ? t.primary : 'rgba(0, 0, 0, 0.28)'
      ctx.fill()
      ctx.shadowBlur = 0
      if (!on) {
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.35)'
        ctx.stroke()
      }
      ctx.font = '16px VT323, monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = on ? '#1a1200' : t.text[3]
      ctx.fillText(cell.header?.title ?? '', x + s / 2, y + s / 2 + 1)
    }
    ctx.restore()
  })
  // playing rows light up; the selected row gets a tint
  g.addEventListener('rendercell', (e) => {
    const row = e.row as GridRow | undefined
    if (!row || e.cell.isHeader || e.cell.isColumnHeader) return
    const t = board.theme
    if (props.playing.has(row.id)) e.ctx.fillStyle = rgba(mix(t.panel[2], t.primary, e.cell.selected ? 0.45 : 0.32), CELL_ALPHA + 0.1)
    else if (row.id === props.selectedId && !e.cell.selected) e.ctx.fillStyle = rgba(mix(t.panel[2], t.secondary, 0.1), CELL_ALPHA + 0.05)
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

// a new array whenever a row changes (the parents' computeds): no need to walk every row's fields to notice
watch(() => props.rows, sync)
watch(() => board.theme, applyTheme)
watch(
  () => [props.selectedId, props.playing, props.toggles, props.buttons],
  () => grid?.draw(),
)
watch(() => props.backdrop, paintBack)
// sound starting (or the playheads wanting to move) starts the frames; they stop themselves once all is still
watch([() => activeVoices.value.length > 0, () => props.animate], () => schedule())

/** where a dragged row would be dropped (reorder) */
let dropAt: { id: string; y: number } | null = null
let backObserver: ResizeObserver | undefined
let sizeObserver: ResizeObserver | undefined
/** stops following the pointer for the grip's cursor */
let unhover = () => {}
onBeforeUnmount(() => {
  unhover()
  stopTicking()
  backObserver?.disconnect()
  sizeObserver?.disconnect()
  grid?.dispose?.()
  grid = null
})
</script>

<template>
  <div ref="root" class="grid-mode" :class="{ narrow }">
    <div class="grid-shell">
      <div ref="host" class="grid-host"><canvas ref="back" class="backdrop" aria-hidden="true" /></div>
      <p class="hint" :title="hint">{{ hint }}</p>
    </div>
    <div ref="ghost" class="drag-ghost" aria-hidden="true" />
    <slot :narrow="narrow" />
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
.grid-mode.narrow {
  flex-direction: column;
}
/* under a narrow grid the panel needs the room: the hint keeps to one line (all of it on hover) */
.narrow .hint {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.grid-shell {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.grid-host {
  position: relative;
  flex: 1;
  min-height: 0;
  border-radius: 6px;
  overflow: hidden;
  border: 1px solid #000;
  box-shadow:
    0 8px 20px rgba(0, 0, 0, 0.5),
    inset 0 0 0 1px rgba(255, 255, 255, 0.06);
}
/* the grid sits over the backdrop, which shows through its transparent background and see-through rows */
.grid-host :deep(canvas-datagrid) {
  position: relative;
  z-index: 1;
}
.backdrop {
  position: absolute;
  z-index: 0;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
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
/* a dragged row's label: the browser draws the drag from it, so it's rendered, just off screen */
.drag-ghost {
  position: fixed;
  top: -100px;
  left: 0;
  padding: 1px 10px;
  border: 1px solid #000;
  border-radius: 4px;
  font-family: 'VT323', monospace;
  font-size: 18px;
  white-space: nowrap;
  color: var(--c-primary);
  background: var(--panel-hi);
  pointer-events: none;
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
