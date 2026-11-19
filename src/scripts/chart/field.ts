/**
 * Champ de hauteur partagé entre le shader (lignes de niveau) et la simulation
 * de particules (courants). Le hash est entier afin que GLSL ES 3.00 et JS
 * produisent exactement le même relief : les particules suivent donc
 * réellement les isolignes dessinées à l'écran.
 */

export const FIELD_GLSL = /* glsl */ `
float wsHash(ivec2 p) {
  uint h = uint(p.x + 32768) * 374761393u + uint(p.y + 32768) * 668265263u;
  h = (h ^ (h >> 13u)) * 1274126177u;
  h ^= h >> 16u;
  return float(h & 0xffffu) / 65535.0;
}

float wsNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = p - i;
  ivec2 ip = ivec2(i);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = wsHash(ip);
  float b = wsHash(ip + ivec2(1, 0));
  float c = wsHash(ip + ivec2(0, 1));
  float d = wsHash(ip + ivec2(1, 1));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float wsField(vec2 p, float t) {
  float h = 0.56 * wsNoise(p + vec2(t * 0.010, t * 0.006));
  vec2 q = vec2(0.8 * p.x + 0.6 * p.y, -0.6 * p.x + 0.8 * p.y) * 2.07;
  h += 0.29 * wsNoise(q + vec2(37.0 - t * 0.016, 37.0 + t * 0.011));
  vec2 r = vec2(0.28 * p.x + 0.96 * p.y, -0.96 * p.x + 0.28 * p.y) * 4.13;
  h += 0.15 * wsNoise(r + vec2(91.0 + t * 0.021, 91.0 - t * 0.017));
  return h;
}
`;

function hash(ix: number, iy: number): number {
  let h =
    (Math.imul(ix + 32768, 374761393) + Math.imul(iy + 32768, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h & 0xffff) / 65535;
}

function noise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * fx * (fx * (fx * 6 - 15) + 10);
  const uy = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const a = hash(ix, iy);
  const b = hash(ix + 1, iy);
  const c = hash(ix, iy + 1);
  const d = hash(ix + 1, iy + 1);
  const ab = a + (b - a) * ux;
  const cd = c + (d - c) * ux;
  return ab + (cd - ab) * uy;
}

/** Miroir JS exact de `wsField` (GLSL). */
export function field(x: number, y: number, t: number): number {
  let h = 0.56 * noise(x + t * 0.01, y + t * 0.006);
  const qx = (0.8 * x + 0.6 * y) * 2.07;
  const qy = (-0.6 * x + 0.8 * y) * 2.07;
  h += 0.29 * noise(qx + 37 - t * 0.016, qy + 37 + t * 0.011);
  const rx = (0.28 * x + 0.96 * y) * 4.13;
  const ry = (-0.96 * x + 0.28 * y) * 4.13;
  h += 0.15 * noise(rx + 91 + t * 0.021, ry + 91 - t * 0.017);
  return h;
}
