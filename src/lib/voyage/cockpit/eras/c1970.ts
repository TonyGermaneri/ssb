/**
 * The SEVENTIES' cockpit: the DEEP SPACE HAULER's command module, a long-haul cab you can feel -- a wedge of a
 * windscreen in three panes under a padded overhead of harvest-gold panels, where each VCO's LFO RATE and ECHO are
 * chicken-head selectors clicking round their printed stops beside flip counters for the garden; below a brown vinyl
 * glare shield with an orange racing stripe, three walnut-faced consoles: an amber CRT, a VU meter, a chrome throttle
 * quadrant (volume, sweep, repeats), eight chicken-head knobs, a hand controller for the pitch, and across the bottom a
 * hi-fi tuning dial for where in the clip it plays. Dymo tape on everything.
 */
import Back1970 from '../../../../components/cockpit/eras/Back1970.vue'
import Front1970 from '../../../../components/cockpit/eras/Front1970.vue'
import type { CockpitDesign, ControlSpec } from '../design'

/** the overhead's sections, and the dash's consoles */
export const OH70 = (vco: number) => vco * 533
export const X70 = (vco: number) => 10 + vco * 530

function controlsOf(vco: number): ControlSpec[] {
  const o = OH70(vco)
  const x0 = X70(vco)
  const knob = (param: ControlSpec['param'], col: number, row: number): ControlSpec => ({ vco, param, kind: 'knob', x: x0 + 40 + col * 65, y: 640 + row * 98, size: 18 })
  return [
    // overhead: the selectors and the flip counters
    { vco, param: 'rate', kind: 'selector', x: o + 98, y: 80, size: 34 },
    { vco, param: 'time', kind: 'selector', x: o + 240, y: 80, size: 34 },
    { vco, param: 'steps', kind: 'counter', x: o + 360, y: 64, size: 1 },
    { vco, param: 'hits', kind: 'counter', x: o + 436, y: 64, size: 1 },
    // the throttle quadrant
    { vco, param: 'vol', kind: 'lever', x: x0 + 350, y: 568, size: 136 },
    { vco, param: 'depth', kind: 'lever', x: x0 + 410, y: 568, size: 136 },
    { vco, param: 'feedback', kind: 'lever', x: x0 + 470, y: 568, size: 136 },
    // the chicken-heads
    knob('filter', 0, 0),
    knob('reverb', 1, 0),
    knob('tilt', 2, 0),
    knob('mids', 3, 0),
    knob('length', 0, 1),
    knob('size', 1, 1),
    knob('spray', 2, 1),
    knob('detune', 3, 1),
    // the hand controller
    { vco, param: 'pitchX', kind: 'stick', x: x0 + 410, y: 740, size: 38 },
    // the tuning dial (its name is on the dial's own glass)
    { vco, param: 'pos', kind: 'slider', x: x0 + 260, y: 852, size: 380, angle: 90, label: false },
  ]
}

export const C1970: CockpitDesign = {
  era: '1970',
  title: 'DEEP SPACE HAULER · COMMAND MODULE',
  skin: {
    font: "'Futura', 'Avenir Next', 'Century Gothic', 'Helvetica Neue', sans-serif",
    label: '#2b1a10',
    plate: 'dymo',
    plateColor: '#1d1d1f',
    knob: 'chickenhead',
    lever: 'chrome',
    screen: 'crtAmber',
    metal: ['#3a3430', '#a8a49c', '#f4f0e6'],
    vco: ['#ee6a2a', '#a8c23c', '#f4b42e'],
    glow: '#ffb43d',
    ink: '#26170c',
    stroke: 1,
  },
  controls: [0, 1, 2].flatMap(controlsOf),
  screens: [0, 1, 2].map((vco) => ({ vco, x: X70(vco) + 16, y: 462, w: 196, h: 122, r: 14, show: 'clip' as const })),
  gauges: [0, 1, 2].map((vco) => ({ vco, x: X70(vco) + 266, y: 506, r: 32, show: 'level' as const, label: 'VU' })),
  intakes: [0, 1, 2].map((vco) => ({ vco, x: X70(vco) + 266, y: 576 })),
  glass: 'M 228 180 L 1372 180 Q 1398 180 1390 198 L 1300 410 Q 1294 422 1280 422 L 320 422 Q 306 422 300 410 L 210 198 Q 202 180 228 180 Z',
  vp: { x: 800, y: 300 },
  sun: { x: 1720, y: 210 },
  atmosphere: { dust: 0.95, shafts: 0.95, grain: 0.6, scanlines: 0.06, emf: 0.08, vignette: 0.85, glass: 0.85, bloom: 0.5, tint: [1, 0.8, 0.52], depth: 1.6, trip: 0 },
  back: Back1970,
  front: Front1970,
}
