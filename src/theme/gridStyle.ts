import type { Theme } from './themes'

/** Blend two #rrggbb colours; t = 0 → a, 1 → b. (Canvas can't use CSS color-mix.) */
export function mix(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16)
  const pb = parseInt(b.slice(1), 16)
  const ch = (p: number, s: number) => (p >> s) & 255
  const c = (s: number) => Math.round(ch(pa, s) + (ch(pb, s) - ch(pa, s)) * t)
  return `#${((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1)}`
}

/** #rrggbb at an alpha */
export function rgba(hex: string, a: number): string {
  const p = parseInt(hex.slice(1), 16)
  return `rgba(${(p >> 16) & 255}, ${(p >> 8) & 255}, ${p & 255}, ${a})`
}
/** how much of a row's cell lets the backdrop (lib/gridPaint.ts) through */
export const CELL_ALPHA = 0.74

const LCD_FONT = 'VT323, monospace'
const LABEL_FONT = 'bold 9px Orbitron, sans-serif'

/**
 * canvas-datagrid style object for a theme: panels, LED text, amber/cyan accents. The grid itself is transparent and
 * its rows nearly so: a backdrop canvas under it shows through (lib/gridPaint.ts).
 */
export function gridStyle(t: Theme): Record<string, string | number> {
  const [hi, mid, lo] = t.panel
  const line = mix(lo, '#000000', 0.55)
  const selected = mix(lo, t.secondary, 0.22)
  const active = mix(lo, t.secondary, 0.34)
  return {
    gridBackgroundColor: 'rgba(0, 0, 0, 0)',
    gridBorderColor: '#000000',
    // cells
    cellFont: `18px ${LCD_FONT}`,
    cellHeight: 26,
    cellBackgroundColor: rgba(lo, CELL_ALPHA),
    cellColor: t.text[0],
    cellBorderColor: line,
    cellHoverBackgroundColor: rgba(mid, CELL_ALPHA + 0.08),
    cellHoverColor: t.text[1],
    cellSelectedBackgroundColor: rgba(selected, CELL_ALPHA + 0.06),
    cellSelectedColor: t.text[1],
    activeCellFont: `18px ${LCD_FONT}`,
    activeCellBackgroundColor: active,
    activeCellColor: t.text[1],
    activeCellHoverBackgroundColor: active,
    activeCellHoverColor: t.text[1],
    activeCellSelectedBackgroundColor: active,
    activeCellSelectedColor: t.text[1],
    activeCellBorderColor: t.secondary,
    activeCellOverlayBorderColor: t.secondary,
    selectionOverlayBorderColor: t.secondary,
    selectionHandleColor: t.secondary,
    moveOverlayBorderColor: t.secondary,
    // headers
    columnHeaderCellFont: LABEL_FONT,
    columnHeaderCellHeight: 28,
    columnHeaderCellBackgroundColor: hi,
    columnHeaderCellColor: t.text[1],
    columnHeaderCellBorderColor: '#000000',
    columnHeaderCellHoverBackgroundColor: mix(hi, '#ffffff', 0.08),
    columnHeaderCellHoverColor: t.primary,
    columnHeaderCellCapBackgroundColor: hi,
    columnHeaderCellCapBorderColor: '#000000',
    columnHeaderOrderByArrowColor: t.primary,
    columnHeaderOrderByArrowBorderColor: '#000000',
    activeColumnHeaderCellBackgroundColor: mix(hi, t.primary, 0.25),
    activeColumnHeaderCellColor: t.text[1],
    rowHeaderCellBackgroundColor: mid,
    rowHeaderCellColor: t.text[3],
    rowHeaderCellBorderColor: '#000000',
    rowHeaderCellHoverBackgroundColor: hi,
    rowHeaderCellSelectedBackgroundColor: mix(mid, t.secondary, 0.25),
    activeRowHeaderCellBackgroundColor: mix(mid, t.secondary, 0.25),
    cornerCellBackgroundColor: hi,
    cornerCellBorderColor: '#000000',
    // scroll bars
    scrollBarBackgroundColor: t.bg[1],
    scrollBarBorderColor: '#000000',
    scrollBarBoxColor: mix(mid, t.primary, 0.35),
    scrollBarActiveColor: t.primary,
    scrollBarCornerBackgroundColor: t.bg[1],
    scrollBarCornerBorderColor: '#000000',
    // editing
    editCellBackgroundColor: t.lcd,
    editCellColor: t.primary,
    editCellFontFamily: LCD_FONT,
    editCellFontSize: '18px',
    // context menu (DOM)
    contextMenuBackground: mid,
    contextMenuColor: t.text[0],
    contextMenuHoverBackground: mix(mid, t.primary, 0.25),
    contextMenuHoverColor: t.text[1],
    contextMenuBorder: '1px solid #000',
    contextMenuFontFamily: LCD_FONT,
    contextMenuFontSize: '17px',
    contextMenuArrowColor: t.primary,
    contextFilterInputColor: t.primary,
    contextFilterInputFontFamily: LCD_FONT,
  }
}
