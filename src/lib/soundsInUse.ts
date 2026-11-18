/**
 * The sounds patches play -- as they are now AND as each was last SAVEd. A patch with unsaved edits is stored as it
 * was saved (board.ts savedBodies), so a sound its saved version plays is still needed on the next load even if its
 * edits have moved on (a growing garden swaps a VCO's take every few loops). Anything that deletes sounds for good
 * (the garden's old takes) must leave all of these alone.
 */
import { patchLayers, type Patch, type PatchSlot } from '../types'

/** `bodies`: saved patch bodies as stored, JSON of [slots, header, mpe] */
export function soundsInUse(patches: Patch[], bodies: Iterable<string>, drafts: (string | null | undefined)[] = []): Set<string> {
  const used = new Set<string>()
  for (const p of patches) for (const l of patchLayers(p)) used.add(l.soundId)
  for (const body of [...bodies, ...drafts]) {
    if (!body) continue
    try {
      const [slots] = JSON.parse(body) as [(PatchSlot | null)[]]
      for (const x of slots ?? []) if (x?.layer?.soundId) used.add(x.layer.soundId)
    } catch {
      // a body that doesn't read protects nothing
    }
  }
  return used
}
