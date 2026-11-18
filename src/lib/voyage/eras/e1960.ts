/**
 * The SIXTIES: a fat, kindly technicolor sub with a bridge, daisies on the hull and a groovy band along it, sailing a
 * screenprinted sky. Original pop-art; nose to the right.
 */
import Hull1960 from '../../../components/voyage/Hull1960.vue'
import { pal, part, type Era } from '../ship'

export const E1960: Era = {
  id: '1960',
  label: '60s',
  title: 'S·S·B DREAMBOAT',
  blurb: 'a technicolor sub in a screenprinted sky',
  palettes: [
    pal('BOW', '#ffd21f', '#ff2e88', '#fff6c2', '#3b0a4f', '#ff7a1a'),
    pal('MIDSHIPS', '#2fe0c4', '#7a3cff', '#e6fff8', '#08264d', '#a6ff2e'),
    pal('STERN', '#ff6a3d', '#ffe600', '#ffe3f1', '#4a0b2e', '#ff3df0'),
  ],
  ink: '#241036',
  stroke: 1,
  parts: [
    // ── BOW · VCO 1 ──
    part(0, 'perform', 'BOW VIEWPORT', [300, -80, 600, 70], 'capsule'),
    part(0, 'grain', 'NOSE SPINNER', [690, -58, 810, 62], 'pinwheel'),
    part(0, 'lfo', 'PERISCOPE', [296, -380, 404, -168], 'periscope'),
    part(0, 'fx', 'CRYSTAL DOME', [440, -300, 620, -160], 'up'),
    part(0, 'pitch', 'SPIRAL HORN', [600, 104, 744, 244], 'horn', { dir: 90 }),
    part(0, 'texture', 'BUBBLE JETS', [300, 90, 560, 156], 'row', { dir: 90 }),
    part(0, 'echo', 'WHISKER AERIAL', [636, -360, 740, -132], 'whisker'),
    part(0, 'tone', 'KEEL FIN', [330, 178, 570, 316], 'keel'),
    // ── MIDSHIPS · VCO 2 ──
    part(1, 'perform', 'BRIDGE WINDOW', [-126, -326, 196, -206], 'panel'),
    part(1, 'grain', 'PADDLE WHEEL', [-70, -44, 130, 156], 'wheel'),
    part(1, 'lfo', 'SWING LANTERN', [-206, 186, -96, 352], 'lantern', { dir: 90 }),
    part(1, 'fx', 'SONAR BUBBLE', [116, 184, 296, 316], 'down'),
    part(1, 'pitch', 'CANDY STACKS', [-130, -440, 26, -340], 'stacks', { n: 2 }),
    part(1, 'texture', 'FIZZ PORTS', [-204, -132, -84, 104], 'column', { dir: -135 }),
    part(1, 'echo', 'GRAMOPHONE', [50, -440, 206, -340], 'horn'),
    part(1, 'tone', 'SIDE WING', [150, -70, 270, 150], 'wing'),
    // ── STERN · VCO 3 ──
    part(2, 'perform', 'STERN PORTS', [-566, -80, -262, 60], 'ports'),
    part(2, 'grain', 'PROPELLER', [-820, -84, -660, 104], 'prop'),
    part(2, 'lfo', 'RUDDER', [-716, -360, -580, -120], 'rudder'),
    part(2, 'fx', 'LAVA DOME', [-530, -300, -356, -160], 'up'),
    part(2, 'pitch', 'EXHAUST PIPES', [-340, -372, -236, -168], 'stacks', { n: 3 }),
    part(2, 'texture', 'BUBBLE WAKE', [-640, 96, -420, 160], 'row', { dir: 171 }),
    part(2, 'echo', 'SPRING AERIAL', [-470, 184, -360, 360], 'spring', { dir: 90 }),
    part(2, 'tone', 'TAIL FIN', [-670, 162, -478, 310], 'tail'),
  ],
  ports: [
    { vco: 0, x: 530, y: -296 },
    { vco: 1, x: 206, y: 312 },
    { vco: 2, x: -443, y: -296 },
  ],
  wake: [-760, 10],
  aura: [60, 10, 760, 230],
  hull: Hull1960,
  sky: {
    mode: 1,
    colors: ['#5b1aa8', '#e0218a', '#ff7a1a', '#ffcf2a', '#18c4b4'],
    grain: 1,
    halftone: 1,
    misreg: 1,
    scanlines: 0,
    outlines: 1,
    rocks: 0,
  },
  hud: { bg: '#241036', fg: '#fff6c2', edge: ['#ffd21f', '#ff2e88', '#2fe0c4'], font: "'Arial Rounded MT Bold', 'Orbitron', sans-serif", radius: 24, hard: true },
}
