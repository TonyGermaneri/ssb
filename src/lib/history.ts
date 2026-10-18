/**
 * Snapshot undo/redo. Rapid edits (a knob drag) coalesce: call `touch()` on
 * every change and `settle()` once things go quiet; one undo step per settle.
 *
 * A snapshot can be anything `same` compares: the board's is a list of each item's JSON, so consecutive snapshots
 * share every item that didn't change (a hundred steps of a 4,000-sound board cost little more than one).
 */
export class History<T = string> {
  private undoStack: T[] = []
  private redoStack: T[] = []

  constructor(
    private current: T,
    private limit = 100,
    private same: (a: T, b: T) => boolean = Object.is,
  ) {}

  /** Record `next` as the new state (no-op if unchanged). */
  commit(next: T) {
    if (this.same(next, this.current)) return
    this.undoStack.push(this.current)
    if (this.undoStack.length > this.limit) this.undoStack.shift()
    this.redoStack = []
    this.current = next
  }

  /** Replace the baseline without creating an undo step (e.g. after loading). */
  reset(state: T) {
    this.current = state
    this.undoStack = []
    this.redoStack = []
  }

  undo(): T | null {
    const prev = this.undoStack.pop()
    if (prev === undefined) return null
    this.redoStack.push(this.current)
    this.current = prev
    return prev
  }

  redo(): T | null {
    const next = this.redoStack.pop()
    if (next === undefined) return null
    this.undoStack.push(this.current)
    this.current = next
    return next
  }

  get canUndo() {
    return this.undoStack.length > 0
  }
  get canRedo() {
    return this.redoStack.length > 0
  }
}
