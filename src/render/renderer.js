// Рендерер на WebGL2: создаёт меши и текстуры на видеокарте, рисует кадр, тени и отражения.

import {
  frustumPlanes,
  mat4Create,
  mat4LookAt,
  mat4Multiply,
  mat4Ortho,
  sphereInFrustum,
} from "../core/matrix.js";
import {
  CLOUD_FS,
  CLOUD_VS,
  PARTICLE_FS,
  PARTICLE_VS,
  SKY_FS,
  SKY_VS,
  TRAIL_FS,
  TRAIL_VS,
  WATER_FS,
  WATER_VS,
  WORLD_FS,
  WORLD_VS,
} from "./shaders.js";

const PROGRAM_DEFAULTS = {
  world: {
    u_color: [1, 1, 1],
    u_foliage: 0,
    u_emissive: 0,
    u_tint: [1, 1, 1],
    u_sunScale: 1,
    u_outline: 0,
    u_model: null,
  },
  particle: { u_billboard: 0 },
  trail: { u_model: null },
};

const IDENTITY_MATRIX = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);

const ATTRIBUTE_LOCATIONS = {
  a_pos: 0,
  a_nor: 1,
  a_col: 2,
  a_ext: 3,
  a_ipos: 4,
  a_iscale: 5,
  a_itint: 6,
};

export class Renderer {
  constructor(t) {
    const e = t.getContext("webgl2", {
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      stencil: false,
    });
    if (!e) {
      throw new Error("WebGL2 недоступен");
    }
    this.gl = e;
    this.canvas = t;
    this.programs = new Map();
    this.items = [];
    this.groups = [];
    this.globals = {};
    this.frameId = 0;
    this.stats = {
      draws: 0,
      tris: 0,
    };
    this.shadowSize = 0;
    this.shadowFB = null;
    this.shadowTex = null;
    this.shadowMat = mat4Create();
    this.pixelRatio = 1;
    this.planes = frustumPlanes(mat4Create());
    this._resetState();
    e.enable(e.DEPTH_TEST);
    e.enable(e.CULL_FACE);
    e.depthFunc(e.LEQUAL);
    this.quadMesh = this.createMesh({
      pos: [-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0],
      nor: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
      col: new Array(16).fill(1),
      idx: [0, 1, 2, 0, 2, 3],
    });
  }
  program(t, e = []) {
    const s = t + "|" + e.join(",");
    let o = this.programs.get(s);
    if (o) {
      return o;
    }
    const i = {
      world: [WORLD_VS, WORLD_FS],
      sky: [SKY_VS, SKY_FS],
      cloud: [CLOUD_VS, CLOUD_FS],
      water: [WATER_VS, WATER_FS],
      particle: [PARTICLE_VS, PARTICLE_FS],
      trail: [TRAIL_VS, TRAIL_FS],
    }[t];
    const n =
      `#version 300 es
` +
      e
        .map(
          (a) => `#define ${a}
`,
        )
        .join("");
    o = this._compile(n + i[0], n + i[1], s);
    this.programs.set(s, o);
    return o;
  }
  _compile(t, e, s) {
    const o = this.gl;
    const i = (u, h) => {
      const l = o.createShader(u);
      o.shaderSource(l, h);
      o.compileShader(l);
      if (!o.getShaderParameter(l, o.COMPILE_STATUS)) {
        const m = o.getShaderInfoLog(l);
        const p = h
          .split(
            `
`,
          )
          .map((d, x) => x + 1 + ": " + d).join(`
`);
        console.error("Shader error in", s, m, p);
        throw new Error("Ошибка шейдера " + s + ": " + m);
      }
      return l;
    };
    const n = o.createProgram();
    o.attachShader(n, i(o.VERTEX_SHADER, t));
    o.attachShader(n, i(o.FRAGMENT_SHADER, e));
    for (const [u, h] of Object.entries(ATTRIBUTE_LOCATIONS)) {
      o.bindAttribLocation(n, h, u);
    }
    o.linkProgram(n);
    if (!o.getProgramParameter(n, o.LINK_STATUS)) {
      throw new Error("Link error " + s + ": " + o.getProgramInfoLog(n));
    }
    const a = {};
    const r = o.getProgramParameter(n, o.ACTIVE_UNIFORMS);
    let c = 0;
    for (let u = 0; u < r; u++) {
      const h = o.getActiveUniform(n, u);
      const l = h.name.replace(/\[0\]$/, "");
      const m = {
        loc: o.getUniformLocation(n, h.name),
        type: h.type,
        unit: -1,
      };
      if (h.type === o.SAMPLER_2D || h.type === o.SAMPLER_2D_SHADOW) {
        m.unit = l === "u_shadowMap" ? 7 : l === "u_reflTex" ? 6 : c++;
      }
      a[l] = m;
    }
    return {
      prog: n,
      uniforms: a,
      key: s,
      globalFrame: -1,
      globalPass: -1,
    };
  }
  _setUniform(t, e, s) {
    const o = t.uniforms[e];
    if (!o || s === undefined) {
      return;
    }
    if (s === null) {
      s = IDENTITY_MATRIX;
    }
    const i = this.gl;
    switch (o.type) {
      case i.FLOAT:
        if (o.last === s) {
          return;
        }
        o.last = s;
        i.uniform1f(o.loc, s);
        break;
      case i.FLOAT_VEC2:
        i.uniform2fv(o.loc, s);
        break;
      case i.FLOAT_VEC3:
      case i.FLOAT_VEC4: {
        const n = o.last || (o.last = new Array(s.length).fill(NaN));
        let a = true;
        for (let r = 0; r < n.length; r++) {
          if (n[r] !== s[r]) {
            a = false;
            n[r] = s[r];
          }
        }
        if (a) {
          return;
        }
        if (o.type === i.FLOAT_VEC3) {
          i.uniform3fv(o.loc, s);
        } else {
          i.uniform4fv(o.loc, s);
        }
        break;
      }
      case i.FLOAT_MAT4:
        i.uniformMatrix4fv(o.loc, false, s);
        break;
      case i.INT:
      case i.BOOL:
        i.uniform1i(o.loc, s);
        break;
      case i.SAMPLER_2D:
      case i.SAMPLER_2D_SHADOW:
        i.activeTexture(i.TEXTURE0 + o.unit);
        i.bindTexture(i.TEXTURE_2D, s);
        i.uniform1i(o.loc, o.unit);
        break;
    }
  }
  createMesh(t, e = false) {
    const s = this.gl;
    const o = s.createVertexArray();
    s.bindVertexArray(o);
    const i = t.pos.length / 3;
    const n = (d, x, v, g, b, y = 0) => {
      const k = s.createBuffer();
      s.bindBuffer(s.ARRAY_BUFFER, k);
      s.bufferData(s.ARRAY_BUFFER, d, e ? s.DYNAMIC_DRAW : s.STATIC_DRAW);
      s.enableVertexAttribArray(x);
      s.vertexAttribPointer(x, v, g, b, y, 0);
      return k;
    };
    const a = t.pos instanceof Float32Array ? t.pos : new Float32Array(t.pos);
    const r = {};
    r.pos = n(a, 0, 3, s.FLOAT, false);
    const c = new Int8Array(i * 4);
    for (let d = 0; d < i; d++) {
      c[d * 4] = Math.round(t.nor[d * 3] * 127);
      c[d * 4 + 1] = Math.round(t.nor[d * 3 + 1] * 127);
      c[d * 4 + 2] = Math.round(t.nor[d * 3 + 2] * 127);
    }
    r.nor = n(c, 1, 3, s.BYTE, true, 4);
    const u = new Uint8Array(i * 4);
    for (let d = 0; d < i * 4; d++) {
      u[d] = Math.max(0, Math.min(255, Math.round(t.col[d] * 255)));
    }
    r.col = n(u, 2, 4, s.UNSIGNED_BYTE, true);
    let h = s.FLOAT;
    let l = false;
    if (t.ext && t.extBytes) {
      const d = new Uint8Array(i * 4);
      for (let x = 0; x < i * 4; x++) {
        d[x] = Math.max(0, Math.min(255, Math.round(t.ext[x] * 255)));
      }
      r.ext = n(d, 3, 4, s.UNSIGNED_BYTE, true);
      h = s.UNSIGNED_BYTE;
      l = true;
    } else if (t.ext) {
      r.ext = n(
        t.ext instanceof Float32Array ? t.ext : new Float32Array(t.ext),
        3,
        4,
        s.FLOAT,
        false,
      );
    } else {
      s.disableVertexAttribArray(3);
      s.vertexAttrib4f(3, 0, 0, 0, 0);
    }
    const m = s.createBuffer();
    s.bindBuffer(s.ELEMENT_ARRAY_BUFFER, m);
    const p = i > 65535 ? new Uint32Array(t.idx) : new Uint16Array(t.idx);
    s.bufferData(s.ELEMENT_ARRAY_BUFFER, p, s.STATIC_DRAW);
    s.bindVertexArray(null);
    return {
      vao: o,
      bufs: r,
      ib: m,
      count: t.idx.length,
      indexType: i > 65535 ? s.UNSIGNED_INT : s.UNSIGNED_SHORT,
      instanceCount: 0,
      vertexCount: i,
      extType: h,
      extNorm: l,
    };
  }
  createInstanced(t, e, s) {
    const o = this.gl;
    const i = o.createVertexArray();
    o.bindVertexArray(i);
    const n = (r, c, u, h, l, m = 0) => {
      o.bindBuffer(o.ARRAY_BUFFER, r);
      o.enableVertexAttribArray(c);
      o.vertexAttribPointer(c, u, h, l, m, 0);
    };
    n(t.bufs.pos, 0, 3, o.FLOAT, false);
    n(t.bufs.nor, 1, 3, o.BYTE, true, 4);
    n(t.bufs.col, 2, 4, o.UNSIGNED_BYTE, true);
    if (t.bufs.ext) {
      n(t.bufs.ext, 3, 4, t.extType || o.FLOAT, !!t.extNorm);
    } else {
      o.disableVertexAttribArray(3);
      o.vertexAttrib4f(3, 0, 0, 0, 0);
    }
    o.bindBuffer(o.ELEMENT_ARRAY_BUFFER, t.ib);
    const a = o.createBuffer();
    o.bindBuffer(o.ARRAY_BUFFER, a);
    o.bufferData(o.ARRAY_BUFFER, e, o.DYNAMIC_DRAW);
    for (let r = 0; r < 3; r++) {
      o.enableVertexAttribArray(4 + r);
      o.vertexAttribPointer(4 + r, 4, o.FLOAT, false, 48, r * 16);
      o.vertexAttribDivisor(4 + r, 1);
    }
    o.bindVertexArray(null);
    return {
      vao: i,
      ibuf: a,
      count: t.count,
      indexType: t.indexType,
      instanceCount: s,
      mesh: t,
    };
  }
  updateInstances(t, e, s) {
    const o = this.gl;
    o.bindBuffer(o.ARRAY_BUFFER, t.ibuf);
    o.bufferData(o.ARRAY_BUFFER, e, o.DYNAMIC_DRAW);
    t.instanceCount = s;
  }
  updateBuffer(t, e) {
    const s = this.gl;
    s.bindBuffer(s.ARRAY_BUFFER, t);
    s.bufferSubData(s.ARRAY_BUFFER, 0, e);
  }
  createTexture(t, e = {}) {
    const s = this.gl;
    const o = s.createTexture();
    s.bindTexture(s.TEXTURE_2D, o);
    s.texImage2D(s.TEXTURE_2D, 0, s.RGBA, s.RGBA, s.UNSIGNED_BYTE, t);
    s.generateMipmap(s.TEXTURE_2D);
    s.texParameteri(s.TEXTURE_2D, s.TEXTURE_MIN_FILTER, s.LINEAR_MIPMAP_LINEAR);
    s.texParameteri(s.TEXTURE_2D, s.TEXTURE_MAG_FILTER, s.LINEAR);
    const i = e.repeat ? s.REPEAT : s.CLAMP_TO_EDGE;
    s.texParameteri(s.TEXTURE_2D, s.TEXTURE_WRAP_S, i);
    s.texParameteri(s.TEXTURE_2D, s.TEXTURE_WRAP_T, i);
    return o;
  }
  setShadowSize(t) {
    const e = this.gl;
    if (t === this.shadowSize) {
      return;
    }
    if (this.shadowTex) {
      e.deleteTexture(this.shadowTex);
      e.deleteFramebuffer(this.shadowFB);
    }
    this.shadowSize = t;
    this.shadowTex = null;
    this.shadowFB = null;
    if (!t) {
      this.refreshPrograms();
      return;
    }
    const s = e.createTexture();
    e.bindTexture(e.TEXTURE_2D, s);
    e.texStorage2D(e.TEXTURE_2D, 1, e.DEPTH_COMPONENT24, t, t);
    e.texParameteri(e.TEXTURE_2D, e.TEXTURE_MIN_FILTER, e.LINEAR);
    e.texParameteri(e.TEXTURE_2D, e.TEXTURE_MAG_FILTER, e.LINEAR);
    e.texParameteri(e.TEXTURE_2D, e.TEXTURE_WRAP_S, e.CLAMP_TO_EDGE);
    e.texParameteri(e.TEXTURE_2D, e.TEXTURE_WRAP_T, e.CLAMP_TO_EDGE);
    e.texParameteri(e.TEXTURE_2D, e.TEXTURE_COMPARE_MODE, e.COMPARE_REF_TO_TEXTURE);
    e.texParameteri(e.TEXTURE_2D, e.TEXTURE_COMPARE_FUNC, e.LEQUAL);
    const o = e.createFramebuffer();
    e.bindFramebuffer(e.FRAMEBUFFER, o);
    e.framebufferTexture2D(e.FRAMEBUFFER, e.DEPTH_ATTACHMENT, e.TEXTURE_2D, s, 0);
    e.drawBuffers([e.NONE]);
    e.readBuffer(e.NONE);
    e.bindFramebuffer(e.FRAMEBUFFER, null);
    this.shadowTex = s;
    this.shadowFB = o;
    this.refreshPrograms();
  }
  createTarget(t, e) {
    const s = this.gl;
    const o = s.createTexture();
    s.bindTexture(s.TEXTURE_2D, o);
    s.texImage2D(s.TEXTURE_2D, 0, s.RGBA8, t, e, 0, s.RGBA, s.UNSIGNED_BYTE, null);
    s.texParameteri(s.TEXTURE_2D, s.TEXTURE_MIN_FILTER, s.LINEAR);
    s.texParameteri(s.TEXTURE_2D, s.TEXTURE_MAG_FILTER, s.LINEAR);
    s.texParameteri(s.TEXTURE_2D, s.TEXTURE_WRAP_S, s.CLAMP_TO_EDGE);
    s.texParameteri(s.TEXTURE_2D, s.TEXTURE_WRAP_T, s.CLAMP_TO_EDGE);
    const i = s.createRenderbuffer();
    s.bindRenderbuffer(s.RENDERBUFFER, i);
    s.renderbufferStorage(s.RENDERBUFFER, s.DEPTH_COMPONENT24, t, e);
    const n = s.createFramebuffer();
    s.bindFramebuffer(s.FRAMEBUFFER, n);
    s.framebufferTexture2D(s.FRAMEBUFFER, s.COLOR_ATTACHMENT0, s.TEXTURE_2D, o, 0);
    s.framebufferRenderbuffer(s.FRAMEBUFFER, s.DEPTH_ATTACHMENT, s.RENDERBUFFER, i);
    s.bindFramebuffer(s.FRAMEBUFFER, null);
    return {
      fb: n,
      tex: o,
      rb: i,
      w: t,
      h: e,
    };
  }
  deleteTarget(t) {
    if (!t) {
      return;
    }
    const e = this.gl;
    e.deleteTexture(t.tex);
    e.deleteRenderbuffer(t.rb);
    e.deleteFramebuffer(t.fb);
  }
  add(t) {
    this.makeItem(t);
    this.items.push(t);
    return t;
  }
  makeItem(t) {
    t.visible = t.visible !== false;
    t.layer = t.layer || "near";
    t.uniforms = Object.assign({}, PROGRAM_DEFAULTS[t.prog || "world"] || {}, t.uniforms || {});
    t.defines = t.defines || [];
    t.order = t.order || 0;
    t.maxDist = t.maxDist || Infinity;
    t.minDist = t.minDist || 0;
    t.reflect = t.reflect !== false;
    t._p = this._progFor(t);
    return t;
  }
  addGroup() {
    const t = {
      all: [],
      active: [],
    };
    this.groups.push(t);
    return t;
  }
  _progFor(t) {
    const e = t.prog || "world";
    const s = t.defines.slice();
    if (e === "world" && this.shadowSize > 0 && s.indexOf("OUTLINE") < 0) {
      s.push("SHADOWS");
    }
    return this.program(e, s);
  }
  refreshPrograms() {
    for (const t of this.items) {
      t._p = this._progFor(t);
    }
    for (const t of this.groups) {
      for (const e of t.all) {
        e._p = this._progFor(e);
      }
    }
  }
  remove(t) {
    const e = this.items.indexOf(t);
    if (e >= 0) {
      this.items.splice(e, 1);
    }
  }
  resize() {
    const t = this.canvas;
    const e = Math.max(1, Math.floor(t.clientWidth * this.pixelRatio));
    const s = Math.max(1, Math.floor(t.clientHeight * this.pixelRatio));
    if (t.width !== e || t.height !== s) {
      t.width = e;
      t.height = s;
    }
    return [e, s];
  }
  _useProgram(t, e, s) {
    const o = this.gl;
    if (this._st.prog !== t) {
      o.useProgram(t.prog);
      this._st.prog = t;
    }
    if (t.globalFrame !== this.frameId || t.globalPass !== e) {
      t.globalFrame = this.frameId;
      t.globalPass = e;
      for (const i in s) {
        this._setUniform(t, i, s[i]);
      }
    }
  }
  _resetState() {
    this._st = {
      cull: null,
      blend: null,
      depth: null,
      poly: null,
      prog: null,
    };
  }
  _applyState(t) {
    const e = this.gl;
    const s = this._st;
    const o = t.cull || "back";
    if (s.cull !== o) {
      if (o === "none") {
        e.disable(e.CULL_FACE);
      } else {
        e.enable(e.CULL_FACE);
        e.cullFace(o === "front" ? e.FRONT : e.BACK);
      }
      s.cull = o;
    }
    const i = !!t.blend;
    if (s.blend !== i) {
      if (i) {
        e.enable(e.BLEND);
        e.blendFuncSeparate(e.SRC_ALPHA, e.ONE_MINUS_SRC_ALPHA, e.ONE, e.ONE_MINUS_SRC_ALPHA);
      } else {
        e.disable(e.BLEND);
      }
      s.blend = i;
    }
    const n = t.depthWrite !== false;
    if (s.depth !== n) {
      e.depthMask(n);
      s.depth = n;
    }
    const a = t.polyOffset ? t.polyOffset[0] + "," + t.polyOffset[1] : "";
    if (s.poly !== a) {
      if (t.polyOffset) {
        e.enable(e.POLYGON_OFFSET_FILL);
        e.polygonOffset(t.polyOffset[0], t.polyOffset[1]);
      } else {
        e.disable(e.POLYGON_OFFSET_FILL);
      }
      s.poly = a;
    }
  }
  _draw(t, e) {
    const s = this.gl;
    if (this.profile && t.mesh) {
      const i = t.tag || (t.defines && t.defines.join("+")) || t.prog || "?";
      const n = t.mesh;
      const a = n.mesh
        ? (n.count / 3) * n.instanceCount
        : (t.drawCount !== undefined ? t.drawCount : n.count) / 3;
      const r =
        this.profile[i] ||
        (this.profile[i] = {
          draws: 0,
          tris: 0,
        });
      r.draws++;
      r.tris += a;
    }
    for (const i in t.uniforms) {
      this._setUniform(e, i, t.uniforms[i]);
    }
    const o = t.mesh;
    s.bindVertexArray(o.vao);
    if (o.instanceCount !== undefined && o.mesh) {
      const i =
        t.instances !== undefined ? Math.min(t.instances, o.instanceCount) : o.instanceCount;
      if (i <= 0) {
        return;
      }
      s.drawElementsInstanced(s.TRIANGLES, o.count, o.indexType, 0, i);
      this.stats.tris += (o.count / 3) * i;
    } else {
      const i = t.drawCount !== undefined ? t.drawCount : o.count;
      if (i <= 0) {
        return;
      }
      s.drawElements(s.TRIANGLES, i, o.indexType, 0);
      this.stats.tris += i / 3;
    }
    this.stats.draws++;
  }
  _visible(t, e, s) {
    if (!t.visible) {
      return false;
    }
    if (t.bounds) {
      const o = t.bounds;
      if (t.maxDist !== Infinity || t.minDist > 0) {
        const i = o.c[0] - e.pos[0];
        const n = o.c[1] - e.pos[1];
        const a = o.c[2] - e.pos[2];
        const r = Math.sqrt(i * i + n * n + a * a);
        if (r - o.r > t.maxDist || r + o.r < t.minDist) {
          return false;
        }
      }
      if (!sphereInFrustum(s, o.c[0], o.c[1], o.c[2], o.r)) {
        return false;
      }
    }
    return true;
  }
  renderShadows(t, e, s) {
    if (!this.shadowFB) {
      return;
    }
    const o = this.gl;
    const i = this.shadowSize;
    const n = mat4Create();
    const a = mat4Create();
    const r = (s * 2) / i;
    const c = Math.abs(e[1]) > 0.99 ? [1, 0, 0] : [0, 1, 0];
    const u = [0, 0, 0];
    const h = [e[0] * 600, e[1] * 600, e[2] * 600];
    mat4LookAt(n, h, u, c);
    const l = n[0] * t[0] + n[4] * t[1] + n[8] * t[2];
    const m = n[1] * t[0] + n[5] * t[1] + n[9] * t[2];
    const p = n[2] * t[0] + n[6] * t[1] + n[10] * t[2] + n[14];
    const d = Math.floor(l / r) * r;
    const x = Math.floor(m / r) * r;
    mat4Ortho(a, d - s, d + s, x - s, x + s, -p - 700, -p + 700);
    mat4Multiply(this.shadowMat, a, n);
    const v = frustumPlanes(this.shadowMat);
    o.bindFramebuffer(o.FRAMEBUFFER, this.shadowFB);
    o.viewport(0, 0, i, i);
    o.depthMask(true);
    o.clear(o.DEPTH_BUFFER_BIT);
    o.enable(o.POLYGON_OFFSET_FILL);
    const g = Object.assign({}, this.globals, { u_viewProj: this.shadowMat });
    const b = "shadow" + this.frameId;
    this._resetState();
    o.disable(o.BLEND);
    o.enable(o.CULL_FACE);
    o.cullFace(o.BACK);
    o.polygonOffset(1.5, 3);
    const y = {
      mesh: null,
      uniforms: { u_model: null },
      drawCount: undefined,
      instances: undefined,
      tag: "shadow",
    };
    const k = (w) => {
      if (
        !(!w.shadow || !w.visible || w.layer !== "near") &&
        !(w.bounds && !sphereInFrustum(v, w.bounds.c[0], w.bounds.c[1], w.bounds.c[2], w.bounds.r))
      ) {
        if (w.bounds && w.shadowDist) {
          const M = w.bounds.c[0] - t[0];
          const _ = w.bounds.c[2] - t[2];
          if (Math.sqrt(M * M + _ * _) - w.bounds.r > w.shadowDist) {
            return;
          }
        }
        if (!w._pd) {
          w._pd = this.program(
            w.prog || "world",
            w.defines.filter((M) => M === "INSTANCED" || M === "WIND").concat(["DEPTH"]),
          );
        }
        this._useProgram(w._pd, b, g);
        y.mesh = w.shadowMesh || w.mesh;
        y.uniforms.u_model = w.uniforms.u_model;
        y.drawCount = w.drawCount;
        this._draw(y, w._pd);
      }
    };
    for (const w of this.items) {
      k(w);
    }
    for (const w of this.groups) {
      for (const M of w.active) {
        k(M);
      }
    }
    o.disable(o.POLYGON_OFFSET_FILL);
    o.bindFramebuffer(o.FRAMEBUFFER, null);
    this._resetState();
  }
  render(t, e = {}) {
    const s = this.gl;
    this.frameId++;
    this.stats.draws = 0;
    this.stats.tris = 0;
    const o = e.target || null;
    const i = !!e.reflection;
    let n;
    let a;
    if (o) {
      n = o.w;
      a = o.h;
    } else {
      [n, a] = this.resize();
    }
    t.aspect = n / a;
    s.bindFramebuffer(s.FRAMEBUFFER, o ? o.fb : null);
    s.viewport(0, 0, n, a);
    this._resetState();
    s.depthMask(true);
    s.clearColor(0.6, 0.75, 0.9, 1);
    s.clear(s.COLOR_BUFFER_BIT | s.DEPTH_BUFFER_BIT);
    const r = [
      {
        layer: "far",
        near: 25,
        far: 40000,
      },
      {
        layer: "near",
        near: t.near,
        far: t.far,
      },
    ];
    for (const c of r) {
      t.update(c.near, c.far);
      const u = frustumPlanes(t.viewProj, this.planes);
      const h = Object.assign({}, this.globals, {
        u_viewProj: t.viewProj,
        u_camPos: t.pos,
        u_camRight: t.right,
        u_camUp: t.upv,
        u_shadowMat: this.shadowMat,
        u_shadowTexel: this.shadowSize ? 1 / this.shadowSize : 0,
        u_clipY: e.clipY !== undefined ? e.clipY : -1000000000,
      });
      if (this.shadowTex) {
        h.u_shadowMap = this.shadowTex;
      }
      const l = c.layer + (i ? "R" : "") + this.frameId;
      const m = [];
      const p = [];
      const d = (x) => {
        if (x.layer === c.layer) {
          if (!((i && !x.reflect) || (!i && x.onlyReflect))) {
            if (this._visible(x, t, u)) {
              (x.blend ? p : m).push(x);
            }
          }
        }
      };
      for (const x of this.items) {
        d(x);
      }
      for (const x of this.groups) {
        for (const v of x.active) {
          d(v);
        }
      }
      m.sort(
        (x, v) => x.order - v.order || (x._p.key < v._p.key ? -1 : x._p.key > v._p.key ? 1 : 0),
      );
      for (const x of p) {
        const v = x.bounds ? x.bounds.c : t.pos;
        x._d = (v[0] - t.pos[0]) ** 2 + (v[1] - t.pos[1]) ** 2 + (v[2] - t.pos[2]) ** 2;
      }
      p.sort((x, v) => x.order - v.order || v._d - x._d);
      for (const x of m.concat(p)) {
        let v = x._p;
        if (i && x.defines.indexOf("CLIP") < 0 && (x.prog || "world") === "world") {
          if (!x._pr) {
            x._pr = this.program("world", x.defines.concat(["CLIP"]));
          }
          v = x._pr;
        }
        this._useProgram(v, l, h);
        this._applyState(x);
        this._draw(x, v);
      }
      if (c.layer === "far") {
        s.depthMask(true);
        this._st.depth = true;
        s.clear(s.DEPTH_BUFFER_BIT);
      }
    }
    s.depthMask(true);
    s.disable(s.BLEND);
    s.disable(s.POLYGON_OFFSET_FILL);
    s.bindFramebuffer(s.FRAMEBUFFER, null);
    this._resetState();
  }
}
