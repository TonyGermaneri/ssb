/**
 * VOYAGE's sky, as numbers: the ship's bob, and the field of rocks it sails through. Each catchable rock is meant for
 * one VCO (it wears that VCO's colours) and carries a sound -- a sample from the samples list, or, for a VCO whose
 * garden grows, the clip waiting to go in (a POD). A rock that drifts near enough to its VCO's tractor port, while
 * that port is open, is locked on, pulled in along a spiral over BEAM_S, and caught: the view stitches its sound in.
 *
 * Units: the screen's height is 1, x runs 0 .. aspect, y down. Pure, so it's tested (field.test.ts).
 */

export const BEAM_S = 2.6
/** how near (screen heights, centre to the port) a rock must come to be locked on */
export const CATCH_R = 0.15
/** the most rocks in the field at once */
export const MAX_ROCKS = 10

export type Payload = { kind: 'sound'; soundId: string; label: string } | { kind: 'pod'; label: string }

export interface Rock {
  id: number
  /** the VCO (0..2) it's meant for */
  vco: number
  x: number
  y: number
  vx: number
  vy: number
  r: number
  angle: number
  spin: number
  seed: number
  payload: Payload
  /** -1 drifting; 0..1 on its way in */
  beam: number
  /** where it was when the beam took it */
  bx: number
  by: number
  /** its size then */
  br: number
}

/** A VCO's tractor port, where the ship is now: open when the VCO can take a catch. */
export interface Port {
  vco: number
  x: number
  y: number
  open: boolean
}

export interface ShipPose {
  /** the centre, screen units */
  x: number
  y: number
  /** radians */
  tilt: number
}

/** The ship's bob at bob-time t: slow, uneven swells, nosing up as it rises. */
export function shipPose(t: number, aspect: number): ShipPose {
  const y = 0.5 + 0.06 * Math.sin(t * 0.31) + 0.028 * Math.sin(t * 0.83 + 1.3) + 0.012 * Math.sin(t * 1.9 + 0.4)
  const x = aspect * 0.48 + 0.018 * Math.sin(t * 0.17)
  const tilt = -0.035 * Math.cos(t * 0.31) - 0.012 * Math.cos(t * 0.83 + 1.3)
  return { x, y, tilt }
}

const ease = (e: number) => e * e * (3 - 2 * e)

export class Field {
  rocks: Rock[] = []
  private nextId = 1

  add(r: Omit<Rock, 'id' | 'beam' | 'bx' | 'by' | 'br' | 'angle'> & { angle?: number }): Rock | null {
    if (this.rocks.length >= MAX_ROCKS) return null
    const rock: Rock = { angle: 0, ...r, id: this.nextId++, beam: -1, bx: r.x, by: r.y, br: r.r }
    this.rocks.push(rock)
    return rock
  }

  /** the VCO's port is pulling one in */
  beaming(vco: number) {
    return this.rocks.some((r) => r.vco === vco && r.beam >= 0)
  }

  /** lock `rock` on now, wherever it is (a click on it), if its port is open */
  lock(rock: Rock, ports: Port[]): boolean {
    const p = ports.find((q) => q.vco === rock.vco)
    if (!p?.open || rock.beam >= 0 || this.beaming(rock.vco)) return false
    rock.beam = 0
    rock.bx = rock.x
    rock.by = rock.y
    rock.br = rock.r
    return true
  }

  /**
   * One frame: rocks drift (and leave at the left), locked ones come in along a spiral to their port wherever the
   * ship has bobbed to, and a drifting rock near its open port is locked on (one at a time per port). Returns the
   * rocks caught this frame.
   */
  step(dt: number, ports: Port[]): Rock[] {
    const caught: Rock[] = []
    for (const r of this.rocks) {
      r.angle += r.spin * dt
      if (r.beam < 0) {
        r.x += r.vx * dt
        r.y += r.vy * dt + Math.sin(r.x * 3 + r.seed * 20) * 0.004 * dt
        continue
      }
      const p = ports.find((q) => q.vco === r.vco)
      r.beam = Math.min(1, r.beam + dt / BEAM_S)
      const e = ease(r.beam)
      const px = p?.x ?? r.bx
      const py = p?.y ?? r.by
      // the way in: the straight line, turned about the port as it shortens (three quarters of a turn)
      const turn = e * Math.PI * 1.5 * (r.seed > 0.5 ? 1 : -1)
      const dx = (r.bx - px) * (1 - e)
      const dy = (r.by - py) * (1 - e)
      r.x = px + dx * Math.cos(turn) - dy * Math.sin(turn)
      r.y = py + dx * Math.sin(turn) + dy * Math.cos(turn)
      r.r = r.br * (1 - 0.85 * e)
      r.spin += dt * 6 * (r.seed > 0.5 ? 1 : -1)
      if (r.beam >= 1) caught.push(r)
    }
    // lock-ons: the nearest drifting rock of each open, idle port
    for (const p of ports) {
      if (!p.open || this.beaming(p.vco)) continue
      let best: Rock | null = null
      let bestD = Infinity
      for (const r of this.rocks) {
        if (r.vco !== p.vco || r.beam >= 0) continue
        const d = Math.hypot(r.x - p.x, r.y - p.y) - r.r
        if (d < CATCH_R && d < bestD) {
          best = r
          bestD = d
        }
      }
      if (best) this.lock(best, ports)
    }
    this.rocks = this.rocks.filter((r) => !caught.includes(r) && r.x > -0.4 && r.y > -0.6 && r.y < 1.6)
    return caught
  }

  /** the rock at a screen point (for a click), drifting ones only */
  at(x: number, y: number): Rock | null {
    let hit: Rock | null = null
    for (const r of this.rocks) if (r.beam < 0 && Math.hypot(r.x - x, r.y - y) < r.r * 1.25) hit = r
    return hit
  }
}
