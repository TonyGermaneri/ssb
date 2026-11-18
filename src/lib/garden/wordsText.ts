/**
 * What the word model is asked for the garden's rings, and what's kept of its answer (pure: the worker and the tests
 * share it). Given the prompt someone typed -- "in the depths of moria and in the misty mountains" -- it lists words of
 * one ring's kind that belong there (two worked examples show it how); the list is cleaned, its repeats and anything
 * copied from the examples dropped, and the words become that ring's.
 */
import type { RingKind } from './garden'

export const WORDS_SYSTEM = 'You are a sound designer. Given a scene, list words that belong in it. Reply with one comma separated list, lower case, nothing else.'

const SCENES = ['a rainy fishing harbour at night', 'a desert caravan crossing the dunes at noon'] as const

/** per kind: what to ask for, and the answer for each example scene */
export const WORD_ASKS: Record<RingKind, { what: string; examples: [string, string] }> = {
  adjective: {
    what: 'adjectives for how it sounds',
    examples: ['cold, dripping, hollow, salty, creaking, lonely, murky, foggy', 'dry, blazing, dusty, shimmering, vast, sleepy, sun-baked, windswept'],
  },
  texture: {
    what: 'sound textures and audio effects',
    examples: ['rain hiss, tape warble, reverb wash, sea spray noise, wet static, deep rumble', 'sand hiss, heat haze shimmer, wind noise, dry crackle, granular grit, low drone'],
  },
  noun: {
    what: 'things, creatures and characters from that scene or story',
    examples: ['gulls, ropes, foghorn, fishermen, buoy bell, lanterns, boats, nets', 'camels, nomads, bells, tents, sandstorm, merchants, scorpions, oasis'],
  },
  verb: {
    what: '-ing verbs for what the sounds are doing',
    examples: ['lapping, tolling, splashing, groaning, calling, swaying, mooring, sloshing', 'trudging, jingling, whistling, chanting, shifting, flapping, braying, baking'],
  },
  instrument: {
    what: 'musical instruments that would suit it',
    examples: ['accordion, fiddle, tin whistle, bodhran, concertina, bells, cello', 'oud, darbuka, ney flute, frame drum, kanun, rebab, finger cymbals'],
  },
  place: {
    what: 'places to hear it, each starting with in, on or under',
    examples: ['on the docks, in a fog bank, under the pier, in a sailors tavern, on a fishing boat', 'on a dune crest, in a nomad tent, under a palm tree, in a dry riverbed, at a desert well'],
  },
  custom: {
    what: 'words that evoke it',
    examples: ['brine, lamplight, drizzle, mooring, nets, tide, harbour, mist', 'mirage, dunes, caravan, heat, silk, spice, sun, sand'],
  },
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}
const ask = (scene: string, kind: RingKind) => `Scene: ${scene}\nList 8 ${WORD_ASKS[kind].what}.`

export function wordMessages(scene: string, kind: RingKind): ChatMessage[] {
  const a = WORD_ASKS[kind]
  return [
    { role: 'system', content: WORDS_SYSTEM },
    { role: 'user', content: ask(SCENES[0], kind) },
    { role: 'assistant', content: a.examples[0] },
    { role: 'user', content: ask(SCENES[1], kind) },
    { role: 'assistant', content: a.examples[1] },
    { role: 'user', content: ask(scene.trim(), kind) },
  ]
}

const PREP = /^(in|on|under|at|inside|beneath|through|across|over|by|near|deep in|from)\b/

/**
 * The words in a reply: split on commas and lines, numbering and quotes taken off, lower case; each 1-4 words; no
 * repeats, nothing straight from the examples, none under three letters (`cut`: the reply ran out of tokens, its last
 * part dropped). A place without a preposition gets "in"; a verb ring keeps its -ing words.
 */
export function parseWords(raw: string, kind: RingKind, cut = false): string[] {
  const examples = new Set(WORD_ASKS[kind].examples.join(',').split(',').map((x) => x.trim()))
  const out: string[] = []
  const parts = raw.split(/[,;\n]/)
  // a reply cut off at the tokens it was given ends mid-word ("mithril, m"): its last part goes
  if (cut) parts.pop()
  for (const part of parts) {
    let w = part
      .replace(/^\s*(\d+[.)]|[-*•])\s*/, '')
      .replace(/["'“”‘’.!?:()[\]]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
    if (w.length < 3 || !/[a-z]/.test(w)) continue
    const n = w.split(' ').length
    if (n > (kind === 'place' ? 6 : 4) || w.length > 32) continue
    if (kind === 'place' && !PREP.test(w)) w = `in ${w}`
    if (kind === 'verb' && !/ing\b/.test(w)) continue
    if (examples.has(w) || out.includes(w)) continue
    out.push(w)
  }
  return out.slice(0, 12)
}

/** enough words for a ring (else the worker asks again, adding to them) */
export const enoughWords = (w: string[]) => w.length >= 5
