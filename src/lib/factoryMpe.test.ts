import { describe, expect, it } from 'vitest'
import { FACTORY_PATCHES } from './factory'
import { FACTORY_MPE, fillFactoryMpe } from './factoryMpe'
import { defaultMatrix, MOD_DESTS, MPE_SURFACES, type MpeBinding, type Patch } from '../types'

/** the most a surface may move each destination (a route's amount): tasteful, never wild */
const MAX: Partial<Record<keyof typeof MOD_DESTS, number>> = {
  cutoff: 0.5, resonance: 0.25, volume: 0.8, reverbMix: 0.35, delayMix: 0.35, pitch: 0.2, grainSize: 0.15,
  grainDetune: 0.05, grainPos: 0.3, grainScan: 0.2, lfo1Amt: 0.5, lfo2Amt: 0.5, lfo1Rate: 0.2, lfo2Rate: 0.2,
}

describe('built-in patches: MPE surfaces', () => {
  const surfaces = new Set(MPE_SURFACES.map((s) => s.id))

  it('every built-in patch binds PRESS and SLIDE (and nothing but the surfaces SSB has)', () => {
    expect(FACTORY_PATCHES.length).toBe(127)
    for (const fp of FACTORY_PATCHES) {
      const mpe = fp.mpe ?? []
      expect(mpe.some((b) => b.surface === 'press'), `${fp.id} press`).toBe(true)
      expect(mpe.some((b) => b.surface === 'slide'), `${fp.id} slide`).toBe(true)
      for (const b of mpe) expect(surfaces.has(b.surface), `${fp.id} ${b.surface}`).toBe(true)
    }
    // the table names only real patches
    const ids = new Set(FACTORY_PATCHES.map((p) => p.id))
    for (const id of Object.keys(FACTORY_MPE)) expect(ids.has(id), id).toBe(true)
  })

  it('destinations are real, amounts modest, slots filled, volume only ever up', () => {
    for (const fp of FACTORY_PATCHES) {
      for (const b of fp.mpe ?? []) {
        const where = `${fp.id} ${b.surface}>${b.dest}`
        expect(MOD_DESTS[b.dest], where).toBeDefined()
        expect(b.amount, where).not.toBe(0)
        expect(Math.abs(b.amount), where).toBeLessThanOrEqual(MAX[b.dest] ?? 0.3)
        if (b.dest === 'volume') expect(b.amount, `${where}: a press must never drop the attack out`).toBeGreaterThan(0)
        for (const i of b.slots ?? []) expect(fp.slots[i], `${where} slot ${i}`).toBeTruthy()
      }
    }
  })

  it('pitch moves only a grain-sync formant (with its opposite GRAIN) or a silent FM / ring modulator', () => {
    for (const fp of FACTORY_PATCHES) {
      const mpe = fp.mpe ?? []
      for (const b of mpe.filter((x) => x.dest === 'pitch')) {
        const formant = mpe.some((x) => x.surface === b.surface && x.dest === 'grainSize' && Math.abs(x.amount + b.amount / 2) < 1e-9)
        const modulator = !!b.slots?.length && b.slots.every((i) => fp.slots[i]?.slot?.audible === false)
        expect(formant || modulator, `${fp.id} ${b.surface}>pitch`).toBe(true)
      }
    }
  })

  it('an LFO AMOUNT is bound only where the LFO has room (the wheel brings it in): a full one can go no deeper', () => {
    const d = defaultMatrix()
    for (const fp of FACTORY_PATCHES) {
      for (const b of (fp.mpe ?? []).filter((x) => x.dest === 'lfo1Amt' || x.dest === 'lfo2Amt')) {
        const key = b.dest === 'lfo1Amt' ? 'lfo1' : 'lfo2'
        const slots = b.slots ?? fp.slots.map((x, i) => (x ? i : -1)).filter((i) => i >= 0)
        // the slots whose LFO drives something: at least one must have AMOUNT below full
        const driven = slots.filter((i) => fp.slots[i]?.routes?.some((r) => r.source === key))
        expect(driven.length, `${fp.id} ${b.dest}: drives nothing`).toBeGreaterThan(0)
        for (const i of driven) expect(fp.slots[i]![key]?.amount ?? d[key].amount, `${fp.id} slot ${i} ${key}`).toBeLessThan(1)
      }
    }
  })
})

describe('fillFactoryMpe (boards installed before the bindings)', () => {
  const patch = (factoryId: string | undefined, mpe?: MpeBinding[]): Pick<Patch, 'factoryId' | 'mpe'> => ({ factoryId, mpe })

  it('gives an installed built-in its bindings, as a copy of its own', () => {
    const ps = [patch('poly-saw'), patch('marimba-mojo-mallet')]
    expect(fillFactoryMpe(ps)).toBe(2)
    expect(ps[0].mpe).toEqual(FACTORY_MPE['poly-saw'])
    expect(ps[1].mpe).toEqual(FACTORY_MPE['marimba-mojo-mallet'])
    // not the table's own objects: editing a patch's bindings leaves the built-ins alone
    ps[1].mpe![0].amount = 0.99
    ps[1].mpe!.find((b) => b.slots)?.slots?.push(0)
    expect(FACTORY_MPE['marimba-mojo-mallet'][0].amount).not.toBe(0.99)
    expect(FACTORY_MPE['marimba-mojo-mallet'].find((b) => b.slots)?.slots).toEqual([1, 2])
  })

  it('leaves the user’s choice alone: a list of its own (even empty), a patch of their own, an unknown id', () => {
    const own: MpeBinding[] = [{ surface: 'press', dest: 'cutoff', amount: 0.1 }]
    const ps = [patch('poly-saw', []), patch('warm-pad', own), patch(undefined), patch('no-such-patch')]
    expect(fillFactoryMpe(ps)).toBe(0)
    expect(ps[0].mpe).toEqual([])
    expect(ps[1].mpe).toBe(own)
    expect(ps[2].mpe).toBeUndefined()
    expect(ps[3].mpe).toBeUndefined()
    // and a second load changes nothing
    const again = [patch('poly-saw')]
    fillFactoryMpe(again)
    expect(fillFactoryMpe(again)).toBe(0)
  })
})
