/**
 * The NOUGHTIES: the AQUAPOD as candy you want to eat -- one long jelly bean of translucent gel plastic, Bondi blue
 * at the bow and tangerine at the stern, a lime orb set amidships in a fat brushed-aluminium bezel, a pearl-white
 * pinstriped belly under a brushed seam, bubbles caught in the gel, huge wet speculars, a pill of a canopy like the
 * flight pod's, aluminium caps and collars, a BETA starburst, and the Aqua planet shining back off its belly. Glossy,
 * clean, delicious; original Y2K. Nose to the right.
 */
import Hull2000 from '../../../components/voyage/Hull2000.vue'
import Overlay2000 from '../../../components/voyage/Overlay2000.vue'
import { pal, part, type Era } from '../ship'

export const E2000: Era = {
  id: '2000',
  label: '00s',
  title: 'AQUAPOD 2.0 BETA',
  blurb: 'a jelly-bean pod of candy gel, forever in beta',
  palettes: [
    pal('BOW', '#1aaee6', '#5fd4ff', '#effbff', '#08375e', '#8ff3ff'),
    pal('MIDSHIPS', '#8acf1c', '#c8f24e', '#f7ffe8', '#1f4a07', '#d9ff7a'),
    pal('STERN', '#ff8a1a', '#ffb347', '#fff4e6', '#5a2203', '#ffd27a'),
  ],
  ink: '#1c3b5a',
  stroke: 0.5,
  partStroke: 0.32,
  glass: { fill: '#bfefff', opacity: 0.35, highlight: true },
  stripes: 'palette',
  parts: [
    // ── BOW · VCO 1: the Bondi-blue gel ──
    part(0, 'perform', 'PILL CANOPY', [356, -152, 700, 10], 'capsule'),
    part(0, 'grain', 'CANDY SPINNER', [712, -58, 820, 50], 'pinwheel'),
    part(0, 'lfo', 'BLINK ARM', [620, -344, 720, -176], 'arm'),
    part(0, 'fx', 'GEL BUBBLE', [420, -360, 590, -206], 'bubble'),
    part(0, 'pitch', 'THRUSTER TRIO', [380, 150, 580, 280], 'bells', { n: 3, dir: 108 }),
    part(0, 'texture', 'FIZZ STRIP', [380, 30, 620, 90], 'row', { dir: 100 }),
    part(0, 'echo', 'FEED WHISKER', [262, -372, 380, -196], 'whisker'),
    part(0, 'tone', 'NOSE FIN', [600, 112, 780, 282], 'delta', { flip: 'x' }),
    // ── MIDSHIPS · VCO 2: the lime orb in its aluminium bezel ──
    part(1, 'perform', 'ORB WINDOW', [-180, -136, 100, 120], 'round'),
    part(1, 'grain', 'HALO RING', [-196, 144, 116, 212], 'ring'),
    part(1, 'lfo', 'GLO LANTERN', [-100, 244, 20, 396], 'lantern', { dir: 90 }),
    part(1, 'fx', 'GUMDROP DOME', [-140, -428, 60, -276], 'bubble'),
    part(1, 'pitch', 'GLOSS STACKS', [136, -336, 246, -186], 'stacks', { n: 2 }),
    part(1, 'texture', 'BUBBLE TUBE', [220, -150, 312, 100], 'column', { dir: -70 }),
    part(1, 'echo', 'SIGNAL MAST', [-300, -404, -190, -190], 'mast'),
    part(1, 'tone', 'JELLY KEEL', [170, 124, 340, 300], 'keel'),
    // ── STERN · VCO 3: the tangerine gel ──
    part(2, 'perform', 'CANDY CAPSULE', [-650, -132, -330, 30], 'capsule'),
    part(2, 'grain', 'ION TURBINE', [-820, -76, -680, 64], 'turbine'),
    part(2, 'lfo', 'TAIL FLAP', [-720, -352, -610, -142], 'flap'),
    part(2, 'fx', 'FIZZ DOME', [-574, -350, -404, -196], 'bubble'),
    part(2, 'pitch', 'TWIN JETS', [-700, 112, -570, 242], 'bells', { n: 2, dir: 116 }),
    part(2, 'texture', 'BUBBLE WAKE', [-566, 48, -336, 108], 'row', { dir: 170 }),
    part(2, 'echo', 'PODCAST DISH', [-404, -384, -308, -190], 'dish'),
    part(2, 'tone', 'TAIL FIN', [-540, 150, -370, 310], 'tail'),
  ],
  ports: [
    { vco: 0, x: 505, y: -360 },
    { vco: 1, x: -40, y: -428 },
    { vco: 2, x: -489, y: -350 },
  ],
  wake: [-815, -6],
  aura: [0, 0, 800, 270],
  hull: Hull2000,
  overlay: Overlay2000,
  finish: { shade: 0.75, tintMax: 0.3 },
  sky: {
    mode: 5,
    colors: ['#0a3a8c', '#4fb4ff', '#0b2f73', '#9fe9ff', '#c8ff6a'],
    grain: 0,
    halftone: 0,
    misreg: 0.1,
    scanlines: 0,
    outlines: 0,
    rocks: 2,
  },
  hud: {
    bg: '#0e2f63',
    fg: '#eaf6ff',
    edge: ['#1aaee6', '#8acf1c', '#ff8a1a'],
    font: "'Lucida Grande', 'Helvetica Neue', 'Orbitron', sans-serif",
    radius: 14,
    hard: false,
  },
}
