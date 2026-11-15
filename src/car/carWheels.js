// КОЛЁСА: шина, диск со спицами разных рисунков, тормозной диск и суппорт.
// Колесо строится «лёжа» (ось — вверх, наружная сторона сверху), потом поворачивается на место.

import { MeshBuilder, cylinderGeo, latheGeo, makeTransform } from "../render/mesh.js";
import { MAT } from "./carParts.js";

function paint(geo, m) {
  geo.ext = [];
  for (let i = 0; i < geo.vertexCount; i++) {
    geo.col[i * 4] = m.c[0];
    geo.col[i * 4 + 1] = m.c[1];
    geo.col[i * 4 + 2] = m.c[2];
    geo.col[i * 4 + 3] = m.c[3];
    geo.ext.push(m.e[0], m.e[1], m.e[2], m.e[3]);
  }
  return geo;
}

// Спица: брусок от точки (r0, y0) до (r1, y1) под углом ang; ширина w0 → w1, толщина t.
function spoke(mb, ang, r0, r1, y0, y1, w0, w1, t, m, skew = 0) {
  const g = new MeshBuilder();
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const ca1 = Math.cos(ang + skew);
  const sa1 = Math.sin(ang + skew);
  const pt = (r, w, y, c, s) => [c * r - s * w, y, s * r + c * w];
  const P = [
    pt(r0, -w0 / 2, y0, ca, sa),
    pt(r0, w0 / 2, y0, ca, sa),
    pt(r1, w1 / 2, y1, ca1, sa1),
    pt(r1, -w1 / 2, y1, ca1, sa1),
  ];
  const Q = P.map((p) => [p[0], p[1] - t, p[2]]);
  // грань лицом в сторону hint
  const face = (a, b, c, d, hint) => {
    let n = [
      (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
      (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
      (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
    ];
    const l = Math.hypot(n[0], n[1], n[2]) || 1;
    n = [n[0] / l, n[1] / l, n[2] / l];
    let pts = [a, b, c, d];
    if (n[0] * hint[0] + n[1] * hint[1] + n[2] * hint[2] < 0) {
      n = [-n[0], -n[1], -n[2]];
      pts = [a, d, c, b];
    }
    const ids = pts.map((p) => g.vertex(p[0], p[1], p[2], n[0], n[1], n[2]));
    g.quad(ids[0], ids[1], ids[2], ids[3]);
  };
  const mid = [0, 0, 0];
  for (const p of [...P, ...Q]) for (let k = 0; k < 3; k++) mid[k] += p[k] / 8;
  const out = (...pts) => {
    const c = [0, 0, 0];
    for (const p of pts) for (let k = 0; k < 3; k++) c[k] += p[k] / pts.length;
    return [c[0] - mid[0], c[1] - mid[1], c[2] - mid[2]];
  };
  face(P[0], P[1], P[2], P[3], [0, 1, 0]); // лицо (наружу)
  for (let k = 0; k < 4; k++) {
    const k2 = (k + 1) % 4;
    face(P[k], P[k2], Q[k2], Q[k], out(P[k], P[k2], Q[k2], Q[k]));
  }
  mb.append(paint(g, m));
}

// spec.wheel: { style, color (материал диска), lip (материал полки), dish (глубина полки, м), spokes, caliper: [r,g,b] }
export function buildWheel(spec) {
  const b = spec.body;
  const wspec = spec.wheel || {};
  const R = b.wr;
  const W = b.ww;
  const rimR = R * (wspec.rim ?? 0.7);
  const dish = wspec.dish ?? 0.03;
  const rimM = wspec.color || MAT.chrome;
  const lipM = wspec.lip || rimM;
  const SEG = 28;
  const mb = new MeshBuilder();
  mb.ext = [];
  // шина: боковина со скруглённым плечом
  const h = W / 2;
  const tire = latheGeo(
    [
      [rimR - 0.004, -h + 0.012],
      [rimR + 0.012, -h],
      [R - 0.04, -h],
      [R - 0.012, -h + 0.018],
      [R, -h + 0.045],
      [R, h - 0.045],
      [R - 0.012, h - 0.018],
      [R - 0.04, h],
      [rimR + 0.012, h],
      [rimR - 0.004, h - 0.012],
    ],
    SEG,
    [1, 1, 1, 1],
  );
  mb.append(paint(tire, MAT.rubber));
  // тонкая светлая полоска на боковине (как надпись на шине) — для живости
  if (wspec.stripe) {
    const st = latheGeo(
      [
        [R - 0.05, h + 0.001],
        [R - 0.062, h + 0.001],
      ],
      SEG,
      [1, 1, 1, 1],
    );
    mb.append(paint(st, { c: [0.75, 0.75, 0.72, 0], e: [0.1, 0, 0, 0] }));
  }
  const face = h - dish; // плоскость спиц
  // полка диска (наружный край) и «бочка» внутри
  const lip = latheGeo(
    [
      [rimR - 0.004, h - 0.012],
      [rimR - 0.012, h - 0.004],
      [rimR - 0.03, h - 0.006],
      [rimR - 0.04, face - 0.004],
    ],
    SEG,
    [1, 1, 1, 1],
  );
  mb.append(paint(lip, lipM));
  const barrel = latheGeo(
    [
      [rimR - 0.04, face - 0.004],
      [rimR - 0.045, -h + 0.03],
      [0.02, -h + 0.03],
    ],
    SEG,
    [1, 1, 1, 1],
  );
  mb.append(paint(barrel, MAT.dark));
  // тормозной диск за спицами
  const discR = rimR * 0.86;
  mb.append(paint(cylinderGeo(discR, discR, face - 0.085, face - 0.06, SEG, [1, 1, 1, 1], true), MAT.steel));
  mb.append(paint(cylinderGeo(discR * 0.42, discR * 0.42, face - 0.06, face - 0.045, 14, [1, 1, 1, 1], true), MAT.dark));
  // спицы
  const style = wspec.style || "star5";
  const r1 = rimR - 0.035;
  const hub = R * 0.2;
  const yIn = face - (wspec.concave ?? 0.022); // центр чуть утоплен
  const T = 0.03;
  const each = (n, fn) => {
    for (let k = 0; k < n; k++) fn((k / n) * Math.PI * 2, k);
  };
  if (style === "star5") {
    each(wspec.spokes || 5, (a) => spoke(mb, a, hub * 0.6, r1, yIn, face, R * 0.26, R * 0.15, T, rimM));
  } else if (style === "split") {
    // сдвоенные тонкие спицы
    each(wspec.spokes || 6, (a) => {
      spoke(mb, a - 0.09, hub * 0.7, r1, yIn, face, R * 0.075, R * 0.06, T, rimM, -0.13);
      spoke(mb, a + 0.09, hub * 0.7, r1, yIn, face, R * 0.075, R * 0.06, T, rimM, 0.13);
    });
  } else if (style === "multi") {
    each(wspec.spokes || 10, (a) => spoke(mb, a, hub * 0.8, r1, yIn, face, R * 0.085, R * 0.06, T, rimM));
  } else if (style === "mesh") {
    // «сетка»: спицы крест-накрест
    each(wspec.spokes || 9, (a) => {
      spoke(mb, a, hub * 0.9, r1, yIn, face, R * 0.055, R * 0.045, T * 0.8, rimM, 0.34);
      spoke(mb, a, hub * 0.9, r1, yIn, face, R * 0.055, R * 0.045, T * 0.8, rimM, -0.34);
    });
  } else if (style === "four") {
    each(4, (a) => spoke(mb, a + Math.PI / 4, hub * 0.5, r1, yIn, face, R * 0.42, R * 0.3, T, rimM));
  } else if (style === "rally") {
    each(wspec.spokes || 8, (a) => spoke(mb, a, hub * 0.8, r1, yIn + 0.006, face, R * 0.15, R * 0.12, T, rimM));
  } else if (style === "turbine") {
    each(wspec.spokes || 7, (a) => spoke(mb, a, hub * 0.8, r1, yIn, face, R * 0.14, R * 0.1, T, rimM, 0.3));
  }
  // ступица, колпачок и гайки
  mb.append(paint(cylinderGeo(hub, hub * 0.86, yIn - 0.03, yIn + 0.012, 16, [1, 1, 1, 1], true), rimM));
  mb.append(paint(cylinderGeo(hub * 0.42, hub * 0.36, yIn + 0.012, yIn + 0.022, 12, [1, 1, 1, 1], true), wspec.cap || MAT.dark));
  const nuts = wspec.nuts ?? 5;
  for (let k = 0; k < nuts; k++) {
    const a = (k / nuts) * Math.PI * 2 + 0.3;
    mb.append(
      paint(cylinderGeo(0.011, 0.011, yIn + 0.01, yIn + 0.024, 6, [1, 1, 1, 1], true), MAT.steel),
      makeTransform(Math.cos(a) * hub * 0.66, 0, Math.sin(a) * hub * 0.66),
    );
  }
  // повернуть: ось колеса — вдоль x, наружная сторона на +x
  const wheel = new MeshBuilder();
  wheel.append(mb, makeTransform(0, 0, 0, 0, 1, 1, 1, 0, -Math.PI / 2));

  // СУППОРТ: не вращается вместе с колесом (поворачивается только с рулём)
  const cal = new MeshBuilder();
  cal.ext = [];
  const cm = { c: [...(wspec.caliper || [0.78, 0.1, 0.08]), 0], e: [0.5, 0, 0, 0] };
  const g = new MeshBuilder();
  const a0 = Math.PI - 0.5; // в «лежачем» колесе это верх готового колеса
  const a1 = Math.PI + 0.5;
  const n = 6;
  const ro = discR + 0.012;
  const ri = discR * 0.6;
  const y0 = face - 0.098;
  const y1 = face - 0.048;
  const ring = [];
  for (let k = 0; k <= n; k++) {
    const a = a0 + ((a1 - a0) * k) / n;
    const c = Math.cos(a);
    const s = Math.sin(a);
    ring.push([
      [c * ri, y0, s * ri],
      [c * ro, y0, s * ro],
      [c * ro, y1, s * ro],
      [c * ri, y1, s * ri],
    ]);
  }
  const quad = (p0, p1, p2, p3) => {
    const nn = [
      (p1[1] - p0[1]) * (p2[2] - p0[2]) - (p1[2] - p0[2]) * (p2[1] - p0[1]),
      (p1[2] - p0[2]) * (p2[0] - p0[0]) - (p1[0] - p0[0]) * (p2[2] - p0[2]),
      (p1[0] - p0[0]) * (p2[1] - p0[1]) - (p1[1] - p0[1]) * (p2[0] - p0[0]),
    ];
    const l = Math.hypot(nn[0], nn[1], nn[2]) || 1;
    const ids = [p0, p1, p2, p3].map((p) => g.vertex(p[0], p[1], p[2], nn[0] / l, nn[1] / l, nn[2] / l));
    g.quad(ids[0], ids[1], ids[2], ids[3]);
    g.quad(ids[0], ids[3], ids[2], ids[1]);
  };
  for (let k = 0; k < n; k++) {
    const A = ring[k];
    const B = ring[k + 1];
    quad(A[3], A[2], B[2], B[3]); // лицо
    quad(A[1], B[1], B[2], A[2]); // внешний торец
    quad(A[0], A[3], B[3], B[0]); // внутренний торец
  }
  quad(ring[0][0], ring[0][1], ring[0][2], ring[0][3]);
  quad(ring[n][0], ring[n][3], ring[n][2], ring[n][1]);
  cal.append(paint(g, cm));
  const caliper = new MeshBuilder();
  // суппорт стоит сзади-сверху от оси
  caliper.append(cal, makeTransform(0, 0, 0, 0, 1, 1, 1, 0, -Math.PI / 2));
  return { wheel, caliper };
}
