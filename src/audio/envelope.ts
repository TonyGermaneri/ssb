export interface Env {
  a: number
  d: number
  s: number
  r: number
}

const MIN_DECAY = 0.001
const MIN_RELEASE = 0.005

/** Envelope level (0..1) `t` seconds after note-on, before release. */
export function envLevel(t: number, e: Env): number {
  if (t < e.a) return t <= 0 ? 0 : t / e.a
  const td = t - e.a
  const d = Math.max(e.d, MIN_DECAY)
  if (td < d) return 1 - (1 - e.s) * (td / d)
  return e.s
}

/** Schedule attack → decay → sustain on `p`, scaled to base + peak·level. */
export function scheduleAttack(p: AudioParam, t0: number, e: Env, peak: number, base = 0) {
  p.cancelScheduledValues(t0)
  p.setValueAtTime(base, t0)
  if (e.a > 0) p.linearRampToValueAtTime(base + peak, t0 + e.a)
  else p.setValueAtTime(base + peak, t0)
  p.linearRampToValueAtTime(base + peak * e.s, t0 + e.a + Math.max(e.d, MIN_DECAY))
}

/**
 * Start the release at `tr`. The ramp into `tr` lands on the exact envelope
 * value there, so releasing mid-attack or mid-decay doesn't jump.
 * Returns when the release finishes.
 */
export function scheduleRelease(p: AudioParam, t0: number, tr: number, e: Env, peak: number, base = 0): number {
  const v = base + peak * envLevel(tr - t0, e)
  const end = tr + Math.max(e.r, MIN_RELEASE)
  p.cancelScheduledValues(tr)
  p.linearRampToValueAtTime(v, tr)
  p.linearRampToValueAtTime(base, end)
  return end
}
