/**
 * Adaptive just intonation: a chord's fifths and thirds go pure while the keyboard stays close to equal temperament.
 *
 * The method and its figures are Werner Mohrlok's: his 2003 paper ("diagram n" below) and patents US 5,442,129 and
 * DE 10309000. Native twin: native/engine/include/ssb/AdaptiveTuning.h (keep them in step: they share a fixture).
 *
 * - **Positions.** A chord's notes are tuned pure against each other, then shifted so their deviations from equal
 *   temperament add up to nothing: a major triad is +4 -10 +6, a minor one -6 +10 -4 (diagram 01). Fixing the root at
 *   its tempered pitch was the first idea, and failed: major to its minor moved notes audibly.
 * - **The line.** That alone would still move notes shared by two chords, so the whole chord rides on a reference
 *   line, shifted to keep a note the ear already has within a step it can't hear (diagram 11). The line comes back
 *   to equal temperament whenever nothing holds it, and never leaves it by more than 20 cents (diagram 14), so no
 *   note is further than 30 cents out and a long progression can't sink.
 * - **Time.** Under 30 ms a note isn't pitched in the ear yet, so it may move freely (diagram 18). Nothing moves on a
 *   note-off: the notes left are in tune with each other already.
 *
 * Works on pitch classes, so octaves stay pure, inversions and doublings don't matter, and every note of a class gets
 * one tuning. Numbers are cents, at full depth: DEPTH is the caller's multiplier (diagram 20).
 */
import type { TuningMode } from '../types'

const just = (ratio: number, tempered: number) => 1200 * Math.log2(ratio) - tempered
/** 5:4 and 3:2, from equal temperament */
const THIRD = just(5 / 4, 400)
const FIFTH = just(3 / 2, 700)
const NINTH = just(9 / 8, 200)
/** 7:4, 7-LIMIT's seventh: too far out for the line to smooth (diagram 19) */
const NATURAL_SEVENTH = just(7 / 4, 1000)
/** every other mode's seventh, above the root: "almost tempered" (diagram 09) */
const TEMPERED_SEVENTH = 6
/** a major triad's root: +4, so the triad adds up to nothing */
const TRIAD_ROOT = -(THIRD + FIFTH) / 3

/** the longest structure tuned: F A C E G B, semitones and cents up from its first note (diagram 03) */
const CHAIN_SEMIS = [0, 4, 7, 11, 14, 18]
const CHAIN_CENTS = [0, THIRD, FIFTH, FIFTH + THIRD, 2 * FIFTH, 2 * FIFTH + THIRD]
const bit = (pc: number) => 1 << ((pc + 120) % 12)
const CHAIN_MASKS = Array.from({ length: 12 }, (_, r) => CHAIN_SEMIS.reduce((m, s) => m | bit(r + s), 0))

/** TONAL's basis temperament, by semitones above the harmonic centre (diagram 21) */
const BASIS = [10, -6, 3, 0, -3, 6, -10, 6, -3, 0, 3, -6]
/** TONAL remembers this many chords to find the centre (the paper's staple memory) */
const CHORDS_REMEMBERED = 10

const LINE_LIMIT = 20
/** seconds a note must have sounded for the ear to have its pitch */
const HEARD = 0.03
/** the step a heard note may take, masked by the new note; from STEP_GROWS out the line gives way (diagram 14) */
const STEP = 3
const STEP_GROWS = 11
const STEP_GROWTH = 4 / 7
/** cents a chord the line returns by when nothing holds it (diagram 12) */
const LINE_RETURN = 4
/** seconds of silence for the line to fade: how long the ear remembers a pitch (Stange et al.) */
const LINE_MEMORY = 3
/** EASED and TONAL give up purity for a step this big or more, to half at most (diagrams 15, 17) */
const EASE_FROM = 4.65
const EASE_SLOPE = 0.086
const EASE_LIMIT = 0.5

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
const toward = (v: number, to: number, by: number) => (v > to ? Math.max(to, v - by) : Math.min(to, v + by))
const pure = (mode: TuningMode) => mode === 'strict' || mode === 'septimal'

export class AdaptiveTuner {
  /** the reference line: where equal temperament is taken to be, right now */
  line = 0
  /** TONAL: the pitch class heard as the centre, -1 until there is one */
  centre = -1

  /** where each pitch class was last tuned: position + line */
  private tuned = new Float64Array(12)
  /** the pitch classes `tuned` holds for the chord now */
  private chordMask = 0
  /** pitch classes tuned to a natural seventh: the line lets those go */
  private sevenths = 0
  private pos = new Float64Array(12)
  private scratch = new Float64Array(12)
  private order = new Int32Array(12)
  /** heard notes this chord, for choosing between readings of it */
  private heard = 0
  private lastChord = -Infinity

  private ring = new Float64Array(CHORDS_REMEMBERED * 12)
  private ringNext = 0
  private ringCount = 0
  private ringAt = -Infinity

  constructor(readonly mode: TuningMode) {}

  /** The tuning of a pitch class: the chord's for its notes, the line for anything else (a FIXED VCO's drone). */
  cents(pc: number) {
    const m = bit(pc)
    return this.chordMask & m ? this.tuned[(pc + 120) % 12] : this.line
  }

  reset() {
    this.line = 0
    this.centre = -1
    this.tuned.fill(0)
    this.chordMask = this.sevenths = this.ringCount = this.ringNext = 0
    this.lastChord = this.ringAt = -Infinity
  }

  /**
   * A note came on. `held` is each pitch class's oldest note still down (seconds it has sounded, < 0: none);
   * `ringing` the same with release tails in: what the ear still has, so what must not jump.
   */
  chord(held: ArrayLike<number>, ringing: ArrayLike<number>, now: number) {
    let mask = 0
    let heard = 0
    let silence = true
    for (let pc = 0; pc < 12; pc++) {
      if (held[pc] >= 0) mask |= 1 << pc
      if (ringing[pc] >= HEARD) heard |= 1 << pc
      if (ringing[pc] > 0) silence = false
    }
    if (!mask) return
    if (silence) {
      // nothing left to stay in tune with, and in a while nothing remembered either
      const gap = now - this.lastChord
      this.line *= Math.exp(-gap / LINE_MEMORY)
      if (gap > LINE_MEMORY) this.chordMask = 0
    }
    this.lastChord = now
    // the same notes, or some of them: they keep what they have (and an irregular chord stays as it came, diagram 10)
    if (!(mask & ~this.chordMask)) return

    this.heard = heard
    const pos = this.pos
    let sevenths = this.analyse(mask, held, pos)
    if (this.mode === 'tonal') this.blendBasis(mask, pos, now)
    if (this.mode !== 'septimal') sevenths = 0

    const heardNow = heard & mask & ~sevenths & ~this.sevenths
    const line = this.solveLine(pos, heardNow)
    if (!pure(this.mode)) {
      // chords that fight the line go part way, and the line stays (diagrams 15, 17)
      let step = 0
      for (let pc = 0; pc < 12; pc++) if (heardNow & (1 << pc)) step = Math.max(step, Math.abs(pos[pc] + line - this.tuned[pc]))
      if (step > EASE_FROM) {
        const ease = clamp(1 + EASE_SLOPE * EASE_FROM - EASE_SLOPE * step, EASE_LIMIT, 1)
        for (let pc = 0; pc < 12; pc++) pos[pc] *= ease
      }
    }
    this.line = line
    for (let pc = 0; pc < 12; pc++) if (mask & (1 << pc)) this.tuned[pc] = pos[pc] + line
    this.chordMask = mask
    this.sevenths = sevenths
  }

  /** The chord's positions: a structure if it is one, else its notes in the order they came. Returns its natural 7ths. */
  private analyse(mask: number, held: ArrayLike<number>, pos: Float64Array) {
    pos.fill(0)
    const whole = this.fit(mask, pos)
    if (whole >= 0) return whole
    // nothing to read it as: the first notes that make something keep their tuning, the rest sit on the line (diagram 10)
    const order = this.order
    let n = 0
    for (let pc = 0; pc < 12; pc++) {
      if (!(mask & (1 << pc))) continue
      let i = n++
      while (i > 0 && held[order[i - 1]] < held[pc]) {
        order[i] = order[i - 1]
        i--
      }
      order[i] = pc
    }
    for (let k = n - 1; k >= 2; k--) {
      let part = 0
      for (let i = 0; i < k; i++) part |= 1 << order[i]
      pos.fill(0)
      const sevenths = this.fit(part, pos)
      if (sevenths >= 0) return sevenths
    }
    pos.fill(0)
    return 0
  }

  /** Positions if `mask` is a structure tuned (its natural sevenths, as a mask), else -1. */
  private fit(mask: number, pos: Float64Array) {
    let count = 0
    for (let pc = 0; pc < 12; pc++) if (mask & (1 << pc)) count++
    if (count === 1) return 0
    if (count === 2) {
      let a = -1
      let d = 0
      for (let pc = 0; pc < 12; pc++) if (mask & (1 << pc)) a < 0 ? (a = pc) : (d = pc - a)
      if (d !== 3 && d !== 4 && d !== 5 && d !== 7 && d !== 8 && d !== 9) return -1
    }
    if (count > 2) {
      // a dominant seventh isn't in the chain: the triad as ever, its seventh apart (diagrams 09, 19), a ninth pure.
      // Without its fifth it is part of the chain, unless the seventh is what the mode is for
      const natural = this.mode === 'septimal'
      for (let r = 0; r < 12; r++) {
        const shell = bit(r) | bit(r + 4) | bit(r + 10) | (natural ? 0 : bit(r + 7))
        if ((mask & shell) !== shell || mask & ~(shell | bit(r + 7) | bit(r + 2))) continue
        pos[r] = TRIAD_ROOT
        pos[(r + 4) % 12] = TRIAD_ROOT + THIRD
        pos[(r + 7) % 12] = mask & bit(r + 7) ? TRIAD_ROOT + FIFTH : 0
        pos[(r + 10) % 12] = TRIAD_ROOT + (natural ? NATURAL_SEVENTH : TEMPERED_SEVENTH)
        pos[(r + 2) % 12] = mask & bit(r + 2) ? TRIAD_ROOT + NINTH : 0
        return natural ? bit(r + 10) : 0
      }
    }
    // part of the chain: pure against each other, centred on equal temperament. Some notes read two ways (D is a
    // comma apart as C's ninth or as B flat's third): the reading that moves what is heard least
    const cand = this.scratch
    let best = Infinity
    for (let r = 0; r < 12; r++) {
      if (mask & ~CHAIN_MASKS[r]) continue
      let mean = 0
      cand.fill(0)
      for (let i = 0; i < 6; i++) {
        const pc = (r + CHAIN_SEMIS[i]) % 12
        if (mask & (1 << pc)) {
          cand[pc] = CHAIN_CENTS[i]
          mean += CHAIN_CENTS[i] / count
        }
      }
      let cost = 0
      for (let pc = 0; pc < 12; pc++) {
        if (!(mask & (1 << pc))) continue
        cand[pc] -= mean
        if (this.heard & (1 << pc)) cost = Math.max(cost, Math.abs(cand[pc] + this.line - this.tuned[pc]))
      }
      if (cost < best - 1e-9) {
        best = cost
        pos.set(cand)
      }
    }
    return best < Infinity ? 0 : -1
  }

  /** TONAL: the note with the most tuning over the last chords is the centre; the clearer, the more it shows. */
  private blendBasis(mask: number, pos: Float64Array, now: number) {
    if (mask & (mask - 1)) {
      // notes of one chord arriving a few at a time are one chord
      if (!this.ringCount || now - this.ringAt >= HEARD) {
        this.ringNext = (this.ringNext + 1) % CHORDS_REMEMBERED
        this.ringCount = Math.min(CHORDS_REMEMBERED, this.ringCount + 1)
      }
      this.ringAt = now
      this.ring.set(pos, this.ringNext * 12)
    }
    let top = 0
    for (let pc = 0; pc < 12; pc++) {
      let sum = 0
      for (let c = 0; c < this.ringCount; c++) sum += this.ring[((this.ringNext + CHORDS_REMEMBERED - c) % CHORDS_REMEMBERED) * 12 + pc]
      if (sum > top || (sum === top && pc === this.centre)) {
        top = sum
        this.centre = pc
      }
    }
    if (this.centre < 0) return
    const weight = top < 5 ? 0 : top < 15 ? 0.1 : top < 30 ? 0.2 : 0.3
    for (let pc = 0; pc < 12; pc++) {
      if (mask & (1 << pc)) pos[pc] = (1 - weight) * pos[pc] + weight * BASIS[(pc - this.centre + 12) % 12]
    }
  }

  /** The line for a chord at `pos`: as near equal temperament as keeps every heard note within a step. */
  private solveLine(pos: Float64Array, heard: number) {
    // lo..hi: the lines that would leave each heard note exactly where it is
    let lo = Infinity
    let hi = -Infinity
    for (let pc = 0; pc < 12; pc++) {
      if (!(heard & (1 << pc))) continue
      const stay = this.tuned[pc] - pos[pc]
      lo = Math.min(lo, stay)
      hi = Math.max(hi, stay)
    }
    if (lo > hi) return toward(this.line, 0, LINE_RETURN)
    const from = hi - STEP
    const to = lo + STEP
    // they pull apart: split the step between them (diagram 16)
    if (from > to) return clamp((lo + hi) / 2, -LINE_LIMIT, LINE_LIMIT)
    let line = clamp(0, from, to)
    // the further out the line, the bigger the step it allows, so it never runs away (diagram 14)
    if (line < -STEP_GROWS) line = -(STEP_GROWS * STEP_GROWTH - lo - STEP) / (1 + STEP_GROWTH)
    else if (line > STEP_GROWS) line = (hi - STEP + STEP_GROWS * STEP_GROWTH) / (1 + STEP_GROWTH)
    // and it comes back a little at a time (diagram 12)
    const back = toward(this.line, 0, LINE_RETURN)
    if (Math.abs(back) > Math.abs(line)) line = clamp(back, from, to)
    return clamp(line, -LINE_LIMIT, LINE_LIMIT)
  }
}
