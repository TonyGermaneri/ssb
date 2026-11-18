import { describe, expect, it } from 'vitest'
import { BEAM_S, Field3, LOCK_Z, NEAR_Z } from './field3d'
import { paramOf, PARAMS, readParam, stopsOf, writeParam, nearestStop, type PointIO } from './params'

const pay = { kind: 'sound' as const, soundId: 's', label: 'S' }
const rock = (o: Partial<Parameters<Field3['add']>[0]> = {}) => ({ vco: 0, x: 0.1, y: 0.05, z: 1, speed: 0.5, r: 0.02, spin: 0, seed: 0.3, payload: pay, ...o })

describe('the cockpit\'s rocks', () => {
  it('come at you: nearer, bigger and further out from the vanishing point', () => {
    const f = new Field3({ x: 0.8, y: 0.4 }, 1)
    const r = f.add(rock())!
    const far = f.project(r)
    f.step(1, [])
    const near = f.project(r)
    expect(r.z).toBeCloseTo(0.5)
    expect(near.r).toBeCloseTo(far.r * 2)
    expect(near.x - 0.8).toBeCloseTo((far.x - 0.8) * 2)
  })
  it('go by when they reach the glass', () => {
    const f = new Field3()
    f.add(rock({ speed: 2 }))
    f.step(0.6, [])
    expect(f.rocks).toHaveLength(0)
  })
  it('lock on to an open intake once near, then come in and are caught', () => {
    const f = new Field3()
    const r = f.add(rock({ z: LOCK_Z - 0.01, speed: 0 }))!
    const intakes = [{ vco: 0, x: 0.3, y: 0.9, open: true }]
    expect(f.step(0.01, intakes)).toHaveLength(0)
    expect(r.beam).toBeGreaterThanOrEqual(0)
    const mid = f.shown(r, intakes)
    expect(mid.y).toBeCloseTo(r.by, 2)
    const got = f.step(BEAM_S + 0.1, intakes)
    expect(got).toEqual([r])
    expect(f.rocks).toHaveLength(0)
  })
  it('a closed intake lets them by; a rock outside the glass is not taken', () => {
    const f = new Field3()
    const r = f.add(rock({ z: 0.2, speed: 0 }))!
    f.step(0.01, [{ vco: 0, x: 0, y: 0, open: false }])
    expect(r.beam).toBe(-1)
    f.step(0.01, [{ vco: 0, x: 0, y: 0, open: true }], () => false)
    expect(r.beam).toBe(-1)
  })
  it('a click finds the nearest rock under it', () => {
    const f = new Field3({ x: 0.5, y: 0.5 }, 1)
    const a = f.add(rock({ x: 0, y: 0, z: 0.8 }))!
    const b = f.add(rock({ x: 0, y: 0, z: 0.4 }))!
    expect(f.at(0.5, 0.5)).toBe(b)
    expect(f.at(0.9, 0.9)).toBe(null)
    void a
    void NEAR_Z
  })
})

describe('the cockpit\'s controls', () => {
  const pt = { perform: { x: 0.2, y: 0.7 } } as Record<string, { x: number; y: number }>
  const io: PointIO = { read: (p) => pt[p] ?? { x: 0.5, y: 0.5 }, move: (p, q) => (pt[p] = q), end: () => {} }
  it('are every pad axis, 15 a VCO, and the garden\'s two', () => {
    expect(PARAMS).toHaveLength(18)
    expect(new Set(PARAMS.map((p) => `${p.pad}${p.axis}`)).size).toBe(18)
  })
  it('write their own axis, the other kept', () => {
    writeParam(io, paramOf('vol'), 0.4)
    expect(pt.perform).toEqual({ x: 0.2, y: 0.4 })
    expect(readParam(io, paramOf('pos'))).toBe(0.2)
  })
  it('stepped ones have detents: LFO rate, echo time on the tempo, grain size under SYNC', () => {
    expect(stopsOf('rate', { bpm: 120, grainSync: false })!.length).toBeGreaterThan(8)
    const echo = stopsOf('time', { bpm: 120, grainSync: false })!
    expect(echo.every((s) => s.at >= 0 && s.at <= 1)).toBe(true)
    expect(stopsOf('size', { bpm: 120, grainSync: false })).toBe(null)
    expect(stopsOf('size', { bpm: 120, grainSync: true })!.at(-1)!.label).toBe('FREE')
    expect(nearestStop(echo, echo[2].at + 0.001)).toBe(echo[2])
  })
})
