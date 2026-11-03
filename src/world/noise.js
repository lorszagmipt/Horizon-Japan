// Шум (simplex noise) — основа процедурной генерации: из него получаются холмы, пятна цвета, распределение леса.

import { seededRandom } from "../core/random.js";

const permRandom = seededRandom(1337);

const PERM = new Uint8Array(512);

const PERM_BASE = new Uint8Array(256);

for (let f = 0; f < 256; f++) {
  PERM_BASE[f] = f;
}

for (let f = 255; f > 0; f--) {
  const t = Math.floor(permRandom() * (f + 1));
  [PERM_BASE[f], PERM_BASE[t]] = [PERM_BASE[t], PERM_BASE[f]];
}

for (let f = 0; f < 512; f++) {
  PERM[f] = PERM_BASE[f & 255];
}

const GRAD2 = [
  [1, 1],
  [-1, 1],
  [1, -1],
  [-1, -1],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

const SKEW_F2 = 0.5 * (Math.sqrt(3) - 1);

const UNSKEW_G2 = (3 - Math.sqrt(3)) / 6;

export function simplex2(x, y) {
  const e = (x + y) * SKEW_F2;
  const s = Math.floor(x + e);
  const o = Math.floor(y + e);
  const i = (s + o) * UNSKEW_G2;
  const n = x - (s - i);
  const a = y - (o - i);
  const r = n > a ? 1 : 0;
  const c = n > a ? 0 : 1;
  const u = n - r + UNSKEW_G2;
  const h = a - c + UNSKEW_G2;
  const l = n - 1 + 2 * UNSKEW_G2;
  const m = a - 1 + 2 * UNSKEW_G2;
  const p = s & 255;
  const d = o & 255;
  let total = 0;
  let v = 0.5 - n * n - a * a;
  if (v > 0) {
    const y = GRAD2[PERM[p + PERM[d]] & 7];
    v *= v;
    total += v * v * (y[0] * n + y[1] * a);
  }
  let g = 0.5 - u * u - h * h;
  if (g > 0) {
    const y = GRAD2[PERM[p + r + PERM[d + c]] & 7];
    g *= g;
    total += g * g * (y[0] * u + y[1] * h);
  }
  let b = 0.5 - l * l - m * m;
  if (b > 0) {
    const y = GRAD2[PERM[p + 1 + PERM[d + 1]] & 7];
    b *= b;
    total += b * b * (y[0] * l + y[1] * m);
  }
  return 70 * total;
}

export function fbm2(x, y, octaves = 4, lacunarity = 2.03, gain = 0.5) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let k = 0; k < octaves; k++) {
    sum += amp * simplex2(x * freq + k * 17.1, y * freq - k * 9.3);
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

export function ridged2(x, y, octaves = 4) {
  let amp = 1;
  let freq = 1;
  let sum = 0;
  let norm = 0;
  for (let k = 0; k < octaves; k++) {
    const v = 1 - Math.abs(simplex2(x * freq + k * 31.7, y * freq + k * 5.1));
    sum += amp * v * v;
    norm += amp;
    amp *= 0.5;
    freq *= 2.1;
  }
  return sum / norm;
}
