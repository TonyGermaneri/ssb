/**
 * A waveform display's change of wave as a morph: when the wave it shows becomes another (a garden stitch, a VOYAGE
 * catch, a generated wave assigned, another sound picked), the old outline flows into the new over MORPH_MS -- a
 * wavefront sweeping left to right, each column easing from where it was to where it's going -- instead of a cut.
 *
 * It works on peaks ([lo, hi] pairs per column, audio/peaks.ts), whatever their count: the old is resampled onto the
 * new's columns. The same wave redrawn (its clip trimmed, the canvas resized: a new array, the same `key`) snaps, so a
 * drag never lags behind a morph. While the new wave's peaks are still being worked out (they come from the analysis
 * workers), the old one stays up a moment rather than going blank, then morphs when they arrive.
 */
import { ref } from 'vue'

export const MORPH_MS = 700
/** how far behind the left the right edge starts (of the morph's length): the sweep */
const SWEEP = 0.55
/** a wave with no peaks yet keeps the old one up this long before giving up on it */
const HOLD_MS = 1500

type Peaks = Float32Array

const smooth = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t))

export interface WaveMorph {
  /**
   * What to draw now for wave `key` whose peaks are `target` (undefined / null: not yet). Call it each time the display
   * draws; while `moving()` it wants drawing every frame.
   */
  at(key: string | null | undefined, target: Peaks | null | undefined, now?: number): Peaks | null | undefined
  /** mid-morph: draw again next frame */
  moving(now?: number): boolean
  /** 0..1 through the current morph (1: none) */
  progress(now?: number): number
  /** forget what was shown (the next wave appears without a morph) */
  clear(): void
}

export function waveMorph(ms = MORPH_MS): WaveMorph {
  let key: string | null | undefined
  /** the latest peaks for `key` */
  let to: Peaks | null | undefined
  /** what was on screen when the morph began, resampled onto `to`'s columns once */
  let from: Peaks | null = null
  let fromSrc: Peaks | null = null
  let start = -Infinity
  /** what was drawn last (the morph's output, or `to`) */
  let shown: Peaks | null = null
  let out: Peaks | null = null
  /** when a key arrived with no peaks: the old wave held since */
  let heldSince = -Infinity

  const t = (now: number) => (now - start) / ms

  function resampled(src: Peaks, n: number): Peaks {
    const m = src.length / 2
    if (m === n) return src
    const r = new Float32Array(n * 2)
    for (let b = 0; b < n; b++) {
      // the columns of `src` this one covers, their extremes (a narrowing keeps its peaks)
      const a0 = Math.floor((b * m) / n)
      const a1 = Math.max(a0 + 1, Math.floor(((b + 1) * m) / n))
      let lo = Infinity
      let hi = -Infinity
      for (let a = a0; a < a1 && a < m; a++) {
        lo = Math.min(lo, src[a * 2])
        hi = Math.max(hi, src[a * 2 + 1])
      }
      r[b * 2] = lo === Infinity ? 0 : lo
      r[b * 2 + 1] = hi === -Infinity ? 0 : hi
    }
    return r
  }

  function blend(now: number): Peaks {
    const target = to!
    if (!from || fromSrc !== from) {
      from = resampled(from ?? target, target.length / 2)
      fromSrc = from
    }
    if (from.length !== target.length) from = fromSrc = resampled(from, target.length / 2)
    if (!out || out.length !== target.length) out = new Float32Array(target.length)
    const n = target.length / 2
    const p = t(now) * (1 + SWEEP)
    for (let b = 0; b < n; b++) {
      const k = smooth(p - (b / n) * SWEEP)
      const i = b * 2
      out[i] = from[i] + (target[i] - from[i]) * k
      out[i + 1] = from[i + 1] + (target[i + 1] - from[i + 1]) * k
    }
    return out
  }

  return {
    at(k, target, now = performance.now()) {
      if (k !== key) {
        key = k
        to = target
        if (shown && target) {
          // a new wave over an old one: morph from whatever's on screen (mid-morph included)
          from = shown.slice()
          fromSrc = null
          start = now
          heldSince = -Infinity
        } else if (shown && !target) {
          heldSince = now
          return shown
        } else {
          start = -Infinity
          from = null
        }
      } else if (target !== to) {
        if (!to && target && shown && heldSince > -Infinity) {
          // the held wave's successor arrived: morph to it now
          from = shown.slice()
          fromSrc = null
          start = now
          heldSince = -Infinity
        }
        to = target
      }
      if (!to) {
        if (shown && now - heldSince < HOLD_MS) return shown
        shown = null
        return to
      }
      shown = t(now) < 1 && from ? blend(now) : to
      return shown
    },
    moving(now = performance.now()) {
      return (!!to && !!from && t(now) < 1) || (!to && !!shown && now - heldSince < HOLD_MS)
    },
    progress(now = performance.now()) {
      return from && to ? Math.min(1, Math.max(0, t(now))) : 1
    },
    clear() {
      key = undefined
      to = shown = from = fromSrc = out = null
      start = heldSince = -Infinity
    },
  }
}

/**
 * For a Vue display that draws in an effect (a watchEffect): `at` as above, and while a morph runs, a reactive frame
 * count bumped every animation frame, read by `at`, so the effect redraws until it's through.
 */
export function useWaveMorph(ms = MORPH_MS) {
  const m = waveMorph(ms)
  const frame = ref(0)
  let raf = 0
  const pump = () => {
    raf = 0
    frame.value++
  }
  return {
    ...m,
    at(k: string | null | undefined, target: Peaks | null | undefined) {
      void frame.value
      const r = m.at(k, target)
      if (m.moving() && !raf) raf = requestAnimationFrame(pump)
      return r
    },
    stop() {
      cancelAnimationFrame(raf)
      raf = 0
    },
  }
}

/**
 * Many displays at once (a grid's rows, each its own morph by row id): `at` as above per row, and `active`, reactive,
 * true while any row is mid-morph, for the grid to keep redrawing (its `animate`) until they're through.
 */
export function waveMorphs(ms = MORPH_MS) {
  const rows = new Map<string, WaveMorph>()
  const active = ref(false)
  let check = 0
  return {
    active,
    at(row: string, key: string | null | undefined, target: Peaks | null | undefined) {
      let m = rows.get(row)
      if (!m) {
        // a grid of thousands paints only what's on screen; old rows go once there are many
        if (rows.size > 400) rows.clear()
        rows.set(row, (m = waveMorph(ms)))
      }
      const r = m.at(key, target)
      if (m.moving()) active.value = true
      else if (active.value && !check) {
        // after this paint: still anything moving?
        check = requestAnimationFrame(() => {
          check = 0
          let any = false
          for (const x of rows.values()) if (x.moving()) any = true
          active.value = any
        })
      }
      return r ?? undefined
    },
  }
}
