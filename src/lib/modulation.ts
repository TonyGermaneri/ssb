import type { LfoShape, ModDest, ModRoute, ModSource } from '../types'
import { MOD_DESTS } from '../types'

/**
 * LFO value (-1..1) at `phase` cycles since start, matching OscillatorNode's
 * waveforms (sine/triangle/sawtooth start at 0 rising, square starts high).
 */
export function lfoValue(shape: LfoShape, phase: number): number {
  const p = phase - Math.floor(phase)
  switch (shape) {
    case 'sine':
      return Math.sin(2 * Math.PI * p)
    case 'triangle':
      return p < 0.25 ? 4 * p : p < 0.75 ? 2 - 4 * p : 4 * p - 4
    case 'square':
      return p < 0.5 ? 1 : -1
    case 'sawtooth':
      return p < 0.5 ? 2 * p : 2 * p - 2
  }
}

/** Sum of routes into a JS-evaluated destination, in destination units. */
export function modSum(routes: ModRoute[], dest: ModDest, valueOf: (src: ModSource) => number): number {
  let sum = 0
  for (const r of routes) if (r.dest === dest && r.amount) sum += r.amount * MOD_DESTS[dest].scale * valueOf(r.source)
  return sum
}

/** Readout for a route amount, in destination units. */
export function fmtRouteAmount(dest: ModDest, amount: number): string {
  const { scale, unit } = MOD_DESTS[dest]
  const v = amount * scale
  const sign = v > 0 ? '+' : ''
  if (unit === '') return `${sign}${Math.round(v * 100)}%`
  return `${sign}${Math.abs(v) >= 10 ? Math.round(v) : v.toFixed(1)}${unit}`
}
