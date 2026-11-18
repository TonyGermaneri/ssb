/**
 * The NINETIES: the HX-2K HYPERCRUISER as the hero of a pre-rendered CGI game box -- a fat, bulbous, organic-meets-
 * mechanical cruiser of translucent candy plastic (teal bow, purple midships, lime stern) over glowing circuit boards,
 * every section joined by fat ray-traced chrome tori, a bolted chrome-ringed bubble canopy like the bridge's, a CRT
 * deck, a magenta swoosh, chrome intakes and lime thrusters, warping through a CGI starfield. Hard speculars, a touch
 * of banding and dither. Original art; nose to the right.
 */
import Hull1990 from '../../../components/voyage/Hull1990.vue'
import Overlay1990 from '../../../components/voyage/Overlay1990.vue'
import { pal, part, type Era } from '../ship'

export const E1990: Era = {
  id: '1990',
  label: '90s',
  title: 'HX-2K HYPERCRUISER',
  blurb: 'a pre-rendered chrome-and-candy cruiser, ray-traced at 320×240',
  palettes: [
    pal('BOW', '#1fe0d2', '#7b2ff7', '#d6fff9', '#062a46', '#b8ff1f'),
    pal('MIDSHIPS', '#a46bff', '#18d8c9', '#f0e2ff', '#1a0a48', '#b8ff1f'),
    pal('STERN', '#b8ff1f', '#2b5dff', '#f3ffd0', '#0e3318', '#ff3db8'),
  ],
  ink: '#110a2c',
  stroke: 1,
  partStroke: 0.5,
  glass: { fill: '#3a1a9a', opacity: 0.34, highlight: true },
  stripes: 'palette',
  parts: [
    // ── BOW · VCO 1: the teal candy nose, under the bubble canopy ──
    part(0, 'perform', 'WRAP VISOR', [384, -136, 650, 12], 'capsule'),
    part(0, 'grain', 'NOSE INTAKE', [672, -34, 806, 100], 'turbine'),
    part(0, 'lfo', 'EYE STALK', [622, -304, 722, -162], 'periscope'),
    part(0, 'fx', 'BUBBLE CANOPY', [392, -352, 600, -196], 'bubble'),
    part(0, 'pitch', 'HOVER JETS', [300, 150, 450, 282], 'bells', { dir: 90, n: 2 }),
    part(0, 'texture', 'COOL GILLS', [400, 34, 630, 94], 'row', { dir: 150 }),
    part(0, 'echo', 'BUNNY EARS', [728, -300, 820, -150], 'whisker'),
    part(0, 'tone', 'CHIN FIN', [480, 124, 650, 304], 'tail'),
    // ── MIDSHIPS · VCO 2: the purple candy waist, its CRT deck and power halo ──
    part(1, 'perform', 'MEGA DECK', [-228, -184, 104, -30], 'screen'),
    part(1, 'grain', 'POWER HALO', [-250, 18, 66, 110], 'ring'),
    part(1, 'lfo', 'BEACON ARM', [130, -386, 240, -212], 'arm'),
    part(1, 'fx', 'BELLY BLISTER', [-170, 198, 30, 326], 'down'),
    part(1, 'pitch', 'TURBO STACKS', [-252, -372, -122, -230], 'stacks', { n: 2 }),
    part(1, 'texture', 'BIO VENTS', [134, -150, 234, 60], 'column', { dir: 160 }),
    part(1, 'echo', 'NET TOWER', [-66, -432, 64, -236], 'mast'),
    part(1, 'tone', 'SWOOP FIN', [76, 152, 238, 336], 'wing'),
    // ── STERN · VCO 3: the lime candy engine bulb, its chrome fan and afterburners ──
    part(2, 'perform', 'REAR VIEWER', [-616, -150, -340, 12], 'round'),
    part(2, 'grain', 'HYPER FAN', [-820, -128, -684, 8], 'turbine'),
    part(2, 'lfo', 'BELLY RUDDER', [-436, 162, -320, 318], 'rudder', { dir: 90 }),
    part(2, 'fx', 'AFT BLISTER', [-560, -366, -404, -236], 'up'),
    part(2, 'pitch', 'AFTERBURNERS', [-820, 62, -702, 192], 'bells', { dir: 180, n: 2 }),
    part(2, 'texture', 'EXHAUST GILLS', [-606, 40, -346, 100], 'row', { dir: 180 }),
    part(2, 'echo', 'SAT DISH', [-390, -372, -272, -204], 'dish'),
    part(2, 'tone', 'TAIL FIN', [-728, -430, -568, -156], 'tail', { flip: 'x' }),
  ],
  ports: [
    { vco: 0, x: 496, y: -352 },
    { vco: 1, x: -70, y: 326 },
    { vco: 2, x: -482, y: -366 },
  ],
  wake: [-812, 128],
  aura: [10, -20, 800, 280],
  hull: Hull1990,
  overlay: Overlay1990,
  finish: { shade: 0.8, tintMax: 0.35 },
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
  hud: {
    bg: '#15123c',
    fg: '#eafffb',
    edge: ['#1fe0d2', '#a46bff', '#b8ff1f'],
    font: "'Arial Black', 'Orbitron', sans-serif",
    radius: 14,
    hard: false,
  },
}
