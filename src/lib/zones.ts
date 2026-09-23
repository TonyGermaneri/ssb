import type { Zone, ZoneCcMod, ZoneFilter, ZoneLfo } from '../types'
import { sfzNote, type Opcodes } from './sfz'

const num = (v: string | undefined, fallback: number) => {
  const n = v === undefined ? NaN : parseFloat(v)
  return Number.isFinite(n) ? n : fallback
}

/** Keep note-on and note-off (release) regions, and only the default keyswitch's articulation. */
export function filterPlayable(regions: Opcodes[]): Opcodes[] {
  const onAttack = regions.filter((o) => !o.trigger || ['attack', 'first', 'release'].includes(o.trigger))
  const switched = onAttack.filter((o) => o.sw_last !== undefined)
  if (!switched.length) return onAttack
  const want = sfzNote(switched.find((o) => o.sw_default)?.sw_default ?? switched[0].sw_last, -1)
  return onAttack.filter((o) => o.sw_last === undefined || sfzNote(o.sw_last, -2) === want)
}

/** SFZ region opcodes → Zone. `rate` = the sample file's own rate (offsets / loops are in its samples). Null = silent region. */
export function regionToZone(o: Opcodes, audioId: string, rate: number): Zone | null {
  if (o.end === '-1') return null
  const key = o.key !== undefined ? sfzNote(o.key, 60) : undefined
  const lokey = sfzNote(o.lokey, key ?? 0)
  const hikey = sfzNote(o.hikey, key ?? 127)
  const keycenter = o.pitch_keycenter && o.pitch_keycenter !== 'sample' ? sfzNote(o.pitch_keycenter, 60) : (key ?? 60)
  const loopStart = num(o.loop_start ?? o.loopstart, 0) / rate
  const loopEnd = num(o.loop_end ?? o.loopend, 0) / rate
  const mode = (o.loop_mode ?? o.loopmode) as Zone['loopMode'] | undefined
  const amplitude = num(o.amplitude, 100)
  const env: Zone['env'] = {}
  if (o.ampeg_attack !== undefined) env.a = num(o.ampeg_attack, 0)
  if (o.ampeg_decay !== undefined) env.d = num(o.ampeg_decay, 0) + num(o.ampeg_hold, 0)
  if (o.ampeg_sustain !== undefined) env.s = num(o.ampeg_sustain, 100) / 100
  if (o.ampeg_release !== undefined) env.r = num(o.ampeg_release, 0)
  return {
    audioId,
    lokey,
    hikey,
    lovel: num(o.lovel, 1),
    hivel: num(o.hivel, 127),
    keycenter,
    keytrack: num(o.pitch_keytrack, 100),
    transpose: num(o.transpose, 0),
    tune: num(o.tune ?? o.pitch, 0),
    // with amplitude_onccN the base amplitude stays separate (CC adds to it); otherwise fold it into volume
    volume: num(o.volume, 0) + (hasAmpCc(o) ? 0 : amplitude > 0 ? 20 * Math.log10(amplitude / 100) : -96),
    amplitude: hasAmpCc(o) ? amplitude : undefined,
    pan: num(o.pan, 0),
    offset: num(o.offset, 0) / rate,
    end: num(o.end, 0) / rate,
    // an explicit loop without a loop_mode means "loop it" (the file's own loop flag can't be read here)
    loopMode: mode ?? (loopEnd > loopStart ? 'loop_continuous' : 'no_loop'),
    loopStart,
    loopEnd,
    seqLength: Math.max(1, num(o.seq_length, 1)),
    seqPosition: Math.max(1, num(o.seq_position, 1)),
    lorand: num(o.lorand, 0),
    hirand: num(o.hirand, 1),
    env: Object.keys(env).length ? env : undefined,
    trigger: o.trigger === 'release' ? 'release' : undefined,
    rtDecay: o.rt_decay !== undefined ? num(o.rt_decay, 0) : undefined,
    ccRange: ccRanges(o),
    ccMods: ccMods(o),
    filter: zoneFilter(o),
    lfos: zoneLfos(o),
  }
}

const hasAmpCc = (o: Opcodes) => Object.keys(o).some((k) => /^amplitude_(on)?cc\d+$/.test(k))

/** loccN / hiccN → region only sounds while CC N is inside [lo, hi]. */
function ccRanges(o: Opcodes): Zone['ccRange'] {
  const out: Record<number, [number, number]> = {}
  for (const k of Object.keys(o)) {
    const m = /^(lo|hi)cc(\d+)$/.exec(k)
    if (!m) continue
    const cc = +m[2]
    out[cc] = [num(o[`locc${cc}`], 0), num(o[`hicc${cc}`], 127)]
  }
  return Object.keys(out).length ? out : undefined
}

const CC_TARGETS: Record<string, ZoneCcMod['target']> = {
  volume: 'volume',
  amplitude: 'amplitude',
  pan: 'pan',
  pitch: 'pitch',
  tune: 'pitch',
  cutoff: 'cutoff',
  resonance: 'resonance',
}

/** volume_onccN, pitch_onccN, cutoff_ccN, … → CC-driven offsets (amount at CC 127). */
function ccMods(o: Opcodes): ZoneCcMod[] | undefined {
  const out: ZoneCcMod[] = []
  for (const [k, v] of Object.entries(o)) {
    const m = /^(volume|amplitude|pan|pitch|tune|cutoff|resonance)_on(?:cc)?(\d+)$|^(volume|amplitude|pan|pitch|tune|cutoff|resonance)_cc(\d+)$/.exec(k)
    if (!m) continue
    out.push({ target: CC_TARGETS[m[1] ?? m[3]], cc: +(m[2] ?? m[4]), amount: num(v, 0) })
  }
  return out.length ? out : undefined
}

const FIL_TYPES: Record<string, BiquadFilterType> = { lpf: 'lowpass', hpf: 'highpass', bpf: 'bandpass', brf: 'notch', apf: 'allpass', pkf: 'peaking' }

function zoneFilter(o: Opcodes): ZoneFilter | undefined {
  if (o.cutoff === undefined && o.fil_type === undefined) return undefined
  const kind = (o.fil_type ?? 'lpf_2p').slice(0, 3)
  const depth = num(o.fileg_depth, 0)
  return {
    type: FIL_TYPES[kind] ?? 'lowpass',
    cutoff: num(o.cutoff, 20000),
    resonance: num(o.resonance, 0),
    keytrack: num(o.fil_keytrack, 0),
    keycenter: sfzNote(o.fil_keycenter, 60),
    veltrack: num(o.fil_veltrack, 0),
    env: depth
      ? {
          a: num(o.fileg_attack, 0),
          d: num(o.fileg_decay, 0) + num(o.fileg_hold, 0),
          s: num(o.fileg_sustain, 100) / 100,
          r: num(o.fileg_release, 0),
          depth,
        }
      : undefined,
  }
}

/** SFZ v2 lfoN_wave → closest oscillator (pulses become squares). */
const V2_WAVES: [OscillatorType, boolean][] = [
  ['triangle', false],
  ['sine', false],
  ['square', false],
  ['square', false],
  ['square', false],
  ['square', false],
  ['sawtooth', false],
  ['sawtooth', true],
]

/** v1 amplfo_ / pitchlfo_ / fillfo_ and v2 lfoN_ (pitch, cutoff, volume, amplitude, pan). */
function zoneLfos(o: Opcodes): ZoneLfo[] | undefined {
  const out: ZoneLfo[] = []
  const v1: [string, ZoneLfo['target']][] = [['amplfo', 'volume'], ['pitchlfo', 'pitch'], ['fillfo', 'cutoff']]
  for (const [p, target] of v1) {
    const depth = num(o[`${p}_depth`], 0)
    if (depth && o[`${p}_freq`] !== undefined)
      out.push({ target, depth, freq: num(o[`${p}_freq`], 0), delay: num(o[`${p}_delay`], 0), wave: 'sine' })
  }
  for (const k of Object.keys(o)) {
    const m = /^lfo(\d+)_freq$/.exec(k)
    if (!m) continue
    const n = m[1]
    const [wave, invert] = V2_WAVES[num(o[`lfo${n}_wave`], 1)] ?? V2_WAVES[1]
    const base = { freq: num(o[k], 0), delay: num(o[`lfo${n}_delay`], 0), wave, invert }
    const targets: [string, ZoneLfo['target'], (v: number) => number][] = [
      ['pitch', 'pitch', (v) => v],
      ['cutoff', 'cutoff', (v) => v],
      ['volume', 'volume', (v) => v],
      ['amplitude', 'volume', (v) => 20 * Math.log10(1 + v / 100)],
      ['pan', 'pan', (v) => v],
    ]
    for (const [op, target, conv] of targets) {
      const v = num(o[`lfo${n}_${op}`], 0)
      if (v) out.push({ ...base, target, depth: conv(v) })
    }
  }
  return out.length ? out : undefined
}

/**
 * Zones that sound for a note: key and velocity range, then round robin (seq_position of seq_length, advanced
 * by `counter`) and random layers (lorand ≤ rand < hirand). Several can match: they layer.
 */
export function pickZones(
  zones: Zone[],
  note: number,
  velocity127: number,
  counter: number,
  rand = Math.random(),
  opts: { trigger?: 'attack' | 'release'; cc?: ArrayLike<number> } = {},
): Zone[] {
  const vel = Math.min(127, Math.max(1, Math.round(velocity127)))
  const trigger = opts.trigger ?? 'attack'
  const inCc = (z: Zone) =>
    !z.ccRange ||
    Object.entries(z.ccRange).every(([cc, [lo, hi]]) => {
      const v = Math.round((opts.cc?.[+cc] ?? 0) * 127)
      return v >= lo && v <= hi
    })
  return zones.filter(
    (z) =>
      (z.trigger ?? 'attack') === trigger &&
      inCc(z) &&
      note >= z.lokey &&
      note <= z.hikey &&
      vel >= z.lovel &&
      vel <= z.hivel &&
      (z.seqLength <= 1 || (counter % z.seqLength) + 1 === z.seqPosition) &&
      rand >= z.lorand &&
      rand < z.hirand,
  )
}

/** Semitones to shift a zone's sample to play `note`. */
export const zoneSemis = (z: Zone, note: number) => ((note - z.keycenter) * z.keytrack) / 100 + z.transpose + z.tune / 100

/** The zone to show / preview for a pad: the one covering (or nearest) `note`. */
export function nearestZone(zones: Zone[], note: number): Zone | undefined {
  return [...zones].sort((a, b) => dist(a, note) - dist(b, note) || b.hivel - a.hivel)[0]
}
const dist = (z: Zone, n: number) => (n < z.lokey ? z.lokey - n : n > z.hikey ? n - z.hikey : 0)
