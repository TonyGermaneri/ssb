export type Curve = 'lin' | 'log'

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Map a value to 0..1 knob travel. */
export function valueToPct(value: number, min: number, max: number, curve: Curve = 'lin'): number {
  if (max === min) return 0
  const v = clamp(value, min, max)
  if (curve === 'log') return Math.log(v / min) / Math.log(max / min)
  return (v - min) / (max - min)
}

/** Map 0..1 knob travel to a value, snapped to `step` when given. */
export function pctToValue(pct: number, min: number, max: number, curve: Curve = 'lin', step = 0): number {
  const p = clamp(pct, 0, 1)
  let v = curve === 'log' ? min * Math.pow(max / min, p) : min + p * (max - min)
  if (step > 0) v = Math.round((v - min) / step) * step + min
  // avoid float noise like 0.30000000000000004
  return clamp(Number(v.toPrecision(10)), min, max)
}

/** Knob pointer angle in degrees from 12 o'clock (-135..135). */
export const pctToAngle = (pct: number) => -135 + clamp(pct, 0, 1) * 270

/**
 * v-progress-circular arc for a 270° pot. Vuetify draws `value`% of a full
 * circle starting at 12 o'clock + `rotate` degrees.
 */
export function arcFor(pct: number, bipolar: boolean): { rotate: number; value: number } {
  const p = clamp(pct, 0, 1)
  if (!bipolar) return { rotate: 225, value: p * 75 }
  if (p >= 0.5) return { rotate: 0, value: (p - 0.5) * 75 }
  return { rotate: 360 + (p - 0.5) * 270, value: (0.5 - p) * 75 }
}
