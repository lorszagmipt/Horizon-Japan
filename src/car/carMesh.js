// СБОРКА МОДЕЛИ МАШИНЫ по описанию из cars.js.
//   carShape.js  — форма кузова и кабины (плавные линии → сечения);
//   carParts.js  — детали, которые ложатся на кузов (фары, решётки, зеркала, антикрыло…);
//   carWheels.js — колёса.
// Здесь: «обшивка» кузова и кабины, раскраска по зонам и расстановка деталей.

import { clamp, lerp } from "../core/math.js";
import { MeshBuilder } from "../render/mesh.js";
import { BODY, BODY_SEG, CAB, CAB_SEG, CarShape } from "./carShape.js";
import { MAT, Parts } from "./carParts.js";
import { buildWheel } from "./carWheels.js";

// Полное сечение из половины: правая сторона снизу вверх, потом левая сверху вниз.
function fullRing(half, closed) {
  const pts = half.map((p) => [p[0], p[1]]);
  const stop = closed ? 1 : 0;
  for (let i = half.length - 2; i >= stop; i--) pts.push([-half[i][0], half[i][1]]);
  return pts;
}

// Обшивка: соединяет соседние сечения четырёхугольниками. Материал каждого — matOf(участок, z).
// Нормали сглажены внутри «групп сглаживания» (groupOf) — между группами получается чёткая грань.
function skin(mb, rings, zs, segNames, closed, matOf, groupOf) {
  const n = rings[0].length;
  const segCount = closed ? n : n - 1;
  const H = segNames.length; // участков в половине
  const nameOf = (j) => (j < H ? segNames[j] : segNames[segCount - 1 - j]);
  const acc = new Map();
  const accOf = (g) => {
    if (!acc.has(g)) acc.set(g, new Float64Array(rings.length * n * 3));
    return acc.get(g);
  };
  const P = (i, j) => [rings[i][j % n][0], rings[i][j % n][1], zs[i]];
  const quads = [];
  for (let i = 0; i < rings.length - 1; i++) {
    const zm = (zs[i] + zs[i + 1]) / 2;
    for (let j = 0; j < segCount; j++) {
      const name = nameOf(j);
      const m = matOf(name, zm, j < H ? 1 : -1, i);
      if (!m) continue;
      const a = P(i, j);
      const b = P(i, j + 1);
      const c = P(i + 1, j + 1);
      const d = P(i + 1, j);
      const u = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const v = [d[0] - b[0], d[1] - b[1], d[2] - b[2]];
      const nx = u[1] * v[2] - u[2] * v[1];
      const ny = u[2] * v[0] - u[0] * v[2];
      const nz = u[0] * v[1] - u[1] * v[0];
      const g = groupOf(name, zm);
      const A = accOf(g);
      for (const [ii, jj] of [
        [i, j],
        [i, j + 1],
        [i + 1, j + 1],
        [i + 1, j],
      ]) {
        const k = (ii * n + (jj % n)) * 3;
        A[k] += nx;
        A[k + 1] += ny;
        A[k + 2] += nz;
      }
      quads.push({ i, j, m, g, a, b, c, d, fn: [nx, ny, nz] });
    }
  }
  for (const q of quads) {
    const A = acc.get(q.g);
    const ids = [
      [q.i, q.j, q.a],
      [q.i, q.j + 1, q.b],
      [q.i + 1, q.j + 1, q.c],
      [q.i + 1, q.j, q.d],
    ].map(([ii, jj, p]) => {
      const k = (ii * n + (jj % n)) * 3;
      let nx = A[k];
      let ny = A[k + 1];
      let nz = A[k + 2];
      let l = Math.hypot(nx, ny, nz);
      if (l < 1e-12) {
        [nx, ny, nz] = q.fn;
        l = Math.hypot(nx, ny, nz) || 1;
      }
      return mb.vertex(p[0], p[1], p[2], nx / l, ny / l, nz / l, q.m.c, q.m.e);
    });
    mb.quad(ids[0], ids[1], ids[2], ids[3]);
  }
}

// Плоская заглушка торца.
function cap(mb, ring, z, front, m) {
  let cx = 0;
  let cy = 0;
  for (const p of ring) {
    cx += p[0];
    cy += p[1];
  }
  cx /= ring.length;
  cy /= ring.length;
  const nz = front ? 1 : -1;
  const c = mb.vertex(cx, cy, z, 0, 0, nz, m.c, m.e);
  const ids = ring.map((p) => mb.vertex(p[0], p[1], z, 0, 0, nz, m.c, m.e));
  for (let j = 0; j < ring.length; j++) {
    const j2 = (j + 1) % ring.length;
    if (front) mb.tri(c, ids[j], ids[j2]);
    else mb.tri(c, ids[j2], ids[j]);
  }
}

// Точки по длине, в которых строятся сечения кузова.
function bodyStations(shape, b) {
  const half = shape.half;
  const zs = [];
  const N = 46;
  for (let i = 0; i <= N; i++) zs.push(-half * Math.cos((i / N) * Math.PI));
  // арки: по дуге и вплотную к её краям (там кузов «обрывается» вниз)
  const eps = 0.003;
  for (const zc of shape.axles) {
    for (let k = 1; k < 14; k++) zs.push(zc + shape.Ra * Math.cos((k / 14) * Math.PI));
    for (const s of [-1, 1]) zs.push(zc + s * (shape.Ra - eps), zc + s * (shape.Ra + eps));
  }
  for (const z of b.stations || []) zs.push(z);
  zs.sort((p, q) => p - q);
  const out = [];
  for (const z of zs) {
    const zz = Math.round(z * 2000) / 2000;
    if (!out.length || zz - out[out.length - 1] > 0.0019) out.push(zz);
  }
  return out;
}

const inRanges = (ranges, z) => ranges.some((r) => z >= r[0] && z <= r[1]);

export function buildCarGeometry(spec) {
  if (spec._geo) return spec._geo;
  const b = spec.body;
  const shape = new CarShape(spec);
  const parts = new Parts(shape, spec);
  const mb = parts.mb;
  const PAINT = parts.paint;
  const half = shape.half;

  // ---------- КУЗОВ ----------
  const zs = bodyStations(shape, b);
  const halves = zs.map((z) => shape.bodyHalf(z));
  const rings = halves.map((h) => fullRing(h, true));
  const lowerDefault = parts.mat(b.lower || "paint");
  const zones = (b.zones || []).map((zn) => ({ ...zn, m: parts.mat(zn.mat) }));
  const UPPER = new Set(["side", "shoulder", "top"]);
  const LOWER = new Set(["corner", "lower"]);
  skin(
    mb,
    rings,
    zs,
    BODY_SEG,
    true,
    (seg, z) => {
      if (seg === "floor" || seg === "well") return MAT.under;
      let m = LOWER.has(seg) ? lowerDefault : PAINT;
      for (const zn of zones) {
        if (z < zn.z[0] || z > zn.z[1]) continue;
        const hit =
          zn.seg === "all" ||
          (zn.seg === "lower" && LOWER.has(seg)) ||
          (zn.seg === "upper" && UPPER.has(seg)) ||
          zn.seg === seg ||
          (Array.isArray(zn.seg) && zn.seg.includes(seg));
        if (hit) m = zn.m;
      }
      return m;
    },
    (seg) => (seg === "well" ? 1 : seg === "floor" ? 2 : 0),
  );
  const endMat = (z) => {
    let m = PAINT;
    for (const zn of zones) if (z >= zn.z[0] && z <= zn.z[1] && (zn.seg === "all" || zn.seg === "upper")) m = zn.m;
    return m;
  };
  cap(mb, rings[0], zs[0], false, endMat(zs[0]));
  cap(mb, rings[rings.length - 1], zs[zs.length - 1], true, endMat(zs[zs.length - 1]));

  // ---------- КАБИНА ----------
  const c = b.cabin;
  const z1 = shape.z1;
  const z0 = shape.z0;
  const frame = c.frame ?? 0.028;
  const sideWin = c.side || [];
  const cz = [];
  const NC = Math.ceil((z0 - z1) / 0.06);
  for (let i = 0; i <= NC; i++) cz.push(lerp(z1, z0, i / NC));
  cz.push(c.zh, c.zh + frame, c.zr, c.zr - frame);
  for (const r of sideWin) cz.push(r[0], r[1]);
  for (const p of c.roof) cz.push(p[0]);
  // где лобовое и заднее стекло «выходят» из кузова — там узкая чёрная кромка
  const above = (z) => {
    const m = shape.cabMetrics(z);
    return m.yRoof - shape.topY(z, 0, false);
  };
  const edgeOf = (from, to) => {
    // ищем место, где стекло поднимается над кузовом на 4 см
    let lo = from;
    let hi = to;
    for (let k = 0; k < 24; k++) {
      const mid = (lo + hi) / 2;
      if (above(mid) > 0.04) hi = mid;
      else lo = mid;
    }
    return (lo + hi) / 2;
  };
  const zCowl = edgeOf(z0, c.zh);
  const zDeck = edgeOf(z1, c.zr);
  cz.push(zCowl, zDeck);
  cz.sort((p, q) => p - q);
  const czs = [];
  for (const z of cz) {
    const zz = clamp(Math.round(z * 2000) / 2000, z1, z0);
    if (!czs.length || zz - czs[czs.length - 1] > 0.0019) czs.push(zz);
  }
  const cabHalves = czs.map((z) => shape.cabHalf(z));
  const cabRings = cabHalves.map((h) => fullRing(h, false));
  const pillar = parts.mat(c.pillar || "paint");
  const roofMat = parts.mat(c.roofMat || "paint");
  const bPillar = parts.mat(c.bPillar || "trim");
  // высота бокового стекла в точке z — у самого лобового оно сходит на нет
  const sideH = (z) => {
    const m = shape.cabMetrics(z);
    return m.yTop - m.yBelt;
  };
  skin(
    mb,
    cabRings,
    czs,
    CAB_SEG,
    false,
    (seg, z) => {
      if (seg === "base") return MAT.trim;
      const win = inRanges(sideWin, z) && sideH(z) > 0.07;
      if (seg === "sill") return MAT.trim;
      if (seg === "glass") return win ? MAT.glass : between(sideWin, z) ? bPillar : pillar;
      if (seg === "rail") return win ? MAT.trim : between(sideWin, z) ? bPillar : pillar;
      if (seg === "corner") return z > c.zh || z < c.zr ? pillar : c.railMat ? parts.mat(c.railMat) : roofMat;
      // крыша / лобовое / заднее стекло
      if (z > c.zh + frame) return z > zCowl ? MAT.trim : MAT.glass;
      if (z > c.zh) return MAT.trim;
      if (z >= c.zr) return roofMat;
      if (z > c.zr - frame) return MAT.trim;
      if (c.rearGlass === false) return roofMat;
      return z < zDeck ? MAT.trim : MAT.glass;
    },
    () => 0,
  );
  cap(mb, cabRings[0], czs[0], false, MAT.trim);
  cap(mb, cabRings[cabRings.length - 1], czs[czs.length - 1], true, MAT.trim);

  // ---------- ДЕТАЛИ ИЗ ОПИСАНИЯ ----------
  for (const d of b.decals || []) parts.decal(d);
  for (const l of b.lines || []) parts.lineSpec(l);
  // двери: стыки рисуются сами
  if (b.door) {
    const { z: dz } = b.door;
    const yTop = (z) => shape.cabMetrics(z).yBelt - 0.012;
    const yBot = (z) => shape.bot(z) + (b.door.sill ?? 0.1);
    for (const z of dz) {
      parts.lineSpec({ on: "S", pts: [[z, yBot(z)], [z, yTop(z)]], cab: false });
    }
    parts.lineSpec({ on: "S", pts: [[dz[0], yBot(dz[0])], [dz[1], yBot(dz[1])]], cab: false });
    // ручка
    const hz = dz[0] + 0.13;
    const hy = yTop(hz) - (b.door.handle ?? 0.1);
    parts.decal({ on: "S", mat: b.door.handleMat || "trim", q: [[hz - 0.07, hy - 0.016], [hz + 0.07, hy - 0.016], [hz + 0.07, hy + 0.016], [hz - 0.07, hy + 0.016]], round: 0.5, off: 0.012, cab: false });
  }
  if (b.mirrors !== false) parts.mirrors(b.mirrors?.z ?? z0 - 0.3, b.mirrors || {});
  if (b.wing) parts.wing(b.wing);
  if (b.plates !== false) {
    const pl = b.plates || {};
    if (pl.front !== false) parts.plate(1, pl.front ?? b.plateY ?? 0.42, pl);
    if (pl.rear !== false) parts.plate(-1, pl.rear ?? b.plateY ?? 0.45, pl);
  }
  if (spec.exhaust) parts.exhaust(spec.exhaust, b.trimY, b.exhaustR ?? 0.045, b.exhaustOpts || {});
  for (const p of b.pods || []) {
    parts.podOnTop(p.x, p.z, p.w, p.d, p.h, p.mat || "paint", p);
    if (!p.center && p.x !== 0) parts.podOnTop(-p.x, p.z, p.w, p.d, p.h, p.mat || "paint", p);
  }
  for (const l of b.lamps || []) {
    parts.lamp(l.x, l.y, l.r, l);
    if (l.x !== 0) parts.lamp(-l.x, l.y, l.r, l);
  }
  if (b.mudflaps) {
    for (const k of b.mudflaps.axles || [0, 1]) parts.mudflap(shape.axles[k], b.mudflaps);
  }
  if (b.splitter) parts.lip(half - (b.splitter.len ?? 0.5), half - 0.005, b.splitter.ext ?? 0.035, b.splitter.t ?? 0.025, b.splitter.mat || "black", 1);
  if (b.archLip) {
    for (const k of b.archLip.axles || [0, 1]) parts.archLip(k, b.archLip);
  }
  if (typeof b.extra === "function") b.extra(parts, shape, spec);

  // ---------- КОЛЁСА ----------
  const { wheel, caliper } = buildWheel(spec);
  const wheelPos = [];
  for (const z of shape.axles) {
    for (const side of [1, -1]) {
      wheelPos.push({ x: (side * b.track) / 2, z, front: z > 0, side });
    }
  }
  const geo = { body: mb, wheel, caliper, wheelPos, wheelR: b.wr, spec, shape };
  Object.defineProperty(spec, "_geo", { value: geo, enumerable: false, writable: true });
  return geo;
}

// z лежит между двумя окнами (то есть на средней стойке)?
function between(ranges, z) {
  if (ranges.length < 2) return false;
  let lo = Infinity;
  let hi = -Infinity;
  for (const r of ranges) {
    lo = Math.min(lo, r[0]);
    hi = Math.max(hi, r[1]);
  }
  return z > lo && z < hi && !inRanges(ranges, z);
}
