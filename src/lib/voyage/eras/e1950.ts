/**
 * The FIFTIES: the XS-57 ATOMIC SAUCER gone steam -- a riveted iron saucer on a brass rim of green-lit portholes,
 * a wheelhouse on top whose three-pane windscreen is the cockpit's (one pane per VCO), smokestacks and a wireless
 * mast on its mahogany roof, a copper-nosed boiler for a bow with a brass airscrew, an engine house astern with a
 * paddle wheel in its sunburst box, a steam dome and exhaust bells, a turbine pod and a lantern slung under the belly.
 * Original steampunk; nose to the right.
 */
import Hull1950 from '../../../components/voyage/Hull1950.vue'
import Overlay1950 from '../../../components/voyage/Overlay1950.vue'
import { pal, part, type Era } from '../ship'

export const E1950: Era = {
  id: '1950',
  label: '50s',
  title: 'XS-57 ATOMIC SAUCER',
  blurb: 'a riveted iron saucer under steam: brass, copper, mahogany and green-lit glass',
  palettes: [
    pal('BOW', '#8e4a24', '#d8402e', '#ffe9c0', '#08140d', '#ff6a4a'),
    pal('MIDSHIPS', '#94702e', '#36b39c', '#d8fff4', '#08140d', '#7dffc8'),
    pal('STERN', '#74502a', '#c27a2a', '#fff0c8', '#08140d', '#ffc24a'),
  ],
  ink: '#1a0d06',
  stroke: 1,
  partStroke: 0.5,
  glass: { fill: '#123824', opacity: 0.8, highlight: true },
  stripes: 'palette',
  finish: { shade: 0.85, material: 'patina', materialOpacity: 0.45, tintMax: 0.35, plain: true, edge: '#3a2408' },
  parts: [
    // ── BOW · VCO 1: the right-hand pane, the boiler and its airscrew ──
    part(0, 'perform', 'BOW PANE', [140, -310, 360, -150], 'panel'),
    part(0, 'grain', 'AIRSCREW', [712, -6, 820, 102], 'prop', { flip: 'x' }),
    part(0, 'lfo', 'PERISCOPE', [420, -300, 520, -40], 'periscope'),
    part(0, 'fx', 'SIGHT DOME', [560, -170, 700, -50], 'up'),
    part(0, 'pitch', 'STEAM HORN', [630, 124, 800, 260], 'horn'),
    part(0, 'texture', 'BOW VENTS', [240, 67, 440, 123], 'row', { dir: 200 }),
    part(0, 'echo', 'WIRELESS HORN', [700, -300, 810, -10], 'horn'),
    part(0, 'tone', 'CANARD', [450, 116, 620, 256], 'delta'),
    // ── MIDSHIPS · VCO 2: the middle pane, the roof, the belly ──
    part(1, 'perform', 'MIDSHIPS PANE', [-110, -310, 110, -150], 'panel'),
    part(1, 'grain', 'TURBINE POD', [-340, 130, -180, 290], 'turbine'),
    part(1, 'lfo', 'SHIP\'S LANTERN', [130, 220, 240, 390], 'lantern', { dir: 90 }),
    part(1, 'fx', 'BELLY BLISTER', [-110, 206, 110, 316], 'down'),
    part(1, 'pitch', 'SMOKESTACKS', [-80, -440, 70, -340], 'stacks', { n: 2 }),
    part(1, 'texture', 'RIM VENTS', [-120, 74, 120, 130], 'row', { dir: 200 }),
    part(1, 'echo', 'WIRELESS MAST', [110, -440, 220, -330], 'mast'),
    part(1, 'tone', 'KEEL', [250, 170, 430, 330], 'keel'),
    // ── STERN · VCO 3: the left-hand pane and the engine house ──
    part(2, 'perform', 'STERN PANE', [-360, -310, -140, -150], 'panel'),
    part(2, 'grain', 'PADDLE WHEEL', [-640, -40, -460, 140], 'wheel'),
    part(2, 'lfo', 'RUDDER', [-600, 150, -470, 330], 'rudder', { dir: 90 }),
    part(2, 'fx', 'STEAM DOME', [-600, -210, -460, -96], 'up'),
    part(2, 'pitch', 'EXHAUST BELLS', [-820, -30, -720, 130], 'bells', { dir: 180, n: 2 }),
    part(2, 'texture', 'STERN VENTS', [-450, 67, -240, 123], 'row', { dir: 200 }),
    part(2, 'echo', 'AETHER COIL', [-460, 160, -360, 330], 'spring', { dir: 90 }),
    part(2, 'tone', 'TAIL FIN', [-800, -300, -610, -60], 'tail', { flip: 'x' }),
  ],
  ports: [
    { vco: 0, x: 630, y: -170 },
    { vco: 1, x: 0, y: 316 },
    { vco: 2, x: -530, y: -210 },
  ],
  wake: [-800, 50],
  aura: [0, 20, 800, 320],
  hull: Hull1950,
  overlay: Overlay1950,
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
  hud: {
    bg: '#1a0d06',
    fg: '#f3e2bd',
    edge: ['#c99a3c', '#7a2a1a', '#3a2408'],
    font: "'Courier New', 'Courier', monospace",
    radius: 8,
    hard: false,
    vco: ['#ff4a3d', '#5fe0c8', '#ffb03d'],
  },
}
