/**
 * The MCP server's switch and state, kept light (no tools, no providers): the header's indicator and the app's
 * approval prompt read it without loading the rest. mcpHost.ts runs the server and fills it in.
 */
import { reactive } from 'vue'

export const MCP_KEY = 'ssb:mcp'
export const MCP_DEFAULT_PORT = 6280

export interface McpSaved {
  /** off unless the user turns it on */
  enabled: boolean
  port: number
  /** the bearer token HTTP clients send (ssb-mcp reads it from the discovery file) */
  token: string
}

const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => b.toString(16).padStart(2, '0')).join('')

export function mcpSaved(): McpSaved {
  try {
    const raw = JSON.parse(localStorage.getItem(MCP_KEY) ?? 'null') as Partial<McpSaved> | null
    if (raw?.token) return { enabled: !!raw.enabled, port: raw.port || MCP_DEFAULT_PORT, token: raw.token }
  } catch {
    /* blocked storage: off */
  }
  const fresh = { enabled: false, port: MCP_DEFAULT_PORT, token: newToken() }
  saveMcp(fresh)
  return fresh
}
export function saveMcp(s: McpSaved) {
  try {
    localStorage.setItem(MCP_KEY, JSON.stringify(s))
  } catch {
    /* kept for this session only */
  }
}
export const freshToken = newToken

export interface McpActivity {
  at: number
  tool: string
  ok: boolean
  ms: number
}

export const mcpStatus = reactive({
  /** off · starting · on · error · unavailable (the browser page: only the app and the plugin can serve) */
  state: 'off' as 'off' | 'starting' | 'on' | 'error' | 'unavailable',
  url: '',
  port: 0,
  /** the stdio bridge's path, for client configurations */
  cli: '',
  error: '',
  /** a tool waiting for the user's yes */
  approval: null as null | { question: string; tool: string; resolve(yes: boolean): void },
  /** the latest calls, newest first */
  activity: [] as McpActivity[],
})
