export type MidiEvent =
  | { type: 'noteOn'; channel: number; note: number; velocity: number }
  | { type: 'noteOff'; channel: number; note: number }
  | { type: 'polyPressure'; channel: number; note: number; value: number }
  | { type: 'channelPressure'; channel: number; value: number }
  | { type: 'pitchBend'; channel: number; value: number } // -1..1
  | { type: 'cc'; channel: number; cc: number; value: number } // 0..1

/** Decode one MIDI message (channels 0-15). Values normalised. */
export function parseMidi(data: ArrayLike<number>): MidiEvent | null {
  const status = data[0]
  const cmd = status & 0xf0
  const channel = status & 0x0f
  const d1 = data[1] ?? 0
  const d2 = data[2] ?? 0
  switch (cmd) {
    case 0x90:
      return d2 > 0 ? { type: 'noteOn', channel, note: d1, velocity: d2 / 127 } : { type: 'noteOff', channel, note: d1 }
    case 0x80:
      return { type: 'noteOff', channel, note: d1 }
    case 0xa0:
      return { type: 'polyPressure', channel, note: d1, value: d2 / 127 }
    case 0xb0:
      return { type: 'cc', channel, cc: d1, value: d2 / 127 }
    case 0xd0:
      return { type: 'channelPressure', channel, value: d1 / 127 }
    case 0xe0: {
      const v = (d2 << 7) | d1 // 0..16383, center 8192
      return { type: 'pitchBend', channel, value: v >= 8192 ? (v - 8192) / 8191 : (v - 8192) / 8192 }
    }
  }
  return null
}

/** Listen to every MIDI input, including devices plugged in later. Returns input count. */
export async function connectMidi(onEvent: (e: MidiEvent) => void): Promise<number> {
  if (!navigator.requestMIDIAccess) throw new Error('Web MIDI is not supported in this browser')
  const access = await navigator.requestMIDIAccess()
  const onMessage = (e: MIDIMessageEvent) => {
    const ev = e.data && parseMidi(e.data)
    if (ev) onEvent(ev)
  }
  const bind = () => access.inputs.forEach((input) => (input.onmidimessage = onMessage))
  bind()
  access.onstatechange = bind
  return access.inputs.size
}
