// ЖИЗНЬ В ДЕРЕВНЯХ: столбы с проводами вдоль дороги, торговые автоматы, амбары, грядки, поленницы,
// дорожки из камней и чайные плантации на лугах вокруг.
// Всё это ставится ПОСЛЕ леса и только на свободные места, поэтому деревья и дома остаются где были.

import { rgb } from "../core/math.js";
import { seededRandom } from "../core/random.js";
import { VILLAGES } from "./mapData.js";
import { MeshBuilder, boxGeo, cylinderGeo, makeTransform } from "../render/mesh.js";
import { lakeDistance } from "./terrain.js";
import { StaticBatch } from "./batch.js";
import { beam, face } from "./shapes.js";
import { addRoof } from "./buildings.js";

// Настройки — можно менять на ходу.
export const VILLAGE = {
  poleEvery: 30, // столб каждые столько метров дороги
  poleSide: 4.6, // на каком расстоянии от края асфальта стоит столб, м (ближе — мешает срезать повороты)
  poleHeight: 8.2,
  vendingChance: 0.4, // у какой доли домов стоит торговый автомат
  kuraChance: 0.45, // …амбар
  gardenChance: 0.7, // …грядки
  teaFieldsPer100m: 5, // сколько чайных полей на деревню радиусом 100 м
  teaRows: 11, // рядов в поле
  teaRowGap: 1.9, // расстояние между рядами, м
  teaRowLength: 33, // длина ряда, м
};

const C = {
  concrete: rgb(0x9b9a94),
  metal: rgb(0x6f7378),
  wire: [0.1, 0.1, 0.12],
  plaster: rgb(0xf4f1e8),
  darkWood: rgb(0x3a3632),
  wood: rgb(0x8a6a48),
  woodLight: rgb(0xc9a877),
  soil: rgb(0x5b4332),
  stone: rgb(0x9a9690),
  roof: rgb(0x3d4653),
};
const VENDING_COLORS = [rgb(0xf2f2ee), rgb(0xd8362f), rgb(0x2f6fd8)];
const LEAF_COLORS = [rgb(0x6fae3f), rgb(0x8cc152), rgb(0x4f9a4a)];
const TEA_COLORS = [rgb(0x3f7d3a), rgb(0x4a8a3f), rgb(0x56963f)];

function part(mb, geo, transform, color) {
  mb.append(geo, transform, color, "set");
}

function makePole(h, withTransformer) {
  const mb = new MeshBuilder();
  part(mb, cylinderGeo(0.17, 0.12, -0.6, h, 8), null, C.concrete);
  part(mb, boxGeo(2.2, 0.12, 0.12), makeTransform(0, h - 0.6, 0), C.metal);
  part(mb, boxGeo(1.4, 0.1, 0.1), makeTransform(0, h - 1.4, 0), C.metal);
  for (const x of [-0.9, 0, 0.9]) {
    part(mb, cylinderGeo(0.06, 0.05, h - 0.54, h - 0.3, 6), makeTransform(x, 0, 0), [0.92, 0.92, 0.9]);
  }
  if (withTransformer) {
    part(mb, cylinderGeo(0.3, 0.3, h - 2.7, h - 1.8, 10), makeTransform(0.44, 0, 0), C.metal);
    part(mb, boxGeo(0.5, 0.08, 0.08), makeTransform(0.22, h - 2.2, 0), C.metal);
  }
  return mb;
}

function makeVending(color) {
  const body = new MeshBuilder();
  part(body, boxGeo(1.05, 1.85, 0.8), makeTransform(0, 0.975, 0), color);
  part(body, boxGeo(1.09, 0.12, 0.84), makeTransform(0, 0.06, 0), [0.15, 0.15, 0.17]);
  part(body, boxGeo(0.7, 0.16, 0.05), makeTransform(0, 0.42, 0.41), [0.12, 0.12, 0.14]);
  // светящаяся витрина с рядами банок
  const glow = new MeshBuilder();
  part(glow, boxGeo(0.88, 0.95, 0.04), makeTransform(0, 1.22, 0.41), [0.86, 0.95, 1]);
  const cans = [rgb(0xff5c5c), rgb(0xffc93d), rgb(0x4fd18b), rgb(0x4fa8ff), rgb(0xff8a3d)];
  for (let row = 0; row < 3; row++) {
    for (let k = 0; k < 5; k++) {
      part(
        glow,
        boxGeo(0.1, 0.17, 0.03),
        makeTransform(-0.32 + k * 0.16, 0.95 + row * 0.27, 0.44),
        cans[(k + row * 2) % cans.length],
      );
    }
  }
  return { body, glow };
}

// Амбар-кура: белёные стены, тёмный низ, двускатная крыша.
function makeKura() {
  const mb = new MeshBuilder();
  const w = 4.6;
  const d = 3.4;
  const h = 3.3;
  part(mb, boxGeo(w + 0.3, 0.4, d + 0.3), makeTransform(0, 0.2, 0), C.stone);
  part(mb, boxGeo(w, h, d), makeTransform(0, 0.4 + h / 2, 0), C.plaster);
  part(mb, boxGeo(w + 0.08, 1.1, d + 0.08), makeTransform(0, 0.95, 0), C.darkWood);
  part(mb, boxGeo(1.1, 1.9, 0.12), makeTransform(0, 1.35, d / 2 + 0.04), [0.2, 0.17, 0.15]);
  part(mb, boxGeo(1.4, 0.14, 0.2), makeTransform(0, 2.4, d / 2 + 0.06), C.darkWood);
  part(mb, boxGeo(0.6, 0.5, 0.1), makeTransform(0, 3.1, d / 2 + 0.03), [0.16, 0.15, 0.15]);
  addRoof(mb, w, d, 0.4 + h, 1.5, 0.55, C.roof);
  mb.size = [w, d];
  return mb;
}

function makeWoodStack() {
  const mb = new MeshBuilder();
  part(mb, boxGeo(2.3, 1.0, 0.55), makeTransform(0, 0.5, 0), C.wood);
  for (let k = 0; k < 6; k++) {
    for (let r = 0; r < 3; r++) {
      part(
        mb,
        cylinderGeo(0.13, 0.13, 0, 0.02, 6),
        makeTransform(-0.95 + k * 0.38 + (r % 2) * 0.12, 0.2 + r * 0.3, 0.28, 0, 1, 1, 1, Math.PI / 2),
        C.woodLight,
      );
    }
  }
  part(mb, boxGeo(2.6, 0.06, 0.9), makeTransform(0, 1.12, 0.05, 0, 1, 1, 1, 0.18), C.darkWood);
  return mb;
}

// Ряд чайных кустов между двумя точками на земле: шестигранная «колбаса» со скруглённым верхом.
function teaSegment(mb, a, b, col, capA, capB) {
  let ux = b[0] - a[0];
  let uz = b[2] - a[2];
  const l = Math.hypot(ux, uz) || 1;
  ux /= l;
  uz /= l;
  const sx = uz;
  const sz = -ux;
  const prof = [
    [-0.64, -0.25],
    [-0.64, 0.42],
    [-0.3, 0.8],
    [0.3, 0.8],
    [0.64, 0.42],
    [0.64, -0.25],
  ];
  const ring = (p) => prof.map(([s, y]) => [p[0] + sx * s, p[1] + y, p[2] + sz * s]);
  const A = ring(a);
  const B = ring(b);
  const top = [col[0] * 1.12, col[1] * 1.12, col[2] * 1.1];
  for (let k = 0; k < 5; k++) {
    const mid = (prof[k][0] + prof[k + 1][0]) / 2;
    const up = k === 2 ? 1 : k === 1 || k === 3 ? 0.6 : 0;
    face(mb, [A[k], A[k + 1], B[k + 1], B[k]], [sx * mid, up, sz * mid], k === 2 ? top : col);
  }
  if (capA) {
    face(mb, [A[0], A[1], A[4], A[5]], [-ux, 0, -uz], col);
    face(mb, [A[1], A[2], A[3], A[4]], [-ux, 0, -uz], col);
  }
  if (capB) {
    face(mb, [B[0], B[1], B[4], B[5]], [ux, 0, uz], col);
    face(mb, [B[1], B[2], B[3], B[4]], [ux, 0, uz], col);
  }
}

export function buildVillageExtras(world) {
  const r = world.r;
  const terrain = world.terrain;
  const roads = world.roads;
  const colliders = world.colliders;
  const houses = world.houseSpots || [];
  const solid = new StaticBatch(r, { maxDist: 700 }); // крупное: столбы, амбары, автоматы
  const small = new StaticBatch(r, { maxDist: 300, shadow: false }); // мелочь: провода, грядки, камни
  const fields = new StaticBatch(r, { maxDist: 650, shadow: false }); // чайные поля
  const H = (x, z) => terrain.heightAt(x, z);
  const tmp = [];
  const dry = (x, z) => {
    for (const lake of terrain.lakes) {
      if (lakeDistance(lake, x, z) < 1.2) {
        return false;
      }
    }
    const rv = terrain.riverQuery(x, z);
    return !(rv && !rv.inLake && rv.d < terrain.river.hw + 3);
  };
  // свободно ли место: нет препятствий (деревья, дома), не дорога и не вода
  const free = (x, z, radius, roadGap = 1.5) =>
    colliders.resolveCircle(x, z, radius, H(x, z) + 1, tmp).length === 0 &&
    roads.edgeDist(x, z) > radius + roadGap &&
    dry(x, z);
  const taken = []; // занятые круги: [x, z, r] — чтобы поля не лезли во дворы
  const isTaken = (x, z, pad = 0) => taken.some((t) => (x - t[0]) ** 2 + (z - t[1]) ** 2 < (t[2] + pad) ** 2);

  // ---------- ДВОРЫ ----------
  houses.forEach((hs, index) => {
    const [hx, hz, yaw, sizeX, sizeZ, ground] = hs;
    const rnd = seededRandom(4100 + index * 17);
    const w = sizeX - 2; // ширина дома
    const d = sizeZ - 2.5; // глубина дома
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const loc = (lx, lz) => [hx + lx * cos + lz * sin, hz - lx * sin + lz * cos];
    taken.push([hx, hz, Math.hypot(w, d) / 2 + 3]);
    const sideSign = rnd() < 0.5 ? -1 : 1;

    // торговый автомат у переднего угла, лицом к дороге
    if (rnd() < VILLAGE.vendingChance) {
      const [x, z] = loc(sideSign * (w / 2 + 1.0), d / 2 + 0.2);
      if (free(x, z, 0.7, 0.8)) {
        const y = H(x, z) - 0.05;
        const v = makeVending(VENDING_COLORS[Math.floor(rnd() * VENDING_COLORS.length)]);
        const t = makeTransform(x, y, z, yaw);
        solid.add(v.body, t, x, z, null, 0.45);
        solid.add(v.glow, t, x, z, null, 0.3, 0.85);
        colliders.addCircle(x, z, 0.6, y - 1, y + 2);
      }
    }
    // амбар сбоку-сзади
    if (rnd() < VILLAGE.kuraChance) {
      const [x, z] = loc(-sideSign * (w / 2 + 4.2), -d * 0.15);
      if (free(x, z, 3.4, 3)) {
        const kura = makeKura();
        let low = Infinity;
        for (const [ax, az] of [
          [-2.4, -1.8],
          [2.4, -1.8],
          [2.4, 1.8],
          [-2.4, 1.8],
          [0, 0],
        ]) {
          low = Math.min(low, H(x + ax * cos + az * sin, z - ax * sin + az * cos));
        }
        const y = low - 0.25;
        solid.add(kura, makeTransform(x, y, z, yaw), x, z, null, 0.12);
        colliders.addBox(x, z, kura.size[0], kura.size[1], yaw, y - 1, y + 6);
        taken.push([x, z, 4.5]);
      }
    }
    // поленница у боковой стены
    if (rnd() < 0.55) {
      const [x, z] = loc(sideSign * (w / 2 + 0.55), -d * 0.12);
      if (roads.edgeDist(x, z) > 3 && dry(x, z)) {
        small.add(makeWoodStack(), makeTransform(x, H(x, z) - 0.05, z, yaw + (sideSign * Math.PI) / 2), x, z, null, 0.1);
      }
    }
    // грядки за домом
    if (rnd() < VILLAGE.gardenChance) {
      const rows = 4 + Math.floor(rnd() * 3);
      const len = 5 + rnd() * 3;
      const gx = (rnd() - 0.5) * 3;
      const gz = -(d / 2 + 2.2 + (rows * 1.05) / 2);
      const [cx, cz] = loc(gx, gz);
      if (free(cx, cz, Math.max(len, rows) / 2 + 0.5, 2) && terrain.normalAt(cx, cz)[1] > 0.9) {
        const mb = new MeshBuilder();
        for (let row = 0; row < rows; row++) {
          const lz = gz + (row - (rows - 1) / 2) * 1.05;
          const leaf = LEAF_COLORS[(row + index) % LEAF_COLORS.length];
          const tall = (row + index) % 3 === 0;
          const pts = [];
          for (let k = 0; k <= 2; k++) {
            const [x, z] = loc(gx - len / 2 + (len * k) / 2, lz);
            pts.push([x, H(x, z) - 0.04, z]);
          }
          beam(mb, pts[0], pts[1], 0.6, 0.2, C.soil);
          beam(mb, pts[1], pts[2], 0.6, 0.2, C.soil);
          const n = Math.floor(len / 0.75);
          for (let k = 0; k < n; k++) {
            const [x, z] = loc(gx - len / 2 + 0.4 + k * 0.75, lz);
            const s = 0.3 + ((k * 7 + row * 3) % 5) * 0.03;
            part(
              mb,
              boxGeo(s, tall ? 0.5 : 0.26, s),
              makeTransform(x, H(x, z) + (tall ? 0.36 : 0.26), z, yaw + k * 0.7),
              leaf,
            );
          }
        }
        small.add(mb, null, cx, cz, null, 0.05);
        taken.push([cx, cz, Math.max(len, rows) / 2 + 1.5]);
      }
    }
    // дорожка из плоских камней от веранды к дороге
    {
      const mb = new MeshBuilder();
      let count = 0;
      for (let k = 0; k < 9; k++) {
        const [x, z] = loc(((k % 2) - 0.5) * 0.35, d / 2 + 1.9 + k * 1.05);
        if (roads.edgeDist(x, z) < 1.2 || !dry(x, z)) {
          break;
        }
        part(mb, cylinderGeo(0.4, 0.36, 0, 0.09, 6), makeTransform(x, H(x, z) - 0.01, z, k * 1.3), C.stone);
        count++;
      }
      if (count) {
        small.add(mb, null, hx, hz, null, 0.1);
      }
    }
  });

  // ---------- СТОЛБЫ С ПРОВОДАМИ ----------
  const inVillage = (x, z, pad) => VILLAGES.find((v) => (x - v.x) ** 2 + (z - v.z) ** 2 < (v.r + pad) ** 2);
  let poleCount = 0;
  roads.roads.forEach((road, roadIndex) => {
    const side = roadIndex % 2 ? -1 : 1;
    const off = road.hw + VILLAGE.poleSide;
    let lastDist = -1e9;
    let prev = null;
    for (let i = 3; i < road.n - 3; i++) {
      const x = road.x[i];
      const z = road.z[i];
      if (!inVillage(x, z, 20)) {
        prev = null;
        continue;
      }
      if (road.dist[i] - lastDist < VILLAGE.poleEvery) {
        continue;
      }
      if (road.flags[i] & 3) {
        continue; // на мосту и в тоннеле столбов нет
      }
      const px = x + road.tz[i] * off * side;
      const pz = z - road.tx[i] * off * side;
      // рядом другая дорога (перекрёсток) или что-то уже стоит — пропускаем это место
      if (roads.edgeDist(px, pz) < VILLAGE.poleSide - 1 || !dry(px, pz)) {
        continue;
      }
      const y = H(px, pz);
      if (colliders.resolveCircle(px, pz, 0.5, y + 1, tmp).length > 0) {
        continue;
      }
      const yaw = Math.atan2(road.tx[i], road.tz[i]);
      const h = VILLAGE.poleHeight;
      solid.add(makePole(h, poleCount % 3 === 1), makeTransform(px, y, pz, yaw), px, pz, null, 0.15);
      colliders.addCircle(px, pz, 0.22, y - 1, y + h);
      // фонарь на каждом втором столбе — светит на дорогу
      if (poleCount % 2 === 0) {
        const arm = new MeshBuilder();
        part(arm, boxGeo(2.4, 0.07, 0.07), makeTransform(-side * 1.2, h - 2.3, 0), C.metal);
        solid.add(arm, makeTransform(px, y, pz, yaw), px, pz, null, 0.2);
        const lamp = new MeshBuilder();
        part(lamp, boxGeo(0.55, 0.1, 0.24), makeTransform(-side * 2.3, h - 2.38, 0), [1, 0.93, 0.75]);
        solid.add(lamp, makeTransform(px, y, pz, yaw), px, pz, null, 0.2, 0.9);
      }
      const cur = { x: px, y: y + h - 0.3, z: pz, nx: road.tz[i], nz: -road.tx[i] };
      if (prev && Math.hypot(px - prev.x, pz - prev.z) < VILLAGE.poleEvery * 1.7) {
        // три провода с провисом
        const mb = new MeshBuilder();
        for (const o of [-0.9, 0, 0.9]) {
          const a = [prev.x + prev.nx * o, prev.y, prev.z + prev.nz * o];
          const b = [cur.x + cur.nx * o, cur.y, cur.z + cur.nz * o];
          const N = 5;
          let p = a;
          for (let k = 1; k <= N; k++) {
            const t = k / N;
            const q = [
              a[0] + (b[0] - a[0]) * t,
              a[1] + (b[1] - a[1]) * t - Math.sin(t * Math.PI) * 0.8,
              a[2] + (b[2] - a[2]) * t,
            ];
            beam(mb, p, q, 0.035, 0.035, C.wire);
            p = q;
          }
        }
        small.add(mb, null, (px + prev.x) / 2, (pz + prev.z) / 2, null, 0.1);
      }
      prev = cur;
      lastDist = road.dist[i];
      poleCount++;
    }
  });

  // ---------- ЧАЙНЫЕ ПОЛЯ ----------
  let segCount = 0;
  const fieldSpots = [];
  VILLAGES.forEach((v, vi) => {
    if (v.style === "high") {
      return; // в горной деревне чай не растёт
    }
    const rnd = seededRandom(7300 + vi * 31);
    const want = Math.round((VILLAGE.teaFieldsPer100m * v.r) / 100);
    const placed = [];
    const rowLen = VILLAGE.teaRowLength;
    const depth = (VILLAGE.teaRows - 1) * VILLAGE.teaRowGap;
    const fieldR = Math.hypot(rowLen, depth) / 2;
    for (let attempt = 0; attempt < want * 40 && placed.length < want; attempt++) {
      const ang = rnd() * Math.PI * 2;
      const dist = Math.sqrt(rnd()) * v.r;
      const cx = v.x + Math.cos(ang) * dist;
      const cz = v.z + Math.sin(ang) * dist;
      const turn = (rnd() - 0.5) * 0.3;
      if (roads.edgeDist(cx, cz) < 9 || !dry(cx, cz) || isTaken(cx, cz, 8)) {
        continue;
      }
      if (placed.some((p) => Math.hypot(p[0] - cx, p[1] - cz) < fieldR * 2 + 3)) {
        continue;
      }
      const nrm = terrain.normalAt(cx, cz);
      if (nrm[1] < 0.9) {
        continue;
      }
      // ряды идут поперёк склона (вдоль линий одной высоты)
      let ux = -nrm[2];
      let uz = nrm[0];
      const ul = Math.hypot(ux, uz);
      if (ul < 0.03) {
        ux = Math.cos(ang + 1.57);
        uz = Math.sin(ang + 1.57);
      } else {
        ux /= ul;
        uz /= ul;
      }
      const ct = Math.cos(turn);
      const st = Math.sin(turn);
      [ux, uz] = [ux * ct - uz * st, ux * st + uz * ct];
      const sx = uz;
      const sz = -ux;
      const segLen = 3;
      const nSeg = Math.round(rowLen / segLen);
      const mb = new MeshBuilder();
      let made = 0;
      for (let row = 0; row < VILLAGE.teaRows; row++) {
        const ro = (row - (VILLAGE.teaRows - 1) / 2) * VILLAGE.teaRowGap;
        const col = TEA_COLORS[(row + vi) % TEA_COLORS.length];
        const ok = [];
        const pts = [];
        for (let k = 0; k <= nSeg; k++) {
          const lo = (k - nSeg / 2) * segLen;
          const x = cx + ux * lo + sx * ro;
          const z = cz + uz * lo + sz * ro;
          pts.push([x, H(x, z), z]);
        }
        for (let k = 0; k < nSeg; k++) {
          const mx = (pts[k][0] + pts[k + 1][0]) / 2;
          const mz = (pts[k][2] + pts[k + 1][2]) / 2;
          ok.push(
            roads.edgeDist(mx, mz) > 4.5 &&
              !isTaken(mx, mz, 1.5) &&
              dry(mx, mz) &&
              Math.abs(pts[k][1] - pts[k + 1][1]) < 0.9 &&
              colliders.resolveCircle(mx, mz, 1.6, pts[k][1] + 1, tmp).length === 0,
          );
        }
        for (let k = 0; k < nSeg; k++) {
          if (ok[k]) {
            teaSegment(mb, pts[k], pts[k + 1], col, k === 0 || !ok[k - 1], k === nSeg - 1 || !ok[k + 1]);
            made++;
          }
        }
      }
      if (made > nSeg * 3) {
        fields.add(mb, null, cx, cz, null, 0.08);
        placed.push([cx, cz]);
        fieldSpots.push([Math.round(cx), Math.round(cz)]);
        taken.push([cx, cz, fieldR]);
        segCount += made;
      }
    }
  });
  world.villageStats = { poles: poleCount, teaSegments: segCount, fields: fieldSpots }; // для проверки
  return [...solid.build(), ...small.build(), ...fields.build()];
}
