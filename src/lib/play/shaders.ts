/**
 * The Play view's shader stage: ONE WebGL2 canvas behind the rack's whole PLAY area -- every VCO, every pad -- drawn
 * each frame from where each pad is on the page and what it's set to. Each pad gets its own effect inside its rect
 * (fed the VCO's live audio and the pad's settings), and the effects carry across the borders: halos bleeding between
 * pads, a neon rim on each, light running along threads from each VCO's PERFORM view to its pads, a shared field
 * underneath, and feedback trails that drift out of a pad and over its neighbours. Purely visual: nothing here reaches
 * either audio engine.
 *
 * The pads stay DOM elements (pointer input is theirs; the canvas ignores the pointer) and draw their own crisp 2D
 * pictures over the stage. Without WebGL2, or with SHADERS off, the stage isn't drawn and the pads draw only those.
 *
 * Each PlayView registers its VCO (registerVco); ShaderStage.vue runs the loop. The prefs (on / off, each pad kind's
 * style and knobs) are the page's own, kept in localStorage: not part of a patch.
 */
import { reactive, watch } from 'vue'
import { MAX_WORDS, WORD_W, WordAtlas, WordField, type Word } from './words'

export type PadKind = 'perform' | 'grain' | 'lfo' | 'fx' | 'pitch' | 'texture' | 'echo' | 'tone'
const KIND_INDEX: Record<PadKind, number> = { perform: 0, grain: 1, lfo: 2, fx: 3, pitch: 4, texture: 5, echo: 6, tone: 7 }
export interface PadShader {
  /** which of the pad's styles (SHADER_STYLES) */
  style: number
  /** how strongly it shows, 0..1 */
  amount: number
  /** bloom inside, and the halo it throws over its neighbours, 0..1 */
  glow: number
  /** feedback: how long its light lingers and drifts out over the pads around it, 0..1 */
  trail: number
  /** how fast it moves, 0..2 (1: as designed) */
  speed: number
}
export const SHADER_STYLES: Record<PadKind, readonly string[]> = {
  perform: ['SPECTRAL', 'STARFIELD', 'LIQUID'],
  grain: ['NEBULA', 'PULSAR', 'MOIRÉ'],
  lfo: ['TIDE', 'AURORA', 'VORTEX'],
  fx: ['HORIZON', 'CAUSTIC', 'PLASMA'],
  pitch: ['WARP', 'RIPPLE', 'KALEIDO'],
  texture: ['POLLEN', 'SILK', 'DUST'],
  echo: ['TUNNEL', 'SONAR', 'MIRROR'],
  tone: ['PRISM', 'EMBER', 'TIDEPOOL'],
}
const KINDS = Object.keys(SHADER_STYLES) as PadKind[]
export const SHADER_DEFAULTS: PadShader = { style: 0, amount: 0.6, glow: 0.45, trail: 0.35, speed: 1 }
const KEY = 'ssb:play:shaders'
/** the PROMPT GARDEN's words drifting behind the pads (words.ts): on / off, how much, the lens's flares, its age */
export type WordsStyle = 'scroll' | 'drift'
/** SCROLL: the prompt in order, a line gliding slowly across the column; DRIFT: each word on its own current */
export const WORDS_STYLES: { id: WordsStyle; label: string; title: string }[] = [
  { id: 'scroll', label: 'SCROLL', title: 'The prompt in order, gliding slowly across behind the pads' },
  { id: 'drift', label: 'DRIFT', title: 'Each word drifting on its own current, kicked by the audio' },
]
export interface WordsPrefs {
  on: boolean
  style: WordsStyle
  amount: number
  flare: number
  /** the old lens and film: colour slipping apart, halation, grain, dust, gate weave */
  defects: number
}
export const WORDS_DEFAULTS: WordsPrefs = { on: true, style: 'scroll', amount: 0.8, flare: 0.5, defects: 0.5 }

function load() {
  const prefs = {
    on: true,
    pads: Object.fromEntries(KINDS.map((k) => [k, { ...SHADER_DEFAULTS }])) as Record<PadKind, PadShader>,
    words: { ...WORDS_DEFAULTS },
  }
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null') as {
      on?: boolean
      pads?: Partial<Record<PadKind, Partial<PadShader>>>
      words?: Partial<WordsPrefs>
    } | null
    if (saved) {
      if (typeof saved.on === 'boolean') prefs.on = saved.on
      for (const k of KINDS) Object.assign(prefs.pads[k], saved.pads?.[k] ?? {})
      Object.assign(prefs.words, saved.words ?? {})
    }
  } catch {
    /* private window / blocked storage: the defaults */
  }
  for (const k of KINDS) {
    const p = prefs.pads[k]
    p.style = Math.min(SHADER_STYLES[k].length - 1, Math.max(0, Math.round(p.style) || 0))
    for (const f of ['amount', 'glow', 'trail'] as const) p[f] = Math.min(1, Math.max(0, Number(p[f]) || 0))
    p.speed = Math.min(2, Math.max(0, Number(p.speed) || 0))
  }
  const w = prefs.words
  w.on = w.on !== false
  if (!WORDS_STYLES.some((x) => x.id === w.style)) w.style = 'scroll'
  for (const f of ['amount', 'flare', 'defects'] as const) w[f] = Math.min(1, Math.max(0, Number(w[f]) || 0))
  return prefs
}
/** SHADERS on / off and each pad kind's settings (reactive; saved as they change) */
export const shaderPrefs = reactive(load())
watch(
  shaderPrefs,
  (p) => {
    try {
      localStorage.setItem(KEY, JSON.stringify(p))
    } catch {
      /* not saved: fine */
    }
  },
  { deep: true },
)

/** whether the stage could start here (WebGL2): false greys the SHADERS switches */
export const stageStatus = reactive({ available: true })

// ── the registry: each PlayView's VCO, read by the stage each frame ──
export type Vec4 = [number, number, number, number]
export interface StagePad {
  kind: PadKind
  el: HTMLElement | undefined
  /** the pad's own four numbers (see each effect in the GLSL) */
  a: Vec4
  /** its crosshair, 0..1, y up */
  p: { x: number; y: number }
}
export interface StageVco {
  slot: number
  colors(): { line: string; cross: string }
  /** its audio for this frame (the stage asks once a frame) */
  audio(): AudioFeed
  pads(): StagePad[]
  /** the PROMPT GARDEN's prompt playing ('' : not growing): its words drift through `area` */
  prompt?(): string
  /** the VCO's whole column */
  area?(): HTMLElement | undefined
}
export const stageVcos = new Set<StageVco>()
export function registerVco(v: StageVco): () => void {
  stageVcos.add(v)
  return () => stageVcos.delete(v)
}

// ── audio ──
export const WAVE_N = 128
export const SPEC_N = 128
/**
 * A VCO's audio as the stage reads it, from the last block of its voices (engine.ts readSound): its level, its wave
 * (WAVE_N points) and a spectrum (SPEC_N log-spaced bands by a small DFT), as bytes for a texture.
 */
export class AudioFeed {
  readonly wave = new Uint8Array(WAVE_N).fill(128)
  readonly spec = new Uint8Array(SPEC_N)
  level = 0
  private readonly N = 512
  private win = new Float32Array(this.N)
  private cos = new Float32Array(this.N)
  private sin = new Float32Array(this.N)
  private bins = new Float32Array(SPEC_N)

  constructor() {
    const N = this.N
    for (let i = 0; i < N; i++) {
      this.win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1))
      this.cos[i] = Math.cos((2 * Math.PI * i) / N)
      this.sin[i] = Math.sin((2 * Math.PI * i) / N)
    }
    for (let k = 0; k < SPEC_N; k++) this.bins[k] = Math.max(1, Math.round(Math.pow(N / 2, k / (SPEC_N - 1))))
  }

  /** Take in the latest samples (newest at the end of `buf`); `fresh` false lets everything fall away. */
  update(buf: Float32Array, fresh: boolean) {
    const { N, wave, spec } = this
    if (!fresh || buf.length < N) {
      this.level *= 0.88
      for (let i = 0; i < WAVE_N; i++) wave[i] = 128 + Math.round((wave[i] - 128) * 0.8)
      for (let i = 0; i < SPEC_N; i++) spec[i] = Math.floor(spec[i] * 0.88)
      return
    }
    const start = buf.length - N
    let sum = 0
    for (let i = start; i < buf.length; i++) sum += buf[i] * buf[i]
    const lv = Math.min(1, Math.sqrt(sum / N) * 3)
    this.level = lv > this.level ? lv : this.level * 0.85 + lv * 0.15
    const step = N / WAVE_N
    for (let i = 0; i < WAVE_N; i++) {
      const v = Math.max(-1, Math.min(1, buf[start + Math.floor(i * step)] * 2.2))
      wave[i] = Math.round(128 + 127 * v)
    }
    for (let k = 0; k < SPEC_N; k++) {
      const bin = this.bins[k]
      let re = 0
      let im = 0
      for (let i = 0, ph = 0; i < N; i++, ph = (ph + bin) % N) {
        const x = buf[start + i] * this.win[i]
        re += x * this.cos[ph]
        im -= x * this.sin[ph]
      }
      const db = 20 * Math.log10(Math.sqrt(re * re + im * im) / (N / 4) + 1e-6)
      const v = Math.round(Math.max(0, Math.min(1, (db + 60) / 60)) * 255)
      spec[k] = Math.max(v, Math.floor(spec[k] * 0.82))
    }
  }
}

// ── GLSL ──
/** every VCO's pads: three VCOs of eight */
const MAX_PADS = 24
const DATA_W = 6
const VERT = `#version 300 es
in vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`

const SCENE = `#version 300 es
precision highp float;
uniform vec2 u_res;          // the canvas, px
uniform float u_scale;       // canvas px per CSS px
uniform int u_count;
uniform highp sampler2D u_data;
uniform sampler2D u_audio;
uniform sampler2D u_prev;
uniform float u_clock;
uniform float u_trail;       // the trails' linger between the pads (their average)
uniform vec3 u_avg;          // the VCOs' colours, averaged by loudness
uniform float u_total;       // the VCOs' loudness together
uniform vec3 u_perf[3];      // each VCO's PERFORM view's centre (px) and whether it's there
uniform highp sampler2D u_words;
uniform sampler2D u_atlas;
uniform int u_wcount;
uniform vec3 u_wfx;          // the words' amount, flare, defects
out vec4 o;
const float PI = 3.14159265;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise(p); p = p * 2.03 + 1.7; a *= 0.5; }
  return v;
}
float wave(int s, float x) { return texture(u_audio, vec2(clamp(x, 0.0, 1.0), (float(s * 2) + 0.5) / 6.0)).r * 2.0 - 1.0; }
float spec(int s, float x) { return texture(u_audio, vec2(clamp(x, 0.0, 1.0), (float(s * 2 + 1) + 0.5) / 6.0)).r; }
vec4 D(int i, int k) { return texelFetch(u_data, ivec2(k, i), 0); }
/** how much louder makes an effect brighter: never washed out */
float boost(float lv) { return 0.3 + 0.7 * lv; }

// Each effect: the pad's colour and how much of it shows, from its own uv (0..1, y up), clock t, aspect, style st,
// numbers a, loudness lv, VCO s, colours L / C, size in px sz.

// PERFORM -- a = (POS, volume, where the LFO fires or -1, grains playing 0..1)
vec4 effPerform(vec2 uv, float t, float asp, float st, vec4 a, float lv, int s, vec3 L, vec3 C, vec2 sz) {
  if (st < 0.5) {
    // SPECTRAL: the spectrum as mirrored columns of light rising from the middle, brightest where the grains fire
    float sp = spec(s, pow(uv.x, 1.6));
    float d = abs(uv.y - 0.5) * 2.0;
    float col = smoothstep(sp * (0.35 + 0.65 * a.y) + 0.02, sp * 0.2, d);
    float scan = 0.7 + 0.3 * sin(uv.y * sz.y * 1.2);
    float near = exp(-abs(uv.x - a.x) * 18.0) * (0.25 + lv);
    return vec4(mix(L, C, smoothstep(0.2, 1.0, sp)), (col * scan * 0.9 + near * 0.4) * boost(lv));
  } else if (st < 1.5) {
    // STARFIELD: stars streaming out from where the grains fire, faster as it gets louder
    vec2 q = (uv - vec2(a.x, 0.5)) * vec2(asp, 1.0);
    float r = length(q), ang = atan(q.y, q.x) / (2.0 * PI) + 0.5;
    float acc = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float lanes = 40.0 + fi * 23.0;
      float lane = floor(ang * lanes);
      float h = hash(vec2(lane, fi * 7.1));
      float z = fract(h * 13.0 + t * boost(lv) * (0.6 + h));
      float dr = abs(r - z * 1.3 * asp);
      acc += smoothstep(0.03 * z + 0.004, 0.0, dr) * smoothstep(0.25, 0.0, abs(fract(ang * lanes) - 0.5)) * z;
    }
    return vec4(mix(L, C, step(0.85, hash(floor(uv * 30.0)))), acc * boost(lv));
  }
  // LIQUID: a slow warped flow, pushed by the wave
  vec2 q = uv * vec2(asp, 1.0) * 2.2;
  float w = wave(s, uv.x) * (0.3 + lv);
  vec2 r = vec2(fbm(q + vec2(0.0, t * 0.25)), fbm(q + vec2(5.2, -t * 0.2) + w));
  float f = fbm(q + 2.5 * r + vec2(t * 0.1, w));
  return vec4(mix(L, C, smoothstep(0.45, 0.85, f)), smoothstep(0.3, 0.9, f) * boost(lv));
}

// GRAIN -- a = (LENGTH, the crosshair's height, GRAIN Hz, -)
vec4 effGrain(vec2 uv, float t, float asp, float st, vec4 a, float lv, int s, vec3 L, vec3 C, vec2 sz) {
  float duty = max(0.02, a.x);
  float hz = min(a.z, 14.0);
  if (st < 0.5) {
    // NEBULA: a field of cells, each a grain flaring for its LENGTH of every turn, finer as grains get smaller
    float n = mix(5.0, 24.0, a.y);
    vec2 g = uv * vec2(n * asp, n);
    vec2 cell = floor(g);
    float h = hash(cell);
    float ph = fract(t * hz * 0.3 + h);
    float on = step(ph, duty) * (1.0 - ph / duty);
    float dotv = smoothstep(0.5, 0.0, length(fract(g) - 0.5 + 0.2 * (vec2(hash(cell + 3.1), hash(cell + 9.7)) - 0.5)));
    float neb = fbm(uv * 3.0 + t * 0.05) * 0.35;
    return vec4(mix(L, C, step(0.92, h)), dotv * on * boost(lv) + neb * (0.25 + lv));
  } else if (st < 1.5) {
    // PULSAR: rings leaving the middle, one a grain, each lit for its LENGTH, bent by the wave
    vec2 q = (uv - 0.5) * vec2(asp, 1.0);
    float d = length(q);
    float ring = fract(d * mix(3.0, 16.0, a.y) - t * hz * 0.5);
    float lit = smoothstep(duty, duty * 0.6, ring) * smoothstep(0.0, 0.05, ring);
    float wob = 1.0 + 0.3 * wave(s, atan(q.y, q.x) / (2.0 * PI) + 0.5);
    return vec4(mix(C, L, ring), lit * smoothstep(0.75, 0.0, d * wob) * boost(lv));
  }
  // MOIRÉ: two ring sets drifting through each other, closer as grains shrink
  vec2 q = uv * vec2(asp, 1.0);
  float k = mix(18.0, 80.0, a.y);
  vec2 c1 = vec2(0.5 * asp + 0.25 * sin(t * 0.3), 0.5 + 0.2 * cos(t * 0.23));
  vec2 c2 = vec2(0.5 * asp - 0.25 * sin(t * 0.21), 0.5 - 0.2 * cos(t * 0.37 + lv));
  float v = sin(length(q - c1) * k) * sin(length(q - c2) * k * (1.0 + duty * 0.2));
  return vec4(mix(L, C, step(0.0, v)), smoothstep(0.2, 1.0, abs(v)) * boost(lv));
}

// LFO -- a = (how far, LFO Hz, the swing now 0..1, -)
vec4 effLfo(vec2 uv, float t, float asp, float st, vec4 a, float lv, int s, vec3 L, vec3 C, vec2 sz) {
  float swing = a.z - 0.5;
  if (st < 0.5) {
    // TIDE: lines of water swaying with the LFO
    float acc = 0.0;
    for (int i = 0; i < 6; i++) {
      float fi = float(i);
      float y = 0.12 + fi * 0.15 + (a.x * 0.12 + lv * 0.06) * sin(uv.x * (5.0 + fi) + swing * 9.0 + t * 0.4 + fi);
      acc += exp(-abs(uv.y - y) * (60.0 - fi * 5.0)) * (0.5 + 0.5 * sin(fi + t));
    }
    return vec4(mix(L, C, uv.y), acc * boost(lv));
  } else if (st < 1.5) {
    // AURORA: curtains of light pulled along by the swing
    float f = fbm(vec2(uv.x * 3.0 + swing * 3.0 * (0.3 + a.x), t * 0.15));
    float band = smoothstep(0.0, 0.5, uv.y - f * 0.5) * smoothstep(1.0, 0.45, uv.y);
    float rays = 0.6 + 0.4 * sin(uv.x * 60.0 + f * 20.0 + t);
    return vec4(mix(L, C, smoothstep(0.3, 0.9, uv.y)), band * rays * boost(lv));
  }
  // VORTEX: a spiral wound by the swing
  vec2 q = (uv - 0.5) * vec2(asp, 1.0);
  float r = length(q), ang = atan(q.y, q.x);
  float v = sin(ang * 5.0 + r * (8.0 + swing * 40.0 * (0.2 + a.x)) - t * 1.5);
  return vec4(mix(L, C, step(0.3, v)), smoothstep(0.1, 1.0, v) * smoothstep(0.75, 0.05, r) * boost(lv));
}

// FILTER · REVERB -- a = (the filter's x: low-pass left, high-pass right; reverb; resonance 0..1; DAMP)
vec4 effFx(vec2 uv, float t, float asp, float st, vec4 a, float lv, int s, vec3 L, vec3 C, vec2 sz) {
  float tilt = a.x - 0.5;
  float rev = a.y;
  if (st < 0.5) {
    // HORIZON: a sun over a grid running to the horizon; the filter raises or sets it, the reverb is the haze
    float hz = 0.42;
    if (uv.y < hz) {
      float z = 1.0 / max(0.001, hz - uv.y);
      float gx = abs(fract((uv.x - 0.5) * z * 0.6) - 0.5);
      float gy = abs(fract(z * 0.25 + t * 0.6) - 0.5);
      float grid = smoothstep(0.02, 0.0, min(gx, gy) / z * 6.0);
      return vec4(L, grid * smoothstep(0.0, hz, hz - uv.y) * (0.45 + lv));
    }
    vec2 c = vec2(0.5, hz + 0.18 + tilt * 0.45);
    float d = length((uv - c) * vec2(asp, 1.0));
    float sun = smoothstep(0.24 + lv * 0.05, 0.22, d);
    float bars = step(0.35 + 0.3 * smoothstep(c.y + 0.2, c.y - 0.2, uv.y), fract((uv.y - c.y) * 22.0));
    float haze = rev * exp(-(uv.y - hz) * 6.0) * (0.6 + 0.4 * fbm(uv * 4.0 + t * 0.1)) * (1.0 - a.w * 0.5);
    vec3 col = mix(C, L, smoothstep(c.y - 0.25, c.y + 0.25, uv.y));
    return vec4(col, sun * (uv.y > c.y ? 1.0 : bars) * (0.55 + lv) + haze);
  } else if (st < 1.5) {
    // CAUSTIC: light through water; the reverb deepens it, the filter sharpens or softens it
    vec2 p = uv * vec2(asp, 1.0) * (4.0 + rev * 4.0);
    float c = 0.0;
    vec2 i = p;
    for (int n = 0; n < 4; n++) {
      float tt = t * 0.5 * (1.0 - float(n) / 6.0);
      i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
      c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / 0.02), p.y / (cos(i.y + tt) / 0.02)));
    }
    c = 1.2 - pow(c / 4.0, 1.4 + tilt * 0.8);
    float v = clamp(pow(abs(c), 8.0 - a.z * 4.0), 0.0, 1.0);
    return vec4(mix(L, C, clamp(v - 0.6, 0.0, 1.0)), v * boost(lv));
  }
  // PLASMA: interfering waves, finer as the filter opens high, smeared by the reverb
  vec2 q = uv * vec2(asp, 1.0);
  float k = 6.0 + (tilt + 0.5) * 18.0;
  float v = sin(q.x * k + t) + sin((q.y * k + t) * 0.7) + sin((q.x + q.y) * k * 0.5 + t * 1.3) + sin(length(q - 0.5) * k * 1.4 - t);
  v = v / 4.0 + wave(s, uv.x) * lv * 0.5;
  float soft = mix(0.04, 0.5, rev);
  return vec4(mix(L, C, smoothstep(-0.2, 0.6, v)), smoothstep(-soft, 0.5 + soft, abs(sin(v * PI * 2.0))) * boost(lv));
}

// PITCH · RING -- a = (the pitch multiplier, RING mix, RING carrier 0..1, -)
vec4 effPitch(vec2 uv, float t, float asp, float st, vec4 a, float lv, int s, vec3 L, vec3 C, vec2 sz) {
  float m = a.x;
  float ring = a.y;
  vec2 q = (uv - 0.5) * vec2(asp, 1.0);
  float r = length(q), ang = atan(q.y, q.x);
  if (st < 0.5) {
    // WARP: a tunnel flown at the pitch -- forward up, standing still when stopped, backwards below
    float z = 0.25 / max(0.02, r) + t * m * 1.2;
    float aa = ang / (2.0 * PI) * 12.0 + ring * sin(z * (4.0 + a.z * 20.0)) * 0.8;
    float chk = step(0.5, fract(z * 2.0)) * 0.6 + step(0.5, fract(aa)) * 0.4;
    return vec4(mix(L, C, step(abs(m), 0.05)), chk * smoothstep(0.0, 0.35, r) * boost(lv));
  } else if (st < 1.5) {
    // RIPPLE: two sources -- the sample's pitch and the ring's carrier -- beating
    float a1 = sin(length(q - vec2(-0.2, 0.0)) * 40.0 - t * m * 6.0);
    float a2 = sin(length(q - vec2(0.2, 0.0)) * (20.0 + a.z * 90.0) - t * 8.0) * ring;
    float v = (a1 + a2) / (1.0 + ring);
    return vec4(mix(L, C, smoothstep(0.0, 1.0, a2)), smoothstep(0.3, 1.0, abs(v)) * boost(lv));
  }
  // KALEIDO: a mirrored pattern turning with the pitch, the ring adding facets
  float seg = 6.0 + floor(ring * 6.0);
  float aa = mod(ang + t * m * 0.6, 2.0 * PI / seg);
  aa = abs(aa - PI / seg);
  float f = fbm(vec2(cos(aa), sin(aa)) * r * 6.0 + vec2(t * 0.2 * m, 0.0));
  return vec4(mix(L, C, smoothstep(0.5, 0.8, f)), smoothstep(0.35, 0.75, f) * smoothstep(0.75, 0.1, r) * boost(lv));
}

float sdBox(vec2 p, vec2 c, vec2 h) {
  vec2 q = abs(p - c) - h;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}
float sdSeg(vec2 p, vec2 a, vec2 b, out float along) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(1e-4, dot(ba, ba)), 0.0, 1.0);
  along = h;
  return length(pa - ba * h);
}


// TEXTURE -- a = (SPRAY 0..1 on the pad, DETUNE 0..1 on the pad, -, -)
vec4 effTexture(vec2 uv, float t, float asp, float st, vec4 a, float lv, int s, vec3 L, vec3 C, vec2 sz) {
  float spray = a.x, det = a.y;
  vec2 q = uv * vec2(asp, 1.0);
  if (st < 0.5) {
    // POLLEN: motes drifting in two currents, scattered wider by SPRAY, the currents parted by DETUNE
    float acc = 0.0;
    vec3 col = vec3(0.0);
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      vec2 g = q * (9.0 + fi * 5.0) + vec2(t * (0.2 + fi * 0.1), 0.0);
      vec2 cell = floor(g);
      float h = hash(cell + fi * 13.0);
      vec2 o = vec2(hash(cell + 3.7), hash(cell + 9.1)) - 0.5;
      float side = h < 0.5 ? -1.0 : 1.0;
      o.y += side * det * 0.35 + sin(t + h * 6.0) * 0.1;
      o.x *= 0.3 + spray;
      float d = length(fract(g) - 0.5 - o * 0.8);
      float m = smoothstep(0.09 + 0.04 * lv, 0.0, d) * step(0.55 - spray * 0.4, hash(cell + 1.3));
      acc += m;
      col += (side < 0.0 ? L : C) * m;
    }
    return vec4(col / max(acc, 1e-3), acc * boost(lv));
  } else if (st < 1.5) {
    // SILK: two sheets of fine threads, combed apart by DETUNE, frayed by SPRAY
    float w1 = sin(q.y * 40.0 + fbm(q * 3.0 + t * 0.2) * (2.0 + spray * 10.0) + t);
    float w2 = sin(q.y * 40.0 + det * 9.0 + fbm(q * 3.0 - t * 0.2 + 4.0) * (2.0 + spray * 10.0) - t * 1.1);
    float a1 = smoothstep(0.8, 1.0, w1), a2 = smoothstep(0.8, 1.0, w2) * smoothstep(0.0, 0.15, det);
    return vec4(mix(L, C, a2 / max(a1 + a2, 1e-3)), (a1 + a2) * 0.7 * boost(lv));
  }
  // DUST: a slow storm of specks in the light of the spectrum, thicker with SPRAY, split in hue by DETUNE
  float n = fbm(q * 3.0 + vec2(t * 0.15, -t * 0.1));
  float sp = spec(s, uv.x * 0.6);
  float speck = step(0.985 - spray * 0.05 - lv * 0.02, hash(floor(uv * sz / 2.0) + floor(t * 10.0)));
  vec3 col = mix(L, C, smoothstep(0.5 - det * 0.3, 0.5 + det * 0.3, uv.y + (n - 0.5) * 0.3));
  return vec4(col, speck * (0.4 + sp) + smoothstep(0.55, 0.9, n) * 0.25 * (0.3 + lv));
}

// ECHO -- a = (TIME 0..1 on the pad, FEEDBACK 0..1, MIX, -)
vec4 effEcho(vec2 uv, float t, float asp, float st, vec4 a, float lv, int s, vec3 L, vec3 C, vec2 sz) {
  float tm = a.x, fb = a.y, mix_ = a.z;
  float rate = mix(3.0, 0.4, tm);
  vec2 q = (uv - 0.5) * vec2(asp, 1.0);
  float r = length(q);
  float wet = 0.35 + 0.65 * step(0.001, mix_);
  if (st < 0.5) {
    // TUNNEL: frames receding, one per repeat, fading by the feedback
    float acc = 0.0;
    for (int k = 0; k < 8; k++) {
      float fk = float(k);
      float z = fract(t * rate * 0.25 + fk / 8.0);
      float fade = pow(max(fb, 0.05), fk * 0.6) * (1.0 - z);
      vec2 b = abs(q) - vec2(asp, 1.0) * 0.5 * (1.0 - z);
      float d = abs(max(b.x, b.y));
      acc += smoothstep(0.012, 0.0, d) * fade;
    }
    return vec4(mix(L, C, fract(t * 0.1)), acc * wet * boost(lv));
  } else if (st < 1.5) {
    // SONAR: pings leaving the middle every delay, their rings fainter by the feedback
    float ph = t * rate;
    float acc = 0.0;
    for (int k = 0; k < 6; k++) {
      float fk = float(k);
      float age = fract(ph) + fk;
      float rr = age * 0.18;
      acc += smoothstep(0.015, 0.0, abs(r - rr)) * pow(max(fb, 0.05), fk);
    }
    float sweep = smoothstep(0.3, 0.0, abs(mod(atan(q.y, q.x) - t * 2.0, 6.2832) - 0.3)) * smoothstep(0.6, 0.0, r) * 0.25;
    return vec4(mix(L, C, smoothstep(0.0, 0.5, r)), (acc + sweep) * wet * boost(lv));
  }
  // MIRROR: the wave repeated sideways into the distance, each copy dimmer and later
  float acc = 0.0;
  for (int k = 0; k < 6; k++) {
    float fk = float(k);
    float off = fk * mix(0.06, 0.3, tm);
    float x = uv.x - off;
    if (x < 0.0) break;
    float y = 0.5 + wave(s, x) * 0.3 * pow(max(fb, 0.05), fk * 0.7);
    acc += smoothstep(0.02, 0.0, abs(uv.y - y)) * pow(max(fb, 0.05), fk * 0.7);
  }
  return vec4(mix(L, C, uv.x), acc * wet * boost(lv));
}

// TONE -- a = (tilt -1..1, mids -1..1, -, -)
vec4 effTone(vec2 uv, float t, float asp, float st, vec4 a, float lv, int s, vec3 L, vec3 C, vec2 sz) {
  float tilt = a.x, mids = a.y;
  // the spectrum, leaned by the tilt and bulged by the mids
  float u = uv.x;
  float gain = tilt * (u - 0.5) * 2.0 + mids * exp(-pow((u - 0.55) * 4.0, 2.0));
  float sp = clamp(spec(s, u) * (1.0 + gain * 0.6), 0.0, 1.0);
  if (st < 0.5) {
    // PRISM: the spectrum split into bands of colour, warm where it's lifted, cool where cut
    float band = floor(u * 24.0);
    float hgt = sp * 0.75 * (0.7 + 0.3 * sin(t + band));
    float col = step(uv.y, hgt) * smoothstep(0.0, 0.2, fract(u * 24.0)) * smoothstep(1.0, 0.8, fract(u * 24.0));
    vec3 c = mix(C, L, smoothstep(-0.5, 0.5, gain));
    return vec4(c, col * (0.2 + 0.35 * uv.y) * boost(lv));
  } else if (st < 1.5) {
    // EMBER: a glow rising from the floor, redder darker, whiter brighter, flickering with the music
    float f = fbm(vec2(u * 4.0, uv.y * 3.0 - t * 0.8));
    float flame = smoothstep(sp * 0.9 + 0.05, 0.0, uv.y - f * 0.25);
    vec3 c = mix(vec3(1.0, 0.25, 0.05), mix(L, vec3(1.0, 0.95, 0.85), 0.4), smoothstep(-0.6, 0.6, tilt + uv.y * 0.5));
    return vec4(c, flame * 0.75 * boost(lv));
  }
  // TIDEPOOL: ripples whose spacing follows the tilt and whose height the mids
  vec2 q = uv * vec2(asp, 1.0);
  float k = 18.0 + tilt * 10.0;
  float v = sin(length(q - vec2(0.3, 0.2)) * k - t * 2.0) + sin(length(q - vec2(asp * 0.8, 0.7)) * k * 0.8 - t * 1.6);
  v = v * 0.5 * (0.6 + 0.4 * mids) + sp * 0.8;
  return vec4(mix(L, C, smoothstep(-0.5, 0.8, v)), smoothstep(0.5, 1.0, v) * 0.8 * boost(lv));
}

// ── the PROMPT GARDEN's words (words.ts): each a, b, c, d =
//    (centre px, half size px), (atlas u0, v0 top, u1, v1 bottom), (turn, alpha, palette, VCO), (seed, loudness, its column's centre px)
vec4 W(int i, int k) { return texelFetch(u_words, ivec2(k, i), 0); }
/** film stocks as cosine gradients: a faded sunset, teal and orange, Ektachrome, a Polaroid going pastel */
vec3 pal(float t, float k) {
  vec3 a, b, c, d;
  if (k < 0.5) { a = vec3(0.8, 0.5, 0.4); b = vec3(0.2, 0.4, 0.2); c = vec3(2.0, 1.0, 1.0); d = vec3(0.0, 0.25, 0.25); }
  else if (k < 1.5) { a = vec3(0.5); b = vec3(0.5); c = vec3(1.0, 1.0, 0.5); d = vec3(0.8, 0.9, 0.3); }
  else if (k < 2.5) { a = vec3(0.5); b = vec3(0.5); c = vec3(1.0, 0.7, 0.4); d = vec3(0.0, 0.15, 0.2); }
  else { a = vec3(0.6, 0.5, 0.55); b = vec3(0.3, 0.25, 0.3); c = vec3(1.0); d = vec3(0.1, 0.3, 0.6); }
  return clamp(a + b * cos(6.28318 * (c * t + d)), 0.0, 1.0);
}
float glyphA(vec2 uv, vec4 box) {
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return 0.0;
  return texture(u_atlas, vec2(mix(box.x, box.z, uv.x), mix(box.w, box.y, uv.y))).a;
}
vec4 wordLayer(vec2 px, float S, float t) {
  vec3 rgb = vec3(0.0);
  float al = 0.0;
  float fl = u_wfx.y, df = u_wfx.z;
  float tick = floor(t * 12.0);
  for (int i = 0; i < ${MAX_WORDS}; i++) {
    if (i >= u_wcount) break;
    vec4 a0 = W(i, 0), a1 = W(i, 1), a2 = W(i, 2), a3 = W(i, 3);
    float alpha = a2.y;
    if (alpha < 0.003) continue;
    float seed = a3.x, lv = a3.y;
    // gate weave: the word jitters a hair, film in a worn gate
    vec2 c = a0.xy + (vec2(hash(vec2(tick, seed)), hash(vec2(seed, tick))) - 0.5) * 1.4 * S * df;
    vec2 hs = a0.zw;
    vec2 d = px - c;
    float cs = cos(a2.x), sn = sin(a2.x);
    d = vec2(cs * d.x + sn * d.y, -sn * d.x + cs * d.y);
    vec3 tint2 = pal(seed + 0.33 + t * 0.02, a2.z);
    // the anamorphic streak through its middle, longer and brighter as it plays louder
    float streak = exp(-abs(d.y) / ((1.0 + 2.0 * lv) * S)) * exp(-abs(d.x) / (hs.x * 2.2 + 150.0 * S)) * (0.1 + 0.8 * lv) * fl;
    rgb += mix(vec3(0.3, 0.55, 1.0), tint2, 0.3) * streak * alpha;
    al += streak * alpha * 0.5;
    // lens ghosts, mirrored through its column's middle: a soft disc and a thin ring, each a hue of its own
    vec2 ac = a3.zw;
    for (int k = 0; k < 2; k++) {
      vec2 gp = ac + (c - ac) * (k == 0 ? -0.55 : -1.05);
      float gr = (k == 0 ? 16.0 : 30.0) * S * (0.8 + 0.6 * lv);
      float dd = length(px - gp);
      float g = k == 0 ? smoothstep(gr, gr * 0.15, dd) * 0.45 : smoothstep(gr * 0.1, 0.0, abs(dd - gr)) * 0.8;
      g *= (0.04 + 0.3 * lv) * fl * alpha;
      rgb += pal(seed + float(k) * 0.4 + 0.5, a2.z) * g;
      al += g * 0.4;
    }
    vec2 q = d / hs;   // -1..1 over the word
    if (abs(q.x) > 1.3 || abs(q.y) > 1.7) continue;
    // carried by the shader: warped, and bent by the music
    vec2 w = q + (vec2(fbm(q * 1.7 + vec2(t * 0.3, seed * 9.0)), fbm(q * 1.9 + vec2(seed * 5.0, -t * 0.25))) - 0.5) * (0.05 + 0.1 * lv + 0.06 * df);
    w.y += sin(w.x * 5.0 + t * 1.7 + seed * 20.0) * 0.04 * (0.3 + lv);
    vec2 uv = w * 0.5 + 0.5;
    // anamorphic colour separation: red and blue slip apart sideways
    float sep = (0.006 + 0.022 * df) * (1.0 + 1.5 * lv);
    float r = glyphA(uv + vec2(sep, 0.0), a1);
    float g = glyphA(uv, a1);
    float b = glyphA(uv - vec2(sep * 1.4, 0.0), a1);
    // halation: the light bleeds warm into the emulsion around it
    vec2 uc = clamp(uv, 0.0, 1.0);
    float halo = textureLod(u_atlas, vec2(mix(a1.x, a1.z, uc.x), mix(a1.w, a1.y, uc.y)), 4.5).a
      * (1.0 - smoothstep(0.75, 1.0, max(abs(q.x) / 1.3, abs(q.y) / 1.7)));
    vec3 tint = pal(seed + t * 0.03 + q.x * 0.18, a2.z);
    vec3 col = vec3(r * tint.r, g * tint.g, b * tint.b) * 1.2;
    col += halo * (vec3(1.0, 0.35, 0.18) * (0.2 + 0.5 * df) + tint * 0.3);
    float k = alpha * (0.8 + 0.35 * lv);
    rgb += col * k;
    al += (max(max(r, g), b) * 0.85 + halo * 0.3) * k;
  }
  // the emulsion: grain over the words, and now and then a fleck of dust
  float shade = smoothstep(0.0, 0.12, al);
  rgb *= 1.0 + (hash(px / S + fract(t * 23.0) * 91.0) - 0.5) * 0.3 * df;
  float dust = step(0.9997, hash(floor(px / (2.5 * S)) + tick * 1.37)) * df * shade;
  rgb += vec3(0.95, 0.9, 0.75) * dust * 0.5;
  return vec4(rgb, clamp(al, 0.0, 1.0)) * u_wfx.x;
}

void main() {
  vec2 px = gl_FragCoord.xy;
  vec2 uv = px / u_res;
  float S = u_scale;
  vec3 rgb = vec3(0.0);   // premultiplied
  float al = 0.0;
  int inside = -1;
  float near = 1e9;   // the nearest pad's edge, px
  for (int i = 0; i < ${MAX_PADS}; i++) {
    if (i >= u_count) break;
    vec4 r = D(i, 0);
    vec4 m = D(i, 2);
    vec4 f = D(i, 3);
    vec4 c4 = D(i, 4);
    vec2 cen = (r.xy + r.zw) * 0.5, hs = (r.zw - r.xy) * 0.5;
    float d = sdBox(px, cen, hs);
    float lv = m.z, amt = f.y, gl = f.z;
    if (d < 0.0) inside = i;
    // the halo each pad throws over the others, wider and stronger with GLOW and its loudness
    float reach = (6.0 + 34.0 * gl) * S;
    float h = (0.04 + lv * 0.35) * gl * amt * exp(-max(d, 0.0) / reach) * step(0.0, d);
    near = min(near, d);
    rgb += c4.rgb * h;
    al += h;
    // the neon rim
    float rim = smoothstep(2.2 * S, 0.0, abs(d)) * (0.2 + lv * 0.5) * amt;
    rgb += c4.rgb * rim;
    al += rim;
    // the thread from its VCO's PERFORM view, light running along it as it plays
    int s = int(c4.w + 0.5);
    vec3 pf = u_perf[s];
    if (m.w > 0.5 && pf.z > 0.5 && d > 0.0) {
      float along;
      float ds = sdSeg(px, pf.xy, cen, along);
      float pulse = pow(fract(along * 3.0 - u_clock * (0.4 + lv)), 6.0);
      float th = exp(-ds / (1.3 * S)) * (0.04 + lv * 0.3) * (0.35 + pulse) * amt;
      rgb += mix(c4.rgb, D(i, 5).rgb, pulse) * th;
      al += th;
    }
  }
  // the shared field underneath, stirred by everything that plays
  float field = fbm(px / (260.0 * S) + vec2(u_clock * 0.03, -u_clock * 0.02)) * min(1.0, u_total) * 0.1 * exp(-max(near, 0.0) / (90.0 * S));
  rgb += u_avg * field;
  al += field;
  // the garden's words, behind the pads' own pictures (softer over a pad, so its controls stay clear)
  if (u_wcount > 0) {
    vec4 wl = wordLayer(px, S, u_clock);
    float wk = inside >= 0 ? 0.85 : 1.0;
    rgb += wl.rgb * wk;
    al += wl.a * wk;
  }

  vec2 drift = vec2(0.0, 0.0012);
  float decay = u_trail;
  if (inside >= 0) {
    vec4 r = D(inside, 0);
    vec4 a = D(inside, 1);
    vec4 m = D(inside, 2);
    vec4 f = D(inside, 3);
    vec4 c4 = D(inside, 4);
    vec4 x5 = D(inside, 5);
    vec2 sz = r.zw - r.xy;
    vec2 luv = (px - r.xy) / sz;
    float asp = sz.x / sz.y;
    float t = x5.w;
    int s = int(c4.w + 0.5);
    int k = int(m.w + 0.5);
    vec4 e;
    if (k == 0) e = effPerform(luv, t, asp, f.x, a, m.z, s, c4.rgb, x5.rgb, sz);
    else if (k == 1) e = effGrain(luv, t, asp, f.x, a, m.z, s, c4.rgb, x5.rgb, sz);
    else if (k == 2) e = effLfo(luv, t, asp, f.x, a, m.z, s, c4.rgb, x5.rgb, sz);
    else if (k == 3) e = effFx(luv, t, asp, f.x, a, m.z, s, c4.rgb, x5.rgb, sz);
    else if (k == 4) e = effPitch(luv, t, asp, f.x, a, m.z, s, c4.rgb, x5.rgb, sz);
    else if (k == 5) e = effTexture(luv, t, asp, f.x, a, m.z, s, c4.rgb, x5.rgb, sz);
    else if (k == 6) e = effEcho(luv, t, asp, f.x, a, m.z, s, c4.rgb, x5.rgb, sz);
    else e = effTone(luv, t, asp, f.x, a, m.z, s, c4.rgb, x5.rgb, sz);
    e.rgb += f.z * e.rgb * e.rgb * 1.6;
    float ea = clamp(e.a * f.y, 0.0, 1.0);
    rgb += min(e.rgb, vec3(1.0)) * ea;
    al += ea;
    // its trail drifts out from its middle, over the border and onto the pads around it
    drift = (uv - (r.xy + r.zw) * 0.5 / u_res) * 0.012;
    decay = 0.75 + 0.22 * f.w;
    decay *= step(0.01, f.w);
  }
  al = clamp(al, 0.0, 1.0);
  rgb = min(rgb, vec3(al));
  vec4 prev = texture(u_prev, uv - drift) * decay;
  o = vec4(rgb, al) + prev * (1.0 - al);
}`

const BLIT = `#version 300 es
precision mediump float;
uniform sampler2D u_tex;
uniform vec2 u_res;
out vec4 o;
void main() { o = texture(u_tex, gl_FragCoord.xy / u_res); }`

const rgbOf = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1, 7), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}
/** the stage renders at this share of the screen's resolution (soft anyway), stretched by CSS */
export const STAGE_RES = 0.5

/** The stage's renderer: draws every registered pad's effect, and what runs between them, on one canvas. */
export class Stage {
  private gl: WebGL2RenderingContext
  private scene: WebGLProgram
  private blit: WebGLProgram
  private loc: Record<string, WebGLUniformLocation | null> = {}
  private blitLoc: Record<string, WebGLUniformLocation | null> = {}
  private dataTex: WebGLTexture
  private audioTex: WebGLTexture
  private fb: { tex: WebGLTexture; fbo: WebGLFramebuffer }[] = []
  private fbSize = { w: 0, h: 0 }
  private cur = 0
  private data = new Float32Array(MAX_PADS * DATA_W * 4)
  private audio = new Uint8Array(WAVE_N * 6)
  private times = new Map<string, number>()
  private wordsTex: WebGLTexture
  private atlasTex: WebGLTexture
  private words = new WordField()
  private atlas: WordAtlas | null = null
  private wordData = new Float32Array(MAX_WORDS * WORD_W * 4)
  /** SCROLL: how far the lines have scrolled (CSS px, all told), and where along that each prompt's line comes in */
  private scrolled = 0
  private lineAt = new Map<number, number>()
  /** SCROLL: lines gone by (or skipped for a newer one before they came in): their words may fade */
  private linePassed = new Set<number>()
  private lineLen = new Map<number, number>()
  private last = 0
  private clock = 0
  lost = false

  static create(canvas: HTMLCanvasElement): Stage | null {
    try {
      const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false })
      return gl ? new Stage(canvas, gl) : null
    } catch {
      return null
    }
  }

  private constructor(
    readonly canvas: HTMLCanvasElement,
    gl: WebGL2RenderingContext,
  ) {
    this.gl = gl
    this.scene = this.program(SCENE)
    this.blit = this.program(BLIT)
    for (const u of ['u_res', 'u_scale', 'u_count', 'u_data', 'u_audio', 'u_prev', 'u_clock', 'u_trail', 'u_avg', 'u_total', 'u_perf', 'u_words', 'u_atlas', 'u_wcount', 'u_wfx'])
      this.loc[u] = gl.getUniformLocation(this.scene, u)
    for (const u of ['u_tex', 'u_res']) this.blitLoc[u] = gl.getUniformLocation(this.blit, u)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    this.dataTex = this.texture(gl.NEAREST)
    this.audioTex = this.texture(gl.LINEAR)
    this.wordsTex = this.texture(gl.NEAREST)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 1, 1, 0, gl.RGBA, gl.FLOAT, new Float32Array(4))
    this.atlasTex = this.texture(gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4))
    gl.generateMipmap(gl.TEXTURE_2D)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      this.lost = true
    })
  }

  private program(fs: string): WebGLProgram {
    const gl = this.gl
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!
      gl.shaderSource(sh, src)
      gl.compileShader(sh)
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(`[play stage] ${gl.getShaderInfoLog(sh)}`)
      return sh
    }
    const prog = gl.createProgram()!
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT))
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, fs))
    gl.bindAttribLocation(prog, 0, 'a_pos')
    gl.linkProgram(prog)
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`[play stage] ${gl.getProgramInfoLog(prog)}`)
    return prog
  }

  private texture(filter: number): WebGLTexture {
    const gl = this.gl
    const t = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, t)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return t
  }

  /** the feedback buffers, at the canvas's size (cleared on a resize) */
  private buffers(w: number, h: number) {
    if (this.fbSize.w === w && this.fbSize.h === h && this.fb.length) return
    const gl = this.gl
    for (const b of this.fb) {
      gl.deleteTexture(b.tex)
      gl.deleteFramebuffer(b.fbo)
    }
    this.fb = [0, 1].map(() => {
      const tex = this.texture(gl.LINEAR)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      const fbo = gl.createFramebuffer()!
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      return { tex, fbo }
    })
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    this.fbSize = { w, h }
  }

  /** Clear (SHADERS turned off, or nothing to show). */
  clear() {
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    for (const b of this.fb) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, b.fbo)
      gl.clear(gl.COLOR_BUFFER_BIT)
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  /** One frame: where every registered pad is now, what it's set to, and its VCO's audio. */
  frame(now: number) {
    if (this.lost || this.gl.isContextLost()) return
    const gl = this.gl
    const c = this.canvas
    const box = c.getBoundingClientRect()
    if (!box.width || !box.height) return
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0
    this.last = now
    this.clock += dt
    const S = c.width / box.width
    const sy = c.height / box.height
    const data = this.data
    const perf = new Float32Array(9)
    const avg = [0, 0, 0]
    let total = 0
    let weight = 0
    let trailSum = 0
    let n = 0
    const heard = new Set<number>()
    const areas = new Map<number, DOMRect>()
    const levels = [0, 0, 0]
    const wordsOn = shaderPrefs.words.on && shaderPrefs.words.amount > 0
    for (const v of stageVcos) {
      const s = Math.min(2, Math.max(0, v.slot))
      const feed = v.audio()
      levels[s] = feed.level
      const area = v.area?.()
      if (area) areas.set(s, area.getBoundingClientRect())
      this.words.setPrompt(s, wordsOn && area ? (v.prompt?.() ?? '') : '')
      if (!heard.has(s)) {
        heard.add(s)
        this.audio.set(feed.wave, s * 2 * WAVE_N)
        this.audio.set(feed.spec, (s * 2 + 1) * WAVE_N)
      }
      const col = v.colors()
      const line = rgbOf(col.line)
      const cross = rgbOf(col.cross)
      const lv = feed.level
      total += lv
      weight += 0.15 + lv
      for (let k = 0; k < 3; k++) avg[k] += line[k] * (0.15 + lv)
      for (const p of v.pads()) {
        if (n >= MAX_PADS || !p.el) continue
        const r = p.el.getBoundingClientRect()
        if (r.right < box.left || r.left > box.right || r.bottom < box.top || r.top > box.bottom || !r.width) continue
        const prefs = shaderPrefs.pads[p.kind]
        const key = `${s}:${p.kind}`
        const t = ((this.times.get(key) ?? 0) + dt * prefs.speed) % 3600
        this.times.set(key, t)
        const x0 = (r.left - box.left) * S
        const x1 = (r.right - box.left) * S
        const y0 = (box.bottom - r.bottom) * sy
        const y1 = (box.bottom - r.top) * sy
        if (p.kind === 'perform') perf.set([(x0 + x1) / 2, (y0 + y1) / 2, 1], s * 3)
        const o = n * DATA_W * 4
        data.set([x0, y0, x1, y1], o)
        data.set(p.a, o + 4)
        data.set([p.p.x, p.p.y, lv, KIND_INDEX[p.kind]], o + 8)
        data.set([prefs.style, prefs.amount, prefs.glow, prefs.trail], o + 12)
        data.set([...line, s], o + 16)
        data.set([...cross, t], o + 20)
        trailSum += prefs.trail
        n++
      }
    }
    // the garden's words: a frame of their drift, then where each is on the canvas
    for (let s = 0; s < 3; s++) if (!areas.has(s)) this.words.drop(s)
    const scrolling = shaderPrefs.words.style === 'scroll'
    this.words.step(dt, this.clock, (s) => levels[s] ?? 0, 0.5 + 0.5 * shaderPrefs.pads.perform.speed, (x) => scrolling && !this.linePassed.has(x.line))
    let wn = 0
    if (this.words.words.length) {
      this.atlas ??= new WordAtlas()
      const keep = this.words.words.map((x) => x.text)
      const wd = this.wordData
      const scroll = shaderPrefs.words.style === 'scroll'
      // SCROLL: a ticker per VCO (each at its own height) gliding right to left across the whole stage: each prompt a
      // line, its words in order; a new prompt joins behind the one going by, and the latest comes round again once
      // it has passed
      const place = new Map<Word, { x: number; y: number; h: number }>()
      if (scroll) {
        this.scrolled += dt * 26 * (0.4 + 0.6 * shaderPrefs.pads.perform.speed)
        const D = this.scrolled
        const byLine = new Map<number, Word[]>()
        for (const x of this.words.words) (byLine.get(x.line) ?? byLine.set(x.line, []).get(x.line)!).push(x)
        for (const id of [...this.lineAt.keys()]) if (!byLine.has(id)) this.lineAt.delete(id)
        for (const id of [...this.linePassed]) if (!byLine.has(id)) this.linePassed.delete(id)
        for (const id of [...this.lineLen.keys()]) if (!byLine.has(id)) this.lineLen.delete(id)
        /** each VCO's last line: where it ends along the ticker */
        const tail = new Map<number, number>()
        const latest = new Map<number, number>()
        for (const [id, ws] of byLine) latest.set(ws[0].slot, Math.max(latest.get(ws[0].slot) ?? 0, id))
        for (const [id, ws] of [...byLine].sort((p, q) => p[0] - q[0])) {
          const a = areas.get(ws[0].slot)
          if (!a) continue
          ws.sort((p, q) => p.order - q.order)
          const hgt = Math.min(64, Math.max(22, a.height * 0.06))
          const gap = hgt * 0.35
          let len = 0
          const at: number[] = []
          for (const x of ws) {
            const g = this.atlas.glyph(x.text, keep)
            const wpx = (g ? g.aspect : 3) * hgt * 0.82
            at.push(len + wpx / 2)
            len += wpx + gap
          }
          const slot = ws[0].slot
          if (this.linePassed.has(id)) continue
          if (!this.lineAt.has(id)) {
            // one still waiting to come in gives way to this newer one
            let skipped = false
            for (const [other, at] of this.lineAt)
              if (other < id && at > D && byLine.get(other)?.[0].slot === slot) {
                this.linePassed.add(other)
                this.lineAt.delete(other)
                skipped = true
              }
            // (then it follows the last one that did come in)
            if (skipped) {
              let end = -Infinity
              for (const [other, at] of this.lineAt)
                if (byLine.get(other)?.[0].slot === slot) end = Math.max(end, at + (this.lineLen.get(other) ?? 0))
              tail.set(slot, end)
            }
            this.lineAt.set(id, Math.max(D, (tail.get(slot) ?? -Infinity) + box.width * 0.12))
          }
          // the latest, all the way past: round again
          if (id === latest.get(slot) && D - this.lineAt.get(id)! > len + box.width) this.lineAt.set(id, D)
          const at0 = this.lineAt.get(id)!
          tail.set(slot, at0 + len)
          this.lineLen.set(id, len)
          // all the way past the left edge, and not the latest: gone by
          if (id !== latest.get(slot) && D - at0 > len + box.width) {
            this.linePassed.add(id)
            continue
          }
          const y = a.top + a.height * (0.3 + 0.22 * (slot % 3)) + Math.sin(this.clock * 0.21 + id) * a.height * 0.02
          ws.forEach((x, k) => place.set(x, { x: box.right - (D - at0) + at[k], y, h: hgt }))
        }
      }
      for (const wd0 of this.words.words) {
        const a = areas.get(wd0.slot)
        if (!a || wn >= MAX_WORDS || wd0.alpha < 0.003) continue
        const g = this.atlas.glyph(wd0.text, keep)
        if (!g) continue
        const lv = levels[wd0.slot] ?? 0
        const pl = place.get(wd0)
        const hgt = (pl ? pl.h : Math.min(84, Math.max(22, a.height * 0.085)) * (0.75 + 0.6 * wd0.seed)) * (1 + 0.08 * lv)
        const cx = ((pl ? pl.x : a.left + wd0.x * a.width) - box.left) * S
        const cy = (box.bottom - (pl ? pl.y : a.top + (1 - wd0.y) * a.height)) * sy
        // off the stage (a scrolling line's words not yet in, or gone by): not drawn
        if (pl && (cx < -hgt * g.aspect * S || cx > c.width + hgt * g.aspect * S)) continue
        const o = wn * WORD_W * 4
        wd.set([cx, cy, (hgt * g.aspect * S) / 2, (hgt * sy) / 2], o)
        wd.set([g.u0, g.v0, g.u1, g.v1], o + 4)
        wd.set([Math.sin(this.clock * 0.23 + wd0.seed * 10) * (pl ? 0.025 : 0.09), wd0.alpha, wd0.palette, wd0.slot], o + 8)
        wd.set([wd0.seed, lv, (a.left + a.width / 2 - box.left) * S, (box.bottom - (a.top + a.height / 2)) * sy], o + 12)
        wn++
      }
    }
    const w = c.width
    const h = c.height
    this.buffers(w, h)
    gl.activeTexture(gl.TEXTURE3)
    gl.bindTexture(gl.TEXTURE_2D, this.wordsTex)
    if (wn) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, WORD_W, MAX_WORDS, 0, gl.RGBA, gl.FLOAT, this.wordData)
    gl.activeTexture(gl.TEXTURE4)
    gl.bindTexture(gl.TEXTURE_2D, this.atlasTex)
    if (this.atlas?.dirty) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, this.atlas.canvas)
      gl.generateMipmap(gl.TEXTURE_2D)
      this.atlas.dirty = false
    }
    const wsum = Math.max(1e-4, weight)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.dataTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, DATA_W, MAX_PADS, 0, gl.RGBA, gl.FLOAT, data)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.audioTex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, WAVE_N, 6, 0, gl.RED, gl.UNSIGNED_BYTE, this.audio)
    const prev = this.fb[this.cur]
    const next = this.fb[1 - this.cur]
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, prev.tex)
    gl.bindFramebuffer(gl.FRAMEBUFFER, next.fbo)
    gl.viewport(0, 0, w, h)
    gl.useProgram(this.scene)
    const L = this.loc
    gl.uniform2f(L.u_res, w, h)
    gl.uniform1f(L.u_scale, S)
    gl.uniform1i(L.u_count, n)
    gl.uniform1i(L.u_data, 0)
    gl.uniform1i(L.u_audio, 1)
    gl.uniform1i(L.u_prev, 2)
    gl.uniform1f(L.u_clock, this.clock % 3600)
    gl.uniform1f(L.u_trail, n ? 0.6 + 0.3 * (trailSum / n) : 0)
    gl.uniform3f(L.u_avg, avg[0] / wsum, avg[1] / wsum, avg[2] / wsum)
    gl.uniform1f(L.u_total, Math.min(1.5, total))
    gl.uniform3fv(L.u_perf, perf)
    gl.uniform1i(L.u_words, 3)
    gl.uniform1i(L.u_atlas, 4)
    gl.uniform1i(L.u_wcount, wn)
    const wp = shaderPrefs.words
    gl.uniform3f(L.u_wfx, wp.amount, wp.flare, wp.defects)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    // onto the canvas
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.useProgram(this.blit)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, next.tex)
    gl.uniform1i(this.blitLoc.u_tex, 0)
    gl.uniform2f(this.blitLoc.u_res, w, h)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    this.cur = 1 - this.cur
  }
}
