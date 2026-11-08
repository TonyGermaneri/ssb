import { onBeforeUnmount, watch } from 'vue'
import { useBoard } from '../stores/board'

/** what scrolls: an element, or canvas-datagrid (which keeps its own scrollTop / scrollLeft) */
export interface Scrollable {
  scrollTop: number
  scrollLeft: number
}

/** how long a pane keeps trying to reach its saved position while its content arrives */
const RESTORE_MS = 2500
const RETRY_MS = 50

/**
 * A pane's scroll position, kept in the board's view (saved with a plugin instance, see board.ts InstanceView) and
 * put back when the pane appears or the host hands the instance its saved state. Content often arrives after the
 * pane does (a board still loading, a virtual list measuring its rows), so putting it back keeps trying for a moment
 * until the pane is long enough; anything the user does to the pane meanwhile wins.
 *
 * `target` is reactive (a template ref's element, a grid in a shallowRef): the pane may come and go. `listen`
 * subscribes to its scrolling and to the user's own input on it, and answers an unsubscribe.
 */
export function rememberScroll<T extends Scrollable>(
  key: () => string,
  target: () => T | null | undefined,
  listen: (t: T, onScroll: () => void, onUser: () => void) => () => void,
) {
  const board = useBoard()
  let timer = 0
  let until = 0
  const stop = () => {
    clearTimeout(timer)
    timer = 0
  }

  function step() {
    timer = 0
    const t = target()
    const want = board.view.scroll[key()]
    if (!t || !want) return
    t.scrollTop = want[0]
    t.scrollLeft = want[1]
    const there = Math.abs(t.scrollTop - want[0]) < 2 && Math.abs(t.scrollLeft - want[1]) < 2
    if (!there && performance.now() < until) timer = window.setTimeout(step, RETRY_MS)
  }
  function restore() {
    stop()
    if (!board.view.scroll[key()]) return
    until = performance.now() + RESTORE_MS
    step()
  }
  const record = () => {
    // a scroll of our own making (the content not yet long enough) isn't where the user is
    if (timer) return
    const t = target()
    if (t) board.view.scroll[key()] = [Math.round(t.scrollTop), Math.round(t.scrollLeft)]
  }

  let unlisten = () => {}
  watch(
    target,
    (t) => {
      unlisten()
      unlisten = t ? listen(t, record, stop) : () => {}
      if (t) restore()
    },
    { flush: 'post', immediate: true },
  )
  watch(() => board.view.restored, restore)
  watch(key, restore)
  onBeforeUnmount(() => {
    stop()
    unlisten()
  })
}

/** rememberScroll for an element */
export function rememberElementScroll(key: () => string, el: () => HTMLElement | null | undefined) {
  rememberScroll(key, el, (e, onScroll, onUser) => {
    const user = ['wheel', 'pointerdown', 'touchstart', 'keydown'] as const
    e.addEventListener('scroll', onScroll, { passive: true })
    for (const u of user) e.addEventListener(u, onUser, { passive: true })
    return () => {
      e.removeEventListener('scroll', onScroll)
      for (const u of user) e.removeEventListener(u, onUser)
    }
  })
}
