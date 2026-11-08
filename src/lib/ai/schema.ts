import type { JsonSchema } from './types'

/**
 * Checks a tool call's input against its schema before the tool runs. Streamed tool inputs (Anthropic's
 * eager_input_streaming, any OpenAI-compatible server) aren't validated by the API, and a local model's often
 * aren't right, so the tools never see input that doesn't fit. Covers the JSON Schema the tools use: types,
 * properties / required / additionalProperties, items, enum, minimum / maximum, minItems / maxItems.
 * Answers null when it fits, else where and why it doesn't (for the model to correct itself).
 */
export function validate(schema: JsonSchema, value: unknown, at = 'input'): string | null {
  const types = schema.type === undefined ? null : Array.isArray(schema.type) ? schema.type : [schema.type]
  if (types && !types.some((t) => isType(t, value))) return `${at} should be ${types.join(' or ')}, got ${describe(value)}`
  if (schema.enum && !schema.enum.some((e) => e === value)) return `${at} should be one of ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}`
  if (typeof value === 'number') {
    if (schema.minimum !== undefined && value < schema.minimum) return `${at} should be at least ${schema.minimum}`
    if (schema.maximum !== undefined && value > schema.maximum) return `${at} should be at most ${schema.maximum}`
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) return `${at} needs at least ${schema.minItems} items`
    if (schema.maxItems !== undefined && value.length > schema.maxItems) return `${at} takes at most ${schema.maxItems} items`
    if (schema.items) {
      for (let i = 0; i < value.length; i++) {
        const err = validate(schema.items, value[i], `${at}[${i}]`)
        if (err) return err
      }
    }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const obj = value as Record<string, unknown>
    for (const k of schema.required ?? []) if (obj[k] === undefined) return `${at}.${k} is required`
    for (const [k, v] of Object.entries(obj)) {
      const prop = schema.properties?.[k]
      if (prop) {
        const err = validate(prop, v, `${at}.${k}`)
        if (err) return err
      } else if (schema.additionalProperties === false) {
        return `${at}.${k} isn't a known field (known: ${Object.keys(schema.properties ?? {}).join(', ')})`
      } else if (typeof schema.additionalProperties === 'object') {
        const err = validate(schema.additionalProperties, v, `${at}.${k}`)
        if (err) return err
      }
    }
  }
  return null
}

function isType(t: string, v: unknown): boolean {
  switch (t) {
    case 'object':
      return !!v && typeof v === 'object' && !Array.isArray(v)
    case 'array':
      return Array.isArray(v)
    case 'integer':
      return typeof v === 'number' && Number.isInteger(v)
    case 'number':
      return typeof v === 'number' && Number.isFinite(v)
    case 'null':
      return v === null
    default:
      return typeof v === t
  }
}

const describe = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'an array' : typeof v === 'object' ? 'an object' : `${typeof v} ${JSON.stringify(v)}`)

/** a tool input from its JSON text: the value, or why it isn't JSON */
export function parseInput(json: string): { value: unknown; error?: string } {
  if (!json.trim()) return { value: {} }
  try {
    return { value: JSON.parse(json) }
  } catch (e) {
    return { value: undefined, error: `input isn't valid JSON (${(e as Error).message})` }
  }
}
