/**
 * Factory content: built-in synth sounds (looped band-limited wavetables) and patches made from them.
 */
import type { GlobalFx, ModRoute, PatchSlot, SoundSettings } from '../types'
import type { SynthWave } from '../audio/synthWaves'

export const FACTORY_WAVES: { wave: SynthWave; name: string }[] = [
  { wave: 'saw', name: 'SAW WAVE' },
  { wave: 'square', name: 'SQUARE WAVE' },
  { wave: 'sine', name: 'SINE WAVE' },
  { wave: 'triangle', name: 'TRIANGLE WAVE' },
  { wave: 'noise', name: 'NOISE' },
]

/** a built-in wave as a playable sound: loops while held, gentle release */
export const waveSettings = (): Partial<SoundSettings> => ({
  repeat: 0,
  mode: 'hold',
  attack: 0.005,
  decay: 0.2,
  sustain: 1,
  release: 0.3,
  volume: 0.8,
})

type SlotParams = Partial<Omit<PatchSlot, 'layer'>>
export interface FactoryPatch {
  name: string
  tag: string
  /** slot 1..3: which wave, the layer's knob overrides, and how the slot joins the patch */
  slots: ({ wave: SynthWave; settings?: Partial<SoundSettings>; slot?: SlotParams } | null)[]
  /** routes on the main voice's pad matrix (VCO n = slot n) */
  routes?: ModRoute[]
  lfo1?: { shape: 'sine' | 'triangle'; rate: number }
  header?: { mono?: boolean; glide?: number; fx?: Partial<GlobalFx> }
}

export const FACTORY_PATCHES: FactoryPatch[] = [
  {
    name: 'POLY SAW',
    tag: 'factory, synth, poly',
    slots: [
      { wave: 'saw', settings: { cutoff: 4200, resonance: 1.2, fEnvAmount: 1, fDecay: 0.6, fSustain: 0.4, release: 0.5 } },
      { wave: 'saw', settings: { cutoff: 4200 }, slot: { fine: 9, level: 0.8 } },
      { wave: 'saw', settings: { cutoff: 4200 }, slot: { fine: -9, level: 0.8 } },
    ],
    header: { fx: { chorusMix: 0.35, reverbMix: 0.2 } },
  },
  {
    name: 'PURE SINE',
    tag: 'factory, synth, simple',
    slots: [{ wave: 'sine', settings: { attack: 0.02, release: 0.6 } }, null, null],
    header: { fx: { reverbMix: 0.15 } },
  },
  {
    name: 'FM PIANO',
    tag: 'factory, fm, keys',
    slots: [
      { wave: 'sine', settings: { attack: 0.002, decay: 2.2, sustain: 0, release: 0.5, velAmount: 1 } },
      // 1:1 modulator, fading fast — the bark of the attack
      { wave: 'sine', settings: { attack: 0.001, decay: 0.9, sustain: 0, release: 0.3 }, slot: { audible: false } },
      // two octaves up, very short — the tine
      { wave: 'sine', settings: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.1 }, slot: { audible: false, transpose: 24 } },
    ],
    routes: [
      { source: 'vco2', dest: 'pitch', amount: 0.35 },
      { source: 'vco3', dest: 'pitch', amount: 0.12 },
    ],
    header: { fx: { chorusMix: 0.2, reverbMix: 0.2 } },
  },
  {
    name: 'SQUARE LEAD',
    tag: 'factory, synth, lead, mono',
    slots: [
      { wave: 'square', settings: { cutoff: 3000, resonance: 2, release: 0.15 } },
      { wave: 'square', settings: { cutoff: 2000 }, slot: { transpose: -12, level: 0.5 } },
      null,
    ],
    header: { mono: true, glide: 0.08, fx: { delaySync: true, delayDivision: '1/8.', delayMix: 0.25, delayFeedback: 0.35 } },
  },
  {
    name: 'WARM PAD',
    tag: 'factory, synth, pad',
    slots: [
      { wave: 'triangle', settings: { attack: 1.2, release: 2.5, cutoff: 5000 } },
      { wave: 'saw', settings: { attack: 1.4, release: 2.5, cutoff: 1800 }, slot: { fine: 7, level: 0.4 } },
      null,
    ],
    lfo1: { shape: 'sine', rate: 0.2 },
    routes: [{ source: 'lfo1', dest: 'cutoff', amount: 0.15 }],
    header: { fx: { chorusMix: 0.5, reverbMix: 0.45, reverbSize: 6 } },
  },
  {
    name: 'SUB BASS',
    tag: 'factory, synth, bass, mono',
    slots: [
      { wave: 'sine', settings: { release: 0.12, rootNote: 60 } },
      { wave: 'square', settings: { cutoff: 900, release: 0.12 }, slot: { level: 0.25 } },
      null,
    ],
    header: { mono: true, glide: 0.05 },
  },
  {
    name: 'BRASS STAB',
    tag: 'factory, synth, brass',
    slots: [
      {
        wave: 'saw',
        settings: { cutoff: 600, resonance: 3, fEnvAmount: 3, fAttack: 0.03, fDecay: 0.35, fSustain: 0.3, attack: 0.03, decay: 0.3, sustain: 0.7, release: 0.25 },
      },
      { wave: 'saw', settings: { cutoff: 600, fEnvAmount: 3, fAttack: 0.03, fDecay: 0.35, fSustain: 0.3 }, slot: { fine: 6 } },
      null,
    ],
    header: { fx: { reverbMix: 0.25 } },
  },
  {
    name: 'WIND',
    tag: 'factory, noise, texture',
    slots: [{ wave: 'noise', settings: { filterType: 'bandpass', cutoff: 900, resonance: 6, attack: 1.5, release: 3 } }, null, null],
    lfo1: { shape: 'sine', rate: 0.15 },
    routes: [{ source: 'lfo1', dest: 'cutoff', amount: 0.4 }],
    header: { fx: { reverbMix: 0.5, reverbSize: 6 } },
  },
  {
    name: 'RING BELL',
    tag: 'factory, fm, bell',
    slots: [
      { wave: 'sine', settings: { attack: 0.001, decay: 3, sustain: 0, release: 1.5 } },
      // a sine 19 semitones up, silent, multiplying the carrier's level: ring modulation
      { wave: 'sine', slot: { audible: false, transpose: 19 } },
      null,
    ],
    routes: [{ source: 'vco2', dest: 'volume', amount: -1 }],
    header: { fx: { reverbMix: 0.35 } },
  },
]
