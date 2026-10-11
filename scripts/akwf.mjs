#!/usr/bin/env node
/**
 * Packs the AKWF single-cycle waveforms (Adventure Kid, CC0: github.com/KristofferKarlAxelEkstrand/AKWF-FREE)
 * into public/akwf: index.json (categories = AKWF's folders, in its order, with each wave's name) and one
 * <folder>.bin per category, every wave's 600 frames as little-endian int16, channel after channel.
 *
 *   git clone --depth 1 --filter=blob:none --sparse https://github.com/KristofferKarlAxelEkstrand/AKWF-FREE
 *   (cd AKWF-FREE && git sparse-checkout set AKWF LICENSE.md)
 *   node scripts/akwf.mjs AKWF-FREE
 */
import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FRAMES = 600
const RATE = 44100
const repo = process.argv[2]
if (!repo) {
  console.error('usage: node scripts/akwf.mjs <AKWF-FREE checkout>')
  process.exit(1)
}
const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'akwf')
rmSync(out, { recursive: true, force: true })
mkdirSync(out, { recursive: true })

/** A wave's frames as int16, one array per channel. */
function readWav(path) {
  const b = readFileSync(path)
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`${path}: not a WAV`)
  let fmt, data
  for (let o = 12; o + 8 <= b.length; ) {
    const id = b.toString('ascii', o, o + 4)
    const size = b.readUInt32LE(o + 4)
    if (id === 'fmt ') fmt = { tag: b.readUInt16LE(o + 8), channels: b.readUInt16LE(o + 10), rate: b.readUInt32LE(o + 12), bits: b.readUInt16LE(o + 22) }
    if (id === 'data') data = b.subarray(o + 8, o + 8 + size)
    o += 8 + size + (size & 1)
  }
  if (!fmt || !data || fmt.tag !== 1 || fmt.bits !== 16 || fmt.rate !== RATE) throw new Error(`${path}: expected 16-bit PCM at ${RATE} Hz`)
  const frames = data.length / 2 / fmt.channels
  if (frames !== FRAMES) throw new Error(`${path}: ${frames} frames, expected ${FRAMES}`)
  return Array.from({ length: fmt.channels }, (_, c) => {
    const ch = new Int16Array(FRAMES)
    for (let i = 0; i < FRAMES; i++) ch[i] = data.readInt16LE((i * fmt.channels + c) * 2)
    return ch
  })
}

const root = join(repo, 'AKWF')
const categories = []
let total = 0
for (const folder of readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()) {
  const files = readdirSync(join(root, folder)).filter((f) => f.toLowerCase().endsWith('.wav')).sort()
  if (!files.length) continue
  const waves = []
  const channels = []
  const parts = []
  for (const f of files) {
    const chans = readWav(join(root, folder, f))
    waves.push(f.replace(/\.wav$/i, ''))
    channels.push(chans.length)
    for (const ch of chans) parts.push(Buffer.from(ch.buffer))
  }
  writeFileSync(join(out, `${folder}.bin`), Buffer.concat(parts))
  categories.push({ folder, waves, ...(channels.some((c) => c !== 1) ? { channels } : {}) })
  total += waves.length
}

let commit = ''
try {
  commit = execFileSync('git', ['-C', repo, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
} catch {}
const index = {
  source: 'https://github.com/KristofferKarlAxelEkstrand/AKWF-FREE',
  commit,
  license: 'CC0-1.0',
  author: 'Kristoffer Ekstrand (Adventure Kid)',
  frames: FRAMES,
  rate: RATE,
  count: total,
  categories,
}
writeFileSync(join(out, 'index.json'), JSON.stringify(index))
copyFileSync(join(repo, 'LICENSE.md'), join(out, 'LICENSE.md'))
console.log(`${total} waves in ${categories.length} categories → ${out}`)
