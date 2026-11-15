// ДЕТАЛИ МАШИНЫ, которые «лежат» на кузове: накладки (фары, решётки, воздухозаборники, полосы),
// тонкие линии (стыки дверей и капота) и объёмные детали (зеркала, антикрыло, номера, выхлоп…).
// Место каждой детали считается по поверхности кузова (carShape.js), поэтому зазоров и «висящих» частей нет.

import { clamp, lerp } from "../core/math.js";
import { MeshBuilder, boxGeo, cylinderGeo, icosphereGeo, makeTransform } from "../render/mesh.js";
import { norm3 } from "./carShape.js";

// --- МАТЕРИАЛЫ: c — цвет (4-е число: 1 — красится в цвет машины), e — [блеск, свечение, свечение при торможении, 0]
export const MAT = {
  paint: (gloss = 0.75) => ({ c: [1, 1, 1, 1], e: [gloss, 0, 0, 0] }),
  glass: { c: [0.07, 0.1, 0.15, 0], e: [1, 0, 0, 0] },
  black: { c: [0.035, 0.035, 0.04, 0], e: [0.06, 0, 0, 0] }, // матовый чёрный пластик
  trim: { c: [0.06, 0.06, 0.068, 0], e: [0.3, 0, 0, 0] }, // чёрная окантовка с лёгким блеском
  gap: { c: [0.02, 0.02, 0.025, 0], e: [0, 0, 0, 0] }, // щели между панелями
  under: { c: [0.03, 0.03, 0.034, 0], e: [0, 0, 0, 0] }, // днище и ниши колёс
  rubber: { c: [0.05, 0.05, 0.055, 0], e: [0.12, 0, 0, 0] },
  carbon: { c: [0.085, 0.09, 0.1, 0], e: [0.55, 0, 0, 0] },
  chrome: { c: [0.78, 0.8, 0.84, 0], e: [0.95, 0, 0, 0] },
  steel: { c: [0.42, 0.43, 0.46, 0], e: [0.7, 0, 0, 0] },
  dark: { c: [0.13, 0.13, 0.145, 0], e: [0.45, 0, 0, 0] }, // тёмный металл
  housing: { c: [0.05, 0.05, 0.06, 0], e: [0.7, 0, 0, 0] }, // корпус фары под стеклом
  lens: { c: [1, 0.97, 0.88, 0], e: [0.9, 0.85, 0, 0] }, // стекло фары (светится)
  drl: { c: [0.92, 0.96, 1, 0], e: [0.6, 1.5, 0, 0] }, // яркая полоска ходовых огней
  amber: { c: [1, 0.55, 0.08, 0], e: [0.6, 0.35, 0, 0] }, // поворотник
  tail: { c: [0.78, 0.05, 0.05, 0], e: [0.7, 0.3, 1.5, 0] }, // задний фонарь (ярче при торможении)
  tailcore: { c: [1, 0.2, 0.14, 0], e: [0.7, 0.55, 2.4, 0] }, // яркая середина фонаря
  reverse: { c: [0.95, 0.95, 0.92, 0], e: [0.7, 0.15, 0, 0] },
  plate: { c: [0.93, 0.93, 0.89, 0], e: [0.25, 0.08, 0, 0] },
  mesh: { c: [0.09, 0.09, 0.1, 0], e: [0.25, 0, 0, 0] }, // сетка решётки
  core: { c: [0.5, 0.52, 0.56, 0], e: [0.5, 0, 0, 0] }, // радиатор за решёткой
  red: { c: [0.8, 0.1, 0.08, 0], e: [0.3, 0, 0, 0] },
  white: { c: [0.94, 0.94, 0.92, 0], e: [0.6, 0, 0, 0] },
};

// На какой высоте над кузовом лежит накладка из этого материала (м). Слои не пересекаются.
const LAYER = {
  intake: 0.007, grille: 0.007, black: 0.007, trim: 0.007, housing: 0.008, carbon: 0.007, paint: 0.007,
  mesh: 0.014, core: 0.014, lens: 0.017, tail: 0.017, amber: 0.017, reverse: 0.017, chrome: 0.016, white: 0.012,
  drl: 0.026, tailcore: 0.026, plate: 0.012, glass: 0.008, gap: 0.004, red: 0.012, dark: 0.012, steel: 0.014,
};

const AXIS = { F: [0, 0, 1], R: [0, 0, -1], T: [0, 1, 0] };

export class Parts {
  constructor(shape, spec) {
    this.shape = shape;
    this.spec = spec;
    this.mb = new MeshBuilder();
    this.mb.ext = [];
    this.paint = MAT.paint(spec.gloss || 0.75);
  }
  mat(name) {
    if (typeof name === "object") return name;
    if (name === "paint") return this.paint;
    if (name === "intake" || name === "grille") return MAT.under;
    return MAT[name] || MAT.black;
  }
  // Вершина детали. У накладок и плоских пластин контур отключён (4-е число в e = 1): иначе он рвётся на гранях.
  v(p, n, m) {
    return this.mb.vertex(p[0], p[1], p[2], n[0], n[1], n[2], m.c, [m.e[0], m.e[1], m.e[2], 1]);
  }
  // Готовая фигура (коробка, цилиндр…) с материалом и положением. outline: true — обводить контуром.
  add(geo, matName, transform, outline = false) {
    const m = this.mat(matName);
    const g = new MeshBuilder();
    g.append(geo);
    g.ext = [];
    for (let i = 0; i < g.vertexCount; i++) {
      g.col[i * 4] = m.c[0];
      g.col[i * 4 + 1] = m.c[1];
      g.col[i * 4 + 2] = m.c[2];
      g.col[i * 4 + 3] = m.c[3];
      g.ext.push(m.e[0], m.e[1], m.e[2], outline ? 0 : 1);
    }
    this.mb.append(g, transform);
  }

  // Плоская грань из четырёх точек; лицевая сторона смотрит туда же, куда hint (если задан).
  face(a, b, c, d, matName, hint, both = false) {
    const m = this.mat(matName);
    let n = [
      (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
      (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
      (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
    ];
    if (Math.hypot(n[0], n[1], n[2]) < 1e-12) {
      n = [
        (c[1] - a[1]) * (d[2] - a[2]) - (c[2] - a[2]) * (d[1] - a[1]),
        (c[2] - a[2]) * (d[0] - a[0]) - (c[0] - a[0]) * (d[2] - a[2]),
        (c[0] - a[0]) * (d[1] - a[1]) - (c[1] - a[1]) * (d[0] - a[0]),
      ];
    }
    n = norm3(n);
    let pts = [a, b, c, d];
    if (hint && n[0] * hint[0] + n[1] * hint[1] + n[2] * hint[2] < 0) {
      n = [-n[0], -n[1], -n[2]];
      pts = [a, d, c, b];
    }
    const ids = pts.map((p) => this.v(p, n, m));
    this.mb.quad(ids[0], ids[1], ids[2], ids[3]);
    if (both) {
      const n2 = [-n[0], -n[1], -n[2]];
      const id2 = pts.map((p) => this.v(p, n2, m));
      this.mb.quad(id2[0], id2[3], id2[2], id2[1]);
    }
  }
  // Замкнутая «коробка» из 8 углов: низ p[0..3] и верх p[4..7] (по кругу, одинаковый порядок).
  hexa(p, matName, o = {}) {
    const cx = [0, 0, 0];
    for (const q of p) for (let k = 0; k < 3; k++) cx[k] += q[k] / 8;
    const out = (pts) => {
      const m = [0, 0, 0];
      for (const q of pts) for (let k = 0; k < 3; k++) m[k] += q[k] / pts.length;
      return [m[0] - cx[0], m[1] - cx[1], m[2] - cx[2]];
    };
    const f = (i0, i1, i2, i3, mat) => this.face(p[i0], p[i1], p[i2], p[i3], mat || matName, out([p[i0], p[i1], p[i2], p[i3]]));
    f(4, 5, 6, 7, o.top);
    if (o.bottom !== false) f(0, 3, 2, 1, o.bottomMat);
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      f(k, k2, k2 + 4, k + 4, o.sides && o.sides[k]);
    }
  }

  // Точка поверхности. kind: F — спереди, R — сзади (a = x, b = y); T — сверху (x, z); S — сбоку (z, y).
  at(kind, a, b, side = 1, cab = true) {
    return this.shape.surf(kind, a, b, side, cab);
  }

  // НАКЛАДКА: четырёхугольник q = [низ-лево, низ-право, верх-право, верх-лево] в координатах вида
  // (спереди/сзади: x и y; сверху: x и z; сбоку: z и y) натягивается на кузов и приподнимается на off.
  // round: 0 — прямые углы, 1 — овал. opts: { side, flip (зеркально по x), cab, skirt }.
  patch(kind, q, round, matName, off, opts = {}) {
    const m = this.mat(matName);
    const side = opts.side || 1;
    const flip = opts.flip ? -1 : 1;
    const len = (p, r) => Math.hypot(p[0] - r[0], p[1] - r[1]);
    const step = opts.step || 0.045;
    const nu = clamp(Math.ceil(Math.max(len(q[0], q[1]), len(q[3], q[2])) / step), 2, 18);
    const nv = clamp(Math.ceil(Math.max(len(q[0], q[3]), len(q[1], q[2])) / step), 2, 18);
    const P = [];
    for (let iv = 0; iv <= nv; iv++) {
      for (let iu = 0; iu <= nu; iu++) {
        let u = (iu / nu) * 2 - 1;
        let v = (iv / nv) * 2 - 1;
        if (round) {
          const ru = u * Math.sqrt(1 - (round * v * v) / 2);
          const rv = v * Math.sqrt(1 - (round * u * u) / 2);
          u = ru;
          v = rv;
        }
        const s = (u + 1) / 2;
        const t = (v + 1) / 2;
        const a =
          (1 - s) * (1 - t) * q[0][0] + s * (1 - t) * q[1][0] + s * t * q[2][0] + (1 - s) * t * q[3][0];
        const b =
          (1 - s) * (1 - t) * q[0][1] + s * (1 - t) * q[1][1] + s * t * q[2][1] + (1 - s) * t * q[3][1];
        const r =
          kind === "S"
            ? this.shape.surfPoint("S", a, b, side, opts.cab !== false)
            : this.shape.surfPoint(kind, a * flip, b, 1, opts.cab !== false);
        P.push(r);
      }
    }
    const W = nu + 1;
    const axis = kind === "S" ? [side, 0, 0] : AXIS[kind];
    // нормали — по соседним точкам сетки
    const N = P.map((p, i) => {
      if (!p) return null;
      const iu = i % W;
      const iv = (i - iu) / W;
      const pu0 = P[iv * W + Math.max(iu - 1, 0)] || p;
      const pu1 = P[iv * W + Math.min(iu + 1, nu)] || p;
      const pv0 = P[Math.max(iv - 1, 0) * W + iu] || p;
      const pv1 = P[Math.min(iv + 1, nv) * W + iu] || p;
      const du = [pu1[0] - pu0[0], pu1[1] - pu0[1], pu1[2] - pu0[2]];
      const dv = [pv1[0] - pv0[0], pv1[1] - pv0[1], pv1[2] - pv0[2]];
      let n = [
        du[1] * dv[2] - du[2] * dv[1],
        du[2] * dv[0] - du[0] * dv[2],
        du[0] * dv[1] - du[1] * dv[0],
      ];
      if (Math.hypot(n[0], n[1], n[2]) < 1e-9) n = axis.slice();
      n = norm3(n);
      if (n[0] * axis[0] + n[1] * axis[1] + n[2] * axis[2] < 0) n = [-n[0], -n[1], -n[2]];
      return n;
    });
    const idx = P.map((p, i) =>
      p ? this.v([p[0] + N[i][0] * off, p[1] + N[i][1] * off, p[2] + N[i][2] * off], N[i], m) : -1,
    );
    const quad = (a, b, c, d, na) => {
      // порядок обхода выбираем так, чтобы лицевая сторона смотрела наружу
      const pa = this.mb.pos;
      const A = [pa[a * 3], pa[a * 3 + 1], pa[a * 3 + 2]];
      const B = [pa[b * 3], pa[b * 3 + 1], pa[b * 3 + 2]];
      const C = [pa[c * 3], pa[c * 3 + 1], pa[c * 3 + 2]];
      const g = [
        (B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]),
        (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]),
        (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]),
      ];
      if (g[0] * na[0] + g[1] * na[1] + g[2] * na[2] >= 0) this.mb.quad(a, b, c, d);
      else this.mb.quad(a, d, c, b);
    };
    for (let iv = 0; iv < nv; iv++) {
      for (let iu = 0; iu < nu; iu++) {
        const a = iv * W + iu;
        const ids = [idx[a], idx[a + 1], idx[a + W + 1], idx[a + W]];
        if (ids.includes(-1)) continue;
        quad(ids[0], ids[1], ids[2], ids[3], N[a]);
      }
    }
    // кромка: края накладки уходят в кузов, чтобы сбоку не было видно щели
    if (opts.skirt !== false) {
      const ring = [];
      for (let iu = 0; iu < nu; iu++) ring.push(iu);
      for (let iv = 0; iv < nv; iv++) ring.push(iv * W + nu);
      for (let iu = nu; iu > 0; iu--) ring.push(nv * W + iu);
      for (let iv = nv; iv > 0; iv--) ring.push(iv * W);
      const cx = P[Math.floor(nv / 2) * W + Math.floor(nu / 2)];
      for (let k = 0; k < ring.length; k++) {
        const i0 = ring[k];
        const i1 = ring[(k + 1) % ring.length];
        if (!P[i0] || !P[i1] || !cx) continue;
        const out = (i) => {
          const p = P[i];
          const n = N[i];
          let d = [p[0] - cx[0], p[1] - cx[1], p[2] - cx[2]];
          const k2 = d[0] * n[0] + d[1] * n[1] + d[2] * n[2];
          d = norm3([d[0] - n[0] * k2, d[1] - n[1] * k2, d[2] - n[2] * k2]);
          return norm3([d[0] + n[0] * 0.6, d[1] + n[1] * 0.6, d[2] + n[2] * 0.6]);
        };
        const o0 = out(i0);
        const o1 = out(i1);
        const top = (i, o) =>
          this.v([P[i][0] + N[i][0] * off, P[i][1] + N[i][1] * off, P[i][2] + N[i][2] * off], o, m);
        const bot = (i, o) =>
          this.v([P[i][0] - N[i][0] * 0.008, P[i][1] - N[i][1] * 0.008, P[i][2] - N[i][2] * 0.008], o, m);
        quad(top(i0, o0), top(i1, o1), bot(i1, o1), bot(i0, o0), o0);
      }
    }
  }
  // Овальная или круглая накладка с центром c и радиусами rx, ry.
  disc(kind, c, rx, ry, matName, off, opts) {
    this.patch(
      kind,
      [
        [c[0] - rx, c[1] - ry],
        [c[0] + rx, c[1] - ry],
        [c[0] + rx, c[1] + ry],
        [c[0] - rx, c[1] + ry],
      ],
      1,
      matName,
      off,
      opts,
    );
  }

  // ЛИНИЯ по кузову (стык панелей): ломаная pts в координатах вида, шириной w.
  line(kind, pts, w, matName, off, opts = {}) {
    const m = this.mat(matName);
    const side = opts.side || 1;
    const flip = opts.flip ? -1 : 1;
    // точки через каждые ~3 см
    const fine = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.03));
      for (let k = i === 0 ? 0 : 1; k <= n; k++) {
        fine.push([lerp(a[0], b[0], k / n), lerp(a[1], b[1], k / n)]);
      }
    }
    const S = fine.map((q) =>
      kind === "S"
        ? this.shape.surf("S", q[0], q[1], side, opts.cab !== false)
        : this.shape.surf(kind, q[0] * flip, q[1], 1, opts.cab !== false),
    );
    let prev = null;
    for (let i = 0; i < S.length; i++) {
      const s = S[i];
      if (!s) {
        prev = null;
        continue;
      }
      const a = S[Math.max(i - 1, 0)] || s;
      const b = S[Math.min(i + 1, S.length - 1)] || s;
      const t = norm3([b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]]);
      const n = s.n;
      const sd = norm3([
        n[1] * t[2] - n[2] * t[1],
        n[2] * t[0] - n[0] * t[2],
        n[0] * t[1] - n[1] * t[0],
      ]);
      const base = [s.p[0] + n[0] * off, s.p[1] + n[1] * off, s.p[2] + n[2] * off];
      const l = this.v([base[0] + (sd[0] * w) / 2, base[1] + (sd[1] * w) / 2, base[2] + (sd[2] * w) / 2], n, m);
      const r = this.v([base[0] - (sd[0] * w) / 2, base[1] - (sd[1] * w) / 2, base[2] - (sd[2] * w) / 2], n, m);
      if (prev) {
        this.mb.quad(prev[0], l, r, prev[1]);
        this.mb.quad(prev[0], prev[1], r, l);
      }
      prev = [l, r];
    }
  }

  // Накладка из описания машины: { on, mat, q | c + r (или rx, ry), round, off, center }.
  decal(d) {
    const off = d.off ?? LAYER[d.mat] ?? 0.01;
    const q = d.q || [
      [d.c[0] - (d.rx ?? d.r), d.c[1] - (d.ry ?? d.r)],
      [d.c[0] + (d.rx ?? d.r), d.c[1] - (d.ry ?? d.r)],
      [d.c[0] + (d.rx ?? d.r), d.c[1] + (d.ry ?? d.r)],
      [d.c[0] - (d.rx ?? d.r), d.c[1] + (d.ry ?? d.r)],
    ];
    const round = d.round ?? (d.q ? 0 : 1);
    const o = { cab: d.cab, step: d.step };
    if (d.on === "S") {
      this.patch("S", q, round, d.mat, off, { ...o, side: 1 });
      this.patch("S", q, round, d.mat, off, { ...o, side: -1 });
    } else {
      this.patch(d.on, q, round, d.mat, off, o);
      if (!d.center) this.patch(d.on, q, round, d.mat, off, { ...o, flip: true });
    }
  }
  lineSpec(d) {
    const off = d.off ?? LAYER.gap;
    const w = d.w ?? 0.012;
    const mat = d.mat || "gap";
    if (d.on === "S") {
      this.line("S", d.pts, w, mat, off, { side: 1, cab: d.cab });
      this.line("S", d.pts, w, mat, off, { side: -1, cab: d.cab });
    } else {
      this.line(d.on, d.pts, w, mat, off, { cab: d.cab });
      if (!d.center) this.line(d.on, d.pts, w, mat, off, { flip: true, cab: d.cab });
    }
  }

  // --- ОБЪЁМНЫЕ ДЕТАЛИ ------------------------------------------------------

  // Коробка, у которой низ лежит на кузове (каждый нижний угол опущен до поверхности и утоплен на sink).
  // x, z — центр; w, d — ширина и длина; h — высота над поверхностью (hFront/hRear — отдельно спереди и сзади).
  // taper: [сужение верха по ширине, по длине], lean: сдвиг верха назад. frontMat/rearMat/topMat — материалы граней.
  podOnTop(x, z, w, d, h, matName, o = {}) {
    const sink = o.sink ?? 0.02;
    const cab = o.cab !== false;
    const yc = this.shape.topY(z, x, cab);
    const tw = o.taper ? o.taper[0] : 1;
    const td = o.taper ? o.taper[1] : 1;
    const lean = o.lean || 0;
    const hF = o.hFront ?? h;
    const hR = o.hRear ?? h;
    // порядок углов: перед-лево, перед-право, зад-право, зад-лево
    const order = [[-1, 1], [1, 1], [1, -1], [-1, -1]];
    const top = order.map(([sx, sz]) => {
      const px = x + (sx * w * tw) / 2;
      const pz = z + (sz * d * td) / 2 - lean;
      if (o.yTop) return [px, sz > 0 ? o.yTop[0] : o.yTop[1], pz];
      const base = o.follow ? this.shape.topY(pz, px, cab) : yc;
      return [px, base + (sz > 0 ? hF : hR), pz];
    });
    // thick — наибольшая толщина: деталь не «стекает» вниз по кузову, а нависает (спойлер над стеклом)
    const bottom = order.map(([sx, sz], k) => {
      const px = x + (sx * w) / 2;
      const pz = z + (sz * d) / 2;
      let y = this.shape.topY(pz, px, cab) - sink;
      if (o.thick) y = Math.max(y, top[k][1] - o.thick);
      return [px, y, pz];
    });
    this.hexa([...bottom, ...top], matName, {
      top: o.topMat,
      bottom: !!o.thick,
      bottomMat: o.bottomMat,
      sides: [o.frontMat, o.sideMat, o.rearMat, o.sideMat],
    });
    // стекло фары на передней грани (для поднятых «слепых» фар)
    if (o.lens) {
      const k = 0.8;
      const mid = (a, b2, t) => [lerp(a[0], b2[0], t), lerp(a[1], b2[1], t), lerp(a[2], b2[2], t)];
      const bl = mid(mid(bottom[0], bottom[1], (1 - k) / 2), mid(top[0], top[1], (1 - k) / 2), 0.3);
      const br = mid(mid(bottom[0], bottom[1], (1 + k) / 2), mid(top[0], top[1], (1 + k) / 2), 0.3);
      const tl = mid(mid(bottom[0], bottom[1], (1 - k) / 2), mid(top[0], top[1], (1 - k) / 2), 0.9);
      const tr = mid(mid(bottom[0], bottom[1], (1 + k) / 2), mid(top[0], top[1], (1 + k) / 2), 0.9);
      const f = (p) => [p[0], p[1], p[2] + 0.012];
      this.hexa([bl, br, [br[0], br[1], br[2] - 0.02], [bl[0], bl[1], bl[2] - 0.02], tl, tr, [tr[0], tr[1], tr[2] - 0.02], [tl[0], tl[1], tl[2] - 0.02]].map(f), o.lens === true ? "lens" : o.lens);
    }
    return { top, bottom };
  }

  // Зеркала заднего вида: клин, который растёт из двери и расширяется наружу; сзади — зеркальное стекло.
  mirrors(z, o = {}) {
    const mat = o.black ? MAT.trim : this.paint;
    const len = o.len ?? 0.17;
    const h = o.h ?? 0.085;
    for (const s of [-1, 1]) {
      const cm = this.shape.cabMetrics(z);
      const y = cm.yBelt + (o.dy ?? 0.045);
      const xs = this.shape.sideX(z, y, true);
      const xi = s * (xs - 0.03);
      const xm = s * (xs + len * 0.4);
      const xo = s * (xs + len);
      // ножка: от двери до корпуса
      this.hexa(
        [
          [xi, y - 0.012, z + 0.045], [xm, y - 0.006, z + 0.03], [xm, y - 0.006, z - 0.03], [xi, y - 0.012, z - 0.035],
          [xi, y + 0.03, z + 0.045], [xm, y + 0.036, z + 0.03], [xm, y + 0.036, z - 0.03], [xi, y + 0.03, z - 0.035],
        ],
        MAT.trim,
      );
      // корпус
      const xa = s * (xs + len * 0.3);
      this.hexa(
        [
          [xa, y - 0.02, z + 0.035], [xo, y - 0.012, z + 0.012], [xo, y - 0.012, z - 0.04], [xa, y - 0.02, z - 0.04],
          [xa, y + h * 0.82, z + 0.03], [xo, y + h, z + 0.008], [xo, y + h, z - 0.04], [xa, y + h * 0.82, z - 0.04],
        ],
        mat,
        { sides: [null, null, MAT.glass, null] },
      );
    }
  }

  // Антикрыло на стойках. z — где стоит (от центра машины), h — высота над багажником,
  // w — размах, chord — глубина. Стойки доходят до поверхности кузова и уходят в неё.
  wing(o) {
    const sh = this.shape;
    const z = o.z;
    const mat = o.mat === "paint" ? this.paint : this.mat(o.mat || "black");
    const w = o.w;
    const chord = o.chord ?? 0.26;
    const yDeck = sh.topY(z, 0, false);
    const y = yDeck + o.h;
    const tilt = o.tilt ?? 0.1;
    // лопасть: слегка выгнутая пластина со скруглённой передней кромкой
    const blade = new MeshBuilder();
    const sec = (x, bowY) => {
      const c = chord * (1 - 0.12 * Math.abs(x / (w / 2)) ** 2);
      const prof = [
        [c * 0.5, 0.004],
        [c * 0.42, 0.02],
        [c * 0.1, 0.026],
        [-c * 0.5, 0.012],
        [-c * 0.5, 0.0],
        [c * 0.1, -0.012],
        [c * 0.42, -0.012],
      ];
      return prof.map(([pz, py]) => {
        const zz = pz * Math.cos(tilt) + py * Math.sin(tilt) * 0;
        const yy = py - pz * Math.sin(tilt);
        return [x, y + yy + bowY, z + zz];
      });
    };
    const NX = 8;
    const rows = [];
    for (let i = 0; i <= NX; i++) {
      const x = lerp(-w / 2, w / 2, i / NX);
      rows.push(sec(x, -(o.bow ?? 0) * (x / (w / 2)) ** 2));
    }
    const np = rows[0].length;
    const ids = rows.map((r) => r.map((p) => blade.vertex(p[0], p[1], p[2], 0, 1, 0)));
    for (let i = 0; i < NX; i++) {
      for (let j = 0; j < np; j++) {
        const j2 = (j + 1) % np;
        blade.quad(ids[i][j], ids[i + 1][j], ids[i + 1][j2], ids[i][j2]);
      }
    }
    blade.computeNormals();
    this.add(blade, mat, undefined, true);
    // торцевые шайбы
    const eh = o.endH ?? 0.11;
    for (const sx of [-1, 1]) {
      this.add(
        boxGeo(0.022, eh, chord * 0.98, [1, 1, 1, 1]),
        mat,
        makeTransform(sx * (w / 2), y - (o.bow ?? 0) + eh * (o.endUp ?? 0.18), z - chord * 0.03, 0, 1, 1, 1, tilt * 0.6),
      );
    }
    // стойки: от лопасти до кузова
    const px = o.px ?? w * 0.3;
    const pd = o.pd ?? 0.16;
    const pm = this.mat(o.postMat || "black");
    for (const sx of [-1, 1]) {
      const x = sx * px;
      const zf = z + pd * 0.5 + (o.rake ?? 0.05);
      const zb = z - pd * 0.5 + (o.rake ?? 0.05);
      const yTop = y - (o.bow ?? 0) * (px / (w / 2)) ** 2 - 0.004;
      const t = 0.028;
      this.hexa(
        [
          [x - t, sh.topY(zf, x - t, false) - 0.03, zf],
          [x + t, sh.topY(zf, x + t, false) - 0.03, zf],
          [x + t, sh.topY(zb, x + t, false) - 0.03, zb],
          [x - t, sh.topY(zb, x - t, false) - 0.03, zb],
          [x - t * 0.7, yTop, z + pd * 0.32],
          [x + t * 0.7, yTop, z + pd * 0.32],
          [x + t * 0.7, yTop, z - pd * 0.32],
          [x - t * 0.7, yTop, z - pd * 0.32],
        ],
        pm,
      );
    }
  }

  // Номерной знак: спереди (dir = 1) или сзади (dir = -1) на высоте y.
  plate(dir, y, o = {}) {
    const z = this.shape.endZ(0, y, dir);
    if (z === null) return;
    const w = o.w ?? 0.36;
    const h = o.h ?? 0.12;
    // подложка уходит в бампер, сам знак чуть выступает
    this.add(boxGeo(w + 0.03, h + 0.025, 0.07, [1, 1, 1, 1]), MAT.black, makeTransform(0, y, z - dir * 0.022));
    this.add(boxGeo(w, h, 0.02, [1, 1, 1, 1]), MAT.plate, makeTransform(0, y, z + dir * 0.014));
    for (let k = 0; k < 4; k++) {
      this.add(
        boxGeo(0.05, 0.055, 0.006, [1, 1, 1, 1]),
        MAT.trim,
        makeTransform(-0.115 + k * 0.077, y - 0.004, z + dir * 0.025),
      );
    }
  }

  // Выхлопные трубы: xs — список смещений от оси, y — высота, r — радиус.
  exhaust(xs, y, r = 0.045, o = {}) {
    for (const x of xs) {
      const z = this.shape.endZ(x, y, -1);
      if (z === null) continue;
      const out = o.out ?? 0.045;
      const rot = makeTransform(x, y, z + 0.16, 0, 1, 1, 1, -Math.PI / 2);
      this.add(cylinderGeo(r, r, 0, 0.16 + out, 14, [1, 1, 1, 1], false), o.mat || "chrome", rot);
      // внутренняя тёмная труба и кольцо среза
      this.add(cylinderGeo(r * 0.8, r * 0.8, 0, 0.16 + out - 0.012, 12, [1, 1, 1, 1], true), MAT.under, rot);
      const ring = new MeshBuilder();
      const n = 14;
      for (let k = 0; k < n; k++) {
        const a0 = (k / n) * Math.PI * 2;
        const a1 = ((k + 1) / n) * Math.PI * 2;
        const p = (a, rr) => ring.vertex(Math.cos(a) * rr, 0.16 + out, Math.sin(a) * rr, 0, 1, 0);
        ring.quad(p(a0, r), p(a0, r * 0.8), p(a1, r * 0.8), p(a1, r));
      }
      this.add(ring, o.mat || "chrome", rot);
    }
  }

  // Круглая фара-«прожектор», растущая из бампера (ралли-свет, противотуманки).
  lamp(x, y, r, o = {}) {
    const z = this.shape.endZ(x, y, 1);
    if (z === null) return;
    const out = o.out ?? 0.07;
    const rot = makeTransform(x, y, z - 0.06, 0, 1, 1, 1, Math.PI / 2);
    this.add(cylinderGeo(r * 0.82, r, 0, 0.06 + out, 16, [1, 1, 1, 1], true), o.body || "black", rot);
    this.add(
      cylinderGeo(r * 0.86, r * 0.86, 0.06 + out, 0.06 + out + 0.008, 16, [1, 1, 1, 1], true),
      o.lens || "lens",
      rot,
    );
  }

  // Брызговик за колесом: верх уходит в кузов.
  mudflap(axleZ, o = {}) {
    const b = this.spec.body;
    const z = axleZ - this.shape.Ra - (o.gap ?? 0.015);
    const yTop = this.shape.bot(z) + 0.07;
    const yBot = o.y ?? 0.075;
    for (const side of [-1, 1]) {
      this.add(
        boxGeo(b.ww + 0.07, yTop - yBot, 0.018, [1, 1, 1, 1]),
        o.mat || "red",
        makeTransform(side * (b.track / 2 + 0.005), (yTop + yBot) / 2, z, 0, 1, 1, 1, -0.12),
      );
    }
  }

  // Сплиттер («губа») под бампером по форме кузова: выступает наружу на ext, толщина t.
  // dir = 1 — спереди, -1 — сзади (диффузор). zFrom…zTo — участок по длине.
  lip(zFrom, zTo, ext, t, matName, dir = 1) {
    const sh = this.shape;
    const n = 14;
    const rows = [];
    for (let i = 0; i <= n; i++) {
      const z = lerp(zFrom, zTo, i / n);
      const ring = sh.bodyHalf(z);
      rows.push({ z, x: ring[5][0] + ext, y: ring.m.yb });
    }
    // последний ряд выдвигаем за бампер
    const last = rows[n];
    rows.push({ z: last.z + dir * ext, x: Math.max(last.x - ext * 0.6, 0.05), y: last.y });
    for (let i = 0; i < rows.length - 1; i++) {
      const a = rows[i];
      const b = rows[i + 1];
      const top = 0.006;
      this.face([-a.x, a.y + top, a.z], [a.x, a.y + top, a.z], [b.x, b.y + top, b.z], [-b.x, b.y + top, b.z], matName, [0, 1, 0]);
      this.face([-a.x, a.y - t, a.z], [a.x, a.y - t, a.z], [b.x, b.y - t, b.z], [-b.x, b.y - t, b.z], matName, [0, -1, 0]);
      for (const s of [-1, 1]) {
        this.face([s * a.x, a.y - t, a.z], [s * b.x, b.y - t, b.z], [s * b.x, b.y + top, b.z], [s * a.x, a.y + top, a.z], matName, [s, 0, dir * 0.3]);
      }
    }
    const e = rows[rows.length - 1];
    this.face([-e.x, e.y - t, e.z], [e.x, e.y - t, e.z], [e.x, e.y + 0.006, e.z], [-e.x, e.y + 0.006, e.z], matName, [0, 0, dir]);
  }

  // Накладка-«расширитель» по краю колёсной арки: axle 0 — передняя, 1 — задняя.
  archLip(axle, o = {}) {
    const sh = this.shape;
    const matName = o.mat || "black";
    const zc = sh.axles[axle];
    const R = sh.Ra;
    const wd = o.w ?? 0.045;
    const th = o.t ?? 0.012;
    const n = 22;
    const wr = this.spec.body.wr;
    for (const side of [-1, 1]) {
      let prev = null;
      for (let k = 0; k <= n; k++) {
        const a = lerp(0.03, Math.PI - 0.03, k / n);
        const pt = (r) => sh.surf("S", zc + Math.cos(a) * r, wr + Math.sin(a) * r, side, false);
        const inner = pt(R + 0.002);
        const outer = pt(R + wd);
        if (!inner || !outer) {
          prev = null;
          continue;
        }
        const P = (s, lift) => [s.p[0] + s.n[0] * lift, s.p[1] + s.n[1] * lift, s.p[2] + s.n[2] * lift];
        const rad = [0, Math.sin(a), Math.cos(a)];
        const cur = { i0: P(inner, -0.008), i1: P(inner, th), o1: P(outer, th * 0.7), o0: P(outer, -0.006), n: inner.n, rad };
        if (prev) {
          this.face(prev.i1, cur.i1, cur.o1, prev.o1, matName, cur.n);
          this.face(prev.o1, cur.o1, cur.o0, prev.o0, matName, cur.rad);
          this.face(prev.i0, cur.i0, cur.i1, prev.i1, matName, [-rad[0], -rad[1], -rad[2]]);
        }
        prev = cur;
      }
    }
  }
}
