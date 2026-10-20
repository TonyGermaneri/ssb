/**
 * Semantic search over the board: every sound and patch gets an entry (its NAME and SOUND words embedded,
 * lib/semantic/describe.ts; its settings as numbers, features.ts; and what it sounds like, timbre.ts), made when it
 * arrives (an import, a new patch, the factory install: the board calls `soon`) and again after it changes (the board
 * calls `forget` on any write, as it drops a sound's saved JSON).
 *
 * As in rolidrummer: texts are embedded once each (deduplicated by the text), similarity is a brute-force dot product
 * over unit vectors (thousands of rows: microseconds), and the text and numeric spaces stay apart, meeting only in the
 * ranking. Unlike it, the model runs in the page (potion-base-8M, static embeddings), so this works in the browser,
 * the app and the plugin alike, offline.
 */
import { shallowRef } from 'vue'
import { untrack } from '../tracked'
import { dot, loadTextModel, type TextModel } from '../embed/model2vec'
import { patchTexts, soundTexts } from './describe'
import { patchFeatures, soundFeatures, standardise, statsOf, type Stats } from './features'
import { BANDS, cycleTimbre, sampleTimbre } from './timbre'
import { queryPushes, spellQuery, STOP, type Push } from './axes'
import type { Patch, PatchSlot, Sound } from '../../types'

interface Entry {
  name?: Float32Array
  sound?: Float32Array
  params: number[]
  /** the sound's spectral shape (a patch's: its heard VCOs', by level); absent until its audio is at hand */
  timbre?: Float32Array
  /** the audio epoch timbre was last looked for in */
  timbreAt?: number
  /** its words, for a description's exact-word bonus */
  words?: { name: Set<string>; sound: Set<string> }
  /** params standardised, for the statistics they were standardised by */
  z?: Float32Array
  zBy?: Stats
}

/** a description's words that mean something (not "a", "with", "sound"…) */
const queryWords = (q: string) =>
  q
    .toLowerCase()
    .replace(/\b(8|16)[\s-]?bits?\b/g, '$1bit') // "8 bit" is one word, not 8 and a stop word
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP.has(w))
/** a word as compared exactly: lower case, a plural's s off (pads → pad), an adjective's y (plucky → pluck) */
const ADJ: Record<string, string> = { glassy: 'glass', wobbly: 'wobble', shimmery: 'shimmer', shimmering: 'shimmer', droning: 'drone' }
const stem = (w: string) => ADJ[w] ?? (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w)
/** what kind of instrument it is: a description naming one means it more than any adjective */
const KINDS = new Set(['pad', 'bass', 'lead', 'key', 'keyboard', 'piano', 'bell', 'pluck', 'string', 'brass', 'wind', 'choir', 'voice', 'organ', 'drone', 'texture', 'mallet', 'chip', 'fx', 'arp', 'arpeggio', 'stab', 'synth', 'guitar', 'flute', 'sax', 'drum', 'kick', 'snare', 'hihat', 'percussion'])
const wordSet = (text: string) => new Set(text.split(' ').filter(Boolean).map(stem))
/** each exact word a description shares with an item's name (half that for its sound words), up to a limit:
 *  embeddings find what's near, the bonus makes sure "pad" ranks the pads first */
const EXACT = { kind: 0.14, name: 0.08, sound: 0.04, max: 0.3 }

/** how much each part of an entry counts toward "similar to", for each kind */
const WEIGHTS = {
  sound: { params: 0.3, timbre: 0.5, text: 0.2 },
  patch: { params: 0.45, timbre: 0.3, text: 0.25 },
}

export interface SemanticHost {
  sounds(): Sound[]
  patches(): Patch[]
  /** a patch layer's sound (its own settings over its source's audio) */
  layerSound(layer: PatchSlot['layer']): Sound | undefined
  soundName(id: string): string | undefined
  /** a wave's single cycle, or a decoded sample's channel and rate; null until the audio is at hand */
  audioOf(sound: Sound): { cycle: Float32Array } | { data: Float32Array; rate: number; from: number; to: number } | null
}

export class SemanticIndex {
  model: TextModel | null = null
  /** true once the text model is in (text search and ranking by words need it) */
  readonly ready = shallowRef(false)
  /** bumped when entries are added or change, so rankings recompute */
  readonly version = shallowRef(0)
  private texts = new Map<string, Float32Array>()
  private entries = new WeakMap<object, Entry>()
  private timbres = new Map<string, Float32Array>()
  private stats = new Map<'sound' | 'patch', { at: number; stats: Stats }>()
  private loading: Promise<TextModel> | null = null
  /** bumped when audio arrives (the waves loaded, a sample decoded): entries without a timbre look again */
  private audioEpoch = 0

  constructor(private host: SemanticHost) {}

  /** fetch the model (once) and index everything */
  load(): Promise<TextModel> {
    if (!this.loading) {
      this.loading = loadTextModel().then((m) => {
        this.model = m
        this.ready.value = true
        this.soon()
        return m
      })
      this.loading.catch(() => (this.loading = null))
    }
    return this.loading
  }

  /** an item was written to: its entry is made again when next wanted */
  forget(item: object) {
    this.entries.delete(untrack(item))
    this.dirty()
  }
  private dirtyTimer = 0
  private dirty() {
    clearTimeout(this.dirtyTimer)
    this.dirtyTimer = window.setTimeout(() => this.version.value++, 120)
  }

  /** audio arrived: sounds without a timbre may have one now */
  audioChanged() {
    this.audioEpoch++
    this.dirty()
  }

  /** the vector of a text (each text embedded once) */
  embed(text: string): Float32Array | undefined {
    if (!this.model || !text) return undefined
    let v = this.texts.get(text)
    if (!v) this.texts.set(text, (v = this.model.embed(text)))
    return v
  }

  private timbreOfSound(s: Sound): Float32Array | undefined {
    const key = s.zones?.[0]?.audioId ?? s.audioId
    const hit = this.timbres.get(key)
    if (hit) return hit
    const a = this.host.audioOf(s)
    if (!a) return undefined
    const t = 'cycle' in a ? cycleTimbre(a.cycle) : sampleTimbre(a.data, a.rate, a.from, a.to)
    this.timbres.set(key, t)
    return t
  }

  /** an item's entry, its parts filled in as they can be: words once the model is in, timbre once audio is */
  entryOfSound(s: Sound): Entry {
    const raw = untrack(s)
    let e = this.entries.get(raw)
    if (!e) this.entries.set(raw, (e = { params: soundFeatures(s.settings) }))
    if (!e.name && this.model) {
      const t = soundTexts(s.settings)
      e.name = this.embed(t.name)
      e.sound = this.embed(t.sound)
      e.words = { name: wordSet(t.name), sound: wordSet(t.sound) }
    }
    if (!e.timbre && e.timbreAt !== this.audioEpoch) {
      e.timbreAt = this.audioEpoch
      e.timbre = this.timbreOfSound(s)
    }
    return e
  }

  entryOfPatch(p: Patch): Entry {
    const raw = untrack(p)
    let e = this.entries.get(raw)
    if (!e) this.entries.set(raw, (e = { params: patchFeatures(p) }))
    if (!e.name && this.model) {
      const t = patchTexts(p, (id) => this.host.soundName(id))
      e.name = this.embed(t.name)
      e.sound = this.embed(t.sound)
      e.words = { name: wordSet(t.name), sound: wordSet(t.sound) }
    }
    if (!e.timbre && e.timbreAt !== this.audioEpoch) {
      e.timbreAt = this.audioEpoch
      // the heard VCOs' spectra, by level
      const timbre = new Float32Array(BANDS)
      let any = false
      p.slots.forEach((x, i) => {
        if (!x || (i > 0 && !x.audible)) return
        const snd = this.host.layerSound(x.layer)
        const tt = snd && this.timbreOfSound(snd)
        if (!tt) return
        any = true
        const w = i === 0 ? 1 : x.level * 0.6
        for (let b = 0; b < BANDS; b++) timbre[b] += tt[b] * w
      })
      e.timbre = any ? unit(timbre) : undefined
    }
    return e
  }

  /** z-score statistics for a kind, over the whole board (made again once entries have changed) */
  private statsFor(kind: 'sound' | 'patch'): Stats {
    const hit = this.stats.get(kind)
    if (hit && hit.at === this.version.value) return hit.stats
    const rows = kind === 'sound' ? this.host.sounds().map((s) => this.entryOfSound(s).params) : this.host.patches().map((p) => this.entryOfPatch(p).params)
    const stats = statsOf(rows)
    this.stats.set(kind, { at: this.version.value, stats })
    return stats
  }

  /**
   * How like `ref` each of `items` is (−1..1): settings, sound and words, weighted for the kind. A part either side
   * hasn't got (audio not yet decoded, the model still loading) is left out and the rest share its weight.
   */
  similar<T extends Sound | Patch>(kind: 'sound' | 'patch', ref: T, items: T[]): Map<string, number> {
    const entry = (x: T) => (kind === 'sound' ? this.entryOfSound(x as Sound) : this.entryOfPatch(x as Patch))
    const stats = this.statsFor(kind)
    /** standardised params, or undefined for an item at the board's average on every setting that varies (all the
     *  AKWF waves start alike): no information, so like missing audio it's left out rather than scoring 0 */
    const z = (e: Entry) => {
      if (e.zBy !== stats) {
        const v = standardise(e.params, stats)
        e.z = v.some((x) => x !== 0) ? v : undefined
        e.zBy = stats
      }
      return e.z
    }
    const r = entry(ref)
    const rp = z(r)
    const w = WEIGHTS[kind]
    const out = new Map<string, number>()
    for (const x of items) {
      const e = entry(x)
      const ep = z(e)
      let score = 0
      let total = 0
      if (rp && ep) {
        score += w.params * dot(rp, ep)
        total += w.params
      }
      if (r.timbre && e.timbre) {
        score += w.timbre * dot(r.timbre, e.timbre)
        total += w.timbre
      }
      // the words: names, and what the settings say (a sound left at its defaults says nothing: names alone then)
      const byName = r.name && e.name ? dot(r.name, e.name) : undefined
      const bySound = r.sound && e.sound ? dot(r.sound, e.sound) : undefined
      if (byName !== undefined || bySound !== undefined) {
        score += w.text * (byName !== undefined && bySound !== undefined ? 0.5 * byName + 0.5 * bySound : (byName ?? bySound)!)
        total += w.text
      }
      out.set(x.id, total ? score / total : 0)
    }
    return out
  }

  /** how near each item's words are to a description (−1..1): its name words and its sound words */
  matchText<T extends Sound | Patch>(kind: 'sound' | 'patch', query: string, items: T[]): Map<string, number> {
    const out = new Map<string, number>()
    const q = this.queryVector(query)
    if (!q) return out
    const asked = [...new Set(queryWords(query).map(stem))]
    for (const x of items) {
      const e = kind === 'sound' ? this.entryOfSound(x as Sound) : this.entryOfPatch(x as Patch)
      let exact = 0
      for (const a of asked) exact += e.words?.name.has(a) ? (KINDS.has(a) ? EXACT.kind : EXACT.name) : e.words?.sound.has(a) ? EXACT.sound : 0
      out.set(x.id, 0.6 * (e.name ? dot(q, e.name) : 0) + 0.4 * (e.sound ? dot(q, e.sound) : 0) + Math.min(EXACT.max, exact))
    }
    return out
  }

  /**
   * A description as one vector: each of its words once (with what the synth vocabulary spells it out as, so
   * "plucky" is one word, not three), a kind of instrument half as much again ("bell" decides more than "bright").
   */
  queryVector(query: string): Float32Array | undefined {
    if (!this.model) return undefined
    const words = queryWords(query)
    if (!words.length) return this.embed(query)
    const acc = new Float32Array(this.model.dims)
    for (const w of words) {
      const v = this.embed(spellQuery(w))
      if (!v) continue
      const k = KINDS.has(stem(w)) ? 1.5 : 1
      for (let i = 0; i < acc.length; i++) acc[i] += v[i] * k
    }
    return unit(acc)
  }

  /** what a description's words push (after the model is in) */
  pushes(query: string): Push[] {
    return this.model ? queryPushes(this.model, query) : []
  }

  // ── indexing in the background ──
  private idle = 0
  /** make every missing entry soon, a slice at a time (after a load, an import, the factory install) */
  soon() {
    if (this.idle || !this.model) return
    const todo: (Sound | Patch)[] = [...this.host.sounds(), ...this.host.patches()]
    let i = 0
    const step = () => {
      const end = Math.min(todo.length, i + 250)
      for (; i < end; i++) {
        const x = todo[i]
        if ('slots' in x) this.entryOfPatch(x)
        else this.entryOfSound(x)
      }
      if (i < todo.length) this.idle = window.setTimeout(step, 0)
      else {
        this.idle = 0
        this.version.value++
      }
    }
    this.idle = window.setTimeout(step, 0)
  }
}

function unit(v: Float32Array): Float32Array {
  let n = 0
  for (let i = 0; i < v.length; i++) n += v[i] * v[i]
  n = Math.sqrt(n) || 1
  for (let i = 0; i < v.length; i++) v[i] /= n
  return v
}
