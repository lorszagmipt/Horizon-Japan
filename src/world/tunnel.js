// ТОННЕЛЬ. Дорога уходит в настоящую гору: рельеф над трубой не срезан (terrain.js → TUNNEL_COVER),
// наверху растут деревья, а там, где склон «прошёл бы» сквозь трубу, шейдер земли его не рисует (u_tun).
// Здесь строится сама труба: стены с плиткой и полосой, тротуары, свод с рёбрами, ряды оранжевых ламп,
// световые пятна на асфальте, бетонные порталы с откосами и стенки-ограничители для физики.
//
// Что крутить:
//   TUNNEL.wall  — высота стен до начала свода;     TUNNEL.rise — высота свода над стенами;
//   TUNNEL.side  — ширина тротуара от края асфальта; TUNNEL.hood — насколько портал выступает из горы (в точках по 2 м);
//   LAMP_EVERY   — шаг ламп (в точках дороги).

import { clamp, lerp, smoothstep } from "../core/math.js";
import { MeshBuilder } from "../render/mesh.js";

export const TUNNEL = {
  wall: 4.4,
  rise: 3.4,
  side: 1.7,
  curb: 0.28,
  hood: 3,
  shell: 0.7, // толщина бетона портала
};
const LAMP_EVERY = 4;
const RIB_EVERY = 8;

// цвета под тёплым «натриевым» светом
const C_TILE = [0.93, 0.8, 0.6];
const C_BASE = [0.3, 0.29, 0.3];
const C_STRIPE = [0.95, 0.42, 0.12];
const C_UPPER = [0.62, 0.55, 0.47];
const C_ARCH = [0.44, 0.4, 0.37];
const C_CURB = [0.5, 0.48, 0.46];
const C_CONCRETE = [0.74, 0.73, 0.7];
const C_CONCRETE_DARK = [0.56, 0.55, 0.54];
const C_WING = [0.6, 0.59, 0.57];
const C_LAMP = [1, 0.74, 0.36];

// Внутренний контур трубы: [смещение от оси, высота над дорогой, цвет, свечение]. hw — полуширина асфальта.
function innerProfile(hw) {
  const r = hw + TUNNEL.side;
  const pts = [];
  const add = (u, v, c, e) => pts.push({ u, v, c, e });
  // правая сторона снизу вверх
  add(hw + 0.12, -0.3, C_CURB, 0.1);
  add(hw + 0.12, TUNNEL.curb, C_CURB, 0.16);
  add(r, TUNNEL.curb, C_CURB, 0.14);
  add(r, 1.0, C_BASE, 0.12);
  add(r, 1.0, C_TILE, 0.34);
  add(r, 3.0, C_TILE, 0.42);
  add(r, 3.0, C_STRIPE, 0.5);
  add(r, 3.28, C_STRIPE, 0.5);
  add(r, 3.28, C_UPPER, 0.3);
  add(r, TUNNEL.wall, C_UPPER, 0.3);
  const N = 12;
  for (let k = 1; k < N; k++) {
    const a = (k / N) * Math.PI;
    add(Math.cos(a) * r, TUNNEL.wall + Math.sin(a) * TUNNEL.rise, C_ARCH, 0.2 + 0.16 * Math.sin(a) ** 2);
  }
  // левая сторона — зеркально, сверху вниз
  const right = pts.slice(0, 10);
  for (let k = right.length - 1; k >= 0; k--) add(-right[k].u, right[k].v, right[k].c, right[k].e);
  return pts;
}

// Высота свода над дорогой на расстоянии d от оси (r — полуширина трубы).
export function tunnelTop(d, r) {
  return TUNNEL.wall + TUNNEL.rise * Math.sqrt(Math.max(0, 1 - (d / r) ** 2));
}

// Наружный контур бетонной оболочки (толщина t): от земли по стене и своду.
function outerProfile(hw, t) {
  const r = hw + TUNNEL.side + t;
  const pts = [[r, -1.2], [r, TUNNEL.wall]];
  const N = 12;
  for (let k = 1; k < N; k++) {
    const a = (k / N) * Math.PI;
    pts.push([Math.cos(a) * r, TUNNEL.wall + Math.sin(a) * (TUNNEL.rise + t)]);
  }
  pts.push([-r, TUNNEL.wall], [-r, -1.2]);
  return pts;
}

export function buildTunnels(world) {
  const items = [];
  const clip = [];
  for (const tn of world.roads.tunnels) items.push(...buildTunnel(world, tn, clip));
  setTunnelClip(world.r, world.roads.tunnels);
  return items;
}

// Сообщает шейдеру земли, где проходит труба (по этим точкам он «вырезает» в склоне отверстие).
function setTunnelClip(renderer, tunnels) {
  const MAXP = 16;
  const data = new Float32Array(MAXP * 4);
  const box = [0, 0, 0, 0];
  const tn = tunnels[0];
  if (tn) {
    const { road, a, b } = tn;
    const i0 = a - TUNNEL.hood;
    const i1 = b + TUNNEL.hood;
    const n = Math.min(MAXP, Math.max(2, Math.ceil((i1 - i0) / 7) + 1));
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let k = 0; k < n; k++) {
      const i = clamp(Math.round(lerp(i0, i1, k / (n - 1))), 0, road.n - 1);
      data[k * 4] = road.x[i];
      data[k * 4 + 1] = road.h[i];
      data[k * 4 + 2] = road.z[i];
      data[k * 4 + 3] = k < n - 1 ? 1 : 0;
      minX = Math.min(minX, road.x[i]);
      maxX = Math.max(maxX, road.x[i]);
      minZ = Math.min(minZ, road.z[i]);
      maxZ = Math.max(maxZ, road.z[i]);
    }
    const r = road.hw + TUNNEL.side + 0.25;
    box[0] = (minX + maxX) / 2;
    box[1] = (minZ + maxZ) / 2;
    box[2] = Math.hypot(maxX - minX, maxZ - minZ) / 2 + r + 2;
    box[3] = r;
  }
  renderer.globals.u_tun = data;
  renderer.globals.u_tunBox = box;
}

function buildTunnel(world, tn) {
  const { road, a, b } = tn;
  const r = world.r;
  const hw = road.hw;
  const R = hw + TUNNEL.side;
  const i0 = Math.max(1, a - TUNNEL.hood);
  const i1 = Math.min(road.n - 2, b + TUNNEL.hood);
  const up = (i) => clamp(Math.round(i), 0, road.n - 1);
  // точка в сечении i (номер точки дороги, можно дробный): смещение u вбок и v вверх
  const P = (i, u, v) => {
    const f = clamp(i, 0, road.n - 1);
    const j0 = Math.min(Math.floor(f), road.n - 2);
    const t = f - j0;
    const x = lerp(road.x[j0], road.x[j0 + 1], t);
    const z = lerp(road.z[j0], road.z[j0 + 1], t);
    const h = lerp(road.h[j0], road.h[j0 + 1], t);
    const j = up(i);
    return [x + road.tz[j] * u, h + v, z - road.tx[j] * u];
  };

  // ---------- ВНУТРИ: стены, тротуары, свод ----------
  const inner = new MeshBuilder();
  inner.ext = [];
  const prof = innerProfile(hw);
  const rings = [];
  for (let i = i0; i <= i1; i++) {
    // у ламп стены светлее: свет «лужами» вдоль тоннеля
    const phase = ((i - a) % LAMP_EVERY) / LAMP_EVERY;
    const glow = 0.78 + 0.22 * Math.cos(phase * Math.PI * 2);
    // у порталов дневной свет: свечение ламп там не нужно
    const day = 1 - smoothstep(0, 5, Math.min(i - i0, i1 - i));
    const ring = prof.map((p) => {
      const pos = P(i, p.u, p.v);
      const n = normalIn(p, R);
      const j = up(i);
      const nx = road.tz[j] * n[0];
      const nz = -road.tx[j] * n[0];
      const e = p.e * glow * (1 - day * 0.5);
      return inner.vertex(pos[0], pos[1], pos[2], nx, n[1], nz, [p.c[0], p.c[1], p.c[2], 0], [0.08, e, 0, 0]);
    });
    rings.push(ring);
  }
  for (let k = 0; k < rings.length - 1; k++) {
    for (let j = 0; j < prof.length - 1; j++) {
      // стыки цветов (две точки в одном месте) — без грани
      if (prof[j].u === prof[j + 1].u && prof[j].v === prof[j + 1].v) continue;
      inner.quad(rings[k][j], rings[k + 1][j], rings[k + 1][j + 1], rings[k][j + 1]);
    }
  }

  // ---------- ДЕТАЛИ: рёбра свода, лампы, указатели выхода ----------
  const detail = new MeshBuilder();
  detail.ext = [];
  const box = (i, u, v, w, h, len, col, gloss, emis, tiltToAxis = 0) => {
    // коробка вдоль дороги с центром в точке сечения (u, v)
    const j = up(i);
    const c = P(i, u, v);
    const fx = road.tx[j];
    const fz = road.tz[j];
    const rx = road.tz[j];
    const rz = -road.tx[j];
    // наклон вокруг оси дороги, чтобы лампа смотрела к центру
    const ca = Math.cos(tiltToAxis);
    const sa = Math.sin(tiltToAxis);
    const R1 = [rx * ca, sa, rz * ca];
    const U1 = [-rx * sa, ca, -rz * sa];
    const corners = [];
    for (const sf of [-1, 1])
      for (const sr of [-1, 1])
        for (const su of [-1, 1])
          corners.push([
            c[0] + fx * sf * len * 0.5 + R1[0] * sr * w * 0.5 + U1[0] * su * h * 0.5,
            c[1] + R1[1] * sr * w * 0.5 + U1[1] * su * h * 0.5,
            c[2] + fz * sf * len * 0.5 + R1[2] * sr * w * 0.5 + U1[2] * su * h * 0.5,
          ]);
    const face = (i0b, i1b, i2b, i3b) => {
      const A = corners[i0b];
      const B = corners[i1b];
      const C = corners[i2b];
      let n = [
        (B[1] - A[1]) * (C[2] - A[2]) - (B[2] - A[2]) * (C[1] - A[1]),
        (B[2] - A[2]) * (C[0] - A[0]) - (B[0] - A[0]) * (C[2] - A[2]),
        (B[0] - A[0]) * (C[1] - A[1]) - (B[1] - A[1]) * (C[0] - A[0]),
      ];
      const l = Math.hypot(n[0], n[1], n[2]) || 1;
      n = [n[0] / l, n[1] / l, n[2] / l];
      const m = [(A[0] + C[0]) / 2 - c[0], (A[1] + C[1]) / 2 - c[1], (A[2] + C[2]) / 2 - c[2]];
      const ids = [i0b, i1b, i2b, i3b].map((q) =>
        detail.vertex(corners[q][0], corners[q][1], corners[q][2], n[0], n[1], n[2], [col[0], col[1], col[2], 0], [gloss, emis, 0, 0]),
      );
      if (n[0] * m[0] + n[1] * m[1] + n[2] * m[2] >= 0) detail.quad(ids[0], ids[1], ids[2], ids[3]);
      else detail.quad(ids[0], ids[3], ids[2], ids[1]);
    };
    face(0, 1, 3, 2);
    face(4, 6, 7, 5);
    face(0, 4, 5, 1);
    face(2, 3, 7, 6);
    face(0, 2, 6, 4);
    face(1, 5, 7, 3);
  };
  const lampA = 0.94; // угол ламп на своде (от горизонтали)
  for (let i = a + 1; i <= b - 1; i++) {
    const k = i - a;
    if (k % LAMP_EVERY === 0) {
      for (const s of [-1, 1]) {
        const u = s * Math.cos(lampA) * (R - 0.16);
        const v = TUNNEL.wall + Math.sin(lampA) * (TUNNEL.rise - 0.16);
        box(i, u, v, 0.62, 0.1, 1.5, C_LAMP, 0.2, 2.6, s * (Math.PI / 2 - lampA));
        box(i, u * 1.012, v + 0.07, 0.78, 0.08, 1.7, [0.2, 0.2, 0.22], 0.2, 0, s * (Math.PI / 2 - lampA));
      }
    }
    // зелёные указатели выхода на стенах
    if (k % 20 === 10) {
      for (const s of [-1, 1]) {
        box(i, s * (R - 0.04), 2.2, 0.06, 0.34, 0.62, [0.16, 0.95, 0.45], 0.3, 1.6);
      }
    }
  }
  // рёбра свода — отдельными «арками», чуть выступающими внутрь
  const ribProf = [];
  {
    const N = 12;
    ribProf.push([R - 0.14, TUNNEL.curb], [R - 0.14, TUNNEL.wall]);
    for (let k = 1; k < N; k++) {
      const an = (k / N) * Math.PI;
      ribProf.push([Math.cos(an) * (R - 0.14), TUNNEL.wall + Math.sin(an) * (TUNNEL.rise - 0.14)]);
    }
    ribProf.push([-(R - 0.14), TUNNEL.wall], [-(R - 0.14), TUNNEL.curb]);
  }
  for (let i = a + RIB_EVERY / 2; i <= b - 2; i += RIB_EVERY) {
    const j = up(i);
    const half = 0.28;
    const ring0 = [];
    const ring1 = [];
    for (const [u, v] of ribProf) {
      const c = P(i, u, v);
      const day = 1 - smoothstep(0, 5, Math.min(i - i0, i1 - i));
      const ext = [0.05, 0.2 * (1 - day * 0.5), 0, 0];
      const n = normalIn({ u, v }, R);
      const nn = [road.tz[j] * n[0], n[1], -road.tx[j] * n[0]];
      ring0.push(detail.vertex(c[0] - road.tx[j] * half, c[1], c[2] - road.tz[j] * half, nn[0], nn[1], nn[2], [...C_CONCRETE_DARK, 0], ext));
      ring1.push(detail.vertex(c[0] + road.tx[j] * half, c[1], c[2] + road.tz[j] * half, nn[0], nn[1], nn[2], [...C_CONCRETE_DARK, 0], ext));
    }
    for (let q = 0; q < ribProf.length - 1; q++) detail.quad(ring0[q], ring1[q], ring1[q + 1], ring0[q + 1]);
  }

  // ---------- СВЕТОВЫЕ ПЯТНА НА АСФАЛЬТЕ ----------
  const pools = new MeshBuilder();
  for (let i = a + LAMP_EVERY; i <= b - LAMP_EVERY; i += LAMP_EVERY) {
    const day = 1 - smoothstep(0, 6, Math.min(i - a, b - i));
    const alpha = 0.3 * (1 - day);
    if (alpha < 0.01) continue;
    const c = P(i, 0, 0.05);
    const j = up(i);
    const center = pools.vertex(c[0], c[1], c[2], 0, 1, 0, [1, 0.62, 0.22, alpha]);
    const ring = [];
    const N = 12;
    for (let q = 0; q < N; q++) {
      const an = (q / N) * Math.PI * 2;
      const u = Math.cos(an) * (hw - 0.3);
      const f = Math.sin(an) * 3.6;
      ring.push(pools.vertex(c[0] + road.tz[j] * u + road.tx[j] * f, c[1], c[2] - road.tx[j] * u + road.tz[j] * f, 0, 1, 0, [1, 0.62, 0.22, 0]));
    }
    for (let q = 0; q < N; q++) pools.tri(center, ring[(q + 1) % N], ring[q]);
  }

  // ---------- СНАРУЖИ: бетонные порталы ----------
  const shell = new MeshBuilder();
  shell.ext = [];
  const outer = outerProfile(hw, TUNNEL.shell);
  const collar = outerProfile(hw, TUNNEL.shell + 0.55);
  const sv = (p, n, col, gloss = 0.1) => shell.vertex(p[0], p[1], p[2], n[0], n[1], n[2], [col[0], col[1], col[2], 0], [gloss, 0, 0, 0]);
  const outN = (i, u, v) => {
    const j = up(i);
    const n = normalIn({ u, v }, R);
    return [-road.tz[j] * n[0], -n[1], road.tx[j] * n[0]];
  };
  const portal = (mouth, dir) => {
    // mouth — номер точки дороги у среза портала; dir — куда уходит труба (в гору): +1 или -1
    const deep = mouth + dir * (TUNNEL.hood + 14);
    // оболочка: от среза в глубину горы
    let prev = null;
    for (let i = mouth; dir > 0 ? i <= deep : i >= deep; i += dir) {
      const prf = Math.abs(i - mouth) <= 1 ? collar : outer;
      const ring = prf.map(([u, v]) => sv(P(i, u, v), outN(i, u, v), Math.abs(i - mouth) <= 1 ? C_CONCRETE : C_CONCRETE_DARK));
      if (prev) {
        for (let q = 0; q < prf.length - 1; q++) {
          if (dir > 0) shell.quad(prev[q], ring[q], ring[q + 1], prev[q + 1]);
          else shell.quad(prev[q], prev[q + 1], ring[q + 1], ring[q]);
        }
      }
      prev = ring;
      if (Math.abs(i - mouth) === 1) {
        // ступенька от воротника к оболочке
        const step = outer.map(([u, v]) => sv(P(i, u, v), outN(i, u, v), C_CONCRETE_DARK));
        for (let q = 0; q < outer.length - 1; q++) {
          if (dir > 0) shell.quad(ring[q], step[q], step[q + 1], ring[q + 1]);
          else shell.quad(ring[q], ring[q + 1], step[q + 1], step[q]);
        }
        prev = step;
      }
    }
    // торец: кольцо между внутренним и наружным контуром
    const j = up(mouth);
    const fn = [-road.tx[j] * dir, 0, -road.tz[j] * dir];
    const innerLine = [[R, -1.2], [R, TUNNEL.wall]];
    const N = 12;
    for (let k = 1; k < N; k++) {
      const an = (k / N) * Math.PI;
      innerLine.push([Math.cos(an) * R, TUNNEL.wall + Math.sin(an) * TUNNEL.rise]);
    }
    innerLine.push([-R, TUNNEL.wall], [-R, -1.2]);
    for (let q = 0; q < collar.length - 1; q++) {
      const A = sv(P(mouth, innerLine[q][0], innerLine[q][1]), fn, C_CONCRETE);
      const B = sv(P(mouth, collar[q][0], collar[q][1]), fn, C_CONCRETE);
      const C = sv(P(mouth, collar[q + 1][0], collar[q + 1][1]), fn, C_CONCRETE);
      const D = sv(P(mouth, innerLine[q + 1][0], innerLine[q + 1][1]), fn, C_CONCRETE);
      if (dir > 0) shell.quad(A, B, C, D);
      else shell.quad(A, D, C, B);
    }
    // красно-белая полоса по краю свода и лампы-стрелки над полосами
    const stripeR = R + 0.08;
    for (let k = 0; k < N; k++) {
      const a0 = (k / N) * Math.PI;
      const a1 = ((k + 1) / N) * Math.PI;
      const col = k % 2 ? [0.9, 0.9, 0.88] : [0.82, 0.16, 0.12];
      const pt = (an, rr) => P(mouth - dir * 0.03, Math.cos(an) * rr, TUNNEL.wall + Math.sin(an) * (rr - R + TUNNEL.rise));
      const q = [pt(a0, stripeR), pt(a0, stripeR + 0.34), pt(a1, stripeR + 0.34), pt(a1, stripeR)].map((p) => sv(p, fn, col, 0.3));
      if (dir > 0) shell.quad(q[0], q[1], q[2], q[3]);
      else shell.quad(q[0], q[3], q[2], q[1]);
    }
    // откосы-стенки по бокам от портала: расходятся в стороны и понижаются
    for (const s of [-1, 1]) {
      const x0 = R + TUNNEL.shell + 0.55;
      const pts = [];
      const steps = 5;
      for (let k = 0; k <= steps; k++) {
        const f = k / steps;
        const u = s * (x0 + f * 11);
        const along = -dir * f * 5.5; // наружу от горы
        const base = P(mouth, u, 0);
        const bx = base[0] + road.tx[j] * along;
        const bz = base[2] + road.tz[j] * along;
        const ground = world.terrain.heightAt(bx, bz);
        const top = Math.max(ground + 0.4, road.h[j] + lerp(TUNNEL.wall + 1.2, 0.9, f));
        pts.push({ x: bx, z: bz, bot: Math.min(ground, road.h[j]) - 1.5, top });
      }
      const th = 0.45;
      for (let k = 0; k < steps; k++) {
        const p0 = pts[k];
        const p1 = pts[k + 1];
        const dx = p1.x - p0.x;
        const dz = p1.z - p0.z;
        const l = Math.hypot(dx, dz) || 1;
        // нормаль стенки — наружу от горы (к дороге перед порталом)
        let nx = dz / l;
        let nz = -dx / l;
        if (nx * fn[0] + nz * fn[2] < 0) {
          nx = -nx;
          nz = -nz;
        }
        const quad = (pA, pB, pC, pD, n, col) => {
          const ids = [pA, pB, pC, pD].map((p) => sv(p, n, col));
          const g = [
            (pB[1] - pA[1]) * (pC[2] - pA[2]) - (pB[2] - pA[2]) * (pC[1] - pA[1]),
            (pB[2] - pA[2]) * (pC[0] - pA[0]) - (pB[0] - pA[0]) * (pC[2] - pA[2]),
            (pB[0] - pA[0]) * (pC[1] - pA[1]) - (pB[1] - pA[1]) * (pC[0] - pA[0]),
          ];
          if (g[0] * n[0] + g[1] * n[1] + g[2] * n[2] >= 0) shell.quad(ids[0], ids[1], ids[2], ids[3]);
          else shell.quad(ids[0], ids[3], ids[2], ids[1]);
        };
        const f0 = [p0.x + nx * th, p0.bot, p0.z + nz * th];
        const f1 = [p1.x + nx * th, p1.bot, p1.z + nz * th];
        const f2 = [p1.x + nx * th, p1.top, p1.z + nz * th];
        const f3 = [p0.x + nx * th, p0.top, p0.z + nz * th];
        const b0 = [p0.x - nx * th, p0.bot, p0.z - nz * th];
        const b1 = [p1.x - nx * th, p1.bot, p1.z - nz * th];
        const b2 = [p1.x - nx * th, p1.top, p1.z - nz * th];
        const b3 = [p0.x - nx * th, p0.top, p0.z - nz * th];
        quad(f0, f1, f2, f3, [nx, 0, nz], C_WING);
        quad(b0, b1, b2, b3, [-nx, 0, -nz], C_CONCRETE_DARK);
        quad(f3, f2, b2, b3, [0, 1, 0], C_CONCRETE);
        if (k === steps - 1) quad(f1, b1, b2, f2, [dx / l, 0, dz / l], C_WING);
        // стенка — препятствие
        world.colliders.addSegment(p0.x, p0.z, p1.x, p1.z, Math.min(p0.bot, p1.bot), Math.max(p0.top, p1.top), "wall");
      }
    }
    // табло над въездом: зелёные стрелки над полосами
    const lanes = road.lane === 2 ? [-6, -2, 2, 6] : [-hw / 2, hw / 2];
    const bar = mouth - dir * 0.2;
    box(bar, 0, TUNNEL.wall + TUNNEL.rise - 0.75, 2 * hw - 1.5, 0.5, 0.24, [0.07, 0.07, 0.08], 0.2, 0);
    for (const u of lanes) {
      if (Math.abs(u) > hw - 1) continue;
      box(bar - dir * 0.08, u, TUNNEL.wall + TUNNEL.rise - 0.75, 0.3, 0.3, 0.1, [0.2, 1, 0.45], 0.3, 2.2);
    }
    // торец оболочки у портала — препятствие
    for (const s of [-1, 1]) {
      const p0 = P(mouth, s * (hw + 0.3), 0);
      const p1 = P(mouth, s * (R + TUNNEL.shell + 0.6), 0);
      world.colliders.addSegment(p0[0], p0[2], p1[0], p1[2], road.h[j] - 2, road.h[j] + 10, "wall");
    }
  };
  portal(i0, 1);
  portal(i1, -1);

  // ---------- ФИЗИКА: стенки вдоль тротуаров ----------
  for (let i = i0; i < i1; i++) {
    for (const s of [-1, 1]) {
      const p0 = P(i, s * (hw + 0.3), 0);
      const p1 = P(i + 1, s * (hw + 0.3), 0);
      world.colliders.addSegment(p0[0], p0[2], p1[0], p1[2], road.h[up(i)] - 2, road.h[up(i)] + 9, "wall");
    }
  }

  // ---------- В РЕНДЕР ----------
  const mid = up((a + b) >> 1);
  const bounds = { c: [road.x[mid], road.h[mid] + 4, road.z[mid]], r: (i1 - i0) + 40 };
  const out = [];
  out.push(
    r.add({ mesh: r.createMesh(inner), defines: ["CARMAT"], uniforms: { u_sunScale: 0.25 }, shadow: false, cull: "none", bounds, maxDist: 1600 }),
    r.add({ mesh: r.createMesh(detail), defines: ["CARMAT"], uniforms: { u_sunScale: 0.25 }, shadow: false, bounds, maxDist: 900 }),
    r.add({ mesh: r.createMesh(shell), defines: ["CARMAT"], shadow: true, shadowDist: 200, cull: "none", bounds, maxDist: 1800 }),
  );
  if (pools.vertexCount) {
    out.push(
      r.add({ mesh: r.createMesh(pools), prog: "trail", blend: true, depthWrite: false, cull: "none", bounds, maxDist: 500, order: 4, polyOffset: [-4, -8], reflect: false }),
    );
  }
  return out;
}

// Нормаль внутренней поверхности трубы в точке контура (смотрит внутрь).
function normalIn(p, R) {
  if (p.v <= TUNNEL.curb + 1e-6 && Math.abs(p.u) < R - 1e-6) return [0, 1];
  if (p.v <= TUNNEL.wall) return [-Math.sign(p.u), 0];
  const x = p.u / R;
  const y = (p.v - TUNNEL.wall) / TUNNEL.rise;
  const l = Math.hypot(x, y) || 1;
  return [-x / l, -y / l];
}
