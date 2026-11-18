/**
 * The TWENTIES: the GLASS NOMAD, a premium glassmorphism cruiser -- a graphite pebble under layered frosted-glass shells,
 * a tinted glass card per section (violet bow, mint midships, coral stern) parted by electric-blue seams, a panoramic
 * soft-cornered canopy amidships framed like the cockpit's windscreen (thick graphite, an iridescent hairline), a glass
 * engine pod aft, pills of light, soft coloured underglows, and the aurora outside reflecting across all the glass.
 * Original; nose to the right.
 */
import Hull2020 from '../../../components/voyage/Hull2020.vue'
import Overlay2020 from '../../../components/voyage/Overlay2020.vue'
import { pal, part, type Era } from '../ship'

export const E2020: Era = {
  id: '2020',
  label: '20s',
  title: 'GLASS NOMAD',
  blurb: 'a frosted-glass cruiser, lit from beneath, sailing a mesh-gradient aurora',
  palettes: [
    pal('BOW', '#a08cff', '#7b5cff', '#cbbfff', '#100d22', '#4d7cff'),
    pal('MIDSHIPS', '#5ef0c4', '#25a88a', '#b4f7e2', '#08191a', '#3d8bff'),
    pal('STERN', '#ff8f80', '#e8506a', '#ffc9c0', '#200d10', '#ffb48c'),
  ],
  ink: '#07080d',
  stroke: 0.5,
  partStroke: 0.3,
  stripes: 'palette',
  glass: { fill: '#c9d2ff', opacity: 0.14, highlight: true },
  parts: [
    // ── BOW · VCO 1: the violet card, the glass nose ──
    part(0, 'perform', 'FOCUS PANE', [304, -104, 592, 22], 'capsule'),
    part(0, 'grain', 'HALO RING', [636, -64, 792, 40], 'ring'),
    part(0, 'lfo', 'LIGHT ARM', [604, -384, 694, -140], 'arm'),
    part(0, 'fx', 'GLASS BUBBLE', [408, -304, 584, -174], 'bubble'),
    part(0, 'pitch', 'LIFT JETS', [612, 74, 736, 196], 'bells', { dir: 90, n: 2 }),
    part(0, 'texture', 'AIR SLOTS', [304, 46, 592, 102], 'row', { dir: 95 }),
    part(0, 'echo', 'SIGNAL WHISKER', [706, -344, 806, -100], 'whisker'),
    part(0, 'tone', 'GLASS VANE', [340, 128, 576, 282], 'delta'),
    // ── MIDSHIPS · VCO 2: the mint card under the panoramic canopy ──
    part(1, 'perform', 'CANOPY', [-252, -336, 252, -182], 'panel'),
    part(1, 'grain', 'CORE TURBINE', [-88, -142, 104, 50], 'turbine'),
    part(1, 'lfo', 'PENDANT', [-286, 150, -176, 330], 'lantern', { dir: 90 }),
    part(1, 'fx', 'DROP DOME', [12, 138, 186, 250], 'down'),
    part(1, 'pitch', 'ION JETS', [204, 140, 316, 282], 'bells', { dir: 90, n: 2 }),
    part(1, 'texture', 'MIST VENTS', [-226, -132, -132, 100], 'column', { dir: -150 }),
    part(1, 'echo', 'SOFT DISH', [276, -356, 380, -170], 'dish'),
    part(1, 'tone', 'GLASS KEEL', [-156, 128, -6, 264], 'keel'),
    // ── STERN · VCO 3: the coral card, the engine pod ──
    part(2, 'perform', 'STERN LIGHTS', [-604, -104, -300, 22], 'ports'),
    part(2, 'grain', 'AFT TURBINE', [-702, -350, -558, -206], 'turbine'),
    part(2, 'lfo', 'TRIM BEACON', [-528, -352, -432, -164], 'arm', { dir: -90 }),
    part(2, 'fx', 'UNDER DOME', [-462, 132, -300, 244], 'down'),
    part(2, 'pitch', 'TWIN DRIVES', [-820, -92, -698, 76], 'bells', { dir: 180, n: 2 }),
    part(2, 'texture', 'WAKE VENTS', [-604, 46, -300, 102], 'row', { dir: 160 }),
    part(2, 'echo', 'AFT WHISKER', [-420, -380, -326, -168], 'whisker'),
    part(2, 'tone', 'TAIL FIN', [-704, 124, -484, 290], 'tail'),
  ],
  ports: [
    { vco: 0, x: 496, y: -304 },
    { vco: 1, x: 99, y: 250 },
    { vco: 2, x: -381, y: 244 },
  ],
  wake: [-806, -8],
  aura: [40, -30, 800, 250],
  hull: Hull2020,
  overlay: Overlay2020,
  // soft light over the parts' bodies, a fine grain on the funnels and fins, the domes' tint kept glassy
  finish: { shade: 0.55, material: 'noise', materialOpacity: 0.22, tintMax: 0.3, window: 'subtle', edge: '#7d81a6', tintBlend: 'color', plain: true },
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
