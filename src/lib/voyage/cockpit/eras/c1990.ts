/**
 * The NINETIES' cockpit: the HX-2K HYPERCRUISER from inside, pre-rendered -- a big chrome-rimmed bubble windscreen
 * onto the warp, flanked by two tall candy-plastic pods (VCO 1 teal on the left, VCO 3 lime on the right, mirror
 * images) with a wide purple one under the glass (VCO 2), every pod translucent over its circuit boards, bevelled in
 * glossy chrome. Chunky chrome selectors click LFO RATE and ECHO through the tempo's divisions, a chrome jog crank
 * scrubs POS, a T-handle throttle sets the volume, a fat joystick the pitch, chrome-capped knobs and faders the rest.
 */
import Back1990 from '../../../../components/cockpit/eras/Back1990.vue'
import Front1990 from '../../../../components/cockpit/eras/Front1990.vue'
import type { CockpitDesign, ControlSpec, GaugeSpec, ScreenSpec } from '../design'

/** a side pod's x, from its outer edge in (VCO 1 on the left, VCO 3 mirrored on the right) */
export const SX90 = (vco: number, rel: number) => (vco === 0 ? 16 + rel : 1584 - rel)

function sidePod(vco: number): ControlSpec[] {
  const X = (rel: number) => SX90(vco, rel)
  return [
    { vco, param: 'steps', kind: 'counter', x: X(vco === 0 ? 90 : 170), y: 296, size: 1 },
    { vco, param: 'hits', kind: 'counter', x: X(vco === 0 ? 170 : 90), y: 296, size: 1 },
    { vco, param: 'rate', kind: 'selector', x: X(90), y: 412, size: 36 },
    { vco, param: 'time', kind: 'selector', x: X(230), y: 410, size: 28 },
    { vco, param: 'vol', kind: 'lever', x: X(346), y: 440, size: 150 },
    ...(['spray', 'detune', 'tilt', 'mids'] as const).map((param, k) => ({ vco, param, kind: 'knob' as const, x: X(46 + k * 70), y: 530, size: 20 })),
    ...(['depth', 'filter', 'reverb'] as const).map((param, k) => ({ vco, param, kind: 'knob' as const, x: X(46 + k * 70), y: 640, size: 20 })),
    { vco, param: 'pos', kind: 'crank', x: X(64), y: 790, size: 32 },
    { vco, param: 'pitchX', kind: 'stick', x: X(180), y: 790, size: 40 },
    ...(['length', 'size', 'feedback'] as const).map((param, k) => ({ vco, param, kind: 'slider' as const, x: X(250 + k * 60), y: 790, size: 90 })),
  ]
}

function centrePod(): ControlSpec[] {
  const vco = 1
  return [
    { vco, param: 'vol', kind: 'lever', x: 472, y: 760, size: 150 },
    { vco, param: 'rate', kind: 'selector', x: 574, y: 636, size: 36 },
    { vco, param: 'time', kind: 'selector', x: 714, y: 636, size: 28 },
    { vco, param: 'steps', kind: 'counter', x: 1010, y: 612, size: 1 },
    { vco, param: 'hits', kind: 'counter', x: 1088, y: 612, size: 1 },
    ...(['spray', 'detune', 'tilt', 'mids', 'depth', 'filter', 'reverb'] as const).map((param, k) => ({ vco, param, kind: 'knob' as const, x: 546 + k * 68, y: 736, size: 20 })),
    { vco, param: 'pos', kind: 'crank', x: 566, y: 838, size: 28 },
    { vco, param: 'pitchX', kind: 'stick', x: 690, y: 830, size: 34 },
    ...(['length', 'size', 'feedback'] as const).map((param, k) => ({ vco, param, kind: 'slider' as const, x: 1010 + k * 60, y: 724, size: 90 })),
  ]
}

const screens: ScreenSpec[] = [
  { vco: 0, x: SX90(0, 40), y: 132, w: 290, h: 112, r: 22, show: 'clip' },
  { vco: 2, x: SX90(2, 330), y: 132, w: 290, h: 112, r: 22, show: 'clip' },
  { vco: 1, x: 782, y: 584, w: 180, h: 96, r: 20, show: 'clip' },
  { vco: 1, x: 790, y: 806, w: 150, h: 64, r: 14, show: 'tone' },
]
const gauges: GaugeSpec[] = [
  { vco: 0, x: SX90(0, 282), y: 298, r: 32, show: 'level' },
  { vco: 2, x: SX90(2, 282), y: 298, r: 32, show: 'level' },
  { vco: 1, x: 1010, y: 856, r: 28, show: 'level' },
]

export const C1990: CockpitDesign = {
  era: '1990',
  title: 'HX-2K HYPERCRUISER · BRIDGE',
  skin: {
    font: "'Arial Black', 'Avenir Next', 'Helvetica Neue', Arial, sans-serif",
    label: '#f2fffd',
    plate: 'chrome',
    plateColor: '#c8d0e8',
    knob: 'chrome',
    lever: 'chrome',
    screen: 'crtColor',
    metal: ['#241c52', '#8f9ccc', '#ffffff'],
    vco: ['#1fe0d2', '#a46bff', '#b8ff1f'],
    glow: '#7ef9ff',
    ink: '#110a2c',
    stroke: 1.4,
  },
  controls: [...sidePod(0), ...centrePod(), ...sidePod(2)],
  screens,
  gauges,
  intakes: [
    { vco: 0, x: SX90(0, 300), y: 640 },
    { vco: 1, x: 1112, y: 860 },
    { vco: 2, x: SX90(2, 300), y: 640 },
  ],
  glass: 'M 420 300 C 420 120 600 40 800 40 C 1000 40 1180 120 1180 300 L 1180 470 C 1180 524 1140 545 1080 545 L 520 545 C 460 545 420 524 420 470 Z',
  vp: { x: 800, y: 280 },
  sun: { x: 1380, y: -120 },
  atmosphere: { dust: 0.18, shafts: 0.55, grain: 0.08, scanlines: 0.16, emf: 0.12, vignette: 0.6, glass: 1, bloom: 0.7, tint: [0.8, 1, 0.96], depth: 1.6, trip: 0.06 },
  back: Back1990,
  front: Front1990,
}
