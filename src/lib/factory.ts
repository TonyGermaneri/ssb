/**
 * Built-in patches, made of AKWF waves (lib/akwf.ts). Every wave is a sound of the board from the first load;
 * these patches are installed after them, as ordinary patches of the catalog (tagged "factory"), and know which
 * built-in they came from by `factoryId`, so a board gets each one once whatever it has renamed it to.
 */
import type { GlobalFx, Lfo, ModRoute, PatchSlot, SoundSettings } from '../types'
import { FACTORY_PATCHES_MORE } from './factoryPatches'

type SlotParams = Partial<Omit<PatchSlot, 'layer'>>
/** One slot: an AKWF wave (by its name, e.g. AKWF_saw, AKWF_epiano_0025) and how its layer differs from the wave's sound. */
export interface FactorySlot {
  wave: string
  /** the layer's knobs, over the wave's own (see waveSoundSettings) */
  settings?: Partial<SoundSettings>
  /** how the slot joins the patch: level, audible, transpose, fine, … */
  slot?: SlotParams
  /** the layer's matrix: its LFOs and routes (on slot 1, VCO n = slot n) */
  lfo1?: Partial<Lfo>
  lfo2?: Partial<Lfo>
  routes?: ModRoute[]
}
export interface FactoryPatch {
  /** stable: renaming the patch on a board doesn't make it another one */
  id: string
  name: string
  tag: string
  /** slots 1..3 */
  slots: (FactorySlot | null)[]
  /** the header knobs it brings: mono, glide, the master FX, the global matrix */
  header?: {
    volume?: number
    mono?: boolean
    glide?: number
    fx?: Partial<GlobalFx>
    mod?: { lfo1?: Partial<Lfo>; lfo2?: Partial<Lfo>; routes?: ModRoute[] }
  }
}

/** The perfect waves and a voice: what 0.5's factory patches were made of. */
export const W = {
  saw: 'AKWF_saw',
  square: 'AKWF_squ',
  sine: 'AKWF_sin',
  triangle: 'AKWF_tri',
  voice: 'AKWF_hvoice_0039',
}

/** 0.5's factory patches. */
const CLASSICS: FactoryPatch[] = [
  {
    id: 'poly-saw',
    name: 'SUPERSAW SUNRISE',
    tag: 'factory, synth, poly, pad, vco',
    slots: [
      { wave: W.saw, settings: { cutoff: 4200, resonance: 1.2, fEnvAmount: 1, fDecay: 0.6, fSustain: 0.4, release: 0.5 } },
      { wave: W.saw, settings: { cutoff: 4200 }, slot: { fine: 9, level: 0.8 } },
      { wave: W.saw, settings: { cutoff: 4200 }, slot: { fine: -9, level: 0.8 } },
    ],
    header: { fx: { chorusMix: 0.35, reverbMix: 0.2 } },
  },
  {
    id: 'pure-sine',
    name: 'TUNING FORK SINE',
    tag: 'factory, synth, simple',
    slots: [{ wave: W.sine, settings: { attack: 0.02, release: 0.6 } }, null, null],
    header: { fx: { reverbMix: 0.15 } },
  },
  {
    id: 'fm-piano',
    name: 'TINE MACHINE EP',
    tag: 'factory, fm, keys, vco',
    slots: [
      {
        wave: W.sine,
        settings: { attack: 0.002, decay: 2.2, sustain: 0, release: 0.5, velAmount: 1 },
        routes: [
          { source: 'vco2', dest: 'pitch', amount: 0.35 },
          { source: 'vco3', dest: 'pitch', amount: 0.12 },
        ],
      },
      // 1:1 modulator, fading fast — the bark of the attack
      { wave: W.sine, settings: { attack: 0.001, decay: 0.9, sustain: 0, release: 0.3 }, slot: { audible: false } },
      // two octaves up, very short — the tine
      { wave: W.sine, settings: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.1 }, slot: { audible: false, transpose: 24 } },
    ],
    header: { fx: { chorusMix: 0.2, reverbMix: 0.2 } },
  },
  {
    id: 'square-lead',
    name: 'SQUARE DEAL LEAD',
    tag: 'factory, synth, lead, mono, vco',
    slots: [
      { wave: W.square, settings: { cutoff: 3000, resonance: 2, release: 0.15 } },
      { wave: W.square, settings: { cutoff: 2000 }, slot: { transpose: -12, level: 0.5 } },
      null,
    ],
    header: { mono: true, glide: 0.08, fx: { delaySync: true, delayDivision: '1/8.', delayMix: 0.25, delayFeedback: 0.35 } },
  },
  {
    id: 'warm-pad',
    name: 'WOOL BLANKET PAD',
    tag: 'factory, synth, pad, vco',
    slots: [
      {
        wave: W.triangle,
        settings: { attack: 1.2, release: 2.5, cutoff: 5000 },
        lfo1: { shape: 'sine', rate: 0.2 },
        routes: [{ source: 'lfo1', dest: 'cutoff', amount: 0.15 }],
      },
      { wave: W.saw, settings: { attack: 1.4, release: 2.5, cutoff: 1800 }, slot: { fine: 7, level: 0.4 } },
      null,
    ],
    header: { fx: { chorusMix: 0.5, reverbMix: 0.45, reverbSize: 6 } },
  },
  {
    id: 'sub-bass',
    name: 'SUBTERRANEAN BASS',
    tag: 'factory, synth, bass, mono, vco',
    slots: [
      { wave: W.sine, settings: { release: 0.12 } },
      { wave: W.square, settings: { cutoff: 900, release: 0.12 }, slot: { level: 0.25 } },
      null,
    ],
    header: { mono: true, glide: 0.05 },
  },
  {
    id: 'brass-stab',
    name: 'BRASS KNUCKLES STAB',
    tag: 'factory, synth, brass, vco',
    slots: [
      {
        wave: W.saw,
        settings: { cutoff: 600, resonance: 3, fEnvAmount: 3, fAttack: 0.03, fDecay: 0.35, fSustain: 0.3, attack: 0.03, decay: 0.3, sustain: 0.7, release: 0.25 },
      },
      { wave: W.saw, settings: { cutoff: 600, fEnvAmount: 3, fAttack: 0.03, fDecay: 0.35, fSustain: 0.3 }, slot: { fine: 6 } },
      null,
    ],
    header: { fx: { reverbMix: 0.25 } },
  },
  {
    id: 'vox-pad',
    name: 'CHOIR OF ONE PAD',
    tag: 'factory, synth, pad, voice, vco',
    slots: [
      {
        wave: W.voice,
        settings: { attack: 0.8, release: 2.2, cutoff: 6000 },
        lfo1: { shape: 'sine', rate: 0.2 },
        routes: [{ source: 'lfo1', dest: 'cutoff', amount: 0.1 }],
      },
      // the same vowel a few cents away: a choir rather than one voice
      { wave: W.voice, settings: { attack: 1, release: 2.2, cutoff: 6000 }, slot: { fine: 8, level: 0.6 } },
      null,
    ],
    header: { fx: { chorusMix: 0.45, reverbMix: 0.45, reverbSize: 5 } },
  },
  {
    id: 'ring-bell',
    name: 'RING-MOD BELL TOWER',
    tag: 'factory, fm, bell, ring, vco',
    slots: [
      {
        wave: W.sine,
        settings: { attack: 0.001, decay: 3, sustain: 0, release: 1.5 },
        routes: [{ source: 'vco2', dest: 'volume', amount: -1 }],
      },
      // a sine 19 semitones up, silent, multiplying the carrier's level: ring modulation
      { wave: W.sine, slot: { audible: false, transpose: 19 } },
      null,
    ],
    header: { fx: { reverbMix: 0.35 } },
  },
]

/** 0.5's factory patches by the name they had then (boards from 0.5 rename theirs). */
export const LEGACY_FACTORY_NAMES: Record<string, string> = {
  'POLY SAW': 'poly-saw',
  'PURE SINE': 'pure-sine',
  'FM PIANO': 'fm-piano',
  'SQUARE LEAD': 'square-lead',
  'WARM PAD': 'warm-pad',
  'SUB BASS': 'sub-bass',
  'BRASS STAB': 'brass-stab',
  'VOX PAD': 'vox-pad',
  'RING BELL': 'ring-bell',
}

export const FACTORY_PATCHES: FactoryPatch[] = [...CLASSICS, ...FACTORY_PATCHES_MORE]
