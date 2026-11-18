/**
 * The COCKPIT's controls, as numbers: every axis of every VCO's PLAY pads (pads.ts) as a control of its own -- a
 * knob, a lever, a crank, a cable in a jack -- 15 per VCO, and the garden's STEPS and HITS. A control reads its pad's
 * point (so one an LFO moves turns by itself) and writes it, the other axis kept, exactly as the pad would.
 *
 * Some axes step: LFO RATE (tempo divisions), ECHO TIME (drawn to the tempo's divisions: the cockpit plugs it into
 * them), GRAIN SIZE under SYNC. Their controls have detents (`stops`). Pure, apart from the PadControl it's handed.
 */
import { echoDivisions, GRAIN_SYNC_BANDS, LFO_BANDS, SYNC_TOP } from '../../play/pads'
import type { PadId } from '../../play/padControl'

export type Axis = 'x' | 'y'
export type ParamId =
  | 'pos' | 'vol' | 'length' | 'size' | 'depth' | 'rate' | 'filter' | 'reverb' | 'pitchX' | 'pitchY'
  | 'spray' | 'detune' | 'time' | 'feedback' | 'tilt' | 'mids' | 'steps' | 'hits'

export interface ParamDef {
  id: ParamId
  /** the pad, or the garden's ring */
  pad: PadId | 'garden'
  axis: Axis
  /** the short name a panel prints */
  label: string
  /** a longer one, for the help line */
  help: string
  /** centre-detented (filter, tilt, mids: neutral in the middle) */
  bipolar?: boolean
}

export const PARAMS: ParamDef[] = [
  { id: 'pos', pad: 'perform', axis: 'x', label: 'POS', help: 'where in the clip the grains fire (a wavetable: which wave)' },
  { id: 'vol', pad: 'perform', axis: 'y', label: 'VOL', help: 'the VCO\'s volume' },
  { id: 'length', pad: 'grain', axis: 'x', label: 'LENGTH', help: 'how much of each grain\'s turn it sounds' },
  { id: 'size', pad: 'grain', axis: 'y', label: 'GRAIN', help: 'grain size: small and fast at the top, long and slow at the bottom (SYNC: tempo divisions)' },
  { id: 'depth', pad: 'lfo', axis: 'x', label: 'SWEEP', help: 'how far the LFO sweeps where the grains fire' },
  { id: 'rate', pad: 'lfo', axis: 'y', label: 'RATE', help: 'how fast it sweeps: tempo divisions' },
  { id: 'filter', pad: 'fx', axis: 'x', label: 'FILTER', help: 'low-pass closing to the left, open in the middle, high-pass opening to the right', bipolar: true },
  { id: 'reverb', pad: 'fx', axis: 'y', label: 'REVERB', help: 'reverb' },
  { id: 'pitchX', pad: 'pitch', axis: 'x', label: 'COARSE', help: 'pitch: fine in the middle, coarse at the sides (×2, stopped, backwards); far right brings the ring mod' },
  { id: 'pitchY', pad: 'pitch', axis: 'y', label: 'PITCH', help: 'pitch up / down (the ring\'s carrier, at the far right)' },
  { id: 'spray', pad: 'texture', axis: 'x', label: 'SPRAY', help: 'how far each grain scatters in the clip' },
  { id: 'detune', pad: 'texture', axis: 'y', label: 'DETUNE', help: 'the grains split lower and higher: a shimmer' },
  { id: 'time', pad: 'echo', axis: 'x', label: 'ECHO', help: 'echo time: plugged into the tempo\'s divisions' },
  { id: 'feedback', pad: 'echo', axis: 'y', label: 'REPEATS', help: 'echo feedback: how many repeats' },
  { id: 'tilt', pad: 'tone', axis: 'x', label: 'TONE', help: 'darker (bass up, treble down) .. brighter', bipolar: true },
  { id: 'mids', pad: 'tone', axis: 'y', label: 'MIDS', help: 'the mids scooped .. pushed', bipolar: true },
  { id: 'steps', pad: 'garden', axis: 'x', label: 'STEPS', help: 'the garden\'s picked ring: its steps (1 to 32)' },
  { id: 'hits', pad: 'garden', axis: 'y', label: 'HITS', help: 'the garden\'s picked ring: its hits' },
]
export const paramOf = (id: ParamId) => PARAMS.find((p) => p.id === id)!

/** a detent: where (0..1) and what it reads */
export interface Stop {
  at: number
  label: string
}
const beatsLabel = (b: number) => (b >= 1 ? `${b} BEAT${b > 1 ? 'S' : ''}` : `1/${Math.round(1 / b)}`)

/**
 * The detents a stepped control snaps to (null: it's smooth): LFO RATE's divisions (band centres), ECHO TIME's
 * tempo divisions on the pad, GRAIN under SYNC (its bands, then the free top).
 */
export function stopsOf(id: ParamId, o: { bpm: number; grainSync: boolean }): Stop[] | null {
  if (id === 'rate') return LFO_BANDS.map((b, i) => ({ at: (i + 0.5) / LFO_BANDS.length, label: b }))
  if (id === 'time') return echoDivisions(o.bpm).map((d) => ({ at: d.x, label: d.id }))
  if (id === 'size' && o.grainSync)
    return [
      ...GRAIN_SYNC_BANDS.map((b, i) => ({ at: ((i + 0.5) / GRAIN_SYNC_BANDS.length) * SYNC_TOP, label: beatsLabel(b) })),
      { at: SYNC_TOP + (1 - SYNC_TOP) / 2, label: 'FREE' },
    ]
  return null
}
/** the detent nearest `v` */
export const nearestStop = (stops: Stop[], v: number) => stops.reduce((a, b) => (Math.abs(b.at - v) < Math.abs(a.at - v) ? b : a))

/** a pad's point read and written: the pads (VoyageView's controls, LFO-aware) and the garden's ring */
export interface PointIO {
  read: (pad: PadId | 'garden') => { x: number; y: number }
  move: (pad: PadId | 'garden', p: { x: number; y: number }) => void
  end: (pad: PadId | 'garden') => void
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v))
export const readParam = (io: PointIO, d: ParamDef) => io.read(d.pad)[d.axis]
/** a control moved to `v` (0..1): its pad's point, this axis set and the other kept */
export function writeParam(io: PointIO, d: ParamDef, v: number) {
  const p = { ...io.read(d.pad) }
  p[d.axis] = clamp01(v)
  io.move(d.pad, p)
}
