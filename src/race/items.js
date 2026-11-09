// СПОСОБНОСТИ В ЗАЕЗДАХ (как в Mario Kart): ракета, нитро, банан.
// Два способа получать (Настройки → Гонка → «Способности»):
//   «Коробки» — проезжаешь через коробку с «?» и получаешь случайную способность (F — применить);
//   «Шкала»   — шкала копится за езду, дрифт и обгоны; когда полная — 1 ракета, 2 нитро, 3 банан.
// Работают одинаково для игрока, ботов и друзей по сети.

import { clamp, wrapAngle } from "../core/math.js";
import { MeshBuilder, boxGeo, cylinderGeo, icosphereGeo, makeTransform } from "../render/mesh.js";

export const ITEM_TYPES = {
  rocket: { name: "Ракета", icon: "🚀", hint: "летит в соперника впереди" },
  nitro: { name: "Нитро", icon: "⚡", hint: "мощный рывок" },
  banana: { name: "Банан", icon: "🍌", hint: "оставить сзади" },
};
export const ITEM_ORDER = ["rocket", "nitro", "banana"];

// НАСТРОЙКИ СПОСОБНОСТЕЙ — меняй числа, игра перезагрузится сама.
export const ITEM_TUNE = {
  boxEvery: 360, // ряд коробок каждые столько метров трассы
  boxRespawn: 4, // через сколько секунд коробка появляется снова
  pickRadius: 2.6, // с какого расстояния коробка «подбирается», м
  rocketSpeed: 75, // скорость ракеты, м/с (быстрее любой машины)
  rocketLife: 7, // сколько секунд ракета летит, пока не взорвётся сама
  rocketRange: 250, // в кого целиться: в соперника впереди не дальше стольких метров
  hitRadius: 2.4, // расстояние попадания, м
  spinTime: 1.4, // сколько секунд машину крутит после ракеты
  rocketSlow: 0.3, // какая доля скорости остаётся после ракеты
  bananaSpin: 1.0, // сколько секунд крутит после банана
  bananaSlow: 0.55, // какая доля скорости остаётся после банана
  bananaRadius: 1.8, // радиус банана, м
  bananaLife: 90, // сколько секунд банан лежит на дороге
  nitroTime: 2.6, // сколько секунд действует нитро
  meterTime: 28, // режим «шкала»: за сколько секунд обычной езды шкала заполняется
  meterDrift: 0.07, // + столько в секунду, пока в дрифте
  meterOvertake: 0.18, // + столько за каждый обгон
  // шансы в коробке в зависимости от места: лидеру — чаще банан, последнему — ракета и нитро
  odds: {
    first: { banana: 55, nitro: 30, rocket: 15 },
    middle: { rocket: 40, nitro: 30, banana: 30 },
    last: { rocket: 55, nitro: 40, banana: 5 },
  },
};

// Модели: коробка «?», ракета, банан. Цвета вершин + свечение (как у ворот чекпоинтов).
function buildMesh(kind) {
  const b = new MeshBuilder();
  b.ext = [];
  const add = (geo, m, color, glow) => {
    const start = b.vertexCount;
    b.append(geo, m, color, "set");
    for (let v = start; v < b.vertexCount; v++) {
      b.ext[v * 4] = 0.4;
      b.ext[v * 4 + 1] = glow;
      b.ext[v * 4 + 2] = 0;
      b.ext[v * 4 + 3] = 0;
      b.col[v * 4 + 3] = 0;
    }
  };
  if (kind === "box") {
    add(boxGeo(1.3, 1.3, 1.3), makeTransform(0, 0, 0), [0.25, 0.6, 1], 0.55);
    // знак «?» из кубиков на четырёх сторонах
    const q = [
      [-0.2, 0.32], [0, 0.4], [0.2, 0.32], [0.22, 0.12], [0.05, 0.0], [0, -0.14], [0, -0.38],
    ];
    for (let side = 0; side < 4; side++) {
      const a = (side * Math.PI) / 2;
      for (const [x, y] of q) {
        const px = Math.cos(a) * x + Math.sin(a) * 0.66;
        const pz = -Math.sin(a) * x + Math.cos(a) * 0.66;
        add(boxGeo(0.16, 0.16, 0.06), makeTransform(px, y, pz, a), [1, 1, 1], 1.2);
      }
    }
    add(boxGeo(1.45, 0.08, 1.45), makeTransform(0, 0.68, 0), [1, 0.85, 0.2], 0.9);
    add(boxGeo(1.45, 0.08, 1.45), makeTransform(0, -0.68, 0), [1, 0.85, 0.2], 0.9);
  } else if (kind === "rocket") {
    // ракета вдоль оси Z (носом вперёд)
    add(cylinderGeo(0.22, 0.22, 0, 1.4, 10, [1, 1, 1, 1]), makeTransform(0, 0, -0.7, 0, 1, 1, 1, Math.PI / 2, 0), [0.92, 0.18, 0.15], 0.25);
    add(icosphereGeo(0.24, 1, [1, 1, 1, 1]), makeTransform(0, 0, 0.72, 0, 1, 1, 1.6), [0.95, 0.95, 0.95], 0.2);
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2;
      add(boxGeo(0.06, 0.4, 0.35), makeTransform(Math.cos(a) * 0.26, Math.sin(a) * 0.26, -0.55, 0, 1, 1, 1, 0, a), [1, 0.8, 0.15], 0.3);
    }
    add(icosphereGeo(0.2, 1, [1, 1, 1, 1]), makeTransform(0, 0, -0.85), [1, 0.6, 0.1], 2.5);
  } else if (kind === "banana") {
    // изогнутая кожура: три наклонных бруска + «лепестки»
    for (let k = -1; k <= 1; k++) {
      add(boxGeo(0.22, 0.2, 0.5), makeTransform(k * 0.12, 0.12 + Math.abs(k) * 0.06, k * 0.38, k * 0.35), [1, 0.86, 0.15], 0.15);
    }
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2;
      add(boxGeo(0.16, 0.05, 0.55), makeTransform(Math.sin(a) * 0.32, 0.03, Math.cos(a) * 0.32, a), [0.95, 0.8, 0.1], 0.1);
    }
    add(boxGeo(0.07, 0.07, 0.07), makeTransform(0.12, 0.25, 0.62), [0.35, 0.22, 0.05], 0);
  }
  return b;
}

let nextId = 1;

export class ItemSystem {
  constructor(game, run, mode) {
    this.game = game;
    this.r = game.renderer;
    this.run = run;
    this.mode = mode; // "boxes" | "meter"
    this.isCircuit = run.def.type === "circuit";
    this.boxes = [];
    this.rockets = [];
    this.bananas = [];
    this.meshes = {};
    for (const k of ["box", "rocket", "banana"]) this.meshes[k] = this.r.createMesh(buildMesh(k));
    // для сетевой игры: сюда отправляются собственные действия (выстрел, банан, попадание)
    this.onAction = null;
    for (const racer of this.racers()) {
      racer.item = null;
      racer.meter = 0;
      racer.lastPlace = 0;
    }
    if (mode === "boxes") this.placeBoxes();
  }
  racers() {
    return this.game.events.racers();
  }
  addItem(kind, m) {
    return this.r.add({
      mesh: this.meshes[kind],
      defines: ["CARMAT"],
      uniforms: { u_model: m },
      bounds: { c: [m[12], m[13], m[14]], r: 3 },
      shadow: kind !== "rocket",
      reflect: false,
    });
  }
  // КОРОБКИ: ряды по три поперёк дороги, каждые boxEvery метров (на кольце — один круг).
  placeBoxes() {
    const path = this.run.P;
    const len = this.isCircuit ? path.lapLen : path.length;
    for (let d = ITEM_TUNE.boxEvery * 0.6; d < len - 60; d += ITEM_TUNE.boxEvery) {
      const idx = this.game.events.pathPoint(path, d);
      for (const lat of [-0.55, 0, 0.55]) {
        const off = lat * path.hw[idx];
        const x = path.x[idx] + path.tz[idx] * off;
        const z = path.z[idx] - path.tx[idx] * off;
        const y = this.game.world.groundAt(x, z, {}).h + 1.1;
        const box = { x, y, z, alive: true, t: 0, spin: Math.random() * 6 };
        box.item = this.addItem("box", makeTransform(x, y, z));
        this.boxes.push(box);
      }
    }
  }
  // Что выпало из коробки: зависит от места в гонке.
  roll(racer) {
    const st = this.game.events.standings();
    const place = racer.place || 1;
    const odds = st.length < 2 ? ITEM_TUNE.odds.middle : place === 1 ? ITEM_TUNE.odds.first : place === st.length ? ITEM_TUNE.odds.last : ITEM_TUNE.odds.middle;
    let sum = 0;
    for (const k in odds) sum += odds[k];
    let r = Math.random() * sum;
    for (const k in odds) {
      r -= odds[k];
      if (r <= 0) return k;
    }
    return "nitro";
  }
  // КАЖДЫЙ КАДР
  update(dt) {
    if (dt <= 0) return;
    const racers = this.racers();
    const started = this.run.started;
    // коробки: вращаются, подбираются, появляются снова
    for (const box of this.boxes) {
      box.spin += dt * 1.6;
      if (!box.alive) {
        box.t -= dt;
        if (box.t <= 0) {
          box.alive = true;
          box.item.visible = true;
        }
        continue;
      }
      box.item.uniforms.u_model.set(makeTransform(box.x, box.y + Math.sin(box.spin * 1.3) * 0.15, box.z, box.spin, 1, 1, 1, 0.35, 0.2));
      for (const r of racers) {
        if (r.kind === "remote" || r.item) continue;
        const p = r.phys.pos;
        if (Math.abs(p[0] - box.x) < 3 && Math.abs(p[2] - box.z) < 3 && Math.hypot(p[0] - box.x, p[2] - box.z) < ITEM_TUNE.pickRadius) {
          box.alive = false;
          box.t = ITEM_TUNE.boxRespawn;
          box.item.visible = false;
          r.item = this.roll(r);
          this.burst(box.x, box.y, box.z, [0.4, 0.75, 1], 6);
          if (this.onAction) this.onAction({ a: "box", i: this.boxes.indexOf(box) });
          if (r.kind === "player") {
            this.game.ui && this.game.ui.toast(ITEM_TYPES[r.item].icon + " " + ITEM_TYPES[r.item].name + "! Нажмите " + this.keyName("item"));
            this.game.audio && this.game.audio.chime && this.game.audio.chime();
          }
          break;
        }
      }
    }
    // шкала: копится за езду, дрифт и обгоны
    if (this.mode === "meter" && started) {
      for (const r of racers) {
        if (r.kind === "remote") continue;
        const moving = r.phys.speed > 5 ? 1 : 0;
        r.meter = Math.min(1, (r.meter || 0) + dt * (moving / ITEM_TUNE.meterTime + (r.phys.drifting ? ITEM_TUNE.meterDrift : 0)));
        if (r.lastPlace && r.place && r.place < r.lastPlace) {
          r.meter = Math.min(1, r.meter + ITEM_TUNE.meterOvertake * (r.lastPlace - r.place));
        }
        r.lastPlace = r.place;
      }
    }
    // боты решают, когда применить способность
    if (started) {
      for (const r of racers) {
        if (r.kind === "bot" && !r.finished) this.botThink(r, dt, racers);
      }
    }
    this.updateRockets(dt, racers);
    this.updateBananas(dt, racers);
  }
  keyName(action) {
    const b = this.game.settings.bindings[action] || [];
    const code = b[0] || "";
    return code.replace("Key", "").replace("Digit", "");
  }
  // ПРИМЕНИТЬ: игрок — клавишей, бот — сам. type — для режима «шкала» (какую выбрать).
  use(racer, type) {
    if (!this.run.started || racer.finished) return false;
    let kind = null;
    if (this.mode === "boxes") {
      kind = racer.item;
      racer.item = null;
    } else if ((racer.meter || 0) >= 1 && type) {
      kind = type;
      racer.meter = 0;
    }
    if (!kind) return false;
    if (kind === "nitro") {
      this.nitro(racer);
    } else if (kind === "banana") {
      this.dropBanana(racer);
    } else if (kind === "rocket") {
      this.fireRocket(racer);
    }
    return true;
  }
  nitro(racer, fromNet) {
    racer.phys.nitro = ITEM_TUNE.nitroTime;
    if (!fromNet && this.onAction) this.onAction({ a: "nitro", by: racer.id });
  }
  dropBanana(racer, at, fromNet) {
    const c = racer.phys;
    const back = c.halfL + 1.4;
    const x = at ? at[0] : c.pos[0] - Math.sin(c.yaw) * back;
    const z = at ? at[1] : c.pos[2] - Math.cos(c.yaw) * back;
    const y = this.game.world.groundAt(x, z, {}).h + 0.02;
    const id = at ? at[2] : racer.id + ":" + nextId++;
    const ban = { id, x, y, z, life: ITEM_TUNE.bananaLife, owner: racer.id, safe: 0.6, yaw: Math.random() * 6 };
    ban.item = this.addItem("banana", makeTransform(x, y, z, ban.yaw));
    this.bananas.push(ban);
    if (!fromNet && this.onAction) this.onAction({ a: "banana", by: racer.id, x, z, id });
    if (this.bananas.length > 24) this.removeBanana(this.bananas[0]);
  }
  removeBanana(ban) {
    this.r.remove(ban.item);
    this.bananas.splice(this.bananas.indexOf(ban), 1);
  }
  // Цель ракеты — ближайший соперник впереди по трассе.
  pickTarget(racer, racers) {
    let best = null;
    let bestGap = ITEM_TUNE.rocketRange;
    for (const r of racers) {
      if (r === racer || r.finished) continue;
      const gap = r.progress - racer.progress;
      if (gap > 0 && gap < bestGap) {
        bestGap = gap;
        best = r;
      }
    }
    return best;
  }
  fireRocket(racer, targetId, fromNet, projId) {
    const racers = this.racers();
    const target = targetId ? racers.find((r) => r.id === targetId) || null : this.pickTarget(racer, racers);
    const c = racer.phys;
    const fx = Math.sin(c.yaw);
    const fz = Math.cos(c.yaw);
    const id = projId || racer.id + ":" + nextId++;
    const rk = {
      id,
      owner: racer,
      target,
      pos: [c.pos[0] + fx * (c.halfL + 1), c.pos[1] + 1, c.pos[2] + fz * (c.halfL + 1)],
      dir: [fx, 0, fz],
      idx: racer.idx || 0,
      life: ITEM_TUNE.rocketLife,
      age: 0,
      smoke: 0,
    };
    rk.item = this.addItem("rocket", makeTransform(rk.pos[0], rk.pos[1], rk.pos[2], c.yaw));
    this.rockets.push(rk);
    if (racer.kind === "player" && this.game.ui) {
      this.game.ui.toast(target ? "🚀 Ракета летит в " + target.name : "🚀 Ракета — впереди никого");
    }
    if (target && target.kind === "player" && this.game.ui) {
      this.game.ui.toast("⚠️ " + racer.name + " выпустил ракету!");
    }
    if (!fromNet && this.onAction) this.onAction({ a: "rocket", by: racer.id, target: target ? target.id : null, id });
  }
  updateRockets(dt, racers) {
    const path = this.run.P;
    const n = path.n;
    for (const rk of this.rockets.slice()) {
      rk.age += dt;
      rk.life -= dt;
      // куда лететь: вдоль трассы к цели; вблизи — прямо в машину
      let aim;
      const t = rk.target;
      const tp = t ? t.phys.pos : null;
      const dTarget = tp ? Math.hypot(tp[0] - rk.pos[0], tp[2] - rk.pos[2]) : Infinity;
      // двигаем «свою» точку трассы вперёд, пока она рядом с ракетой
      for (let k = 0; k < 30; k++) {
        const j = this.isCircuit ? (rk.idx + 1) % n : Math.min(rk.idx + 1, n - 1);
        if (Math.hypot(path.x[j] - rk.pos[0], path.z[j] - rk.pos[2]) > Math.hypot(path.x[rk.idx] - rk.pos[0], path.z[rk.idx] - rk.pos[2]) + 0.5) break;
        rk.idx = j;
      }
      if (tp && dTarget < 45) {
        aim = [tp[0], tp[1] + 0.6, tp[2]];
      } else {
        const j = this.isCircuit ? (rk.idx + 12) % n : Math.min(rk.idx + 12, n - 1);
        aim = [path.x[j], path.h[j] + 1.1, path.z[j]];
      }
      let dx = aim[0] - rk.pos[0];
      let dy = aim[1] - rk.pos[1];
      let dz = aim[2] - rk.pos[2];
      const L = Math.hypot(dx, dy, dz) || 1;
      dx /= L;
      dy /= L;
      dz /= L;
      const turn = clamp(dt * 7, 0, 1);
      rk.dir[0] += (dx - rk.dir[0]) * turn;
      rk.dir[1] += (dy - rk.dir[1]) * turn;
      rk.dir[2] += (dz - rk.dir[2]) * turn;
      const dl = Math.hypot(rk.dir[0], rk.dir[1], rk.dir[2]) || 1;
      const sp = ITEM_TUNE.rocketSpeed * dt;
      rk.pos[0] += (rk.dir[0] / dl) * sp;
      rk.pos[1] += (rk.dir[1] / dl) * sp;
      rk.pos[2] += (rk.dir[2] / dl) * sp;
      const g = this.game.world.groundAt(rk.pos[0], rk.pos[2], {}).h;
      if (rk.pos[1] < g + 0.5) rk.pos[1] = g + 0.5;
      const yaw = Math.atan2(rk.dir[0], rk.dir[2]);
      const pitch = -Math.asin(clamp(rk.dir[1] / dl, -1, 1));
      rk.item.uniforms.u_model.set(makeTransform(rk.pos[0], rk.pos[1], rk.pos[2], yaw, 1, 1, 1, pitch, 0));
      // дым за ракетой
      rk.smoke -= dt;
      if (rk.smoke <= 0 && this.game.fx) {
        rk.smoke = 0.03;
        this.game.fx.spawnPuff(rk.pos[0] - rk.dir[0], rk.pos[1], rk.pos[2] - rk.dir[2], 0, 0.6, 0, 0.35, 1.6, [0.85, 0.85, 0.85], 0.55, 0.9);
      }
      // попадание: в любую машину рядом (кроме своей в первые полсекунды)
      let hit = null;
      for (const r of racers) {
        if (r === rk.owner && rk.age < 0.6) continue;
        const p = r.phys.pos;
        if (Math.hypot(p[0] - rk.pos[0], p[1] + 0.6 - rk.pos[1], p[2] - rk.pos[2]) < ITEM_TUNE.hitRadius) {
          hit = r;
          break;
        }
      }
      if (hit) {
        this.explode(rk);
        // попадание засчитывает тот, у кого эта машина «своя»: игрок — свою, хозяин игры — ботов
        if (this.ownsRacer(hit)) {
          this.hitRacer(hit, "rocket", rk.owner);
          if (this.onAction) this.onAction({ a: "hit", kind: "rocket", victim: hit.id, by: rk.owner.id, proj: rk.id });
        }
      } else if (rk.life <= 0) {
        this.explode(rk);
      }
    }
  }
  // Чью машину «считает» этот компьютер: свою — всегда, ботов — если игра не сетевая или мы хозяин.
  ownsRacer(r) {
    if (r.kind === "player") return true;
    if (r.kind === "bot") return !this.game.isOnline() || this.game.net.isHost;
    return false;
  }
  explode(rk) {
    this.burst(rk.pos[0], rk.pos[1], rk.pos[2], [1, 0.55, 0.15], 14);
    this.r.remove(rk.item);
    const i = this.rockets.indexOf(rk);
    if (i >= 0) this.rockets.splice(i, 1);
  }
  burst(x, y, z, color, count) {
    const fx = this.game.fx;
    if (!fx) return;
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2;
      fx.spawnPuff(x, y, z, Math.cos(a) * 4, 2 + Math.random() * 3, Math.sin(a) * 4, 0.6, 2.4, color, 0.8, 0.8);
    }
  }
  updateBananas(dt, racers) {
    for (const ban of this.bananas.slice()) {
      ban.life -= dt;
      ban.safe -= dt;
      if (ban.life <= 0) {
        this.removeBanana(ban);
        continue;
      }
      for (const r of racers) {
        if (ban.safe > 0 && r.id === ban.owner) continue;
        const p = r.phys.pos;
        if (Math.abs(p[0] - ban.x) < 3 && Math.abs(p[2] - ban.z) < 3 && Math.hypot(p[0] - ban.x, p[2] - ban.z) < ITEM_TUNE.bananaRadius + r.phys.halfW * 0.6) {
          if (this.ownsRacer(r)) {
            this.hitRacer(r, "banana", racers.find((o) => o.id === ban.owner));
            if (this.onAction) this.onAction({ a: "hit", kind: "banana", victim: r.id, by: ban.owner, proj: ban.id });
          }
          this.burst(ban.x, ban.y + 0.3, ban.z, [1, 0.9, 0.3], 6);
          this.removeBanana(ban);
          break;
        }
      }
    }
  }
  // СЕТЕВАЯ ИГРА: действие другого игрока (или ботов хозяина).
  applyRemote(m) {
    const racers = this.racers();
    const who = racers.find((r) => r.id === m.by);
    if (m.a === "box") {
      const box = this.boxes[m.i];
      if (box && box.alive) {
        box.alive = false;
        box.t = ITEM_TUNE.boxRespawn;
        box.item.visible = false;
      }
    } else if (m.a === "rocket" && who) {
      this.fireRocket(who, m.target, true, m.id);
    } else if (m.a === "banana" && who) {
      this.dropBanana(who, [m.x, m.z, m.id], true);
    } else if (m.a === "nitro" && who) {
      this.nitro(who, true);
    } else if (m.a === "hit") {
      this.removeProjectile(m.proj);
      const victim = racers.find((r) => r.id === m.victim);
      if (who && who.kind === "player" && victim && this.game.ui) {
        this.game.ui.toast((m.kind === "rocket" ? "💥 Попадание в " : "🍌 На банане: ") + victim.name + "!");
      }
    }
  }
  // Удалить снаряд по id (сетевая игра: попадание случилось у другого игрока).
  removeProjectile(id) {
    const rk = this.rockets.find((r) => r.id === id);
    if (rk) this.explode(rk);
    const ban = this.bananas.find((b) => b.id === id);
    if (ban) this.removeBanana(ban);
  }
  // ПОПАДАНИЕ: машину крутит и сильно замедляет; ракета ещё и подбрасывает.
  hitRacer(r, kind, by) {
    const c = r.phys;
    const rocket = kind === "rocket";
    const slow = rocket ? ITEM_TUNE.rocketSlow : ITEM_TUNE.bananaSlow;
    c.vx *= slow;
    c.vz *= slow;
    c.nitro = 0;
    c.yawRate += (Math.random() < 0.5 ? -1 : 1) * (rocket ? 5 : 3.5);
    if (rocket) {
      c.vy = 5;
      c.onGround = false;
    }
    if (r.effects) r.effects.spin = rocket ? ITEM_TUNE.spinTime : ITEM_TUNE.bananaSpin;
    if (r.kind === "player") {
      this.game.rig && this.game.rig.addShake && this.game.rig.addShake(rocket ? 1 : 0.5);
      this.game.onCarEvent && this.game.onCarEvent({ type: "hit", strength: rocket ? 0.9 : 0.4 });
      this.game.ui && this.game.ui.toast((rocket ? "💥 Ракета от " : "🍌 Банан от ") + (by ? by.name : "соперника") + "!");
    } else if (by && by.kind === "player" && this.game.ui) {
      this.game.ui.toast((rocket ? "💥 Попадание в " : "🍌 На банане: ") + r.name + "!");
    }
  }
  // ИИ БОТА: раз в полсекунды решает, применять ли способность.
  botThink(bot, dt, racers) {
    bot.itemThink -= dt;
    if (bot.itemThink > 0) return;
    bot.itemThink = 0.5 + Math.random() * 0.4;
    const hasItem = this.mode === "boxes" ? bot.item : bot.meter >= 1 ? "choose" : null;
    if (!hasItem) return;
    let ahead = Infinity;
    let behind = Infinity;
    for (const r of racers) {
      if (r === bot) continue;
      const gap = r.progress - bot.progress;
      if (gap > 0) ahead = Math.min(ahead, gap);
      else behind = Math.min(behind, -gap);
    }
    const straight = Math.abs(bot.input.steer) < 0.12 && bot.phys.speed > 15;
    const want = (kind) => this.use(bot, kind);
    if (hasItem === "choose") {
      if (ahead < 160 && Math.random() < 0.6) want("rocket");
      else if (behind < 35) want("banana");
      else if (straight) want("nitro");
      return;
    }
    if (hasItem === "rocket" && ahead < 180 && Math.random() < 0.55) want();
    else if (hasItem === "banana" && (behind < 40 || bot.place === 1) && Math.random() < 0.5) want();
    else if (hasItem === "nitro" && straight && Math.random() < 0.5) want();
  }
  dispose() {
    for (const b of this.boxes) this.r.remove(b.item);
    for (const rk of this.rockets) this.r.remove(rk.item);
    for (const ban of this.bananas) this.r.remove(ban.item);
    this.boxes = [];
    this.rockets = [];
    this.bananas = [];
  }
}
