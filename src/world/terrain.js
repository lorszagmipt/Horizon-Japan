// Рельеф: высота земли в любой точке, озёра, река, «вдавливание» дорог в землю и построение мешей ландшафта.
// Главные функции для физики: heightAt (высота земли) и normalAt (наклон).

import { clamp, lerp, rgb, smoothstep, vlerp } from "../core/math.js";
import { fbm2, ridged2, simplex2 } from "./noise.js";
import { LAKES, RIDGE, RIVER, WORLD } from "./mapData.js";
import { MeshBuilder } from "../render/mesh.js";
import { biomeRaw, biomeTmp, sampleBiome } from "./biomes.js";

const FUJI = WORLD.fuji;

// Цвета земли по биомам.
const TERRAIN_COLORS = {
  sakG1: rgb(0x5aa548),
  sakG2: rgb(0x86c25c),
  sakPink: rgb(0xe878b0),
  sakPink2: rgb(0xf4a2c8),
  sakYellow: rgb(0xe8cb3a),
  sakCarpet: rgb(0xeeaac6),
  autG1: rgb(0x8c7336),
  autG2: rgb(0xaa763a),
  autRed: rgb(0xb8352a),
  autLeaf1: rgb(0xb04226),
  autLeaf2: rgb(0xcc7028),
  hiG1: rgb(0x4f7d55),
  hiG2: rgb(0x739a62),
  hiGold: rgb(0xc6ad60),
  hiHeath: rgb(0x8a70a4),
  hiFloor: rgb(0x3f5a3b),
  plG1: rgb(0x5fb044),
  plG2: rgb(0x98cf52),
  plYellow: rgb(0xd9d23e),
  plFloor: rgb(0x4a7a36),
};

// Горный хребет на западе карты (параметры в mapData.js -> RIDGE).
function ridgeHeight(x, z) {
  const e = RIDGE.ax;
  const s = RIDGE.az;
  const o = RIDGE.bx;
  const i = RIDGE.bz;
  const n = o - e;
  const a = i - s;
  const r = n * n + a * a;
  const c = ((x - e) * n + (z - s) * a) / r;
  const u = clamp(c, 0, 1);
  const h = Math.hypot(x - (e + n * u), z - (s + a * u));
  const l = smoothstep(0, 0.25, c) * smoothstep(1, 0.75, c);
  const m = 1 + 0.25 * ridged2(x / 90, z / 90, 2);
  return RIDGE.h * Math.exp(-((h / RIDGE.w) ** 2)) * l * m;
}

// Исходная высота рельефа в точке (холмы, горы на краях, Фудзи) — до вдавливания озёр, реки и дорог.
export function baseHeight(x, z) {
  const wx = x + fbm2(x * 0.0013, z * 0.0013, 2) * 110;
  const wz = z + fbm2(x * 0.0013 + 5.3, z * 0.0013 - 2.7, 2) * 110;
  const [sakura, autumn] = biomeRaw(x, z);
  let h = 22 + fbm2(wx / 820, wz / 820, 4) * 26 + fbm2(wx / 260, wz / 260, 3) * 5;
  h = lerp(h, 14 + (h - 14) * 0.5, sakura * 0.9);
  h += autumn * (ridged2(wx / 400, wz / 400, 3) * 64 - 12);
  const north = smoothstep(-240, -1560, z);
  const fujiMask = smoothstep(FUJI.r * 0.55, FUJI.r * 0.85, Math.hypot(x - FUJI.x, z - FUJI.z));
  h += Math.pow(north, 1.15) * 245 + (ridged2(wx / 560, wz / 560, 3) - 0.4) * 58 * north * fujiMask;
  const ax = Math.abs(x);
  const edge = Math.max(ax - 1380, z - 1390, (-z - 1650) * smoothstep(500, 1500, ax));
  if (edge > 0) {
    const l = 560 * (1 - Math.exp(-edge / 760));
    const m = 0.55 + 0.45 * fbm2(x / 900, z / 900, 3) + 0.28 * ridged2(x / 520, z / 520, 3);
    h += l * m * smoothstep(0, 140, edge);
  }
  const fujiDist = Math.hypot(x - FUJI.x, z - FUJI.z);
  if (fujiDist < FUJI.r) {
    const l = fujiDist / FUJI.r;
    const m = 1.6;
    const p = 0.095;
    let d = FUJI.h * Math.pow(1 - Math.max(l, p), m);
    d -= smoothstep(p * 0.8, 0, l) * 40;
    const ang = Math.atan2(z - FUJI.z, x - FUJI.x);
    d +=
      Math.sin(ang * 31 + Math.sin(ang * 7) * 2) * 22 * smoothstep(0.1, 0.4, l) * (1 - l) * (1 - l);
    h += d;
  }
  h += ridgeHeight(x, z);
  return h;
}

// Расстояние до центра озера в «радиусах»: < 1 — внутри озера.
export function lakeDistance(lake, x, z) {
  const dx = x - lake.x;
  const dz = z - lake.z;
  const cosR = Math.cos(lake.rot);
  const sinR = Math.sin(lake.rot);
  const u = (dx * cosR - dz * sinR) / lake.rx;
  const v = (dx * sinR + dz * cosR) / lake.rz;
  const ang = Math.atan2(v, u);
  const wobble =
    1 + 0.08 * Math.sin(ang * 3 + lake.x * 0.01) + 0.05 * Math.sin(ang * 5 + lake.z * 0.02);
  return Math.hypot(u, v) / wobble;
}

// Ландшафт: сетка высот с шагом WORLD.cell метров.
export class Terrain {
  constructor() {
    this.half = WORLD.gridHalf;
    this.cell = WORLD.cell;
    this.n = Math.round((this.half * 2) / this.cell) + 1;
    this.heights = null;
    this.lakes = LAKES.map((t) => ({ ...t }));
    this.river = null;
  }
  computeBlurField() {
    const e = this.half + 100;
    const s = Math.round((e * 2) / 10) + 1;
    let o = new Float32Array(s * s);
    for (let n = 0; n < s; n++) {
      for (let a = 0; a < s; a++) {
        o[n * s + a] = baseHeight(-e + a * 10, -e + n * 10);
      }
    }
    const i = (n, a, r) => {
      const c = new Float32Array(s * s);
      for (let u = 0; u < s; u++) {
        for (let h = 0; h < s; h++) {
          let l = 0;
          let m = 0;
          for (let p = -r; p <= r; p++) {
            const d = a ? clamp(h + p, 0, s - 1) : h;
            const x = a ? u : clamp(u + p, 0, s - 1);
            l += n[x * s + d];
            m++;
          }
          c[u * s + h] = l / m;
        }
      }
      return c;
    };
    for (let n = 0; n < 3; n++) {
      o = i(o, true, 3);
      o = i(o, false, 3);
    }
    this.blur = {
      a: o,
      n: s,
      step: 10,
      half: e,
    };
  }
  blurAt(x, z) {
    const b = this.blur;
    const gx = clamp((x + b.half) / b.step, 0, b.n - 1.001);
    const gz = clamp((z + b.half) / b.step, 0, b.n - 1.001);
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const fx = gx - ix;
    const fz = gz - iz;
    const n = b.n;
    const arr = b.a;
    return lerp(
      lerp(arr[iz * n + ix], arr[iz * n + ix + 1], fx),
      lerp(arr[(iz + 1) * n + ix], arr[(iz + 1) * n + ix + 1], fx),
      fz,
    );
  }
  computeLakes() {
    for (const lake of this.lakes) {
      const rim = [];
      for (let ang = 0; ang < Math.PI * 2; ang += 0.2) {
        const cosR = Math.cos(lake.rot);
        const sinR = Math.sin(lake.rot);
        const dx = Math.cos(ang) * lake.rx * 1.25;
        const dz = Math.sin(ang) * lake.rz * 1.25;
        rim.push(baseHeight(lake.x + dx * cosR + dz * sinR, lake.z - dx * sinR + dz * cosR));
      }
      rim.sort((a, b) => a - b);
      lake.level = rim[Math.floor(rim.length * 0.2)] - 1.5;
    }
  }
  computeRiver() {
    const t = RIVER.pts;
    const e = [];
    for (let a = 0; a < t.length - 1; a++) {
      const r = t[Math.max(0, a - 1)];
      const c = t[a];
      const u = t[a + 1];
      const h = t[Math.min(t.length - 1, a + 2)];
      const l = Math.ceil(Math.hypot(u[0] - c[0], u[1] - c[1]) / 6);
      for (let m = 0; m < l; m++) {
        const p = m / l;
        const d = p * p;
        const x = d * p;
        const v = (g, b, y, k) =>
          0.5 *
          (2 * b + (-g + y) * p + (2 * g - 5 * b + 4 * y - k) * d + (-g + 3 * b - 3 * y + k) * x);
        e.push({
          x: v(r[0], c[0], u[0], h[0]),
          z: v(r[1], c[1], u[1], h[1]),
        });
      }
    }
    e.push({
      x: t[t.length - 1][0],
      z: t[t.length - 1][1],
    });
    const s = this.lakes.find((a) => a.id === "mirror");
    let o = Infinity;
    let i = false;
    for (const a of e) {
      const r = lakeDistance(s, a.x, a.z);
      a.inLake = r < 1;
      if (a.inLake) {
        i = true;
      }
      let c = baseHeight(a.x, a.z) - 2;
      if (i) {
        c = Math.min(c, s.level);
      } else {
        c = Math.max(c, s.level + 0.05);
      }
      if (a.inLake) {
        c = s.level;
      }
      a.h = Math.min(o - 0.01, c);
      if (a.inLake) {
        a.h = s.level;
      }
      o = a.h;
    }
    for (let a = 0; a < 6; a++) {
      for (let r = 1; r < e.length - 1; r++) {
        if (!e[r].inLake) {
          e[r].h = Math.min(e[r - 1].h, (e[r - 1].h + e[r].h + e[r + 1].h) / 3);
        }
      }
    }
    this.river = {
      samples: e,
      hw: RIVER.hw,
    };
    this.riverHash = new Map();
    const n = 40;
    for (let a = 0; a < e.length - 1; a++) {
      const r = e[a];
      const c = e[a + 1];
      const u = Math.floor((Math.min(r.x, c.x) - 60) / n);
      const h = Math.floor((Math.max(r.x, c.x) + 60) / n);
      const l = Math.floor((Math.min(r.z, c.z) - 60) / n);
      const m = Math.floor((Math.max(r.z, c.z) + 60) / n);
      for (let p = u; p <= h; p++) {
        for (let d = l; d <= m; d++) {
          const x = p * 100003 + d;
          if (!this.riverHash.has(x)) {
            this.riverHash.set(x, []);
          }
          this.riverHash.get(x).push(a);
        }
      }
    }
  }
  // Ближайшая точка реки: d — расстояние, h — уровень воды.
  riverQuery(x, z) {
    if (!this.riverHash) {
      return null;
    }
    const cell = 40;
    const bucket = this.riverHash.get(Math.floor(x / cell) * 100003 + Math.floor(z / cell));
    if (!bucket) {
      return null;
    }
    let best = null;
    let bestD = Infinity;
    const samples = this.river.samples;
    for (const idx of bucket) {
      const p0 = samples[idx];
      const p1 = samples[idx + 1];
      const dx = p1.x - p0.x;
      const dz = p1.z - p0.z;
      const k = clamp(((x - p0.x) * dx + (z - p0.z) * dz) / (dx * dx + dz * dz), 0, 1);
      const px = p0.x + dx * k;
      const pz = p0.z + dz * k;
      const dist = Math.hypot(x - px, z - pz);
      if (dist < bestD) {
        bestD = dist;
        best = {
          d: dist,
          h: lerp(p0.h, p1.h, k),
          i: idx,
          t: k,
          inLake: p0.inLake && p1.inLake,
          dx: dx,
          dz: dz,
        };
      }
    }
    return best;
  }
  // Высота с учётом озёр и русла реки.
  carvedHeight(x, z) {
    let h = baseHeight(x, z);
    for (const lake of this.lakes) {
      const k = lakeDistance(lake, x, z);
      if (k < 2.2) {
        const shore = lake.level + 1.1;
        if (k < 1) {
          h = lake.level - lake.depth * (1 - k * k) - 0.4;
        } else {
          h = lerp(shore - 1.5 * smoothstep(1.25, 1, k), h, smoothstep(1, 2.2, k));
        }
      }
    }
    const river = this.riverQuery(x, z);
    if (river && !river.inLake) {
      const hw = this.river.hw;
      if (river.d < hw * 1.15) {
        h = river.h - 2.6 * (1 - (river.d / (hw * 1.15)) ** 2) - 0.35;
      } else if (river.d < hw + 34) {
        h = lerp(river.h + 0.6, h, smoothstep(hw * 1.15, hw + 34, river.d));
      }
    }
    return h;
  }
  // Строит итоговую сетку высот: carvedHeight + «вдавливание» рельефа под дороги.
  // Возле дороги земля плавно подводится к высоте полотна и опускается на 0.22 м ниже него.
  buildGrid(roads) {
    const n = this.n;
    const cell = this.cell;
    const half = this.half;
    const heights = new Float32Array(n * n);
    const roadMask = new Float32Array(n * n);
    for (let row = 0; row < n; row++) {
      const z = -half + row * cell;
      for (let col = 0; col < n; col++) {
        const x = -half + col * cell;
        let height = this.carvedHeight(x, z);
        const road = roads.nearest(x, z, 110);
        if (road && !road.bridge) {
          const flatW = road.hw + 2.6;
          const dh = Math.abs(height - road.h);
          const blendW = flatW + 12 + road.hw * 0.5 + dh * 1.4;
          if (road.d < blendW) {
            const k = 1 - smoothstep(flatW, blendW, road.d);
            // земля у дороги подводится к высоте полотна, но на 22 см ниже
            height = lerp(height, road.h - 0.22, k);
            roadMask[row * n + col] = k;
          }
        }
        heights[row * n + col] = height;
      }
    }
    this.heights = heights;
    this.roadMask = roadMask;
  }
  // ВЫСОТА ЗЕМЛИ в точке (x, z): интерполяция по треугольникам сетки heights.
  heightAt(x, z) {
    const n = this.n;
    const cell = this.cell;
    const half = this.half;
    const gx = (x + half) / cell;
    const gz = (z + half) / cell;
    if (gx < 0 || gz < 0 || gx >= n - 1 || gz >= n - 1) {
      return baseHeight(x, z);
    }
    const ix = Math.floor(gx);
    const iz = Math.floor(gz);
    const fx = gx - ix;
    const fz = gz - iz;
    const hs = this.heights;
    const h00 = hs[iz * n + ix];
    const h10 = hs[iz * n + ix + 1];
    const h01 = hs[(iz + 1) * n + ix];
    const h11 = hs[(iz + 1) * n + ix + 1];
    return fx > fz
      ? h00 + (h10 - h00) * fx + (h11 - h10) * fz
      : h00 + (h11 - h01) * fx + (h01 - h00) * fz;
  }
  // Нормаль (наклон) поверхности в точке.
  normalAt(x, z) {
    const dx = this.heightAt(x + 2, z) - this.heightAt(x - 2, z);
    const dz = this.heightAt(x, z + 2) - this.heightAt(x, z - 2);
    const len = Math.hypot(dx, 4, dz);
    return [-dx / len, 4 / len, -dz / len];
  }
  groundColor(t, e, s, o, i, n, a, r, c) {
    const u = 0.5 + 0.5 * simplex2(t * 0.004, e * 0.004);
    const h = simplex2(t * 0.02 + 3, e * 0.02);
    const l = Math.max(0, 1 - n - a - r);
    const m = 1 - c;
    let p = vlerp(TERRAIN_COLORS.sakG1, TERRAIN_COLORS.sakG2, u);
    const d = smoothstep(0.38, 0.6, simplex2(t / 120 + 31, e / 120 - 17)) * m;
    const x = smoothstep(0.42, 0.64, simplex2(t / 95 - 8, e / 95 + 21)) * m * (1 - d);
    p = vlerp(p, vlerp(TERRAIN_COLORS.sakPink, TERRAIN_COLORS.sakPink2, u), d * 0.85);
    p = vlerp(p, TERRAIN_COLORS.sakYellow, x * 0.8);
    let v = vlerp(TERRAIN_COLORS.autG1, TERRAIN_COLORS.autG2, u);
    v = vlerp(
      v,
      TERRAIN_COLORS.autRed,
      smoothstep(0.5, 0.68, simplex2(t / 70 + 5, e / 70 + 9)) * m * 0.7,
    );
    let g = vlerp(TERRAIN_COLORS.hiG1, TERRAIN_COLORS.hiG2, u);
    g = vlerp(
      g,
      TERRAIN_COLORS.hiGold,
      smoothstep(0.05, 0.45, simplex2(t / 160 - 3, e / 160 + 4)) * m * 0.8,
    );
    g = vlerp(
      g,
      TERRAIN_COLORS.hiHeath,
      smoothstep(0.5, 0.7, simplex2(t / 80 + 2, e / 80 - 6)) * m * 0.6,
    );
    let b = vlerp(TERRAIN_COLORS.plG1, TERRAIN_COLORS.plG2, u);
    b = vlerp(
      b,
      TERRAIN_COLORS.plYellow,
      smoothstep(0.52, 0.72, simplex2(t / 70 + 13, e / 70 + 3)) * m * 0.45,
    );
    let y = [
      p[0] * n + v[0] * a + g[0] * r + b[0] * l,
      p[1] * n + v[1] * a + g[1] * r + b[1] * l,
      p[2] * n + v[2] * a + g[2] * r + b[2] * l,
    ];
    const k = smoothstep(300, 700, s);
    y = vlerp(y, rgb(0x857a70), k * 0.8);
    y = vlerp(y, rgb(0x6f6c8c), smoothstep(700, 1300, s) * 0.9);
    if (c > 0) {
      const _ = vlerp(TERRAIN_COLORS.autLeaf1, TERRAIN_COLORS.autLeaf2, 0.5 + 0.5 * h);
      const z = [
        TERRAIN_COLORS.sakCarpet[0] * n +
          _[0] * a +
          TERRAIN_COLORS.hiFloor[0] * r +
          TERRAIN_COLORS.plFloor[0] * l,
        TERRAIN_COLORS.sakCarpet[1] * n +
          _[1] * a +
          TERRAIN_COLORS.hiFloor[1] * r +
          TERRAIN_COLORS.plFloor[1] * l,
        TERRAIN_COLORS.sakCarpet[2] * n +
          _[2] * a +
          TERRAIN_COLORS.hiFloor[2] * r +
          TERRAIN_COLORS.plFloor[2] * l,
      ];
      y = vlerp(y, z, c * (0.6 + 0.2 * h) * (1 - k));
    }
    y = vlerp(y, rgb(0xab9a78), smoothstep(0.75, 1, i) * 0.5);
    for (const _ of this.lakes) {
      const z = lakeDistance(_, t, e);
      if (z < 1.5) {
        y = vlerp(y, rgb(0xc4b38a), smoothstep(1.5, 1.05, z) * 0.85);
      }
      if (z < 1) {
        y = vlerp(y, rgb(0x6d8f8a), smoothstep(1, 0.8, z));
      }
    }
    const w = this.riverQuery(t, e);
    if (w && !w.inLake && w.d < this.river.hw + 8) {
      y = vlerp(y, rgb(0xb9b09a), smoothstep(this.river.hw + 8, this.river.hw, w.d) * 0.7);
    }
    const M = 0.92 + 0.08 * clamp(o, 0, 1);
    return [y[0] * M, y[1] * M, y[2] * M];
  }
  // Меши ландшафта кусками, с тремя уровнями детализации.
  buildChunks(t) {
    const e = this.n;
    const s = this.cell;
    const o = this.half;
    const i = this.heights;
    const n = new Float32Array(e * e * 3);
    const a = new Float32Array(e * e * 3);
    const r = new Float32Array(e * e * 4);
    this.flowers = new Float32Array(e * e);
    const c = {
      s: 0,
      a: 0,
      h: 0,
      f: 0,
    };
    for (let l = 0; l < e; l++) {
      for (let m = 0; m < e; m++) {
        const p = i[l * e + Math.max(0, m - 1)];
        const d = i[l * e + Math.min(e - 1, m + 1)];
        const x = i[Math.max(0, l - 1) * e + m];
        const v = i[Math.min(e - 1, l + 1) * e + m];
        const g = p - d;
        const b = x - v;
        const y = 2 * s;
        const k = Math.hypot(g, y, b);
        const w = (l * e + m) * 3;
        n[w] = g / k;
        n[w + 1] = y / k;
        n[w + 2] = b / k;
        const M = -o + m * s;
        const _ = -o + l * s;
        sampleBiome(M, _, c);
        const z = Math.max(0, 1 - c.s - c.a - c.h);
        const T = c.f * clamp(c.s * 1.3 + c.a * 1.3 + c.h * 1 + z * 0.6, 0, 1);
        const S = this.roadMask[l * e + m];
        const E = i[l * e + m];
        const P = this.groundColor(M, _, E, n[w + 1], S, c.s, c.a, c.h, T);
        a[w] = P[0];
        a[w + 1] = P[1];
        a[w + 2] = P[2];
        const F = (l * e + m) * 4;
        r[F] = c.s;
        r[F + 1] = c.a;
        r[F + 2] = c.h;
        r[F + 3] = T;
        const L =
          smoothstep(0.1, 0.5, simplex2(M / 90 + 7, _ / 90 - 3)) *
          (1 - S) *
          (1 - 0.6 * c.a) *
          (1 - 0.7 * T) *
          (1 - smoothstep(250, 480, E));
        this.flowers[l * e + m] = L * (0.55 + 0.45 * c.s);
      }
    }
    this.vertexColors = a;
    this.vertexExt = r;
    const u = [];
    const h = Math.floor((e - 1) / t);
    for (let l = 0; l < h; l++) {
      for (let m = 0; m < h; m++) {
        const p = [];
        for (const y of [1, 2, 5]) {
          const k = new MeshBuilder();
          k.extBytes = true;
          const w = t / y;
          const M = [];
          let _ = Infinity;
          let z = -Infinity;
          for (let D = 0; D <= w; D++) {
            for (let q = 0; q <= w; q++) {
              const W = m * t + q * y;
              const j = l * t + D * y;
              const Y = j * e + W;
              const tt = i[Y];
              _ = Math.min(_, tt);
              z = Math.max(z, tt);
              M.push(
                k.vertex(
                  -o + W * s,
                  tt,
                  -o + j * s,
                  n[Y * 3],
                  n[Y * 3 + 1],
                  n[Y * 3 + 2],
                  [a[Y * 3], a[Y * 3 + 1], a[Y * 3 + 2], this.flowers[Y]],
                  [r[Y * 4], r[Y * 4 + 1], r[Y * 4 + 2], r[Y * 4 + 3]],
                ),
              );
            }
          }
          for (let D = 0; D < w; D++) {
            for (let q = 0; q < w; q++) {
              const W = D * (w + 1) + q;
              k.tri(M[W], M[W + w + 1], M[W + w + 2]);
              k.tri(M[W], M[W + w + 2], M[W + 1]);
            }
          }
          const T = 4 + y * 3;
          const S = (D) => {
            for (let q = 0; q < D.length - 1; q++) {
              const W = D[q];
              const j = D[q + 1];
              const Y = k.pos[W * 3];
              const tt = k.pos[W * 3 + 1];
              const wt = k.pos[W * 3 + 2];
              const It = k.pos[j * 3];
              const I = k.pos[j * 3 + 1];
              const B = k.pos[j * 3 + 2];
              const G = k.col.slice(W * 4, W * 4 + 4);
              const K = k.col.slice(j * 4, j * 4 + 4);
              const rt = k.ext.slice(W * 4, W * 4 + 4);
              const ct = k.ext.slice(j * 4, j * 4 + 4);
              const J = k.vertex(
                Y,
                tt - T,
                wt,
                k.nor[W * 3],
                k.nor[W * 3 + 1],
                k.nor[W * 3 + 2],
                G,
                rt,
              );
              const st = k.vertex(
                It,
                I - T,
                B,
                k.nor[j * 3],
                k.nor[j * 3 + 1],
                k.nor[j * 3 + 2],
                K,
                ct,
              );
              k.quad(W, j, st, J);
              k.quad(W, J, st, j);
            }
          };
          const E = [];
          const P = [];
          const F = [];
          const L = [];
          for (let D = 0; D <= w; D++) {
            E.push(M[D]);
            P.push(M[w * (w + 1) + D]);
          }
          for (let D = 0; D <= w; D++) {
            F.push(M[D * (w + 1)]);
            L.push(M[D * (w + 1) + w]);
          }
          S(E);
          S(P);
          S(F);
          S(L);
          p.push({
            geo: k,
            miny: _,
            maxy: z,
          });
        }
        const d = -o + m * t * s;
        const x = -o + l * t * s;
        const v = t * s;
        const g = p[0].miny;
        const b = p[0].maxy;
        u.push({
          lods: p,
          center: [d + v / 2, (g + b) / 2, x + v / 2],
          radius: Math.hypot(v / 2, v / 2, (b - g) / 2),
        });
      }
    }
    return u;
  }
  buildOuterRing(t, e, s, o) {
    const i = Math.round((e[1] - e[0]) / t) + 1;
    const n = Math.round((e[3] - e[2]) / t) + 1;
    const a = new MeshBuilder();
    const r = new Int32Array(i * n).fill(-1);
    const c = new Float32Array(i * n);
    const u = (p) => e[0] + p * t;
    const h = (p) => e[2] + p * t;
    const l = (p, d) => {
      const x = u(p);
      const v = u(p + 1);
      const g = h(d);
      const b = h(d + 1);
      return !(x >= s[0] + t && v <= s[1] - t && g >= s[2] + t && b <= s[3] - t);
    };
    for (let p = 0; p < n; p++) {
      for (let d = 0; d < i; d++) {
        c[p * i + d] = baseHeight(u(d), h(p));
      }
    }
    const m = (p, d) => {
      const x = d * i + p;
      if (r[x] >= 0) {
        return r[x];
      }
      const v = u(p);
      const g = h(d);
      const b = c[d * i + Math.max(0, p - 1)];
      const y = c[d * i + Math.min(i - 1, p + 1)];
      const k = c[Math.max(0, d - 1) * i + p];
      const w = c[Math.min(n - 1, d + 1) * i + p];
      const M = b - y;
      const _ = k - w;
      const z = 2 * t;
      const T = Math.hypot(M, z, _);
      let S = c[x];
      if (v > s[0] - t && v < s[1] + t && g > s[2] - t && g < s[3] + t) {
        S -= o;
      }
      const E = sampleBiome(v, g, biomeTmp);
      const P = this.groundColor(
        v,
        g,
        S,
        z / T,
        0,
        E.s,
        E.a,
        E.h,
        Math.max(0, simplex2(v * 0.003, g * 0.003)) * 0.6,
      );
      r[x] = a.vertex(v, S, g, M / T, z / T, _ / T, [P[0], P[1], P[2], 0]);
      return r[x];
    };
    for (let p = 0; p < n - 1; p++) {
      for (let d = 0; d < i - 1; d++) {
        if (!l(d, p)) {
          continue;
        }
        const x = m(d, p);
        const v = m(d + 1, p);
        const g = m(d, p + 1);
        const b = m(d + 1, p + 1);
        a.tri(x, g, b);
        a.tri(x, b, v);
      }
    }
    return a;
  }
  buildOuter() {
    const t = this.half - 60;
    const e = this.buildOuterRing(40, [-4400, 4400, -6600, 4400], [-t, t, -t, t], 1.5);
    const s = this.buildOuterRing(
      160,
      [-13000, 13000, -13000, 13000],
      [-4400, 4400, -6600, 4400],
      4,
    );
    return [e, s];
  }
  buildSuperChunks(t, e) {
    const s = this.n;
    const o = this.cell;
    const i = this.half;
    const n = this.heights;
    const a = this.vertexColors;
    const r = this.vertexExt;
    const c = Math.floor((s - 1) / t);
    const u = [];
    const h = 5;
    for (let l = 0; l < c / e; l++) {
      for (let m = 0; m < c / e; m++) {
        const p = new MeshBuilder();
        p.extBytes = true;
        const d = (t * e) / h;
        const x = [];
        for (let g = 0; g <= d; g++) {
          for (let b = 0; b <= d; b++) {
            const y = m * t * e + b * h;
            const k = l * t * e + g * h;
            const w = k * s + y;
            const M = n[k * s + Math.max(0, y - h)];
            const _ = n[k * s + Math.min(s - 1, y + h)];
            const z = n[Math.max(0, k - h) * s + y];
            const T = n[Math.min(s - 1, k + h) * s + y];
            const S = M - _;
            const E = z - T;
            const P = 2 * o * h;
            const F = Math.hypot(S, P, E);
            x.push(
              p.vertex(
                -i + y * o,
                n[w] - 0.4,
                -i + k * o,
                S / F,
                P / F,
                E / F,
                [a[w * 3], a[w * 3 + 1], a[w * 3 + 2], 0],
                [r[w * 4], r[w * 4 + 1], r[w * 4 + 2], r[w * 4 + 3]],
              ),
            );
          }
        }
        for (let g = 0; g < d; g++) {
          for (let b = 0; b < d; b++) {
            const y = g * (d + 1) + b;
            p.tri(x[y], x[y + d + 1], x[y + d + 2]);
            p.tri(x[y], x[y + d + 2], x[y + 1]);
          }
        }
        const v = p.bounds();
        u.push({
          geo: p,
          si: m,
          sj: l,
          center: v.center,
          radius: v.radius,
        });
      }
    }
    return u;
  }
}
