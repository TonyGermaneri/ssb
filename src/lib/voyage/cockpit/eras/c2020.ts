/**
 * The TWENTIES' cockpit: the GLASS NOMAD from inside -- a graphite cabin under a wide, soft-cornered panoramic
 * windscreen, and three frosted-glass cards floating over the dash, one per VCO (violet BOW, mint MIDSHIPS, coral
 * STERN), each lit from beneath by its own underglow. Everything is touch: pill faders, a scrub bar under the OLED
 * clip, haptic glass dials (RATE clicks through the tempo's divisions), a glass throttle, a thumb stick, a magnetic
 * lead snapped into the ECHO's tempo jacks, and the garden's STEPS / HITS in thin OLED digits.
 */
import Back2020 from '../../../../components/cockpit/eras/Back2020.vue'
import Front2020 from '../../../../components/cockpit/eras/Front2020.vue'
import type { CockpitDesign, ControlSpec } from '../design'

/** each card's left edge (a card is 504 wide, 16 between) */
export const X0_2020 = (vco: number) => 28 + vco * 520

function cardOf(vco: number): ControlSpec[] {
  const x0 = X0_2020(vco)
  const sliders = (['vol', 'length', 'spray', 'detune', 'feedback'] as const).map((param, k) => ({ vco, param, kind: 'slider' as const, x: x0 + 30 + k * 54, y: 690, size: 80 }))
  const dials = (['size', 'filter', 'reverb', 'tilt', 'mids'] as const).map((param, k) => ({ vco, param, kind: 'knob' as const, x: x0 + 30 + k * 54, y: 794, size: 16 }))
  return [
    // the OLED row: the garden's digits
    { vco, param: 'steps', kind: 'counter', x: x0 + 340, y: 514, size: 1 },
    { vco, param: 'hits', kind: 'counter', x: x0 + 410, y: 514, size: 1 },
    // the scrub bar under the clip (its label is printed on the card)
    { vco, param: 'pos', kind: 'slider', x: x0 + 154, y: 606, size: 236, angle: 90, label: false },
    // pill faders, haptic dials
    ...sliders,
    ...dials,
    // the right column: RATE's detented dial, the glass throttle, the thumb stick
    { vco, param: 'rate', kind: 'knob', x: x0 + 330, y: 660, size: 18 },
    { vco, param: 'depth', kind: 'lever', x: x0 + 400, y: 694, size: 88 },
    { vco, param: 'pitchX', kind: 'stick', x: x0 + 463, y: 676, size: 28 },
    // the magnetic lead, into the echo's tempo jacks
    { vco, param: 'time', kind: 'cable', lead: 'left', x: x0 + 270, y: 862, size: 300 },
  ]
}

export const C2020: CockpitDesign = {
  era: '2020',
  title: 'GLASS NOMAD · CABIN',
  skin: {
    font: "'SF Pro Display', 'Inter', 'Helvetica Neue', 'Avenir Next', system-ui, sans-serif",
    label: '#e9ebff',
    plate: 'etched',
    plateColor: '#ffffff',
    knob: 'glass',
    lever: 'glass',
    screen: 'oled',
    metal: ['#13141c', '#2c2e3e', '#7d81a6'],
    counter: 'led',
    cablePlate: '#1a1c28',
    vco: ['#a08cff', '#5ef0c4', '#ff8f80'],
    glow: '#8fb4ff',
    ink: '#07080d',
    stroke: 0.5,
  },
  controls: [0, 1, 2].flatMap(cardOf),
  screens: [0, 1, 2].map((vco) => ({ vco, x: X0_2020(vco) + 18, y: 478, w: 272, h: 80, r: 18, show: 'clip' as const })),
  gauges: [],
  intakes: [0, 1, 2].map((vco) => ({ vco, x: X0_2020(vco) + 474, y: 514 })),
  glass: 'M 170 40 L 1430 40 Q 1546 40 1552 150 L 1556 318 Q 1558 404 1470 414 Q 800 452 130 414 Q 42 404 44 318 L 48 150 Q 54 40 170 40 Z',
  vp: { x: 800, y: 230 },
  sun: { x: 1260, y: -60 },
  atmosphere: { dust: 0.35, shafts: 0.4, grain: 0.12, scanlines: 0, emf: 0, vignette: 0.6, glass: 0.7, bloom: 0.7, tint: [0.78, 0.8, 1], depth: 2.2, trip: 0.08 },
  back: Back2020,
  front: Front2020,
  panelTexture: 'noise',
}
