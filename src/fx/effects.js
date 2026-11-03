// Эффекты: лепестки, листья, пыль и дым из-под колёс, следы шин.

import { clamp, lerp, rgb } from "../core/math.js";
import { seededRandom } from "../core/random.js";
import { MeshBuilder } from "../render/mesh.js";
import { biomeAt, forestAt } from "../world/biomes.js";

const fxRandom = seededRandom(31337);

const PETAL_COLORS = [
  [1, 0.76, 0.86],
  [1, 0.86, 0.92],
  [1, 0.68, 0.8],
  [1, 0.93, 0.96],
];

const LEAF_COLORS = [0xd8352a, 0xee6a1e, 0xf5a020, 0xf6c435, 0xc0392b].map(rgb);

class ParticlePool {
  constructor(t, e, s, o) {
    this.r = t;
    this.max = e;
    this.p = [];
    this.data = new Float32Array(e * 12);
    this.inst = t.createInstanced(t.quadMesh, this.data, 0);
    this.item = t.add({
      mesh: this.inst,
      prog: "particle",
      blend: o,
      depthWrite: !o,
      cull: "none",
      order: o ? 20 : 6,
      uniforms: { u_billboard: s ? 1 : 0 },
      reflect: false,
    });
  }
  spawn(t) {
    if (this.p.length >= this.max) {
      let e = 0;
      let s = Infinity;
      for (let o = 0; o < this.p.length; o++) {
        if (this.p[o].life < s) {
          s = this.p[o].life;
          e = o;
        }
      }
      this.p[e] = t;
    } else {
      this.p.push(t);
    }
  }
  upload() {
    const t = this.data;
    let e = 0;
    for (const s of this.p) {
      const o = e * 12;
      t[o] = s.x;
      t[o + 1] = s.y;
      t[o + 2] = s.z;
      t[o + 3] = s.size;
      t[o + 4] = s.ax;
      t[o + 5] = s.ay;
      t[o + 6] = s.az;
      t[o + 7] = s.ang;
      t[o + 8] = s.r;
      t[o + 9] = s.g;
      t[o + 10] = s.b;
      t[o + 11] = s.a;
      e++;
    }
    this.r.updateInstances(this.inst, t.subarray(0, Math.max(1, e) * 12), e);
  }
  clear() {
    this.p.length = 0;
    this.upload();
  }
}

class TrailRenderer {
  constructor(t, e) {
    this.r = t;
    this.max = e;
    const s = new MeshBuilder();
    for (let o = 0; o < e; o++) {
      const i = s.vertex(0, -999, 0, 0, 1, 0, [0, 0, 0, 0]);
      const n = s.vertex(0, -999, 0, 0, 1, 0, [0, 0, 0, 0]);
      const a = s.vertex(0, -999, 0, 0, 1, 0, [0, 0, 0, 0]);
      const r = s.vertex(0, -999, 0, 0, 1, 0, [0, 0, 0, 0]);
      s.quad(i, n, a, r);
    }
    this.mesh = t.createMesh(s, true);
    this.pos = new Float32Array(e * 12);
    for (let o = 1; o < this.pos.length; o += 3) {
      this.pos[o] = -999;
    }
    this.col = new Uint8Array(e * 16);
    this.next = 0;
    this.last = [null, null, null, null];
    this.dirty = false;
    this.item = t.add({
      mesh: this.mesh,
      prog: "trail",
      blend: true,
      depthWrite: false,
      cull: "none",
      polyOffset: [-6, -12],
      order: 15,
      reflect: false,
    });
  }
  add(t, e, s, o, i, n, a, r) {
    const c = this.last[t];
    const u = 0.13;
    const h = [e - i * u, s + 0.03, o - n * u, e + i * u, s + 0.03, o + n * u];
    if (c && Math.hypot(c[0] - e, c[2] - o) < 4) {
      if (Math.hypot(c[0] - e, c[2] - o) < 0.6) {
        return;
      }
      const l = this.next;
      this.next = (this.next + 1) % this.max;
      const m = this.pos;
      const p = this.col;
      m.set([c[3], c[4], c[5], c[6], c[7], c[8], h[3], h[4], h[5], h[0], h[1], h[2]], l * 12);
      const d = Math.round(c[9] * 255);
      const x = Math.round(a * 255);
      const v = r || [22, 20, 24];
      p.set(
        [v[0], v[1], v[2], d, v[0], v[1], v[2], d, v[0], v[1], v[2], x, v[0], v[1], v[2], x],
        l * 16,
      );
      this.dirty = true;
    }
    this.last[t] = [e, s, o, h[0], h[1], h[2], h[3], h[4], h[5], a];
  }
  break(t) {
    this.last[t] = null;
  }
  update() {
    if (this.dirty) {
      this.r.updateBuffer(this.mesh.bufs.pos, this.pos);
      this.r.updateBuffer(this.mesh.bufs.col, this.col);
      this.dirty = false;
    }
  }
  clear() {
    for (let t = 1; t < this.pos.length; t += 3) {
      this.pos[t] = -999;
    }
    this.col.fill(0);
    this.last = [null, null, null, null];
    this.dirty = true;
  }
}

export class Effects {
  constructor(t, e, s = 1) {
    this.r = t;
    this.world = e;
    this.setQuality(s);
    this.leaves = new ParticlePool(t, 520, false, false);
    this.puffs = new ParticlePool(t, 260, true, true);
    this.skid = new TrailRenderer(t, 1400);
    this.wind = [0.8, 0, 0.3];
    this.ambientAcc = 0;
    this.burstAcc = 0;
    this.smokeAcc = 0;
    this.mistAcc = 0;
    this.g = {};
  }
  setQuality(t) {
    this.q = t;
    this.leafCap = Math.round(520 * t);
    this.puffCap = Math.round(260 * Math.max(0.4, t));
  }
  clearTrails() {
    this.skid.clear();
  }
  spawnLeaf(t, e, s, o, i, n, a) {
    if (this.leaves.p.length >= this.leafCap) {
      return;
    }
    const r = a === "petal";
    const c = r
      ? PETAL_COLORS[Math.floor(fxRandom() * 4)]
      : LEAF_COLORS[Math.floor(fxRandom() * LEAF_COLORS.length)];
    this.leaves.spawn({
      x: t,
      y: e,
      z: s,
      vx: o,
      vy: i,
      vz: n,
      size: r ? 0.13 + fxRandom() * 0.08 : 0.2 + fxRandom() * 0.1,
      ax: fxRandom() - 0.5,
      ay: fxRandom() - 0.5,
      az: fxRandom() - 0.5,
      ang: fxRandom() * 6.28,
      spin: (fxRandom() - 0.5) * 8,
      r: c[0],
      g: c[1],
      b: c[2],
      a: 1,
      life: 6 + fxRandom() * 4,
      kind: a,
      phase: fxRandom() * 6.28,
      ground: 0,
    });
  }
  spawnPuff(t, e, s, o, i, n, a, r, c, u, h) {
    if (!(this.puffs.p.length >= this.puffCap)) {
      this.puffs.spawn({
        x: t,
        y: e,
        z: s,
        vx: o,
        vy: i,
        vz: n,
        size: a,
        grow: r,
        ax: 0,
        ay: 0,
        az: 0,
        ang: fxRandom() * 6.28,
        spin: (fxRandom() - 0.5) * 1.5,
        r: c[0],
        g: c[1],
        b: c[2],
        a: u,
        a0: u,
        life: h,
        life0: h,
      });
    }
  }
  update(t, e) {
    if (t <= 0) {
      return;
    }
    const s = e.car;
    const o = e.cam;
    const i = e.time;
    const n = this.world;
    this.wind[0] = 0.9 + Math.sin(i * 0.21) * 0.6;
    this.wind[2] = 0.35 + Math.cos(i * 0.17) * 0.5;
    const [a, r] = biomeAt(o.pos[0], o.pos[2]);
    const c = forestAt(o.pos[0], o.pos[2]);
    const u = (a + r) * (0.5 + 0.9 * c) * 34 * this.q;
    for (this.ambientAcc += u * t; this.ambientAcc > 1; ) {
      this.ambientAcc -= 1;
      const p = fxRandom() * 6.28;
      const d = 3 + fxRandom() * 30;
      const x = o.target[0] - o.pos[0];
      const v = o.target[2] - o.pos[2];
      const g = Math.hypot(x, v) || 1;
      const b = o.pos[0] + (x / g) * 14 + Math.cos(p) * d;
      const y = o.pos[2] + (v / g) * 14 + Math.sin(p) * d;
      const k = n.terrain.heightAt(b, y);
      const w = fxRandom() < a / (a + r + 0.00001) ? "petal" : "leaf";
      this.spawnLeaf(b, k + 2 + fxRandom() * 8, y, this.wind[0], -0.5, this.wind[2], w);
    }
    if (e.state === "drive" || e.state === "event") {
      const p = s.speed;
      const [d, x] = biomeAt(s.pos[0], s.pos[2]);
      const v = (d + x) * clamp((p - 8) / 30, 0, 1) * (s.onGround ? 1 : 0);
      this.burstAcc += v * 70 * this.q * t;
      const g = Math.sin(s.yaw);
      const b = Math.cos(s.yaw);
      while (this.burstAcc > 1) {
        this.burstAcc -= 1;
        const E = fxRandom() < 0.5 ? -1 : 1;
        const P = s.pos[0] - g * 2 + b * E * 0.9;
        const F = s.pos[2] - b * 2 - g * E * 0.9;
        const L = 2 + fxRandom() * 4 * clamp(p / 40, 0.3, 1.2);
        const D = fxRandom() < d / (d + x + 0.00001) ? "petal" : "leaf";
        this.spawnLeaf(
          P,
          s.pos[1] + 0.2,
          F,
          s.vx * 0.35 + (fxRandom() - 0.5) * 4 + b * E * 2,
          L,
          s.vz * 0.35 + (fxRandom() - 0.5) * 4 - g * E * 2,
          D,
        );
      }
      const y = s.pos[0] - g * (s.spec.body.wb / 2);
      const k = s.pos[2] - b * (s.spec.body.wb / 2);
      const w = -b;
      const M = g;
      const _ = s.spec.body.track / 2;
      const z = e.controls && e.controls.throttle > 0.9 && p < 4 && p > 0.3 && !s.spec.phys.awd;
      const T =
        s.onGround && ((s.drifting && p > 6) || (e.controls && e.controls.handbrake && p > 6) || z);
      const S = s.surface === "grass" || s.surface === "gravel";
      if (T || (S && p > 8)) {
        for (
          this.smokeAcc += (T ? (z ? 8 : 16) : 10) * t * Math.max(0.5, this.q);
          this.smokeAcc > 1;
        ) {
          this.smokeAcc -= 1;
          const E = fxRandom() < 0.5 ? -1 : 1;
          const P = y + w * _ * E;
          const F = k + M * _ * E;
          const L = S
            ? s.surface === "gravel"
              ? [0.78, 0.74, 0.68]
              : [0.72, 0.66, 0.5]
            : [0.93, 0.93, 0.95];
          this.spawnPuff(
            P,
            s.pos[1] + 0.3,
            F,
            s.vx * 0.15 + (fxRandom() - 0.5) * 1.5,
            0.6 + fxRandom(),
            s.vz * 0.15 + (fxRandom() - 0.5) * 1.5,
            0.45 + fxRandom() * 0.3,
            S ? 1.3 : 1.7,
            L,
            S ? 0.28 : 0.3,
            1 + fxRandom() * 0.7,
          );
        }
      }
      for (const E of [-1, 1]) {
        const P = E < 0 ? 0 : 1;
        if (s.onGround && (T || (e.controls && e.controls.brake > 0 && s.vForward > 15)) && !S) {
          const F = y + w * _ * E;
          const L = k + M * _ * E;
          const D = n.groundAt(F, L, this.g).h;
          this.skid.add(P, F, D, L, w, M, s.drifting ? 0.5 : 0.35);
        } else {
          this.skid.break(P);
        }
      }
      if (s.boosting) {
        for (const E of s.spec.exhaust || [-0.35, 0.35]) {
          const P = s.pos[0] - g * (s.spec.body.L / 2 + 0.15) + w * E * -1;
          const F = s.pos[2] - b * (s.spec.body.L / 2 + 0.15) + M * E * -1;
          const L = fxRandom() < 0.5;
          this.spawnPuff(
            P,
            s.pos[1] + s.spec.body.trimY + 0.05,
            F,
            s.vx * 0.85 - g * 3,
            0.2,
            s.vz * 0.85 - b * 3,
            0.16 + fxRandom() * 0.1,
            1.2,
            L ? [1.6, 0.9, 0.35] : [0.6, 0.8, 1.8],
            0.9,
            0.12 + fxRandom() * 0.08,
          );
        }
      }
    }
    if (n.waterfallPos) {
      const p = n.waterfallPos;
      if (Math.hypot(p[0] - o.pos[0], p[2] - o.pos[2]) < 220) {
        for (this.mistAcc += 10 * t * this.q; this.mistAcc > 1; ) {
          this.mistAcc -= 1;
          this.spawnPuff(
            p[0] + (fxRandom() - 0.5) * 9,
            p[1] + 0.5,
            p[2] + (fxRandom() - 0.5) * 4,
            (fxRandom() - 0.5) * 2,
            1.5 + fxRandom() * 2,
            (fxRandom() - 0.5) * 2,
            1.2,
            2.5,
            [0.95, 0.98, 1],
            0.35,
            2,
          );
        }
      }
    }
    const h = e.state === "drive" || e.state === "event" ? s : null;
    const l = this.leaves.p;
    for (let p = l.length - 1; p >= 0; p--) {
      const d = l[p];
      d.life -= t;
      if (d.life <= 0 || Math.hypot(d.x - o.pos[0], d.z - o.pos[2]) > 90) {
        l.splice(p, 1);
        continue;
      }
      if (d.ground > 0) {
        d.ground += t;
        d.a = clamp(d.life / 1.5, 0, 1);
        if (d.ground > 3) {
          d.life = Math.min(d.life, 1.2);
        }
        if (h) {
          const y = d.x - h.pos[0];
          const k = d.z - h.pos[2];
          if (y * y + k * k < 9 && h.speed > 10) {
            d.ground = 0;
            d.vy = 2 + fxRandom() * 3;
            d.vx = h.vx * 0.4 + y;
            d.vz = h.vz * 0.4 + k;
          }
        }
        continue;
      }
      const x = Math.sin(i * 3 + d.phase);
      const v = d.kind === "petal" ? 0.55 : 0.9;
      const g = 1 - Math.exp(-1.6 * t);
      d.vx = lerp(d.vx, this.wind[0] + x * 0.8, g);
      d.vz = lerp(d.vz, this.wind[2] + Math.cos(i * 2.3 + d.phase) * 0.8, g);
      d.vy = lerp(d.vy, -v + x * 0.25, g * 0.8);
      if (h && h.speed > 8) {
        const y = d.x - h.pos[0];
        const k = d.y - h.pos[1];
        const w = d.z - h.pos[2];
        const M = y * y + k * k + w * w;
        if (M < 36) {
          const _ = (1 - M / 36) * h.speed * 0.08;
          const z = Math.sqrt(M) || 1;
          d.vx += (y / z) * _ + h.vx * 0.04;
          d.vy += _ * 0.6;
          d.vz += (w / z) * _ + h.vz * 0.04;
        }
      }
      d.x += d.vx * t;
      d.y += d.vy * t;
      d.z += d.vz * t;
      d.ang += d.spin * t;
      const b = n.groundAt(d.x, d.z, this.g).h;
      if (d.y < b + 0.03) {
        d.y = b + 0.03;
        d.ground = 0.001;
        d.ax = 0.05;
        d.ay = 1;
        d.az = 0.05;
        d.spin = 0;
      }
    }
    this.leaves.upload();
    const m = this.puffs.p;
    for (let p = m.length - 1; p >= 0; p--) {
      const d = m[p];
      d.life -= t;
      if (d.life <= 0) {
        m.splice(p, 1);
        continue;
      }
      const x = 1 - d.life / d.life0;
      d.x += d.vx * t;
      d.y += d.vy * t;
      d.z += d.vz * t;
      d.vx *= Math.exp(-1.5 * t);
      d.vz *= Math.exp(-1.5 * t);
      d.vy *= Math.exp(-0.8 * t);
      d.vx += this.wind[0] * t * 0.5;
      d.vz += this.wind[2] * t * 0.5;
      d.size += d.grow * t;
      d.ang += d.spin * t;
      d.a = d.a0 * Math.sin(Math.min(1, x * 5) * Math.PI * 0.5) * (1 - x);
    }
    this.puffs.upload();
    this.skid.update();
  }
}
