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
  // midi
  midiNote: number | null
}

export interface Sound {
  id: string
  /** Audio blobs are shared between duplicates, so they're keyed separately. */
  audioId: string
  fileName: string
  settings: SoundSettings
}

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
    delayTime: 0.25,
    delayFeedback: 0.35,
    delayMix: 0,
    reverbSize: 2,
    reverbDecay: 3,
    reverbMix: 0,
    eqLow: 0,
    eqMid: 0,
    eqHigh: 0,
    midiNote: null,
  }
}

/** Fill in settings added since a board was saved, and map renamed ones. */
export function migrateSettings(raw: Partial<SoundSettings> & { fadeIn?: number; fadeOut?: number }): SoundSettings {
  const { fadeIn, fadeOut, ...rest } = raw
  const s = { ...defaultSettings(raw.name), ...rest }
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
  fx: GlobalFx
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
  fx: defaultGlobalFx(),
})
