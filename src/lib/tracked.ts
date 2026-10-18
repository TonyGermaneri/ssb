/**
 * Write tracking for the board's thousands of sounds.
 *
 * Vue tracks reads: a deep watch over 4,000 sounds walks every setting of every sound on each edit (a third of a
 * second a knob step), and a computed per sound would hold ~140 MB of dependencies. The board only needs to know
 * which item was written, so each sound and patch sits under a proxy of its own, beneath Vue's, that reports a
 * write anywhere inside it to its owner. Vue's proxies wrap these like any object, so the UI is reactive as ever.
 *
 * Only plain objects and arrays are wrapped. A tracked object is not structured-cloneable (it is a Proxy): copy it
 * through JSON first, as the board does whenever it stores or posts one.
 */
import { toRaw } from 'vue'

/** tracker → the object it wraps */
const raws = new WeakMap<object, object>()

const isPlain = (v: unknown): v is object => {
  if (v === null || typeof v !== 'object') return false
  if (Array.isArray(v)) return true
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

/** The plain object under a tracker (and under Vue's proxy of one); anything else as it is. */
export function untrack<T>(v: T): T {
  if (v === null || typeof v !== 'object') return v
  const r = toRaw(v as object)
  return (raws.get(r) ?? r) as T
}

export const isTracked = (v: unknown) => v !== null && typeof v === 'object' && raws.has(toRaw(v as object))

/**
 * `raw` under a proxy that calls `onWrite` when it, or anything inside it, is set or deleted. Values stored through
 * it are stored unwrapped, so the data underneath stays plain. Tracking a tracker returns it as it is.
 */
export function track<T extends object>(raw: T, onWrite: () => void): T {
  const plain = toRaw(raw as object)
  if (raws.has(plain)) return plain as T
  // each owner wraps its own subtree, so a write is always reported to the item it was made through
  const wrapped = new WeakMap<object, object>()
  const wrap = (obj: object): object => {
    let p = wrapped.get(obj)
    if (!p) {
      p = new Proxy(obj, handler)
      wrapped.set(obj, p)
      raws.set(p, obj)
    }
    return p
  }
  const handler: ProxyHandler<object> = {
    get(t, k) {
      const v = Reflect.get(t, k)
      return isPlain(v) ? wrap(v) : v
    },
    set(t, k, v) {
      const value = untrack(v)
      const had = Object.prototype.hasOwnProperty.call(t, k)
      if (had && Object.is(Reflect.get(t, k), value)) return true
      Reflect.set(t, k, value)
      onWrite()
      return true
    },
    deleteProperty(t, k) {
      if (!Object.prototype.hasOwnProperty.call(t, k)) return true
      Reflect.deleteProperty(t, k)
      onWrite()
      return true
    },
    defineProperty(t, k, d) {
      const ok = Reflect.defineProperty(t, k, d.value === undefined ? d : { ...d, value: untrack(d.value) })
      if (ok) onWrite()
      return ok
    },
  }
  return wrap(plain) as T
}
