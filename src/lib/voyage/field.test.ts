import { describe, expect, it } from 'vitest'
import { BEAM_S, CATCH_R, Field, shipPose, type Port } from './field'

const rock = (o: Partial<Parameters<Field['add']>[0]> = {}) => ({
  vco: 0,
  x: 1,
  y: 0.5,
  vx: -0.1,
  vy: 0,
  r: 0.05,
  spin: 0,
  seed: 0.3,
  payload: { kind: 'sound' as const, soundId: 's1', label: 'S1' },
  ...o,
})
const run = (f: Field, ports: Port[], seconds: number, dt = 1 / 60) => {
  const caught = []
  for (let t = 0; t < seconds; t += dt) caught.push(...f.step(dt, ports))
  return caught
}

describe('voyage field', () => {
  it('drifts a rock past a closed port, never catching it', () => {
    const f = new Field()
    f.add(rock())
    const caught = run(f, [{ vco: 0, x: 0.6, y: 0.5, open: false }], 6)
    expect(caught).toHaveLength(0)
    expect(f.rocks[0].x).toBeLessThan(0.6)
  })

  it('locks on near its open port and catches it BEAM_S later, at the port', () => {
    const f = new Field()
    const r = f.add(rock())!
    const ports = [{ vco: 0, x: 0.6, y: 0.5, open: true }]
    // it reaches the catch radius after (1 - 0.6 - CATCH_R - r) / 0.1 s
    const reach = (1 - 0.6 - CATCH_R - 0.05) / 0.1
    expect(run(f, ports, reach - 0.1)).toHaveLength(0)
    expect(r.beam).toBe(-1)
    const caught = run(f, ports, 0.2 + BEAM_S)
    expect(caught.map((c) => c.id)).toEqual([r.id])
    expect(Math.hypot(r.x - 0.6, r.y - 0.5)).toBeLessThan(1e-6)
    expect(f.rocks).toHaveLength(0)
  })

  it('only the rock meant for a VCO answers its port', () => {
    const f = new Field()
    f.add(rock({ vco: 1 }))
    expect(run(f, [{ vco: 0, x: 0.6, y: 0.5, open: true }], 8)).toHaveLength(0)
  })

  it('pulls one rock at a time per port', () => {
    const f = new Field()
    const a = f.add(rock({ x: 0.7 }))!
    const b = f.add(rock({ x: 0.72, y: 0.52 }))!
    const ports = [{ vco: 0, x: 0.6, y: 0.5, open: true }]
    run(f, ports, 0.1)
    expect([a.beam >= 0, b.beam >= 0].filter(Boolean)).toHaveLength(1)
  })

  it('a click locks a far rock on, if its port is open', () => {
    const f = new Field()
    const r = f.add(rock({ x: 1.5 }))!
    expect(f.lock(r, [{ vco: 0, x: 0.2, y: 0.5, open: false }])).toBe(false)
    expect(f.lock(r, [{ vco: 0, x: 0.2, y: 0.5, open: true }])).toBe(true)
    expect(f.at(1.5, 0.5)).toBeNull()
  })

  it('the bob stays on screen and is smooth', () => {
    let prev = shipPose(0, 1.6)
    for (let t = 0.05; t < 200; t += 0.05) {
      const p = shipPose(t, 1.6)
      expect(p.y).toBeGreaterThan(0.38)
      expect(p.y).toBeLessThan(0.62)
      expect(Math.abs(p.y - prev.y)).toBeLessThan(0.01)
      prev = p
    }
  })
})
