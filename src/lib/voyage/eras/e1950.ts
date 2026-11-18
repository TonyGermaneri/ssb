/**
 * The FIFTIES: an atomic-age saucer run through by a candy-red rocket -- a chrome disc with a bubble canopy and a ring
 * of running lights, a finned booster behind it and a ray-gun nose ahead -- over a pulp-magazine night. Original
 * Googie; nose to the right.
 */
import Hull1950 from '../../../components/voyage/Hull1950.vue'
import { pal, part, type Era } from '../ship'

export const E1950: Era = {
  id: '1950',
  label: '50s',
  title: 'ATOMIC SAUCER',
  blurb: 'a chrome saucer on a candy-red rocket, straight off a pulp cover',
  palettes: [
    pal('BOW', '#e3263a', '#fff0d2', '#ffe3e6', '#13203f', '#ffd23f'),
    pal('MIDSHIPS', '#cdd6de', '#27b8b0', '#ffffff', '#0f2a3d', '#8dffb4'),
    pal('STERN', '#fff0d2', '#e3263a', '#fffaf0', '#1b1a3a', '#ff8a3d'),
  ],
  ink: '#121530',
  stroke: 1,
  stripes: 'palette',
  parts: [
    // ── BOW · VCO 1: the rocket's nose ──
    part(0, 'perform', 'FLIGHT DECK', [395, -72, 645, 38], 'capsule'),
    part(0, 'grain', 'ATOM SPINNER', [668, -58, 790, 60], 'pinwheel'),
    part(0, 'lfo', 'ROCKETSCOPE', [550, -300, 650, -80], 'periscope'),
    part(0, 'fx', 'STAR DOME', [405, -226, 540, -98], 'up'),
    part(0, 'pitch', 'RAY EMITTER', [640, 76, 800, 210], 'horn'),
    part(0, 'texture', 'ION JETS', [400, 40, 630, 96], 'row', { dir: 175 }),
    part(0, 'echo', 'FEELERS', [662, -280, 780, -62], 'whisker'),
    part(0, 'tone', 'CANARD FIN', [440, 96, 620, 240], 'delta'),
    // ── MIDSHIPS · VCO 2: the saucer ──
    part(1, 'perform', 'OBSERVATION DECK', [-210, -136, 110, -26], 'ports'),
    part(1, 'grain', 'RUNNING LIGHTS', [-230, 48, 130, 140], 'ring'),
    part(1, 'lfo', 'BEACON ARM', [-322, -350, -215, -80], 'arm'),
    part(1, 'fx', 'BUBBLE CANOPY', [-150, -340, 50, -170], 'bubble'),
    part(1, 'pitch', 'LANDING JETS', [-160, 160, 60, 270], 'bells', { dir: 90, n: 3 }),
    part(1, 'texture', 'RIM VENTS', [150, -14, 390, 52], 'row', { dir: 100 }),
    part(1, 'echo', 'ATOM MAST', [115, -370, 225, -110], 'mast'),
    part(1, 'tone', 'BOOMERANG KEEL', [150, 100, 350, 250], 'keel'),
    // ── STERN · VCO 3: the finned booster ──
    part(2, 'perform', 'TELEVISOR', [-715, -70, -470, 40], 'panel'),
    part(2, 'grain', 'ATOMIC TURBINE', [-445, 64, -305, 204], 'turbine'),
    part(2, 'lfo', 'VENTRAL RUDDER', [-740, 100, -580, 300], 'rudder', { dir: 90 }),
    part(2, 'fx', 'REACTOR DOME', [-540, -226, -400, -98], 'up'),
    part(2, 'pitch', 'AFTERBURNERS', [-820, -80, -720, 90], 'bells', { dir: 180, n: 2 }),
    part(2, 'texture', 'SPARK TRAIL', [-700, 44, -480, 100], 'row', { dir: 180 }),
    part(2, 'echo', 'TESLA COIL', [-565, 100, -455, 290], 'spring', { dir: 90 }),
    part(2, 'tone', 'TAIL FIN', [-770, -340, -560, -90], 'tail', { flip: 'x' }),
  ],
  ports: [
    { vco: 0, x: 472, y: -226 },
    { vco: 1, x: -50, y: -340 },
    { vco: 2, x: -470, y: -226 },
  ],
  wake: [-800, 5],
  aura: [0, 0, 800, 250],
  hull: Hull1950,
  sky: {
    mode: 0,
    colors: ['#14214d', '#7086c8', '#f2a541', '#c8553d', '#f6ecd0'],
    grain: 0.8,
    halftone: 1,
    misreg: 0.6,
    scanlines: 0,
    outlines: 0,
    rocks: 0,
  },
  hud: { bg: '#121530', fg: '#fff0d2', edge: ['#e3263a', '#27b8b0', '#ffd23f'], font: "'Futura', 'Avenir Next', sans-serif", radius: 16, hard: true },
}
