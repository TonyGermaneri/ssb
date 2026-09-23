/**
 * The page's side of the native app / plugin (native/plugin/PluginEditor.cpp).
 *
 * In a browser none of this is active: `inNative()` is false and every helper falls back to the
 * web behaviour. Inside the JUCE web view `window.__JUCE__` exists, and:
 * - MIDI arrives from the host (or the standalone's MIDI inputs) as `ssbMidi` events, since a web
 *   view has no Web MIDI;
 * - files are saved through a native dialog, since a plugin's web view cannot download;
 * - links open in the system browser, since `target=_blank` goes nowhere in a web view.
 *
 * The protocol is JUCE 8's (modules/juce_gui_extra/native/javascript/index.js), re-implemented in
 * a few lines rather than vendored: `__juce__invoke` calls a native function, `__juce__complete`
 * carries its result back.
 */

interface JuceBackend {
  addEventListener(eventId: string, fn: (payload: never) => void): unknown
  emitEvent(eventId: string, payload: unknown): void
}

declare global {
  interface Window {
    __JUCE__?: { backend?: JuceBackend; initialisationData?: Record<string, unknown[]> }
  }
}

/** What the native side reports about itself (`ssbReady`). */
export interface NativeInfo {
  /** 'Standalone', 'AU', 'VST3', … */
  wrapper: string
  standalone: boolean
  version: string
}

const backend = (): JuceBackend | undefined => (typeof window === 'undefined' ? undefined : window.__JUCE__?.backend)
const functions = (): unknown[] => window.__JUCE__?.initialisationData?.__juce__functions ?? []

/** Running inside SSB's own app / plugin (not merely any JUCE web view). */
export const inNative = (): boolean => !!backend() && functions().includes('ssbReady')

/**
 * In a DAW (AU / VST3) the native engine makes the sound and the page is only the editor. Read
 * from the initialisation data, which JUCE injects before any page script runs, so it is known
 * synchronously at startup (the audio engine decides at import time).
 */
export const nativeEngine = (): boolean => inNative() && window.__JUCE__?.initialisationData?.ssbEngine?.[0] === true

/**
 * The plugin instance's own board: each AU / VST3 instance keeps its board under its own key (made
 * when the instance is created, saved with the host session), so two SSB tracks are two boards.
 * Null in the browser and the standalone, which keep the one board.
 */
export const nativeBoardKey = (): string | null => {
  const key = window.__JUCE__?.initialisationData?.ssbBoard?.[0]
  return inNative() && typeof key === 'string' && key ? key : null
}

/** Events from the native side (ssbMidi, ssbMeter, …). */
export function onNative<T>(eventId: string, fn: (payload: T) => void) {
  backend()?.addEventListener(eventId, fn as (payload: never) => void)
}

let nextId = 0
const pending = new Map<number, (result: unknown) => void>()
let listening = false
function listen() {
  if (listening) return
  listening = true
  backend()!.addEventListener('__juce__complete', (({ promiseId, result }: { promiseId: number; result: unknown }) => {
    pending.get(promiseId)?.(result)
    pending.delete(promiseId)
  }) as (payload: never) => void)
}

/** Call a function registered with WebBrowserComponent::Options::withNativeFunction. */
export function callNative<T = unknown>(name: string, ...params: unknown[]): Promise<T> {
  const b = backend()
  if (!b) return Promise.reject(new Error(`not in the native app: ${name}`))
  listen()
  const resultId = nextId++
  return new Promise<T>((resolve) => {
    pending.set(resultId, resolve as (r: unknown) => void)
    b.emitEvent('__juce__invoke', { name, params, resultId })
  })
}

/** Raw MIDI from the host, a batch at a time: each entry is [status, data1?, data2?]. */
export function onNativeMidi(fn: (messages: number[][]) => void) {
  backend()?.addEventListener('ssbMidi', fn as (payload: never) => void)
}

export const nativeInfo = (): Promise<NativeInfo> => callNative<NativeInfo>('ssbReady')

/** Save a file: a native save dialog in the app / plugin, a download in the browser. */
export async function saveFile(name: string, blob: Blob) {
  if (inNative()) {
    const bytes = new Uint8Array(await blob.arrayBuffer())
    let binary = ''
    for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
    return callNative<boolean>('ssbSaveFile', name, btoa(binary))
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  return true
}

/** Forward the page's console errors / warnings and uncaught errors to the native log. */
export function forwardConsole() {
  if (!inNative()) return
  const send = (level: string, args: unknown[]) =>
    void callNative('ssbLog', level, ...args.map((a) => (a instanceof Error ? `${a.message}\n${a.stack}` : typeof a === 'string' ? a : JSON.stringify(a)))).catch(() => {})
  for (const level of ['error', 'warn'] as const) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      original(...args)
      send(level, args)
    }
  }
  window.addEventListener('error', (e) => send('uncaught', [e.message, `${e.filename}:${e.lineno}`]))
  window.addEventListener('unhandledrejection', (e) => send('unhandled', [String(e.reason)]))
}

/** In the native web view, http(s) links that would open a new tab go to the system browser. */
export function routeExternalLinks() {
  if (!inNative()) return
  document.addEventListener(
    'click',
    (e) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!a || !/^https?:/i.test(a.href) || a.target !== '_blank') return
      e.preventDefault()
      void callNative('ssbOpenUrl', a.href)
    },
    true,
  )
}
