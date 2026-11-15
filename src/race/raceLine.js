// ГОНОЧНАЯ ТРАЕКТОРИЯ для ботов. Из маршрута заезда (ось дороги) строится линия, по которой едет гонщик:
// перед поворотом — к внешнему краю, в повороте — к внутреннему, на выходе — снова наружу.
// По кривизне этой линии считается, с какой скоростью можно пройти каждую точку и где пора тормозить.

import { clamp } from "../core/math.js";

// Запас от края асфальта до середины машины, м.
const EDGE_MARGIN = 1.6;

// Сцепление покрытия (как в физике машины).
const SURFACE_GRIP = { road: 1, gravel: 0.8, grass: 0.76 };

// path — маршрут заезда (raceManager.buildPath). Результат запоминается в path.line.
export function buildRaceLine(path, isCircuit, world) {
  if (path.line) {
    return path.line;
  }
  const n = path.n;
  const off = new Float32Array(n); // сдвиг от оси дороги, м (плюс — вправо по ходу)
  const lim = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    lim[i] = Math.max(0, path.hw[i] - EDGE_MARGIN);
  }
  const at = (i) => (isCircuit ? ((i % n) + n) % n : clamp(i, 0, n - 1));
  // «Натягиваем резинку»: каждая точка тянется к середине между соседями, но не дальше края дороги.
  // Сначала соседи далёкие (общая форма), потом ближние (плавность).
  for (const m of [28, 14, 7, 4, 2, 1]) {
    const iters = m > 4 ? 26 : 36;
    for (let it = 0; it < iters; it++) {
      for (let i = 0; i < n; i++) {
        const a = at(i - m);
        const b = at(i + m);
        const mx = (path.x[a] + path.tz[a] * off[a] + path.x[b] + path.tz[b] * off[b]) / 2;
        const mz = (path.z[a] - path.tx[a] * off[a] + path.z[b] - path.tx[b] * off[b]) / 2;
        const want = (mx - path.x[i]) * path.tz[i] - (mz - path.z[i]) * path.tx[i];
        off[i] += (clamp(want, -lim[i], lim[i]) - off[i]) * 0.5;
      }
    }
  }
  // Кривизна линии (1/м): плюс — поворот вправо. Считаем по точкам через 6 м и слегка сглаживаем.
  const raw = new Float32Array(n);
  const K = 3;
  const px = (i) => path.x[i] + path.tz[i] * off[i];
  const pz = (i) => path.z[i] - path.tx[i] * off[i];
  for (let i = 0; i < n; i++) {
    const a = at(i - K);
    const b = at(i + K);
    const ax = px(i) - px(a);
    const az = pz(i) - pz(a);
    const bx = px(b) - px(i);
    const bz = pz(b) - pz(i);
    const la = Math.hypot(ax, az);
    const lb = Math.hypot(bx, bz);
    const lc = Math.hypot(ax + bx, az + bz);
    raw[i] = la > 0.1 && lb > 0.1 && lc > 0.1 ? (-2 * (ax * bz - az * bx)) / (la * lb * lc) : 0;
  }
  const kappa = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    kappa[i] = (raw[at(i - 2)] + 2 * raw[at(i - 1)] + 3 * raw[i] + 2 * raw[at(i + 1)] + raw[at(i + 2)]) / 9;
  }
  // Покрытие в каждой точке (на гравии и траве держит хуже).
  const surf = new Float32Array(n).fill(1);
  if (world) {
    const g = {};
    for (let i = 0; i < n; i += 4) {
      const s = SURFACE_GRIP[world.groundAt(px(i), pz(i), g).surface] || 1;
      for (let k = i; k < Math.min(n, i + 4); k++) {
        surf[k] = s;
      }
    }
  }
  path.line = { off, kappa, lim, surf };
  return path.line;
}

// Скорость в каждой точке линии для машины с боковым ускорением aLat и торможением aBrake (м/с²).
export function speedProfile(path, line, isCircuit, aLat, aBrake, vmax) {
  const n = path.n;
  const v = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    v[i] = Math.min(vmax, Math.sqrt((aLat * line.surf[i]) / Math.max(Math.abs(line.kappa[i]), 1e-5)));
  }
  // Идём назад: скорость в точке не больше той, с которой успеваем затормозить к следующей.
  // В повороте часть сцепления занята поворотом — тормозить получается слабее.
  const passes = isCircuit ? 2 : 1;
  for (let p = 0; p < passes; p++) {
    for (let i = n - 2; i >= (isCircuit ? -1 : 0); i--) {
      const a = (i + n) % n;
      const b = (a + 1) % n;
      const ds = Math.max(0.5, Math.abs(path.d[b] - path.d[a]) > 50 ? 2 : path.d[b] - path.d[a]);
      const used = Math.min(1, (v[b] * v[b] * Math.abs(line.kappa[b])) / (aLat * line.surf[b]));
      const ab = aBrake * line.surf[b] * Math.sqrt(Math.max(0.2, 1 - used * used));
      const lim = Math.sqrt(v[b] * v[b] + 2 * ab * ds);
      if (v[a] > lim) {
        v[a] = lim;
      }
    }
  }
  return v;
}
