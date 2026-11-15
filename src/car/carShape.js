// ФОРМА КУЗОВА. Кузов задаётся несколькими плавными линиями из описания машины (cars.js → body):
// вид сбоку (верх top, плечо edge, низ bottom), вид сверху (plan) и кабина (cabin).
// Из них в любом месте по длине машины строится поперечное сечение. Все детали (фары, решётки,
// зеркала, антикрыло…) ставятся не «на глаз», а по этой же поверхности — поэтому ничего не висит
// в воздухе и не торчит из кузова.
//
// Оси машины: x — вправо, y — вверх от земли, z — вперёд (нос на +L/2).

import { clamp, lerp, smoothstep } from "../core/math.js";

// Плавная кривая через точки [[x, y], …] (x по возрастанию). Не «переигрывает»: между точками нет лишних волн.
export function makeCurve(points) {
  const n = points.length;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  if (n === 1) return () => ys[0];
  const h = [];
  const d = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1] - xs[i]);
    d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  }
  const m = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) {
      m[i] = 0;
    } else {
      const w1 = 2 * h[i] + h[i - 1];
      const w2 = h[i] + 2 * h[i - 1];
      m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
    }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const t = (x - xs[i]) / h[i];
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i] +
      (t3 - 2 * t2 + t) * h[i] * m[i] +
      (-2 * t3 + 3 * t2) * ys[i + 1] +
      (t3 - t2) * h[i] * m[i + 1]
    );
  };
}

// Скругление угла: точка на дуге между A и B с вершиной угла C (t от 0 до 1).
const fillet = (A, C, B, t) => {
  const a = (1 - t) * (1 - t);
  const b = 2 * t * (1 - t);
  const c = t * t;
  return [a * A[0] + b * C[0] + c * B[0], a * A[1] + b * C[1] + c * B[1]];
};

// Сколько точек в половине сечения кузова и как они делятся на участки.
export const BODY = {
  NS1: 3, // борт ниже линии раздела
  NS2: 5, // борт выше линии раздела
  NT: 7, // верх (капот, багажник) от плеча до оси
};
BODY.HALF = 3 + 2 + 3 + BODY.NS1 + BODY.NS2 + 3 + (BODY.NT + 1);
// Участки половины сечения (между соседними точками), по порядку от низа к верху.
export const BODY_SEG = [];
{
  const add = (name, count) => {
    for (let k = 0; k < count; k++) BODY_SEG.push(name);
  };
  add("floor", 2);
  add("well", 3);
  add("corner", 2);
  add("lower", BODY.NS1);
  add("side", BODY.NS2);
  add("shoulder", 4);
  add("top", BODY.NT);
}

// Половина сечения кабины: низ (утоплен в кузов), стекло борта, скругление крыши, крыша.
export const CAB = {
  NG: 5, // ряды бокового стекла
  NT: 6, // крыша от угла до оси
};
CAB.HALF = 1 + (CAB.NG + 1) + 3 + (CAB.NT + 1);
export const CAB_SEG = [];
{
  const add = (name, count) => {
    for (let k = 0; k < count; k++) CAB_SEG.push(name);
  };
  add("base", 1);
  add("sill", 1);
  add("glass", CAB.NG - 2);
  add("rail", 1);
  add("corner", 4);
  add("roof", CAB.NT);
}

const SNAP = 2000; // сетка по длине машины: 0,5 мм

export class CarShape {
  constructor(spec) {
    const b = spec.body;
    this.b = b;
    this._body = new Map();
    this._cab = new Map();
    this.half = b.L / 2;
    this.top = makeCurve(b.top);
    this.edge = makeCurve(b.edge);
    this.bot = makeCurve(b.bottom);
    this.plan = makeCurve(b.plan);
    this.splitY = makeCurve(b.split || [[0, 0.3]]);
    this.axles = [b.wb / 2 + b.wOff, -b.wb / 2 + b.wOff]; // перед, зад
    this.Ra = b.wr + (b.archGap ?? 0.045); // радиус колёсной арки
    this.flare = b.flare || [0.03, 0.03];
    this.flareTop = b.flareTop ?? 0.55;
    this.wBase = b.W / 2 - Math.max(this.flare[0], this.flare[1]);
    this.tuck = b.tuck ?? 0.04;
    this.lean = b.lean ?? 0.04;
    this.wy = b.wy ?? 0.5;
    this.rs = typeof b.rs === "object" ? makeCurve(b.rs) : () => b.rs ?? 0.05;
    this.rb = b.rb ?? 0.04;
    this.topPow = typeof b.topPow === "object" ? makeCurve(b.topPow) : () => b.topPow ?? 2.4;
    // внутренняя стенка колёсной ниши (передним колёсам нужно место для поворота)
    this.wellX = [b.track / 2 - b.ww / 2 - 0.2, b.track / 2 - b.ww / 2 - 0.07];
    const c = b.cabin;
    this.c = c;
    this.roof = makeCurve(c.roof);
    this.z1 = c.roof[0][0];
    this.z0 = c.roof[c.roof.length - 1][0];
    this.cabPlan = makeCurve(c.plan);
    this.tumble = c.tumble ?? 0.2;
    this.crown = c.crown ?? 0.05;
    this.rr = c.rr ?? 0.07;
    this.bow = c.bow ?? 0.012;
    this.sink = 0.035;
    // самая большая высота бокового стекла — от неё считается наклон стёкол
    this.sideMax = 0.05;
    for (let k = 0; k <= 40; k++) {
      const z = lerp(this.z1, this.z0, k / 40);
      const m = this.cabMetrics(z);
      this.sideMax = Math.max(this.sideMax, m.yTop - m.yBelt);
    }
  }

  // --- КУЗОВ ---------------------------------------------------------------

  // Основные размеры сечения кузова в точке z.
  metrics(z) {
    const b = this.b;
    const yb = this.bot(z);
    const yt = Math.max(this.top(z), yb + 0.02);
    const ys = clamp(this.edge(z), yb + 0.014, yt + 0.12);
    let w = this.plan(z) * this.wBase;
    let flare = 0;
    let ya = -1;
    let axle = -1;
    for (let k = 0; k < 2; k++) {
      const d = z - this.axles[k];
      const t = d / (this.Ra * 1.5);
      flare += this.flare[k] * Math.exp(-Math.pow(t * t * 1.1, 1.6));
      if (Math.abs(d) < this.Ra) {
        ya = b.wr + Math.sqrt(this.Ra * this.Ra - d * d);
        axle = k;
      }
    }
    const hSide = ys - yb;
    return {
      z,
      yb,
      yt,
      ys,
      w,
      flare,
      ya,
      axle,
      hSide,
      yw: yb + hSide * this.wy,
      tuck: Math.min(this.tuck, hSide * 0.25),
      lean: Math.min(this.lean, hSide * 0.3),
    };
  }

  // Полуширина борта на высоте y (m — результат metrics).
  sideAt(m, y) {
    let x = m.w;
    if (y < m.yw) {
      const t = (m.yw - y) / Math.max(m.yw - m.yb, 1e-4);
      x -= m.tuck * t * t;
    } else {
      const t = (y - m.yw) / Math.max(m.ys - m.yw, 1e-4);
      x -= m.lean * Math.min(t, 1.2) ** 2;
    }
    if (m.flare > 0) {
      x += m.flare * lerp(1, this.flareTop, smoothstep(this.b.wr + 0.1, m.ys, y));
    }
    return x;
  }

  // Высота верхней поверхности кузова на расстоянии x от оси.
  topAt(m, x, xs, pow) {
    const t = clamp(Math.abs(x) / Math.max(xs, 1e-4), 0, 1);
    return m.yt + (m.ys - m.yt) * Math.pow(t, pow);
  }

  // Половина сечения кузова: массив точек [x, y] от низа по оси до верха по оси.
  // (z округляется до полумиллиметра, готовые сечения запоминаются — детали спрашивают их тысячи раз)
  bodyHalf(z) {
    const key = Math.round(z * SNAP);
    let pts = this._body.get(key);
    if (!pts) {
      pts = this.makeBodyHalf(key / SNAP);
      this._body.set(key, pts);
    }
    return pts;
  }
  makeBodyHalf(z) {
    const m = this.metrics(z);
    const pts = [];
    const arch = m.ya > m.yb + 0.004;
    const rs = Math.min(this.rs(z), m.hSide * 0.42);
    const yShoulder = m.ys - rs; // где борт переходит в скругление плеча
    const yLow = arch ? Math.min(m.ya, yShoulder - 0.02) : m.yb;
    const rb = arch ? 0 : Math.min(this.rb, m.hSide * 0.3);
    const xLow = this.sideAt(m, yLow);
    const xin = Math.min(m.axle >= 0 ? this.wellX[m.axle] : this.wellX[1], (xLow - rb) * 0.86);
    // пол и колёсная ниша
    pts.push([0, m.yb], [xin * 0.5, m.yb], [xin, m.yb]);
    pts.push([xin, yLow], [(xin + xLow - rb) * 0.5, yLow]);
    // нижний угол (у арки — острый край)
    const q0 = [xLow - rb, yLow];
    const q2 = [this.sideAt(m, yLow + rb), yLow + rb];
    pts.push(q0, fillet(q0, [xLow, yLow], q2, 0.5), q2);
    // борт: до линии раздела и выше неё
    const y0 = yLow + rb;
    const ySplit = clamp(this.splitY(z), y0, yShoulder);
    for (let k = 1; k <= BODY.NS1; k++) {
      const y = lerp(y0, ySplit, k / BODY.NS1);
      pts.push([this.sideAt(m, y), y]);
    }
    for (let k = 1; k <= BODY.NS2; k++) {
      const y = lerp(ySplit, yShoulder, k / BODY.NS2);
      pts.push([this.sideAt(m, y), y]);
    }
    // плечо
    const xs = this.sideAt(m, m.ys);
    const pow = this.topPow(z);
    const rs2 = Math.min(rs * 1.4, xs * 0.45);
    const A = pts[pts.length - 1];
    const B = [xs - rs2, this.topAt(m, xs - rs2, xs, pow)];
    const C = [xs, m.ys];
    pts.push(fillet(A, C, B, 0.25), fillet(A, C, B, 0.5), fillet(A, C, B, 0.75));
    // верх
    for (let j = 0; j <= BODY.NT; j++) {
      const x = (xs - rs2) * (1 - j / BODY.NT);
      pts.push([x, this.topAt(m, x, xs, pow)]);
    }
    pts.m = m;
    pts.arch = arch;
    return pts;
  }

  // --- КАБИНА --------------------------------------------------------------

  cabMetrics(z) {
    const m = this.metrics(z);
    const xs = this.sideAt(m, m.ys);
    const xBelt = Math.min(this.cabPlan(z), xs - 0.015);
    const yBelt = this.topAt(m, xBelt, xs, this.topPow(z));
    const yRoof = this.roof(z);
    const hc = Math.max(yRoof - yBelt, 0);
    const crown = Math.min(this.crown, hc * 0.45);
    const rr = Math.min(this.rr, hc * 0.35);
    return { z, xBelt, yBelt, yRoof, crown, rr, yTop: Math.max(yRoof - crown - rr, yBelt), hc };
  }

  // Полуширина кабины на высоте y (от линии низа стёкол до угла крыши).
  cabSideAt(cm, y) {
    const hs = cm.yTop - cm.yBelt;
    if (hs <= 1e-4) return cm.xBelt;
    const s = clamp((y - cm.yBelt) / hs, 0, 1);
    const dx = this.tumble * (hs / this.sideMax);
    return cm.xBelt - dx * s + this.bow * 4 * s * (1 - s) * (hs / this.sideMax);
  }

  cabHalf(z) {
    const key = Math.round(z * SNAP);
    let pts = this._cab.get(key);
    if (!pts) {
      pts = this.makeCabHalf(key / SNAP);
      this._cab.set(key, pts);
    }
    return pts;
  }
  makeCabHalf(z) {
    const cm = this.cabMetrics(z);
    const pts = [];
    // там, где крыша ещё не поднялась над кузовом (перед лобовым, за задним стеклом), вся кабина прячется под кузов
    const hide = Math.min(0, cm.yRoof - cm.crown - cm.rr - cm.yBelt - 0.012);
    pts.push([cm.xBelt, cm.yBelt - this.sink + hide]);
    const sill = Math.min(this.c.sill ?? 0.035, (cm.yTop - cm.yBelt) * 0.4);
    const rail = Math.min(this.c.rail ?? 0.03, (cm.yTop - cm.yBelt) * 0.3);
    // ряды бокового стекла: низ, кромка уплотнителя, стекло, кромка под крышей
    const ys = [cm.yBelt, cm.yBelt + sill];
    for (let k = 1; k <= CAB.NG - 3; k++) {
      ys.push(lerp(cm.yBelt + sill, cm.yTop - rail, k / (CAB.NG - 2)));
    }
    ys.push(cm.yTop - rail, cm.yTop);
    for (const y of ys) pts.push([this.cabSideAt(cm, y), y + hide]);
    // скругление крыши и сама крыша
    const xr = this.cabSideAt(cm, cm.yTop);
    const rr2 = Math.min(cm.rr * 1.3, xr * 0.4);
    const roofAt = (x) => cm.yRoof - cm.crown * (x / Math.max(xr, 1e-4)) ** 2;
    const A = pts[pts.length - 1];
    const C = [xr, cm.yRoof - cm.crown];
    const B = [xr - rr2, roofAt(xr - rr2)];
    pts.push(fillet(A, C, B, 0.25), fillet(A, C, B, 0.5), fillet(A, C, B, 0.75));
    for (let j = 0; j <= CAB.NT; j++) {
      const x = (xr - rr2) * (1 - j / CAB.NT);
      pts.push([x, roofAt(x)]);
    }
    pts.m = cm;
    return pts;
  }

  // --- ВОПРОСЫ К ПОВЕРХНОСТИ (по ним ставятся детали) -----------------------

  // Самая высокая точка ломаной на расстоянии x от оси.
  static polyTop(pts, x, from = 0) {
    x = Math.abs(x);
    let best = -Infinity;
    for (let i = from; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const lo = Math.min(a[0], b[0]);
      const hi = Math.max(a[0], b[0]);
      if (x < lo - 1e-9 || x > hi + 1e-9) continue;
      const t = hi - lo < 1e-9 ? 0 : (x - a[0]) / (b[0] - a[0]);
      best = Math.max(best, a[1] + (b[1] - a[1]) * clamp(t, 0, 1));
    }
    return best;
  }
  // Самая широкая точка ломаной на высоте y.
  static polySide(pts, y, from = 0) {
    let best = -Infinity;
    for (let i = from; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const lo = Math.min(a[1], b[1]);
      const hi = Math.max(a[1], b[1]);
      if (y < lo - 1e-9 || y > hi + 1e-9) continue;
      const t = hi - lo < 1e-9 ? 0 : (y - a[1]) / (b[1] - a[1]);
      best = Math.max(best, a[0] + (b[0] - a[0]) * clamp(t, 0, 1));
    }
    return best;
  }

  inCab(z) {
    return z > this.z1 && z < this.z0;
  }
  // Высота поверхности сверху: кузов и (если cab) кабина.
  topY(z, x, cab = true) {
    let y = CarShape.polyTop(this.bodyHalf(z), x, 5);
    if (cab && this.inCab(z)) {
      const c = CarShape.polyTop(this.cabHalf(z), x, 1);
      if (c > y) y = c;
    }
    return y;
  }
  // Полуширина поверхности сбоку: кузов и (если cab) кабина.
  sideX(z, y, cab = true) {
    let x = CarShape.polySide(this.bodyHalf(z), y, 5);
    if (cab && this.inCab(z)) {
      const c = CarShape.polySide(this.cabHalf(z), y, 1);
      if (c > x) x = c;
    }
    return x;
  }
  // Точка (x, y) внутри сечения кузова в месте z?
  insideBody(x, y, z) {
    const pts = this.bodyHalf(z);
    x = Math.abs(x);
    let inside = false;
    const n = pts.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const a = pts[i];
      const b = pts[j];
      if (a[1] > y !== b[1] > y && x < ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]) + a[0]) {
        inside = !inside;
      }
    }
    return inside;
  }
  // Где луч, идущий вдоль машины через точку (x, y), выходит из кузова: спереди (dir = 1) или сзади (dir = -1).
  endZ(x, y, dir) {
    const tip = dir * this.half;
    if (this.insideBody(x, y, tip)) return tip;
    const step = 0.04;
    let lo = null;
    let hi = tip;
    for (let d = step; d <= 1.2; d += step) {
      const z = tip - dir * d;
      if (this.insideBody(x, y, z)) {
        lo = z;
        break;
      }
      hi = z;
    }
    if (lo === null) return null;
    for (let k = 0; k < 7; k++) {
      const mid = (lo + hi) / 2;
      if (this.insideBody(x, y, mid)) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  // Только точка поверхности (без нормали) — для накладок: там нормали считаются по сетке.
  surfPoint(kind, a, b, side = 1, cab = true) {
    if (kind === "F" || kind === "R") {
      const z = this.endZ(a, b, kind === "F" ? 1 : -1);
      return z === null ? null : [a, b, z];
    }
    if (kind === "T") {
      const y = this.topY(b, a, cab);
      return isFinite(y) ? [a, y, b] : null;
    }
    const x = this.sideX(a, b, cab);
    return isFinite(x) ? [side * x, b, a] : null;
  }

  // Точка поверхности и нормаль к ней. kind: "F" — спереди (a = x, b = y), "R" — сзади (x, y),
  // "T" — сверху (x, z), "S" — сбоку (z, y; side = 1 правый борт, -1 левый).
  surf(kind, a, b, side = 1, cab = true) {
    const e = 0.006;
    if (kind === "F" || kind === "R") {
      const dir = kind === "F" ? 1 : -1;
      const z = this.endZ(a, b, dir);
      if (z === null) return null;
      const zx1 = this.endZ(a + e, b, dir);
      const zx0 = this.endZ(a - e, b, dir);
      const zy1 = this.endZ(a, b + e, dir);
      const zy0 = this.endZ(a, b - e, dir);
      const gx = zx1 !== null && zx0 !== null ? (zx1 - zx0) / (2 * e) : 0;
      const gy = zy1 !== null && zy0 !== null ? (zy1 - zy0) / (2 * e) : 0;
      return { p: [a, b, z], n: norm3([-gx * dir, -gy * dir, dir]) };
    }
    if (kind === "T") {
      const y = this.topY(b, a, cab);
      if (!isFinite(y)) return null;
      const yx1 = this.topY(b, a + e, cab);
      const yx0 = this.topY(b, a - e, cab);
      const yz1 = this.topY(b + e, a, cab);
      const yz0 = this.topY(b - e, a, cab);
      const gx = isFinite(yx1) && isFinite(yx0) ? (yx1 - yx0) / (2 * e) : 0;
      const gz = isFinite(yz1) && isFinite(yz0) ? (yz1 - yz0) / (2 * e) : 0;
      return { p: [a, y, b], n: norm3([-gx, 1, -gz]) };
    }
    const x = this.sideX(a, b, cab);
    if (!isFinite(x)) return null;
    const xz1 = this.sideX(a + e, b, cab);
    const xz0 = this.sideX(a - e, b, cab);
    const xy1 = this.sideX(a, b + e, cab);
    const xy0 = this.sideX(a, b - e, cab);
    const gz = isFinite(xz1) && isFinite(xz0) ? (xz1 - xz0) / (2 * e) : 0;
    const gy = isFinite(xy1) && isFinite(xy0) ? (xy1 - xy0) / (2 * e) : 0;
    const n = norm3([1, -gy, -gz]);
    return { p: [side * x, b, a], n: [side * n[0], n[1], n[2]] };
  }
}

export function norm3(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}
