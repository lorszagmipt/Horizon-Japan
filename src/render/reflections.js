// Отражения в озёрах: дополнительный рендер сцены «вверх ногами».

import { Camera } from "./camera.js";

export class Reflections {
  constructor(t, e) {
    this.r = t;
    this.world = e;
    this.cam = new Camera();
    this.target = null;
    this.active = null;
  }
  render(t) {
    const e = this.world.waterItems;
    for (const l of e) {
      l.uniforms.u_useRefl = 0;
    }
    if (!t.settings.graphics.reflections) {
      return;
    }
    const s = t.cam;
    let o = null;
    let i = Infinity;
    const n = s.target[0] - s.pos[0];
    const a = s.target[2] - s.pos[2];
    for (const l of e) {
      const m = l.lake;
      const p = m.x - s.pos[0];
      const d = m.z - s.pos[2];
      const x = Math.hypot(p, d) - Math.max(m.rx, m.rz);
      if (!(x > 700 || s.pos[1] < m.level || (x > 30 && p * n + d * a < 0))) {
        if (x < i) {
          i = x;
          o = l;
        }
      }
    }
    if (!o) {
      return;
    }
    const r = Math.max(64, Math.floor(this.r.canvas.width / 2));
    const c = Math.max(64, Math.floor(this.r.canvas.height / 2));
    if (!this.target || this.target.w !== r || this.target.h !== c) {
      this.r.deleteTarget(this.target);
      this.target = this.r.createTarget(r, c);
    }
    const u = o.lake.level;
    const h = this.cam;
    h.pos = [s.pos[0], 2 * u - s.pos[1], s.pos[2]];
    h.target = [s.target[0], 2 * u - s.target[1], s.target[2]];
    h.fov = s.fov;
    h.near = 1;
    h.far = 3000;
    this.r.render(h, {
      target: this.target,
      reflection: true,
      clipY: u - 0.2,
    });
    o.uniforms.u_useRefl = 1;
    o.uniforms.u_reflTex = this.target.tex;
    o.uniforms.u_reflMat = h.viewProj;
  }
}
