<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import CockpitView from './cockpit/CockpitView.vue'
import { eraOf } from '../lib/voyage/eras'
import { cockpitOf } from '../lib/voyage/cockpit/eras'
import { useAi } from '../lib/ai/store'
import { useBoard } from '../stores/board'
import { useGarden } from '../stores/garden'
import { fmtBytes, TAB_SOUND_MODEL } from '../lib/ai/soundModels'
import { errorMessage } from '../lib/ai/types'
import { activeVoices, getCtx, hasAudio, resume } from '../audio/engine'
import { padControl } from '../lib/play/padControl'

/**
 * The web version's first start: a hyperspace splash.
 *   WARP    the stars racing at you, streaking (the canvas here)
 *   REVEAL  pulling back out of the windscreen: we're in the 1980s cockpit (VOYAGE's CockpitView, 1980)
 *   HUD     "PREPARING FOR THE JUMP TO HYPERSPACE", a meter counting down Stable Audio 3 Small Music's download (it
 *           downloads and loads by itself), and ENGAGE HYPERSPACE -- the click the browser needs before it plays sound
 *   JUMP    once both: back into the windscreen at full warp while a new patch is made -- three VCOs from three
 *           prompts, each growing -- then HOLD on and middle C, and the splash gives way to SSB playing it
 * SKIP leaves at once (stopping the download). App.vue shows it once (ssb:intro-done), or with ?intro in the URL.
 */
const emit = defineEmits<{ done: []; reveal: [] }>()
const ai = useAi()
const board = useBoard()
const garden = useGarden()
const MODEL = TAB_SOUND_MODEL
/** the intro patch: three VCOs in C that sit together, each growing from here */
const PROMPTS = [
  'slowly evolving warm analog synth pad, C major, lush, cinematic, wide stereo',
  'deep pulsing sub bass drone in C, soft and dark, slow tempo',
  'shimmering crystalline bells and soft arpeggio in C major, airy, spacious, long decay',
]

const timers: ReturnType<typeof setTimeout>[] = []
/** their gardens' words (no word model on a first visit to list them): each VCO grows within its part, in C */
const RINGS: Partial<Record<string, string[]>>[] = [
  {
    adjective: ['warm', 'lush', 'slowly evolving', 'dreamy', 'golden', 'velvet'],
    noun: ['analog synth pad', 'string pad', 'choir pad', 'glass pad', 'tape strings'],
    verb: ['swelling', 'breathing', 'blooming', 'drifting'],
    texture: ['in C major', 'wide stereo', 'soft chorus', 'reverb wash'],
  },
  {
    adjective: ['deep', 'dark', 'pulsing', 'soft', 'warm'],
    noun: ['sub bass drone', 'analog bass', 'low cello', 'synth bass'],
    verb: ['pulsing', 'throbbing', 'rumbling', 'humming'],
    texture: ['in C', 'slow tempo', 'tape saturation', 'sub bass'],
  },
  {
    adjective: ['shimmering', 'crystalline', 'airy', 'bright', 'glassy'],
    noun: ['bells', 'arpeggio', 'music box', 'celesta', 'glass marimba'],
    verb: ['chiming', 'sparkling', 'twinkling', 'cascading'],
    texture: ['in C major', 'long decay', 'spacious', 'reverb wash'],
  },
]

type Phase = 'warp' | 'reveal' | 'hud' | 'jump' | 'out'
const phase = ref<Phase>('warp')
const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
const era = eraOf('1980')
const design = cockpitOf('1980')
const vcos = [null, null, null]

// ── the warp: stars in 3D racing at the eye, each drawn as the streak it made since the last frame ──
const canvas = ref<HTMLCanvasElement>()
const STARS = 1100
const stars = Array.from({ length: STARS }, () => ({ x: 0, y: 0, z: 0, pz: 0, hue: 0 }))
function seat(s: (typeof stars)[number], far = false) {
  const a = Math.random() * Math.PI * 2
  const r = 0.04 + Math.random() ** 0.7 * 1.6
  s.x = Math.cos(a) * r
  s.y = Math.sin(a) * r
  s.z = far ? 0.2 + Math.random() * 3.8 : 4
  s.pz = s.z
  s.hue = Math.random() < 0.18 ? 200 + Math.random() * 60 : Math.random() < 0.08 ? 320 : 220
}
stars.forEach((s) => seat(s, true))
let speed = 0.15
let raf = 0
let last = performance.now()
let flash = 0
function frame(now: number) {
  raf = requestAnimationFrame(frame)
  const dt = Math.min(0.05, (now - last) / 1000)
  last = now
  const c = canvas.value
  if (!c) return
  // (hidden behind the cockpit while the HUD shows: not drawn, and its buffer let go -- GPU memory the HUD's layers
  // need: over Chrome's budget, some just aren't drawn)
  if (phase.value === 'hud') {
    if (c.width > 1) c.width = c.height = 1
    return
  }
  // (streaks are soft: no need for the full retina buffer)
  const dpr = Math.min(1.25, devicePixelRatio || 1)
  const w = c.clientWidth
  const h = c.clientHeight
  if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
    c.width = Math.round(w * dpr)
    c.height = Math.round(h * dpr)
  }
  const g = c.getContext('2d')!
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  // the speed each phase wants, eased toward
  const want = phase.value === 'warp' ? 2.6 : phase.value === 'reveal' ? 1.1 : 9
  speed += (want - speed) * Math.min(1, dt * (phase.value === 'jump' ? 0.9 : 1.6))
  // trails: the faster, the longer the old frame lingers
  g.fillStyle = `rgba(2, 1, 10, ${Math.max(0.18, 0.75 - speed * 0.07)})`
  g.fillRect(0, 0, w, h)
  const cx = w / 2
  const cy = h * 0.42
  const f = Math.max(w, h) * 0.55
  g.lineCap = 'round'
  for (const s of stars) {
    s.pz = s.z
    s.z -= speed * dt * 1.6
    if (s.z <= 0.03) {
      seat(s)
      continue
    }
    const x = cx + (s.x / s.z) * f
    const y = cy + (s.y / s.z) * f
    const px = cx + (s.x / s.pz) * f
    const py = cy + (s.y / s.pz) * f
    if (x < -50 || x > w + 50 || y < -50 || y > h + 50) {
      seat(s)
      continue
    }
    const near = 1 - s.z / 4
    g.strokeStyle = `hsla(${s.hue}, 90%, ${70 + near * 30}%, ${0.25 + near * 0.75})`
    g.lineWidth = 0.4 + near * near * 2.6
    g.beginPath()
    g.moveTo(px, py)
    g.lineTo(x, y)
    g.stroke()
  }
  // the jump's white-out
  if (phase.value === 'jump') flash = Math.min(1, flash + dt * (launch.step >= 3 ? 1.4 : 0.05))
  if (flash > 0) {
    const r = g.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7)
    r.addColorStop(0, `rgba(255,255,255,${flash})`)
    r.addColorStop(1, `rgba(170,200,255,${flash * 0.6})`)
    g.fillStyle = r
    g.fillRect(0, 0, w, h)
  }
}

// ── the HUD's caption, typed out ──
const CAPTION = 'PREPARING FOR THE JUMP TO HYPERSPACE'
const typed = ref('')
let typer: ReturnType<typeof setInterval> | undefined
function typeCaption() {
  let n = 0
  typer = setInterval(() => {
    typed.value = CAPTION.slice(0, ++n)
    if (n >= CAPTION.length) clearInterval(typer)
  }, reduced ? 5 : 45)
}

// ── the model: downloaded and loaded by itself; the meter counts it down ──
const st = computed(() => ai.soundStatus)
const task = computed(() => (st.value?.task?.model === MODEL ? st.value.task : null))
const loaded = computed(() => st.value?.loaded?.id === MODEL && !task.value)
const failed = ref('')
const rate = reactive({ at: 0, done: 0, bps: 0 })
watch(
  () => task.value?.done ?? 0,
  (done) => {
    const now = performance.now()
    if (rate.at && done > rate.done) {
      const bps = ((done - rate.done) * 1000) / (now - rate.at)
      rate.bps = rate.bps ? rate.bps * 0.85 + bps * 0.15 : bps
    }
    rate.at = now
    rate.done = done
  },
)
const progress = computed(() => {
  if (loaded.value) return 1
  const t = task.value
  if (!t) return 0
  if (t.kind === 'download') return 0.92 * (t.progress ?? 0)
  return 0.95
})
const eta = computed(() => {
  const t = task.value
  if (!t || t.kind !== 'download' || !t.total || !rate.bps) return ''
  const s = Math.max(0, Math.round((t.total - t.done) / rate.bps))
  return s >= 60 ? `T-${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` : `T-0:${String(s).padStart(2, '0')}`
})
const meterLine = computed(() => {
  if (failed.value) return `HYPERDRIVE FAULT · ${failed.value}`
  if (loaded.value) return 'HYPERDRIVE CHARGED'
  const t = task.value
  if (!t) return 'CALIBRATING NAV COMPUTER'
  if (t.kind === 'download') return `DOWNLOADING HYPERDRIVE CORE · ${fmtBytes(t.done)} / ${t.total ? fmtBytes(t.total) : '?'}`
  return 'SPINNING UP CORE'
})
const SEGMENTS = 32
/** where it runs, once it does (WebGPU or CPU) */
const backend = computed(() => (st.value?.loaded && st.value.backend ? String(st.value.backend).toUpperCase() : 'CORE'))
async function prepare() {
  failed.value = ''
  ai.settings.sound.model = MODEL
  await ai.pollSound()
  if (st.value?.loaded?.id === MODEL) return
  await ai.loadSound()
}
// a failure (the task gone, an error left for this model)
watch(
  () => [ai.soundError, st.value?.error?.model === MODEL && !task.value ? st.value.error.message : ''] as const,
  ([a, b]) => {
    const why = a || b
    if (why && why !== 'cancelled' && !loaded.value) {
      failed.value = why
      // (a few tries by itself, a little later each time; RETRY after that)
      if (autoTries < 3 && phase.value !== 'out') {
        autoTries++
        timers.push(setTimeout(() => void prepare().catch((e) => (failed.value = errorMessage(e))), 4000 * autoTries))
      }
    }
  },
)
let autoTries = 0

// ── ENGAGE: the click that lets the page play sound; the jump goes as soon as the core is charged too ──
const engaged = ref(false)
function engage() {
  engaged.value = true
  void getCtx().resume()
  resume()
}
const launch = reactive({ step: 0, note: '' })
let launched = false
watch(
  () => engaged.value && loaded.value,
  (go) => go && !launched && void jump(),
)
async function jump() {
  launched = true
  phase.value = 'jump'
  try {
    const p = board.newPatch(undefined, 'Hyperspace')
    for (let i = 0; i < 3; i++) {
      launch.note = `PLOTTING COURSE · VCO ${i + 1} OF 3`
      await ai.promptSlotWave(i, PROMPTS[i]!, undefined, { model: MODEL })
      launch.step = i + 1
    }
    if (board.selectedPatch?.id === p?.id)
      for (let i = 0; i < 3; i++) {
        const g = garden.gardenOf(i)
        if (g) {
          g.subject = PROMPTS[i]!
          for (const r of g.rings) {
            const words = RINGS[i]![r.kind]
            if (words) r.words = [...words]
          }
        }
        garden.startNew(i, MODEL)
      }
    launch.note = 'JUMP'
    // (the clips' audio reaches the engine a moment after they land: middle C waits for it, and is pressed again if
    // no voice took it)
    const ready = () => (board.selectedPatch?.slots ?? []).every((x) => !x || hasAudio(board.byId(x.layer.soundId)?.audioId ?? ''))
    for (let k = 0; k < 40 && !ready(); k++) await new Promise((r) => setTimeout(r, 100))
    placePads()
    board.master.hold = true
    for (let k = 0; k < 4; k++) {
      board.noteOn(60, 0.8)
      board.noteOff(60)
      await new Promise((r) => setTimeout(r, 350))
      if (activeVoices.value.length) break
    }
  } catch (e) {
    launch.note = `COURSE ABORTED · ${errorMessage(e)}`
    await new Promise((r) => setTimeout(r, 2500))
  }
  finish()
}
/**
 * Where each intro VCO's PLAY pads start, fresh each time (points 0..1 from the bottom left): PERFORM top left, GRAIN
 * bottom right, LFO anywhere from 25 % to 60 % both ways, TEXTURE along the bottom 30–50 % across, ECHO 10–30 % both
 * ways (and heard: an echo with no MIX gets some, as a touched pad does).
 */
const between = (lo: number, hi: number) => lo + Math.random() * (hi - lo)
function placePads() {
  for (let i = 0; i < 3; i++) {
    const layer = board.selectedPatch?.slots[i]?.layer
    if (!layer) continue
    const pads = padControl({ sound: () => board.layerSound(layer)!, bpm: () => board.bpm })
    pads.write('perform', { x: between(0, 0.08), y: between(0.86, 0.94) })
    pads.write('grain', { x: between(0.92, 1), y: between(0, 0.08) })
    pads.write('lfo', { x: between(0.25, 0.6), y: between(0.25, 0.6) })
    pads.write('texture', { x: between(0.3, 0.5), y: between(0, 0.04) })
    pads.write('echo', { x: between(0.1, 0.3), y: between(0.1, 0.3) })
    if (!(layer.settings.delayMix > 0)) layer.settings.delayMix = 0.25
  }
}

function finish() {
  try {
    localStorage.setItem('ssb:intro-done', '1')
  } catch {
    /* shown again next time */
  }
  phase.value = 'out'
  // (the app under it drawn again, to fade into)
  emit('reveal')
  setTimeout(() => emit('done'), reduced ? 50 : 1100)
}
function skip() {
  if (task.value?.kind === 'download') void ai.cancelSound()
  finish()
}

// ── the timeline ──
onMounted(() => {
  ai.watchSound(true)
  void prepare().catch((e) => (failed.value = errorMessage(e)))
  raf = requestAnimationFrame(frame)
  timers.push(setTimeout(() => (phase.value = 'reveal'), reduced ? 200 : 2600))
  timers.push(
    setTimeout(() => {
      if (phase.value === 'reveal') phase.value = 'hud'
      typeCaption()
    }, reduced ? 400 : 5200),
  )
})
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  timers.forEach(clearTimeout)
  clearInterval(typer)
  ai.watchSound(false)
})
const showHud = computed(() => phase.value === 'hud' || phase.value === 'jump')
</script>

<template>
  <div class="intro" :class="[`p-${phase}`, { reduced }]" role="dialog" aria-label="SSB: preparing for the jump to hyperspace">
    <canvas ref="canvas" class="warp" />
    <div v-if="phase !== 'warp'" class="cockpit-layer" aria-hidden="true">
      <CockpitView :era="era" :design="design" :vcos="vcos" :open="() => false" :payload-for="() => null" :density="0.3" :amount="0.5" :bpm="120" />
    </div>

    <div v-if="showHud" class="hud">
      <div class="dim" />
      <div class="scan" />
      <div class="roll" />
      <div class="corner tl" /><div class="corner tr" /><div class="corner bl" /><div class="corner br" />
      <div class="telemetry left">
        <p>SSB NAV-80 · ONLINE</p>
        <p>SECTOR 0x1F4 · LOCK</p>
        <p :class="{ ok: loaded }">CORE {{ loaded ? 'CHARGED' : task ? 'CHARGING' : 'STANDBY' }}</p>
        <p :class="{ ok: engaged }">PILOT {{ engaged ? 'ENGAGED' : 'AWAITING' }}</p>
      </div>
      <div class="telemetry right">
        <p>VCO ARRAY 3/3</p>
        <p>{{ backend }} · LINK</p>
        <p>DRIFT 0.00042</p>
        <p class="blink">REC ●</p>
      </div>

      <h1 class="caption">{{ typed }}<span class="cursor">█</span></h1>

      <div class="center">
        <button v-if="phase === 'hud' && !engaged" class="engage" @click="engage">
          <span>ENGAGE HYPERSPACE</span>
        </button>
        <p v-else-if="phase === 'hud'" class="standby">ENGAGED · JUMP ON CORE CHARGE</p>
        <p v-else class="standby jump">{{ launch.note }}</p>
      </div>

      <div class="meter">
        <div class="meter-head">
          <span>{{ meterLine }}</span>
          <span>{{ loaded ? '100' : Math.floor(progress * 100) }}%<template v-if="eta"> · {{ eta }}</template></span>
        </div>
        <div class="segs">
          <i v-for="k in SEGMENTS" :key="k" :class="{ lit: k <= Math.round(progress * SEGMENTS), hot: k === Math.round(progress * SEGMENTS) && !loaded }" />
        </div>
        <button v-if="failed" class="retry" @click="prepare">RETRY</button>
      </div>
    </div>

    <button v-if="phase !== 'out' && phase !== 'jump'" class="skip" @click="skip">SKIP INTRO ›</button>
  </div>
</template>

<style scoped>
.intro {
  --hud: #ff5a3c;
  --hud-hi: #ffd2c4;
  --hud-dim: rgba(255, 90, 60, 0.45);
  position: fixed;
  inset: 0;
  z-index: 5000;
  overflow: hidden;
  background: #02010a;
  font-family: 'Share Tech Mono', 'VT323', ui-monospace, monospace;
  color: var(--hud);
  isolation: isolate;
  transition: opacity 1s ease;
}
.intro.p-out {
  opacity: 0;
  pointer-events: none;
}
.warp {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
}
/* the jump: the stars come back over the cockpit */
.p-jump .warp,
.p-out .warp {
  z-index: 3;
}
.cockpit-layer {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  /* the windscreen's vanishing point (1980's: 800, 236 of 1600 × 900) */
  transform-origin: 50% 26%;
  animation: pullback 2.6s cubic-bezier(0.16, 0.8, 0.24, 1) both;
}
/* pulled back: no animation left on it (a finished one held by fill-mode keeps it an animating layer, which upsets
   the drawing of everything over it) */
.p-hud .cockpit-layer {
  animation: none;
}
.p-jump .cockpit-layer,
.p-out .cockpit-layer {
  animation: punch 3.2s cubic-bezier(0.7, 0, 0.84, 0) both;
}
@keyframes pullback {
  from {
    transform: scale(3.6);
    opacity: 0;
    filter: blur(6px) brightness(1.8);
  }
  35% {
    opacity: 1;
  }
  to {
    transform: scale(1);
    opacity: 1;
    filter: none;
  }
}
@keyframes punch {
  from {
    transform: scale(1);
  }
  to {
    transform: scale(4.5);
    filter: blur(4px) brightness(2.2);
    opacity: 0.2;
  }
}
/* ── the HUD ── */
.hud {
  position: absolute;
  inset: 0;
  z-index: 4;
  pointer-events: none;
  text-shadow: 0 0 6px var(--hud);
}
/* The HUD paints on the base layer, which is always drawn. Only what animates gets a layer of its own (the roll,
   the button's pulse, the blinkers), and nothing on one changes its content: a layer redrawn as it changes (a caption
   typing out, a meter counting) could be left undrawn while the cockpit's WebGL has the GPU. */
/* the cockpit dimmed behind the caption, button and meter, so they read */
.dim {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 60% 26% at 50% 50%, rgba(2, 1, 10, 0.72), transparent 100%),
    linear-gradient(0deg, rgba(2, 1, 10, 0.75) 0%, transparent 26%);
}
.scan {
  /* scanlines: still (an animated background would repaint the whole layer every frame) */
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.16) 0 1px, transparent 1px 3px);
  pointer-events: none;
}
/* the slow roll: a band moved by transform, on its own layer */
.roll {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 30%;
  background: linear-gradient(180deg, transparent, rgba(255, 90, 60, 0.05), transparent);
  will-change: transform;
  animation: roll 6s linear infinite;
  pointer-events: none;
}
@keyframes roll {
  from {
    transform: translateY(-100%);
  }
  to {
    transform: translateY(340%);
  }
}
@keyframes hud-on {
  0% {
    opacity: 0;
  }
  50% {
    opacity: 1;
  }
  60% {
    opacity: 0.2;
  }
  100% {
    opacity: 1;
  }
}
@keyframes roll {
  from {
    background-position: 0 0, 0 -30%;
  }
  to {
    background-position: 0 0, 0 130%;
  }
}
.corner {
  position: absolute;
  width: 42px;
  height: 42px;
  border: 2px solid var(--hud);
}
.corner.tl {
  top: 22px;
  left: 22px;
  border-right: 0;
  border-bottom: 0;
}
.corner.tr {
  top: 22px;
  right: 22px;
  border-left: 0;
  border-bottom: 0;
}
.corner.bl {
  bottom: 22px;
  left: 22px;
  border-right: 0;
  border-top: 0;
}
.corner.br {
  bottom: 22px;
  right: 22px;
  border-left: 0;
  border-top: 0;
}
.telemetry {
  position: absolute;
  top: 36px;
  font-size: 13px;
  line-height: 1.5;
  letter-spacing: 0.12em;
  color: var(--hud-dim);
}
.telemetry p {
  margin: 0;
}
.telemetry .ok {
  color: #7dff9a;
  text-shadow: 0 0 8px rgba(125, 255, 154, 0.6);
}
.telemetry.left {
  left: 76px;
}
.telemetry.right {
  right: 76px;
  text-align: right;
}
.blink {
  /* (blinkers on their own layers: a blink painted into its parent repaints that parent forever, and on a busy GPU the
     parent -- the caption -- could go undrawn) */
  display: inline-block;
  will-change: opacity;
  animation: blink 1s steps(2) infinite;
}
@keyframes blink {
  50% {
    opacity: 0;
  }
}
.caption {
  position: absolute;
  left: 50%;
  top: 47%;
  width: min(92vw, 1100px);
  margin: 0;
  transform: translate(-50%, -50%);
  font-family: inherit;
  font-weight: 400;
  font-size: clamp(20px, 3.4vw, 44px);
  letter-spacing: 0.16em;
  text-align: center;
  color: var(--hud-hi);
}
.cursor {
  display: inline-block;
  margin-left: 4px;
  will-change: opacity;
  animation: blink 0.8s steps(2) infinite;
}
@keyframes flicker {
  0%,
  100% {
    opacity: 1;
  }
  92% {
    opacity: 1;
  }
  93% {
    opacity: 0.55;
  }
  94% {
    opacity: 1;
  }
  97% {
    opacity: 0.8;
  }
}
.center {
  position: absolute;
  left: 50%;
  top: 60%;
  transform: translate(-50%, -50%);
  pointer-events: auto;
}
.engage {
  position: relative;
  padding: 16px 38px;
  font-family: inherit;
  font-size: clamp(16px, 2vw, 22px);
  letter-spacing: 0.3em;
  color: #fff;
  background: rgba(255, 70, 40, 0.12);
  border: 2px solid var(--hud);
  clip-path: polygon(14px 0, 100% 0, 100% calc(100% - 14px), calc(100% - 14px) 100%, 0 100%, 0 14px);
  text-shadow: 0 0 10px var(--hud);
  box-shadow:
    inset 0 0 22px rgba(255, 70, 40, 0.35),
    0 0 26px rgba(255, 70, 40, 0.4);
  cursor: pointer;
}
.engage::before {
  /* the pulse: a glow fading in and out (opacity runs on the compositor: no repaint) */
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse at center, rgba(255, 90, 60, 0.45), transparent 70%);
  will-change: opacity;
  animation: pulse 1.6s ease-in-out infinite;
  pointer-events: none;
}
.engage span {
  position: relative;
}
.engage:hover {
  background: rgba(255, 70, 40, 0.3);
}
.engage:focus-visible {
  outline: 2px solid #fff;
  outline-offset: 4px;
}
@keyframes pulse {
  from,
  to {
    opacity: 0.25;
  }
  50% {
    opacity: 1;
  }
}
.standby {
  margin: 0;
  font-size: clamp(14px, 1.6vw, 18px);
  letter-spacing: 0.24em;
  white-space: nowrap;
  color: var(--hud-hi);
  animation: blink 1.2s steps(2) infinite;
}
.standby.jump {
  animation: none;
}
.meter {
  position: absolute;
  left: 50%;
  bottom: 9%;
  width: min(86vw, 720px);
  transform: translateX(-50%);
  pointer-events: auto;
}
.meter-head {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 8px;
  font-size: clamp(11px, 1.3vw, 14px);
  letter-spacing: 0.14em;
}
.meter-head span:first-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.segs {
  display: grid;
  grid-template-columns: repeat(32, 1fr);
  gap: 3px;
  padding: 4px;
  border: 1px solid var(--hud-dim);
}
.segs i {
  height: 14px;
  background: rgba(255, 90, 60, 0.1);
  transform: skewX(-18deg);
}
.segs i.lit {
  background: var(--hud);
  box-shadow: 0 0 8px var(--hud);
}
.segs i.hot {
  will-change: opacity;
  animation: blink 0.5s steps(2) infinite;
}
.retry {
  margin-top: 10px;
  padding: 4px 14px;
  font-family: inherit;
  letter-spacing: 0.2em;
  color: var(--hud-hi);
  background: none;
  border: 1px solid var(--hud);
  cursor: pointer;
}
.skip {
  position: absolute;
  right: 28px;
  bottom: 26px;
  z-index: 6;
  padding: 4px 8px;
  font-family: inherit;
  font-size: 12px;
  letter-spacing: 0.2em;
  color: rgba(255, 255, 255, 0.45);
  background: none;
  border: 0;
  cursor: pointer;
}
.skip:hover {
  color: #fff;
}
@media (max-width: 700px) {
  .telemetry {
    display: none;
  }
}
</style>
