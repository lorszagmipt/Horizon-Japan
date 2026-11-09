// Расстановка растительности по карте: какие деревья и цветы где растут, и отрисовка их с уровнями детализации (LOD).

import { clamp, lerp, smoothstep } from "../../core/math.js";
import { seededRandom } from "../../core/random.js";
import { simplex2 } from "../noise.js";
import { LANDMARKS, TREE_TUNNELS, VILLAGES, WORLD } from "../mapData.js";
import { sampleBiome } from "../biomes.js";
import { lakeDistance } from "../terrain.js";
import { VEGETATION_BY_ID, VEGETATION_TYPES, makeFarPine, makeFarTree, pick } from "./models.js";

const LOD_NEAR = 125;

const LOD_MID = 360;

const SAKURA_TINTS = [
  [0.92, 0.5, 0.62],
  [1, 0.62, 0.75],
  [1, 0.82, 0.9],
  [1, 1, 1],
  [1, 1.18, 0.95],
  [1, 1.38, 0.9],
];

const BIOME_TINTS = {
  s: [0.5, 0.76, 0.34],
  a: [0.84, 0.64, 0.25],
  h: [0.46, 0.64, 0.42],
  m: [0.55, 0.82, 0.32],
};

function plantTint(f, t, e, s, o) {
  const i = s();
  switch (f) {
    case "sakura":
      return i < 0.5
        ? [1, 1, 1]
        : i < 0.75
          ? [1, 0.9, 0.95]
          : i < 0.9
            ? [1.04, 1.06, 1.05]
            : [1, 0.8, 0.9];
    case "weeping":
      return i < 0.5 ? [1, 0.95, 1] : [1, 0.86, 0.96];
    case "maple": {
      const n = (simplex2(t / 70, e / 70) * 0.5 + 0.5) * SAKURA_TINTS.length;
      return SAKURA_TINTS[clamp(Math.floor(n + (i - 0.5) * 2.4), 0, SAKURA_TINTS.length - 1)];
    }
    case "ginkgo":
      return i < 0.6 ? [1, 1, 1] : i < 0.85 ? [1, 1.04, 0.8] : [0.92, 1.02, 0.72];
    case "pine":
    case "cedar":
      return [0.88 + i * 0.22, 0.9 + i * 0.18, 0.88 + i * 0.2];
    case "birch":
      return i < 0.7 ? [1, 1, 1] : [1.12, 1.08, 0.72];
    case "broad":
      return i < 0.4 ? [1, 1, 1] : i < 0.7 ? [0.86, 0.94, 0.9] : [1.08, 1.06, 0.86];
    case "bamboo":
      return [0.92 + i * 0.16, 0.95 + i * 0.1, 0.9 + i * 0.15];
    case "rock":
      return [0.9 + i * 0.2, 0.88 + i * 0.15, 0.9 + i * 0.2];
    case "tea":
      return [0.95 + i * 0.12, 0.97 + i * 0.08, 0.95 + i * 0.1];
    case "bush": {
      const n = s();
      const a = Math.max(0, 1 - o.s - o.a - o.h);
      let r = n * (o.s + o.a + o.h + a);
      return (r -= o.s) < 0
        ? pick(s, [
            [1, 0.36, 0.68],
            [1, 0.58, 0.8],
            [1, 0.95, 0.97],
            [0.95, 0.3, 0.55],
          ])
        : (r -= o.a) < 0
          ? pick(s, [
              [0.95, 0.28, 0.16],
              [1, 0.5, 0.18],
              [0.85, 0.2, 0.18],
            ])
          : (r -= o.h) < 0
            ? pick(s, [
                [0.62, 0.46, 0.82],
                [0.42, 0.66, 0.36],
                [0.5, 0.72, 0.4],
              ])
            : pick(s, [
                [1, 0.88, 0.25],
                [1, 1, 0.95],
                [0.5, 0.78, 0.38],
                [0.55, 0.8, 0.4],
              ]);
    }
    case "grass": {
      const n = Math.max(0, 1 - o.s - o.a - o.h);
      const a = 0.88 + i * 0.24;
      const r = [0, 0, 0];
      for (let c = 0; c < 3; c++) {
        r[c] =
          (BIOME_TINTS.s[c] * o.s +
            BIOME_TINTS.a[c] * o.a +
            BIOME_TINTS.h[c] * o.h +
            BIOME_TINTS.m[c] * n) *
          a;
      }
      return r;
    }
    case "susuki":
      return o.a > 0.4 ? [1.05, 0.88, 0.72] : [1, 0.96, 0.86];
  }
  return [1, 1, 1];
}

function pickFlower(f, t) {
  const e = Math.max(0, 1 - f.s - f.a - f.h);
  let s = t() * (f.s + f.a + f.h + e);
  return (s -= f.s) < 0
    ? t() < 0.6
      ? [
          0,
          pick(t, [
            [1, 0.5, 0.76],
            [0.95, 0.32, 0.62],
            [1, 0.72, 0.86],
            [1, 1, 1],
          ]),
        ]
      : [1, [1, 0.86, 0.16]]
    : (s -= f.a) < 0
      ? t() < 0.65
        ? [
            2,
            pick(t, [
              [1, 0.14, 0.1],
              [0.92, 0.1, 0.12],
              [1, 0.96, 0.9],
            ]),
          ]
        : [
            1,
            pick(t, [
              [1, 0.94, 0.86],
              [1, 0.62, 0.2],
            ]),
          ]
      : (s -= f.h) < 0
        ? t() < 0.7
          ? [
              1,
              pick(t, [
                [0.62, 0.45, 0.98],
                [0.45, 0.58, 1],
                [0.8, 0.55, 0.95],
              ]),
            ]
          : [0, [1, 1, 1]]
        : t() < 0.7
          ? [
              1,
              pick(t, [
                [1, 1, 1],
                [1, 0.9, 0.2],
                [1, 0.58, 0.8],
                [0.75, 0.5, 1],
                [1, 0.55, 0.25],
              ]),
            ]
          : [
              0,
              pick(t, [
                [1, 1, 1],
                [1, 0.92, 0.3],
              ]),
            ];
}

function pickTree(f, t, e, s, o) {
  const i = Math.max(0, 1 - f.s - f.a - f.h);
  let n = o() * (f.s + f.a + f.h + i);
  const a = smoothstep(0.48, 0.68, simplex2(t / 140 + 3, e / 140 - 7));
  const r = simplex2(t / 90 + 40, e / 90 - 12) * 0.5 + 0.5;
  const c = o() * 0.6 + r * 0.4;
  if ((n -= f.s) < 0) {
    return a > 0.5 && o() < 0.85
      ? "bamboo"
      : c < 0.66
        ? "sakura"
        : c < 0.78
          ? "weeping"
          : c < 0.93
            ? "broad"
            : "pine";
  }
  if ((n -= f.a) < 0) {
    return c < 0.55 ? "maple" : c < 0.8 ? "ginkgo" : c < 0.94 ? "cedar" : "broad";
  }
  if ((n -= f.h) < 0) {
    const u = smoothstep(150, 380, s);
    return c < 0.42 + u * 0.2 ? "cedar" : c < 0.78 ? "pine" : c < 0.96 ? "birch" : "maple";
  }
  return a > 0.5 && o() < 0.75
    ? "bamboo"
    : c < 0.74
      ? "broad"
      : c < 0.84
        ? "sakura"
        : c < 0.9
          ? "birch"
          : c < 0.96
            ? "pine"
            : "maple";
}

function makeInstance(f, t, e, s, o, i, n, a) {
  const r = f.id;
  const c =
    n ||
    (r === "rock"
      ? 0.6 + o() * 1.8
      : r === "flower"
        ? 1 + o() * 0.7
        : f.kind === "cover"
          ? 0.8 + o() * 0.6
          : r === "tea"
            ? 1
            : 0.8 + o() * 0.45);
  const u = c * (r === "rock" ? 0.6 + o() * 0.6 : 0.9 + o() * 0.25);
  const l =
    (((a !== undefined ? a : Math.floor(o() * f.variants)) + 0.05 + o() * 0.9) / f.variants) * 6.28;
  return [
    t,
    e - (r === "rock" ? 0.3 * c : 0.05),
    s,
    o() * Math.PI * 2,
    c,
    u,
    l,
    (o() - 0.5) * 0.06,
    i[0],
    i[1],
    i[2],
    0,
  ];
}

export function scatterVegetation(f, t) {
  const e = f.terrain;
  const s = f.roads;
  const o = f.colliders;
  const i = seededRandom(9001);
  const n = {};
  for (const g of VEGETATION_TYPES) {
    n[g.id] = [];
  }
  const a = [];
  for (const g of VILLAGES) {
    a.push([g.x, g.z, g.r * 0.75]);
  }
  for (const g in LANDMARKS) {
    a.push([LANDMARKS[g].x, LANDMARKS[g].z, g === "festival" ? 150 : 45]);
  }
  f.vegExclusions = a;
  const r = (g, b, y = 0) => {
    for (const k of a) {
      if ((g - k[0]) ** 2 + (b - k[1]) ** 2 < (k[2] + y) ** 2) {
        return true;
      }
    }
    return false;
  };
  const c = (g, b) => {
    for (const k of e.lakes) {
      if (lakeDistance(k, g, b) < 1.25) {
        return false;
      }
    }
    const y = e.riverQuery(g, b);
    return !(y && !y.inLake && y.d < e.river.hw + 5);
  };
  const u = [];
  const h = (g, b, y, k) => o.resolveCircle(g, b, k, y + 1, u).length > 0;
  const l = {
    s: 0,
    a: 0,
    h: 0,
    f: 0,
  };
  const m = Math.max(0.3, t.vegetation);
  const p = WORLD.gridHalf - 60;
  scatterRoadsideGroves(f, i, n, a);
  const d = 5.2 / Math.sqrt(m);
  for (let g = -p; g < p; g += d) {
    for (let b = -p; b < p; b += d) {
      const y = b + (i() - 0.5) * d * 0.9;
      const k = g + (i() - 0.5) * d * 0.9;
      const w = i();
      sampleBiome(y, k, l);
      const M = Math.max(0, 1 - l.s - l.a - l.h);
      const _ = l.f;
      let z =
        l.s * (0.12 + 0.74 * _) +
        l.a * (0.16 + 0.78 * _) +
        l.h * (0.06 + 0.8 * _) +
        M * (0.012 + 0.4 * _);
      const T = s.edgeDist(y, k);
      const S = smoothstep(6.5, 9, T) * (1 - smoothstep(18, 36, T));
      z += S * (l.s * 0.3 + l.a * 0.36 + l.h * 0.1 + M * 0.05);
      if (Math.abs(y) > WORLD.half || Math.abs(k) > WORLD.half) {
        z = Math.max(z, 0.3 * _);
      }
      if (w > z) {
        continue;
      }
      if (T < 15) {
        const q = s.nearest(y, k, 40);
        if (q && q.d - q.hw < (q.road.lane === 2 ? 9 : 6.5)) {
          continue;
        }
      }
      const E = e.heightAt(y, k);
      const P = smoothstep(560, 380, E);
      if (i() > P || !c(y, k) || r(y, k) || e.normalAt(y, k)[1] < 0.76 || h(y, k, E, 3.2)) {
        continue;
      }
      const L = pickTree(l, y, k, E, i);
      const D = VEGETATION_BY_ID[L];
      n[L].push(makeInstance(D, y, E, k, i, plantTint(L, y, k, i, l)));
    }
  }
  for (const [g, b] of [
    ["bush", 9],
    ["rock", 26],
  ]) {
    const y = VEGETATION_BY_ID[g];
    const k = b / Math.sqrt(m);
    for (let w = -p; w < p; w += k) {
      for (let M = -p; M < p; M += k) {
        const _ = M + (i() - 0.5) * k * 0.9;
        const z = w + (i() - 0.5) * k * 0.9;
        sampleBiome(_, z, l);
        const T = s.edgeDist(_, z);
        const S = e.heightAt(_, z);
        let E;
        if (g === "bush") {
          const F = 1 - smoothstep(12, 50, T);
          E = (0.12 + 0.35 * l.f) * (0.25 + 0.75 * F) * smoothstep(560, 380, S);
        } else {
          E = 0.05 + l.h * 0.45 + smoothstep(300, 700, S) * 0.5;
        }
        if (
          !(
            i() > E ||
            T < (g === "rock" ? 8 : 2.6) ||
            !c(_, z) ||
            r(_, z) ||
            e.normalAt(_, z)[1] < (g === "rock" ? 0.5 : 0.78) ||
            h(_, z, S, 2.5)
          )
        ) {
          n[g].push(makeInstance(y, _, S, z, i, plantTint(g, _, z, i, l)));
        }
      }
    }
  }
  const x = WORLD.half + 40;
  const v = [
    ["grass", 2.3, 40],
    ["flower", 2.9, 34],
    ["susuki", 3, 46],
  ];
  for (const [g, b, y] of v) {
    const k = VEGETATION_BY_ID[g];
    const w = b / Math.sqrt(m);
    for (let M = -x; M < x; M += w) {
      for (let _ = -x; _ < x; _ += w) {
        const z = _ + (i() - 0.5) * w * 0.95;
        const T = M + (i() - 0.5) * w * 0.95;
        const S = s.edgeDist(z, T);
        if (S > y || S < 1.7) {
          i();
          continue;
        }
        sampleBiome(z, T, l);
        const E = Math.max(0, 1 - l.s - l.a - l.h);
        const P = 1 - l.f;
        let F;
        if (g === "grass") {
          F = (0.9 - 0.45 * smoothstep(8, 40, S)) * (1 - 0.45 * l.f);
        } else if (g === "flower") {
          const D = smoothstep(-0.25, 0.35, simplex2(z / 38 + 4, T / 38 - 9));
          F =
            (l.s * 0.85 + E * 0.7 + l.a * 0.6 + l.h * 0.6) *
            (1 - 0.55 * l.f) *
            D *
            (1 - 0.5 * smoothstep(14, 34, S));
          F += l.a * 0.55 * (1 - smoothstep(4, 11, S));
        } else {
          const D = smoothstep(-0.1, 0.45, simplex2(z / 55 - 6, T / 55 + 2));
          F = (l.h * 1 + l.a * 0.45 + E * 0.15 + l.s * 0.04) * (0.25 + 0.75 * P) * D;
        }
        if (i() > F) {
          continue;
        }
        const L = e.heightAt(z, T);
        if (!(L > 520 || !c(z, T) || r(z, T, -25)) && !h(z, T, L, 1.2)) {
          if (g === "flower") {
            const [D, q] = pickFlower(l, i);
            n.flower.push(makeInstance(k, z, L, T, i, q, undefined, D));
          } else {
            n[g].push(makeInstance(k, z, L, T, i, plantTint(g, z, T, i, l)));
          }
        }
      }
    }
  }
  for (const g of TREE_TUNNELS) {
    const b = s.byId[g.road];
    if (b) {
      for (let y = g.from; y < g.to; y += 6.5 + i() * 2) {
        const k = s.indexAtDist(b, y);
        if (!b.flags[k]) {
          for (const w of [-1, 1]) {
            const M = b.hw + (b.lane === 2 ? 5.5 : 3.6) + i() * 1.6;
            const _ = b.tz[k];
            const z = -b.tx[k];
            const T = b.x[k] + _ * M * w;
            const S = b.z[k] + z * M * w;
            if (!c(T, S)) {
              continue;
            }
            const E = e.heightAt(T, S);
            if (h(T, S, E, 1.5)) {
              continue;
            }
            sampleBiome(T, S, l);
            const P =
              g.type === "maple"
                ? i() < 0.72
                  ? "maple"
                  : "ginkgo"
                : i() < 0.9
                  ? "sakura"
                  : "weeping";
            const F = makeInstance(
              VEGETATION_BY_ID[P],
              T,
              E,
              S,
              i,
              plantTint(P, T, S, i, l),
              1.15 + i() * 0.25,
            );
            F[3] = Math.atan2(-_ * w, -z * w) - Math.PI / 2;
            F[7] = 0.1 + i() * 0.06;
            n[P].push(F);
          }
        }
      }
    }
  }
  return n;
}

function scatterRoadsideGroves(f, t, e, s) {
  const o = f.terrain;
  const i = f.roads;
  const n = {
    s: 0,
    a: 0,
    h: 0,
    f: 0,
  };
  const a = [];
  for (const h of i.roads) {
    for (let l = 30; l < h.n - 30; l += 45) {
      if (!h.flags[l]) {
        for (const m of [-1, 1]) {
          const p = h.tz[l];
          const d = -h.tx[l];
          const x = h.hw + 34;
          const v = h.x[l] + p * x * m;
          const g = h.z[l] + d * x * m;
          if (Math.abs(v) > WORLD.half - 80 || Math.abs(g) > WORLD.half - 80) {
            continue;
          }
          sampleBiome(v, g, n);
          const b = Math.max(0, 1 - n.s - n.a - n.h);
          if (!(b + n.s * 0.6 < 0.5)) {
            a.push({
              cx: v,
              cz: g,
              yaw: Math.atan2(h.tx[l], h.tz[l]),
              score: b + n.s * 0.4 + t() * 0.35,
            });
          }
        }
      }
    }
  }
  a.sort((h, l) => l.score - h.score);
  const r = [];
  const c = 64;
  const u = 42;
  for (const h of a) {
    if (r.length >= 6) {
      break;
    }
    if (r.some((b) => Math.hypot(b.cx - h.cx, b.cz - h.cz) < 360)) {
      continue;
    }
    let l = true;
    let m = Infinity;
    let p = -Infinity;
    const d = Math.sin(h.yaw);
    const x = Math.cos(h.yaw);
    const v = -x;
    const g = d;
    for (let b = -0.5; b <= 0.5 && l; b += 0.25) {
      for (let y = -0.5; y <= 0.5 && l; y += 0.25) {
        const k = h.cx + d * b * c + v * y * u;
        const w = h.cz + x * b * c + g * y * u;
        const M = o.heightAt(k, w);
        m = Math.min(m, M);
        p = Math.max(p, M);
        if (i.edgeDist(k, w) < 8) {
          l = false;
        }
        for (const z of o.lakes) {
          if (lakeDistance(z, k, w) < 1.4) {
            l = false;
          }
        }
        const _ = o.riverQuery(k, w);
        if (_ && !_.inLake && _.d < o.river.hw + 10) {
          l = false;
        }
        for (const z of s) {
          if ((k - z[0]) ** 2 + (w - z[1]) ** 2 < (z[2] + 6) ** 2) {
            l = false;
          }
        }
      }
    }
    if (!(!l || p - m > 7)) {
      r.push(h);
      s.push([h.cx, h.cz, Math.hypot(c, u) / 2 + 3]);
      for (let b = -u / 2 + 1.5; b <= u / 2 - 1.5; b += 2.1) {
        const y = (t() - 0.5) * 6;
        for (let k = -c / 2 + 2 + Math.abs(y) * 0.5; k <= c / 2 - 2 - Math.max(0, y); k += 1.9) {
          const w = h.cx + d * k + v * b;
          const M = h.cz + x * k + g * b;
          const _ = makeInstance(
            VEGETATION_BY_ID.tea,
            w,
            o.heightAt(w, M),
            M,
            t,
            plantTint("tea", w, M, t, n),
            1,
          );
          _[3] = h.yaw + (t() - 0.5) * 0.05;
          _[5] = 0.95 + t() * 0.12;
          e.tea.push(_);
        }
      }
    }
  }
  f.teaFields = r;
}

export class Vegetation {
  constructor(t, e) {
    this.world = t;
    this.r = t.r;
    this.quality = e;
    this.drawDist = e.drawDist;
    this.group = this.r.addGroup();
  }
  build(t) {
    const e = this.r;
    const s = WORLD.gridHalf;
    const o = 125;
    const i = 250;
    this.fineSize = o;
    this.coarseSize = i;
    const n = Math.ceil((s * 2) / o);
    const a = Math.ceil((s * 2) / i);
    const r = seededRandom(4321);
    this.models = {};
    for (const w of VEGETATION_TYPES) {
      const M = [];
      for (let z = 0; z < w.variants; z++) {
        M.push(e.createMesh(w.fixedVariant ? w.make(0, 100, z) : w.make(0, 100 + z * 7)));
      }
      const _ = w.kind === "cover" ? null : e.createMesh(w.make(1, 100));
      this.models[w.id] = {
        hi: M,
        lo: _,
      };
    }
    const c = {
      blob: [e.createMesh(makeFarTree(0)), e.createMesh(makeFarTree(1))],
      cone: [e.createMesh(makeFarPine(0)), e.createMesh(makeFarPine(1))],
    };
    const u = (w) => {
      const M = new Float32Array(Math.max(1, w.length) * 12);
      w.forEach((_, z) => M.set(_, z * 12));
      return M;
    };
    const h = (w, M, _, z, T) => {
      let S = Infinity;
      let E = -Infinity;
      for (const P of w) {
        S = Math.min(S, P[1]);
        E = Math.max(E, P[1] + T);
      }
      return {
        c: [M, (S + E) / 2, _],
        r: Math.hypot(z / 2 + 6, z / 2 + 6, (E - S) / 2),
      };
    };
    const l = (w) => {
      const M = e.makeItem(
        Object.assign(
          {
            cull: "back",
            reflect: false,
            shadow: false,
          },
          w,
        ),
      );
      this.group.all.push(M);
      return M;
    };
    const m = new Map();
    const p = new Map();
    const d = (w, M) => {
      const _ = M * n + w;
      let z = m.get(_);
      if (!z) {
        z = {
          center: [-s + (w + 0.5) * o, 0, -s + (M + 0.5) * o],
          entries: [],
          mid: [],
        };
        m.set(_, z);
      }
      return z;
    };
    const x = (w, M) => {
      const _ = M * a + w;
      let z = p.get(_);
      if (!z) {
        z = {
          center: [-s + (w + 0.5) * i, 0, -s + (M + 0.5) * i],
          far: [],
          fine: [],
        };
        p.set(_, z);
      }
      return z;
    };
    const v = (w, M) => {
      const _ = w.far;
      return [
        M[0],
        M[1],
        M[2],
        M[3],
        M[4] * _.w,
        M[5] * _.h,
        M[6],
        M[7] * 0.5,
        _.col[0] * M[8],
        _.col[1] * M[9],
        _.col[2] * M[10],
        0,
      ];
    };
    const g = new Map();
    const b = new Map();
    const y = (w, M) => {
      let _ = w.get(M);
      if (!_) {
        _ = {
          blob: [],
          cone: [],
        };
        w.set(M, _);
      }
      return _;
    };
    for (const w of VEGETATION_TYPES) {
      const M = this.models[w.id];
      const _ = ["INSTANCED"].concat(w.noWind ? [] : ["WIND"]);
      const z = w.kind === "tree" ? w.far.h * 1.4 : w.kind === "cover" ? 2 : 4;
      const T = new Map();
      for (const S of t[w.id]) {
        if (w.collider) {
          this.world.colliders.addCircle(S[0], S[2], w.collider * S[4], S[1] - 2, S[1] + 6);
        }
        if (w.kind === "tree" && w.far) {
          // крона: для камеры «Вертолёт», чтобы понимать, что машину закрыло деревом
          this.world.addCanopy(S[0], S[2], w.far.w * 0.5 * S[4], S[1] + w.far.h * 0.3 * S[4], S[1] + w.far.h * S[4]);
        }
        const E = clamp(Math.floor((S[0] + s) / o), 0, n - 1);
        const F = clamp(Math.floor((S[2] + s) / o), 0, n - 1) * n + E;
        if (!T.has(F)) {
          T.set(F, []);
        }
        T.get(F).push(S);
        if (w.kind === "tree") {
          const L = v(w, S);
          y(g, F)[w.far.shape].push(L);
          const D = clamp(Math.floor((S[0] + s) / i), 0, a - 1);
          const q = clamp(Math.floor((S[2] + s) / i), 0, a - 1);
          y(b, q * a + D)[w.far.shape].push(L);
        }
      }
      for (const [S, E] of T) {
        const P = S % n;
        const F = Math.floor(S / n);
        const L = d(P, F);
        const D = h(E, L.center[0], L.center[2], o, z);
        const q = [];
        for (let j = 0; j < w.variants; j++) {
          const Y =
            w.variants === 1 ? E : E.filter((It) => Math.floor((It[6] / 6.28) * w.variants) === j);
          if (!Y.length) {
            continue;
          }
          const tt = u(Y);
          const wt = w.kind === "tree" || w.shadow;
          q.push(
            l({
              tag: "veg-" + w.id,
              mesh: e.createInstanced(M.hi[j], tt, Y.length),
              defines: _,
              bounds: D,
              uniforms: { u_foliage: w.foliage },
              cull: w.kind === "cover" ? "none" : "back",
              shadow: wt,
              shadowDist: 105,
              shadowMesh: wt && M.lo ? e.createInstanced(M.lo, tt, Y.length) : null,
            }),
          );
        }
        const W =
          w.kind === "bush" || w.kind === "rock"
            ? l({
                tag: "veg-" + w.id + "-lo",
                mesh: e.createInstanced(M.lo, u(E), E.length),
                defines: _,
                bounds: D,
                uniforms: { u_foliage: w.foliage },
                reflect: true,
              })
            : null;
        L.entries.push({
          ty: w,
          his: q,
          lo: W,
        });
      }
    }
    const k = (w) => {
      for (let M = w.length - 1; M > 0; M--) {
        const _ = Math.floor(r() * (M + 1));
        const z = w[M];
        w[M] = w[_];
        w[_] = z;
      }
      return w;
    };
    for (const [w, M] of g) {
      const _ = d(w % n, Math.floor(w / n));
      for (const z of ["blob", "cone"]) {
        const T = M[z];
        if (T.length) {
          _.mid.push(
            l({
              tag: "veg-mid-" + z,
              mesh: e.createInstanced(c[z][0], u(T), T.length),
              defines: ["INSTANCED", "WIND"],
              bounds: h(T, _.center[0], _.center[2], o, 24),
              uniforms: { u_foliage: 0.8 },
              reflect: true,
            }),
          );
        }
      }
    }
    for (const [w, M] of b) {
      const _ = x(w % a, Math.floor(w / a));
      for (const z of ["blob", "cone"]) {
        const T = k(M[z]);
        if (!T.length) {
          continue;
        }
        const S = l({
          tag: "veg-far-" + z,
          mesh: e.createInstanced(c[z][1], u(T), T.length),
          defines: ["INSTANCED"],
          bounds: h(T, _.center[0], _.center[2], i, 24),
          uniforms: { u_foliage: 0.8 },
          reflect: true,
        });
        S.total = T.length;
        _.far.push(S);
      }
    }
    for (const [w, M] of m) {
      const _ = w % n;
      const z = Math.floor(w / n);
      const T = -s + (_ + 0.5) * o;
      const S = -s + (z + 0.5) * o;
      x(
        clamp(Math.floor((T + s) / i), 0, a - 1),
        clamp(Math.floor((S + s) / i), 0, a - 1),
      ).fine.push(M);
    }
    this.coarse = [...p.values()];
    this.counts = {};
    for (const w of VEGETATION_TYPES) {
      this.counts[w.id] = t[w.id].length;
    }
  }
  setQuality(t) {
    this.quality = t;
    this.drawDist = t.drawDist;
  }
  update(t) {
    const e = t.pos[0];
    const s = t.pos[2];
    const o = this.drawDist;
    const i = this.quality.lodScale || 1;
    const n = LOD_NEAR * i;
    const a = LOD_MID * i;
    const r = this.coarseSize;
    const c = this.fineSize;
    const u = this.group.active;
    u.length = 0;
    const h = Math.min(o * 0.55, 650);
    for (const l of this.coarse) {
      const m = Math.max(0, Math.hypot(l.center[0] - e, l.center[2] - s) - r * 0.71);
      if (!(m > o)) {
        if (m >= a) {
          const p = m < h ? 1 : lerp(1, 0.4, clamp((m - h) / Math.max(1, o - h), 0, 1));
          for (const d of l.far) {
            d.instances = Math.ceil(d.total * p);
            u.push(d);
          }
          continue;
        }
        for (const p of l.fine) {
          const d = Math.max(0, Math.hypot(p.center[0] - e, p.center[2] - s) - c * 0.6);
          const x = d < n;
          if (!x && d < o) {
            for (const v of p.mid) {
              u.push(v);
            }
          }
          for (const v of p.entries) {
            const g = v.ty;
            if (g.kind === "tree") {
              if (x) {
                for (const b of v.his) {
                  u.push(b);
                }
              }
            } else if (g.kind === "cover") {
              if (d < g.dist * i) {
                for (const b of v.his) {
                  u.push(b);
                }
              }
            } else if (d < g.hi * i) {
              for (const b of v.his) {
                u.push(b);
              }
            } else if (d < g.lo * i && v.lo) {
              u.push(v.lo);
            }
          }
        }
      }
    }
  }
}
