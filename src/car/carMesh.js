// Построение 3D-модели машины по её размерам и форме кузова (из описания в cars.js).

import { lerp } from "../core/math.js";
import {
  MeshBuilder,
  boxGeo,
  cylinderGeo,
  icosphereGeo,
  latheGeo,
  loftGeo,
  makeTransform,
} from "../render/mesh.js";

function curveAt(curve, x) {
  if (x <= curve[0][0]) {
    return curve[0][1];
  }
  for (let e = 0; e < curve.length - 1; e++) {
    const s = curve[e];
    const o = curve[e + 1];
    if (x <= o[0]) {
      const i = (x - s[0]) / (o[0] - s[0]);
      const n = i * i * (3 - 2 * i);
      return s[1] + (o[1] - s[1]) * n;
    }
  }
  return curve[curve.length - 1][1];
}

const paintMat = (f = 0.75) => ({
  c: [1, 1, 1, 1],
  e: [f, 0, 0, 0],
});

const GLASS = {
  c: [0.1, 0.13, 0.19, 0],
  e: [1, 0, 0, 0],
};

const TIRE = {
  c: [0.07, 0.07, 0.08, 0],
  e: [0.25, 0, 0, 0],
};

const BLACK_PLASTIC = {
  c: [0.05, 0.05, 0.055, 0],
  e: [0.05, 0, 0, 0],
};

const TRIM = {
  c: [0.12, 0.12, 0.13, 0],
  e: [0.2, 0, 0, 0],
};

const CHROME = {
  c: [0.75, 0.76, 0.8, 0],
  e: [0.9, 0, 0, 0],
};

const STEEL_MAT = {
  c: [0.38, 0.39, 0.42, 0],
  e: [0.75, 0, 0, 0],
};

function setMaterial(f, t) {
  for (let e = 0; e < f.vertexCount; e++) {
    f.col[e * 4] = t.c[0];
    f.col[e * 4 + 1] = t.c[1];
    f.col[e * 4 + 2] = t.c[2];
    f.col[e * 4 + 3] = t.c[3];
  }
  f.ext = [];
  for (let e = 0; e < f.vertexCount; e++) {
    f.ext.push(t.e[0], t.e[1], t.e[2], t.e[3]);
  }
  return f;
}

function ringProfile(f, t, e, s, o, i, n) {
  const a = [];
  const r = (t + e) / 2;
  const c = (e - t) / 2;
  for (let u = 0; u < o; u++) {
    const h = (u / o) * Math.PI * 2;
    const l = Math.cos(h);
    const m = Math.sin(h);
    let p = f * Math.sign(l) * Math.abs(l) ** (2 / s);
    const d = r + c * Math.sign(m) * Math.abs(m) ** (2 / s);
    const x = (d - t) / (e - t || 1);
    p *= 1 - i * x * x - n * (1 - x) * (1 - x) * (1 - x);
    a.push([p, d]);
  }
  return a;
}

export function buildCarGeometry(f) {
  const t = f.body;
  const e = t.L;
  const s = e / 2;
  const o = t.wr;
  const i = [t.wb / 2 + t.wOff, -t.wb / 2 + t.wOff];
  const n = (I) => {
    let B = -1;
    for (const G of i) {
      const K = Math.abs(I - G);
      const rt = o + 0.07;
      if (K < rt) {
        B = Math.max(B, o + Math.sqrt(rt * rt - K * K) * 0.98);
      }
    }
    return B;
  };
  const a = (I) => curveAt(t.top, I);
  const r = (I) => Math.max(curveAt(t.bottom, I), n(I));
  const c = (I) => {
    let B = (curveAt(t.plan, I) * t.W) / 2;
    for (const G of i) {
      B += t.flare * Math.exp(-(((I - G) / (o * 1.25)) ** 2));
    }
    return B;
  };
  const u = 36;
  const h = t.cabin;
  const l = [];
  const m = 60;
  for (let I = 0; I <= m; I++) {
    const B = I / m;
    l.push(-s + e * (0.5 - 0.5 * Math.cos(B * Math.PI)));
  }
  const p = [h.z0 - 0.1, h.pillars && h.pillars.length ? h.pillars[0] : h.re + 0.15];
  for (const I of p) {
    l.push(I - 0.018, I, I + 0.018);
  }
  l.sort((I, B) => I - B);
  for (let I = l.length - 1; I > 0; I--) {
    if (l[I] - l[I - 1] < 0.005) {
      l.splice(I, 1);
    }
  }
  const d = l.map((I) => {
    const B = a(I);
    const G = Math.min(r(I), B - 0.08);
    return {
      z: I,
      pts: ringProfile(c(I), G, B, t.square, u, t.tumbleBody, 0.12),
    };
  });
  const x = loftGeo(d, () => [1, 1, 1, 1]);
  x.ext = [];
  for (let I = 0; I < x.vertexCount; I++) {
    const B = x.pos[I * 3 + 1];
    const G = x.pos[I * 3 + 2];
    const K = Math.abs(x.pos[I * 3]);
    const rt = Math.abs(x.nor[I * 3]);
    const ct = x.nor[I * 3 + 1];
    let J = paintMat(f.gloss || 0.75);
    if (B < t.trimY + (Math.abs(G) > s - 0.35 ? 0.06 : 0)) {
      J = TIRE;
    }
    if (G > s - 0.08 && B < t.grilleY && B > t.trimY && K < t.W * 0.3) {
      J = TIRE;
    }
    if (G > s - 0.14 && B > t.trimY - 0.03 && B < t.trimY + 0.11 && K < t.W * 0.38) {
      J = BLACK_PLASTIC;
    }
    const st = n(G);
    if (st > 0 && ct < -0.15 && B < st + 0.03) {
      J = BLACK_PLASTIC;
    }
    for (const At of p) {
      if (Math.abs(G - At) < 0.004 && rt > 0.45 && B > t.trimY + 0.05 && B < a(G) - 0.03) {
        J = TRIM;
      }
    }
    x.col[I * 4] = J.c[0];
    x.col[I * 4 + 1] = J.c[1];
    x.col[I * 4 + 2] = J.c[2];
    x.col[I * 4 + 3] = J.c[3];
    x.ext.push(...J.e);
  }
  const v = (I) =>
    curveAt(
      [
        [h.z1, a(h.z1) - 0.02],
        [h.re, t.H - 0.02],
        [h.ws, t.H],
        [h.z0, a(h.z0) - 0.02],
      ],
      I,
    );
  const g = [];
  const b = 44;
  for (let I = 0; I <= b; I++) {
    g.push(lerp(h.z1, h.z0, I / b));
  }
  const y = g.map((I) => {
    const B = a(I) - 0.06;
    const G = Math.max(v(I), B + 0.02);
    return {
      z: I,
      pts: ringProfile(c(I) * h.w, B, G, 3.2, u, h.tumble, 0),
    };
  });
  const k = loftGeo(y, () => [1, 1, 1, 1]);
  k.ext = [];
  const w = f.blackPillars ? TIRE : paintMat(f.gloss || 0.75);
  for (let I = 0; I < k.vertexCount; I++) {
    const B = k.pos[I * 3 + 1];
    const G = k.pos[I * 3 + 2];
    const K = Math.abs(k.nor[I * 3]);
    const rt = k.nor[I * 3 + 1];
    let ct = GLASS;
    if (rt > 0.5 && G < h.ws - 0.05 && G > h.re + 0.05) {
      ct = paintMat(f.gloss || 0.75);
    }
    if (K > 0.3 && K < 0.82 && rt > 0.15 && (G > h.ws - 0.02 || G < h.re + 0.02)) {
      ct = w;
    }
    for (const J of h.pillars || []) {
      if (Math.abs(G - J) < 0.05 && K > 0.35) {
        ct = w;
      }
    }
    if (K > 0.35 && rt > 0.35 && G < h.ws && G > h.re) {
      ct = w;
    }
    if (B < a(G) - 0.01 + 0.035) {
      ct = w;
    }
    k.col[I * 4] = ct.c[0];
    k.col[I * 4 + 1] = ct.c[1];
    k.col[I * 4 + 2] = ct.c[2];
    k.col[I * 4 + 3] = ct.c[3];
    k.ext.push(...ct.e);
  }
  const M = new MeshBuilder();
  M.append(x);
  M.append(k);
  const _ = (I, B, G) => M.append(setMaterial(I, B), G);
  const z = (I, B, G) => ({
    c: [G[0], G[1], G[2], 0],
    e: [0.6, I, B, 0],
  });
  const T = t.headlight;
  for (const I of [-1, 1]) {
    const B = s - T.inset;
    const G = curveAt(t.top, B) - T.drop - 0.035;
    if (T.round) {
      _(
        cylinderGeo(T.r * 1.3, T.r * 1.3, 0, 0.04, 14, [1, 1, 1, 1]),
        BLACK_PLASTIC,
        makeTransform(I * T.x, G, B + 0.005, 0, 1, 1, 1, Math.PI / 2 - T.tilt),
      );
      _(
        cylinderGeo(T.r, T.r, 0, 0.05, 14, [1, 1, 1, 1]),
        z(1.4, 0, [1, 0.97, 0.86]),
        makeTransform(I * T.x, G, B + 0.02, 0, 1, 1, 1, Math.PI / 2 - T.tilt),
      );
    } else {
      _(
        icosphereGeo(1, 1, [1, 1, 1, 1]),
        BLACK_PLASTIC,
        makeTransform(I * T.x, G, B - 0.012, I * T.yaw, T.w * 1.18, T.h * 1.45, T.d, -T.tilt),
      );
      _(
        icosphereGeo(1, 1, [1, 1, 1, 1]),
        z(1.4, 0, [1, 0.97, 0.86]),
        makeTransform(I * T.x, G, B, I * T.yaw, T.w, T.h, T.d, -T.tilt),
      );
      _(
        boxGeo(T.w * 1.3, 0.014, 0.03, [1, 1, 1, 1]),
        z(1.6, 0, [0.9, 0.95, 1]),
        makeTransform(I * (T.x - 0.03), G - T.h * 0.85, B + 0.035, I * T.yaw, 1, 1, 1, -T.tilt),
      );
    }
  }
  if (T.popup) {
    for (const I of [-1, 1]) {
      _(
        boxGeo(0.36, 0.04, 0.3, [1, 1, 1, 1]),
        paintMat(),
        makeTransform(I * T.x, curveAt(t.top, s - 0.35) + 0.005, s - 0.35, 0, 1, 1, 1, -0.08),
      );
    }
  }
  const S = t.taillight;
  const E = z(0.6, 1.6, [1, 0.12, 0.1]);
  for (const I of [-1, 1]) {
    const B = -s + S.inset;
    const G = curveAt(t.top, B) - S.drop;
    if (S.round) {
      for (const K of [0, 1]) {
        const rt = I * (S.x - K * S.r * 2.3);
        _(
          cylinderGeo(S.r * 1.28, S.r * 1.28, 0, 0.04, 14, [1, 1, 1, 1]),
          BLACK_PLASTIC,
          makeTransform(rt, G, B - 0.005, 0, 1, 1, 1, -Math.PI / 2),
        );
        _(
          cylinderGeo(S.r, S.r, 0, 0.05, 14, [1, 1, 1, 1]),
          E,
          makeTransform(rt, G, B - 0.02, 0, 1, 1, 1, -Math.PI / 2),
        );
        _(
          cylinderGeo(S.r * 0.45, S.r * 0.45, 0, 0.055, 10, [1, 1, 1, 1]),
          z(0.9, 2.2, [1, 0.35, 0.3]),
          makeTransform(rt, G, B - 0.025, 0, 1, 1, 1, -Math.PI / 2),
        );
      }
    } else {
      _(
        boxGeo(S.w + 0.05, S.h + 0.04, 0.05, [1, 1, 1, 1]),
        BLACK_PLASTIC,
        makeTransform(I * S.x, G, B + 0.004),
      );
      _(boxGeo(S.w, S.h, 0.06, [1, 1, 1, 1]), E, makeTransform(I * S.x, G, B));
      _(
        boxGeo(S.w * 0.8, S.h * 0.22, 0.065, [1, 1, 1, 1]),
        z(0.9, 2.2, [1, 0.35, 0.3]),
        makeTransform(I * S.x, G + S.h * 0.18, B),
      );
    }
  }
  if (S.bar) {
    _(
      boxGeo(t.W * 0.5, 0.035, 0.05, [1, 1, 1, 1]),
      z(0.5, 1.4, [1, 0.15, 0.1]),
      makeTransform(0, curveAt(t.top, -s + S.inset) - S.drop, -s + S.inset),
    );
  }
  _(
    boxGeo(0.34, 0.025, 0.03, [1, 1, 1, 1]),
    z(0.5, 1.8, [1, 0.12, 0.1]),
    makeTransform(0, v(h.re - 0.06) - 0.035, h.re - 0.06),
  );
  for (const I of [-1, 1]) {
    const B = h.z0 - 0.1;
    const G = a(B);
    const K = c(B) * 0.92;
    _(boxGeo(0.1, 0.028, 0.05, [1, 1, 1, 1]), TIRE, makeTransform(I * (K + 0.04), G + 0.045, B));
    _(
      icosphereGeo(1, 1, [1, 1, 1, 1]),
      paintMat(f.gloss || 0.75),
      makeTransform(I * (K + 0.12), G + 0.075, B, I * 0.12, 0.085, 0.048, 0.06),
    );
    _(
      boxGeo(0.13, 0.06, 0.008, [1, 1, 1, 1]),
      GLASS,
      makeTransform(I * (K + 0.12), G + 0.075, B - 0.056, I * 0.12),
    );
  }
  const P = {
    c: [0.95, 0.95, 0.9, 0],
    e: [0.3, 0.1, 0, 0],
  };
  for (const [I, B, G] of [
    [-s - 0.01, t.plateY, -1],
    [s, t.plateY + 0.02, 1],
  ]) {
    _(boxGeo(0.42, 0.11, 0.02, [1, 1, 1, 1]), P, makeTransform(0, B, I));
    for (let K = 0; K < 4; K++) {
      _(
        boxGeo(0.055, 0.05, 0.006, [1, 1, 1, 1]),
        TRIM,
        makeTransform(-0.12 + K * 0.08, B - 0.005, I + G * 0.012),
      );
    }
  }
  _(
    boxGeo(t.W * 0.6, 0.05, 0.3, [1, 1, 1, 1]),
    BLACK_PLASTIC,
    makeTransform(0, t.trimY, -s + 0.16, 0, 1, 1, 1, -0.1),
  );
  for (let I = -2; I <= 2; I++) {
    _(
      boxGeo(0.02, 0.06, 0.24, [1, 1, 1, 1]),
      TIRE,
      makeTransform(I * t.W * 0.11, t.trimY - 0.005, -s + 0.13, 0, 1, 1, 1, -0.1),
    );
  }
  for (const I of f.exhaust || [-0.35, 0.35]) {
    _(
      cylinderGeo(0.055, 0.05, 0, 0.16, 12, [1, 1, 1, 1], false),
      STEEL_MAT,
      makeTransform(I, t.trimY + 0.01, -s + 0.03, 0, 1, 1, 1, Math.PI / 2),
    );
    _(
      cylinderGeo(0.042, 0.042, 0, 0.14, 10, [1, 1, 1, 1]),
      BLACK_PLASTIC,
      makeTransform(I, t.trimY + 0.01, -s + 0.035, 0, 1, 1, 1, Math.PI / 2),
    );
  }
  for (const I of i) {
    for (const B of [-1, 1]) {
      const G = new MeshBuilder();
      const K = o + 0.06;
      const rt = B * (t.track / 2 - t.ww * 0.8);
      const ct = B * (c(I) - 0.03);
      const J = [];
      for (let st = 0; st <= 10; st++) {
        const At = Math.PI * (-0.06 + (1.12 * st) / 10);
        const Wt = o + Math.sin(At) * K;
        const Dt = I + Math.cos(At) * K;
        J.push([
          G.vertex(rt, Wt, Dt, 0, -Math.sin(At), -Math.cos(At)),
          G.vertex(ct, Wt, Dt, 0, -Math.sin(At), -Math.cos(At)),
        ]);
      }
      for (let st = 0; st < 10; st++) {
        G.quad(J[st][0], J[st][1], J[st + 1][1], J[st + 1][0]);
        G.quad(J[st][0], J[st + 1][0], J[st + 1][1], J[st][1]);
      }
      _(G, BLACK_PLASTIC);
    }
  }
  const F = t.spoiler;
  if (F) {
    const I = -s + F.z;
    const B = curveAt(t.top, I);
    if (F.type === "wing") {
      _(
        boxGeo(t.W * F.w, 0.035, F.d, [1, 1, 1, 1]),
        F.black ? TIRE : paintMat(),
        makeTransform(0, B + F.h, I, 0, 1, 1, 1, F.tilt || 0.08),
      );
      for (const G of [-1, 1]) {
        _(
          boxGeo(0.04, F.h, 0.14, [1, 1, 1, 1]),
          TIRE,
          makeTransform(G * t.W * F.w * 0.32, B + F.h / 2, I),
        );
        _(
          boxGeo(0.03, 0.16, F.d + 0.04, [1, 1, 1, 1]),
          F.black ? TIRE : paintMat(),
          makeTransform(G * t.W * F.w * 0.5, B + F.h + 0.03, I),
        );
      }
    } else if (F.type === "lip") {
      _(
        boxGeo(t.W * 0.8, 0.05, 0.16, [1, 1, 1, 1]),
        paintMat(),
        makeTransform(0, B + 0.03, I, 0, 1, 1, 1, -0.25),
      );
    } else if (F.type === "roof") {
      const G = h.z1 + 0.05;
      _(
        boxGeo(t.W * 0.72, 0.05, 0.3, [1, 1, 1, 1]),
        paintMat(),
        makeTransform(0, t.H - 0.02, G, 0, 1, 1, 1, 0.15),
      );
    }
  }
  for (const I of f.extras || []) {
    if (I === "hoodScoop") {
      _(
        boxGeo(0.5, 0.08, 0.5, [1, 1, 1, 1]),
        TIRE,
        makeTransform(0, a(s * 0.45) + 0.02, s * 0.45, 0, 1, 1, 1, 0.05),
      );
    }
    if (I === "rallyLights") {
      for (const B of [-1.5, -0.5, 0.5, 1.5]) {
        _(
          cylinderGeo(0.08, 0.08, 0, 0.06, 10, [1, 1, 1, 1]),
          z(1.2, 0, [1, 0.98, 0.8]),
          makeTransform(
            B * 0.2,
            curveAt(t.top, s - 0.05) - 0.12,
            s + 0.02,
            0,
            1,
            1,
            1,
            Math.PI / 2,
          ),
        );
      }
    }
    if (I === "sideIntake") {
      for (const B of [-1, 1]) {
        _(
          boxGeo(0.04, 0.22, 0.6, [1, 1, 1, 1]),
          TIRE,
          makeTransform(B * (c(-0.6) - 0.01), 0.55, -0.6, B * 0.06),
        );
      }
    }
    if (I === "roofScoop") {
      _(
        boxGeo(0.3, 0.08, 0.35, [1, 1, 1, 1]),
        paintMat(),
        makeTransform(0, t.H + 0.02, h.ws + 0.35),
      );
    }
    if (I === "mudflaps") {
      for (const B of [-1, 1]) {
        _(
          boxGeo(0.3, 0.18, 0.02, [1, 1, 1, 1]),
          {
            c: [0.85, 0.15, 0.1, 0],
            e: [0.2, 0, 0, 0],
          },
          makeTransform(B * t.W * 0.4, 0.17, i[1] - o - 0.12),
        );
      }
    }
    if (I === "stripes") {
      _(
        boxGeo(0.18, 0.012, e * 0.38, [1, 1, 1, 1]),
        {
          c: f.stripeColor || [1, 1, 1, 0],
          e: [0.7, 0, 0, 0],
        },
        makeTransform(-0.13, a(s * 0.45) + 0.012, s * 0.5),
      );
      _(
        boxGeo(0.18, 0.012, e * 0.38, [1, 1, 1, 1]),
        {
          c: f.stripeColor || [1, 1, 1, 0],
          e: [0.7, 0, 0, 0],
        },
        makeTransform(0.13, a(s * 0.45) + 0.012, s * 0.5),
      );
    }
  }
  const L = t.ww;
  const D = latheGeo(
    [
      [o * 0.66, -L / 2],
      [o * 0.93, -L / 2],
      [o, -L / 2 + 0.05],
      [o, L / 2 - 0.05],
      [o * 0.93, L / 2],
      [o * 0.66, L / 2],
    ],
    22,
    [0.09, 0.09, 0.1, 0],
  );
  setMaterial(D, {
    c: [0.09, 0.09, 0.1, 0],
    e: [0.15, 0, 0, 0],
  });
  const q = new MeshBuilder();
  q.append(D);
  const W = f.rim || CHROME;
  const j = cylinderGeo(o * 0.67, o * 0.67, -L / 2 + 0.02, L / 2 - 0.095, 22, [1, 1, 1, 1], true);
  q.append(
    setMaterial(j, {
      c: [0.16, 0.16, 0.18, 0],
      e: [0.4, 0, 0, 0],
    }),
  );
  const Y = f.spokes || 5;
  for (let I = 0; I < Y; I++) {
    const B = (I / Y) * Math.PI * 2;
    const G = boxGeo(o * 0.12, 0.05, o * 0.62, [1, 1, 1, 1]);
    q.append(
      setMaterial(G, W),
      makeTransform(Math.sin(B) * o * 0.33, L / 2 - 0.035, Math.cos(B) * o * 0.33, B),
    );
  }
  q.append(
    setMaterial(
      cylinderGeo(o * 0.62, o * 0.65, L / 2 - 0.06, L / 2 - 0.02, 22, [1, 1, 1, 1], false),
      W,
    ),
  );
  q.append(
    setMaterial(cylinderGeo(o * 0.13, o * 0.1, L / 2 - 0.05, L / 2 + 0.005, 10, [1, 1, 1, 1]), W),
  );
  q.append(
    setMaterial(
      cylinderGeo(o * 0.52, o * 0.52, L / 2 - 0.09, L / 2 - 0.07, 18, [1, 1, 1, 1]),
      STEEL_MAT,
    ),
  );
  const tt = new MeshBuilder();
  tt.append(q, makeTransform(0, 0, 0, 0, 1, 1, 1, 0, -Math.PI / 2));
  const wt = [];
  const It = t.track / 2;
  for (const I of i) {
    for (const B of [1, -1]) {
      wt.push({
        x: B * It,
        z: I,
        front: I > 0,
        side: B,
      });
    }
  }
  return {
    body: M,
    wheel: tt,
    wheelPos: wt,
    wheelR: o,
    spec: f,
  };
}
