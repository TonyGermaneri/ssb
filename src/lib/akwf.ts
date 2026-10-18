/**
 * AKWF: Adventure Kid's 4,358 single-cycle waveforms (Kristoffer Ekstrand, CC0 —
 * github.com/KristofferKarlAxelEkstrand/AKWF-FREE), shipped in public/akwf by scripts/akwf.mjs. The categories
 * are AKWF's own folders, kept as they are: AKWF_0001 … AKWF_0020 (mixed) and the named sets (AKWF_epiano, …).
 * A wave added to the board is tagged "akwf" + its folder (akwf_epiano) and plays from a one-cycle WAV whose
 * loop and root note travel with it.
 */
import { shallowRef } from 'vue'
import { encodeCycleWav } from './wav'
import { addTags } from './tags'
import { defaultSettings, type SoundSettings } from '../types'

export interface AkwfCategory {
  folder: string
  waves: string[]
  /** per wave, when the category has stereo ones (AKWF_stereo); otherwise all mono */
  channels?: number[]
}
export interface AkwfIndex {
  source: string
  commit: string
  license: string
  author: string
  frames: number
  rate: number
  count: number
  categories: AkwfCategory[]
}
export interface AkwfWave {
  folder: string
  name: string
  channels: Float32Array[]
}

/** One cycle is exactly C2 at this rate (600 frames → 65.41 Hz), so every wave's root note is C2. */
export const CYCLE_ROOT = 36
export const cycleRate = (frames: number) => Math.round(frames * 440 * 2 ** ((CYCLE_ROOT - 69) / 12))

/** AKWF's folder names, spelled out; the folder itself is the category (and its tag). */
const LABELS: Record<string, string> = {
  aguitar: 'ACOUSTIC GUITAR',
  altosax: 'ALTO SAX',
  birds: 'BIRDS',
  bitreduced: 'BIT-REDUCED',
  bw_blended: 'BLENDED',
  bw_perfectwaves: 'PERFECT WAVES',
  bw_saw: 'SAW',
  bw_sawbright: 'SAW BRIGHT',
  bw_sawgap: 'SAW GAP',
  bw_sawrounded: 'SAW ROUNDED',
  bw_sin: 'SINE',
  bw_squ: 'SQUARE',
  bw_squrounded: 'SQUARE ROUNDED',
  bw_tri: 'TRIANGLE',
  c604: 'C604',
  cello: 'CELLO',
  clarinett: 'CLARINET',
  clavinet: 'CLAVINET',
  dbass: 'DOUBLE BASS',
  distorted: 'DISTORTED',
  ebass: 'ELECTRIC BASS',
  eguitar: 'ELECTRIC GUITAR',
  eorgan: 'ELECTRIC ORGAN',
  epiano: 'ELECTRIC PIANO',
  flute: 'FLUTE',
  fmsynth: 'FM SYNTH',
  granular: 'GRANULAR',
  hdrawn: 'HAND-DRAWN',
  hvoice: 'HUMAN VOICE',
  linear: 'LINEAR',
  oboe: 'OBOE',
  oscchip: 'OSC CHIP',
  overtone: 'OVERTONE',
  piano: 'PIANO',
  pluckalgo: 'PLUCK ALGORITHM',
  raw: 'RAW',
  sinharm: 'SINE HARMONICS',
  snippets: 'SNIPPETS',
  stereo: 'STEREO',
  stringbox: 'STRING BOX',
  symetric: 'SYMMETRIC',
  theremin: 'THEREMIN',
  vgame: 'VIDEO GAME',
  vgamebasic: 'VIDEO GAME BASIC',
  violin: 'VIOLIN',
}
const short = (folder: string) => folder.replace(/^AKWF_/, '')
/** "ELECTRIC PIANO", or "MIXED 0007" for the numbered folders */
export const categoryLabel = (folder: string) => {
  const id = short(folder)
  return /^\d+$/.test(id) ? `MIXED ${id}` : (LABELS[id] ?? id.replace(/_/g, ' ').toUpperCase())
}
/** the category as a tag: AKWF's folder name, lower case (akwf_epiano) */
export const categoryTag = (folder: string) => folder.toLowerCase()
/** "EPIANO 0001", "SAW 0012", "AKWF 0101" (the numbered folders' waves are only numbers) */
export const waveLabel = (name: string) => {
  const s = short(name).replace(/_/g, ' ').toUpperCase()
  return /^\d+$/.test(s) ? `AKWF ${s}` : s
}
/** wave names are unique across AKWF, so the name is the audio's id (adding a wave twice shares its audio) */
export const waveAudioId = (name: string) => `akwf-${name}`
export const isWaveAudioId = (audioId: string) => audioId.startsWith('akwf-')
/** the wave an audio id names */
export const waveNameOf = (audioId: string) => audioId.slice('akwf-'.length)

let index: Promise<AkwfIndex> | null = null
/** The categories and their waves' names (fetched once). */
export function akwfIndex(): Promise<AkwfIndex> {
  if (!index) {
    index = fetch('akwf/index.json').then((r) => {
      if (!r.ok) throw new Error(`AKWF index: HTTP ${r.status}`)
      return r.json() as Promise<AkwfIndex>
    })
    index.catch(() => (index = null)) // try again next time
  }
  return index
}

/**
 * Every wave in memory: each category's .bin as it ships (5.4 MB of int16), and where each wave sits in it. Once
 * it is here a wave's audio is made on the spot (waveChannels), so the board's 4,000-odd waves need no storage
 * of their own and nothing is decoded until a wave is played or drawn.
 */
interface Packs {
  index: AkwfIndex
  waves: Map<string, { folder: string; channels: number; at: number }>
  pcm: Map<string, Int16Array>
}
let packs: Packs | null = null
let packsLoading: Promise<Packs> | null = null
/** true once every wave is in memory */
export const akwfReady = shallowRef(false)

/** Fetch every category (once); resolves when all the waves are in memory. */
export function loadAkwf(): Promise<Packs> {
  if (!packsLoading) {
    packsLoading = (async () => {
      const idx = await akwfIndex()
      const bins = await Promise.all(
        idx.categories.map(async (c) => {
          const r = await fetch(`akwf/${c.folder}.bin`)
          if (!r.ok) throw new Error(`AKWF ${c.folder}: HTTP ${r.status}`)
          return new Int16Array(await r.arrayBuffer())
        }),
      )
      const waves: Packs['waves'] = new Map()
      const pcm: Packs['pcm'] = new Map()
      idx.categories.forEach((c, i) => {
        pcm.set(c.folder, bins[i])
        let at = 0
        c.waves.forEach((name, j) => {
          const channels = c.channels?.[j] ?? 1
          waves.set(name, { folder: c.folder, channels, at })
          at += channels * idx.frames
        })
      })
      packs = { index: idx, waves, pcm }
      akwfReady.value = true
      return packs
    })()
    packsLoading.catch(() => (packsLoading = null)) // try again next time
  }
  return packsLoading
}

/**
 * A wave's channels, at once (null until loadAkwf has finished, or for a name AKWF hasn't got). Each is centred on
 * zero: some of AKWF's cycles sit well off it (c604_0016 averages 0.97), which as an oscillator is only a thump at
 * every note's start and end, and lost headroom.
 */
export function waveChannels(name: string): Float32Array[] | null {
  const w = packs?.waves.get(name)
  if (!packs || !w) return null
  const pcm = packs.pcm.get(w.folder)!
  const n = packs.index.frames
  return Array.from({ length: w.channels }, (_, c) => {
    const ch = new Float32Array(n)
    const o = w.at + c * n
    let dc = 0
    for (let k = 0; k < n; k++) dc += pcm[o + k]
    dc /= n
    for (let k = 0; k < n; k++) ch[k] = (pcm[o + k] - dc) / 32768
    return ch
  })
}

/** the category a wave is in (once loadAkwf has finished) */
export const waveFolder = (name: string) => packs?.waves.get(name)?.folder

/** Every wave in a category. */
export async function akwfCategory(folder: string): Promise<AkwfWave[]> {
  const p = await loadAkwf()
  const cat = p.index.categories.find((c) => c.folder === folder)
  if (!cat) throw new Error(`No AKWF category ${folder}`)
  return cat.waves.map((name) => ({ folder, name, channels: waveChannels(name)! }))
}

/** One wave by its name (its folder is found from the index). */
export async function akwfWave(name: string): Promise<AkwfWave> {
  const p = await loadAkwf()
  const folder = p.waves.get(name)?.folder
  if (!folder) throw new Error(`No AKWF wave ${name}`)
  return { folder, name, channels: waveChannels(name)! }
}

/** The categories in the order the board lists them: the perfect waves, AKWF's other basic shapes, the named sets, then
 *  the numbered mixed folders. */
export function boardOrder(idx: AkwfIndex): AkwfCategory[] {
  const rank = (f: string) => (f === 'AKWF_bw_perfectwaves' ? 0 : f.startsWith('AKWF_bw_') ? 1 : /^AKWF_\d+$/.test(f) ? 3 : 2)
  return idx.categories.map((c, i) => ({ c, i })).sort((a, b) => rank(a.c.folder) - rank(b.c.folder) || a.i - b.i).map((x) => x.c)
}

/** a wave as a playable sound: loops while held, gentle release */
export const waveSettings = (): Partial<SoundSettings> => ({
  repeat: 0,
  mode: 'hold',
  attack: 0.005,
  decay: 0.2,
  sustain: 1,
  release: 0.3,
  volume: 0.8,
})

/** What every wave's sound starts from, but its name and tag. The board stores a wave's settings as changes from this. */
export const waveBaseSettings = (): SoundSettings => ({ ...defaultSettings(''), ...waveSettings(), rootNote: CYCLE_ROOT })

/** The settings a wave's sound starts with: named after it, tagged akwf + its category, root C2. */
export function waveSoundSettings(name: string, folder: string): SoundSettings {
  return { ...waveBaseSettings(), name: waveLabel(name), tag: addTags('', ['akwf', categoryTag(folder)]) }
}

/** The wave as the audio of a sound: one cycle, root C2, looped (see encodeCycleWav). */
export const waveBlob = (w: AkwfWave) => encodeCycleWav(w.channels, cycleRate(w.channels[0].length), CYCLE_ROOT)

/** the category the library last showed (kept while the page is open) */
export const browsing = { folder: '' }
