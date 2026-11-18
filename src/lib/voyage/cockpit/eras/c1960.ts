/**
 * The SIXTIES' cockpit: the S·S·B DREAMBOAT from inside, a technicolor trip -- the windscreen is a giant EYE, its
 * lids op-art bands of candy colour rippling out over the whole bulkhead, lashes fanning off the top lid, mandalas
 * turning in the corners and lava lamps glooping under the eye's corners. Below it three melted-candy consoles, one per
 * VCO, each a FLOWER: the clip's place is a petal wheel at the middle, ringed by eight jelly knobs; lava-lamp faders for
 * the volume and the echo time, jelly throttles for the sweep and the repeats, a bead-bright patch lead into the
 * tempo's jacks for the LFO rate, a kaleidoscope screen, a little joystick.
 */
import Back1960 from '../../../../components/cockpit/eras/Back1960.vue'
import Front1960 from '../../../../components/cockpit/eras/Front1960.vue'
import type { CockpitDesign, ControlSpec } from '../design'
import type { ParamId } from '../params'

export const X60 = (vco: number) => 10 + vco * 530
const RING_Y = 675
const RING_R = 100

/** the eye, scaled about its centre (s = 1: the windscreen) */
export function eye60(s: number) {
  const cx = 800
  const cy = 262
  const f = (n: number) => n.toFixed(1)
  return `M ${f(cx - 570 * s)} ${f(cy)} C ${f(cx - 370 * s)} ${f(cy - 222 * s)} ${f(cx + 370 * s)} ${f(cy - 222 * s)} ${f(cx + 570 * s)} ${f(cy)} C ${f(cx + 370 * s)} ${f(cy + 200 * s)} ${f(cx - 370 * s)} ${f(cy + 200 * s)} ${f(cx - 570 * s)} ${f(cy)} Z`
}

const PETALS: ParamId[] = ['filter', 'reverb', 'spray', 'detune', 'tilt', 'mids', 'length', 'size']

function consoleOf(vco: number): ControlSpec[] {
  const x0 = X60(vco)
  const cx = x0 + 260
  const ring = PETALS.map((param, k) => {
    const a = (k * Math.PI) / 4
    return { vco, param, kind: 'knob' as const, x: Math.round(cx + Math.sin(a) * RING_R), y: Math.round(RING_Y - Math.cos(a) * RING_R), size: 15 }
  })
  return [
    // the flower: a petal wheel and its ring of jelly knobs
    { vco, param: 'pos', kind: 'valve', x: cx, y: RING_Y, size: 38 },
    ...ring,
    // the lava lamps
    { vco, param: 'vol', kind: 'slider', x: x0 + 38, y: 670, size: 180 },
    { vco, param: 'time', kind: 'slider', x: x0 + 94, y: 670, size: 180 },
    // the jelly throttles
    { vco, param: 'depth', kind: 'lever', x: x0 + 432, y: 680, size: 140 },
    { vco, param: 'feedback', kind: 'lever', x: x0 + 488, y: 680, size: 140 },
    // the rate's lead, and the stick
    { vco, param: 'rate', kind: 'cable', lead: 'left', x: cx - 18, y: 852, size: 230 },
    { vco, param: 'pitchX', kind: 'stick', x: x0 + 462, y: 840, size: 30 },
    // the garden's digits
    { vco, param: 'steps', kind: 'counter', x: x0 + 46, y: 492, size: 1 },
    { vco, param: 'hits', kind: 'counter', x: x0 + 120, y: 492, size: 1 },
  ]
}

export const C1960: CockpitDesign = {
  era: '1960',
  title: 'S·S·B DREAMBOAT · THE EYE',
  skin: {
    font: "'Cooper Black', 'Arial Rounded MT Bold', 'Avenir Next', 'Helvetica Neue', sans-serif",
    label: '#3b0a4f',
    plate: 'candy',
    plateColor: '#ff2e88',
    knob: 'jelly',
    lever: 'jelly',
    screen: 'kaleido',
    metal: ['#3b0a4f', '#c04ad8', '#ffd6fb'],
    vco: ['#ffd21f', '#2fe0c4', '#ff6a3d'],
    glow: '#ff3df0',
    ink: '#241036',
    stroke: 1,
  },
  controls: [0, 1, 2].flatMap(consoleOf),
  screens: [0, 1, 2].map((vco) => ({ vco, x: X60(vco) + 172, y: 456, w: 180, h: 84, r: 42, show: 'clip' as const })),
  gauges: [0, 1, 2].map((vco) => ({ vco, x: X60(vco) + 404, y: 494, r: 28, show: 'level' as const })),
  intakes: [0, 1, 2].map((vco) => ({ vco, x: X60(vco) + 478, y: 494 })),
  glass: eye60(1),
  vp: { x: 800, y: 262 },
  sun: { x: 800, y: -160 },
  atmosphere: { dust: 0.7, shafts: 0.55, grain: 0.35, scanlines: 0.05, emf: 0.15, vignette: 0.6, glass: 0.6, bloom: 0.8, tint: [1, 0.72, 0.95], depth: 1.8, trip: 0.95 },
  back: Back1960,
  front: Front1960,
}
