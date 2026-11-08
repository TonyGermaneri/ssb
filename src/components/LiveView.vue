<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { activeVoices, readSound, SCOPE_SAMPLES, soundRate, soundSounding, watchSound } from '../audio/engine'
import { Spectrum } from '../lib/fft'
import { useBoard } from '../stores/board'
import { defaultScopeKnobs, type Sound } from '../types'
import TvKnob from './TvKnob.vue'
import WaveViewPicker from './WaveViewPicker.vue'

/**
 * A sound's display, live: what its voices play (summed, post-filter, as a VCO feeds the matrix) as
 * - SCOPE: a 1960s set -- a P31 phosphor trace with persistence and bloom behind a curved, vignetted, scan-lined tube,
 *   in a walnut cabinet whose tiny front-panel knobs set BLOOM, CONTRAST, TRAILS and TINT (a 60s TV's tint: green to
 *   purple, not a hue);
 * - BARS: a 90s spectrum analyser, LED segments that jump and fall, peak caps that hang;
 * - SPECTRO: a spectrogram, RX-style: time scrolling left, log frequency up, loudness as heat.
 * In the plugin the engine sends the audio (Engine::readScope, ~30 times a second); in the page, the voices' taps.
 */
const props = defineProps<{ sound: Sound; hue: number; height: number; width?: number; readonly?: boolean }>()
const board = useBoard()
type Live = 'scope' | 'bars' | 'spectro'
const kind = computed(() => board.master.waveView as Live)
const knobs = computed(() => board.master.scope ?? defaultScopeKnobs())
const H = computed(() => props.height)
const wrap = ref<HTMLDivElement>()
const W = ref(props.width ?? 386)
// a given width (the Play view's big view) is followed as it changes: the set takes whatever shape it's given
watch(
  () => props.width,
  (w) => {
    if (w) W.value = w
  },
)
const cv = ref<HTMLCanvasElement>()
const grat = ref<HTMLCanvasElement>()

// ── the set's layout: cabinet edge, the tube, the front panel (none on the header's little ones) ──
const tv = computed(() => kind.value === 'scope')
const compact = computed(() => H.value < 44)
const edge = computed(() => (!tv.value ? 0 : compact.value ? 2 : 3))
const panelW = computed(() => (!tv.value || props.readonly || compact.value ? 0 : H.value > 60 ? 41 : 37))
const gap = computed(() => (panelW.value ? 3 : 0))
/** the tube's (or the screen's) size, CSS px */
/** (on the set: inside its edge and the tube's 1 px chrome ring) */
const ring = computed(() => (tv.value ? 2 : 0))
const sw = computed(() => Math.max(20, W.value - 2 * edge.value - ring.value - panelW.value - gap.value))
const sh = computed(() => Math.max(12, H.value - 2 * edge.value - ring.value))
/** a 60s tube: a rectangle with big rounded corners and bulging sides (its radii from its height, however wide) */
const tubeRadius = computed(() => `${Math.round(sh.value * 0.3)}px / ${Math.round(sh.value * 0.36)}px`)
const ringRadius = computed(() => `${Math.round(sh.value * 0.3) + 1}px / ${Math.round(sh.value * 0.36) + 1}px`)

// ── analysis ──
const samples = new Float32Array(SCOPE_SAMPLES)
const fft = new Spectrum(SCOPE_SAMPLES)
let seq = 0
let fftSeq = -1
function analyse() {
  if (seq !== fftSeq) {
    fft.run(samples)
    fftSeq = seq
  }
}

// ── the phosphor's colour: the TINT knob swings it from green to purple through P31's own ──
const lerp = (a: number[], b: number[], t: number) => a.map((x, i) => Math.round(x + (b[i] - x) * t))
const GREEN = [46, 255, 72]
const P31 = [118, 255, 150]
const PURPLE = [214, 118, 255]
const phosphor = computed(() => {
  const t = knobs.value.tint
  return t < 0.5 ? lerp(GREEN, P31, t * 2) : lerp(P31, PURPLE, (t - 0.5) * 2)
})
const rgb = (c: number[], a = 1) => `rgba(${c[0]},${c[1]},${c[2]},${a})`

// ── scope: a stable trace (trigger on the period), automatic gain ──
let period = 0
let periodAge = 99
let gainPeak = 0.1
/** YIN on a decimated copy: the period in samples, or 0 (noise, silence) */
function findPeriod(x: Float32Array, rate: number): number {
  const d = Math.max(1, Math.round(rate / 12000))
  const n = Math.floor(x.length / d)
  const y = new Float32Array(n)
  for (let i = 0; i < n; i++) y[i] = x[i * d]
  const minLag = Math.max(2, Math.floor(rate / d / 2000))
  const maxLag = Math.min(Math.floor(n / 2), Math.ceil(rate / d / 28))
  const w = n - maxLag
  let run = 0
  let best = 0
  let bestV = 1
  for (let lag = 1; lag <= maxLag; lag++) {
    let sum = 0
    for (let i = 0; i < w; i++) {
      const e = y[i] - y[i + lag]
      sum += e * e
    }
    run += sum
    const v = run > 0 ? (sum * lag) / run : 1
    if (lag < minLag) continue
    if (v < 0.15) {
      // the bottom of this first dip
      let l = lag
      let lv = v
      for (let k = lag + 1; k <= maxLag; k++) {
        let s2 = 0
        for (let i = 0; i < w; i++) {
          const e = y[i] - y[i + k]
          s2 += e * e
        }
        run += s2
        const v2 = run > 0 ? (s2 * k) / run : 1
        if (v2 > lv) break
        l = k
        lv = v2
      }
      return l * d
    }
    if (v < bestV) {
      bestV = v
      best = lag
    }
  }
  return bestV < 0.35 ? best * d : 0
}

/** where the trace starts and how long it is: a rising crossing a whole number of periods back, so it holds still */
function traceWindow(x: Float32Array, rate: number, cycles: number): [number, number] {
  const n = x.length
  const len = period > 0 ? Math.min(Math.floor(n * 0.6), Math.max(64, Math.round(period * cycles))) : Math.min(Math.floor(n * 0.6), Math.round(rate * 0.012))
  const last = n - len - 1
  if (period <= 0) return [last, len]
  // among the rising zero crossings of the last period before the end, the steepest: the same point of the wave
  let at = last
  let steep = 0
  for (let i = Math.max(2, Math.floor(last - period)); i <= last; i++) {
    if (x[i - 1] < 0 && x[i] >= 0) {
      const s = x[Math.min(n - 1, i + 2)] - x[i - 2]
      if (s > steep) {
        steep = s
        at = i
      }
    }
  }
  return [at, len]
}

function drawScope(g: CanvasRenderingContext2D, w: number, h: number, dpr: number, live: boolean) {
  const k = knobs.value
  // persistence: what was drawn fades a little each frame (TRAILS: from a blink to seconds)
  g.globalCompositeOperation = 'destination-out'
  g.fillStyle = `rgba(0,0,0,${0.6 - 0.54 * k.trails})`
  g.fillRect(0, 0, w, h)
  g.globalCompositeOperation = 'lighter'
  const rate = soundRate()
  let peak = 0
  for (let i = 0; i < samples.length; i++) peak = Math.max(peak, Math.abs(samples[i]))
  const mid = h / 2
  const pts: number[] = []
  if (!live || peak < 1e-4) {
    // no signal: the beam sweeps a flat line, trembling a little
    for (let x = 0; x <= w; x += 3 * dpr) pts.push(x, mid + (Math.random() - 0.5) * 0.5 * dpr)
    period = 0
  } else {
    if (++periodAge > 6 || period <= 0) {
      period = findPeriod(samples, rate)
      periodAge = 0
    }
    gainPeak = Math.max(peak, gainPeak * 0.985)
    const gain = (0.36 * h) / Math.max(0.03, gainPeak)
    const [a, len] = traceWindow(samples, rate, w / dpr < 130 ? 2 : 3)
    const steps = Math.min(len, Math.round(w / dpr) * 2)
    for (let s = 0; s <= steps; s++) {
      const f = a + (s / steps) * len
      const i = Math.floor(f)
      const v = samples[i] + (samples[Math.min(samples.length - 1, i + 1)] - samples[i]) * (f - i)
      pts.push((s / steps) * w, mid - v * gain)
    }
  }
  // the beam is brightest where it moves slowest: segments sorted by length into three intensities
  const col = phosphor.value
  const paths = [new Path2D(), new Path2D(), new Path2D()]
  for (let i = 2; i < pts.length; i += 2) {
    const dx = pts[i] - pts[i - 2]
    const dy = pts[i + 1] - pts[i - 1]
    const len = Math.hypot(dx, dy) / dpr
    const p = paths[len < 2.5 ? 0 : len < 7 ? 1 : 2]
    p.moveTo(pts[i - 2], pts[i - 1])
    p.lineTo(pts[i], pts[i + 1])
  }
  g.lineCap = 'round'
  g.lineJoin = 'round'
  g.shadowColor = rgb(col, 0.9)
  g.shadowBlur = (1.5 + k.bloom * 9) * dpr
  g.lineWidth = (0.8 + k.bloom * 1.1) * dpr
  const alpha = [0.7, 0.45, 0.26]
  paths.forEach((p, i) => {
    g.strokeStyle = rgb(col, alpha[i])
    g.stroke(p)
  })
  // the hot core of the beam
  g.shadowBlur = 0
  g.lineWidth = 0.55 * dpr
  const core = lerp(col, [255, 255, 255], 0.55)
  paths.forEach((p, i) => {
    g.strokeStyle = rgb(core, alpha[i] * 0.8)
    g.stroke(p)
  })
  g.globalCompositeOperation = 'source-over'
}

/** the graticule etched on the tube's face: 10 × 8, minor ticks along the axes */
function drawGraticule() {
  const c = grat.value
  if (!c) return
  const dpr = window.devicePixelRatio || 1
  const w = Math.round(sw.value * dpr)
  const h = Math.round(sh.value * dpr)
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  g.clearRect(0, 0, w, h)
  const col = phosphor.value
  g.strokeStyle = rgb(col, 0.13)
  g.lineWidth = Math.max(1, dpr * 0.6)
  const cols = compact.value ? 6 : 10
  const rows = compact.value ? 4 : 8
  g.beginPath()
  for (let i = 1; i < cols; i++) {
    const x = Math.round((i / cols) * w) + 0.5
    g.moveTo(x, 0)
    g.lineTo(x, h)
  }
  for (let j = 1; j < rows; j++) {
    const y = Math.round((j / rows) * h) + 0.5
    g.moveTo(0, y)
    g.lineTo(w, y)
  }
  g.stroke()
  if (compact.value) return
  g.strokeStyle = rgb(col, 0.2)
  g.beginPath()
  for (let i = 0; i <= cols * 5; i++) {
    const x = Math.round((i / (cols * 5)) * w) + 0.5
    g.moveTo(x, h / 2 - 1.5 * dpr)
    g.lineTo(x, h / 2 + 1.5 * dpr)
  }
  for (let j = 0; j <= rows * 5; j++) {
    const y = Math.round((j / (rows * 5)) * h) + 0.5
    g.moveTo(w / 2 - 1.5 * dpr, y)
    g.lineTo(w / 2 + 1.5 * dpr, y)
  }
  g.stroke()
}

// ── bars: log bands, LED segments, peak caps that hang then fall ──
let bars = new Float32Array(0)
let caps = new Float32Array(0)
let capHold = new Float32Array(0)
const BAND_LO = 40
const BAND_HI = 16000
function drawBars(g: CanvasRenderingContext2D, w: number, h: number, dpr: number, dt: number, live: boolean) {
  const cssW = w / dpr
  const n = Math.max(8, Math.min(40, Math.floor(cssW / 8)))
  if (bars.length !== n) {
    bars = new Float32Array(n)
    caps = new Float32Array(n)
    capHold = new Float32Array(n)
  }
  const rate = soundRate()
  if (live) analyse()
  const hi = Math.min(BAND_HI, rate * 0.45)
  for (let b = 0; b < n; b++) {
    const f0 = BAND_LO * Math.pow(hi / BAND_LO, b / n)
    const f1 = BAND_LO * Math.pow(hi / BAND_LO, (b + 1) / n)
    // a gentle tilt (+3 dB an octave above 1 kHz, as the 90s boxes had) so a bright sound's top shows
    const tilt = 3 * Math.log2(Math.sqrt(f0 * f1) / 1000)
    const db = live ? fft.peak(f0, f1, rate) + tilt : -120
    const v = Math.min(1, Math.max(0, (db + 66) / 66))
    bars[b] = v >= bars[b] ? v : Math.max(v, bars[b] - 1.7 * dt)
    if (bars[b] >= caps[b]) {
      caps[b] = bars[b]
      capHold[b] = 0.45
    } else if ((capHold[b] -= dt) < 0) caps[b] = Math.max(bars[b], caps[b] - 0.7 * dt)
  }
  g.clearRect(0, 0, w, h)
  const gapX = Math.max(1, Math.round(dpr * 1.5))
  const bw = (w - gapX * (n + 1)) / n
  const seg = Math.max(2, Math.round(2 * dpr))
  const segGap = Math.max(1, Math.round(dpr))
  const rows = Math.floor((h - segGap) / (seg + segGap))
  for (let b = 0; b < n; b++) {
    const x = gapX + b * (bw + gapX)
    const lit = Math.round(bars[b] * rows)
    for (let r = 0; r < rows; r++) {
      const y = h - (r + 1) * (seg + segGap)
      const f = r / (rows - 1)
      // green, then yellow, then the red at the top
      const c = f < 0.6 ? [40, 230, 60] : f < 0.85 ? [235, 225, 40] : [255, 60, 40]
      g.fillStyle = rgb(c, r < lit ? 0.95 : 0.07)
      g.fillRect(x, y, bw, seg)
    }
    const capRow = Math.min(rows - 1, Math.round(caps[b] * rows))
    if (caps[b] > 0.02) {
      g.fillStyle = 'rgba(235,240,255,0.9)'
      g.fillRect(x, h - (capRow + 1) * (seg + segGap) - segGap, bw, Math.max(1, Math.round(dpr)))
    }
  }
}

// ── spectro: a column a frame, scrolled left; rows log-spaced in frequency; RX's colours ──
const SPEC_LO = 30
const SPEC_DB = 96
/** black, navy, violet, magenta, red, orange, pale yellow, white */
const HEAT = [
  [0, [0, 0, 0]],
  [0.14, [8, 8, 52]],
  [0.32, [58, 16, 112]],
  [0.5, [140, 41, 129]],
  [0.66, [222, 73, 104]],
  [0.8, [254, 159, 109]],
  [0.93, [252, 253, 191]],
  [1, [255, 255, 255]],
] as const
const lut = (() => {
  const out = new Uint8ClampedArray(256 * 3)
  for (let i = 0; i < 256; i++) {
    const t = i / 255
    let j = 0
    while (j < HEAT.length - 2 && t > HEAT[j + 1][0]) j++
    const [t0, c0] = HEAT[j]
    const [t1, c1] = HEAT[j + 1]
    const f = (t - t0) / (t1 - t0)
    for (let k = 0; k < 3; k++) out[i * 3 + k] = c0[k] + (c1[k] - c0[k]) * f
  }
  return out
})()
let column: ImageData | null = null
function drawSpectro(g: CanvasRenderingContext2D, w: number, h: number, dpr: number, live: boolean) {
  const step = Math.max(1, Math.round(dpr))
  // scroll what's there one column left
  g.globalCompositeOperation = 'copy'
  g.drawImage(g.canvas, step, 0, w - step, h, 0, 0, w - step, h)
  g.globalCompositeOperation = 'source-over'
  if (!column || column.height !== h || column.width !== step) column = g.createImageData(step, h)
  const d = column.data
  const rate = soundRate()
  const top = Math.min(20000, rate * 0.48)
  if (live) analyse()
  for (let y = 0; y < h; y++) {
    let v = 0
    if (live) {
      const f0 = SPEC_LO * Math.pow(top / SPEC_LO, 1 - (y + 1) / h)
      const f1 = SPEC_LO * Math.pow(top / SPEC_LO, 1 - y / h)
      v = Math.min(1, Math.max(0, (fft.peak(f0, f1, rate) + SPEC_DB) / SPEC_DB))
    }
    const c = Math.round(v * 255) * 3
    for (let x = 0; x < step; x++) {
      const o = (y * step + x) * 4
      d[o] = lut[c]
      d[o + 1] = lut[c + 1]
      d[o + 2] = lut[c + 2]
      d[o + 3] = 255
    }
  }
  g.putImageData(column, w - step, 0)
}
/** the frequency scale beside it: where 100 Hz, 1 k and 10 k sit */
const specMarks = computed(() => {
  const top = Math.min(20000, soundRate() * 0.48)
  return [100, 1000, 10000]
    .filter((f) => f < top)
    .map((f) => ({ f, label: f >= 1000 ? `${f / 1000}k` : `${f}`, y: (1 - Math.log(f / SPEC_LO) / Math.log(top / SPEC_LO)) * sh.value }))
})

// ── the frame loop: while the sound sounds, and a moment after (trails fade, bars fall, the spectrogram scrolls out) ──
let raf = 0
let lastT = 0
let rest = 0
let visible = true
const ownVoices = computed(() => activeVoices.value.some((v) => v.soundId === props.sound.id))
function frame(t: number) {
  raf = 0
  const c = cv.value
  if (!c) return
  const dpr = window.devicePixelRatio || 1
  const w = Math.round(sw.value * dpr)
  const h = Math.round(sh.value * dpr)
  if (c.width !== w || c.height !== h) {
    c.width = w
    c.height = h
    bars = new Float32Array(0)
  }
  const g = c.getContext('2d')!
  const dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 1 / 60
  lastT = t
  const got = readSound(props.sound.id, samples)
  const live = got > 0 && soundSounding(props.sound.id)
  if (got > 0) seq = got
  if (kind.value === 'scope') drawScope(g, w, h, dpr, live)
  else if (kind.value === 'bars') drawBars(g, w, h, dpr, dt, live)
  else drawSpectro(g, w, h, dpr, live)
  // at rest: a flat beam settles in about a second; bars fall in under one; a spectrogram scrolls itself out
  rest = live ? 0 : rest + 1
  const settle = kind.value === 'spectro' ? Math.ceil(w / Math.max(1, Math.round(dpr))) + 2 : 90
  if (rest < settle) schedule()
}
function schedule() {
  if (raf || !visible) return
  raf = requestAnimationFrame(frame)
}
function wake() {
  rest = 0
  lastT = 0
  schedule()
}

let unwatch = () => {}
let ro: ResizeObserver | undefined
let io: IntersectionObserver | undefined
onMounted(() => {
  if (!props.width) {
    const measure = () => (W.value = Math.max(80, wrap.value?.clientWidth ?? 386))
    measure()
    ro = new ResizeObserver(measure)
    if (wrap.value) ro.observe(wrap.value)
  }
  io = new IntersectionObserver((es) => {
    visible = es.some((e) => e.isIntersecting)
    if (visible) wake()
  })
  if (wrap.value) io.observe(wrap.value)
  drawGraticule()
  wake()
})
watch(
  () => props.sound.id,
  (id) => {
    unwatch()
    unwatch = watchSound(id)
    wake()
  },
  { immediate: true },
)
watch(ownVoices, (on) => on && wake())
watch([kind, sw, sh], () => {
  const c = cv.value
  c?.getContext('2d')?.clearRect(0, 0, c.width, c.height)
  wake()
})
watch([sw, sh, phosphor, compact, tv], () => requestAnimationFrame(drawGraticule))
watch(knobs, wake, { deep: true })
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  raf = 0
  unwatch()
  ro?.disconnect()
  io?.disconnect()
})

// the set's knobs (every scope alike, kept with the board, and with a plugin instance's view)
const DEFAULTS = defaultScopeKnobs()
const set = (k: keyof typeof DEFAULTS, v: number) => (board.master.scope = { ...knobs.value, [k]: v })
/** contrast: the tube's own (a CSS filter on the face: low is a washed-out grey, high a hard black) */
const faceFilter = computed(() => {
  const c = knobs.value.contrast
  return `contrast(${(0.5 + c * 1.15).toFixed(3)}) brightness(${(0.82 + c * 0.32).toFixed(3)}) saturate(${(0.75 + c * 0.5).toFixed(3)})`
})
</script>

<template>
  <div
    ref="wrap"
    class="liveview"
    :class="[kind, { compact, readonly }]"
    :style="{ width: props.width ? `${W}px` : '100%', height: `${H}px`, '--phos': rgb(phosphor), '--edge': `${edge}px` }"
  >
    <!-- the 1960s set: walnut cabinet, chrome ring, the curved tube; its front panel to the right -->
    <template v-if="tv">
      <div class="cabinet">
        <div class="ring" :style="{ borderRadius: ringRadius }">
          <div class="tube" :style="{ width: `${sw}px`, height: `${sh}px`, filter: faceFilter, borderRadius: tubeRadius }">
            <canvas ref="grat" class="layer" :style="{ width: `${sw}px`, height: `${sh}px` }" />
            <canvas ref="cv" class="layer" :style="{ width: `${sw}px`, height: `${sh}px` }" />
            <i class="scan" />
            <i class="roll" />
            <i class="vignette" />
            <i class="glass" />
          </div>
        </div>
        <div v-if="panelW" class="front" :style="{ width: `${panelW}px` }">
          <WaveViewPicker tv />
          <div class="knobs">
            <TvKnob :model-value="knobs.bloom" label="Bloom" :default="DEFAULTS.bloom" title="BLOOM: how far the beam's glow spreads" @update:model-value="(v: number) => set('bloom', v)" />
            <TvKnob :model-value="knobs.contrast" label="Contrast" :default="DEFAULTS.contrast" title="CONTRAST: washed-out grey to hard black" @update:model-value="(v: number) => set('contrast', v)" />
            <TvKnob :model-value="knobs.trails" label="Trails" :default="DEFAULTS.trails" title="TRAILS: how long the phosphor glows after the beam has gone" @update:model-value="(v: number) => set('trails', v)" />
            <TvKnob :model-value="knobs.tint" label="Tint" :default="DEFAULTS.tint" title="TINT: green to purple, as a 1960s set's" @update:model-value="(v: number) => set('tint', v)" />
          </div>
          <div v-if="H > 60" class="grille" />
          <span class="badge">Solid State</span>
        </div>
      </div>
    </template>
    <!-- bars / spectro: a plain screen -->
    <div v-else class="screen" :style="{ width: `${sw}px`, height: `${sh}px` }">
      <canvas ref="cv" class="layer" :style="{ width: `${sw}px`, height: `${sh}px` }" />
      <template v-if="kind === 'spectro' && !compact">
        <span v-for="m in specMarks" :key="m.f" class="mark" :style="{ top: `${m.y}px` }">{{ m.label }}</span>
      </template>
      <WaveViewPicker v-if="!readonly" class="corner" />
    </div>
  </div>
</template>

<style scoped>
.liveview {
  position: relative;
  max-width: 100%;
  /* worn print: a noise mask that rubs letters half away (the panel's labels) */
  --worn: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='30'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='3'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -2.4 2.1'/%3E%3C/filter%3E%3Crect width='60' height='30' filter='url(%23n)'/%3E%3C/svg%3E");
}
.layer {
  position: absolute;
  inset: 0;
  display: block;
}

/* ── the cabinet: walnut veneer, grain and grime, edges worn pale ── */
.cabinet {
  display: flex;
  align-items: stretch;
  gap: 3px;
  height: 100%;
  padding: var(--edge);
  border-radius: 6px;
  background:
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='80'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.006 0.32' numOctaves='3' seed='11'/%3E%3CfeColorMatrix values='0 0 0 0 0.12 0 0 0 0 0.06 0 0 0 0 0.02 0 0 0 1.1 -0.35'/%3E%3C/filter%3E%3Crect width='240' height='80' filter='url(%23g)'/%3E%3C/svg%3E"),
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='90' height='90'%3E%3Cfilter id='d'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='1.6' numOctaves='1' seed='5'/%3E%3CfeColorMatrix values='0 0 0 0 0.85 0 0 0 0 0.78 0 0 0 0 0.62 0 0 0 9 -8.2'/%3E%3C/filter%3E%3Crect width='90' height='90' filter='url(%23d)'/%3E%3C/svg%3E"),
    linear-gradient(175deg, #7a4a2b 0%, #5b3420 45%, #3f2414 100%);
  box-shadow:
    inset 0 1px 0 rgba(255, 214, 170, 0.28),
    inset 0 -1px 0 rgba(0, 0, 0, 0.5),
    inset 1px 0 0 rgba(255, 214, 170, 0.12),
    0 1px 2px rgba(0, 0, 0, 0.7),
    0 0 0 1px #1c0f07;
}
.compact .cabinet {
  border-radius: 4px;
}
/* a chrome ring round the tube, gone dull and pitted */
.ring {
  flex: none;
  padding: 1px;
  border-radius: 16% / 24%;
  background: linear-gradient(135deg, #f1ead8 0%, #8f897a 28%, #e4ddca 52%, #6f6a5e 76%, #cfc7b2 100%);
  box-shadow:
    0 0 0 0.5px #2a1a0f,
    0 1px 1.5px rgba(0, 0, 0, 0.8);
}
/* the tube: a curved, rounded-off rectangle, the phosphor's own glow in the glass */
.tube {
  position: relative;
  overflow: hidden;
  border-radius: 15% / 23%;
  background:
    radial-gradient(ellipse at 50% 45%, color-mix(in srgb, var(--phos) 11%, #070a07) 0%, #030503 70%, #010201 100%);
  box-shadow: inset 0 0 6px 2px rgba(0, 0, 0, 0.9);
}
.tube i {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
.scan {
  background: repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.42) 0 1px, transparent 1px 2.5px);
}
/* the hum bar, rolling slowly down the screen (a transform: the compositor moves it, nothing repaints) */
.tube i.roll {
  inset: auto 0;
  top: -100%;
  height: 100%;
  background: linear-gradient(180deg, transparent 0%, color-mix(in srgb, var(--phos) 6%, transparent) 50%, transparent 100%);
  animation: roll 7.5s linear infinite;
}
@keyframes roll {
  from { transform: translateY(0); }
  to { transform: translateY(200%); }
}
.vignette {
  background: radial-gradient(ellipse at 50% 50%, transparent 48%, rgba(0, 0, 0, 0.55) 78%, rgba(0, 0, 0, 0.92) 100%);
}
/* the glass bulging toward you: a soft highlight top left, a darker lower edge */
.glass {
  background:
    radial-gradient(ellipse at 28% 18%, rgba(255, 255, 255, 0.13) 0%, transparent 38%),
    linear-gradient(180deg, transparent 70%, rgba(0, 0, 0, 0.25) 100%);
}

/* ── the front panel: brushed aluminium gone yellow, grime in the corners ── */
.front {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 1.5px;
  padding: 2px 2px 1.5px 3px;
  border-radius: 3px;
  background:
    url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='80'%3E%3Cfilter id='s'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.04 0.7' numOctaves='2' seed='2'/%3E%3CfeColorMatrix values='0 0 0 0 0.3 0 0 0 0 0.27 0 0 0 0 0.2 0 0 0 0.7 -0.36'/%3E%3C/filter%3E%3Crect width='60' height='80' filter='url(%23s)'/%3E%3C/svg%3E"),
    radial-gradient(ellipse at 50% 120%, rgba(60, 45, 20, 0.45), transparent 60%),
    linear-gradient(180deg, #cfc4a6 0%, #b3a888 50%, #998e70 100%);
  box-shadow:
    inset 0 0.5px 0 rgba(255, 252, 235, 0.55),
    inset 0 -0.5px 0 rgba(40, 30, 15, 0.6),
    0 0 0 0.5px #2a1a0f,
    0 1px 1.5px rgba(0, 0, 0, 0.7);
}
.knobs {
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  flex: 1;
  min-height: 0;
}
.grille {
  flex: none;
  height: 9px;
  margin: 0 1px;
  border-radius: 1px;
  background: repeating-linear-gradient(90deg, #2a2116 0 1px, #8d8268 1px 2px);
  box-shadow: inset 0 0 1px rgba(0, 0, 0, 0.8);
  opacity: 0.8;
}
.badge {
  flex: none;
  overflow: hidden;
  white-space: nowrap;
  text-align: center;
  font-family: 'Didot', 'Bodoni 72', 'Georgia', serif;
  font-style: italic;
  font-size: 4.2px;
  line-height: 4.5px;
  letter-spacing: 0.04em;
  color: rgba(120, 30, 20, 0.7);
  -webkit-mask-image: var(--worn);
  mask-image: var(--worn);
  -webkit-mask-size: 50px 25px;
  mask-size: 50px 25px;
}

/* ── bars, spectro: a plain dark screen ── */
.screen {
  position: relative;
  overflow: hidden;
  border-radius: 3px;
  background: #020302;
  box-shadow:
    inset 0 0 12px rgba(0, 0, 0, 0.9),
    inset 0 0 0 1px color-mix(in srgb, var(--c-success) 15%, transparent);
}
.bars .screen {
  background:
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0.025) 0 1px, transparent 1px 8px),
    linear-gradient(180deg, #050608, #010102);
}
.mark {
  position: absolute;
  left: 7px;
  transform: translateY(-50%);
  font-family: 'VT323', monospace;
  font-size: 10px;
  line-height: 10px;
  color: rgba(255, 255, 255, 0.45);
  text-shadow: 0 0 2px #000;
  pointer-events: none;
}
.mark::before {
  content: '';
  position: absolute;
  right: calc(100% + 1px);
  top: 50%;
  width: 4px;
  height: 1px;
  background: rgba(255, 255, 255, 0.35);
}
.corner {
  position: absolute;
  top: 3px;
  right: 3px;
}
</style>
