/**
 * The SEVENTIES: a long, chunky deep-space hauler off a paperback cover -- a wedge of a command module, a spine
 * stacked with cargo pods, a great engine block with its turbines and nozzles -- in harvest gold, avocado, brown and
 * burnt orange under a racing stripe, through an airbrushed sky. Original; nose to the right.
 */
import Hull1970 from '../../../components/voyage/Hull1970.vue'
import { pal, part, type Era } from '../ship'

export const E1970: Era = {
  id: '1970',
  label: '70s',
  title: 'DEEP SPACE HAULER',
  blurb: 'a long-haul freighter in harvest gold, off a paperback cover',
  palettes: [
    pal('BOW', '#efdfb8', '#d9622b', '#fff6dc', '#2b1a10', '#ffb627'),
    pal('MIDSHIPS', '#7d8c34', '#e3a52c', '#f1e6b4', '#22200e', '#c9ec6a'),
    pal('STERN', '#7a4a26', '#e06a2c', '#f0d6a4', '#1e120a', '#ff8a2e'),
  ],
  ink: '#26170c',
  stroke: 1,
  stripes: 'palette',
  parts: [
    // ── BOW · VCO 1: the command module ──
    part(0, 'perform', 'COMMAND DECK', [380, -140, 640, -30], 'screen'),
    part(0, 'grain', 'THRUSTER INTAKE', [652, -36, 772, 84], 'turbine'),
    part(0, 'lfo', 'SCANNER', [540, -330, 640, -160], 'periscope'),
    part(0, 'fx', 'SENSOR DOME', [395, -270, 525, -162], 'up'),
    part(0, 'pitch', 'RCS JETS', [590, 92, 760, 220], 'bells', { dir: 90, n: 3 }),
    part(0, 'texture', 'COOLANT VENTS', [390, -14, 630, 46], 'row', { dir: 100 }),
    part(0, 'echo', 'RADAR DISH', [650, -300, 790, -86], 'dish'),
    part(0, 'tone', 'VENTRAL FIN', [380, 140, 575, 290], 'delta'),
    // ── MIDSHIPS · VCO 2: the cargo spine ──
    part(1, 'perform', 'CREW DECK', [-210, -60, 110, 56], 'panel'),
    part(1, 'grain', 'CARGO WINCH', [150, -80, 310, 80], 'wheel'),
    part(1, 'lfo', 'CRANE ARM', [-290, -380, -180, -220], 'arm'),
    part(1, 'fx', 'BELLY BLISTER', [-90, 120, 90, 236], 'down'),
    part(1, 'pitch', 'HEAT STACKS', [-110, -350, 40, -226], 'stacks', { n: 3 }),
    part(1, 'texture', 'BLEED VALVES', [-200, 62, 100, 118], 'row', { dir: 100 }),
    part(1, 'echo', 'ANTENNA FARM', [120, -400, 230, -226], 'mast'),
    part(1, 'tone', 'RADIATOR VANE', [140, 110, 320, 300], 'wing'),
    // ── STERN · VCO 3: the engine block ──
    part(2, 'perform', 'REACTOR MONITOR', [-560, -64, -305, 52], 'screen'),
    part(2, 'grain', 'MAIN TURBINE', [-725, -90, -575, 60], 'turbine'),
    part(2, 'lfo', 'AIRBRAKE', [-720, 176, -600, 330], 'flap', { dir: 90 }),
    part(2, 'fx', 'REACTOR DOME', [-560, -320, -400, -200], 'up'),
    part(2, 'pitch', 'MAIN NOZZLES', [-820, -170, -730, 150], 'bells', { dir: 180, n: 3 }),
    part(2, 'texture', 'EXHAUST VENTS', [-560, 70, -320, 128], 'row', { dir: 180 }),
    part(2, 'echo', 'DEEP SPACE DISH', [-800, -420, -575, -196], 'dish'),
    part(2, 'tone', 'HEAT SINK', [-580, 178, -330, 320], 'keel'),
  ],
  ports: [
    { vco: 0, x: 460, y: -270 },
    { vco: 1, x: 0, y: 236 },
    { vco: 2, x: -480, y: -320 },
  ],
  wake: [-812, -10],
  aura: [0, -30, 800, 290],
  hull: Hull1970,
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
  hud: { bg: '#2b1a10', fg: '#f3e2b8', edge: ['#d9622b', '#e3a52c', '#7d8c34'], font: "'Futura', 'Avenir Next', sans-serif", radius: 10, hard: false },
}
