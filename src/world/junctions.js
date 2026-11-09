// ПЕРЕКРЁСТКИ. Плавные Т-образные примыкания: углы между главной и примыкающей дорогой скругляются,
// как на настоящих перекрёстках, а на примыкающей дороге рисуется «зебра».
//
// Как это устроено:
//  1. Перекрёсток — один цельный кусок дороги. Лента главной дороги («parent») в этом месте прерывается,
//     лента примыкающей («child») начинается только после зебры (см. RoadNetwork.buildMeshes),
//     а всё между ними рисует сам перекрёсток: главную дорогу со всей её разметкой, въезд со скруглёнными
//     углами радиусом JUNCTION_CORNER_RADIUS и начало примыкающей дороги. Ничего не лежит друг на друге,
//     поэтому нечему «просвечивать», а стыки с лентами совпадают вершина в вершину.
//  2. Форма перекрёстка задаётся «полем» F: F < 0 — асфальт, 0…1.4 — обочина, дальше — земля.
//     Это то же самое «расстояние до края дороги», только для двух дорог сразу и со скруглением.
//     Шейдер дороги рисует белую линию по краю и обочину именно по F (поправка передаётся в цвете вершины).
//  3. Высота на перекрёстке H плавно переходит от главной дороги к примыкающей — без ступенек.
//     Тем же полем и высотой пользуются физика (World.groundAt), рельеф (Terrain.buildGrid)
//     и расстановка деревьев (edgeDist), поэтому машина едет ровно по тому, что нарисовано.

import { clamp, lerp, smoothstep } from "../core/math.js";
import { MeshBuilder } from "../render/mesh.js";
import { biomeAt } from "./biomes.js";

// Радиус скругления углов, метров. Больше — плавнее и шире въезд.
export const JUNCTION_CORNER_RADIUS = 7.5;
// Рисовать ли пешеходный переход («зебру») на примыкающей дороге.
export const JUNCTION_CROSSWALKS = true;

// Ширина обочины и глубина «юбки» под краем — как у обычных дорог (roads.js, buildMeshes).
const SHOULDER = 1.4;
const SKIRT_DROP = 1.6;
// Поправка края дороги в шейдере хранится в альфе цвета вершины: 0…1 → 0…-DELTA_RANGE метров.
// То же число стоит в шейдере ROAD (render/shaders.js).
const DELTA_RANGE = 12;
// Номер «разметки» для въезда: без осевых линий, а потёртость полос плавно появляется к концу въезда.
const LANE_JUNCTION = 5;
// Зебра: длина полос вдоль дороги, ширина полосы и промежутка, отступ от края асфальта.
const ZEBRA_LEN = 3;
const ZEBRA_STRIPE = 0.45;
const ZEBRA_GAP = 0.5;
const ZEBRA_MARGIN = 0.6;

// Скруглённое объединение двух дорог: a — расстояние за краем главной, b — за краем примыкающей.
// Вдали от угла это просто min(a, b); в углу граница идёт по дуге радиуса r.
function roundUnion(a, b, r) {
  const u = Math.max(r - a, 0);
  const v = Math.max(r - b, 0);
  return Math.max(r, Math.min(a, b)) - Math.hypot(u, v);
}

// Точка на ленте дороги по расстоянию вдоль неё: положение, высота и нормаль (вбок).
function pointAtDist(roads, road, dist) {
  if (road.closed) {
    dist = ((dist % road.length) + road.length) % road.length;
  } else {
    dist = clamp(dist, 0, road.dist[road.n - 1]);
  }
  const i = roads.indexAtDist(road, dist);
  const k = road.closed ? (i + 1) % road.n : Math.min(i + 1, road.n - 1);
  const d0 = road.dist[i];
  const d1 = k === 0 ? road.length : road.dist[k];
  const f = d1 > d0 ? clamp((dist - d0) / (d1 - d0), 0, 1) : 0;
  const tx = lerp(road.tx[i], road.tx[k], f);
  const tz = lerp(road.tz[i], road.tz[k], f);
  const tl = Math.hypot(tx, tz) || 1;
  return {
    x: lerp(road.x[i], road.x[k], f),
    z: lerp(road.z[i], road.z[k], f),
    h: lerp(road.h[i], road.h[k], f),
    // нормаль (tz, -tx) — та же, что у вершин асфальта в buildMeshes
    nx: tz / tl,
    nz: -tx / tl,
  };
}

// Один перекрёсток: всё, что нужно, чтобы отвечать на вопрос «что в точке (x, z)».
export class Junction {
  constructor(roads, j) {
    this.roads = roads;
    this.parent = j.parent;
    this.child = j.child;
    this.pi = j.pi;
    this.ci = j.ci;
    this.r = JUNCTION_CORNER_RADIUS;
    const P = this.parent;
    const C = this.child;
    this.ox = P.x[this.pi];
    this.oz = P.z[this.pi];
    this.s0 = P.dist[this.pi];
    // с какой стороны главной дороги примыкание (+1 / -1 относительно нормали (tz, -tx))
    const k = this.ci === 0 ? Math.min(C.n - 1, 10) : Math.max(0, C.n - 11);
    const sd = (C.x[k] - this.ox) * P.tz[this.pi] - (C.z[k] - this.oz) * P.tx[this.pi];
    this.sideP = sd >= 0 ? 1 : -1;
    // множитель, чтобы «расстояние вдоль примыкающей» v росло от главной дороги
    this.dirC = this.ci === 0 ? 1 : -1;
    this.blend = 10;
    this.reach = 0;
    this._f = { F: 0, h: 0, a: 0, b: 0, n: 0, v: 0, l: 0, sP: 0, road: null, junction: null };
    this.build();
  }
  // Расстояние вдоль примыкающей дороги от точки примыкания.
  vToDist(v) {
    return this.ci === 0 ? v : this.child.length - v;
  }
  // Точка примыкающей дороги на расстоянии v от главной; (nx, nz) смотрит в сторону l > 0.
  childPoint(v) {
    const p = pointAtDist(this.roads, this.child, this.vToDist(v));
    p.nx *= this.dirC;
    p.nz *= this.dirC;
    return p;
  }
  // ПОЛЕ ПЕРЕКРЁСТКА в точке (x, z). Результат — общий объект, не храни его:
  //  F — где точка: < 0 асфальт, 0…1.4 обочина, дальше земля;  h — высота поверхности;
  //  a — насколько точка за краем главной дороги, b — за краем примыкающей;
  //  n — расстояние от оси главной (в сторону примыкания), v — расстояние вдоль примыкающей;
  //  road — к какой дороге точка ближе.
  field(x, z) {
    const P = this.parent;
    const C = this.child;
    const out = this._f;
    out.junction = this;
    const rp = this.roads.nearest(x, z, 200, P);
    if (!rp) {
      return null;
    }
    const n = (rp.side >= 0 ? 1 : -1) * this.sideP * rp.d;
    const hP = rp.h;
    out.n = n;
    out.sP = rp.dist;
    if (n < 0) {
      // противоположная сторона главной дороги — примыкание сюда не влияет
      out.a = -n - P.hw;
      out.b = 1e9;
      out.v = -1;
      out.l = 0;
      out.F = out.a;
      out.h = hP;
      out.road = P;
      return out;
    }
    const a = n - P.hw;
    const rc = this.roads.nearest(x, z, 200, C);
    if (!rc) {
      return null;
    }
    const b = rc.d - C.hw;
    const hC = rc.h;
    out.v = this.ci === 0 ? rc.dist : C.length - rc.dist;
    out.l = (rc.side >= 0 ? 1 : -1) * this.dirC * rc.d;
    out.a = a;
    out.b = b;
    out.F = roundUnion(a, b, this.r);
    // высота: на главной дороге — её высота, на примыкающей — её; между ними плавный переход
    // (в пределах обочины главной дороги высота — ровно её, чтобы заплатка лежала вровень с ней)
    const wa = smoothstep(SHOULDER + 0.3, this.blend, a);
    // ближе к примыкающей дороге — её высота, ближе к главной — высота главной
    const wb = smoothstep(-2, 2, a - b);
    out.h = hP + (hC - hP) * wa * wb;
    out.road = a <= b ? P : C;
    return out;
  }
  // Находит точку, где поле F = 0 (край асфальта), двигаясь от p вдоль направления «наружу».
  project(x, z) {
    for (let it = 0; it < 12; it++) {
      const f0 = this.field(x, z).F;
      if (Math.abs(f0) < 0.002) {
        break;
      }
      const e = 0.05;
      const gx = (this.field(x + e, z).F - this.field(x - e, z).F) / (2 * e);
      const gz = (this.field(x, z + e).F - this.field(x, z - e).F) / (2 * e);
      const g2 = gx * gx + gz * gz || 1;
      x -= (f0 * gx) / g2;
      z -= (f0 * gz) / g2;
    }
    return [x, z];
  }
  // Направление «наружу» (от асфальта к земле) в точке.
  outward(x, z) {
    const e = 0.05;
    const gx = (this.field(x + e, z).F - this.field(x - e, z).F) / (2 * e);
    const gz = (this.field(x, z + e).F - this.field(x, z - e).F) / (2 * e);
    const l = Math.hypot(gx, gz) || 1;
    return [gx / l, gz / l];
  }
  // Точка на краю главной дороги на расстоянии s вдоль неё (n — отступ от оси в сторону примыкания).
  parentPoint(s, n) {
    const p = pointAtDist(this.roads, this.parent, s);
    return [p.x + p.nx * this.sideP * n, p.z + p.nz * this.sideP * n];
  }
  // Ищет вдоль функции pos(t) (t растёт от 0) первое место, где test(field) становится true.
  _search(pos, test, step, maxT) {
    let t0 = 0;
    let t = step;
    while (t <= maxT) {
      const [x, z] = pos(t);
      if (test(this.field(x, z))) {
        for (let i = 0; i < 30; i++) {
          const tm = (t0 + t) / 2;
          const [mx, mz] = pos(tm);
          if (test(this.field(mx, mz))) {
            t = tm;
          } else {
            t0 = tm;
          }
        }
        return t;
      }
      t0 = t;
      t += step;
    }
    return maxT;
  }
  // Строит форму перекрёстка: левый и правый край (дуги + край примыкающей дороги), конец заплатки, зебру.
  build() {
    const P = this.parent;
    const C = this.child;
    const R = this.r;
    // где ось примыкающей дороги пересекает край главной
    const vEdge = this._search(
      (v) => {
        const p = this.childPoint(v);
        return [p.x, p.z];
      },
      (f) => f.n >= P.hw,
      0.25,
      80,
    );
    this.vEdge = vEdge;
    const pe = this.childPoint(vEdge);
    // направление вдоль главной дороги, которое ведёт к стороне l > 0 примыкающей
    const pt = pointAtDist(this.roads, P, this.s0);
    const ptx = -pt.nz;
    const ptz = pt.nx; // касательная главной (tx, tz) = (-nz, nx)
    const towardPlus = ptx * pe.nx + ptz * pe.nz >= 0 ? 1 : -1;
    const sEdge = this.roads.nearest(pe.x, pe.z, 200, P).dist;
    const sides = {};
    for (const side of [-1, 1]) {
      const dir = towardPlus * side;
      // Tp — где дуга отходит от края главной дороги (там b = R)
      const parentAt = (t) => this.parentPoint(sEdge + dir * t, P.hw);
      const tK = this._search(parentAt, (f) => f.b >= 0, 0.25, 80);
      const tP = this._search(parentAt, (f) => f.b >= R, 0.25, 120);
      // Tc — где дуга выходит на край примыкающей дороги (там a = R)
      const childEdgeAt = (v) => {
        const p = this.childPoint(vEdge + v);
        return [p.x + p.nx * side * C.hw, p.z + p.nz * side * C.hw];
      };
      const vC = this._search(childEdgeAt, (f) => f.a >= R, 0.25, 120);
      // Tp и Tc лежат точно на краях дорог (там F = 0 ровно), уточнять не нужно
      const sTp = this._unwrap(sEdge + dir * tP);
      const Tp = this.parentPoint(sTp, P.hw);
      const K = parentAt(tK);
      const Tc = childEdgeAt(vC);
      // дуга: ломаная Tp → K → Tc, каждая точка «прижимается» к краю асфальта (F = 0)
      const guide = [];
      const seg = (A, B) => {
        const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
        const m = Math.max(2, Math.ceil(L / 0.25));
        for (let i = 0; i < m; i++) {
          guide.push([lerp(A[0], B[0], i / m), lerp(A[1], B[1], i / m)]);
        }
      };
      seg(Tp, K);
      seg(K, Tc);
      guide.push(Tc);
      const arc = guide.map((g, i) =>
        i === 0 || i === guide.length - 1 ? g : this.project(g[0], g[1]),
      );
      sides[side] = {
        arc,
        Tp,
        Tc,
        vTc: vEdge + vC,
        sTp,
      };
    }
    // докуда тянется перекрёсток вдоль примыкающей дороги: зебра, а за ней — точка ленты, где лента продолжается
    const vArcEnd = Math.max(sides[-1].vTc, sides[1].vTc);
    this.vZebra = vArcEnd + 1.0;
    const vWant = JUNCTION_CROSSWALKS ? this.vZebra + ZEBRA_LEN + 1.0 : vArcEnd + 2.0;
    let cm;
    if (this.ci === 0) {
      cm = 0;
      while (cm < C.n - 1 && C.dist[cm] < vWant) {
        cm++;
      }
    } else {
      cm = C.n - 1;
      while (cm > 0 && C.length - C.dist[cm] < vWant) {
        cm--;
      }
    }
    this.cm = cm;
    this.vEnd = this.ci === 0 ? C.dist[cm] : C.length - C.dist[cm];
    // переход высот должен закончиться до конца перекрёстка, чтобы дальше лента дороги шла как была
    let aEnd = Infinity;
    for (const side of [-1, 1]) {
      const [x, z] = this.ribbonPoint(C, cm, side * this.dirC * (C.hw + SHOULDER));
      aEnd = Math.min(aEnd, this.field(x, z).a);
    }
    this.blend = clamp(aEnd - 0.5, 3, 10);
    // края въезда: дуга + край примыкающей дороги до точки ленты cm (одинаковое число точек слева и справа)
    const resample = (pts, count) => {
      const cum = [0];
      for (let i = 1; i < pts.length; i++) {
        cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      }
      const total = cum[cum.length - 1];
      const res = [];
      let k = 0;
      for (let i = 0; i <= count; i++) {
        const t = (total * i) / count;
        while (k < pts.length - 2 && cum[k + 1] < t) {
          k++;
        }
        const f = cum[k + 1] > cum[k] ? (t - cum[k]) / (cum[k + 1] - cum[k]) : 0;
        res.push([lerp(pts[k][0], pts[k + 1][0], f), lerp(pts[k][1], pts[k + 1][1], f)]);
      }
      // концы — точно исходные точки (к ним пристыкованы соседние куски)
      res[0] = pts[0];
      res[count] = pts[pts.length - 1];
      return { pts: res, length: total };
    };
    const arcLen = (pts) => resample(pts, 1).length;
    this.nArc = Math.max(8, Math.ceil(Math.max(arcLen(sides[-1].arc), arcLen(sides[1].arc)) / 0.4));
    const nStraight = Math.max(
      2,
      Math.ceil(Math.max(this.vEnd - sides[-1].vTc, this.vEnd - sides[1].vTc) / 0.8),
    );
    this.paths = {};
    for (const side of [-1, 1]) {
      const sd = sides[side];
      const arc = resample(sd.arc, this.nArc).pts;
      const straight = [];
      const len = this.vEnd - sd.vTc;
      for (let i = 1; i < nStraight; i++) {
        const p = this.childPoint(sd.vTc + (len * i) / nStraight);
        straight.push([p.x + p.nx * side * C.hw, p.z + p.nz * side * C.hw]);
      }
      // последняя точка — ровно вершина ленты примыкающей дороги
      straight.push(this.ribbonPoint(C, cm, side * this.dirC * C.hw));
      this.paths[side] = arc.concat(straight);
    }
    this.sides = sides;
    // главная дорога рисуется перекрёстком между точками её ленты iLo и iHi (с запасом 2 м за скруглениями)
    const sLo = Math.min(sides[-1].sTp, sides[1].sTp) - 2;
    const sHi = Math.max(sides[-1].sTp, sides[1].sTp) + 2;
    const prev = (k) => (P.closed ? (k - 1 + P.n) % P.n : Math.max(0, k - 1));
    const next = (k) => (P.closed ? (k + 1) % P.n : Math.min(P.n - 1, k + 1));
    let iLo = this.pi;
    for (let g = 0; g < P.n && this._unwrap(P.dist[iLo]) > sLo && iLo !== prev(iLo); g++) {
      iLo = prev(iLo);
    }
    let iHi = this.pi;
    for (let g = 0; g < P.n && this._unwrap(P.dist[iHi]) < sHi && iHi !== next(iHi); g++) {
      iHi = next(iHi);
    }
    this.iLo = iLo;
    this.iHi = iHi;
    // радиус зоны перекрёстка (для быстрых проверок)
    let reach = 0;
    for (const side of [-1, 1]) {
      for (const [x, z] of this.paths[side]) {
        reach = Math.max(reach, Math.hypot(x - this.ox, z - this.oz));
      }
    }
    for (const i of [iLo, iHi]) {
      for (const sgn of [-1, 1]) {
        const [x, z] = this.ribbonPoint(P, i, sgn * (P.hw + SHOULDER));
        reach = Math.max(reach, Math.hypot(x - this.ox, z - this.oz));
      }
    }
    this.reach = reach + SHOULDER + 1;
  }
  // Вершина ленты дороги road в точке i со сдвигом E вбок — ровно так же, как в RoadNetwork.buildMeshes.
  ribbonPoint(road, i, E) {
    return [road.x[i] + road.tz[i] * E, road.z[i] + -road.tx[i] * E];
  }
  // Расстояние вдоль главной дороги относительно точки примыкания (для кольцевых дорог без скачка).
  _unwrap(s) {
    const P = this.parent;
    let d = s - this.s0;
    if (P.closed) {
      d = ((((d + P.length / 2) % P.length) + P.length) % P.length) - P.length / 2;
    }
    return this.s0 + d;
  }
  // Треугольник, повёрнутый лицом вверх.
  _tri(mb, a, b, c) {
    const p = mb.pos;
    const ax = p[a * 3];
    const az = p[a * 3 + 2];
    const cr = (p[b * 3 + 2] - az) * (p[c * 3] - ax) - (p[b * 3] - ax) * (p[c * 3 + 2] - az);
    if (Math.abs(cr) < 1e-9) {
      return;
    }
    if (cr > 0) {
      mb.tri(a, b, c);
    } else {
      mb.tri(a, c, b);
    }
  }
  // Сшивает треугольниками две соседние ломаные A и B (индексы вершин) с параметрами 0…1 вдоль них —
  // число точек в них может быть разным.
  _stitch(mb, A, B, pa, pb) {
    let i = 0;
    let j = 0;
    while (i < A.length - 1 || j < B.length - 1) {
      const stepA = j >= B.length - 1 || (i < A.length - 1 && pa[i + 1] <= pb[j + 1]);
      if (stepA) {
        this._tri(mb, A[i], B[j], A[i + 1]);
        i++;
      } else {
        this._tri(mb, A[i], B[j], B[j + 1]);
        j++;
      }
    }
  }
  // Двусторонняя полоса (для почти вертикальной «юбки» под краем).
  _skirt(mb, a0, a1, b0, b1) {
    mb.quad(a0, b0, b1, a1);
    mb.quad(a0, a1, b1, b0);
  }
  // Свойства главной дороги на расстоянии s вдоль неё: высота, сакура/клёны, пройденное расстояние.
  _parentAttr(s) {
    const P = this.parent;
    let d = s;
    if (P.closed) {
      d = ((d % P.length) + P.length) % P.length;
    } else {
      d = clamp(d, 0, P.dist[P.n - 1]);
    }
    const i = this.roads.indexAtDist(P, d);
    const k = P.closed ? (i + 1) % P.n : Math.min(i + 1, P.n - 1);
    const d1 = k === 0 ? P.length : P.dist[k];
    const f = d1 > P.dist[i] ? clamp((d - P.dist[i]) / (d1 - P.dist[i]), 0, 1) : 0;
    return {
      h: lerp(P.h[i], P.h[k], f),
      sak: lerp(P.sak[i], P.sak[k], f),
      aut: lerp(P.aut[i], P.aut[k], f),
      vv: d,
    };
  }
  // Альфа цвета вершины: поправка δ (≤ 0), на которую край асфальта в этом месте ближе к оси, чем у обычной дороги.
  _encDelta(delta) {
    return delta > -0.002 ? 0 : Math.min(1, -delta / DELTA_RANGE);
  }
  // Меши перекрёстка: дорога (geo) и зебра (marks).
  buildMeshes() {
    const P = this.parent;
    const C = this.child;
    const hwP = P.hw;
    const hwC = C.hw;
    const sp = this.sideP;
    const geo = new MeshBuilder();
    const sides = this.sides;
    const tpA = Math.min(sides[-1].sTp, sides[1].sTp);
    const tpB = Math.max(sides[-1].sTp, sides[1].sTp);
    // ---------- 1. Главная дорога в зоне перекрёстка ----------
    // Ряды поперёк главной дороги: крайние — ровно точки её ленты iLo и iHi (стык без щелей),
    // внутри — каждые 0.5 м и ровно в точках, где начинаются скругления.
    const sA = this._unwrap(P.dist[this.iLo]);
    const sB = this._unwrap(P.dist[this.iHi]);
    const rows = [{ s: sA, i: this.iLo }];
    for (let s = sA + 0.5; s < sB - 0.25; s += 0.5) {
      if (Math.abs(s - tpA) > 0.2 && Math.abs(s - tpB) > 0.2) {
        rows.push({ s });
      }
    }
    rows.push({ s: tpA, tp: true }, { s: tpB, tp: true });
    rows.sort((a, b) => a.s - b.s);
    rows.push({ s: sB, i: this.iHi });
    // точки поперёк (n — от оси главной в сторону примыкания; дальняя сторона — n < 0)
    const nMin = -(hwP + SHOULDER);
    const nearCols = [hwP * 0.5, hwP - 2, hwP - 1.2, hwP - 0.7, hwP - 0.45, hwP - 0.2].filter(
      (n) => n > 0.3,
    );
    const colsEdge = [nMin, -hwP, 0, hwP];
    const colsInner = [nMin, -hwP, -(hwP - 1), 0, ...nearCols, hwP];
    for (const r of rows) {
      const exact = r.i !== undefined;
      const at = exact
        ? { h: P.h[r.i], sak: P.sak[r.i], aut: P.aut[r.i], vv: P.dist[r.i] }
        : this._parentAttr(r.s);
      r.at = at;
      r.edge = exact ? P.edge[r.i] / 3 : 0;
      r.pos = (n) => (exact ? this.ribbonPoint(P, r.i, sp * n) : this.parentPoint(r.s, n));
      r.cols = exact ? colsEdge : colsInner;
      r.mk = (vvShift) => {
        const ids = [];
        for (const n of r.cols) {
          const [x, z] = r.pos(n);
          const f = this.field(x, z);
          const delta = exact ? 0 : f.F - (Math.abs(n) - hwP);
          ids.push(
            geo.vertex(
              x,
              at.h,
              z,
              0,
              1,
              0,
              [at.sak, at.aut, r.edge, this._encDelta(delta)],
              [sp * n, at.vv + vvShift, hwP, P.lane],
            ),
          );
        }
        return ids;
      };
      r.ids = r.mk(0);
      r.par = r.cols.map((n) => (n - nMin) / (hwP - nMin));
      r.top = r.ids[r.ids.length - 1];
      r.topPos = r.pos(hwP);
    }
    for (let k = 0; k < rows.length - 1; k++) {
      const a = rows[k];
      const b = rows[k + 1];
      // на кольцевой дороге расстояние вдоль неё в точке старта прыгает с длины на 0 — разметке нужен
      // непрерывный счёт, поэтому для этой полосы у второго ряда берём копию со сдвигом на длину дороги
      let bIds = b.ids;
      if (b.at.vv < a.at.vv - P.length / 2) {
        bIds = b.mk(P.length);
      } else if (b.at.vv > a.at.vv + P.length / 2) {
        bIds = b.mk(-P.length);
      }
      this._stitch(geo, a.ids, bIds, a.par, b.par);
    }
    // обочина и «юбка» дальней стороны
    const skirtV = (x, z, h, E, at, edge, lane, hw, nx, nz, extra = []) =>
      geo.vertex(x, h, z, nx, 0, nz, [at.sak, at.aut, edge, 0], [E, at.vv, hw, lane, ...extra]);
    let prevFar = null;
    for (const r of rows) {
      const [x, z] = r.pos(nMin);
      const p = pointAtDist(this.roads, P, r.s);
      const nx = r.i !== undefined ? P.tz[r.i] : p.nx;
      const nz = r.i !== undefined ? -P.tx[r.i] : p.nz;
      const sg = -sp; // направление наружу на дальней стороне в знаке E
      const ids = [
        r.ids[0],
        skirtV(
          x,
          z,
          r.at.h - SKIRT_DROP,
          sg * (hwP + SHOULDER + 0.3),
          r.at,
          r.edge,
          P.lane,
          hwP,
          nx * sg,
          nz * sg,
        ),
      ];
      if (prevFar) {
        this._skirt(geo, prevFar[0], prevFar[1], ids[0], ids[1]);
      }
      prevFar = ids;
    }
    // обочина ближней стороны — там, где нет въезда (до скруглений и после них)
    const nearShoulder = (r) => {
      const [x, z] = r.pos(hwP + SHOULDER);
      const p = pointAtDist(this.roads, P, r.s);
      const nx = (r.i !== undefined ? P.tz[r.i] : p.nx) * sp;
      const nz = (r.i !== undefined ? -P.tx[r.i] : p.nz) * sp;
      const sh = geo.vertex(
        x,
        r.at.h,
        z,
        0,
        1,
        0,
        [r.at.sak, r.at.aut, r.edge, 0],
        [sp * (hwP + SHOULDER), r.at.vv, hwP, P.lane],
      );
      const sk = skirtV(
        x,
        z,
        r.at.h - SKIRT_DROP,
        sp * (hwP + SHOULDER + 0.3),
        r.at,
        r.edge,
        P.lane,
        hwP,
        nx,
        nz,
      );
      return { top: r.top, sh, sk, pos: [x, z] };
    };
    for (const group of [
      rows.filter((r) => r.s <= tpA + 1e-9),
      rows.filter((r) => r.s >= tpB - 1e-9),
    ]) {
      let prev = null;
      for (const r of group) {
        const cur = nearShoulder(r);
        r.near = cur;
        if (prev) {
          this._tri(geo, prev.top, cur.top, cur.sh);
          this._tri(geo, prev.top, cur.sh, prev.sh);
          this._skirt(geo, prev.sh, prev.sk, cur.sh, cur.sk);
        }
        prev = cur;
      }
    }
    // ---------- 2. Въезд: от края главной дороги до ленты примыкающей ----------
    // Здесь свойства вершин считаются от примыкающей дороги (E — сдвиг от её оси), а край — по полю F.
    const blendW = (a) => smoothstep(0, this.blend, a);
    const cmAt = { sak: C.sak[this.cm], aut: C.aut[this.cm] };
    const g2 = (x, z, opts = {}) => {
      const f = this.field(x, z);
      const F = f.F;
      const l = f.l;
      const a = f.a;
      const sP = f.sP;
      const wear = opts.wear ?? blendW(a);
      const pa = this._parentAttr(this._unwrap(sP));
      const E = opts.E ?? l * this.dirC;
      const delta = opts.delta ?? F - (Math.abs(E) - hwC);
      const h = opts.h ?? f.h;
      const col = [
        lerp(pa.sak, cmAt.sak, wear),
        lerp(pa.aut, cmAt.aut, wear),
        0,
        this._encDelta(delta),
      ];
      if (opts.skirt) {
        return geo.vertex(x, h, z, opts.skirt[0], 0, opts.skirt[1], col, [
          E,
          wear,
          hwC,
          LANE_JUNCTION,
        ]);
      }
      return geo.vertex(x, h, z, 0, 1, 0, col, [E, wear, hwC, LANE_JUNCTION]);
    };
    // нулевая «перекладина» — край главной дороги между скруглениями (те же точки, что верх рядов главной)
    let mouthRows = rows.filter((r) => r.s >= tpA - 1e-9 && r.s <= tpB + 1e-9);
    if (sides[-1].sTp > sides[1].sTp) {
      mouthRows = mouthRows.reverse();
    }
    const rung0Pos = mouthRows.map((r) => r.topPos);
    const rung0 = mouthRows.map((r, k) => g2(r.topPos[0], r.topPos[1], { h: r.at.h, wear: 0 }));
    const paramOf = (pts) => {
      const cum = [0];
      for (let i = 1; i < pts.length; i++) {
        cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
      }
      const tot = cum[cum.length - 1] || 1;
      return cum.map((c) => c / tot);
    };
    const par0 = paramOf(rung0Pos);
    const rung0At = (t) => {
      let k = 0;
      while (k < par0.length - 2 && par0[k + 1] < t) {
        k++;
      }
      const f = par0[k + 1] > par0[k] ? (t - par0[k]) / (par0[k + 1] - par0[k]) : 0;
      return [
        lerp(rung0Pos[k][0], rung0Pos[k + 1][0], f),
        lerp(rung0Pos[k][1], rung0Pos[k + 1][1], f),
      ];
    };
    const r0a = rung0Pos[0];
    const r0b = rung0Pos[rung0Pos.length - 1];
    const L = this.paths[-1];
    const R = this.paths[1];
    const K = L.length - 1;
    let prevIds = rung0;
    let prevPar = par0;
    for (let k = 1; k <= K; k++) {
      let pts;
      let ids;
      if (k === K) {
        // последняя — ровно поперечник ленты примыкающей дороги (левый край, ось, правый край)
        pts = [L[K], [C.x[this.cm], C.z[this.cm]], R[K]];
        const Es = [-this.dirC * hwC, 0, this.dirC * hwC];
        ids = pts.map((q, j) => g2(q[0], q[1], { h: C.h[this.cm], wear: 1, E: Es[j], delta: 0 }));
      } else {
        const len = Math.hypot(R[k][0] - L[k][0], R[k][1] - L[k][1]);
        const cnt = clamp(Math.ceil(len / 0.6), 4, 60);
        const bow = Math.max(0, 1 - k / this.nArc);
        pts = [];
        for (let j = 0; j <= cnt; j++) {
          const t = j / cnt;
          let x = lerp(L[k][0], R[k][0], t);
          let z = lerp(L[k][1], R[k][1], t);
          if (bow > 0 && j > 0 && j < cnt) {
            // первые перекладины повторяют изгиб края главной дороги, потом выпрямляются
            const q = rung0At(t);
            x += (q[0] - lerp(r0a[0], r0b[0], t)) * bow;
            z += (q[1] - lerp(r0a[1], r0b[1], t)) * bow;
          }
          pts.push([x, z]);
        }
        ids = pts.map((q) => g2(q[0], q[1]));
      }
      const par = paramOf(pts);
      this._stitch(geo, prevIds, ids, prevPar, par);
      prevIds = ids;
      prevPar = par;
    }
    // обочина по дуге и краю примыкающей дороги + «юбка»
    const tpRow = { [-1]: null, [1]: null };
    for (const r of rows) {
      if (r.tp) {
        if (Math.abs(r.s - sides[-1].sTp) < 1e-9) tpRow[-1] = r;
        if (Math.abs(r.s - sides[1].sTp) < 1e-9) tpRow[1] = r;
      }
    }
    for (const side of [-1, 1]) {
      const path = this.paths[side];
      let prev = null;
      for (let k = 0; k <= K; k++) {
        const [x, z] = path[k];
        let ids;
        if (k === 0) {
          // начало — точки обочины главной дороги у начала скругления
          const r = tpRow[side];
          const [ox, oz] = r.near.pos;
          const [gx, gz] = [ox - x, oz - z].map((v) => v / SHOULDER);
          ids = [
            g2(x, z, { h: r.at.h, wear: 0 }),
            g2(ox, oz, { h: r.at.h, wear: 0 }),
            g2(ox, oz, { h: r.at.h - SKIRT_DROP, wear: 0, skirt: [gx, gz] }),
          ];
        } else if (k === K) {
          // конец — ровно вершины ленты примыкающей дороги
          const sg = side * this.dirC;
          const [ox, oz] = this.ribbonPoint(C, this.cm, sg * (hwC + SHOULDER));
          const nx = C.tz[this.cm] * sg;
          const nz = -C.tx[this.cm] * sg;
          const h = C.h[this.cm];
          ids = [
            g2(x, z, { h, wear: 1, E: sg * hwC, delta: 0 }),
            g2(ox, oz, { h, wear: 1, E: sg * (hwC + SHOULDER), delta: 0 }),
            g2(ox, oz, {
              h: h - SKIRT_DROP,
              wear: 1,
              E: sg * (hwC + SHOULDER + 0.3),
              delta: 0,
              skirt: [nx, nz],
            }),
          ];
        } else {
          const [gx, gz] = this.outward(x, z);
          const ox = x + gx * SHOULDER;
          const oz = z + gz * SHOULDER;
          const ho = this.field(ox, oz).h;
          ids = [g2(x, z), g2(ox, oz), g2(ox, oz, { h: ho - SKIRT_DROP, skirt: [gx, gz] })];
        }
        if (prev) {
          this._tri(geo, prev[0], ids[0], ids[1]);
          this._tri(geo, prev[0], ids[1], prev[1]);
          this._skirt(geo, prev[1], prev[2], ids[1], ids[2]);
        }
        prev = ids;
      }
    }
    // ---------- 3. Зебра на примыкающей дороге ----------
    let marks = null;
    if (JUNCTION_CROSSWALKS) {
      marks = new MeshBuilder();
      const white = [0.93, 0.93, 0.9, 1];
      const width = 2 * (C.hw - ZEBRA_MARGIN);
      const count = Math.max(1, Math.floor((width + ZEBRA_GAP) / (ZEBRA_STRIPE + ZEBRA_GAP)));
      const used = count * ZEBRA_STRIPE + (count - 1) * ZEBRA_GAP;
      const steps = 3;
      for (let i = 0; i < count; i++) {
        const l0 = -used / 2 + i * (ZEBRA_STRIPE + ZEBRA_GAP);
        const l1 = l0 + ZEBRA_STRIPE;
        let prev = null;
        for (let k = 0; k <= steps; k++) {
          const p = this.childPoint(this.vZebra + (ZEBRA_LEN * k) / steps);
          const ids = [l0, l1].map((l) => {
            const x = p.x + p.nx * l;
            const z = p.z + p.nz * l;
            // краска на 3 см выше асфальта
            return marks.vertex(x, this.field(x, z).h + 0.03, z, 0, 1, 0, white);
          });
          if (prev) {
            this._tri(marks, prev[0], ids[0], ids[1]);
            this._tri(marks, prev[0], ids[1], prev[1]);
          }
          prev = ids;
        }
      }
    }
    const b = geo.bounds();
    return { junction: this, road: P, geo, marks, center: b.center, radius: b.radius };
  }
}

// Готовит все перекрёстки сети дорог. Вызывается из RoadNetwork.build после высот и хеша.
export function buildJunctions(roads) {
  roads.junctionShapes = [];
  for (const j of roads.junctions) {
    const shape = new Junction(roads, j);
    j.shape = shape;
    roads.junctionShapes.push(shape);
    // примыкающая дорога рисуется только от точки cm (до неё — перекрёсток)
    const C = j.child;
    if (j.ci === 0) {
      C.meshFrom = Math.max(C.meshFrom || 0, shape.cm);
    } else {
      C.meshTo = Math.min(C.meshTo ?? C.n - 1, shape.cm);
    }
    // главная дорога не рисуется между iLo и iHi (там её рисует перекрёсток)
    const P = j.parent;
    (P.meshSkip ||= []).push([shape.iLo, shape.iHi]);
    // разрывы боковой линии у примыканий больше не нужны: линию рисует перекрёсток
    for (let k = shape.iLo; k !== shape.iHi; k = (k + 1) % P.n) {
      P.edge[k] = 0;
    }
  }
}
