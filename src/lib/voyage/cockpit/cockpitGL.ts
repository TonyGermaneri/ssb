/**
 * The COCKPIT's two GL layers (the era's sky itself is VOYAGE's, space.ts, behind them both):
 *
 * - AHEAD (behind the glass, over the sky): stars streaking past from the vanishing point, faster as they near; the
 *   rocks coming at you, lumpy, lit from the sun's side, marbled in their VCO's colours and rim-lit, a pod's seed
 *   glowing through its shell; and the tractor beam drawing a locked rock down into its intake on the dash.
 * - AIR (over the whole cockpit, added light: `mix-blend-mode: screen`): shafts of sunlight through the glass with dust
 *   turning in them -- near motes big and soft (out of focus), far ones pin-sharp, lit where the light falls -- the
 *   film's grain, an interference band rolling up the picture (EMF), and for a dreamy era a slow iridescent swirl.
 */

const VERT_STAR = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_corner;
layout(location = 1) in vec4 a_star; // angle, base radius, phase, size
uniform vec2 u_res;
uniform vec2 u_vp;
uniform float u_time;
uniform float u_speed;
uniform float u_scale;
out float v_bright;
out vec2 v_uv;
void main() {
  float z = 1.0 - fract(a_star.z + u_time * u_speed * (0.6 + 0.4 * a_star.w));
  z = max(z, 0.03);
  float z2 = min(1.0, z + 0.025 + 0.06 * u_speed);
  vec2 dir = vec2(cos(a_star.x), sin(a_star.x));
  vec2 p1 = u_vp + dir * a_star.y / z * u_scale;
  vec2 p0 = u_vp + dir * a_star.y / z2 * u_scale;
  vec2 along = p1 - p0;
  float len = max(length(along), 0.5);
  vec2 t = along / len;
  vec2 n = vec2(-t.y, t.x);
  float w = (0.5 + a_star.w * 1.2) * (1.2 - z) * u_scale / 700.0 + 0.4;
  vec2 p = mix(p0, p1, a_corner.y) + n * a_corner.x * w;
  v_bright = pow(1.0 - z, 1.6) * (0.4 + 0.6 * a_star.w);
  v_uv = a_corner;
  gl_Position = vec4(p / u_res * 2.0 - 1.0, 0.0, 1.0) * vec4(1, -1, 1, 1);
}`
const FRAG_STAR = /* glsl */ `#version 300 es
precision highp float;
in float v_bright;
in vec2 v_uv;
uniform vec3 u_tint;
out vec4 o;
void main() {
  float a = (1.0 - abs(v_uv.x)) * smoothstep(0.0, 0.6, v_uv.y);
  vec3 c = mix(u_tint, vec3(1.0), v_uv.y);
  o = vec4(c * a * v_bright, 0.0);
}`

const VERT_QUAD = /* glsl */ `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_corner;
uniform vec2 u_res;
uniform vec4 u_box; // centre x, y, half w, half h (px)
uniform float u_ang;
out vec2 v_p;
void main() {
  v_p = a_corner;
  vec2 c = a_corner * u_box.zw;
  float s = sin(u_ang), co = cos(u_ang);
  vec2 p = u_box.xy + vec2(co * c.x - s * c.y, s * c.x + co * c.y);
  gl_Position = vec4(p / u_res * 2.0 - 1.0, 0.0, 1.0) * vec4(1, -1, 1, 1);
}`
const NOISE = /* glsl */ `
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.03 + 7.1; a *= 0.5; } return v; }
`
const FRAG_ROCK = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_p;
uniform float u_seed;
uniform float u_ang;
uniform float u_time;
uniform vec3 u_c0; // main
uniform vec3 u_c1; // alt
uniform vec3 u_c2; // hi
uniform vec3 u_c3; // deep
uniform vec3 u_glow;
uniform vec2 u_sun; // direction the light comes from (screen, normalised)
uniform float u_beam; // -1, or 0..1
uniform float u_pod;
uniform float u_open;
uniform float u_lit; // the VCO's level
uniform float u_rad; // its radius on the screen, px: detail fades on small ones (no shimmer)
out vec4 o;
${NOISE}
void main() {
  // the quad is 1.6× the rock's radius each way: room for the aura
  vec2 d = v_p * 1.6;
  float a = atan(d.y, d.x);
  float lump = 1.0 + 0.1 * sin(a * 3.0 + u_seed * 10.0) + 0.06 * sin(a * 5.0 + u_seed * 7.0) + 0.035 * sin(a * 9.0 + u_seed * 3.0);
  float r = length(d) / lump;
  float edge = fwidth(r) * 1.5;
  float body = smoothstep(1.0, 1.0 - edge, r);
  // a sphere's normal, roughened
  vec2 q = d / lump;
  float zz = sqrt(max(0.0, 1.0 - dot(q, q)));
  vec3 nrm = normalize(vec3(q, zz));
  vec2 uv = q * 2.2 + u_seed * 13.0;
  float detail = clamp((u_rad - 6.0) / 40.0, 0.0, 1.0);
  // the bumps, from the noise's slope (sampled, not screen derivatives: smooth at any size)
  float e = 0.04;
  float h0 = fbm(uv * 1.8);
  vec2 slope = vec2(fbm(uv * 1.8 + vec2(e, 0.0)) - h0, fbm(uv * 1.8 + vec2(0.0, e)) - h0) / e;
  nrm = normalize(nrm + vec3(slope, 0.0) * 0.35 * detail);
  vec3 L = normalize(vec3(-u_sun, 0.55));
  float diff = clamp(dot(nrm, L), 0.0, 1.0);
  // marbled in its VCO's colours, veins of the bright one
  float m = fbm(uv + vec2(fbm(uv * 1.3 + 3.0), fbm(uv * 1.3 - 2.0)) * 1.8);
  vec3 col = mix(u_c3, u_c0, smoothstep(0.3, 0.6, m));
  col = mix(col, u_c1, smoothstep(0.55, 0.75, m) * 0.7);
  col = mix(col, u_c2, smoothstep(0.02, 0.0, abs(m - 0.62)) * 0.9);
  // craters
  float cr = smoothstep(0.62, 0.7, noise(uv * 3.0 + 5.0));
  col *= 1.0 - 0.35 * cr * detail;
  vec3 lit = col * (0.12 + 1.05 * diff) + u_c2 * pow(clamp(dot(reflect(-L, nrm), vec3(0, 0, 1)), 0.0, 1.0), 18.0) * 0.5;
  // the rim: the glow of its VCO, brighter when its intake is open
  float rim = pow(1.0 - zz, 2.5);
  lit += u_glow * rim * (0.35 + 0.65 * u_open) * (0.8 + 0.6 * u_lit);
  // a pod: its seed glowing through the shell
  if (u_pod > 0.5) {
    float seed = exp(-dot(q, q) * 6.0) * (0.75 + 0.25 * sin(u_time * 4.0));
    lit = mix(lit, vec3(0.5, 1.0, 0.42), seed * 0.75);
  }
  // the aura, and the beam's grip
  float aura = exp(-max(0.0, r - 1.0) * 5.0) * (1.0 - body);
  float grip = u_beam >= 0.0 ? 1.0 : 0.0;
  vec3 auraC = u_glow * aura * (0.25 + 0.5 * u_open + grip * (0.8 + 0.4 * sin(u_time * 20.0)));
  float alpha = body;
  o = vec4(lit * body + auraC, alpha);
}`
const FRAG_BEAM = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_p; // x across -1..1, y along -1 (rock) .. 1 (intake)
uniform float u_time;
uniform vec3 u_glow;
uniform float u_k;
out vec4 o;
void main() {
  float t = v_p.y * 0.5 + 0.5;
  float w = mix(1.0, 0.25, t);
  float x = abs(v_p.x) / w;
  float core = exp(-x * x * 8.0);
  float edge = exp(-x * x * 1.6);
  float bands = 0.65 + 0.35 * sin(t * 40.0 - u_time * 14.0);
  vec3 c = u_glow * (edge * 0.35 + core * bands) + vec3(1.0) * core * core * 0.4;
  o = vec4(c * u_k * smoothstep(1.0, 0.85, x), 0.0);
}`

const VERT_FULL = /* glsl */ `#version 300 es
layout(location = 0) in vec2 a_corner;
out vec2 v_uv;
void main() { v_uv = a_corner * 0.5 + 0.5; gl_Position = vec4(a_corner, 0.0, 1.0); }`
const FRAG_AIR = /* glsl */ `#version 300 es
precision highp float;
in vec2 v_uv;
uniform vec2 u_res;
uniform float u_time;
uniform vec2 u_sun; // px, top-left origin
uniform vec3 u_sunC;
uniform float u_dust;
uniform float u_shafts;
uniform float u_grain;
uniform float u_emf;
uniform float u_trip;
uniform float u_level;
out vec4 o;
${NOISE}
// the shafts' strength at a pixel
float shaft(vec2 p) {
  vec2 d = p - u_sun;
  float ang = atan(d.y, d.x);
  float dist = length(d) / u_res.y;
  float rays = pow(noise(vec2(ang * 9.0, u_time * 0.05)), 3.0) * 1.4 + pow(noise(vec2(ang * 23.0 + 4.0, u_time * 0.08)), 4.0);
  return rays * exp(-dist * 0.9) * smoothstep(0.0, 0.25, dist);
}
// one layer of dust: a mote per cell, drifting; near layers big and soft
float motes(vec2 p, float cell, float size, float soft, float seed) {
  vec2 g = p / cell;
  vec2 drift = vec2(u_time * 0.012 * (1.0 + seed), -u_time * 0.008);
  g += drift;
  vec2 id = floor(g);
  float v = 0.0;
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 c = id + vec2(i, j);
      float h = hash12(c + seed * 31.0);
      if (h > 0.32) continue;
      vec2 at = c + vec2(hash12(c * 1.7 + seed), hash12(c * 2.3 - seed));
      at += 0.15 * vec2(sin(u_time * 0.3 + h * 20.0), cos(u_time * 0.23 + h * 17.0));
      float d = length(g - at) * cell / size;
      v += smoothstep(1.0, 1.0 - soft, d) * (0.4 + 0.6 * hash12(c + 9.1));
    }
  return v;
}
void main() {
  vec2 p = vec2(v_uv.x, 1.0 - v_uv.y) * u_res;
  float s = shaft(p) * u_shafts;
  vec3 col = u_sunC * s * 0.22;
  // dust: lit faintly everywhere, brightly in the shafts
  float light = 0.12 + 2.6 * s;
  float far = motes(p, u_res.y * 0.035, u_res.y * 0.0018, 0.4, 1.0);
  float mid = motes(p, u_res.y * 0.07, u_res.y * 0.004, 0.7, 2.0);
  float nearM = motes(p, u_res.y * 0.16, u_res.y * 0.018, 0.95, 3.0);
  col += u_sunC * (far * 0.45 + mid * 0.45 + nearM * 0.25) * light * u_dust;
  // grain: bright sparks of it (the dark half is the overlay's)
  float gr = hash12(p + fract(u_time * 37.0) * 400.0);
  col += vec3(pow(gr, 18.0)) * u_grain * 0.8;
  // EMF: an interference band rolling up, its tearing lines, worse with the level
  float band = exp(-pow((v_uv.y - fract(u_time * 0.06)) * 18.0, 2.0));
  float tear = step(0.985, hash12(vec2(floor(p.y / 3.0), floor(u_time * 24.0)))) * hash12(vec2(p.x * 0.01, u_time));
  col += vec3(0.55, 0.75, 1.0) * (band * 0.05 + tear * 0.12) * u_emf * (0.6 + u_level);
  // the trip: slow iridescent swirls
  if (u_trip > 0.0) {
    vec2 q = p / u_res.y;
    float w = fbm(q * 2.0 + vec2(u_time * 0.05, -u_time * 0.04) + fbm(q * 3.0 - u_time * 0.03) * 1.5);
    vec3 iri = 0.5 + 0.5 * cos(6.2831 * (w * 2.0 + u_time * 0.05 + vec3(0.0, 0.33, 0.67)));
    col += iri * smoothstep(0.35, 0.8, w) * 0.16 * u_trip;
  }
  o = vec4(col, 1.0);
}`

function program(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const make = (type: number, src: string) => {
    const s = gl.createShader(type)!
    gl.shaderSource(s, src)
    gl.compileShader(s)
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader')
    return s
  }
  const p = gl.createProgram()!
  gl.attachShader(p, make(gl.VERTEX_SHADER, vs))
  gl.attachShader(p, make(gl.FRAGMENT_SHADER, fs))
  gl.linkProgram(p)
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link')
  return p
}
type U = Record<string, WebGLUniformLocation | null>
const uniforms = (gl: WebGL2RenderingContext, p: WebGLProgram, names: string[]): U => Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(p, n)]))

export interface AheadRock {
  /** px */
  x: number
  y: number
  r: number
  angle: number
  seed: number
  vco: number
  beam: number
  pod: boolean
  open: boolean
}
export interface AheadFrame {
  time: number
  /** px: the vanishing point; px per screen height */
  vp: [number, number]
  scale: number
  speed: number
  tint: [number, number, number]
  /** per VCO: main, alt, hi, deep, glow (0..1 rgb) */
  palettes: [number, number, number][][]
  levels: number[]
  sunDir: [number, number]
  rocks: AheadRock[]
  /** a beamed rock's way in: from (its x, y) to its intake (px) */
  beams: { from: [number, number]; to: [number, number]; vco: number; k: number }[]
}

const STARS = 900

export class Ahead {
  private gl: WebGL2RenderingContext
  private star: WebGLProgram
  private rock: WebGLProgram
  private beam: WebGLProgram
  private us: U
  private ur: U
  private ub: U
  private vaoStar: WebGLVertexArrayObject
  private vaoQuad: WebGLVertexArrayObject
  lost = false

  static create(canvas: HTMLCanvasElement): Ahead | null {
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: true })
    if (!gl) return null
    try {
      return new Ahead(gl)
    } catch (e) {
      console.warn('[cockpit]', e)
      return null
    }
  }
  private constructor(gl: WebGL2RenderingContext) {
    this.gl = gl
    this.star = program(gl, VERT_STAR, FRAG_STAR)
    this.rock = program(gl, VERT_QUAD, FRAG_ROCK)
    this.beam = program(gl, VERT_QUAD, FRAG_BEAM)
    this.us = uniforms(gl, this.star, ['u_res', 'u_vp', 'u_time', 'u_speed', 'u_scale', 'u_tint'])
    this.ur = uniforms(gl, this.rock, ['u_res', 'u_box', 'u_ang', 'u_seed', 'u_time', 'u_c0', 'u_c1', 'u_c2', 'u_c3', 'u_glow', 'u_sun', 'u_beam', 'u_pod', 'u_open', 'u_lit', 'u_rad'])
    this.ub = uniforms(gl, this.beam, ['u_res', 'u_box', 'u_ang', 'u_time', 'u_glow', 'u_k'])
    const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1])
    // the stars: a quad each (corner x -1..1 across, y 0..1 along), their own angle / radius / phase / size
    this.vaoStar = gl.createVertexArray()!
    gl.bindVertexArray(this.vaoStar)
    const corners = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, corners)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, 0, 1, 0, -1, 1, 1, 1]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    const data = new Float32Array(STARS * 4)
    for (let i = 0; i < STARS; i++) {
      data[i * 4] = Math.random() * Math.PI * 2
      data[i * 4 + 1] = 0.01 + Math.pow(Math.random(), 0.7) * 0.5
      data[i * 4 + 2] = Math.random()
      data[i * 4 + 3] = Math.random()
    }
    const inst = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, inst)
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(1)
    gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0)
    gl.vertexAttribDivisor(1, 1)
    this.vaoQuad = gl.createVertexArray()!
    gl.bindVertexArray(this.vaoQuad)
    const qb = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, qb)
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.bindVertexArray(null)
    gl.canvas.addEventListener('webglcontextlost', () => (this.lost = true))
  }

  frame(f: AheadFrame) {
    const gl = this.gl
    const w = gl.canvas.width
    const h = gl.canvas.height
    gl.viewport(0, 0, w, h)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.enable(gl.BLEND)
    // the stars, added light
    gl.blendFunc(gl.ONE, gl.ONE)
    gl.useProgram(this.star)
    gl.uniform2f(this.us.u_res, w, h)
    gl.uniform2f(this.us.u_vp, f.vp[0], f.vp[1])
    gl.uniform1f(this.us.u_time, f.time)
    gl.uniform1f(this.us.u_speed, f.speed)
    gl.uniform1f(this.us.u_scale, f.scale)
    gl.uniform3fv(this.us.u_tint, f.tint)
    gl.bindVertexArray(this.vaoStar)
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, STARS)
    gl.bindVertexArray(this.vaoQuad)
    // the rocks, far ones first
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.useProgram(this.rock)
    gl.uniform2f(this.ur.u_res, w, h)
    gl.uniform1f(this.ur.u_time, f.time)
    gl.uniform2f(this.ur.u_sun, f.sunDir[0], f.sunDir[1])
    for (const r of [...f.rocks].sort((a, b) => a.r - b.r)) {
      const p = f.palettes[r.vco]
      if (!p) continue
      gl.uniform4f(this.ur.u_box, r.x, r.y, r.r * 1.6, r.r * 1.6)
      gl.uniform1f(this.ur.u_ang, r.angle)
      gl.uniform1f(this.ur.u_seed, r.seed)
      gl.uniform3fv(this.ur.u_c0, p[0])
      gl.uniform3fv(this.ur.u_c1, p[1])
      gl.uniform3fv(this.ur.u_c2, p[2])
      gl.uniform3fv(this.ur.u_c3, p[3])
      gl.uniform3fv(this.ur.u_glow, p[4])
      gl.uniform1f(this.ur.u_beam, r.beam)
      gl.uniform1f(this.ur.u_pod, r.pod ? 1 : 0)
      gl.uniform1f(this.ur.u_open, r.open ? 1 : 0)
      gl.uniform1f(this.ur.u_lit, f.levels[r.vco] ?? 0)
      gl.uniform1f(this.ur.u_rad, r.r)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    // the beams, added light
    gl.blendFunc(gl.ONE, gl.ONE)
    gl.useProgram(this.beam)
    gl.uniform2f(this.ub.u_res, w, h)
    gl.uniform1f(this.ub.u_time, f.time)
    for (const b of f.beams) {
      const dx = b.to[0] - b.from[0]
      const dy = b.to[1] - b.from[1]
      const len = Math.hypot(dx, dy)
      if (len < 2) continue
      gl.uniform4f(this.ub.u_box, (b.from[0] + b.to[0]) / 2, (b.from[1] + b.to[1]) / 2, f.scale * 0.05, len / 2)
      gl.uniform1f(this.ub.u_ang, Math.atan2(dy, dx) - Math.PI / 2)
      gl.uniform3fv(this.ub.u_glow, f.palettes[b.vco]?.[4] ?? [1, 1, 1])
      gl.uniform1f(this.ub.u_k, b.k)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    }
    gl.bindVertexArray(null)
  }
  dispose() {
    this.gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}

export interface AirFrame {
  time: number
  sun: [number, number]
  sunC: [number, number, number]
  dust: number
  shafts: number
  grain: number
  emf: number
  trip: number
  level: number
}

export class Air {
  private gl: WebGL2RenderingContext
  private p: WebGLProgram
  private u: U
  private vao: WebGLVertexArrayObject
  lost = false
  static create(canvas: HTMLCanvasElement): Air | null {
    const gl = canvas.getContext('webgl2', { premultipliedAlpha: false, alpha: false, antialias: false })
    if (!gl) return null
    try {
      return new Air(gl)
    } catch (e) {
      console.warn('[cockpit]', e)
      return null
    }
  }
  private constructor(gl: WebGL2RenderingContext) {
    this.gl = gl
    this.p = program(gl, VERT_FULL, FRAG_AIR)
    this.u = uniforms(gl, this.p, ['u_res', 'u_time', 'u_sun', 'u_sunC', 'u_dust', 'u_shafts', 'u_grain', 'u_emf', 'u_trip', 'u_level'])
    this.vao = gl.createVertexArray()!
    gl.bindVertexArray(this.vao)
    const b = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, b)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    gl.enableVertexAttribArray(0)
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)
    gl.bindVertexArray(null)
    gl.canvas.addEventListener('webglcontextlost', () => (this.lost = true))
  }
  frame(f: AirFrame) {
    const gl = this.gl
    const w = gl.canvas.width
    const h = gl.canvas.height
    gl.viewport(0, 0, w, h)
    gl.useProgram(this.p)
    gl.uniform2f(this.u.u_res, w, h)
    gl.uniform1f(this.u.u_time, f.time)
    gl.uniform2f(this.u.u_sun, f.sun[0], f.sun[1])
    gl.uniform3fv(this.u.u_sunC, f.sunC)
    gl.uniform1f(this.u.u_dust, f.dust)
    gl.uniform1f(this.u.u_shafts, f.shafts)
    gl.uniform1f(this.u.u_grain, f.grain)
    gl.uniform1f(this.u.u_emf, f.emf)
    gl.uniform1f(this.u.u_trip, f.trip)
    gl.uniform1f(this.u.u_level, f.level)
    gl.bindVertexArray(this.vao)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.bindVertexArray(null)
  }
  dispose() {
    this.gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}
