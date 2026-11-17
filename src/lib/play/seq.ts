/**
 * The sequencer: SpaceCraft's notes grid (its manual, section 4). A piano laid out in rows: each row an octave, each
 * column a note of the scale, the pad with the triangle the sample's own key. While a VCO's SEQ is on, the keys, MIDI
 * and the pads all put notes in the grid, and its grains take turns through them in the order they came: each grain
 * that fires plays the next note. Overlapping grains make a chord; short, separate ones an arpeggio.
 *
 * With a scale other than CHROMATIC, MIDI's white keys play its notes one after another from the patch's root (a black
 * key plays the white key below it), as SpaceCraft's do.
 *
 * Pure: the page and both engines' note handling share it (the native engine has the same in Engine.cpp).
 */

export interface Scale {
  id: string
  label: string
  /** semitones from the root within an octave, rising from 0 */
  steps: number[]
}

/** SpaceCraft's scales, in its menu's order. */
export const SCALES = [
  { id: 'minor', label: 'MINOR (AEOLIAN)', steps: [0, 2, 3, 5, 7, 8, 10] },
  { id: 'major', label: 'MAJOR (IONIAN)', steps: [0, 2, 4, 5, 7, 9, 11] },
  { id: 'chromatic', label: 'CHROMATIC', steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  { id: 'minorPent', label: 'MINOR PENTATONIC', steps: [0, 3, 5, 7, 10] },
  { id: 'majorPent', label: 'MAJOR PENTATONIC', steps: [0, 2, 4, 7, 9] },
  { id: 'dorian', label: 'DORIAN', steps: [0, 2, 3, 5, 7, 9, 10] },
  { id: 'phrygian', label: 'PHRYGIAN', steps: [0, 1, 3, 5, 7, 8, 10] },
  { id: 'lydian', label: 'LYDIAN', steps: [0, 2, 4, 6, 7, 9, 11] },
  { id: 'mixolydian', label: 'MIXOLYDIAN', steps: [0, 2, 4, 5, 7, 9, 10] },
  { id: 'locrian', label: 'LOCRIAN', steps: [0, 1, 3, 5, 6, 8, 10] },
  { id: 'octaves', label: 'OCTAVES', steps: [0] },
  { id: 'fifths', label: 'PERFECT FIFTHS', steps: [0, 7] },
  { id: 'fourths', label: 'PERFECT FOURTHS', steps: [0, 5] },
  { id: 'majorThirds', label: 'MAJOR THIRDS', steps: [0, 4, 8] },
  { id: 'minorThirds', label: 'MINOR THIRDS', steps: [0, 3, 6, 9] },
  { id: 'harmonicMinor', label: 'HARMONIC MINOR', steps: [0, 2, 3, 5, 7, 8, 11] },
  { id: 'melodicMinor', label: 'MELODIC MINOR', steps: [0, 2, 3, 5, 7, 9, 11] },
  { id: 'superLocrian', label: 'SUPER LOCRIAN', steps: [0, 1, 3, 4, 6, 8, 10] },
  { id: 'bhairav', label: 'ARABIC BHAIRAV', steps: [0, 1, 4, 5, 7, 8, 11] },
  { id: 'hungarianMinor', label: 'HUNGARIAN MINOR', steps: [0, 2, 3, 6, 7, 8, 11] },
  { id: 'minorGypsy', label: 'MINOR GYPSY', steps: [0, 2, 3, 6, 7, 8, 10] },
  { id: 'enigmatic', label: 'ENIGMATIC', steps: [0, 1, 4, 6, 8, 10, 11] },
  { id: 'wholeTone', label: 'WHOLE TONE', steps: [0, 2, 4, 6, 8, 10] },
  { id: 'minorBlues', label: 'MINOR BLUES', steps: [0, 3, 5, 6, 7, 10] },
  { id: 'pelog', label: 'PELOG', steps: [0, 1, 3, 7, 8] },
  { id: 'tritone', label: 'TRITONE', steps: [0, 1, 4, 6, 7, 10] },
  { id: 'prometheus', label: 'PROMETHEUS', steps: [0, 2, 4, 6, 9, 10] },
  { id: 'augmented', label: 'AUGMENTED', steps: [0, 3, 4, 7, 8, 11] },
  { id: 'diminished', label: 'DIMINISHED', steps: [0, 1, 3, 4, 6, 7, 9, 10] },
  { id: 'wholeHalf', label: 'WHOLE-HALF', steps: [0, 2, 3, 5, 6, 8, 9, 11] },
  { id: 'hirajoshi', label: 'HIROJOSHI', steps: [0, 2, 3, 7, 8] },
  { id: 'inSen', label: 'IN SEN', steps: [0, 1, 5, 7, 10] },
  { id: 'iwato', label: 'JAPANESE IWATO', steps: [0, 1, 5, 6, 10] },
  { id: 'kumoi', label: 'KUMOI', steps: [0, 2, 3, 7, 9] },
] as const satisfies readonly Scale[]

export type ScaleId = (typeof SCALES)[number]['id']

export const scaleOf = (id: string | undefined): Scale => SCALES.find((s) => s.id === id) ?? SCALES[1]

/** The grid's pads: rows top to bottom (an octave each, the sample's own key in the row of octave 0), columns the scale. */
export interface GridLayout {
  cols: number
  rows: number
  /** the top row's octave */
  top: number
  /** cells[row][col]: semitones from the sample's own key */
  cells: number[][]
}

/**
 * SpaceCraft's grid: four octaves (one above the sample's key, two below) for a scale of seven or more notes; scales
 * with fewer get more rows, up to eight, so the grid always offers a few dozen pads.
 */
export function gridLayout(id: string | undefined): GridLayout {
  const { steps } = scaleOf(id)
  const cols = steps.length
  const rows = Math.min(8, Math.max(4, Math.ceil(28 / cols)))
  const top = Math.ceil(rows / 2) - 1
  const cells = Array.from({ length: rows }, (_, r) => steps.map((st) => st + 12 * (top - r)))
  return { cols, rows, top, cells }
}

/** A white key's place counting white keys from C-1 (MIDI 0); a black key counts as the white key below it. */
const WHITE = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6]
const whiteIndex = (note: number) => {
  const n = Math.round(note)
  const oct = Math.floor(n / 12)
  return oct * 7 + WHITE[n - oct * 12]
}

/**
 * Semitones from the sample's own key that a key plays into the grid. CHROMATIC: the key's distance from the patch's
 * root. Any other scale: the white keys from the root's (a black root counts as the white key below it) step through
 * the scale, octave after octave.
 */
export function keyToGrid(id: string | undefined, note: number, root: number): number {
  const scale = scaleOf(id)
  if (scale.id === 'chromatic') return Math.round(note - root)
  const deg = whiteIndex(note) - whiteIndex(root)
  const n = scale.steps.length
  const oct = Math.floor(deg / n)
  return scale.steps[deg - oct * n] + 12 * oct
}

/** The scale's note nearest `semis` (in any octave): PITCH · RING's SCALE mode. */
export function snapToScale(id: string | undefined, semis: number): number {
  const { steps } = scaleOf(id)
  const oct = Math.floor(semis / 12)
  let best = semis
  let dist = Infinity
  for (const o of [oct - 1, oct, oct + 1]) {
    for (const st of steps) {
      const v = st + 12 * o
      const d = Math.abs(v - semis)
      if (d < dist - 1e-9) {
        dist = d
        best = v
      }
    }
  }
  return best
}

/** The grid's pads after one is clicked: on goes to the end of the order (SINGLE NOTE: alone), off leaves it. */
export function toggleGrid(grid: readonly number[], semis: number, single: boolean): number[] {
  if (grid.includes(semis)) return grid.filter((x) => x !== semis)
  return single ? [semis] : [...grid, semis]
}
