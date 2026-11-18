/**
 * A small pool of analysis workers (workers/analysis.worker.ts): peaks and timbres computed off the main thread, on
 * copies (transferred, so the copy is the only cost here), in parallel across cores. Where there are no workers (the
 * tests, an odd web view) the same functions run here instead.
 */
import { computePeaks, type ChannelSource } from '../audio/peaks'
import { timbreOfWindows, timbreWindows } from './semantic/timbre'
import type { AnalysisJob, AnalysisResult } from '../workers/analysis.worker'
import { makeClip, type ClipOut } from './ai/audio'
import { sketchClip } from './garden/sketch'

type Job = AnalysisJob extends infer J ? (J extends { id: number } ? Omit<J, 'id'> : never) : never

let pool: Worker[] | null = null
let broken = false
let next = 0
let seq = 1
const waiting = new Map<number, { resolve: (v: never) => void; reject: (e: Error) => void }>()

function workers(): Worker[] | null {
  if (broken || typeof Worker === 'undefined') return null
  if (!pool) {
    try {
      const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 4) - 1))
      pool = Array.from({ length: n }, () => {
        const w = new Worker(new URL('../workers/analysis.worker.ts', import.meta.url), { type: 'module' })
        w.onmessage = (e: MessageEvent<AnalysisResult>) => {
          const r = e.data
          const p = waiting.get(r.id)
          if (!p) return
          waiting.delete(r.id)
          if ('error' in r) p.reject(new Error(r.error))
          else p.resolve(r.out as never)
        }
        w.onerror = () => {
          // a worker that can't start: everything from here runs on the main thread
          broken = true
          for (const [, p] of waiting) p.reject(new Error('analysis worker failed'))
          waiting.clear()
        }
        return w
      })
    } catch {
      broken = true
      return null
    }
  }
  return pool
}

function run<T = Float32Array>(job: Job, transfer: Transferable[]): Promise<T> | null {
  const ws = workers()
  if (!ws) return null
  const id = seq++
  return new Promise<T>((resolve, reject) => {
    waiting.set(id, { resolve: resolve as (v: never) => void, reject })
    ws[next++ % ws.length].postMessage({ ...job, id }, transfer)
  })
}

/** A buffer's waveform peaks (computePeaks), in a worker. */
export async function peaksAsync(buf: ChannelSource, buckets = 360): Promise<Float32Array> {
  const channels = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c).slice())
  const p = run({ op: 'peaks', channels, length: buf.length, buckets }, channels.map((c) => c.buffer))
  if (p) {
    try {
      return await p
    } catch {
      /* fall through */
    }
  }
  return computePeaks(buf, buckets)
}

/** A sample's timbre (sampleTimbre): the three windows copied here, their FFTs in a worker. */
export async function timbreAsync(data: Float32Array, rate: number, from?: number, to?: number): Promise<Float32Array> {
  const windows = timbreWindows(data, rate, from, to)
  const p = run({ op: 'timbre', windows: windows.map((w) => w.slice()), rate }, [])
  if (p) {
    try {
      return await p
    } catch {
      /* fall through */
    }
  }
  return timbreOfWindows(windows, rate)
}

/**
 * A sound model's WAV made into a sample (makeClip: read, trimmed, faded, normalised, its pitch found), in a worker:
 * pitch-finding alone is hundreds of ms of a clip, which here would stall every frame. `wav` is handed over (detached).
 */
export async function clipAsync(wav: ArrayBuffer, maxSeconds: number, keepChannels = true): Promise<ClipOut> {
  const copy = wav.slice(0)
  const p = run<ClipOut>({ op: 'clip', wav, maxSeconds, keepChannels }, [wav])
  if (p) {
    try {
      return await p
    } catch {
      /* fall through */
    }
  }
  return makeClip(copy, maxSeconds, keepChannels)
}

/** The garden's SKETCH clip for a caption (garden/sketch.ts), synthesised in a worker. */
export async function sketchAsync(prompt: string, seconds: number, rate = 44100): Promise<Float32Array[]> {
  const p = run<Float32Array[]>({ op: 'sketch', prompt, seconds, rate }, [])
  if (p) {
    try {
      return await p
    } catch {
      /* fall through */
    }
  }
  return sketchClip(prompt, seconds, rate)
}
