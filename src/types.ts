/** What pressing a pad does while that sound is already playing. */
export type TriggerMode = 'stack' | 'stop' | 'restart' | 'hold'

export const TRIGGER_MODES: TriggerMode[] = ['stop', 'restart', 'stack', 'hold']

export const TRIGGER_MODE_INFO: Record<TriggerMode, { label: string; icon: string; hint: string }> = {
  stop: { label: 'STOP', icon: 'mdi-stop', hint: 'Press again to stop (with release)' },
  restart: { label: 'RESTART', icon: 'mdi-restart', hint: 'Press again to restart from the top' },
  stack: { label: 'STACK', icon: 'mdi-layers-triple', hint: 'Press again to layer another copy' },
  hold: { label: 'HOLD', icon: 'mdi-gesture-tap-hold', hint: 'Plays only while held down' },
}

export type FilterType = 'lowpass' | 'highpass' | 'bandpass'
export const FILTER_TYPES: FilterType[] = ['lowpass', 'highpass', 'bandpass']
export const FILTER_LABEL: Record<FilterType, string> = { lowpass: 'LP', highpass: 'HP', bandpass: 'BP' }

// ── modulation ─────────────────────────────────────────────────────────────
export type ModSource = 'lfo1' | 'lfo2' | 'mod' | 'aftertouch' | 'velocity' | 'bend' | 'timbre'
export type ModDest =
  | 'pitch' | 'cutoff' | 'resonance' | 'volume' | 'pan' | 'grainPos' | 'grainSize' | 'delayMix' | 'reverbMix'
export type LfoShape = 'sine' | 'triangle' | 'square' | 'sawtooth' | 'rampDown' | 'random' | 'smooth'

export const MOD_SOURCES: { id: ModSource; label: string }[] = [
  { id: 'lfo1', label: 'LFO 1' },
  { id: 'lfo2', label: 'LFO 2' },
  { id: 'mod', label: 'MOD WHEEL' },
  { id: 'aftertouch', label: 'AFTERTOUCH' },
  { id: 'velocity', label: 'VELOCITY' },
  { id: 'bend', label: 'PITCH BEND' },
  { id: 'timbre', label: 'TIMBRE (CC74)' },
]

/**
 * scale: destination units at amount ±1.
 * audio: wired as an AudioParam connection (otherwise read when each grain starts).
 */
export const MOD_DESTS: Record<ModDest, { label: string; scale: number; unit: string; audio: boolean }> = {
  pitch: { label: 'PITCH', scale: 12, unit: 'st', audio: true },
  cutoff: { label: 'CUTOFF', scale: 5, unit: 'oct', audio: true },
  resonance: { label: 'RESONANCE', scale: 10, unit: 'Q', audio: true },
  volume: { label: 'VOLUME', scale: 1, unit: '', audio: true },
  pan: { label: 'PAN', scale: 1, unit: '', audio: true },
  grainPos: { label: 'GRAIN POS', scale: 0.5, unit: '', audio: false },
  grainSize: { label: 'GRAIN SIZE', scale: 250, unit: 'ms', audio: false },
  delayMix: { label: 'DELAY MIX', scale: 1, unit: '', audio: true },
  reverbMix: { label: 'REVERB MIX', scale: 1, unit: '', audio: true },
}
export const MOD_DEST_IDS = Object.keys(MOD_DESTS) as ModDest[]
export const LFO_SHAPES: LfoShape[] = ['sine', 'triangle', 'square', 'sawtooth', 'rampDown', 'random', 'smooth']

/** Tempo divisions for synced LFOs / delay, in beats (quarter notes). */
export const DIVISIONS: { id: string; beats: number }[] = [
  { id: '4 BAR', beats: 16 },
  { id: '2 BAR', beats: 8 },
  { id: '1/1', beats: 4 },
  { id: '1/2', beats: 2 },
  { id: '1/2T', beats: 4 / 3 },
  { id: '1/4.', beats: 1.5 },
  { id: '1/4', beats: 1 },
  { id: '1/4T', beats: 2 / 3 },
  { id: '1/8.', beats: 0.75 },
  { id: '1/8', beats: 0.5 },
  { id: '1/8T', beats: 1 / 3 },
  { id: '1/16.', beats: 0.375 },
  { id: '1/16', beats: 0.25 },
  { id: '1/16T', beats: 1 / 6 },
  { id: '1/32', beats: 0.125 },
]
export const divisionBeats = (id: string) => DIVISIONS.find((d) => d.id === id)?.beats ?? 1

export interface Lfo {
  shape: LfoShape
  rate: number // Hz, when not synced
  sync: boolean
  division: string // DIVISIONS id, when synced
}

/** LFO frequency in Hz: free rate, or one cycle per division at the current tempo. */
export const lfoHz = (lfo: Lfo, bpm: number) => (lfo.sync ? bpm / 60 / divisionBeats(lfo.division) : lfo.rate)
export interface ModRoute {
  source: ModSource
  dest: ModDest
  amount: number // -1..1 of the destination's scale
}
export interface ModMatrix {
  lfo1: Lfo
  lfo2: Lfo
  routes: ModRoute[]
}
export const defaultMatrix = (): ModMatrix => ({
  lfo1: { shape: 'sine', rate: 5, sync: false, division: '1/8' },
  lfo2: { shape: 'triangle', rate: 0.5, sync: false, division: '1/1' },
  routes: [],
})
const migrateMatrix = (m?: Partial<ModMatrix>): ModMatrix => {
  const d = defaultMatrix()
  return { lfo1: { ...d.lfo1, ...m?.lfo1 }, lfo2: { ...d.lfo2, ...m?.lfo2 }, routes: m?.routes ?? [] }
}

/** tape: pitch and speed both change playback rate. stretch: granular, speed and pitch independent. */
export type TimeMode = 'tape' | 'stretch'

export interface SoundSettings {
  name: string
  tag: string
  // play
  volume: number // 0..1.5 linear gain
  pan: number // -1..1
  repeat: number // 0 = loop forever, N = play N times
  choke: number // 0 = none, 1..8 = choke group
  mode: TriggerMode
  // tune
  pitch: number // semitones -24..24
  fine: number // cents -100..100
  speed: number // 0.25..4
  timeMode: TimeMode
  // clip
  clipIn: number // 0..1 of duration
  clipOut: number // 0..1 of duration
  // amp envelope (seconds, sustain 0..1)
  attack: number
  decay: number
  sustain: number
  release: number
  // filter
  filterType: FilterType
  cutoff: number // Hz
  resonance: number // Q
  // filter envelope
  fEnvAmount: number // octaves -5..5
  fAttack: number
  fDecay: number
  fSustain: number
  fRelease: number
  // grain
  grainSize: number // ms, 0 = off
  grainPos: number // 0..1 within clip
  grainWidth: number // 0..1 of clip, random spread
  grainDensity: number // overlapping grains, 1..8
  grainJitter: number // random ± semitones per grain
  grainReverse: number // 0..1 chance a grain plays backwards
  grainSpread: number // 0..1 random stereo pan per grain
  grainStreams: number // 1..8 independent grain streams per note
  grainScatter: number // 0..1 random timing between a stream's grains
  grainDrift: number // 0..1 each stream wanders through the clip at its own random speed (±1 = real time)
  // delay
  delayTime: number // seconds
  delayFeedback: number // 0..0.9
  delayMix: number // 0..1
  // reverb
  reverbSize: number // seconds of impulse
  reverbDecay: number // decay exponent
  reverbMix: number // 0..1
  // eq (dB)
  eqLow: number
  eqMid: number
  eqHigh: number
  // keys
  rootNote: number // MIDI note that plays the sample at its recorded pitch
  velAmount: number // 0..1 how much velocity changes volume
  bendRange: number // semitones
  // modulation
  mod: ModMatrix
  // midi
  midiNote: number | null
}

export type LoopMode = 'no_loop' | 'one_shot' | 'loop_continuous' | 'loop_sustain'

/** One sample of a multi-sample (SFZ) instrument, mapped to a key × velocity range. Times in seconds. */
export interface Zone {
  audioId: string
  lokey: number
  hikey: number
  lovel: number // 1..127
  hivel: number
  keycenter: number
  keytrack: number // cents per key / 100 (100 = normal)
  transpose: number // semitones
  tune: number // cents
  volume: number // dB
  pan: number // -100..100
  offset: number
  end: number // 0 = to the end of the sample
  loopMode: LoopMode
  loopStart: number
  loopEnd: number
  seqLength: number
  seqPosition: number
  lorand: number
  hirand: number
  env?: { a?: number; d?: number; s?: number; r?: number }
  /** base amplitude % when amplitude_onccN is present */
  amplitude?: number
  /** 'release' regions sound on note-off (piano damper noise, etc.) */
  trigger?: 'attack' | 'release'
  /** release regions: dB lost per second the note was held */
  rtDecay?: number
  /** only sounds while these CCs are inside their ranges (0..127) */
  ccRange?: Record<number, [number, number]>
  /** CC-driven offsets: amount applies at CC = 127 */
  ccMods?: ZoneCcMod[]
  filter?: ZoneFilter
  lfos?: ZoneLfo[]
}

export interface ZoneCcMod {
  cc: number
  target: 'volume' | 'amplitude' | 'pan' | 'pitch' | 'cutoff' | 'resonance'
  amount: number // dB, %, %, cents, cents, dB
}

export interface ZoneFilter {
  type: BiquadFilterType
  cutoff: number // Hz
  resonance: number // dB
  keytrack: number // cents per key from keycenter
  keycenter: number
  veltrack: number // cents at velocity 127
  env?: { a: number; d: number; s: number; r: number; depth: number } // depth in cents
}

export interface ZoneLfo {
  target: 'pitch' | 'cutoff' | 'volume' | 'pan'
  freq: number
  depth: number // cents, cents, dB, %
  delay: number // seconds before it starts
  wave: OscillatorType
  invert?: boolean
}

export interface Sound {
  id: string
  /** Audio blobs are shared between duplicates, so they're keyed separately. For SFZ pads: the zone nearest the root. */
  audioId: string
  fileName: string
  settings: SoundSettings
  /** present for SFZ instruments: the pad plays zones chosen by note and velocity */
  zones?: Zone[]
  /** SFZ <control> set_ccN / set_hdccN: controller values (0..1) the instrument expects to start from */
  ccDefaults?: Record<number, number>
}

/** Every audio blob a pad needs (its own plus its zones'). */
export const soundAudioIds = (s: Sound) => [s.audioId, ...(s.zones ?? []).map((z) => z.audioId)]

export function defaultSettings(name = 'SOUND'): SoundSettings {
  return {
    name,
    tag: '',
    volume: 1,
    pan: 0,
    repeat: 1,
    choke: 0,
    mode: 'stop',
    pitch: 0,
    fine: 0,
    speed: 1,
    timeMode: 'tape',
    clipIn: 0,
    clipOut: 1,
    attack: 0.001,
    decay: 0.2,
    sustain: 1,
    release: 0.02,
    filterType: 'lowpass',
    cutoff: 20000,
    resonance: 0.7,
    fEnvAmount: 0,
    fAttack: 0.001,
    fDecay: 0.3,
    fSustain: 0,
    fRelease: 0.2,
    grainSize: 0,
    grainPos: 0.5,
    grainWidth: 0,
    grainDensity: 2,
    grainJitter: 0,
    grainReverse: 0,
    grainSpread: 0,
    grainStreams: 1,
    grainScatter: 0,
    grainDrift: 0,
    delayTime: 0.25,
    delayFeedback: 0.35,
    delayMix: 0,
    reverbSize: 2,
    reverbDecay: 3,
    reverbMix: 0,
    eqLow: 0,
    eqMid: 0,
    eqHigh: 0,
    rootNote: 60,
    velAmount: 1,
    bendRange: 2,
    mod: defaultMatrix(),
    midiNote: null,
  }
}

/** Fill in settings added since a board was saved, and map renamed ones. */
export function migrateSettings(raw: Partial<SoundSettings> & { fadeIn?: number; fadeOut?: number }): SoundSettings {
  const { fadeIn, fadeOut, ...rest } = raw
  const s = { ...defaultSettings(raw.name), ...rest, mod: migrateMatrix(raw.mod) }
  if (fadeIn !== undefined && raw.attack === undefined) s.attack = Math.max(0.001, fadeIn)
  if (fadeOut !== undefined && raw.release === undefined) s.release = Math.max(0.001, fadeOut)
  return s
}

export interface GlobalFx {
  chorusRate: number // Hz
  chorusDepth: number // 0..1
  chorusMix: number // 0..1
  delayTime: number
  delayFeedback: number
  delayMix: number
  reverbSize: number
  reverbDecay: number
  reverbMix: number
  delaySync: boolean
  delayDivision: string
}

export const defaultGlobalFx = (): GlobalFx => ({
  chorusRate: 0.6,
  chorusDepth: 0.5,
  chorusMix: 0,
  delayTime: 0.375,
  delayFeedback: 0.4,
  delayMix: 0,
  reverbSize: 3,
  reverbDecay: 3,
  reverbMix: 0,
  delaySync: false,
  delayDivision: '1/8.',
})

export interface MasterState {
  volume: number
  muted: boolean
  scanlines: boolean
  /** pad size multiplier */
  scale: number
  /** keyboard-play mode: MIDI / computer keys play the selected patch chromatically */
  play: boolean
  mono: boolean
  /** seconds to slide between notes */
  glide: number
  /** computer-keyboard piano octave shift */
  octave: number
  selectedId: string | null
  /** MPE lower zone: channel 1 = master, 2-16 = one note each */
  mpe: boolean
  /** per-note pitch bend range in MPE, semitones */
  mpeBendRange: number
  /** MIDI notes map to pads in grid order, starting at midiBase */
  midiAuto: boolean
  midiBase: number
  /** internal tempo; used unless following MIDI clock */
  bpm: number
  clockSource: 'internal' | 'midi'
  theme: string
  /** pads = button grid, grid = spreadsheet (canvas-datagrid) */
  view: 'pads' | 'grid'
  fx: GlobalFx
  /** global modulation matrix: applies to every voice */
  mod: ModMatrix
}

export const defaultMaster = (): MasterState => ({
  volume: 0.8,
  muted: false,
  scanlines: true,
  scale: 1,
  play: false,
  mono: false,
  glide: 0,
  octave: 0,
  selectedId: null,
  mpe: false,
  mpeBendRange: 48,
  midiAuto: false,
  midiBase: 36,
  bpm: 120,
  clockSource: 'internal',
  theme: 'console85',
  view: 'pads',
  fx: defaultGlobalFx(),
  mod: defaultMatrix(),
})

export function migrateMaster(raw?: Partial<MasterState>): MasterState {
  return { ...defaultMaster(), ...raw, fx: { ...defaultGlobalFx(), ...raw?.fx }, mod: migrateMatrix(raw?.mod) }
}

// ── presets ────────────────────────────────────────────────────────────────
export interface Preset {
  id: string
  name: string
  settings: Partial<SoundSettings>
}

/** Sample-specific settings a preset leaves alone when copied to another pad. */
export const PRESET_EXCLUDE = ['name', 'tag', 'midiNote', 'rootNote', 'clipIn', 'clipOut'] as const

export function presetSettings(s: SoundSettings): Partial<SoundSettings> {
  const copy: Partial<SoundSettings> = JSON.parse(JSON.stringify(s))
  for (const k of PRESET_EXCLUDE) delete copy[k]
  return copy
}
