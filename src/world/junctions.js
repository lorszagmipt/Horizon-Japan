// ПЕРЕКРЁСТКИ. Плавные Т-образные примыкания: углы между главной и примыкающей дорогой скругляются,
// как на настоящих перекрёстках, а на примыкающей дороге рисуется «зебра».
//
// Как это устроено:
//  1. Примыкающая дорога («child») больше не заезжает своим асфальтом на главную («parent»):
//     её лента обрезается чуть дальше скругления (см. RoadNetwork.buildMeshes).
//  2. Вместо неё кладётся «заплатка» — кусок асфальта, у которого край идёт по главной дороге,
//     потом по дуге радиусом JUNCTION_CORNER_RADIUS и дальше по краю примыкающей дороги.
//  3. Форма заплатки задаётся «полем» F: F < 0 — асфальт, 0…1.4 — обочина, дальше — земля.
//     Это то же самое «расстояние до края дороги», только для двух дорог сразу и со скруглением.
//  4. Высота на перекрёстке H плавно переходит от главной дороги к примыкающей — без ступенек.
//     Тем же полем и высотой пользуются физика (World.groundAt), рельеф (Terrain.buildGrid)
//     и расстановка деревьев (edgeDist), поэтому машина едет ровно по тому, что нарисовано.

import { clamp, lerp, smoothstep } from "../core/math.js";
import { MeshBuilder } from "../render/mesh.js";
import { biomeAt } from "./biomes.js";

// Радиус скругления углов, метров. Больше — плавнее и шире въезд.
export const JUNCTION_CORNER_RADIUS = 7.5;
// Рисовать ли пешеходный переход («зебру») на примыкающей дороге.
export const JUNCTION_CROSSWALKS = true;

// Насколько заплатка заходит на главную дорогу (закрывает её боковую линию в месте въезда), м.
const BAND = 0.9;
// Ширина обочины и глубина «юбки» под краем — как у обычных дорог (roads.js, buildMeshes).
const SHOULDER = 1.4;
const SKIRT_DROP = 1.6;
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
    this._f = { F: 0, h: 0, a: 0, b: 0, n: 0, v: 0, l: 0, road: null, junction: null };
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
      const Tp = this.project(...parentAt(tP));
      const K = parentAt(tK);
      const Tc = this.project(...childEdgeAt(vC));
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
        vTc: this.field(Tc[0], Tc[1]).v,
        sTp: this.roads.nearest(Tp[0], Tp[1], 200, P).dist,
      };
    }
    // докуда тянется заплатка вдоль примыкающей дороги и где зебра
    const vArcEnd = Math.max(sides[-1].vTc, sides[1].vTc);
    this.vZebra = vArcEnd + 1.0;
    this.vEnd = JUNCTION_CROSSWALKS ? this.vZebra + ZEBRA_LEN + 1.5 : vArcEnd + 2.5;
    // переход высот должен закончиться до конца заплатки, чтобы дальше лента дороги шла как была
    let aEnd = Infinity;
    for (const side of [-1, 1]) {
      const p = this.childPoint(this.vEnd);
      const f = this.field(
        p.x + p.nx * side * (C.hw + SHOULDER),
        p.z + p.nz * side * (C.hw + SHOULDER),
      );
      aEnd = Math.min(aEnd, f.a);
    }
    this.blend = clamp(aEnd - 0.5, 3, 10);
    // края заплатки: дуга + край примыкающей дороги до vEnd (одинаковое число точек слева и справа)
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
      return { pts: res, length: total };
    };
    const arcLen = (pts) => resample(pts, 1).length;
    const nArc = Math.max(
      8,
      Math.ceil(Math.max(arcLen(sides[-1].arc), arcLen(sides[1].arc)) / 0.4),
    );
    this.paths = {};
    for (const side of [-1, 1]) {
      const s = sides[side];
      const arc = resample(s.arc, nArc).pts;
      const straight = [];
      const len = this.vEnd - s.vTc;
      const m = Math.max(
        2,
        Math.ceil(Math.max(this.vEnd - sides[-1].vTc, this.vEnd - sides[1].vTc) / 0.8),
      );
      for (let i = 1; i <= m; i++) {
        const p = this.childPoint(s.vTc + (len * i) / m);
        straight.push([p.x + p.nx * side * C.hw, p.z + p.nz * side * C.hw]);
      }
      this.paths[side] = arc.concat(straight);
    }
    // диапазон вдоль главной дороги, где заплатка закрывает её боковую линию
    const sa = this._unwrap(sides[-1].sTp);
    const sb = this._unwrap(sides[1].sTp);
    this.sFrom = Math.min(sa, sb) - 1.5;
    this.sTo = Math.max(sa, sb) + 1.5;
    // радиус зоны перекрёстка (для быстрых проверок)
    let reach = 0;
    for (const side of [-1, 1]) {
      for (const [x, z] of this.paths[side]) {
        reach = Math.max(reach, Math.hypot(x - this.ox, z - this.oz));
      }
    }
    for (const s of [this.sFrom, this.sTo]) {
      const [x, z] = this.parentPoint(s, P.hw);
      reach = Math.max(reach, Math.hypot(x - this.ox, z - this.oz));
    }
    this.reach = reach + SHOULDER + 1;
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
  // Вершина асфальта заплатки: высота из поля, разметка через ext (как у дорог, см. шейдер ROAD).
  _vertex(mb, x, z, dy = 0, nx = 0, ny = 1, nz = 0, extra = 0) {
    const f = this.field(x, z);
    const hw = this.parent.hw;
    const [sak, aut] = biomeAt(x, z);
    const col = [smoothstep(0.25, 0.7, sak), smoothstep(0.25, 0.7, aut), 0, 0];
    // ext.x = «расстояние от оси»: край асфальта (F = 0) попадает ровно в hw, поэтому шейдер сам рисует
    // белую линию по краю, обочину и полосу асфальта; lane = 3 — без осевой разметки.
    return mb.vertex(x, f.h + dy, z, nx, ny, nz, col, [hw + Math.max(f.F, -hw) + extra, 0, hw, 3]);
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
  _quad(mb, a, b, c, d) {
    this._tri(mb, a, b, c);
    this._tri(mb, a, c, d);
  }
  // Меши перекрёстка: асфальт заплатки (geo) и зебра (marks).
  buildMeshes() {
    const P = this.parent;
    const C = this.child;
    const geo = new MeshBuilder();
    // 1. Полоса вдоль края главной дороги: закрывает её боковую линию там, где въезд
    {
      // (полоса чуть заходит и на сам въезд, чтобы между ней и въездом не было щели)
      const rows = [P.hw - BAND, P.hw - 0.62, P.hw - 0.45, P.hw - 0.28, P.hw, P.hw + 0.35];
      const cols = Math.max(4, Math.ceil((this.sTo - this.sFrom) / 0.5));
      const ids = [];
      for (let c = 0; c <= cols; c++) {
        const s = lerp(this.sFrom, this.sTo, c / cols);
        ids.push(rows.map((n) => this._vertex(geo, ...this.parentPoint(s, n))));
      }
      for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows.length - 1; r++) {
          this._quad(geo, ids[c][r], ids[c + 1][r], ids[c + 1][r + 1], ids[c][r + 1]);
        }
      }
    }
    // 2. Сам въезд: «перекладины» между левым и правым краем
    const L = this.paths[-1];
    const Rr = this.paths[1];
    let maxRung = 0;
    for (let k = 0; k < L.length; k++) {
      maxRung = Math.max(maxRung, Math.hypot(Rr[k][0] - L[k][0], Rr[k][1] - L[k][1]));
    }
    const cols = clamp(Math.ceil(maxRung / 0.7), 6, 48);
    const grid = [];
    for (let k = 0; k < L.length; k++) {
      const row = [];
      for (let c = 0; c <= cols; c++) {
        const t = c / cols;
        row.push(this._vertex(geo, lerp(L[k][0], Rr[k][0], t), lerp(L[k][1], Rr[k][1], t)));
      }
      grid.push(row);
    }
    for (let k = 0; k < grid.length - 1; k++) {
      for (let c = 0; c < cols; c++) {
        this._quad(geo, grid[k][c], grid[k + 1][c], grid[k + 1][c + 1], grid[k][c + 1]);
      }
    }
    // 3. Обочина по дуге и краю примыкающей дороги + «юбка» вниз (прячет щель с землёй)
    for (const side of [-1, 1]) {
      const path = this.paths[side];
      let prev = null;
      for (let k = 0; k < path.length; k++) {
        const [x, z] = path[k];
        const [gx, gz] = this.outward(x, z);
        const ox = x + gx * SHOULDER;
        const oz = z + gz * SHOULDER;
        const ids = [
          this._vertex(geo, x, z),
          this._vertex(geo, ox, oz),
          this._vertex(geo, ox, oz, -SKIRT_DROP, gx, 0, gz, 0.3),
        ];
        if (prev) {
          this._quad(geo, prev[0], ids[0], ids[1], prev[1]);
          // юбка почти вертикальная — её ориентация не важна, рисуем с двух сторон
          geo.quad(prev[1], ids[1], ids[2], prev[2]);
          geo.quad(prev[1], prev[2], ids[2], ids[1]);
        }
        prev = ids;
      }
    }
    // 4. Зебра на примыкающей дороге
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
            return marks.vertex(x, this.field(x, z).h + 0.03, z, 0, 1, 0, white);
          });
          if (prev) {
            this._quad(marks, prev[0], ids[0], ids[1], prev[1]);
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
    // примыкающая дорога рисуется только начиная с конца заплатки (дальше её закрывает заплатка)
    const C = j.child;
    const cut = shape.vEnd - 1;
    if (j.ci === 0) {
      let k = 0;
      while (k < C.n - 1 && C.dist[k + 1] <= cut) {
        k++;
      }
      C.meshFrom = Math.max(C.meshFrom || 0, k);
    } else {
      let k = C.n - 1;
      while (k > 0 && C.length - C.dist[k - 1] <= cut) {
        k--;
      }
      C.meshTo = Math.min(C.meshTo ?? C.n - 1, k);
    }
  }
}
