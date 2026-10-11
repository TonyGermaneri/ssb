/**
 * AKWF: Adventure Kid's 4,358 single-cycle waveforms (Kristoffer Ekstrand, CC0 —
 * github.com/KristofferKarlAxelEkstrand/AKWF-FREE), shipped in public/akwf by scripts/akwf.mjs. The categories
 * are AKWF's own folders, kept as they are: AKWF_0001 … AKWF_0020 (mixed) and the named sets (AKWF_epiano, …).
 * A wave added to the board is tagged "akwf" + its folder (akwf_epiano) and plays from a one-cycle WAV whose
 * loop and root note travel with it.
 */
import { encodeCycleWav } from './wav'

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

const packs = new Map<string, Promise<AkwfWave[]>>()
/** Every wave in a category (its .bin fetched once). */
export function akwfCategory(folder: string): Promise<AkwfWave[]> {
  let p = packs.get(folder)
  if (!p) {
    p = (async () => {
      const idx = await akwfIndex()
      const cat = idx.categories.find((c) => c.folder === folder)
      if (!cat) throw new Error(`No AKWF category ${folder}`)
      const r = await fetch(`akwf/${folder}.bin`)
      if (!r.ok) throw new Error(`AKWF ${folder}: HTTP ${r.status}`)
      const pcm = new Int16Array(await r.arrayBuffer())
      let at = 0
      return cat.waves.map((name, i) => {
        const channels = Array.from({ length: cat.channels?.[i] ?? 1 }, () => {
          const ch = new Float32Array(idx.frames)
          for (let k = 0; k < idx.frames; k++) ch[k] = pcm[at + k] / 32768
          at += idx.frames
          return ch
        })
        return { folder, name, channels }
      })
    })()
    p.catch(() => packs.delete(folder))
    packs.set(folder, p)
  }
  return p
}

/** One wave by its folder and name. */
export async function akwfWave(folder: string, name: string): Promise<AkwfWave> {
  const w = (await akwfCategory(folder)).find((x) => x.name === name)
  if (!w) throw new Error(`No AKWF wave ${folder}/${name}`)
  return w
}

/** The wave as the audio of a sound: one cycle, root C2, looped (see encodeCycleWav). */
export const waveBlob = (w: AkwfWave) => encodeCycleWav(w.channels, cycleRate(w.channels[0].length), CYCLE_ROOT)

/** the category the library last showed (kept while the page is open) */
export const browsing = { folder: '' }
