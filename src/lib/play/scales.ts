/**
 * Scales: PITCH · RING's SCALE mode snaps the pitch pad to one (settings.pitchScaleId). Pure.
 */
export interface Scale {
  id: string
  label: string
  /** semitones from the root within an octave, rising from 0 */
  steps: number[]
}

/** The scales, as offered in the pitch pad's settings. */
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
