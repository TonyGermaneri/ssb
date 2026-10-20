// canvas-datagrid ships types, but its package.json "exports" hides them from TypeScript.
// This covers the parts SSB uses.
declare module 'canvas-datagrid' {
  export interface GridHeader {
    name: string
    title?: string
  }
  export interface GridCell {
    data?: any
    header?: GridHeader
    isHeader?: boolean
    isColumnHeader?: boolean
    selected?: boolean
    formattedValue?: string
    rowIndex?: number
    /** where it's drawn, in CSS pixels */
    x: number
    y: number
    width: number
    height: number
  }
  export interface GridEvent {
    cell: GridCell
    row?: any
    ctx: CanvasRenderingContext2D
    value?: unknown
    abort?: boolean
    selectedData?: any[]
    NativeEvent?: any
    preventDefault(): void
  }
  export interface CanvasDatagrid {
    data: unknown[]
    canvas: HTMLCanvasElement
    /** the cell under the pointer */
    currentCell?: GridCell
    /** rows in their current sort / filter order */
    viewData: any[]
    /** the selected rows (whole row objects, hidden columns included), sparse by view index */
    selectedRows: any[]
    activeCell: { rowIndex: number; columnIndex: number }
    /** the cell editor, while one is open */
    input?: HTMLElement
    style: Record<string, unknown>
    hasFocus: boolean
    scrollTop: number
    scrollLeft: number
    /** the column the view is sorted by, if any */
    orderBy: string | null
    /** the grid's own 2D context, and its size in CSS pixels */
    ctx: CanvasRenderingContext2D
    width: number
    height: number
    /** the cell at a point, in pixels from the canvas's top left */
    getCellAt(x: number, y: number): GridCell | undefined
    draw(): void
    focus(): void
    selectNone(dontDraw?: boolean): void
    selectRow(rowIndex: number, ctrl?: boolean, shift?: boolean, suppressEvent?: boolean): void
    setActiveCell(x: number, y: number): void
    scrollIntoView(x?: number, y?: number): void
    dispose?(): void
    addEventListener(ev: string, fn: (e: GridEvent) => void): void
  }
  export default function canvasDatagrid(args: Record<string, unknown>): CanvasDatagrid
}
