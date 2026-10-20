/**
 * Sounds and patches as numbers, for "similar to" (cosine over standardised features) and for blending a candidate
 * patch's settings (lib/semantic/candidate.ts). Kept apart from the text vectors, as rolidrummer keeps rhythm features
 * apart from its embeddings: they meet only in the ranking.
 */
import {
  DENSITY_MAX, DENSITY_MIN, DETUNE_MAX, FM_AMOUNT_MAX, GRAIN_FREQ_MAX, SPRAY_MAX, VAR_PITCH_MAX,
} from '../../audio/grainMath'
import { TRIGGER_MODES, type ModMatrix, type Patch, type PatchSlot, type SoundSettings } from '../../types'

/** a continuous setting and the range its knob covers (log: as the knob turns, by ratio) */
export interface Param {
  key: keyof SoundSettings
  lo: number
  hi: number
  log?: boolean
}
export const SOUND_PARAMS: Param[] = [
  { key: 'volume', lo: 0, hi: 1.5 },
  { key: 'pan', lo: -1, hi: 1 },
  { key: 'pitch', lo: -24, hi: 24 },
  { key: 'fine', lo: -100, hi: 100 },
  { key: 'speed', lo: 0.25, hi: 4, log: true },
  { key: 'attack', lo: 0.001, hi: 5, log: true },
  { key: 'decay', lo: 0.001, hi: 5, log: true },
  { key: 'sustain', lo: 0, hi: 1 },
  { key: 'release', lo: 0.001, hi: 10, log: true },
  { key: 'envKey', lo: 0, hi: 1 },
  { key: 'cutoff', lo: 20, hi: 20000, log: true },
  { key: 'resonance', lo: 0.1, hi: 20, log: true },
  { key: 'filterKey', lo: 0, hi: 1 },
  { key: 'fEnvAmount', lo: -5, hi: 5 },
  { key: 'fAttack', lo: 0.001, hi: 5, log: true },
  { key: 'fDecay', lo: 0.001, hi: 5, log: true },
  { key: 'fSustain', lo: 0, hi: 1 },
  { key: 'fRelease', lo: 0.001, hi: 10, log: true },
  { key: 'eqLow', lo: -12, hi: 12 },
  { key: 'eqMid', lo: -12, hi: 12 },
  { key: 'eqHigh', lo: -12, hi: 12 },
  { key: 'velAmount', lo: 0, hi: 1 },
  { key: 'delayMix', lo: 0, hi: 1 },
  { key: 'delayFeedback', lo: 0, hi: 0.9 },
  { key: 'reverbMix', lo: 0, hi: 1 },
  { key: 'reverbSize', lo: 0.1, hi: 6, log: true },
  // grains (only heard with GRAIN on)
  { key: 'grainFreq', lo: 0.5, hi: GRAIN_FREQ_MAX, log: true },
  { key: 'grainPos', lo: 0, hi: 1 },
  { key: 'grainSpray', lo: 0, hi: SPRAY_MAX },
  { key: 'grainStereo', lo: 0, hi: 1 },
  { key: 'grainWindow', lo: 0, hi: 1 },
  { key: 'grainSkew', lo: 0, hi: 1 },
  { key: 'grainDensity', lo: DENSITY_MIN, hi: DENSITY_MAX },
  { key: 'grainVariation', lo: 0, hi: 1 },
  { key: 'grainVarPitch', lo: 0, hi: VAR_PITCH_MAX },
  { key: 'grainDetune', lo: 0, hi: DETUNE_MAX },
  { key: 'grainFmAmount', lo: 0, hi: FM_AMOUNT_MAX },
  { key: 'grainAmp', lo: 0, hi: 1 },
]
const GRAIN_KEYS = new Set(SOUND_PARAMS.filter((p) => String(p.key).startsWith('grain')).map((p) => p.key))

/** a setting to 0..1 along its knob */
export function toUnit(p: Param, v: number): number {
  const x = p.log ? Math.log(Math.max(v, p.lo) / p.lo) / Math.log(p.hi / p.lo) : (v - p.lo) / (p.hi - p.lo)
  return Math.min(1, Math.max(0, Number.isFinite(x) ? x : 0))
}
/** and back */
export function fromUnit(p: Param, x: number): number {
  const u = Math.min(1, Math.max(0, x))
  return p.log ? p.lo * Math.pow(p.hi / p.lo, u) : p.lo + u * (p.hi - p.lo)
}

const FILTER_FAMILY = (t: string) =>
  t === 'lowpass' || t === 'lp12' || t === 'lp24' ? 0 : t === 'highpass' || t.startsWith('hp') ? 1 : t === 'bandpass' ? 2 : 3
const DEST_GROUPS: string[][] = [
  ['pitch'], ['cutoff', 'resonance'], ['volume'], ['pan'],
  ['grainPos', 'grainSize', 'grainSkew', 'grainVar', 'grainDetune', 'grainScan'],
  ['lfo1Rate', 'lfo1Amt', 'lfo2Rate', 'lfo2Amt'], ['delayMix', 'reverbMix'],
]
const SOURCE_GROUPS: ((s: string) => boolean)[] = [
  (s) => s === 'lfo1' || s === 'lfo2', (s) => s.startsWith('vco'), (s) => s === 'velocity', (s) => s === 'mod',
  (s) => s === 'aftertouch', (s) => s === 'key' || s === 'random' || s === 'fenv' || s === 'timbre' || s === 'bend',
]
/** the mod matrix as how much goes where, and from what */
function modFeatures(m: ModMatrix, out: number[]) {
  for (const g of DEST_GROUPS)
    out.push(Math.min(1, m.routes.filter((r) => g.includes(r.dest)).reduce((a, r) => a + Math.abs(r.amount), 0)))
  for (const g of SOURCE_GROUPS) out.push(m.routes.some((r) => g(r.source)) ? 1 : 0)
  const used = (k: 'lfo1' | 'lfo2') => m.routes.some((r) => r.source === k)
  for (const k of ['lfo1', 'lfo2'] as const) out.push(used(k) ? toUnit({ key: 'speed', lo: 0.02, hi: 40, log: true }, m[k].rate) : 0)
}

/** a sound's settings as numbers (grain settings count only while GRAIN is on) */
export function soundFeatures(s: SoundSettings): number[] {
  const out: number[] = []
  for (const p of SOUND_PARAMS) out.push(GRAIN_KEYS.has(p.key) && !s.grain ? 0 : toUnit(p, s[p.key] as number))
  const fam = FILTER_FAMILY(s.filterType)
  for (let i = 0; i < 4; i++) out.push(fam === i ? 1 : 0)
  out.push(s.grain ? 1 : 0)
  for (const m of ['classic', 'loop', 'cloud']) out.push(s.grain && s.grainMode === m ? 1 : 0)
  out.push(s.grain && s.grainFm ? 1 : 0, s.grain && s.grainScanOn ? 1 : 0)
  out.push(s.timeMode === 'stretch' ? 1 : 0, s.repeat === 0 ? 1 : 0)
  for (const m of TRIGGER_MODES) out.push(s.mode === m ? 1 : 0)
  modFeatures(s.mod, out)
  return out
}
/** soundFeatures' length: the params, filter family, grain switches, time mode + loop, trigger mode, the matrix */
export const SOUND_DIMS = SOUND_PARAMS.length + 4 + 6 + 2 + TRIGGER_MODES.length + DEST_GROUPS.length + SOURCE_GROUPS.length + 2

/**
 * A patch as numbers: its main VCO's sound, the other heard slots' (averaged), how the slots stack, and the header
 * (voice, glide, effects, global matrix).
 */
export function patchFeatures(p: Patch): number[] {
  const filled = p.slots.filter((x): x is PatchSlot => !!x)
  const main = filled[0]
  const rest = filled.slice(1)
  const out: number[] = main ? soundFeatures(main.layer.settings) : new Array(SOUND_DIMS).fill(0)
  const others = new Array(SOUND_DIMS).fill(0)
  for (const x of rest) soundFeatures(x.layer.settings).forEach((v, i) => (others[i] += (v * 0.5) / rest.length))
  out.push(...others)
  const heard = filled.filter((x, i) => i === 0 || x.audible)
  out.push(
    heard.length / 3,
    rest.filter((x) => !x.audible).length / 2,
    Math.min(1, rest.reduce((a, x) => a + Math.abs(x.fine), 0) / 50),
    Math.min(1, rest.reduce((a, x) => a + Math.abs(x.transpose), 0) / 24),
    filled.some((x) => !x.track) ? 1 : 0,
    rest.length ? rest.reduce((a, x) => a + x.level, 0) / rest.length / 1.5 : 0,
  )
  const h = p.header
  out.push(
    h.mono ? 1 : 0,
    toUnit({ key: 'attack', lo: 0.001, hi: 2, log: true }, Math.max(0.001, h.glide)),
    h.mpe ? 1 : 0,
    h.fx.chorusMix,
    h.fx.delayMix,
    h.fx.reverbMix,
    toUnit({ key: 'reverbSize', lo: 0.1, hi: 8, log: true }, h.fx.reverbSize),
  )
  modFeatures(h.mod, out)
  return out
}

/** per-dimension mean and spread over a corpus, for z-scores (a dimension nothing varies along counts for nothing) */
export interface Stats {
  mean: Float32Array
  inv: Float32Array
}
export function statsOf(rows: ArrayLike<number>[]): Stats {
  const d = rows[0]?.length ?? 0
  const mean = new Float32Array(d)
  const inv = new Float32Array(d)
  if (!rows.length) return { mean, inv }
  for (const r of rows) for (let i = 0; i < d; i++) mean[i] += r[i] / rows.length
  for (let i = 0; i < d; i++) {
    let v = 0
    for (const r of rows) v += (r[i] - mean[i]) ** 2
    const sd = Math.sqrt(v / rows.length)
    inv[i] = sd > 1e-4 ? 1 / sd : 0
  }
  return { mean, inv }
}
/** z-scored and normalised to unit length, so similarity is a dot product */
export function standardise(row: ArrayLike<number>, s: Stats): Float32Array {
  const out = new Float32Array(row.length)
  let n = 0
  for (let i = 0; i < row.length; i++) {
    // capped, so one rare setting can't outweigh the rest
    out[i] = Math.max(-4, Math.min(4, (row[i] - s.mean[i]) * s.inv[i]))
    n += out[i] * out[i]
  }
  n = Math.sqrt(n) || 1
  for (let i = 0; i < out.length; i++) out[i] /= n
  return out
}
