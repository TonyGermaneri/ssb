/**
 * The SEVENTIES: the HX-77, a long-haul ore freighter out of a hard-SF concept painting -- a heavy engine block with
 * its reactor and three heat-blued nozzles, a habitat drum under a deck of weathered cargo containers, a wedge of a
 * command module whose three-pane windscreen is the cockpit's -- painted plate in harvest gold, avocado, brown and
 * burnt orange, a racing stripe, stencils, hazard bands, grime, and warm amber light in the windows. Original; nose to
 * the right.
 */
import Hull1970 from '../../../components/voyage/Hull1970.vue'
import Overlay1970 from '../../../components/voyage/Overlay1970.vue'
import { pal, part, type Era } from '../ship'

export const E1970: Era = {
  id: '1970',
  label: '70s',
  title: 'HX-77 DEEP SPACE HAULER',
  blurb: 'a long-haul ore freighter, eight months out, its windows amber',
  palettes: [
    pal('BOW', '#dcc28a', '#ee6a2a', '#f6e8c6', '#1c120a', '#ffb43d'),
    pal('MIDSHIPS', '#7a8a2e', '#a8c23c', '#e9e2b8', '#151708', '#d4f070'),
    pal('STERN', '#7c4522', '#f4b42e', '#f0d6a4', '#170d06', '#ffa040'),
  ],
  ink: '#1a120b',
  stroke: 0.3,
  partStroke: 0.32,
  glass: { fill: '#2c1a0a', opacity: 0.82, highlight: true },
  stripes: 'palette',
  parts: [
    // ── BOW · VCO 1: the command module ──
    part(0, 'perform', 'COMMAND DECK', [384, -144, 644, -32], 'screen'),
    part(0, 'grain', 'THRUSTER INTAKE', [654, -40, 770, 76], 'turbine'),
    part(0, 'lfo', 'NAV BEACON', [548, -330, 640, -170], 'arm'),
    part(0, 'fx', 'SENSOR DOME', [404, -272, 524, -180], 'up'),
    part(0, 'pitch', 'RCS JETS', [596, 98, 760, 214], 'bells', { dir: 90, n: 3 }),
    part(0, 'texture', 'COOLANT VENTS', [390, -14, 630, 42], 'row', { dir: 100 }),
    part(0, 'echo', 'RADAR DISH', [656, -304, 792, -92], 'dish'),
    part(0, 'tone', 'VENTRAL FIN', [384, 142, 576, 292], 'delta'),
    // ── MIDSHIPS · VCO 2: the habitat drum and the cargo deck ──
    part(1, 'perform', 'CREW DECK', [-214, -64, 110, 58], 'panel'),
    part(1, 'grain', 'CARGO WINCH', [150, -82, 312, 80], 'wheel'),
    part(1, 'lfo', 'CRANE ARM', [-290, -392, -180, -238], 'arm'),
    part(1, 'fx', 'BELLY BLISTER', [-90, 122, 90, 236], 'down'),
    part(1, 'pitch', 'HEAT STACKS', [-112, -358, 40, -236], 'stacks', { n: 3 }),
    part(1, 'texture', 'BLEED VALVES', [-214, 64, 110, 120], 'row', { dir: 100 }),
    part(1, 'echo', 'ANTENNA FARM', [116, -404, 226, -236], 'mast'),
    part(1, 'tone', 'RADIATOR VANE', [140, 112, 320, 300], 'wing'),
    // ── STERN · VCO 3: the engine block ──
    part(2, 'perform', 'REACTOR MONITOR', [-536, -70, -316, 50], 'screen'),
    part(2, 'grain', 'MAIN TURBINE', [-706, -96, -566, 44], 'turbine'),
    part(2, 'lfo', 'AIRBRAKE', [-716, 174, -604, 330], 'flap', { dir: 90 }),
    part(2, 'fx', 'REACTOR DOME', [-566, -318, -410, -202], 'up'),
    part(2, 'pitch', 'MAIN NOZZLES', [-820, -160, -730, 140], 'bells', { dir: 180, n: 3 }),
    part(2, 'texture', 'EXHAUST VENTS', [-536, 68, -316, 124], 'row', { dir: 180 }),
    part(2, 'echo', 'DEEP SPACE DISH', [-800, -420, -578, -214], 'dish'),
    part(2, 'tone', 'HEAT SINK', [-570, 176, -330, 320], 'keel'),
  ],
  ports: [
    { vco: 0, x: 464, y: -272 },
    { vco: 1, x: 0, y: 236 },
    { vco: 2, x: -488, y: -318 },
  ],
  wake: [-812, -10],
  aura: [0, -30, 800, 290],
  hull: Hull1970,
  overlay: Overlay1970,
  finish: { shade: 0.8, material: 'patina', materialOpacity: 0.35, tintMax: 0.35, plain: true, window: 'subtle', edge: '#2a2018', tintBlend: 'color' },
  sky: {
    mode: 2,
    colors: ['#1d1230', '#8a3b2a', '#f0a040', '#c8783a', '#f1d9a0'],
    grain: 0.7,
    halftone: 0,
    misreg: 0.3,
    scanlines: 0,
    outlines: 0,
    rocks: 2,
  },
  hud: { bg: '#2b1a10', fg: '#f3e2b8', edge: ['#ee6a2a', '#e3a52c', '#8a9a3a'], font: "'Futura', 'Avenir Next', sans-serif", radius: 10, hard: false, vco: ['#ee6a2a', '#a8c23c', '#f4b42e'] },
}
