/** Anything with channel data — AudioBuffer, or a stub in tests. */
export interface ChannelSource {
  numberOfChannels: number
  length: number
  getChannelData(ch: number): Float32Array
}

/** Reduce audio to `buckets` [min, max] pairs across all channels (interleaved). */
export function computePeaks(buf: ChannelSource, buckets = 360): Float32Array {
  const out = new Float32Array(buckets * 2)
  const per = Math.max(1, Math.floor(buf.length / buckets))
  const channels = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c))
  for (let b = 0; b < buckets; b++) {
    let lo = 0
    let hi = 0
    const start = b * per
    const end = Math.min(buf.length, start + per)
    for (const data of channels) {
      for (let i = start; i < end; i++) {
        const v = data[i]
        if (v < lo) lo = v
        if (v > hi) hi = v
      }
    }
    out[b * 2] = lo
    out[b * 2 + 1] = hi
  }
  return out
}
