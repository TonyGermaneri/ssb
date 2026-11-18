/**
 * The garden's rings as circles, one inside the next, for the PLAY view's GARDEN pad (GardenPad.vue): each ring's
 * steps around it, its hits lit, the step playing ringed and the arm sweeping on to the next as the clip's loops go by;
 * each ring's word at its top; the step in the middle, breathing with the output; a shock ring out at each stitch. The
 * ring the pad's X / Y edits drawn bright, the rest dimmer. Fits the largest circle the pad holds.
 */
import { RING_COLORS, ringPattern, ringSounds, ringWordIndex, type Garden } from './garden'

export interface RingsLook {
  garden: Garden
  /** 0..1 of the way to the next stitch */
  progress: number
  /** the output's level, 0..1 */
  level: number
  /** seconds since the last stitch (the shock ring), or Infinity */
  sinceStitch: number
  selected: string | null
  /** the theme's line colour (the pad's) */
  line: string
  dpr: number
  /** ms, for the middle's breathing */
  now: number
}

export function drawRings(g: CanvasRenderingContext2D, w: number, h: number, o: RingsLook) {
  const { garden, dpr } = o
  g.save()
  g.scale(dpr, dpr)
  const W = w / dpr
  const H = h / dpr
  const R = Math.min(W, H) / 2
  const cx = W / 2
  const cy = H / 2
  const count = Math.max(1, garden.rings.length)
  const outer = R * 0.86
  const inner = R * 0.3
  const gap = count > 1 ? (outer - inner) / (count - 1) : 0
  const radius = (i: number) => outer - i * gap

  // a stitch: a shock ring out from the middle
  if (o.sinceStitch < 0.9) {
    const k = o.sinceStitch / 0.9
    g.strokeStyle = `rgba(255, 255, 255, ${1 - k})`
    g.lineWidth = 5 * (1 - k) + 1
    g.beginPath()
    g.arc(cx, cy, R * 0.2 + o.sinceStitch * R, 0, Math.PI * 2)
    g.stroke()
  }
  // the seed in the middle, breathing with the output
  const core = R * (0.1 + 0.08 * o.level) * (1 + 0.03 * Math.sin(o.now / 300))
  const cg = g.createRadialGradient(cx, cy, 0, cx, cy, core * 2.2)
  cg.addColorStop(0, garden.on ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.35)')
  cg.addColorStop(0.35, garden.on ? 'rgba(126, 255, 106, 0.7)' : 'rgba(126, 255, 106, 0.15)')
  cg.addColorStop(1, 'rgba(126, 255, 106, 0)')
  g.fillStyle = cg
  g.beginPath()
  g.arc(cx, cy, core * 2.2, 0, Math.PI * 2)
  g.fill()

  const step = garden.step
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  garden.rings.forEach((ring, i) => {
    const r = radius(i)
    const col = RING_COLORS[i % RING_COLORS.length]
    const pat = ringPattern(ring)
    const n = pat.length
    const at = (j: number) => -Math.PI / 2 + (j / n) * Math.PI * 2
    const picked = ring.id === o.selected
    const dim = (ring.off ? 0.25 : 1) * (o.selected && !picked ? 0.55 : 1)
    // the track
    g.strokeStyle = col
    g.lineWidth = picked ? 2 : 1
    g.globalAlpha = dim * (picked ? 0.85 : 0.3)
    g.beginPath()
    g.arc(cx, cy, r, 0, Math.PI * 2)
    g.stroke()
    // the arm: from the step playing on to the next, as the loops go by
    const cur = ((step % n) + n) % n
    g.globalAlpha = dim * 0.9
    g.lineWidth = Math.max(2, Math.min(5, gap * 0.22 || 3))
    g.beginPath()
    g.arc(cx, cy, r, at(cur), at(cur) + (Math.PI * 2 * o.progress) / n)
    g.stroke()
    // the steps
    const dot = Math.max(1.6, Math.min(5, ((Math.PI * 2 * r) / n) * 0.2))
    for (let j = 0; j < n; j++) {
      const x = cx + Math.cos(at(j)) * r
      const y = cy + Math.sin(at(j)) * r
      g.globalAlpha = dim
      g.beginPath()
      g.arc(x, y, pat[j] ? dot * (1 + (j === cur ? 0.5 * o.level : 0)) : dot * 0.45, 0, Math.PI * 2)
      if (pat[j]) {
        g.fillStyle = col
        g.shadowColor = col
        g.shadowBlur = j === cur ? 12 : 4
        g.fill()
        g.shadowBlur = 0
      } else {
        g.fillStyle = 'rgba(255,255,255,0.25)'
        g.fill()
      }
      if (j === cur) {
        g.strokeStyle = '#fff'
        g.lineWidth = 1.2
        g.beginPath()
        g.arc(x, y, dot * 1.8, 0, Math.PI * 2)
        g.stroke()
      }
    }
    // its word, at the top
    const idx = ringSounds(ring, step) ? ringWordIndex(ring, step, garden.seed) : -1
    const word = idx >= 0 ? ring.words[idx] : '·'
    const fs = Math.max(9, Math.min(15, gap * 0.6 || 14))
    g.font = `${fs}px VT323, monospace`
    const label = `${ring.locked ? '🔒' : ''}${word}`
    const tw = Math.min(g.measureText(label).width, W - 8)
    const ly = cy - r
    g.globalAlpha = dim
    g.fillStyle = 'rgba(5, 3, 10, 0.8)'
    g.fillRect(cx - tw / 2 - 3, ly - fs / 2, tw + 6, fs)
    g.fillStyle = col
    g.fillText(label, cx, ly + 1, W - 8)
    g.globalAlpha = 1
  })

  // the step, in the middle
  g.fillStyle = garden.on ? '#05030a' : o.line
  g.font = `bold ${Math.max(8, R * 0.09)}px Orbitron, sans-serif`
  g.fillText(String(step), cx, cy)
  g.restore()
}
