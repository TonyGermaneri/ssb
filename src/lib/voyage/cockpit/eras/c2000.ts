/**
 * The NOUGHTIES' cockpit: the AQUAPOD 2.0 BETA from inside, a cabin you want to eat -- a pearl-white candy shell
 * round a rounded pill of a windscreen, and the three VCOs as three sweets: a Bondi-blue jelly console on the left,
 * the lime orb dead centre in its brushed-aluminium bezel (its knobs ringed round a round aqua screen), a tangerine
 * console on the right, each flank's tall gel throttle, ball-chain pull and bubble toggles up a jelly capsule beside
 * the glass. Gel sliders scrub the clips, candy patch cords plug ECHO into the tempo's jacks, the orb's chips sit on
 * the sill. Big wet speculars, pinstripes, a wet floor, a BETA sticker; sunny, clean, hardly any grain.
 */
import Back2000 from '../../../../components/cockpit/eras/Back2000.vue'
import Front2000 from '../../../../components/cockpit/eras/Front2000.vue'
import type { CockpitDesign, ControlSpec, ScreenSpec } from '../design'

/** a flank console (VCO 1 on the left; VCO 3 its mirror image on the right) */
const FX0 = 16
const mx = (vco: number, x: number) => (vco === 2 ? 1600 - x : x)

function flank(vco: number): ControlSpec[] {
  const x = (v: number) => mx(vco, v)
  const knobs = (['length', 'size', 'spray', 'detune', 'depth', 'filter'] as const).map((param, k) => ({ vco, param, kind: 'knob' as const, x: x(FX0 + 42 + (vco === 2 ? 5 - k : k) * 58), y: 680, size: 18 }))
  return [
    // the capsule beside the glass: throttle, ball-chain, bubble toggles
    { vco, param: 'vol', kind: 'lever', x: x(62), y: 244, size: 160 },
    { vco, param: 'feedback', kind: 'chain', x: x(150), y: 150, size: 76 },
    { vco, param: 'tilt', kind: 'toggle', x: x(150), y: 300, size: 1 },
    { vco, param: 'mids', kind: 'toggle', x: x(150), y: 378, size: 1 },
    // the console: chips by the screen, the scrubber under it
    { vco, param: 'steps', kind: 'counter', x: x(FX0 + (vco === 2 ? 360 : 282)), y: 514, size: 1 },
    { vco, param: 'hits', kind: 'counter', x: x(FX0 + (vco === 2 ? 282 : 360)), y: 514, size: 1 },
    { vco, param: 'pos', kind: 'slider', x: x(FX0 + 120), y: 612, size: 166, angle: 90, label: false },
    ...knobs,
    { vco, param: 'rate', kind: 'slider', x: x(FX0 + 404), y: 690, size: 84 },
    { vco, param: 'pitchX', kind: 'stick', x: x(FX0 + 60), y: 814, size: 40 },
    { vco, param: 'time', kind: 'cable', lead: 'left', x: vco === 2 ? 1600 - (FX0 + 254) : FX0 + 292, y: 806, size: 196 },
    { vco, param: 'reverb', kind: 'valve', x: x(FX0 + 470), y: 812, size: 32 },
  ]
}

/** the orb: VCO 2, knobs in a ring round its round screen */
const SC = { x: 800, y: 628, r: 58 }
const RING = 122
function orb(vco: number): ControlSpec[] {
  const at = (deg: number) => ({ x: Math.round(SC.x + Math.sin((deg * Math.PI) / 180) * RING), y: Math.round(SC.y - Math.cos((deg * Math.PI) / 180) * RING) })
  const ring = (['tilt', 'spray', 'detune', 'length', 'size', 'depth', 'filter', 'reverb'] as const).map((param, k) => ({ vco, param, kind: 'knob' as const, ...at(-105 + k * 30), size: 17 }))
  return [
    ...ring,
    { vco, param: 'pos', kind: 'slider', x: 800, y: 722, size: 100, angle: 90, label: false },
    { vco, param: 'vol', kind: 'lever', x: 616, y: 702, size: 110 },
    { vco, param: 'feedback', kind: 'lever', x: 984, y: 702, size: 110 },
    { vco, param: 'rate', kind: 'slider', x: 706, y: 792, size: 70 },
    { vco, param: 'time', kind: 'slider', x: 894, y: 792, size: 70 },
    { vco, param: 'pitchX', kind: 'stick', x: 800, y: 804, size: 34 },
    // the sill: its chips and bubble toggle
    { vco, param: 'steps', kind: 'counter', x: 690, y: 416, size: 1 },
    { vco, param: 'hits', kind: 'counter', x: 910, y: 416, size: 1 },
    { vco, param: 'mids', kind: 'toggle', x: 1012, y: 416, size: 1 },
  ]
}

const flankScreen = (vco: number): ScreenSpec => {
  const w = 196
  const x = vco === 2 ? 1600 - FX0 - 20 - w : FX0 + 20
  return { vco, x, y: 474, w, h: 104, r: 18, show: 'clip' }
}

export const C2000: CockpitDesign = {
  era: '2000',
  title: 'AQUAPOD 2.0 BETA · FLIGHT POD',
  skin: {
    font: "'Lucida Grande', 'Helvetica Neue', 'Arial Rounded MT Bold', sans-serif",
    label: '#17406a',
    plate: 'candy',
    plateColor: '#ffffff',
    knob: 'jelly',
    lever: 'jelly',
    screen: 'aqua',
    metal: ['#7f8d9c', '#cdd6df', '#ffffff'],
    vco: ['#1aaee6', '#8acf1c', '#ff8a1a'],
    glow: '#8ff3ff',
    ink: '#1c3b5a',
    stroke: 0.6,
  },
  controls: [flank(0), orb(1), flank(2)].flat(),
  screens: [flankScreen(0), { vco: 1, x: SC.x - SC.r, y: SC.y - SC.r, w: SC.r * 2, h: SC.r * 2, r: SC.r, round: true, show: 'clip' }, flankScreen(2)],
  gauges: [
    { vco: 0, x: FX0 + 470, y: 680, r: 28, show: 'level' },
    { vco: 1, x: 590, y: 416, r: 24, show: 'level' },
    { vco: 2, x: 1600 - FX0 - 470, y: 680, r: 28, show: 'level' },
  ],
  intakes: [
    { vco: 0, x: FX0 + 460, y: 514 },
    { vco: 1, x: 800, y: 416 },
    { vco: 2, x: 1600 - FX0 - 460, y: 514 },
  ],
  glass: 'M 390 26 H 1210 A 171 171 0 0 1 1210 368 H 390 A 171 171 0 0 1 390 26 Z',
  vp: { x: 800, y: 197 },
  sun: { x: 1180, y: -160 },
  atmosphere: { dust: 0.28, shafts: 0.55, grain: 0.04, scanlines: 0.02, emf: 0, vignette: 0.3, glass: 0.55, bloom: 0.6, tint: [0.86, 0.97, 1], depth: 1.6, trip: 0 },
  back: Back2000,
  front: Front2000,
}
