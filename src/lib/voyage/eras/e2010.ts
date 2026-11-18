/**
 * The TENS: a flat-design liner of pure geometry -- a turquoise bow, an amber midships under an indigo app-bar bridge
 * with a floating action button, a coral stern -- two-tone blocks, circles and rounded rects on a tidy grid, every
 * part casting its 45° long shadow across the hull. Original flat / Material; nose to the right.
 */
import Hull2010 from '../../../components/voyage/Hull2010.vue'
import { pal, part, type Era } from '../ship'

export const E2010: Era = {
  id: '2010',
  label: '10s',
  title: 'LONG SHADOW',
  blurb: 'a flat-design liner casting forty-five-degree shadows',
  palettes: [
    pal('BOW', '#1abc9c', '#ffc107', '#e0f7f1', '#14323f', '#64ffda'),
    pal('MIDSHIPS', '#ffc107', '#ff7043', '#fff8e1', '#283593', '#ffe082'),
    pal('STERN', '#ff7043', '#1abc9c', '#fbe9e7', '#3b2030', '#ffab91'),
  ],
  ink: '#1b2631',
  stroke: 0.3,
  stripes: 'palette',
  glass: { fill: '#ecf0f1', opacity: 0.18, highlight: false },
  parts: [
    // ── BOW · VCO 1: turquoise ──
    part(0, 'perform', 'CARD VIEW', [290, -85, 590, 45], 'panel'),
    part(0, 'grain', 'NOSE TURBINE', [630, -60, 750, 60], 'turbine'),
    part(0, 'lfo', 'BEACON ARM', [610, -330, 710, -110], 'arm'),
    part(0, 'fx', 'SIGNAL DOME', [400, -290, 580, -150], 'up'),
    part(0, 'pitch', 'TRI THRUSTERS', [340, 165, 560, 280], 'bells', { n: 3, dir: 112 }),
    part(0, 'texture', 'DOT VENTS', [300, 75, 580, 135], 'row', { dir: 100 }),
    part(0, 'echo', 'GRID MAST', [260, -370, 370, -140], 'mast'),
    part(0, 'tone', 'NOSE FIN', [590, 145, 760, 290], 'delta', { flip: 'x' }),
    // ── MIDSHIPS · VCO 2: amber, under the bridge ──
    part(1, 'perform', 'BRIDGE BAR', [-150, -285, 160, -170], 'capsule'),
    part(1, 'grain', 'PINWHEEL', [-80, -100, 80, 60], 'pinwheel'),
    part(1, 'lfo', 'DROP LIGHT', [-60, 165, 60, 350], 'lantern', { dir: 90 }),
    part(1, 'fx', 'CAP DOME', [-70, -430, 90, -320], 'up'),
    part(1, 'pitch', 'BLOCK STACKS', [-200, -420, -90, -310], 'stacks', { n: 2 }),
    part(1, 'texture', 'PILL VENTS', [-190, 80, 190, 140], 'row', { dir: 80 }),
    part(1, 'echo', 'DISH', [110, -440, 220, -310], 'dish'),
    part(1, 'tone', 'KEEL', [80, 160, 260, 310], 'keel'),
    // ── STERN · VCO 3: coral ──
    part(2, 'perform', 'PORTHOLES', [-630, -70, -310, 40], 'ports'),
    part(2, 'grain', 'PROPELLER', [-820, -90, -680, 80], 'prop'),
    part(2, 'lfo', 'RUDDER', [-720, -370, -590, -120], 'rudder'),
    part(2, 'fx', 'STERN DOME', [-560, -290, -380, -150], 'up'),
    part(2, 'pitch', 'TWIN BELLS', [-820, 95, -700, 210], 'bells', { n: 2, dir: 180 }),
    part(2, 'texture', 'STERN VENTS', [-620, 80, -340, 140], 'row', { dir: 170 }),
    part(2, 'echo', 'WHISKERS', [-360, -360, -250, -140], 'whisker'),
    part(2, 'tone', 'KEEL FIN', [-560, 150, -380, 300], 'tail'),
  ],
  ports: [
    { vco: 0, x: 490, y: -290 },
    { vco: 1, x: 10, y: -430 },
    { vco: 2, x: -470, y: -290 },
  ],
  wake: [-810, -5],
  aura: [0, -40, 800, 290],
  hull: Hull2010,
  sky: {
    mode: 6,
    colors: ['#2c3e50', '#9b59b6', '#3498db', '#ecf0f1', '#f1c40f'],
    grain: 0,
    halftone: 0,
    misreg: 0,
    scanlines: 0,
    outlines: 0,
    rocks: 3,
  },
  hud: {
    bg: '#34495e',
    fg: '#ecf0f1',
    edge: ['#1abc9c', '#ffc107', '#ff7043'],
    font: "'Helvetica Neue', 'Avenir Next', sans-serif",
    radius: 4,
    hard: true,
  },
}
