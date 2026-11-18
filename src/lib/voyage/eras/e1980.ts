/**
 * The EIGHTIES: the VR-84 VECTOR RUNNER -- a long, low wedge of black carbon with a raised canopy (the cockpit's own
 * six-sided windscreen), chrome bead lines along its chines, a laser grid etched into its flanks, magenta, cyan and
 * violet neon edge light, vector-wireframe accents, the sliced sunset reflected in its chrome band, and white-hot
 * afterburners, cruising over a synthwave grid at dusk. Original; nose to the right.
 */
import Hull1980 from '../../../components/voyage/Hull1980.vue'
import Overlay1980 from '../../../components/voyage/Overlay1980.vue'
import { pal, part, type Era } from '../ship'

export const E1980: Era = {
  id: '1980',
  label: '80s',
  title: 'VR-84 VECTOR RUNNER',
  blurb: 'a black neon wedge over a synthwave grid',
  palettes: [
    pal('BOW', '#3a1650', '#ff2bd6', '#ffc8f4', '#07020e', '#ff5ce1'),
    pal('MIDSHIPS', '#123a5a', '#00e5ff', '#c8fbff', '#02070f', '#3df2ff'),
    pal('STERN', '#2c1a5c', '#a462ff', '#e2d2ff', '#05021a', '#ffb02e'),
  ],
  ink: '#05030a',
  stroke: 0.4,
  partStroke: 0.45,
  stripes: 'palette',
  glass: { fill: '#120838', opacity: 0.92, highlight: true },
  parts: [
    // ── BOW · VCO 1: the nose ──
    part(0, 'perform', 'HUD VISOR', [290, -80, 530, 52], 'screen'),
    part(0, 'grain', 'RAM INTAKE', [548, -36, 652, 68], 'turbine'),
    part(0, 'lfo', 'PITOT PROBE', [690, -48, 820, 40], 'arm', { dir: 0, back: false }),
    part(0, 'fx', 'TARGET DOME', [340, -270, 480, -160], 'up'),
    part(0, 'pitch', 'RETRO JETS', [330, 112, 480, 228], 'bells', { dir: 90, n: 2 }),
    part(0, 'texture', 'PLASMA SLATS', [300, 54, 520, 110], 'row', { dir: 160 }),
    part(0, 'echo', 'LOCK-ON DISH', [500, -250, 620, -80], 'dish'),
    part(0, 'tone', 'CANARD', [600, 74, 770, 190], 'delta'),
    // ── MIDSHIPS · VCO 2: the canopy and the core ──
    part(1, 'perform', 'COCKPIT', [-60, -322, 250, -178], 'screen'),
    part(1, 'grain', 'CORE TURBINE', [-250, -120, -90, 40], 'turbine'),
    part(1, 'lfo', 'AIR BRAKE', [190, 108, 300, 280], 'flap', { dir: 90 }),
    part(1, 'fx', 'SPINE DOME', [-290, -262, -150, -152], 'up'),
    part(1, 'pitch', 'PHOTON PODS', [20, -140, 240, -20], 'bells', { dir: 180, n: 3, back: false }),
    part(1, 'texture', 'HEAT SINKS', [-60, 20, 240, 80], 'row', { dir: 150 }),
    part(1, 'echo', 'LASER RELAY', [-40, -440, 90, -330], 'mast'),
    part(1, 'tone', 'MAIN DELTA', [-250, 112, 80, 262], 'delta'),
    // ── STERN · VCO 3: the engines ──
    part(2, 'perform', 'REAR SCANNER', [-600, -110, -320, 30], 'screen'),
    part(2, 'grain', 'THRUST FAN', [-720, -40, -610, 70], 'turbine'),
    part(2, 'lfo', 'VENTRAL RUDDER', [-700, 112, -590, 300], 'rudder', { dir: 90 }),
    part(2, 'fx', 'AFT RADOME', [-560, -252, -410, -142], 'up'),
    part(2, 'pitch', 'AFTERBURNERS', [-820, -110, -730, 80], 'bells', { dir: 180, n: 2 }),
    part(2, 'texture', 'EXHAUST GRILLE', [-590, 46, -330, 104], 'row', { dir: 180 }),
    part(2, 'echo', 'UPLINK DISH', [-390, -300, -290, -150], 'dish'),
    part(2, 'tone', 'TAIL BLADE', [-744, -430, -566, -128], 'delta', { flip: 'y' }),
  ],
  ports: [
    { vco: 0, x: 410, y: -270 },
    { vco: 1, x: -220, y: -262 },
    { vco: 2, x: -485, y: -252 },
  ],
  wake: [-800, -14],
  aura: [30, -40, 790, 260],
  hull: Hull1980,
  overlay: Overlay1980,
  finish: { shade: 0.6, material: 'carbon', materialOpacity: 0.25, tintMax: 0.3, edge: '#ff2bd6' },
  sky: {
    mode: 3,
    colors: ['#0d0221', '#c2186b', '#ff2e7e', '#ffd23f', '#22e6ff'],
    grain: 0,
    halftone: 0,
    misreg: 0.8,
    scanlines: 1,
    outlines: 0,
    rocks: 1,
  },
  hud: { bg: '#0b0418', fg: '#e8fbff', edge: ['#ff2bd6', '#00e5ff', '#a462ff'], font: "'Orbitron', 'Futura', sans-serif", radius: 2, hard: false, vco: ['#ff2bd6', '#00e5ff', '#a462ff'] },
}
