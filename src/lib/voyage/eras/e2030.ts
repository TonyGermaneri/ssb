/**
 * The THIRTIES: a giant stainless-steel, fully reusable deep-space ship lying on its side above the Earth's limb, shot
 * like a photograph -- rolled and welded steel rings with straw-and-blue heat tint at the seams, black hex heat-shield
 * tiles on the windward belly (each its own shade, some replaced, gaps between), carbon composite fairings, a raceway
 * down the side, flaps on actuator hinges, RCS pods, radiators, masts and a dish, the flight deck's two trapezoid
 * panes glowing from inside, hard sunlight from the upper left and the Earth's blue on the belly. The same flight
 * deck as its cockpit (cockpit/eras/c2030.ts). Original; no maker's marks. Nose to the right.
 *
 * The leeward flaps (up) are the LFOs, the windward flaps (down, tiled) the tones; the windows are the BOW's flight
 * deck, the MIDSHIPS' crew deck and the STERN's engine-room port.
 */
import Hull2030 from '../../../components/voyage/Hull2030.vue'
import Overlay2030 from '../../../components/voyage/Overlay2030.vue'
import { pal, part, type Era } from '../ship'

export const E2030: Era = {
  id: '2030',
  label: '30s',
  title: 'STEEL STARSHIP',
  blurb: 'a stainless deep-space ship in low Earth orbit, flaps and tiles and all',
  // main: the steel (the MIDSHIPS': its solar cells); alt: the section's heat tint (and its windows' light); hi: the lit edge; deep: inside; glow: the
  // cockpit's own VCO colours
  palettes: [
    pal('BOW', '#9ea4ab', '#2f6f96', '#cfe6f4', '#05090e', '#8fdcff'),
    pal('MIDSHIPS', '#2e3b4d', '#a8762c', '#f1e2c2', '#0b0805', '#ffd27a'),
    pal('STERN', '#999ca1', '#9a5031', '#e6dcd3', '#0c0604', '#ff9a62'),
  ],
  ink: '#0b0c0e',
  stroke: 0.2,
  partStroke: 0.32,
  glass: { fill: '#0a1118', opacity: 0.88, highlight: false },
  stripes: 'palette',
  finish: { shade: 0.85, material: 'brushed', materialOpacity: 0.45, tintMax: 0.3, plain: true, window: 'subtle', edge: '#9aa3ad', tintBlend: 'color' },
  parts: [
    // ── BOW · VCO 1: the flight deck in the nose ──
    part(0, 'perform', 'FLIGHT DECK', [346, -148, 552, -16], 'panel'),
    part(0, 'grain', 'DOCKING ADAPTER', [214, 12, 330, 112], 'ring'),
    part(0, 'lfo', 'FWD FLAP · LEE', [430, -372, 598, -176], 'flap', { dir: -90 }),
    part(0, 'fx', 'OBS CUPOLA', [206, -252, 322, -190], 'up'),
    part(0, 'pitch', 'RCS · FWD', [616, -258, 728, -138], 'bells', { dir: -90, n: 2 }),
    part(0, 'texture', 'HEADER VENTS', [360, 14, 548, 70], 'row', { dir: 100 }),
    part(0, 'echo', 'KA DOWNLINK', [640, 66, 772, 208], 'dish', { flip: 'y' }),
    part(0, 'tone', 'FWD FLAP · WIND', [432, 104, 612, 272], 'delta'),
    // ── MIDSHIPS · VCO 2: the crew deck ──
    part(1, 'perform', 'CREW DECK', [-170, -148, 80, -16], 'panel'),
    part(1, 'grain', 'CMG ROTOR', [-286, 8, -180, 112], 'turbine'),
    part(1, 'lfo', 'SOLAR WING', [-52, -384, 62, -192], 'flap', { dir: -90 }),
    part(1, 'fx', 'NADIR BLISTER', [-140, 128, -2, 198], 'down'),
    part(1, 'pitch', 'RCS · MID', [48, 112, 156, 236], 'bells', { dir: 90, n: 2 }),
    part(1, 'texture', 'PURGE VENTS', [-150, 20, 112, 76], 'row', { dir: 90 }),
    part(1, 'echo', 'COMMS MAST', [88, -384, 186, -192], 'mast'),
    part(1, 'tone', 'SOLAR ARRAY', [-290, -386, -86, -192], 'keel', { flip: 'y' }),
    // ── STERN · VCO 3: the engine section ──
    part(2, 'perform', 'ENGINE ROOM', [-590, -148, -370, -16], 'panel'),
    part(2, 'grain', 'APU INTAKE', [-680, 6, -572, 108], 'turbine'),
    part(2, 'lfo', 'AFT FLAP · LEE', [-632, -376, -444, -192], 'flap', { dir: -90 }),
    part(2, 'fx', 'STAR TRACKER', [-480, 128, -350, 192], 'down'),
    part(2, 'pitch', 'MAIN ENGINES', [-818, -176, -704, 116], 'bells', { dir: 180, n: 3 }),
    part(2, 'texture', 'LOX VENTS', [-548, 20, -306, 76], 'row', { dir: 115 }),
    part(2, 'echo', 'TELEMETRY DISH', [-414, -330, -300, -194], 'dish'),
    part(2, 'tone', 'AFT FLAP · WIND', [-660, 110, -494, 288], 'delta'),
  ],
  ports: [
    { vco: 0, x: 264, y: -252 },
    { vco: 1, x: -71, y: 198 },
    { vco: 2, x: -415, y: 192 },
  ],
  wake: [-814, -30],
  aura: [10, -30, 830, 230],
  hull: Hull2030,
  overlay: Overlay2030,
  sky: {
    mode: 8,
    colors: ['#020307', '#0b3b78', '#4f6a3c', '#4da6ff', '#8a7dff'],
    grain: 0.15,
    halftone: 0,
    misreg: 0.1,
    scanlines: 0,
    outlines: 0,
    rocks: 4,
  },
  hud: {
    bg: '#0c0e11',
    fg: '#e7eaed',
    edge: ['#8e959c', '#36b4ff', '#d8603a'],
    font: "'DIN Alternate', 'Eurostile', 'Helvetica Neue', Arial, sans-serif",
    radius: 3,
    hard: false,
    vco: ['#8fdcff', '#ffd27a', '#ff9a62'],
  },
}
