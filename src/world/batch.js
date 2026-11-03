// Склейка множества мелких статичных объектов в крупные меши по ячейкам — так видеокарте рисовать быстрее.

import { MeshBuilder } from "../render/mesh.js";

export class StaticBatch {
  constructor(t, e = {}) {
    this.r = t;
    this.cell = e.cell || 250;
    this.maxDist = e.maxDist || 900;
    this.defines = e.defines || ["CARMAT"];
    this.shadow = e.shadow !== false;
    this.uniforms = e.uniforms || {};
    this.cull = e.cull || "back";
    this.reflect = e.reflect !== false;
    this.chunks = new Map();
  }
  geoAt(t, e) {
    const s = Math.floor(t / this.cell) + "," + Math.floor(e / this.cell);
    let o = this.chunks.get(s);
    if (!o) {
      o = new MeshBuilder();
      o.ext = [];
      this.chunks.set(s, o);
    }
    return o;
  }
  add(t, e, s, o, i, n = 0, a = 0) {
    const r = this.geoAt(s, o);
    const c = r.vertexCount;
    r.append(t, e, i, i ? "set" : "mul");
    for (let u = c; u < r.vertexCount; u++) {
      r.ext[u * 4] = n;
      r.ext[u * 4 + 1] = a;
      r.ext[u * 4 + 2] = 0;
      r.ext[u * 4 + 3] = 0;
      r.col[u * 4 + 3] = 0;
    }
    return r;
  }
  build() {
    const t = [];
    for (const e of this.chunks.values()) {
      if (!e.vertexCount) {
        continue;
      }
      const s = e.bounds();
      t.push(
        this.r.add({
          mesh: this.r.createMesh(e),
          defines: this.defines,
          bounds: {
            c: s.center,
            r: s.radius,
          },
          maxDist: this.maxDist,
          shadow: this.shadow,
          shadowDist: 120,
          uniforms: { ...this.uniforms },
          cull: this.cull,
          reflect: this.reflect,
        }),
      );
    }
    this.chunks.clear();
    return t;
  }
}
