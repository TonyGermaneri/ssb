/**
 * The NINETIES: a fat, pre-rendered hypercruiser -- a bulbous, chunky, organic-meets-mechanical bean of a ship in
 * teal, purple and lime, ray-traced chrome, bevelled seams and a big swoosh, warping through a CGI starfield.
 * Original game-box-art; nose to the right.
 */
import Hull1990 from '../../../components/voyage/Hull1990.vue'
import { pal, part, type Era } from '../ship'

export const E1990: Era = {
  id: '1990',
  label: '90s',
  title: 'HX-2K HYPERCRUISER',
  blurb: 'a chunky chrome bean warping through a rendered sky',
  palettes: [
    pal('BOW', '#17c9bf', '#7b2ff7', '#d6fff9', '#062a46', '#b8ff1f'),
    pal('MIDSHIPS', '#7d3ff2', '#18d8c9', '#f0e2ff', '#1a0a48', '#b8ff1f'),
    pal('STERN', '#93df24', '#2b5dff', '#f3ffd0', '#0e3318', '#ff3db8'),
  ],
  ink: '#110a2c',
  stroke: 1,
  stripes: 'palette',
  parts: [
    // ── BOW · VCO 1 ──
    part(0, 'perform', 'WRAP VISOR', [372, -140, 640, 0], 'capsule'),
    part(0, 'grain', 'NOSE TURBO', [652, -42, 784, 90], 'turbine'),
    part(0, 'lfo', 'EYE STALK', [540, -312, 650, -164], 'periscope'),
    part(0, 'fx', 'SENSOR BLISTER', [300, -322, 470, -182], 'bubble'),
    part(0, 'pitch', 'HOVER JETS', [290, 150, 440, 272], 'bells', { dir: 90, n: 2 }),
    part(0, 'texture', 'COOL GILLS', [380, 22, 560, 86], 'row', { dir: 150 }),
    part(0, 'echo', 'BUNNY EARS', [676, -264, 790, -116], 'whisker'),
    part(0, 'tone', 'CHIN FIN', [460, 128, 640, 312], 'tail'),
    // ── MIDSHIPS · VCO 2 ──
    part(1, 'perform', 'MEGA DECK', [-222, -182, 98, -42], 'panel'),
    part(1, 'grain', 'POWER HALO', [-252, 8, 62, 100], 'ring'),
    part(1, 'lfo', 'BEACON ARM', [128, -372, 240, -204], 'arm'),
    part(1, 'fx', 'BELLY BLISTER', [-160, 192, 40, 324], 'down'),
    part(1, 'pitch', 'TURBO STACKS', [-252, -364, -122, -222], 'stacks', { n: 2 }),
    part(1, 'texture', 'BIO VENTS', [104, -132, 214, 50], 'column', { dir: 160 }),
    part(1, 'echo', 'NET TOWER', [-62, -424, 70, -226], 'mast'),
    part(1, 'tone', 'SWOOP FIN', [70, 150, 232, 334], 'wing'),
    // ── STERN · VCO 3 ──
    part(2, 'perform', 'REAR VIEWER', [-612, -132, -332, 8], 'round'),
    part(2, 'grain', 'HYPER FAN', [-820, -124, -684, 12], 'turbine'),
    part(2, 'lfo', 'BELLY RUDDER', [-430, 160, -318, 314], 'rudder', { dir: 90 }),
    part(2, 'fx', 'AFT BLISTER', [-560, -304, -402, -172], 'up'),
    part(2, 'pitch', 'AFTERBURNERS', [-820, 70, -702, 196], 'bells', { dir: 180, n: 2 }),
    part(2, 'texture', 'EXHAUST GILLS', [-602, 36, -342, 100], 'row', { dir: 180 }),
    part(2, 'echo', 'SAT DISH', [-392, -364, -276, -196], 'dish'),
    part(2, 'tone', 'TAIL FIN', [-722, -428, -562, -150], 'tail', { flip: 'x' }),
  ],
  ports: [
    { vco: 0, x: 385, y: -322 },
    { vco: 1, x: -60, y: 324 },
    { vco: 2, x: -481, y: -304 },
  ],
  wake: [-812, 133],
  aura: [20, -10, 790, 270],
  hull: Hull1990,
  sky: {
    mode: 4,
    colors: ['#0b0d42', '#5a159a', '#7ef9ff', '#d4ff3f', '#ff5cf0'],
    grain: 0,
    halftone: 0,
    misreg: 0.4,
    scanlines: 0.6,
    outlines: 0,
    rocks: 2,
  },
  hud: { bg: '#15123c', fg: '#eafffb', edge: ['#17c9bf', '#9b5cff', '#b8ff1f'], font: "'Arial Black', 'Orbitron', sans-serif", radius: 14, hard: false },
}
