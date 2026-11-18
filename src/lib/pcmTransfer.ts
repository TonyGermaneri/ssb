/**
 * Moving decoded audio between the page and the native engine without holding the main thread: the browser's own
 * encoders do the base64 (FileReader, off the JS thread), samples travel in chunks small enough that no one call
 * stalls the host's message thread, and the way back is binary (a fetch of the editor's resource route), not
 * base64 at all.
 */

/** base64 of a blob, by the browser (no JS loop over the bytes) */
export function blobBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const s = r.result as string
      resolve(s.slice(s.indexOf(',') + 1))
    }
    r.onerror = () => reject(r.error)
    r.readAsDataURL(blob)
  })
}

/** a buffer's first `channels` channels end to end, as float32 bytes (the engine's planar layout) */
export function planarBlob(buffer: AudioBuffer, channels = Math.min(2, buffer.numberOfChannels)): Blob {
  const parts: Float32Array[] = []
  for (let c = 0; c < channels; c++) parts.push(buffer.getChannelData(c))
  return new Blob(parts as BlobPart[])
}

/** bytes a chunk carries: about 700 kB of base64, a few ms for the host to take in */
export const CHUNK_BYTES = 512 * 1024

/**
 * A buffer to the engine in chunks (ssbAudioBegin / Chunk / End); each chunk's base64 is made by the browser and
 * decoded on the engine's worker threads.
 */
export async function sendPcm(call: (fn: string, ...args: unknown[]) => Promise<unknown>, audioId: string, buffer: AudioBuffer) {
  const channels = Math.min(2, buffer.numberOfChannels)
  const blob = planarBlob(buffer, channels)
  if (!(await call('ssbAudioBegin', audioId, buffer.sampleRate, channels, buffer.length))) throw new Error('engine refused the sample')
  for (let at = 0; at < blob.size; at += CHUNK_BYTES) {
    const b64 = await blobBase64(blob.slice(at, Math.min(blob.size, at + CHUNK_BYTES)))
    if (!(await call('ssbAudioChunk', audioId, at, b64))) throw new Error('engine dropped a chunk')
  }
  if (!(await call('ssbAudioEnd', audioId))) throw new Error('engine could not finish the sample')
}

/** A cached sample from the editor's resource route: { rate, channels: planar float32 } or null. */
export async function fetchPcm(audioId: string): Promise<{ rate: number; channels: Float32Array[] } | null> {
  const r = await fetch(`ssb-audio/${encodeURIComponent(audioId)}`)
  if (!r.ok) return null
  const bytes = await r.arrayBuffer()
  if (bytes.byteLength < 16) return null
  const v = new DataView(bytes)
  const rate = v.getFloat64(0, true)
  const n = v.getInt32(8, true)
  const frames = v.getInt32(12, true)
  if (n < 1 || n > 2 || frames <= 0 || bytes.byteLength < 16 + n * frames * 4) return null
  return { rate, channels: Array.from({ length: n }, (_, c) => new Float32Array(bytes, 16 + c * frames * 4, frames)) }
}
