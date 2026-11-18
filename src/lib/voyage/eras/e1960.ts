/**
 * The SIXTIES: the S·S·B DREAMBOAT, the eye-ship -- a plump candy-lacquered sub whose flank is the cockpit's EYE seen
 * from outside: its almond window (the iris is MIDSHIPS' window) in rainbow lids, lashes fanning up off the top lid
 * like a crest, op-art bands of candy colour rippling out from it over the whole hull, diamonds at its corners,
 * mandalas turning behind the airscrews, jelly domes, daisies and scalloped portholes fore and aft. Original
 * psychedelia; nose to the right.
 */
import Hull1960 from '../../../components/voyage/Hull1960.vue'
import Overlay1960 from '../../../components/voyage/Overlay1960.vue'
import { pal, part, type Era } from '../ship'

export const E1960: Era = {
  id: '1960',
  label: '60s',
  title: 'S·S·B DREAMBOAT',
  blurb: 'the eye-ship: candy lacquer, op-art bands and jelly domes in a screenprinted sky',
  palettes: [
    pal('BOW', '#ffd21f', '#ff2e88', '#fff6c2', '#3b0a4f', '#ff7a1a'),
    pal('MIDSHIPS', '#2fe0c4', '#7a3cff', '#e6fff8', '#14104a', '#a6ff2e'),
    pal('STERN', '#ff6a3d', '#ff3df0', '#ffe3f1', '#4a0b2e', '#ffd21f'),
  ],
  ink: '#241036',
  stroke: 1,
  partStroke: 0.6,
  glass: { fill: '#ff7ad9', opacity: 0.5, highlight: true },
  finish: { shade: 0.6, material: 'speckle', materialOpacity: 0.25, tintMax: 0.4 },
  parts: [
    // ── BOW · VCO 1 ──
    part(0, 'perform', 'BOW PORTHOLES', [400, -60, 660, 80], 'ports'),
    part(0, 'grain', 'MANDALA SPINNER', [690, -60, 810, 60], 'pinwheel'),
    part(0, 'lfo', 'PERISCOPE', [440, -400, 540, -190], 'periscope'),
    part(0, 'fx', 'JELLY DOME', [560, -300, 690, -160], 'up'),
    part(0, 'pitch', 'SPIRAL HORN', [600, 130, 770, 270], 'horn'),
    part(0, 'texture', 'BUBBLE JETS', [360, 110, 590, 166], 'row', { dir: 90 }),
    part(0, 'echo', 'FEELERS', [700, -330, 810, -80], 'whisker'),
    part(0, 'tone', 'KEEL FIN', [380, 190, 580, 330], 'keel'),
    // ── MIDSHIPS · VCO 2: the eye ──
    part(1, 'perform', 'THE EYE', [-150, -140, 230, 40], 'round'),
    part(1, 'grain', 'KALEIDOSCOPE', [-250, 60, -90, 220], 'turbine'),
    part(1, 'lfo', 'SWING LANTERN', [230, 200, 330, 370], 'lantern', { dir: 90 }),
    part(1, 'fx', 'SONAR BUBBLE', [-60, 206, 140, 320], 'down'),
    part(1, 'pitch', 'CANDY STACKS', [-300, -400, -200, -196], 'stacks', { n: 2 }),
    part(1, 'texture', 'FIZZ PORTS', [-80, 60, 140, 116], 'row', { dir: 120 }),
    part(1, 'echo', 'GRAMOPHONE', [300, -420, 420, -200], 'horn'),
    part(1, 'tone', 'SIDE WING', [150, 60, 290, 200], 'wing', { back: false }),
    // ── STERN · VCO 3 ──
    part(2, 'perform', 'STERN PORTHOLES', [-600, -60, -340, 80], 'ports'),
    part(2, 'grain', 'PROPELLER', [-820, -60, -700, 100], 'prop'),
    part(2, 'lfo', 'RUDDER', [-700, 120, -570, 330], 'rudder', { dir: 90 }),
    part(2, 'fx', 'LAVA DOME', [-560, -320, -420, -170], 'up'),
    part(2, 'pitch', 'EXHAUST PIPES', [-420, -400, -310, -196], 'stacks', { n: 3 }),
    part(2, 'texture', 'BUBBLE WAKE', [-560, 100, -320, 156], 'row', { dir: 171 }),
    part(2, 'echo', 'SPRING AERIAL', [-520, 190, -420, 370], 'spring', { dir: 90 }),
    part(2, 'tone', 'TAIL FIN', [-720, -330, -580, -110], 'tail'),
  ],
  ports: [
    { vco: 0, x: 625, y: -300 },
    { vco: 1, x: 40, y: 320 },
    { vco: 2, x: -490, y: -320 },
  ],
  wake: [-800, 20],
  aura: [40, 0, 790, 300],
  hull: Hull1960,
  overlay: Overlay1960,
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
  hud: { bg: '#241036', fg: '#fff6c2', edge: ['#ffd21f', '#ff2e88', '#2fe0c4'], font: "'Cooper Black', 'Arial Rounded MT Bold', 'Orbitron', sans-serif", radius: 24, hard: true, vco: ['#ffd21f', '#2fe0c4', '#ff6a3d'] },
}
