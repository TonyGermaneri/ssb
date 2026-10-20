/**
 * What a sound sounds like, as numbers: its spectrum pooled into bands, in dB of its whole (floored at -60), the
 * average taken out and normalised, so two sounds' similarity is the dot product of their spectral shapes. A single
 * cycle (an AKWF wave) is read as its harmonics at C2, where it plays at its root; a sample from a few windows across
 * its clip. The bands are harmonics of C2: 1, 2, 3, 4, then wider groups to ~16 kHz, so every band of a cycle holds a
 * harmonic (log-spaced bands from 40 Hz would leave most of a low cycle's empty, and the empty ones alike in all).
 */
/** C2: an AKWF cycle's pitch at its root */
const CYCLE_HZ = 65.406
const EDGES = [0.5, 1.5, 2.5, 3.5, 4.5, 6.5, 8.5, 11.5, 16.5, 22.5, 32.5, 45.5, 64.5, 90.5, 128.5, 181.5, 245].map((h) => h * CYCLE_HZ)
export const BANDS = EDGES.length - 1
const FLOOR_DB = -60

/** in-place radix-2 FFT (re / im, length a power of two) */
function fft(re: Float32Array, im: Float32Array) {
  const n = re.length
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1
    for (; j & bit; bit >>= 1) j ^= bit
    j ^= bit
    if (i < j) {
      ;[re[i], re[j]] = [re[j], re[i]]
      ;[im[i], im[j]] = [im[j], im[i]]
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len
    const wr = Math.cos(ang)
    const wi = Math.sin(ang)
    for (let i = 0; i < n; i += len) {
      let cr = 1
      let ci = 0
      for (let k = 0; k < len / 2; k++) {
        const a = i + k
        const b = a + len / 2
        const tr = re[b] * cr - im[b] * ci
        const ti = re[b] * ci + im[b] * cr
        re[b] = re[a] - tr
        im[b] = im[a] - ti
        re[a] += tr
        im[a] += ti
        const nr = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = nr
      }
    }
  }
}

/** the band a frequency falls in (-1: outside them all); below the first edge counts as the first */
function bandOf(hz: number): number {
  if (hz >= EDGES[BANDS]) return -1
  let b = 0
  while (b < BANDS - 1 && hz >= EDGES[b + 1]) b++
  return b
}

/** pooled power → dB, level removed, unit length (zeros for silence) */
function finish(power: Float32Array): Float32Array {
  const out = new Float32Array(BANDS)
  let total = 0
  for (let b = 0; b < BANDS; b++) total += power[b]
  if (total < 1e-12) return out
  let mean = 0
  for (let b = 0; b < BANDS; b++) mean += (out[b] = Math.max(FLOOR_DB, 10 * Math.log10(power[b] / total + 1e-12))) / BANDS
  let n = 0
  for (let b = 0; b < BANDS; b++) {
    out[b] -= mean
    n += out[b] * out[b]
  }
  n = Math.sqrt(n) || 1
  for (let b = 0; b < BANDS; b++) out[b] /= n
  return out
}

/** one period of a wave (any length): its harmonics, at C2 */
export function cycleTimbre(cycle: Float32Array): Float32Array {
  const N = 512
  const re = new Float32Array(N)
  const im = new Float32Array(N)
  // resampled to 512 points, so FFT bin k is harmonic k exactly
  for (let i = 0; i < N; i++) {
    const x = (i / N) * cycle.length
    const j = Math.floor(x)
    const f = x - j
    re[i] = cycle[j % cycle.length] * (1 - f) + cycle[(j + 1) % cycle.length] * f
  }
  fft(re, im)
  const power = new Float32Array(BANDS)
  for (let k = 1; k < N / 2; k++) {
    const b = bandOf(k * CYCLE_HZ)
    if (b >= 0 && b < BANDS) power[b] += re[k] * re[k] + im[k] * im[k]
  }
  return finish(power)
}

/** a sample's channel between two points (seconds): three Hann-windowed FFTs across it, pooled */
export function sampleTimbre(data: Float32Array, rate: number, from = 0, to = data.length / rate): Float32Array {
  const N = 4096
  const a = Math.max(0, Math.floor(from * rate))
  const z = Math.min(data.length, Math.ceil(to * rate))
  const power = new Float32Array(BANDS)
  const re = new Float32Array(N)
  const im = new Float32Array(N)
  for (const at of [0.2, 0.5, 0.8]) {
    const start = Math.max(a, Math.min(z - N, Math.floor(a + (z - a) * at - N / 2)))
    re.fill(0)
    im.fill(0)
    for (let i = 0; i < N; i++) {
      const v = data[start + i] ?? 0
      re[i] = v * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)))
    }
    fft(re, im)
    for (let k = 1; k < N / 2; k++) {
      const b = bandOf((k * rate) / N)
      if (b >= 0 && b < BANDS) power[b] += re[k] * re[k] + im[k] * im[k]
    }
  }
  return finish(power)
}
