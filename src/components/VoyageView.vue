<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import { activeVoices, clock, getBuffer, hasAudio, readSound, SCOPE_SAMPLES, soundSounding, stitch, watchSound } from '../audio/engine'
import { useBoard } from '../stores/board'
import { useGarden } from '../stores/garden'
import { padControl, type PadId } from '../lib/play/padControl'
import { setRingPoint } from '../lib/garden/garden'
import { AudioFeed } from '../lib/play/shaders'
import { Field, MAX_ROCKS, shipPose, type Port, type Rock } from '../lib/voyage/field'
import { PART_HELP, rgb, SHIP_BOX, type Part } from '../lib/voyage/ship'
import { DEFAULT_ERA, eraOf, ERAS } from '../lib/voyage/eras'
import { Space } from '../lib/voyage/space'
import { voyageFades } from '../lib/voyage/stitch'
import type { Sound } from '../types'
import Knob from './Knob.vue'
import PadSettings from './PadSettings.vue'
import GardenSettings from './GardenSettings.vue'
import PadLfoPanel from './PadLfoPanel.vue'
import CockpitView from './cockpit/CockpitView.vue'
import { Air } from '../lib/voyage/cockpit/cockpitGL'
import { texture } from '../lib/voyage/cockpit/textures'
import { cockpitOf } from '../lib/voyage/cockpit/eras'
import { lfoAt } from '../lib/play/padLfo'
import GardenBar from './GardenBar.vue'
import VoyageShip, { type ShipVco } from './VoyageShip.vue'

/**
 * VOYAGE: the PLAY view as a voyage, full screen (VCO 1's PERFORM settings choose it). The three VCOs' pads are the
 * working parts of a ship (VoyageShip.vue) bobbing through a technicolor sky (lib/voyage/space.ts). Rocks drift past,
 * each meant for one VCO and carrying a sound from the samples list (as the list shows, filtered); when one drifts
 * near its VCO's tractor port -- the top of the bow's or the stern's dome, the bottom of midships' -- the port locks
 * on, pulls it in, and the VCO takes its sound, crossfaded into whatever's sounding (as the garden stitches). A VCO
 * whose garden grows catches PODS instead: its next clip, in early. After a catch a port rests (GAP) before the next.
 * A click on a rock beams it in from wherever it is.
 *
 * Each VCO's GARDEN rides along too (step lamps under its window): its picked ring on X / Y, its prompt behind a right-click, a badge on
 * every other part saying whether it grows with the garden, and in the HUD each VCO's grow toggle between ◀ ▶ (its
 * clips) and ☰ (its sound model, its words to avoid).
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
  /** outside, the ship; or the COCKPIT, from the pilot's seat */
  view: 'ship' | 'cockpit'
}
const KEY = 'ssb:voyage'
const DEFAULTS: Prefs = { era: DEFAULT_ERA, gap: 20, density: 0.5, fade: 3, amount: 0.85, trails: 0.6, steady: false, beams: [true, true, true], view: 'ship' }
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
/** the era's cockpit (the COCKPIT view) */
const cockpit = computed(() => cockpitOf(era.value.id))
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
/** the ship's hold on each VCO's pads: as `controls`, but a part whose LFO moves it is dragged by its shape's centre */
const shipControls = controls.map((c, i) => ({
  ...c,
  // (its marker glides along the LFO's shape, though the settings it writes snap)
  pointOf: (id: PadId, r?: Parameters<typeof c.pointOf>[1]) => garden.lfoNow(i, id) ?? c.pointOf(id, r),
  moved: (id: PadId, p: { x: number; y: number }) => (garden.lfoDrives(i, id) ? garden.setLfoCenter(i, id, p) : c.moved(id, p)),
  ended: (id: PadId) => {
    if (!garden.lfoDrives(i, id)) c.ended(id)
  },
  reset: (id: PadId) => {
    c.reset(id)
    if (garden.lfoDrives(i, id)) garden.setLfoCenter(i, id, c.pointOf(id))
  },
}))
const vcos = computed<(ShipVco | null)[]>(() =>
  [0, 1, 2].map((i) => {
    const sound = layerOf(i)
    if (!sound) return null
    return {
      sound,
      pads: shipControls[i],
      level: () => feeds[i].level,
      sounding: () => soundingIds.value.has(sound.id),
      peaks: (n: number) => peaksOf(sound, n),
      bpm: () => board.bpm,
      garden: {
        g: () => slots.value[i]?.garden ?? null,
        ring: () => garden.ringOf(i),
        progress: () => garden.runFor(i)?.progress ?? 0,
        moved: (p: { x: number; y: number }) => {
          garden.gardenOf(i)
          const r = garden.ringOf(i)
          if (r) setRingPoint(r, p)
        },
        next: () => garden.nextRing(i),
        grows: (kind: PadId) => garden.growsPad(i, kind),
        toggleGrow: (kind: PadId) => garden.toggleGrowPad(i, kind),
        auto: (kind: PadId) => !!garden.lfoOf(i, kind),
        lfoAt: (kind: PadId, phase: number) => {
          const l = garden.lfoOf(i, kind)
          return l ? lfoAt(l, phase) : null
        },
        lfoPhase: (kind: PadId) => garden.lfoPhaseOf(i, kind),
        autoClick: (kind: PadId, x: number, y: number) => openLfo(i, kind, x, y),
        autoToggle: (kind: PadId) => {
          if (!garden.lfoOf(i, kind)) return garden.startLfo(i, kind)
          garden.stopLfo(i, kind)
          if (lfoFor.value?.vco === i && lfoFor.value.pad === kind) lfoFor.value = null
        },
      },
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
  const payload = payloadFor(vco)
  if (!payload) return
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

/**
 * What a new rock for VCO `vco` carries: the garden's next clip (a POD) while it grows and one's waiting, else a sound
 * from the samples list other than the one playing (null: nothing for it now).
 */
function payloadFor(vco: number): Rock['payload'] | null {
  if (!layerOf(vco) || !prefs.beams[vco]) return null
  if (growing(vco)) {
    if (!podReady(vco)) return null
    const prompt = garden.runFor(vco)?.next?.prompt ?? ''
    return { kind: 'pod', label: prompt.split(',')[0].trim().slice(0, 22).toUpperCase() || 'POD' }
  }
  const here = slots.value[vco]?.layer.soundId
  const choices = pool.value.filter((s) => s.id !== here)
  const s = choices[Math.floor(Math.random() * choices.length)]
  return s ? { kind: 'sound', soundId: s.id, label: s.settings.name.slice(0, 22).toUpperCase() } : null
}
/** a VCO's port can take a catch now (on, resting no longer) */
const portOpen = (vco: number) => !!layerOf(vco) && prefs.beams[vco] && t >= cooldown[vco]

/** A rock in: its sound into its VCO, crossfaded; a pod, the garden's next clip now. */
function caught(r: Pick<Rock, 'vco' | 'x' | 'y' | 'payload'>, t: number) {
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
const shipWrap = ref<HTMLDivElement>()
const shipBack = ref<InstanceType<typeof VoyageShip>>()
/** where the ship rests (screen units) and its scale: its layers are drawn there; the bob moves them as a whole */
const shipRest = computed(() => ({ x: (size.w / Math.max(1, size.h)) * 0.48, y: 0.5 }))
const shipScale = computed(() => Math.min((0.86 * size.w) / SHIP_BOX.w, (0.78 * size.h) / SHIP_BOX.h))
const shipPlace = computed(() => `translate(${(shipRest.value.x * size.h).toFixed(1)} ${(shipRest.value.y * size.h).toFixed(1)}) scale(${shipScale.value.toFixed(4)}) translate(0 20)`)
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
  shipK = shipScale.value
  // the bob, moved by the compositor: the ship's layers are painted where it rests and slid / turned from there
  const rest = shipRest.value
  const wrap = shipWrap.value
  if (wrap) {
    const tf = `translate(${((pose.x - rest.x) * size.h).toFixed(1)}px, ${((pose.y - rest.y) * size.h).toFixed(1)}px) rotate(${((pose.tilt * 180) / Math.PI).toFixed(2)}deg)`
    if (wrap.style.transform !== tf) wrap.style.transform = tf
  }
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
  const inside = prefs.view === 'cockpit'
  if (inside) field.rocks = []
  spawnIn -= dt
  if (spawnIn <= 0 && !inside) {
    spawn(t, ports)
    spawnIn = (9 - prefs.density * 7) * (0.6 + Math.random() * 0.8)
  }
  for (const r of field.step(dt, ports)) caught(r, t)
  for (let i = 0; i < 3; i++) {
    const bm = field.beaming(i)
    if (beaming[i] !== bm) beaming[i] = bm
    // (in fiftieths: a reactive write every frame re-rendered the whole view sixty times a second)
    const c = cooldown[i] > t ? Math.ceil(((cooldown[i] - t) / Math.max(1, prefs.gap)) * 50) / 50 : 0
    if (cool[i] !== c) cool[i] = c
    flashes[i][2] += dt
    controls[i].flush()
  }
  if (lastCatch.value && t - caughtAt.value > 6) lastCatch.value = ''
  // (the hull's layer is still: only the parts' layers move)
  shipBack.value?.frame(dt, clock.value)
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
      // (from the cockpit: no ship out there -- it's round you -- and no ports)
      ship: inside ? [-50, -50, 0.0001, 0] : [pose.x, pose.y, shipK / Math.max(1, size.h), pose.tilt],
      ports: inside ? ports.map(() => [-50, -50, 0, 0]) : ports.map((p) => [p.x, p.y, beaming[p.vco] ? 1 : 0, p.open ? 1 : 0]),
      flashes,
      levels: lv,
      bass,
      treble,
      rocks: field.rocks.map((r) => ({
        a: [r.x, r.y, r.r, r.angle],
        b: [r.vco, r.beam, r.seed, (r.payload.kind === 'pod' ? 1 : 0) + (ports[r.vco].open ? 2 : 0)],
      })),
      wake: inside ? [-50, -50, 0, 0] : [prop[0], prop[1], lv[2], layerOf(2) ? Math.min(1, controls[2].pointOf('grain').y) : 0.2],
      palette: E.palettes.flatMap((p) => p.gl),
      sky: E.sky,
      skyColors: E.sky.colors.map(rgb),
      aura: E.aura,
      warp: t - warpAt,
      amount: prefs.amount,
      trails: prefs.trails,
    })
  } else if (sp?.lost) glOk.value = false
  // outside, the same air and film as inside (the era's cockpit's): shafts of sun, dust, grain, interference
  if (!inside && air.value && !air.value.lost) {
    const at = cockpit.value.atmosphere
    const k = (airEl.value?.width ?? size.w) / Math.max(1, size.w)
    air.value.frame({
      time: t,
      sun: [(cockpit.value.sun.x / 1600) * size.w * k, (cockpit.value.sun.y / 900) * size.h * k],
      sunC: [1, 0.9, 0.72],
      dust: at.dust * prefs.amount * 0.7,
      shafts: at.shafts * prefs.amount,
      grain: at.grain * prefs.amount,
      emf: at.emf * prefs.amount,
      trip: at.trip * prefs.amount,
      level: Math.max(...lv),
    })
  }
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

// ── a part's LFO (its automation badge: PadLfoPanel.vue in a box beside it) ──
const lfoFor = ref<{ vco: number; pad: PadId; name: string; x: number; y: number } | null>(null)
function openLfo(vco: number, pad: PadId, x: number, y: number) {
  if (!layerOf(vco)) return
  if (!garden.lfoOf(vco, pad)) garden.startLfo(vco, pad)
  const box = root.value?.getBoundingClientRect()
  const name = era.value.parts.find((p) => p.vco === vco && p.kind === pad)?.name ?? pad.toUpperCase()
  lfoFor.value = { vco, pad, name, x: Math.max(8, Math.min(x - (box?.left ?? 0), size.w - 230)), y: Math.max(8, Math.min(y - (box?.top ?? 0) + 12, size.h - 200)) }
  settingsFor.value = null
}

// ── a part's settings ──
const settingsFor = ref<{ part: Part; x: number; y: number } | null>(null)
function openSettings(part: Part, x: number, y: number) {
  if (!layerOf(part.vco)) return
  // (the garden's settings are the tallest)
  const tall = part.kind === 'garden' ? Math.min(560, size.h * 0.8) : 320
  settingsFor.value = { part, x: Math.max(8, Math.min(x, size.w - 300)), y: Math.max(8, Math.min(y, size.h - tall - 8)) }
}
const hovered = ref<Part | null>(null)
const exit = () => (board.master.playMode = 'pads')
function onKey(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  if (lfoFor.value) lfoFor.value = null
  else if (settingsFor.value) settingsFor.value = null
  else exit()
}

let ro: ResizeObserver | undefined
function resize() {
  const el = root.value
  const c = canvas.value
  if (!el || !c) return
  size.w = el.clientWidth
  size.h = el.clientHeight
  // (from the cockpit the sky is out of focus behind the glass: drawn at well under half the pixels, upscaled soft --
  // cheaper than a blur, and it looks the same)
  const k = Math.min(2, window.devicePixelRatio || 1) * 0.55 * (prefs.view === 'cockpit' ? 0.42 : 1)
  c.width = Math.max(1, Math.round(size.w * k))
  c.height = Math.max(1, Math.round(size.h * k))
  if (airEl.value) {
    airEl.value.width = Math.max(1, Math.round(size.w * 0.5))
    airEl.value.height = Math.max(1, Math.round(size.h * 0.5))
  }
}
onMounted(() => {
  resize()
  ro = new ResizeObserver(resize)
  ro.observe(root.value!)
  try {
    space.value = Space.create(canvas.value!)
    air.value = airEl.value ? Air.create(airEl.value) : null
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
  air.value?.dispose()
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
const cockpitHint = ref<string | null>(null)
watch(() => prefs.view, () => resize())
const airEl = ref<HTMLCanvasElement>()
const air = shallowRef<Air | null>(null)
const noiseTile = texture('noise')
/** in the cockpit the HUD gets out of the way: the top's comes back with the pointer near the top, the rest near the bottom */
const reveal = reactive({ top: false, bottom: false })
function revealAt(e: PointerEvent) {
  if (prefs.view !== 'cockpit') return
  const box = root.value?.getBoundingClientRect()
  if (!box) return
  const y = e.clientY - box.top
  // (just the very edges: the dash's own controls run right up to them)
  reveal.top = y < (reveal.top ? 110 : 8)
  reveal.bottom = y > box.height - (reveal.bottom ? 130 : 8)
}
const caption = computed(() => {
  if (prefs.view === 'cockpit') {
    if (cockpitHint.value) return { head: cockpit.value.title, body: cockpitHint.value }
    if (lastCatch.value) return { head: 'TRACTOR BEAM', body: lastCatch.value }
    return { head: cockpit.value.title, body: 'every control is a VCO\'s: drag it · knobs up / down, cranks and wheels round, chains down, leads from jack to jack · rocks coming at you beam into their intake (or click one)' }
  }
  const p = hovered.value
  if (p?.kind === 'garden') {
    const g = slots.value[p.vco]?.garden
    const words = g?.history[0]?.prompt
    return { head: `${PALETTES_OF()[p.vco].name} · VCO ${p.vco + 1} — ${p.name}${g?.subject ? ` · from “${g.subject}”` : ''}`, body: words && g?.on ? `now: ${words} — ${PART_HELP.garden}` : PART_HELP.garden }
  }
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
    <div
      ref="root"
      class="voyage"
      :class="{ inside: prefs.view === 'cockpit', 'show-top': reveal.top, 'show-bottom': reveal.bottom, hinting: !!cockpitHint }"
      :style="hudVars"
      @contextmenu.prevent
      @pointermove="revealAt"
      @pointerleave="reveal.top = reveal.bottom = false"
    >
      <canvas ref="canvas" class="sky" :class="{ off: !glOk }" />
      <CockpitView
        v-if="prefs.view === 'cockpit'"
        :key="cockpit.era"
        :era="era"
        :design="cockpit"
        :vcos="vcos"
        :open="portOpen"
        :payload-for="payloadFor"
        :density="prefs.density"
        :amount="prefs.amount"
        :bpm="board.bpm"
        @catch="(vco: number, payload: Rock['payload']) => caught({ vco, x: 0, y: 0, payload }, t)"
        @hover="(h: string | null) => (cockpitHint = h)"
        @grab="setGrab"
      />
      <svg v-else class="stage" :viewBox="`0 0 ${size.w} ${size.h}`" @pointerdown="skyDown">
        <!-- the rocks' names (under the ship: the rocks pass behind it) -->
        <g class="labels">
          <g v-for="i in MAX_ROCKS" :key="i" :ref="(el) => (labelEls[i - 1] = el as SVGGElement)" style="opacity: 0">
            <rect x="-30" y="-11" width="60" height="20" rx="10" :fill="era.ink" stroke-width="2" />
            <text x="0" y="4" text-anchor="middle" />
          </g>
        </g>
      </svg>
      <!-- the ship: three layers (the parts behind the hull, the hull, the parts on it), each painted once where the
           ship rests and moved by the compositor as it bobs -->
      <div v-if="prefs.view !== 'cockpit'" ref="shipWrap" class="ship-wrap" :style="{ transformOrigin: `${shipRest.x * size.h}px ${shipRest.y * size.h}px` }">
        <svg class="ship-layer" :viewBox="`0 0 ${size.w} ${size.h}`">
          <g :transform="shipPlace"><VoyageShip :key="era.id" ref="shipBack" only="back" :era="era" :vcos="vcos" :beaming="beaming" /></g>
        </svg>
        <svg class="ship-layer" :viewBox="`0 0 ${size.w} ${size.h}`">
          <g :transform="shipPlace"><VoyageShip :key="era.id" only="hull" :era="era" :vcos="vcos" :beaming="beaming" /></g>
        </svg>
        <svg class="ship-layer" :viewBox="`0 0 ${size.w} ${size.h}`">
          <g :transform="shipPlace">
            <VoyageShip
              :key="era.id"
              ref="ship"
              only="front"
              :era="era"
              :vcos="vcos"
              :beaming="beaming"
              @hover="(p: Part | null) => (hovered = p)"
              @settings="openSettings"
              @grab="setGrab"
            />
          </g>
        </svg>
        <!-- the era's detail over its parts: still, so its own layer, never repainted as the parts move (it takes no
             pointer: the pads under it still do) -->
        <svg v-if="era.overlay" class="ship-layer" :viewBox="`0 0 ${size.w} ${size.h}`">
          <g :transform="shipPlace"><VoyageShip :key="era.id" only="overlay" :era="era" :vcos="vcos" :beaming="beaming" /></g>
        </svg>
      </div>

      <div v-show="prefs.view !== 'cockpit'" class="film-outside">
        <canvas ref="airEl" class="air" />
        <div class="film vignette" :style="{ opacity: cockpit.atmosphere.vignette * (0.4 + 0.6 * prefs.amount) * 0.85 }" />
        <div class="film scan" :style="{ opacity: cockpit.atmosphere.scanlines * prefs.amount }" />
        <div class="film tint" :style="{ background: `rgb(${cockpit.atmosphere.tint.map((v) => Math.round(v * 255)).join(',')})`, opacity: 0.18 * prefs.amount }" />
        <div class="film grain" :style="{ opacity: cockpit.atmosphere.grain * prefs.amount * 0.28, backgroundImage: `url(${noiseTile})` }" />
      </div>
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
            <GardenBar v-if="slots[i]" class="hud-garden" :x="slots[i]!" :slot="i" compact />
            <i class="rest" :style="{ transform: `scaleX(${cool[i]})` }" />
          </div>
        </div>
        <div class="knobs">
          <Knob v-model="prefs.gap" label="GAP" :min="4" :max="60" :step="1" :default="DEFAULTS.gap" :format="(v: number) => `${Math.round(v)}s`" :size="26" title="After a catch, how long a port rests before it pulls in another" />
          <Knob v-model="prefs.density" label="FIELD" :min="0" :max="1" :default="DEFAULTS.density" :format="pct" :size="26" title="How thick the field of rocks is" />
          <Knob v-model="prefs.fade" label="XFADE" :min="0.1" :max="10" :default="DEFAULTS.fade" :format="secs" :size="26" title="How long a caught sound takes to crossfade in (a growing VCO keeps its garden's)" />
          <Knob v-model="prefs.amount" label="FX" :min="0" :max="1" :default="DEFAULTS.amount" :format="pct" :size="26" title="How much light, film and print there is" />
          <Knob v-model="prefs.trails" label="TRAILS" :min="0" :max="1" :default="DEFAULTS.trails" :format="pct" :size="26" title="How long the light lingers" />
          <button class="tog" :class="{ on: prefs.view === 'cockpit' }" title="COCKPIT: the voyage from the pilot's seat — every VCO's controls on the dash, the rocks coming at you (click again for the ship from outside)" @click="prefs.view = prefs.view === 'cockpit' ? 'ship' : 'cockpit'">{{ prefs.view === 'cockpit' ? 'EXTERIOR' : 'COCKPIT' }}</button>
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
        :class="{ tall: settingsFor.part.kind === 'garden' }"
        :style="{ left: `${settingsFor.x}px`, top: `${settingsFor.y}px`, '--line': PALETTES_OF()[settingsFor.part.vco].hi, '--lcd-bg': PALETTES_OF()[settingsFor.part.vco].deep }"
        @pointerdown.stop
        @click.stop
      >
        <div class="pop-head">
          <b>{{ settingsFor.part.name }}</b>
          <small>VCO {{ settingsFor.part.vco + 1 }} · {{ settingsFor.part.kind.toUpperCase() }}</small>
        </div>
        <GardenSettings v-if="settingsFor.part.kind === 'garden'" :slot="settingsFor.part.vco" />
        <template v-else>
          <div class="row">
            <button
              class="grows"
              :class="{ on: vcos[settingsFor.part.vco]!.garden.grows(settingsFor.part.kind) }"
              title="GROW: each new clip from the garden walks this part somewhere new (with an LFO on, its centre)"
              @click="vcos[settingsFor.part.vco]!.garden.toggleGrow(settingsFor.part.kind as PadId)"
            >
              <v-icon size="13" icon="mdi-sprout" /> GROW
            </button>
            <button
              class="grows"
              :class="{ on: vcos[settingsFor.part.vco]!.garden.auto(settingsFor.part.kind) }"
              title="LFO: a shape traced round this part's point (its panel)"
              @click="openLfo(settingsFor.part.vco, settingsFor.part.kind as PadId, settingsFor.x, settingsFor.y)"
            >
              <v-icon size="13" icon="mdi-chart-timeline-variant" /> LFO
            </button>
          </div>
          <PadSettings :kind="settingsFor.part.kind" :sound="vcos[settingsFor.part.vco]!.sound" :slot="settingsFor.part.vco" :pads="controls[settingsFor.part.vco]" />
        </template>
        <button class="done" @click="settingsFor = null">DONE</button>
      </div>
      <div
        v-if="lfoFor && vcos[lfoFor.vco]"
        class="pop lfo-pop"
        :style="{ left: `${lfoFor.x}px`, top: `${lfoFor.y}px`, '--line': PALETTES_OF()[lfoFor.vco].hi, '--lcd-bg': PALETTES_OF()[lfoFor.vco].deep }"
        @pointerdown.stop
        @click.stop
        @contextmenu.prevent.stop
      >
        <div class="pop-head">
          <b>{{ lfoFor.name }}</b>
          <small>VCO {{ lfoFor.vco + 1 }} · {{ lfoFor.pad.toUpperCase() }} · drag the part: the shape's centre</small>
        </div>
        <div class="lfo-face"><PadLfoPanel :slot="lfoFor.vco" :pad="lfoFor.pad" @close="lfoFor = null" /></div>
      </div>
      <span class="sr" aria-live="polite">{{ caption.head }}: {{ caption.body }}</span>
    </div>
  </Teleport>
</template>

<style scoped>
.voyage {
  position: fixed;
  /* (above the on-screen keyboard, when it's out: App.vue sets its height) */
  inset: 0 0 var(--piano-h, 0px) 0;
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
.ship-wrap {
  position: absolute;
  inset: 0;
  pointer-events: none;
  will-change: transform;
}
.ship-layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  overflow: visible;
  pointer-events: none;
  will-change: transform;
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
.pop.tall {
  width: 320px;
  max-height: min(560px, 80vh);
}
.grows {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 10px;
  border-radius: 10px;
  font-family: 'VT323', monospace;
  font-size: 15px;
  color: color-mix(in srgb, var(--line) 75%, transparent);
  background: color-mix(in srgb, var(--line) 10%, var(--lcd-bg));
  border: 1px solid color-mix(in srgb, var(--line) 45%, transparent);
}
.grows.on {
  color: #05030a;
  background: #7dff6a;
  border-color: #7dff6a;
  box-shadow: 0 0 8px rgba(125, 255, 106, 0.5);
}
.hud-garden {
  flex: none;
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
.lfo-pop {
  width: 240px;
  max-height: none;
}
.lfo-face {
  position: relative;
  align-self: stretch;
  flex-shrink: 0;
  height: 170px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--line) 40%, transparent);
}
.pop .row {
  display: flex;
  gap: 6px;
}
/* the cockpit: the HUD out of the way of the dash until the pointer comes near its edge */
.voyage.inside .hud,
.voyage.inside .eras,
.voyage.inside .caption {
  transition: opacity 0.35s, transform 0.35s;
}
.voyage.inside:not(.show-top) .hud {
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.35s, visibility 0s 0.35s;
}
.voyage.inside:not(.show-bottom) .eras,
.voyage.inside:not(.show-bottom) .caption {
  opacity: 0;
  visibility: hidden;
  transition: opacity 0.35s, visibility 0s 0.35s;
}
/* (its hint line still shows while a control's under the pointer, small and low) */
.voyage.inside.hinting:not(.show-bottom) .caption {
  opacity: 0.85;
  visibility: visible;
  pointer-events: none;
}
/* outside: the cockpit's air and film over the sky and the ship (added light; never in the pointer's way) */
.film-outside,
.air,
.film {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.air {
  mix-blend-mode: screen;
}
.film.vignette {
  background: radial-gradient(ellipse at 50% 45%, transparent 50%, rgba(0, 0, 0, 0.5) 85%, rgba(0, 0, 0, 0.85) 115%);
}
.film.scan {
  background: repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.18) 0 1px, transparent 1px 3px);
  mix-blend-mode: multiply;
}
.film.tint {
  mix-blend-mode: soft-light;
}
.film.grain {
  background-size: 256px 256px;
  mix-blend-mode: overlay;
}
@keyframes vgrain {
  20% {
    background-position: -40px 30px;
  }
  40% {
    background-position: 60px -20px;
  }
  60% {
    background-position: -30px -50px;
  }
  80% {
    background-position: 20px 60px;
  }
}
</style>
