/**
 * The FIFTIES' cockpit: the ATOMIC SAUCER from inside, an atomic-age bridge gone steam -- a riveted iron windscreen
 * in three panes, a mahogany switchboard overhead where each VCO's LFO RATE and ECHO are frayed old leads plugged into
 * the tempo's jacks, brass pull-chains for the volumes hanging in front of the glass, and three oxblood-leather
 * consoles in brass bezels: a round green TELEVISOR, a pressure gauge, nixie tubes for the garden, bakelite knobs,
 * brass throttles, a crank, valve wheels, a joystick. Copper steam pipes run the walls.
 */
import Back1950 from '../../../../components/cockpit/eras/Back1950.vue'
import Front1950 from '../../../../components/cockpit/eras/Front1950.vue'
import type { CockpitDesign, ControlSpec } from '../design'

const X0 = (vco: number) => 30 + vco * 515
const CX = (vco: number) => X0(vco) + 252

function consoleOf(vco: number): ControlSpec[] {
  const x0 = X0(vco)
  const knobs = (['length', 'size', 'spray', 'detune', 'tilt', 'mids'] as const).map((param, k) => ({ vco, param, kind: 'knob' as const, x: x0 + 42 + k * 62, y: 655, size: 19 }))
  return [
    // overhead: the switchboard
    { vco, param: 'rate', kind: 'cable', x: CX(vco) + 30, y: 32, size: 250, variant: 'frayed' },
    { vco, param: 'time', kind: 'cable', x: CX(vco) + 30, y: 104, size: 220, variant: 'frayed' },
    // hanging in front of the glass
    { vco, param: 'vol', kind: 'chain', x: CX(vco) + (vco === 1 ? 150 : 0), y: 247, size: 110 },
    // row 1: nixies
    { vco, param: 'steps', kind: 'counter', x: x0 + 332, y: 524, size: 1 },
    { vco, param: 'hits', kind: 'counter', x: x0 + 414, y: 524, size: 1 },
    // row 2: knobs and throttles
    ...knobs,
    { vco, param: 'depth', kind: 'lever', x: x0 + 418, y: 690, size: 86 },
    { vco, param: 'feedback', kind: 'lever', x: x0 + 472, y: 690, size: 86 },
    // row 3: crank, valves, stick
    { vco, param: 'pos', kind: 'crank', x: x0 + 56, y: 822, size: 32 },
    { vco, param: 'filter', kind: 'valve', x: x0 + 160, y: 822, size: 38 },
    { vco, param: 'reverb', kind: 'valve', x: x0 + 262, y: 822, size: 38 },
    { vco, param: 'pitchX', kind: 'stick', x: x0 + 372, y: 822, size: 42 },
  ]
}

export const C1950: CockpitDesign = {
  era: '1950',
  title: 'XS-57 ATOMIC SAUCER · FLIGHT DECK',
  skin: {
    font: "'Courier New', 'Courier', monospace",
    label: '#f3e2bd',
    plate: 'brass',
    plateColor: '#c99a3c',
    knob: 'bakelite',
    lever: 'brass',
    screen: 'crtGreen',
    metal: ['#4a3010', '#b8862e', '#ffe7a3'],
    vco: ['#ff4a3d', '#5fe0c8', '#ffb03d'],
    glow: '#ffcf6a',
    ink: '#1a0d06',
    stroke: 1.2,
  },
  controls: [0, 1, 2].flatMap(consoleOf),
  screens: [0, 1, 2].map((vco) => ({ vco, x: X0(vco) + 22, y: 476, w: 168, h: 112, round: true, show: 'clip' as const })),
  gauges: [0, 1, 2].map((vco) => ({ vco, x: X0(vco) + 242, y: 532, r: 36, show: 'level' as const })),
  intakes: [0, 1, 2].map((vco) => ({ vco, x: X0(vco) + 466, y: 838 })),
  glass: 'M 46 214 Q 46 160 110 160 L 1490 160 Q 1554 160 1554 214 L 1554 400 Q 1554 446 1500 446 L 100 446 Q 46 446 46 400 Z',
  vp: { x: 800, y: 300 },
  sun: { x: 1330, y: 120 },
  atmosphere: { dust: 0.9, shafts: 0.85, grain: 0.4, scanlines: 0.12, emf: 0.2, vignette: 0.85, glass: 0.9, bloom: 0.4, tint: [1, 0.78, 0.5], depth: 1.4, trip: 0 },
  back: Back1950,
  front: Front1950,
}
