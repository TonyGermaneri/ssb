/** Tags are stored as one comma-separated string per pad ("drums, 808, dirt-samples"). */

export const splitTags = (tag: string | undefined): string[] => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of (tag ?? '').split(',')) {
    const name = t.trim()
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase())
      out.push(name)
    }
  }
  return out
}

export const joinTags = (tags: string[]) => splitTags(tags.join(',')).join(', ')

/** Add tags to a tag string, keeping existing ones first. */
export const addTags = (tag: string, extra: string[]) => joinTags([...splitTags(tag), ...extra])

/** Does a pad carry every selected tag? (case-insensitive) */
export function hasAllTags(tag: string, selected: string[]): boolean {
  if (!selected.length) return true
  const mine = new Set(splitTags(tag).map((t) => t.toLowerCase()))
  return selected.every((t) => mine.has(t.toLowerCase()))
}

export interface Facet {
  name: string
  count: number
  selected: boolean
}

/**
 * Tag facets for the pads left after filtering: each tag with how many of those pads carry it.
 * Selected tags come first; the rest by count, then name.
 */
export function tagFacets(tagStrings: string[], selected: string[]): Facet[] {
  const sel = new Set(selected.map((t) => t.toLowerCase()))
  const counts = new Map<string, Facet>()
  for (const s of tagStrings) {
    if (!hasAllTags(s, selected)) continue
    for (const t of splitTags(s)) {
      const key = t.toLowerCase()
      const f = counts.get(key)
      if (f) f.count++
      else counts.set(key, { name: t, count: 1, selected: sel.has(key) })
    }
  }
  return [...counts.values()].sort(
    (a, b) => Number(b.selected) - Number(a.selected) || b.count - a.count || a.name.localeCompare(b.name),
  )
}
