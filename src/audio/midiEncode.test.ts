import { describe, expect, it } from 'vitest'
import { encodeMidi, parseMidi, type MidiEvent } from './midi'

describe('encodeMidi', () => {
  it('is parseMidi undone, for every channel message the on-screen keyboard sends', () => {
    const events: MidiEvent[] = [
      { type: 'noteOn', channel: 3, note: 60, velocity: 100 / 127 },
      { type: 'noteOff', channel: 3, note: 60 },
      { type: 'cc', channel: 0, cc: 11, value: 64 / 127 },
      { type: 'channelPressure', channel: 5, value: 1 },
      { type: 'pitchBend', channel: 2, value: -1 },
      { type: 'pitchBend', channel: 2, value: 1 },
      { type: 'pitchBend', channel: 0, value: 0 },
    ]
    for (const e of events) expect(parseMidi(encodeMidi(e))).toEqual(e)
  })
  it('never sends a note on at velocity 0 (that would be a note off)', () => {
    expect(encodeMidi({ type: 'noteOn', channel: 0, note: 60, velocity: 0 })[2]).toBe(1)
  })
})
