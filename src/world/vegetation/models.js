// 3D-модели растений: сакура, клёны, гинкго, сосны, бамбук, кусты, камни, трава, цветы.

import { clamp, lerp, rgb } from "../../core/math.js";
import { seededRandom } from "../../core/random.js";
import {
  MeshBuilder,
  blobGeo,
  cylinderGeo,
  icosphereGeo,
  makeTransform,
  roundNormals,
  tubeGeo,
} from "../../render/mesh.js";

const BARK_BROWN = rgb(0x5b3d3a);

const BARK_DARK = rgb(0x463232);

const BARK_SAKURA = rgb(0x5a3a40);

const BARK_PINE = rgb(0x7a4632);

const BARK_BIRCH = rgb(0xe9e5da);

const BARK_BIRCH_DARK = rgb(0x55504c);

function shadeFoliage(f, t, e, s, o, i, n, a) {
  for (let r = 0; r < f.vertexCount; r++) {
    const c = f.pos[r * 3];
    const u = f.pos[r * 3 + 1];
    const h = f.pos[r * 3 + 2];
    const l = clamp((u - o) / (i - o || 1), 0, 1);
    const m = c - t[0];
    const p = (u - t[1]) * 0.7;
    const d = h - t[2];
    const x = Math.hypot(m, p, d) || 1;
    const v = (f.nor[r * 3] * m + f.nor[r * 3 + 1] * p + f.nor[r * 3 + 2] * d) / x;
    const g = n * (0.66 + 0.34 * clamp(v * 0.5 + 0.5, 0, 1));
    f.col[r * 4] = lerp(s[0], e[0], l) * g;
    f.col[r * 4 + 1] = lerp(s[1], e[1], l) * g;
    f.col[r * 4 + 2] = lerp(s[2], e[2], l) * g;
    f.col[r * 4 + 3] = a;
  }
}

function foliageClusters(f, t, e, s, o, i = {}) {
  const n = seededRandom(e * 7 + 3);
  const a = new MeshBuilder();
  let r = Infinity;
  let c = -Infinity;
  for (const u of f) {
    const h = u[4] || 1;
    r = Math.min(r, u[1] - u[3] * h);
    c = Math.max(c, u[1] + u[3] * h);
  }
  f.forEach((u, h) => {
    const l = blobGeo(
      u[3],
      t === 0 ? 1 : 0,
      [1, 1, 1, 1],
      e * 31 + h,
      i.rough !== undefined ? i.rough : 0.25,
      u[4] || 1,
    );
    const m = new MeshBuilder();
    m.append(l, makeTransform(u[0], u[1], u[2], n() * 6.28));
    const [p, d] = o(h, n);
    shadeFoliage(
      m,
      s,
      p,
      d,
      r,
      c,
      1 - (i.vary !== undefined ? i.vary : 0.12) * n(),
      i.alpha !== undefined ? i.alpha : 1,
    );
    a.append(m);
  });
  roundNormals(a, s, i.fluffy !== undefined ? i.fluffy : 0.72);
  return a;
}

function addTrunk(f, t, e, s, o, i, n, a = 0.16, r = 0.06, c = 0.85) {
  f.append(cylinderGeo(s, o, 0, e, t ? 5 : 8, [i[0], i[1], i[2], 0], false));
  if (t === 0) {
    for (const u of n) {
      f.append(tubeGeo([0, e * c, 0], u, a, r, 5, [i[0], i[1], i[2], 0]));
    }
  }
}

export const pick = (rnd, list) => list[Math.floor(rnd() * list.length) % list.length];

const SAKURA_COLORS = [
  [rgb(0xffeaf3), rgb(0xf4a6c6)],
  [rgb(0xfff3f8), rgb(0xf7bcd4)],
  [rgb(0xffe0ee), rgb(0xee8fb8)],
  [rgb(0xffd9ea), rgb(0xf28ab6)],
];

function makeSakura(f, t = 1) {
  const e = seededRandom(t);
  const s = new MeshBuilder();
  const o = [];
  const i = f ? 3 : 5;
  for (let a = 0; a < i; a++) {
    const r = (a / i) * Math.PI * 2 + e() * 0.7;
    const c = 1.7 + e() * 1.1;
    o.push([Math.cos(r) * c, 4.5 + e() * 1.1, Math.sin(r) * c]);
  }
  addTrunk(s, f, 2.5, 0.3, 0.22, BARK_SAKURA, o, 0.17, 0.07);
  const n = [];
  if (f === 0) {
    for (const a of o) {
      n.push([a[0] * 1.12, a[1] + 0.45, a[2] * 1.12, 1.55 + e() * 0.4, 0.78]);
    }
    for (let a = 0; a < 5; a++) {
      const r = e() * Math.PI * 2;
      const c = 0.9 + e() * 2.2;
      n.push([Math.cos(r) * c, 5.6 + e() * 1.3, Math.sin(r) * c, 1.3 + e() * 0.45, 0.8]);
    }
    n.push([0, 6.6, 0, 1.7, 0.75]);
  } else {
    for (let a = 0; a < 5; a++) {
      const r = (a / 5) * Math.PI * 2 + e();
      const c = a ? 2.2 : 0;
      n.push([Math.cos(r) * c, a ? 5.3 : 6.3, Math.sin(r) * c, 2.1, 0.8]);
    }
  }
  s.append(foliageClusters(n, f, t, [0, 5.7, 0], (a, r) => pick(r, SAKURA_COLORS)));
  return s;
}

function makeWeepingSakura(f, t = 11) {
  const e = seededRandom(t);
  const s = new MeshBuilder();
  const o = [];
  for (let r = 0; r < 3; r++) {
    const c = (r / 3) * Math.PI * 2 + e();
    o.push([Math.cos(c) * 1.3, 5.2 + e() * 0.5, Math.sin(c) * 1.3]);
  }
  addTrunk(s, f, 3.2, 0.38, 0.28, BARK_DARK, o, 0.2, 0.1);
  const i = [[0, 6, 0, 1.9, 0.7]];
  const n = f ? 2 : 4;
  const a = f ? 5 : 11;
  for (let r = 0; r < n; r++) {
    const c = (r / n) * Math.PI * 2 + e();
    i.push([Math.cos(c) * 1.5, 5.3, Math.sin(c) * 1.5, 1.5, 0.75]);
  }
  for (let r = 0; r < a; r++) {
    const c = (r / a) * Math.PI * 2 + e() * 0.4;
    const u = 2.4 + e() * 0.6;
    i.push([Math.cos(c) * u, 3.9 + e() * 0.6, Math.sin(c) * u, f ? 1.3 : 0.95 + e() * 0.15, 2]);
  }
  s.append(
    foliageClusters(
      i,
      f,
      t,
      [0, 4.8, 0],
      (r, c) => (c() < 0.5 ? [rgb(0xffe8f3), rgb(0xf2a2c8)] : [rgb(0xfde0f0), rgb(0xe58cbc)]),
      { fluffy: 0.6 },
    ),
  );
  return s;
}

const MAPLE_COLORS = [
  [rgb(0xf0452e), rgb(0xb3241e)],
  [rgb(0xff7a2a), rgb(0xd4471e)],
  [rgb(0xffaa2c), rgb(0xe0701e)],
  [rgb(0xffc93a), rgb(0xe89a24)],
  [rgb(0xe8322c), rgb(0x9e1c22)],
];

function makeMaple(f, t = 2) {
  const e = seededRandom(t);
  const s = new MeshBuilder();
  const o = [];
  for (let n = 0; n < 4; n++) {
    const a = (n / 4) * Math.PI * 2 + e() * 0.8;
    const r = 2 + e() * 0.9;
    o.push([Math.cos(a) * r, 3.9 + e() * 0.9, Math.sin(a) * r]);
  }
  addTrunk(s, f, 2.3, 0.27, 0.18, BARK_DARK, o, 0.14, 0.06, 0.8);
  const i = [];
  if (f === 0) {
    const n = [
      [5, 2.6, 1.45, 4.3],
      [4, 1.7, 1.35, 5.4],
      [2, 0.7, 1.25, 6.4],
    ];
    for (const [a, r, c, u] of n) {
      const h = e() * 6.28;
      for (let l = 0; l < a; l++) {
        const m = h + (l / a) * Math.PI * 2;
        i.push([Math.cos(m) * r, u + (e() - 0.5) * 0.5, Math.sin(m) * r, c + e() * 0.25, 0.58]);
      }
    }
  } else {
    for (let n = 0; n < 4; n++) {
      const a = (n / 4) * Math.PI * 2;
      i.push([Math.cos(a) * (n ? 1.8 : 0), n ? 4.8 : 6, Math.sin(a) * (n ? 1.8 : 0), 2.1, 0.62]);
    }
  }
  s.append(
    foliageClusters(
      i,
      f,
      t,
      [0, 5, 0],
      (n, a) => MAPLE_COLORS[clamp(Math.floor(a() * 3 + (n < 5 ? 1.5 : 0)), 0, 4)],
      {
        rough: 0.3,
        vary: 0.1,
      },
    ),
  );
  return s;
}

function makeGinkgo(f, t = 12) {
  const e = seededRandom(t);
  const s = new MeshBuilder();
  s.append(
    cylinderGeo(
      0.28,
      0.14,
      0,
      7.2,
      f ? 5 : 7,
      [BARK_BROWN[0], BARK_BROWN[1], BARK_BROWN[2], 0],
      false,
    ),
  );
  const o =
    f === 0
      ? [
          [3.7, 1.5, 1.55, 4],
          [5.1, 1.2, 1.45, 4],
          [6.5, 0.85, 1.25, 3],
          [7.8, 0.35, 1.05, 2],
          [8.7, 0, 0.75, 1],
        ]
      : [
          [4.3, 1.1, 2, 3],
          [6.6, 0.5, 1.7, 2],
          [8.3, 0, 1, 1],
        ];
  const i = [];
  for (const [n, a, r, c] of o) {
    const u = e() * 6.28;
    for (let h = 0; h < c; h++) {
      const l = u + (h / c) * Math.PI * 2;
      i.push([Math.cos(l) * a, n, Math.sin(l) * a, r, 0.85]);
    }
  }
  s.append(
    foliageClusters(
      i,
      f,
      t,
      [0, 6, 0],
      (n, a) => (a() < 0.7 ? [rgb(0xffe25a), rgb(0xe7a826)] : [rgb(0xf2df4e), rgb(0xd2a222)]),
      { vary: 0.1 },
    ),
  );
  return s;
}

function conifer(f, t, e, s, o, i, n, a, r, c, u, h = 0.5) {
  const l = new MeshBuilder();
  for (let d = 0; d < t; d++) {
    const x = e + d * s;
    const v = o - d * i;
    const g = cylinderGeo(v, v * 0.02, x, x + n, a, [1, 1, 1, 1], true);
    for (let b = 0; b < g.vertexCount; b++) {
      if (Math.abs(g.pos[b * 3 + 1] - x) < 0.001) {
        const y = 1 + (f() - 0.5) * 0.3;
        g.pos[b * 3] *= y;
        g.pos[b * 3 + 2] *= y;
        g.pos[b * 3 + 1] -= f() * h;
      }
    }
    l.append(g);
  }
  l.computeNormals();
  let m = Infinity;
  let p = -Infinity;
  for (let d = 1; d < l.pos.length; d += 3) {
    m = Math.min(m, l.pos[d]);
    p = Math.max(p, l.pos[d]);
  }
  shadeFoliage(l, u, r, c, m, p, 1, 1);
  roundNormals(l, u, 0.45);
  return l;
}

function makePine(f, t = 3) {
  const e = seededRandom(t);
  const s = new MeshBuilder();
  const o = [BARK_PINE[0], BARK_PINE[1], BARK_PINE[2], 0];
  const i = (e() - 0.5) * 1.2;
  const n = [i * 0.6, 4.2, i * 0.2];
  const a = [i * 1.4, 8.6, i * 0.5];
  s.append(tubeGeo([0, -0.3, 0], n, 0.36, 0.27, f ? 5 : 7, o));
  s.append(tubeGeo(n, a, 0.27, 0.13, f ? 5 : 7, o));
  const r = [];
  const c = f ? 4 : 6;
  for (let h = 0; h < c; h++) {
    const l = h / c;
    const m = 4.4 + l * 4.4;
    const p = h * 2.4 + e() * 0.8;
    const d = (1 - l) * 2.4 + 0.9;
    const x = (m - 4.2) / 4.4;
    const v = [lerp(n[0], a[0], x), m - 0.6, lerp(n[2], a[2], x)];
    const g = [v[0] + Math.cos(p) * d, m + e() * 0.3, v[2] + Math.sin(p) * d];
    if (!f) {
      s.append(tubeGeo(v, g, 0.11, 0.05, 4, o));
    }
    r.push([g[0], g[1] + 0.25, g[2], (f ? 1.9 : 1.35) + (1 - l) * 0.5, 0.42]);
    if (!f) {
      r.push([
        g[0] - Math.sin(p) * 0.9,
        g[1] + 0.2,
        g[2] + Math.cos(p) * 0.9,
        1.05 + (1 - l) * 0.3,
        0.42,
      ]);
    }
  }
  r.push([a[0], 9, a[2], f ? 1.6 : 1.3, 0.5]);
  const u = [
    [rgb(0x4f8a52), rgb(0x1f4430)],
    [rgb(0x5a9658), rgb(0x24503a)],
    [rgb(0x46804e), rgb(0x1b3c2c)],
  ];
  s.append(
    foliageClusters(r, f, t, [a[0] * 0.5, 6.6, a[2] * 0.5], (h, l) => pick(l, u), {
      fluffy: 0.55,
      rough: 0.3,
    }),
  );
  return s;
}

function makeCedar(f, t = 13) {
  const e = seededRandom(t);
  const s = new MeshBuilder();
  s.append(
    cylinderGeo(
      0.34,
      0.1,
      0,
      15,
      6,
      [BARK_PINE[0] * 0.8, BARK_PINE[1] * 0.8, BARK_PINE[2] * 0.8, 0],
      false,
    ),
  );
  const o = f === 0 ? 8 : 3;
  s.append(
    conifer(
      e,
      o,
      2.5,
      f === 0 ? 1.75 : 4.4,
      f === 0 ? 1.75 : 1.7,
      f === 0 ? 0.17 : 0.45,
      f === 0 ? 3 : 6,
      f === 0 ? 8 : 6,
      [0.3, 0.52, 0.4],
      [0.11, 0.24, 0.21],
      [0, 9, 0],
      0.4,
    ),
  );
  return s;
}

function makeBirch(f, t = 14) {
  const e = seededRandom(t);
  const s = new MeshBuilder();
  const o = f ? 2 : 5;
  for (let a = 0; a < o; a++) {
    const r = (a / o) * 8.5;
    const c = ((a + 1) / o) * 8.5;
    const u = lerp(0.2, 0.08, a / o);
    const h = lerp(0.2, 0.08, (a + 1) / o);
    const l = a % 2 ? BARK_BIRCH_DARK : BARK_BIRCH;
    const m = a % 2 ? BARK_BIRCH : e() < 0.5 ? BARK_BIRCH_DARK : BARK_BIRCH;
    s.append(
      cylinderGeo(u, h, r, c, f ? 4 : 6, [l[0], l[1], l[2], 0], false, [m[0], m[1], m[2], 0]),
    );
  }
  const i = [];
  const n = f ? 3 : 8;
  for (let a = 0; a < n; a++) {
    const r = e() * 6.28;
    const c = 0.5 + e() * 1;
    i.push([
      Math.cos(r) * c,
      5 + (a / n) * 3.6 + e() * 0.5,
      Math.sin(r) * c,
      f ? 1.5 : 1 + e() * 0.3,
      0.9,
    ]);
  }
  s.append(
    foliageClusters(i, f, t, [0, 6.8, 0], () => [rgb(0xcbe57c), rgb(0x75a84a)], { vary: 0.14 }),
  );
  return s;
}

function makeBroadleaf(f, t = 4) {
  const e = seededRandom(t);
  const s = new MeshBuilder();
  const o = [];
  for (let r = 0; r < 3; r++) {
    const c = (r / 3) * Math.PI * 2 + e();
    o.push([Math.cos(c) * 1.4, 4.6 + e() * 0.6, Math.sin(c) * 1.4]);
  }
  addTrunk(s, f, 3, 0.32, 0.22, BARK_BROWN, o, 0.15, 0.07);
  const i = [[0, 6.8, 0, f ? 2.4 : 1.9, 0.85]];
  const n = f ? 3 : 6;
  for (let r = 0; r < n; r++) {
    const c = (r / n) * Math.PI * 2 + e() * 0.5;
    const u = 2 + e() * 0.5;
    i.push([Math.cos(c) * u, 5.5 + e() * 0.8, Math.sin(c) * u, f ? 2.1 : 1.65 + e() * 0.3, 0.85]);
  }
  if (!f) {
    for (let r = 0; r < 3; r++) {
      const c = e() * 6.28;
      i.push([Math.cos(c) * 1.1, 7.2 + e() * 0.4, Math.sin(c) * 1.1, 1.3, 0.85]);
    }
  }
  const a = [
    [rgb(0xa5d86c), rgb(0x3f7c3a)],
    [rgb(0x92cc60), rgb(0x356f35)],
    [rgb(0xb6de78), rgb(0x4a8a3e)],
  ];
  s.append(foliageClusters(i, f, t, [0, 6.2, 0], (r, c) => pick(c, a)));
  return s;
}

function makeBamboo(f, t = 5) {
  const e = seededRandom(t);
  const s = new MeshBuilder();
  const o = f === 0 ? 8 : 5;
  for (let i = 0; i < o; i++) {
    const n = e() * Math.PI * 2;
    const a = e() * 1.6;
    const r = Math.cos(n) * a;
    const c = Math.sin(n) * a;
    const u = 7 + e() * 4;
    const h = (e() - 0.5) * 0.12;
    const l = cylinderGeo(0.09, 0.07, 0, u, f === 0 ? 5 : 4, [0.62, 0.8, 0.42, 0.6], false);
    s.append(l, makeTransform(r, 0, c, 0, 1, 1, 1, h, h));
    if (f === 0) {
      for (let m = 0; m < 2; m++) {
        const p = u * (0.65 + m * 0.2);
        const d = blobGeo(0.9 + e() * 0.4, 0, [0.55, 0.8, 0.38, 1], t * 7 + i * 3 + m, 0.4, 0.45);
        s.append(
          d,
          makeTransform(r + h * p + (e() - 0.5) * 0.8, p, c + h * p + (e() - 0.5) * 0.8, e() * 6),
        );
      }
    } else {
      s.append(
        blobGeo(1.6, 0, [0.55, 0.8, 0.38, 1], t + i, 0.4, 0.6),
        makeTransform(r, u * 0.8, c),
      );
    }
  }
  return s;
}

function makeBush(f, t = 6) {
  const e = seededRandom(t);
  const s = new MeshBuilder();
  const o = f ? 2 : 4;
  const i = f ? 3 : 8;
  const n = [];
  for (let r = 0; r < o; r++) {
    const c = e() * 6.28;
    const u = r ? 0.6 : 0;
    n.push([Math.cos(c) * u, 0.55, Math.sin(c) * u, 0.75 + e() * 0.2, 0.8]);
  }
  s.append(
    foliageClusters(n, f, t, [0, 0.5, 0], () => [rgb(0x5d9a46), rgb(0x2c5a2a)], { alpha: 0.15 }),
  );
  const a = [];
  for (let r = 0; r < i; r++) {
    const c = e() * 6.28;
    const u = 0.35 + e() * 0.5;
    a.push([Math.cos(c) * u, 0.75 + e() * 0.45, Math.sin(c) * u, f ? 0.6 : 0.36 + e() * 0.1, 0.8]);
  }
  s.append(
    foliageClusters(
      a,
      f,
      t + 50,
      [0, 0.6, 0],
      () => [
        [1, 1, 1],
        [0.78, 0.76, 0.78],
      ],
      {
        alpha: 1,
        fluffy: 0.5,
      },
    ),
  );
  return s;
}

export function makeRock(f, t = 7) {
  const e = seededRandom(t);
  const s = [];
  for (let n = 0; n < 5; n++) {
    s.push([[e() - 0.5, e() - 0.3, e() - 0.5], e() * 0.4]);
  }
  const o = icosphereGeo(1, f === 0 ? 1 : 0, [0.5, 0.48, 0.53, 1], (n) => {
    let a = 1;
    for (const [r, c] of s) {
      a += c * Math.max(0, n[0] * r[0] + n[1] * r[1] + n[2] * r[2]);
    }
    return a * (n[1] < -0.2 ? 0.8 : 1);
  });
  for (let n = 1; n < o.pos.length; n += 3) {
    o.pos[n] = o.pos[n] * 0.65 + 0.2;
  }
  const i = o.flat();
  for (let n = 0; n < i.vertexCount; n++) {
    const a = i.nor[n * 3 + 1];
    const r = 0.85 + 0.25 * a;
    i.col[n * 4] *= r;
    i.col[n * 4 + 1] *= r;
    i.col[n * 4 + 2] *= r;
    if (a > 0.75) {
      i.col[n * 4] = 0.4;
      i.col[n * 4 + 1] = 0.56;
      i.col[n * 4 + 2] = 0.34;
      i.col[n * 4 + 3] = 0;
    }
  }
  return i;
}

function makeTeaBush(f, t = 15) {
  const e = blobGeo(1, f ? 0 : 1, [1, 1, 1, 1], t, 0.08, 1);
  const s = new MeshBuilder();
  s.append(e, makeTransform(0, 0.42, 0, 0, 0.64, 0.62, 1.6));
  shadeFoliage(s, [0, -6, 0], [0.5, 0.84, 0.32], [0.14, 0.32, 0.13], 0, 1, 1, 0.5);
  roundNormals(s, [0, -1.5, 0], 0.45);
  return s;
}

function addBlade(f, t, e, s, o, i, n, a, r, c) {
  const u = Math.cos(s) * o;
  const h = Math.sin(s) * o;
  const l = -Math.sin(s) * n;
  const m = Math.cos(s) * n;
  const p = f.vertex(t - u, 0, e - h, 0, 1, 0, a);
  const d = f.vertex(t + u, 0, e + h, 0, 1, 0, a);
  const x = f.vertex(t - u * 0.6 + l * 0.35, i * 0.55, e - h * 0.6 + m * 0.35, 0, 1, 0, r);
  const v = f.vertex(t + u * 0.6 + l * 0.35, i * 0.55, e + h * 0.6 + m * 0.35, 0, 1, 0, r);
  const g = f.vertex(t + l, i, e + m, 0, 1, 0, c);
  f.quad(p, d, v, x);
  f.tri(x, v, g);
}

function makeGrass(f, t = 8) {
  const e = seededRandom(t);
  const s = new MeshBuilder();
  for (let o = 0; o < 22; o++) {
    const i = e() * Math.PI * 2;
    const n = Math.sqrt(e()) * 0.5;
    addBlade(
      s,
      Math.cos(i) * n,
      Math.sin(i) * n,
      i - Math.PI / 2,
      0.035 + e() * 0.015,
      0.22 + e() * 0.32,
      0.08 + e() * 0.16,
      [0.5, 0.52, 0.5, 1],
      [0.78, 0.8, 0.76, 1],
      [1, 1, 0.94, 1],
    );
  }
  return s;
}

function addFlowerHead(f, t, e, s, o, i, n) {
  const a = f.vertex(t, e + 0.01, s, 0, 1, 0, n);
  const r = [];
  for (let c = 0; c < 6; c++) {
    const u = (c / 6) * Math.PI * 2;
    const h = c % 2 ? o * 0.55 : o;
    r.push(f.vertex(t + Math.cos(u) * h, e + Math.sin(u) * i, s + Math.sin(u) * h, 0, 1, 0, n));
  }
  for (let c = 0; c < 6; c++) {
    f.tri(a, r[(c + 1) % 6], r[c]);
  }
}

function makeFlowers(f, t = 9, e = 0) {
  const s = seededRandom(t + e * 17);
  const o = new MeshBuilder();
  const i = [1, 1, 1, 1];
  const n = [0.3, 0.5, 0.22, 0.3];
  if (e === 0) {
    const a = blobGeo(0.42, 0, [0.32, 0.52, 0.24, 0.2], t, 0.2, 0.32);
    o.append(a, makeTransform(0, 0.05, 0));
    for (let r = 0; r < 16; r++) {
      const c = s() * 6.28;
      const u = Math.sqrt(s()) * 0.38;
      addFlowerHead(
        o,
        Math.cos(c) * u,
        0.13 + s() * 0.04 - u * 0.12,
        Math.sin(c) * u,
        0.06 + s() * 0.02,
        0.01,
        i,
      );
    }
  } else if (e === 1) {
    for (let a = 0; a < 7; a++) {
      const r = s() * 6.28;
      const c = Math.sqrt(s()) * 0.32;
      const u = Math.cos(r) * c;
      const h = Math.sin(r) * c;
      const l = 0.45 + s() * 0.4;
      addBlade(o, u, h, s() * Math.PI, 0.012, l, (s() - 0.5) * 0.1, n, n, n);
      addFlowerHead(o, u, l, h, 0.075 + s() * 0.03, 0.03, i);
      if (s() < 0.6) {
        addFlowerHead(o, u + 0.04, l - 0.08, h + 0.03, 0.06, 0.03, i);
      }
    }
    for (let a = 0; a < 6; a++) {
      const r = s() * 6.28;
      addBlade(
        o,
        Math.cos(r) * 0.15,
        Math.sin(r) * 0.15,
        s() * 3,
        0.03,
        0.25,
        0.1,
        [0.26, 0.42, 0.2, 0.2],
        [0.4, 0.6, 0.28, 0.4],
        [0.5, 0.7, 0.32, 0.6],
      );
    }
  } else {
    for (let a = 0; a < 5; a++) {
      const r = s() * 6.28;
      const c = Math.sqrt(s()) * 0.3;
      const u = Math.cos(r) * c;
      const h = Math.sin(r) * c;
      const l = 0.5 + s() * 0.25;
      addBlade(o, u, h, s() * Math.PI, 0.012, l, 0.02, n, n, n);
      for (let m = 0; m < 7; m++) {
        const p = (m / 7) * Math.PI * 2 + s() * 0.3;
        const d = Math.cos(p);
        const x = Math.sin(p);
        const v = o.vertex(u, l, h, 0, 1, 0, i);
        const g = o.vertex(u + d * 0.1 - x * 0.012, l + 0.03, h + x * 0.1 + d * 0.012, 0, 1, 0, i);
        const b = o.vertex(u + d * 0.17, l + 0.1, h + x * 0.17, 0, 1, 0, i);
        o.tri(v, g, b);
      }
    }
  }
  return o;
}

function makeSusuki(f, t = 10) {
  const e = seededRandom(t);
  const s = new MeshBuilder();
  for (let o = 0; o < 14; o++) {
    const i = e() * 6.28;
    const n = Math.sqrt(e()) * 0.3;
    addBlade(
      s,
      Math.cos(i) * n,
      Math.sin(i) * n,
      i - Math.PI / 2,
      0.035,
      0.8 + e() * 0.5,
      0.35 + e() * 0.3,
      [0.36, 0.44, 0.22, 0.15],
      [0.6, 0.62, 0.32, 0.5],
      [0.8, 0.76, 0.44, 0.9],
    );
  }
  for (let o = 0; o < 7; o++) {
    const i = e() * 6.28;
    const n = e() * 0.25;
    const a = Math.cos(i) * n;
    const r = Math.sin(i) * n;
    const c = 1.25 + e() * 0.45;
    const u = Math.cos(i) * 0.25;
    const h = Math.sin(i) * 0.25;
    addBlade(
      s,
      a,
      r,
      e() * Math.PI,
      0.01,
      c,
      0.1,
      [0.45, 0.5, 0.28, 0.3],
      [0.6, 0.6, 0.35, 0.6],
      [0.7, 0.66, 0.4, 0.8],
    );
    const l = 0.05;
    const m = i + Math.PI / 2;
    const p = Math.cos(m) * l;
    const d = Math.sin(m) * l;
    const x = [1, 0.95, 0.85, 1];
    const v = s.vertex(a - p, c - 0.05, r - d, 0, 1, 0, x);
    const g = s.vertex(a + p, c - 0.05, r + d, 0, 1, 0, x);
    const b = s.vertex(a - p * 1.2 + u * 0.6, c + 0.22, r - d * 1.2 + h * 0.6, 0, 1, 0, x);
    const y = s.vertex(a + p * 1.2 + u * 0.6, c + 0.22, r + d * 1.2 + h * 0.6, 0, 1, 0, x);
    const k = s.vertex(a + u * 1.3, c + 0.4, r + h * 1.3, 0, 1, 0, x);
    s.quad(v, g, y, b);
    s.tri(b, y, k);
  }
  return s;
}

export function makeFarTree(f) {
  const t = new MeshBuilder();
  t.append(cylinderGeo(0.045, 0.03, 0, 0.5, 4, [0.33, 0.24, 0.22, 0], false));
  if (f === 0) {
    const e = [
      [0, 0.78, 0, 0.27, 0.8],
      [0.2, 0.66, 0.06, 0.22, 0.8],
      [-0.17, 0.66, 0.13, 0.22, 0.8],
      [0.03, 0.64, -0.21, 0.22, 0.8],
      [-0.12, 0.84, -0.08, 0.2, 0.8],
    ];
    t.append(
      foliageClusters(
        e,
        1,
        77,
        [0, 0.72, 0],
        () => [
          [1, 1, 1],
          [0.62, 0.6, 0.62],
        ],
        {
          rough: 0.15,
          vary: 0.08,
        },
      ),
    );
  } else {
    const e = blobGeo(0.5, 0, [1, 1, 1, 1], 5, 0.15, 0.72);
    for (let s = 1; s < e.pos.length; s += 3) {
      e.pos[s] += 0.68;
    }
    shadeFoliage(e, [0, 0.68, 0], [1, 1, 1], [0.62, 0.6, 0.62], 0.32, 1.04, 1, 1);
    roundNormals(e, [0, 0.68, 0], 0.7);
    t.append(e);
  }
  return t;
}

export function makeFarPine(f) {
  const t = new MeshBuilder();
  t.append(cylinderGeo(0.03, 0.02, 0, 0.2, 4, [0.33, 0.24, 0.22, 0], false));
  const e = seededRandom(99);
  t.append(
    conifer(
      e,
      f === 0 ? 3 : 1,
      0.1,
      0.27,
      0.5,
      0.12,
      f === 0 ? 0.42 : 0.9,
      f === 0 ? 7 : 6,
      [1, 1, 1],
      [0.6, 0.62, 0.62],
      [0, 0.5, 0],
      0.035,
    ),
  );
  return t;
}

export const VEGETATION_TYPES = [
  {
    id: "sakura",
    kind: "tree",
    make: makeSakura,
    variants: 2,
    foliage: 0.9,
    collider: 0.32,
    far: {
      shape: "blob",
      w: 8.4,
      h: 7.6,
      col: rgb(0xf6b6cf),
    },
  },
  {
    id: "weeping",
    kind: "tree",
    make: makeWeepingSakura,
    variants: 1,
    foliage: 0.9,
    collider: 0.38,
    far: {
      shape: "blob",
      w: 7.6,
      h: 7.4,
      col: rgb(0xf0a4c6),
    },
  },
  {
    id: "maple",
    kind: "tree",
    make: makeMaple,
    variants: 2,
    foliage: 0.9,
    collider: 0.28,
    far: {
      shape: "blob",
      w: 8,
      h: 7.4,
      col: rgb(0xe8642c),
    },
  },
  {
    id: "ginkgo",
    kind: "tree",
    make: makeGinkgo,
    variants: 1,
    foliage: 0.9,
    collider: 0.3,
    far: {
      shape: "blob",
      w: 6,
      h: 9.6,
      col: rgb(0xf4c63c),
    },
  },
  {
    id: "pine",
    kind: "tree",
    make: makePine,
    variants: 2,
    foliage: 0.6,
    collider: 0.34,
    far: {
      shape: "blob",
      w: 7.2,
      h: 10.2,
      col: rgb(0x3a6e45),
    },
  },
  {
    id: "cedar",
    kind: "tree",
    make: makeCedar,
    variants: 1,
    foliage: 0.5,
    collider: 0.36,
    far: {
      shape: "cone",
      w: 3.8,
      h: 17.8,
      col: rgb(0x2c5242),
    },
  },
  {
    id: "birch",
    kind: "tree",
    make: makeBirch,
    variants: 1,
    foliage: 0.85,
    collider: 0.22,
    far: {
      shape: "blob",
      w: 3.8,
      h: 9.4,
      col: rgb(0xa9d064),
    },
  },
  {
    id: "broad",
    kind: "tree",
    make: makeBroadleaf,
    variants: 2,
    foliage: 0.8,
    collider: 0.34,
    far: {
      shape: "blob",
      w: 8.2,
      h: 8.8,
      col: rgb(0x63a34a),
    },
  },
  {
    id: "bamboo",
    kind: "tree",
    make: makeBamboo,
    variants: 2,
    foliage: 0.6,
    collider: 1.1,
    far: {
      shape: "blob",
      w: 3.8,
      h: 10.5,
      col: rgb(0x86b851),
    },
  },
  {
    id: "bush",
    kind: "bush",
    make: makeBush,
    variants: 2,
    foliage: 0.7,
    hi: 75,
    lo: 230,
  },
  {
    id: "rock",
    kind: "rock",
    make: makeRock,
    variants: 3,
    foliage: 0,
    hi: 100,
    lo: 520,
    collider: 1,
    shadow: true,
  },
  {
    id: "tea",
    kind: "bush",
    make: makeTeaBush,
    variants: 1,
    foliage: 0.6,
    hi: 110,
    lo: 520,
    noWind: true,
  },
  {
    id: "grass",
    kind: "cover",
    make: makeGrass,
    variants: 2,
    foliage: 0.6,
    dist: 58,
  },
  {
    id: "flower",
    kind: "cover",
    make: makeFlowers,
    variants: 3,
    foliage: 0.6,
    dist: 72,
    fixedVariant: true,
  },
  {
    id: "susuki",
    kind: "cover",
    make: makeSusuki,
    variants: 2,
    foliage: 0.7,
    dist: 100,
  },
];

export const VEGETATION_BY_ID = Object.fromEntries(VEGETATION_TYPES.map((f) => [f.id, f]));
