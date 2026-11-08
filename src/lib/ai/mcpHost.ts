/**
 * Runs SSB's MCP server from the page: turns the app's HTTP server (native/mcp) on and off, and answers its
 * requests (ssbMcpRequest) with the same tools the in-app agent has, over the board this page shows. Only in the
 * app and the plugin: a browser tab can't open a port.
 */
import { watch } from 'vue'
import { version } from '../../../package.json'
import { callNative, inNative, onNative } from '../../native/bridge'
import { useBoard } from '../../stores/board'
import { handleMcp } from './mcp'
import { freshToken, mcpSaved, mcpStatus, saveMcp } from './mcpStatus'
import { MCP_INSTRUCTIONS } from './prompt'
import { createTools } from './tools'

interface NativeStatus {
  running: boolean
  port?: number
  url?: string
  cli?: string
  error?: string
}

let listening = false
function listen() {
  if (listening) return
  listening = true
  onNative<{ id: number; body: string }>('ssbMcpRequest', ({ id, body }) => {
    void answer(body).then((r) => callNative('ssbMcpReply', id, r.status, r.body).catch(() => {}))
  })
}

/** the board's loaded before any tool looks at it */
async function boardReady() {
  const board = useBoard()
  if (board.loaded) return board
  await new Promise<void>((resolve) => {
    const stop = watch(
      () => board.loaded,
      (ok) => ok && (stop(), resolve()),
    )
  })
  return board
}

/** ask before deleting, as the in-app agent's setting says (the AI settings' ASK BEFORE DELETING) */
function confirmDeletes(): boolean {
  try {
    return JSON.parse(localStorage.getItem('ssb:ai:settings') ?? 'null')?.current?.confirmDeletes ?? true
  } catch {
    return true
  }
}

async function answer(body: string) {
  const board = await boardReady()
  return handleMcp(body, {
    tools: createTools(board, { confirmDeletes: confirmDeletes() }),
    instructions: MCP_INSTRUCTIONS,
    version,
    approve: (question, tool) =>
      new Promise<boolean>((resolve) => {
        mcpStatus.approval?.resolve(false)
        mcpStatus.approval = { question, tool, resolve: (yes) => ((mcpStatus.approval = null), resolve(yes)) }
      }),
    onCall: (e) => {
      mcpStatus.activity.unshift({ at: Date.now(), ...e })
      if (mcpStatus.activity.length > 30) mcpStatus.activity.length = 30
    },
  })
}

/** turn the server on or off (remembered: on again at the next start) */
export async function setMcp(on: boolean) {
  const s = mcpSaved()
  saveMcp({ ...s, enabled: on })
  return on ? start() : stop()
}

/** a new token: every client configured with the old one needs the new one */
export async function newMcpToken() {
  saveMcp({ ...mcpSaved(), token: freshToken() })
  if (mcpStatus.state === 'on') await start()
}

/** another port (applies at once if it's running) */
export async function setMcpPort(port: number) {
  saveMcp({ ...mcpSaved(), port })
  if (mcpStatus.state === 'on') await start()
}

async function start() {
  if (!inNative()) {
    mcpStatus.state = 'unavailable'
    mcpStatus.error = 'The MCP server needs the SSB app or plugin (a browser tab can’t open a port).'
    return
  }
  listen()
  const s = mcpSaved()
  mcpStatus.state = 'starting'
  try {
    const r = await callNative<NativeStatus>('ssbMcp', { on: true, port: s.port, token: s.token })
    Object.assign(mcpStatus, {
      state: r.running ? 'on' : 'error',
      url: r.url ?? '',
      port: r.port ?? 0,
      cli: r.cli ?? '',
      error: r.running ? '' : (r.error ?? 'The server didn’t start'),
    })
  } catch (e) {
    Object.assign(mcpStatus, { state: 'error', error: e instanceof Error ? e.message : String(e) })
  }
}

async function stop() {
  mcpStatus.approval?.resolve(false)
  if (inNative()) await callNative('ssbMcp', { on: false }).catch(() => {})
  Object.assign(mcpStatus, { state: 'off', url: '', port: 0, error: '' })
}

/** at startup: on again if it was left on */
export function bootMcp() {
  if (mcpSaved().enabled) void start()
}
