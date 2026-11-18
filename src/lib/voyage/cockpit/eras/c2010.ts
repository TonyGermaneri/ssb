/**
 * The TENS' cockpit: the LONG SHADOW liner from inside, flat as a home screen -- the windscreen is one big rounded
 * app-icon square in an indigo bulkhead, and the three VCOs are material cards laid round it: tall turquoise and coral
 * cards up either side, a wide amber card under the glass. Flat knobs in solid circles, flat faders, flat toggles,
 * scrubbers under the clips, a cord to plug ECHO into the tempo, chips for the garden, all on an 8-unit grid, and
 * every card, knob and chip casting its long 45° shadow.
 */
import Back2010 from '../../../../components/cockpit/eras/Back2010.vue'
import type { CockpitDesign, ControlSpec, ScreenSpec } from '../design'

/** the side cards: VCO 1 on the left, VCO 3 on the right (the same card, moved) */
export const SIDE = { x: [16, 1150], y: 24, w: 434, h: 860 }
/** the wide card under the glass: VCO 2 */
export const MID = { x: 470, y: 500, w: 660, h: 384 }

function side(vco: number): ControlSpec[] {
  const o = SIDE.x[vco === 0 ? 0 : 1] - SIDE.x[0]
  const x = (v: number) => v + o
  const row1 = (['length', 'size', 'spray', 'detune'] as const).map((param, k) => ({ vco, param, kind: 'knob' as const, x: x(72 + k * 96), y: 456, size: 24 }))
  const row2 = (['depth', 'rate', 'filter', 'reverb'] as const).map((param, k) => ({ vco, param, kind: 'knob' as const, x: x(72 + k * 96), y: 560, size: 24 }))
  return [
    { vco, param: 'pos', kind: 'slider', x: x(233), y: 288, size: 328, angle: 90, label: false },
    { vco, param: 'steps', kind: 'counter', x: x(80), y: 360, size: 1 },
    { vco, param: 'hits', kind: 'counter', x: x(160), y: 360, size: 1 },
    ...row1,
    ...row2,
    { vco, param: 'vol', kind: 'slider', x: x(64), y: 720, size: 112 },
    { vco, param: 'feedback', kind: 'slider', x: x(128), y: 720, size: 112 },
    { vco, param: 'pitchX', kind: 'stick', x: x(240), y: 720, size: 44 },
    { vco, param: 'tilt', kind: 'toggle', x: x(344), y: 704 , size: 1},
    { vco, param: 'mids', kind: 'toggle', x: x(400), y: 704 , size: 1},
    { vco, param: 'time', kind: 'cable', lead: 'left', x: x(256), y: 832, size: 208 },
  ]
}

function mid(vco: number): ControlSpec[] {
  const knobs = (['length', 'size', 'spray', 'detune', 'depth', 'filter'] as const).map((param, k) => ({ vco, param, kind: 'knob' as const, x: 790 + k * 62, y: 592, size: 20 }))
  return [
    { vco, param: 'pos', kind: 'slider', x: 609, y: 700, size: 196, angle: 90, label: false },
    { vco, param: 'steps', kind: 'counter', x: 528, y: 764, size: 1 },
    { vco, param: 'hits', kind: 'counter', x: 608, y: 764, size: 1 },
    ...knobs,
    { vco, param: 'rate', kind: 'knob', x: 790, y: 696, size: 20 },
    { vco, param: 'reverb', kind: 'knob', x: 852, y: 696, size: 20 },
    { vco, param: 'pitchX', kind: 'stick', x: 944, y: 712, size: 40 },
    { vco, param: 'vol', kind: 'slider', x: 1036, y: 712, size: 96 },
    { vco, param: 'feedback', kind: 'slider', x: 1094, y: 712, size: 96 },
    { vco, param: 'tilt', kind: 'toggle', x: 800, y: 832 , size: 1},
    { vco, param: 'mids', kind: 'toggle', x: 856, y: 832 , size: 1},
    { vco, param: 'time', kind: 'cable', lead: 'left', x: 650, y: 834, size: 176 },
  ]
}

const sideScreen = (vco: number): ScreenSpec => ({ vco, x: SIDE.x[vco === 0 ? 0 : 1] + 24, y: 104, w: 386, h: 144, r: 4, show: 'clip' })

export const C2010: CockpitDesign = {
  era: '2010',
  title: 'LONG SHADOW · BRIDGE',
  skin: {
    font: "'Roboto', 'Helvetica Neue', 'Avenir Next', 'Segoe UI', Arial, sans-serif",
    label: '#455a64',
    plate: 'silk',
    plateColor: '#ffffff',
    knob: 'flat',
    lever: 'flat',
    screen: 'flat',
    metal: ['#dfe6ea', '#e3e9ec', '#e8edf0'],
    cablePlate: '#eef2f4',
    counter: 'flip',
    vco: ['#1abc9c', '#ffb300', '#ff7043'],
    glow: '#64ffda',
    ink: '#263238',
    stroke: 0,
  },
  controls: [side(0), mid(1), side(2)].flat(),
  screens: [sideScreen(0), { vco: 1, x: 494, y: 560, w: 230, h: 104, r: 4, show: 'clip' }, sideScreen(2)],
  gauges: [
    { vco: 0, x: SIDE.x[0] + 270, y: 360, r: 28, show: 'level' },
    { vco: 1, x: 960, y: 832, r: 28, show: 'level' },
    { vco: 2, x: SIDE.x[1] + 270, y: 360, r: 28, show: 'level' },
  ],
  intakes: [
    { vco: 0, x: SIDE.x[0] + 376, y: 360 },
    { vco: 1, x: 694, y: 764 },
    { vco: 2, x: SIDE.x[1] + 376, y: 360 },
  ],
  glass: 'M 534 24 H 1066 Q 1130 24 1130 88 V 412 Q 1130 476 1066 476 H 534 Q 470 476 470 412 V 88 Q 470 24 534 24 Z',
  vp: { x: 800, y: 250 },
  sun: { x: 300, y: -260 },
  atmosphere: { dust: 0.12, shafts: 0.3, grain: 0.02, scanlines: 0, emf: 0, vignette: 0.18, glass: 0.25, bloom: 0.15, tint: [1, 1, 1], depth: 1.2, trip: 0 },
  back: Back2010,
}
