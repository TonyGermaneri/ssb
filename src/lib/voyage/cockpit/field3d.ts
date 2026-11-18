/**
 * The COCKPIT's rocks: the same rocks the ship sails through (each meant for one VCO, carrying a sound or the
 * garden's next clip), seen from inside -- coming at you out of the dark ahead. A rock lives at (x, y) across the
 * view and z deep (1 far, 0 at the glass); it's drawn at x / z, y / z from the vanishing point.
 *
 * A rock for an open intake that comes near enough (z under LOCK_Z, inside the windscreen) is locked on, as is one
 * clicked: the beam takes it from where it is on the glass down into its VCO's intake on the dash, over BEAM_S, and
 * it's caught. Units: the screen's height is 1, y down, the vanishing point at `vp`. Pure, so it's tested.
 */
import type { Payload } from '../field'

export const BEAM_S = 2.2
/** how near a rock comes before its open intake locks on */
export const LOCK_Z = 0.32
/** past this it's gone by */
export const NEAR_Z = 0.06
export const MAX_ROCKS3D = 10
/** how wide (from the vanishing point, at z = 1) the rocks spawn */
export const SPREAD = 0.42

export interface Rock3 {
  id: number
  vco: number
  x: number
  y: number
  z: number
  /** z per second */
  speed: number
  /** radius at z = 1 (screen heights) */
  r: number
  angle: number
  spin: number
  seed: number
  payload: Payload
  /** -1 coming; 0..1 on its way in */
  beam: number
  /** where it was on the screen when the beam took it, and its size there */
  bx: number
  by: number
  br: number
}

/** where a VCO's intake is (screen units) and whether it can take a catch */
export interface Intake {
  vco: number
  x: number
  y: number
  open: boolean
}

/** a rock on the screen: where, how big, how far through its beam */
export interface Shown {
  x: number
  y: number
  r: number
}

const ease = (e: number) => e * e * (3 - 2 * e)

export class Field3 {
  rocks: Rock3[] = []
  private nextId = 1
  /** the vanishing point (screen units) and the focal length (screen heights at z = 1) */
  constructor(public vp: { x: number; y: number } = { x: 0.8, y: 0.35 }, public focal = 1) {}

  add(r: Omit<Rock3, 'id' | 'beam' | 'bx' | 'by' | 'br' | 'angle'> & { angle?: number }): Rock3 | null {
    if (this.rocks.length >= MAX_ROCKS3D) return null
    const rock: Rock3 = { angle: 0, ...r, id: this.nextId++, beam: -1, bx: 0, by: 0, br: 0 }
    this.rocks.push(rock)
    return rock
  }

  /** where a coming rock is on the screen */
  project(r: Rock3): Shown {
    const z = Math.max(NEAR_Z, r.z)
    return { x: this.vp.x + (r.x / z) * this.focal, y: this.vp.y + (r.y / z) * this.focal, r: (r.r / z) * this.focal }
  }

  /** where any rock is drawn: coming, projected; beamed, on its way from the glass to its intake */
  shown(r: Rock3, intakes: Intake[]): Shown {
    if (r.beam < 0) return this.project(r)
    const e = ease(r.beam)
    const p = intakes.find((q) => q.vco === r.vco)
    const px = p?.x ?? r.bx
    const py = p?.y ?? r.by
    // a curve down: out a little first, then in
    const bow = Math.sin(e * Math.PI) * 0.08 * (r.seed > 0.5 ? 1 : -1)
    return { x: r.bx + (px - r.bx) * e + bow, y: r.by + (py - r.by) * e * e, r: r.br * (1 - 0.8 * e) }
  }

  beaming(vco: number) {
    return this.rocks.some((r) => r.vco === vco && r.beam >= 0)
  }

  /** lock `rock` on now (a click, or near enough), if its intake is open and idle */
  lock(rock: Rock3, intakes: Intake[]): boolean {
    const p = intakes.find((q) => q.vco === rock.vco)
    if (!p?.open || rock.beam >= 0 || this.beaming(rock.vco)) return false
    const s = this.project(rock)
    rock.beam = 0
    rock.bx = s.x
    rock.by = s.y
    rock.br = s.r
    return true
  }

  /**
   * One frame: rocks come on (and go by), the nearest of each open intake's locks on once it's near and inside
   * `glass` (a test on its screen point), beamed ones come in. Returns the rocks caught this frame.
   */
  step(dt: number, intakes: Intake[], glass: (x: number, y: number) => boolean = () => true): Rock3[] {
    const caught: Rock3[] = []
    for (const r of this.rocks) {
      r.angle += r.spin * dt
      if (r.beam < 0) {
        r.z -= r.speed * dt
        continue
      }
      r.beam = Math.min(1, r.beam + dt / BEAM_S)
      r.spin += dt * 5 * (r.seed > 0.5 ? 1 : -1)
      if (r.beam >= 1) caught.push(r)
    }
    for (const p of intakes) {
      if (!p.open || this.beaming(p.vco)) continue
      const near = this.rocks
        .filter((r) => r.vco === p.vco && r.beam < 0 && r.z < LOCK_Z && r.z > NEAR_Z * 1.5)
        .filter((r) => {
          const s = this.project(r)
          return glass(s.x, s.y)
        })
        .sort((a, b) => a.z - b.z)[0]
      if (near) this.lock(near, intakes)
    }
    this.rocks = this.rocks.filter((r) => !caught.includes(r) && (r.beam >= 0 || r.z > NEAR_Z))
    return caught
  }

  /** the coming rock at a screen point (a click), the nearest first */
  at(x: number, y: number): Rock3 | null {
    let hit: Rock3 | null = null
    for (const r of this.rocks) {
      if (r.beam >= 0) continue
      const s = this.project(r)
      if (Math.hypot(s.x - x, s.y - y) < Math.max(0.025, s.r * 1.3) && (!hit || r.z < hit.z)) hit = r
    }
    return hit
  }
}
