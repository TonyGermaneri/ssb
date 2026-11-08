/**
 * Every knob the agent may set, in one table: its range, unit and meaning. The system prompt's parameter reference
 * is written from it (so the model reads the same ranges the code enforces), and patchSpec.ts checks and clamps what
 * the model writes against it. Ranges are the panels' knob ranges.
 */
import { DIVISIONS, FILTER_TYPES, LFO_SHAPES, MOD_DESTS, MOD_SOURCES, MPE_SURFACES, TRIGGER_MODES, TUNING_MODES } from '../../types'

export interface Param {
  key: string
  kind: 'number' | 'integer' | 'boolean' | 'enum'
  min?: number
  max?: number
  values?: readonly (string | number)[]
  unit?: string
  /** what it does, for the model */
  doc: string
}

const n = (key: string, min: number, max: number, unit: string, doc: string): Param => ({ key, kind: 'number', min, max, unit, doc })
const i = (key: string, min: number, max: number, unit: string, doc: string): Param => ({ key, kind: 'integer', min, max, unit, doc })
const b = (key: string, doc: string): Param => ({ key, kind: 'boolean', doc })
const e = (key: string, values: readonly (string | number)[], doc: string): Param => ({ key, kind: 'enum', values, doc })

/** a layer's sound settings, by panel section */
export const SOUND_SECTIONS: { title: string; params: Param[] }[] = [
  {
    title: 'PLAY',
    params: [
      n('volume', 0, 1.5, 'x', 'layer gain (linear; 1 = unity)'),
      n('pan', -1, 1, '', 'stereo position, -1 left .. 1 right'),
      n('volKey', -3, 3, 'dB/oct', 'level change per octave from rootNote (negative: higher notes quieter)'),
      i('repeat', 0, 16, '', 'how many times the clip plays; 0 = loops while held (single-cycle waves need 0)'),
      i('choke', 0, 8, '', 'choke group (pads); 0 = none'),
      e('mode', TRIGGER_MODES, 'what pressing a playing pad again does (pads only)'),
    ],
  },
  {
    title: 'TUNE',
    params: [
      n('pitch', -24, 24, 'st', 'transpose in semitones (in grain sync patches it moves the formant)'),
      n('fine', -100, 100, 'cents', 'fine tune'),
      n('speed', 0.25, 4, 'x', 'playback speed (STRETCH: independent of pitch)'),
      e('timeMode', ['tape', 'stretch'], 'tape: pitch and speed change together; stretch: granular time-stretch'),
    ],
  },
  {
    title: 'KEYS',
    params: [
      i('rootNote', 0, 127, 'MIDI', 'the note that plays the sample at its recorded pitch (AKWF waves: 36 = C2)'),
      n('velAmount', 0, 1, '', 'how much velocity changes the level'),
      n('bendRange', 0, 48, 'st', 'pitch-wheel range'),
    ],
  },
  {
    title: 'CLIP',
    params: [n('clipIn', 0, 1, 'of length', 'where playback starts'), n('clipOut', 0, 1, 'of length', 'where it ends (or loops)')],
  },
  {
    title: 'AMP ENVELOPE',
    params: [
      n('attack', 0.001, 5, 's', 'attack time'),
      n('decay', 0.001, 5, 's', 'decay time'),
      n('sustain', 0, 1, '', 'sustain level'),
      n('release', 0.001, 10, 's', 'release time after note-off'),
      n('envKey', 0, 1, '', 'higher notes run the envelope faster (1: twice as fast an octave up)'),
    ],
  },
  {
    title: 'FILTER',
    params: [
      e('filterType', FILTER_TYPES, 'lowpass/highpass/bandpass (biquads) or the dual state-variable types lp12 lp24 lphp lpnotch notch notch2 hpnotch hp12 hp24'),
      n('cutoff', 20, 20000, 'Hz', 'cutoff frequency'),
      n('resonance', 0.1, 20, 'Q', 'resonance (0.7 neutral; 5+ peaky; 15+ near self-oscillation)'),
      n('filterWidth', -48, 48, 'st', 'dual types only: the second stage relative to the first'),
      n('filterKey', 0, 1, '', 'cutoff follows the note (1: an octave per octave)'),
    ],
  },
  {
    title: 'FILTER ENVELOPE',
    params: [
      n('fEnvAmount', -5, 5, 'oct', 'how far the filter envelope moves the cutoff'),
      n('fAttack', 0.001, 5, 's', 'attack'),
      n('fDecay', 0.001, 5, 's', 'decay'),
      n('fSustain', 0, 1, '', 'sustain level'),
      n('fRelease', 0.001, 10, 's', 'release'),
      n('fEnvKey', 0, 1, '', 'higher notes run it faster'),
    ],
  },
  {
    title: 'EQ',
    params: [n('eqLow', -12, 12, 'dB', 'bass shelf'), n('eqMid', -12, 12, 'dB', 'mid peak'), n('eqHigh', -12, 12, 'dB', 'treble shelf')],
  },
  {
    title: 'GRAIN (Granulator II engine with Granulator III modes)',
    params: [
      b('grain', 'play the sound as a cloud of grains'),
      e('grainMode', ['classic', 'loop', 'cloud'], 'classic: two overlapping grains a side; loop: one-grain segments crossfaded (grainSkew = crossfade); cloud: grainDensity grains drifting apart'),
      n('grainFreq', 0.5, 150, 'Hz', 'grains start this often and last one period. 32.7 Hz with grainFreqKey 1 = pitched "grain sync" at the played note'),
      n('grainFreqKey', 0, 1, '', 'grainFreq follows the played note'),
      n('grainFreqRnd', 0, 1, '', 'grainFreq wanders randomly (up to ±25 st)'),
      n('grainStereo', 0, 1, '', 'left/right grain rates apart (up to two octaves)'),
      n('grainPos', 0, 1, 'of clip', 'where grains read'),
      n('grainPosKey', -1, 1, '', 'position moves with the note (1 % of the clip per semitone at ±1)'),
      n('grainSpray', 0, 20000, 'ms', 'random offset of each grain around grainPos'),
      n('grainSpraySlope', 1, 10, '', 'clusters spray nearer grainPos'),
      e('grainSpraySign', ['sym', 'right', 'left'], 'spray both ways, only later, or only earlier'),
      n('grainWindow', 0, 1, '', 'window shape: sine .. square'),
      e('grainSymmetry', ['std', 'fall', 'rise', 'noiz'], 'window: sine, its falling half, rising half, noise'),
      n('grainTuneKey', 0, 1, '', 'the note transposes the sample inside the grains'),
      n('grainTuneRnd', 0, 1, '', 'random pitch per grain'),
      e('grainAmpMode', ['flux', 'void'], 'flux: random grain levels; void: grains drop out'),
      n('grainAmp', 0, 1, '', 'how much flux/void'),
      n('grainVoid', 0, 1, '', 'what void leaves of a dropped grain'),
      b('grainFm', 'a sine swings where grains read (FM)'),
      n('grainFmFreq', 2, 20000, 'Hz', 'FM rate'),
      n('grainFmAmount', 0, 250, '', 'FM depth'),
      n('grainFmKey', 0, 2, '', 'FM rate follows the note'),
      b('grainScanOn', 'from each note, grainPos travels grainScanDist of the clip'),
      n('grainScanTime', 25, 10000, '%', '100 = real time, 200 = half speed'),
      n('grainScanDist', 0.0001, 1, 'of clip', 'how far scan travels'),
      n('grainScanCurve', 0.5, 2, '', 'scan speed curve'),
      b('grainScanLoop', 'scan starts over at its distance'),
      b('grainScanKey', 'scan runs faster for higher notes'),
      n('grainSkew', 0, 1, '', 'classic: window leans early/late (0.5 none); loop: crossfade length'),
      i('grainDensity', 2, 20, '', 'cloud: grains a side'),
      n('grainReverse', 0, 1, '', 'loop: chance a segment plays backwards (keep 0 on single cycles)'),
      n('grainVariation', 0, 1, '', 'scales the variation amounts below'),
      n('grainVarPos', 0, 2000, 'ms', 'position variation (always later)'),
      n('grainVarSize', 0, 36, 'st', 'grain length variation'),
      n('grainVarPitch', 0, 24, 'st', 'pitch variation (cloud)'),
      n('grainVarVol', 0, 24, 'dB', 'level variation'),
      n('grainDetune', 0, 12, 'st', 'left lower, right higher'),
      n('grainNoteRnd', 0, 12, 'st', 'each note’s pitch randomly ±'),
      n('grainLength', 0.01, 1, '', 'how much of each grain sounds (its window squeezed in), then silence: short = separate, arpeggio-like grains'),
      b('grainBackwards', 'every grain reads the sample backwards from where it starts (LOOP: every segment reversed)'),
    ],
  },
  {
    title: 'RING MODULATOR (after the filter and EQ)',
    params: [
      n('ringMix', 0, 1, '', 'how much of the signal is multiplied by the carrier: 0 off, 1 only the sum and difference tones'),
      n('ringFreq', 20, 5000, 'Hz', 'the carrier frequency'),
    ],
  },
  {
    title: 'LAYER DELAY / REVERB (per layer, before the master effects)',
    params: [
      n('delayTime', 0.01, 2, 's', 'delay time'),
      n('delayFeedback', 0, 0.9, '', 'feedback'),
      n('delayMix', 0, 1, '', 'wet level'),
      n('reverbSize', 0.1, 6, 's', 'impulse length'),
      n('reverbDecay', 0.5, 10, '', 'decay curve'),
      n('reverbMix', 0, 1, '', 'wet level'),
    ],
  },
]
export const SOUND_PARAMS: Param[] = SOUND_SECTIONS.flatMap((s) => s.params)

/** how a slot joins the patch */
export const SLOT_PARAMS: Param[] = [
  n('level', 0, 1.5, 'x', 'mix level (for a modulator: its depth)'),
  b('audible', 'heard in the mix; false = a modulation source only (FM / AM via routes)'),
  b('track', 'follows the played key; false = always plays fixedNote'),
  n('transpose', -24, 24, 'st', 'semitones from the played note'),
  n('fine', -100, 100, 'cents', 'detune (a few cents on unison layers avoids phase cancellation)'),
  i('fixedNote', 0, 127, 'MIDI', 'the note when track is false'),
  e('tuning', TUNING_MODES, 'et = equal temperament; eased/strict/septimal/tonal = adaptive just intonation that follows held chords'),
  n('tuningDepth', 0, 1, '', 'how far the adaptive tuning goes'),
]

export const LFO_PARAMS: Param[] = [
  e('shape', LFO_SHAPES, 'waveform'),
  n('rate', 0.02, 20, 'Hz', 'free rate'),
  b('sync', 'sync to tempo (division)'),
  e('division', DIVISIONS.map((d) => d.id), 'tempo division when synced'),
  b('ratioMode', 'run at ratio × the note frequency (audio-rate, for FM-like effects)'),
  n('ratio', 0.25, 8, 'x', 'the ratio'),
  n('amount', 0, 1, '', 'depth before the routes’ amounts'),
  n('stereo', 0, 180, '°', 'right side’s phase offset'),
  e('phase', [0, 90, 180, -1], 'start phase per note (-1 = free running)'),
  n('quant', 0, 1, '', 'steps the output'),
]

export const ROUTE_PARAMS: Param[] = [
  e('source', MOD_SOURCES.map((s) => s.id), 'lfo1 lfo2 (the layer’s, or the header’s global ones in header.mod), mod wheel, aftertouch, velocity, key (octaves from root), random (per note), bend, timbre (CC74), fenv (filter envelope), vco1..vco3 (the patch slots’ audio, audio-rate)'),
  e('dest', Object.keys(MOD_DESTS), Object.entries(MOD_DESTS).map(([k, d]) => `${k}${d.unit ? ` (±1 = ${d.scale} ${d.unit})` : ''}`).join(', ')),
  n('amount', -1, 1, '', 'of the destination’s scale'),
  b('unipolar', 'optional: a two-sided source (lfo1, lfo2, bend, random, vco1..vco3) counts 0..1 instead of -1..1, so it only pushes one way from where the destination is set (e.g. lfo2 → grainPos sweeping forward of the position, never back); no effect on one-sided sources or volume'),
]

/** a patch's MPE bindings: what an MPE controller's surfaces do to it, only while the player has MPE on */
export const MPE_PARAMS: Param[] = [
  e('surface', MPE_SURFACES.map((s) => s.id), MPE_SURFACES.map((s) => `${s.id}: ${s.hint}`).join(' · ')),
  e('dest', Object.keys(MOD_DESTS), 'as a route’s dest'),
  n('amount', -1, 1, '', 'of the destination’s scale, as a route’s (0 at rest, this much at the surface’s full travel)'),
]

export const HEADER_PARAMS: Param[] = [
  n('volume', 0, 1.2, '', 'patch output volume (0.8 default)'),
  b('mono', 'one voice with legato glide'),
  n('glide', 0, 2, 's', 'portamento time'),
  n('bpm', 20, 300, 'BPM', 'tempo for synced LFOs and delay'),
]
export const FX_PARAMS: Param[] = [
  n('chorusRate', 0.05, 8, 'Hz', 'master chorus rate'),
  n('chorusDepth', 0, 1, '', 'chorus depth'),
  n('chorusMix', 0, 1, '', 'chorus wet'),
  n('delayTime', 0.01, 2, 's', 'master delay time (when not synced)'),
  b('delaySync', 'delay synced to tempo'),
  e('delayDivision', DIVISIONS.map((d) => d.id), 'synced delay time'),
  n('delayFeedback', 0, 0.9, '', 'delay feedback'),
  n('delayMix', 0, 1, '', 'delay wet'),
  n('reverbSize', 0.1, 8, 's', 'master reverb length'),
  n('reverbDecay', 0.5, 10, '', 'reverb decay curve'),
  n('reverbMix', 0, 1, '', 'reverb wet'),
]

/** one line per parameter, for the system prompt */
export const paramLine = (p: Param) => {
  const range =
    p.kind === 'boolean' ? 'true|false'
    : p.kind === 'enum' ? p.values!.join('|')
    : `${p.min}..${p.max}${p.unit ? ` ${p.unit}` : ''}${p.kind === 'integer' ? ' (integer)' : ''}`
  return `- ${p.key}: ${range} — ${p.doc}`
}

/**
 * A value for a parameter, checked: answers the value to store (numbers clamped into range, with a note) or an error.
 */
export function checkValue(p: Param, v: unknown): { value?: unknown; note?: string; error?: string } {
  switch (p.kind) {
    case 'boolean':
      return typeof v === 'boolean' ? { value: v } : { error: `${p.key} must be true or false` }
    case 'enum':
      return p.values!.includes(v as never) ? { value: v } : { error: `${p.key} must be one of ${p.values!.join(', ')}` }
    default: {
      if (typeof v !== 'number' || !Number.isFinite(v)) return { error: `${p.key} must be a number (${p.min}..${p.max})` }
      let x = p.kind === 'integer' ? Math.round(v) : v
      const clamped = Math.min(p.max!, Math.max(p.min!, x))
      const note = clamped !== x ? `${p.key} ${v} is out of range: set to ${clamped}` : undefined
      x = clamped
      return { value: x, note }
    }
  }
}

/** the nearest few keys to a wrong one (a typo, a guessed name) */
export function suggest(key: string, params: Param[]): string[] {
  const k = key.toLowerCase()
  const score = (p: Param) => {
    const q = p.key.toLowerCase()
    if (q.includes(k) || k.includes(q)) return 0
    let s = 0
    for (const ch of new Set(k)) if (!q.includes(ch)) s++
    return s + Math.abs(q.length - k.length) / 4
  }
  return [...params].sort((a, b2) => score(a) - score(b2)).slice(0, 4).map((p) => p.key)
}
