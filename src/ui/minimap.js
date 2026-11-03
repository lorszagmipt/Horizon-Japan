// Карта мира, мини-карта и компас.

import { clamp } from "../core/math.js";
import { LANDMARKS, WORLD } from "../world/mapData.js";
import { biomeAt, forestAt } from "../world/biomes.js";
import { lakeDistance } from "../world/terrain.js";

const MAP_HALF = 1600;

export function drawMapImage(f, t = 1024) {
  const e = document.createElement("canvas");
  e.width = e.height = t;
  const s = e.getContext("2d");
  const o = t / (MAP_HALF * 2);
  const i = (h, l) => [(h + MAP_HALF) * o, (l + MAP_HALF) * o];
  const n = 8;
  const a = f.terrain;
  for (let h = 0; h < t; h += n) {
    for (let l = 0; l < t; l += n) {
      const m = l / o - MAP_HALF + n / o / 2;
      const p = h / o - MAP_HALF + n / o / 2;
      const [d, x, v] = biomeAt(m, p);
      const g = Math.max(0, 1 - d - x - v);
      const b = forestAt(m, p);
      let y = 120 * g + 150 * d + 190 * x + 110 * v;
      let k = 175 * g + 170 * d + 150 * x + 150 * v;
      let w = 95 * g + 120 * d + 70 * x + 120 * v;
      y = y * (1 - b * 0.25) + b * (d * 70 + x * 60);
      k = k * (1 - b * 0.25);
      const M = a.heightAt(m, p);
      const _ = clamp(0.85 + M / 900, 0.8, 1.25);
      if (Math.abs(m) > WORLD.half || Math.abs(p) > WORLD.half) {
        y *= 0.72;
        k *= 0.72;
        w *= 0.8;
      }
      s.fillStyle = `rgb(${Math.min(255, y * _) | 0},${Math.min(255, k * _) | 0},${Math.min(255, w * _) | 0})`;
      s.fillRect(l, h, n, n);
    }
  }
  s.fillStyle = "#4aa6d6";
  for (const h of a.lakes) {
    for (
      let l = Math.floor((h.z - h.rx * 1.3 + MAP_HALF) * o);
      l < (h.z + h.rx * 1.3 + MAP_HALF) * o;
      l += 2
    ) {
      for (
        let m = Math.floor((h.x - h.rx * 1.3 + MAP_HALF) * o);
        m < (h.x + h.rx * 1.3 + MAP_HALF) * o;
        m += 2
      ) {
        if (lakeDistance(h, m / o - MAP_HALF, l / o - MAP_HALF) < 1) {
          s.fillRect(m, l, 2, 2);
        }
      }
    }
  }
  s.strokeStyle = "#4aa6d6";
  s.lineWidth = 9 * o * 2.2;
  s.lineCap = "round";
  s.beginPath();
  a.river.samples.forEach((h, l) => {
    const [m, p] = i(h.x, h.z);
    if (l) {
      s.lineTo(m, p);
    } else {
      s.moveTo(m, p);
    }
  });
  s.stroke();
  const r = (h, l) => {
    for (const m of f.roads.roads) {
      s.strokeStyle = l;
      s.lineWidth = Math.max(2, (m.hw * 2 + h) * o * 1.6);
      s.lineJoin = "round";
      s.beginPath();
      for (let p = 0; p < m.n; p += 3) {
        const [d, x] = i(m.x[p], m.z[p]);
        if (p) {
          s.lineTo(d, x);
        } else {
          s.moveTo(d, x);
        }
      }
      if (m.closed) {
        s.closePath();
      } else {
        const [p, d] = i(m.x[m.n - 1], m.z[m.n - 1]);
        s.lineTo(p, d);
      }
      s.stroke();
    }
  };
  r(10, "rgba(30,30,40,0.55)");
  r(0, "#fdf8ee");
  const c = f.roads.byId.highway;
  s.strokeStyle = "#ffd36b";
  s.lineWidth = Math.max(2, c.hw * 2 * o * 1.1);
  s.beginPath();
  for (let h = 0; h < c.n; h += 3) {
    const [l, m] = i(c.x[h], c.z[h]);
    if (h) {
      s.lineTo(l, m);
    } else {
      s.moveTo(l, m);
    }
  }
  s.closePath();
  s.stroke();
  const u = (h, l, m) => {
    const [p, d] = i(h.x, h.z);
    s.fillStyle = m;
    s.beginPath();
    s.arc(p, d, t / 90, 0, Math.PI * 2);
    s.fill();
    s.fillStyle = "#fff";
    s.font = `bold ${t / 70}px Bahnschrift, Arial`;
    s.textAlign = "center";
    s.textBaseline = "middle";
    s.fillText(l, p, d + 1);
  };
  u(LANDMARKS.festival, "★", "#ff5c8a");
  u(LANDMARKS.pagoda, "⛩", "#d9472b");
  u(LANDMARKS.sakuraView, "♜", "#c94f7c");
  u(LANDMARKS.summit, "▲", "#6c7bd6");
  u(LANDMARKS.fujiView, "◉", "#2f5f8f");
  u(LANDMARKS.waterfall, "≋", "#3a8fc0");
  return e;
}

export class Minimap {
  constructor(t, e, s) {
    this.world = t;
    this.c = e;
    this.g = e.getContext("2d");
    this.img = s;
    e.width = e.height = 300;
  }
  draw(t, e, s) {
    const o = this.g;
    const i = this.c.width;
    const a = i / (2 * 380);
    const r = this.img.width / (MAP_HALF * 2);
    o.save();
    o.fillStyle = "#5b7b5a";
    o.fillRect(0, 0, i, i);
    o.translate(i / 2, i / 2);
    const c = t.yaw;
    const u = -Math.PI / 2 - Math.atan2(Math.cos(c), Math.sin(c));
    o.rotate(u);
    const h = a / r;
    o.drawImage(
      this.img,
      -(t.pos[0] + MAP_HALF) * r * h,
      -(t.pos[2] + MAP_HALF) * r * h,
      this.img.width * h,
      this.img.height * h,
    );
    for (const l of e) {
      const m = (l.x - t.pos[0]) * a;
      const p = (l.z - t.pos[2]) * a;
      const d = Math.hypot(m, p);
      const x = i / 2 - 14;
      const v = d > x ? x / d : 1;
      o.save();
      o.translate(m * v, p * v);
      o.rotate(-u);
      o.fillStyle = l.color;
      o.strokeStyle = "#fff";
      o.lineWidth = 3;
      o.beginPath();
      o.arc(0, 0, 9, 0, Math.PI * 2);
      o.fill();
      o.stroke();
      o.fillStyle = "#fff";
      o.font = "bold 11px Bahnschrift, Arial";
      o.textAlign = "center";
      o.textBaseline = "middle";
      o.fillText(l.ch || "!", 0, 1);
      o.restore();
    }
    if (s) {
      const l = (s[0] - t.pos[0]) * a;
      const m = (s[1] - t.pos[2]) * a;
      const p = Math.hypot(l, m);
      const d = i / 2 - 12;
      const x = p > d ? d / p : 1;
      o.fillStyle = "#ffd23f";
      o.strokeStyle = "#222";
      o.lineWidth = 3;
      o.beginPath();
      o.arc(l * x, m * x, 10, 0, Math.PI * 2);
      o.fill();
      o.stroke();
    }
    o.restore();
    o.save();
    o.translate(i / 2, i / 2);
    o.fillStyle = "#ffffff";
    o.strokeStyle = "#ff5c8a";
    o.lineWidth = 4;
    o.beginPath();
    o.moveTo(0, -16);
    o.lineTo(11, 12);
    o.lineTo(0, 6);
    o.lineTo(-11, 12);
    o.closePath();
    o.stroke();
    o.fill();
    o.restore();
  }
}

export class Compass {
  constructor(t) {
    this.c = t;
    this.g = t.getContext("2d");
    t.width = 880;
    t.height = 68;
  }
  draw(t, e) {
    const s = this.g;
    const o = this.c.width;
    const i = this.c.height;
    s.clearRect(0, 0, o, i);
    const n = o / 160;
    s.textAlign = "center";
    s.textBaseline = "middle";
    for (let a = Math.ceil((t - 90) / 5) * 5; a <= t + 90; a += 5) {
      const r = ((a % 360) + 360) % 360;
      const c = o / 2 + (a - t) * n;
      const u = {
        0: "С",
        90: "В",
        180: "Ю",
        270: "З",
        45: "СВ",
        135: "ЮВ",
        225: "ЮЗ",
        315: "СЗ",
      };
      if (u[r] !== undefined) {
        s.fillStyle = r % 90 ? "rgba(255,255,255,.8)" : "#ffffff";
        s.font = r % 90 ? "bold 22px Bahnschrift, Arial" : "bold 30px Bahnschrift, Arial";
        s.fillText(u[r], c, i / 2 + 2);
      } else if (r % 15 === 0) {
        s.fillStyle = "rgba(255,255,255,.55)";
        s.fillRect(c - 1.5, i / 2 - 8, 3, 16);
      }
    }
    for (const a of e) {
      const r = ((a.bearing - t + 540) % 360) - 180;
      const c = Math.max(-78, Math.min(78, r));
      const u = o / 2 + c * n;
      s.fillStyle = a.color;
      s.font = "bold 20px Bahnschrift, Arial";
      s.fillText(a.label, u, 14);
      s.beginPath();
      s.moveTo(u - 8, i - 4);
      s.lineTo(u + 8, i - 4);
      s.lineTo(u, i - 16);
      s.fill();
    }
    s.fillStyle = "#ff5c8a";
    s.fillRect(o / 2 - 2, i - 10, 4, 10);
  }
}
