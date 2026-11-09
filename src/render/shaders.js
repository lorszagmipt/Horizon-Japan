// Шейдеры (программы для видеокарты) на языке GLSL. Здесь описан внешний вид: освещение, туман, трава, дорожная разметка, вода, небо.

import { PAD_GLSL, PAD_GLSL_FUNCS } from "../world/testGround.js";

const GLSL_COMMON = `
uniform vec3 u_sunDir;
uniform vec3 u_sunColor;
uniform vec3 u_skyTop;
uniform vec3 u_skyHorizon;
uniform vec3 u_skyAmb;
uniform vec3 u_groundAmb;
uniform vec3 u_fogColor;
uniform float u_fogDensity;
uniform float u_fogHeight;
uniform vec3 u_camPos;
uniform float u_time;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x),
             mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm2(vec2 p) {
  return vnoise(p) * 0.6 + vnoise(p * 2.13 + 7.1) * 0.28 + vnoise(p * 4.37 + 3.3) * 0.12;
}

vec3 skyColor(vec3 dir) {
  float h = dir.y;
  vec3 col = mix(u_skyHorizon, u_skyTop, pow(clamp(h, 0.0, 1.0), 0.5));
  col = mix(col, u_skyHorizon * vec3(0.93, 0.95, 1.0), smoothstep(0.0, -0.3, h));
  float sd = max(dot(dir, u_sunDir), 0.0);
  col += u_sunColor * (pow(sd, 6.0) * 0.10 + pow(sd, 48.0) * 0.25);
  return col;
}

// мягкая цветокоррекция: чуть больше насыщенности и S-кривая
vec3 grade(vec3 c) {
  c = max(c, vec3(0.0));
  float l = dot(c, vec3(0.299, 0.587, 0.114));
  c = mix(vec3(l), c, 1.10);
  c = c / (1.0 + max(c - 0.82, 0.0) * 0.9);
  return mix(c, c * c * (3.0 - 2.0 * c), 0.22);
}

vec3 applyFog(vec3 col, vec3 wpos) {
  vec3 d = wpos - u_camPos;
  float dist = length(d);
  vec3 rd = d / max(dist, 0.001);
  // экспоненциальный туман с убыванием по высоте (аналитический интеграл)
  float b = u_fogHeight;
  float camH = max(u_camPos.y, -50.0);
  float ry = rd.y;
  float term = abs(ry) < 0.0005 ? dist : (1.0 - exp(-dist * ry * b)) / (ry * b);
  float fog = 1.0 - exp(-u_fogDensity * exp(-camH * b) * term);
  float sunAmt = pow(max(dot(rd, u_sunDir), 0.0), 5.0);
  vec3 fc = mix(u_fogColor, u_fogColor * 0.6 + u_sunColor * 0.45, sunAmt * 0.6);
  return grade(mix(col, fc, clamp(fog, 0.0, 1.0)));
}

// Рисованное освещение: мягкие «тональные» ступени, полушарный эмбиент, контровой свет
vec3 shadeToon(vec3 albedo, vec3 N, vec3 wpos, float shadow, float foliage) {
  float ndl = dot(N, u_sunDir);
  float wrap = mix(0.12, 0.55, foliage);
  float d = clamp((ndl + wrap) / (1.0 + wrap), 0.0, 1.0);
  float band = smoothstep(0.02, 0.14, d) * 0.62 + smoothstep(0.42, 0.56, d) * 0.38;
  band *= shadow;
  vec3 hemi = mix(u_groundAmb, u_skyAmb, N.y * 0.5 + 0.5);
  // тени слегка окрашены в холодный тон — как на иллюстрациях
  vec3 col = albedo * (hemi + u_sunColor * band);
  vec3 V = normalize(u_camPos - wpos);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
  float back = max(dot(-V, u_sunDir), 0.0);
  col += albedo * u_sunColor * fres * (0.10 + 0.45 * back) * (0.6 + 0.4 * shadow);
  // просвечивание листвы против солнца
  col += albedo * u_sunColor * foliage * pow(back, 3.0) * 0.35;
  return col;
}
`;

const GLSL_SHADOWS = `
#ifdef SHADOWS
uniform highp sampler2DShadow u_shadowMap;
uniform mat4 u_shadowMat;
uniform float u_shadowTexel;
float getShadow(vec3 wpos, vec3 N) {
  vec4 sp = u_shadowMat * vec4(wpos + N * 0.15, 1.0);
  vec3 c = sp.xyz * 0.5 + 0.5;
  if (c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0 || c.z > 1.0) return 1.0;
  float bias = 0.0012;
  float s = 0.0;
  float t = u_shadowTexel;
  s += texture(u_shadowMap, vec3(c.xy + vec2(-t, -t), c.z - bias));
  s += texture(u_shadowMap, vec3(c.xy + vec2(t, -t), c.z - bias));
  s += texture(u_shadowMap, vec3(c.xy + vec2(-t, t), c.z - bias));
  s += texture(u_shadowMap, vec3(c.xy + vec2(t, t), c.z - bias));
  s += texture(u_shadowMap, vec3(c.xy, c.z - bias)) * 2.0;
  s /= 6.0;
  vec2 e = smoothstep(vec2(0.0), vec2(0.08), c.xy) * smoothstep(vec2(1.0), vec2(0.92), c.xy);
  return mix(1.0, s, e.x * e.y);
}
#else
float getShadow(vec3 wpos, vec3 N) { return 1.0; }
#endif
`;

export const WORLD_VS = `
layout(location=0) in vec3 a_pos;
layout(location=1) in vec3 a_nor;
layout(location=2) in vec4 a_col;
layout(location=3) in vec4 a_ext;
#ifdef INSTANCED
layout(location=4) in vec4 a_ipos;
layout(location=5) in vec4 a_iscale;
layout(location=6) in vec4 a_itint;
#endif
uniform mat4 u_model;
uniform mat4 u_viewProj;
uniform float u_time;
uniform vec3 u_tint;
uniform float u_outline;
out vec3 v_wpos;
out vec3 v_nor;
out vec4 v_col;
out vec4 v_ext;
void main() {
  vec3 p = a_pos;
  vec3 n = a_nor;
  vec4 c = a_col;
#ifdef INSTANCED
  p = vec3(p.x * a_iscale.x, p.y * a_iscale.y, p.z * a_iscale.x);
  #ifdef WIND
  float h = max(p.y, 0.0);
  float ph = a_iscale.z;
  float sway = sin(u_time * 1.1 + ph) * 0.6 + sin(u_time * 2.3 + ph * 1.7 + p.x * 0.4) * 0.3;
  p.x += sway * h * 0.010 * (0.3 + c.a);
  p.z += cos(u_time * 0.9 + ph * 1.3) * h * 0.006 * (0.3 + c.a);
  #endif
  // наклон ствола (a_iscale.w) вдоль локальной оси X
  p.x += p.y * a_iscale.w;
  float cs = cos(a_ipos.w), sn = sin(a_ipos.w);
  p = vec3(cs * p.x + sn * p.z, p.y, -sn * p.x + cs * p.z) + a_ipos.xyz;
  n = vec3(cs * n.x + sn * n.z, n.y, -sn * n.x + cs * n.z);
  c.rgb = mix(c.rgb, c.rgb * a_itint.rgb, c.a);
  vec4 wp = vec4(p, 1.0);
#else
  #ifdef OUTLINE
  p += n * u_outline;
  #endif
  vec4 wp = u_model * vec4(p, 1.0);
  n = normalize(mat3(u_model) * n);
  c.rgb = mix(c.rgb, c.rgb * u_tint, c.a);
#endif
  v_wpos = wp.xyz;
  v_nor = n;
  v_col = c;
  v_ext = a_ext;
  gl_Position = u_viewProj * wp;
}
`;

export const WORLD_FS = `
precision highp float;
precision highp sampler2DShadow;
${GLSL_COMMON}
${GLSL_SHADOWS}
in vec3 v_wpos;
in vec3 v_nor;
in vec4 v_col;
in vec4 v_ext;
uniform vec3 u_color;
uniform float u_foliage;
uniform float u_clipY;
uniform float u_emissive;
uniform float u_paintNoise;
uniform float u_sunScale;
#ifdef TEXTURED
uniform sampler2D u_tex;
#endif
out vec4 fragColor;

#ifdef PAD
${PAD_GLSL_FUNCS}
#endif

void main() {
#ifdef CLIP
  if (v_wpos.y < u_clipY) discard;
#endif
#ifdef DEPTH
  fragColor = vec4(1.0);
  return;
#else
#ifdef INSTANCED
  // листва и трава у самой камеры «растворяются» (точечный узор), чтобы не закрывать обзор
  float camNear = distance(u_camPos, v_wpos);
  if (camNear < 3.2 && hash12(floor(gl_FragCoord.xy)) > (camNear - 1.0) / 2.2) discard;
#endif
#ifdef OUTLINE
  fragColor = vec4(applyFog(u_color, v_wpos), 1.0);
  return;
#else
  vec3 N = normalize(v_nor);
  if (!gl_FrontFacing) N = -N;
  vec3 albedo = v_col.rgb * u_color;
  float foliage = u_foliage;
  float gloss = 0.0;
  float emis = u_emissive;
  vec2 wxz = v_wpos.xz;

#ifdef TERRAIN
  // v_ext: веса биомов (сакура, клёны, нагорье) и «лесистость» — от них зависят мелкие детали
  float bS = v_ext.x, bA = v_ext.y, bH = v_ext.z, bF = v_ext.w;
  float bM = max(0.0, 1.0 - bS - bA - bH);
  // живописная вариация цвета: крупные пятна + «мазки кисти»
  float big = fbm2(wxz * 0.006);
  float stroke = vnoise(vec2(wxz.x * 0.05 + wxz.y * 0.02, wxz.y * 0.11 - wxz.x * 0.03));
  albedo *= 0.86 + big * 0.22 + (stroke - 0.5) * 0.10;
  // скалы на крутых склонах
  float steep = smoothstep(0.80, 0.62, N.y);
  if (steep > 0.0) {
    vec3 rock = mix(vec3(0.46, 0.43, 0.47), vec3(0.58, 0.52, 0.50), vnoise(wxz * 0.08));
    rock *= 0.85 + 0.25 * vnoise(vec2(wxz.x * 0.02, v_wpos.y * 0.35));
    rock = mix(rock, vec3(0.40, 0.40, 0.56), smoothstep(450.0, 1300.0, v_wpos.y));
    albedo = mix(albedo, rock, steep);
  }
  // снежные шапки: Фудзи и вершины гор — граница с бороздами (считаем только высоко)
  if (v_wpos.y > 900.0) {
    vec2 fd = wxz - vec2(0.0, -4800.0);
    float fang = atan(fd.y, fd.x);
    float gul = vnoise(vec2(fang * 34.0, v_wpos.y * 0.004)) * 0.7 + vnoise(vec2(fang * 90.0, v_wpos.y * 0.01)) * 0.3;
    float snowLine = 1600.0 + (gul - 0.5) * 520.0;
    float snow = smoothstep(snowLine - 25.0, snowLine + 25.0, v_wpos.y);
    // в бороздах снег спускается ниже
    snow = max(snow, smoothstep(0.62, 0.75, gul) * smoothstep(snowLine - 420.0, snowLine - 200.0, v_wpos.y));
    vec3 snowCol = mix(vec3(0.80, 0.84, 0.96), vec3(1.0, 0.99, 0.98), clamp(N.y * 1.2 - 0.1, 0.0, 1.0));
    albedo = mix(albedo, snowCol, snow);
  }
  float camD = distance(u_camPos, v_wpos);
  if (camD < 150.0) {
    float near = 1.0 - smoothstep(30.0, 120.0, camD);
    float fade = 1.0 - smoothstep(70.0, 150.0, camD);
    // лепестки сакуры, опавшие листья клёнов, камешки нагорья — мелкие пятнышки на земле
    {
      vec2 g = wxz * 2.4;
      vec2 id = floor(g), f = fract(g);
      float dens = (bS * (0.2 + 0.5 * bF) + bA * (0.3 + 0.55 * bF) + bH * 0.1) * fade;
      if (hash12(id + 21.3) > 1.0 - dens) {
        vec2 c = vec2(hash12(id + 7.1), hash12(id + 3.3)) * 0.6 + 0.2;
        float an = hash12(id + 4.4) * 6.28;
        vec2 q = mat2(cos(an), -sin(an), sin(an), cos(an)) * (f - c);
        float sp = smoothstep(0.2, 0.13, length(q * vec2(1.0, 1.7)));
        float k = hash12(id + 5.5);
        float pk = hash12(id + 9.9) * (bS + bA + bH + 0.001);
        vec3 sc = pk < bS ? mix(vec3(1.0, 0.72, 0.84), vec3(1.0, 0.9, 0.95), k)
          : pk < bS + bA ? (k < 0.33 ? vec3(0.86, 0.22, 0.10) : k < 0.66 ? vec3(0.95, 0.50, 0.10) : vec3(0.97, 0.76, 0.20))
          : vec3(0.62, 0.60, 0.60) * (0.8 + 0.4 * k);
        albedo = mix(albedo, sc, sp * (1.0 - steep));
      }
    }
    // цветы на лугах: палитра своя у каждого биома
    if (v_col.a > 0.02) {
      vec2 g = wxz * 1.6;
      vec2 id = floor(g), f = fract(g);
      float hsh = hash12(id + 13.7);
      vec2 c = vec2(hash12(id + 2.3), hash12(id + 8.1)) * 0.6 + 0.2;
      float fl = step(1.0 - v_col.a * 0.42, hsh) * smoothstep(0.16, 0.09, length(f - c)) * fade;
      float k = hash12(id + 4.9);
      float bp = hash12(id + 6.6) * (bS + bA + bH + bM + 0.001);
      vec3 fc = bp < bS ? (k < 0.35 ? vec3(1.0, 0.62, 0.80) : k < 0.6 ? vec3(1.0, 0.97, 0.95) : k < 0.85 ? vec3(1.0, 0.86, 0.20) : vec3(0.95, 0.40, 0.70))
        : bp < bS + bA ? (k < 0.6 ? vec3(0.95, 0.18, 0.12) : vec3(1.0, 0.95, 0.90))
        : bp < bS + bA + bH ? (k < 0.45 ? vec3(0.66, 0.50, 1.0) : k < 0.75 ? vec3(0.50, 0.62, 1.0) : vec3(1.0, 0.98, 0.95))
        : (k < 0.3 ? vec3(1.0, 0.97, 0.92) : k < 0.55 ? vec3(1.0, 0.84, 0.25) : k < 0.8 ? vec3(1.0, 0.60, 0.78) : vec3(0.72, 0.60, 1.0));
      albedo = mix(albedo, fc * 0.85, fl);
    }
    // травинки-штрихи рядом с камерой
    float blade = vnoise(wxz * 1.7) * vnoise(wxz * 0.6 + 4.0);
    albedo *= 1.0 + (blade - 0.25) * 0.18 * near * (1.0 - steep);
  }
#endif

#ifdef ROAD
  {
    float s = v_ext.x;
    float vv = v_ext.y;
    float hw = v_ext.z;
    float lane = v_ext.w;
    float as = abs(s);
    // e — расстояние до края асфальта (< 0 — асфальт). У перекрёстков край ближе к оси на поправку,
    // которая приходит в альфе цвета вершины (0…1 → 0…-12 м, см. DELTA_RANGE в world/junctions.js)
    float e = as - hw - v_col.a * 12.0;
    float aa = max(fwidth(e), 0.02) * 1.2;
    // въезд перекрёстка (lane 5): потёртость полос плавно появляется к концу въезда (её сила — в vv)
    float wearK = lane > 4.5 ? clamp(vv, 0.0, 1.0) : 1.0;
    float n1 = vnoise(wxz * 0.9);
    float n2 = vnoise(wxz * 0.11);
    vec3 asphalt = vec3(0.25, 0.255, 0.285) * (0.9 + n1 * 0.10 + n2 * 0.12);
    // светлая колея посередине полос
    asphalt *= 1.0 + 0.05 * wearK * smoothstep(0.3, 0.0, abs(fract(as / max(hw * 0.5, 1.0)) - 0.5) - 0.2);
    vec3 shoulder = vec3(0.56, 0.52, 0.46) * (0.85 + n1 * 0.2);
    vec3 col = mix(asphalt, shoulder, smoothstep(-aa, aa, e));
    vec3 white = vec3(0.93, 0.93, 0.90);
    vec3 yellow = vec3(0.98, 0.76, 0.18);
    float m = 0.0;
    // боковые линии (с разрывом на примыканиях других дорог)
    float ecode = floor(v_col.b * 3.0 + 0.5);
    float noEdge = (s > 0.0) ? mod(ecode, 2.0) : step(1.5, ecode);
    m = max(m, smoothstep(aa, 0.0, abs(e + 0.45) - 0.11) * (1.0 - noEdge));
    vec3 mcol = white;
    if (lane < 1.5) {
      // двухполосная дорога: прерывистая осевая
      float dash = step(fract(vv / 10.0), 0.5);
      m = max(m, smoothstep(aa, 0.0, as - 0.08) * dash);
    } else if (lane < 2.5) {
      // шоссе: двойная жёлтая + прерывистые разделители полос
      float dy = smoothstep(aa, 0.0, abs(as - 0.22) - 0.07);
      if (dy > m) { mcol = yellow; m = dy; }
      float dash = step(fract(vv / 12.0), 0.45);
      m = max(m, smoothstep(aa, 0.0, abs(as - hw * 0.52) - 0.07) * dash);
    } else if (lane < 3.5) {
      // деревенская дорога — только бордюрные полосы
    } else if (lane < 4.5) {
      // горный серпантин: сплошная жёлтая осевая
      float dy = smoothstep(aa, 0.0, as - 0.09);
      if (dy > m) { mcol = yellow; m = dy; }
    }
    // (lane 5 — въезд перекрёстка: только линия по краю)
    m *= 0.92 * (0.85 + 0.15 * n1) * (1.0 - smoothstep(0.0, 0.05, e));
    col = mix(col, mcol, m);
    // лепестки сакуры и опавшие листья на асфальте (гуще у обочин)
    float edge = 0.15 + 0.85 * smoothstep(-hw * 0.8, 0.5, e);
    float petals = 0.0, leaves = 0.0;
    vec3 leafCol = vec3(0.0);
    if (v_col.r > 0.01) {
      vec2 g = wxz * 3.2;
      vec2 id = floor(g), f = fract(g);
      float hsh = hash12(id);
      vec2 c = vec2(hash12(id + 7.1), hash12(id + 3.3)) * 0.6 + 0.2;
      float dens = v_col.r * edge * 0.55;
      float d = length((f - c) * vec2(1.0, 1.7));
      petals = step(1.0 - dens, hsh) * smoothstep(0.17, 0.11, d);
    }
    if (v_col.g > 0.01) {
      vec2 g = wxz * 2.2 + 5.0;
      vec2 id = floor(g), f = fract(g);
      float hsh = hash12(id + 1.7);
      vec2 c = vec2(hash12(id + 2.1), hash12(id + 9.3)) * 0.5 + 0.25;
      float dens = v_col.g * edge * 0.6;
      vec2 q = f - c;
      float an = hash12(id + 4.4) * 6.28;
      q = mat2(cos(an), -sin(an), sin(an), cos(an)) * q;
      float d = length(q * vec2(1.0, 1.8));
      leaves = step(1.0 - dens, hsh) * smoothstep(0.22, 0.15, d);
      float k = hash12(id + 5.5);
      leafCol = k < 0.33 ? vec3(0.86, 0.22, 0.10) : k < 0.66 ? vec3(0.95, 0.52, 0.10) : vec3(0.97, 0.78, 0.20);
    }
    vec3 petalCol = mix(vec3(1.0, 0.70, 0.80), vec3(1.0, 0.92, 0.95), hash12(floor(wxz * 3.2) + 0.5));
    col = mix(col, petalCol, petals);
    col = mix(col, leafCol, leaves);
    albedo = col * u_color;
    gloss = 0.08 * (1.0 - petals) * (1.0 - leaves);
  }
#endif

#ifdef PAD
  // площадка полигона: асфальт, сетка и разметка (world/testGround.js)
${PAD_GLSL}
#endif

#ifdef TEXTURED
  albedo = texture(u_tex, v_ext.xy).rgb * u_color;
  emis = 0.22;
#endif

#ifdef CARMAT
  gloss = v_ext.x;
  emis = v_ext.y + v_ext.z * u_emissive;
#endif

  float sh = getShadow(v_wpos, N) * u_sunScale;
  vec3 col = shadeToon(albedo, N, v_wpos, sh, foliage);

  if (gloss > 0.0) {
    vec3 V = normalize(u_camPos - v_wpos);
    vec3 R = reflect(-V, N);
    float fres = 0.08 + 0.92 * pow(1.0 - max(dot(N, V), 0.0), 4.0);
    vec3 env = skyColor(R);
    // «студийная» линия горизонта в отражении — придаёт кузову объём
    float horizon = smoothstep(-0.02, 0.06, R.y);
    env = mix(u_groundAmb * 0.55 + vec3(0.06), env, horizon);
    env += vec3(0.35) * smoothstep(0.02, 0.0, abs(R.y - 0.04)) ;
    float spec = pow(max(dot(R, u_sunDir), 0.0), 90.0);
    float specBand = smoothstep(0.45, 0.55, spec);
    col = mix(col, env, fres * gloss);
    col += u_sunColor * (specBand * 0.9 + spec * 0.4) * gloss * sh;
  }
  col += albedo * emis;
  col = applyFog(col, v_wpos);
  fragColor = vec4(col, 1.0);
#endif
#endif
}
`;

export const SKY_VS = `
layout(location=0) in vec3 a_pos;
uniform mat4 u_viewProj;
uniform vec3 u_camPos;
out vec3 v_dir;
void main() {
  v_dir = a_pos;
  vec4 p = u_viewProj * vec4(a_pos * 20000.0 + u_camPos, 1.0);
  gl_Position = p.xyww;
}
`;

export const SKY_FS = `
precision highp float;
${GLSL_COMMON}
in vec3 v_dir;
out vec4 fragColor;
void main() {
  vec3 d = normalize(v_dir);
  vec3 col = skyColor(d);
  float sd = dot(d, u_sunDir);
  // солнечный диск с мягким ореолом
  col = mix(col, vec3(1.0, 0.98, 0.9), smoothstep(0.9993, 0.9996, sd));
  col += u_sunColor * smoothstep(0.985, 1.0, sd) * 0.25;
  // лёгкие перистые мазки высоко в небе
  vec2 uv = d.xz / max(d.y + 0.25, 0.05);
  float c = fbm2(uv * 1.3 + vec2(u_time * 0.004, 0.0));
  float streak = smoothstep(0.55, 0.85, c) * smoothstep(0.02, 0.35, d.y) * 0.35;
  col = mix(col, vec3(1.0, 0.97, 0.98), streak);
  fragColor = vec4(grade(col), 1.0);
}
`;

export const CLOUD_VS = `
layout(location=0) in vec3 a_pos;
layout(location=4) in vec4 a_ipos;   // центр, размер
layout(location=5) in vec4 a_iscale; // аспект, индекс текстуры, прозрачность, -
uniform mat4 u_viewProj;
uniform vec3 u_camRight;
uniform vec3 u_camUp;
out vec2 v_uv;
out float v_alpha;
out vec3 v_wpos;
void main() {
  vec2 q = a_pos.xy;
  float idx = a_iscale.y;
  v_uv = vec2((q.x * 0.49 + 0.5 + idx) * 0.25, 0.5 - q.y * 0.5);
  v_alpha = a_iscale.z;
  vec3 up = vec3(0.0, 1.0, 0.0);
  vec3 wp = a_ipos.xyz + u_camRight * q.x * a_ipos.w * a_iscale.x + up * q.y * a_ipos.w;
  v_wpos = wp;
  gl_Position = u_viewProj * vec4(wp, 1.0);
}
`;

export const CLOUD_FS = `
precision highp float;
${GLSL_COMMON}
uniform sampler2D u_tex;
in vec2 v_uv;
in float v_alpha;
in vec3 v_wpos;
out vec4 fragColor;
void main() {
  vec4 t = texture(u_tex, v_uv);
  if (t.a < 0.01) discard;
  // освещение облака: тёплый верх, сиреневые тени снизу
  vec3 lit = mix(vec3(0.72, 0.72, 0.86), vec3(1.0, 0.98, 0.95) + u_sunColor * 0.08, t.r);
  vec3 col = applyFog(lit, mix(u_camPos, v_wpos, 0.35));
  fragColor = vec4(col, t.a * v_alpha);
}
`;

export const WATER_VS = `
layout(location=0) in vec3 a_pos;
layout(location=1) in vec3 a_nor;
layout(location=2) in vec4 a_col;
layout(location=3) in vec4 a_ext;
uniform mat4 u_viewProj;
out vec3 v_wpos;
out vec4 v_ext;
out vec4 v_clip;
out vec4 v_col;
void main() {
  v_wpos = a_pos;
  v_ext = a_ext;
  v_col = a_col;
  v_clip = u_viewProj * vec4(a_pos, 1.0);
  gl_Position = v_clip;
}
`;

export const WATER_FS = `
precision highp float;
${GLSL_COMMON}
uniform sampler2D u_reflTex;
uniform float u_useRefl;
uniform mat4 u_reflMat;
in vec3 v_wpos;
in vec4 v_ext;
in vec4 v_clip;
in vec4 v_col;
out vec4 fragColor;
void main() {
  vec2 p = v_wpos.xz;
  float flow = v_ext.x; // 0 — озеро, 1 — река
  vec2 fp = flow > 0.5 ? vec2(v_ext.w * 1.4, v_ext.z * 0.10 - u_time * 1.1) : p * 0.12;
  float w1 = vnoise(fp * 2.0 + u_time * 0.15);
  float w2 = vnoise(fp * 3.7 - u_time * 0.21);
  vec3 N = normalize(vec3((w1 - 0.5) * 0.18, 1.0, (w2 - 0.5) * 0.18));
  vec3 V = normalize(u_camPos - v_wpos);
  float fres = 0.12 + 0.88 * pow(1.0 - max(dot(N, V), 0.0), 4.0);
  vec3 R = reflect(-V, N);
  vec3 refl = skyColor(R);
  if (u_useRefl > 0.5) {
    vec4 rp = u_reflMat * vec4(v_wpos, 1.0);
    vec2 suv = rp.xy / rp.w * 0.5 + 0.5;
    suv.x += (w1 - 0.5) * 0.02;
    suv.y += (w2 - 0.5) * 0.02;
    refl = texture(u_reflTex, suv).rgb;
  }
  vec3 deep = v_col.rgb;
  vec3 col = mix(deep, refl, clamp(fres * 0.85 + 0.12, 0.0, 1.0));
  // блики солнца
  float sp = pow(max(dot(R, u_sunDir), 0.0), 220.0);
  col += u_sunColor * smoothstep(0.3, 0.6, sp) * 1.2;
  // пена на реке и у берегов
  float foam = smoothstep(0.62, 0.78, vnoise(fp * 6.0)) * flow * 0.5;
  foam += smoothstep(0.75, 1.0, v_ext.y) * 0.5 * (0.5 + 0.5 * vnoise(p * 0.8 + u_time * 0.3));
  col = mix(col, vec3(0.95, 0.98, 1.0), clamp(foam, 0.0, 1.0));
  col = applyFog(col, v_wpos);
  fragColor = vec4(col, 1.0);
}
`;

export const PARTICLE_VS = `
layout(location=0) in vec3 a_pos;
layout(location=4) in vec4 a_ipos;   // xyz, размер
layout(location=5) in vec4 a_iscale; // ось вращения xyz, угол
layout(location=6) in vec4 a_itint;  // цвет, альфа
uniform mat4 u_viewProj;
uniform vec3 u_camRight;
uniform vec3 u_camUp;
uniform float u_billboard;
out vec2 v_uv;
out vec4 v_col;
out vec3 v_wpos;
out vec3 v_nor;
vec3 rotAxis(vec3 v, vec3 ax, float a) {
  float c = cos(a), s = sin(a);
  return v * c + cross(ax, v) * s + ax * dot(ax, v) * (1.0 - c);
}
void main() {
  vec2 q = a_pos.xy;
  v_uv = q;
  v_col = a_itint;
  vec3 wp;
  if (u_billboard > 0.5) {
    float c = cos(a_iscale.w), s = sin(a_iscale.w);
    vec2 r = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
    wp = a_ipos.xyz + (u_camRight * r.x + u_camUp * r.y) * a_ipos.w;
    v_nor = vec3(0.0, 1.0, 0.0);
  } else {
    vec3 ax = normalize(a_iscale.xyz + vec3(0.0001));
    vec3 lp = vec3(q.x, 0.0, q.y * 0.75) * a_ipos.w;
    wp = a_ipos.xyz + rotAxis(lp, ax, a_iscale.w);
    v_nor = rotAxis(vec3(0.0, 1.0, 0.0), ax, a_iscale.w);
  }
  v_wpos = wp;
  gl_Position = u_viewProj * vec4(wp, 1.0);
}
`;

export const PARTICLE_FS = `
precision highp float;
${GLSL_COMMON}
uniform float u_billboard;
in vec2 v_uv;
in vec4 v_col;
in vec3 v_wpos;
in vec3 v_nor;
out vec4 fragColor;
void main() {
  if (u_billboard > 0.5) {
    float d = length(v_uv);
    float a = smoothstep(1.0, 0.2, d) * v_col.a;
    if (a < 0.01) discard;
    vec3 col = v_col.rgb * (0.75 + 0.35 * u_sunColor.r * (0.5 + 0.5 * v_uv.y));
    fragColor = vec4(applyFog(col, v_wpos), a);
  } else {
    // форма лепестка/листика
    vec2 u = v_uv;
    float shape = length(vec2(u.x * 1.25, u.y)) - 0.85 + 0.25 * smoothstep(0.6, 1.0, u.y) * (1.0 - abs(u.x) * 3.0);
    if (shape > 0.0) discard;
    vec3 N = normalize(v_nor);
    if (!gl_FrontFacing) N = -N;
    float l = 0.65 + 0.45 * abs(dot(N, u_sunDir));
    vec3 col = v_col.rgb * (u_skyAmb * 0.6 + u_sunColor * l * 0.75);
    fragColor = vec4(applyFog(col, v_wpos), 1.0);
  }
}
`;

export const TRAIL_VS = `
layout(location=0) in vec3 a_pos;
layout(location=2) in vec4 a_col;
uniform mat4 u_viewProj;
uniform mat4 u_model;
out vec4 v_col;
out vec3 v_wpos;
void main() {
  v_col = a_col;
  vec4 wp = u_model * vec4(a_pos, 1.0);
  v_wpos = wp.xyz;
  gl_Position = u_viewProj * wp;
}
`;

export const TRAIL_FS = `
precision highp float;
${GLSL_COMMON}
in vec4 v_col;
in vec3 v_wpos;
out vec4 fragColor;
void main() {
  if (v_col.a < 0.01) discard;
  fragColor = vec4(applyFog(v_col.rgb, v_wpos), v_col.a);
}
`;
