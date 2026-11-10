import { readFileSync, statSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  allWaves, categoryLabel, categoryTag, CYCLE_ROOT, cycleRate, loadAkwf, tableChannels, tableCycle, tableLength, tableSoundSettings,
  waveAt, waveAudioId, waveChannels, waveLabel, waveSpot, type AkwfIndex,
} from './akwf'
import { encodeCycleWav, encodeTableWav, encodeWav, readCycleWav, readTableWav } from './wav'

const cycle = (n: number, f: (i: number) => number) => Float32Array.from({ length: n }, (_, i) => f(i))

describe('single-cycle WAVs', () => {
  it('round-trip 16-bit audio exactly, with their rate, root note and whole-file loop', async () => {
    const left = cycle(600, (i) => Math.round(Math.sin((2 * Math.PI * i) / 600) * 30000) / 32768)
    const right = cycle(600, (i) => Math.round(((i / 600) * 2 - 1) * 32767) / 32768)
    const blob = encodeCycleWav([left, right], 39244, 36)
    const back = readCycleWav(await blob.arrayBuffer())
    expect(back).not.toBeNull()
    expect(back!.rate).toBe(39244)
    expect(back!.rootNote).toBe(36)
    expect(back!.channels).toHaveLength(2)
    expect(back!.channels[0]).toEqual(left)
    expect(back!.channels[1]).toEqual(right)
  })

  it('leaves ordinary WAVs to the decoder', async () => {
    // no smpl chunk
    expect(readCycleWav(await encodeWav([cycle(600, () => 0.5)], 44100).arrayBuffer())).toBeNull()
    // longer than a single cycle
    expect(readCycleWav(await encodeCycleWav([cycle(8000, () => 0)], 44100, 60).arrayBuffer())).toBeNull()
    // a loop that isn't the whole file
    const bytes = await encodeCycleWav([cycle(600, () => 0)], 44100, 60).arrayBuffer()
    const v = new DataView(bytes)
    v.setUint32(bytes.byteLength - 12, 300, true) // the loop's end (the smpl chunk closes the file)
    expect(readCycleWav(bytes)).toBeNull()
  })
})

describe('AKWF', () => {
  it('tunes a 600-frame cycle to C2', () => {
    expect(CYCLE_ROOT).toBe(36)
    expect(cycleRate(600)).toBe(39244)
    const hz = cycleRate(600) / 600
    expect(Math.abs(1200 * Math.log2(hz / 65.40639))).toBeLessThan(0.05) // cents
  })

  it('names categories by AKWF folder, and waves by their file', () => {
    expect(categoryLabel('AKWF_epiano')).toBe('ELECTRIC PIANO')
    expect(categoryLabel('AKWF_0007')).toBe('MIXED 0007')
    expect(categoryTag('AKWF_bw_saw')).toBe('akwf_bw_saw')
    expect(waveLabel('AKWF_epiano_0012')).toBe('EPIANO 0012')
    expect(waveLabel('AKWF_0101')).toBe('AKWF 0101')
    expect(waveLabel('AKWF_saw')).toBe('SAW')
    expect(waveAudioId('AKWF_saw')).toBe('akwf-AKWF_saw')
  })

  it('ships every wave: the index and the category files agree', () => {
    const dir = new URL('../../public/akwf/', import.meta.url)
    const index = JSON.parse(readFileSync(new URL('index.json', dir), 'utf8')) as AkwfIndex
    expect(index.license).toBe('CC0-1.0')
    expect(index.categories).toHaveLength(65)
    let count = 0
    const names = new Set<string>()
    for (const c of index.categories) {
      const frames = c.waves.reduce((n, _, i) => n + index.frames * (c.channels?.[i] ?? 1), 0)
      expect(statSync(new URL(`${c.folder}.bin`, dir)).size).toBe(frames * 2)
      for (const w of c.waves) names.add(w)
      count += c.waves.length
    }
    expect(count).toBe(4358)
    expect(index.count).toBe(4358)
    expect(names.size).toBe(count) // names are unique, so they can be audio ids
  })
})

describe('wavetable WAVs', () => {
  it('round-trip their cycles and cycle length (the clm chunk wavetable synths write)', async () => {
    const t = cycle(4 * 256, (i) => Math.sin((2 * Math.PI * (i % 256)) / 256) * (1 + Math.floor(i / 256)) / 4)
    const back = readTableWav(await encodeTableWav([t], 48000, 256).arrayBuffer())
    expect(back).not.toBeNull()
    expect(back!.size).toBe(256)
    expect(back!.rate).toBe(48000)
    expect(back!.channels[0]).toEqual(t)
  })

  it('reads a 16-bit table with only its clm chunk to say so, and nothing else', async () => {
    const bytes = new Uint8Array(await encodeWav([cycle(2048, (i) => (i % 1024) / 2048)], 44100).arrayBuffer())
    expect(readTableWav(bytes.buffer)).toBeNull()
    // the same with a clm chunk added at the end
    const clm = new TextEncoder().encode('<!>1024 10000000 wavetable (test)')
    const out = new Uint8Array(bytes.length + 8 + clm.length + (clm.length & 1))
    out.set(bytes)
    const v = new DataView(out.buffer)
    out.set(new TextEncoder().encode('clm '), bytes.length)
    v.setUint32(bytes.length + 4, clm.length, true)
    out.set(clm, bytes.length + 8)
    v.setUint32(4, out.length - 8, true)
    const back = readTableWav(out.buffer)
    expect(back?.size).toBe(1024)
    expect(back?.channels[0].length).toBe(2048)
  })
})

describe('AKWF wavetables', () => {
  it('are the categories, each wave a cycle of its table, as it plays alone', async () => {
    const dir = new URL('../../public/akwf/', import.meta.url)
    vi.stubGlobal('fetch', async (url: string) => new Response(readFileSync(new URL(url.replace(/^akwf\//, ''), dir))))
    await loadAkwf()
    vi.unstubAllGlobals()
    expect(allWaves()).toHaveLength(4358)
    const spot = waveSpot('AKWF_epiano_0007')!
    expect(spot.folder).toBe('AKWF_epiano')
    expect(waveAt(spot.folder, spot.index)).toBe('AKWF_epiano_0007')
    const n = tableLength('AKWF_epiano')
    const t = tableChannels('AKWF_epiano')!
    expect(t[0].length).toBe(n * 600)
    expect(t[0].subarray(spot.index * 600, spot.index * 600 + 600)).toEqual(waveChannels('AKWF_epiano_0007')![0])
    // the stereo category's mono waves play the same both sides
    const st = tableChannels('AKWF_stereo')!
    expect(st).toHaveLength(2)
    // a blend half way between two waves
    const a = waveChannels(waveAt(spot.folder, spot.index)!)![0]
    const b = waveChannels(waveAt(spot.folder, spot.index + 1)!)![0]
    expect(tableCycle('AKWF_epiano', spot.index + 0.5)![100]).toBeCloseTo((a[100] + b[100]) / 2, 6)
    // the last wave's next is the first
    expect(waveAt('AKWF_epiano', n)).toBe(waveAt('AKWF_epiano', 0))
    const s = tableSoundSettings('AKWF_epiano')
    expect(s.wtSize).toBe(600)
    expect(s.rootNote).toBe(CYCLE_ROOT)
    expect(s.tag).toContain('wavetable')
  })
})
