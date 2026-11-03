// Построение 3D-моделей из простых фигур: MeshBuilder собирает вершины и треугольники, а функции ниже делают коробки, цилиндры, сферы и т. п.

import { vcross, vnormalize, vsub } from "../core/math.js";
import { seededRandom } from "../core/random.js";

export class MeshBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.ext = null;
    this.idx = [];
  }
  get vertexCount() {
    return this.pos.length / 3;
  }
  vertex(t, e, s, o, i, n, a, r) {
    this.pos.push(t, e, s);
    this.nor.push(o, i, n);
    if (a) {
      this.col.push(a[0], a[1], a[2], a.length > 3 ? a[3] : 1);
    } else {
      this.col.push(1, 1, 1, 1);
    }
    if (r) {
      if (!this.ext) {
        this.ext = new Array((this.vertexCount - 1) * 4).fill(0);
      }
      this.ext.push(r[0], r[1], r[2], r[3]);
    } else if (this.ext) {
      this.ext.push(0, 0, 0, 0);
    }
    return this.vertexCount - 1;
  }
  tri(t, e, s) {
    this.idx.push(t, e, s);
  }
  quad(t, e, s, o) {
    this.idx.push(t, e, s, t, s, o);
  }
  append(t, e, s, o = "mul") {
    const i = this.vertexCount;
    const n = t.vertexCount;
    for (let a = 0; a < n; a++) {
      let r = t.pos[a * 3];
      let c = t.pos[a * 3 + 1];
      let u = t.pos[a * 3 + 2];
      let h = t.nor[a * 3];
      let l = t.nor[a * 3 + 1];
      let m = t.nor[a * 3 + 2];
      if (e) {
        const g = e[0] * r + e[4] * c + e[8] * u + e[12];
        const b = e[1] * r + e[5] * c + e[9] * u + e[13];
        const y = e[2] * r + e[6] * c + e[10] * u + e[14];
        r = g;
        c = b;
        u = y;
        const k = e[0] * h + e[4] * l + e[8] * m;
        const w = e[1] * h + e[5] * l + e[9] * m;
        const M = e[2] * h + e[6] * l + e[10] * m;
        const _ = Math.hypot(k, w, M) || 1;
        h = k / _;
        l = w / _;
        m = M / _;
      }
      this.pos.push(r, c, u);
      this.nor.push(h, l, m);
      let p = t.col[a * 4];
      let d = t.col[a * 4 + 1];
      let x = t.col[a * 4 + 2];
      let v = t.col[a * 4 + 3];
      if (s) {
        if (o === "mul") {
          p *= s[0];
          d *= s[1];
          x *= s[2];
        } else {
          p = s[0];
          d = s[1];
          x = s[2];
        }
        if (s.length > 3) {
          v = s[3];
        }
      }
      this.col.push(p, d, x, v);
      if (t.ext || this.ext) {
        if (!this.ext) {
          this.ext = new Array(i * 4).fill(0);
        }
        if (t.ext) {
          this.ext.push(t.ext[a * 4], t.ext[a * 4 + 1], t.ext[a * 4 + 2], t.ext[a * 4 + 3]);
        } else {
          this.ext.push(0, 0, 0, 0);
        }
      }
    }
    for (const a of t.idx) {
      this.idx.push(a + i);
    }
    return this;
  }
  setColor(t) {
    for (let e = 0; e < this.vertexCount; e++) {
      this.col[e * 4] = t[0];
      this.col[e * 4 + 1] = t[1];
      this.col[e * 4 + 2] = t[2];
      this.col[e * 4 + 3] = t.length > 3 ? t[3] : 1;
    }
    return this;
  }
  computeNormals() {
    const t = new Float32Array(this.pos.length);
    const e = this.pos;
    for (let s = 0; s < this.idx.length; s += 3) {
      const o = this.idx[s] * 3;
      const i = this.idx[s + 1] * 3;
      const n = this.idx[s + 2] * 3;
      const a = e[i] - e[o];
      const r = e[i + 1] - e[o + 1];
      const c = e[i + 2] - e[o + 2];
      const u = e[n] - e[o];
      const h = e[n + 1] - e[o + 1];
      const l = e[n + 2] - e[o + 2];
      const m = r * l - c * h;
      const p = c * u - a * l;
      const d = a * h - r * u;
      for (const x of [o, i, n]) {
        t[x] += m;
        t[x + 1] += p;
        t[x + 2] += d;
      }
    }
    for (let s = 0; s < t.length; s += 3) {
      const o = Math.hypot(t[s], t[s + 1], t[s + 2]) || 1;
      this.nor[s] = t[s] / o;
      this.nor[s + 1] = t[s + 1] / o;
      this.nor[s + 2] = t[s + 2] / o;
    }
    return this;
  }
  flat() {
    const t = new MeshBuilder();
    const e = this.pos;
    const s = this.col;
    for (let o = 0; o < this.idx.length; o += 3) {
      const i = [this.idx[o], this.idx[o + 1], this.idx[o + 2]];
      const n = [e[i[0] * 3], e[i[0] * 3 + 1], e[i[0] * 3 + 2]];
      const a = [e[i[1] * 3], e[i[1] * 3 + 1], e[i[1] * 3 + 2]];
      const r = [e[i[2] * 3], e[i[2] * 3 + 1], e[i[2] * 3 + 2]];
      const c = vnormalize(vcross(vsub(a, n), vsub(r, n)));
      const u = i.map((h, l) =>
        t.vertex(...[n, a, r][l], c[0], c[1], c[2], [
          s[h * 4],
          s[h * 4 + 1],
          s[h * 4 + 2],
          s[h * 4 + 3],
        ]),
      );
      t.tri(u[0], u[1], u[2]);
    }
    return t;
  }
  bounds() {
    let t = Infinity;
    let e = Infinity;
    let s = Infinity;
    let o = -Infinity;
    let i = -Infinity;
    let n = -Infinity;
    for (let h = 0; h < this.pos.length; h += 3) {
      const l = this.pos[h];
      const m = this.pos[h + 1];
      const p = this.pos[h + 2];
      if (l < t) {
        t = l;
      }
      if (l > o) {
        o = l;
      }
      if (m < e) {
        e = m;
      }
      if (m > i) {
        i = m;
      }
      if (p < s) {
        s = p;
      }
      if (p > n) {
        n = p;
      }
    }
    const a = (t + o) / 2;
    const r = (e + i) / 2;
    const c = (s + n) / 2;
    let u = 0;
    for (let h = 0; h < this.pos.length; h += 3) {
      const l = Math.hypot(this.pos[h] - a, this.pos[h + 1] - r, this.pos[h + 2] - c);
      if (l > u) {
        u = l;
      }
    }
    return {
      min: [t, e, s],
      max: [o, i, n],
      center: [a, r, c],
      radius: u,
    };
  }
}

export function boxGeo(f, t, e, s, o = 0) {
  const i = new MeshBuilder();
  const n = f / 2;
  const a = t / 2;
  const r = e / 2;
  const c = [
    [
      [1, 0, 0],
      [
        [n, -a, r],
        [n, -a, -r],
        [n, a, -r],
        [n, a, r],
      ],
    ],
    [
      [-1, 0, 0],
      [
        [-n, -a, -r],
        [-n, -a, r],
        [-n, a, r],
        [-n, a, -r],
      ],
    ],
    [
      [0, 1, 0],
      [
        [-n, a, r],
        [n, a, r],
        [n, a, -r],
        [-n, a, -r],
      ],
    ],
    [
      [0, -1, 0],
      [
        [-n, -a, -r],
        [n, -a, -r],
        [n, -a, r],
        [-n, -a, r],
      ],
    ],
    [
      [0, 0, 1],
      [
        [-n, -a, r],
        [n, -a, r],
        [n, a, r],
        [-n, a, r],
      ],
    ],
    [
      [0, 0, -1],
      [
        [n, -a, -r],
        [-n, -a, -r],
        [-n, a, -r],
        [n, a, -r],
      ],
    ],
  ];
  for (const [u, h] of c) {
    const l = h.map((m) => i.vertex(m[0], m[1] + o, m[2], u[0], u[1], u[2], s));
    i.quad(l[0], l[1], l[2], l[3]);
  }
  return i;
}

export function cylinderGeo(f, t, e, s, o, i, n = true, a) {
  const r = new MeshBuilder();
  const c = (f - t) / (s - e);
  const u = [];
  const h = [];
  for (let l = 0; l <= o; l++) {
    const m = (l / o) * Math.PI * 2;
    const p = Math.cos(m);
    const d = Math.sin(m);
    const x = vnormalize([p, c, d]);
    u.push(r.vertex(p * f, e, d * f, x[0], x[1], x[2], i));
    h.push(r.vertex(p * t, s, d * t, x[0], x[1], x[2], a || i));
  }
  for (let l = 0; l < o; l++) {
    r.quad(u[l], h[l], h[l + 1], u[l + 1]);
  }
  if (n) {
    if (t > 0) {
      const l = r.vertex(0, s, 0, 0, 1, 0, a || i);
      const m = [];
      for (let p = 0; p <= o; p++) {
        const d = (p / o) * Math.PI * 2;
        m.push(r.vertex(Math.cos(d) * t, s, Math.sin(d) * t, 0, 1, 0, a || i));
      }
      for (let p = 0; p < o; p++) {
        r.tri(l, m[p + 1], m[p]);
      }
    }
    if (f > 0) {
      const l = r.vertex(0, e, 0, 0, -1, 0, i);
      const m = [];
      for (let p = 0; p <= o; p++) {
        const d = (p / o) * Math.PI * 2;
        m.push(r.vertex(Math.cos(d) * f, e, Math.sin(d) * f, 0, -1, 0, i));
      }
      for (let p = 0; p < o; p++) {
        r.tri(l, m[p], m[p + 1]);
      }
    }
  }
  return r;
}

export function tubeGeo(f, t, e, s, o, i) {
  const n = vsub(t, f);
  const a = Math.hypot(n[0], n[1], n[2]);
  const r = vnormalize(n);
  const c = Math.abs(r[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0];
  const u = vnormalize(vcross(c, r));
  const h = vcross(u, r);
  const l = new Float32Array([
    u[0],
    u[1],
    u[2],
    0,
    r[0],
    r[1],
    r[2],
    0,
    h[0],
    h[1],
    h[2],
    0,
    f[0],
    f[1],
    f[2],
    1,
  ]);
  const m = new MeshBuilder();
  m.append(cylinderGeo(e, s, 0, a, o, i, false), l);
  return m;
}

export function icosphereGeo(f, t, e, s) {
  const o = (1 + Math.sqrt(5)) / 2;
  const i = [
    [-1, o, 0],
    [1, o, 0],
    [-1, -o, 0],
    [1, -o, 0],
    [0, -1, o],
    [0, 1, o],
    [0, -1, -o],
    [0, 1, -o],
    [o, 0, -1],
    [o, 0, 1],
    [-o, 0, -1],
    [-o, 0, 1],
  ].map(vnormalize);
  let n = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];
  for (let r = 0; r < t; r++) {
    const c = new Map();
    const u = (l, m) => {
      const p = l < m ? l + "_" + m : m + "_" + l;
      if (c.has(p)) {
        return c.get(p);
      }
      const d = vnormalize([
        (i[l][0] + i[m][0]) / 2,
        (i[l][1] + i[m][1]) / 2,
        (i[l][2] + i[m][2]) / 2,
      ]);
      i.push(d);
      c.set(p, i.length - 1);
      return i.length - 1;
    };
    const h = [];
    for (const [l, m, p] of n) {
      const d = u(l, m);
      const x = u(m, p);
      const v = u(p, l);
      h.push([l, d, v], [m, x, d], [p, v, x], [d, x, v]);
    }
    n = h;
  }
  const a = new MeshBuilder();
  for (const r of i) {
    const c = s ? f * s(r) : f;
    a.vertex(r[0] * c, r[1] * c, r[2] * c, r[0], r[1], r[2], e);
  }
  for (const r of n) {
    a.tri(r[0], r[1], r[2]);
  }
  if (s) {
    a.computeNormals();
  }
  return a;
}

export function latheGeo(f, t, e, s) {
  const o = new MeshBuilder();
  const i = [];
  for (let n = 0; n < f.length; n++) {
    const a = [];
    for (let r = 0; r <= t; r++) {
      const c = (r / t) * Math.PI * 2;
      const [u, h] = f[n];
      const l = s ? s(n, r, h) : e;
      a.push(o.vertex(Math.cos(c) * u, h, Math.sin(c) * u, 0, 1, 0, l));
    }
    i.push(a);
  }
  for (let n = 0; n < f.length - 1; n++) {
    for (let a = 0; a < t; a++) {
      o.quad(i[n][a], i[n + 1][a], i[n + 1][a + 1], i[n][a + 1]);
    }
  }
  o.computeNormals();
  return o;
}

export function loftGeo(f, t, e = true, s = true) {
  const o = new MeshBuilder();
  const i = [];
  const n = f[0].pts.length;
  f.forEach((r, c) => {
    const u = [];
    for (let h = 0; h < n; h++) {
      const [l, m] = r.pts[h];
      u.push(o.vertex(l, m, r.z, 0, 1, 0, t ? t(c, h, l, m, r.z) : [1, 1, 1, 1]));
    }
    i.push(u);
  });
  for (let r = 0; r < f.length - 1; r++) {
    for (let c = 0; c < n; c++) {
      const u = (c + 1) % n;
      o.quad(i[r][c], i[r][u], i[r + 1][u], i[r + 1][c]);
    }
  }
  const a = (r, c, u, h) => {
    let l = 0;
    let m = 0;
    for (const d of c.pts) {
      l += d[0];
      m += d[1];
    }
    l /= n;
    m /= n;
    const p = o.vertex(l, m, c.z, 0, 0, u ? 1 : -1, t ? t(h, -1, l, m, c.z) : [1, 1, 1, 1]);
    for (let d = 0; d < n; d++) {
      const x = (d + 1) % n;
      if (u) {
        o.tri(p, r[d], r[x]);
      } else {
        o.tri(p, r[x], r[d]);
      }
    }
  };
  if (e) {
    a(i[0], f[0], false, 0);
  }
  if (s) {
    a(i[i.length - 1], f[f.length - 1], true, f.length - 1);
  }
  o.computeNormals();
  return o;
}

export function roundNormals(f, t, e = 0.75) {
  for (let s = 0; s < f.vertexCount; s++) {
    const o = vnormalize([f.pos[s * 3] - t[0], f.pos[s * 3 + 1] - t[1], f.pos[s * 3 + 2] - t[2]]);
    const i = [f.nor[s * 3], f.nor[s * 3 + 1], f.nor[s * 3 + 2]];
    const n = vnormalize([
      i[0] * (1 - e) + o[0] * e,
      i[1] * (1 - e) + o[1] * e,
      i[2] * (1 - e) + o[2] * e,
    ]);
    f.nor[s * 3] = n[0];
    f.nor[s * 3 + 1] = n[1];
    f.nor[s * 3 + 2] = n[2];
  }
  return f;
}

export function blobGeo(f, t, e, s, o = 0.18, i = 1) {
  const n = seededRandom(s);
  const a = [];
  for (let c = 0; c < 7; c++) {
    a.push([vnormalize([n() - 0.5, n() - 0.5, n() - 0.5]), n() * o]);
  }
  const r = icosphereGeo(f, t, e, (c) => {
    let u = 1;
    for (const [h, l] of a) {
      u += l * Math.max(0, c[0] * h[0] + c[1] * h[1] + c[2] * h[2]) ** 3;
    }
    return u;
  });
  if (i !== 1) {
    for (let c = 1; c < r.pos.length; c += 3) {
      r.pos[c] *= i;
    }
  }
  return r;
}

export function makeTransform(f = 0, t = 0, e = 0, s = 0, o = 1, i = o, n = o, a = 0, r = 0) {
  const c = Math.cos(s);
  const u = Math.sin(s);
  const h = Math.cos(a);
  const l = Math.sin(a);
  const m = Math.cos(r);
  const p = Math.sin(r);
  let d = [m, p, 0, -p, m, 0, 0, 0, 1];
  const x = [1, 0, 0, 0, h, l, 0, -l, h];
  const v = (b, y) => {
    const k = new Array(9);
    for (let w = 0; w < 3; w++) {
      for (let M = 0; M < 3; M++) {
        k[w * 3 + M] = b[M] * y[w * 3] + b[3 + M] * y[w * 3 + 1] + b[6 + M] * y[w * 3 + 2];
      }
    }
    return k;
  };
  d = v(x, d);
  const g = [c, 0, -u, 0, 1, 0, u, 0, c];
  d = v(g, d);
  return new Float32Array([
    d[0] * o,
    d[1] * o,
    d[2] * o,
    0,
    d[3] * i,
    d[4] * i,
    d[5] * i,
    0,
    d[6] * n,
    d[7] * n,
    d[8] * n,
    0,
    f,
    t,
    e,
    1,
  ]);
}
