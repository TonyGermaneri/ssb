// canvas-datagrid ships types, but its package.json "exports" hides them from TypeScript.
// This covers the parts SSB uses.
declare module 'canvas-datagrid' {
  export interface GridHeader {
    name: string
  }
  export interface GridCell {
    data?: any
    header?: GridHeader
    isHeader?: boolean
    isColumnHeader?: boolean
    selected?: boolean
    formattedValue?: string
    rowIndex?: number
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
