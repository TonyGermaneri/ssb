/**
 * MPE as a receiver (the MIDI Polyphonic Expression spec, MMA RP-053): which channels are a zone's members, and the
 * RPNs a device configures them with. The native engine does the same (native/engine/src/Engine.cpp, rpnData).
 *
 * - A zone's master channel carries what applies to every note (bend with the sound's own BEND range, pressure,
 *   CC74); each member channel carries one note at a time and its own bend, pressure and CC74.
 * - The lower zone's master is channel 1 (0 here), its members the channels above it; the upper zone's master is
 *   channel 16 (15), its members below it. Until an MPE Configuration Message (RPN 6) says otherwise: one lower zone
 *   of 15 members, which is what controllers and DAWs send by default.
 * - RPN 0 (pitch bend sensitivity) on a member channel is the zone's per-note bend range.
 */
const RPN_NULL = 0x3fff

export class MpeZones {
  lower = 15
  upper = 0
  /** the RPN each channel has selected (CC 101 MSB, CC 100 LSB) */
  private rpn = new Int16Array(16).fill(RPN_NULL)
  /** the data entry MSB each channel last sent (CC 6), for a CC 38 that follows it */
  private msb = new Uint8Array(16)

  isMember(ch: number): boolean {
    return (ch >= 1 && ch <= this.lower) || (this.upper > 0 && ch >= 15 - this.upper && ch <= 14)
  }

  /**
   * A controller change (7-bit value). Answers the per-note bend range (semitones) when it completes an RPN 0 on a
   * member channel; zone changes (RPN 6) are kept here.
   */
  cc(ch: number, cc: number, v7: number): number | null {
    if (ch < 0 || ch > 15) return null
    switch (cc) {
      case 101:
        this.rpn[ch] = (v7 << 7) | (this.rpn[ch] & 127)
        return null
      case 100:
        this.rpn[ch] = (this.rpn[ch] & ~127) | v7
        return null
      case 99:
      case 98:
        this.rpn[ch] = RPN_NULL // an NRPN: data entry isn't ours
        return null
      case 6:
        this.msb[ch] = v7
        return this.data(ch, v7, 0)
      case 38:
        return this.data(ch, this.msb[ch], v7)
    }
    return null
  }

  private data(ch: number, msb: number, lsb: number): number | null {
    switch (this.rpn[ch]) {
      case 0:
        return this.isMember(ch) && msb > 0 ? msb + lsb / 100 : null
      case 6: {
        const n = Math.max(0, Math.min(15, msb))
        // zones never overlap: one that grows shrinks the other
        if (ch === 0) {
          this.lower = n
          this.upper = Math.max(0, Math.min(this.upper, 14 - n))
        } else if (ch === 15) {
          this.upper = n
          this.lower = Math.max(0, Math.min(this.lower, 14 - n))
        }
        return null
      }
    }
    return null
  }
}
