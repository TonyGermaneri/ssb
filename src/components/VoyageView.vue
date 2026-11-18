<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { activeVoices, clock, getBuffer, hasAudio, readSound, SCOPE_SAMPLES, soundSounding, stitch, watchSound } from '../audio/engine'
import { useBoard } from '../stores/board'
import { useGarden } from '../stores/garden'
import { padControl } from '../lib/play/padControl'
import { AudioFeed } from '../lib/play/shaders'
import { Field, MAX_ROCKS, shipPose, type Port, type Rock } from '../lib/voyage/field'
import { PART_HELP, rgb, SHIP_BOX, type Part } from '../lib/voyage/ship'
import { DEFAULT_ERA, eraOf, ERAS } from '../lib/voyage/eras'
import { Space } from '../lib/voyage/space'
import { voyageFades } from '../lib/voyage/stitch'
import type { Sound } from '../types'
import Knob from './Knob.vue'
import PadSettings from './PadSettings.vue'
import VoyageShip, { type ShipVco } from './VoyageShip.vue'

/**
 * VOYAGE: the PLAY view as a voyage, full screen (VCO 1's PERFORM settings choose it). The three VCOs' pads are the
 * working parts of a ship (VoyageShip.vue) bobbing through a technicolor sky (lib/voyage/space.ts). Rocks drift past,
 * each meant for one VCO and carrying a sound from the samples list (as the list shows, filtered); when one drifts
 * near its VCO's tractor port -- the top of the bow's or the stern's dome, the bottom of midships' -- the port locks
 * on, pulls it in, and the VCO takes its sound, crossfaded into whatever's sounding (as the garden stitches). A VCO
 * whose garden grows catches PODS instead: its next clip, in early. After a catch a port rests (GAP) before the next.
 * A click on a rock beams it in from wherever it is.
 */
const board = useBoard()
const garden = useGarden()

// ── the viewer's settings (theirs, not the patch's) ──
interface Prefs {
  era: string
  gap: number
  density: number
  fade: number
  amount: number
  trails: number
  steady: boolean
  beams: boolean[]
}
const KEY = 'ssb:voyage'
const DEFAULTS: Prefs = { era: DEFAULT_ERA, gap: 20, density: 0.5, fade: 3, amount: 0.85, trails: 0.6, steady: false, beams: [true, true, true] }
function loadPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return { ...DEFAULTS, ...raw, beams: [0, 1, 2].map((i) => raw?.beams?.[i] !== false) }
  } catch {
    return { ...DEFAULTS, beams: [...DEFAULTS.beams] }
  }
}
const prefs = reactive(loadPrefs())
watch(
  prefs,
  () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs))
    } catch {
      /* a private window: not remembered */
    }
  },
  { deep: true },
)

// ── the ship: the era's ──
const era = computed(() => eraOf(prefs.era))
const PALETTES_OF = () => era.value.palettes
/** the sky's warp when the era changes (s since) */
let warpAt = -9
watch(
  () => prefs.era,
  () => {
    warpAt = t
    field.rocks = []
  },
)
function stepEra(d: number) {
  const i = ERAS.findIndex((e) => e.id === era.value.id)
  prefs.era = ERAS[(i + d + ERAS.length) % ERAS.length].id
}

// ── the VCOs, as the ship needs them ──
const slots = computed(() => board.selectedPatch?.slots ?? [null, null, null])
const layerOf = (i: number): Sound | undefined => {
  const x = slots.value[i]
  return x ? board.layerSound(x.layer) : undefined
}
const soundingIds = computed(() => new Set(activeVoices.value.map((v) => v.soundId)))
const feeds = [new AudioFeed(), new AudioFeed(), new AudioFeed()]
const scope = new Float32Array(SCOPE_SAMPLES)
const scopeSeq = [0, 0, 0]

/** min / max per column of a clip (the windows' picture), kept while it's the same */
const peakCache = new Map<string, Float32Array>()
function peaksOf(sound: Sound, columns: number): Float32Array | null {
  const buf = getBuffer(sound.audioId)
  if (!buf) return null
  const a = Math.min(sound.settings.clipIn, sound.settings.clipOut)
  const b = Math.max(sound.settings.clipIn, sound.settings.clipOut)
  const key = `${sound.audioId}|${a}|${b}|${columns}`
  const hit = peakCache.get(key)
  if (hit) return hit
  const data = buf.getChannelData(0)
  const from = Math.floor(a * data.length)
  const to = Math.max(from + 1, Math.floor(b * data.length))
  const out = new Float32Array(columns * 2)
  let peak = 1e-6
  for (let c = 0; c < columns; c++) {
    const i0 = from + Math.floor(((to - from) * c) / columns)
    const i1 = Math.max(i0 + 1, from + Math.floor(((to - from) * (c + 1)) / columns))
    let lo = 1
    let hi = -1
    for (let i = i0; i < i1; i += Math.max(1, Math.floor((i1 - i0) / 64))) {
      const v = data[i]
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
    out[c * 2] = lo
    out[c * 2 + 1] = hi
    peak = Math.max(peak, Math.abs(lo), Math.abs(hi))
  }
  for (let i = 0; i < out.length; i++) out[i] /= peak
  if (peakCache.size > 12) peakCache.clear()
  peakCache.set(key, out)
  return out
}

const controls = [0, 1, 2].map((i) => padControl({ sound: () => layerOf(i)!, bpm: () => board.bpm }))
const vcos = computed<(ShipVco | null)[]>(() =>
  [0, 1, 2].map((i) => {
    const sound = layerOf(i)
    if (!sound) return null
    return {
      sound,
      pads: controls[i],
      level: () => feeds[i].level,
      sounding: () => soundingIds.value.has(sound.id),
      peaks: (n: number) => peaksOf(sound, n),
      bpm: () => board.bpm,
    }
  }),
)
// the plugin sends its voices' audio only while something wants it
let unwatch: (() => void)[] = []
watch(
  () => [0, 1, 2].map((i) => layerOf(i)?.id ?? ''),
  (ids) => {
    unwatch.forEach((u) => u())
    unwatch = ids.filter(Boolean).map((id) => watchSound(id))
  },
  { immediate: true },
)
// while the ship sails, every VCO's new sound crossfades in (the plugin reads it as it syncs the layer)
watch(
  () => [slots.value.map((x) => x?.layer.id ?? ''), prefs.fade] as const,
  ([ids]) => {
    voyageFades.clear()
    for (const id of ids) if (id) voyageFades.set(id, Math.max(0.05, prefs.fade))
  },
  { immediate: true },
)

// ── the field ──
const field = new Field()
const cooldown = [0, 0, 0]
const flashes: [number, number, number, number][] = [0, 1, 2].map(() => [0, 0, 99, 0])
const lastCatch = ref('')
const caughtAt = ref(0)
/** the sounds a rock may carry: what the samples list shows (its tags and favourites) -- samples and wavetables with audio */
const pool = computed(() => board.visible.filter((s) => s.audioId && !s.audioId.startsWith('synth:') && !s.zones?.length && hasAudio(s.audioId)))
const growing = (i: number) => !!slots.value[i]?.garden?.on
const podReady = (i: number) => {
  const run = garden.runFor(i)
  return !!run?.next && !run.next.again
}
let spawnIn = 1.5
function spawn(t: number, ports: Port[]) {
  const counts = [0, 1, 2].map((i) => field.rocks.filter((r) => r.vco === i).length)
  const want = [0, 1, 2].filter((i) => {
    if (!layerOf(i) || !prefs.beams[i]) return false
    if (growing(i)) return podReady(i) && !field.rocks.some((r) => r.vco === i && r.payload.kind === 'pod')
    return pool.value.length > 0 && counts[i] < 2
  })
  if (!want.length) return
  // the VCO with the fewest on their way, at random among equals
  want.sort((a, b) => counts[a] - counts[b] || Math.random() - 0.5)
  const vco = want[0]
  const port = ports[vco]
  const A = size.w / Math.max(1, size.h)
  const seed = Math.random()
  let payload: Rock['payload']
  if (growing(vco)) {
    const prompt = garden.runFor(vco)?.next?.prompt ?? ''
    payload = { kind: 'pod', label: prompt.split(',')[0].trim().slice(0, 22).toUpperCase() || 'POD' }
  } else {
    const here = slots.value[vco]?.layer.soundId
    const choices = pool.value.filter((s) => s.id !== here)
    const s = choices[Math.floor(Math.random() * choices.length)]
    if (!s) return
    payload = { kind: 'sound', soundId: s.id, label: s.settings.name.slice(0, 22).toUpperCase() }
  }
  // a line that passes near the port -- or not quite: about half come close enough
  const y = Math.min(0.94, Math.max(0.06, port.y + (Math.random() - 0.5) * 0.5))
  field.add({
    vco,
    x: A + 0.15,
    y,
    vx: -(0.08 + Math.random() * 0.07),
    vy: (port.y - y) * (Math.random() * 0.03),
    r: payload.kind === 'pod' ? 0.05 : 0.036 + Math.random() * 0.026,
    spin: (Math.random() - 0.5) * 1.2,
    seed,
    payload,
  })
  void t
}

/** A rock in: its sound into its VCO, crossfaded; a pod, the garden's next clip now. */
function caught(r: Rock, t: number) {
  const i = r.vco
  const slot = slots.value[i]
  flashes[i] = [r.x, r.y, 0, 1]
  cooldown[i] = t + prefs.gap
  caughtAt.value = t
  if (!slot) return
  if (r.payload.kind === 'pod') {
    garden.stitchNow(i)
    lastCatch.value = `VCO ${i + 1} · ${PALETTES_OF()[i].name} caught a pod: ${r.payload.label}`
    return
  }
  const src = board.byId(r.payload.soundId)
  if (!src) return
  const fade = Math.max(0.05, prefs.fade)
  voyageFades.set(slot.layer.id, fade)
  slot.layer.soundId = src.id
  // a sample plays through; a wavetable cycle by cycle, at its own size (it doesn't stitch: its next notes play it)
  const wt = src.settings.wtSize > 0 ? src.settings.wtSize : 0
  if (slot.layer.settings.wtSize !== wt) slot.layer.settings.wtSize = wt
  if (!wt) stitch(slot.layer.id, src.audioId, fade)
  lastCatch.value = `VCO ${i + 1} · ${PALETTES_OF()[i].name} caught ${src.settings.name}`
}

// ── the frame ──
const root = ref<HTMLDivElement>()
const canvas = ref<HTMLCanvasElement>()
const shipG = ref<SVGGElement>()
const ship = ref<InstanceType<typeof VoyageShip>>()
const labelEls: (SVGGElement | null)[] = []
const size = reactive({ w: 1200, h: 800 })
const space = shallowRef<Space | null>(null)
const glOk = ref(true)
const beaming = reactive([false, false, false])
const cool = reactive([0, 0, 0])
let raf = 0
let last = 0
let t = 0
let bobT = 0
let steady = 0
let grabbing = false
const setGrab = (on: boolean) => (grabbing = on)
let shipK = 1
let pose = shipPose(0, 1.5)

/** a point on the ship (design units) on the screen, in screen units (height = 1) */
function toScreen(x: number, y: number): [number, number] {
  const k = shipK / Math.max(1, size.h)
  const dx = x * k
  const dy = (y + 20) * k
  const c = Math.cos(pose.tilt)
  const s = Math.sin(pose.tilt)
  return [pose.x + c * dx - s * dy, pose.y + s * dx + c * dy]
}

function loop(now: number) {
  raf = requestAnimationFrame(loop)
  const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016)
  last = now
  t += dt
  // the ship steadies while you're at its controls (or always, STEADY)
  const target = grabbing || prefs.steady ? 1 : 0
  steady += (target - steady) * Math.min(1, dt * 2.5)
  bobT += dt * (1 - steady)
  const A = size.w / Math.max(1, size.h)
  pose = shipPose(bobT, A)
  shipK = Math.min((0.86 * size.w) / SHIP_BOX.w, (0.78 * size.h) / SHIP_BOX.h)
  shipG.value?.setAttribute(
    'transform',
    `translate(${(pose.x * size.h).toFixed(1)} ${(pose.y * size.h).toFixed(1)}) rotate(${((pose.tilt * 180) / Math.PI).toFixed(2)}) scale(${shipK.toFixed(4)}) translate(0 20)`,
  )
  // the audio, each VCO's
  for (let i = 0; i < 3; i++) {
    const s = layerOf(i)
    if (!s) {
      feeds[i].update(scope, false)
      continue
    }
    const n = readSound(s.id, scope)
    const fresh = n > 0 && n !== scopeSeq[i] && soundSounding(s.id)
    if (n > 0) scopeSeq[i] = n
    feeds[i].update(scope, fresh)
  }
  // the ports, where the ship has bobbed to
  const ports: Port[] = era.value.ports.map((p) => {
    const [x, y] = toScreen(p.x, p.y)
    return { vco: p.vco, x, y, open: !!layerOf(p.vco) && prefs.beams[p.vco] && t >= cooldown[p.vco] }
  })
  spawnIn -= dt
  if (spawnIn <= 0) {
    spawn(t, ports)
    spawnIn = (9 - prefs.density * 7) * (0.6 + Math.random() * 0.8)
  }
  for (const r of field.step(dt, ports)) caught(r, t)
  for (let i = 0; i < 3; i++) {
    beaming[i] = field.beaming(i)
    cool[i] = cooldown[i] > t ? (cooldown[i] - t) / Math.max(1, prefs.gap) : 0
    flashes[i][2] += dt
    controls[i].flush()
  }
  if (lastCatch.value && t - caughtAt.value > 6) lastCatch.value = ''
  ship.value?.frame(dt, clock.value)
  // the sky
  const lv: [number, number, number] = [feeds[0].level, feeds[1].level, feeds[2].level]
  let bass = 0
  let treble = 0
  for (const f of feeds) {
    let b = 0
    let h = 0
    for (let k = 0; k < 14; k++) b += f.spec[k]
    for (let k = 80; k < 128; k++) h += f.spec[k]
    bass = Math.max(bass, b / 14 / 255)
    treble = Math.max(treble, h / 48 / 255)
  }
  const sp = space.value
  if (sp && !sp.lost) {
    const E = era.value
    const prop = toScreen(E.wake[0], E.wake[1])
    sp.frame({
      time: t,
      px: (canvas.value?.width ?? size.w) / Math.max(1, size.w),
      ship: [pose.x, pose.y, shipK / Math.max(1, size.h), pose.tilt],
      ports: ports.map((p) => [p.x, p.y, beaming[p.vco] ? 1 : 0, p.open ? 1 : 0]),
      flashes,
      levels: lv,
      bass,
      treble,
      rocks: field.rocks.map((r) => ({
        a: [r.x, r.y, r.r, r.angle],
        b: [r.vco, r.beam, r.seed, (r.payload.kind === 'pod' ? 1 : 0) + (ports[r.vco].open ? 2 : 0)],
      })),
      wake: [prop[0], prop[1], lv[2], layerOf(2) ? Math.min(1, controls[2].pointOf('grain').y) : 0.2],
      palette: E.palettes.flatMap((p) => p.gl),
      sky: E.sky,
      skyColors: E.sky.colors.map(rgb),
      aura: E.aura,
      warp: t - warpAt,
      amount: prefs.amount,
      trails: prefs.trails,
    })
  } else if (sp?.lost) glOk.value = false
  // the rocks' names
  for (let i = 0; i < MAX_ROCKS; i++) {
    const el = labelEls[i]
    if (!el) continue
    const r = field.rocks[i]
    if (!r) {
      el.style.opacity = '0'
      continue
    }
    el.setAttribute('transform', `translate(${(r.x * size.h).toFixed(1)} ${((r.y + r.r * 1.75) * size.h).toFixed(1)})`)
    const text = el.querySelector('text')!
    if (text.textContent !== r.payload.label) {
      text.textContent = r.payload.label
      const rect = el.querySelector('rect')!
      const w = r.payload.label.length * 7.4 + 16
      rect.setAttribute('x', String(-w / 2))
      rect.setAttribute('width', String(w))
    }
    el.querySelector('rect')!.setAttribute('stroke', PALETTES_OF()[r.vco].hi)
    el.style.opacity = r.beam >= 0 ? String(Math.max(0, 1 - r.beam * 1.4)) : ports[r.vco].open ? '0.95' : '0.45'
  }
}

// ── the sky's clicks: a rock clicked is beamed in ──
function skyDown(e: PointerEvent) {
  const box = root.value!.getBoundingClientRect()
  const x = (e.clientX - box.left) / Math.max(1, size.h)
  const y = (e.clientY - box.top) / Math.max(1, size.h)
  const r = field.at(x, y)
  if (!r) return
  const ports: Port[] = era.value.ports.map((p) => {
    const [px, py] = toScreen(p.x, p.y)
    return { vco: p.vco, x: px, y: py, open: !!layerOf(p.vco) && prefs.beams[p.vco] && t >= cooldown[p.vco] }
  })
  if (field.lock(r, ports)) return
  caughtAt.value = t
  lastCatch.value = !prefs.beams[r.vco] ? `VCO ${r.vco + 1}'s beam is off` : `VCO ${r.vco + 1}'s port is resting — ${Math.ceil(Math.max(0, cooldown[r.vco] - t))} s`
}

// ── a part's settings ──
const settingsFor = ref<{ part: Part; x: number; y: number } | null>(null)
function openSettings(part: Part, x: number, y: number) {
  if (!layerOf(part.vco)) return
  settingsFor.value = { part, x: Math.min(x, size.w - 300), y: Math.min(y, size.h - 320) }
}
const hovered = ref<Part | null>(null)
const exit = () => (board.master.playMode = 'pads')
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (settingsFor.value) settingsFor.value = null
  else exit()
}

let ro: ResizeObserver | undefined
function resize() {
  const el = root.value
  const c = canvas.value
  if (!el || !c) return
  size.w = el.clientWidth
  size.h = el.clientHeight
  const k = Math.min(2, window.devicePixelRatio || 1) * 0.55
  c.width = Math.max(1, Math.round(size.w * k))
  c.height = Math.max(1, Math.round(size.h * k))
}
onMounted(() => {
  resize()
  ro = new ResizeObserver(resize)
  ro.observe(root.value!)
  try {
    space.value = Space.create(canvas.value!)
  } catch (e) {
    console.warn('[voyage]', e)
    space.value = null
  }
  glOk.value = !!space.value
  window.addEventListener('keydown', onKey)
  raf = requestAnimationFrame(loop)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  ro?.disconnect()
  window.removeEventListener('keydown', onKey)
  unwatch.forEach((u) => u())
  voyageFades.clear()
  space.value?.dispose()
})

/** the HUD, dressed for the era */
const hudVars = computed(() => {
  const h = era.value.hud
  return {
    '--hud-bg': h.bg,
    '--hud-fg': h.fg,
    '--e0': h.edge[0],
    '--e1': h.edge[1],
    '--e2': h.edge[2],
    '--hud-font': h.font,
    '--hud-r': `${h.radius}px`,
    '--hud-shadow-a': h.hard ? `4px 4px 0 ${h.edge[1]}` : `0 6px 24px color-mix(in srgb, ${h.edge[0]} 35%, transparent)`,
    '--hud-shadow-b': h.hard ? `3px 3px 0 ${h.edge[1]}` : `0 4px 16px color-mix(in srgb, ${h.edge[2]} 30%, transparent)`,
  }
})
const vcoName = (i: number) => {
  const x = slots.value[i]
  return x ? (board.byId(x.layer.soundId)?.settings.name ?? '—') : 'EMPTY'
}
const pct = (v: number) => `${Math.round(v * 100)}%`
const secs = (v: number) => `${v.toFixed(1)}s`
const caption = computed(() => {
  const p = hovered.value
  if (p) return { head: `${PALETTES_OF()[p.vco].name} · VCO ${p.vco + 1} — ${p.name} (${p.kind.toUpperCase()})`, body: PART_HELP[p.kind] }
  if (lastCatch.value) return { head: 'TRACTOR BEAM', body: lastCatch.value }
  return {
    head: 'ALL ABOARD',
    body: 'drag a part to play its pad · double-click resets · right-click for its settings · click a rock to beam it in · ✕ (top right): back to the pads',
  }
})
</script>

<template>
  <Teleport to="body">
    <div ref="root" class="voyage" :style="hudVars" @contextmenu.prevent>
      <canvas ref="canvas" class="sky" :class="{ off: !glOk }" />
      <svg class="stage" :viewBox="`0 0 ${size.w} ${size.h}`" @pointerdown="skyDown">
        <!-- the rocks' names (under the ship: the rocks pass behind it) -->
        <g class="labels">
          <g v-for="i in MAX_ROCKS" :key="i" :ref="(el) => (labelEls[i - 1] = el as SVGGElement)" style="opacity: 0">
            <rect x="-30" y="-11" width="60" height="20" rx="10" :fill="era.ink" stroke-width="2" />
            <text x="0" y="4" text-anchor="middle" />
          </g>
        </g>
        <g ref="shipG">
          <VoyageShip
            :key="era.id"
            ref="ship"
            :era="era"
            :vcos="vcos"
            :beaming="beaming"
            @hover="(p: Part | null) => (hovered = p)"
            @settings="openSettings"
            @grab="setGrab"
          />
        </g>
      </svg>

      <header class="hud" @pointerdown.stop>
        <div class="brand">
          <b>VOYAGE</b>
          <small>{{ board.selectedPatch?.name ?? '' }}</small>
        </div>
        <div class="crew">
          <div v-for="i in [0, 1, 2]" :key="i" class="vco" :class="{ empty: !slots[i], off: !prefs.beams[i] }" :style="{ '--c': era.hud.vco?.[i] ?? PALETTES_OF()[i].main, '--a': PALETTES_OF()[i].alt, '--h': PALETTES_OF()[i].hi }">
            <span class="num">{{ i + 1 }}</span>
            <span class="who">
              <em>{{ PALETTES_OF()[i].name }}{{ slots[i]?.garden?.on ? ' · GROWING' : '' }}</em>
              <span class="nm">{{ vcoName(i) }}</span>
            </span>
            <button
              class="beam"
              :class="{ on: prefs.beams[i], pulling: beaming[i] }"
              :disabled="!slots[i]"
              :title="prefs.beams[i] ? `VCO ${i + 1}'s tractor beam is on: rocks meant for it are pulled in — click to let them pass` : `VCO ${i + 1}'s tractor beam is off — click to catch rocks again`"
              @click="prefs.beams[i] = !prefs.beams[i]"
            >
              <v-icon size="16" icon="mdi-magnet-on" />
            </button>
            <i class="rest" :style="{ transform: `scaleX(${cool[i]})` }" />
          </div>
        </div>
        <div class="knobs">
          <Knob v-model="prefs.gap" label="GAP" :min="4" :max="60" :step="1" :default="DEFAULTS.gap" :format="(v: number) => `${Math.round(v)}s`" :size="26" title="After a catch, how long a port rests before it pulls in another" />
          <Knob v-model="prefs.density" label="FIELD" :min="0" :max="1" :default="DEFAULTS.density" :format="pct" :size="26" title="How thick the field of rocks is" />
          <Knob v-model="prefs.fade" label="XFADE" :min="0.1" :max="10" :default="DEFAULTS.fade" :format="secs" :size="26" title="How long a caught sound takes to crossfade in (a growing VCO keeps its garden's)" />
          <Knob v-model="prefs.amount" label="FX" :min="0" :max="1" :default="DEFAULTS.amount" :format="pct" :size="26" title="How much light, film and print there is" />
          <Knob v-model="prefs.trails" label="TRAILS" :min="0" :max="1" :default="DEFAULTS.trails" :format="pct" :size="26" title="How long the light lingers" />
          <button class="tog" :class="{ on: prefs.steady }" title="STEADY: the ship stops bobbing (it always steadies while you're at its controls)" @click="prefs.steady = !prefs.steady">STEADY</button>
          <button class="exit" title="Back to the pads (Esc)" @click="exit"><v-icon size="16" icon="mdi-view-grid-outline" /> PADS</button>
        </div>
        <!-- the way out by mouse: in a DAW, Esc goes to the host (it can close the plugin's window), not to us -->
        <button class="close" title="Close the voyage: back to the pads" aria-label="Close the voyage" @click="exit">
          <v-icon size="22" icon="mdi-close" />
        </button>
      </header>

      <nav class="eras" @pointerdown.stop>
        <button class="step" title="The decade before" @click="stepEra(-1)"><v-icon size="16" icon="mdi-chevron-left" /></button>
        <button
          v-for="e in ERAS"
          :key="e.id"
          class="era"
          :class="{ on: e.id === era.id }"
          :title="`${e.label} — ${e.title}: ${e.blurb}`"
          @click="prefs.era = e.id"
        >
          {{ e.label }}
        </button>
        <button class="step" title="The decade after" @click="stepEra(1)"><v-icon size="16" icon="mdi-chevron-right" /></button>
        <span class="era-title">{{ era.title }}</span>
      </nav>

      <footer class="caption" @pointerdown.stop>
        <b>{{ caption.head }}</b>
        <span>{{ caption.body }}</span>
      </footer>

      <div v-if="!glOk" class="nogl">No WebGL2 here: the sky stays still, the ship still plays.</div>

      <div
        v-if="settingsFor && vcos[settingsFor.part.vco]"
        class="pop"
        :style="{ left: `${settingsFor.x}px`, top: `${settingsFor.y}px`, '--line': PALETTES_OF()[settingsFor.part.vco].hi, '--lcd-bg': PALETTES_OF()[settingsFor.part.vco].deep }"
        @pointerdown.stop
        @click.stop
      >
        <div class="pop-head">
          <b>{{ settingsFor.part.name }}</b>
          <small>VCO {{ settingsFor.part.vco + 1 }} · {{ settingsFor.part.kind.toUpperCase() }}</small>
        </div>
        <PadSettings :kind="settingsFor.part.kind" :sound="vcos[settingsFor.part.vco]!.sound" :slot="settingsFor.part.vco" :pads="controls[settingsFor.part.vco]" />
        <button class="done" @click="settingsFor = null">DONE</button>
      </div>
      <span class="sr" aria-live="polite">{{ caption.head }}: {{ caption.body }}</span>
    </div>
  </Teleport>
</template>

<style scoped>
.voyage {
  position: fixed;
  inset: 0;
  z-index: 2400;
  overflow: hidden;
  background: #000;
  color: var(--hud-fg);
  user-select: none;
}
.sky {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.sky.off {
  visibility: hidden;
}
.stage {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.labels {
  pointer-events: none;
}
.labels text {
  font-family: 'Orbitron', sans-serif;
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 1px;
  fill: var(--hud-fg);
}
.hud {
  position: absolute;
  top: 10px;
  left: 12px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  pointer-events: none;
}
.hud > * {
  pointer-events: auto;
}
.brand {
  display: flex;
  flex-direction: column;
  line-height: 1;
  padding: 6px 14px 7px;
  border-radius: var(--hud-r);
  background: var(--hud-bg);
  border: 3px solid var(--e0);
  box-shadow: var(--hud-shadow-a);
}
.brand b {
  font-family: var(--hud-font);
  font-size: 24px;
  letter-spacing: 4px;
  background: linear-gradient(90deg, var(--e0), var(--e1), var(--e2));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.brand small {
  margin-top: 3px;
  font-family: 'VT323', monospace;
  font-size: 14px;
  color: var(--hud-fg);
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.crew {
  display: flex;
  gap: 8px;
  flex: 1;
  justify-content: center;
  flex-wrap: wrap;
}
.vco {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  max-width: 260px;
  padding: 4px 6px 6px 4px;
  border-radius: var(--hud-r);
  background: var(--hud-bg);
  border: 3px solid var(--c);
  box-shadow: var(--hud-shadow-b);
  overflow: hidden;
}
.vco.empty {
  opacity: 0.45;
}
.num {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  flex: none;
  border-radius: 50%;
  font-family: var(--hud-font);
  font-size: 16px;
  font-weight: 900;
  color: var(--hud-bg);
  background: var(--c);
}
.who {
  display: flex;
  flex-direction: column;
  min-width: 0;
  line-height: 1.1;
}
.who em {
  font-style: normal;
  font-family: 'Orbitron', sans-serif;
  font-size: 8px;
  font-weight: 900;
  letter-spacing: 2px;
  color: var(--c);
}
.nm {
  font-family: 'VT323', monospace;
  font-size: 16px;
  color: var(--hud-fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.beam {
  display: grid;
  place-items: center;
  flex: none;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  color: var(--h);
  background: transparent;
  border: 2px solid color-mix(in srgb, var(--c) 60%, transparent);
  opacity: 0.6;
}
.beam.on {
  opacity: 1;
  color: var(--hud-bg);
  background: var(--c);
}
.beam.pulling {
  animation: pull 0.35s ease-in-out infinite alternate;
}
@keyframes pull {
  to {
    background: var(--a);
    box-shadow: 0 0 14px var(--a);
  }
}
.rest {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  height: 3px;
  background: var(--a);
  transform-origin: left;
}
.knobs {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  border-radius: var(--hud-r);
  background: var(--hud-bg);
  border: 3px solid var(--e2);
  box-shadow: var(--hud-shadow-b);
  --line: var(--hud-fg);
}
.knobs :deep(.label) {
  color: var(--hud-fg);
}
.tog,
.exit {
  padding: 4px 10px;
  border-radius: 14px;
  font-family: 'Orbitron', sans-serif;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 2px;
  color: var(--hud-fg);
  border: 2px solid var(--e2);
  background: transparent;
}
.tog.on {
  color: var(--hud-bg);
  background: var(--e2);
}
.exit {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--hud-bg);
  background: var(--e0);
  border-color: var(--e0);
}
.close {
  display: grid;
  place-items: center;
  flex: none;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  color: var(--hud-bg);
  background: var(--e0);
  border: 3px solid var(--hud-bg);
  box-shadow: var(--hud-shadow-b);
  cursor: pointer;
}
.close:hover {
  background: var(--e1);
  transform: scale(1.08);
}
.caption {
  position: absolute;
  left: 50%;
  bottom: 14px;
  transform: translateX(-50%);
  display: flex;
  align-items: baseline;
  gap: 12px;
  max-width: calc(100% - 32px);
  padding: 7px 18px;
  border-radius: var(--hud-r);
  background: var(--hud-bg);
  border: 3px solid var(--e1);
  box-shadow: var(--hud-shadow-a);
  white-space: nowrap;
  overflow: hidden;
}
.eras {
  position: absolute;
  left: 50%;
  bottom: 64px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 3px;
  padding: 4px 6px;
  border-radius: var(--hud-r);
  background: color-mix(in srgb, var(--hud-bg) 88%, transparent);
  border: 2px solid color-mix(in srgb, var(--e0) 70%, transparent);
}
.era,
.step {
  display: grid;
  place-items: center;
  min-width: 34px;
  height: 24px;
  padding: 0 6px;
  border-radius: calc(var(--hud-r) * 0.6);
  font-family: var(--hud-font);
  font-size: 12px;
  font-weight: 900;
  color: var(--hud-fg);
  background: transparent;
  opacity: 0.7;
}
.era:hover,
.step:hover {
  opacity: 1;
}
.era.on {
  opacity: 1;
  color: var(--hud-bg);
  background: var(--e0);
}
.era-title {
  margin: 0 6px 0 4px;
  font-family: var(--hud-font);
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 2px;
  color: var(--e0);
  white-space: nowrap;
}
.caption b {
  font-family: 'Orbitron', sans-serif;
  font-size: 10px;
  letter-spacing: 2px;
  color: var(--e0);
}
.caption span {
  font-family: 'VT323', monospace;
  font-size: 17px;
  color: var(--hud-fg);
  overflow: hidden;
  text-overflow: ellipsis;
}
.nogl {
  position: absolute;
  top: 70px;
  left: 50%;
  transform: translateX(-50%);
  font-family: 'VT323', monospace;
  font-size: 16px;
  opacity: 0.7;
}
.pop {
  position: absolute;
  z-index: 3;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  width: 290px;
  max-height: 320px;
  overflow: auto;
  padding: 10px;
  border-radius: 18px;
  background: color-mix(in srgb, var(--lcd-bg) 94%, transparent);
  border: 3px solid var(--line);
  box-shadow: 5px 5px 0 var(--hud-bg);
}
.pop-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.1;
}
.pop-head b {
  font-family: 'Orbitron', sans-serif;
  font-size: 12px;
  letter-spacing: 2px;
  color: var(--line);
}
.pop-head small {
  font-family: 'VT323', monospace;
  font-size: 14px;
  color: color-mix(in srgb, var(--line) 70%, transparent);
}
.pop .done {
  padding: 2px 14px;
  border-radius: 10px;
  font-family: 'VT323', monospace;
  font-size: 16px;
  color: var(--line);
  border: 1px solid var(--line);
}
.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
@media (max-width: 760px) {
  .caption span {
    display: none;
  }
}
</style>
