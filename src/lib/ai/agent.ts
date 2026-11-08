import { addUsage, AiError, emptyUsage, type AiEvent, type AiImage, type ChatSession, type ToolCall, type ToolOutput, type ToolSpec, type TurnResult, type Usage } from './types'

/** what a tool hands back: text for the model, and images it should look at */
export interface ToolReply {
  text: string
  images?: AiImage[]
}

/** a tool the agent may call: its spec, how it runs, and whether it needs the user's yes first */
export interface AgentTool extends ToolSpec {
  run(input: never, signal?: AbortSignal): Promise<ToolReply> | ToolReply
  /** a question for the user before it runs (deleting, say), or null to just run */
  confirm?(input: never): string | null
}

export type AgentEvent =
  | AiEvent
  | { type: 'turn'; result: TurnResult }
  | { type: 'tool_start'; call: ToolCall }
  | { type: 'tool_done'; call: ToolCall; output: ToolOutput }

export interface AgentHooks {
  onEvent(e: AgentEvent): void
  /** ask the user; resolves to their answer */
  approve?(call: ToolCall, question: string): Promise<boolean>
}

export interface AgentOutcome {
  /** why it stopped: the model finished, ran out of tokens, declined, was stopped, or used up its steps */
  stop: TurnResult['stop'] | 'max_steps' | 'aborted'
  steps: number
  usage: Usage
  /** the last turn's text */
  text: string
}

/**
 * The agent loop, the same for every provider: the user's turn, then model calls and tool runs until the model
 * answers without calling a tool. Tool inputs that don't fit their schema go back to the model as errors to fix,
 * never to the tool. If the user stops it between a tool call and its result, every call still gets a result
 * ("stopped"), so the transcript stays one the API will take next time.
 */
export async function runAgent(
  session: ChatSession,
  tools: AgentTool[],
  prompt: { text: string; images?: AiImage[] },
  hooks: AgentHooks,
  signal?: AbortSignal,
  maxSteps = 24,
): Promise<AgentOutcome> {
  session.addUser(prompt.text, prompt.images)
  let usage = emptyUsage()
  let text = ''
  for (let step = 1; step <= maxSteps; step++) {
    let result: TurnResult
    try {
      result = await session.step(hooks.onEvent, signal)
    } catch (e) {
      if (e instanceof AiError && e.kind === 'aborted') return { stop: 'aborted', steps: step, usage, text }
      throw e
    }
    usage = addUsage(usage, result.usage)
    text = result.text
    hooks.onEvent({ type: 'turn', result })
    if (result.stop !== 'tool_use') return { stop: result.stop, steps: step, usage, text }

    const outputs: ToolOutput[] = []
    for (const call of result.toolCalls) {
      if (signal?.aborted) {
        outputs.push({ callId: call.id, name: call.name, text: 'Stopped by the user before this ran.', isError: true })
        continue
      }
      hooks.onEvent({ type: 'tool_start', call })
      const output = await runTool(tools, call, hooks, signal)
      outputs.push(output)
      hooks.onEvent({ type: 'tool_done', call, output })
    }
    session.addToolResults(outputs)
    if (signal?.aborted) return { stop: 'aborted', steps: step, usage, text }
  }
  return { stop: 'max_steps', steps: maxSteps, usage, text }
}

async function runTool(tools: AgentTool[], call: ToolCall, hooks: AgentHooks, signal?: AbortSignal): Promise<ToolOutput> {
  const base = { callId: call.id, name: call.name }
  if (call.inputError) return { ...base, text: `Invalid input: ${call.inputError}. Correct it and call ${call.name} again.`, isError: true }
  const tool = tools.find((t) => t.name === call.name)
  if (!tool) return { ...base, text: `There is no tool named ${call.name}.`, isError: true }
  const question = tool.confirm?.(call.input as never)
  if (question) {
    const yes = hooks.approve ? await hooks.approve(call, question) : false
    if (!yes) return { ...base, text: 'The user declined this. Ask them, or try something else.', isError: true }
  }
  try {
    const reply = await tool.run(call.input as never, signal)
    return { ...base, text: reply.text, images: reply.images }
  } catch (e) {
    return { ...base, text: `Failed: ${e instanceof Error ? e.message : String(e)}`, isError: true }
  }
}
