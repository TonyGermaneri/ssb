/**
 * How the cockpit's controls look in each skin: the gradient stops of a knob's body and cap, a lever's grip, a
 * plate's enamel -- the materials, as numbers, for CockpitControl.vue to paint with.
 */
import type { KnobStyle, LeverStyle, PlateStyle } from './design'

export interface KnobLook {
  /** the body's radial stops (centre lit from the top left) */
  body: string[]
  cap: string[]
  /** the pointer line */
  pointer: string
  /** fluted edge (bakelite), knurled (brass), smooth */
  edge: 'flutes' | 'knurl' | 'smooth' | 'none'
  /** a white gloss over it, 0..1 */
  gloss: number
  /** a lit arc round it in the VCO's colour (glowing skins) */
  arc: boolean
  /** the cap tinted the VCO's colour */
  tintCap: boolean
  /** translucent */
  clear?: boolean
  /** a skirt round it with the scale printed */
  skirt: string | null
}

export const KNOBS: Record<KnobStyle, KnobLook> = {
  bakelite: { body: ['#5a3a28', '#2b1a12', '#120a06'], cap: ['#6b4632', '#311d13'], pointer: '#f3e2bd', edge: 'flutes', gloss: 0.35, arc: false, tintCap: false, skirt: '#b88a3a' },
  brass: { body: ['#fff1b8', '#d6a646', '#6a4512'], cap: ['#ffe9a8', '#b8862e'], pointer: '#2a1a08', edge: 'knurl', gloss: 0.5, arc: false, tintCap: false, skirt: '#3a2610' },
  chrome: { body: ['#ffffff', '#9aa3ad', '#3b4048'], cap: ['#f4f6f8', '#7d8590'], pointer: '#111', edge: 'knurl', gloss: 0.7, arc: false, tintCap: true, skirt: '#1b1d22' },
  jelly: { body: ['#ffffffcc', '#ffffff55', '#00000030'], cap: ['#ffffffaa', '#ffffff20'], pointer: '#ffffff', edge: 'smooth', gloss: 0.9, arc: true, tintCap: true, clear: true, skirt: null },
  rubber: { body: ['#4a4a50', '#26262b', '#111114'], cap: ['#3a3a40', '#1c1c20'], pointer: '#ffffff', edge: 'smooth', gloss: 0.12, arc: true, tintCap: true, skirt: '#0b0b0d' },
  flat: { body: ['#ffffff00', '#ffffff00', '#ffffff00'], cap: ['#ffffff', '#ffffff'], pointer: '#ffffff', edge: 'none', gloss: 0, arc: true, tintCap: true, skirt: null },
  glass: { body: ['#ffffff40', '#ffffff18', '#ffffff08'], cap: ['#ffffff50', '#ffffff10'], pointer: '#ffffff', edge: 'smooth', gloss: 0.6, arc: true, tintCap: false, clear: true, skirt: null },
  holo: { body: ['#ffffff00', '#ffffff00', '#ffffff00'], cap: ['#ffffff00', '#ffffff00'], pointer: '#ffffff', edge: 'none', gloss: 0, arc: true, tintCap: false, skirt: null },
  wood: { body: ['#c58a52', '#7a4a24', '#3a200c'], cap: ['#ffe9a8', '#b8862e'], pointer: '#2a1a08', edge: 'smooth', gloss: 0.3, arc: false, tintCap: false, skirt: '#2a1a0c' },
  chickenhead: { body: ['#3a3a3a', '#141414', '#050505'], cap: ['#2a2a2a', '#0a0a0a'], pointer: '#f4efe0', edge: 'none', gloss: 0.3, arc: false, tintCap: false, skirt: '#d9d2bf' },
}

export interface LeverLook {
  /** the grip's stops (lit from the top left) */
  grip: string[]
  rod: string[]
  /** the grip tinted the VCO's colour */
  tint: boolean
  glow: boolean
  gloss: number
  /** knob (a ball), tee (a T-handle), cap (a fader cap), paddle */
  head: 'ball' | 'tee' | 'cap' | 'paddle'
}
export const LEVERS: Record<LeverStyle, LeverLook> = {
  brass: { grip: ['#3b2416', '#1a0d06'], rod: ['#fff1b8', '#c79a3e', '#5a3a10'], tint: false, glow: false, gloss: 0.4, head: 'ball' },
  chrome: { grip: ['#ffffff', '#8c949e', '#2c3036'], rod: ['#ffffff', '#9aa3ad', '#3b4048'], tint: true, glow: false, gloss: 0.7, head: 'tee' },
  jelly: { grip: ['#ffffffcc', '#ffffff40'], rod: ['#ffffff90', '#ffffff30'], tint: true, glow: true, gloss: 0.9, head: 'ball' },
  neon: { grip: ['#111', '#000'], rod: ['#333', '#111'], tint: true, glow: true, gloss: 0.2, head: 'cap' },
  flat: { grip: ['#ffffff', '#ffffff'], rod: ['#ffffff00', '#ffffff00'], tint: true, glow: false, gloss: 0, head: 'cap' },
  carbon: { grip: ['#3a3d42', '#16181b'], rod: ['#c9ced6', '#5b6068', '#22252a'], tint: true, glow: true, gloss: 0.3, head: 'paddle' },
  wood: { grip: ['#c58a52', '#5a3416'], rod: ['#e8e8e8', '#8a8a8a', '#333'], tint: false, glow: false, gloss: 0.3, head: 'tee' },
  glass: { grip: ['#ffffff50', '#ffffff10'], rod: ['#ffffff30', '#ffffff08'], tint: true, glow: true, gloss: 0.7, head: 'cap' },
}

export interface PlateLook {
  fill: string[]
  text: string
  edge: string
  /** an engraved look: a light line under the text */
  engraved: boolean
  glow: boolean
}
export const PLATES: Record<PlateStyle, PlateLook> = {
  brass: { fill: ['#f6dc8c', '#b88a2e', '#7a5414'], text: '#2a1806', edge: '#3a2408', engraved: true, glow: false },
  enamel: { fill: ['#f5efe0', '#d8cfb8'], text: '#1c1a16', edge: '#3a352a', engraved: false, glow: false },
  dymo: { fill: ['#1d1d1f', '#0c0c0d'], text: '#f2f2f2', edge: '#000', engraved: true, glow: false },
  silk: { fill: ['#00000000', '#00000000'], text: '', edge: 'none', engraved: false, glow: false },
  neon: { fill: ['#00000000', '#00000000'], text: '', edge: 'none', engraved: false, glow: true },
  chrome: { fill: ['#ffffff', '#a9b0b9', '#5d636c'], text: '#111', edge: '#2b2e33', engraved: true, glow: false },
  none: { fill: ['#00000000', '#00000000'], text: '', edge: 'none', engraved: false, glow: false },
  candy: { fill: ['#ffffffee', '#ffffff99'], text: '', edge: '#ffffff', engraved: false, glow: false },
  etched: { fill: ['#00000000', '#00000000'], text: '', edge: 'none', engraved: true, glow: false },
}
