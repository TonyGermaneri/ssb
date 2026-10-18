/**
 * The built-in patches beyond 0.5's nine (lib/factory.ts): 118 more, made of AKWF waves.
 *
 * Every wave's sound loops one cycle at C2 (root 36), so a layer's GRAIN of 32.7 Hz (half of C2, two grains a
 * period, following the keys) plays in tune and PITCH then moves its formant rather than its note: grain sync. A
 * pitch route paired with an opposite GRAIN route (half as much: GRAIN's scale is 24 semitones to PITCH's 12) holds
 * the note while the formant sweeps.
 */
import type { FactoryPatch, FactorySlot } from './factory'
import type { FilterType, GlobalFx, Lfo, ModRoute, SoundSettings } from '../types'

type S = Partial<SoundSettings>

// ── waves ─────────────────────────────────────────────────────────────────
const SAW = 'AKWF_saw'
const SQU = 'AKWF_squ'
const SIN = 'AKWF_sin'
const TRI = 'AKWF_tri'

// ── helpers ───────────────────────────────────────────────────────────────
/** the amp envelope */
const amp = (attack: number, decay: number, sustain: number, release: number): S => ({ attack, decay, sustain, release })
/** the filter */
const filt = (cutoff: number, resonance = 0.7, filterType: FilterType = 'lowpass'): S => ({ filterType, cutoff, resonance })
/** the filter envelope: octaves, then its ADSR */
const fenv = (fEnvAmount: number, fAttack: number, fDecay: number, fSustain: number, fRelease = 0.4): S => ({
  fEnvAmount, fAttack, fDecay, fSustain, fRelease,
})
/** grain sync: grains one period of the note apart (see above) */
const SYNC: S = { grain: true, grainFreq: 32.7 }
/** CLOUD: unsynced grains, each a little off pitch (VARIATION): a chorus of one oscillator */
const cloud = (density = 8, variation = 0.5, varPitch = 0.3, extra: S = {}): S => ({
  grain: true, grainMode: 'cloud', grainFreq: 12, grainDensity: density, grainVariation: variation, grainVarPitch: varPitch, ...extra,
})

/** LFO 1 as vibrato, brought in by the mod wheel */
const wheelVibrato = (rate = 5.5, depth = 0.025): { lfo1: Partial<Lfo>; vib: ModRoute[] } => ({
  lfo1: { shape: 'sine', rate, amount: 0 },
  vib: [
    { source: 'lfo1', dest: 'pitch', amount: depth },
    { source: 'mod', dest: 'lfo1Amt', amount: 1 },
  ],
})
const WV = wheelVibrato()
/** LFO 1 as vibrato that is always there */
const VIB = (rate = 5.2, depth = 0.015): { lfo1: Partial<Lfo>; routes: ModRoute[] } => ({
  lfo1: { shape: 'sine', rate },
  routes: [{ source: 'lfo1', dest: 'pitch', amount: depth }],
})
const vel = (dest: ModRoute['dest'], amount: number): ModRoute => ({ source: 'velocity', dest, amount })
const at = (dest: ModRoute['dest'], amount: number): ModRoute => ({ source: 'aftertouch', dest, amount })
/** the formant sweeps, the note holds (grain sync) */
const formant = (source: ModRoute['source'], amount: number): ModRoute[] => [
  { source, dest: 'pitch', amount },
  { source, dest: 'grainSize', amount: -amount / 2 },
]
type Fx = Partial<GlobalFx>
const room = (reverbMix: number, reverbSize = 3, extra: Fx = {}): Fx => ({ reverbMix, reverbSize, ...extra })
const echo = (delayDivision: string, delayMix: number, delayFeedback = 0.35, extra: Fx = {}): Fx => ({
  delaySync: true, delayDivision, delayMix, delayFeedback, ...extra,
})
const chorus = (chorusMix: number, chorusRate = 0.6, chorusDepth = 0.5): Fx => ({ chorusMix, chorusRate, chorusDepth })

const slot = (wave: string, settings: S = {}, more: Omit<FactorySlot, 'wave' | 'settings'> = {}): FactorySlot => ({ wave, settings, ...more })

// ── bass ──────────────────────────────────────────────────────────────────
const BASS: FactoryPatch[] = [
  {
    id: 'rubber-band-bass',
    name: 'RUBBER BAND BASS',
    tag: 'factory, bass, mono, vco, filter',
    slots: [
      slot(SQU, { ...amp(0.002, 0.4, 0.7, 0.1), ...filt(380, 4, 'lp24'), ...fenv(3, 0.001, 0.22, 0.1, 0.1) }, { routes: [vel('cutoff', 0.25)] }),
      slot(SIN, { ...amp(0.002, 0.4, 0.8, 0.1) }, { slot: { transpose: -12, level: 0.7 } }),
      null,
    ],
    header: { mono: true, glide: 0.04 },
  },
  {
    id: 'upright-citizen-bass',
    name: 'UPRIGHT CITIZEN BASS',
    tag: 'factory, bass, acoustic, velocity',
    slots: [slot('AKWF_dbass_0045', { ...amp(0.004, 1.4, 0.25, 0.22), ...filt(1600, 0.9), velAmount: 0.8 }, { routes: [vel('cutoff', 0.3)] }), null, null],
    header: { fx: room(0.12, 1.5) },
  },
  {
    id: 'fingerstyle-funk-bass',
    name: 'FINGERSTYLE FUNK BASS',
    tag: 'factory, bass, electric, velocity',
    slots: [
      slot('AKWF_ebass_0017', { ...amp(0.002, 0.7, 0.45, 0.1), ...filt(2400, 1.5), ...fenv(1.5, 0.001, 0.18, 0, 0.1) }, { routes: [vel('cutoff', 0.35)] }),
      null,
      null,
    ],
    header: { mono: true },
  },
  {
    id: 'acid-reflux-bass',
    name: 'ACID REFLUX BASS',
    tag: 'factory, bass, acid, mono, glide, filter',
    slots: [
      slot(SAW, { ...amp(0.002, 0.3, 0.8, 0.08), ...filt(280, 11, 'lp24'), ...fenv(3.5, 0.001, 0.18, 0, 0.1) }, { routes: [vel('cutoff', 0.3)] }),
      null,
      null,
    ],
    header: { mono: true, glide: 0.09, fx: echo('1/8.', 0.18, 0.3) },
  },
  {
    id: 'wobble-hobble-bass',
    name: 'WOBBLE HOBBLE BASS',
    tag: 'factory, bass, wobble, lfo, tempo, vco',
    slots: [
      slot(SAW, { ...amp(0.003, 0.2, 1, 0.12), ...filt(420, 6, 'lp24') }, {
        lfo2: { shape: 'triangle', sync: true, division: '1/8' },
        routes: [{ source: 'lfo2', dest: 'cutoff', amount: 0.45 }, { source: 'mod', dest: 'lfo2Rate', amount: 0.34 }],
      }),
      slot(SQU, { ...amp(0.003, 0.2, 1, 0.12), ...filt(300) }, { slot: { transpose: -12, level: 0.6 } }),
      null,
    ],
    header: { mono: true, glide: 0.03 },
  },
  {
    id: 'reese-pieces-bass',
    name: 'REESE PIECES BASS',
    tag: 'factory, bass, reese, detune, vco',
    slots: [
      slot(SAW, { ...amp(0.005, 0.3, 1, 0.15), ...filt(850, 1.2, 'lp24') }),
      slot(SAW, { ...amp(0.005, 0.3, 1, 0.15), ...filt(850, 1.2, 'lp24') }, { slot: { fine: 16 } }),
      slot(SIN, { ...amp(0.005, 0.3, 1, 0.15) }, { slot: { transpose: -12, level: 0.6 } }),
    ],
    header: { mono: true, glide: 0.05, fx: chorus(0.25, 0.3, 0.4) },
  },
  {
    id: 'fm-thump-bass',
    name: 'FM THUMP BASS',
    tag: 'factory, bass, fm, mono, vco',
    slots: [
      slot(SIN, { ...amp(0.001, 0.5, 0.7, 0.1) }, { routes: [{ source: 'vco2', dest: 'pitch', amount: 0.45 }] }),
      slot(SIN, { ...amp(0.001, 0.12, 0.15, 0.08) }, { slot: { audible: false } }),
      null,
    ],
    header: { mono: true },
  },
  {
    id: 'basement-8bit-bass',
    name: '8-BIT BASEMENT BASS',
    tag: 'factory, bass, chip, mono, vco',
    slots: [
      slot('AKWF_squ8bit', { ...amp(0.001, 0.2, 0.8, 0.05) }),
      slot('AKWF_tri4bit', { ...amp(0.001, 0.2, 1, 0.05) }, { slot: { transpose: -12, level: 0.8 } }),
      null,
    ],
    header: { mono: true },
  },
  {
    id: 'grain-growl-bass',
    name: 'GRAIN GROWL BASS',
    tag: 'factory, bass, grain, sync, mono',
    slots: [
      slot(SAW, { ...SYNC, ...amp(0.003, 0.3, 0.9, 0.12), ...filt(1800, 2.5, 'lp24'), ...fenv(0, 0.001, 0.35, 0.2, 0.2) }, {
        routes: formant('fenv', 0.8),
      }),
      slot(SIN, { ...amp(0.003, 0.3, 1, 0.12) }, { slot: { transpose: -12, level: 0.5 } }),
      null,
    ],
    header: { mono: true, glide: 0.04 },
  },
  {
    id: 'submarine-sine-bass',
    name: 'SUBMARINE SINE BASS',
    tag: 'factory, bass, sub, 808',
    slots: [
      slot(SIN, { ...amp(0.001, 1.6, 0.45, 0.3), ...fenv(0, 0.001, 0.09, 0, 0.05) }, { routes: [{ source: 'fenv', dest: 'pitch', amount: 0.6 }] }),
      slot('AKWF_tri', { ...amp(0.001, 0.08, 0, 0.05) }, { slot: { transpose: 12, level: 0.25 } }),
      null,
    ],
    header: { mono: true },
  },
  {
    id: 'hollow-log-bass',
    name: 'HOLLOW LOG BASS',
    tag: 'factory, bass, pluck, wood',
    slots: [slot('AKWF_pluckalgo_0003', { ...amp(0.001, 0.55, 0, 0.18), ...filt(1100, 1.2), velAmount: 0.7 }, { routes: [vel('cutoff', 0.3)] }), null, null],
  },
  {
    id: 'overdrive-alley-bass',
    name: 'OVERDRIVE ALLEY BASS',
    tag: 'factory, bass, distorted, mono, vco',
    slots: [
      slot('AKWF_distorted_0012', { ...amp(0.002, 0.4, 0.8, 0.1), ...filt(1900, 2), ...fenv(1.4, 0.001, 0.25, 0.3, 0.1) }),
      slot(SIN, { ...amp(0.002, 0.4, 1, 0.1) }, { slot: { transpose: -12, level: 0.55 } }),
      null,
    ],
    header: { mono: true, glide: 0.03 },
  },
  {
    id: 'talkbox-bass',
    name: 'TALKBOX BASS',
    tag: 'factory, bass, voice, grain, sync, mono',
    slots: [
      slot('AKWF_hvoice_0090', { ...SYNC, pitch: 5, ...amp(0.004, 0.3, 0.9, 0.12), ...filt(2600, 1.5), ...fenv(0, 0.02, 0.5, 0.3, 0.2) }, {
        routes: formant('fenv', 0.6),
      }),
      slot(SIN, { ...amp(0.004, 0.3, 1, 0.12) }, { slot: { transpose: -12, level: 0.5 } }),
      null,
    ],
    header: { mono: true, glide: 0.05 },
  },
]

// ── leads ─────────────────────────────────────────────────────────────────
const LEAD: FactoryPatch[] = [
  {
    id: 'stadium-saw-lead',
    name: 'STADIUM SAW LEAD',
    tag: 'factory, lead, mono, vco, wheel',
    slots: [
      slot(SAW, { ...amp(0.01, 0.3, 0.9, 0.25), ...filt(5200, 1.6, 'lp24'), ...fenv(1, 0.01, 0.4, 0.5) }, { lfo1: WV.lfo1, routes: WV.vib }),
      slot(SAW, { ...amp(0.01, 0.3, 0.9, 0.25), ...filt(5200, 1.6, 'lp24') }, { slot: { fine: 8, level: 0.8 } }),
      slot(SAW, { ...amp(0.01, 0.3, 0.9, 0.25), ...filt(4000) }, { slot: { transpose: 12, fine: -5, level: 0.35 } }),
    ],
    header: { mono: true, glide: 0.06, fx: { ...echo('1/8.', 0.2, 0.35), ...room(0.18) } },
  },
  {
    id: 'tea-kettle-lead',
    name: 'TEA KETTLE WHISTLE LEAD',
    tag: 'factory, lead, flute, wheel',
    slots: [slot('AKWF_flute_0002', { ...amp(0.06, 0.2, 0.9, 0.2), ...filt(7000) }, { lfo1: WV.lfo1, routes: [...WV.vib, at('cutoff', 0.3)] }), null, null],
    header: { mono: true, glide: 0.04, fx: room(0.25, 2.5) },
  },
  {
    id: 'sync-screamer-lead',
    name: 'SYNC SCREAMER LEAD',
    tag: 'factory, lead, grain, sync, mono, aftertouch',
    slots: [
      slot(SAW, { ...SYNC, ...amp(0.005, 0.3, 0.9, 0.2), ...filt(9000), ...fenv(0, 0.001, 0.6, 0.25, 0.3) }, {
        lfo1: WV.lfo1,
        routes: [...formant('fenv', 1.1), ...formant('aftertouch', 0.6), ...WV.vib],
      }),
      null,
      null,
    ],
    header: { mono: true, glide: 0.05, fx: { ...echo('1/8', 0.18, 0.3), ...room(0.15) } },
  },
  {
    id: 'ghost-of-leon-lead',
    name: 'GHOST OF LEON LEAD',
    tag: 'factory, lead, theremin, glide',
    slots: [slot('AKWF_tannerin_0001', { ...amp(0.08, 0.2, 1, 0.5) }, VIB(5.8, 0.02)), null, null],
    header: { mono: true, glide: 0.28, fx: room(0.35, 4) },
  },
  {
    id: 'pixel-hero-lead',
    name: 'PIXEL HERO LEAD',
    tag: 'factory, lead, chip, mono',
    slots: [slot('AKWF_vgsqu_0015', { ...amp(0.001, 0.2, 0.85, 0.08) }, VIB(7, 0.012)), null, null],
    header: { mono: true, glide: 0.02, fx: echo('1/16', 0.15, 0.25) },
  },
  {
    id: 'sax-appeal-lead',
    name: 'SAX APPEAL LEAD',
    tag: 'factory, lead, sax, velocity, wheel',
    slots: [
      slot('AKWF_altosax_0014', { ...amp(0.03, 0.3, 0.85, 0.18), ...filt(3200, 1.2), velAmount: 0.8 }, {
        lfo1: WV.lfo1,
        routes: [...WV.vib, vel('cutoff', 0.35), at('cutoff', 0.3)],
      }),
      null,
      null,
    ],
    header: { mono: true, glide: 0.03, fx: room(0.2, 2) },
  },
  {
    id: 'double-reed-lead',
    name: 'DOUBLE REED SOLO',
    tag: 'factory, lead, woodwind, oboe',
    slots: [slot('AKWF_oboe_0004', { ...amp(0.05, 0.2, 0.9, 0.18), ...filt(5000) }, VIB(5, 0.012)), null, null],
    header: { mono: true, glide: 0.02, fx: room(0.22, 2.5) },
  },
  {
    id: 'pulse-wander-lead',
    name: 'PULSE WIDTH WANDER LEAD',
    tag: 'factory, lead, pwm, lfo, vco',
    slots: [
      slot('AKWF_squ_0005', { ...amp(0.005, 0.3, 0.9, 0.2), ...filt(4500, 1) }, {
        lfo2: { shape: 'sine', rate: 0.6, phase: 0 },
        routes: [{ source: 'lfo2', dest: 'volume', amount: 0.45 }],
      }),
      slot('AKWF_squ_0040', { ...amp(0.005, 0.3, 0.9, 0.2), ...filt(4500, 1) }, {
        // the same LFO half a cycle on: the two widths trade places
        lfo2: { shape: 'sine', rate: 0.6, phase: 180 },
        routes: [{ source: 'lfo2', dest: 'volume', amount: 0.45 }],
        slot: { level: 0.8 },
      }),
      null,
    ],
    header: { mono: true, glide: 0.04, fx: chorus(0.2) },
  },
  {
    id: 'laser-ring-lead',
    name: 'LASER RING LEAD',
    tag: 'factory, lead, ring, glide, vco',
    slots: [
      slot(SAW, { ...amp(0.005, 0.3, 0.9, 0.2), ...filt(6000) }, { routes: [{ source: 'vco2', dest: 'volume', amount: -0.9 }] }),
      slot(SIN, {}, { slot: { audible: false, transpose: 7 } }),
      null,
    ],
    header: { mono: true, glide: 0.12, fx: echo('1/8.', 0.22, 0.4) },
  },
  {
    id: 'fm-trumpeteer-lead',
    name: 'FM TRUMPETEER LEAD',
    tag: 'factory, lead, fm, brass, vco',
    slots: [
      slot(SIN, { ...amp(0.04, 0.3, 0.85, 0.15) }, { lfo1: WV.lfo1, routes: [{ source: 'vco2', dest: 'pitch', amount: 0.3 }, ...WV.vib] }),
      slot(SIN, { ...amp(0.06, 0.4, 0.55, 0.15), velAmount: 1 }, { slot: { audible: false } }),
      null,
    ],
    header: { mono: true, glide: 0.03, fx: room(0.2) },
  },
  {
    id: 'fuzz-pedal-lead',
    name: 'FUZZ PEDAL LEAD',
    tag: 'factory, lead, guitar, distorted, wheel',
    slots: [
      slot('AKWF_distorted_0040', { ...amp(0.003, 0.4, 0.8, 0.3), ...filt(3800, 1.2) }, { lfo1: WV.lfo1, routes: [...WV.vib, vel('cutoff', 0.25)] }),
      slot('AKWF_eguitar_0010', { ...amp(0.003, 0.4, 0.8, 0.3) }, { slot: { fine: 6, level: 0.6 } }),
      null,
    ],
    header: { mono: true, glide: 0.04, fx: { ...echo('1/4', 0.2, 0.35), ...room(0.2) } },
  },
  {
    id: 'vocoder-vagabond-lead',
    name: 'VOCODER VAGABOND LEAD',
    tag: 'factory, lead, voice, grain, sync, robot',
    slots: [
      slot('AKWF_hvoice_0053', { ...SYNC, pitch: 4, ...amp(0.01, 0.3, 0.9, 0.2) }, {
        lfo2: { shape: 'triangle', rate: 1.3 },
        routes: [...formant('lfo2', 0.35), ...formant('mod', 0.6)],
      }),
      slot('AKWF_hvoice_0053', { ...SYNC, pitch: 4, ...amp(0.01, 0.3, 0.9, 0.2) }, { slot: { fine: 9, level: 0.6 } }),
      null,
    ],
    header: { mono: true, glide: 0.04, fx: chorus(0.3) },
  },
  {
    id: 'comet-tail-lead',
    name: 'COMET TAIL LEAD',
    tag: 'factory, lead, grain, cloud, delay',
    slots: [slot(SAW, { ...cloud(6, 0.35, 0.15), ...amp(0.01, 0.3, 0.9, 0.6), ...filt(5500, 1) }, { lfo1: WV.lfo1, routes: WV.vib }), null, null],
    header: { mono: true, glide: 0.06, fx: { ...echo('1/4.', 0.3, 0.5), ...room(0.3, 4) } },
  },
]

// ── pads ──────────────────────────────────────────────────────────────────
const PAD: FactoryPatch[] = [
  {
    id: 'glacier-sheet-pad',
    name: 'GLACIER SHEET PAD',
    tag: 'factory, pad, grain, cloud, stereo',
    slots: [
      slot('AKWF_blended_0038', { ...cloud(10, 0.55, 0.2, { grainDetune: 0.08 }), ...amp(1.6, 1, 1, 3), ...filt(6000), velAmount: 0.4 }),
      null,
      null,
    ],
    header: { fx: room(0.5, 7) },
  },
  {
    id: 'velvet-strings-pad',
    name: 'VELVET STRINGS PAD',
    tag: 'factory, pad, strings, vco, detune',
    slots: [
      slot('AKWF_cheeze_0002', { ...amp(0.8, 1, 1, 2), ...filt(5000), velAmount: 0.5 }),
      slot('AKWF_cheeze_0002', { ...amp(0.9, 1, 1, 2), ...filt(5000) }, { slot: { fine: 9, level: 0.85 } }),
      slot('AKWF_cheeze_0004', { ...amp(1, 1, 1, 2), ...filt(4000) }, { slot: { transpose: 12, fine: -6, level: 0.35 } }),
    ],
    header: { fx: { ...chorus(0.4), ...room(0.35, 4) } },
  },
  {
    id: 'aurora-swell-pad',
    name: 'AURORA SWELL PAD',
    tag: 'factory, pad, grain, detune, lfo',
    slots: [
      slot(SAW, { grain: true, grainFreq: 22, grainDetune: 0.14, grainSpray: 6, ...amp(1.2, 1, 1, 2.5), ...filt(1800, 1.5, 'lp24'), velAmount: 0.4 }, {
        lfo2: { shape: 'sine', rate: 0.08 },
        routes: [{ source: 'lfo2', dest: 'cutoff', amount: 0.3 }],
      }),
      null,
      null,
    ],
    header: { fx: { ...chorus(0.3), ...room(0.45, 6) } },
  },
  {
    id: 'dusty-cassette-pad',
    name: 'DUSTY CASSETTE PAD',
    tag: 'factory, pad, lofi, epiano, lfo',
    slots: [
      slot('AKWF_epiano_0026', { ...amp(0.4, 1, 0.9, 1.5), ...filt(2200, 0.9), velAmount: 0.5 }, {
        lfo2: { shape: 'wander', rate: 0.7 },
        routes: [{ source: 'lfo2', dest: 'pitch', amount: 0.008 }],
      }),
      slot('AKWF_epiano_0026', { ...amp(0.5, 1, 0.9, 1.5), ...filt(1800) }, { slot: { fine: -12, level: 0.6 } }),
      null,
    ],
    header: { fx: { ...chorus(0.25, 0.4), ...room(0.3, 3) } },
  },
  {
    id: 'cathedral-choir-pad',
    name: 'CATHEDRAL CHOIR PAD',
    tag: 'factory, pad, choir, voice, vco',
    slots: [
      slot('AKWF_hvoice_0007', { ...amp(1.1, 1, 1, 3), ...filt(5000), velAmount: 0.4 }),
      slot('AKWF_hvoice_0023', { ...amp(1.3, 1, 1, 3), ...filt(4500) }, { slot: { fine: 7, level: 0.7 } }),
      slot('AKWF_hvoice_0023', { ...amp(1.5, 1, 1, 3), ...filt(4500) }, { slot: { fine: -8, level: 0.55 } }),
    ],
    header: { fx: { ...chorus(0.35), ...room(0.55, 8) } },
  },
  {
    id: 'sunken-organ-pad',
    name: 'SUNKEN ORGAN PAD',
    tag: 'factory, pad, organ, lfo',
    slots: [
      slot('AKWF_eorgan_0065', { ...amp(0.6, 1, 1, 2), ...filt(1500, 2, 'lp24'), velAmount: 0.4 }, {
        lfo2: { shape: 'triangle', rate: 0.12 },
        routes: [{ source: 'lfo2', dest: 'cutoff', amount: 0.25 }],
      }),
      slot('AKWF_eorgan_0065', { ...amp(0.6, 1, 1, 2), ...filt(1200) }, { slot: { transpose: -12, level: 0.5 } }),
      null,
    ],
    header: { fx: room(0.45, 6) },
  },
  {
    id: 'breathing-room-pad',
    name: 'BREATHING ROOM PAD',
    tag: 'factory, pad, fifths, lfo, vco',
    slots: [
      slot(TRI, { ...amp(0.9, 1, 1, 2.2), velAmount: 0.4 }, { lfo2: { shape: 'sine', rate: 0.18 }, routes: [{ source: 'lfo2', dest: 'volume', amount: 0.25 }] }),
      slot(TRI, { ...amp(1.2, 1, 1, 2.2) }, {
        slot: { transpose: 7, level: 0.55 },
        lfo2: { shape: 'sine', rate: 0.18, phase: 180 },
        routes: [{ source: 'lfo2', dest: 'volume', amount: 0.25 }],
      }),
      slot(SIN, { ...amp(1, 1, 1, 2.2) }, { slot: { transpose: -12, level: 0.5 } }),
    ],
    header: { fx: { ...chorus(0.3, 0.3), ...room(0.4, 5) } },
  },
  {
    id: 'nebula-drift-pad',
    name: 'NEBULA DRIFT PAD',
    tag: 'factory, pad, grain, loop, stereo',
    slots: [
      slot('AKWF_stereo_0054', { grain: true, grainMode: 'loop', grainFreq: 6, ...amp(1.4, 1, 1, 3), ...filt(5000), velAmount: 0.4 }, {
        lfo2: { shape: 'wander', rate: 0.25 },
        routes: [{ source: 'lfo2', dest: 'grainPos', amount: 0.6 }],
      }),
      null,
      null,
    ],
    header: { fx: room(0.5, 7) },
  },
  {
    id: 'spice-market-pad',
    name: 'SPICE MARKET PAD',
    tag: 'factory, pad, exotic, lfo',
    slots: [
      slot('AKWF_sinharm_0010', { ...amp(0.7, 1, 1, 2), ...filt(2200, 4), velAmount: 0.5 }, {
        lfo2: { shape: 'sine', rate: 0.15 },
        routes: [{ source: 'lfo2', dest: 'cutoff', amount: 0.25 }],
      }),
      slot('AKWF_oboe_0001', { ...amp(0.9, 1, 1, 2), ...filt(3000) }, { slot: { transpose: 7, level: 0.22 } }),
      null,
    ],
    header: { fx: { ...chorus(0.35), ...room(0.4, 5) } },
  },
  {
    id: 'polar-night-pad',
    name: 'POLAR NIGHT PAD',
    tag: 'factory, pad, slow, lfo, tempo',
    slots: [
      slot('AKWF_symetric_0015', { ...amp(1.5, 1, 1, 3), ...filt(700, 3, 'lp24'), velAmount: 0.3 }, {
        lfo2: { shape: 'triangle', sync: true, division: '2 BAR' },
        routes: [{ source: 'lfo2', dest: 'cutoff', amount: 0.35 }],
      }),
      slot(SAW, { ...amp(1.8, 1, 1, 3), ...filt(600, 2, 'lp24') }, { slot: { fine: 11, level: 0.5 } }),
      null,
    ],
    header: { fx: room(0.5, 8) },
  },
  {
    id: 'halo-rings-pad',
    name: 'HALO RINGS PAD',
    tag: 'factory, pad, fm, bell, vco',
    slots: [
      slot(SIN, { ...amp(0.6, 1, 1, 2.5), velAmount: 0.4 }, { routes: [{ source: 'vco2', dest: 'pitch', amount: 0.15 }] }),
      slot(SIN, { ...amp(2.5, 3, 0.3, 2) }, { slot: { audible: false, transpose: 12 } }),
      slot(SIN, { ...amp(0.8, 1, 1, 2.5) }, { slot: { transpose: 19, level: 0.18 } }),
    ],
    header: { fx: { ...chorus(0.3), ...room(0.5, 6) } },
  },
  {
    id: 'tidepool-pad',
    name: 'TIDEPOOL PAD',
    tag: 'factory, pad, grain, cloud, lfo',
    slots: [
      slot('AKWF_flute_0006', { ...cloud(12, 0.4, 0.25), ...amp(1, 1, 1, 2.5), velAmount: 0.4 }, {
        lfo2: { shape: 'sine', rate: 0.11 },
        routes: [{ source: 'lfo2', dest: 'grainVar', amount: 0.5 }],
      }),
      slot(SIN, { ...amp(1, 1, 1, 2.5) }, { slot: { transpose: -12, level: 0.45 } }),
      null,
    ],
    header: { fx: room(0.5, 6) },
  },
  {
    id: 'analog-heaven-pad',
    name: 'ANALOG HEAVEN PAD',
    tag: 'factory, pad, analog, vco, filter',
    slots: [
      slot(SAW, { ...amp(0.9, 1, 1, 2), ...filt(900, 2, 'lp24'), ...fenv(1.5, 1.5, 2, 0.4, 2), velAmount: 0.4 }),
      slot('AKWF_squ_0026', { ...amp(1, 1, 1, 2), ...filt(900, 2, 'lp24'), ...fenv(1.5, 1.5, 2, 0.4, 2) }, { slot: { fine: -9, level: 0.7 } }),
      slot(SAW, { ...amp(1, 1, 1, 2), ...filt(900, 2, 'lp24') }, { slot: { fine: 12, level: 0.6 } }),
    ],
    header: { fx: { ...chorus(0.45, 0.4), ...room(0.35, 4) } },
  },
  {
    id: 'honey-glaze-pad',
    name: 'HONEY GLAZE PAD',
    tag: 'factory, pad, warm, soft',
    slots: [
      slot('AKWF_clarinett_0013', { ...amp(0.7, 1, 1, 2), ...filt(2600), velAmount: 0.4 }),
      slot(SIN, { ...amp(0.8, 1, 1, 2) }, { slot: { transpose: -12, level: 0.5 } }),
      slot('AKWF_clarinett_0013', { ...amp(0.9, 1, 1, 2), ...filt(2600) }, { slot: { fine: 8, level: 0.6 } }),
    ],
    header: { fx: { ...chorus(0.3), ...room(0.35, 4) } },
  },
  {
    id: 'vapor-trail-pad',
    name: 'VAPOR TRAIL PAD',
    tag: 'factory, pad, delay, tempo, soft',
    slots: [
      slot('AKWF_vgsin_0005', { ...amp(0.5, 1, 1, 2.5), ...filt(4000), velAmount: 0.5 }, VIB(0.3, 0.004)),
      slot('AKWF_vgtri_0008', { ...amp(0.6, 1, 1, 2.5) }, { slot: { transpose: 12, level: 0.3 } }),
      null,
    ],
    header: { fx: { ...echo('1/4', 0.35, 0.55), ...room(0.45, 6) } },
  },
]

// ── keys ──────────────────────────────────────────────────────────────────
const KEYS: FactoryPatch[] = [
  {
    id: 'suitcase-keys',
    name: 'SUITCASE KEYS',
    tag: 'factory, keys, epiano, velocity, tremolo, vco',
    slots: [
      slot('AKWF_epiano_0044', { ...amp(0.002, 2.6, 0.15, 0.45), ...filt(3000), envKey: 0.4, velAmount: 0.9 }, {
        lfo2: { shape: 'sine', rate: 4.5, stereo: 180 },
        routes: [vel('cutoff', 0.35), { source: 'lfo2', dest: 'pan', amount: 0.5 }, { source: 'mod', dest: 'lfo2Amt', amount: 0 }],
      }),
      slot(SIN, { ...amp(0.001, 0.25, 0, 0.1) }, { slot: { transpose: 24, level: 0.18 } }),
      null,
    ],
    header: { fx: { ...chorus(0.15), ...room(0.18, 2) } },
  },
  {
    id: 'barking-reed-keys',
    name: 'BARKING REED KEYS',
    tag: 'factory, keys, epiano, velocity',
    slots: [slot('AKWF_epiano_0064', { ...amp(0.002, 1.6, 0.25, 0.3), ...filt(2400, 1.4), ...fenv(1.2, 0.001, 0.3, 0.2), envKey: 0.4 }, { routes: [vel('cutoff', 0.4)] }), null, null],
    header: { fx: { ...chorus(0.2), ...room(0.15) } },
  },
  {
    id: 'parlor-upright-piano',
    name: 'PARLOR UPRIGHT PIANO',
    tag: 'factory, keys, piano, velocity, vco',
    slots: [
      slot('AKWF_piano_0016', { ...amp(0.002, 3, 0, 0.45), ...filt(3200, 0.8), ...fenv(1, 0.001, 1.2, 0), envKey: 0.6, velAmount: 0.9 }, { routes: [vel('cutoff', 0.4)] }),
      slot('AKWF_piano_0029', { ...amp(0.002, 1.2, 0, 0.3), envKey: 0.6 }, { slot: { transpose: 12, fine: 3, level: 0.3 } }),
      null,
    ],
    header: { fx: room(0.2, 2.2) },
  },
  {
    id: 'toy-box-piano',
    name: 'TOY BOX PIANO',
    tag: 'factory, keys, toy, bell',
    slots: [
      slot('AKWF_piano_0002', { ...amp(0.001, 0.9, 0, 0.25), envKey: 0.5 }),
      slot(SIN, { ...amp(0.001, 0.5, 0, 0.2) }, { slot: { transpose: 24, fine: 14, level: 0.25 } }),
      null,
    ],
    header: { fx: room(0.2, 1.5) },
  },
  {
    id: 'tonewheel-tuesday-organ',
    name: 'TONEWHEEL TUESDAY ORGAN',
    tag: 'factory, keys, organ, drawbar, vco',
    slots: [
      slot('AKWF_eorgan_0007', { ...amp(0.005, 0.1, 1, 0.06) }, {
        lfo2: { shape: 'sine', rate: 6.5, stereo: 90 },
        routes: [{ source: 'lfo2', dest: 'pitch', amount: 0.004 }, { source: 'lfo2', dest: 'pan', amount: 0.3 }],
      }),
      slot('AKWF_eorgan_0055', { ...amp(0.005, 0.1, 1, 0.06) }, { slot: { transpose: 12, level: 0.55 } }),
      slot('AKWF_eorgan_0007', { ...amp(0.005, 0.1, 1, 0.06) }, { slot: { transpose: 19, level: 0.35 } }),
    ],
    header: { fx: { ...chorus(0.35, 5.5, 0.3), ...room(0.15) } },
  },
  {
    id: 'church-mouse-organ',
    name: 'CHURCH MOUSE ORGAN',
    tag: 'factory, keys, organ, pipe, vco',
    slots: [
      slot('AKWF_eorgan_0101', { ...amp(0.06, 0.1, 1, 0.6) }),
      slot('AKWF_eorgan_0137', { ...amp(0.08, 0.1, 1, 0.6) }, { slot: { transpose: -12, level: 0.5 } }),
      slot('AKWF_flute_0014', { ...amp(0.1, 0.1, 1, 0.6) }, { slot: { transpose: 12, level: 0.3 } }),
    ],
    header: { fx: room(0.55, 8) },
  },
  {
    id: 'funky-clav-keys',
    name: 'FUNKY CLAV KEYS',
    tag: 'factory, keys, clav, velocity, filter',
    slots: [
      slot('AKWF_clavinet_0010', { ...amp(0.001, 0.5, 0.2, 0.08), ...filt(900, 4, 'bandpass'), ...fenv(2.2, 0.001, 0.15, 0, 0.05) }, { routes: [vel('cutoff', 0.4)] }),
      slot('AKWF_clavinet_0027', { ...amp(0.001, 0.5, 0.2, 0.08) }, { slot: { level: 0.6 } }),
      null,
    ],
    header: { fx: room(0.1, 1) },
  },
  {
    id: 'harpsichord-heist',
    name: 'HARPSICHORD HEIST',
    tag: 'factory, keys, harpsichord, baroque, vco',
    slots: [
      slot('AKWF_pluckalgo_0004', { ...amp(0.001, 1.5, 0, 0.25), ...filt(6000), envKey: 0.5, velAmount: 0.3 }),
      slot('AKWF_pluckalgo_0001', { ...amp(0.001, 1.1, 0, 0.2), envKey: 0.5 }, { slot: { transpose: 12, fine: 4, level: 0.45 } }),
      null,
    ],
    header: { fx: room(0.25, 2.5) },
  },
  {
    id: 'celeste-crystal-keys',
    name: 'CELESTE CRYSTAL KEYS',
    tag: 'factory, keys, celesta, bell, vco',
    slots: [
      slot('AKWF_sinharm_0013', { ...amp(0.001, 1.8, 0, 0.6), envKey: 0.5 }),
      slot(SIN, { ...amp(0.001, 0.35, 0, 0.2) }, { slot: { transpose: 24, level: 0.3 } }),
      null,
    ],
    header: { fx: room(0.35, 3) },
  },
  {
    id: 'digital-tine-ep',
    name: 'DIGITAL TINE EP',
    tag: 'factory, keys, fm, epiano, vco',
    slots: [
      slot(SIN, { ...amp(0.001, 2.5, 0.1, 0.5), envKey: 0.4 }, {
        routes: [{ source: 'vco2', dest: 'pitch', amount: 0.25 }, { source: 'vco3', dest: 'pitch', amount: 0.05 }],
      }),
      slot(SIN, { ...amp(0.001, 1.2, 0.05, 0.4), velAmount: 1 }, { slot: { audible: false } }),
      slot(SIN, { ...amp(0.001, 0.08, 0, 0.05) }, { slot: { audible: false, transpose: 36, fine: 30 } }),
    ],
    header: { fx: { ...chorus(0.35), ...room(0.2) } },
  },
  {
    id: 'dorm-room-lofi-keys',
    name: 'DORM ROOM LOFI KEYS',
    tag: 'factory, keys, lofi, epiano, lfo',
    slots: [
      slot('AKWF_epiano_0034', { ...amp(0.003, 2, 0.2, 0.4), ...filt(1600, 1) }, {
        lfo2: { shape: 'wander', rate: 0.9 },
        routes: [{ source: 'lfo2', dest: 'pitch', amount: 0.01 }, { source: 'random', dest: 'pitch', amount: 0.004 }],
      }),
      null,
      null,
    ],
    header: { fx: { ...chorus(0.3, 0.5), ...room(0.25, 2) } },
  },
  {
    id: 'stage-chorus-keys',
    name: 'STAGE CHORUS KEYS',
    tag: 'factory, keys, epiano, chorus, velocity',
    slots: [slot('AKWF_epiano_0050', { ...amp(0.002, 2.4, 0.2, 0.5), ...filt(4000), envKey: 0.4 }, { routes: [vel('cutoff', 0.3)] }), null, null],
    header: { fx: { ...chorus(0.6, 0.8, 0.7), ...room(0.2) } },
  },
  {
    id: 'musette-accordion',
    name: 'MUSETTE ACCORDION',
    tag: 'factory, keys, accordion, reed, detune, vco',
    slots: [
      slot('AKWF_eorgan_0144', { ...amp(0.04, 0.1, 1, 0.15), ...filt(4000) }),
      slot('AKWF_eorgan_0144', { ...amp(0.04, 0.1, 1, 0.15), ...filt(4000) }, { slot: { fine: 14, level: 0.85 } }),
      slot('AKWF_eorgan_0144', { ...amp(0.04, 0.1, 1, 0.15), ...filt(4000) }, { slot: { fine: -14, level: 0.85 } }),
    ],
    header: { fx: room(0.15) },
  },
]

// ── plucks, mallets, bells ───────────────────────────────────────────────
const PLUCK: FactoryPatch[] = [
  {
    id: 'harp-strings-pluck',
    name: 'ANGEL HARP PLUCK',
    tag: 'factory, pluck, harp, velocity',
    slots: [slot('AKWF_pluckalgo_0002', { ...amp(0.002, 1.8, 0, 1), ...filt(4000), ...fenv(1, 0.001, 0.5, 0), filterKey: 0.5, envKey: 0.4 }, { routes: [vel('cutoff', 0.3)] }), null, null],
    header: { fx: room(0.35, 3.5) },
  },
  {
    id: 'nylon-serenade-pluck',
    name: 'NYLON SERENADE PLUCK',
    tag: 'factory, pluck, guitar, acoustic, velocity',
    slots: [slot('AKWF_aguitar_0003', { ...amp(0.002, 1.6, 0, 0.35), ...filt(2800, 0.9), ...fenv(1.2, 0.001, 0.35, 0), envKey: 0.5 }, { routes: [vel('cutoff', 0.35)] }), null, null],
    header: { fx: room(0.2, 2) },
  },
  {
    id: 'marimba-mojo-mallet',
    name: 'MARIMBA MOJO MALLET',
    tag: 'factory, mallet, marimba, vco',
    slots: [
      slot(SIN, { ...amp(0.001, 0.9, 0, 0.3), envKey: 0.6 }),
      // a tuned bar's fourth partial, gone almost at once
      slot(SIN, { ...amp(0.001, 0.07, 0, 0.05) }, { slot: { transpose: 24, level: 0.4 } }),
      slot(SIN, { ...amp(0.001, 0.03, 0, 0.03) }, { slot: { transpose: 40, level: 0.15 } }),
    ],
    header: { fx: room(0.2, 1.8) },
  },
  {
    id: 'vibes-at-night-mallet',
    name: 'VIBES AT NIGHT MALLET',
    tag: 'factory, mallet, vibraphone, tremolo, vco',
    slots: [
      slot(SIN, { ...amp(0.001, 3, 0, 1.2), envKey: 0.4 }, {
        lfo2: { shape: 'sine', rate: 5 },
        routes: [{ source: 'lfo2', dest: 'volume', amount: 0.3 }],
      }),
      slot(SIN, { ...amp(0.001, 0.6, 0, 0.4) }, { slot: { transpose: 24, level: 0.2 } }),
      null,
    ],
    header: { fx: room(0.3, 3) },
  },
  {
    id: 'kalimba-thumb-pluck',
    name: 'KALIMBA THUMB PLUCK',
    tag: 'factory, pluck, kalimba, vco',
    slots: [
      slot('AKWF_sinharm_0012', { ...amp(0.001, 1.2, 0, 0.4), envKey: 0.5 }),
      slot(SIN, { ...amp(0.001, 0.05, 0, 0.04) }, { slot: { transpose: 31, level: 0.3 } }),
      null,
    ],
    header: { fx: room(0.25, 2) },
  },
  {
    id: 'glass-harmonica-bell',
    name: 'GLASS HARMONICA BELL',
    tag: 'factory, bell, glass, fm, vco',
    slots: [
      slot(SIN, { ...amp(0.15, 2, 0.6, 1.5) }, { lfo1: VIB(4.5).lfo1, routes: [{ source: 'vco2', dest: 'pitch', amount: 0.06 }, ...VIB(4.5, 0.004).routes] }),
      slot(SIN, { ...amp(0.2, 2, 0.3, 1.5) }, { slot: { audible: false, transpose: 24 } }),
      slot('AKWF_sinharm_0007', { ...amp(0.2, 2, 0.5, 1.5) }, { slot: { transpose: 12, level: 0.2 } }),
    ],
    header: { fx: room(0.45, 5) },
  },
  {
    id: 'temple-gong-bell',
    name: 'TEMPLE GONG BELL',
    tag: 'factory, bell, ring, metallic, vco',
    slots: [
      slot(SIN, { ...amp(0.002, 6, 0, 3) }, { routes: [{ source: 'vco2', dest: 'volume', amount: -0.8 }] }),
      // a modulator off any harmonic: clangour
      slot(SIN, {}, { slot: { audible: false, transpose: 6, fine: 37 } }),
      slot(SIN, { ...amp(0.002, 4, 0, 3) }, { slot: { transpose: -12, level: 0.4 } }),
    ],
    header: { fx: room(0.5, 7) },
  },
  {
    id: 'music-box-ballerina',
    name: 'MUSIC BOX BALLERINA',
    tag: 'factory, bell, musicbox, fm, vco',
    slots: [
      slot(SIN, { ...amp(0.001, 1.4, 0, 0.8), envKey: 0.5 }, { routes: [{ source: 'vco2', dest: 'pitch', amount: 0.08 }] }),
      slot(SIN, { ...amp(0.001, 0.3, 0, 0.2) }, { slot: { audible: false, transpose: 12 } }),
      null,
    ],
    header: { fx: { ...echo('1/8', 0.15, 0.3), ...room(0.35, 3) } },
  },
  {
    id: 'synth-pluck-pop',
    name: 'POP CORN PLUCK',
    tag: 'factory, pluck, synth, delay, tempo',
    slots: [
      slot(SAW, { ...amp(0.001, 0.4, 0, 0.25), ...filt(500, 3, 'lp24'), ...fenv(4, 0.001, 0.2, 0, 0.2) }, { routes: [vel('cutoff', 0.25)] }),
      slot(SQU, { ...amp(0.001, 0.35, 0, 0.2), ...filt(1500) }, { slot: { transpose: 12, level: 0.3 } }),
      null,
    ],
    header: { fx: { ...echo('1/8.', 0.3, 0.45), ...room(0.2) } },
  },
  {
    id: 'dew-drop-pluck',
    name: 'DEW DROP PLUCK',
    tag: 'factory, pluck, grain, sync, water',
    slots: [
      slot(SIN, { ...SYNC, pitch: 12, ...amp(0.001, 0.35, 0, 0.3), ...fenv(0, 0.001, 0.25, 0, 0.1) }, { routes: formant('fenv', 1) }),
      null,
      null,
    ],
    header: { fx: { ...echo('1/16', 0.2, 0.3), ...room(0.4, 4) } },
  },
  {
    id: 'steel-drum-parade',
    name: 'STEEL DRUM PARADE',
    tag: 'factory, bell, steelpan, fm, vco',
    slots: [
      slot(SIN, { ...amp(0.002, 1.1, 0, 0.4), envKey: 0.3 }, { routes: [{ source: 'vco2', dest: 'pitch', amount: 0.12 }] }),
      slot(SIN, { ...amp(0.001, 0.5, 0.1, 0.3) }, { slot: { audible: false, transpose: 19 } }),
      slot(SIN, { ...amp(0.002, 0.6, 0, 0.3) }, { slot: { transpose: 12, level: 0.25 } }),
    ],
    header: { fx: room(0.2, 2) },
  },
]

// ── strings, winds, brass, voices ────────────────────────────────────────
const ORCH: FactoryPatch[] = [
  {
    id: 'cello-suite-bow',
    name: 'CELLO SUITE BOW',
    tag: 'factory, strings, cello, solo, wheel',
    slots: [slot('AKWF_cello_0006', { ...amp(0.12, 0.3, 0.9, 0.35), ...filt(3500, 1) }, { lfo1: WV.lfo1, routes: [...WV.vib, at('cutoff', 0.25)] }), null, null],
    header: { mono: true, glide: 0.05, fx: room(0.3, 3) },
  },
  {
    id: 'fiddle-fair-bow',
    name: 'COUNTY FAIR FIDDLE',
    tag: 'factory, strings, violin, solo',
    slots: [slot('AKWF_violin_0011', { ...amp(0.07, 0.2, 0.9, 0.25), ...filt(6000) }, VIB(5.6, 0.02)), null, null],
    header: { mono: true, glide: 0.03, fx: room(0.25, 2.5) },
  },
  {
    id: 'string-section',
    name: 'SILVER SCREEN STRINGS',
    tag: 'factory, strings, ensemble, vco',
    slots: [
      slot('AKWF_violin_0014', { ...amp(0.4, 1, 1, 1.2), ...filt(5000), velAmount: 0.5 }, VIB(5, 0.006)),
      slot('AKWF_violin_0009', { ...amp(0.5, 1, 1, 1.2), ...filt(5000) }, { slot: { fine: 10, level: 0.8 } }),
      slot('AKWF_cello_0003', { ...amp(0.5, 1, 1, 1.2), ...filt(3000) }, { slot: { transpose: -12, level: 0.55 } }),
    ],
    header: { fx: { ...chorus(0.3), ...room(0.4, 4.5) } },
  },
  {
    id: 'pizzicato-prance',
    name: 'PIZZICATO PRANCE',
    tag: 'factory, strings, pizzicato, pluck',
    slots: [slot('AKWF_violin_0010', { ...amp(0.002, 0.35, 0, 0.25), ...filt(3000), ...fenv(1, 0.001, 0.15, 0), envKey: 0.4 }, { routes: [vel('cutoff', 0.3)] }), null, null],
    header: { fx: room(0.35, 3) },
  },
  {
    id: 'flute-of-pan',
    name: 'FLUTE OF PAN',
    tag: 'factory, winds, flute, breath, grain',
    slots: [
      slot('AKWF_flute_0003', { ...amp(0.08, 0.2, 0.9, 0.25), ...filt(6000) }, { lfo1: WV.lfo1, routes: WV.vib }),
      // breath: the same flute, sprayed into noise and filtered high
      slot('AKWF_flute_0003', { grain: true, grainFreq: 40, grainSpray: 300, grainTuneRnd: 0.3, ...amp(0.03, 0.15, 0.3, 0.15), ...filt(3000, 1, 'highpass') }, { slot: { level: 0.25 } }),
      null,
    ],
    header: { mono: true, glide: 0.03, fx: room(0.3, 3) },
  },
  {
    id: 'clarinet-noir',
    name: 'CLARINET NOIR',
    tag: 'factory, winds, clarinet, wheel',
    slots: [slot('AKWF_clarinett_0005', { ...amp(0.04, 0.2, 0.9, 0.2), ...filt(3800), velAmount: 0.7 }, { lfo1: WV.lfo1, routes: [...WV.vib, vel('cutoff', 0.3)] }), null, null],
    header: { mono: true, glide: 0.02, fx: room(0.3, 3) },
  },
  {
    id: 'french-horn-dusk',
    name: 'FRENCH HORN DUSK',
    tag: 'factory, brass, horn, vco',
    slots: [
      slot(SAW, { ...amp(0.09, 0.4, 0.85, 0.35), ...filt(700, 0.8, 'lp24'), ...fenv(1.1, 0.08, 0.5, 0.4), velAmount: 0.7 }, { routes: [vel('cutoff', 0.3)] }),
      // a few cents off the saw: in tune they'd sit in one phase, and partly cancel
      slot(TRI, { ...amp(0.08, 0.4, 0.85, 0.35) }, { slot: { level: 0.6, fine: 4 } }),
      null,
    ],
    header: { fx: room(0.35, 4) },
  },
  {
    id: 'fanfare-trumpet',
    name: 'ROYAL FANFARE BRASS',
    tag: 'factory, brass, trumpet, velocity, vco',
    slots: [
      slot(SAW, { ...amp(0.03, 0.3, 0.8, 0.2), ...filt(1100, 1.2, 'lp24'), ...fenv(2, 0.03, 0.25, 0.45), velAmount: 0.8 }, {
        routes: [vel('cutoff', 0.35), { source: 'fenv', dest: 'pitch', amount: -0.01 }],
      }),
      slot(SAW, { ...amp(0.03, 0.3, 0.8, 0.2), ...filt(1100, 1.2, 'lp24'), ...fenv(2, 0.03, 0.25, 0.45) }, { slot: { fine: 7, level: 0.8 } }),
      null,
    ],
    header: { fx: room(0.3, 3) },
  },
  {
    id: 'monk-chant-choir',
    name: 'MONASTERY CHANT CHOIR',
    tag: 'factory, choir, voice, vco',
    slots: [
      slot('AKWF_hvoice_0076', { ...amp(0.5, 1, 1, 1.8), ...filt(3000), velAmount: 0.4 }),
      slot('AKWF_hvoice_0076', { ...amp(0.6, 1, 1, 1.8), ...filt(2500) }, { slot: { transpose: -12, level: 0.6 } }),
      slot('AKWF_hvoice_0076', { ...amp(0.7, 1, 1, 1.8), ...filt(3000) }, { slot: { fine: 10, level: 0.55 } }),
    ],
    header: { fx: room(0.55, 7) },
  },
  {
    id: 'angel-ooh-choir',
    name: 'ANGEL OOH CHOIR',
    tag: 'factory, choir, voice, grain, cloud',
    slots: [
      slot('AKWF_hvoice_0085', { ...cloud(10, 0.4, 0.18), ...amp(0.7, 1, 1, 2.2), ...filt(5000), velAmount: 0.4 }),
      slot('AKWF_hvoice_0007', { ...amp(0.8, 1, 1, 2.2) }, { slot: { transpose: 12, fine: 6, level: 0.3 } }),
      null,
    ],
    header: { fx: { ...chorus(0.3), ...room(0.55, 7) } },
  },
  {
    id: 'yodel-box-voice',
    name: 'YODEL BOX VOICE',
    tag: 'factory, voice, grain, sync, wheel',
    slots: [
      slot('AKWF_hvoice_0004', { ...SYNC, pitch: 3, ...amp(0.03, 0.3, 0.9, 0.25) }, {
        lfo1: WV.lfo1,
        routes: [...formant('mod', 0.8), ...formant('aftertouch', 0.4), ...WV.vib.slice(0, 1)],
      }),
      null,
      null,
    ],
    header: { mono: true, glide: 0.08, fx: room(0.3, 3) },
  },
]

// ── grains: Granulator III on single cycles ──────────────────────────────
const GRAIN: FactoryPatch[] = [
  {
    id: 'pulsar-star-synth',
    name: 'PULSAR STAR SYNTH',
    tag: 'factory, grain, sync, pulsar, stereo',
    slots: [
      slot(SAW, { ...SYNC, pitch: 12, grainStereo: 0.06, ...amp(0.01, 0.4, 0.8, 0.5), ...filt(8000) }),
      slot(SQU, { ...SYNC, pitch: 19, ...amp(0.01, 0.4, 0.8, 0.5), ...filt(6000) }, { slot: { level: 0.5 } }),
      null,
    ],
    header: { fx: { ...chorus(0.25), ...room(0.25) } },
  },
  {
    id: 'formant-surfer-lead',
    name: 'FORMANT SURFER LEAD',
    tag: 'factory, grain, sync, lead, lfo',
    slots: [
      slot(SAW, { ...SYNC, ...amp(0.01, 0.3, 0.9, 0.25) }, {
        lfo2: { shape: 'triangle', rate: 0.35 },
        routes: [...formant('lfo2', 0.9), ...formant('aftertouch', 0.5)],
      }),
      null,
      null,
    ],
    header: { mono: true, glide: 0.05, fx: { ...echo('1/8.', 0.2, 0.35), ...room(0.2) } },
  },
  {
    id: 'spray-paint-texture',
    name: 'SPRAY PAINT TEXTURE',
    tag: 'factory, grain, texture, stereo, noise',
    slots: [slot(SAW, { grain: true, grainFreq: 30, grainSpray: 25, grainSpraySlope: 3, ...amp(0.4, 1, 1, 1.5), ...filt(5000), velAmount: 0.5 }), null, null],
    header: { fx: room(0.45, 5) },
  },
  {
    id: 'shattered-glass-texture',
    name: 'SHATTERED GLASS TEXTURE',
    tag: 'factory, grain, cloud, texture, glass',
    slots: [slot('AKWF_sinharm_0016', { ...cloud(14, 0.9, 12), ...amp(0.05, 1, 0.8, 2), ...filt(9000), velAmount: 0.5 }), null, null],
    header: { fx: room(0.5, 6) },
  },
  {
    id: 'hummingbird-swarm',
    name: 'HUMMINGBIRD SWARM',
    tag: 'factory, grain, texture, birds, random',
    slots: [slot('AKWF_birds_0012', { grain: true, grainFreq: 16, grainFreqRnd: 0.35, grainTuneRnd: 0.12, grainStereo: 0.4, ...amp(0.2, 1, 1, 1.2), velAmount: 0.5 }), null, null],
    header: { fx: room(0.35, 3) },
  },
  {
    id: 'tape-stutter-loop',
    name: 'TAPE STUTTER LOOP',
    tag: 'factory, grain, loop, glitch, stereo',
    slots: [slot('AKWF_snippet_0031', { grain: true, grainMode: 'loop', grainFreq: 7, grainReverse: 0.5, grainVariation: 0.4, grainVarSize: 7, ...amp(0.005, 0.5, 0.9, 0.3), ...filt(7000) }), null, null],
    header: { fx: { ...echo('1/16', 0.2, 0.3), ...room(0.2) } },
  },
  {
    id: 'grain-fm-bell',
    name: 'GRAIN FM BELLWORKS',
    tag: 'factory, grain, fm, bell',
    slots: [
      slot(SIN, { grain: true, grainFreq: 24, grainFm: true, grainFmFreq: 261.6, grainFmKey: 1, grainFmAmount: 40, ...amp(0.002, 2.4, 0, 1.4), envKey: 0.4 }),
      slot(SIN, { ...amp(0.002, 2.4, 0, 1.4) }, { slot: { level: 0.5 } }),
      null,
    ],
    header: { fx: room(0.45, 5) },
  },
  {
    id: 'supersaw-from-one',
    name: 'SUPERSAW FROM ONE',
    tag: 'factory, grain, detune, pad, stereo',
    slots: [slot(SAW, { grain: true, grainFreq: 24, grainDetune: 0.22, grainSpray: 4, grainTuneRnd: 0.05, ...amp(0.02, 0.5, 0.9, 0.8), ...filt(6500, 1, 'lp24') }), null, null],
    header: { fx: { ...chorus(0.25), ...room(0.3, 3.5) } },
  },
  {
    id: 'wind-chimes-cloud',
    name: 'WIND CHIMES CLOUD',
    tag: 'factory, grain, cloud, bell, sparse',
    slots: [slot(SIN, { ...cloud(16, 1, 12, { grainVarVol: 0, grainFreq: 3 }), volume: 1.5, ...amp(0.01, 1, 1, 3), velAmount: 0.4 }), null, null],
    header: { fx: room(0.6, 8) },
  },
  {
    id: 'geiger-counter-fx',
    name: 'GEIGER COUNTER FX',
    tag: 'factory, grain, fx, glitch, void',
    slots: [slot('AKWF_raw_0003', { grain: true, grainFreq: 60, grainAmpMode: 'void', grainAmp: 0.35, grainVoid: 0, volume: 1.5, ...amp(0.001, 0.5, 1, 0.3), ...filt(400, 0.7, 'hp12') }), null, null],
    header: { fx: room(0.15) },
  },
  {
    id: 'robot-choir-sync',
    name: 'ROBOT CHOIR SYNC',
    tag: 'factory, grain, sync, voice, choir',
    slots: [
      slot('AKWF_hvoice_0023', { ...SYNC, pitch: 5, ...amp(0.4, 1, 1, 1.5), velAmount: 0.4 }, {
        lfo2: { shape: 'sine', rate: 0.2 },
        routes: formant('lfo2', 0.3),
      }),
      slot('AKWF_hvoice_0023', { ...SYNC, pitch: 5, ...amp(0.5, 1, 1, 1.5) }, { slot: { fine: 11, level: 0.7 } }),
      slot('AKWF_hvoice_0023', { ...SYNC, pitch: 5, ...amp(0.6, 1, 1, 1.5) }, { slot: { fine: -11, level: 0.7 } }),
    ],
    header: { fx: { ...chorus(0.4), ...room(0.45, 5) } },
  },
  {
    id: 'drone-of-the-deep',
    name: 'DRONE OF THE DEEP',
    tag: 'factory, grain, drone, cloud, dark',
    slots: [
      slot('AKWF_dbass_0047', { ...cloud(12, 0.6, 0.35), ...amp(2, 1, 1, 4), ...filt(900, 2, 'lp24'), velAmount: 0.2 }, {
        lfo2: { shape: 'smooth', rate: 0.07 },
        routes: [{ source: 'lfo2', dest: 'cutoff', amount: 0.3 }],
      }),
      slot(SIN, { ...amp(2, 1, 1, 4) }, { slot: { transpose: -12, level: 0.5 } }),
      null,
    ],
    header: { fx: room(0.55, 9) },
  },
  {
    id: 'insect-orchestra-fx',
    name: 'INSECT ORCHESTRA FX',
    tag: 'factory, grain, fx, birds, fm',
    slots: [
      slot('AKWF_birds_0005', { grain: true, grainFreq: 18, grainFreqRnd: 0.7, grainFm: true, grainFmFreq: 37, grainFmAmount: 120, grainStereo: 0.5, volume: 1.2, ...amp(0.1, 1, 1, 1), ...filt(900, 1.5, 'hp12') }),
      null,
      null,
    ],
    header: { fx: room(0.35, 3) },
  },
  {
    id: 'frozen-lake-pad',
    name: 'FROZEN LAKE PAD',
    tag: 'factory, grain, pad, cloud, slow',
    slots: [slot('AKWF_vgtri_0002', { ...cloud(9, 0.3, 0.15, { grainFreq: 6 }), ...amp(2.5, 1, 1, 4), ...filt(4500), velAmount: 0.3 }), null, null],
    header: { fx: room(0.6, 9) },
  },
  {
    id: 'rainmaker-texture',
    name: 'RAINMAKER TEXTURE',
    tag: 'factory, grain, texture, water, random',
    slots: [
      slot('AKWF_pluckalgo_0005', { grain: true, grainFreq: 9, grainSpray: 180, grainTuneRnd: 0.5, grainAmp: 0.8, grainStereo: 0.7, volume: 1.5, ...amp(0.3, 1, 1, 1.5), ...filt(700, 0.8, 'hp12') }),
      null,
      null,
    ],
    header: { fx: room(0.45, 5) },
  },
  {
    id: 'octave-shimmer-pad',
    name: 'OCTAVE SHIMMER PAD',
    tag: 'factory, grain, pad, shimmer, cloud',
    slots: [
      slot('AKWF_blended_0033', { ...amp(1, 1, 1, 3), ...filt(3000), velAmount: 0.3 }),
      slot('AKWF_blended_0033', { ...cloud(10, 0.7, 0.2), ...amp(2.2, 1, 1, 4), ...filt(9000, 0.7, 'hp12') }, { slot: { transpose: 12, level: 0.55 } }),
      slot('AKWF_blended_0033', { ...cloud(8, 0.7, 0.2), ...amp(3.5, 1, 1, 4) }, { slot: { transpose: 24, level: 0.25 } }),
    ],
    header: { fx: room(0.6, 9) },
  },
  {
    id: 'zap-gun-fx',
    name: 'ZAP GUN FX',
    tag: 'factory, grain, sync, fx, zap',
    slots: [slot(SQU, { ...SYNC, ...amp(0.001, 0.35, 0, 0.1), ...fenv(0, 0.001, 0.3, 0, 0.1) }, { routes: [{ source: 'fenv', dest: 'pitch', amount: 2 }] }), null, null],
    header: { fx: room(0.2) },
  },
  {
    id: 'pipe-dream-organ',
    name: 'PIPE DREAM ORGAN',
    tag: 'factory, grain, sync, organ',
    slots: [
      slot(TRI, { ...SYNC, pitch: 12, ...amp(0.05, 0.1, 1, 0.4) }),
      slot(SIN, { ...amp(0.05, 0.1, 1, 0.4) }, { slot: { transpose: -12, level: 0.5 } }),
      slot(TRI, { ...SYNC, pitch: 24, ...amp(0.08, 0.1, 1, 0.4) }, { slot: { transpose: 12, level: 0.25 } }),
    ],
    header: { fx: room(0.45, 6) },
  },
  {
    id: 'warp-drive-fx',
    name: 'WARP DRIVE FX',
    tag: 'factory, grain, fx, lfo, sci-fi',
    slots: [
      slot('AKWF_fmsynth_0046', { grain: true, grainFreq: 14, ...amp(0.5, 1, 1, 2) }, {
        lfo1: { shape: 'sawtooth', rate: 0.4 },
        lfo2: { shape: 'sine', rate: 0.05 },
        routes: [{ source: 'lfo1', dest: 'grainSize', amount: 0.6 }, { source: 'lfo2', dest: 'lfo1Rate', amount: 0.6 }],
      }),
      null,
      null,
    ],
    header: { fx: { ...echo('1/8', 0.3, 0.5), ...room(0.4, 5) } },
  },
  {
    id: 'liquid-mercury-lead',
    name: 'LIQUID MERCURY LEAD',
    tag: 'factory, grain, lead, fm, liquid',
    slots: [
      slot(TRI, { grain: true, grainFreq: 32.7, grainFm: true, grainFmFreq: 65.4, grainFmKey: 1, grainFmAmount: 25, ...amp(0.02, 0.3, 0.9, 0.3) }, {
        lfo2: { shape: 'sine', rate: 0.9 },
        routes: [{ source: 'lfo2', dest: 'grainSkew', amount: 0.6 }, at('grainSkew', -0.5)],
      }),
      null,
      null,
    ],
    header: { mono: true, glide: 0.07, fx: { ...echo('1/4', 0.2, 0.4), ...room(0.25) } },
  },
]

// ── FM, ring modulation and VCO tricks ───────────────────────────────────
const VCO: FactoryPatch[] = [
  {
    id: 'metallic-fm-clang',
    name: 'METALLIC FM CLANG',
    tag: 'factory, fm, bell, metallic, vco',
    slots: [
      slot(SIN, { ...amp(0.001, 2.5, 0, 1.5), envKey: 0.4 }, { routes: [{ source: 'vco2', dest: 'pitch', amount: 0.3 }] }),
      // √2 above: no harmonic of the carrier
      slot(SIN, { ...amp(0.001, 1.6, 0, 1) }, { slot: { audible: false, transpose: 6 } }),
      null,
    ],
    header: { fx: room(0.35, 4) },
  },
  {
    id: 'ring-a-ding-keys',
    name: 'RING-A-DING KEYS',
    tag: 'factory, ring, keys, vco',
    slots: [
      slot('AKWF_epiano_0024', { ...amp(0.002, 1.8, 0.1, 0.4) }, { routes: [{ source: 'vco2', dest: 'volume', amount: -0.6 }] }),
      slot(SIN, {}, { slot: { audible: false, transpose: 12, fine: 9 } }),
      null,
    ],
    header: { fx: { ...chorus(0.2), ...room(0.25) } },
  },
  {
    id: 'cross-mod-growl',
    name: 'CROSS-MOD GROWL',
    tag: 'factory, fm, growl, mono, vco',
    slots: [
      slot(SAW, { ...amp(0.005, 0.3, 0.9, 0.15), ...filt(2500, 2, 'lp24') }, { routes: [{ source: 'vco2', dest: 'pitch', amount: 0.2 }, { source: 'mod', dest: 'cutoff', amount: 0.4 }] }),
      slot(SQU, { ...amp(0.005, 0.3, 0.9, 0.15) }, { slot: { audible: false, transpose: -12 } }),
      null,
    ],
    header: { mono: true, glide: 0.04 },
  },
  {
    id: 'sideband-synth',
    name: 'SIDEBAND SATELLITE',
    tag: 'factory, ring, fx, inharmonic, vco',
    slots: [
      slot(TRI, { ...amp(0.01, 0.5, 0.8, 0.6) }, { routes: [{ source: 'vco2', dest: 'volume', amount: -1 }] }),
      // a modulator that stays on one note while you play: every key its own clang
      slot(SIN, {}, { slot: { audible: false, track: false, fixedNote: 70 } }),
      null,
    ],
    header: { fx: { ...echo('1/8', 0.25, 0.4), ...room(0.3) } },
  },
  {
    id: 'octave-stack-synth',
    name: 'OCTAVE STACK SYNTH',
    tag: 'factory, vco, stack, organ',
    slots: [
      slot(TRI, { ...amp(0.01, 0.3, 0.9, 0.4) }),
      slot(TRI, { ...amp(0.01, 0.3, 0.9, 0.4) }, { slot: { transpose: -12, level: 0.7 } }),
      slot(TRI, { ...amp(0.01, 0.3, 0.9, 0.4) }, { slot: { transpose: 12, level: 0.5 } }),
    ],
    header: { fx: { ...chorus(0.3), ...room(0.2) } },
  },
  {
    id: 'fifth-element-lead',
    name: 'POWER FIFTH LEAD',
    tag: 'factory, vco, lead, fifths, mono',
    slots: [
      slot(SAW, { ...amp(0.005, 0.3, 0.9, 0.2), ...filt(4200, 1.3, 'lp24') }, { lfo1: WV.lfo1, routes: WV.vib }),
      slot(SAW, { ...amp(0.005, 0.3, 0.9, 0.2), ...filt(4200, 1.3, 'lp24') }, { slot: { transpose: 7, fine: 3, level: 0.65 } }),
      null,
    ],
    header: { mono: true, glide: 0.05, fx: { ...echo('1/8.', 0.2, 0.3), ...room(0.15) } },
  },
  {
    id: 'phase-whisper-pad',
    name: 'PHASE WHISPER PAD',
    tag: 'factory, vco, pad, phasing',
    slots: [
      slot('AKWF_gapsaw_0001', { ...amp(0.8, 1, 1, 2), ...filt(3500), velAmount: 0.4 }),
      // a cent apart: the two drift through each other every second or so
      slot('AKWF_gapsaw_0001', { ...amp(0.8, 1, 1, 2), ...filt(3500) }, { slot: { fine: 1.5 } }),
      null,
    ],
    header: { fx: room(0.45, 5) },
  },
  {
    id: 'audio-rate-wobble',
    name: 'AUDIO RATE WOBBLE',
    tag: 'factory, lfo, ratio, fm, filter',
    slots: [
      slot(SAW, { ...amp(0.005, 0.3, 0.9, 0.3), ...filt(1200, 5, 'lp24') }, {
        // LFO 2 at half the note's frequency: the filter moves at audio rate, in tune
        lfo2: { shape: 'sine', ratioMode: true, ratio: 0.5 },
        routes: [{ source: 'lfo2', dest: 'cutoff', amount: 0.35 }, { source: 'mod', dest: 'lfo2Amt', amount: -0.8 }],
      }),
      null,
      null,
    ],
    header: { fx: room(0.2) },
  },
  {
    id: 'subharmonic-monster-bass',
    name: 'SUBHARMONIC MONSTER BASS',
    tag: 'factory, vco, bass, sub, mono',
    slots: [
      slot(SAW, { ...amp(0.004, 0.4, 0.9, 0.15), ...filt(1400, 2.5, 'lp24'), ...fenv(1.5, 0.001, 0.3, 0.2) }),
      slot(SQU, { ...amp(0.004, 0.4, 0.9, 0.15), ...filt(500) }, { slot: { transpose: -12, level: 0.6 } }),
      slot(SIN, { ...amp(0.004, 0.4, 1, 0.15) }, { slot: { transpose: -24, level: 0.5 } }),
    ],
    header: { mono: true, glide: 0.06 },
  },
]

// ── chip ──────────────────────────────────────────────────────────────────
const CHIP: FactoryPatch[] = [
  {
    id: 'octave-hop-chip',
    name: 'OCTAVE HOP CHIP',
    tag: 'factory, chip, arp, tempo, lfo',
    slots: [
      slot('AKWF_vgsqu_0007', { pitch: 6, ...amp(0.001, 0.3, 0.9, 0.1) }, {
        // a square LFO a sixteenth long, ± a tritone around +6: the note, then its octave
        lfo2: { shape: 'square', sync: true, division: '1/16' },
        routes: [{ source: 'lfo2', dest: 'pitch', amount: 0.5 }],
      }),
      null,
      null,
    ],
    header: { fx: echo('1/8', 0.15, 0.2) },
  },
  {
    id: 'pocket-console-pulse',
    name: 'POCKET CONSOLE PULSE',
    tag: 'factory, chip, lead, pulse',
    slots: [slot('AKWF_vgsqu_0011', { ...amp(0.001, 0.4, 0.7, 0.06) }), null, null],
    header: { mono: true, fx: echo('1/16', 0.12, 0.2) },
  },
  {
    id: 'chip-triangle-bass',
    name: 'CARTRIDGE TRIANGLE BASS',
    tag: 'factory, chip, bass, mono',
    slots: [slot('AKWF_tri4bit', { ...amp(0.001, 0.2, 1, 0.04) }), null, null],
    header: { mono: true },
  },
  {
    id: 'coin-collect-fx',
    name: 'COIN COLLECT FX',
    tag: 'factory, chip, fx, pitch',
    slots: [
      slot('AKWF_vgsqu_0015', { ...amp(0.001, 0.5, 0, 0.1), ...fenv(0, 0.001, 0.07, 1, 0.05) }, {
        // up a fourth after a moment, as the coin lands
        routes: [{ source: 'fenv', dest: 'pitch', amount: -0.42 }],
      }),
      null,
      null,
    ],
    header: { fx: room(0.12) },
  },
  {
    id: 'power-up-fx',
    name: 'POWER-UP SWEEP FX',
    tag: 'factory, chip, fx, lfo',
    slots: [
      slot('AKWF_vgtri_0015', { ...amp(0.001, 0.8, 0, 0.1) }, {
        lfo2: { shape: 'sawtooth', rate: 6 },
        lfo1: { shape: 'rampDown', rate: 1.2, phase: 0 },
        routes: [{ source: 'lfo2', dest: 'pitch', amount: 0.3 }, { source: 'lfo1', dest: 'pitch', amount: -0.6 }],
      }),
      null,
      null,
    ],
  },
  {
    id: 'boss-battle-lead',
    name: 'BOSS BATTLE LEAD',
    tag: 'factory, chip, lead, detune, vco',
    slots: [
      slot('AKWF_oscchip_0003', { ...amp(0.001, 0.3, 0.85, 0.15) }, VIB(6.5, 0.012)),
      slot('AKWF_oscchip_0003', { ...amp(0.001, 0.3, 0.85, 0.15) }, { slot: { fine: 12, level: 0.7 } }),
      null,
    ],
    header: { mono: true, glide: 0.03, fx: echo('1/8', 0.2, 0.3) },
  },
  {
    id: 'lo-bit-lullaby',
    name: 'LO-BIT LULLABY',
    tag: 'factory, chip, soft, delay',
    slots: [slot('AKWF_sin4bit', { ...amp(0.02, 0.6, 0.6, 0.6) }, VIB(5, 0.01)), null, null],
    header: { fx: { ...echo('1/4', 0.3, 0.4), ...room(0.3) } },
  },
]

// ── effects and drones ───────────────────────────────────────────────────
const FX: FactoryPatch[] = [
  {
    id: 'ufo-landing-fx',
    name: 'UFO LANDING FX',
    tag: 'factory, fx, sci-fi, lfo, glide',
    slots: [
      slot(SIN, { ...amp(0.2, 1, 1, 1.5) }, {
        lfo1: { shape: 'sine', rate: 7 },
        lfo2: { shape: 'triangle', rate: 0.15 },
        routes: [{ source: 'lfo1', dest: 'pitch', amount: 0.15 }, { source: 'lfo2', dest: 'lfo1Rate', amount: 0.4 }],
      }),
      slot(TRI, { ...amp(0.3, 1, 1, 1.5) }, { slot: { transpose: 12, fine: 20, level: 0.35 } }),
      null,
    ],
    header: { mono: true, glide: 0.6, fx: { ...echo('1/8.', 0.3, 0.5), ...room(0.4, 5) } },
  },
  {
    id: 'sea-of-sines-drone',
    name: 'SEA OF SINES DRONE',
    tag: 'factory, drone, vco, lfo, slow',
    slots: [
      slot(SIN, { ...amp(2.5, 1, 1, 4) }, { lfo2: { shape: 'sine', rate: 0.07 }, routes: [{ source: 'lfo2', dest: 'volume', amount: 0.3 }] }),
      slot(SIN, { ...amp(3, 1, 1, 4) }, { slot: { transpose: 7, level: 0.7 }, lfo2: { shape: 'sine', rate: 0.11 }, routes: [{ source: 'lfo2', dest: 'volume', amount: 0.4 }] }),
      slot(SIN, { ...amp(3.5, 1, 1, 4) }, { slot: { transpose: 19, level: 0.4 }, lfo2: { shape: 'sine', rate: 0.05 }, routes: [{ source: 'lfo2', dest: 'volume', amount: 0.5 }] }),
    ],
    header: { fx: { ...chorus(0.4, 0.2), ...room(0.6, 9) } },
  },
  {
    id: 'alarm-clock-fx',
    name: 'ALARM CLOCK FX',
    tag: 'factory, fx, alarm, lfo',
    slots: [
      slot('AKWF_squ_0054', { ...amp(0.001, 0.2, 1, 0.05) }, {
        lfo2: { shape: 'square', rate: 9 },
        routes: [{ source: 'lfo2', dest: 'volume', amount: 0.9 }],
      }),
      null,
      null,
    ],
  },
  {
    id: 'wind-tunnel-texture',
    name: 'WIND TUNNEL TEXTURE',
    tag: 'factory, fx, texture, noise, grain',
    slots: [
      slot('AKWF_snippet_0016', { grain: true, grainFreq: 50, grainSpray: 2000, grainTuneRnd: 0.9, grainStereo: 0.9, volume: 1.5, ...amp(1.2, 1, 1, 2), ...filt(2400, 1.5, 'lp12') }, {
        lfo2: { shape: 'smooth', rate: 0.2 },
        routes: [{ source: 'lfo2', dest: 'cutoff', amount: 0.4 }],
      }),
      null,
      null,
    ],
    header: { fx: room(0.4, 5) },
  },
  {
    id: 'deep-space-drone',
    name: 'DEEP SPACE DRONE',
    tag: 'factory, drone, ring, grain, dark',
    slots: [
      slot('AKWF_overtone_0011', { ...cloud(10, 0.5, 0.3), ...amp(3, 1, 1, 5), ...filt(2500, 1.5), velAmount: 0.2 }, {
        routes: [{ source: 'vco2', dest: 'volume', amount: -0.5 }],
      }),
      slot(SIN, {}, { slot: { audible: false, transpose: -5, fine: 4 } }),
      slot(SIN, { ...amp(3, 1, 1, 5) }, { slot: { transpose: -12, level: 0.5 } }),
    ],
    header: { fx: room(0.6, 10) },
  },
  {
    id: 'broken-radio-fx',
    name: 'BROKEN RADIO FX',
    tag: 'factory, fx, radio, voice, grain',
    slots: [
      slot('AKWF_hvoice_0054', { grain: true, grainFreq: 30, grainAmpMode: 'void', grainAmp: 0.25, grainVoid: 0.2, volume: 1.5, ...amp(0.01, 0.5, 1, 0.3), ...filt(1500, 1.2, 'bandpass') }, {
        lfo2: { shape: 'random', rate: 3 },
        routes: [{ source: 'lfo2', dest: 'cutoff', amount: 0.3 }],
      }),
      null,
      null,
    ],
    header: { fx: room(0.15) },
  },
]

export const FACTORY_PATCHES_MORE: FactoryPatch[] = [...BASS, ...LEAD, ...PAD, ...KEYS, ...PLUCK, ...ORCH, ...GRAIN, ...VCO, ...CHIP, ...FX]
