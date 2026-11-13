/**
 * The agent's sound tools against the real thing: SoundHost (what the app and plugin run behind `ssbSound`),
 * audio.cpp's helper and the models, through `ssb-sound-bridge` (native/tests/SoundBridge.cpp) standing in for the
 * web view's bridge. A gated download with a bad token and then a good one, every catalog model in one agent
 * conversation (the agent loop with a scripted model making the calls), a cancelled generation. Downloads what
 * SSB_SOUND_DIR lacks (GBs) and needs the GPU, so it only runs when asked:
 *
 *   SSB_SOUND_LIVE=1 SSB_SOUND_BRIDGE=native/build/tests/ssb-sound-bridge_artefacts/RelWithDebInfo/ssb-sound-bridge \
 *   SSB_SOUND_HELPER=native/build/sound-helper/audiocpp_server SSB_SOUND_DIR=<scratch> HF_TOKEN=hf_… \
 *   npx vitest run src/lib/ai/sound.live.test.ts
 *
 * SSB_SOUND_OUT=<dir> also writes each clip there as a WAV, to listen to.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const env = (k: string) => process.env[k] ?? ''
const live = env('SSB_SOUND_LIVE') === '1' && !!env('SSB_SOUND_BRIDGE')

/** the bridge process: one JSON line per call each way */
class Bridge {
  private child?: ChildProcessWithoutNullStreams
  private next = 1
  private waiting = new Map<number, (r: unknown) => void>()
  calls: { op: string; reply: unknown }[] = []
  start() {
    this.child = spawn(env('SSB_SOUND_BRIDGE'), [], { env: process.env })
    this.child.stderr.on('data', () => {})
    createInterface({ input: this.child.stdout }).on('line', (line) => {
      const { id, result } = JSON.parse(line) as { id: number; result: unknown }
      this.waiting.get(id)?.(result)
      this.waiting.delete(id)
    })
  }
  call(args: { op: string }): Promise<unknown> {
    const id = this.next++
    return new Promise((resolve) => {
      this.waiting.set(id, (r) => {
        this.calls.push({ op: args.op, reply: r })
        resolve(r)
      })
      this.child!.stdin.write(JSON.stringify({ id, args }) + '\n')
    })
  }
  stop() {
    this.child?.stdin.end()
  }
}
const bridge = new Bridge()

vi.mock('../../native/bridge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../native/bridge')>()),
  inNative: () => true,
  callNative: (name: string, args: { op: string }) => (name === 'ssbSound' ? bridge.call(args) : Promise.reject(new Error(`no ${name} here`))),
}))

const { runAgent } = await import('./agent')
const { createTools } = await import('./tools')
const { soundAgentFrom } = await import('./soundTools')
const { NativeSoundHost, loadAndWait } = await import('./soundHost')
const { SOUND_MODELS } = await import('./soundModels')
const { emptyUsage } = await import('./types')
const { encodeWav } = await import('../wav')
type ChatSession = import('./types').ChatSession
type ToolCall = import('./types').ToolCall
type ToolOutput = import('./types').ToolOutput

const [MOSS, SA3_MUSIC, SA3_SFX, SAO] = SOUND_MODELS

/** the board's side of make_sound: what landed on it */
function boardStandIn() {
  const added: { channels: Float32Array[]; rate: number; o: { name: string; tags: string[]; rootNote: number } }[] = []
  return {
    added,
    board: {
      addAgentSound: async (channels: Float32Array[], rate: number, o: (typeof added)[number]['o']) => {
        added.push({ channels, rate, o })
        return { id: `snd-${added.length}`, settings: { name: o.name } }
      },
      soundRef: (id: string) => ({ ref: id }),
    },
  }
}

const peak = (x: Float32Array) => x.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
const rms = (x: Float32Array) => Math.sqrt(x.reduce((s, v) => s + v * v, 0) / Math.max(1, x.length))

/** a model that makes the calls it's given, one turn each, then says it's done */
function scriptedModel(turns: ToolCall[][], seen: ToolOutput[][]): ChatSession {
  let i = 0
  const usage = emptyUsage()
  return {
    provider: 'lmstudio',
    model: 'scripted',
    pins: [],
    addUser() {},
    addToolResults: (r) => void seen.push(r),
    save: () => ({ provider: 'lmstudio', model: 'scripted', messages: [], pins: [] }),
    async step() {
      const calls = turns[i++]
      return calls
        ? { stop: 'tool_use', text: '', thinking: '', toolCalls: calls, usage, model: 'scripted' }
        : { stop: 'end', text: 'Done: four sounds on the board.', thinking: '', toolCalls: [], usage, model: 'scripted' }
    },
  }
}

describe.skipIf(!live)('the sound models, live', () => {
  const settings = { model: SA3_SFX.id, hfToken: '' }
  const loaded: string[] = []
  const agent = soundAgentFrom(() => settings, { onLoaded: (m) => loaded.push(m.id) })
  const host = new NativeSoundHost(() => settings.hfToken)
  const out = env('SSB_SOUND_OUT')
  const keep = async (name: string, channels: Float32Array[], rate: number) => {
    if (!out) return
    mkdirSync(out, { recursive: true })
    writeFileSync(`${out}/${name}.wav`, new Uint8Array(await (await encodeWav(channels, rate)).arrayBuffer()))
  }

  beforeAll(() => bridge.start())
  afterAll(async () => {
    await host.unload().catch(() => {})
    bridge.stop()
  })

  it('the host is there, and says so', async () => {
    const st = await host.status()
    expect(st.available).toBe(true)
    expect(st.backend).toBe('metal')
  })

  it('a gated model with a bad token fails in words, and the host still answers after it (no [object Object])', async () => {
    // its small gated files gone (the big ones may stay, to save the download): the token has to fetch them
    for (const f of SAO.files.filter((f) => f.bytes < 1e8)) rmSync(`${env('SSB_SOUND_DIR')}/models/${SAO.id}/${f.path}`, { force: true })
    settings.hfToken = 'hf_not_a_real_token'
    const { board } = boardStandIn()
    const tools = createTools(board as never, { confirmDeletes: true, sound: agent })
    const load = tools.find((t) => t.name === 'load_sound_model')!
    const err = await (load.run as (i: object) => Promise<unknown>)({ model: SAO.id }).catch((e: Error) => e)
    expect(err).toBeInstanceOf(Error)
    expect((err as Error).message).toMatch(/gated/)
    expect((err as Error).message).not.toMatch(/object Object/)
    // the failure stays in the status, as news; every call after it still works
    const st = await host.status()
    expect(st.error).toMatchObject({ model: SAO.id, message: expect.stringMatching(/gated/) })
    const models = JSON.parse((await (tools.find((t) => t.name === 'sound_models')!.run as (i: object) => Promise<{ text: string }>)({})).text)
    expect(models.last_error).toMatchObject({ model: SAO.id })
    expect((await host.check([SAO]))[0].downloaded).toBe(false)
  }, 120_000)

  it('the good token downloads Stable Audio Open 1.0\'s gated files, and it loads', async () => {
    settings.hfToken = env('HF_TOKEN')
    expect(settings.hfToken).toMatch(/^hf_/)
    const seen = new Set<string>()
    const st = await loadAndWait(host, SAO, (s) => s.task && seen.add(s.task.kind))
    expect(st.loaded?.id).toBe(SAO.id)
    expect(st.error).toBeUndefined()
    expect((await host.check([SAO]))[0]).toMatchObject({ downloaded: true, missing: 0 })
  }, 30 * 60_000)

  it('an agent conversation makes a sound with every model, switching between them (and asking before a download)', async () => {
    const { board, added } = boardStandIn()
    const tools = createTools(board as never, { confirmDeletes: true, sound: agent })
    const asked: string[] = []
    const call = (id: string, name: string, input: object): ToolCall => ({ id, name, input })
    const seen: ToolOutput[][] = []
    // the agent asks before each model it has to download (here: whichever of these SSB_SOUND_DIR lacks)
    const toDownload = (await host.check([MOSS, SA3_SFX, SA3_MUSIC])).filter((c) => !c.downloaded).map((c) => c.id)
    const session = scriptedModel(
      [
        [call('1', 'sound_models', {})],
        [call('2', 'make_sound', { model: SAO.id, prompt: '120 BPM boom bap drum loop, dusty kick, crisp snare', seconds: 4, name: 'BOOM BAP LOOP', tags: 'drums, loop' })],
        [call('3', 'make_sound', { model: MOSS.id, prompt: 'a heavy wooden door creaks open slowly, then slams shut', seconds: 3, steps: 20, name: 'DOOR SLAM' })],
        [call('4', 'make_sound', { model: SA3_SFX.id, prompt: 'a laser zap, bright, short, sci-fi', seconds: 2 })],
        [call('5', 'load_sound_model', { model: SA3_MUSIC.id })],
        [call('6', 'make_sound', { prompt: 'single felt piano note, C3, soft, long decay', seconds: 3, name: 'FELT PIANO' })],
      ],
      seen,
    )
    const outcome = await runAgent(
      session,
      tools,
      { text: 'make me a boom bap kit: a loop, a door slam, a zap and a piano note' },
      { onEvent: () => {}, approve: async (_c, q) => (asked.push(q), true) },
    )
    expect(outcome.stop).toBe('end')
    const outputs = seen.flat()
    for (const o of outputs) {
      expect(o.isError, `${o.name}: ${o.text}`).toBeFalsy()
      expect(o.text).not.toMatch(/object Object/)
    }
    expect(asked).toHaveLength(toDownload.length)
    if (toDownload.includes(SA3_MUSIC.id)) expect(asked.at(-1)).toMatch(/Stable Audio 3 Small Music: that downloads 1.68 GB/)

    const listed = JSON.parse(outputs[0].text)
    expect(listed.loaded.model).toBe(SAO.id)
    const made = outputs.filter((o) => o.name === 'make_sound').map((o) => JSON.parse(o.text))
    expect(made.map((m) => m.model)).toEqual([SAO.id, MOSS.id, SA3_SFX.id, SA3_MUSIC.id])
    expect(made.map((m) => m.channels)).toEqual(['stereo', 'mono', 'stereo', 'stereo'])
    expect(made[1].loaded_model_first).toBe(true)
    expect(JSON.parse(outputs[4].text)).toMatchObject({ loaded: SA3_MUSIC.id, unloaded: SA3_SFX.id })
    expect(loaded).toEqual(expect.arrayContaining([MOSS.id, SA3_SFX.id, SA3_MUSIC.id]))

    expect(added.map((a) => a.rate)).toEqual([44100, 48000, 44100, 44100])
    for (const [i, a] of added.entries()) {
      expect(peak(a.channels[0])).toBeGreaterThan(0.5) // normalised to -1 dBFS
      expect(rms(a.channels[0])).toBeGreaterThan(0.005) // not silence
      await keep(`${i + 1}-${a.o.name.replace(/\W+/g, '-').toLowerCase()}`, a.channels, a.rate)
    }
    console.log(made.map((m) => `${m.model}: ${m.name}, ${m.seconds} s ${m.channels}, ${typeof m.pitch === 'string' ? 'unpitched' : m.pitch.note}, in ${m.generated_in_seconds} s`).join('\n'))
  }, 60 * 60_000)

  it('a generation stopped part way: the model loads again, and the next one works', async () => {
    const { board, added } = boardStandIn()
    const tools = createTools(board as never, { confirmDeletes: true, sound: agent })
    const make = tools.find((t) => t.name === 'make_sound')!.run as (i: object, s?: AbortSignal) => Promise<{ text: string }>
    const stop = new AbortController()
    const long = make({ prompt: 'a long thunderstorm', seconds: 30, steps: 200 }, stop.signal)
    await new Promise((r) => setTimeout(r, 1500))
    stop.abort()
    await expect(long).rejects.toThrow()
    const again = JSON.parse((await make({ prompt: 'a short kick drum hit', seconds: 1 })).text)
    expect(again.model).toBe(SA3_MUSIC.id)
    expect(added).toHaveLength(1)
  }, 10 * 60_000)
})
