// Машина на экране: модель, колёса, суппорты, контур, тень — по состоянию из физики.

import { rgb } from "../core/math.js";
import { mat4Create, mat4Multiply } from "../core/matrix.js";
import { MeshBuilder, makeTransform } from "../render/mesh.js";
import { buildCarGeometry } from "./carMesh.js";

// Модели машин загружаются в видеокарту один раз на каждую машину (а не на каждого бота или смену цвета).
function gpuModel(renderer, spec) {
  const cache = renderer._carModels || (renderer._carModels = new Map());
  let m = cache.get(spec.id);
  if (!m) {
    const geo = buildCarGeometry(spec);
    m = {
      geo,
      body: renderer.createMesh(geo.body),
      wheel: renderer.createMesh(geo.wheel),
      caliper: renderer.createMesh(geo.caliper),
    };
    cache.set(spec.id, m);
  }
  return m;
}

export class CarView {
  constructor(t, e, s, o = {}) {
    this.r = t;
    this.items = [];
    this.spec = e;
    const gm = gpuModel(t, e);
    const i = gm.geo;
    this.model = i;
    const n = gm.body;
    const a = gm.wheel;
    this.matrix = mat4Create();
    this.bounds = {
      c: [0, 0, 0],
      r: 4,
    };
    this.layer = o.layer || "near";
    this.body = t.add({
      mesh: n,
      defines: ["CARMAT"],
      uniforms: {
        u_model: this.matrix,
        u_tint: rgb(s),
        u_emissive: 0,
      },
      shadow: true,
      bounds: this.bounds,
      order: 2,
      reflect: true,
    });
    this.outline = t.add({
      mesh: n,
      defines: ["OUTLINE"],
      cull: "front",
      uniforms: {
        u_model: this.matrix,
        u_outline: 0.018,
        u_color: [0.09, 0.07, 0.11],
      },
      bounds: this.bounds,
      order: 3,
      reflect: false,
    });
    this.wheels = i.wheelPos.map((m) => {
      const p = mat4Create();
      const d = t.add({
        mesh: a,
        defines: ["CARMAT"],
        uniforms: {
          u_model: p,
          u_tint: [1, 1, 1],
        },
        shadow: true,
        bounds: this.bounds,
        order: 2,
      });
      // суппорт: поворачивается с рулём, но не крутится с колесом
      const cm = mat4Create();
      const cal = t.add({
        mesh: gm.caliper,
        defines: ["CARMAT"],
        uniforms: {
          u_model: cm,
          u_tint: [1, 1, 1],
        },
        bounds: this.bounds,
        order: 2,
        maxDist: 60,
        reflect: false,
      });
      return {
        wp: m,
        m: p,
        it: d,
        cm,
        cal,
      };
    });
    const r = new MeshBuilder();
    const c = e.body.L * 0.62;
    const u = e.body.W * 0.66;
    const h = r.vertex(0, 0, 0, 0, 1, 0, [0.05, 0.04, 0.08, 0.55]);
    const l = [];
    for (let m = 0; m < 24; m++) {
      const p = (m / 24) * Math.PI * 2;
      l.push(r.vertex(Math.cos(p) * u, 0, Math.sin(p) * c, 0, 1, 0, [0.05, 0.04, 0.08, 0]));
    }
    for (let m = 0; m < 24; m++) {
      r.tri(h, l[(m + 1) % 24], l[m]);
    }
    this.shadowM = mat4Create();
    this.blob = t.add({
      mesh: t.createMesh(r),
      prog: "trail",
      blend: true,
      depthWrite: false,
      cull: "none",
      uniforms: { u_model: this.shadowM },
      bounds: this.bounds,
      order: 4,
      polyOffset: [-4, -8],
      reflect: false,
    });
    this.items = [this.body, this.outline, this.blob, ...this.wheels.map((m) => m.it)];
    if (o.maxDist) {
      for (const m of this.items) {
        m.maxDist = o.maxDist;
      }
    }
    for (const w of this.wheels) this.items.push(w.cal);
    this._tmp = mat4Create();
  }
  setColor(t) {
    this.body.uniforms.u_tint = rgb(t);
  }
  setVisible(t) {
    for (const e of this.items) {
      e.visible = t;
    }
  }
  dispose() {
    for (const t of this.items) {
      this.r.remove(t);
    }
    this.r.gl.deleteVertexArray(this.blob.mesh.vao);
    this.r.gl.deleteBuffer(this.blob.mesh.ib);
    for (const k in this.blob.mesh.bufs) this.r.gl.deleteBuffer(this.blob.mesh.bufs[k]);
  }
  update(t) {
    const e = t.pitch - t.bodyPitch;
    const s = t.roll + t.bodyRoll;
    const o = makeTransform(t.pos[0], t.pos[1], t.pos[2], t.yaw, 1, 1, 1, -e, -s);
    this.matrix.set(o);
    this.bounds.c[0] = t.pos[0];
    this.bounds.c[1] = t.pos[1] + 0.7;
    this.bounds.c[2] = t.pos[2];
    const i = this.model.wheelR;
    for (const c of this.wheels) {
      const h = c.wp.front ? -t.steer : 0;
      const l = c.wp.side < 0;
      const yaw = (l ? Math.PI : 0) + h;
      const m = makeTransform(c.wp.x, i, c.wp.z, yaw, 1, 1, 1, l ? -t.wheelSpin : t.wheelSpin, 0);
      mat4Multiply(c.m, this.matrix, m);
      // суппорт стоит в задней верхней четверти колеса на обеих сторонах
      const k = makeTransform(c.wp.x, i, c.wp.z, yaw, 1, 1, 1, l ? 0.9 : -0.9, 0);
      mat4Multiply(c.cm, this.matrix, k);
    }
    this.body.uniforms.u_emissive = t.braking ? 1 : 0;
    const n = t.groundH !== undefined ? t.groundH : t.pos[1];
    const a = Math.max(0, t.pos[1] - n);
    const r = Math.max(0.4, 1 - a * 0.08);
    this.shadowM.set(makeTransform(t.pos[0], n + 0.06, t.pos[2], t.yaw, r, 1, r, 0, 0));
  }
}
