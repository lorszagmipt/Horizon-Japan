// Придорожные объекты: отбойники, столбики, мосты, тоннель.

import { rgb, smoothstep } from "../core/math.js";
import { MeshBuilder, boxGeo, cylinderGeo, makeTransform } from "../render/mesh.js";
import { biomeAt } from "./biomes.js";
import { StaticBatch } from "./batch.js";

const CONCRETE = [0.8, 0.82, 0.85];

const STEEL = [0.45, 0.47, 0.52];

const WOOD = rgb(0xd5402f);

const STONE = [0.74, 0.72, 0.68];

export function buildRoadside(f) {
  const t = f.r;
  const e = f.roads;
  const s = f.terrain;
  const o = f.colliders;
  const i = new StaticBatch(t, { maxDist: 650 });
  const n = new StaticBatch(t, {
    maxDist: 1600,
    shadow: false,
  });
  const a = new StaticBatch(t, {
    maxDist: 1600,
    uniforms: { u_sunScale: 0.22 },
    shadow: false,
    cull: "none",
  });
  const r = (c, u, h) => {
    for (const l of e.junctions) {
      const m = l.parent;
      if (Math.hypot(c - m.x[l.pi], u - m.z[l.pi]) < l.child.hw + m.hw + h) {
        return true;
      }
    }
    return false;
  };
  for (const c of e.roads) {
    const u = c.n;
    const h = c.hw;
    const l = new Uint8Array(u);
    const m = new Uint8Array(u);
    for (let v = 0; v < u; v++) {
      const g = c.x[v];
      const b = c.z[v];
      const y = c.h[v];
      const k = c.tz[v];
      const w = -c.tx[v];
      if (c.flags[v] & 2) {
        continue;
      }
      if (c.flags[v] & 1) {
        l[v] = m[v] = 2;
        continue;
      }
      const M = c.curv[v];
      const _ = 1 / Math.max(Math.abs(M), 0.0001);
      const z = c.lane === 2 ? 260 : 85;
      if (_ < z) {
        if (M > 0) {
          l[v] = 1;
        } else {
          m[v] = 1;
        }
      }
      for (const T of [-1, 1]) {
        const S = g + k * (h + 7) * T;
        const E = b + w * (h + 7) * T;
        if (s.carvedHeight(S, E) < y - 5) {
          if (T < 0) {
            l[v] = 1;
          } else {
            m[v] = 1;
          }
        }
      }
    }
    const p = (v) => {
      for (let b = 0; b < u; b++) {
        if (!v[b]) {
          const y = b - 1;
          let k = b + 1;
          while (k < u && !v[k] && k - b < 6) {
            k++;
          }
          if (y >= 0 && v[y] && k < u && v[k] && k - y < 7) {
            for (let w = y + 1; w < k; w++) {
              v[w] = v[y];
            }
          }
        }
      }
      let g = 0;
      while (g < u) {
        if (!v[g]) {
          g++;
          continue;
        }
        let b = g;
        while (b < u && v[b]) {
          b++;
        }
        if (b - g < 8 && v[g] === 1) {
          for (let y = g; y < b; y++) {
            v[y] = 0;
          }
        }
        g = b;
      }
      for (let b = 0; b < u; b++) {
        if (v[b] === 1 && r(c.x[b], c.z[b], 10)) {
          v[b] = 0;
        }
      }
      if (!c.closed) {
        for (let b = 0; b < Math.min(u, 12); b++) {
          if (v[b] === 1) {
            v[b] = 0;
          }
          if (v[u - 1 - b] === 1) {
            v[u - 1 - b] = 0;
          }
        }
      }
    };
    p(l);
    p(m);
    c.railL = l;
    c.railR = m;
    const d = (v) => biomeAt(c.x[v], c.z[v])[0] > 0.35;
    for (const [v, g] of [
      [l, -1],
      [m, 1],
    ]) {
      for (let b = 0; b < u - 1; b += 2) {
        const y = Math.min(b + 2, c.closed ? (b + 2) % u : u - 1);
        if (!v[b] || !v[y]) {
          continue;
        }
        const k = v[b] === 2;
        const w = h + (k ? 1.25 : 1.15);
        const M = c.x[b] + c.tz[b] * w * g;
        const _ = c.z[b] - c.tx[b] * w * g;
        const z = c.x[y] + c.tz[y] * w * g;
        const T = c.z[y] - c.tx[y] * w * g;
        const S = c.h[b];
        const E = c.h[y];
        const P = Math.hypot(z - M, T - _);
        const F = Math.atan2(z - M, T - _);
        const L = (M + z) / 2;
        const D = (_ + T) / 2;
        const q = (S + E) / 2;
        const W = Math.atan2(E - S, P);
        if (k) {
          const j = d(b);
          const Y = j ? WOOD : STONE;
          n.add(
            boxGeo(0.14, 0.12, P + 0.05),
            makeTransform(L, q + 1.05, D, F, 1, 1, 1, -W),
            L,
            D,
            Y,
            0.3,
          );
          n.add(
            boxGeo(0.1, 0.08, P + 0.05),
            makeTransform(L, q + 0.55, D, F, 1, 1, 1, -W),
            L,
            D,
            Y,
            0.2,
          );
          n.add(
            boxGeo(0.18, 1.1, 0.18),
            makeTransform(M, S + 0.55, _, F),
            M,
            _,
            j ? rgb(0xb83325) : [0.62, 0.6, 0.57],
            0.2,
          );
          if (j && b % 8 === 0) {
            n.add(
              cylinderGeo(0.12, 0.12, 0, 0.18, 8),
              makeTransform(M, S + 1.11, _),
              M,
              _,
              rgb(0xe7b544),
              0.6,
            );
          }
          o.addSegment(M, _, z, T, Math.min(S, E) - 1, Math.max(S, E) + 3, "rail");
        } else {
          i.add(
            boxGeo(0.07, 0.3, P + 0.04),
            makeTransform(L, q + 0.62, D, F, 1, 1, 1, -W),
            L,
            D,
            CONCRETE,
            0.6,
          );
          i.add(boxGeo(0.12, 0.75, 0.12), makeTransform(M, S + 0.37, _, F), M, _, STEEL, 0.2);
          if (b % 10 === 0) {
            i.add(
              boxGeo(0.09, 0.1, 0.05),
              makeTransform(M - Math.cos(F) * 0.06 * g, S + 0.66, _ + Math.sin(F) * 0.06 * g, F),
              M,
              _,
              rgb(0xff5533),
              0.5,
              0.5,
            );
          }
          o.addSegment(M, _, z, T, Math.min(S, E) - 1, Math.max(S, E) + 2.5, "rail");
        }
      }
    }
    for (let v = 0; v < u; v += 12) {
      if (!(c.flags[v] & 1)) {
        continue;
      }
      const g = c.x[v];
      const b = c.z[v];
      const y = c.h[v];
      const k = s.carvedHeight(g, b);
      if (y - k < 2.5) {
        continue;
      }
      const w = Math.atan2(c.tx[v], c.tz[v]);
      const M = y - k - 1;
      const _ = d(v);
      n.add(
        boxGeo(h * 1.6, M + 2, 1.6),
        makeTransform(g, k - 2 + (M + 2) / 2, b, w),
        g,
        b,
        _ ? rgb(0x9c3a2c) : [0.66, 0.64, 0.6],
        0.1,
      );
      n.add(
        boxGeo(h * 2 + 2.6, 0.5, 2),
        makeTransform(g, y - 1.3, b, w),
        g,
        b,
        _ ? WOOD : [0.7, 0.68, 0.64],
        0.2,
      );
    }
    if (c.lane !== 2) {
      for (let v = 0; v < u; v += 15) {
        if (!c.flags[v]) {
          for (const g of [-1, 1]) {
            if ((g < 0 ? l : m)[v]) {
              continue;
            }
            const y = h + 1.8;
            const k = c.x[v] + c.tz[v] * y * g;
            const w = c.z[v] - c.tx[v] * y * g;
            if (r(k, w, 4)) {
              continue;
            }
            const M = s.heightAt(k, w);
            const _ = Math.atan2(c.tx[v], c.tz[v]);
            i.add(
              boxGeo(0.12, 0.95, 0.12),
              makeTransform(k, M + 0.45, w, _),
              k,
              w,
              [0.95, 0.95, 0.93],
              0.2,
            );
            i.add(
              boxGeo(0.13, 0.18, 0.13),
              makeTransform(k, M + 0.82, w, _),
              k,
              w,
              g > 0 ? rgb(0xff7a1a) : rgb(0xffffff),
              0.4,
              0.45,
            );
          }
        }
      }
    }
    for (let v = 0; v < u; v += 7) {
      if (c.flags[v]) {
        continue;
      }
      const g = c.curv[v];
      if (Math.abs(g) < 1 / 50) {
        continue;
      }
      const b = g > 0 ? -1 : 1;
      const y = h + 2.6;
      const k = c.x[v] + c.tz[v] * y * b;
      const w = c.z[v] - c.tx[v] * y * b;
      if (r(k, w, 6)) {
        continue;
      }
      const M = s.heightAt(k, w);
      const z = Math.atan2(c.tx[v], c.tz[v]) + (b > 0 ? -Math.PI / 2 : Math.PI / 2);
      i.add(boxGeo(0.1, 1.3, 0.1), makeTransform(k, M + 0.65, w), k, w, STEEL, 0.2);
      i.add(
        boxGeo(0.95, 0.6, 0.06),
        makeTransform(k, M + 1.45, w, z),
        k,
        w,
        rgb(0xf6c62b),
        0.4,
        0.15,
      );
      const T = b > 0 ? 1 : -1;
      for (const S of [-1, 1]) {
        i.add(
          boxGeo(0.36, 0.09, 0.07),
          makeTransform(k, M + 1.45 + S * 0.1, w, z, 1, 1, 1, 0, S * 0.75 * T),
          k,
          w,
          [0.08, 0.08, 0.1],
          0.2,
        );
      }
      o.addCircle(k, w, 0.15, M - 1, M + 3);
    }
    let x = -1;
    for (let v = 0; v <= u; v++) {
      const g = v < u && c.flags[v] & 2;
      if (g && x < 0) {
        x = v;
      }
      if (!g && x >= 0) {
        buildTunnel(f, c, x, v - 1, a, n);
        x = -1;
      }
    }
  }
  return [...i.build(), ...n.build(), ...a.build()];
}

function buildTunnel(f, t, e, s, o, i) {
  const n = f.colliders;
  const a = t.hw;
  const r = a + 1.7;
  const c = [
    [-r, -0.3],
    [-r, 4.4],
  ];
  for (let g = 1; g < 10; g++) {
    const b = Math.PI - (g / 10) * Math.PI;
    c.push([Math.cos(b) * r, 4.4 + Math.sin(b) * 3.4]);
  }
  c.push([r, 4.4], [r, -0.3]);
  const u = new MeshBuilder();
  const h = new MeshBuilder();
  const l = [];
  const m = [];
  const p = 8;
  const d = [1, 0.86, 0.55];
  for (let g = e - p; g <= s + p; g++) {
    const b = Math.max(0, Math.min(t.n - 1, g));
    const y = t.x[b];
    const k = t.z[b];
    const w = t.h[b];
    const M = t.tz[b];
    const _ = -t.tx[b];
    const z = g >= e && g <= s;
    if (z) {
      const P = c.map(([F, L], D) => {
        const q = L < 1 ? 0.62 : D % 2 ? 0.78 : 0.74;
        return u.vertex(
          y + M * F,
          w + L,
          k + _ * F,
          -Math.sign(F) * M * 0.7,
          -0.3,
          -Math.sign(F) * _ * 0.7,
          [q, q * 0.98, q * 0.94, 0],
        );
      });
      l.push(P);
      if ((g - e) % 8 === 0) {
        i.add(
          boxGeo(0.5, 0.12, 1.6),
          makeTransform(y, w + 7.7, k, Math.atan2(t.tx[b], t.tz[b])),
          y,
          k,
          d,
          0.2,
          1.6,
        );
      }
    }
    const T = [];
    const S = a + 26;
    const E = 15;
    for (let P = 0; P <= 12; P++) {
      const F = Math.PI - (P / 12) * Math.PI;
      const L = Math.cos(F) * S;
      const D = smoothstep(e - p, e + 2, g) * smoothstep(s + p, s - 2, g);
      const q = Math.sin(F) * E * (0.4 + 0.6 * D) - 3 + (P % 3 === 1 ? 1.2 : 0);
      const j = Math.sin(F) > 0.6 ? [0.42, 0.56, 0.36] : [0.52, 0.48, 0.5];
      T.push(
        h.vertex(y + M * L, w + q + 4, k + _ * L, Math.cos(F) * M, Math.sin(F), Math.cos(F) * _, [
          j[0],
          j[1],
          j[2],
          0,
        ]),
      );
    }
    m.push(T);
    if (z && g < s) {
      const P = b + 1;
      for (const F of [-1, 1]) {
        const L = a + 1.3;
        n.addSegment(
          y + M * L * F,
          k + _ * L * F,
          t.x[P] + t.tz[P] * L * F,
          t.z[P] - t.tx[P] * L * F,
          w - 1,
          w + 9,
          "wall",
        );
      }
    }
  }
  for (let g = 0; g < l.length - 1; g++) {
    for (let b = 0; b < c.length - 1; b++) {
      u.quad(l[g][b], l[g][b + 1], l[g + 1][b + 1], l[g + 1][b]);
    }
  }
  for (let g = 0; g < m.length - 1; g++) {
    for (let b = 0; b < 12; b++) {
      h.quad(m[g][b], m[g + 1][b], m[g + 1][b + 1], m[g][b + 1]);
    }
  }
  h.computeNormals();
  const x = t.x[(e + s) >> 1];
  const v = t.z[(e + s) >> 1];
  o.add(u, null, x, v, null, 0.1);
  i.add(h, null, x, v, null, 0);
  for (const [g, b] of [
    [e, -1],
    [s, 1],
  ]) {
    const y = t.x[g];
    const k = t.z[g];
    const w = t.h[g];
    const M = Math.atan2(t.tx[g], t.tz[g]);
    const _ = t.tz[g];
    const z = -t.tx[g];
    const T = r + 3.5;
    for (const S of [-1, 1]) {
      i.add(
        boxGeo(2.4, 9.5, 2.2),
        makeTransform(y + _ * (r + 1.2) * S, w + 4.5, k + z * (r + 1.2) * S, M),
        y,
        k,
        [0.7, 0.68, 0.64],
        0.15,
      );
    }
    i.add(
      boxGeo(T * 2 + 1, 2.6, 2.2),
      makeTransform(y, w + 9.2, k, M),
      y,
      k,
      [0.7, 0.68, 0.64],
      0.15,
    );
    i.add(boxGeo(T * 2 - 1, 0.5, 2.4), makeTransform(y, w + 7.9, k, M), y, k, rgb(0xd5402f), 0.3);
  }
}
