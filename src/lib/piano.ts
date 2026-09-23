/** Tracker-style computer keyboard: Z row = lower octave, Q row = upper octave. */
const LOWER = ['z', 's', 'x', 'd', 'c', 'v', 'g', 'b', 'h', 'n', 'j', 'm', ',', 'l', '.', ';', '/']
const UPPER = ['q', '2', 'w', '3', 'e', 'r', '5', 't', '6', 'y', '7', 'u', 'i', '9', 'o', '0', 'p']

export const ROOT_NOTE = 60 // C4 plays the sample at its recorded pitch

/** MIDI note for a key, or null. Octave 0 puts Z on C3 and Q on C4 (the root). */
export function keyToMidi(key: string, octave: number): number | null {
  const k = key.toLowerCase()
  let i = LOWER.indexOf(k)
  if (i >= 0) return 48 + 12 * octave + i
  i = UPPER.indexOf(k)
  if (i >= 0) return 60 + 12 * octave + i
  return null
}
