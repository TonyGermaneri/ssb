/**
 * The cockpits' materials, made once in a canvas and kept as image URLs: grey tiles an SVG <pattern> lays over a
 * panel's own colour (overlay / multiply / soft-light), so one leather serves a red seat and a brown one. Seamless
 * where it shows (they wrap their noise), procedural (nothing to download), small (256-512 px).
 */
export type TextureId = 'brushed' | 'leather' | 'wood' | 'patina' | 'carbon' | 'speckle' | 'scratches' | 'grille' | 'noise' | 'paper' | 'velvet' | 'knurl'

const cache = new Map<TextureId, string>()

/** a wrapped value noise, period `n` cells over the tile */
function noiseTile(size: number, n: number, seed: number) {
  const g = new Float32Array(n * n)
  let s = seed * 9301 + 49297
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
  for (let i = 0; i < g.length; i++) g[i] = rnd()
  const at = (x: number, y: number) => g[((y % n) + n) % n * n + (((x % n) + n) % n)]
  return (px: number, py: number) => {
    const x = (px / size) * n
    const y = (py / size) * n
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const fx = x - xi
    const fy = y - yi
    const u = fx * fx * (3 - 2 * fx)
    const v = fy * fy * (3 - 2 * fy)
    const a = at(xi, yi) + (at(xi + 1, yi) - at(xi, yi)) * u
    const b = at(xi, yi + 1) + (at(xi + 1, yi + 1) - at(xi, yi + 1)) * u
    return a + (b - a) * v
  }
}
function fbmTile(size: number, base: number, octaves: number, seed: number) {
  const ns = Array.from({ length: octaves }, (_, i) => noiseTile(size, base * 2 ** i, seed + i * 17))
  return (x: number, y: number) => {
    let v = 0
    let a = 0.5
    let t = 0
    for (const f of ns) {
      v += f(x, y) * a
      t += a
      a *= 0.5
    }
    return v / t
  }
}

function make(size: number, fill: (img: ImageData, size: number) => void): string {
  const c = document.createElement('canvas')
  c.width = c.height = size
  const g = c.getContext('2d')!
  const img = g.createImageData(size, size)
  fill(img, size)
  g.putImageData(img, 0, 0)
  return c.toDataURL('image/png')
}
const put = (img: ImageData, i: number, v: number, a = 255) => {
  const k = Math.max(0, Math.min(255, v * 255))
  img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = k
  img.data[i * 4 + 3] = a
}

const MAKERS: Record<TextureId, () => string> = {
  // brushed metal: long horizontal streaks over a fine grain
  brushed: () =>
    make(512, (img, n) => {
      const rows = Array.from({ length: n }, () => Math.random())
      const long = noiseTile(n, 4, 3)
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          const streak = rows[y] * 0.5 + rows[(y + 1) % n] * 0.3 + rows[(y + n - 1) % n] * 0.2
          put(img, y * n + x, 0.42 + 0.22 * streak + 0.12 * long(x, y) + 0.08 * (Math.random() - 0.5))
        }
    }),
  // leather: pebbled cells, each a soft dome, creases between
  leather: () =>
    make(256, (img, n) => {
      const pts: [number, number][] = Array.from({ length: 260 }, () => [Math.random() * n, Math.random() * n])
      const fine = noiseTile(n, 32, 5)
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          let d1 = 1e9
          let d2 = 1e9
          for (const [px, py] of pts) {
            const dx = Math.min(Math.abs(px - x), n - Math.abs(px - x))
            const dy = Math.min(Math.abs(py - y), n - Math.abs(py - y))
            const d = dx * dx + dy * dy
            if (d < d1) (d2 = d1), (d1 = d)
            else if (d < d2) d2 = d
          }
          const edge = Math.min(1, (Math.sqrt(d2) - Math.sqrt(d1)) / 4)
          put(img, y * n + x, 0.3 + 0.45 * edge + 0.15 * fine(x, y))
        }
    }),
  // wood: rings pulled along a grain, with pores
  wood: () =>
    make(512, (img, n) => {
      const warp = fbmTile(n, 3, 4, 11)
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          const v = (y / n) * 14 + warp(x, y) * 5
          const ring = 0.5 + 0.5 * Math.sin(v * Math.PI * 2)
          const pore = Math.random() < 0.012 ? -0.25 : 0
          put(img, y * n + x, 0.35 + 0.35 * Math.pow(ring, 3) + 0.1 * warp(x * 3, y) + pore)
        }
    }),
  // patina / rust: blotches over blotches
  patina: () =>
    make(256, (img, n) => {
      const f = fbmTile(n, 4, 5, 21)
      const g = fbmTile(n, 16, 3, 33)
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          const v = f(x, y)
          put(img, y * n + x, 0.25 + 0.6 * Math.pow(v, 1.6) + 0.15 * (g(x, y) - 0.5))
        }
    }),
  // carbon: a 2 × 2 twill weave
  carbon: () =>
    make(128, (img, n) => {
      const cell = 16
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          const cx = Math.floor(x / cell)
          const cy = Math.floor(y / cell)
          const across = (cx + cy) % 2 === 0
          const u = (x % cell) / cell
          const v = (y % cell) / cell
          const t = across ? u : v
          const w = across ? v : u
          const shade = 0.25 + 0.45 * Math.sin(t * Math.PI) * (0.7 + 0.3 * Math.sin(w * Math.PI * 6))
          put(img, y * n + x, shade)
        }
    }),
  // bakelite / terrazzo: flecks in a dark body
  speckle: () =>
    make(256, (img, n) => {
      const f = fbmTile(n, 8, 3, 41)
      for (let i = 0; i < n * n; i++) put(img, i, 0.45 + 0.15 * f(i % n, Math.floor(i / n)))
      for (let k = 0; k < 900; k++) {
        const x = Math.floor(Math.random() * n)
        const y = Math.floor(Math.random() * n)
        const v = Math.random() < 0.5 ? 0.15 : 0.85
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) put(img, ((y + dy) % n) * n + ((x + dx) % n), v)
      }
    }),
  // wear: fine scratches, mostly one way
  scratches: () => {
    const c = document.createElement('canvas')
    c.width = c.height = 512
    const g = c.getContext('2d')!
    g.fillStyle = 'rgb(128,128,128)'
    g.fillRect(0, 0, 512, 512)
    for (let k = 0; k < 420; k++) {
      const x = Math.random() * 512
      const y = Math.random() * 512
      const a = (Math.random() < 0.7 ? 0.2 : Math.random() * Math.PI) + (Math.random() - 0.5) * 0.3
      const l = 10 + Math.random() * 90
      g.strokeStyle = Math.random() < 0.6 ? `rgba(255,255,255,${0.1 + Math.random() * 0.25})` : `rgba(0,0,0,${0.1 + Math.random() * 0.2})`
      g.lineWidth = Math.random() * 0.9 + 0.2
      g.beginPath()
      g.moveTo(x, y)
      g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l)
      g.stroke()
    }
    return c.toDataURL('image/png')
  },
  // a speaker / vent grille: round holes on a staggered grid
  grille: () => {
    const c = document.createElement('canvas')
    c.width = c.height = 64
    const g = c.getContext('2d')!
    g.fillStyle = 'rgb(150,150,150)'
    g.fillRect(0, 0, 64, 64)
    g.fillStyle = 'rgb(20,20,20)'
    for (const [x, y] of [[8, 8], [40, 8], [24, 24], [56, 24], [8, 40], [40, 40], [24, 56], [56, 56], [-8, 24], [-8, 56]]) {
      g.beginPath()
      g.arc(x, y, 5, 0, Math.PI * 2)
      g.fill()
    }
    return c.toDataURL('image/png')
  },
  noise: () =>
    make(256, (img, n) => {
      for (let i = 0; i < n * n; i++) put(img, i, 0.5 + (Math.random() - 0.5) * 0.5)
    }),
  // paper / card: fibres
  paper: () =>
    make(256, (img, n) => {
      const f = fbmTile(n, 16, 4, 51)
      for (let i = 0; i < n * n; i++) put(img, i, 0.55 + 0.25 * f(i % n, Math.floor(i / n)) + (Math.random() - 0.5) * 0.08)
    }),
  // velvet / flock: soft and deep
  velvet: () =>
    make(256, (img, n) => {
      const f = fbmTile(n, 6, 4, 61)
      for (let i = 0; i < n * n; i++) put(img, i, 0.35 + 0.35 * f(i % n, Math.floor(i / n)) + (Math.random() - 0.5) * 0.15)
    }),
  // knurling: a diamond cross-hatch, for knob grips and crank handles
  knurl: () =>
    make(32, (img, n) => {
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
          const a = Math.abs(((x + y) % 8) - 4) / 4
          const b = Math.abs(((x - y + 64) % 8) - 4) / 4
          put(img, y * n + x, 0.25 + 0.6 * Math.min(a, b))
        }
    }),
}

/** a material's tile, as an image URL ('' outside a browser) */
export function texture(id: TextureId): string {
  if (typeof document === 'undefined') return ''
  let u = cache.get(id)
  if (!u) cache.set(id, (u = MAKERS[id]()))
  return u
}
export const TEXTURE_SIZE: Record<TextureId, number> = {
  brushed: 512, leather: 256, wood: 512, patina: 256, carbon: 128, speckle: 256, scratches: 512, grille: 64, noise: 256, paper: 256, velvet: 256, knurl: 32,
}
