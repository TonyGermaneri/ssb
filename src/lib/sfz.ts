/**
 * SFZ parsing: text → flat list of regions with inherited opcodes.
 *
 * Supports <control> (default_path, note_offset, octave_offset), <global>, <master>, <group>, <region>
 * inheritance, #define macros, #include (via a resolver), // and block comments, and sample paths with spaces.
 */

export type Opcodes = Record<string, string>

export interface SfzRegion {
  /** sample path as written (default_path applied, slashes normalised) */
  sample: string
  opcodes: Opcodes
}

const HEADER = /<(\w+)>/g

/** MIDI note from an SFZ value: number or note name (c4 = 60, c#4, db4). */
export function sfzNote(v: string | undefined, fallback: number): number {
  if (v === undefined) return fallback
  const s = v.trim().toLowerCase()
  if (/^-?\d+$/.test(s)) return parseInt(s, 10)
  const m = /^([a-g])([#b]?)(-?\d+)$/.exec(s)
  if (!m) return fallback
  const base = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, b: 11 }[m[1] as 'c']
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0
  return (parseInt(m[3], 10) + 1) * 12 + base + acc
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, '')
}

/**
 * Expand #include and #define. `include(path)` returns the included file's text, or null.
 * Defines are shared across includes (a macro defined in one file is used in the files it includes, and after).
 */
function preprocess(
  text: string,
  include: (path: string) => string | null,
  depth = 0,
  defines = new Map<string, string>(),
): string {
  const lines = stripComments(text).split(/\r?\n/)
  const out: string[] = []
  for (let line of lines) {
    const def = /^\s*#define\s+(\$\w+)\s+(.*?)\s*$/.exec(line)
    if (def) {
      defines.set(def[1], def[2])
      continue
    }
    const inc = /^\s*#include\s+"([^"]+)"/.exec(line)
    if (inc) {
      const sub = depth < 8 ? include(inc[1]) : null
      if (sub !== null) out.push(preprocess(sub, include, depth + 1, defines))
      continue
    }
    // longest names first so $VEL doesn't clobber $VELOCITY
    for (const [k, v] of [...defines].sort((a, b) => b[0].length - a[0].length)) line = line.split(k).join(v)
    out.push(line)
  }
  return out.join('\n')
}

/** Opcodes from one header's body. Values run until the next `name=` on the same line (so paths may contain spaces). */
function parseOpcodes(body: string): Opcodes {
  const ops: Opcodes = {}
  for (const line of body.split('\n')) {
    const re = /([A-Za-z0-9_]+)=/g
    const hits: { key: string; start: number; valueStart: number }[] = []
    let m: RegExpExecArray | null
    while ((m = re.exec(line))) hits.push({ key: m[1], start: m.index, valueStart: re.lastIndex })
    hits.forEach((h, i) => {
      const end = i + 1 < hits.length ? hits[i + 1].start : line.length
      ops[h.key] = line.slice(h.valueStart, end).trim()
    })
  }
  return ops
}

export const normalisePath = (p: string) =>
  p
    .replace(/\\/g, '/')
    .split('/')
    .reduce<string[]>((acc, seg) => {
      if (seg === '..') acc.pop()
      else if (seg && seg !== '.') acc.push(seg)
      return acc
    }, [])
    .join('/')

export interface SfzFile {
  regions: SfzRegion[]
  /** <control> opcodes (default_path, set_ccN, …) */
  control: Opcodes
}

export function parseSfz(text: string, include: (path: string) => string | null = () => null): SfzFile {
  const src = preprocess(text, include)
  const regions: SfzRegion[] = []
  let control: Opcodes = {}
  let global: Opcodes = {}
  let master: Opcodes = {}
  let group: Opcodes = {}

  const parts: { header: string; body: string }[] = []
  let last = 0
  let header = ''
  HEADER.lastIndex = 0
  for (let m = HEADER.exec(src); m; m = HEADER.exec(src)) {
    if (header) parts.push({ header, body: src.slice(last, m.index) })
    header = m[1].toLowerCase()
    last = HEADER.lastIndex
  }
  if (header) parts.push({ header, body: src.slice(last) })

  for (const { header: h, body } of parts) {
    const ops = parseOpcodes(body)
    switch (h) {
      case 'control':
        control = { ...control, ...ops }
        break
      case 'global':
        global = ops
        master = {}
        group = {}
        break
      case 'master':
        master = ops
        group = {}
        break
      case 'group':
        group = ops
        break
      case 'region': {
        const merged: Opcodes = { ...global, ...master, ...group, ...ops }
        if (!merged.sample) break
        // *sine, *saw, … are built-in generators: no path
        const sample = merged.sample.startsWith('*')
          ? merged.sample.toLowerCase()
          : normalisePath((control.default_path ?? '') + merged.sample)
        regions.push({ sample, opcodes: merged })
        break
      }
    }
  }
  // note_offset / octave_offset shift every key opcode
  const shift = (parseInt(control.note_offset ?? '0', 10) || 0) + 12 * (parseInt(control.octave_offset ?? '0', 10) || 0)
  if (shift) {
    for (const r of regions) {
      for (const k of ['key', 'lokey', 'hikey', 'pitch_keycenter']) {
        if (r.opcodes[k] !== undefined && r.opcodes[k] !== 'sample') r.opcodes[k] = String(sfzNote(r.opcodes[k], 60) + shift)
      }
    }
  }
  return { regions, control }
}
