import type { SoundSettings } from '../types'

export const semisToRate = (semis: number) => Math.pow(2, semis / 12)

export const MIN_CLIP = 0.005

export interface ClipBounds {
  clipIn: number // seconds into buffer
  clipOut: number
  clipLen: number
}

export function clipBounds(s: SoundSettings, duration: number): ClipBounds {
  const a = Math.min(s.clipIn, s.clipOut) * duration
  const b = Math.max(s.clipIn, s.clipOut) * duration
  const clipIn = Math.min(a, Math.max(0, duration - MIN_CLIP))
  const clipOut = Math.max(clipIn + MIN_CLIP, Math.min(b, duration))
  return { clipIn, clipOut, clipLen: clipOut - clipIn }
}

/** Playback-rate multiplier from the PITCH + FINE knobs. */
export const knobRate = (s: SoundSettings) => semisToRate(s.pitch + s.fine / 100)

/**
 * Wall-clock seconds for one pass through the clip.
 * tape: pitch (incl. played note) and speed both speed it up.
 * stretch / grain cloud: only SPEED changes length.
 */
export function cycleSeconds(s: SoundSettings, clipLen: number, granular: boolean, noteSemis = 0): number {
  if (granular || s.timeMode === 'stretch') return clipLen / s.speed
  return clipLen / (knobRate(s) * semisToRate(noteSemis) * s.speed)
}

/** Total play length; Infinity when looping (repeat 0). */
export function playSeconds(s: SoundSettings, clipLen: number, granular: boolean, noteSemis = 0): number {
  return s.repeat > 0 ? Math.round(s.repeat) * cycleSeconds(s, clipLen, granular, noteSemis) : Infinity
}

export interface Glide {
  from: number // semitones
  to: number
  start: number // ctx time
  dur: number
}

/** Current note offset in semitones along a linear-in-pitch glide. */
export function glideSemis(g: Glide, t: number): number {
  if (g.dur <= 0 || t >= g.start + g.dur) return g.to
  if (t <= g.start) return g.from
  return g.from + ((g.to - g.from) * (t - g.start)) / g.dur
}

/** Seconds a voice keeps ringing after its source ends, from delay feedback + reverb. */
export function tailSeconds(s: SoundSettings): number {
  let tail = 0
  if (s.delayMix > 0.001) {
    const fb = Math.min(0.95, Math.max(0.01, s.delayFeedback))
    // repeats until feedback drops below -60 dB
    tail = Math.max(tail, Math.min(12, s.delayTime * (Math.log(0.001) / Math.log(fb) + 1)))
  }
  if (s.reverbMix > 0.001) tail = Math.max(tail, s.reverbSize)
  return tail
}
