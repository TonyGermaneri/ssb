/** MIDI clock (24 pulses per quarter note) → tempo. */
export class ClockTracker {
  private times: number[] = []
  ticks = 0

  /** Feed one clock pulse (ms timestamp). Returns BPM once a full beat has been seen, else null. */
  tick(ms: number): number | null {
    this.ticks++
    this.times.push(ms)
    if (this.times.length > 25) this.times.shift()
    if (this.times.length < 25) return null
    const beatMs = this.times[24] - this.times[0]
    return beatMs > 0 ? 60000 / beatMs : null
  }

  reset() {
    this.times = []
    this.ticks = 0
  }
}
