<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import * as engine from '../audio/engine'

/**
 * The garden's GAME: three short rounds that pick the next caption's words, the VCO's output pulsing through each.
 * - ORBIT: words circle the VCO's star; drag back and let go to fling comets at them (gravity bends their path).
 * - RAIN: words fall through a wind that won't stay still; catch them on the paddle.
 * - MAGNET: words drift; hold the pointer down to pull them, and herd them into the portal.
 * What's caught goes back (`catch`) as the words, with the ring each came from.
 */
export interface GameWord {
  word: string
  ringId: string | null
  color: string
}
const props = defineProps<{ words: GameWord[] }>()
const emit = defineEmits<{ catch: [words: GameWord[]] }>()

const GAMES = [
  { id: 'orbit', name: 'ORBIT', how: 'Drag back from anywhere and let go: comets fall through the star\'s gravity. Hit words to catch them.' },
  { id: 'rain', name: 'RAIN', how: 'Words fall in a shifting wind: catch them on your paddle (it follows the pointer).' },
  { id: 'magnet', name: 'MAGNET', how: 'Hold the pointer down to pull words toward it: herd them into the portal in the middle.' },
] as const
const ROUND_S = 20

const canvas = ref<HTMLCanvasElement>()
const ui = reactive({ game: 0, phase: 'ready' as 'ready' | 'play' | 'between' | 'done', left: ROUND_S, caught: [] as GameWord[] })
const game = computed(() => GAMES[ui.game])

interface Body {
  w: GameWord
  x: number
  y: number
  vx: number
  vy: number
  r: number
  alive: boolean
  born: number
}
interface Spark {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  color: string
}
let bodies: Body[] = []
let comets: { x: number; y: number; vx: number; vy: number; trail: [number, number][] }[] = []
let sparks: Spark[] = []
let W = 600
let H = 360
let pointer = { x: 300, y: 300, down: false, sx: 0, sy: 0 }
let raf = 0
let last = 0
let clock = 0
let level = 0
let wind = 0

const pick = () => props.words[Math.floor(Math.random() * props.words.length)]
function spawn(): Body | null {
  if (!props.words.length) return null
  const w = pick()
  const b: Body = { w, x: 0, y: 0, vx: 0, vy: 0, r: 10 + w.word.length * 3.2, alive: true, born: clock }
  const g = game.value.id
  if (g === 'orbit') {
    const rad = 70 + Math.random() * (Math.min(W, H) / 2 - 80)
    const a = Math.random() * Math.PI * 2
    const v = Math.sqrt(GM() / rad) * (Math.random() < 0.5 ? 1 : -1)
    Object.assign(b, { x: W / 2 + Math.cos(a) * rad, y: H / 2 + Math.sin(a) * rad, vx: -Math.sin(a) * v, vy: Math.cos(a) * v })
  } else if (g === 'rain') Object.assign(b, { x: 40 + Math.random() * (W - 80), y: -20, vx: 0, vy: 20 + Math.random() * 30 })
  else Object.assign(b, { x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40 })
  bodies.push(b)
  return b
}
/** the star's pull: stronger as the VCO gets louder */
const GM = () => 9e5 * (1 + 1.5 * level)

function burst(x: number, y: number, color: string, n = 26) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2
    const v = 60 + Math.random() * 220
    sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, color })
  }
}
function catchBody(b: Body) {
  b.alive = false
  ui.caught.push(b.w)
  burst(b.x, b.y, b.w.color)
}

function start(i: number) {
  ui.game = i
  ui.phase = 'play'
  ui.left = ROUND_S
  bodies = []
  comets = []
  sparks = []
  const n = game.value.id === 'rain' ? 3 : 7
  for (let k = 0; k < n; k++) spawn()
}
function startSeries() {
  ui.caught = []
  start(0)
}
function endRound() {
  if (ui.game < GAMES.length - 1) ui.phase = 'between'
  else {
    ui.phase = 'done'
    emit('catch', [...ui.caught])
  }
}

function step(dt: number) {
  const lv = engine.levels.value
  level += (Math.max(lv[0], lv[1]) - level) * 0.1
  clock += dt
  for (const s of sparks) {
    s.x += s.vx * dt
    s.y += s.vy * dt
    s.vx *= 0.96
    s.vy *= 0.96
    s.life -= dt * 1.4
  }
  sparks = sparks.filter((s) => s.life > 0)
  if (ui.phase !== 'play') return
  ui.left = Math.max(0, ui.left - dt)
  if (ui.left <= 0) return endRound()
  const g = game.value.id
  const cx = W / 2
  const cy = H / 2
  if (g === 'orbit') {
    const pull = (o: { x: number; y: number; vx: number; vy: number }) => {
      const dx = cx - o.x
      const dy = cy - o.y
      const d2 = Math.max(400, dx * dx + dy * dy)
      const f = GM() / d2 / Math.sqrt(d2)
      o.vx += dx * f * dt
      o.vy += dy * f * dt
      o.x += o.vx * dt
      o.y += o.vy * dt
      return d2
    }
    for (const b of bodies) if (b.alive) pull(b)
    for (const c of comets) {
      const d2 = pull(c)
      c.trail.push([c.x, c.y])
      if (c.trail.length > 30) c.trail.shift()
      if (d2 < 900) {
        burst(c.x, c.y, '#fff', 10)
        c.x = 1e9
      }
      for (const b of bodies)
        if (b.alive && Math.hypot(b.x - c.x, b.y - c.y) < b.r * 0.6 + 6) {
          catchBody(b)
          c.x = 1e9
        }
    }
    comets = comets.filter((c) => c.x > -W && c.x < W * 2 && c.y > -H && c.y < H * 2)
    // the star swallows a word that falls in, and a word thrown out of the field is lost: new ones arrive
    for (const b of bodies) if (b.alive && (Math.hypot(b.x - cx, b.y - cy) < 26 || b.x < -100 || b.x > W + 100 || b.y < -100 || b.y > H + 100)) b.alive = false
    while (bodies.filter((b) => b.alive).length < 7) spawn()
  } else if (g === 'rain') {
    wind += (Math.sin(clock * 0.7) * 60 + Math.sin(clock * 2.3) * 25 - wind) * dt
    const py = H - 24
    const pw = 110
    for (const b of bodies) {
      if (!b.alive) continue
      b.vy += (60 + 80 * level) * dt
      b.vx += (wind - b.vx) * dt * 0.8
      b.x += b.vx * dt
      b.y += b.vy * dt
      if (b.y > py - 8 && b.y < py + 12 && Math.abs(b.x - pointer.x) < pw / 2 + b.r * 0.3) catchBody(b)
      else if (b.y > H + 30) b.alive = false
    }
    if (Math.random() < dt * (1.2 + clock * 0.02)) spawn()
  } else {
    const pr = 46
    for (const b of bodies) {
      if (!b.alive) continue
      if (pointer.down) {
        const dx = pointer.x - b.x
        const dy = pointer.y - b.y
        const d = Math.max(30, Math.hypot(dx, dy))
        b.vx += (dx / d) * (9e4 / d) * dt
        b.vy += (dy / d) * (9e4 / d) * dt
      }
      // a restless drift, livelier when the VCO is loud
      b.vx += (Math.random() - 0.5) * 300 * (0.3 + level) * dt
      b.vy += (Math.random() - 0.5) * 300 * (0.3 + level) * dt
      b.vx *= 0.985
      b.vy *= 0.985
      b.x += b.vx * dt
      b.y += b.vy * dt
      if (b.x < 10 || b.x > W - 10) b.vx *= -1
      if (b.y < 10 || b.y > H - 10) b.vy *= -1
      b.x = Math.min(W - 10, Math.max(10, b.x))
      b.y = Math.min(H - 10, Math.max(10, b.y))
      if (Math.hypot(b.x - cx, b.y - cy) < pr) catchBody(b)
    }
    while (bodies.filter((b) => b.alive).length < 7) spawn()
  }
  bodies = bodies.filter((b) => b.alive)
}

function draw() {
  const c = canvas.value
  if (!c) return
  const dpr = window.devicePixelRatio || 1
  W = c.clientWidth
  H = c.clientHeight
  if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
    c.width = Math.round(W * dpr)
    c.height = Math.round(H * dpr)
  }
  const g = c.getContext('2d')!
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.fillStyle = 'rgba(5, 3, 12, 0.35)' // the trails linger
  g.fillRect(0, 0, W, H)
  const cx = W / 2
  const cy = H / 2
  const id = game.value.id
  if (id === 'orbit') {
    const rr = 18 + 22 * level
    const sg = g.createRadialGradient(cx, cy, 0, cx, cy, rr * 3)
    sg.addColorStop(0, '#fff')
    sg.addColorStop(0.3, '#ffd23e')
    sg.addColorStop(1, 'rgba(255, 80, 0, 0)')
    g.fillStyle = sg
    g.beginPath()
    g.arc(cx, cy, rr * 3, 0, Math.PI * 2)
    g.fill()
    for (const k of comets) {
      g.strokeStyle = '#3ef0ff'
      g.lineWidth = 2
      g.beginPath()
      k.trail.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)))
      g.stroke()
      g.fillStyle = '#fff'
      g.beginPath()
      g.arc(k.x, k.y, 4, 0, Math.PI * 2)
      g.fill()
    }
    if (pointer.down && ui.phase === 'play') {
      g.strokeStyle = 'rgba(62, 240, 255, 0.7)'
      g.setLineDash([4, 4])
      g.beginPath()
      g.moveTo(pointer.sx, pointer.sy)
      g.lineTo(pointer.x, pointer.y)
      g.stroke()
      g.setLineDash([])
    }
  } else if (id === 'rain') {
    g.fillStyle = '#7dff6a'
    g.shadowColor = '#7dff6a'
    g.shadowBlur = 12 + 30 * level
    g.fillRect(pointer.x - 55, H - 24, 110, 6)
    g.shadowBlur = 0
    g.fillStyle = 'rgba(255,255,255,0.4)'
    g.font = '13px VT323, monospace'
    g.textAlign = 'left'
    g.fillText(`WIND ${wind > 0 ? '→' : '←'} ${Math.abs(Math.round(wind))}`, 10, H - 8)
  } else {
    const pr = 46 * (1 + 0.15 * Math.sin(clock * 4) + 0.3 * level)
    const pg = g.createRadialGradient(cx, cy, 0, cx, cy, pr)
    pg.addColorStop(0, 'rgba(0,0,0,1)')
    pg.addColorStop(0.7, 'rgba(169, 139, 255, 0.5)')
    pg.addColorStop(1, 'rgba(169, 139, 255, 0)')
    g.fillStyle = pg
    g.beginPath()
    g.arc(cx, cy, pr, 0, Math.PI * 2)
    g.fill()
    if (pointer.down) {
      g.strokeStyle = 'rgba(255, 79, 216, 0.6)'
      for (let k = 1; k <= 3; k++) {
        g.beginPath()
        g.arc(pointer.x, pointer.y, ((clock * 60 + k * 20) % 60) + 4, 0, Math.PI * 2)
        g.stroke()
      }
    }
  }
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  for (const b of bodies) {
    const fresh = Math.min(1, (clock - b.born) * 3)
    g.globalAlpha = fresh
    g.font = `${16 + Math.round(level * 6)}px VT323, monospace`
    g.fillStyle = b.w.color
    g.shadowColor = b.w.color
    g.shadowBlur = 10
    g.fillText(b.w.word, b.x, b.y)
    g.shadowBlur = 0
  }
  g.globalAlpha = 1
  for (const s of sparks) {
    g.globalAlpha = Math.max(0, s.life)
    g.fillStyle = s.color
    g.fillRect(s.x - 1.5, s.y - 1.5, 3, 3)
  }
  g.globalAlpha = 1
}

function frame(t: number) {
  const dt = Math.min(0.05, (t - (last || t)) / 1000)
  last = t
  // physics in small steps: orbits stay orbits
  const n = 4
  for (let i = 0; i < n; i++) step(dt / n)
  draw()
  raf = requestAnimationFrame(frame)
}

function pos(e: PointerEvent) {
  const r = canvas.value!.getBoundingClientRect()
  pointer.x = e.clientX - r.left
  pointer.y = e.clientY - r.top
}
function down(e: PointerEvent) {
  pos(e)
  pointer.down = true
  pointer.sx = pointer.x
  pointer.sy = pointer.y
  canvas.value?.setPointerCapture(e.pointerId)
}
function up(e: PointerEvent) {
  pos(e)
  if (pointer.down && game.value.id === 'orbit' && ui.phase === 'play' && comets.length < 4) {
    comets.push({ x: pointer.sx, y: pointer.sy, vx: (pointer.sx - pointer.x) * 2.2, vy: (pointer.sy - pointer.y) * 2.2, trail: [] })
  }
  pointer.down = false
}

onMounted(() => (raf = requestAnimationFrame(frame)))
onBeforeUnmount(() => cancelAnimationFrame(raf))
defineExpose({ startSeries })
</script>

<template>
  <div class="game">
    <div class="hud">
      <span v-for="(gm, i) in GAMES" :key="gm.id" class="round" :class="{ on: ui.game === i && ui.phase !== 'done', done: i < ui.game || ui.phase === 'done' }">{{ i + 1 }} {{ gm.name }}</span>
      <v-spacer />
      <span v-if="ui.phase === 'play'" class="clock">{{ Math.ceil(ui.left) }} s</span>
      <span class="score">CAUGHT {{ ui.caught.length }}</span>
    </div>
    <div class="stage">
      <canvas ref="canvas" @pointerdown="down" @pointermove="pos" @pointerup="up" @pointercancel="pointer.down = false" />
      <div v-if="ui.phase !== 'play'" class="card">
        <template v-if="ui.phase === 'ready'">
          <b>PICK THE WORDS BY PLAYING</b>
          <p>Three rounds of {{ ROUND_S }} s. What you catch is the next caption; the VCO's sound drives the physics.</p>
          <button class="go" :disabled="!words.length" @click="startSeries">START</button>
        </template>
        <template v-else-if="ui.phase === 'between'">
          <b>ROUND {{ ui.game + 2 }}: {{ GAMES[ui.game + 1]!.name }}</b>
          <p>{{ GAMES[ui.game + 1]!.how }}</p>
          <button class="go" @click="start(ui.game + 1)">GO</button>
        </template>
        <template v-else>
          <b>{{ ui.caught.length ? `${ui.caught.length} WORDS CAUGHT` : 'NOTHING CAUGHT' }}</b>
          <button class="go" @click="startSeries">PLAY AGAIN</button>
        </template>
      </div>
      <div v-else class="how">{{ game.how }}</div>
    </div>
    <div class="catch">
      <span v-for="(w, i) in ui.caught" :key="i" class="word" :style="{ color: w.color, borderColor: w.color }">{{ w.word }}</span>
      <span v-if="!ui.caught.length" class="none">what you catch shows here</span>
    </div>
  </div>
</template>

<style scoped>
.game {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 0;
}
.hud {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: 'Orbitron', sans-serif;
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.12em;
  color: var(--text-mute);
}
.round {
  padding: 2px 6px;
  border-radius: 3px;
  border: 1px solid #333;
}
.round.on {
  color: #05030a;
  background: #7dff6a;
  border-color: #7dff6a;
}
.round.done {
  color: #7dff6a;
}
.clock,
.score {
  font-family: 'VT323', monospace;
  font-size: 16px;
  letter-spacing: 0;
  color: #ffd23e;
}
.stage {
  position: relative;
  flex: 1;
  min-height: 260px;
}
canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  border-radius: 6px;
  background: #05030c;
  border: 1px solid #222;
  touch-action: none;
  cursor: crosshair;
}
.card {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px;
  text-align: center;
  background: rgba(5, 3, 12, 0.7);
  border-radius: 6px;
  font-family: 'VT323', monospace;
  color: #ddd;
}
.card b {
  font-family: 'Orbitron', sans-serif;
  font-size: 13px;
  letter-spacing: 0.15em;
  color: #7dff6a;
}
.card p {
  max-width: 380px;
  margin: 0;
  font-size: 16px;
}
.go {
  padding: 4px 18px;
  border-radius: 4px;
  font-family: 'Orbitron', sans-serif;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 0.2em;
  color: #05030a;
  background: #7dff6a;
  box-shadow: 0 0 16px rgba(125, 255, 106, 0.5);
}
.go:disabled {
  opacity: 0.4;
}
.how {
  position: absolute;
  left: 8px;
  top: 6px;
  pointer-events: none;
  font-family: 'VT323', monospace;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.45);
}
.catch {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  min-height: 22px;
}
.word {
  padding: 0 6px;
  border: 1px solid;
  border-radius: 10px;
  font-family: 'VT323', monospace;
  font-size: 15px;
}
.none {
  font-family: 'VT323', monospace;
  font-size: 14px;
  color: var(--text-mute);
}
</style>
