/**
 * Online sample libraries that browsers can fetch directly (CORS-enabled, no API keys).
 * Everything resolves to PathFile[] and goes through the normal drop loader.
 */
import type { PathFile } from './dropFiles'
import { normalisePath, parseSfz } from './sfz'

export type Progress = (done: number, total: number, label: string) => void

// ── fetching ────────────────────────────────────────────────────────────────
/** Encode each path segment (sample names contain spaces, '#', …). */
export const encodePath = (p: string) => p.split('/').map(encodeURIComponent).join('/')

async function fetchBlob(url: string): Promise<Blob> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} ${url}`)
  return res.blob()
}

async function fetchJson<T>(url: string, cacheKey?: string, maxAgeMs = 86_400_000): Promise<T> {
  if (cacheKey) {
    try {
      const hit = JSON.parse(localStorage.getItem(cacheKey) ?? 'null')
      if (hit && Date.now() - hit.at < maxAgeMs) return hit.data as T
    } catch {
      /* no cache */
    }
  }
  const res = await fetch(url)
  if (!res.ok) throw new Error(res.status === 403 ? 'GitHub rate limit reached — try again in a while' : `${res.status} ${url}`)
  const data = (await res.json()) as T
  if (cacheKey) {
    try {
      localStorage.setItem(cacheKey, JSON.stringify({ at: Date.now(), data }))
    } catch {
      /* quota */
    }
  }
  return data
}

/** Fetch with a few requests in flight at once. */
async function fetchAll(jobs: { url: string; path: string }[], progress?: Progress): Promise<PathFile[]> {
  const out: PathFile[] = []
  let done = 0
  let i = 0
  const worker = async () => {
    while (i < jobs.length) {
      const job = jobs[i++]
      try {
        out.push({ file: await fetchBlob(job.url), path: job.path })
      } catch (e) {
        console.warn('library: skipped', job.url, e)
      }
      progress?.(++done, jobs.length, job.path)
    }
  }
  await Promise.all(Array.from({ length: Math.min(6, jobs.length) }, worker))
  return out
}

const dirOf = (url: string) => url.slice(0, url.lastIndexOf('/') + 1)

/**
 * An .sfz at a URL plus everything it needs: #include files and the samples its regions use
 * (only those — big libraries often ship many alternates). Files keep their layout relative to the deepest folder
 * that holds them all, so `../Samples/…` from a `Programs/` .sfz still resolves.
 * `locate`: where a sample really is (URL), or null to skip it — for repos whose .sfz paths don't match their files;
 * the file still gets the path the .sfz asks for.
 */
export async function sfzFromUrl(
  sfzUrl: string,
  progress?: Progress,
  locate?: (sample: string) => string | null,
): Promise<PathFile[]> {
  const { base, texts, samples } = await sfzTexts(sfzUrl)
  const abs = (rel: string) => new URL(encodePath(rel), base).href
  const wanted = samples.map((s) => ({ as: abs(s), from: locate ? locate(s) : abs(s) }))
  const textUrls = [...texts.keys()].map(abs)
  const root = commonDir([...textUrls, ...wanted.map((w) => w.as)])
  const rel = (url: string) => decodeURIComponent(url.slice(root.length))
  const files = await fetchAll(
    wanted.filter((w) => w.from).map((w) => ({ url: w.from!, path: rel(w.as) })),
    progress,
  )
  return [...[...texts.values()].map((text, i) => ({ file: new Blob([text]), path: rel(textUrls[i]) })), ...files]
}

/** Longest shared folder URL (ends in '/'). */
function commonDir(urls: string[]): string {
  let dir = dirOf(urls[0])
  while (!urls.every((u) => u.startsWith(dir))) dir = dirOf(dir.slice(0, -1))
  return dir
}

/**
 * The .sfz text plus its #includes (keyed by path relative to the .sfz), and the sample paths its regions reference.
 * Includes are found by parsing — so paths built from macros (`#include "$DIR/$DYN.txt"`) and includes that only
 * appear once another include has defined something are fetched too — repeating until nothing new turns up.
 * #include paths are relative to the main .sfz (as in sfizz / ARIA), not to the including file.
 */
async function sfzTexts(sfzUrl: string) {
  const base = dirOf(sfzUrl)
  const name = normalisePath(decodeURIComponent(sfzUrl.slice(base.length)))
  const res = await fetch(sfzUrl)
  if (!res.ok) throw new Error(`${res.status} ${sfzUrl}`)
  const texts = new Map([[name, await res.text()]])
  const failed = new Set<string>()
  for (let pass = 0; pass < 12; pass++) {
    const want = new Set<string>()
    const { regions } = parseSfz(texts.get(name)!, (p) => {
      const key = normalisePath(p)
      if (!texts.has(key) && !failed.has(key)) want.add(key)
      return texts.get(key) ?? null
    })
    if (!want.size) {
      const samples = [...new Set(regions.map((r) => r.sample).filter((s) => !s.startsWith('*')))]
      return { base, texts, samples }
    }
    await Promise.all(
      [...want].map(async (key) => {
        const r = await fetch(new URL(encodePath(key), base)).catch(() => null)
        if (r?.ok) texts.set(key, await r.text())
        else {
          failed.add(key)
          console.warn('library: missing include', key)
        }
      }),
    )
  }
  throw new Error(`${name}: #include chain too deep`)
}

// ── sfzinstruments (github.com/sfzinstruments) ────────────────────────────
export interface Repo {
  name: string
  sizeMB: number
  branch: string
  description: string
}

export async function listSfzRepos(): Promise<Repo[]> {
  type R = { name: string; size: number; default_branch: string; description: string | null }
  const repos = await fetchJson<R[]>('https://api.github.com/orgs/sfzinstruments/repos?per_page=100', 'ssb:lib:sfzrepos')
  return repos
    .filter((r) => !['mappings', 'sfzinstruments.github.io', 'sfztemplates'].includes(r.name))
    .map((r) => ({ name: r.name, sizeMB: Math.round(r.size / 1024), branch: r.default_branch, description: r.description ?? '' }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export interface RepoTree {
  sfz: string[]
  /** file sizes by path, to estimate a download before starting it */
  sizes: Map<string, number>
  /** samples stored with Git LFS come back as pointer files, not audio */
  lfs: boolean
}

export async function repoTree(repo: Repo): Promise<RepoTree> {
  type T = { tree: { path: string; type: string; size?: number }[] }
  const t = await fetchJson<T>(
    `https://api.github.com/repos/sfzinstruments/${repo.name}/git/trees/${repo.branch}?recursive=1`,
    `ssb:lib:tree:${repo.name}`,
  )
  const blobs = t.tree.filter((x) => x.type === 'blob')
  const audio = blobs.filter((x) => /\.(wav|flac|ogg|mp3)$/i.test(x.path))
  return {
    sfz: blobs.filter((x) => /\.sfz$/i.test(x.path)).map((x) => x.path).sort(),
    sizes: new Map(blobs.map((x) => [x.path, x.size ?? 0])),
    lfs: audio.length > 0 && audio.every((x) => (x.size ?? 0) < 200),
  }
}

export const rawUrl = (repo: Repo, path: string) =>
  `https://raw.githubusercontent.com/sfzinstruments/${repo.name}/${repo.branch}/${encodePath(path)}`

/**
 * A sample path from an .sfz → the repo file it means. Exact path first; then ignoring case (Windows-authored
 * packs); then the file whose path ends with the sample's (an .sfz that forgot its default_path, or a mapping file
 * written for the folder above it). null = not in the repo.
 */
export function repoSampleFinder(tree: RepoTree, sfzPath: string) {
  const dir = sfzPath.includes('/') ? sfzPath.slice(0, sfzPath.lastIndexOf('/') + 1) : ''
  const files = [...tree.sizes.keys()]
  const lower = new Map(files.map((f) => [f.toLowerCase(), f]))
  return (sample: string): string | null => {
    const want = normalisePath(dir + sample)
    if (tree.sizes.has(want)) return want
    const hit = lower.get(want.toLowerCase())
    if (hit) return hit
    const tail = '/' + normalisePath(sample).replace(/^(\.\.\/)+/, '').toLowerCase()
    return files.find((f) => ('/' + f.toLowerCase()).endsWith(tail)) ?? null
  }
}

/** An .sfz from a sfzinstruments repo, its samples found in the repo tree. */
export function repoSfz(repo: Repo, tree: RepoTree, sfzPath: string, progress?: Progress) {
  const find = repoSampleFinder(tree, sfzPath)
  return sfzFromUrl(rawUrl(repo, sfzPath), progress, (s) => {
    const path = find(s)
    return path === null ? null : rawUrl(repo, path)
  })
}

/** Bytes an .sfz will pull (its samples only), from the repo tree. */
export async function sfzDownloadSize(repo: Repo, tree: RepoTree, sfzPath: string): Promise<number> {
  const { samples } = await sfzTexts(rawUrl(repo, sfzPath))
  const find = repoSampleFinder(tree, sfzPath)
  let bytes = 0
  for (const s of new Set(samples.map(find))) if (s) bytes += tree.sizes.get(s) ?? 0
  return bytes
}

// ── General MIDI soundfonts (gleitz/midi-js-soundfonts) ──────────────────
export const GM_SETS = ['FluidR3_GM', 'MusyngKite'] as const
export type GmSet = (typeof GM_SETS)[number]
const GM_BASE = 'https://gleitz.github.io/midi-js-soundfonts'
const FLATS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
const noteFile = (n: number) => `${FLATS[n % 12]}${Math.floor(n / 12) - 1}.mp3`

/** General MIDI families: programs come in blocks of 8. */
const GM_FAMILIES = [
  'piano', 'chromatic percussion', 'organ', 'guitar', 'bass', 'strings', 'ensemble', 'brass',
  'reed', 'pipe', 'synth lead', 'synth pad', 'synth effects', 'ethnic', 'percussive', 'sound effects',
]
export const gmFamily = (program: number) => GM_FAMILIES[Math.floor(program / 8)] ?? 'gm'

export const listGm = (set: GmSet) => fetchJson<string[]>(`${GM_BASE}/${set}/names.json`, `ssb:lib:gm:${set}`)

/**
 * A GM instrument as an SFZ: one sample every `step` semitones from A0 to C8, each covering the keys around it.
 * Written in memory, so it loads like any other SFZ.
 */
export async function gmInstrument(set: GmSet, name: string, step = 3, progress?: Progress): Promise<PathFile[]> {
  const notes: number[] = []
  for (let n = 21; n <= 108; n += step) notes.push(n)
  const lines = notes.map((n, i) => {
    const lo = i === 0 ? 0 : n - Math.floor(step / 2)
    const hi = i === notes.length - 1 ? 127 : n + Math.ceil(step / 2) - 1
    return `<region> sample=${noteFile(n)} lokey=${lo} hikey=${hi} pitch_keycenter=${n}`
  })
  const sfz = `// ${set} ${name} (github.com/gleitz/midi-js-soundfonts)\n<global> ampeg_release=0.4\n${lines.join('\n')}\n`
  const files = await fetchAll(
    notes.map((n) => ({ url: `${GM_BASE}/${set}/${name}-mp3/${noteFile(n)}`, path: noteFile(n) })),
    progress,
  )
  return [{ file: new Blob([sfz]), path: `${name}.sfz` }, ...files]
}

// ── Dirt-Samples (github.com/tidalcycles/Dirt-Samples) ────────────────────
type DirtIndex = Record<string, string[] | string>
const DIRT = 'https://raw.githubusercontent.com/tidalcycles/Dirt-Samples/master/strudel.json'

export async function listDirtBanks(): Promise<{ name: string; files: string[]; base: string }[]> {
  const idx = await fetchJson<DirtIndex>(DIRT, 'ssb:lib:dirt')
  const base = (idx._base as string) ?? 'https://raw.githubusercontent.com/tidalcycles/Dirt-Samples/master/'
  return Object.entries(idx)
    .filter((e): e is [string, string[]] => e[0] !== '_base' && Array.isArray(e[1]))
    .map(([name, files]) => ({ name, files, base }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export function dirtBank(bank: { name: string; files: string[]; base: string }, max = 32, progress?: Progress) {
  return fetchAll(
    bank.files.slice(0, max).map((f) => ({ url: bank.base + encodePath(f), path: f })),
    progress,
  )
}

// ── any URL ──────────────────────────────────────────────────────────────
/** An .sfz (with its samples), an audio file, or a .zip. GitHub page links are rewritten to raw files. */
export async function fromUrl(url: string, progress?: Progress): Promise<PathFile[]> {
  const u = url
    .trim()
    .replace(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\//, 'https://raw.githubusercontent.com/$1/$2/')
  if (/\.sfz(\?|$)/i.test(u)) return sfzFromUrl(u, progress)
  const name = decodeURIComponent(u.split('?')[0].split('/').pop() || 'download')
  progress?.(0, 1, name)
  const file = await fetchBlob(u)
  progress?.(1, 1, name)
  return [{ file, path: name }]
}
