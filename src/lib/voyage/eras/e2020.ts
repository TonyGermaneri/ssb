/**
 * The TWENTIES: a dark-mode, generative-era cruiser -- a graphite pebble under frosted glass, gradient-tinted glass
 * cards per section (coral, mint, violet, with electric blue between), pill shapes, soft underglows -- drifting through
 * a mesh-gradient aurora. Original; nose to the right.
 */
import Hull2020 from '../../../components/voyage/Hull2020.vue'
import { pal, part, type Era } from '../ship'

export const E2020: Era = {
  id: '2020',
  label: '20s',
  title: 'GLASS NOMAD',
  blurb: 'a frosted-glass cruiser in a mesh-gradient aurora',
  palettes: [
    pal('BOW', '#a08cff', '#7b5cff', '#ece8ff', '#141127', '#4d7cff'),
    pal('MIDSHIPS', '#5ef0c4', '#2fc9a0', '#e2fff6', '#0a1d1b', '#3d8bff'),
    pal('STERN', '#ff8f80', '#ff5f72', '#ffe8e3', '#251012', '#ffb48c'),
  ],
  ink: '#0b0c12',
  stroke: 0.5,
  stripes: 'palette',
  parts: [
    // ── BOW · VCO 1 ──
    part(0, 'perform', 'FOCUS PANE', [300, -110, 590, 14], 'capsule'),
    part(0, 'grain', 'HALO RING', [640, -60, 790, 40], 'ring'),
    part(0, 'lfo', 'LIGHT ARM', [300, -360, 410, -170], 'arm', { dir: -90 }),
    part(0, 'fx', 'GLASS BUBBLE', [440, -292, 610, -152], 'bubble'),
    part(0, 'pitch', 'LIFT JETS', [612, 66, 732, 196], 'bells', { dir: 90, n: 2 }),
    part(0, 'texture', 'AIR SLOTS', [300, 34, 580, 94], 'row', { dir: 95 }),
    part(0, 'echo', 'SIGNAL WHISKER', [636, -330, 746, -112], 'whisker'),
    part(0, 'tone', 'GLASS VANE', [330, 116, 570, 270], 'delta'),
    // ── MIDSHIPS · VCO 2 ──
    part(1, 'perform', 'GLASS DECK', [-150, -330, 160, -200], 'panel'),
    part(1, 'grain', 'CORE TURBINE', [-40, -104, 152, 88], 'turbine'),
    part(1, 'lfo', 'PENDANT', [-222, 150, -112, 330], 'lantern', { dir: 90 }),
    part(1, 'fx', 'DROP DOME', [110, 128, 280, 248], 'down'),
    part(1, 'pitch', 'ION STACKS', [-262, -300, -170, -112], 'bells', { dir: -90, n: 2 }),
    part(1, 'texture', 'MIST VENTS', [-200, -106, -90, 108], 'column', { dir: -150 }),
    part(1, 'echo', 'SOFT DISH', [192, -330, 290, -146], 'dish'),
    part(1, 'tone', 'GLASS KEEL', [-92, 128, 60, 262], 'keel'),
    // ── STERN · VCO 3 ──
    part(2, 'perform', 'STERN LIGHTS', [-560, -104, -290, 10], 'ports'),
    part(2, 'grain', 'AFT TURBINE', [-664, -304, -520, -156], 'turbine'),
    part(2, 'lfo', 'TRIM FLAP', [-466, -336, -366, -140], 'flap', { dir: -90 }),
    part(2, 'fx', 'UNDER DOME', [-460, 130, -300, 244], 'down'),
    part(2, 'pitch', 'TWIN DRIVES', [-816, -96, -694, 76], 'bells', { dir: 180, n: 2 }),
    part(2, 'texture', 'WAKE VENTS', [-640, 30, -380, 90], 'row', { dir: 160 }),
    part(2, 'echo', 'AFT WHISKER', [-362, -362, -270, -146], 'whisker'),
    part(2, 'tone', 'TAIL FIN', [-700, 128, -480, 290], 'tail'),
  ],
  ports: [
    { vco: 0, x: 525, y: -292 },
    { vco: 1, x: 195, y: 248 },
    { vco: 2, x: -380, y: 244 },
  ],
  wake: [-806, -10],
  aura: [40, -20, 790, 240],
  hull: Hull2020,
  sky: {
    mode: 7,
    colors: ['#07070d', '#5b3cff', '#14b8a6', '#ff5f72', '#2f6bff'],
    grain: 0.3,
    halftone: 0,
    misreg: 0.15,
    scanlines: 0,
    outlines: 0,
    rocks: 2,
  },
  hud: {
    bg: '#12131b',
    fg: '#eef0ff',
    edge: ['#a08cff', '#5ef0c4', '#ff8f80'],
    font: "system-ui, 'SF Pro Display', 'Helvetica Neue', 'Avenir Next', sans-serif",
    radius: 18,
    hard: false,
  },
}
