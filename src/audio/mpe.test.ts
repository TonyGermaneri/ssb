import { describe, expect, it } from 'vitest'
import { MpeZones } from './mpe'

const rpn = (z: MpeZones, ch: number, n: number, msb: number, lsb?: number) => {
  z.cc(ch, 101, 0)
  z.cc(ch, 100, n)
  let got = z.cc(ch, 6, msb)
  if (lsb !== undefined) got = z.cc(ch, 38, lsb)
  return got
}

describe('MPE zones', () => {
  it('starts as one lower zone: channel 1 the master, 2-16 the notes', () => {
    const z = new MpeZones()
    expect(z.isMember(0)).toBe(false)
    for (let ch = 1; ch <= 15; ch++) expect(z.isMember(ch)).toBe(true)
  })

  it('takes a per-note bend range from RPN 0 on a member channel, not on the master', () => {
    const z = new MpeZones()
    expect(rpn(z, 3, 0, 24)).toBe(24)
    expect(rpn(z, 3, 0, 12, 50)).toBe(12.5)
    expect(rpn(z, 0, 0, 2)).toBe(null)
  })

  it('ignores data entry for other RPNs and for NRPNs', () => {
    const z = new MpeZones()
    expect(rpn(z, 2, 1, 64)).toBe(null)
    z.cc(2, 99, 0)
    z.cc(2, 98, 0)
    expect(z.cc(2, 6, 24)).toBe(null)
  })

  it('follows an MCM: zones move and never overlap', () => {
    const z = new MpeZones()
    rpn(z, 15, 6, 15) // an upper zone of 15: channel 16 the master, 1-15 the notes
    expect(z.upper).toBe(15)
    expect(z.lower).toBe(0)
    expect(z.isMember(0)).toBe(true)
    expect(z.isMember(15)).toBe(false)
    rpn(z, 0, 6, 7) // a lower zone of 7: the upper one shrinks to fit beside it
    expect([z.lower, z.upper]).toEqual([7, 7])
    expect(z.isMember(7)).toBe(true)
    expect(z.isMember(8)).toBe(true)
    expect(z.isMember(0)).toBe(false)
    expect(z.isMember(15)).toBe(false)
    rpn(z, 15, 6, 0) // the upper zone goes
    expect(z.isMember(8)).toBe(false)
  })
})
