import { describe, expect, it } from 'vitest'
import type { AgentTool } from './agent'
import { handleMcp, type McpContext } from './mcp'

const tools: AgentTool[] = [
  {
    name: 'echo',
    description: 'Echoes a word.',
    schema: { type: 'object', properties: { word: { type: 'string' } }, required: ['word'], additionalProperties: false },
    run: (i: { word: string }) => ({ text: `echo ${i.word}`, images: [{ mediaType: 'image/png', data: 'AAAA' }] }),
  },
  {
    name: 'boom',
    description: 'Fails.',
    schema: { type: 'object', properties: {} },
    run: () => {
      throw new Error('it broke')
    },
  },
  {
    name: 'delete_thing',
    description: 'Needs a yes.',
    schema: { type: 'object', properties: {} },
    confirm: () => 'Delete it?',
    run: () => ({ text: 'deleted' }),
  },
]
const calls: string[] = []
const ctx = (approve = true): McpContext => ({
  tools,
  instructions: 'how to use SSB',
  version: '9.9.9',
  approve: async () => approve,
  onCall: (e) => calls.push(`${e.tool}:${e.ok}`),
})
const rpc = async (msg: unknown, c = ctx()) => {
  const r = await handleMcp(JSON.stringify(msg), c)
  return { status: r.status, json: r.body ? JSON.parse(r.body) : null }
}

describe('MCP server protocol', () => {
  it('initializes: the version the client asked for when known, tools capability, instructions', async () => {
    const { status, json } = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '1' } } })
    expect(status).toBe(200)
    expect(json.result).toMatchObject({ protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'ssb', version: '9.9.9' }, instructions: 'how to use SSB' })
    const other = await rpc({ jsonrpc: '2.0', id: 2, method: 'initialize', params: { protocolVersion: '1999-01-01' } })
    expect(other.json.result.protocolVersion).toBe('2025-06-18')
  })

  it('accepts notifications with 202 and no body', async () => {
    expect(await rpc({ jsonrpc: '2.0', method: 'notifications/initialized' })).toEqual({ status: 202, json: null })
  })

  it('lists the tools with object input schemas', async () => {
    const { json } = await rpc({ jsonrpc: '2.0', id: 3, method: 'tools/list' })
    expect(json.result.tools.map((t: { name: string }) => t.name)).toEqual(['echo', 'boom', 'delete_thing'])
    expect(json.result.tools[0].inputSchema).toMatchObject({ type: 'object', required: ['word'] })
  })

  it('calls a tool: text and images as content', async () => {
    const { json } = await rpc({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'echo', arguments: { word: 'hi' } } })
    expect(json.result).toEqual({ content: [{ type: 'text', text: 'echo hi' }, { type: 'image', data: 'AAAA', mimeType: 'image/png' }] })
  })

  it('reports bad input, failures and declines as tool errors; unknown tools and methods as protocol errors', async () => {
    const bad = await rpc({ jsonrpc: '2.0', id: 5, method: 'tools/call', params: { name: 'echo', arguments: { word: 3 } } })
    expect(bad.json.result.isError).toBe(true)
    expect(bad.json.result.content[0].text).toMatch(/arguments.word should be string/)
    const boom = await rpc({ jsonrpc: '2.0', id: 6, method: 'tools/call', params: { name: 'boom', arguments: {} } })
    expect(boom.json.result).toMatchObject({ isError: true, content: [{ text: 'Failed: it broke' }] })
    const no = await rpc({ jsonrpc: '2.0', id: 7, method: 'tools/call', params: { name: 'delete_thing', arguments: {} } }, ctx(false))
    expect(no.json.result).toMatchObject({ isError: true, content: [{ text: 'The user declined this in SSB.' }] })
    const yes = await rpc({ jsonrpc: '2.0', id: 8, method: 'tools/call', params: { name: 'delete_thing', arguments: {} } })
    expect(yes.json.result.content[0].text).toBe('deleted')
    expect((await rpc({ jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'nope' } })).json.error.code).toBe(-32602)
    expect((await rpc({ jsonrpc: '2.0', id: 10, method: 'resources/list' })).json.error.code).toBe(-32601)
    expect(calls).toContain('echo:false')
    expect(calls).toContain('boom:false')
  })

  it('answers a batch, and refuses what is not JSON-RPC', async () => {
    const { json } = await rpc([{ jsonrpc: '2.0', id: 11, method: 'ping' }, { jsonrpc: '2.0', method: 'notifications/x' }])
    expect(json).toEqual([{ jsonrpc: '2.0', id: 11, result: {} }])
    const r = await handleMcp('not json', ctx())
    expect(r.status).toBe(400)
    expect(JSON.parse(r.body).error.code).toBe(-32700)
  })
})
