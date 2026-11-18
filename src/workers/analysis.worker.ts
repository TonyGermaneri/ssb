/**
 * The analysis worker (lib/analysis.ts runs a few): the number crunching the main thread used to do as samples
 * arrived -- a waveform's peaks, a sample's timbre (three FFTs), a sound model's clip shaped and its pitch found (YIN:
 * hundreds of ms a clip), the garden's SKETCH synth -- on copies it was sent, answered by id.
 */
import { computePeaks } from '../audio/peaks'
import { makeClip, type ClipOut } from '../lib/ai/audio'
import { sketchClip } from '../lib/garden/sketch'
import { timbreOfWindows } from '../lib/semantic/timbre'

export type AnalysisJob =
  | { id: number; op: 'peaks'; channels: Float32Array[]; length: number; buckets: number }
  | { id: number; op: 'timbre'; windows: Float32Array[]; rate: number }
  | { id: number; op: 'clip'; wav: ArrayBuffer; maxSeconds: number; keepChannels: boolean }
  | { id: number; op: 'sketch'; prompt: string; seconds: number; rate: number }

export type AnalysisResult = { id: number; out: Float32Array | Float32Array[] | ClipOut } | { id: number; error: string }

self.onmessage = (e: MessageEvent<AnalysisJob>) => {
  const job = e.data
  try {
    let out: Float32Array | Float32Array[] | ClipOut
    let transfer: Transferable[]
    if (job.op === 'peaks') {
      const src = { numberOfChannels: job.channels.length, length: job.length, getChannelData: (c: number) => job.channels[c] }
      out = computePeaks(src, job.buckets)
      transfer = [out.buffer]
    } else if (job.op === 'timbre') {
      out = timbreOfWindows(job.windows, job.rate)
      transfer = [out.buffer]
    } else if (job.op === 'sketch') {
      out = sketchClip(job.prompt, job.seconds, job.rate)
      transfer = out.map((c) => c.buffer)
    } else {
      out = makeClip(job.wav, job.maxSeconds, job.keepChannels)
      // shapeClip slices: each channel owns its buffer
      transfer = out.ok ? out.channels.map((c) => c.buffer) : []
    }
    ;(self as unknown as Worker).postMessage({ id: job.id, out } satisfies AnalysisResult, transfer)
  } catch (err) {
    ;(self as unknown as Worker).postMessage({ id: job.id, error: String(err) } satisfies AnalysisResult)
  }
}
