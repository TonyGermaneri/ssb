/**
 * lin; log (min > 0); pow = cubic taper from min (fine at the bottom, reaches 0, spans huge ranges);
 * grain = GRAIN SIZE: OFF, then the grain range on most of the travel, then out to max (see grainCurve)
 */
export type Curve = 'lin' | 'log' | 'pow' | 'grain'

/**
 * GRAIN SIZE (ms). The first 3 % of travel is OFF (0); the next three quarters cover 5-500 ms on a
 * log scale -- where grains sound like grains, so POS / DENSITY / WIDTH are heard; the last quarter
 * goes on (log) to `max`, the length of the sample. A knob that spent its travel on multi-second
 * "grains" of a long sample made every other grain control inaudible.
 */
const GRAIN_OFF = 0.03
const GRAIN_LO = 5
const GRAIN_KNEE = 500
const GRAIN_SPLIT = 0.75
function grainValue(p: number, max: number): number {
  if (p < GRAIN_OFF) return 0
  const q = (p - GRAIN_OFF) / (1 - GRAIN_OFF)
  if (max <= GRAIN_KNEE) return GRAIN_LO * Math.pow(max / GRAIN_LO, q)
  if (q <= GRAIN_SPLIT) return GRAIN_LO * Math.pow(GRAIN_KNEE / GRAIN_LO, q / GRAIN_SPLIT)
  return GRAIN_KNEE * Math.pow(max / GRAIN_KNEE, (q - GRAIN_SPLIT) / (1 - GRAIN_SPLIT))
}
function grainPct(v: number, max: number): number {
  if (v <= 0) return 0
  const x = Math.max(v, GRAIN_LO)
  const q =
    max <= GRAIN_KNEE
      ? Math.log(x / GRAIN_LO) / Math.log(max / GRAIN_LO)
      : x <= GRAIN_KNEE
        ? (Math.log(x / GRAIN_LO) / Math.log(GRAIN_KNEE / GRAIN_LO)) * GRAIN_SPLIT
        : GRAIN_SPLIT + (Math.log(x / GRAIN_KNEE) / Math.log(max / GRAIN_KNEE)) * (1 - GRAIN_SPLIT)
  return GRAIN_OFF + clamp(q, 0, 1) * (1 - GRAIN_OFF)
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** Map a value to 0..1 knob travel. */
export function valueToPct(value: number, min: number, max: number, curve: Curve = 'lin'): number {
  if (max === min) return 0
  const v = clamp(value, min, max)
  if (curve === 'log') return Math.log(v / min) / Math.log(max / min)
  if (curve === 'pow') return Math.cbrt((v - min) / (max - min))
  if (curve === 'grain') return grainPct(v, max)
  return (v - min) / (max - min)
}

/** Map 0..1 knob travel to a value, snapped to `step` when given. */
export function pctToValue(pct: number, min: number, max: number, curve: Curve = 'lin', step = 0): number {
  const p = clamp(pct, 0, 1)
  let v =
    curve === 'log' ? min * Math.pow(max / min, p)
    : curve === 'pow' ? min + p ** 3 * (max - min)
    : curve === 'grain' ? grainValue(p, max)
    : min + p * (max - min)
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
