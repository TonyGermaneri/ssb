/**
 * The NOUGHTIES: a jelly-bean pod ship of translucent candy plastic -- a Bondi-blue bow, a lime orb amidships in a
 * brushed-aluminium bezel, a tangerine stern -- with white pearl bellies, big specular gloss and a BETA sticker,
 * gliding over a gleaming Aqua planet. Original Y2K / Web 2.0; nose to the right.
 */
import Hull2000 from '../../../components/voyage/Hull2000.vue'
import { pal, part, type Era } from '../ship'

export const E2000: Era = {
  id: '2000',
  label: '00s',
  title: 'AQUAPOD 2.0 BETA',
  blurb: 'a candy-gloss jelly pod, forever in beta',
  palettes: [
    pal('BOW', '#1aaee6', '#5fd4ff', '#effbff', '#08375e', '#8ff3ff'),
    pal('MIDSHIPS', '#8acf1c', '#c8f24e', '#f7ffe8', '#1f4a07', '#d9ff7a'),
    pal('STERN', '#ff8a1a', '#ffb347', '#fff4e6', '#5a2203', '#ffd27a'),
  ],
  ink: '#1c3b5a',
  stroke: 0.5,
  parts: [
    // ── BOW · VCO 1: the Bondi-blue egg ──
    part(0, 'perform', 'JELLY VIEWPORT', [330, -75, 630, 55], 'capsule'),
    part(0, 'grain', 'CANDY SPINNER', [690, -60, 810, 60], 'pinwheel'),
    part(0, 'lfo', 'BLINK ARM', [650, -330, 750, -125], 'arm'),
    part(0, 'fx', 'GEL BUBBLE', [420, -340, 600, -170], 'bubble'),
    part(0, 'pitch', 'THRUSTER TRIO', [380, 150, 580, 280], 'bells', { n: 3, dir: 112 }),
    part(0, 'texture', 'FIZZ STRIP', [340, 75, 600, 135], 'row', { dir: 100 }),
    part(0, 'echo', 'FEED WHISKER', [250, -360, 370, -140], 'whisker'),
    part(0, 'tone', 'NOSE FIN', [600, 110, 780, 280], 'delta', { flip: 'x' }),
    // ── MIDSHIPS · VCO 2: the lime orb ──
    part(1, 'perform', 'ORB WINDOW', [-180, -95, 95, 60], 'round'),
    part(1, 'grain', 'HALO RING', [-190, 90, 150, 170], 'ring'),
    part(1, 'lfo', 'GLO LANTERN', [-60, 200, 60, 370], 'lantern', { dir: 90 }),
    part(1, 'fx', 'GUMDROP DOME', [-100, -390, 90, -205], 'bubble'),
    part(1, 'pitch', 'GLOSS STACKS', [130, -310, 240, -120], 'stacks', { n: 2 }),
    part(1, 'texture', 'BUBBLE TUBE', [100, -110, 190, 80], 'column', { dir: -60 }),
    part(1, 'echo', 'SIGNAL MAST', [-250, -370, -140, -140], 'mast'),
    part(1, 'tone', 'JELLY KEEL', [160, 110, 330, 290], 'keel'),
    // ── STERN · VCO 3: the tangerine pod ──
    part(2, 'perform', 'CANDY CAPSULE', [-620, -75, -330, 55], 'capsule'),
    part(2, 'grain', 'ION TURBINE', [-820, -80, -670, 70], 'turbine'),
    part(2, 'lfo', 'TAIL FLAP', [-720, -340, -610, -100], 'flap'),
    part(2, 'fx', 'FIZZ DOME', [-560, -320, -390, -150], 'bubble'),
    part(2, 'pitch', 'TWIN JETS', [-700, 110, -570, 240], 'bells', { n: 2, dir: 118 }),
    part(2, 'texture', 'BUBBLE WAKE', [-560, 75, -330, 135], 'row', { dir: 170 }),
    part(2, 'echo', 'PODCAST DISH', [-390, -360, -260, -140], 'dish'),
    part(2, 'tone', 'TAIL FIN', [-540, 150, -370, 310], 'tail'),
  ],
  ports: [
    { vco: 0, x: 510, y: -340 },
    { vco: 1, x: -5, y: -390 },
    { vco: 2, x: -475, y: -320 },
  ],
  wake: [-815, -5],
  aura: [0, 0, 800, 260],
  hull: Hull2000,
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
