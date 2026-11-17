<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import * as engine from '../audio/engine'
import { RING_COLORS, ringPattern, ringSounds, ringWordIndex, type Garden } from '../lib/garden/garden'

/**
 * The garden's rings as circles, one inside the next: each ring's steps around it, its hits lit, the step playing ringed
 * and the arm sweeping on to the next as the clip's loops go by (`progress`); each ring's word at the top. The middle
 * breathes with the output. Click a ring to pick it; double-click a step to turn the ring so a hit lands there; the
 * wheel over a ring adds or takes away hits.
 */
const props = defineProps<{ garden: Garden; progress: number; stitches: number; selected: string | null }>()
const emit = defineEmits<{ select: [id: string]; rotate: [id: string, rot: number]; hits: [id: string, delta: number] }>()

const canvas = ref<HTMLCanvasElement>()
let raf = 0
let size = 300
let flashAt = -1
let lastStitches = props.stitches
let level = 0

function geometry() {
  const R = size / 2
  const count = Math.max(1, props.garden.rings.length)
  const outer = R * 0.9
  const inner = R * 0.3
  const gap = count > 1 ? (outer - inner) / (count - 1) : 0
  return { R, outer, gap, radius: (i: number) => outer - i * gap }
}

function draw(now: number) {
  const c = canvas.value
  if (!c) return
  const dpr = window.devicePixelRatio || 1
  const w = c.clientWidth
  if (!w) return
  size = w
  if (c.width !== Math.round(w * dpr)) {
    c.width = Math.round(w * dpr)
    c.height = Math.round(w * dpr)
  }
  const g = c.getContext('2d')!
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  const { R, gap, radius } = geometry()
  const lv = engine.levels.value
  level += (Math.max(lv[0], lv[1]) - level) * 0.2
  if (props.stitches !== lastStitches) {
    lastStitches = props.stitches
    flashAt = now
  }
  const step = props.garden.step
  // the field
  const bg = g.createRadialGradient(R, R, 0, R, R, R)
  bg.addColorStop(0, `rgba(40, 10, 60, ${0.9})`)
  bg.addColorStop(1, '#05030a')
  g.fillStyle = bg
  g.fillRect(0, 0, w, w)
  // a stitch: a shock ring out from the middle
  const since = (now - flashAt) / 1000
  if (flashAt >= 0 && since < 0.9) {
    g.strokeStyle = `rgba(255, 255, 255, ${1 - since / 0.9})`
    g.lineWidth = 6 * (1 - since / 0.9) + 1
    g.beginPath()
    g.arc(R, R, R * 0.2 + since * R, 0, Math.PI * 2)
    g.stroke()
  }
  // the seed in the middle, breathing with the output
  const core = R * (0.12 + 0.08 * level) * (1 + 0.03 * Math.sin(now / 300))
  const cg = g.createRadialGradient(R, R, 0, R, R, core * 2.2)
  cg.addColorStop(0, 'rgba(255, 255, 255, 0.95)')
  cg.addColorStop(0.35, 'rgba(126, 255, 180, 0.7)')
  cg.addColorStop(1, 'rgba(126, 255, 180, 0)')
  g.fillStyle = cg
  g.beginPath()
  g.arc(R, R, core * 2.2, 0, Math.PI * 2)
  g.fill()
  g.fillStyle = '#05030a'
  g.font = `bold ${Math.max(9, R * 0.06)}px Orbitron, sans-serif`
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(String(step), R, R)

  props.garden.rings.forEach((ring, i) => {
    const r = radius(i)
    const col = RING_COLORS[i % RING_COLORS.length]
    const pat = ringPattern(ring)
    const n = pat.length
    const at = (j: number) => -Math.PI / 2 + (j / n) * Math.PI * 2
    const dim = ring.off ? 0.25 : 1
    g.globalAlpha = dim
    // the track
    g.strokeStyle = col
    g.lineWidth = ring.id === props.selected ? 2.5 : 1
    g.globalAlpha = dim * (ring.id === props.selected ? 0.8 : 0.3)
    g.beginPath()
    g.arc(R, R, r, 0, Math.PI * 2)
    g.stroke()
    // the arm: from the step playing on to the next, as the loops go by
    const cur = ((step % n) + n) % n
    g.globalAlpha = dim * 0.9
    g.lineWidth = Math.max(2, Math.min(6, gap * 0.25 || 4))
    g.beginPath()
    g.arc(R, R, r, at(cur), at(cur) + (Math.PI * 2 * props.progress) / n)
    g.stroke()
    // the steps
    const dot = Math.max(2.5, Math.min(7, ((Math.PI * 2 * r) / n) * 0.22))
    for (let j = 0; j < n; j++) {
      const x = R + Math.cos(at(j)) * r
      const y = R + Math.sin(at(j)) * r
      g.globalAlpha = dim
      g.beginPath()
      g.arc(x, y, pat[j] ? dot * (1 + (j === cur ? 0.5 * level : 0)) : dot * 0.45, 0, Math.PI * 2)
      if (pat[j]) {
        g.fillStyle = col
        g.shadowColor = col
        g.shadowBlur = j === cur ? 18 : 6
        g.fill()
        g.shadowBlur = 0
      } else {
        g.fillStyle = 'rgba(255,255,255,0.25)'
        g.fill()
      }
      if (j === cur) {
        g.strokeStyle = '#fff'
        g.lineWidth = 1.5
        g.beginPath()
        g.arc(x, y, dot * 1.9, 0, Math.PI * 2)
        g.stroke()
      }
    }
    // its word, at the top
    const idx = ringSounds(ring, step) ? ringWordIndex(ring, step, props.garden.seed) : -1
    const word = idx >= 0 ? ring.words[idx] : '·'
    g.font = `${Math.max(11, Math.min(18, gap * 0.55 || 16))}px VT323, monospace`
    const label = `${ring.locked ? '🔒' : ''}${word}`
    const tw = g.measureText(label).width
    const ly = R - r
    g.globalAlpha = dim
    g.fillStyle = 'rgba(5, 3, 10, 0.85)'
    g.fillRect(R - tw / 2 - 4, ly - 8, tw + 8, 16)
    g.fillStyle = col
    g.fillText(label, R, ly + 1)
    g.globalAlpha = 1
  })
  raf = requestAnimationFrame(draw)
}

/** the ring under a point, and the step nearest it */
function hit(e: MouseEvent | WheelEvent) {
  const c = canvas.value!
  const rect = c.getBoundingClientRect()
  const { R, gap, radius } = geometry()
  const x = e.clientX - rect.left - R
  const y = e.clientY - rect.top - R
  const d = Math.hypot(x, y)
  let best = -1
  let bestD = Infinity
  props.garden.rings.forEach((_, i) => {
    const dd = Math.abs(d - radius(i))
    if (dd < bestD) {
      bestD = dd
      best = i
    }
  })
  if (best < 0 || bestD > Math.max(gap * 0.6, 14)) return null
  const ring = props.garden.rings[best]
  const n = ringPattern(ring).length
  const a = (Math.atan2(y, x) + Math.PI / 2 + Math.PI * 4) % (Math.PI * 2)
  return { ring, step: Math.round((a / (Math.PI * 2)) * n) % n }
}
function onClick(e: MouseEvent) {
  const h = hit(e)
  if (h) emit('select', h.ring.id)
}
function onDbl(e: MouseEvent) {
  const h = hit(e)
  if (h) emit('rotate', h.ring.id, h.step)
}
function onWheel(e: WheelEvent) {
  const h = hit(e)
  if (!h) return
  e.preventDefault()
  emit('hits', h.ring.id, e.deltaY < 0 ? 1 : -1)
}

onMounted(() => (raf = requestAnimationFrame(draw)))
onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<template>
  <canvas
    ref="canvas"
    class="rings"
    title="The rings: click one to edit it · double-click a step to turn the ring so a hit lands there · wheel: more or fewer hits"
    @click="onClick"
    @dblclick="onDbl"
    @wheel="onWheel"
  />
</template>

<style scoped>
.rings {
  display: block;
  width: 100%;
  aspect-ratio: 1;
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 0 30px rgba(126, 255, 180, 0.15), inset 0 0 40px #000;
}
</style>
