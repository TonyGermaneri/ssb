/**
 * VOYAGE's ships, as plans. Every era's ship (eras/) carries the same 27 working parts -- each VCO's eight pads in
 * disguise and its GARDEN (a strip of step lamps set into the foot of its window; withGarden), a section
 * of the ship per VCO -- placed and named its own way. A part's rectangle is its pad: left / right
 * and up / down across it are the pad's x and y (pads.ts), exactly as in the PADS mode.
 *
 * What a part does shows the same way on every ship (a rotor turns with the grains, a swinger swings with the LFO, a
 * dome ripples with the reverb...); its VARIANT is the form it takes (a paddle wheel or a turbine, a periscope or a
 * flap). Design units: every ship lives in x -820 .. 820 (nose to the right), y -440 .. 400 (down).
 */
import type { Component } from 'vue'
import type { PadId } from '../play/padControl'
import type { TextureId } from './cockpit/textures'

export const SHIP_BOX = { x: -820, y: -440, w: 1640, h: 840 }

export type PartForm = 'window' | 'rotor' | 'swinger' | 'dome' | 'funnel' | 'vents' | 'antenna' | 'fin' | 'lamps'
/** a part's pad: one of the VCO's eight, or its GARDEN (the ring on it: x its STEPS, y its HITS) */
export type PartKind = PadId | 'garden'
export const FORM_OF: Record<PartKind, PartForm> = {
  perform: 'window',
  grain: 'rotor',
  lfo: 'swinger',
  fx: 'dome',
  pitch: 'funnel',
  texture: 'vents',
  echo: 'antenna',
  tone: 'fin',
  garden: 'lamps',
}

/**
 * The forms each kind of part can take (VoyageShip.vue draws them; each fits whatever rectangle it's given):
 * - window: capsule (a pill), panel (rounded), ports (a pill of portholes), screen (square-cornered, scanlined),
 *   round (an ellipse)
 * - rotor: pinwheel (6 curved blades), prop (3), wheel (a paddle wheel), turbine (a nacelle of thin blades), ring (a
 *   saucer's ring of running lights, seen edge-on)
 * - swinger (pointing along `dir`, pivoting at the other end): periscope, lantern, rudder, arm (a rod with a beacon),
 *   flap (a tapered control flap)
 * - dome: up (bulging up from its base), down, bubble (a whole canopy)
 * - funnel: horn (a flaring trumpet), stacks (`n` striped funnels standing up), bells (`n` rocket nozzles, mouths along
 *   `dir`)
 * - vents: row, column (bubbles leave along `dir`)
 * - antenna: whisker, horn (a gramophone horn), spring (hanging), mast (crossbars and a ball), dish
 * - fin: keel, wing, tail, delta
 * - lamps: strip (the picked ring's steps as a row of lamps, its hits lit, the step playing bright; a seed lamp at the
 *   end, green while the garden grows, and one pip per ring)
 */
export const VARIANTS: Record<PartForm, readonly string[]> = {
  window: ['capsule', 'panel', 'ports', 'screen', 'round'],
  rotor: ['pinwheel', 'prop', 'wheel', 'turbine', 'ring'],
  swinger: ['periscope', 'lantern', 'rudder', 'arm', 'flap'],
  dome: ['up', 'down', 'bubble'],
  funnel: ['horn', 'stacks', 'bells'],
  vents: ['row', 'column'],
  antenna: ['whisker', 'horn', 'spring', 'mast', 'dish'],
  fin: ['keel', 'wing', 'tail', 'delta'],
  lamps: ['strip'],
}

export interface Part {
  id: string
  vco: number
  kind: PartKind
  form: PartForm
  name: string
  /** its pad: x0, y0 (top left), x1, y1 */
  rect: [number, number, number, number]
  /** the form it takes (VARIANTS) */
  variant: string
  /** drawn behind the hull (a fin, a mast) rather than on it */
  back: boolean
  /** degrees, 0 = right, 90 = down: where a swinger points, where vents blow, which way bells and horns face */
  dir: number
  /** how many (funnels, bells) */
  n: number
  /** the art mirrored in its rectangle (the pad isn't): 'x' left-right, 'y' top-bottom */
  flip?: 'x' | 'y'
}

/** A section's colours: the body, its band, the highlight, the deep (windows, shadow) and the glow. */
export interface Palette {
  name: string
  main: string
  alt: string
  hi: string
  deep: string
  glow: string
  /** GL: the same as 0..1 RGB */
  gl: [number, number, number][]
}
export const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number]
export const pal = (name: string, main: string, alt: string, hi: string, deep: string, glow: string): Palette => ({
  name,
  main,
  alt,
  hi,
  deep,
  glow,
  gl: [main, alt, hi, deep, glow].map(rgb),
})

/** the defaults per form: behind the hull, which way */
const BACK: Record<PartForm, boolean> = { window: false, rotor: false, swinger: true, dome: false, funnel: true, vents: false, antenna: true, fin: true, lamps: false }
const DIR: Record<PartForm, number> = { window: 0, rotor: 0, swinger: -90, dome: -90, funnel: -90, vents: 90, antenna: -90, fin: 90, lamps: 0 }

/** A part, with its form's defaults for whatever isn't given. */
export function part(
  vco: number,
  kind: PartKind,
  name: string,
  rect: Part['rect'],
  variant: string,
  o: Partial<Pick<Part, 'back' | 'dir' | 'n' | 'flip'>> = {},
): Part {
  const form = FORM_OF[kind]
  return { id: `${vco}:${kind}`, vco, kind, form, name, rect, variant, back: o.back ?? BACK[form], dir: o.dir ?? DIR[form], n: o.n ?? 2, flip: o.flip }
}

/**
 * The sky behind a ship (space.ts): which of its looks, its five colours, and how much film and print there is.
 * mode: 0 PULP (the fifties: a ringed planet, halftone pulp print), 1 PSYCHEDELIC (the sixties: screenprint bands, a
 * striped sun), 2 AIRBRUSH (the seventies: soft nebulae, a gas giant, a starburst), 3 SYNTHWAVE (the eighties: a neon
 * grid floor, a sliced sun, scanlines), 4 CGI (the nineties: warp streaks, dithered gradients, a CRT), 5 AQUA (the
 * noughties: glossy gradients, bokeh), 6 FLAT (the tens: flat planets with long shadows), 7 MESH (the twenties: dark
 * mesh-gradient auroras, fine grain), 8 REAL (the thirties: black space, Earth's limb, the sun's glare).
 */
export interface Sky {
  mode: number
  colors: [string, string, string, string, string]
  /** 0..1 each */
  grain: number
  halftone: number
  /** the three colour records slipping apart */
  misreg: number
  scanlines: number
  /** rainbow poster outlines rippling off the hull */
  outlines: number
  /** rocks: 0 marbled, 1 neon, 2 glossy, 3 flat, 4 real */
  rocks: number
}

/** How the HUD is dressed for a ship. */
export interface Hud {
  bg: string
  fg: string
  /** the panels' borders and drop shadows */
  edge: [string, string, string]
  font: string
  radius: number
  /** a hard offset shadow (pop art) rather than a soft one */
  hard: boolean
  /** each VCO's chip colour (default: its section's main) -- for ships whose bodies are dark */
  vco?: [string, string, string]
}

export interface Era {
  id: string
  /** '60s' */
  label: string
  /** the ship's name */
  title: string
  /** one line about it */
  blurb: string
  /** per VCO */
  palettes: [Palette, Palette, Palette]
  /** outlines */
  ink: string
  /** outline width, × */
  stroke: number
  /** the parts' own outlines, × (the hull's are the era's to draw; default `stroke`) */
  partStroke?: number
  /** the domes' glass: its colour and how much shows, and whether it has the glossy highlight (default: the section's
   * deep and alt, glossed) */
  glass?: { fill: string; opacity: number; highlight: boolean }
  /** the fins' tone stripes: a rainbow warming and cooling (default), or the section's own colour shifting */
  stripes?: 'rainbow' | 'palette'
  parts: Part[]
  /** each VCO's tractor port (design units) */
  ports: { vco: number; x: number; y: number }[]
  /** where the wake streams from (design units) */
  wake: [number, number]
  /** an ellipse round the hull (design units: cx, cy, rx, ry), for the sky's glow and outlines */
  aura: [number, number, number, number]
  /** the static art: hull, sections, decoration (props: era) */
  hull: Component
  /** detail drawn over the parts (panel lines, rivets, glare, decals), never taking the pointer (props: era) */
  overlay?: Component
  /**
   * The parts' finish (default: the flat toon look): `shade` 0..1 lays light and shade over their bodies (rotor blades,
   * funnels, bells, vents, dome bases, fins), `material` a texture over the funnels and fins (cockpit/textures.ts:
   * 'brushed' steel, 'patina' brass...), `tintMax` caps how strongly the filter tints a dome's glass; and see below.
   */
  finish?: {
    shade?: number
    material?: TextureId
    materialOpacity?: number
    tintMax?: number
    /** how the filter's tint lies on a dome's glass ('color': it recolours the glass rather than muddying it) */
    tintBlend?: 'normal' | 'color' | 'hue' | 'soft-light' | 'overlay' | 'screen'
    /** plain parts for a serious ship: funnels one colour (no candy stripes), no toon knob on domes, no wheel fender,
     * no rudder stripes, no periscope eye */
    plain?: boolean
    /** fins' and aerials' outlines (default: the ink -- which the hover tags use too, so it stays dark) */
    edge?: string
    /** windows: 'screen' (default: a bold trace, its liquid level, a white playhead) or 'subtle' (glass: a thin trace,
     * a faint level, a small lit playhead) */
    window?: 'screen' | 'subtle'
  }
  /** art under everything, the back parts included: shadows beneath masts, fins and bells (props: era) */
  underlay?: Component
  sky: Sky
  hud: Hud
}

/**
 * The ship's parts with each VCO's GARDEN added: a strip of step lamps along the foot of its window (PERFORM), the
 * window giving up that much of its height -- a readout under a screen, on the hull like every other part, rather
 * than something bolted on. Every era gets it the same way.
 */
export const LAMPS_H = 40
const LAMPS_GAP = 10
export function withGarden(parts: Part[]): Part[] {
  const out: Part[] = []
  for (const p of parts) {
    if (p.kind !== 'perform') {
      out.push(p)
      continue
    }
    const [x0, y0, x1, y1] = p.rect
    const inset = Math.min(24, (x1 - x0) * 0.08)
    out.push({ ...p, rect: [x0, y0, x1, y1 - LAMPS_H - LAMPS_GAP] }, part(p.vco, 'garden', 'GARDEN', [x0 + inset, y1 - LAMPS_H, x1 - inset, y1], 'strip'))
  }
  return out
}

/** the help line for a part: what its pad does */
export const PART_HELP: Record<PartKind, string> = {
  perform: '←→ where the grains fire (POS) · ↑↓ volume — the liquid is the level, the bright line the playhead',
  grain: '↑↓ grain size (faster turns = smaller, faster grains) · ←→ how much of each turn sounds (blade width)',
  lfo: '←→ how far the LFO sweeps POS · ↑↓ how fast (tempo divisions) — it swings as it sweeps',
  fx: '↑↓ reverb (the ripples) · ←→ filter: warm low-pass left, clear in the middle, icy high-pass right',
  pitch: 'pitch: fine in the middle, coarse ×2 / stopped / backwards at the edges · far right brings the ring mod (smoke rings)',
  texture: '←→ SPRAY (bubbles scatter) · ↑↓ DETUNE (they split into two colours)',
  echo: '←→ echo time (it snaps to the tempo) · ↑↓ feedback (how many rings)',
  tone: '←→ darker / brighter (the stripes warm or cool) · ↑↓ mids pushed or scooped (the middle band swells)',
  garden: "the garden's lamps, its picked ring: ←→ its STEPS · ↑↓ its HITS · double-click: the next ring (the pips) · right-click: its prompt and the rest",
}
