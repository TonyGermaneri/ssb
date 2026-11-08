/**
 * The AI agent's ears: a rendered note (board.renderOffline) turned into numbers and pictures a model can read.
 *
 * - measure(): levels, pitch, spectrum shape, envelope times, stereo -- pure, so it runs (and is tested) anywhere;
 * - analyse(): measure() plus two PNGs drawn for a vision model rather than for looks: a waveform (the whole note's
 *   envelope, and a zoom on three periods of its steady part) and a spectrogram (log frequency, labelled axes, a dB
 *   legend), both with the note-off marked.
 */
import { Spectrum } from '../fft'

export interface Render {
  /** left, right (or one channel) */
  channels: Float32Array[]
  sampleRate: number
  /** seconds: when the note was let go */
  noteOffAt?: number
}

export interface Harmonic {
  hz: number
  /** relative to the loudest peak */
  db: number
}

export interface Metrics {
  seconds: number
  sampleRate: number
  noteOffAt: number | null
  /** nothing above -90 dBFS */
  silent: boolean
  peakDb: number
  /** RMS while the note is held (after its attack), and after the note-off */
  rmsHeldDb: number
  rmsTailDb: number | null
  /** the note's fundamental, from the held part (null: no clear pitch -- noise, a chord, silence) */
  fundamentalHz: number | null
  noteName: string | null
  /** how far the fundamental is from that note, cents */
  centsOff: number | null
  /** how clearly periodic the held part is, 0..1 (1 = a pure tone) */
  periodicity: number
  /** spectral centroid of the held part (brightness) */
  centroidHz: number
  /** below this frequency lies 85 % of the held part's power */
  rolloffHz: number
  /** spectral flatness of the held part, 0..1 (0 tonal, 1 white noise) */
  flatness: number
  /** the strongest spectral peaks of the held part, loudest first */
  peaks: Harmonic[]
  /** 10 % to 90 % of the envelope's peak */
  attackMs: number
  /** from the start to the envelope's peak */
  timeToPeakMs: number
  /** from the peak down to (near) the sustain level; null when it holds at its peak */
  decayMs: number | null
  /** the held level near the note-off, relative to the peak */
  sustainDb: number
  /** after the note-off, until 40 dB below its level there; null if the tail is cut short (see tailDropDb) */
  releaseMs: number | null
  /** how far the level fell between the note-off and the end */
  tailDropDb: number | null
  /** the level over the last 20 ms, dBFS (-120: silent) */
  endDb: number
  /** -1..1: 1 mono, 0 unrelated, -1 out of phase */
  stereoCorrelation: number
  /** side / mid level, dB (very negative: mono) */
  sideDb: number
  dcOffset: number
  /** samples at or past full scale */
  clipped: number
}

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
export function noteOf(hz: number): { name: string; cents: number; midi: number } {
  const m = 69 + 12 * Math.log2(hz / 440)
  const midi = Math.round(m)
  return { name: `${NOTE_NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`, cents: Math.round((m - midi) * 100), midi }
}

const db = (x: number) => (x > 1e-10 ? 20 * Math.log10(x) : -200)
const round = (x: number, d = 1) => Math.round(x * 10 ** d) / 10 ** d

/** the mid signal (mean of the channels) */
function mid(r: Render): Float32Array {
  const [l, rr] = r.channels
  if (!rr) return l
  const out = new Float32Array(l.length)
  for (let i = 0; i < l.length; i++) out[i] = 0.5 * (l[i] + rr[i])
  return out
}

function rms(x: Float32Array, a: number, b: number): number {
  a = Math.max(0, Math.floor(a))
  b = Math.min(x.length, Math.floor(b))
  if (b <= a) return 0
  let s = 0
  for (let i = a; i < b; i++) s += x[i] * x[i]
  return Math.sqrt(s / (b - a))
}

/** RMS envelope in `hop`-second windows */
export function envelope(x: Float32Array, rate: number, hop = 0.005): Float32Array {
  const n = Math.max(1, Math.round(hop * rate))
  const out = new Float32Array(Math.ceil(x.length / n))
  for (let k = 0; k < out.length; k++) out[k] = rms(x, k * n, (k + 1) * n)
  return out
}

/**
 * YIN on a stretch of the signal: the fundamental and how periodic it is (1 - the dip's depth). Searches 25 Hz to
 * 4 kHz; parabolic interpolation around the dip.
 */
export function pitch(x: Float32Array, rate: number, a: number, b: number): { hz: number | null; periodicity: number } {
  const maxLag = Math.min(Math.floor(rate / 25), Math.floor((b - a) / 2))
  const minLag = Math.max(2, Math.floor(rate / 4000))
  const w = Math.min(Math.floor(rate * 0.06), b - a - maxLag)
  if (w < 64 || maxLag <= minLag) return { hz: null, periodicity: 0 }
  const d = new Float32Array(maxLag + 2)
  let run = 0
  const cmnd = new Float32Array(maxLag + 2)
  cmnd[0] = 1
  for (let lag = 1; lag <= maxLag + 1; lag++) {
    let s = 0
    for (let i = 0; i < w; i++) {
      const e = x[a + i] - x[a + i + lag]
      s += e * e
    }
    d[lag] = s
    run += s
    cmnd[lag] = run > 0 ? (s * lag) / run : 1
  }
  let best = -1
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (cmnd[lag] < 0.12) {
      while (lag + 1 <= maxLag && cmnd[lag + 1] < cmnd[lag]) lag++
      best = lag
      break
    }
  }
  if (best < 0) {
    let v = 1
    for (let lag = minLag; lag <= maxLag; lag++) if (cmnd[lag] < v) (v = cmnd[lag]), (best = lag)
    if (v > 0.35) return { hz: null, periodicity: Math.max(0, 1 - v) }
  }
  const y0 = cmnd[best - 1]
  const y1 = cmnd[best]
  const y2 = cmnd[best + 1]
  const den = y0 - 2 * y1 + y2
  const shift = den !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / den)) : 0
  return { hz: rate / (best + shift), periodicity: Math.max(0, Math.min(1, 1 - y1)) }
}

/** the held part's average power spectrum (linear power per bin), FFT `size` */
function averageSpectrum(x: Float32Array, a: number, b: number, size: number): Float64Array {
  const sp = new Spectrum(size)
  const power = new Float64Array(size / 2)
  const frame = new Float32Array(size)
  let frames = 0
  for (let start = Math.max(0, a); start + size <= Math.max(b, a + size) && start + size <= x.length; start += size / 2) {
    frame.set(x.subarray(start, start + size))
    sp.run(frame)
    for (let k = 0; k < power.length; k++) power[k] += 10 ** (sp.db[k] / 10)
    frames++
    if (frames >= 64) break
  }
  if (frames) for (let k = 0; k < power.length; k++) power[k] /= frames
  return power
}

/** The numbers: see Metrics. */
export function measure(r: Render): Metrics {
  const rate = r.sampleRate
  const x = mid(r)
  const n = x.length
  const seconds = n / rate
  const off = r.noteOffAt !== undefined && r.noteOffAt < seconds ? r.noteOffAt : null
  const offIdx = off !== null ? Math.round(off * rate) : n
  let peak = 0
  let clipped = 0
  let dc = 0
  for (const ch of r.channels)
    for (let i = 0; i < ch.length; i++) {
      const v = Math.abs(ch[i])
      if (v > peak) peak = v
      if (v >= 0.999) clipped++
    }
  for (let i = 0; i < n; i++) dc += x[i]
  dc /= Math.max(1, n)

  // envelope: attack, peak, decay, sustain, release
  const hop = 0.005
  const env = envelope(x, rate, hop)
  const offK = Math.min(env.length, Math.round(offIdx / rate / hop))
  let ePeak = 0
  let kPeak = 0
  for (let k = 0; k < Math.max(1, offK); k++) if (env[k] > ePeak) (ePeak = env[k]), (kPeak = k)
  const silent = peak < 10 ** (-90 / 20)
  const firstAbove = (level: number, from = 0, to = env.length) => {
    for (let k = from; k < to; k++) if (env[k] >= level) return k
    return -1
  }
  const k10 = firstAbove(0.1 * ePeak)
  const k90 = firstAbove(0.9 * ePeak)
  const attackMs = silent || k10 < 0 || k90 < 0 ? 0 : Math.max(0, (k90 - k10) * hop * 1000)
  const heldFrom = Math.max(0, k90 < 0 ? 0 : k90)
  // sustain: the median of the last 30 % of the held part
  const sFrom = Math.max(heldFrom, Math.floor(heldFrom + 0.7 * (offK - heldFrom)))
  const held = Array.from(env.subarray(sFrom, Math.max(sFrom + 1, offK))).sort((p, q) => p - q)
  const sustain = held[Math.floor(held.length / 2)] ?? 0
  const peakDbEnv = db(ePeak)
  const sustainDbAbs = db(sustain)
  let decayMs: number | null = null
  if (!silent && peakDbEnv - sustainDbAbs > 2) {
    const target = sustainDbAbs + 0.1 * (peakDbEnv - sustainDbAbs)
    for (let k = kPeak; k < offK; k++)
      if (db(env[k]) <= target) {
        decayMs = (k - kPeak) * hop * 1000
        break
      }
  }
  let releaseMs: number | null = null
  let tailDropDb: number | null = null
  const endDb = Math.max(-120, db(rms(x, n - Math.round(0.02 * rate), n)))
  if (off !== null && offK < env.length) {
    const at = db(Math.max(env[Math.max(0, offK - 1)], 1e-6))
    const end = db(Math.max(rms(x, n - Math.round(0.02 * rate), n), 1e-6))
    tailDropDb = round(at - end)
    for (let k = offK; k < env.length; k++)
      if (db(env[k]) <= at - 40) {
        releaseMs = (k - offK) * hop * 1000
        break
      }
  }

  // the held part, past the attack: pitch and spectrum
  const a = Math.min(offIdx - 1, Math.max(Math.round((k90 < 0 ? 0 : k90) * hop * rate), Math.round(0.03 * rate)))
  const b = offIdx
  const mPitch = silent ? { hz: null, periodicity: 0 } : pitch(x, rate, Math.max(0, Math.round(a + 0.3 * (b - a)) - Math.round(0.03 * rate)), b)
  const size = 8192
  const power = averageSpectrum(x, a, b, size)
  const binHz = rate / size
  let sp = 0
  let spf = 0
  let lgSum = 0
  let count = 0
  const lo = Math.max(1, Math.round(40 / binHz))
  const hi = Math.min(power.length - 1, Math.round((rate * 0.45) / binHz))
  for (let k = lo; k <= hi; k++) {
    sp += power[k]
    spf += power[k] * k * binHz
    lgSum += Math.log(power[k] + 1e-20)
    count++
  }
  const centroidHz = sp > 0 ? spf / sp : 0
  let acc = 0
  let rolloffHz = 0
  for (let k = lo; k <= hi; k++) {
    acc += power[k]
    if (acc >= 0.85 * sp) {
      rolloffHz = k * binHz
      break
    }
  }
  const flatness = sp > 0 && count ? Math.exp(lgSum / count) / (sp / count) : 0
  // spectral peaks: local maxima within 60 dB of the loudest, refined by a parabola
  let pMax = 0
  for (let k = lo; k <= hi; k++) pMax = Math.max(pMax, power[k])
  const found: Harmonic[] = []
  for (let k = lo + 1; k < hi; k++) {
    const p = power[k]
    if (p < pMax * 1e-6 || p < power[k - 1] || p < power[k + 1]) continue
    const y0 = 10 * Math.log10(power[k - 1] + 1e-20)
    const y1 = 10 * Math.log10(p + 1e-20)
    const y2 = 10 * Math.log10(power[k + 1] + 1e-20)
    const den = y0 - 2 * y1 + y2
    const shift = den !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (y0 - y2)) / den)) : 0
    // the parabola's top: the peak between bins (a Hann window's scalloping is up to 1.4 dB)
    found.push({ hz: (k + shift) * binHz, db: y1 - 0.25 * (y0 - y2) * shift })
  }
  found.sort((p, q) => q.db - p.db)
  const ref = found[0]?.db ?? 0
  for (const f of found) f.db -= ref
  const peaks: Harmonic[] = []
  for (const f of found) {
    if (peaks.some((p) => Math.abs(p.hz - f.hz) < Math.max(3 * binHz, f.hz * 0.03))) continue
    peaks.push({ hz: round(f.hz), db: round(f.db) })
    if (peaks.length >= 10) break
  }

  // stereo
  const [L, R] = r.channels
  let lr = 0
  let ll = 0
  let rr = 0
  let side = 0
  let midE = 0
  if (R)
    for (let i = 0; i < L.length; i++) {
      lr += L[i] * R[i]
      ll += L[i] * L[i]
      rr += R[i] * R[i]
      const s = 0.5 * (L[i] - R[i])
      side += s * s
      midE += x[i] * x[i]
    }
  const corr = R ? (ll > 0 && rr > 0 ? lr / Math.sqrt(ll * rr) : 1) : 1
  const note = mPitch.hz ? noteOf(mPitch.hz) : null
  return {
    seconds: round(seconds, 3),
    sampleRate: rate,
    noteOffAt: off,
    silent,
    peakDb: round(db(peak)),
    rmsHeldDb: round(db(rms(x, a, b))),
    rmsTailDb: off !== null ? round(db(rms(x, offIdx, n))) : null,
    fundamentalHz: mPitch.hz ? round(mPitch.hz, 2) : null,
    noteName: note?.name ?? null,
    centsOff: note?.cents ?? null,
    periodicity: round(mPitch.periodicity, 3),
    centroidHz: Math.round(centroidHz),
    rolloffHz: Math.round(rolloffHz),
    flatness: round(flatness, 4),
    peaks,
    attackMs: round(attackMs),
    timeToPeakMs: round(kPeak * hop * 1000),
    decayMs: decayMs === null ? null : round(decayMs),
    sustainDb: round(sustainDbAbs - peakDbEnv),
    releaseMs: releaseMs === null ? null : round(releaseMs),
    tailDropDb,
    endDb: round(endDb),
    stereoCorrelation: round(corr, 3),
    sideDb: R ? round(db(Math.sqrt(side / Math.max(1e-20, midE)))) : -200,
    dcOffset: round(dc, 5),
    clipped,
  }
}

/** Two renders side by side: each number's values and their difference (b - a). */
export function compareMetrics(a: Metrics, b: Metrics): Record<string, { a: number | null; b: number | null; delta: number | null }> {
  const out: Record<string, { a: number | null; b: number | null; delta: number | null }> = {}
  for (const k of Object.keys(a) as (keyof Metrics)[]) {
    const va = a[k]
    const vb = b[k]
    if ((typeof va !== 'number' && va !== null) || (typeof vb !== 'number' && vb !== null)) continue
    out[k] = { a: va, b: vb, delta: typeof va === 'number' && typeof vb === 'number' ? round(vb - va, 3) : null }
  }
  return out
}

/** A few lines a model reads faster than the JSON. */
export function describeMetrics(m: Metrics): string {
  if (m.silent) return `Silent: nothing above -90 dBFS in ${m.seconds} s.`
  const f = (v: number | null, unit: string) => (v === null ? 'n/a' : `${v}${unit}`)
  const pitchText = m.fundamentalHz ? `${m.fundamentalHz} Hz (${m.noteName} ${m.centsOff! >= 0 ? '+' : ''}${m.centsOff} c), periodicity ${m.periodicity}` : `no clear pitch (periodicity ${m.periodicity})`
  return [
    `Level: peak ${m.peakDb} dBFS, held RMS ${m.rmsHeldDb} dBFS${m.rmsTailDb !== null ? `, tail RMS ${m.rmsTailDb} dBFS` : ''}${m.clipped ? `, ${m.clipped} clipped samples` : ''}.`,
    `Pitch: ${pitchText}.`,
    `Spectrum (held): centroid ${m.centroidHz} Hz, 85% rolloff ${m.rolloffHz} Hz, flatness ${m.flatness}. Peaks: ${m.peaks.map((p) => `${Math.round(p.hz)} Hz ${p.db} dB`).join(', ')}.`,
    `Envelope: attack ${m.attackMs} ms (peak at ${m.timeToPeakMs} ms), decay ${f(m.decayMs, ' ms')}, sustain ${m.sustainDb} dB below peak, release ${f(m.releaseMs, ' ms')} to -40 dB${m.tailDropDb !== null ? (m.endDb <= -115 ? ' (silent by the end)' : ` (fell ${m.tailDropDb} dB by the end)`) : ''}.`,
    `Stereo: correlation ${m.stereoCorrelation}, side ${m.sideDb} dB re mid. DC ${m.dcOffset}.`,
  ].join('\n')
}

// ── pictures ──────────────────────────────────────────────────────────────────────

const W = 800
const H = 400
const BG = '#0b0d10'
const INK = '#ffffff'
const GRID = 'rgba(255,255,255,0.18)'
const FONT = '12px Helvetica, Arial, sans-serif'

function canvas(w = W, h = H) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  const g = c.getContext('2d')!
  g.fillStyle = BG
  g.fillRect(0, 0, w, h)
  g.font = FONT
  g.textBaseline = 'middle'
  return { c, g }
}
const png = (c: HTMLCanvasElement) => c.toDataURL('image/png').split(',')[1]

/** gridline spacing for an axis `span` long: about `want` lines */
function niceStep(span: number, want: number): number {
  const raw = span / want
  const p = 10 ** Math.floor(Math.log10(raw))
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raw) return m * p
  return 10 * p
}

function timeAxis(g: CanvasRenderingContext2D, x0: number, x1: number, yTop: number, yBot: number, seconds: number, label = true) {
  const step = niceStep(seconds, 8)
  g.strokeStyle = GRID
  g.fillStyle = INK
  g.textAlign = 'center'
  for (let t = 0; t <= seconds + 1e-9; t += step) {
    const x = x0 + (t / seconds) * (x1 - x0)
    g.beginPath()
    g.moveTo(Math.round(x) + 0.5, yTop)
    g.lineTo(Math.round(x) + 0.5, yBot)
    g.stroke()
    if (label) g.fillText(`${round(t, 2)}`, x, yBot + 10)
  }
  if (label) g.fillText('time (s)', (x0 + x1) / 2, yBot + 24)
}

function noteOffLine(g: CanvasRenderingContext2D, x: number, yTop: number, yBot: number) {
  g.save()
  g.strokeStyle = '#ffd400'
  g.setLineDash([5, 4])
  g.lineWidth = 1.5
  g.beginPath()
  g.moveTo(Math.round(x) + 0.5, yTop)
  g.lineTo(Math.round(x) + 0.5, yBot)
  g.stroke()
  g.setLineDash([])
  g.fillStyle = '#ffd400'
  g.textAlign = 'left'
  g.fillText('note off', x + 4, yTop + 9)
  g.restore()
}

/** The waveform: the whole note (L and R, min/max per pixel), and three periods of its steady part. */
export function drawWaveform(r: Render, m: Metrics, title: string): string {
  const { c, g } = canvas()
  const rate = r.sampleRate
  const [L, R] = r.channels
  const n = L.length
  const seconds = n / rate
  g.fillStyle = INK
  g.textAlign = 'left'
  g.fillText(`Waveform — ${title}`, 10, 12)

  // the whole note: amplitude scaled to its peak (left axis), its RMS envelope in dB (right axis)
  const x0 = 56
  const x1 = W - 52
  const top = 28
  const bot = 228
  const scale = [0.01, 0.02, 0.05, 0.1, 0.2, 0.25, 0.5, 1, 2].find((v) => v >= Math.max(1e-6, 10 ** (m.peakDb / 20))) ?? 2
  const yOf = (v: number) => (top + bot) / 2 - (v / scale) * ((bot - top) / 2)
  g.strokeStyle = GRID
  g.fillStyle = INK
  g.textAlign = 'right'
  for (const f of [-1, -0.5, 0, 0.5, 1]) {
    const v = f * scale
    const y = Math.round(yOf(v)) + 0.5
    g.beginPath()
    g.moveTo(x0, y)
    g.lineTo(x1, y)
    g.stroke()
    g.fillText(v === 0 ? '0' : `${v > 0 ? '+' : ''}${round(v, 3)}`, x0 - 6, y)
  }
  g.save()
  g.translate(14, (top + bot) / 2)
  g.rotate(-Math.PI / 2)
  g.textAlign = 'center'
  g.fillText('amplitude', 0, 0)
  g.restore()
  timeAxis(g, x0, x1, top, bot, seconds)
  const cols = x1 - x0
  const drawCh = (ch: Float32Array, color: string) => {
    g.fillStyle = color
    for (let px = 0; px < cols; px++) {
      const a = Math.floor((px / cols) * n)
      const b = Math.max(a + 1, Math.floor(((px + 1) / cols) * n))
      let lo = scale
      let hi = -scale
      for (let i = a; i < b; i++) {
        const v = ch[i]
        if (v < lo) lo = v
        if (v > hi) hi = v
      }
      const y1 = yOf(Math.min(scale, hi))
      const y2 = yOf(Math.max(-scale, lo))
      g.fillRect(x0 + px, y1, 1, Math.max(1, y2 - y1))
    }
  }
  const mono = !R || m.stereoCorrelation > 0.9999
  g.globalAlpha = mono ? 0.85 : 0.7
  drawCh(L, '#3cc8ff')
  if (R && !mono) drawCh(R, '#ff8a3c')
  g.globalAlpha = 1
  // the RMS envelope, dB: 0 at the top of the right axis is the plot's full scale
  const topDb = Math.ceil(db(scale) / 6) * 6
  const dbRange = 60
  const yDb = (d: number) => top + ((topDb - d) / dbRange) * (bot - top)
  g.fillStyle = '#ffe680'
  g.textAlign = 'left'
  for (let d = topDb; d >= topDb - dbRange; d -= 12) g.fillText(`${d}`, x1 + 6, yDb(d))
  g.save()
  g.translate(W - 10, (top + bot) / 2)
  g.rotate(Math.PI / 2)
  g.textAlign = 'center'
  g.fillText('RMS envelope (dBFS)', 0, 0)
  g.restore()
  const env = envelope(mid(r), rate, 0.005)
  g.strokeStyle = '#ffe680'
  g.lineWidth = 1.5
  g.beginPath()
  for (let k = 0; k < env.length; k++) {
    const px = x0 + ((k + 0.5) / env.length) * cols
    const y = Math.min(bot, Math.max(top, yDb(db(env[k]))))
    if (k === 0) g.moveTo(px, y)
    else g.lineTo(px, y)
  }
  g.stroke()
  g.lineWidth = 1
  if (m.noteOffAt !== null) noteOffLine(g, x0 + (m.noteOffAt / seconds) * cols, top, bot)
  g.textAlign = 'right'
  g.fillStyle = '#3cc8ff'
  if (mono) g.fillText(R ? 'L = R (mono)' : 'mono', x1 - 6, top + 9)
  else {
    g.fillText('L', x1 - 22, top + 9)
    g.fillStyle = '#ff8a3c'
    g.fillText('R', x1 - 6, top + 9)
  }

  // three periods of the steady part (mid), from a rising zero crossing
  const zTop = 278
  const zBot = 388
  const x = mid(r)
  const heldEnd = Math.round((m.noteOffAt ?? seconds) * rate)
  const period = m.fundamentalHz ? rate / m.fundamentalHz : 0
  const span = Math.max(32, Math.round(period ? period * 3 : 0.02 * rate))
  let at = Math.max(0, Math.round(heldEnd * 0.6) - span)
  for (let i = at; i < Math.min(heldEnd - span, at + Math.round(period || 0.01 * rate) + 2); i++)
    if (x[i - 1] < 0 && x[i] >= 0) {
      at = i
      break
    }
  let zPeak = 1e-6
  for (let i = at; i < at + span && i < n; i++) zPeak = Math.max(zPeak, Math.abs(x[i]))
  const zy = (v: number) => (zTop + zBot) / 2 - (v / zPeak) * ((zBot - zTop) / 2) * 0.92
  g.fillStyle = INK
  g.textAlign = 'left'
  const zoomMs = round((span / rate) * 1000, 2)
  g.fillText(
    period
      ? `Zoom: 3 periods of the held note at ${round(at / rate, 3)} s — ${m.fundamentalHz} Hz, period ${round((period / rate) * 1000, 2)} ms (scaled to its peak ${round(zPeak, 3)})`
      : `Zoom: ${zoomMs} ms of the held note at ${round(at / rate, 3)} s — no clear pitch (scaled to its peak ${round(zPeak, 3)})`,
    10,
    zTop - 12,
  )
  g.strokeStyle = GRID
  g.strokeRect(x0 + 0.5, zTop + 0.5, cols, zBot - zTop)
  g.beginPath()
  g.moveTo(x0, Math.round(zy(0)) + 0.5)
  g.lineTo(x1, Math.round(zy(0)) + 0.5)
  g.stroke()
  if (period) {
    for (let k = 1; k < 3; k++) {
      const px = x0 + (k / 3) * cols
      g.beginPath()
      g.moveTo(Math.round(px) + 0.5, zTop)
      g.lineTo(Math.round(px) + 0.5, zBot)
      g.stroke()
    }
  }
  g.fillStyle = INK
  g.textAlign = 'right'
  g.fillText('0 ms', x0 - 4, zBot - 6)
  g.textAlign = 'left'
  g.fillText(`${zoomMs} ms`, x1 - 48, zBot + 8)
  g.strokeStyle = '#7dff9a'
  g.lineWidth = 1.5
  g.beginPath()
  for (let px = 0; px <= cols; px++) {
    const f = at + (px / cols) * span
    const i = Math.floor(f)
    const v = (x[i] ?? 0) + ((x[i + 1] ?? 0) - (x[i] ?? 0)) * (f - i)
    if (px === 0) g.moveTo(x0 + px, zy(v))
    else g.lineTo(x0 + px, zy(v))
  }
  g.stroke()
  return png(c)
}

/** black, navy, violet, magenta, red, orange, pale yellow, white (as the live SPECTRO view) */
const HEAT: [number, number[]][] = [
  [0, [0, 0, 0]],
  [0.14, [8, 8, 52]],
  [0.32, [58, 16, 112]],
  [0.5, [140, 41, 129]],
  [0.66, [222, 73, 104]],
  [0.8, [254, 159, 109]],
  [0.93, [252, 253, 191]],
  [1, [255, 255, 255]],
]
function heat(t: number): number[] {
  t = Math.min(1, Math.max(0, t))
  let j = 0
  while (j < HEAT.length - 2 && t > HEAT[j + 1][0]) j++
  const [t0, c0] = HEAT[j]
  const [t1, c1] = HEAT[j + 1]
  const f = (t - t0) / (t1 - t0)
  return c0.map((v, k) => Math.round(v + (c1[k] - v) * f))
}

const F_LO = 30
const F_MARKS = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000]
const hzLabel = (f: number) => (f >= 1000 ? `${f / 1000}k` : `${f}`)

/** The spectrogram: log frequency 30 Hz to Nyquist, dB colour (legend at the right), time across. */
export function drawSpectrogram(r: Render, m: Metrics, title: string): string {
  const { c, g } = canvas()
  const rate = r.sampleRate
  const x = mid(r)
  const n = x.length
  const seconds = n / rate
  const x0 = 56
  const x1 = W - 84
  const top = 28
  const bot = H - 40
  const cols = x1 - x0
  const rows = bot - top
  const fHi = rate / 2
  const fOfRow = (y: number) => F_LO * (fHi / F_LO) ** (1 - y / rows)
  const rowOfF = (f: number) => rows * (1 - Math.log(f / F_LO) / Math.log(fHi / F_LO))
  g.fillStyle = INK
  g.textAlign = 'left'
  g.fillText(`Spectrogram — ${title}`, 10, 12)

  // a column per pixel: an FFT frame centred on its time
  const size = 4096
  const sp = new Spectrum(size)
  const frame = new Float32Array(size)
  const cells = new Float32Array(cols * rows)
  let maxDb = -200
  const per = size / rate
  for (let px = 0; px < cols; px++) {
    const centre = Math.round(((px + 0.5) / cols) * n)
    const start = centre - size / 2
    frame.fill(0)
    for (let i = 0; i < size; i++) {
      const j = start + i
      if (j >= 0 && j < n) frame[i] = x[j]
    }
    sp.run(frame)
    for (let y = 0; y < rows; y++) {
      const fa = fOfRow(y + 1)
      const fb = fOfRow(y)
      // a row narrower than a bin reads between bins; a wider one takes its loudest bin
      let v: number
      const ka = fa * per
      const kb = fb * per
      if (kb - ka < 1) {
        const k = (ka + kb) / 2
        const i = Math.floor(k)
        v = sp.db[i] + ((sp.db[Math.min(sp.db.length - 1, i + 1)] ?? sp.db[i]) - sp.db[i]) * (k - i)
      } else v = sp.peak(fa, fb, rate)
      cells[y * cols + px] = v
      if (v > maxDb) maxDb = v
    }
  }
  const topDb = Math.ceil(maxDb / 10) * 10
  const range = 90
  const img = g.createImageData(cols, rows)
  for (let i = 0; i < cells.length; i++) {
    const col = heat((cells[i] - (topDb - range)) / range)
    img.data[i * 4] = col[0]
    img.data[i * 4 + 1] = col[1]
    img.data[i * 4 + 2] = col[2]
    img.data[i * 4 + 3] = 255
  }
  g.putImageData(img, x0, top)

  // frequency axis
  g.strokeStyle = GRID
  g.fillStyle = INK
  g.textAlign = 'right'
  for (const f of F_MARKS) {
    if (f >= fHi) continue
    const y = top + Math.round(rowOfF(f)) + 0.5
    g.beginPath()
    g.moveTo(x0, y)
    g.lineTo(x1, y)
    g.stroke()
    g.fillText(hzLabel(f), x0 - 6, y)
  }
  g.save()
  g.translate(12, (top + bot) / 2)
  g.rotate(-Math.PI / 2)
  g.textAlign = 'center'
  g.fillText('frequency (Hz, log)', 0, 0)
  g.restore()
  timeAxis(g, x0, x1, top, bot, seconds)
  if (m.noteOffAt !== null) noteOffLine(g, x0 + (m.noteOffAt / seconds) * cols, top, bot)
  // the fundamental, if there is one
  if (m.fundamentalHz && m.fundamentalHz > F_LO && m.fundamentalHz < fHi) {
    const y = top + rowOfF(m.fundamentalHz)
    g.fillStyle = '#7dff9a'
    g.textAlign = 'left'
    g.beginPath()
    g.moveTo(x1 + 1, y)
    g.lineTo(x1 + 7, y - 4)
    g.lineTo(x1 + 7, y + 4)
    g.fill()
  }

  // dB legend
  const lx = x1 + 22
  const lw = 14
  for (let y = 0; y < rows; y++) {
    const col = heat(1 - y / rows)
    g.fillStyle = `rgb(${col[0]},${col[1]},${col[2]})`
    g.fillRect(lx, top + y, lw, 1)
  }
  g.strokeStyle = 'rgba(255,255,255,0.5)'
  g.strokeRect(lx + 0.5, top + 0.5, lw, rows)
  g.fillStyle = INK
  g.textAlign = 'left'
  for (let k = 0; k <= range; k += 15) {
    const y = top + (k / range) * rows
    g.fillText(`${topDb - k}`, lx + lw + 4, y)
  }
  g.fillText('dBFS', lx - 2, bot + 12)
  return png(c)
}

/** Numbers and pictures for one render. `title` names it in the pictures (patch, note). */
export function analyse(r: Render, title = ''): { metrics: Metrics; summary: string; images: { waveform: string; spectrogram: string } } {
  const metrics = measure(r)
  return {
    metrics,
    summary: describeMetrics(metrics),
    images: { waveform: drawWaveform(r, metrics, title), spectrogram: drawSpectrogram(r, metrics, title) },
  }
}
