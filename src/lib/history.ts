/**
 * Snapshot undo/redo. Rapid edits (a knob drag) coalesce: call `touch()` on
 * every change and `settle()` once things go quiet; one undo step per settle.
 */
export class History {
  private undoStack: string[] = []
  private redoStack: string[] = []

  constructor(
    private current: string,
    private limit = 100,
  ) {}

  /** Record `next` as the new state (no-op if unchanged). */
  commit(next: string) {
    if (next === this.current) return
    this.undoStack.push(this.current)
    if (this.undoStack.length > this.limit) this.undoStack.shift()
    this.redoStack = []
    this.current = next
  }

  /** Replace the baseline without creating an undo step (e.g. after loading). */
  reset(state: string) {
    this.current = state
    this.undoStack = []
    this.redoStack = []
  }

  undo(): string | null {
    const prev = this.undoStack.pop()
    if (prev === undefined) return null
    this.redoStack.push(this.current)
    this.current = prev
    return prev
  }

  redo(): string | null {
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
