import { describe, expect, it } from 'vitest'
import { migrateMaster, vcoHeard } from './types'

const mix = (mute: boolean[], solo: boolean[]) => ({ vcoMute: mute, vcoSolo: solo })
const heard = (m: ReturnType<typeof mix>) => [0, 1, 2].map((i) => vcoHeard(m, i))

describe('vcoHeard (the rack mute / solo)', () => {
  it('hears every VCO with nothing muted or soloed', () => {
    expect(heard(mix([false, false, false], [false, false, false]))).toEqual([true, true, true])
  })
  it('silences a muted VCO', () => {
    expect(heard(mix([false, true, false], [false, false, false]))).toEqual([true, false, true])
  })
  it('hears only the soloed VCOs while any is soloed', () => {
    expect(heard(mix([false, false, false], [false, true, false]))).toEqual([false, true, false])
    expect(heard(mix([false, false, false], [true, false, true]))).toEqual([true, false, true])
  })
  it('lets mute win over solo', () => {
    expect(heard(mix([true, false, false], [true, true, false]))).toEqual([false, true, false])
  })
})

describe('migrateMaster: the PLAY view and mute / solo', () => {
  it('opens the PLAY view for a board that had any slot in its old per-VCO Play view', () => {
    const m = migrateMaster({ vcoPlay: [false, true, false] } as never)
    expect(m.rackPlay).toBe(true)
    expect('vcoPlay' in m).toBe(false)
    expect(migrateMaster({ vcoPlay: [false, false, false] } as never).rackPlay).toBe(false)
  })
  it('starts with every VCO heard, and keeps three of each', () => {
    expect(migrateMaster({}).vcoMute).toEqual([false, false, false])
    expect(migrateMaster({ vcoSolo: [true] } as never).vcoSolo).toEqual([true, false, false])
  })
})
