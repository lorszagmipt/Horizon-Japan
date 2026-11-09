// Проведение заезда: старт и отсчёт, ворота-чекпоинты, прогресс, время, финиш и медали.

import { BotField } from "./bots.js";
import { ItemSystem } from "./items.js";
import { clamp, lerp, rgb } from "../core/math.js";
import { LANDMARKS } from "../world/mapData.js";
import { MeshBuilder, boxGeo, makeTransform } from "../render/mesh.js";
import { loadBest, saveBest } from "../game/settings.js";
import { EVENTS } from "./events.js";
import { DriftScore } from "./driftScore.js";

// Проведение заездов: маркеры старта на карте, ворота-чекпоинты, прогресс, финиш, медали и рекорды.
export class RaceManager {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.r = game.renderer;
    this.drift = new DriftScore();
    this.best = loadBest();
    this.sessionBest = {};
    this.active = null;
    this.lockControls = false;
    this.paths = {};
    for (const ev of EVENTS) {
      this.paths[ev.id] = this.buildPath(ev);
    }
    this.buildMarkers();
    this.nearMarker = null;
  }
  distOnRoad(road, x, z) {
    const hit = this.world.roads.nearest(x, z, 60, road);
    if (hit) {
      return hit.dist;
    }
    const idx = this.world.roads.nearestOnRoad(road, x, z);
    return road.dist[idx];
  }
  // Склеивает маршрут заезда из кусков дорог в один путь с точками через 2 м.
  buildPath(ev) {
    const roads = this.world.roads;
    const path = {
      x: [],
      z: [],
      h: [],
      tx: [],
      tz: [],
      d: [],
      hw: [],
    };
    let total = 0;
    let lapLen = 0;
    const resolveDist = (a, r, c) => {
      const u = roads.byId[a.road];
      if (r === "end") {
        return u.length;
      }
      if (r === "lap") {
        return null;
      }
      if (r === "summit") {
        return this.distOnRoad(u, LANDMARKS.summit.x, LANDMARKS.summit.z + 25);
      }
      if (typeof r == "object" && r.at) {
        const h = roads.byId[r.at];
        const l = roads.junctions.find(
          (m) => (m.child === h && m.parent === u) || (m.parent === h && m.child === u),
        );
        return l && l.parent === u ? u.dist[l.pi] : l && l.child === u ? u.dist[l.ci] : 0;
      }
      return r;
    };
    for (const a of ev.route) {
      const r = roads.byId[a.road];
      const c = resolveDist(a, a.from, true);
      let u = resolveDist(a, a.to, false);
      if (u === null) {
        u = c + r.length;
      }
      let h = Math.sign(u - c) || 1;
      let l = Math.abs(u - c);
      if (r.closed && a.to !== "lap" && l > r.length / 2) {
        h = -h;
        l = r.length - l;
      }
      if (a.to === "lap") {
        h = 1;
        l = r.length;
        lapLen = l;
      }
      for (let m = 0; m <= l; m += 2) {
        let p = c + h * m;
        if (r.closed) {
          p = ((p % r.length) + r.length) % r.length;
        }
        const d = roads.indexAtDist(r, p);
        const x = r.closed ? (d + 1) % r.n : Math.min(d + 1, r.n - 1);
        const v = (r.dist[x] || r.length) - r.dist[d] || 2;
        const g = clamp((p - r.dist[d]) / v, 0, 1);
        const b = lerp(r.x[d], r.x[x], g);
        const y = lerp(r.z[d], r.z[x], g);
        if (path.x.length) {
          const k = path.x[path.x.length - 1];
          const w = path.z[path.z.length - 1];
          const M = Math.hypot(b - k, y - w);
          if (M < 0.5) {
            continue;
          }
          total += M;
        }
        path.x.push(b);
        path.z.push(y);
        path.h.push(lerp(r.h[d], r.h[x], g));
        path.tx.push(r.tx[d] * h);
        path.tz.push(r.tz[d] * h);
        path.d.push(total);
        path.hw.push(r.hw);
      }
    }
    path.length = total;
    path.n = path.x.length;
    path.lapLen = lapLen || total;
    return path;
  }
  pathPoint(path, dist) {
    let s = 0;
    let o = path.n - 1;
    while (s < o) {
      const i = (s + o + 1) >> 1;
      if (path.d[i] <= dist) {
        s = i;
      } else {
        o = i - 1;
      }
    }
    return s;
  }
  buildMarkers() {
    this.markers = [];
    for (const t of EVENTS) {
      const e = this.paths[t.id];
      const s = Math.min(8, e.n - 1);
      const o = e.x[s];
      const i = e.z[s];
      const n = e.h[s];
      const a = new MeshBuilder();
      const r = rgb(parseInt(t.color.slice(1), 16));
      const c = 20;
      const u = [];
      for (let p = 0; p <= 6; p++) {
        const d = p * 9;
        const x = (1 - p / 6) * 0.55;
        const v = [];
        for (let g = 0; g <= c; g++) {
          const b = (g / c) * Math.PI * 2;
          v.push(a.vertex(Math.cos(b) * 2.2, d, Math.sin(b) * 2.2, 0, 1, 0, [r[0], r[1], r[2], x]));
        }
        u.push(v);
      }
      for (let p = 0; p < 6; p++) {
        for (let d = 0; d < c; d++) {
          a.quad(u[p][d], u[p + 1][d], u[p + 1][d + 1], u[p][d + 1]);
        }
      }
      const h = [];
      for (let p = 0; p <= 40; p++) {
        const d = (p / 40) * Math.PI * 2;
        h.push([
          a.vertex(Math.cos(d) * 5, 0.15, Math.sin(d) * 5, 0, 1, 0, [r[0], r[1], r[2], 0.75]),
          a.vertex(Math.cos(d) * 6, 0.15, Math.sin(d) * 6, 0, 1, 0, [r[0], r[1], r[2], 0]),
        ]);
      }
      for (let p = 0; p < 40; p++) {
        a.quad(h[p][0], h[p + 1][0], h[p + 1][1], h[p][1]);
      }
      const l = makeTransform(o, n, i);
      const m = this.r.add({
        mesh: this.r.createMesh(a),
        prog: "trail",
        blend: true,
        depthWrite: false,
        cull: "none",
        uniforms: { u_model: l },
        bounds: {
          c: [o, n + 25, i],
          r: 30,
        },
        order: 18,
        reflect: false,
      });
      this.markers.push({
        def: t,
        x: o,
        z: i,
        h: n,
        item: m,
      });
    }
  }
  setMarkersVisible(t) {
    for (const e of this.markers) {
      e.item.visible = t;
    }
  }
  makeGate(t, e, s, o) {
    const i = t.x[e];
    const n = t.z[e];
    const a = t.h[e];
    const r = Math.atan2(t.tx[e], t.tz[e]);
    const c = t.hw[e] + 2.2;
    const u = new MeshBuilder();
    u.ext = [];
    const h = rgb(parseInt(o.slice(1), 16));
    const l = (p, d, x, v) => {
      const g = u.vertexCount;
      u.append(p, d, x, "set");
      for (let b = g; b < u.vertexCount; b++) {
        u.ext[b * 4] = 0.3;
        u.ext[b * 4 + 1] = v;
        u.ext[b * 4 + 2] = 0;
        u.ext[b * 4 + 3] = 0;
        u.col[b * 4 + 3] = 0;
      }
    };
    for (const p of [-1, 1]) {
      const d = Math.cos(r) * c * p;
      const x = -Math.sin(r) * c * p;
      l(boxGeo(0.7, 7, 0.7), makeTransform(d, 3.5, x, r), [0.15, 0.15, 0.2], 0);
      l(boxGeo(0.9, 0.9, 0.9), makeTransform(d, 7.2, x, r), h, 1.2);
    }
    if (s === "finish") {
      for (let p = 0; p < 16; p++) {
        const d = -c + ((p + 0.5) * c * 2) / 16;
        for (const x of [0, 1]) {
          l(
            boxGeo((c * 2) / 16, 0.6, 0.3),
            makeTransform(Math.cos(r) * d, 6.5 + x * 0.6, -Math.sin(r) * d, r),
            (p + x) % 2 ? [0.95, 0.95, 0.95] : [0.08, 0.08, 0.1],
            0.3,
          );
        }
      }
    } else {
      l(boxGeo(c * 2, 0.5, 0.3), makeTransform(0, 6.8, 0, r), h, 1);
      for (const p of [-1, 1]) {
        l(
          boxGeo(1.6, 0.35, 0.3),
          makeTransform(
            Math.cos(r) * p * 0.5,
            5.8 - 0,
            -Math.sin(r) * p * 0.5,
            r,
            1,
            1,
            1,
            0,
            p * 0.7,
          ),
          [1, 1, 1],
          0.8,
        );
      }
    }
    const m = makeTransform(i, a, n);
    return this.r.add({
      mesh: this.r.createMesh(u),
      defines: ["CARMAT"],
      uniforms: { u_model: m },
      bounds: {
        c: [i, a + 4, n],
        r: c + 4,
      },
      shadow: false,
      reflect: false,
    });
  }
  clearGates() {
    if (this.gates) {
      for (const t of this.gates) {
        if (t.item) {
          this.r.remove(t.item);
        }
      }
    }
    this.gates = null;
  }
  // Старт заезда по id: ставит машину на старт, расставляет чекпоинты, запускает отсчёт.
  // net — когда заезд пришёл от хозяина комнаты: { grid: [id игроков по местам], items, bots }.
  start(id, net) {
    const ev = EVENTS.find((h) => h.id === id);
    const game = this.game;
    const path = this.paths[id];
    const online = game.isOnline();
    if (online && !game.net.isHost && !net) {
      if (game.ui) game.ui.toast("Заезд выбирает хозяин комнаты");
      return;
    }
    this.disposeBots();
    if (online) game.net.clearBots();
    this.clearGates();
    const laps = ev.laps || 1;
    const total = ev.type === "circuit" ? path.lapLen * laps : path.length;
    const cps = [];
    const cpStep =
      ev.type === "circuit"
        ? Math.max(250, path.lapLen / Math.max(3, Math.round(path.lapLen / 320)))
        : 300;
    for (let h = cpStep; h < total - 40; h += cpStep) {
      cps.push(h);
    }
    cps.push(total);
    this.active = {
      def: ev,
      P: path,
      laps: laps,
      total: total,
      cps: cps,
      next: 0,
      time: 0,
      started: false,
      countdown: 3.5,
      idx: 0,
      progress: 0,
      offRoute: 0,
      lastCp: { d: 0 },
      lap: 1,
      finished: false,
    };
    this.gates = cps.map((h) => ({
      d: h,
      item: null,
    }));
    this.drift.reset();
    this.setMarkersVisible(false);
    // СТАРТОВАЯ РЕШЁТКА: без соперников — по центру дороги, как раньше; иначе по местам в два ряда
    let grid = net ? net.grid : online ? ["h", ...[...game.net.players.keys()].filter((k) => k !== "h")] : ["me"];
    const mySlot = Math.max(0, grid.indexOf(online ? game.net.myId : "me"));
    const botCount = ev.type === "drift" ? 0 : net ? 0 : (game.settings.bots ?? 3);
    if (grid.length + botCount > 1) {
      const g0 = this.gridPos(path, mySlot, ev.type === "circuit");
      game.car.place(g0[0], g0[1], g0[2]);
      // на кольце позади линии старта: прогресс отрицательный, чтобы пересечение линии не засчиталось кругом
      if (ev.type === "circuit" && g0[3] > 0) {
        this.active.progress = -g0[3];
        this.active.idx = this.pathPoint(path, path.lapLen - g0[3]);
      }
    } else {
      const startIdx = 0;
      const heading = Math.atan2(path.tx[startIdx], path.tz[startIdx]);
      game.car.place(path.x[startIdx], path.z[startIdx], heading);
    }
    game.car.boost = 1; // шкала ускорения (Shift) на старте заезда — полная
    // СОПЕРНИКИ: боты (кроме дрифта). Сколько и какой сложности — Настройки → Гонка.
    // В сетевой игре ботов ведёт хозяин комнаты, гости видят их как чужие машины.
    if (botCount > 0) {
      this.bots = new BotField(game, this.active, botCount, game.settings.botLevel || "normal", grid.length);
    }
    // СПОСОБНОСТИ (ракета, нитро, банан): «коробки» или «шкала» — Настройки → Гонка
    const itemMode = net ? net.items : game.settings.items || "boxes";
    if (ev.type !== "drift" && itemMode !== "off") {
      this.items = new ItemSystem(game, this.active, itemMode);
      if (online) this.items.onAction = (a) => game.net.sendAction(a);
    }
    if (online && game.net.isHost && !net) {
      game.net.sendStart({ ev: id, grid, items: itemMode });
    }
    game.playerFx.spin = 0;
    game.rig.snap = true;
    game.state = "drive";
    this.lockControls = true;
    if (game.fx) {
      game.fx.clearTrails();
    }
    this.refreshGates();
    if (game.ui) {
      game.ui.onEventStart(this.active);
    }
  }
  pathIndexForDist(dist) {
    const run = this.active;
    const path = run.P;
    const d = run.def.type === "circuit" ? dist % path.lapLen : Math.min(dist, path.length);
    return this.pathPoint(path, d);
  }
  refreshGates() {
    const run = this.active;
    if (run) {
      for (let k = 0; k < this.gates.length; k++) {
        const gate = this.gates[k];
        const shouldShow = k >= run.next && k < run.next + 2;
        if (shouldShow && !gate.item) {
          const isLast = k === this.gates.length - 1;
          gate.item = this.makeGate(
            run.P,
            Math.min(run.P.n - 1, this.pathIndexForDist(gate.d)),
            isLast ? "finish" : "cp",
            run.def.color,
          );
        } else if (!shouldShow && gate.item) {
          this.r.remove(gate.item);
          gate.item = null;
        }
      }
    }
  }
  // Место k на стартовой решётке: два ряда, через ряд — gridGap метров назад. Возвращает [x, z, yaw, назад_м].
  gridPos(path, k, isCircuit) {
    const world = this.game.world;
    const row = Math.floor(k / 2);
    const side = k % 2 ? 1 : -1;
    const back = row * 9 + (k % 2) * 3;
    const at = (back, lat) => {
      if (isCircuit && back > 0) {
        const idx = this.pathPoint(path, path.lapLen - back);
        return [path.x[idx] + path.tz[idx] * lat, path.z[idx] - path.tx[idx] * lat, Math.atan2(path.tx[idx], path.tz[idx]), back];
      }
      const tx = path.tx[0];
      const tz = path.tz[0];
      return [path.x[0] - tx * back + tz * lat, path.z[0] - tz * back - tx * lat, Math.atan2(tx, tz), back];
    };
    // место свободно: нет столбов/отбойников в радиусе машины и это не вода
    const free = (p) => {
      const g = world.groundAt(p[0], p[1], {});
      if (g.surface === "water" || g.h < -0.5) return false;
      return world.colliders.resolveCircle(p[0], p[1], 2.6, g.h + 0.5, []).length === 0;
    };
    let p = at(back, side * path.hw[0] * 0.42);
    if (!free(p)) p = at(back, 0);
    if (!free(p)) {
      // позади старта места нет (обрыв, отбойник) — ставим впереди по маршруту
      const idx = this.pathPoint(path, 12 + k * 7);
      const lat = side * path.hw[idx] * 0.42;
      p = [path.x[idx] + path.tz[idx] * lat, path.z[idx] - path.tx[idx] * lat, Math.atan2(path.tx[idx], path.tz[idx]), 0];
    }
    return p;
  }
  // Гость: хозяин комнаты запустил заезд.
  startNet(m) {
    const game = this.game;
    if (this.active) this.cancel();
    if (game.ui) {
      game.ui.hideScreens();
      game.ui.initMaps && game.ui.initMaps();
    }
    this.start(m.ev, m);
  }
  // ГОНЩИКИ ЗАЕЗДА: игрок + боты + друзья по сети. У каждого: phys (машина), progress (метры), place (место).
  playerRacer() {
    const run = this.active;
    const me = this.me || (this.me = { kind: "player", id: "me", name: "Вы", item: null, meter: 0, itemThink: 0 });
    me.id = this.game.isOnline() ? this.game.net.myId : "me";
    me.phys = this.game.car;
    me.effects = this.game.playerFx;
    me.color = this.game.carColor(this.game.car.spec);
    me.spec = this.game.car.spec;
    if (run) {
      me.progress = run.progress;
      me.idx = run.idx;
      me.finished = run.finished;
      me.finishTime = run.finished ? run.time : null;
    }
    return me;
  }
  racers() {
    const list = [this.playerRacer()];
    if (this.bots) list.push(...this.bots.bots);
    if (this.game.isOnline()) list.push(...this.game.net.remoteRacers());
    return list;
  }
  hasRivals() {
    return this.racers().length > 1;
  }
  // МЕСТА: финишировавшие — по времени, остальные — по пройденному пути.
  standings() {
    const list = this.racers().slice();
    list.sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });
    list.forEach((r, k) => (r.place = k + 1));
    return list;
  }
  disposeBots() {
    if (this.bots) {
      this.bots.dispose();
      this.bots = null;
    }
    if (this.items) {
      this.items.dispose();
      this.items = null;
    }
  }
  cancel() {
    if (this.active) {
      this.disposeBots();
      this.active = null;
      this.lockControls = false;
      this.clearGates();
      this.setMarkersVisible(true);
      if (this.game.ui) {
        this.game.ui.onEventEnd();
      }
    }
  }
  // Вернуть машину к последнему взятому чекпоинту.
  respawnAtCheckpoint() {
    const run = this.active;
    const idx = this.pathIndexForDist(run.lastCp.d);
    const path = run.P;
    this.game.car.place(path.x[idx], path.z[idx], Math.atan2(path.tx[idx], path.tz[idx]));
    run.idx = idx;
    this.game.rig.snap = true;
  }
  onCrash(strength) {
    if (strength > 0.25) {
      this.drift.fail();
    }
  }
  // Каждый кадр в заезде: отсчёт, прогресс по трассе, взятие чекпоинтов, финиш.
  update(dt, game) {
    const car = game.car;
    this.drift.update(dt, car);
    this.nearMarker = null;
    if (!this.active) {
      for (const marker of this.markers) {
        if (Math.hypot(marker.x - car.pos[0], marker.z - car.pos[2]) < 9 && car.speed < 12) {
          this.nearMarker = marker;
          break;
        }
      }
      return;
    }
    const run = this.active;
    if (run.finished) {
      return;
    }
    if (this.bots) {
      this.bots.update(dt, run.progress);
    }
    if (this.items) {
      this.items.update(dt);
    }
    if (!run.started) {
      const before = Math.ceil(run.countdown - 0.5);
      run.countdown -= dt;
      const after = Math.ceil(run.countdown - 0.5);
      if (after !== before && game.audio) {
        game.audio.beep(after <= 0 ? 2 : 1);
      }
      if (run.countdown <= 0.5) {
        run.started = true;
        this.lockControls = false;
      }
      return;
    }
    run.time += dt;
    const path = run.P;
    const isCircuit = run.def.type === "circuit";
    const lapBase = isCircuit ? Math.floor(run.progress / path.lapLen) * path.lapLen : 0;
    let bestD2 = Infinity;
    let bestIdx = run.idx;
    for (let k = -40; k <= 160; k++) {
      let idx = run.idx + k;
      if (isCircuit) {
        idx = ((idx % path.n) + path.n) % path.n;
      } else if (idx < 0 || idx >= path.n) {
        continue;
      }
      const d2 = (path.x[idx] - car.pos[0]) ** 2 + (path.z[idx] - car.pos[2]) ** 2;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestIdx = idx;
      }
    }
    let dist = path.d[bestIdx] + lapBase;
    if (isCircuit && bestIdx < run.idx - path.n / 2) {
      dist += path.lapLen;
    }
    if (isCircuit && bestIdx > run.idx + path.n / 2) {
      dist -= path.lapLen;
    }
    run.idx = bestIdx;
    if (Math.sqrt(bestD2) < 40 && dist > run.progress - 60) {
      run.progress = Math.max(run.progress, dist);
    }
    if (Math.sqrt(bestD2) > 45) {
      run.offRoute += dt;
    } else {
      run.offRoute = 0;
    }
    if (run.offRoute > 3 && game.ui) {
      game.ui.toast("Вы покинули маршрут — нажмите R");
      run.offRoute = -4;
    }
    const nextCp = run.cps[run.next];
    if (run.progress >= nextCp - 3) {
      run.lastCp = { d: nextCp };
      run.next++;
      if (isCircuit) {
        run.lap = Math.min(run.laps, 1 + Math.floor((run.progress + 1) / path.lapLen));
      }
      if (run.next >= run.cps.length) {
        this.finish();
      } else {
        if (game.audio) {
          game.audio.chime();
        }
        this.refreshGates();
        if (game.ui) {
          game.ui.flashCheckpoint(run);
        }
      }
    }
  }
  // Финиш: результат, медаль, сохранение рекорда, экран результатов.
  finish() {
    const run = this.active;
    const game = this.game;
    run.finished = true;
    this.drift.bank();
    const ev = run.def;
    const isDrift = ev.type === "drift";
    const result = isDrift ? Math.round(this.drift.total) : run.time;
    const id = ev.id;
    const rec = this.best[id] || {
      best: null,
      history: [],
    };
    const newBest = rec.best === null || (isDrift ? result > rec.best : result < rec.best);
    if (newBest) {
      rec.best = result;
    }
    rec.history = (rec.history || []).concat([
      {
        v: result,
        car: game.car.spec.name,
        at: Date.now(),
      },
    ]);
    rec.history.sort((a, b) => (isDrift ? b.v - a.v : a.v - b.v));
    rec.history = rec.history.slice(0, 5);
    this.best[id] = rec;
    saveBest(this.best);
    const sessBest = this.sessionBest[id];
    if (sessBest === undefined || (isDrift ? result > sessBest : result < sessBest)) {
      this.sessionBest[id] = result;
    }
    let medal = null;
    if (isDrift) {
      const [gold, silver, bronze] = ev.medals;
      medal =
        result >= gold ? "gold" : result >= silver ? "silver" : result >= bronze ? "bronze" : null;
    } else {
      const goldTime = run.total / ev.vref;
      medal =
        result <= goldTime
          ? "gold"
          : result <= goldTime * 1.15
            ? "silver"
            : result <= goldTime * 1.35
              ? "bronze"
              : null;
    }
    // лучшая медаль за этот заезд тоже сохраняется в браузере
    const RANK = { gold: 3, silver: 2, bronze: 1 };
    if (medal && (RANK[medal] || 0) > (RANK[rec.medal] || 0)) {
      rec.medal = medal;
      saveBest(this.best);
    }
    // места в гонке с ботами: кто уже финишировал — впереди
    const standings = this.hasRivals() ? this.standings() : null;
    const place = standings ? standings.find((r) => r.kind === "player").place : null;
    if (game.audio) {
      game.audio.fanfare();
    }
    this.clearGates();
    this.lockControls = true;
    if (game.ui) {
      game.ui.showResults({
        def: ev,
        result: result,
        isDrift: isDrift,
        newBest: newBest,
        best: rec.best,
        session: this.sessionBest[id],
        history: rec.history,
        medal: medal,
        place: place,
        standings: standings
          ? standings.map((r) => ({
              name: r.name,
              car: r.kind === "player" ? game.car.spec.name : r.spec.name,
              me: r.kind === "player",
              time: r.finished ? r.finishTime : null,
              behind: r.finished ? null : Math.max(0, run.total - r.progress),
            }))
          : null,
        ref: isDrift
          ? ev.medals
          : [run.total / ev.vref, (run.total / ev.vref) * 1.15, (run.total / ev.vref) * 1.35],
      });
    }
  }
  closeResults(restart) {
    const id = this.active && this.active.def.id;
    this.disposeBots();
    this.active = null;
    this.lockControls = false;
    this.setMarkersVisible(true);
    if (restart && id) {
      this.start(id);
    } else if (this.game.ui) {
      this.game.ui.onEventEnd();
    }
  }
}
