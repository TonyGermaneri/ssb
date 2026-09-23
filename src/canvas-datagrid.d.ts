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
  }
  export interface GridEvent {
    cell: GridCell
    row?: any
    ctx: CanvasRenderingContext2D
    value?: unknown
    abort?: boolean
    selectedData?: any[]
    preventDefault(): void
  }
  export interface CanvasDatagrid {
    data: unknown[]
    style: Record<string, unknown>
    hasFocus: boolean
    scrollTop: number
    scrollLeft: number
    draw(): void
    dispose?(): void
    addEventListener(ev: string, fn: (e: GridEvent) => void): void
  }
  export default function canvasDatagrid(args: Record<string, unknown>): CanvasDatagrid
}
