/**
 * SSB's MCP server, the protocol half (the transport is the app's: native/mcp/McpServer, Streamable HTTP, and the
 * ssb-mcp stdio bridge in front of it). JSON-RPC in, JSON-RPC out, over the same tools the in-app agent uses
 * (tools.ts): initialize, ping, tools/list, tools/call. Stateless: no sessions, no server-sent stream.
 *
 * A tool that fails, or input that doesn't fit its schema, comes back as a tool result with isError (the agent
 * reads it and corrects itself); only a malformed request or an unknown tool is a JSON-RPC error.
 */
import type { AgentTool } from './agent'
import { validate } from './schema'

/** the protocol versions this server speaks, newest first */
export const MCP_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']

export interface McpContext {
  tools: AgentTool[]
  instructions: string
  /** SSB's version */
  version: string
  /** ask the user (a tool that wants a yes first, deleting) */
  approve(question: string, tool: string): Promise<boolean>
  /** each call, for the activity list */
  onCall?(e: { tool: string; ok: boolean; ms: number }): void
}

type Id = string | number | null
interface Request {
  jsonrpc: '2.0'
  id?: Id
  method?: string
  params?: Record<string, unknown>
}

const result = (id: Id, value: unknown) => ({ jsonrpc: '2.0', id, result: value })
const failure = (id: Id, code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } })

/** one HTTP request's body → the HTTP answer (202 with no body when there is nothing to say) */
export async function handleMcp(body: string, ctx: McpContext): Promise<{ status: number; body: string }> {
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    return { status: 400, body: JSON.stringify(failure(null, -32700, 'Parse error: the body is not JSON')) }
  }
  const batch = Array.isArray(parsed)
  const messages = (batch ? parsed : [parsed]) as Request[]
  const out: unknown[] = []
  for (const m of messages) {
    const r = await one(m, ctx)
    if (r) out.push(r)
  }
  if (!out.length) return { status: 202, body: '' }
  return { status: 200, body: JSON.stringify(batch ? out : out[0]) }
}

async function one(m: Request, ctx: McpContext): Promise<unknown | null> {
  if (!m || typeof m !== 'object' || m.jsonrpc !== '2.0') return failure(null, -32600, 'Invalid request: not JSON-RPC 2.0')
  // a notification (no id) or a response to something we never asked: nothing to answer
  if (m.id === undefined || typeof m.method !== 'string') return null
  const id = m.id
  const p = m.params ?? {}
  switch (m.method) {
    case 'initialize': {
      const asked = typeof p.protocolVersion === 'string' ? p.protocolVersion : ''
      return result(id, {
        protocolVersion: MCP_VERSIONS.includes(asked) ? asked : MCP_VERSIONS[1],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'ssb', title: 'Super Sound Board', version: ctx.version },
        instructions: ctx.instructions,
      })
    }
    case 'ping':
      return result(id, {})
    case 'tools/list':
      return result(id, {
        tools: ctx.tools.map((t) => ({ name: t.name, description: t.description, inputSchema: { type: 'object', ...t.schema } })),
      })
    case 'tools/call': {
      const name = typeof p.name === 'string' ? p.name : ''
      const tool = ctx.tools.find((t) => t.name === name)
      if (!tool) return failure(id, -32602, `Unknown tool: ${name || '(none)'}`)
      const args = (p.arguments ?? {}) as unknown
      const t0 = performance.now()
      const done = (r: { content: unknown[]; isError?: boolean }) => {
        ctx.onCall?.({ tool: name, ok: !r.isError, ms: Math.round(performance.now() - t0) })
        return result(id, r)
      }
      const text = (s: string, isError = false) => done({ content: [{ type: 'text', text: s }], ...(isError ? { isError: true } : {}) })
      const invalid = validate(tool.schema, args, 'arguments')
      if (invalid) return text(`Invalid input: ${invalid}. Correct it and call ${name} again.`, true)
      const question = tool.confirm?.(args as never)
      if (question && !(await ctx.approve(question, name))) return text('The user declined this in SSB.', true)
      try {
        const reply = await tool.run(args as never)
        return done({
          content: [
            { type: 'text', text: reply.text },
            ...(reply.images ?? []).map((im) => ({ type: 'image', data: im.data, mimeType: im.mediaType })),
          ],
        })
      } catch (e) {
        return text(`Failed: ${e instanceof Error ? e.message : String(e)}`, true)
      }
    }
    default:
      return failure(id, -32601, `Method not found: ${m.method}`)
  }
}
