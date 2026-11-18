/**
 * A COCKPIT, as a plan: each era's (cockpit/eras/) view from the pilot's seat -- its windscreen onto the voyage's sky,
 * its dash and consoles, and every VCO's 17 controls (params.ts) as the era would have built them: a brass valve
 * wheel or a jelly slider, a chain to pull, a cable to plug into the tempo's jacks. Design units: 1600 × 900 (the
 * stage scales to fit, the art reaching past it so a wider or taller screen sees more cockpit, not bars).
 */
import type { Component } from 'vue'
import type { ParamId } from './params'
import type { TextureId } from './textures'

export const STAGE = { w: 1600, h: 900 }

/**
 * How a control is built (CockpitControls.vue draws each, in the era's skin):
 * - knob: a rotary, 270° (drag up / down)        - selector: a detented rotary with its stops printed round it
 * - lever: a throttle on a quadrant (drag along)  - slider: a fader in a slot
 * - crank: a handle you wind (2½ turns end to end) - valve: a spoked hand wheel (1¼ turns)
 * - chain: a chain with a pull, hanging (pull it down) - cable: a patch lead plugged into one of a row of jacks
 * - stick: a joystick (both of PITCH's axes)       - counter: nixie / flip digits, dragged up / down
 * - toggle: a bat-handle switch: down below the middle, up above (for a bipolar one, three ways)
 */
export type ControlKind = 'knob' | 'selector' | 'lever' | 'slider' | 'crank' | 'valve' | 'chain' | 'cable' | 'stick' | 'counter' | 'toggle'

export interface ControlSpec {
  vco: number
  /** a stick takes 'pitchX' and drives both of PITCH's axes */
  param: ParamId
  kind: ControlKind
  /** centre (rotary, stick, counter), or the middle of its travel (lever, slider, chain), design units */
  x: number
  y: number
  /** a rotary's radius; a linear control's travel; a cable's row width */
  size: number
  /** a linear control's direction, degrees (0: up, 90: right); a chain hangs down whatever */
  angle?: number
  /** its own look, where the skin allows more than one */
  variant?: string
  /** print its label (default true) */
  label?: boolean
  /** a cable's lead: where its socket is -- below the jacks (default), level with them to the left, or above them */
  lead?: 'below' | 'left' | 'above'
  /** its label moved down (or up, negative) from where it goes, design units */
  labelDy?: number
}

export interface ScreenSpec {
  vco: number
  x: number
  y: number
  w: number
  h: number
  /** what it shows: the clip (PERFORM), a pad's picture, the VCO's scope */
  show: 'clip' | 'scope' | 'grain' | 'lfo' | 'fx' | 'pitch' | 'texture' | 'echo' | 'tone' | 'garden'
  /** corner radius; round: an oval tube */
  r?: number
  round?: boolean
}
export interface GaugeSpec {
  vco: number
  x: number
  y: number
  r: number
  /** the VCO's level, its beam's charge (the intake's state), its grains' rate */
  show: 'level' | 'beam' | 'grains'
  label?: string
}

export type KnobStyle = 'bakelite' | 'brass' | 'chrome' | 'jelly' | 'rubber' | 'flat' | 'glass' | 'holo' | 'wood' | 'chickenhead'
export type LeverStyle = 'brass' | 'chrome' | 'jelly' | 'neon' | 'flat' | 'carbon' | 'wood' | 'glass'
export type ScreenStyle = 'crtGreen' | 'crtAmber' | 'crtColor' | 'vector' | 'lcd' | 'vfd' | 'oled' | 'holo' | 'plasma' | 'kaleido' | 'aqua' | 'flat'
export type PlateStyle = 'brass' | 'enamel' | 'dymo' | 'silk' | 'neon' | 'chrome' | 'none' | 'candy' | 'etched'

export interface Skin {
  font: string
  /** label text, and the plate it's printed on */
  label: string
  plate: PlateStyle
  plateColor: string
  knob: KnobStyle
  lever: LeverStyle
  screen: ScreenStyle
  /** metal (bezels, quadrants, jacks): dark, mid, light */
  metal: [string, string, string]
  /** each VCO's colour (its knob caps, its lights) */
  vco: [string, string, string]
  /** lamps, beams, glows */
  glow: string
  ink: string
  /** the outlines' weight (0: none) */
  stroke: number
  /** the garden's digits: nixie tubes (default for green / amber CRT eras), LCD segments, LEDs in the VCO's colour, flip
   * cards (default: by the screen) */
  counter?: 'nixie' | 'lcd' | 'led' | 'flip'
  /** a patch bay's plate (default: the metal) */
  cablePlate?: string
  /** the text on label plates (default: the plate's own, else `label`) */
  plateText?: string
}

export interface Atmosphere {
  /** 0..1 each */
  dust: number
  shafts: number
  grain: number
  scanlines: number
  /** electromagnetic interference: the picture's rolling wobble and colour fringing */
  emf: number
  vignette: number
  /** the windscreen glass: smudges and reflections */
  glass: number
  bloom: number
  /** an overall wash (the era's film stock), rgb 0..1 */
  tint: [number, number, number]
  /** how far the sky behind the glass is out of focus (css px at 1×) */
  depth: number
  /** a dreamy hue drift over everything (the sixties) */
  trip: number
}

export interface CockpitDesign {
  era: string
  /** its name, as a placard might print it */
  title: string
  skin: Skin
  controls: ControlSpec[]
  screens: ScreenSpec[]
  gauges: GaugeSpec[]
  /** where a caught rock goes down into each VCO's console (design units) */
  intakes: { vco: number; x: number; y: number }[]
  /** the windscreen: its outline (an SVG path, design units) -- the sky shows through it */
  glass: string
  /** the vanishing point ahead (design units) */
  vp: { x: number; y: number }
  /** where the sun's light comes in (design units, may be off the stage), for the light shafts */
  sun: { x: number; y: number }
  atmosphere: Atmosphere
  /** the art: behind the controls (dash, frame, panels, decor) and in front of them (struts, hanging things, near and soft) */
  back: Component
  front?: Component
  /** a material swatch for the panels the controls sit on (CockpitView lays it under `back`'s console art) */
  panelTexture?: TextureId
}
