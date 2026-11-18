/**
 * The TENS: the LONG SHADOW liner as a flat-design poster -- an indigo hull (the cockpit's bulkhead, from outside)
 * carrying three material cards, one per VCO (a turquoise bow, an amber midships, a coral stern), each with its app
 * bar; a rounded app-icon bridge window on a tower amidships with a FAB at its foot; a turquoise nose cap split flat
 * at 45°; stripes of the three colours along the keel -- and every card, chip, disc and dome casting its long 45°
 * shadow across the hull and on out into space, as the sky's planets do. Original flat / Material; nose to the right.
 */
import Hull2010 from '../../../components/voyage/Hull2010.vue'
import Overlay2010 from '../../../components/voyage/Overlay2010.vue'
import { pal, part, type Era } from '../ship'

export const E2010: Era = {
  id: '2010',
  label: '10s',
  title: 'LONG SHADOW',
  blurb: 'a flat-design liner of cards and circles, every one casting its forty-five-degree shadow',
  palettes: [
    pal('BOW', '#1abc9c', '#ffb300', '#e0f7f1', '#0b3b3c', '#64ffda'),
    pal('MIDSHIPS', '#ffb300', '#ff7043', '#fff8e1', '#1a237e', '#ffe082'),
    pal('STERN', '#ff7043', '#1abc9c', '#fbe9e7', '#3e1f2b', '#ffab91'),
  ],
  ink: '#1a237e',
  stroke: 0.3,
  partStroke: 0.32,
  stripes: 'palette',
  glass: { fill: '#0f1658', opacity: 1, highlight: false },
  parts: [
    // ── BOW · VCO 1: the turquoise card, the nose cap ──
    part(0, 'perform', 'CARD VIEW', [292, -100, 596, 26], 'panel'),
    part(0, 'grain', 'NOSE TURBINE', [642, -72, 782, 68], 'turbine'),
    part(0, 'lfo', 'BEACON ARM', [624, -372, 724, -150], 'arm'),
    part(0, 'fx', 'SIGNAL DOME', [416, -300, 596, -180], 'up'),
    part(0, 'pitch', 'TRI THRUSTERS', [330, 178, 566, 300], 'bells', { n: 3, dir: 108 }),
    part(0, 'texture', 'DOT VENTS', [292, 62, 596, 120], 'row', { dir: 100 }),
    part(0, 'echo', 'GRID MAST', [292, -408, 396, -172], 'mast'),
    part(0, 'tone', 'NOSE FIN', [596, 150, 772, 300], 'delta', { flip: 'x' }),
    // ── MIDSHIPS · VCO 2: the amber card under the app-icon bridge ──
    part(1, 'perform', 'BRIDGE', [-128, -398, 128, -184], 'panel'),
    part(1, 'grain', 'PINWHEEL', [-88, -108, 88, 68], 'pinwheel'),
    part(1, 'lfo', 'DROP LIGHT', [-52, 182, 58, 362], 'lantern', { dir: 90 }),
    part(1, 'fx', 'BELLY DOME', [-262, 192, -90, 300], 'down'),
    part(1, 'pitch', 'BLOCK STACKS', [-282, -330, -178, -172], 'stacks', { n: 2 }),
    part(1, 'texture', 'PILL VENTS', [-204, 92, 204, 148], 'row', { dir: 80 }),
    part(1, 'echo', 'DISH', [180, -336, 280, -172], 'dish'),
    part(1, 'tone', 'KEEL', [90, 176, 262, 322], 'keel'),
    // ── STERN · VCO 3: the coral card, the engine block ──
    part(2, 'perform', 'PORTHOLES', [-668, -100, -300, 26], 'ports'),
    part(2, 'grain', 'PROPELLER', [-820, -88, -690, 82], 'prop'),
    part(2, 'lfo', 'RUDDER', [-724, -380, -604, -150], 'rudder'),
    part(2, 'fx', 'STERN DOME', [-584, -300, -404, -180], 'up'),
    part(2, 'pitch', 'TWIN BELLS', [-820, 98, -700, 214], 'bells', { n: 2, dir: 180 }),
    part(2, 'texture', 'STERN VENTS', [-668, 62, -300, 120], 'row', { dir: 170 }),
    part(2, 'echo', 'WHISKERS', [-392, -380, -296, -172], 'whisker'),
    part(2, 'tone', 'KEEL FIN', [-590, 176, -390, 320], 'tail'),
  ],
  ports: [
    { vco: 0, x: 506, y: -300 },
    { vco: 1, x: -176, y: 300 },
    { vco: 2, x: -494, y: -300 },
  ],
  wake: [-812, -5],
  aura: [0, -40, 800, 300],
  hull: Hull2010,
  overlay: Overlay2010,
  // flat: no shading over the parts, only the domes' tint held back so the glass stays a clean colour
  finish: { shade: 0, tintMax: 0.3, tintBlend: 'color', plain: true },
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
    bg: '#1a237e',
    fg: '#ffffff',
    edge: ['#1abc9c', '#ffb300', '#ff7043'],
    font: "'Roboto', 'Helvetica Neue', 'Avenir Next', sans-serif",
    radius: 4,
    hard: true,
  },
}
