// Биомы: где сакура, где осенние клёны, где нагорье Фудзи, и насколько густой лес. Веса биомов заранее «запекаются» в сетку для скорости.

import { smoothstep } from "../core/math.js";
import { fbm2, simplex2 } from "./noise.js";

export function biomeRaw(x, z) {
  const wx = x + fbm2(x * 0.0011, z * 0.0011, 2) * 170;
  const wz = z + fbm2(x * 0.0011 + 9.2, z * 0.0011 - 4.1, 2) * 170;
  const dSakura = Math.hypot(wx + 760, wz - 660);
  const dAutumn = Math.hypot(wx - 820, wz - 230);
  let sakura = 1 - smoothstep(150, 1050, dSakura);
  let autumn = 1 - smoothstep(150, 1000, dAutumn);
  const high = smoothstep(-280, -800, wz);
  sakura *= 1 - high;
  autumn *= 1 - high;
  return [sakura * sakura * (3 - 2 * sakura), autumn * autumn * (3 - 2 * autumn), high];
}

function biomeWeights(x, z) {
  const [s, a, h] = biomeRaw(x, z);
  const sum = Math.max(1, s + a + h + 0.18);
  return [s / sum, a / sum, h / sum];
}

function forestDensityRaw(x, z) {
  return smoothstep(-0.22, 0.22, fbm2(x / 300, z / 300, 3) + 0.08 * simplex2(x / 60, z / 60));
}

const BIOME_GRID = {
  step: 10,
  half: 2100,
  n: 0,
  s: null,
  a: null,
  h: null,
  f: null,
};

export function bakeBiomeGrid() {
  const f = Math.round((BIOME_GRID.half * 2) / BIOME_GRID.step) + 1;
  const t = new Float32Array(f * f);
  const e = new Float32Array(f * f);
  const s = new Float32Array(f * f);
  const o = new Float32Array(f * f);
  for (let i = 0; i < f; i++) {
    for (let n = 0; n < f; n++) {
      const a = -BIOME_GRID.half + n * BIOME_GRID.step;
      const r = -BIOME_GRID.half + i * BIOME_GRID.step;
      const c = biomeWeights(a, r);
      const u = i * f + n;
      t[u] = c[0];
      e[u] = c[1];
      s[u] = c[2];
      o[u] = forestDensityRaw(a, r);
    }
  }
  Object.assign(BIOME_GRID, {
    n: f,
    s: t,
    a: e,
    h: s,
    f: o,
  });
}

export function sampleBiome(x, z, out) {
  const gx = (x + BIOME_GRID.half) / BIOME_GRID.step;
  const gz = (z + BIOME_GRID.half) / BIOME_GRID.step;
  if (!BIOME_GRID.s || gx < 0 || gz < 0 || gx >= BIOME_GRID.n - 1 || gz >= BIOME_GRID.n - 1) {
    const w = biomeWeights(x, z);
    out.s = w[0];
    out.a = w[1];
    out.h = w[2];
    out.f = forestDensityRaw(x, z);
    return out;
  }
  const ix = Math.floor(gx);
  const iz = Math.floor(gz);
  const fx = gx - ix;
  const fz = gz - iz;
  const n = BIOME_GRID.n;
  const idx = iz * n + ix;
  const w00 = (1 - fx) * (1 - fz);
  const w10 = fx * (1 - fz);
  const w01 = (1 - fx) * fz;
  const w11 = fx * fz;
  const interp = (arr) =>
    arr[idx] * w00 + arr[idx + 1] * w10 + arr[idx + n] * w01 + arr[idx + n + 1] * w11;
  out.s = interp(BIOME_GRID.s);
  out.a = interp(BIOME_GRID.a);
  out.h = interp(BIOME_GRID.h);
  out.f = interp(BIOME_GRID.f);
  return out;
}

export const biomeTmp = {
  s: 0,
  a: 0,
  h: 0,
  f: 0,
};

export function biomeAt(x, z) {
  sampleBiome(x, z, biomeTmp);
  return [biomeTmp.s, biomeTmp.a, biomeTmp.h];
}

export function forestAt(x, z) {
  return sampleBiome(x, z, biomeTmp).f;
}
