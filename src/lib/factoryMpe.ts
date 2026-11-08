/**
 * What the MPE surfaces do to each built-in patch (only while MPE is on: off, the patches play as they always did).
 *
 * - SLIDE (up / down the key) is the patch's timbre: the filter opening, a grain-sync formant moving, a cloud spreading,
 *   a texture's place in its sample, another VCO's layer coming in (a drawbar), an FM modulator drifting a hair off
 *   its ratio (a shimmer), or, where nothing else fits, the space around it.
 * - PRESS (pressure into the held key) is the playing: a gentle swell, the vibrato a wheel would bring in, a filter
 *   or a wobble pushed further, a bow or a bellows leaned on, a bell blooming into its room.
 * - STRIKE (how hard the key is hit) brightens the filtered patches that don't already follow velocity.
 * LIFT (the release velocity) isn't read by SSB at all: nothing happens on a key's release beyond its envelope.
 *
 * Amounts are a route's (the destination's scale): cutoff 5 octaves, resonance 10 Q, volume ×(1 + x), pitch 12 st,
 * grainSize 24 st, grainDetune 12 st, grainPos half the clip. A slide rests wherever the finger lands (often mid-key),
 * so its amounts are kept small enough that the patch sounds itself there; a press starts from nothing.
 */
import type { ModDest, MpeBinding, MpeSurface, Patch } from '../types'

const on = (surface: MpeSurface, dest: ModDest, amount: number, slots?: number[]): MpeBinding =>
  slots ? { surface, dest, amount, slots } : { surface, dest, amount }
const press = (dest: ModDest, amount: number, slots?: number[]) => on('press', dest, amount, slots)
const slide = (dest: ModDest, amount: number, slots?: number[]) => on('slide', dest, amount, slots)
const strike = (dest: ModDest, amount: number, slots?: number[]) => on('strike', dest, amount, slots)
/** grain sync: PITCH moves the formant, an opposite GRAIN route half as much holds the note (lib/factoryPatches.ts) */
const formant = (surface: MpeSurface, amount: number, slots?: number[]) => [
  on(surface, 'pitch', amount, slots),
  on(surface, 'grainSize', -amount / 2, slots),
]

// ── the usual gestures ──
/** a swell under the fingers (volume up only: the attack never drops out) */
const swell = (a = 0.12, slots?: number[]) => press('volume', a, slots)
/** pressure vibrato: LFO 1 (a vibrato the wheel brings in on these patches: AMOUNT 0) deeper as you lean in */
const vibrato = (a = 0.4, slots?: number[]) => press('lfo1Amt', a, slots)
/** a bell or a pluck blooming into its own room */
const bloom = (a = 0.15, slots?: number[]) => press('reverbMix', a, slots)
/** the filter opening up the key */
const opens = (a = 0.25, slots?: number[]) => slide('cutoff', a, slots)
/** an FM / ring modulator a hair off its ratio: a slow shimmer (pitch only on the silent modulator) */
const shimmer = (a = 0.008, modulator = [1]) => slide('pitch', a, modulator)
/** a layer of the patch coming in, as a drawbar would (volume is ×(1 + x): a layer under the others needs most of it) */
const drawbar = (slots: number[], a = 0.8) => slide('volume', a, slots)
/**
 * an LFO that is always on (its AMOUNT already full, so it can't go deeper) going faster as you lean in: a Leslie
 * or a vibraphone's motor speeding up, a vibrato getting more intense (LFO 1 / 2 RATE: 36 semitones of its rate)
 */
const faster = (lfo: 1 | 2, a = 0.1, slots?: number[]) => press(lfo === 1 ? 'lfo1Rate' : 'lfo2Rate', a, slots)

// ── by kind ──
/** a filtered pad: press swells and opens a little, slide opens */
const filteredPad = (opensBy = 0.25, swellBy = 0.12) => [swell(swellBy), press('cutoff', 0.15), opens(opensBy)]
/** a filtered lead without a vibrato: press opens, slide adds bite */
const filteredLead = () => [press('cutoff', 0.25), swell(0.08), slide('resonance', 0.12), opens(0.1)]
/**
 * a cloud: press spreads its pitches, slide opens it (not VARIATION: it moves a cloud's level several dB either way,
 * unpredictably, which a held finger mid-key would hear as the patch changing)
 */
const cloud = (slots?: number[]) => [press('grainDetune', 0.03, slots), opens(0.2, slots), slide('reverbMix', 0.08, slots)]
/** an FM / ring bell: press blooms and swells the heard layers, slide shimmers the modulator */
const fmBell = (heard = [0], modulator = [1]) => [bloom(0.15, heard), swell(0.08, heard), shimmer(0.008, modulator)]

export const FACTORY_MPE: Record<string, MpeBinding[]> = {
  // ── the classics ──
  'poly-saw': [...filteredPad(0.3), strike('cutoff', 0.12)],
  'pure-sine': [swell(0.15), bloom(0.15), slide('delayMix', 0.2)],
  'fm-piano': [swell(0.08, [0]), bloom(0.12, [0]), shimmer(0.006, [1, 2])],
  'square-lead': [...filteredLead(), strike('cutoff', 0.12)],
  'warm-pad': [...filteredPad(0.3), slide('reverbMix', 0.1), strike('cutoff', 0.1)],
  'sub-bass': [swell(0.08), press('cutoff', 0.25, [1]), drawbar([1], 0.25)],
  'brass-stab': [press('cutoff', 0.25), swell(0.1), opens(0.2), strike('cutoff', 0.2)],
  'vox-pad': [swell(0.12), bloom(0.15), drawbar([1], 0.6)],
  'ring-bell': [bloom(0.15, [0]), swell(0.08, [0]), shimmer(0.012)],

  // ── bass ──
  'rubber-band-bass': [press('cutoff', 0.2, [0]), press('resonance', 0.08, [0]), opens(0.25, [0])],
  'upright-citizen-bass': [swell(0.1), press('cutoff', 0.15), slide('reverbMix', 0.08)],
  'fingerstyle-funk-bass': [swell(0.08), press('cutoff', 0.2), slide('resonance', 0.15), slide('reverbMix', 0.05)],
  'acid-reflux-bass': [press('cutoff', 0.3), opens(0.15)],
  'wobble-hobble-bass': [press('cutoff', 0.2, [0]), opens(0.25), slide('resonance', 0.08, [0]), strike('cutoff', 0.1)],
  'reese-pieces-bass': [press('cutoff', 0.25, [0, 1]), swell(0.06), slide('resonance', 0.12, [0, 1]), strike('cutoff', 0.12, [0, 1])],
  'fm-thump-bass': [swell(0.1, [0]), slide('reverbMix', 0.08, [0])],
  'basement-8bit-bass': [swell(0.1), drawbar([0], 0.25)],
  'grain-growl-bass': [press('cutoff', 0.25, [0]), ...formant('slide', 0.15, [0])],
  'submarine-sine-bass': [swell(0.08), slide('reverbMix', 0.06)],
  'hollow-log-bass': [swell(0.06), press('cutoff', 0.15), slide('reverbMix', 0.08)],
  'overdrive-alley-bass': [press('cutoff', 0.2, [0]), opens(0.2, [0]), slide('resonance', 0.08, [0]), strike('cutoff', 0.15, [0])],
  'talkbox-bass': [swell(0.06), ...formant('press', 0.15, [0]), drawbar([1], 0.8)],

  // ── leads ──
  'stadium-saw-lead': [vibrato(0.5, [0]), press('cutoff', 0.15), opens(0.3), strike('cutoff', 0.12)],
  'tea-kettle-lead': [vibrato(0.45), swell(0.08), slide('delayMix', 0.12)],
  'sync-screamer-lead': [vibrato(0.4), swell(0.06), ...formant('slide', 0.12)],
  'ghost-of-leon-lead': [faster(1, 0.1), swell(0.1), slide('reverbMix', 0.2)],
  'pixel-hero-lead': [faster(1, 0.1), swell(0.08), slide('delayMix', 0.15)],
  'sax-appeal-lead': [vibrato(0.4), swell(0.08), slide('reverbMix', 0.12)],
  'double-reed-lead': [faster(1, 0.08), swell(0.1), slide('reverbMix', 0.12)],
  'pulse-wander-lead': [faster(2, 0.1), press('cutoff', 0.15), opens(0.25)],
  'laser-ring-lead': [press('cutoff', 0.2, [0]), swell(0.06, [0]), shimmer(0.03)],
  'fm-trumpeteer-lead': [vibrato(0.45, [0]), swell(0.08, [0]), slide('reverbMix', 0.12, [0])],
  'fuzz-pedal-lead': [vibrato(0.4, [0]), press('cutoff', 0.15), opens(0.25), slide('delayMix', 0.12)],
  'vocoder-vagabond-lead': [swell(0.08), faster(2, 0.1, [0]), ...formant('slide', 0.15)],
  'comet-tail-lead': [vibrato(0.4), press('grainDetune', 0.02), opens(0.25), slide('delayMix', 0.1)],

  // ── pads ──
  'glacier-sheet-pad': [swell(0.06), ...cloud()],
  'velvet-strings-pad': [swell(0.12), press('cutoff', 0.15), slide('reverbMix', 0.12), strike('cutoff', 0.1)],
  'aurora-swell-pad': [swell(0.12), press('cutoff', 0.2), press('grainDetune', 0.02), opens(0.25)],
  'dusty-cassette-pad': [swell(0.15), press('cutoff', 0.15), opens(0.25)],
  'cathedral-choir-pad': [swell(0.12), bloom(0.15), opens(0.25)],
  'sunken-organ-pad': [press('cutoff', 0.15), swell(0.1), faster(2, 0.1, [0]), opens(0.3)],
  'breathing-room-pad': [swell(0.12), bloom(0.15), drawbar([2], 0.8)],
  'nebula-drift-pad': [swell(0.12), press('cutoff', 0.15), slide('lfo2Rate', 0.12), slide('reverbMix', 0.1)],
  'spice-market-pad': [press('cutoff', 0.2), swell(0.1), opens(0.15), slide('reverbMix', 0.12)],
  'polar-night-pad': [press('cutoff', 0.25), swell(0.1), opens(0.3), slide('resonance', 0.08), strike('cutoff', 0.1)],
  'halo-rings-pad': [swell(0.12, [0, 2]), bloom(0.15, [0, 2]), shimmer(0.008)],
  'tidepool-pad': [swell(0.12), press('grainDetune', 0.03, [0]), slide('reverbMix', 0.08), drawbar([1], 0.4)],
  'analog-heaven-pad': [press('cutoff', 0.25), swell(0.1), opens(0.2), slide('resonance', 0.1), strike('cutoff', 0.12)],
  'honey-glaze-pad': [swell(0.12), press('cutoff', 0.15), drawbar([1], 0.8), slide('reverbMix', 0.08)],
  'vapor-trail-pad': [swell(0.12), faster(1, 0.1, [0]), slide('delayMix', 0.2), opens(0.15)],

  // ── keys ──
  'suitcase-keys': [swell(0.08), faster(2, 0.15, [0]), slide('reverbMix', 0.2)],
  'barking-reed-keys': [swell(0.06), press('cutoff', 0.15), slide('reverbMix', 0.12)],
  'parlor-upright-piano': [swell(0.06), bloom(0.12), drawbar([1], 0.6), slide('reverbMix', 0.06)],
  'toy-box-piano': [swell(0.06), bloom(0.15), drawbar([1], 0.8)],
  'tonewheel-tuesday-organ': [swell(0.1), faster(2, 0.15, [0]), drawbar([2], 0.8)],
  'church-mouse-organ': [swell(0.1), bloom(0.12), drawbar([2], 0.8)],
  'funky-clav-keys': [press('cutoff', 0.4, [0]), press('resonance', 0.1, [0]), swell(0.06), slide('delayMix', 0.18)],
  'harpsichord-heist': [swell(0.05), bloom(0.15), drawbar([1], 0.6), slide('reverbMix', 0.06)],
  'celeste-crystal-keys': [swell(0.06), bloom(0.15), drawbar([1], 0.8)],
  'digital-tine-ep': [swell(0.08, [0]), bloom(0.12, [0]), shimmer(0.006, [1, 2])],
  'dorm-room-lofi-keys': [swell(0.12), press('cutoff', 0.15), slide('reverbMix', 0.12)],
  'stage-chorus-keys': [swell(0.06), press('cutoff', 0.12), opens(0.15), slide('reverbMix', 0.1)],
  'musette-accordion': [swell(0.2), press('cutoff', 0.15), drawbar([2], 0.6)],

  // ── plucks, mallets, bells ──
  'harp-strings-pluck': [swell(0.05), bloom(0.15), slide('delayMix', 0.12)],
  'nylon-serenade-pluck': [swell(0.06), bloom(0.12), slide('delayMix', 0.12)],
  'marimba-mojo-mallet': [swell(0.06), bloom(0.15), drawbar([1, 2], 0.6)],
  'vibes-at-night-mallet': [faster(2, 0.15, [0]), bloom(0.1), drawbar([1], 0.8)],
  'kalimba-thumb-pluck': [swell(0.06), bloom(0.15), drawbar([0], 0.35)],
  'glass-harmonica-bell': [...fmBell([0, 2])],
  'temple-gong-bell': [bloom(0.2, [0, 2]), swell(0.08, [0, 2]), shimmer(0.012)],
  'music-box-ballerina': [bloom(0.15, [0]), swell(0.06, [0]), shimmer(0.006)],
  'synth-pluck-pop': [press('cutoff', 0.2), swell(0.06), slide('delayMix', 0.15), opens(0.1)],
  'dew-drop-pluck': [swell(0.06), bloom(0.15), ...formant('slide', 0.12)],
  'steel-drum-parade': [bloom(0.12, [0, 2]), swell(0.08, [0, 2]), shimmer(0.006)],

  // ── orchestra, choirs ──
  'cello-suite-bow': [vibrato(0.4), swell(0.12), slide('reverbMix', 0.1)],
  'fiddle-fair-bow': [faster(1, 0.08), swell(0.12), slide('reverbMix', 0.12)],
  'string-section': [swell(0.15), press('cutoff', 0.12), opens(0.2), slide('reverbMix', 0.08), strike('cutoff', 0.1)],
  'pizzicato-prance': [swell(0.05), bloom(0.1), slide('delayMix', 0.1)],
  'flute-of-pan': [vibrato(0.4, [0]), swell(0.1), drawbar([1], 0.25)],
  'clarinet-noir': [vibrato(0.4), swell(0.1), slide('reverbMix', 0.12)],
  'french-horn-dusk': [press('cutoff', 0.2, [0]), swell(0.1), opens(0.15, [0])],
  'fanfare-trumpet': [press('cutoff', 0.25), swell(0.1), slide('resonance', 0.08), opens(0.1)],
  'monk-chant-choir': [swell(0.12), press('cutoff', 0.15), slide('reverbMix', 0.15), opens(0.1), strike('cutoff', 0.08)],
  'angel-ooh-choir': [swell(0.12), press('grainDetune', 0.02, [0]), opens(0.15, [0]), slide('reverbMix', 0.05)],
  'yodel-box-voice': [swell(0.08), vibrato(0.3), ...formant('slide', 0.15)],

  // ── grains ──
  'pulsar-star-synth': [press('cutoff', 0.2), swell(0.08), ...formant('slide', 0.15)],
  'formant-surfer-lead': [faster(2, 0.1), swell(0.06), ...formant('slide', 0.12)],
  'spray-paint-texture': [press('grainDetune', 0.03), swell(0.1), opens(0.2), slide('grainPos', 0.15)],
  'shattered-glass-texture': [press('grainDetune', 0.04), swell(0.08), opens(0.15), slide('reverbMix', 0.1)],
  'hummingbird-swarm': [press('grainDetune', 0.04), swell(0.1), slide('grainPos', 0.25)],
  'tape-stutter-loop': [press('grainScan', 0.15), swell(0.08), slide('grainPos', 0.2)],
  'grain-fm-bell': [bloom(0.15), swell(0.08), slide('grainDetune', 0.03, [0])],
  'supersaw-from-one': [press('grainDetune', 0.03), swell(0.1), opens(0.25)],
  'wind-chimes-cloud': [bloom(0.2), swell(0.1), slide('grainDetune', 0.03)],
  'geiger-counter-fx': [press('cutoff', 0.2), swell(0.08), slide('delayMix', 0.25)],
  'robot-choir-sync': [swell(0.1), bloom(0.12), ...formant('slide', 0.15)],
  'drone-of-the-deep': [press('cutoff', 0.25, [0]), swell(0.1), opens(0.15, [0]), slide('reverbMix', 0.12)],
  'insect-orchestra-fx': [swell(0.1), bloom(0.12), slide('grainPos', 0.25)],
  'frozen-lake-pad': [swell(0.12), ...cloud()],
  'rainmaker-texture': [swell(0.1), bloom(0.15), slide('grainPos', 0.2)],
  'octave-shimmer-pad': [swell(0.12), press('grainDetune', 0.03, [1, 2]), opens(0.25, [0]), slide('reverbMix', 0.12)],
  'zap-gun-fx': [swell(0.08), press('delayMix', 0.12), ...formant('slide', 0.15)],
  'pipe-dream-organ': [swell(0.1), bloom(0.12), ...formant('slide', 0.12, [0, 2])],
  'warp-drive-fx': [faster(1, 0.15), swell(0.08), slide('lfo2Rate', 0.15)],
  'liquid-mercury-lead': [swell(0.08), faster(2, 0.1), ...formant('slide', 0.12)],

  // ── VCO tricks ──
  'metallic-fm-clang': [bloom(0.15, [0]), swell(0.08, [0]), shimmer(0.01)],
  'ring-a-ding-keys': [swell(0.08, [0]), bloom(0.12, [0]), shimmer(0.01)],
  'cross-mod-growl': [press('cutoff', 0.25, [0]), slide('resonance', 0.12, [0]), opens(0.1, [0]), strike('cutoff', 0.15, [0])],
  'sideband-synth': [swell(0.08, [0]), bloom(0.12, [0]), shimmer(0.015)],
  'octave-stack-synth': [swell(0.12), drawbar([2], 0.8)],
  'fifth-element-lead': [vibrato(0.4, [0]), press('cutoff', 0.15), opens(0.25), strike('cutoff', 0.12)],
  'phase-whisper-pad': [...filteredPad(0.2)],
  'audio-rate-wobble': [faster(2, 0.1), press('cutoff', 0.15), opens(0.2)],
  'subharmonic-monster-bass': [press('cutoff', 0.25, [0, 1]), slide('resonance', 0.1, [0]), opens(0.1, [0, 1]), strike('cutoff', 0.15, [0, 1])],

  // ── chip ──
  'octave-hop-chip': [swell(0.08), press('delayMix', 0.12), slide('reverbMix', 0.12)],
  'pocket-console-pulse': [swell(0.1), bloom(0.1), slide('delayMix', 0.15)],
  'chip-triangle-bass': [swell(0.1), slide('reverbMix', 0.06)],
  'coin-collect-fx': [swell(0.08), bloom(0.12), slide('delayMix', 0.15)],
  'power-up-fx': [faster(1, 0.15), swell(0.06), slide('lfo2Rate', 0.15)],
  'boss-battle-lead': [faster(1, 0.1, [0]), swell(0.08), slide('delayMix', 0.25)],
  'lo-bit-lullaby': [faster(1, 0.08), bloom(0.12), slide('delayMix', 0.15)],

  // ── FX, drones ──
  'ufo-landing-fx': [faster(1, 0.15, [0]), swell(0.08), slide('lfo2Rate', 0.15, [0])],
  'sea-of-sines-drone': [swell(0.12), bloom(0.15), slide('lfo2Rate', 0.12)],
  'alarm-clock-fx': [swell(0.08), bloom(0.1), slide('lfo2Rate', 0.12)],
  'wind-tunnel-texture': [press('cutoff', 0.1), swell(0.08), slide('grainPos', 0.15), slide('reverbMix', 0.08)],
  'deep-space-drone': [press('cutoff', 0.2, [0]), swell(0.1, [0, 2]), opens(0.1, [0]), slide('reverbMix', 0.06)],
  'broken-radio-fx': [swell(0.08), bloom(0.08), slide('delayMix', 0.12)],
}

/**
 * Built-in patches a board installed before they had MPE bindings get them (by their factory id). A patch whose
 * `mpe` is a list already -- even an empty one, the user's choice -- keeps it. Returns how many were filled in.
 */
export function fillFactoryMpe(patches: Pick<Patch, 'factoryId' | 'mpe'>[]): number {
  let n = 0
  for (const p of patches) {
    const b = p.factoryId ? FACTORY_MPE[p.factoryId] : undefined
    if (!b || p.mpe !== undefined) continue
    p.mpe = b.map((x) => ({ ...x, ...(x.slots ? { slots: [...x.slots] } : {}) }))
    n++
  }
  return n
}
