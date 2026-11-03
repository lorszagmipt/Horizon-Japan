// Рекламные щиты и дорожные указатели (рисуются на canvas и становятся текстурой).

import { MeshBuilder, boxGeo, makeTransform } from "../render/mesh.js";
import { biomeAt } from "./biomes.js";
import { StaticBatch } from "./batch.js";

const SIGN_W = 512;

const SIGN_H = 192;

const ATLAS_COLS = 4;

const ATLAS_ROWS = 4;

function drawSign(f, t, e, s) {
  f.save();
  f.translate(t, e);
  const o = SIGN_W;
  const i = SIGN_H;
  f.fillStyle = s.bg;
  f.fillRect(0, 0, o, i);
  f.strokeStyle = s.border || "#ffffff";
  f.lineWidth = 10;
  f.strokeRect(12, 12, o - 24, i - 24);
  f.fillStyle = s.fg || "#ffffff";
  f.textAlign = "center";
  f.textBaseline = "middle";
  const n = '"Bahnschrift", "Segoe UI", "Arial Narrow", Arial, sans-serif';
  if (s.big) {
    f.font = `bold ${s.size || 64}px ${n}`;
    f.fillText(s.title, o / 2, i / 2 - (s.sub ? 18 : 0));
  } else {
    f.font = `bold ${s.size || 50}px ${n}`;
    f.fillText(s.title, o / 2, i / 2 - (s.sub ? 22 : 0));
  }
  if (s.sub) {
    f.font = `600 30px ${n}`;
    f.globalAlpha = 0.85;
    f.fillText(s.sub, o / 2, i / 2 + 40);
    f.globalAlpha = 1;
  }
  if (s.accent) {
    f.fillStyle = s.accent;
    f.fillRect(30, i - 34, o - 60, 8);
  }
  f.restore();
}

const SIGN_DESIGNS = [
  {
    title: "PAINTED ROADS FESTIVAL",
    sub: "HORIZON: JAPAN",
    bg: "#2b2f45",
    fg: "#ffffff",
    border: "#ff5c8a",
    accent: "#ffb02e",
    size: 50,
    big: true,
  },
  {
    title: "ДОЛИНА САКУРЫ",
    sub: "Sakura Blossom Valley",
    bg: "#c94f7c",
    border: "#ffe3ee",
    accent: "#ffffff",
  },
  {
    title: "ЛЕС ЗОЛОТЫХ КЛЁНОВ",
    sub: "Golden Maple Forest",
    bg: "#c4561c",
    border: "#ffe0b3",
    accent: "#ffd23f",
    size: 44,
  },
  {
    title: "НАГОРЬЕ ФУДЗИ",
    sub: "Mount Fuji Highlands",
    bg: "#2f5f8f",
    border: "#d9ecff",
    accent: "#ffffff",
  },
  {
    title: "РАВНИНА ФЕСТИВАЛЯ",
    sub: "Festival Plains",
    bg: "#2e7d4f",
    border: "#e6ffe9",
    accent: "#ffd23f",
    size: 46,
  },
  {
    title: "↑ ПЕРЕВАЛ ФУДЗИ",
    sub: "Fuji Pass · серпантин",
    bg: "#1d6b45",
    border: "#ffffff",
    size: 46,
  },
  {
    title: "СМОТРОВАЯ ПЛОЩАДКА",
    sub: "Viewpoint",
    bg: "#7a4b2a",
    border: "#ffe9c9",
    size: 42,
  },
  {
    title: "ТОННЕЛЬ",
    sub: "Tunnel",
    bg: "#1d6b45",
    border: "#ffffff",
  },
  {
    title: "ОЗЕРО ОТРАЖЕНИЙ",
    sub: "Lake of Reflections",
    bg: "#2f5f8f",
    border: "#ffffff",
    size: 46,
  },
  {
    title: "ЗЕРКАЛЬНОЕ ОЗЕРО",
    sub: "Mirror Lake",
    bg: "#c94f7c",
    border: "#ffffff",
    size: 46,
  },
];

export class Signs {
  constructor(t) {
    this.r = t;
    const e = document.createElement("canvas");
    e.width = SIGN_W * ATLAS_COLS;
    e.height = SIGN_H * ATLAS_ROWS;
    const s = e.getContext("2d");
    SIGN_DESIGNS.forEach((o, i) =>
      drawSign(s, (i % ATLAS_COLS) * SIGN_W, Math.floor(i / ATLAS_COLS) * SIGN_H, o),
    );
    this.tex = t.createTexture(e);
    this.canvas = e;
  }
  quad(t, e, s) {
    const o = new MeshBuilder();
    const i = ((t % ATLAS_COLS) * SIGN_W) / (SIGN_W * ATLAS_COLS);
    const n = i + 1 / ATLAS_COLS;
    const a = (Math.floor(t / ATLAS_COLS) * SIGN_H) / (SIGN_H * ATLAS_ROWS);
    const r = a + 1 / ATLAS_ROWS;
    const c = [1, 1, 1, 0];
    const u = o.vertex(-e / 2, -s / 2, 0, 0, 0, 1, c, [i, r, 0, 0]);
    const h = o.vertex(e / 2, -s / 2, 0, 0, 0, 1, c, [n, r, 0, 0]);
    const l = o.vertex(e / 2, s / 2, 0, 0, 0, 1, c, [n, a, 0, 0]);
    const m = o.vertex(-e / 2, s / 2, 0, 0, 0, 1, c, [i, a, 0, 0]);
    o.quad(u, h, l, m);
    return o;
  }
  place(t, e, s, o, i, n, a, r, c = 0.1) {
    const u = new MeshBuilder();
    const h = this.quad(e, a, r);
    u.append(h, makeTransform(s, o, i, n, 1, 1, 1));
    for (let p = 0; p < u.vertexCount; p++) {
      u.pos[p * 3] += Math.sin(n) * c;
      u.pos[p * 3 + 2] += Math.cos(n) * c;
    }
    const l = new MeshBuilder();
    l.append(h, makeTransform(s - Math.sin(n) * c, o, i - Math.cos(n) * c, n + Math.PI));
    u.append(l);
    const m = u.bounds();
    return [
      this.r.add({
        mesh: this.r.createMesh(u),
        defines: ["TEXTURED"],
        uniforms: { u_tex: this.tex },
        bounds: {
          c: m.center,
          r: m.radius,
        },
        maxDist: 900,
        reflect: false,
      }),
    ];
  }
  buildRoadSigns(t) {
    const e = t.roads;
    const s = t.terrain;
    const o = t.colliders;
    const i = new StaticBatch(this.r, { maxDist: 700 });
    const n = new MeshBuilder();
    const a = (l, m) => {
      const [p, d, x] = biomeAt(l, m);
      const v = Math.max(p, d, x);
      return v < 0.4 ? 4 : v === p ? 1 : v === d ? 2 : 3;
    };
    const r = (l, m, p, d, x, v = 4.2, g = 1.6) => {
      const b = Math.cos(x);
      const y = Math.sin(x);
      for (const k of [-1, 1]) {
        const w = m + b * k * v * 0.38;
        const M = p - y * k * v * 0.38;
        i.add(boxGeo(0.14, 3.6, 0.14), makeTransform(w, d + 1.8, M), w, M, [0.55, 0.57, 0.6], 0.4);
        o.addCircle(w, M, 0.15, d - 1, d + 4);
      }
      i.add(
        boxGeo(v + 0.2, g + 0.2, 0.08),
        makeTransform(m, d + 3, p, x),
        m,
        p,
        [0.3, 0.3, 0.32],
        0.2,
      );
      n.append(this.quad(l, v, g), makeTransform(m + y * 0.06, d + 3, p + b * 0.06, x));
    };
    for (const l of e.roads) {
      let m = a(l.x[0], l.z[0]);
      let p = -1000;
      for (let d = 0; d < l.n; d += 5) {
        const x = a(l.x[d], l.z[d]);
        if (x === m) {
          continue;
        }
        const v = Math.min(l.n - 1, d + 60);
        if (a(l.x[v], l.z[v]) !== x) {
          continue;
        }
        const g = m;
        m = x;
        if (l.dist[d] - p < 250 || l.flags[d]) {
          continue;
        }
        p = l.dist[d];
        const b = Math.atan2(l.tx[d], l.tz[d]);
        const y = l.hw + 3.4;
        const k = -l.tz[d];
        const w = l.tx[d];
        let M = l.x[d] + k * y;
        let _ = l.z[d] + w * y;
        if (!l.railL[d] && !l.railR[d]) {
          r(x, M, _, s.heightAt(M, _), b + Math.PI);
        }
        M = l.x[d] - k * y;
        _ = l.z[d] - w * y;
        if (!l.railL[d] && !l.railR[d]) {
          r(g, M, _, s.heightAt(M, _), b);
        }
      }
    }
    const c = e.byId.pass;
    const u = e.byId.highway;
    if (c) {
      const m = Math.atan2(c.tx[25], c.tz[25]);
      const p = c.x[25] - c.tz[25] * (c.hw + 3.5);
      const d = c.z[25] + c.tx[25] * (c.hw + 3.5);
      r(5, p, d, s.heightAt(p, d), m + Math.PI);
      const x = c.n - 30;
      const v = c.x[x] - c.tz[x] * (c.hw + 3.5);
      const g = c.z[x] + c.tx[x] * (c.hw + 3.5);
      r(5, v, g, s.heightAt(v, g), Math.atan2(c.tx[x], c.tz[x]));
    }
    if (u) {
      let l = -1;
      let m = -1;
      for (let p = 0; p < u.n; p++) {
        if (u.flags[p] & 2) {
          if (l < 0) {
            l = p;
          }
          m = p;
        }
      }
      if (l > 0) {
        for (const [p, d] of [
          [l - 70, 1],
          [m + 70, -1],
        ]) {
          const x = (p + u.n) % u.n;
          const v = Math.atan2(u.tx[x], u.tz[x]) + (d > 0 ? Math.PI : 0);
          const g = d > 0 ? -1 : 1;
          const b = u.x[x] + u.tz[x] * (u.hw + 3.5) * g;
          const y = u.z[x] - u.tx[x] * (u.hw + 3.5) * g;
          r(7, b, y, s.heightAt(b, y), v);
        }
      }
    }
    for (const [l, m] of [
      ["fuji", 8],
      ["mirror", 9],
    ]) {
      const p = s.lakes.find((M) => M.id === l);
      const d = e.nearest(p.x, p.z + (l === "fuji" ? p.rz + 100 : -p.rz - 60), 200);
      if (!d) {
        continue;
      }
      const x = d.road;
      const v = d.i;
      const g = Math.atan2(p.x - x.x[v], p.z - x.z[v]);
      const b = x.hw + 3.5;
      const y = Math.sign((p.x - x.x[v]) * x.tz[v] - (p.z - x.z[v]) * x.tx[v]) || 1;
      const k = x.x[v] + x.tz[v] * b * y;
      const w = x.z[v] - x.tx[v] * b * y;
      r(m, k, w, s.heightAt(k, w), g + Math.PI);
    }
    const h = i.build();
    if (n.vertexCount) {
      h.push(
        this.r.add({
          mesh: this.r.createMesh(n),
          defines: ["TEXTURED"],
          uniforms: { u_tex: this.tex },
          cull: "none",
          reflect: false,
        }),
      );
    }
    return h;
  }
}
