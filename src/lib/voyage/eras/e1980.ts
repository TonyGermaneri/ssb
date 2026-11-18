/**
 * The EIGHTIES: a long, low neon wedge -- a vector-arcade interceptor with a chrome racing band, a laser grid etched
 * into a near-black hull and swept deltas, cruising over a synthwave grid at dusk. Original; nose to the right.
 */
import Hull1980 from '../../../components/voyage/Hull1980.vue'
import { pal, part, type Era } from '../ship'

export const E1980: Era = {
  id: '1980',
  label: '80s',
  title: 'VR-84 VECTOR RUNNER',
  blurb: 'a neon wedge over a synthwave grid',
  palettes: [
    pal('BOW', '#1b0b2c', '#ff2bd6', '#ffc8f4', '#0a0314', '#ff5ce1'),
    pal('MIDSHIPS', '#0a1830', '#00e5ff', '#c8fbff', '#020a16', '#3df2ff'),
    pal('STERN', '#170c34', '#9a52ff', '#e2d2ff', '#07031a', '#ffb02e'),
  ],
  ink: '#46f4ff',
  stroke: 0.62,
  stripes: 'palette',
  glass: { fill: '#120428', opacity: 0.85, highlight: false },
  parts: [
    // ── BOW · VCO 1 ──
    part(0, 'perform', 'HUD VISOR', [280, -84, 570, 56], 'screen'),
    part(0, 'grain', 'RAM INTAKE', [582, -50, 690, 58], 'turbine'),
    part(0, 'lfo', 'PITOT PROBE', [700, -42, 820, 48], 'arm', { dir: 0, back: false }),
    part(0, 'fx', 'TARGET DOME', [330, -280, 490, -152], 'up'),
    part(0, 'pitch', 'RETRO JETS', [320, 142, 500, 252], 'bells', { dir: 90, n: 2 }),
    part(0, 'texture', 'PLASMA SLATS', [296, 74, 520, 138], 'row', { dir: 160 }),
    part(0, 'echo', 'LOCK-ON DISH', [504, -254, 620, -100], 'dish'),
    part(0, 'tone', 'CANARD', [540, 66, 724, 196], 'delta'),
    // ── MIDSHIPS · VCO 2 ──
    part(1, 'perform', 'COCKPIT', [-80, -304, 236, -164], 'screen'),
    part(1, 'grain', 'CORE TURBINE', [-250, -124, -86, 40], 'turbine'),
    part(1, 'lfo', 'AIR BRAKE', [190, 140, 300, 300], 'flap', { dir: 90 }),
    part(1, 'fx', 'SPINE DOME', [-276, -266, -120, -152], 'up'),
    part(1, 'pitch', 'PHOTON PODS', [20, -134, 236, -14], 'bells', { dir: 180, n: 3, back: false }),
    part(1, 'texture', 'HEAT SINKS', [-64, 30, 236, 96], 'row', { dir: 150 }),
    part(1, 'echo', 'LASER RELAY', [-30, -440, 96, -306], 'mast'),
    part(1, 'tone', 'MAIN DELTA', [-236, 128, 176, 336], 'delta'),
    // ── STERN · VCO 3 ──
    part(2, 'perform', 'REAR SCANNER', [-604, -112, -314, 28], 'screen'),
    part(2, 'grain', 'THRUST FAN', [-722, -44, -612, 66], 'turbine'),
    part(2, 'lfo', 'VENTRAL RUDDER', [-700, 142, -590, 322], 'rudder', { dir: 90 }),
    part(2, 'fx', 'AFT RADOME', [-560, -264, -404, -152], 'up'),
    part(2, 'pitch', 'AFTERBURNERS', [-820, -110, -730, 74], 'bells', { dir: 180, n: 2 }),
    part(2, 'texture', 'EXHAUST GRILLE', [-590, 58, -334, 122], 'row', { dir: 180 }),
    part(2, 'echo', 'UPLINK DISH', [-392, -292, -286, -136], 'dish'),
    part(2, 'tone', 'TAIL BLADE', [-744, -430, -566, -128], 'delta', { flip: 'y' }),
  ],
  ports: [
    { vco: 0, x: 410, y: -280 },
    { vco: 1, x: -198, y: -266 },
    { vco: 2, x: -482, y: -264 },
  ],
  wake: [-800, -18],
  aura: [30, -10, 790, 250],
  hull: Hull1980,
  sky: {
    mode: 3,
    colors: ['#0d0221', '#c2186b', '#ff2e7e', '#ffd23f', '#22e6ff'],
    grain: 0,
    halftone: 0,
    misreg: 0.8,
    scanlines: 1,
    outlines: 0,
    rocks: 1,
  },
  hud: { bg: '#0b0418', fg: '#e8fbff', edge: ['#ff2bd6', '#00e5ff', '#9a52ff'], font: "'Orbitron', 'Futura', sans-serif", radius: 2, hard: false, vco: ['#ff2bd6', '#00e5ff', '#9a52ff'] },
}
