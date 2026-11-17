/**
 * The PROMPT GARDEN's words on the shader stage (shaders.ts): while a VCO grows, each word of the prompt playing is an
 * entity drifting through that VCO's column, behind the pads -- carried on a slow flow field, kicked by the audio,
 * fading in one after another when a new prompt is stitched in and out when it goes. The stage draws them from a text
 * atlas made here (white words on a 2D canvas, mip-mapped for the glow) with film palettes and lens defects.
 */

/** the most words on the stage at once (all VCOs, the ones fading out with them) */
export const MAX_WORDS = 40
/** texels a word takes in the data texture */
export const WORD_W = 4
/** a VCO's words: the first this many of its prompt */
const PER_VCO = 12
const FADE_IN = 1.4
const FADE_OUT = 1.8
const STAGGER = 0.22

export interface Word {
  key: string
  text: string
  slot: number
  /** 0..1 across / up its VCO's column */
  x: number
  y: number
  /** where it drifts about: spread over the column so the words never heap up */
  hx: number
  hy: number
  vx: number
  vy: number
  seed: number
  /** which film palette (shaders.ts pal) */
  palette: number
  /** s since it came in (negative: waiting its turn) */
  age: number
  /** s since its prompt went (-1: still playing) */
  gone: number
  alpha: number
  /** SCROLL: the prompt it came in with (each a line of its own), and its place in it */
  line: number
  order: number
}

/** a prompt's words: split on spaces and commas, the short glue words left out */
const GLUE = new Set(['a', 'an', 'the', 'of', 'in', 'on', 'at', 'and', 'with', 'to'])
export function promptWords(prompt: string): string[] {
  return prompt
    .split(/[\s,]+/)
    .map((w) => w.trim())
    .filter((w) => w && !GLUE.has(w.toLowerCase()))
    .slice(0, PER_VCO)
}

const hash = (s: string) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
  return ((h >>> 0) % 100000) / 100000
}

/** The words of every growing VCO, moved a frame at a time. */
export class WordField {
  readonly words: Word[] = []
  private prompts = new Map<number, string>()
  private lines = 0

  /** VCO `slot`'s prompt now ('' : not growing). A new one sends the old words out and brings its own in. */
  setPrompt(slot: number, prompt: string) {
    if (this.prompts.get(slot) === prompt) return
    this.prompts.set(slot, prompt)
    for (const w of this.words) if (w.slot === slot && w.gone < 0) w.gone = 0
    const line = ++this.lines
    promptWords(prompt).forEach((text, i) => {
      // full: the oldest of the words going make room
      if (this.words.length >= MAX_WORDS) {
        const old = this.words.findIndex((w) => w.gone >= 0)
        if (old < 0) return
        this.words.splice(old, 1)
      }
      const seed = hash(`${slot}:${i}:${text}:${prompt}`)
      // homes spread over the column on a golden-angle spiral (sunflower seeds), turned by the prompt
      const n = Math.min(PER_VCO, promptWords(prompt).length)
      const a = hash(prompt) * Math.PI * 2 + i * 2.39996
      const r = 0.38 * Math.sqrt((i + 0.5) / n)
      const hx = 0.5 + Math.cos(a) * r * 0.85
      const hy = 0.5 + Math.sin(a) * r
      this.words.push({
        key: `${slot}:${i}:${text}`,
        text,
        slot,
        x: hx + (seed - 0.5) * 0.1,
        y: hy - 0.05,
        hx,
        hy,
        vx: 0,
        vy: 0,
        seed,
        palette: Math.floor(hash(prompt) * 4 + i * 0.35) % 4,
        age: -i * STAGGER,
        gone: -1,
        alpha: 0,
        line,
        order: i,
      })
    })
  }

  /** a VCO no longer on the stage: its words go */
  drop(slot: number) {
    this.setPrompt(slot, '')
  }

  /**
   * One frame: the flow carries them, the audio (`level` by slot) kicks them, the column's edges turn them back. A word
   * whose prompt has gone fades out -- unless `hold` keeps it (SCROLL: till its line has gone by).
   */
  step(dt: number, t: number, level: (slot: number) => number, speed = 1, hold?: (w: Word) => boolean) {
    const ws = this.words
    for (const w of ws) {
      w.age += dt
      if (w.gone >= 0 && !hold?.(w)) w.gone += dt
      const lv = level(w.slot)
      // a slow curl: each word on its own current
      const k = 0.018 * speed
      const ax = Math.sin(w.y * 4.1 + t * 0.21 + w.seed * 6.3) * k + Math.sin(t * 0.07 + w.seed * 11) * k * 0.5
      const ay = Math.cos(w.x * 3.7 - t * 0.17 + w.seed * 4.1) * k * 0.8 + Math.cos(t * 0.05 + w.seed * 7) * k * 0.4
      // home pulls it back, softly: it wanders, it doesn't leave
      w.vx += (w.hx - w.x) * 0.05 * dt
      w.vy += (w.hy - w.y) * 0.05 * dt
      // louder: a shove along the current, and a shiver
      const kick = lv * lv * 0.06 * speed
      w.vx += (ax + Math.sin(t * 9 + w.seed * 40) * kick) * dt
      w.vy += (ay + Math.cos(t * 7 + w.seed * 30) * kick) * dt
      // keep apart from the others of its column
      for (const o of ws) {
        if (o === w || o.slot !== w.slot) continue
        const dx = w.x - o.x
        const dy = (w.y - o.y) * 1.6
        const d2 = dx * dx + dy * dy
        if (d2 < 0.035 && d2 > 1e-6) {
          w.vx += (dx / d2) * 0.0007 * dt * (o.gone < 0 ? 1 : 0.3)
          w.vy += (dy / d2) * 0.0007 * dt * (o.gone < 0 ? 1 : 0.3)
        }
      }
      // the column's edges push back softly
      const edge = (p: number) => (p < 0.1 ? (0.1 - p) * 0.6 : p > 0.9 ? (0.9 - p) * 0.6 : 0)
      w.vx += edge(w.x) * dt
      w.vy += edge(w.y) * dt
      const damp = Math.pow(0.35, dt)
      w.vx *= damp
      w.vy *= damp
      w.x += w.vx * dt * 6
      w.y += w.vy * dt * 6
      const inA = Math.min(1, Math.max(0, w.age / FADE_IN))
      const outA = w.gone < 0 ? 1 : Math.max(0, 1 - w.gone / FADE_OUT)
      w.alpha = inA * inA * (3 - 2 * inA) * outA
    }
    for (let i = ws.length - 1; i >= 0; i--) if (ws[i].gone >= FADE_OUT) ws.splice(i, 1)
  }
}

/** Where each word sits in the atlas (u0, v0 top, u1, v1 bottom) and its shape (width / height). */
export interface Glyph {
  u0: number
  v0: number
  u1: number
  v1: number
  aspect: number
}

/**
 * The words drawn once each, white on clear, into rows of a 2D canvas the stage uploads as a texture. When it fills,
 * it starts again with only the words still wanted.
 */
export class WordAtlas {
  static readonly W = 2048
  static readonly H = 1024
  static readonly ROW = 112
  static readonly FONT = 80
  readonly canvas: HTMLCanvasElement | OffscreenCanvas
  private g: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D
  private glyphs = new Map<string, Glyph>()
  private x = 0
  private y = 0
  /** drawn to since the stage last uploaded it */
  dirty = false

  constructor() {
    const c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(WordAtlas.W, WordAtlas.H) : Object.assign(document.createElement('canvas'), { width: WordAtlas.W, height: WordAtlas.H })
    this.canvas = c
    this.g = c.getContext('2d') as CanvasRenderingContext2D
  }

  private font() {
    return `900 ${WordAtlas.FONT}px Orbitron, 'Arial Black', sans-serif`
  }

  /** `text`'s place, drawing it if it's new (null: no room even after starting again) */
  glyph(text: string, keep: Iterable<string>): Glyph | null {
    const hit = this.glyphs.get(text)
    if (hit) return hit
    const g = this.g
    g.font = this.font()
    const pad = 24
    const w = Math.min(WordAtlas.W - 2 * pad, Math.ceil(g.measureText(text.toUpperCase()).width)) + 2 * pad
    if (this.x + w > WordAtlas.W) {
      this.x = 0
      this.y += WordAtlas.ROW
    }
    if (this.y + WordAtlas.ROW > WordAtlas.H) {
      // full: again, with only the words still on the stage
      const want = [...new Set(keep)].filter((k) => k !== text)
      this.glyphs.clear()
      g.clearRect(0, 0, WordAtlas.W, WordAtlas.H)
      this.x = this.y = 0
      for (const k of want) this.glyph(k, [])
      if (this.y + WordAtlas.ROW > WordAtlas.H) return null
      return this.glyph(text, [])
    }
    g.font = this.font()
    g.textBaseline = 'middle'
    g.fillStyle = '#fff'
    g.fillText(text.toUpperCase(), this.x + pad, this.y + WordAtlas.ROW / 2, w - 2 * pad)
    const gl: Glyph = {
      u0: this.x / WordAtlas.W,
      v0: this.y / WordAtlas.H,
      u1: (this.x + w) / WordAtlas.W,
      v1: (this.y + WordAtlas.ROW) / WordAtlas.H,
      aspect: w / WordAtlas.ROW,
    }
    this.glyphs.set(text, gl)
    this.x += w
    this.dirty = true
    return gl
  }
}
