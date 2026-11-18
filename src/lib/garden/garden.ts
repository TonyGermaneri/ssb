/**
 * The PROMPT GARDEN: a VCO that keeps regrowing its own sample. Rings of words (nouns, verbs, textures...) each turn a
 * Euclidean rhythm, k hits spread over n steps; every generation is one step of all of them, and a ring that hits on
 * that step moves on to its next word (or, set to DROP, is only heard on its hits). The words that come up, with the
 * chips (genre, mood, style) and the enum grids (tempo, key, length) always there, are the next caption for the sound
 * model, which makes the next clip in the background while this one plays; after LOOPS passes of the clip the new one
 * is stitched in at a loop boundary (engine.stitch, Engine.cpp's stitch), so the voice never stops.
 *
 * It is all a function of the garden's seed and its step: rings that cycle come round again (the whole garden repeats
 * every lcm of their periods), and a caption that has come up before plays the clip it made then -- so a garden drifts
 * through one semantic space, mostly, and sometimes loops. BACK sends it to an earlier clip at random, too.
 *
 * Pure: no Vue, no stores (stores/garden.ts runs it; GardenDialog.vue shows it).
 */

// ── Euclidean rhythms ──────────────────────────────────────────────────────────────────────────────────────────────
/**
 * k hits spread as evenly as they go over n steps (Bjorklund's, as Toussaint's "Euclidean rhythms" has it), the
 * first step a hit, then turned `rot` steps later. euclid(3, 8) is the tresillo, x..x..x.
 */
export function euclid(k: number, n: number, rot = 0): boolean[] {
  n = Math.max(1, Math.min(64, Math.round(n)))
  k = Math.max(0, Math.min(n, Math.round(k)))
  // Bjorklund: k groups of [x] and n - k of [.], the remainders paired onto the groups until one remains
  let a: boolean[][] = Array.from({ length: k }, () => [true])
  let b: boolean[][] = Array.from({ length: n - k }, () => [false])
  while (b.length > 1 && a.length) {
    const m = Math.min(a.length, b.length)
    const rest = a.length > m ? a.slice(m) : b.slice(m)
    a = a.slice(0, m).map((x, i) => [...x, ...b[i]])
    b = rest
  }
  const base = [...a, ...b].flat()
  const r = ((Math.round(rot) % n) + n) % n
  return base.map((_, i) => base[(i - r + n) % n])
}

/** How many hits come in steps 0..step (step included), for a ring's pattern repeating forever. */
export function hitsUpTo(pattern: boolean[], step: number): number {
  if (step < 0) return 0
  const n = pattern.length
  const per = pattern.filter(Boolean).length
  const full = Math.floor((step + 1) / n)
  let h = full * per
  for (let i = 0; i < (step + 1) % n; i++) if (pattern[i]) h++
  return h
}

// ── seeded randomness ──────────────────────────────────────────────────────────────────────────────────────────────
/** a 32-bit hash of the parts (FNV-1a over their text), for picks that come out the same every time */
export function hash32(...parts: (string | number)[]): number {
  let h = 0x811c9dc5
  for (const ch of parts.join('\u0001')) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 0x01000193)
  }
  // finalise (murmur3's), so close inputs land far apart
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}
/** 0..1 from the parts */
export const rand01 = (...parts: (string | number)[]) => hash32(...parts) / 2 ** 32

// ── the model ──────────────────────────────────────────────────────────────────────────────────────────────────────
export const RING_KINDS = ['adjective', 'texture', 'noun', 'verb', 'instrument', 'place', 'custom'] as const
export type RingKind = (typeof RING_KINDS)[number]
/** how a ring moves on when it hits: the next word, a word at random, or a step either way (neighbours stay close) */
export type RingMove = 'cycle' | 'random' | 'walk'

export interface Ring {
  id: string
  kind: RingKind
  label: string
  words: string[]
  /** hits, steps, rotation */
  k: number
  n: number
  rot: number
  move: RingMove
  /** DROP: heard only on its hits; HOLD: its word stays in the caption between them */
  drop: boolean
  /** frozen on `lockWord` (the word it showed when it was locked) */
  locked: boolean
  lockWord?: number
  /** muted: out of the caption altogether */
  off?: boolean
}

export const CHIP_GROUPS = ['genre', 'mood', 'style'] as const
export type ChipGroup = (typeof CHIP_GROUPS)[number]

/** the enum grids: values the caption takes one of each step (cycling through the ones lit) */
export const ENUM_GRIDS = {
  bpm: [60, 70, 80, 90, 100, 110, 120, 128, 140, 160, 174],
  key: ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'],
  scale: ['major', 'minor', 'dorian', 'phrygian', 'pentatonic'],
  seconds: [1, 2, 3, 4, 6, 8, 12],
} as const
export type EnumGrid = keyof typeof ENUM_GRIDS

export interface GardenTake {
  /** the board sound the clip is */
  soundId: string
  prompt: string
  step: number
  /** ms since 1970 */
  at: number
  /** came back round: an earlier clip played again (BACK, or the same caption) */
  again?: boolean
  /** SAVEd into the samples (tagged generated): it stays when the takes after it push it out */
  saved?: boolean
}

/** A take SAVEd from the garden: the sound it became, and what made it, kept with the patch (Garden.saved). */
export interface SavedTake {
  soundId: string
  prompt: string
  step: number
  seed: number
  /** the sound model's id ('sketch': the stand-in synth) */
  model: string
  /** the VCO it grew on, 0..2 */
  slot: number
  at: number
}

export interface Garden {
  on: boolean
  seed: number
  /** the step the clip playing was made for */
  step: number
  rings: Ring[]
  /** the chips lit, by group */
  chips: Record<ChipGroup, string[]>
  /** each grid's values lit (none: the grid stays out of the caption) */
  grids: { bpm: number[]; key: string[]; scale: string[]; seconds: number[] }
  /** passes of the clip before the next one is stitched in */
  loops: number
  /** the crossfade at the stitch, seconds (up to FADE_MAX: a long one overlaps several loops of the old clip and the new) */
  fade: number
  /** loops the swaps are pushed back by, so VCOs with the same LOOPS don't all swap together */
  offset: number
  /** growth held: no new clips made or stitched in; the one playing loops on */
  paused: boolean
  /** 0..1: the chance a step goes back to an earlier clip instead of a new one */
  back: number
  /** a caption that came up before plays its clip again (no generation) */
  reuse: boolean
  /** the sound model's id ('' = the fastest one there: Stable Audio 3 Small Music) */
  model: string
  /** what the model is steered away from */
  negative: string
  /** words before / after every caption */
  prefix: string
  suffix: string
  /** the clips it has made, newest first (only the latest TAKES_KEPT keep their audio) */
  history: GardenTake[]
  /** the takes SAVEd into the samples, oldest first */
  saved: SavedTake[]
  /** the PLAY view's pads grow too: at each new clip, the pads chosen walk somewhere new (PadGrowth) */
  pads: PadGrowth
}

/**
 * The pads growing with the clips: each time a new clip is stitched in, every pad in `pads` steps to a new point (its
 * x and y: 16 parameters for all eight), a seeded walk of up to `amount` from where it is -- the same garden, seed
 * and step move them the same way. The move starts OFFSET loops after the stitch and glides over XFADE.
 */
export interface PadGrowth {
  on: boolean
  /** 0..1: how far a pad can step at once (of its whole width / height) */
  amount: number
  /** the pads that move (PadId: perform, grain, lfo, fx, pitch, texture, echo, tone) */
  pads: string[]
}
export const PAD_GROWTH_PADS = ['perform', 'grain', 'lfo', 'fx', 'pitch', 'texture', 'echo', 'tone'] as const
/** the pads that move to begin with: not the level (PERFORM) nor the pitch, which would be jarring to have wander */
export const defaultPadGrowth = (): PadGrowth => ({ on: false, amount: 0.25, pads: ['grain', 'lfo', 'fx', 'texture', 'echo', 'tone'] })

/** Where a pad steps to at `step`: from `from`, up to `amount` each way on each axis, folded back in at the edges. */
export function padTarget(seed: number, step: number, pad: string, from: { x: number; y: number }, amount: number): { x: number; y: number } {
  const fold = (v: number) => {
    let x = ((v % 2) + 2) % 2
    if (x > 1) x = 2 - x
    return x
  }
  const a = Math.min(1, Math.max(0, amount))
  return {
    x: fold(from.x + (rand01(seed, 'pad', pad, 'x', step) * 2 - 1) * a),
    y: fold(from.y + (rand01(seed, 'pad', pad, 'y', step) * 2 - 1) * a),
  }
}

/**
 * Seconds after a stitch the pads start moving: OFFSET loops of the clip, wrapped into the time until the next stitch
 * (`cycle`, s) so a move always lands between two of them. OFFSET 0: with the new clip, gliding over its crossfade.
 */
export function padMoveDelay(offset: number, loopSec: number, cycle: number): number {
  const d = Math.max(0, offset) * Math.max(0, loopSec)
  return cycle > 0 ? d % cycle : d
}

/** prompts remembered in the history */
export const HISTORY_MAX = 32
/** takes that keep their audio (to BACK to, REUSE, hear in HISTORY); older ones are let go unless SAVEd */
export const TAKES_KEPT = 6
export const DEFAULT_GARDEN_MODEL = 'stable-audio-3-small-music-q8'

/** words to start from: a ring of each kind, in Euclidean rhythms that drift against each other */
export const WORD_BANKS: Record<RingKind, string[]> = {
  adjective: ['warm', 'metallic', 'distant', 'granular', 'broken', 'velvet', 'icy', 'dusty', 'shimmering', 'hollow'],
  texture: ['tape hiss', 'vinyl crackle', 'bitcrushed', 'reverb wash', 'sub bass', 'airy pad', 'tube saturation', 'chorus'],
  noun: ['glass', 'engine', 'rain', 'choir', 'bells', 'wire', 'tide', 'furnace', 'birdsong', 'robot', 'heartbeat', 'thunder'],
  verb: ['swelling', 'dripping', 'rumbling', 'glitching', 'humming', 'breathing', 'stuttering', 'spiralling'],
  instrument: ['kalimba', 'synth pluck', 'cello', 'marimba', '808', 'rhodes', 'theremin', 'gamelan gong', 'modular bleeps'],
  place: ['in a cathedral', 'underwater', 'in a subway tunnel', 'in a cave', 'on the moon', 'in a forest at night'],
  custom: ['dream', 'static', 'pulse'],
}

export const CHIPS: Record<ChipGroup, string[]> = {
  genre: ['ambient', 'techno', 'dub', 'drone', 'lo-fi hip hop', 'idm', 'house', 'cinematic', 'glitch', 'gamelan', 'krautrock', 'vaporwave', 'jungle', 'trip hop'],
  mood: ['dreamy', 'tense', 'euphoric', 'melancholy', 'eerie', 'playful', 'hypnotic', 'dark', 'serene', 'chaotic'],
  style: ['seamless loop', 'one-shot', 'texture', 'drone', 'arpeggio', 'chord stab', 'drum loop', 'field recording', 'bassline', 'melody'],
}

/** each ring's colour, by its place (GardenRings.vue, GardenDialog.vue) */
export const RING_COLORS = ['#ff4fd8', '#3ef0ff', '#ffd23e', '#7dff6a', '#ff8a3e', '#a98bff', '#ff3e6c', '#3effb5']

let ringSeq = 0
export const ringId = () => `r${Date.now().toString(36)}${(ringSeq++).toString(36)}`

export function newRing(kind: RingKind, o: Partial<Ring> = {}): Ring {
  return {
    id: ringId(),
    kind,
    label: kind.toUpperCase(),
    words: [...WORD_BANKS[kind]],
    k: 3,
    n: 8,
    rot: 0,
    move: 'cycle',
    drop: false,
    locked: false,
    ...o,
  }
}

export function defaultGarden(): Garden {
  return {
    on: false,
    seed: Math.floor(Math.random() * 1e6),
    step: 0,
    rings: [
      newRing('adjective', { k: 2, n: 5 }),
      newRing('noun', { k: 3, n: 8 }),
      newRing('verb', { k: 5, n: 8, rot: 1 }),
      newRing('texture', { k: 1, n: 4, drop: true }),
    ],
    chips: { genre: ['ambient'], mood: ['dreamy'], style: ['seamless loop'] },
    grids: { bpm: [], key: [], scale: [], seconds: [4] },
    loops: 4,
    fade: 0.08,
    offset: 0,
    paused: false,
    back: 0.1,
    reuse: true,
    model: '',
    negative: 'speech, vocals, low quality, clipping',
    prefix: '',
    suffix: '',
    history: [],
    saved: [],
    pads: defaultPadGrowth(),
  }
}

/** a garden as saved (older or partial), filled out */
export function migrateGarden(g: Partial<Garden> | null | undefined): Garden {
  const d = defaultGarden()
  if (!g) return d
  return {
    ...d,
    ...g,
    rings: (g.rings ?? d.rings).map((r) => ({ ...newRing(r.kind ?? 'custom'), ...r })),
    chips: { ...d.chips, ...(g.chips ?? {}) },
    grids: { ...d.grids, ...(g.grids ?? {}) },
    history: (g.history ?? []).slice(0, HISTORY_MAX),
    saved: g.saved ?? [],
    pads: { ...d.pads, ...(g.pads ?? {}) },
  }
}

// ── a step's caption ──────────────────────────────────────────────────────────────────────────────────────────────
export const ringPattern = (r: Ring) => euclid(r.k, r.n, r.rot)

/** The word a ring shows at `step` (its index into its words), or -1 when it has none. */
export function ringWordIndex(r: Ring, step: number, seed: number): number {
  const len = r.words.length
  if (!len) return -1
  if (r.locked && r.lockWord !== undefined) return ((r.lockWord % len) + len) % len
  const h = hitsUpTo(ringPattern(r), step)
  if (r.move === 'random') return h === 0 ? 0 : hash32(seed, r.id, h) % len
  if (r.move === 'walk') {
    let i = 0
    for (let j = 1; j <= h; j++) i += rand01(seed, r.id, j) < 0.5 ? -1 : 1
    return ((i % len) + len) % len
  }
  return h % len
}

/** Whether a ring is in the caption at `step`: on a hit, or between them unless it DROPs. */
export function ringSounds(r: Ring, step: number): boolean {
  if (r.off || !r.words.length) return false
  if (!r.drop || r.locked) return true
  const p = ringPattern(r)
  return p[((step % p.length) + p.length) % p.length]
}

/** the value a grid gives at `step`: its lit values, one a step in turn */
export function gridValue<T>(lit: readonly T[], step: number): T | undefined {
  return lit.length ? lit[((step % lit.length) + lit.length) % lit.length] : undefined
}

export interface Caption {
  prompt: string
  /** how long a clip to ask for */
  seconds: number
  /** each ring's word this step ('' when it's out) */
  words: Record<string, string>
}

/** the order words take in the phrase before the commas: "warm glass bells swelling" */
const PHRASE: RingKind[] = ['adjective', 'texture', 'instrument', 'noun', 'verb', 'place']

/**
 * The caption for `step`: the phrase the rings make (adjectives, then what, then doing what, then where), the custom
 * rings', then the chips and the grids' values; or `override` words (the game's catch) in place of the rings'.
 */
export function composeCaption(g: Garden, step: number, override?: string[]): Caption {
  const words: Record<string, string> = {}
  for (const r of g.rings) {
    const i = ringSounds(r, step) ? ringWordIndex(r, step, g.seed) : -1
    words[r.id] = i >= 0 ? r.words[i].trim() : ''
  }
  let phrase: string
  let extra: string[] = []
  if (override?.length) phrase = override.join(' ')
  else {
    const byKind = (k: RingKind) => g.rings.filter((r) => r.kind === k && words[r.id]).map((r) => words[r.id])
    phrase = PHRASE.flatMap(byKind).join(' ')
    extra = byKind('custom')
  }
  const bpm = gridValue(g.grids.bpm, step)
  const key = gridValue(g.grids.key, step)
  const scale = gridValue(g.grids.scale, step)
  const parts = [
    g.prefix.trim(),
    phrase,
    ...extra,
    ...CHIP_GROUPS.flatMap((c) => g.chips[c] ?? []),
    bpm ? `${bpm} BPM` : '',
    key ? `in ${key}${scale ? ` ${scale}` : ''}` : scale ? `${scale} scale` : '',
    g.suffix.trim(),
  ].filter(Boolean)
  return { prompt: parts.join(', '), seconds: gridValue(g.grids.seconds, step) ?? 4, words }
}

/** the clip's seed: the same caption makes the same clip (a garden that comes round sounds as it did) */
export const captionSeed = (g: Garden, prompt: string) => hash32(g.seed, prompt) % 2 ** 31

/** how many steps before every ring is back where it started (cycling rings; random and walk never quite are) */
export function gardenPeriod(g: Garden): number {
  const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : a)
  let p = 1
  for (const r of g.rings) {
    if (r.off || r.locked) continue
    const pat = ringPattern(r)
    const per = pat.filter(Boolean).length
    if (!per || !r.words.length) continue
    // the words come round after lcm(per, words) hits, which take that / per patterns of n steps
    const hitsRound = (per * r.words.length) / gcd(per, r.words.length)
    const ringP = (hitsRound / per) * pat.length
    p = (p * ringP) / gcd(p, ringP)
    if (p > 1e9) return Infinity
  }
  return p
}

// ── what comes next ────────────────────────────────────────────────────────────────────────────────────────────────
export type NextPlan =
  | { kind: 'again'; take: GardenTake; step: number; prompt: string }
  | { kind: 'make'; step: number; prompt: string; seconds: number; seed: number }

/**
 * What the next clip is, for the step after `g.step`: BACK's roll sends it to an earlier take; a caption made before
 * (REUSE) plays that take; else a new clip to make. `alive` says whether a take's sound is still on the board.
 */
export function planNext(g: Garden, alive: (soundId: string) => boolean, override?: string[]): NextPlan {
  const step = g.step + 1
  const takes = g.history.filter((t) => alive(t.soundId))
  // BACK: never the clip playing (history[0]), a step's roll decides
  if (!override?.length && takes.length > 1 && rand01(g.seed, 'back', step) < g.back) {
    const pick = takes[1 + (hash32(g.seed, 'pick', step) % (takes.length - 1))]
    return { kind: 'again', take: pick, step, prompt: pick.prompt }
  }
  const c = composeCaption(g, step, override)
  if (g.reuse && !override?.length) {
    const same = takes.find((t) => t.prompt === c.prompt)
    if (same && same !== takes[0]) return { kind: 'again', take: same, step, prompt: c.prompt }
  }
  return { kind: 'make', step, prompt: c.prompt, seconds: c.seconds, seed: captionSeed(g, c.prompt) }
}

/**
 * The sounds of the takes that have fallen past the latest TAKES_KEPT (and not SAVEd), but not `keep` (what's playing,
 * what's next) nor any of the kept ones: the clips to let go.
 */
export function takesToDrop(g: Pick<Garden, 'history'>, keep: Iterable<string>): string[] {
  const kept = new Set(keep)
  for (const t of g.history.slice(0, TAKES_KEPT)) kept.add(t.soundId)
  const out = new Set<string>()
  for (const t of g.history.slice(TAKES_KEPT)) if (!t.saved && !kept.has(t.soundId)) out.add(t.soundId)
  return [...out]
}

/** A take added to the history (newest first), keeping the latest HISTORY_MAX. */
export function pushTake(g: Garden, t: GardenTake) {
  g.history = [t, ...g.history].slice(0, HISTORY_MAX)
  g.step = t.step
}

// ── when ───────────────────────────────────────────────────────────────────────────────────────────────────────────
/** the shortest a clip plays before the next is stitched in, however short its loop (a single-cycle wave's is ms) */
export const MIN_SWAP_S = 2
/** the longest crossfade at a stitch, s (voice.ts, Engine.cpp clamp to it too) */
export const FADE_MAX = 10
/** the most loops a garden's swaps are pushed back by */
export const OFFSET_MAX = 16

/** what the runtime knows about a VCO, each tick */
export interface TickIn {
  /** seconds since the last tick */
  dt: number
  /** a voice of this VCO is sounding */
  sounding: boolean
  /** seconds a pass of the clip takes (0: not known) */
  loopSec: number
  /** passes before a stitch */
  loops: number
  /** loops the swaps are pushed back by (a change moves the next swap by the difference) */
  offset: number
  /** the stitch's crossfade, s: the next stitch waits for it to finish */
  fade: number
  /** growth held: nothing made, nothing stitched, the time held where it is */
  paused: boolean
  /** the next clip is ready */
  ready: boolean
  /** a clip is being made (for this VCO, or another: the model makes one at a time) */
  busy: boolean
  /** it failed lately: wait before trying again */
  coolingDown: boolean
}
export interface TickState {
  /** seconds this clip has sounded */
  heard: number
  /** it has sounded since the garden came on: from then on it keeps the next clip ready */
  started: boolean
  /** the offset already taken off `heard` (loops) */
  offsetUsed: number
}
export interface TickOut {
  state: TickState
  /** make (or pick) the next clip now */
  prepare: boolean
  /** stitch the next clip in now */
  stitch: boolean
  /** 0..1 of the way to the stitch (for the rings' sweep) */
  progress: number
}

/**
 * One tick of a VCO's garden: time counts only while it sounds; once it has sounded, the next clip is prepared as soon
 * as there's none (and the model is free); after LOOPS passes with one ready, it's stitched in -- the engines put it at
 * the next loop boundary. A clip not ready in time waits: the one playing goes on looping until it is. OFFSET pushes
 * the swaps back by that many loops (taken off the time heard, so the stagger lasts: each swap restarts the count);
 * a stitch waits for the last one's crossfade to finish; PAUSED holds everything where it is.
 */
export function gardenTick(s: TickState, i: TickIn): TickOut {
  const loopLen = i.loopSec > 0 ? i.loopSec : 4
  const due = Math.max(MIN_SWAP_S, i.fade + 0.5, Math.max(0.25, i.loops) * loopLen)
  let heard = s.heard
  let offsetUsed = s.offsetUsed
  if (i.offset !== offsetUsed && i.sounding) {
    heard -= (i.offset - offsetUsed) * loopLen
    offsetUsed = i.offset
  }
  if (i.paused)
    return { state: { heard, started: s.started, offsetUsed }, prepare: false, stitch: false, progress: Math.min(1, Math.max(0, heard) / due) }
  heard += i.sounding ? Math.max(0, i.dt) : 0
  const started = s.started || i.sounding
  const stitch = i.ready && i.sounding && heard >= due
  return {
    state: { heard: stitch ? 0 : heard, started, offsetUsed },
    prepare: started && !i.ready && !i.busy && !i.coolingDown,
    stitch,
    progress: stitch ? 1 : Math.min(1, Math.max(0, heard) / due),
  }
}
