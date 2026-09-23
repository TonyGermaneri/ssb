export const fmtHz = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(v >= 10000 ? 0 : 1)}k` : `${Math.round(v)}`)
export const fmtPct = (v: number) => `${Math.round(v * 100)}`
export const fmtDb = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}`
export const fmtSec = (v: number) => (v < 1 ? `${Math.round(v * 1000)}ms` : `${v.toFixed(2)}s`)
export const fmtMs = (v: number) => (v <= 0 ? 'OFF' : `${Math.round(v)}ms`)
export const fmtRepeat = (v: number) => (v <= 0 ? '∞' : `×${Math.round(v)}`)
export const fmtSemis = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}st`
export const fmtPan = (v: number) => (Math.abs(v) < 0.01 ? 'C' : `${v < 0 ? 'L' : 'R'}${Math.round(Math.abs(v) * 100)}`)
export const fmtChoke = (v: number) => (v <= 0 ? '—' : `G${Math.round(v)}`)
export const fmtQ = (v: number) => v.toFixed(1)
export const fmtNum = (v: number) => v.toFixed(1)

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export const midiNoteName = (n: number) => `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`

/** 80s pad palette: hot pink, cyan, amber, green, violet, orange, magenta, sky. */
const PAD_HUES = [330, 188, 42, 135, 268, 18, 300, 205]

/** Stable pad hue: pads sharing a tag share a color; untagged pads vary by name. */
export function padHue(tag: string, name: string): number {
  const key = (tag.trim() || name).toLowerCase()
  let h = 0
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) >>> 0
  return PAD_HUES[h % PAD_HUES.length]
}

export const stripExt = (name: string) => name.replace(/\.[^.]+$/, '')
export const fmtCents = (v: number) => `${v > 0 ? '+' : ''}${Math.round(v)}c`
export const fmtRatio = (v: number) => `×${v.toFixed(2)}`
export const fmtOct = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(1)}oc`
export const fmtDensity = (v: number) => `${Math.round(v)}×`
export const fmtSemisJitter = (v: number) => (v <= 0 ? 'OFF' : `±${v.toFixed(1)}`)
export const fmtScale = (v: number) => `${Math.round(v * 100)}%`
export const fmtRate = (v: number) => `${v < 1 ? v.toFixed(2) : v.toFixed(1)}Hz`
