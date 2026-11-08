/**
 * A power-of-two FFT for the waveform's live views (BARS, SPECTRO): a Hann-windowed block of samples in, each bin's
 * level in dB out (0 dB = a full-scale sine).
 */
export class Spectrum {
  readonly size: number
  /** dB per bin, size / 2 of them; bin k is k × rate / size Hz */
  readonly db: Float32Array
  private re: Float32Array
  private im: Float32Array
  private window: Float32Array
  private rev: Uint32Array
  private cos: Float32Array
  private sin: Float32Array

  constructor(size: number) {
    if (size & (size - 1)) throw new Error('FFT size must be a power of two')
    this.size = size
    this.db = new Float32Array(size / 2).fill(-120)
    this.re = new Float32Array(size)
    this.im = new Float32Array(size)
    this.window = new Float32Array(size)
    for (let i = 0; i < size; i++) this.window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size)
    this.rev = new Uint32Array(size)
    const bits = Math.log2(size)
    for (let i = 0; i < size; i++) {
      let r = 0
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b)
      this.rev[i] = r
    }
    this.cos = new Float32Array(size / 2)
    this.sin = new Float32Array(size / 2)
    for (let i = 0; i < size / 2; i++) {
      this.cos[i] = Math.cos((2 * Math.PI * i) / size)
      this.sin[i] = -Math.sin((2 * Math.PI * i) / size)
    }
  }

  /** the spectrum of the last `size` samples of `x` (fewer: zero-padded at the front) */
  run(x: Float32Array) {
    const n = this.size
    const { re, im, rev, window } = this
    const off = x.length - n
    for (let i = 0; i < n; i++) {
      const j = off + i
      re[rev[i]] = j >= 0 ? x[j] * window[i] : 0
      im[rev[i]] = 0
    }
    for (let len = 2; len <= n; len <<= 1) {
      const half = len >> 1
      const step = n / len
      for (let i = 0; i < n; i += len) {
        for (let k = 0; k < half; k++) {
          const c = this.cos[k * step]
          const s = this.sin[k * step]
          const a = i + k
          const b = a + half
          const tr = re[b] * c - im[b] * s
          const ti = re[b] * s + im[b] * c
          re[b] = re[a] - tr
          im[b] = im[a] - ti
          re[a] += tr
          im[a] += ti
        }
      }
    }
    // a full-scale sine peaks at n / 4 through a Hann window
    const ref = n / 4
    for (let k = 0; k < n / 2; k++) {
      const mag = Math.hypot(re[k], im[k]) / ref
      this.db[k] = mag > 1e-6 ? 20 * Math.log10(mag) : -120
    }
  }

  /** the loudest bin between two frequencies (dB), for a band or a pixel row */
  peak(fromHz: number, toHz: number, rate: number): number {
    const per = this.size / rate
    const a = Math.max(1, Math.floor(fromHz * per))
    const b = Math.min(this.db.length - 1, Math.max(a, Math.ceil(toHz * per)))
    let best = -120
    for (let k = a; k <= b; k++) if (this.db[k] > best) best = this.db[k]
    return best
  }
}
