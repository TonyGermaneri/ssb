import type { ModDest, ModRoute, ModSource } from '../types'
import { MOD_DESTS } from '../types'

export { lfoValue } from '../audio/lfoMath'

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
