// Освещение и небо: пресеты времени суток, атмосфера биомов, текстура облаков, сфера неба.

import { vnormalize } from "../core/math.js";
import { seededRandom } from "../core/random.js";
import { WORLD } from "../world/mapData.js";
import { icosphereGeo } from "./mesh.js";

export const LIGHTING_PRESETS = {
  day: {
    sunDir: vnormalize([-0.48, 0.62, 0.62]),
    sunColor: [0.96, 0.87, 0.74],
    skyTop: [0.25, 0.5, 0.88],
    skyHorizon: [0.78, 0.86, 0.96],
    skyAmb: [0.43, 0.48, 0.64],
    groundAmb: [0.34, 0.3, 0.28],
    fogColor: [0.76, 0.84, 0.95],
    fogDensity: 0.0002,
    fogHeight: 0.0017,
  },
  sunset: {
    sunDir: vnormalize([-0.75, 0.16, 0.64]),
    sunColor: [1.25, 0.78, 0.52],
    skyTop: [0.32, 0.4, 0.72],
    skyHorizon: [1, 0.74, 0.58],
    skyAmb: [0.48, 0.44, 0.66],
    groundAmb: [0.4, 0.3, 0.32],
    fogColor: [0.94, 0.72, 0.62],
    fogDensity: 0.00024,
    fogHeight: 0.0017,
  },
};

const BIOME_ATMOSPHERE = [
  {
    fog: [0.93, 0.82, 0.91],
    hor: [0.97, 0.86, 0.93],
    amb: [1.06, 0.96, 1.05],
    sun: [1, 0.96, 0.97],
    dens: 1.18,
  },
  {
    fog: [0.94, 0.85, 0.7],
    hor: [0.98, 0.88, 0.74],
    amb: [1.07, 0.98, 0.9],
    sun: [1.04, 0.97, 0.88],
    dens: 1.15,
  },
  {
    fog: [0.7, 0.82, 0.98],
    hor: [0.74, 0.86, 1],
    amb: [0.94, 1, 1.09],
    sun: [0.97, 1, 1.05],
    dens: 1,
  },
];

export function blendAtmosphere(f, t, e, s = 1) {
  const o = t.fogColor.slice();
  const i = t.skyHorizon.slice();
  const n = t.skyAmb.slice();
  const a = t.sunColor.slice();
  let r = t.fogDensity;
  for (let c = 0; c < 3; c++) {
    const u = e[c] * s;
    if (u <= 0) {
      continue;
    }
    const h = BIOME_ATMOSPHERE[c];
    for (let l = 0; l < 3; l++) {
      o[l] += (h.fog[l] - t.fogColor[l]) * u * 0.6;
      i[l] += (h.hor[l] - t.skyHorizon[l]) * u * 0.45;
      n[l] *= 1 + (h.amb[l] - 1) * u;
      a[l] *= 1 + (h.sun[l] - 1) * u;
    }
    r *= 1 + (h.dens - 1) * u;
  }
  f.u_fogColor = o;
  f.u_skyHorizon = i;
  f.u_skyAmb = n;
  f.u_sunColor = a;
  f.u_fogDensity = r;
}

function makeCloudTexture() {
  const e = document.createElement("canvas");
  e.width = 256 * 4;
  e.height = 256;
  const s = e.getContext("2d");
  const o = seededRandom(77);
  for (let a = 0; a < 4; a++) {
    const r = a * 256;
    const c = [];
    const u = 9 + Math.floor(o() * 6);
    for (let l = 0; l < u; l++) {
      const m = l / (u - 1);
      const p = r + 256 * (0.14 + 0.72 * m + (o() - 0.5) * 0.08);
      const d = 256 * (0.1 + 0.17 * Math.sin(Math.PI * m) * (0.7 + o() * 0.5));
      const x = 256 * 0.66 - d * (0.55 + o() * 0.35);
      c.push([p, x, d]);
    }
    for (const [l, m, p] of c) {
      const d = s.createRadialGradient(l, m - p * 0.35, p * 0.1, l, m, p);
      d.addColorStop(0, "rgba(255,255,255,1)");
      d.addColorStop(0.75, "rgba(225,225,255,1)");
      d.addColorStop(1, "rgba(170,170,255,0)");
      s.fillStyle = d;
      s.beginPath();
      s.arc(l, m, p, 0, Math.PI * 2);
      s.fill();
    }
    s.globalCompositeOperation = "destination-out";
    s.fillStyle = "rgba(0,0,0,1)";
    s.fillRect(r, 256 * 0.7, 256, 256 * 0.3);
    s.globalCompositeOperation = "source-over";
    const h = s.createLinearGradient(0, 256 * 0.58, 0, 256 * 0.7);
    h.addColorStop(0, "rgba(0,0,0,0)");
    h.addColorStop(1, "rgba(0,0,0,1)");
    s.globalCompositeOperation = "destination-out";
    s.fillStyle = h;
    s.fillRect(r, 256 * 0.58, 256, 256 * 0.12);
    s.globalCompositeOperation = "source-over";
  }
  const i = s.getImageData(0, 0, 256 * 4, 256);
  const n = i.data;
  for (let a = 0; a < 256; a++) {
    for (let r = 0; r < 256 * 4; r++) {
      const c = (a * 256 * 4 + r) * 4;
      const u = n[c + 2] > 0 ? n[c] / 255 : 0;
      const h = Math.min(1, u * (1.15 - (a / 256) * 0.65));
      n[c] = Math.round(h * 255);
      n[c + 1] = n[c];
      n[c + 2] = n[c];
    }
  }
  s.putImageData(i, 0, 0);
  return e;
}

export function createSky(f) {
  const t = icosphereGeo(1, 3, [1, 1, 1, 0]);
  const e = f.add({
    mesh: f.createMesh(t),
    prog: "sky",
    layer: "far",
    cull: "front",
    depthWrite: false,
    order: -100,
  });
  const s = f.createTexture(makeCloudTexture());
  const o = seededRandom(4242);
  const i = [];
  const n = WORLD.fuji;
  const a = (m, p, d, x, v, g, b) => i.push(m, p, d, x, v, g, b, 0, 0, 0, 0, 0);
  let r = 0;
  while (r < 44) {
    const m = o() * Math.PI * 2;
    const p = 2600 + o() * 6500;
    const d = Math.cos(m) * p;
    const x = Math.sin(m) * p;
    const v = Math.atan2(d - n.x * 0, -x);
    if (!(x < -1500 && Math.abs(d) < 3200)) {
      a(
        d,
        750 + o() * 900 + p * 0.06,
        x,
        240 + o() * 340,
        2.2 + o() * 0.8,
        Math.floor(o() * 4),
        0.85 + o() * 0.15,
      );
      r++;
    }
  }
  for (let m = 0; m < 6; m++) {
    const p = m % 2 ? 1 : -1;
    const d = n.x + p * (900 + o() * 900);
    a(
      d,
      n.h * (0.45 + o() * 0.12),
      n.z + (o() - 0.3) * 600,
      200 + o() * 160,
      2.8,
      Math.floor(o() * 4),
      0.9,
    );
  }
  const c = f.quadMesh;
  const u = new Float32Array(i);
  const h = f.createInstanced(c, u, i.length / 12);
  const l = f.add({
    mesh: h,
    prog: "cloud",
    layer: "far",
    blend: true,
    depthWrite: false,
    cull: "none",
    order: 10,
    uniforms: { u_tex: s },
  });
  return {
    skyItem: e,
    cloudItem: l,
  };
}
