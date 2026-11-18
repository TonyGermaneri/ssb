/**
 * The EIGHTIES' cockpit: the VR-84 VECTOR RUNNER from inside, a low arcade interceptor at dusk -- a wedge canopy with
 * a HUD reticle etched on it and a sliced sun sinking at the horizon, a matte-black glare shield edged in chrome and
 * neon, and three angular consoles lit round in their VCO's colour: a vector-wireframe CRT over a scrub fader, LCD
 * step counters and a level dial, a bank of chunky illuminated faders for the grain, rubber knobs for the tone and
 * the effects, a neon throttle for the volume, a flight stick for the pitch, and down at the kick panel a neon patch
 * bay where LFO RATE and ECHO are leads you re-plug into the tempo's jacks.
 */
import Back1980 from '../../../../components/cockpit/eras/Back1980.vue'
import Front1980 from '../../../../components/cockpit/eras/Front1980.vue'
import type { CockpitDesign, ControlSpec } from '../design'

/** each console's left edge (510 wide) */
export const X80 = (vco: number) => 14 + vco * 530

function consoleOf(vco: number): ControlSpec[] {
  const x0 = X80(vco)
  const faders = (['length', 'size', 'spray', 'detune'] as const).map((param, k) => ({ vco, param, kind: 'slider' as const, x: x0 + 28 + k * 56, y: 666, size: 92 }))
  const knobs = (['tilt', 'mids', 'depth', 'filter', 'reverb', 'feedback'] as const).map((param, k) => ({
    vco,
    param,
    kind: 'knob' as const,
    x: x0 + 258 + (k % 3) * 66,
    y: k < 3 ? 624 : 704,
    size: 16,
  }))
  return [
    // the LCD counters beside the CRT
    { vco, param: 'steps', kind: 'counter', x: x0 + 262, y: 494, size: 1 },
    { vco, param: 'hits', kind: 'counter', x: x0 + 340, y: 494, size: 1 },
    // the scrub fader under the CRT (its label printed on the panel)
    { vco, param: 'pos', kind: 'slider', x: x0 + 114, y: 582, size: 150, angle: 90, label: false },
    ...faders,
    ...knobs,
    // the neon throttle, the flight stick
    { vco, param: 'vol', kind: 'lever', x: x0 + 478, y: 648, size: 150 },
    { vco, param: 'pitchX', kind: 'stick', x: x0 + 412, y: 812, size: 38 },
    // the kick panel's patch bay
    { vco, param: 'rate', kind: 'cable', lead: 'left', x: x0 + 192, y: 788, size: 240, variant: 'frayed' },
    { vco, param: 'time', kind: 'cable', lead: 'left', x: x0 + 166, y: 852, size: 192 },
  ]
}

export const C1980: CockpitDesign = {
  era: '1980',
  title: 'VR-84 VECTOR RUNNER · FLIGHT DECK',
  skin: {
    font: "'Orbitron', 'Futura', 'Avenir Next', 'Helvetica Neue', sans-serif",
    label: '#e8fbff',
    plate: 'neon',
    plateColor: '#ff2bd6',
    knob: 'rubber',
    lever: 'neon',
    screen: 'vector',
    metal: ['#05040a', '#18152a', '#3c3a5c'],
    counter: 'led',
    vco: ['#ff2bd6', '#00e5ff', '#a462ff'],
    glow: '#ff2bd6',
    ink: '#000000',
    stroke: 1,
  },
  controls: [0, 1, 2].flatMap(consoleOf),
  screens: [0, 1, 2].map((vco) => ({ vco, x: X80(vco) + 20, y: 456, w: 188, h: 98, r: 4, show: 'clip' as const })),
  gauges: [0, 1, 2].map((vco) => ({ vco, x: X80(vco) + 416, y: 494, r: 27, show: 'level' as const })),
  intakes: [0, 1, 2].map((vco) => ({ vco, x: X80(vco) + 478, y: 850 })),
  glass: 'M 330 40 L 1270 40 L 1530 330 L 1510 404 L 800 420 L 90 404 L 70 330 Z',
  vp: { x: 800, y: 236 },
  sun: { x: 800, y: 470 },
  atmosphere: { dust: 0.3, shafts: 0.38, grain: 0.22, scanlines: 0.5, emf: 0.5, vignette: 0.8, glass: 0.75, bloom: 0.85, tint: [1, 0.55, 0.95], depth: 1.4, trip: 0 },
  back: Back1980,
  front: Front1980,
}
