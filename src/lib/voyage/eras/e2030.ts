/**
 * The THIRTIES: a giant stainless-steel, fully reusable super-heavy ship lying on its side -- an ogive nose, black hex
 * tiles on the windward belly, two flaps forward and two aft, a cluster of engine bells at the tail -- cruising above
 * the Earth's limb in real black space. Original; no maker's marks. Nose to the right.
 */
import Hull2030 from '../../../components/voyage/Hull2030.vue'
import { pal, part, type Era } from '../ship'

export const E2030: Era = {
  id: '2030',
  label: '30s',
  title: 'STEEL STARSHIP',
  blurb: 'a stainless super-heavy ship above the Earth',
  palettes: [
    pal('BOW', '#b8bdc3', '#3f97d4', '#d3e9f7', '#071420', '#8fdcff'),
    pal('MIDSHIPS', '#adb2b8', '#d99a2b', '#f2e4c6', '#1a1208', '#ffd27a'),
    pal('STERN', '#a2a7ad', '#b4573a', '#dcc6bb', '#1c0c07', '#ff9a62'),
  ],
  ink: '#121417',
  stroke: 0.35,
  stripes: 'palette',
  parts: [
    // ── BOW · VCO 1: the flight deck in the nose ──
    part(0, 'perform', 'FLIGHT DECK', [262, -122, 540, -14], 'capsule'),
    part(0, 'grain', 'DOCKING RING', [270, 4, 396, 114], 'ring'),
    part(0, 'lfo', 'FORWARD FLAP', [452, -345, 612, -128], 'flap', { dir: -90 }),
    part(0, 'fx', 'OBS CUPOLA', [268, -262, 420, -160], 'up'),
    part(0, 'pitch', 'RCS PODS', [630, -210, 740, -70], 'bells', { dir: -90, n: 2 }),
    part(0, 'texture', 'HEADER VENTS', [416, 14, 584, 82], 'row', { dir: 100 }),
    part(0, 'echo', 'DOWNLINK DISH', [628, 52, 760, 196], 'dish', { flip: 'y' }),
    part(0, 'tone', 'SOLAR ARRAY', [262, 118, 440, 270], 'tail', { flip: 'y' }),
    // ── MIDSHIPS · VCO 2: the payload bay ──
    part(1, 'perform', 'PAYLOAD BAY', [-168, -130, 150, -16], 'panel'),
    part(1, 'grain', 'CMG WHEEL', [-272, 2, -150, 120], 'wheel'),
    part(1, 'lfo', 'NAV BEACON', [-64, -352, 56, -140], 'arm', { dir: -90 }),
    part(1, 'fx', 'SENSOR BLISTER', [-40, 125, 110, 215], 'down'),
    part(1, 'pitch', 'LANDING JETS', [140, 96, 240, 214], 'bells', { dir: 90, n: 2 }),
    part(1, 'texture', 'PURGE VENTS', [-120, 26, 116, 96], 'row', { dir: 90 }),
    part(1, 'echo', 'COMMS MAST', [80, -345, 190, -140], 'mast'),
    part(1, 'tone', 'SOLAR WING', [-282, -330, -84, -150], 'tail'),
    // ── STERN · VCO 3: the engine bay ──
    part(2, 'perform', 'ENGINE BAY', [-604, -122, -322, -14], 'screen'),
    part(2, 'grain', 'TURBOPUMP', [-680, 2, -566, 116], 'turbine'),
    part(2, 'lfo', 'AFT FLAP', [-590, -345, -420, -136], 'flap', { dir: -90 }),
    part(2, 'fx', 'STAR TRACKER', [-410, -262, -300, -160], 'up'),
    part(2, 'pitch', 'RAPTOR CLUSTER', [-816, -150, -682, 110], 'bells', { dir: 180, n: 3 }),
    part(2, 'texture', 'LOX VENTS', [-548, 26, -308, 96], 'row', { dir: 120 }),
    part(2, 'echo', 'TELEMETRY WHIP', [-690, -340, -600, -150], 'whisker'),
    part(2, 'tone', 'AFT ARRAY', [-420, 118, -290, 262], 'tail', { flip: 'y' }),
  ],
  ports: [
    { vco: 0, x: 344, y: -262 },
    { vco: 1, x: 35, y: 215 },
    { vco: 2, x: -355, y: -262 },
  ],
  wake: [-812, -20],
  aura: [40, -20, 800, 200],
  hull: Hull2030,
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
    font: "'Helvetica Neue', 'SF Pro Display', system-ui, sans-serif",
    radius: 4,
    hard: false,
  },
}
