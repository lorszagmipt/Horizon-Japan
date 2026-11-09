// Дорожная сеть: сглаживание точек трасс в кривые, высота полотна, мосты и тоннель, поиск ближайшей точки дороги (nearest) и меши асфальта.

import { clamp, lerp, smoothstep } from "../core/math.js";
import { RIDGE, ROADS } from "./mapData.js";
import { MeshBuilder } from "../render/mesh.js";
import { biomeAt } from "./biomes.js";
import { baseHeight } from "./terrain.js";
import { buildJunctions } from "./junctions.js";

// Расстояние между соседними точками дороги после сглаживания, метров.
const SAMPLE_STEP = 2;

// Сглаживает ломаную из точек ROADS[...].pts в плавную кривую (сплайн Катмулла–Рома) с шагом SAMPLE_STEP.
function splineSample(f, t) {
  const e = f.slice();
  const s = e.length;
  const o = (c) =>
    t
      ? e[((c % s) + s) % s]
      : c < 0
        ? [2 * e[0][0] - e[1][0], 2 * e[0][1] - e[1][1]]
        : c >= s
          ? [2 * e[s - 1][0] - e[s - 2][0], 2 * e[s - 1][1] - e[s - 2][1]]
          : e[c];
  const i = [];
  const n = t ? s : s - 1;
  for (let c = 0; c < n; c++) {
    const u = o(c - 1);
    const h = o(c);
    const l = o(c + 1);
    const m = o(c + 2);
    const p = Math.max(Math.hypot(h[0] - u[0], h[1] - u[1]) ** 0.5, 0.001);
    const d = Math.max(Math.hypot(l[0] - h[0], l[1] - h[1]) ** 0.5, 0.001);
    const x = Math.max(Math.hypot(m[0] - l[0], m[1] - l[1]) ** 0.5, 0.001);
    const v = 0;
    const g = p;
    const b = g + d;
    const y = b + x;
    const k = Math.max(8, Math.ceil(Math.hypot(l[0] - h[0], l[1] - h[1]) / 0.5));
    for (let w = 0; w < k; w++) {
      const M = g + ((b - g) * w) / k;
      const _ = (F, L, D, q) => [
        ((q - M) / (q - D)) * F[0] + ((M - D) / (q - D)) * L[0],
        ((q - M) / (q - D)) * F[1] + ((M - D) / (q - D)) * L[1],
      ];
      const z = _(u, h, v, g);
      const T = _(h, l, g, b);
      const S = _(l, m, b, y);
      const E = _(z, T, v, b);
      const P = _(T, S, g, y);
      i.push(_(E, P, g, b));
    }
  }
  if (t) {
    i.push(i[0]);
  } else {
    i.push(e[s - 1]);
  }
  const a = [i[0]];
  let r = 0;
  for (let c = 1; c < i.length; c++) {
    const u = i[c - 1];
    const h = i[c];
    const l = Math.hypot(h[0] - u[0], h[1] - u[1]);
    let m = 0;
    while (r + l - m >= SAMPLE_STEP) {
      const p = SAMPLE_STEP - r;
      const d = (m + p) / Math.hypot(h[0] - u[0], h[1] - u[1]);
      a.push([lerp(u[0], h[0], d), lerp(u[1], h[1], d)]);
      m += p;
      r = 0;
    }
    r += l - m;
  }
  if (t) {
    const c = a[a.length - 1];
    if (Math.hypot(c[0] - a[0][0], c[1] - a[0][1]) < SAMPLE_STEP * 0.5) {
      a.pop();
    }
  } else {
    const c = a[a.length - 1];
    const u = e[s - 1];
    if (Math.hypot(c[0] - u[0], c[1] - u[1]) > SAMPLE_STEP * 0.4) {
      a.push(u);
    } else {
      a[a.length - 1] = u;
    }
  }
  return a;
}

// Все дороги. Каждая дорога — массивы по точкам: x, z (положение), h (высота полотна), tx/tz (направление),
// dist (пройденное расстояние), flags (бит 1 — мост, бит 2 — тоннель), hw — полуширина асфальта.
export class RoadNetwork {
  constructor() {
    this.roads = [];
    this.byId = {};
    this.hash = new Map();
    this.hashCell = 24;
    this.junctions = [];
    this._res = {
      d: 0,
      h: 0,
      hw: 0,
      road: null,
      i: 0,
      t: 0,
      bridge: false,
      tunnel: false,
      side: 0,
      tx: 0,
      tz: 1,
    };
  }
  nearestOnRoad(road, x, z) {
    let best = 0;
    let bestD2 = Infinity;
    for (let i = 0; i < road.n; i++) {
      const d2 = (road.x[i] - x) ** 2 + (road.z[i] - z) ** 2;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = i;
      }
    }
    return best;
  }
  // Строит дороги из mapData.js: сглаживание, стыковка примыканий, высоты, мосты и тоннели.
  build(terrain) {
    const defs = ROADS.slice().sort((s, o) => s.priority - o.priority);
    for (const def of defs) {
      const pts = def.pts.map((c) => c.slice());
      const junctions = [];
      if (def.snapStart) {
        const c = this.byId[def.snapStart];
        const u = this.nearestOnRoad(c, pts[0][0], pts[0][1]);
        pts[0] = [c.x[u], c.z[u]];
        junctions.push({
          parent: c,
          pi: u,
          end: 0,
        });
      }
      if (def.snapEnd) {
        const c = this.byId[def.snapEnd];
        const u = pts.length - 1;
        const h = this.nearestOnRoad(c, pts[u][0], pts[u][1]);
        pts[u] = [c.x[h], c.z[h]];
        junctions.push({
          parent: c,
          pi: h,
          end: 1,
        });
      }
      const samples = splineSample(pts, !!def.closed);
      const count = samples.length;
      const road = {
        def: def,
        id: def.id,
        name: def.name,
        hw: def.hw,
        lane: def.lane,
        closed: !!def.closed,
        n: count,
        x: new Float32Array(count),
        z: new Float32Array(count),
        h: new Float32Array(count),
        tx: new Float32Array(count),
        tz: new Float32Array(count),
        dist: new Float32Array(count),
        flags: new Uint8Array(count),
        edge: new Uint8Array(count),
        curv: new Float32Array(count),
        rail: new Uint8Array(count),
        priority: def.priority,
        index: this.roads.length,
      };
      for (let c = 0; c < count; c++) {
        road.x[c] = samples[c][0];
        road.z[c] = samples[c][1];
      }
      for (let c = 0; c < count; c++) {
        const u = this._at(road, c - 1);
        const h = this._at(road, c + 1);
        const l = road.x[h] - road.x[u];
        const m = road.z[h] - road.z[u];
        const p = Math.hypot(l, m) || 1;
        road.tx[c] = l / p;
        road.tz[c] = m / p;
        road.dist[c] =
          c === 0
            ? 0
            : road.dist[c - 1] + Math.hypot(road.x[c] - road.x[c - 1], road.z[c] - road.z[c - 1]);
      }
      road.length =
        road.dist[count - 1] +
        (road.closed
          ? Math.hypot(road.x[0] - road.x[count - 1], road.z[0] - road.z[count - 1])
          : 0);
      for (let c = 0; c < count; c++) {
        const u = this._at(road, c - 6);
        const h = this._at(road, c + 6);
        const l = Math.atan2(road.tx[u], road.tz[u]);
        let p = Math.atan2(road.tx[h], road.tz[h]) - l;
        while (p > Math.PI) {
          p -= Math.PI * 2;
        }
        while (p < -Math.PI) {
          p += Math.PI * 2;
        }
        road.curv[c] = p / (Math.abs(h - u) * SAMPLE_STEP || 1);
      }
      road.junctions = junctions;
      this.roads.push(road);
      this.byId[def.id] = road;
      for (const c of junctions) {
        this.junctions.push({
          child: road,
          ci: c.end ? count - 1 : 0,
          parent: c.parent,
          pi: c.pi,
        });
      }
    }
    this.computeHeights(terrain);
    this.buildHash();
    // плавные перекрёстки со скруглёнными углами (junctions.js)
    buildJunctions(this);
  }
  // Поле перекрёстка в точке (x, z) или null, если точка не у перекрёстка. См. Junction.field в junctions.js.
  // margin — насколько расширить зону перекрёстка (рельеф использует запас, чтобы плавно сойтись с дорогами).
  junctionAt(x, z, margin = 0) {
    const list = this.junctionShapes;
    if (!list) {
      return null;
    }
    for (let k = 0; k < list.length; k++) {
      const j = list[k];
      const dx = x - j.ox;
      const dz = z - j.oz;
      const r = j.reach + margin;
      if (dx * dx + dz * dz < r * r) {
        return j.field(x, z);
      }
    }
    return null;
  }
  _at(road, i) {
    return road.closed ? ((i % road.n) + road.n) % road.n : clamp(i, 0, road.n - 1);
  }
  // Высота полотна вдоль дороги: сглаженный рельеф + подъём над рекой + плавные примыкания.
  computeHeights(terrain) {
    const e = terrain.river;
    for (const s of this.roads) {
      const o = s.n;
      const i = s.h;
      for (let h = 0; h < o; h++) {
        i[h] = terrain.blurAt(s.x[h], s.z[h]) + 0.45;
      }
      const n = new Float32Array(o);
      for (let h = 0; h < o; h++) {
        const l = RIDGE.ax;
        const m = RIDGE.az;
        const p = RIDGE.bx - l;
        const d = RIDGE.bz - m;
        const x = clamp(((s.x[h] - l) * p + (s.z[h] - m) * d) / (p * p + d * d), 0, 1);
        n[h] = Math.hypot(s.x[h] - (l + p * x), s.z[h] - (m + d * x));
      }
      let a = -1;
      let r = -1;
      for (let h = 0; h < o; h++) {
        if (n[h] < RIDGE.w * 1.55) {
          if (a < 0) {
            a = h;
          }
          r = h;
        }
      }
      const c = (h, l) => {
        for (let m = 0; m < h; m++) {
          const p = i.slice();
          for (let d = 0; d < o; d++) {
            if (!s.closed && (d < 2 || d > o - 3)) {
              continue;
            }
            let x = 0;
            let v = 0;
            for (let g = -l; g <= l; g++) {
              const b = s.closed ? this._at(s, d + g) : clamp(d + g, 0, o - 1);
              x += p[b];
              v++;
            }
            i[d] = x / v;
          }
        }
      };
      c(2, 6);
      if (a >= 0 && s.id === "highway" && r - a > 20) {
        const h = Math.max(0, a - 10);
        const l = Math.min(o - 1, r + 10);
        const m = i[h];
        const p = i[l];
        for (let d = h; d <= l; d++) {
          const x = (d - h) / (l - h);
          i[d] = lerp(m, p, x);
          if (baseHeight(s.x[d], s.z[d]) - i[d] > 9 && n[d] < RIDGE.w * 1.2) {
            s.flags[d] |= 2;
          }
        }
      }
      if (e) {
        const h = new Float32Array(o).fill(-1000000000);
        for (let m = 0; m < o; m++) {
          const p = terrain.riverQuery(s.x[m], s.z[m]);
          if (p && !p.inLake && p.d < e.hw + 10) {
            h[m] = p.h + 4.2;
          }
        }
        const l = h.slice();
        for (let m = 0; m < o; m++) {
          if (!(h[m] < -100000000)) {
            for (let p = -60; p <= 60; p++) {
              const d = s.closed ? this._at(s, m + p) : clamp(m + p, 0, o - 1);
              l[d] = Math.max(l[d], h[m] - Math.abs(p) * SAMPLE_STEP * 0.06);
            }
          }
        }
        for (let m = 0; m < o; m++) {
          i[m] = Math.max(i[m], l[m]);
        }
      }
      c(2, 3);
      for (const h of s.junctions) {
        const l = h.parent.h[h.pi];
        const m = 30;
        for (let p = 0; p < Math.min(m, o); p++) {
          const d = h.end ? o - 1 - p : p;
          i[d] = lerp(l, i[d], smoothstep(0, m, p));
        }
      }
      const u = new Float32Array(o);
      for (let h = 0; h < o; h++) {
        u[h] = i[h] - terrain.carvedHeight(s.x[h], s.z[h]);
      }
      for (let h = 0; h < o; h++) {
        const l = e ? terrain.riverQuery(s.x[h], s.z[h]) : null;
        if ((l && !l.inLake && l.d < e.hw + 6 && u[h] > 2.5) || u[h] > 14) {
          for (let p = -5; p <= 5; p++) {
            s.flags[this._at(s, h + p)] |= 1;
          }
        }
      }
      s.gap = u;
    }
    for (const s of this.roads) {
      s.sak = new Float32Array(s.n);
      s.aut = new Float32Array(s.n);
      for (let o = 0; o < s.n; o++) {
        const [i, n] = biomeAt(s.x[o], s.z[o]);
        s.sak[o] = smoothstep(0.25, 0.7, i);
        s.aut[o] = smoothstep(0.25, 0.7, n);
      }
    }
    for (const s of this.junctions) {
      const o = s.parent;
      const i = s.child;
      const n = s.ci === 0 ? Math.min(i.n - 1, 12) : Math.max(0, i.n - 13);
      const a = i.x[n] - o.x[s.pi];
      const r = i.z[n] - o.z[s.pi];
      const c = a * o.tz[s.pi] - r * o.tx[s.pi] > 0 ? 1 : 2;
      const u = Math.ceil((i.hw + 6) / SAMPLE_STEP);
      for (let h = -u; h <= u; h++) {
        const l = this._at(o, s.pi + h);
        o.edge[l] |= c;
      }
    }
  }
  // Сетка для быстрого поиска «какие отрезки дорог рядом с точкой».
  buildHash() {
    const cell = this.hashCell;
    for (const road of this.roads) {
      const segCount = road.closed ? road.n : road.n - 1;
      const pad = road.hw + 115;
      for (let i = 0; i < segCount; i++) {
        const next = (i + 1) % road.n;
        const x0 = Math.floor((Math.min(road.x[i], road.x[next]) - pad) / cell);
        const x1 = Math.floor((Math.max(road.x[i], road.x[next]) + pad) / cell);
        const z0 = Math.floor((Math.min(road.z[i], road.z[next]) - pad) / cell);
        const z1 = Math.floor((Math.max(road.z[i], road.z[next]) + pad) / cell);
        for (let cx = x0; cx <= x1; cx++) {
          for (let cz = z0; cz <= z1; cz++) {
            const key = cx * 100003 + cz;
            let bucket = this.hash.get(key);
            if (!bucket) {
              bucket = [];
              this.hash.set(key, bucket);
            }
            bucket.push(road.index, i);
          }
        }
      }
    }
  }
  // Ближайшая к (x, z) точка дороги не дальше maxDist. Возвращает d — расстояние до оси, h — высота полотна,
  // hw — полуширина, road, bridge, tunnel, side (с какой стороны от оси). Результат — общий объект, не храни его.
  nearest(x, z, maxDist = 60, onlyRoad = null) {
    const cell = this.hashCell;
    const bucket = this.hash.get(Math.floor(x / cell) * 100003 + Math.floor(z / cell));
    if (!bucket) {
      return null;
    }
    let bestScore = Infinity;
    let bestI = -1;
    let bestRoad = null;
    let bestT = 0;
    for (let k = 0; k < bucket.length; k += 2) {
      const road = this.roads[bucket[k]];
      if (onlyRoad && road !== onlyRoad) {
        continue;
      }
      const i0 = bucket[k + 1];
      const i1 = (i0 + 1) % road.n;
      const ax = road.x[i0];
      const az = road.z[i0];
      const sx = road.x[i1] - ax;
      const sz = road.z[i1] - az;
      let tSeg = ((x - ax) * sx + (z - az) * sz) / (sx * sx + sz * sz);
      tSeg = tSeg < 0 ? 0 : tSeg > 1 ? 1 : tSeg;
      const dx = x - (ax + sx * tSeg);
      const dz = z - (az + sz * tSeg);
      const score =
        Math.sqrt(dx * dx + dz * dz) - (road.hw > 0, 0) - road.hw * 0.02 + road.priority * 0.001;
      if (score < bestScore) {
        bestScore = score;
        bestI = i0;
        bestRoad = road;
        bestT = tSeg;
      }
    }
    if (!bestRoad) {
      return null;
    }
    const next = (bestI + 1) % bestRoad.n;
    const px = lerp(bestRoad.x[bestI], bestRoad.x[next], bestT);
    const pz = lerp(bestRoad.z[bestI], bestRoad.z[next], bestT);
    const dist = Math.hypot(x - px, z - pz);
    if (dist > maxDist) {
      return null;
    }
    const res = this._res;
    res.d = dist;
    res.h = lerp(bestRoad.h[bestI], bestRoad.h[next], bestT);
    res.hw = bestRoad.hw;
    res.road = bestRoad;
    res.i = bestI;
    res.t = bestT;
    res.bridge = (bestRoad.flags[bestI] & 1) !== 0 || (bestRoad.flags[next] & 1) !== 0;
    res.tunnel = (bestRoad.flags[bestI] & 2) !== 0 && (bestRoad.flags[next] & 2) !== 0;
    res.tx = bestRoad.tx[bestI];
    res.tz = bestRoad.tz[bestI];
    res.side = (x - px) * bestRoad.tz[bestI] - (z - pz) * bestRoad.tx[bestI];
    res.px = px;
    res.pz = pz;
    res.dist = lerp(bestRoad.dist[bestI], bestRoad.dist[next] || bestRoad.length, bestT);
    return res;
  }
  // Заранее считает «расстояние до ближайшего края дороги» в сетке 4×4 м — для быстрых проверок.
  buildEdgeGrid(half = 2000, step = 4, maxD = 50) {
    const n = Math.round((half * 2) / step) + 1;
    const grid = new Float32Array(n * n).fill(maxD);
    for (const road of this.roads) {
      const reach = Math.ceil((maxD + road.hw) / step);
      for (let k = 0; k < road.n; k++) {
        const rx = road.x[k];
        const rz = road.z[k];
        const gx = Math.round((rx + half) / step);
        const gz = Math.round((rz + half) / step);
        for (let row = Math.max(0, gz - reach); row <= Math.min(n - 1, gz + reach); row++) {
          const dz = -half + row * step - rz;
          for (let col = Math.max(0, gx - reach); col <= Math.min(n - 1, gx + reach); col++) {
            const dx = -half + col * step - rx;
            const edge = Math.sqrt(dx * dx + dz * dz) - road.hw;
            const idx = row * n + col;
            if (edge < grid[idx]) {
              grid[idx] = edge;
            }
          }
        }
      }
    }
    // у перекрёстков край дороги идёт по скруглению
    for (const j of this.junctionShapes || []) {
      const r = j.reach + maxD;
      for (
        let row = Math.max(0, Math.floor((j.oz - r + half) / step));
        row <= Math.min(n - 1, Math.ceil((j.oz + r + half) / step));
        row++
      ) {
        const z = -half + row * step;
        for (
          let col = Math.max(0, Math.floor((j.ox - r + half) / step));
          col <= Math.min(n - 1, Math.ceil((j.ox + r + half) / step));
          col++
        ) {
          const x = -half + col * step;
          if (Math.hypot(x - j.ox, z - j.oz) > j.reach) {
            continue;
          }
          const f = j.field(x, z);
          const idx = row * n + col;
          if (f && f.F < grid[idx]) {
            grid[idx] = f.F;
          }
        }
      }
    }
    this.edge = {
      g: grid,
      n: n,
      step: step,
      half: half,
      maxD: maxD,
    };
  }
  // Примерное расстояние от точки до края ближайшей дороги (из сетки buildEdgeGrid).
  edgeDist(x, z) {
    const eg = this.edge;
    const fx = (x + eg.half) / eg.step;
    const fz = (z + eg.half) / eg.step;
    if (fx < 0 || fz < 0 || fx >= eg.n - 1 || fz >= eg.n - 1) {
      return eg.maxD;
    }
    const ix = Math.floor(fx);
    const iz = Math.floor(fz);
    const tx = fx - ix;
    const tz = fz - iz;
    const n = eg.n;
    const idx = iz * n + ix;
    const g = eg.g;
    return (
      (g[idx] * (1 - tx) + g[idx + 1] * tx) * (1 - tz) +
      (g[idx + n] * (1 - tx) + g[idx + n + 1] * tx) * tz
    );
  }
  // Дорога под точкой (с обочиной) или null.
  surfaceAt(x, z) {
    const hit = this.nearest(x, z, 30);
    return hit && hit.d <= hit.hw + 1.5 ? hit : null;
  }
  // Номер точки дороги по пройденному расстоянию (двоичный поиск).
  indexAtDist(road, dist) {
    if (road.closed) {
      dist = ((dist % road.length) + road.length) % road.length;
    }
    let lo = 0;
    let hi = road.n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (road.dist[mid] <= dist) {
        lo = mid;
      } else {
        hi = mid - 1;
      }
    }
    return lo;
  }
  buildMeshes() {
    const t = [];
    for (const e of this.roads) {
      const s = e.n;
      const segCount = e.closed ? s : s - 1;
      // какие отрезки ленты не рисовать: начало/конец примыкающих дорог и участки главных дорог
      // у перекрёстков — там дорогу рисует сам перекрёсток (junctions.js)
      const skip = new Uint8Array(segCount);
      for (let k = 0; k < segCount; k++) {
        if (k < (e.meshFrom || 0) || k >= (e.meshTo ?? segCount)) {
          skip[k] = 1;
        }
      }
      for (const [a, b] of e.meshSkip || []) {
        for (let k = a; k !== b; k = (k + 1) % s) {
          skip[k] = 1;
        }
      }
      // непрерывные куски ленты: [первый отрезок, последний + 1]
      const runs = [];
      for (let k = 0; k < segCount; ) {
        if (skip[k]) {
          k++;
          continue;
        }
        let j = k;
        while (j < segCount && !skip[j]) {
          j++;
        }
        runs.push([k, j]);
        k = j;
      }
      const i = 220;
      for (const [r0, r1] of runs) {
        for (let n = r0; n < r1; n += i) {
          const a = new MeshBuilder();
          const r = new MeshBuilder();
          const c = Math.min(r1, n + i);
          let u = null;
          for (let l = n; l <= c; l++) {
            const m = l % s;
            const p = e.hw;
            const d = 1.4;
            const x = e.x[m];
            const v = e.z[m];
            const g = e.h[m];
            const b = e.tz[m];
            const y = -e.tx[m];
            const k = l === s ? e.length : e.dist[m];
            const w = [e.sak[m], e.aut[m], e.edge[m] / 3, 0];
            const M = e.flags[m] & 1;
            const _ = M ? 1.1 : 1.6;
            // поперёк: обочина, край асфальта, ось, край асфальта, обочина (+ «юбки» вниз по бокам)
            const z = [-(p + d), -p, 0, p, p + d];
            const T = [];
            T.push(
              a.vertex(x - b * (p + d), g - _, v - y * (p + d), -b, 0, -y, w, [
                -(p + d + 0.3),
                k,
                p,
                e.lane,
              ]),
            );
            for (const E of z) {
              T.push(a.vertex(x + b * E, g, v + y * E, 0, 1, 0, w, [E, k, p, e.lane]));
            }
            T.push(
              a.vertex(x + b * (p + d), g - _, v + y * (p + d), b, 0, y, w, [
                p + d + 0.3,
                k,
                p,
                e.lane,
              ]),
            );
            let S = null;
            if (M) {
              const E = [0.55, 0.53, 0.5, 0];
              S = [
                r.vertex(x - b * (p + d), g - _, v - y * (p + d), 0, -1, 0, E),
                r.vertex(x + b * (p + d), g - _, v + y * (p + d), 0, -1, 0, E),
              ];
            }
            if (u) {
              for (let E = 0; E < T.length - 1; E++) {
                a.quad(u.ids[E], T[E], T[E + 1], u.ids[E + 1]);
              }
              if (S && u.uids) {
                r.quad(u.uids[0], u.uids[1], S[1], S[0]);
              }
            }
            u = {
              ids: T,
              uids: S,
            };
          }
          const h = a.bounds();
          t.push({
            road: e,
            geo: a,
            under: r.vertexCount ? r : null,
            center: h.center,
            radius: h.radius,
          });
        }
      }
    }
    // заплатки перекрёстков
    for (const j of this.junctionShapes || []) {
      t.push(j.buildMeshes());
    }
    return t;
  }
}
