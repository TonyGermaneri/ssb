import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { textModel } from '../embed/model2vec'
import { FACTORY_PATCHES, LAYER_VOLUME } from '../factory'
import { waveAudioId, waveSoundSettings, type AkwfIndex } from '../akwf'
import { splitTags } from '../tags'
import { defaultMaster, defaultMatrix, headerOf, newSlot, PATCH_SLOTS, type MasterState, type Patch, type PatchSlot, type Sound } from '../../types'
import { SemanticIndex } from '.'
import { queryPushes } from './axes'
import { makeCandidate } from './candidate'
import { soundTexts } from './describe'

// the model as it ships, and the built-in patches built as the board builds them (lib/factory.ts), audio aside
const dir = join(__dirname, '../../../public/models/potion-base-8m')
const buf = readFileSync(join(dir, 'vectors.bin'))
const model = textModel(readFileSync(join(dir, 'vocab.txt'), 'utf8'), buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length))
const akwf = JSON.parse(readFileSync(join(__dirname, '../../../public/akwf/index.json'), 'utf8')) as AkwfIndex
const folderOf = new Map(akwf.categories.flatMap((c) => c.waves.map((w) => [w, c.folder] as const)))
let n = 0
const uid = () => `id${++n}`
const sounds = new Map<string, Sound>()
const soundFor = (wave: string): Sound => {
  let s = sounds.get(wave)
  if (!s) sounds.set(wave, (s = { id: uid(), audioId: waveAudioId(wave), fileName: `${wave}.wav`, settings: waveSoundSettings(wave, folderOf.get(wave)!) }))
  return s
}
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x))
const patches: Patch[] = FACTORY_PATCHES.map((fp) => {
  const slots: (PatchSlot | null)[] = fp.slots.map((x) => {
    if (!x) return null
    const src = soundFor(x.wave)
    const settings = { ...clone(src.settings), ...clone(x.settings ?? {}), mod: defaultMatrix(), vcos: [], midiNote: null }
    Object.assign(settings.mod.lfo1, x.lfo1)
    Object.assign(settings.mod.lfo2, x.lfo2)
    settings.mod.routes.push(...clone(x.routes ?? []))
    settings.volume = x.settings?.volume ?? LAYER_VOLUME
    return { ...newSlot({ id: uid(), soundId: src.id, settings }), ...x.slot }
  })
  while (slots.length < PATCH_SLOTS) slots.push(null)
  const d = defaultMaster()
  const h = fp.header ?? {}
  const mod = defaultMatrix()
  Object.assign(mod.lfo1, h.mod?.lfo1)
  Object.assign(mod.lfo2, h.mod?.lfo2)
  mod.routes.push(...clone(h.mod?.routes ?? []))
  return { id: uid(), name: fp.name, tag: fp.tag, slots, header: headerOf({ ...d, ...h, fx: { ...d.fx, ...h.fx }, mod } as MasterState) }
})
const byId = new Map([...sounds.values()].map((s) => [s.id, s]))
const index = new SemanticIndex({
  sounds: () => [...sounds.values()],
  patches: () => patches,
  layerSound: (l) => ({ ...byId.get(l.soundId)!, id: l.id, settings: l.settings }),
  soundName: (id) => byId.get(id)?.settings.name,
  audioOf: () => null,
})
index.model = model
const top = (q: string, k = 5) => {
  const s = index.matchText('patch', q, patches)
  return [...patches].sort((a, b) => s.get(b.id)! - s.get(a.id)!).slice(0, k)
}
const tagged = (p: Patch, tag: string) => splitTags(p.tag).includes(tag)

describe('semantic search over the built-in patches', () => {
  // (as rolidrummer's retrieval eval: what a description should bring to the top five)
  const EVAL: [string, string, number][] = [
    ['airy choir', 'choir', 4],
    ['bright plucky bell', 'bell', 3],
    ['dark gritty bass', 'bass', 4],
    ['wobble bass', 'bass', 4],
    ['8 bit lead', 'chip', 3],
    ['warm evolving pad', 'pad', 5],
    ['huge cinematic drone', 'drone', 2],
    ['glassy keys', 'keys', 4],
    ['brass stab', 'brass', 3],
  ]
  for (const [q, tag, atLeast] of EVAL)
    it(`"${q}" brings ${atLeast}+ ${tag} patches to the top five`, () => {
      const found = top(q)
      expect(found.filter((p) => tagged(p, tag)).length, found.map((p) => p.name).join(', ')).toBeGreaterThanOrEqual(atLeast)
    })
  it('names win: "wobble bass" is WOBBLE HOBBLE BASS', () => {
    expect(top('wobble bass', 1)[0].name).toBe('WOBBLE HOBBLE BASS')
  })
  it('a patch is most like itself, then like its kind', () => {
    const wool = patches.find((p) => p.name === 'WOOL BLANKET PAD')!
    const s = index.similar('patch', wool, patches)
    const ranked = [...patches].sort((a, b) => s.get(b.id)! - s.get(a.id)!)
    expect(ranked[0]).toBe(wool)
    expect(s.get(wool.id)).toBeCloseTo(1, 3)
    expect(ranked.slice(1, 6).filter((p) => tagged(p, 'pad')).length).toBeGreaterThanOrEqual(3)
  })
})

describe('what a description pushes', () => {
  const pushed = (q: string) => Object.fromEntries(queryPushes(model, q).map((p) => [p.axis.id, Math.sign(p.amount)]))
  it('reads the usual synth words the right way', () => {
    expect(pushed('dark gritty bass')).toMatchObject({ bright: -1, grit: 1 })
    expect(pushed('bright plucky bell')).toMatchObject({ bright: 1, attack: -1, length: -1 })
    expect(pushed('warm evolving pad with a slow swell')).toMatchObject({ bright: -1, attack: 1, motion: 1 })
    expect(pushed('huge cinematic drone')).toMatchObject({ length: 1, space: 1 })
    expect(pushed('tight dry stab')).toMatchObject({ space: -1 })
  })
  it('says nothing of words that are only names', () => {
    expect(queryPushes(model, 'pad')).toEqual([])
  })
})

describe('a candidate patch', () => {
  const donors = top('warm evolving pad', 4).map((patch, i) => ({ patch, weight: [0.5, 0.25, 0.15, 0.1][i] }))
  const pushes = queryPushes(model, 'dark slow pad')
  const { patch, info } = makeCandidate({ donors, pushes, query: 'dark slow pad', seed: 0, uid })
  it('is a new patch, named after the description, its layers its own', () => {
    expect(patch.id).not.toBe(donors[0].patch.id)
    expect(patch.name).toBe('DARK SLOW PAD')
    expect(splitTags(patch.tag)).toContain('search')
    expect(splitTags(patch.tag)).not.toContain('factory')
    const theirs = new Set(donors.flatMap((d) => d.patch.slots.map((x) => x?.layer.id)))
    for (const x of patch.slots) if (x) expect(theirs.has(x.layer.id)).toBe(false)
    expect(info.from.map((f) => f.name)).toEqual(donors.map((d) => d.patch.name))
  })
  it('is darker and slower than what it was blended from', () => {
    const plain = makeCandidate({ donors, pushes: [], query: 'x', seed: 0, uid }).patch
    const main = (p: Patch) => p.slots.find(Boolean)!.layer.settings
    expect(main(patch).cutoff).toBeLessThan(main(plain).cutoff)
    expect(main(patch).attack).toBeGreaterThan(main(plain).attack)
    expect(info.pushes.map((p) => p.label)).toEqual(expect.arrayContaining(['DARKER', 'SLOWER ATTACK']))
  })
  it('rerolls to something else, the same way every time', () => {
    const a = makeCandidate({ donors, pushes, query: 'q', seed: 3, uid }).patch
    const b = makeCandidate({ donors, pushes, query: 'q', seed: 3, uid }).patch
    const main = (p: Patch) => p.slots.find(Boolean)!.layer.settings
    expect(main(a).cutoff).toBe(main(b).cutoff)
    expect(main(a).cutoff).not.toBe(main(patch).cutoff)
  })
  it('takes a sound the words named for its main VCO', () => {
    const choir = [...sounds.values()].find((s) => s.settings.tag.includes('hvoice'))!
    const { patch: p, info: i } = makeCandidate({ donors, pushes, query: 'choir pad', seed: 0, swap: choir, uid })
    expect(p.slots.find(Boolean)!.layer.soundId).toBe(choir.id)
    expect(i.swapped).toBe(choir.settings.name)
  })
})

describe('descriptions', () => {
  it("spell out AKWF's short names and leave ids out", () => {
    const t = soundTexts(waveSoundSettings('AKWF_epiano_0007', 'AKWF_epiano'))
    expect(t.name).toBe('electric piano')
    expect(t.sound).toBe('')
  })
})
