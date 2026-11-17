<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { readSound, soundSounding, SCOPE_SAMPLES, watchSound } from '../audio/engine'
import { AudioFeed, SPEC_N } from '../lib/play/shaders'

/**
 * A VCO's meters (Rack.vue). `vu`, on its tab: its level as a 3 px line along the bottom edge, with a peak that falls
 * back slowly. `spectrum`, behind its PLAY column: a faint spectrogram rising from the bottom (low notes at the left,
 * in the VCO's colour, fading out toward the top). Both rest at nothing when the VCO is silent; the loop stops once
 * they have.
 */
const props = defineProps<{ soundId: string; color: string; kind: 'vu' | 'spectrum' }>()
const canvas = ref<HTMLCanvasElement>()
const vu = ref<HTMLElement>()
const peak = ref<HTMLElement>()
const feed = new AudioFeed()
const buf = new Float32Array(SCOPE_SAMPLES)
let seq = 0
let raf = 0
let quiet = 0
let hold = 0
let level = 0
let holdAge = 0
let rgb = [255, 255, 255]

const parse = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) || 0)
watch(() => props.color, (c) => (rgb = parse(c)), { immediate: true })

function size(c: HTMLCanvasElement) {
  const w = Math.max(1, Math.round(c.clientWidth))
  const h = Math.max(1, Math.round(c.clientHeight))
  if (c.width !== w || c.height !== h) {
    c.width = w
    c.height = h
  }
}

function tick() {
  raf = 0
  const c = canvas.value
  const n = readSound(props.soundId, buf)
  const fresh = n > 0 && n !== seq && soundSounding(props.soundId)
  if (n > 0) seq = n
  feed.update(buf, fresh)
  // the level line on a dB scale (-48..0 dBFS over the last block), quick up and slow down like a VU
  let target = 0
  if (fresh) {
    let sum = 0
    for (let i = buf.length - 1024; i < buf.length; i++) sum += buf[i] * buf[i]
    const db = 20 * Math.log10(Math.sqrt(sum / 1024) + 1e-9)
    target = Math.min(1, Math.max(0, (db + 48) / 48))
  }
  level = target > level ? level + (target - level) * 0.5 : level + (target - level) * 0.08
  const lv = level
  // the level line, and its peak falling back after a moment
  if (lv >= hold) {
    hold = lv
    holdAge = 0
  } else if (++holdAge > 45) hold = Math.max(lv, hold - 0.012)
  if (vu.value) vu.value.style.clipPath = `inset(0 ${((1 - Math.min(1, lv)) * 100).toFixed(1)}% 0 0)`
  if (peak.value) {
    peak.value.style.left = `calc(${Math.min(1, hold) * 100}% - 2px)`
    peak.value.style.opacity = hold > 0.02 ? '1' : '0'
  }
  // the spectrogram: a 2 px row each frame along the bottom, the rest moved up (a column's height in a few seconds)
  if (c) {
    size(c)
    const g = c.getContext('2d')!
    const { width: w, height: h } = c
    g.globalCompositeOperation = 'copy'
    g.drawImage(c, 0, -2)
    g.globalCompositeOperation = 'source-over'
    g.clearRect(0, h - 2, w, 2)
    const [r, gg, b] = rgb
    for (let x = 0; x < w; x++) {
      // low notes at the left; the bands log-spaced already, the top few (air) left out
      const band = Math.min(SPEC_N - 1, Math.floor((x / w) * SPEC_N * 0.9))
      const v = feed.spec[band] / 255
      if (v < 0.04) continue
      g.fillStyle = `rgba(${r},${gg},${b},${(v * v).toFixed(3)})`
      g.fillRect(x, h - 2, 1, 2)
    }
  }
  // asleep once silent and drawn out
  quiet = lv < 0.002 && feed.level < 0.002 && !fresh ? quiet + 1 : 0
  if (quiet < 600) raf = requestAnimationFrame(tick)
}
function wake() {
  quiet = 0
  if (!raf) raf = requestAnimationFrame(tick)
}

let unwatch: (() => void) | null = null
let poll = 0
watch(
  () => props.soundId,
  (id) => {
    unwatch?.()
    unwatch = watchSound(id)
    seq = 0
    wake()
  },
)
onMounted(() => {
  unwatch = watchSound(props.soundId)
  wake()
  // a sleeping meter looks in now and then for the VCO starting again
  poll = window.setInterval(() => {
    if (!raf && soundSounding(props.soundId)) wake()
  }, 150)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  clearInterval(poll)
  unwatch?.()
})
</script>

<template>
  <span class="meter" :class="kind" aria-hidden="true" :style="{ '--vco': color }">
    <canvas v-if="kind === 'spectrum'" ref="canvas" class="spec" />
    <template v-else>
      <i ref="vu" class="vu" />
      <i ref="peak" class="peak" />
    </template>
  </span>
</template>

<style scoped>
.meter {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: inherit;
  pointer-events: none;
}
.spec {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0.42;
  /* rising from the bottom, fading out as it goes up, so the newest reads strongest */
  mask-image: linear-gradient(0deg, #000 0%, #000 25%, transparent 92%);
  filter: blur(1px) saturate(0.85);
  mix-blend-mode: screen;
}
.vu {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 3px;
  clip-path: inset(0 100% 0 0);
  background: linear-gradient(90deg, var(--c-success) 0%, var(--c-success) 62%, var(--c-primary) 82%, var(--c-danger) 100%);
  box-shadow: 0 0 5px color-mix(in srgb, var(--c-success) 60%, transparent);
}
.peak {
  position: absolute;
  bottom: 0;
  width: 2px;
  height: 3px;
  opacity: 0;
  background: var(--vco);
  box-shadow: 0 0 4px var(--vco);
  transition: opacity 200ms;
}
</style>
