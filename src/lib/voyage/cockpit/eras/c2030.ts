/**
 * The THIRTIES' cockpit: the STEEL STARSHIP's flight deck -- a two-pane trapezoid windscreen split by a slim
 * stainless pillar with the Earth's limb glowing below it, a black Alcantara glareshield with caution lamps and a
 * holographic flight strip, black heat-shield hex tiles on the walls, and an instrument panel of brushed stainless,
 * matte composite and carbon in three bays, one per VCO (BOW, MIDSHIPS, STERN). Real hardware: guarded three-way
 * toggles for the tone, knurled machined knobs, a trim crank for POS, a throttle quadrant of four carbon levers
 * (RATE detented through the tempo's divisions), a side-stick for PITCH, short-throw sliders, the garden's digits in
 * OLED counters, and a test umbilical plugged into the ECHO's tempo jacks.
 */
import Back2030 from '../../../../components/cockpit/eras/Back2030.vue'
import Front2030 from '../../../../components/cockpit/eras/Front2030.vue'
import type { CockpitDesign, ControlSpec } from '../design'

/** each bay's left edge (a bay is 512 wide, 8 between) */
const X0 = (vco: number) => 24 + vco * 520

function bayOf(vco: number): ControlSpec[] {
  const x0 = X0(vco)
  const levers = (['rate', 'vol', 'depth', 'feedback'] as const).map((param, k) => ({ vco, param, kind: 'lever' as const, x: x0 + 178 + k * 56, y: 760, size: 64 }))
  return [
    // the top band: the garden's digits
    { vco, param: 'steps', kind: 'counter', x: x0 + 386, y: 518, size: 1 },
    { vco, param: 'hits', kind: 'counter', x: x0 + 458, y: 518, size: 1 },
    // the middle band: guarded toggles, machined knobs, the trim crank
    { vco, param: 'tilt', kind: 'toggle', x: x0 + 32, y: 612, size: 1 },
    { vco, param: 'mids', kind: 'toggle', x: x0 + 80, y: 612, size: 1 },
    { vco, param: 'size', kind: 'knob', x: x0 + 142, y: 614, size: 16 },
    { vco, param: 'length', kind: 'knob', x: x0 + 202, y: 614, size: 16 },
    { vco, param: 'pos', kind: 'crank', x: x0 + 452, y: 616, size: 20 },
    // the low band: short-throw sliders, two more knobs, the throttle quadrant, the side-stick
    { vco, param: 'spray', kind: 'slider', x: x0 + 24, y: 740, size: 80 },
    { vco, param: 'detune', kind: 'slider', x: x0 + 68, y: 740, size: 80 },
    { vco, param: 'filter', kind: 'knob', x: x0 + 122, y: 704, size: 15 },
    { vco, param: 'reverb', kind: 'knob', x: x0 + 122, y: 774, size: 15 },
    ...levers,
    { vco, param: 'pitchX', kind: 'stick', x: x0 + 424, y: 752, size: 32 },
    // the umbilical, along the bottom
    { vco, param: 'time', kind: 'cable', lead: 'left', x: x0 + 300, y: 864, size: 280 },
  ]
}

/** a pane: a trapezoid with eased corners (mirrored for the right) */
const LEFT = 'M 252 60 L 774 48 Q 788 48 788 62 L 788 390 Q 788 404 774 404 L 120 386 Q 100 385 106 366 L 236 74 Q 241 61 252 60 Z'
const mirror = (d: string) => d.replace(/(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g, (_, x: string, y: string) => `${1600 - +x} ${y}`)

export const C2030: CockpitDesign = {
  era: '2030',
  title: 'STEEL STARSHIP · FLIGHT DECK',
  skin: {
    font: "'DIN Alternate', 'Eurostile', 'Helvetica Neue', Arial, sans-serif",
    label: '#e4e7ea',
    plate: 'silk',
    plateColor: '#e4e7ea',
    knob: 'chrome',
    lever: 'carbon',
    screen: 'holo',
    metal: ['#25282c', '#8a9097', '#e6eaee'],
    vco: ['#8fdcff', '#ffd27a', '#ff9a62'],
    glow: '#9fe3ff',
    ink: '#0a0b0d',
    stroke: 0.6,
  },
  controls: [0, 1, 2].flatMap(bayOf),
  screens: [0, 1, 2].map((vco) => ({ vco, x: X0(vco) + 16, y: 482, w: 240, h: 76, r: 4, show: 'clip' as const })),
  gauges: [0, 1, 2].flatMap((vco) => [
    { vco, x: X0(vco) + 300, y: 520, r: 26, show: 'level' as const, label: 'LVL' },
    { vco, x: X0(vco) + 352, y: 616, r: 22, show: 'beam' as const, label: 'BEAM' },
  ]),
  intakes: [0, 1, 2].map((vco) => ({ vco, x: X0(vco) + 272, y: 616 })),
  glass: `${LEFT} ${mirror(LEFT)}`,
  vp: { x: 800, y: 226 },
  sun: { x: 120, y: -140 },
  atmosphere: { dust: 0.4, shafts: 0.75, grain: 0.16, scanlines: 0, emf: 0, vignette: 0.8, glass: 0.45, bloom: 0.6, tint: [0.96, 0.98, 1], depth: 2.6, trip: 0 },
  back: Back2030,
  front: Front2030,
  panelTexture: 'brushed',
}
