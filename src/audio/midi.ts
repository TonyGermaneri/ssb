export interface MidiHandlers {
  noteOn(note: number, velocity: number): void
  noteOff(note: number): void
}

/** Listen to every MIDI input, including devices plugged in later. Returns input count. */
export async function connectMidi(h: MidiHandlers): Promise<number> {
  if (!navigator.requestMIDIAccess) throw new Error('Web MIDI is not supported in this browser')
  const access = await navigator.requestMIDIAccess()
  const onMessage = (e: MIDIMessageEvent) => {
    if (!e.data) return
    const [status, note, vel] = e.data
    const cmd = status & 0xf0
    if (cmd === 0x90 && vel > 0) h.noteOn(note, vel)
    else if (cmd === 0x80 || (cmd === 0x90 && vel === 0)) h.noteOff(note)
  }
  const bind = () => access.inputs.forEach((input) => (input.onmidimessage = onMessage))
  bind()
  access.onstatechange = bind
  return access.inputs.size
}
