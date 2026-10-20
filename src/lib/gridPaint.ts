/**
 * What the grids paint on their canvases: a sound's waveform in a cell, and the backdrop behind the rows (the selected
 * item's waveform, large and faint; while sound plays, the master's spectrum and scope).
 */
import { ANALYSER_SIZE, readScope, readSpectrum, outputRate } from '../audio/engine'
import { rgba } from '../theme/gridStyle'
import type { Theme } from '../theme/themes'
/** a pad's colour (its hue as on the cards) */
export const hueColor = (hue: number, light = 60, alpha = 1) => `hsla(${hue}, 85%, ${light}%, ${alpha})`

export interface Box {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Peaks ([lo, hi] pairs, audio/peaks.ts) as a filled waveform in `box`. With `progress` (0..1) the part already played
 * is bright and a playhead marks where it is.
 */
export function paintWave(
  ctx: CanvasRenderingContext2D,
  peaks: Float32Array | undefined,
  box: Box,
  color: string,
  progress = -1,
  dim = 'rgba(255, 255, 255, 0.28)',
) {
  const { x, y, width: w, height: h } = box
  const mid = y + h / 2
  if (!peaks?.length) {
    ctx.fillStyle = dim
    ctx.fillRect(x, mid, w, 1)
    return
  }
  const n = peaks.length / 2
  let max = 0
  for (let i = 0; i < peaks.length; i++) max = Math.max(max, Math.abs(peaks[i]))
  const amp = (h / 2 - 1) / Math.max(max, 1e-3)
  const cols = Math.max(1, Math.floor(w))
  const split = progress >= 0 ? x + progress * w : x + w
  for (let c = 0; c < cols; c++) {
    const b = Math.min(n - 1, Math.floor((c / cols) * n))
    const lo = peaks[b * 2]
    const hi = peaks[b * 2 + 1]
    const top = mid - hi * amp
    const px = x + c
    ctx.fillStyle = progress < 0 || px <= split ? color : dim
    ctx.fillRect(px, top, 1, Math.max(1, (hi - lo) * amp))
  }
  if (progress >= 0) {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(Math.round(split), y + 1, 1, h - 2)
  }
}

const BARS = 72
const LO_HZ = 40
const HI_HZ = 16000

/** The backdrop: kept per grid, as its bars fall back smoothly between frames. */
export class Backdrop {
  private bars = new Float32Array(BARS)
  private spectrum = new Float32Array(ANALYSER_SIZE / 2)
  private scope = new Float32Array(ANALYSER_SIZE)

  /** true while it has something moving to draw (sound, or bars still falling) */
  get busy() {
    return this.bars.some((b) => b > 0.01)
  }

  /**
   * Paint into a canvas the grid's size. `peaks` / `hue`: the selected item's waveform; `live`: something plays;
   * `level`: the master level 0..1 (all the plugin's page has of its sound).
   */
  paint(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    t: Theme,
    { peaks, hue, live, level }: { peaks?: Float32Array; hue?: number; live: boolean; level: number },
  ) {
    ctx.fillStyle = t.bg[2]
    ctx.fillRect(0, 0, w, h)
    // the selected item's waveform, big and faint, swelling with the level while it plays
    if (peaks) {
      const swell = live ? 0.5 + Math.min(1, level * 1.6) * 0.5 : 0.5
      const tall = h * 0.62 * swell
      paintWave(ctx, peaks, { x: 0, y: h / 2 - tall / 2, width: w, height: tall }, hueColor(hue ?? 200, 55, live ? 0.16 : 0.09))
    }
    const heard = live && readSpectrum(this.spectrum)
    // the spectrum: log-spaced bars from the floor, falling back slowly
    const rate = outputRate()
    const binHz = rate / ANALYSER_SIZE
    for (let i = 0; i < BARS; i++) {
      let v = 0
      if (heard) {
        const f0 = LO_HZ * Math.pow(HI_HZ / LO_HZ, i / BARS)
        const f1 = LO_HZ * Math.pow(HI_HZ / LO_HZ, (i + 1) / BARS)
        const b0 = Math.max(1, Math.floor(f0 / binHz))
        const b1 = Math.max(b0 + 1, Math.ceil(f1 / binHz))
        let db = -140
        for (let b = b0; b < b1 && b < this.spectrum.length; b++) db = Math.max(db, this.spectrum[b])
        v = Math.min(1, Math.max(0, (db + 95) / 75))
      } else if (live) {
        // no spectrum here (the plugin's engine plays): a level glow along the floor
        v = Math.min(1, level * 1.4) * (0.35 + 0.65 * Math.abs(Math.sin(i * 0.37 + level * 9)))
      }
      this.bars[i] = Math.max(v, this.bars[i] * 0.9)
    }
    if (this.busy) {
      const bw = w / BARS
      for (let i = 0; i < BARS; i++) {
        const v = this.bars[i]
        if (v <= 0.01) continue
        const bh = v * h * 0.55
        ctx.fillStyle = rgba(t.primary, 0.14 + v * 0.22)
        ctx.fillRect(i * bw + 1, h - bh, bw - 2, bh)
        ctx.fillStyle = rgba(t.primary, 0.7)
        ctx.fillRect(i * bw + 1, h - bh - 2, bw - 2, 2)
      }
    }
    // the scope across the middle
    if (heard && readScope(this.scope)) {
      ctx.beginPath()
      const n = this.scope.length
      for (let i = 0; i < n; i++) {
        const px = (i / (n - 1)) * w
        const py = h / 2 - this.scope[i] * h * 0.3
        if (i) ctx.lineTo(px, py)
        else ctx.moveTo(px, py)
      }
      ctx.strokeStyle = rgba(t.secondary, 0.45)
      ctx.lineWidth = 1.5
      ctx.stroke()
    }
  }
}
