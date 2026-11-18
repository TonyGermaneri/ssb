/**
 * VOYAGE's sky on the GPU: one WebGL2 canvas behind the ship, two passes a frame.
 *
 * 1. LIGHT (into a pair of ping-pong buffers): what glows -- the tractor beams (rainbow bands running down them into
 *    the port), the ports' pulse, the catch shockwaves, the rocks' auras, the rainbow wake from the propeller -- on top
 *    of last frame's light, drifted back past the ship, swirled a little and turned round the colour wheel: everything
 *    that moves leaves a liquid, hue-shifting smear, a light show's oil wheel.
 * 2. SKY (to the screen): a domain-warped nebula cut into flat, ink-lined screenprint bands of a cycling technicolor
 *    palette; a striped sunset sun throwing slow sun-rays; oil-projector blobs; three parallax layers of sparkle stars
 *    and a far field of drifting rocks; the catchable rocks, crisp, marbled in their VCO's colours and ink-outlined;
 *    rainbow poster outlines rippling out from the ship; then the light buffer through a misregistered three-strip
 *    split, Ben-Day halftone, film grain, gate weave, dust and a vignette.
 *
 * Everything leans on the audio: each VCO's level swells its port and its rocks, the low end warps the nebula and
 * pulses the sun.
 */
import { MAX_ROCKS } from './field'
import type { Sky } from './ship'

export interface SpaceFrame {
  time: number
  /** css px to canvas px */
  px: number
  /** the ship: centre (screen units), screen units per design unit, tilt */
  ship: [number, number, number, number]
  /** per VCO: port x, y, beaming 0..1, open 0/1 */
  ports: [number, number, number, number][]
  /** per VCO: the last catch's x, y, seconds since, strength */
  flashes: [number, number, number, number][]
  /** per VCO level 0..1 */
  levels: [number, number, number]
  /** the low end, the top end, 0..1 */
  bass: number
  treble: number
  /** rocks: x, y, r, angle · vco, beam, seed, flags (1 pod, 2 its port open) */
  rocks: { a: [number, number, number, number]; b: [number, number, number, number] }[]
  /** the propeller's hub, screen units, and how hard it's turning */
  wake: [number, number, number, number]
  /** 15 colours: 5 per VCO (main, alt, hi, deep, glow) */
  palette: [number, number, number][]
  /** 0..1: how much of it all */
  amount: number
  /** 0..1: how long the light lingers */
  trails: number
  /** the era's sky (ship.ts Sky), its colours as 0..1 RGB, the ellipse round its hull, seconds since it came */
  sky: Sky
  skyColors: [number, number, number][]
  aura: [number, number, number, number]
  warp: number
}

const COMMON = /* glsl */ `#version 300 es
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_px;
uniform vec4 u_ship;
uniform vec4 u_port[3];
uniform vec4 u_flash[3];
uniform vec3 u_lv;
uniform vec2 u_band;
uniform vec4 u_rock[${MAX_ROCKS}];
uniform vec4 u_rockB[${MAX_ROCKS}];
uniform int u_nrock;
uniform vec4 u_wake;
uniform vec3 u_pal[15];
uniform float u_amt;
out vec4 o;

#define TAU 6.2831853
float aspect() { return u_res.x / u_res.y; }
vec2 screenP(vec2 frag) { return vec2(frag.x / u_res.y, 1.0 - frag.y / u_res.y); }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  mat2 m = mat2(1.6, 1.2, -1.2, 1.6);
  for (int i = 0; i < 5; i++) { v += a * noise(p); p = m * p; a *= 0.5; }
  return v;
}
// the dreamcoat: a cosine palette whose phases drift
vec3 dream(float t) { return 0.5 + 0.5 * cos(TAU * (t + vec3(0.0, 0.33, 0.67))); }
vec3 palOf(float vco, int k) { int i = int(vco + 0.5) * 5 + k; return u_pal[i]; }
float rockSd(vec2 d, float r, float seed, float ang) {
  float a = atan(d.y, d.x) + ang;
  float lump = 1.0 + 0.11 * sin(a * 3.0 + seed * 10.0) + 0.07 * sin(a * 5.0 + seed * 7.0) + 0.04 * sin(a * 9.0 + seed * 3.0);
  return length(d) - r * lump;
}
`

/** pass 1: the light, over last frame's drifted and hue-turned */
const LIGHT = COMMON + /* glsl */ `
uniform sampler2D u_prev;
uniform float u_keep;
vec3 hueTurn(vec3 c, float a) {
  const vec3 k = vec3(0.57735);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}
void main() {
  vec2 frag = gl_FragCoord.xy;
  vec2 uv = frag / u_res;
  vec2 p = screenP(frag);
  float t = u_time;
  // last frame's light: carried back past the ship (it sails on), a slow swirl about it, a breath of zoom
  vec2 c = vec2(u_ship.x / aspect(), 1.0 - u_ship.y);
  vec2 q = (uv - c) * vec2(aspect(), 1.0);
  q = rot(0.0018) * q * 0.997;
  vec2 warp = (vec2(noise(uv * 5.0 + t * 0.3), noise(uv * 5.0 - t * 0.27 + 9.0)) - 0.5) * 0.0035;
  vec2 back = c + q / vec2(aspect(), 1.0) + vec2(0.0021, 0.0) + warp;
  vec3 prev = texture(u_prev, back).rgb;
  prev = max(hueTurn(prev, 0.045), 0.0) * u_keep;

  vec3 e = vec3(0.0);
  // the ports: a pulse each, louder as its VCO is; blazing while it pulls
  for (int i = 0; i < 3; i++) {
    vec4 P = u_port[i];
    float d = length(p - P.xy);
    float lv = u_lv[i];
    float pulse = 0.5 + 0.5 * sin(t * 3.0 + float(i) * 2.1);
    e += palOf(float(i), 4) * (0.00035 + 0.0007 * lv + 0.0009 * P.z) / (d * d + 0.0016) * (0.35 + 0.25 * pulse) * (0.4 + 0.6 * P.w);
    // a catch: rainbow rings out of the port
    vec4 F = u_flash[i];
    if (F.w > 0.0 && F.z < 2.2) {
      float fd = length(p - F.xy);
      float rad = F.z * 0.55;
      float ring = exp(-pow((fd - rad) / (0.012 + F.z * 0.02), 2.0));
      e += dream(fd * 3.0 - t * 0.6) * ring * (1.0 - F.z / 2.2) * 1.4 * F.w;
      e += palOf(float(i), 4) * exp(-fd * 18.0) * max(0.0, 1.0 - F.z * 2.0) * 2.0;
    }
  }
  // the beams: from the port out to the rock, widening, rainbow bands running down them into the ship
  for (int i = 0; i < ${MAX_ROCKS}; i++) {
    if (i >= u_nrock) break;
    vec4 R = u_rock[i];
    vec4 B = u_rockB[i];
    vec2 rp = R.xy;
    // its aura (the light leaves a smear behind it as it goes)
    float rd = length(p - rp);
    float glow = exp(-max(0.0, rd - R.z) / (0.02 + 0.03 * u_lv[int(B.x + 0.5)]));
    vec3 tint = B.w >= 1.0 && mod(B.w, 2.0) >= 1.0 ? vec3(1.0, 0.82, 0.3) : palOf(B.x, 4);
    e += tint * glow * 0.09;
    if (B.y < 0.0) continue;
    vec4 P = u_port[int(B.x + 0.5)];
    vec2 ab = rp - P.xy;
    float L = max(1e-4, length(ab));
    vec2 dir = ab / L;
    vec2 n = vec2(-dir.y, dir.x);
    vec2 pp = p - P.xy;
    float s = dot(pp, dir) / L;
    float off = dot(pp, n);
    float on = smoothstep(0.0, 0.08, B.y) * (1.0 - smoothstep(0.9, 1.0, B.y));
    if (s > -0.05 && s < 1.15) {
      float w = mix(0.01, R.z * 1.5 + 0.02, clamp(s, 0.0, 1.0));
      float core = 1.0 - smoothstep(w * 0.55, w, abs(off));
      float band = fract(s * 9.0 * L * 2.0 + t * 2.6);
      float stripes = smoothstep(0.5, 0.0, abs(band - 0.5));
      vec3 rb = dream(s * 1.2 - t * 0.7 + B.z);
      float sparkle = step(0.985, hash12(floor(vec2(s * 60.0 - t * 30.0, off * 300.0))));
      float ends = smoothstep(-0.05, 0.02, s) * (1.0 - smoothstep(1.0, 1.15, s));
      e += (rb * core * (0.5 + 1.3 * stripes) + vec3(1.0) * sparkle * core + palOf(B.x, 4) * exp(-abs(off) / w * 2.5) * 0.35) * on * ends;
    }
  }
  // the wake: rainbow bubbles streaming from the propeller, more as it turns harder
  for (int k = 0; k < 16; k++) {
    float fk = float(k);
    float life = fract(t * (0.35 + u_wake.w * 0.4) + fk / 16.0);
    vec2 bp = u_wake.xy + vec2(-life * 0.75, sin(life * 9.0 + fk * 1.7) * 0.03 * (0.4 + life) + (hash12(vec2(fk, 3.0)) - 0.5) * 0.05 * life);
    float br = (0.004 + 0.016 * life) * (0.6 + u_wake.z);
    float bd = abs(length(p - bp) - br);
    e += dream(fk * 0.13 + t * 0.1) * exp(-bd * 600.0 / (1.0 + life * 2.0)) * (1.0 - life) * 0.9 * (0.6 + u_wake.z);
  }
  // (scaled so a light that stays put builds to about 1.6x itself, however long the trails)
  o = vec4(min(prev + e * u_amt * (1.0 - u_keep) * 1.6, vec3(4.0)), 1.0);
}
`

/** pass 2: the sky, the rocks, the light, the film */
const SKY = COMMON + /* glsl */ `
uniform sampler2D u_light;
uniform int u_mode;
uniform vec3 u_skyc[5];
uniform vec4 u_look;
uniform vec4 u_look2;
uniform vec4 u_aura;
const vec3 INK = vec3(0.141, 0.063, 0.212);
// the era's five colours, stepped through
vec3 ramp(float x) {
  x = fract(x) * 5.0;
  if (x < 1.0) return mix(u_skyc[0], u_skyc[1], x);
  if (x < 2.0) return mix(u_skyc[1], u_skyc[2], x - 1.0);
  if (x < 3.0) return mix(u_skyc[2], u_skyc[3], x - 2.0);
  if (x < 4.0) return mix(u_skyc[3], u_skyc[4], x - 3.0);
  return mix(u_skyc[4], u_skyc[0], x - 4.0);
}
vec3 stars(vec2 p, float scale, float speed, float seed, float t, float pop) {
  vec2 q = p * scale + vec2(t * speed, seed);
  vec2 id = floor(q);
  vec2 f = fract(q) - 0.5;
  float h = hash12(id + seed);
  vec2 off = (hash22(id + seed * 1.7) - 0.5) * 0.6;
  vec2 d = f - off;
  float r = length(d);
  float tw = 0.55 + 0.45 * sin(t * (1.5 + h * 5.0) + h * 40.0) * (0.6 + u_band.y);
  float core = smoothstep(0.07, 0.0, r);
  float spikes = max(0.0, 1.0 - abs(d.x * d.y) * 1400.0) * smoothstep(0.32, 0.0, r) * pop;
  float on = step(0.86, h);
  // pop art stars take the palette; real ones are white, warm or blue by their temperature
  vec3 c = pop > 0.5 ? dream(h * 3.0 + t * 0.02) : mix(vec3(1.0, 0.82, 0.62), vec3(0.7, 0.8, 1.0), fract(h * 13.0));
  return c * (core * 1.4 + spikes * 0.7) * mix(1.0, tw, pop * 0.8 + 0.2) * on;
}
// a striped sun (the sixties' up high, the eighties' sliced on the horizon)
vec3 stripedSun(vec3 col, vec2 p, vec2 sc, float R, vec3 top, vec3 bottom, float t) {
  vec2 sd = p - sc;
  float sr = length(sd);
  float sun = smoothstep(R + 0.005, R, sr);
  float stripe = step(0.0, sin((sd.y - 0.01) * (0.165 / R) * 140.0 - t * 0.5) + 1.0 - smoothstep(-0.02 * R / 0.165, 0.15 * R / 0.165, sd.y) * 2.0);
  vec3 sunc = mix(top, bottom, smoothstep(-R, R, sd.y));
  return mix(col, sunc * (1.0 + 0.25 * u_band.x), sun * stripe);
}

// ── the eras' skies ──
vec3 skyPulp(vec2 p, float t, float A) {
  // fifties pulp: a deep navy night, soft cloud, a ringed planet hanging over it all
  vec3 col = mix(u_skyc[0] * 0.5, u_skyc[0], smoothstep(0.0, 1.1, p.y));
  col += u_skyc[1] * 0.18 * smoothstep(0.45, 0.8, fbm(p * 2.0 + vec2(t * 0.01, 0.0)));
  col += stars(p, 30.0, 0.15, 1.0, t, 1.0) * 0.6 + stars(p, 12.0, 0.4, 7.0, t, 1.0);
  vec2 c = vec2(A * 0.83, 0.25);
  vec2 d = p - c;
  float R = 0.11;
  // the ring: an ellipse tipped 18 degrees; its back half behind the planet, its front half over it
  vec2 rd = rot(0.32) * d;
  float re = length(rd / vec2(2.3, 0.42)) / R;
  float ring = smoothstep(0.02, 0.0, abs(re - 1.0) - 0.16) * (0.75 + 0.25 * sin(re * 60.0));
  vec3 ringc = mix(u_skyc[3], u_skyc[4], 0.4);
  if (rd.y < 0.0) col = mix(col, ringc, ring);
  float body = smoothstep(R + 0.003, R, length(d));
  float bands = sin(d.y * 90.0 + fbm(d * 12.0) * 3.0);
  vec3 pc = mix(u_skyc[2], u_skyc[3], 0.5 + 0.5 * bands);
  pc *= 0.45 + 0.75 * clamp(dot(normalize(vec3(d / R, 0.6)), normalize(vec3(-0.6, -0.5, 0.7))), 0.0, 1.0);
  col = mix(col, pc, body);
  col = mix(col, INK, smoothstep(0.004, 0.0, abs(length(d) - R)) * 0.8);
  if (rd.y >= 0.0) col = mix(col, ringc, ring);
  // a little moon
  vec2 md = p - vec2(A * 0.12, 0.18);
  col = mix(col, u_skyc[4] * (0.6 + 0.5 * smoothstep(0.0, 0.03, md.x + md.y)), smoothstep(0.034, 0.032, length(md)));
  return col;
}
vec3 skyPsychedelic(vec2 p, float t, float A) {
  vec2 q = p + vec2(t * 0.018, 0.0);
  vec2 w = vec2(fbm(q * 1.5 + t * 0.025), fbm(q * 1.5 + vec2(5.2, 1.3) - t * 0.02));
  float v = fbm(q * 1.1 + w * (1.7 + u_band.x * 0.8));
  vec3 deep = mix(vec3(0.05, 0.02, 0.13), vec3(0.13, 0.03, 0.2), smoothstep(0.0, 1.0, p.y)) * (0.8 + 0.4 * fbm(q * 3.0 - t * 0.01));
  float n = 7.0;
  float f = fract(v * n);
  float bands = floor(v * n) / n;
  float cloud = smoothstep(0.42, 0.72, v);
  vec3 c = ramp(bands * 1.3 + t * 0.008 + w.x * 0.4) * (0.55 + 0.25 * u_band.x);
  float line = smoothstep(0.0, 0.035, f) * smoothstep(1.0, 0.965, f);
  vec3 col = mix(INK * 0.5, mix(deep, c, cloud * 0.8), mix(1.0, line, cloud));
  // the sun: striped, its rays turning slowly
  vec2 sc = vec2(A * 0.86, 0.24);
  vec2 sd = p - sc;
  float sr = length(sd);
  float rays = step(0.5, fract(atan(sd.y, sd.x) / TAU * 22.0 + t * 0.012));
  col = mix(col, mix(col, vec3(1.0, 0.85, 0.35), 0.18 + 0.1 * u_band.x), rays * smoothstep(1.1, 0.15, sr) * 0.6);
  col = stripedSun(col, p, sc, 0.165, vec3(1.0, 0.92, 0.2), vec3(1.0, 0.18, 0.55), t);
  col = mix(col, INK, smoothstep(0.006, 0.0, abs(sr - 0.163)) * 0.8);
  // op-art rings, the oil wheel
  float rings = sin(length((p - u_ship.xy) * vec2(0.8, 1.2)) * 70.0 - t * 1.6);
  col *= 1.0 - 0.05 * smoothstep(0.6, 1.0, rings) * u_amt;
  float field = 0.0;
  for (int k = 0; k < 6; k++) {
    float fk = float(k);
    vec2 bc = vec2(fract(0.17 * fk - t * 0.006 * (1.0 + fk * 0.25)) * (A + 0.6) - 0.3, 0.5 + 0.38 * sin(t * 0.05 * (fk + 1.0) + fk * 2.0));
    vec2 bd = p - bc;
    field += (0.006 + 0.004 * u_band.x) / dot(bd, bd);
  }
  col = mix(col, dream(field * 0.05 + t * 0.03 + 0.5) * 0.75, smoothstep(0.9, 1.05, field) * 0.32 * u_amt);
  col = mix(col, INK, smoothstep(0.06, 0.0, abs(field - 0.97)) * 0.35 * u_amt);
  col += stars(p, 26.0, 0.25, 1.0, t, 1.0) * 0.5 + stars(p, 14.0, 0.5, 7.0, t, 1.0) * 0.8 + stars(p, 7.0, 0.9, 13.0, t, 1.0);
  return col;
}
vec3 skyAirbrush(vec2 p, float t, float A) {
  // seventies space art: soft airbrushed nebulae, a great banded gas giant, a starburst
  vec2 q = p + vec2(t * 0.012, 0.0);
  float v = fbm(q * 1.3 + fbm(q * 2.0 - t * 0.01) * 1.2);
  vec3 col = mix(u_skyc[0] * 0.35, u_skyc[0], p.y);
  col = mix(col, u_skyc[1], smoothstep(0.4, 0.85, v) * 0.6);
  col += u_skyc[2] * pow(smoothstep(0.55, 0.95, v), 2.0) * 0.5;
  col += stars(p, 28.0, 0.2, 1.0, t, 0.0) * 0.7 + stars(p, 12.0, 0.45, 7.0, t, 0.0);
  vec2 gc = vec2(A * 0.16, 1.02);
  vec2 d = p - gc;
  float R = 0.42;
  float body = smoothstep(R + 0.004, R, length(d));
  float bands = sin(d.y * 26.0 + fbm(vec2(d.x * 3.0 + t * 0.01, d.y * 18.0)) * 2.5);
  vec3 gcol = mix(u_skyc[3], u_skyc[4], 0.5 + 0.5 * bands);
  gcol *= 0.25 + 0.95 * clamp(dot(normalize(vec3(d / R, 0.5)), normalize(vec3(0.6, -0.7, 0.5))), 0.0, 1.0);
  col = mix(col, gcol, body);
  col += u_skyc[4] * exp(-max(0.0, length(d) - R) * 30.0) * 0.25 * (1.0 - body);
  // the starburst
  vec2 sd = p - vec2(A * 0.84, 0.2);
  float sr = length(sd);
  float spikes = pow(max(0.0, cos(atan(sd.y, sd.x) * 3.0)), 60.0) * exp(-sr * 6.0) + pow(max(0.0, cos(atan(sd.y, sd.x) * 3.0 + 0.5)), 120.0) * exp(-sr * 9.0) * 0.6;
  col += vec3(1.0, 0.9, 0.7) * (exp(-sr * 40.0) * 2.0 + exp(-sr * 8.0) * 0.25 + spikes * 1.2);
  return col;
}
vec3 skySynthwave(vec2 p, float t, float A) {
  // eighties: a gradient dusk over a neon grid running to the horizon, a sliced sun sinking into it
  float hz = 0.66;
  vec3 col = mix(u_skyc[0], u_skyc[1], smoothstep(0.0, hz, p.y));
  col += stars(p, 22.0, 0.08, 1.0, t, 1.0) * 0.6 * (1.0 - smoothstep(0.2, hz, p.y));
  col = stripedSun(col, p, vec2(A * 0.86, hz - 0.02), 0.2, u_skyc[3], u_skyc[2], t);
  col += u_skyc[2] * exp(-abs(p.y - hz) * 30.0) * 0.5;
  if (p.y > hz) {
    float z = 0.06 / (p.y - hz + 0.0001);
    float gx = (p.x - A * 0.5) * z;
    float gz = z + t * 0.9;
    float lx = abs(fract(gx * 1.4) - 0.5) / (fwidth(gx * 1.4) * 1.2);
    float lz = abs(fract(gz) - 0.5) / (fwidth(gz) * 1.2);
    float line = 1.0 - min(min(lx, lz), 1.0);
    vec3 ground = mix(u_skyc[0] * 0.3, vec3(0.0), smoothstep(hz, 1.0, p.y));
    float fade = smoothstep(hz, hz + 0.08, p.y);
    col = ground + u_skyc[4] * line * fade * (1.2 + u_band.x) + u_skyc[4] * 0.15 * exp(-(p.y - hz) * 12.0);
  }
  return col;
}
vec3 skyCgi(vec2 p, float t, float A) {
  // nineties: a rendered gradient and a warp field of streaking stars, out from the middle
  vec3 col = mix(u_skyc[0], u_skyc[1], smoothstep(-0.2, 1.4, p.x / A + p.y * 0.5));
  vec2 c = vec2(A * 0.5, 0.5);
  vec2 d = p - c;
  float r = length(d);
  float a = atan(d.y, d.x);
  for (int k = 0; k < 3; k++) {
    float fk = float(k);
    float n = 70.0 + fk * 40.0;
    float id = floor(a / TAU * n);
    float h = hash12(vec2(id, fk));
    float ac = (id + 0.5) / n * TAU;
    float off = abs(sin(a - ac)) * r;
    float pos = fract(h * 7.0 + t * (0.15 + h * 0.25));
    float head = pos * pos * 1.2;
    float len = 0.02 + head * 0.25;
    float on = step(0.6, h) * smoothstep(len, 0.0, head - r) * step(r, head);
    col += mix(u_skyc[2], u_skyc[3], h) * on * smoothstep(0.003 + r * 0.002, 0.0, off) * (0.6 + head);
  }
  col += u_skyc[4] * exp(-r * 6.0) * 0.25;
  return col;
}
vec3 skyAqua(vec2 p, float t, float A) {
  // the noughties: glossy blue gradients, a gleaming planet's curve below, bokeh drifting
  vec3 col = mix(u_skyc[0], u_skyc[1], smoothstep(0.0, 1.0, p.y));
  vec2 pc = vec2(A * 0.5, 2.05);
  float d = length(p - pc) - 1.25;
  float planet = smoothstep(0.003, 0.0, d);
  vec3 pcol = mix(u_skyc[2], u_skyc[1], smoothstep(-0.25, 0.0, d));
  pcol += vec3(1.0) * smoothstep(-0.03, -0.005, d) * smoothstep(0.0, -0.002, d) * 0.6;
  col = mix(col, pcol, planet);
  col += u_skyc[3] * exp(-max(d, 0.0) * 25.0) * 0.35 * (1.0 - planet);
  for (int k = 0; k < 14; k++) {
    float fk = float(k);
    vec2 bc = vec2(fract(hash12(vec2(fk, 1.0)) - t * 0.008 * (0.5 + hash12(vec2(fk, 2.0)))) * (A + 0.4) - 0.2, hash12(vec2(fk, 3.0)) * 0.9);
    float br = 0.03 + 0.06 * hash12(vec2(fk, 4.0));
    float bd = length(p - bc);
    float disc = smoothstep(br, br * 0.85, bd);
    col += mix(u_skyc[3], u_skyc[4], hash12(vec2(fk, 5.0))) * (disc * 0.12 + smoothstep(br * 0.04, 0.0, abs(bd - br * 0.92)) * 0.12);
  }
  col += stars(p, 20.0, 0.1, 3.0, t, 0.0) * 0.5 * (1.0 - planet);
  return col;
}
vec3 skyFlat(vec2 p, float t, float A) {
  // the tens: flat colour, flat planets, long flat shadows at forty-five degrees
  vec3 col = u_skyc[0];
  vec2 cs[3];
  cs[0] = vec2(A * 0.84, 0.24);
  cs[1] = vec2(A * 0.12, 0.8);
  cs[2] = vec2(A * 0.62, 0.12);
  float rs[3];
  rs[0] = 0.12;
  rs[1] = 0.08;
  rs[2] = 0.035;
  for (int k = 0; k < 3; k++) {
    vec2 c = cs[k] + vec2(sin(t * 0.03 + float(k)) * 0.01, 0.0);
    vec2 d = p - c;
    // the shadow: the disc swept down-right
    float s = clamp(dot(d, vec2(0.7071)), 0.0, 3.0);
    float shadow = step(length(d - vec2(0.7071) * s), rs[k]);
    col = mix(col, col * 0.82, shadow);
  }
  for (int k = 0; k < 3; k++) {
    vec2 c = cs[k] + vec2(sin(t * 0.03 + float(k)) * 0.01, 0.0);
    vec2 d = p - c;
    float disc = smoothstep(rs[k] + 0.002, rs[k], length(d));
    vec3 pc = u_skyc[1 + k];
    pc = mix(pc, pc * 0.82, step(0.0, d.x + d.y));
    col = mix(col, pc, disc);
    if (k == 0) {
      vec2 rd = rot(0.3) * d;
      float ring = step(abs(length(rd / vec2(2.0, 0.35)) - rs[k]), 0.012) * step(0.0, rd.y + 0.0) ;
      col = mix(col, u_skyc[4], ring);
    }
  }
  vec2 q = p * 18.0 + vec2(t * 0.1, 0.0);
  vec2 id = floor(q);
  float h = hash12(id);
  col = mix(col, u_skyc[4], step(0.93, h) * smoothstep(0.08, 0.05, length(fract(q) - 0.5 - (hash22(id) - 0.5) * 0.5)));
  return col;
}
vec3 skyMesh(vec2 p, float t, float A) {
  // the twenties: dark mode -- big soft blobs of colour drifting under frosted glass
  vec3 col = u_skyc[0];
  for (int k = 0; k < 5; k++) {
    float fk = float(k);
    vec2 c = vec2((0.5 + 0.45 * sin(t * 0.04 * (1.0 + fk * 0.3) + fk * 2.1)) * A, 0.5 + 0.4 * cos(t * 0.035 * (1.0 + fk * 0.2) + fk * 1.3));
    float r = 0.35 + 0.1 * sin(t * 0.1 + fk);
    float g = exp(-dot(p - c, p - c) / (r * r));
    col = mix(col, u_skyc[1 + k % 4], g * 0.55 * (0.8 + 0.4 * u_band.x));
  }
  col += stars(p, 30.0, 0.05, 1.0, t, 0.0) * 0.35;
  return col;
}
vec3 skyReal(vec2 p, float t, float A) {
  // the thirties: black space, a band of the galaxy, the Earth's limb below, the sun's glare
  vec3 col = u_skyc[0];
  vec2 g = rot(0.45) * (p - vec2(A * 0.5, 0.5));
  float band = exp(-g.y * g.y * 18.0) * fbm(g * 5.0 + 3.0);
  col += mix(u_skyc[3], vec3(1.0, 0.9, 0.8), 0.5) * band * 0.18;
  col += stars(p, 60.0, 0.02, 1.0, t, 0.0) * 0.35 + stars(p, 32.0, 0.04, 7.0, t, 0.0) * 0.6 + stars(p, 14.0, 0.06, 13.0, t, 0.0) * 0.9;
  vec2 ec = vec2(A * 0.5, 2.25);
  float R = 1.42;
  vec2 d = p - ec;
  float e = length(d) - R;
  vec2 surf = vec2(atan(d.y, d.x) * 6.0 + t * 0.004, e * 30.0);
  float land = smoothstep(0.52, 0.56, fbm(surf * 1.5 + 11.0));
  float cloud = smoothstep(0.45, 0.8, fbm(surf * 2.5 + vec2(t * 0.01, 0.0)));
  vec3 ec_ = mix(u_skyc[1], u_skyc[2], land);
  ec_ = mix(ec_, vec3(0.95), cloud * 0.85);
  // lit from the upper left: the terminator falls across it
  float lit = clamp(0.4 + dot(normalize(d), normalize(vec2(-0.8, -0.6))) * 1.2, 0.05, 1.0);
  col = mix(col, ec_ * lit, smoothstep(0.002, -0.002, e));
  // the air: a thin blue line, glowing off the limb
  col += u_skyc[3] * (exp(-abs(e) * 220.0) * 1.2 + exp(-max(e, 0.0) * 40.0) * 0.35) * lit;
  // the sun's glare, and its ghosts down the lens
  vec2 sp = vec2(A * 0.07, 0.06);
  float sr = length(p - sp);
  col += vec3(1.0, 0.97, 0.9) * (exp(-sr * 30.0) * 3.0 + exp(-sr * 4.0) * 0.18);
  vec2 axis = vec2(A * 0.5, 0.5) - sp;
  for (int k = 1; k < 5; k++) {
    float fk = float(k);
    vec2 gp = sp + axis * (0.6 + fk * 0.35);
    col += mix(u_skyc[4], u_skyc[3], fk / 4.0) * smoothstep(0.02 + fk * 0.012, 0.0, length(p - gp)) * 0.06;
  }
  return col;
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  float t = u_time;
  float grainAmt = u_look.x * u_amt;
  // gate weave: the whole frame sits a hair off, now and then (film eras)
  vec2 weave = (vec2(hash12(vec2(floor(t * 12.0), 1.0)), hash12(vec2(floor(t * 12.0), 2.0))) - 0.5) * 0.9 * u_px * grainAmt;
  vec2 p = screenP(frag + weave);
  float A = aspect();

  vec3 col;
  if (u_mode == 0) col = skyPulp(p, t, A);
  else if (u_mode == 1) col = skyPsychedelic(p, t, A);
  else if (u_mode == 2) col = skyAirbrush(p, t, A);
  else if (u_mode == 3) col = skySynthwave(p, t, A);
  else if (u_mode == 4) col = skyCgi(p, t, A);
  else if (u_mode == 5) col = skyAqua(p, t, A);
  else if (u_mode == 6) col = skyFlat(p, t, A);
  else if (u_mode == 7) col = skyMesh(p, t, A);
  else col = skyReal(p, t, A);

  // the far field: dim rocks drifting slower than the near
  {
    vec2 q = p * 4.0 + vec2(t * 0.18, 0.0);
    vec2 id = floor(q);
    vec2 f = fract(q) - 0.5;
    float h = hash12(id + 31.0);
    if (h > 0.82 && !(u_mode == 3 && p.y > 0.66)) {
      vec2 off = (hash22(id) - 0.5) * 0.4;
      float r = 0.09 + 0.12 * hash12(id + 5.0);
      float s = rockSd(f - off, r, h * 7.0, t * (h - 0.9) * 2.0);
      vec3 rc = u_mode == 8 ? vec3(0.16, 0.15, 0.14) : ramp(h * 5.0 + 0.3) * 0.35 + u_skyc[0] * 0.4;
      float lit = clamp(dot(normalize(f - off + 1e-4), vec2(-0.7, -0.7)) * 0.5 + 0.5, 0.0, 1.0);
      col = mix(col, rc * (0.6 + 0.6 * lit), smoothstep(0.01, -0.01, s) * 0.85);
      if (u_look2.y < 2.5) col = mix(col, INK, smoothstep(0.012, 0.0, abs(s)) * 0.5);
    }
  }
  // round the ship: the sixties' rainbow poster outlines; other eras a soft glow of their own
  {
    vec2 d = rot(-u_ship.w) * (p - u_ship.xy) / u_ship.z - u_aura.xy;
    vec2 rad = u_aura.zw;
    float e = (length(d / rad) - 1.0) * min(rad.x, rad.y);
    if (u_look2.x > 0.01 && e > 0.0 && e < 220.0) {
      float k = e / 34.0 - t * 0.6;
      vec3 bc = dream(floor(k) * 0.16 + t * 0.03);
      float edge = smoothstep(0.0, 0.08, fract(k)) * smoothstep(1.0, 0.92, fract(k));
      float fade = (1.0 - e / 220.0) * (0.55 + 0.3 * (u_lv.x + u_lv.y + u_lv.z) / 3.0);
      col = mix(col, mix(INK, bc, edge), fade * 0.6 * u_amt * u_look2.x);
    } else if (u_look2.x <= 0.01 && e > 0.0 && (u_mode == 3 || u_mode == 4 || u_mode == 5 || u_mode == 7)) {
      col += u_skyc[u_mode == 3 ? 4 : 3] * exp(-e / 60.0) * 0.18 * u_amt * (0.6 + 0.4 * (u_lv.x + u_lv.y + u_lv.z) / 3.0);
    }
  }
  // the near rocks, in their VCO's colours: marbled, neon, glossy, flat or real, by era
  float pxs = 1.5 / u_res.y;
  int rs = int(u_look2.y + 0.5);
  for (int i = 0; i < ${MAX_ROCKS}; i++) {
    if (i >= u_nrock) break;
    vec4 R = u_rock[i];
    vec4 B = u_rockB[i];
    vec2 d = p - R.xy;
    if (dot(d, d) > R.z * R.z * 3.2) continue;
    float s = rockSd(d, R.z, B.z, R.w);
    vec2 rd = rot(R.w) * d / R.z;
    bool pod = mod(B.w, 2.0) >= 1.0;
    bool open = B.w >= 2.0;
    vec3 nrm = normalize(vec3(rd, sqrt(max(0.0, 1.0 - dot(rd, rd)))));
    float lam = clamp(dot(nrm, normalize(vec3(-0.5, -0.6, 0.65))), 0.0, 1.0);
    vec3 fill;
    float outline = 1.0;
    if (rs == 1) {
      // neon: dark glass, a bright rim
      fill = palOf(B.x, 3) * 0.6;
      outline = 0.0;
      col = mix(col, fill, smoothstep(pxs, -pxs, s));
      col += palOf(B.x, 2) * (smoothstep(0.006, 0.0, abs(s)) * 1.2 + exp(-abs(s) * 80.0) * 0.35);
    } else {
      if (rs == 0) {
        float sw = fbm(rd * 2.0 + B.z * 9.0);
        float m = sin((rd.x * 2.6 + sw * 4.0 + rd.y * 1.4) * 3.1416 + t * 0.6);
        fill = mix(palOf(B.x, 0), palOf(B.x, 1), step(0.0, m));
        fill = mix(fill, palOf(B.x, 2), smoothstep(0.82, 1.0, m));
        fill *= (0.55 + 0.6 * lam) * (1.0 - smoothstep(0.16, 0.1, length(rd - vec2(0.3, 0.2) * (B.z - 0.5) * 2.0)) * 0.3);
      } else if (rs == 2) {
        // glossy: smooth shading and a hot specular
        fill = palOf(B.x, 0) * (0.4 + 0.75 * lam);
        fill += vec3(1.0) * pow(clamp(dot(reflect(-normalize(vec3(-0.5, -0.6, 0.65)), nrm), vec3(0, 0, 1)), 0.0, 1.0), 24.0) * 0.8;
        outline = 0.25;
      } else if (rs == 3) {
        // flat: one colour, a flat dark half
        fill = mix(palOf(B.x, 0), palOf(B.x, 0) * 0.78, step(0.0, rd.x + rd.y));
        outline = 0.0;
      } else {
        // real: grey stone, cratered, lit hard, a rim of its VCO's light
        float cr = fbm(rd * 4.0 + B.z * 20.0);
        fill = vec3(0.32, 0.3, 0.28) * (0.15 + 1.1 * lam) * (0.7 + 0.5 * cr);
        fill += palOf(B.x, 4) * pow(1.0 - nrm.z, 3.0) * 0.6;
        outline = 0.0;
      }
      if (pod) {
        float seeds = smoothstep(0.32, 0.25, length(fract(rd * 3.0 + t * 0.1) - 0.5));
        fill = mix(vec3(1.0, 0.78, 0.15), vec3(1.0, 0.4, 0.75), seeds) * (1.0 + 0.3 * sin(t * 4.0));
      }
      col = mix(col, fill, smoothstep(pxs, -pxs, s));
      col = mix(col, INK, smoothstep(0.006, 0.003, abs(s)) * outline);
    }
    if (open && B.y < 0.0) {
      float ring = abs(length(d) - R.z * 1.5);
      float dash = step(0.45, fract(atan(d.y, d.x) / TAU * 14.0 + t * 0.25));
      col = mix(col, palOf(B.x, 2), smoothstep(0.004, 0.0015, ring) * dash * 0.9);
    }
  }
  // the light, in three records that slip apart as much as the era's film does
  vec2 uv = frag / u_res;
  vec2 ca = ((uv - 0.5) * 0.004 + vec2(0.0012, 0.0)) * u_amt * u_look.z;
  vec3 L = vec3(texture(u_light, uv + ca).r, texture(u_light, uv).g, texture(u_light, uv - ca).b);
  col += L * (1.0 - 0.25 * col);
  // the grade
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  if (u_mode == 0) col = mix(col, vec3(lum) * vec3(1.05, 0.98, 0.85), 0.25) + vec3(0.03, 0.025, 0.0);
  else if (u_mode == 2) col *= vec3(1.06, 0.98, 0.9);
  else if (u_mode != 8) col = mix(vec3(lum), col, 1.0 + 0.25 * u_amt);
  if (u_mode != 8 && u_mode != 6) col = max(col, u_skyc[0] * 0.25);
  // Ben-Day halftone in the mids (print eras)
  vec2 hp = rot(0.785) * frag / (5.0 * u_px);
  float dotR = sqrt(clamp(1.0 - lum, 0.0, 1.0)) * 0.55;
  float ht = smoothstep(dotR + 0.08, dotR - 0.08, length(fract(hp) - 0.5));
  col *= 1.0 - 0.14 * ht * u_amt * u_look.y * smoothstep(0.1, 0.5, lum) * smoothstep(0.95, 0.5, lum);
  // the nineties' dither: 4x4 ordered, to a handful of levels
  if (u_mode == 4) {
    vec2 b = mod(floor(frag / max(1.0, u_px)), 4.0);
    float bayer = (mod(b.x + b.y * 4.0 * 3.0 + b.x * 5.0, 16.0)) / 16.0;
    col = floor(col * 10.0 + bayer * u_amt) / 10.0;
  }
  // scanlines (screens of the eighties and nineties)
  col *= 1.0 - u_look.w * u_amt * 0.22 * (0.5 + 0.5 * sin(frag.y / max(1.0, u_px) * 3.1416));
  // grain, a flicker, the odd scratch and fleck of dust (film eras)
  float g = hash12(frag + fract(t * 7.3) * 100.0) - 0.5;
  col += g * 0.06 * grainAmt + g * 0.012 * u_amt;
  col *= 1.0 - 0.025 * grainAmt * hash12(vec2(floor(t * 24.0), 9.0));
  float sx = hash12(vec2(floor(t * 3.0), 4.0));
  float scratch = smoothstep(1.2 * u_px, 0.0, abs(frag.x - sx * u_res.x)) * step(0.7, hash12(vec2(floor(t * 3.0), 6.0)));
  col = mix(col, vec3(1.0, 0.95, 0.85), scratch * 0.18 * grainAmt);
  vec2 dc = frag / (u_px * 3.0) + floor(t * 8.0) * 13.0;
  col = mix(col, INK, step(0.9993, hash12(floor(dc))) * 0.6 * grainAmt);
  // a new era: a flash and a ring of colour sweeping out
  float w = u_look2.z;
  if (w < 1.6) {
    float rr = length((uv - 0.5) * vec2(A, 1.0));
    col = mix(col, vec3(1.0), exp(-w * 5.0) * 0.85);
    col += dream(rr * 2.0 - w) * smoothstep(0.06, 0.0, abs(rr - w * 1.2)) * (1.0 - w / 1.6) * 0.8;
  }
  // the vignette
  vec2 vu = uv - 0.5;
  col *= 1.0 - dot(vu, vu) * (u_mode == 6 ? 0.25 : 0.9);
  o = vec4(col, 1.0);
}
`

const VERT = `#version 300 es
in vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }`

type Prog = { p: WebGLProgram; u: Map<string, WebGLUniformLocation | null> }

export class Space {
  lost = false
  private gl: WebGL2RenderingContext
  private light: Prog
  private sky: Prog
  private tex: WebGLTexture[] = []
  private fbo: WebGLFramebuffer[] = []
  private w = 0
  private h = 0
  private cur = 0
  private half = false

  static create(canvas: HTMLCanvasElement): Space | null {
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, preserveDrawingBuffer: false })
    if (!gl) return null
    return new Space(canvas, gl)
  }

  private constructor(canvas: HTMLCanvasElement, gl: WebGL2RenderingContext) {
    this.gl = gl
    this.half = !!gl.getExtension('EXT_color_buffer_float')
    this.light = this.program(LIGHT)
    this.sky = this.program(SKY)
    const buf = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, buf)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    for (const prog of [this.light, this.sky]) {
      const loc = gl.getAttribLocation(prog.p, 'a')
      gl.enableVertexAttribArray(loc)
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    }
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      this.lost = true
    })
  }

  private program(fs: string): Prog {
    const gl = this.gl
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src)
      gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader')
      return s
    }
    const p = gl.createProgram()!
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VERT))
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs))
    gl.linkProgram(p)
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? 'link')
    return { p, u: new Map() }
  }
  private loc(prog: Prog, name: string) {
    if (!prog.u.has(name)) prog.u.set(name, this.gl.getUniformLocation(prog.p, name))
    return prog.u.get(name)!
  }

  private targets(w: number, h: number) {
    const gl = this.gl
    if (w === this.w && h === this.h && this.tex.length) return
    this.w = w
    this.h = h
    for (const t of this.tex) gl.deleteTexture(t)
    for (const f of this.fbo) gl.deleteFramebuffer(f)
    this.tex = []
    this.fbo = []
    for (let i = 0; i < 2; i++) {
      const t = gl.createTexture()!
      gl.bindTexture(gl.TEXTURE_2D, t)
      if (this.half) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null)
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      const f = gl.createFramebuffer()!
      gl.bindFramebuffer(gl.FRAMEBUFFER, f)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0)
      gl.clearColor(0, 0, 0, 1)
      gl.clear(gl.COLOR_BUFFER_BIT)
      this.tex.push(t)
      this.fbo.push(f)
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
  }

  private common(prog: Prog, f: SpaceFrame, w: number, h: number) {
    const gl = this.gl
    gl.useProgram(prog.p)
    gl.uniform2f(this.loc(prog, 'u_res'), w, h)
    gl.uniform1f(this.loc(prog, 'u_time'), f.time)
    gl.uniform1f(this.loc(prog, 'u_px'), f.px)
    gl.uniform4fv(this.loc(prog, 'u_ship'), f.ship)
    gl.uniform4fv(this.loc(prog, 'u_port'), f.ports.flat())
    gl.uniform4fv(this.loc(prog, 'u_flash'), f.flashes.flat())
    gl.uniform3fv(this.loc(prog, 'u_lv'), f.levels)
    gl.uniform2f(this.loc(prog, 'u_band'), f.bass, f.treble)
    const n = Math.min(MAX_ROCKS, f.rocks.length)
    const a = new Float32Array(MAX_ROCKS * 4)
    const b = new Float32Array(MAX_ROCKS * 4)
    for (let i = 0; i < n; i++) {
      a.set(f.rocks[i].a, i * 4)
      b.set(f.rocks[i].b, i * 4)
    }
    gl.uniform4fv(this.loc(prog, 'u_rock'), a)
    gl.uniform4fv(this.loc(prog, 'u_rockB'), b)
    gl.uniform1i(this.loc(prog, 'u_nrock'), n)
    gl.uniform4fv(this.loc(prog, 'u_wake'), f.wake)
    gl.uniform3fv(this.loc(prog, 'u_pal'), f.palette.flat())
    gl.uniform1f(this.loc(prog, 'u_amt'), f.amount)
  }

  frame(f: SpaceFrame) {
    const gl = this.gl
    if (this.lost || gl.isContextLost()) {
      this.lost = true
      return
    }
    const w = gl.drawingBufferWidth
    const h = gl.drawingBufferHeight
    this.targets(w, h)
    const prev = this.cur
    const next = 1 - prev
    // 1: the light
    this.common(this.light, f, w, h)
    gl.uniform1f(this.loc(this.light, 'u_keep'), 0.78 + 0.18 * f.trails)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.tex[prev])
    gl.uniform1i(this.loc(this.light, 'u_prev'), 0)
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[next])
    gl.viewport(0, 0, w, h)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    // 2: the sky, with it
    this.common(this.sky, f, w, h)
    gl.bindTexture(gl.TEXTURE_2D, this.tex[next])
    gl.uniform1i(this.loc(this.sky, 'u_light'), 0)
    gl.uniform1i(this.loc(this.sky, 'u_mode'), f.sky.mode)
    gl.uniform3fv(this.loc(this.sky, 'u_skyc'), f.skyColors.flat())
    gl.uniform4f(this.loc(this.sky, 'u_look'), f.sky.grain, f.sky.halftone, f.sky.misreg, f.sky.scanlines)
    gl.uniform4f(this.loc(this.sky, 'u_look2'), f.sky.outlines, f.sky.rocks, Math.max(0, f.warp), 0)
    gl.uniform4fv(this.loc(this.sky, 'u_aura'), f.aura)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, w, h)
    gl.drawArrays(gl.TRIANGLES, 0, 3)
    this.cur = next
  }

  dispose() {
    const gl = this.gl
    for (const t of this.tex) gl.deleteTexture(t)
    for (const f of this.fbo) gl.deleteFramebuffer(f)
    gl.deleteProgram(this.light.p)
    gl.deleteProgram(this.sky.p)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
  }
}
