import { readFileSync, statSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { categoryLabel, categoryTag, CYCLE_ROOT, cycleRate, waveAudioId, waveLabel, type AkwfIndex } from './akwf'
import { encodeCycleWav, encodeWav, readCycleWav } from './wav'

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
