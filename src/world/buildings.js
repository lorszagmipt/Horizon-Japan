// Постройки: дома, тории, фонари, пагода, храм, замок, ларьки фестиваля, смотровые площадки, водопад.

import { lerp, rgb } from "../core/math.js";
import { seededRandom } from "../core/random.js";
import { LANDMARKS, VILLAGES } from "./mapData.js";
import { MeshBuilder, boxGeo, cylinderGeo, icosphereGeo, makeTransform } from "../render/mesh.js";
import { lakeDistance } from "./terrain.js";
import { makeRock } from "./vegetation/models.js";
import { StaticBatch } from "./batch.js";
import { beam, dormer, frustum } from "./shapes.js";

function addPart(f, t, e, s) {
  f.append(t, e, s, "set");
  return f;
}

function addRoof(f, t, e, s, o, i, n) {
  const a = t / 2 + i;
  const r = e / 2 + i;
  const c = Math.atan2(o, r);
  const u = Math.hypot(o, r) + 0.1;
  for (const h of [-1, 1]) {
    const l = makeTransform(0, s + o / 2, (h * r) / 2, 0, 1, 1, 1, h * c);
    addPart(f, boxGeo(a * 2, 0.28, u), l, n);
    addPart(
      f,
      boxGeo(a * 2 + 0.2, 0.22, 0.9),
      makeTransform(0, s + 0.05, h * (r - 0.1), 0, 1, 1, 1, -h * 0.35),
      n,
    );
  }
  addPart(f, boxGeo(a * 2 + 0.3, 0.35, 0.45), makeTransform(0, s + o + 0.05, 0), [
    n[0] * 0.8,
    n[1] * 0.8,
    n[2] * 0.8,
  ]);
  for (const h of [-1, 1]) {
    const l = new MeshBuilder();
    const m = l.vertex((-t / 2) * 0 + (h * t) / 2, s, -e / 2, h, 0, 0, [1, 1, 1, 1]);
    const p = l.vertex((h * t) / 2, s, e / 2, h, 0, 0, [1, 1, 1, 1]);
    const d = l.vertex((h * t) / 2, s + o * 0.95, 0, h, 0, 0, [1, 1, 1, 1]);
    if (h > 0) {
      l.tri(m, d, p);
    } else {
      l.tri(m, p, d);
    }
    addPart(f, l, null, rgb(0xeee6d2));
  }
}

function makeHouse(f, t) {
  const e = new MeshBuilder();
  const s = 7 + f() * 4;
  const o = 5.5 + f() * 2.5;
  const i = 3 + f() * 0.6;
  const n = [rgb(0xf3ecdc), rgb(0xe9dfc8), rgb(0xf6f0e4)][Math.floor(f() * 3)];
  const a = rgb(0x5a3b2c);
  const r =
    t === "autumn"
      ? [rgb(0x6b3a2a), rgb(0x4a4f5c), rgb(0x7a5530)]
      : t === "high"
        ? [rgb(0x3f4a5c), rgb(0x50565e)]
        : [rgb(0x3d4a63), rgb(0x45576b), rgb(0x6a3f3a)];
  const c = r[Math.floor(f() * r.length)];
  addPart(e, boxGeo(s + 0.4, 0.5, o + 0.4), makeTransform(0, 0.25, 0), rgb(0x8a8178));
  addPart(e, boxGeo(s, i, o), makeTransform(0, 0.5 + i / 2, 0), n);
  for (const h of [-1, 1]) {
    for (const l of [-1, 1]) {
      addPart(e, boxGeo(0.28, i, 0.28), makeTransform((h * s) / 2, 0.5 + i / 2, (l * o) / 2), a);
    }
  }
  addPart(e, boxGeo(s + 0.1, 0.25, o + 0.1), makeTransform(0, 0.5 + i - 0.1, 0), a);
  addPart(e, boxGeo(s + 0.1, 0.2, o + 0.1), makeTransform(0, 0.5 + 0.9, 0), a);
  const u = Math.floor(s / 1.6);
  for (let h = 0; h < u; h++) {
    const l = -s / 2 + (h + 0.5) * (s / u);
    addPart(
      e,
      boxGeo(s / u - 0.25, i * 0.55, 0.06),
      makeTransform(l, 0.5 + 1 + i * 0.27, o / 2 + 0.03),
      rgb(0xfff8e6),
    );
    addPart(
      e,
      boxGeo(0.05, i * 0.55, 0.08),
      makeTransform(l + s / u / 2 - 0.1, 0.5 + 1 + i * 0.27, o / 2 + 0.05),
      a,
    );
  }
  addPart(e, boxGeo(s, 0.18, 1.2), makeTransform(0, 0.6, o / 2 + 0.6), rgb(0x8b6243));
  addRoof(e, s, o, 0.5 + i, 2 + f() * 0.8, 0.9, c);
  if (f() < 0.3) {
    const h = s * 0.6;
    const l = o * 0.7;
    const m = 2.4;
    addPart(e, boxGeo(h, m, l), makeTransform(0, 0.5 + i + 0.9 + m / 2, 0), n);
    addRoof(e, h, l, 0.5 + i + 0.9 + m, 1.6, 0.7, c);
  }
  e.size = [s + 2, o + 2.5];
  return e;
}

function makeTorii(f = 1, t = rgb(0xe2462b)) {
  const e = new MeshBuilder();
  const s = [0.12, 0.1, 0.1];
  for (const o of [-2.2, 2.2]) {
    addPart(e, cylinderGeo(0.34, 0.28, 0, 6.2, 12), makeTransform(o * f, 0, 0, 0, f), t);
    addPart(e, cylinderGeo(0.42, 0.42, 0, 0.6, 12), makeTransform(o * f, 0, 0, 0, f), s);
  }
  addPart(e, boxGeo(5.6, 0.45, 0.45), makeTransform(0, 4.9 * f, 0, 0, f), t);
  for (const o of [-1, 1]) {
    addPart(
      e,
      boxGeo(3.9, 0.55, 0.7),
      makeTransform(o * 1.85 * f, 6.25 * f, 0, 0, f, f, f, 0, o * 0.07),
      t,
    );
    addPart(
      e,
      boxGeo(4.1, 0.3, 0.85),
      makeTransform(o * 1.9 * f, 6.62 * f, 0, 0, f, f, f, 0, o * 0.08),
      s,
    );
  }
  addPart(e, boxGeo(0.35, 1.2, 0.3), makeTransform(0, 5.6 * f, 0, 0, f), t);
  return e;
}

function makeStoneLantern(f = true) {
  const t = new MeshBuilder();
  const e = rgb(0x9b9690);
  addPart(t, cylinderGeo(0.55, 0.5, 0, 0.3, 6), null, e);
  addPart(t, cylinderGeo(0.18, 0.2, 0.3, 1.3, 8), null, e);
  addPart(t, cylinderGeo(0.45, 0.4, 1.3, 1.45, 6), null, e);
  addPart(t, boxGeo(0.6, 0.55, 0.6), makeTransform(0, 1.75, 0), f ? rgb(0xffd27a) : e);
  addPart(t, cylinderGeo(0.8, 0.05, 2, 2.55, 6), null, rgb(0x86817b));
  addPart(t, icosphereGeo(0.14, 0), makeTransform(0, 2.6, 0), e);
  t.glow = [0, 1.75, 0];
  return t;
}

function makeLanternPost() {
  const f = new MeshBuilder();
  addPart(f, boxGeo(0.12, 3.2, 0.12), makeTransform(0, 1.6, 0), rgb(0x4a3428));
  addPart(f, boxGeo(0.9, 0.08, 0.08), makeTransform(0.4, 3.1, 0), rgb(0x4a3428));
  addPart(f, cylinderGeo(0.26, 0.26, 2.15, 2.85, 10), makeTransform(0.75, 0, 0), rgb(0xff4a32));
  addPart(f, cylinderGeo(0.27, 0.27, 2.12, 2.18, 10), makeTransform(0.75, 0, 0), [0.1, 0.08, 0.08]);
  addPart(f, cylinderGeo(0.27, 0.27, 2.82, 2.88, 10), makeTransform(0.75, 0, 0), [0.1, 0.08, 0.08]);
  return f;
}

function makePagoda() {
  const f = new MeshBuilder();
  const t = rgb(0xd9472b);
  const e = rgb(0xf2ead8);
  const s = rgb(0x3a3f4a);
  const o = rgb(0xe5b445);
  addPart(f, boxGeo(11, 1.2, 11), makeTransform(0, 0.6, 0), rgb(0x9a948c));
  let i = 1.2;
  let n = 8;
  for (let a = 0; a < 5; a++) {
    const r = a === 0 ? 4.2 : 3;
    addPart(f, boxGeo(n, r, n), makeTransform(0, i + r / 2, 0), a % 2 ? e : t);
    for (const u of [-1, 1]) {
      for (const h of [-1, 1]) {
        addPart(f, boxGeo(0.4, r, 0.4), makeTransform((u * n) / 2, i + r / 2, (h * n) / 2), t);
      }
    }
    i += r;
    const c = n + 4.2;
    addPart(f, boxGeo(c, 0.45, c), makeTransform(0, i + 0.2, 0), s);
    for (let u = 0; u < 4; u++) {
      const h = (u / 4) * Math.PI * 2 + Math.PI / 4;
      addPart(
        f,
        boxGeo(0.8, 0.35, 2.2),
        makeTransform(
          Math.cos(h) * c * 0.66,
          i + 0.55,
          Math.sin(h) * c * 0.66,
          -h + Math.PI / 2,
          1,
          1,
          1,
          -0.4,
        ),
        s,
      );
    }
    addPart(
      f,
      cylinderGeo(c * 0.55, n * 0.45, i + 0.4, i + 1.1, 4),
      makeTransform(0, 0, 0, Math.PI / 4),
      s,
    );
    i += 1.1;
    n *= 0.84;
  }
  addPart(f, cylinderGeo(0.18, 0.12, i, i + 7, 8), null, o);
  for (let a = 0; a < 7; a++) {
    addPart(
      f,
      cylinderGeo(0.55 - a * 0.04, 0.55 - a * 0.04, i + 1 + a * 0.8, i + 1.2 + a * 0.8, 10),
      null,
      o,
    );
  }
  return f;
}

function makeShrine() {
  const f = new MeshBuilder();
  const t = rgb(0xd9472b);
  const e = rgb(0x6b4632);
  const s = rgb(0x3e5a4a);
  addPart(f, boxGeo(14, 1.2, 10), makeTransform(0, 0.6, 0), rgb(0x9a948c));
  for (const o of [-5.5, -2, 2, 5.5]) {
    for (const i of [-3.5, 3.5]) {
      addPart(f, cylinderGeo(0.3, 0.3, 1.2, 5.5, 10), makeTransform(o, 0, i), t);
    }
  }
  addPart(f, boxGeo(11, 3.8, 6), makeTransform(0, 3.2, 0), rgb(0xf1e6cc));
  addPart(f, boxGeo(12, 0.4, 8), makeTransform(0, 5.4, 0), e);
  addRoof(f, 12, 8, 5.6, 3.6, 1.6, s);
  addPart(f, boxGeo(3, 0.8, 3), makeTransform(0, 1.6, 6.2), rgb(0x8a8178));
  return f;
}

// ЗАМОК (главная башня). Каменное основание с вогнутыми стенами, четыре белых яруса, вокруг каждого —
// скат крыши с загнутыми углами и треугольными фронтонами, наверху двускатная крыша с золотыми рыбами.
const CASTLE_TIERS = [
  // ширина, глубина, высота стены яруса (м)
  [16.6, 13.8, 4.4],
  [13.2, 10.8, 3.4],
  [10.2, 8.2, 3.2],
  [7.6, 6.0, 3.0],
];

function castleTower(f, tiers, y0, eave0, colors) {
  const { white, roof, wood, cream } = colors;
  const ridgeCol = [roof[0] * 0.78, roof[1] * 0.78, roof[2] * 0.78];
  let y = y0;
  for (let k = 0; k < tiers.length; k++) {
    const [w, d, h] = tiers[k];
    addPart(f, boxGeo(w, h, d), makeTransform(0, y + h / 2, 0), white);
    if (k === 0) {
      // нижний ярус обшит тёмными досками
      addPart(f, boxGeo(w + 0.12, h * 0.36, d + 0.12), makeTransform(0, y + h * 0.18, 0), wood);
    }
    // окна по всем четырём стенам
    const wy = y + h * 0.66;
    const nx = Math.max(2, Math.round(w / 2.7));
    const nz = Math.max(2, Math.round(d / 2.7));
    for (const sgn of [-1, 1]) {
      for (let u = 0; u < nx; u++) {
        const x = -w / 2 + ((u + 0.5) * w) / nx;
        addPart(f, boxGeo(0.95, 1.05, 0.12), makeTransform(x, wy, sgn * (d / 2 + 0.02)), [0.13, 0.12, 0.12]);
        addPart(f, boxGeo(1.2, 0.12, 0.2), makeTransform(x, wy - 0.6, sgn * (d / 2 + 0.04)), wood);
      }
      for (let u = 0; u < nz; u++) {
        const z = -d / 2 + ((u + 0.5) * d) / nz;
        addPart(f, boxGeo(0.12, 1.05, 0.95), makeTransform(sgn * (w / 2 + 0.02), wy, z), [0.13, 0.12, 0.12]);
        addPart(f, boxGeo(0.2, 0.12, 1.2), makeTransform(sgn * (w / 2 + 0.04), wy - 0.6, z), wood);
      }
    }
    const top = y + h;
    const eave = eave0 - k * 0.12;
    const ew = w + eave * 2;
    const ed = d + eave * 2;
    // доска под свесом (её видно снизу) и тёмная кромка черепицы
    addPart(f, boxGeo(ew, 0.14, ed), makeTransform(0, top - 0.42, 0), cream);
    addPart(f, boxGeo(ew + 0.25, 0.16, ed + 0.25), makeTransform(0, top - 0.28, 0), ridgeCol);
    if (k < tiers.length - 1) {
      const [w2, d2] = tiers[k + 1];
      const rise = 1.75;
      frustum(f, ew + 0.2, ed + 0.2, top - 0.22, w2 + 0.3, d2 + 0.3, top + rise, roof, false);
      // рёбра по углам ската; кончик загнут вверх
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const lo = [sx * (ew / 2 + 0.1), top - 0.2, sz * (ed / 2 + 0.1)];
          const hi = [sx * (w2 / 2 + 0.15), top + rise + 0.02, sz * (d2 / 2 + 0.15)];
          beam(f, hi, lo, 0.36, 0.2, ridgeCol);
          beam(f, lo, [lo[0] + sx * 0.75, lo[1] + 0.5, lo[2] + sz * 0.75], 0.34, 0.2, ridgeCol);
        }
      }
      // треугольные фронтоны: на чётных ярусах спереди и сзади, на нечётных — по бокам
      if (k % 2 === 0) {
        for (const sgn of [-1, 1]) {
          dormer(f, 0, top + 0.05, sgn * (d2 / 2), 0, sgn, w * 0.3, 1.55, (d - d2) / 2 + eave * 0.55, roof, white);
        }
      } else {
        for (const sgn of [-1, 1]) {
          dormer(f, sgn * (w2 / 2), top + 0.05, 0, sgn, 0, d * 0.34, 1.45, (w - w2) / 2 + eave * 0.55, roof, white);
        }
      }
      y = top + rise - 0.35;
    } else {
      // верхняя крыша: скат вокруг и двускатная крыша с фронтонами
      const rw = w * 0.78;
      const rd = d * 0.6;
      frustum(f, ew + 0.2, ed + 0.2, top - 0.22, rw, rd, top + 1.25, roof, false);
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const lo = [sx * (ew / 2 + 0.1), top - 0.2, sz * (ed / 2 + 0.1)];
          beam(f, [sx * (rw / 2), top + 1.27, sz * (rd / 2)], lo, 0.34, 0.2, ridgeCol);
          beam(f, lo, [lo[0] + sx * 0.7, lo[1] + 0.5, lo[2] + sz * 0.7], 0.32, 0.2, ridgeCol);
        }
      }
      const gh = 2.3;
      addRoof(f, rw, rd, top + 1.2, gh, 0.45, roof);
      y = top + 1.2 + gh;
      return { ridgeY: y, ridgeHalf: rw / 2 + 0.45 };
    }
  }
  return { ridgeY: y, ridgeHalf: 1 };
}

// Золотая рыба-сятихоко на конце конька: sgn — на каком конце (−1 или +1).
function addShachi(f, x, y, sgn, gold) {
  addPart(f, boxGeo(0.55, 0.9, 0.42), makeTransform(x, y + 0.4, 0, 0, 1, 1, 1, 0, sgn * 0.25), gold);
  addPart(f, boxGeo(0.4, 0.95, 0.34), makeTransform(x - sgn * 0.22, y + 1.15, 0, 0, 1, 1, 1, 0, -sgn * 0.35), gold);
  addPart(f, boxGeo(0.7, 0.3, 0.12), makeTransform(x - sgn * 0.5, y + 1.7, 0, 0, 1, 1, 1, 0, -sgn * 0.9), gold);
}

function makeCastle() {
  const f = new MeshBuilder();
  const stone = rgb(0x8e8a84);
  const stoneDark = rgb(0x7b7771);
  const colors = {
    white: rgb(0xf7f3ea),
    roof: rgb(0x3d4f63),
    wood: rgb(0x2e2925),
    cream: rgb(0xe9e2d0),
  };
  const gold = rgb(0xe3b54a);
  // каменное основание: внизу пологое, кверху всё круче
  frustum(f, 25, 22.2, 0, 21.4, 18.6, 4, stoneDark, false);
  frustum(f, 21.4, 18.6, 4, 19.2, 16.4, 7.4, stone, false);
  frustum(f, 19.2, 16.4, 7.4, 18.3, 15.5, 9.6, stone, true);
  const top = castleTower(f, CASTLE_TIERS, 9.6, 1.75, colors);
  for (const sgn of [-1, 1]) {
    addShachi(f, sgn * (top.ridgeHalf - 0.15), top.ridgeY, sgn, gold);
  }
  // пристроенная малая башня сбоку (на своём основании пониже)
  const side = new MeshBuilder();
  frustum(side, 10.4, 10.4, 0, 8.2, 8.2, 4, stoneDark, false);
  frustum(side, 8.2, 8.2, 4, 7.4, 7.4, 7.2, stone, true);
  castleTower(
    side,
    [
      [6.6, 6.6, 3.2],
      [4.2, 4.2, 2.4],
    ],
    7.2,
    1.3,
    colors,
  );
  f.append(side, makeTransform(CASTLE_SIDE[0], 0, CASTLE_SIDE[1]));
  return f;
}

// Где стоит малая башня относительно главной (м, до поворота замка).
const CASTLE_SIDE = [12.2, 4.6];

function makeStall(f) {
  const t = new MeshBuilder();
  addPart(t, cylinderGeo(4.2, 4.2, 0, 2.6, 4), makeTransform(0, 0, 0, Math.PI / 4), rgb(0xfaf6ee));
  addPart(t, cylinderGeo(4.6, 0.1, 2.6, 5.2, 4), makeTransform(0, 0, 0, Math.PI / 4), f);
  addPart(t, boxGeo(0.1, 1.5, 0.1), makeTransform(0, 5.6, 0), [0.3, 0.3, 0.3]);
  addPart(t, boxGeo(0.9, 0.5, 0.03), makeTransform(0.45, 6.1, 0), f);
  return t;
}

function makeViewDeck(f = 14, t = 9) {
  const e = new MeshBuilder();
  const s = rgb(0x9a6a45);
  const o = rgb(0x5e3d2a);
  const i = rgb(0xd5402f);
  addPart(e, boxGeo(f, 0.4, t), makeTransform(0, 0.6, 0), s);
  for (const n of [-1, 1]) {
    for (const a of [-1, 1]) {
      addPart(e, boxGeo(0.4, 3, 0.4), makeTransform(n * (f / 2 - 0.3), -0.9, a * (t / 2 - 0.3)), o);
    }
  }
  addPart(e, boxGeo(f, 0.12, 0.12), makeTransform(0, 1.75, t / 2), i);
  addPart(e, boxGeo(f, 0.1, 0.1), makeTransform(0, 1.3, t / 2), i);
  for (const n of [-1, 1]) {
    addPart(e, boxGeo(0.12, 0.12, t), makeTransform((n * f) / 2, 1.75, 0), i);
    addPart(e, boxGeo(0.1, 0.1, t), makeTransform((n * f) / 2, 1.3, 0), i);
  }
  for (let n = 0; n <= 8; n++) {
    addPart(e, boxGeo(0.14, 1.2, 0.14), makeTransform(-f / 2 + (n * f) / 8, 1.3, t / 2), i);
  }
  addPart(
    e,
    cylinderGeo(0.08, 0.08, 0.8, 2, 6),
    makeTransform(1.5, 0, t / 2 - 0.8),
    [0.3, 0.32, 0.36],
  );
  addPart(
    e,
    boxGeo(0.5, 0.25, 0.6),
    makeTransform(1.5, 2.1, t / 2 - 0.8, 0, 1, 1, 1, 0.2),
    [0.2, 0.45, 0.6],
  );
  addPart(e, boxGeo(2.4, 0.12, 0.6), makeTransform(-2.5, 1.25, t / 2 - 1.5), s);
  for (const n of [-1, 1]) {
    addPart(e, boxGeo(0.12, 0.5, 0.5), makeTransform(-2.5 + n * 1, 1, t / 2 - 1.5), o);
  }
  return e;
}

export function buildStructures(f, t) {
  const e = f.r;
  const s = f.terrain;
  const o = f.roads;
  const i = f.colliders;
  const n = seededRandom(2024);
  const a = new StaticBatch(e, { maxDist: 1500 });
  const r = new StaticBatch(e, {
    maxDist: 450,
    shadow: false,
  });
  f.glowPoints = [];
  const c = (g, b) => s.heightAt(g, b);
  const u = (g, b, y) => {
    const k = o.nearest(g, b, y + 20);
    if (k && k.d < k.hw + y + 2) {
      return false;
    }
    for (const M of s.lakes) {
      if (lakeDistance(M, g, b) < 1.2) {
        return false;
      }
    }
    const w = s.riverQuery(g, b);
    return !(w && !w.inLake && w.d < s.river.hw + y + 3);
  };
  const h = (g, b) => {
    const y = o.nearest(g, b, 200);
    return y ? Math.atan2(y.px - g, y.pz - b) : n() * 6.28;
  };
  const l = (g, b, y, k, w) => {
    let M = Infinity;
    const _ = Math.cos(w);
    const z = Math.sin(w);
    for (const [T, S] of [
      [-y / 2, -k / 2],
      [y / 2, -k / 2],
      [y / 2, k / 2],
      [-y / 2, k / 2],
      [0, 0],
    ]) {
      M = Math.min(M, c(g + T * _ + S * z, b - T * z + S * _));
    }
    return M;
  };
  const m = [];
  for (const g of VILLAGES) {
    let b = 0;
    let y = 0;
    while (y < g.n && b < g.n * 30) {
      b++;
      const k = n() * Math.PI * 2;
      const w = Math.sqrt(n()) * g.r;
      const M = g.x + Math.cos(k) * w;
      const _ = g.z + Math.sin(k) * w;
      if (!u(M, _, 7) || m.some((P) => Math.hypot(P[0] - M, P[1] - _) < 15)) {
        continue;
      }
      const z = o.nearest(M, _, 60);
      if (!z || z.d > z.hw + 32) {
        continue;
      }
      const T = makeHouse(n, g.style);
      const S = h(M, _);
      const E = l(M, _, T.size[0], T.size[1], S) - 0.3;
      a.add(T, makeTransform(M, E, _, S), M, _, null, 0.15);
      i.addBox(M, _, T.size[0] - 1.6, T.size[1] - 2.2, S, E - 1, E + 8);
      m.push([M, _]);
      y++;
      if (n() < 0.6) {
        const P = M + Math.sin(S) * (T.size[1] / 2 + 1.5) + Math.cos(S) * 2;
        const F = _ + Math.cos(S) * (T.size[1] / 2 + 1.5) - Math.sin(S) * 2;
        r.add(makeLanternPost(), makeTransform(P, c(P, F), F, S), P, F, null, 0.2, 0);
        f.glowPoints.push([P, c(P, F) + 2.5, F, 1]);
      }
    }
    if (f.vegExclusions) {
      f.vegExclusions.push([g.x, g.z, g.r]);
    }
  }
  f.houseSpots = m;
  const p = LANDMARKS;
  {
    let { x: g, z: b } = p.pagoda;
    const y = l(g, b, 11, 11, 0) - 0.2;
    a.add(makePagoda(), makeTransform(g, y, b, 0.3), g, b, null, 0.2);
    i.addBox(g, b, 11, 11, 0.3, y - 1, y + 40);
    const k = h(g, b);
    for (let w = 1; w <= 6; w++) {
      const M = g + Math.sin(k) * (9 + w * 5.5);
      const _ = b + Math.cos(k) * (9 + w * 5.5);
      if (!u(M, _, 2)) {
        break;
      }
      a.add(makeTorii(0.75), makeTransform(M, c(M, _) - 0.1, _, k), M, _, null, 0.3);
      for (const z of [-1, 1]) {
        i.addCircle(M + Math.cos(k) * 1.65 * z, _ - Math.sin(k) * 1.65 * z, 0.35);
      }
    }
    for (const w of [-1, 1]) {
      const M = g + Math.cos(0.3) * 8 * w;
      const _ = b - Math.sin(0.3) * 8 * w;
      const z = makeStoneLantern();
      a.add(z, makeTransform(M, c(M, _), _), M, _, null, 0.1, 0);
      f.glowPoints.push([M, c(M, _) + 1.75, _, 1]);
      i.addCircle(M, _, 0.6);
    }
  }
  {
    let { x: g, z: b } = p.shrine;
    const y = h(g, b);
    const k = l(g, b, 14, 10, y) - 0.2;
    a.add(makeShrine(), makeTransform(g, k, b, y), g, b, null, 0.2);
    i.addBox(g, b, 14, 10, y, k - 1, k + 12);
    const w = g + Math.sin(y) * 16;
    const M = b + Math.cos(y) * 16;
    if (u(w, M, 3)) {
      a.add(makeTorii(1.1), makeTransform(w, c(w, M) - 0.1, M, y), w, M, null, 0.3);
      for (const _ of [-1, 1]) {
        i.addCircle(w + Math.cos(y) * 2.4 * _, M - Math.sin(y) * 2.4 * _, 0.4);
      }
    }
  }
  {
    let { x: g, z: b } = p.sakuraView;
    const y = l(g, b, 26, 26, 0) - 1.5;
    const yaw = 0.5;
    a.add(makeCastle(), makeTransform(g, y, b, yaw), g, b, null, 0.25);
    i.addCircle(g, b, 15, y - 2, y + 60);
    // малая башня сбоку — отдельное препятствие
    const sx = g + CASTLE_SIDE[0] * Math.cos(yaw) + CASTLE_SIDE[1] * Math.sin(yaw);
    const sz = b - CASTLE_SIDE[0] * Math.sin(yaw) + CASTLE_SIDE[1] * Math.cos(yaw);
    i.addCircle(sx, sz, 6.2, y - 2, y + 30);
  }
  {
    const g = s.lakes.find((_) => _.id === "mirror");
    const b = g.x + 40;
    const y = g.z - 10;
    a.add(makeTorii(1.6), makeTransform(b, g.level - 1.2, y, 2.6), b, y, null, 0.3);
    const k = s.lakes.find((_) => _.id === "fuji");
    const w = k.x + 30;
    const M = k.z + k.rz * 0.92;
    a.add(makeTorii(1.3), makeTransform(w, k.level - 0.6, M, Math.PI), w, M, null, 0.3);
  }
  const d = [
    {
      p: p.fujiView,
      face: Math.PI,
    },
    {
      p: p.summit,
      face: Math.PI,
    },
    {
      p: p.autumnView,
      face: null,
    },
  ];
  for (const g of d) {
    let { x: b, z: y } = g.p;
    const k = g.face !== null ? g.face : h(b, y) + Math.PI;
    const w = c(b, y);
    a.add(makeViewDeck(), makeTransform(b, w, y, k), b, y, null, 0.2);
    const M = Math.cos(k);
    const _ = Math.sin(k);
    const z = (F, L) => [b + F * M + L * _, y - F * _ + L * M];
    const T = z(-7, 4.5);
    const S = z(7, 4.5);
    const E = z(-7, -4.5);
    const P = z(7, -4.5);
    i.addSegment(T[0], T[1], S[0], S[1], w - 1, w + 4);
    i.addSegment(T[0], T[1], E[0], E[1], w - 1, w + 4);
    i.addSegment(S[0], S[1], P[0], P[1], w - 1, w + 4);
  }
  const x = buildFestival(f, a, r, n, t);
  const v = o.byId.lakeside;
  if (v) {
    for (let g = 10; g < v.n - 10; g += 18) {
      for (const b of [-1, 1]) {
        const y = v.hw + 3.2;
        const k = v.x[g] + v.tz[g] * y * b;
        const w = v.z[g] - v.tx[g] * y * b;
        if (u(k, w, 0.5)) {
          r.add(makeStoneLantern(), makeTransform(k, c(k, w), w), k, w, null, 0.1, 0);
          f.glowPoints.push([k, c(k, w) + 1.75, w, 1]);
          i.addCircle(k, w, 0.55);
        }
      }
    }
  }
  return [...a.build(), ...r.build(), ...x];
}

function buildFestival(f, t, e, s, o) {
  const i = f.terrain;
  const n = f.colliders;
  let { x: a, z: r } = LANDMARKS.festival;
  const c = [];
  const u = [0xff5c8a, 0xffa62b, 0x3db6ff, 0x9b5cff, 0x2ed3a0, 0xffd23f].map(rgb);
  for (let m = 0; m < 9; m++) {
    const p = (m / 9) * Math.PI * 2 + 0.3;
    const d = a + Math.cos(p) * 55;
    const x = r + Math.sin(p) * 42;
    const v = f.roads.nearest(d, x, 40);
    if (!(v && v.d < v.hw + 8)) {
      t.add(makeStall(u[m % u.length]), makeTransform(d, i.heightAt(d, x), x, p), d, x, null, 0.25);
      n.addCircle(d, x, 4.3);
    }
  }
  const h = [];
  for (let m = 0; m < 6; m++) {
    const p = (m / 6) * Math.PI * 2;
    const d = a + Math.cos(p) * 30;
    const x = r + Math.sin(p) * 24;
    const v = i.heightAt(d, x);
    t.add(cylinderGeo(0.18, 0.14, 0, 12, 8), makeTransform(d, v, x), d, x, [0.9, 0.9, 0.92], 0.5);
    h.push([d, v + 11.5, x]);
    n.addCircle(d, x, 0.3);
  }
  for (let m = 0; m < h.length; m++) {
    const p = h[m];
    const d = h[(m + 1) % h.length];
    const x = 14;
    for (let v = 0; v < x; v++) {
      const g = (v + 0.5) / x;
      const b = lerp(p[0], d[0], g);
      const y = lerp(p[2], d[2], g);
      const k = lerp(p[1], d[1], g) - Math.sin(g * Math.PI) * 2.2;
      const w = new MeshBuilder();
      const M = u[(v + m) % u.length];
      const _ = w.vertex(-0.35, 0, 0, 0, 0, 1, [1, 1, 1, 1]);
      const z = w.vertex(0.35, 0, 0, 0, 0, 1, [1, 1, 1, 1]);
      const T = w.vertex(0, -0.8, 0, 0, 0, 1, [1, 1, 1, 1]);
      w.tri(_, T, z);
      w.tri(_, z, T);
      e.add(
        w,
        makeTransform(b, k, y, Math.atan2(d[0] - p[0], d[2] - p[2]) + Math.PI / 2),
        b,
        y,
        M,
        0.2,
        0.1,
      );
    }
  }
  {
    const m = a - 10;
    const p = r + 8;
    const d = i.heightAt(m, p);
    t.add(boxGeo(16, 1.4, 9), makeTransform(m, d + 0.7, p), m, p, rgb(0x3b3f52), 0.3);
    t.add(boxGeo(16, 0.6, 9), makeTransform(m, d + 8.5, p), m, p, rgb(0xff5c8a), 0.3, 0.2);
    for (const x of [-1, 1]) {
      t.add(
        boxGeo(0.5, 8, 0.5),
        makeTransform(m + x * 7.7, d + 4.5, p + 4.2),
        m,
        p,
        [0.2, 0.2, 0.25],
        0.5,
      );
    }
    n.addBox(m, p, 16, 9, 0, d - 1, d + 3);
  }
  const l = f.roads.byId.ring;
  if (l) {
    const m = f.roads.indexAtDist(l, 12);
    const p = l.x[m];
    const d = l.z[m];
    const x = l.h[m];
    const v = Math.atan2(l.tx[m], l.tz[m]);
    const g = l.tz[m];
    const b = -l.tx[m];
    const y = l.hw + 2.5;
    for (const k of [-1, 1]) {
      const w = p + g * y * k;
      const M = d + b * y * k;
      t.add(boxGeo(1.6, 10, 1.6), makeTransform(w, x + 5, M, v), w, M, rgb(0x2b2f45), 0.4);
      t.add(boxGeo(1.8, 0.6, 1.8), makeTransform(w, x + 10.2, M, v), w, M, rgb(0xff5c8a), 0.4, 0.3);
      n.addCircle(w, M, 1, x - 1, x + 11);
    }
    t.add(boxGeo(y * 2 + 2, 2.6, 1), makeTransform(p, x + 9, d, v), p, d, rgb(0x2b2f45), 0.4);
    if (o) {
      c.push(...o.place(f, 0, p, x + 9, d, v, y * 2 - 0.5, 2.2, 0.52));
    }
  }
  return c;
}

export function buildWaterfall(f) {
  const t = f.r;
  const e = f.terrain;
  const s = e.river.samples[0];
  const o = e.river.samples[4];
  const i = s.h;
  let n = o.x - s.x;
  let a = o.z - s.z;
  const r = Math.hypot(n, a) || 1;
  n /= r;
  a /= r;
  const c = a;
  const u = -n;
  const h = new StaticBatch(t, { maxDist: 1600 });
  const l = seededRandom(55);
  const m = f.colliders;
  const p = 22;
  const d = s.x - n * 14;
  const x = s.z - a * 14;
  for (let E = 0; E < 22; E++) {
    const P = -1.3 + (E / 21) * 2.6;
    const F = 13 + l() * 4;
    const L = d + c * Math.sin(P) * F - n * Math.cos(P) * F * 0.55;
    const D = x + u * Math.sin(P) * F - a * Math.cos(P) * F * 0.55;
    const q = p * (0.75 + l() * 0.45) * (1 - Math.abs(P) * 0.18);
    const W = makeRock(1, 300 + E);
    const j = 5 + l() * 3;
    h.add(W, makeTransform(L, i - 3, D, l() * 6, j, q / 0.85, j), L, D, null, 0.05);
    m.addCircle(L, D, j * 0.8, i - 5, i + q);
  }
  for (let E = 0; E < 10; E++) {
    const P = E % 2 ? 1 : -1;
    const F = 4 + l() * 16;
    const L = s.x + c * P * (9 + l() * 4) + n * (F - 8);
    const D = s.z + u * P * (9 + l() * 4) + a * (F - 8);
    const q = 1.2 + l() * 2.2;
    h.add(
      makeRock(1, 400 + E),
      makeTransform(L, e.heightAt(L, D) - 0.4, D, l() * 6, q, q * 0.8, q),
      L,
      D,
      null,
      0.05,
    );
  }
  const v = new MeshBuilder();
  const g = 14;
  const b = 5.5;
  const y = rgb(0x8fd0e6);
  const k = [];
  for (let E = 0; E <= g; E++) {
    const P = E / g;
    const F = i + p - P * (p + 0.5);
    const L = 2.5 + Math.sin(P * Math.PI * 0.5) * 4;
    const D = d + n * L;
    const q = x + a * L;
    const W = [];
    for (let j = 0; j <= 4; j++) {
      const Y = j / 4 - 0.5;
      const tt = Math.cos(Y * Math.PI) * 0.8;
      W.push(
        v.vertex(
          D + c * Y * b * 2 + n * tt,
          F,
          q + u * Y * b * 2 + a * tt,
          n,
          0.2,
          a,
          [y[0], y[1], y[2], 0],
          [1, 0.25 + P * 0.6, (1 - P) * 26, Y * 2],
        ),
      );
    }
    k.push(W);
  }
  for (let E = 0; E < g; E++) {
    for (let P = 0; P < 4; P++) {
      v.quad(k[E][P], k[E + 1][P], k[E + 1][P + 1], k[E][P + 1]);
    }
  }
  const w = [];
  for (let E = 0; E <= 3; E++) {
    const P = d - n * (6 - E * 2.8);
    const F = x - a * (6 - E * 2.8);
    const L = [];
    for (let D = 0; D <= 4; D++) {
      const q = D / 4 - 0.5;
      L.push(
        v.vertex(
          P + c * q * b * 2,
          i + p + 0.2,
          F + u * q * b * 2,
          0,
          1,
          0,
          [y[0], y[1], y[2], 0],
          [1, 0.2, 40 - E * 3, q * 2],
        ),
      );
    }
    w.push(L);
  }
  for (let E = 0; E < 3; E++) {
    for (let P = 0; P < 4; P++) {
      v.quad(w[E][P], w[E][P + 1], w[E + 1][P + 1], w[E + 1][P]);
    }
  }
  const M = [];
  const _ = [d + n * 7, x + a * 7];
  const z = v.vertex(_[0], i + 0.05, _[1], 0, 1, 0, [0.25, 0.55, 0.65, 0], [0, 0.9, 0, 0]);
  for (let E = 0; E <= 24; E++) {
    const P = (E / 24) * Math.PI * 2;
    M.push(
      v.vertex(
        _[0] + Math.cos(P) * 9,
        i + 0.05,
        _[1] + Math.sin(P) * 7,
        0,
        1,
        0,
        [0.25, 0.55, 0.65, 0],
        [0, 0.85, 0, 0],
      ),
    );
  }
  for (let E = 0; E < 24; E++) {
    v.tri(z, M[E + 1], M[E]);
  }
  const T = v.bounds();
  const S = h.build();
  S.push(
    t.add({
      mesh: t.createMesh(v),
      prog: "water",
      cull: "none",
      bounds: {
        c: T.center,
        r: T.radius,
      },
      uniforms: { u_useRefl: 0 },
      reflect: false,
      maxDist: 1600,
    }),
  );
  f.waterfallPos = [_[0], i, _[1]];
  return S;
}
