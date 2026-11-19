/**
 * A browser tab keeping the sound models its user had (MusicGen, Stable Audio 3 Small's browser form): the browser may
 * clear a site's storage between visits (pressure on the disk, Safari's week without a visit, "clear site data"), and
 * a model that was here last time, still the one picked, is downloaded again by itself rather than shown as picked and
 * not there. A model counts as had once its download finished, or a check found it whole, in this browser (and,
 * before that was recorded, when the board holds clips it made); a DELETE FILES forgets it.
 */
import { hereForm } from './soundHost'
import { soundModelFrom, type SoundModelInfo } from './soundModels'
import type { SoundHostApi } from './soundHost'
import { errorMessage } from './types'

const KEY = 'ssb:tab:kept-models'

export function keptModels(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(KEY) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}
function save(s: Set<string>) {
  try {
    localStorage.setItem(KEY, JSON.stringify([...s]))
  } catch {
    /* storage refused: it's only remembered for this visit's checks */
  }
}
export function keepModel(id: string) {
  const s = keptModels()
  if (!s.has(id)) save(s.add(id))
}
export function forgetModel(id: string) {
  const s = keptModels()
  if (s.delete(id)) save(s)
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface KeepDeps {
  host: () => SoundHostApi
  /** the board's sounds' tags: clips a model made carry its tag and "generated" */
  boardTags: () => Iterable<string[]>
  /** a line for the user (the board's toast) */
  say: (text: string) => void
  /** after each one: the status shown refreshed */
  changed?: () => void
}

let running: Promise<void> = Promise.resolve()
const restoring = new Set<string>()

/** model `m` (its browser form) was here before: downloaded, checked whole, or the board holds its clips */
export function hadBefore(m: SoundModelInfo, tags: Iterable<string[]>): boolean {
  if (keptModels().has(m.id)) return true
  for (const t of tags) if (t.includes('generated') && t.includes(m.tag)) return true
  return false
}

/**
 * The models `ids` names (the AI's pick, the VCOs' picks): each one that runs in the page, was had before and is now
 * missing is downloaded again, one at a time, saying so. Ones whole already are remembered as had.
 */
export function keepTabModels(ids: string[], deps: KeepDeps): Promise<void> {
  const models = [...new Map(ids.map((id) => soundModelFrom(id)).filter((m): m is SoundModelInfo => !!m).map((m) => hereForm(m)).filter((m) => m.page).map((m) => [m.id, m])).values()]
  running = running.then(async () => {
    for (const m of models) {
      if (restoring.has(m.id)) continue
      try {
        const host = deps.host()
        const [c] = await host.check([m])
        if (c?.downloaded) {
          keepModel(m.id)
          continue
        }
        if (!hadBefore(m, deps.boardTags())) continue
        restoring.add(m.id)
        // (one download at a time: wait out one under way, unless it's this one)
        for (let st = await host.status(); st.task && st.task.model !== m.id; st = await host.status()) await sleep(1000)
        const now = await host.status()
        if (now.task?.model !== m.id) {
          const [again] = await host.check([m])
          if (again?.downloaded) continue
          deps.say(`Downloading ${m.label} again — the browser cleared it since your last visit`)
          await host.download(m)
        }
        deps.changed?.()
        let shown = 0
        for (;;) {
          await sleep(700)
          const st = await host.status()
          if (st.task?.model === m.id) {
            // (its progress, now and then: the toast comes back every quarter)
            const q = Math.floor((st.task.progress ?? 0) * 4)
            if (q > shown && q < 4) deps.say(`Downloading ${m.label} again · ${q * 25}%`)
            shown = Math.max(shown, q)
            continue
          }
          if (st.error?.model === m.id) throw new Error(st.error.message)
          break
        }
        const [after] = await host.check([m])
        if (after?.downloaded) deps.say(`${m.label} is back, ready to play`)
        else throw new Error('the download stopped before it was complete')
      } catch (e) {
        const why = errorMessage(e)
        if (why !== 'cancelled') deps.say(`Couldn't download ${m.label} again: ${why}`)
      } finally {
        restoring.delete(m.id)
        deps.changed?.()
      }
    }
  })
  return running
}

/** model `id` is being downloaded again (or will be): a prompt may wait for it rather than refuse */
export const restorable = (m: SoundModelInfo, tags: Iterable<string[]>) => restoring.has(m.id) || hadBefore(m, tags)
