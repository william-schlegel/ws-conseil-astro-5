import { FIELD_GLSL } from "./field";

export const MAX_PINGS = 6;

export const QUAD_VERT = /* glsl */ `#version 300 es
in vec2 a_pos;
void main() {
  gl_Position = vec4(a_pos, 0.0, 1.0);
}
`;

/** Carte : bandes bathymétriques + lignes de niveau + graticule + ondes sonar. */
export const FIELD_FRAG = /* glsl */ `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2 u_res;
uniform float u_dpr;
uniform float u_time;
uniform vec2 u_off;
uniform float u_scale;
uniform vec3 u_mouse;
uniform vec4 u_ping[${MAX_PINGS}];
uniform vec2 u_grid;
uniform float u_boost;

${FIELD_GLSL}

void main() {
  vec2 px = vec2(gl_FragCoord.x, u_res.y - gl_FragCoord.y) / u_dpr;
  vec2 view = u_res / u_dpr;
  vec2 P = px / u_scale + u_off;
  float h = wsField(P, u_time);

  // Houle sous le curseur : les isolignes s'écartent autour du pointeur.
  vec2 dm = px - u_mouse.xy;
  float lamp = exp(-dot(dm, dm) / (2.0 * 190.0 * 190.0)) * u_mouse.z;
  h += 0.045 * lamp;

  // Ondes sonar : anneaux qui déforment le relief en se propageant.
  float glow = 0.0;
  for (int i = 0; i < ${MAX_PINGS}; i++) {
    vec4 pg = u_ping[i];
    if (pg.w <= 0.001) continue;
    float d = length(px - pg.xy) - pg.z;
    float w = 34.0 + pg.z * 0.035;
    float env = exp(-(d * d) / (w * w));
    h += pg.w * 0.03 * env * cos(d * 0.085);
    glow += pg.w * (exp(-(d * d) / 5.0) * 0.9 + env * 0.1);
  }

  float levels = 21.0;
  float v = h * levels;
  float hw = 0.42 * u_dpr + 0.1;
  float dl = abs(fract(v + 0.5) - 0.5) / max(fwidth(v), 1e-5);
  float line = 1.0 - smoothstep(hw - 0.5, hw + 0.5, dl);
  float v5 = v / 5.0;
  float dl5 = abs(fract(v5 + 0.5) - 0.5) / max(fwidth(v5), 1e-5);
  float idx = 1.0 - smoothstep(hw * 1.5 - 0.5, hw * 1.5 + 0.5, dl5);

  float band = floor(v) / levels;
  float tone = mix(h, band, 0.65);
  vec3 abyss = vec3(0.006, 0.034, 0.066);
  vec3 deep = vec3(0.0, 0.082, 0.15);
  vec3 shoal = vec3(0.0, 0.165, 0.29);
  vec3 col = mix(abyss, deep, smoothstep(0.24, 0.56, tone));
  col = mix(col, shoal, smoothstep(0.56, 0.86, tone) * 0.75);

  vec3 lineCol = vec3(0.36, 0.62, 0.78);
  vec3 mint = vec3(0.173, 0.867, 0.608);
  col += lineCol * line * 0.125;
  col += mix(lineCol, mint, 0.55) * idx * 0.19;
  col += mint * (line * 0.2 + idx * 0.2 + 0.014) * lamp;
  col += mint * glow * 0.5;
  col += mint * (line + idx) * min(glow, 1.0) * 0.45;

  // Graticule : croix de repérage façon carte marine.
  vec2 g = px + u_grid;
  float cell = 168.0;
  vec2 gd = abs(fract(g / cell + 0.5) - 0.5) * cell;
  float thinX = 1.0 - smoothstep(0.0, 0.9, gd.x);
  float thinY = 1.0 - smoothstep(0.0, 0.9, gd.y);
  float cross = thinX * (1.0 - smoothstep(5.0, 6.0, gd.y))
              + thinY * (1.0 - smoothstep(5.0, 6.0, gd.x));
  col += vec3(0.5, 0.75, 0.85) * min(cross, 1.0) * 0.17;
  col += vec3(0.4, 0.6, 0.75) * max(thinX, thinY) * 0.016;

  vec2 uv = px / view;
  float vg = 1.0 - smoothstep(0.3, 1.2, length((uv - 0.5) * vec2(1.0, 0.9)) * 1.45);
  col *= mix(0.5, 1.0, vg);

  col += (wsHash(ivec2(gl_FragCoord.xy)) - 0.5) / 255.0;
  outColor = vec4(col * u_boost, 1.0);
}
`;

export const PARTICLE_VERT = /* glsl */ `#version 300 es
in vec2 a_pos;
in vec4 a_col;
in float a_size;
uniform vec2 u_view;
uniform float u_dpr;
uniform float u_sizeMul;
out vec4 v_col;
void main() {
  vec2 c = a_pos / u_view * 2.0 - 1.0;
  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);
  gl_PointSize = a_size * u_dpr * u_sizeMul;
  v_col = a_col;
}
`;

export const PARTICLE_FRAG = /* glsl */ `#version 300 es
precision mediump float;
in vec4 v_col;
uniform float u_point;
uniform float u_boost;
out vec4 outColor;
void main() {
  float a = v_col.a * u_boost;
  if (u_point > 0.5) {
    float d = length(gl_PointCoord * 2.0 - 1.0);
    a *= 1.0 - smoothstep(0.25, 1.0, d);
  } else if (u_point < -0.5) {
    // halo : large tache très douce, donne du corps aux zones denses
    float d = length(gl_PointCoord * 2.0 - 1.0);
    float f = 1.0 - smoothstep(0.0, 1.0, d);
    a *= f * f * 0.085;
  }
  outColor = vec4(v_col.rgb * a, a);
}
`;
