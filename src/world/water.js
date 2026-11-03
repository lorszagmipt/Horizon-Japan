// Геометрия воды: поверхности озёр и русло реки.

import { rgb } from "../core/math.js";
import { MeshBuilder } from "../render/mesh.js";
import { lakeDistance } from "./terrain.js";

export function buildWaterGeometry(f) {
  const t = [];
  for (const r of f.lakes) {
    const c = new MeshBuilder();
    const u = 14;
    const h = 72;
    const l = r.id === "fuji" ? rgb(0x2f6f8f) : r.id === "momiji" ? rgb(0x3a6a5a) : rgb(0x3a7f95);
    const m = c.vertex(r.x, r.level, r.z, 0, 1, 0, [l[0], l[1], l[2], 0], [0, 0, 0, 0]);
    const p = [];
    for (let d = 1; d <= u; d++) {
      const x = [];
      const v = (d / u) * 1.13;
      for (let g = 0; g < h; g++) {
        const b = (g / h) * Math.PI * 2;
        let y = 0;
        let k = Math.max(r.rx, r.rz) * 1.6;
        const w = Math.cos(b);
        const M = Math.sin(b);
        for (let S = 0; S < 18; S++) {
          const E = (y + k) / 2;
          if (lakeDistance(r, r.x + w * E, r.z + M * E) < v) {
            y = E;
          } else {
            k = E;
          }
        }
        const _ = r.x + w * y;
        const z = r.z + M * y;
        const T = Math.max(0, (v - 0.88) / 0.2);
        x.push(c.vertex(_, r.level, z, 0, 1, 0, [l[0], l[1], l[2], 0], [0, Math.min(1, T), 0, 0]));
      }
      p.push(x);
    }
    for (let d = 0; d < h; d++) {
      c.tri(m, p[0][(d + 1) % h], p[0][d]);
    }
    for (let d = 0; d < u - 1; d++) {
      for (let x = 0; x < h; x++) {
        const v = (x + 1) % h;
        c.quad(p[d][x], p[d][v], p[d + 1][v], p[d + 1][x]);
      }
    }
    t.push({
      lake: r,
      geo: c,
      center: [r.x, r.level, r.z],
      radius: Math.max(r.rx, r.rz) * 1.3,
    });
  }
  const e = new MeshBuilder();
  const s = f.river.samples;
  const o = f.river.hw * 1.3;
  let i = null;
  let n = 0;
  const a = rgb(0x3f8aa0);
  for (let r = 0; r < s.length; r++) {
    const c = s[r];
    const u = s[Math.max(0, r - 1)];
    const h = s[Math.min(s.length - 1, r + 1)];
    let l = h.x - u.x;
    let m = h.z - u.z;
    const p = Math.hypot(l, m) || 1;
    l /= p;
    m /= p;
    if (r > 0) {
      n += Math.hypot(c.x - s[r - 1].x, c.z - s[r - 1].z);
    }
    if (c.inLake) {
      i = null;
      continue;
    }
    const d = m;
    const x = -l;
    const v = e.vertex(
      c.x - d * o,
      c.h,
      c.z - x * o,
      0,
      1,
      0,
      [a[0], a[1], a[2], 0],
      [1, 0.8, n, -1],
    );
    const g = e.vertex(c.x, c.h, c.z, 0, 1, 0, [a[0], a[1], a[2], 0], [1, 0, n, 0]);
    const b = e.vertex(
      c.x + d * o,
      c.h,
      c.z + x * o,
      0,
      1,
      0,
      [a[0], a[1], a[2], 0],
      [1, 0.8, n, 1],
    );
    if (i) {
      e.quad(i[0], v, g, i[1]);
      e.quad(i[1], g, b, i[2]);
    }
    i = [v, g, b];
  }
  return {
    lakes: t,
    river: e,
  };
}
