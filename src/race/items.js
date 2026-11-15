// СПОСОБНОСТИ В ЗАЕЗДАХ (в духе аркадных гонок): девять штук трёх видов.
//   АТАКА:    🚀 ракета — в ближайшего впереди;  🎯 перехватчик — летит к лидеру и взрывается с размахом;
//             🌩️ молния — бьёт по всем, кто впереди;  💥 ударная волна — расталкивает тех, кто рядом.
//   СКОРОСТЬ: ⚡ нитро — рывок;  🧲 магнит — притягивает к сопернику впереди.
//   ЗАЩИТА:   🍌 банан и 🛢️ масло — оставить сзади;  🛡️ щит — спасает от одного попадания.
// Два способа получать (Настройки → Гонка → «Способности»):
//   «Коробки» — проезжаешь через коробку с «?» и получаешь случайную способность (F — применить);
//   «Шкала»   — шкала копится за езду, дрифт и обгоны; когда полная — на выбор три способности (клавиши 1, 2, 3).
// Чем дальше гонщик от первого места, тем сильнее способности ему выпадают.
// Работают одинаково для игрока, ботов и друзей по сети.

import { clamp, lerp } from "../core/math.js";
import { MeshBuilder, boxGeo, cylinderGeo, icosphereGeo, makeTransform } from "../render/mesh.js";

export const ITEM_TYPES = {
  rocket: { name: "Ракета", icon: "🚀", hint: "летит в соперника впереди", group: "attack" },
  seeker: { name: "Перехватчик", icon: "🎯", hint: "догоняет лидера гонки", group: "attack" },
  shock: { name: "Молния", icon: "🌩️", hint: "бьёт по всем, кто впереди", group: "attack" },
  wave: { name: "Ударная волна", icon: "💥", hint: "расталкивает машины рядом", group: "attack" },
  nitro: { name: "Нитро", icon: "⚡", hint: "мощный рывок", group: "speed" },
  magnet: { name: "Магнит", icon: "🧲", hint: "притягивает к сопернику впереди", group: "speed" },
  banana: { name: "Банан", icon: "🍌", hint: "оставить сзади", group: "trap" },
  oil: { name: "Масло", icon: "🛢️", hint: "скользкая лужа сзади", group: "trap" },
  shield: { name: "Щит", icon: "🛡️", hint: "защита от одного попадания", group: "trap" },
};
export const ITEM_ORDER = Object.keys(ITEM_TYPES);
// В режиме «шкала» на выбор дают по одной способности каждого вида: 1 — атака, 2 — скорость, 3 — защита.
export const ITEM_GROUPS = ["attack", "speed", "trap"];

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
  seekerSpeed: 96, // скорость перехватчика, м/с
  seekerLife: 18, // сколько секунд он летит
  seekerBlast: 7, // радиус взрыва перехватчика, м
  bananaSpin: 1.0, // сколько секунд крутит после банана
  bananaSlow: 0.55, // какая доля скорости остаётся после банана
  bananaRadius: 1.8, // радиус банана, м
  bananaLife: 90, // сколько секунд банан лежит на дороге
  oilRadius: 2.7, // радиус масляной лужи, м
  oilLife: 45, // сколько секунд лужа лежит на дороге
  oilSpin: 0.75, // сколько секунд машину носит по маслу
  oilSlow: 0.82, // какая доля скорости остаётся
  nitroTime: 2.6, // сколько секунд действует нитро
  shieldTime: 9, // сколько секунд держится щит
  shockRange: 380, // молния достаёт соперников впереди не дальше стольких метров
  shockSlow: 0.7, // какая доля скорости остаётся после молнии
  shockTime: 2, // сколько секунд после молнии машина «не тянет»
  waveRadius: 14, // радиус ударной волны, м
  wavePush: 10, // с какой скоростью отбрасывает вплотную стоящих, м/с
  magnetTime: 3.6, // сколько секунд тянет магнит
  magnetRange: 170, // магнит цепляется за соперника впереди не дальше стольких метров
  meterTime: 34, // режим «шкала»: за сколько секунд обычной езды шкала заполняется
  meterDrift: 0.07, // + столько в секунду, пока в дрифте
  meterOvertake: 0.18, // + столько за каждый обгон
  // ШАНСЫ В КОРОБКЕ по месту в гонке: лидеру — защита, середине — всего понемногу, последним — самое сильное.
  odds: {
    first: { banana: 28, oil: 24, shield: 26, nitro: 14, wave: 8 },
    middle: { rocket: 24, nitro: 16, magnet: 12, banana: 11, oil: 10, shield: 10, wave: 9, shock: 3, seeker: 4 },
    last: { rocket: 20, nitro: 16, magnet: 20, shock: 11, seeker: 15, shield: 6, wave: 6, banana: 2, oil: 2 },
  },
};

// Модели: коробка «?», ракета, банан, перехватчик, масло. Цвета вершин + свечение (как у ворот чекпоинтов).
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
  } else if (kind === "seeker") {
    // «перехватчик»: крупнее ракеты, синий, со светящимся носом
    add(cylinderGeo(0.3, 0.3, 0, 1.7, 12, [1, 1, 1, 1]), makeTransform(0, 0, -0.85, 0, 1, 1, 1, Math.PI / 2, 0), [0.15, 0.35, 0.95], 0.3);
    add(icosphereGeo(0.32, 1, [1, 1, 1, 1]), makeTransform(0, 0, 0.88, 0, 1, 1, 1.5), [0.6, 0.9, 1], 2.2);
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 2 + Math.PI / 4;
      add(boxGeo(0.07, 0.6, 0.5), makeTransform(Math.cos(a) * 0.38, Math.sin(a) * 0.38, -0.6, 0, 1, 1, 1, 0, a), [0.95, 0.95, 1], 0.4);
    }
    add(icosphereGeo(0.26, 1, [1, 1, 1, 1]), makeTransform(0, 0, -1.0), [0.5, 0.8, 1], 3);
  } else if (kind === "oil") {
    // масляная лужа: тёмный блестящий «блин» с радужным бликом
    add(cylinderGeo(1, 1, 0, 0.03, 18, [1, 1, 1, 1]), makeTransform(0, 0, 0), [0.03, 0.03, 0.05], 0);
    add(cylinderGeo(0.62, 0.62, 0.03, 0.04, 14, [1, 1, 1, 1]), makeTransform(0.12, 0, -0.08), [0.1, 0.08, 0.2], 0.12);
    add(cylinderGeo(0.25, 0.25, 0.04, 0.05, 10, [1, 1, 1, 1]), makeTransform(-0.2, 0, 0.25), [0.2, 0.3, 0.45], 0.2);
    for (let v = 0; v < b.vertexCount; v++) b.ext[v * 4] = 1;
  }
  return b;
}

// Пузырь щита: полупрозрачная сфера (рисуется без освещения, цвет и прозрачность — в вершинах).
function buildBubble() {
  const g = icosphereGeo(1, 2, [1, 1, 1, 1]);
  for (let v = 0; v < g.vertexCount; v++) {
    const y = g.pos[v * 3 + 1];
    g.col[v * 4] = 0.35;
    g.col[v * 4 + 1] = 0.8;
    g.col[v * 4 + 2] = 1;
    g.col[v * 4 + 3] = 0.14 + 0.2 * Math.abs(y);
  }
  return g;
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
    this.bananas = []; // всё, что лежит на дороге: бананы и масло
    this.states = new Map(); // состояние способностей каждого гонщика (щит, магнит…)
    this.meshes = {};
    for (const k of ["box", "rocket", "banana", "seeker", "oil"]) this.meshes[k] = this.r.createMesh(buildMesh(k));
    this.bubbleMesh = this.r.createMesh(buildBubble());
    // для сетевой игры: сюда отправляются собственные действия (выстрел, банан, попадание)
    this.onAction = null;
    for (const racer of this.racers()) {
      racer.item = null;
      racer.meter = 0;
      racer.hand = null;
      racer.lastPlace = 0;
    }
    if (mode === "boxes") this.placeBoxes();
  }
  racers() {
    return this.game.events.racers();
  }
  // Состояние способностей гонщика: shield — сколько секунд ещё держится щит, magnet — магнит, и т. д.
  state(racer) {
    let st = this.states.get(racer.id);
    if (!st) {
      st = { shield: 0, bubble: null, magnet: 0, magnetTarget: null, beam: 0, oilWait: 0 };
      this.states.set(racer.id, st);
    }
    return st;
  }
  addItem(kind, m) {
    return this.r.add({
      mesh: this.meshes[kind],
      defines: ["CARMAT"],
      uniforms: { u_model: m },
      bounds: { c: [m[12], m[13], m[14]], r: 4 },
      shadow: kind !== "rocket" && kind !== "seeker" && kind !== "oil",
      reflect: false,
      polyOffset: kind === "oil" ? [-2, -4] : undefined,
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
  // Шансы для гонщика: плавно меняются от «первого» через «середину» к «последнему».
  oddsFor(racer) {
    const st = this.game.events.standings();
    const n = st.length;
    const O = ITEM_TUNE.odds;
    if (n < 2) return { ...O.middle, seeker: 0, shock: 0, magnet: 0, rocket: 0, wave: 0 };
    const place = racer.place || 1;
    const t = (place - 1) / (n - 1);
    const a = t < 0.5 ? O.first : O.middle;
    const b = t < 0.5 ? O.middle : O.last;
    const k = t < 0.5 ? t * 2 : t * 2 - 1;
    const out = {};
    for (const id of ITEM_ORDER) out[id] = lerp(a[id] || 0, b[id] || 0, k);
    // перехватчик — только тем, кто не в лидерах; молния — не первому
    if (place <= 2) out.seeker = 0;
    if (place === 1) {
      out.shock = 0;
      out.rocket = 0;
      out.magnet = 0;
    }
    return out;
  }
  pick(odds, group) {
    let sum = 0;
    for (const k in odds) if (!group || ITEM_TYPES[k].group === group) sum += odds[k];
    if (sum <= 0) return group === "attack" ? "rocket" : group === "trap" ? "banana" : "nitro";
    let r = Math.random() * sum;
    for (const k in odds) {
      if (group && ITEM_TYPES[k].group !== group) continue;
      r -= odds[k];
      if (r <= 0) return k;
    }
    return "nitro";
  }
  // Что выпало из коробки: зависит от места в гонке.
  roll(racer) {
    return this.pick(this.oddsFor(racer));
  }
  // Режим «шкала»: три способности на выбор — атака, скорость, защита.
  rollHand(racer) {
    const odds = this.oddsFor(racer);
    return ITEM_GROUPS.map((g) => this.pick(odds, g));
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
            const it = ITEM_TYPES[r.item];
            this.game.ui && this.game.ui.toast(it.icon + " " + it.name + " — " + it.hint + ". Нажмите " + this.keyName("item"));
            this.game.audio && this.game.audio.chime && this.game.audio.chime();
          }
          break;
        }
      }
    }
    // шкала: копится за езду, дрифт и обгоны; заполнилась — раздаём три способности на выбор
    if (this.mode === "meter" && started) {
      for (const r of racers) {
        if (r.kind === "remote") continue;
        const moving = r.phys.speed > 5 ? 1 : 0;
        r.meter = Math.min(1, (r.meter || 0) + dt * (moving / ITEM_TUNE.meterTime + (r.phys.drifting ? ITEM_TUNE.meterDrift : 0)));
        if (r.lastPlace && r.place && r.place < r.lastPlace) {
          r.meter = Math.min(1, r.meter + ITEM_TUNE.meterOvertake * (r.lastPlace - r.place));
        }
        r.lastPlace = r.place;
        if (r.meter >= 1 && !r.hand) {
          r.hand = this.rollHand(r);
          if (r.kind === "player") {
            this.game.ui && this.game.ui.toast("Шкала полная: " + r.hand.map((k, n) => ITEM_TYPES[k].icon + " " + this.keyName("item" + (n + 1))).join("   "));
            this.game.audio && this.game.audio.chime && this.game.audio.chime();
          }
        }
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
    this.updateStates(dt, racers);
  }
  keyName(action) {
    const b = this.game.settings.bindings[action] || [];
    const code = b[0] || "";
    return code.replace("Key", "").replace("Digit", "");
  }
  // ПРИМЕНИТЬ: игрок — клавишей, бот — сам. slot — для режима «шкала»: какую из трёх (0, 1, 2) или её название.
  use(racer, slot) {
    if (!this.run.started || racer.finished) return false;
    let kind = null;
    if (this.mode === "boxes") {
      kind = racer.item;
      racer.item = null;
    } else if ((racer.meter || 0) >= 1 && racer.hand && slot !== undefined) {
      kind = typeof slot === "number" ? racer.hand[slot] : racer.hand.includes(slot) ? slot : null;
      if (kind) {
        racer.meter = 0;
        racer.hand = null;
      }
    }
    if (!kind) return false;
    this.activate(racer, kind);
    return true;
  }
  activate(racer, kind) {
    if (kind === "nitro") this.nitro(racer);
    else if (kind === "banana") this.dropTrap(racer, "banana");
    else if (kind === "oil") this.dropTrap(racer, "oil");
    else if (kind === "rocket") this.fireRocket(racer, false);
    else if (kind === "seeker") this.fireRocket(racer, true);
    else if (kind === "shield") this.shield(racer);
    else if (kind === "shock") this.shock(racer);
    else if (kind === "wave") this.wave(racer);
    else if (kind === "magnet") this.magnet(racer);
  }
  say(racer, text) {
    if (racer.kind === "player" && this.game.ui) this.game.ui.toast(text);
  }

  // --- НИТРО -------------------------------------------------------------------
  nitro(racer, fromNet) {
    racer.phys.nitro = ITEM_TUNE.nitroTime;
    if (!fromNet && this.onAction) this.onAction({ a: "nitro", by: racer.id });
  }

  // --- ЩИТ ---------------------------------------------------------------------
  shield(racer, fromNet) {
    this.state(racer).shield = ITEM_TUNE.shieldTime;
    this.say(racer, "🛡️ Щит включён: одно попадание не страшно");
    if (!fromNet && this.onAction) this.onAction({ a: "shield", by: racer.id });
  }

  // --- МАГНИТ ------------------------------------------------------------------
  magnet(racer, targetId, fromNet) {
    const racers = this.racers();
    const target = targetId ? racers.find((r) => r.id === targetId) || null : this.pickTarget(racer, racers, ITEM_TUNE.magnetRange);
    const st = this.state(racer);
    st.magnet = ITEM_TUNE.magnetTime;
    st.magnetTarget = target;
    if (!target && !fromNet) {
      // цепляться не за кого — срабатывает как короткое нитро
      racer.phys.nitro = Math.max(racer.phys.nitro || 0, 1.5);
      st.magnet = 0;
    }
    this.say(racer, target ? "🧲 Магнит тянет к " + target.name : "🧲 Впереди никого — короткий рывок");
    if (target && target.kind === "player" && this.game.ui) this.game.ui.toast("🧲 " + racer.name + " притягивается к вам!");
    if (!fromNet && this.onAction) this.onAction({ a: "magnet", by: racer.id, target: target ? target.id : null });
  }

  // --- МОЛНИЯ ------------------------------------------------------------------
  shock(racer, fromNet) {
    let n = 0;
    for (const r of this.racers()) {
      if (r === racer || r.finished) continue;
      const gap = this.gapAhead(racer, r);
      if (gap <= 0 || gap > ITEM_TUNE.shockRange) continue;
      n++;
      this.bolt(r.phys.pos);
      if (this.ownsRacer(r)) {
        const got = this.hitRacer(r, "shock", racer);
        if (this.onAction) this.onAction({ a: "hit", kind: got ? "shock" : "blocked", victim: r.id, by: racer.id });
      }
    }
    this.say(racer, n ? "🌩️ Молния ударила по соперникам: " + n : "🌩️ Молния — впереди никого");
    if (!fromNet && this.onAction) this.onAction({ a: "shock", by: racer.id });
  }
  // Вспышка молнии над машиной.
  bolt(pos) {
    const fx = this.game.fx;
    if (!fx) return;
    let x = pos[0];
    let z = pos[2];
    for (let k = 0; k < 14; k++) {
      const y = pos[1] + 0.5 + k * 1.6;
      fx.spawnPuff(x, y, z, 0, 0, 0, 0.32, 1.5 - k * 0.05, [1, 0.97, 0.6], 0.95, 0.3);
      x += (Math.random() - 0.5) * 1.4;
      z += (Math.random() - 0.5) * 1.4;
    }
    this.burst(pos[0], pos[1] + 0.6, pos[2], [0.75, 0.85, 1], 8);
  }

  // --- УДАРНАЯ ВОЛНА -----------------------------------------------------------
  wave(racer, at, fromNet) {
    const c = racer.phys;
    const x = at ? at[0] : c.pos[0];
    const z = at ? at[1] : c.pos[2];
    const y = c.pos[1];
    const fx = this.game.fx;
    if (fx) {
      for (let k = 0; k < 28; k++) {
        const a = (k / 28) * Math.PI * 2;
        fx.spawnPuff(x + Math.cos(a) * 2, y + 0.4, z + Math.sin(a) * 2, Math.cos(a) * 22, 1.5, Math.sin(a) * 22, 0.5, 2.2, [1, 0.85, 0.5], 0.8, 1.4);
      }
    }
    let n = 0;
    for (const r of this.racers()) {
      if (r === racer || r.finished) continue;
      const p = r.phys.pos;
      const d = Math.hypot(p[0] - x, p[2] - z);
      if (d > ITEM_TUNE.waveRadius || Math.abs(p[1] - y) > 4) continue;
      n++;
      if (this.ownsRacer(r)) {
        const got = this.hitRacer(r, "wave", racer, { x, z, d });
        if (this.onAction) this.onAction({ a: "hit", kind: got ? "wave" : "blocked", victim: r.id, by: racer.id });
      }
    }
    if (racer.kind === "player") {
      this.game.rig && this.game.rig.addShake && this.game.rig.addShake(0.5);
      this.say(racer, n ? "💥 Волна отбросила соперников: " + n : "💥 Волна — рядом никого");
    }
    if (!fromNet && this.onAction) this.onAction({ a: "wave", by: racer.id, x, z });
  }

  // --- БАНАН И МАСЛО -----------------------------------------------------------
  dropTrap(racer, kind, at, fromNet) {
    const c = racer.phys;
    const back = c.halfL + (kind === "oil" ? 2.4 : 1.4);
    const x = at ? at[0] : c.pos[0] - Math.sin(c.yaw) * back;
    const z = at ? at[1] : c.pos[2] - Math.cos(c.yaw) * back;
    const y = this.game.world.groundAt(x, z, {}, c.pos[1]).h + 0.02;
    const id = at ? at[2] : racer.id + ":" + nextId++;
    const oil = kind === "oil";
    const ban = { id, kind, x, y, z, life: oil ? ITEM_TUNE.oilLife : ITEM_TUNE.bananaLife, owner: racer.id, safe: 0.7, yaw: Math.random() * 6, r: oil ? ITEM_TUNE.oilRadius : ITEM_TUNE.bananaRadius };
    ban.item = this.addItem(kind, oil ? makeTransform(x, y + 0.02, z, ban.yaw, ban.r, 1, ban.r) : makeTransform(x, y, z, ban.yaw));
    this.bananas.push(ban);
    if (!fromNet && this.onAction) this.onAction({ a: kind, by: racer.id, x, z, id });
    if (this.bananas.length > 28) this.removeBanana(this.bananas[0]);
  }
  dropBanana(racer, at, fromNet) {
    this.dropTrap(racer, "banana", at, fromNet);
  }
  removeBanana(ban) {
    this.r.remove(ban.item);
    const i = this.bananas.indexOf(ban);
    if (i >= 0) this.bananas.splice(i, 1);
  }
  updateBananas(dt, racers) {
    for (const ban of this.bananas.slice()) {
      ban.life -= dt;
      ban.safe -= dt;
      if (ban.life <= 0) {
        this.removeBanana(ban);
        continue;
      }
      const oil = ban.kind === "oil";
      for (const r of racers) {
        if (ban.safe > 0 && r.id === ban.owner) continue;
        const p = r.phys.pos;
        if (Math.abs(p[0] - ban.x) > 4 || Math.abs(p[2] - ban.z) > 4 || Math.abs(p[1] - ban.y) > 3) continue;
        if (Math.hypot(p[0] - ban.x, p[2] - ban.z) > ban.r + r.phys.halfW * 0.6) continue;
        if (oil) {
          // масло остаётся лежать; одну и ту же машину носит не чаще раза в пару секунд
          const st = this.state(r);
          if (st.oilWait > 0) continue;
          st.oilWait = 2.5;
          if (this.ownsRacer(r)) {
            const got = this.hitRacer(r, "oil", racers.find((o) => o.id === ban.owner));
            if (this.onAction) this.onAction({ a: "hit", kind: got ? "oil" : "blocked", victim: r.id, by: ban.owner });
          }
          continue;
        }
        if (this.ownsRacer(r)) {
          const got = this.hitRacer(r, "banana", racers.find((o) => o.id === ban.owner));
          if (this.onAction) this.onAction({ a: "hit", kind: got ? "banana" : "blocked", victim: r.id, by: ban.owner, proj: ban.id });
        }
        this.burst(ban.x, ban.y + 0.3, ban.z, [1, 0.9, 0.3], 6);
        this.removeBanana(ban);
        break;
      }
    }
  }

  // --- РАКЕТА И ПЕРЕХВАТЧИК ----------------------------------------------------
  // Расстояние по трассе от a до b (плюс — b впереди). На кольце — кратчайшее по кругу.
  gapAhead(a, b) {
    let gap = b.progress - a.progress;
    if (this.isCircuit) {
      const L = this.run.P.lapLen;
      gap = ((gap % L) + L * 1.5) % L - L / 2;
    }
    return gap;
  }
  // Цель — ближайший соперник впереди по трассе (не дальше range).
  pickTarget(racer, racers, range = ITEM_TUNE.rocketRange) {
    let best = null;
    let bestGap = range;
    for (const r of racers) {
      if (r === racer || r.finished) continue;
      const gap = this.gapAhead(racer, r);
      if (gap > 0 && gap < bestGap) {
        bestGap = gap;
        best = r;
      }
    }
    return best;
  }
  fireRocket(racer, seeker, targetId, fromNet, projId) {
    const racers = this.racers();
    let target = null;
    if (targetId) {
      target = racers.find((r) => r.id === targetId) || null;
    } else if (seeker) {
      // перехватчик идёт за лидером гонки (если лидер — не сам стрелок)
      const lead = this.game.events.standings().find((r) => !r.finished);
      target = lead && lead !== racer ? lead : this.pickTarget(racer, racers, 600);
    } else {
      target = this.pickTarget(racer, racers);
    }
    const c = racer.phys;
    const fx = Math.sin(c.yaw);
    const fz = Math.cos(c.yaw);
    const id = projId || racer.id + ":" + nextId++;
    const rk = {
      id,
      seeker: !!seeker,
      owner: racer,
      target,
      pos: [c.pos[0] + fx * (c.halfL + 1), c.pos[1] + 1, c.pos[2] + fz * (c.halfL + 1)],
      dir: [fx, 0, fz],
      idx: racer.idx || 0,
      life: seeker ? ITEM_TUNE.seekerLife : ITEM_TUNE.rocketLife,
      speed: seeker ? ITEM_TUNE.seekerSpeed : ITEM_TUNE.rocketSpeed,
      age: 0,
      smoke: 0,
    };
    rk.item = this.addItem(seeker ? "seeker" : "rocket", makeTransform(rk.pos[0], rk.pos[1], rk.pos[2], c.yaw));
    this.rockets.push(rk);
    const icon = seeker ? "🎯 Перехватчик" : "🚀 Ракета";
    this.say(racer, target ? icon + " летит в " + target.name : icon + " — впереди никого");
    if (target && target.kind === "player" && this.game.ui) {
      this.game.ui.toast("⚠️ " + racer.name + (seeker ? " выпустил перехватчик!" : " выпустил ракету!"));
    }
    if (!fromNet && this.onAction) this.onAction({ a: seeker ? "seeker" : "rocket", by: racer.id, target: target ? target.id : null, id });
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
      for (let k = 0; k < 40; k++) {
        const j = this.isCircuit ? (rk.idx + 1) % n : Math.min(rk.idx + 1, n - 1);
        if (Math.hypot(path.x[j] - rk.pos[0], path.z[j] - rk.pos[2]) > Math.hypot(path.x[rk.idx] - rk.pos[0], path.z[rk.idx] - rk.pos[2]) + 0.5) break;
        rk.idx = j;
      }
      if (tp && dTarget < 45) {
        aim = [tp[0], tp[1] + 0.6, tp[2]];
      } else {
        const j = this.isCircuit ? (rk.idx + 12) % n : Math.min(rk.idx + 12, n - 1);
        aim = [path.x[j], path.h[j] + (rk.seeker ? 2.2 : 1.1), path.z[j]];
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
      const sp = rk.speed * dt;
      rk.pos[0] += (rk.dir[0] / dl) * sp;
      rk.pos[1] += (rk.dir[1] / dl) * sp;
      rk.pos[2] += (rk.dir[2] / dl) * sp;
      const g = this.game.world.groundAt(rk.pos[0], rk.pos[2], {}, rk.pos[1]).h;
      if (rk.pos[1] < g + 0.5) rk.pos[1] = g + 0.5;
      const yaw = Math.atan2(rk.dir[0], rk.dir[2]);
      const pitch = -Math.asin(clamp(rk.dir[1] / dl, -1, 1));
      rk.item.uniforms.u_model.set(makeTransform(rk.pos[0], rk.pos[1], rk.pos[2], yaw, 1, 1, 1, pitch, rk.seeker ? rk.age * 6 : 0));
      // дым за ракетой
      rk.smoke -= dt;
      if (rk.smoke <= 0 && this.game.fx) {
        rk.smoke = 0.03;
        this.game.fx.spawnPuff(rk.pos[0] - rk.dir[0], rk.pos[1], rk.pos[2] - rk.dir[2], 0, 0.6, 0, 0.35, rk.seeker ? 2 : 1.6, rk.seeker ? [0.6, 0.8, 1] : [0.85, 0.85, 0.85], 0.55, 0.9);
      }
      // попадание: перехватчик пропускает всех, кроме своей цели; ракета бьёт в любую машину рядом
      let hit = null;
      for (const r of racers) {
        if (r === rk.owner && rk.age < 0.6) continue;
        if (rk.seeker && rk.target && r !== rk.target) continue;
        if (rk.seeker && r === rk.owner) continue;
        const p = r.phys.pos;
        if (Math.hypot(p[0] - rk.pos[0], p[1] + 0.6 - rk.pos[1], p[2] - rk.pos[2]) < ITEM_TUNE.hitRadius + (rk.seeker ? 0.8 : 0)) {
          hit = r;
          break;
        }
      }
      if (hit) {
        this.explode(rk);
        // попадание засчитывает тот, у кого эта машина «своя»: игрок — свою, хозяин игры — ботов
        const victims = rk.seeker
          ? racers.filter((r) => r !== rk.owner && Math.hypot(r.phys.pos[0] - rk.pos[0], r.phys.pos[2] - rk.pos[2]) < ITEM_TUNE.seekerBlast)
          : [hit];
        for (const v of victims) {
          if (!this.ownsRacer(v)) continue;
          const got = this.hitRacer(v, "rocket", rk.owner);
          if (this.onAction) this.onAction({ a: "hit", kind: got ? "rocket" : "blocked", victim: v.id, by: rk.owner.id, proj: rk.id });
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
    this.burst(rk.pos[0], rk.pos[1], rk.pos[2], rk.seeker ? [0.5, 0.8, 1] : [1, 0.55, 0.15], rk.seeker ? 26 : 14, rk.seeker ? 1.7 : 1);
    this.r.remove(rk.item);
    const i = this.rockets.indexOf(rk);
    if (i >= 0) this.rockets.splice(i, 1);
  }
  burst(x, y, z, color, count, power = 1) {
    const fx = this.game.fx;
    if (!fx) return;
    for (let k = 0; k < count; k++) {
      const a = (k / count) * Math.PI * 2;
      fx.spawnPuff(x, y, z, Math.cos(a) * 4 * power, 2 + Math.random() * 3, Math.sin(a) * 4 * power, 0.6, 2.4 * power, color, 0.8, 0.8);
    }
  }

  // --- ЩИТ, МАГНИТ: то, что действует какое-то время ----------------------------
  updateStates(dt, racers) {
    for (const r of racers) {
      const st = this.state(r);
      st.oilWait -= dt;
      // щит: пузырь вокруг машины
      if (st.shield > 0) {
        st.shield -= dt;
        if (!st.bubble) {
          st.bubbleM = makeTransform(0, 0, 0);
          st.bubble = this.r.add({
            mesh: this.bubbleMesh,
            prog: "trail",
            blend: true,
            depthWrite: false,
            cull: "none",
            uniforms: { u_model: st.bubbleM },
            bounds: { c: [0, 0, 0], r: 5 },
            order: 5,
            reflect: false,
          });
        }
        const c = r.phys;
        // последние две секунды пузырь мигает
        const blink = st.shield < 2 ? 0.75 + 0.25 * Math.sin(st.shield * 20) : 1;
        const k = (1 + 0.04 * Math.sin(this.run.time * 6)) * blink;
        st.bubbleM.set(makeTransform(c.pos[0], c.pos[1] + 0.55, c.pos[2], c.yaw, (c.halfW + 0.95) * k, 1.25 * k, (c.halfL + 0.75) * k));
        st.bubble.bounds.c[0] = c.pos[0];
        st.bubble.bounds.c[1] = c.pos[1];
        st.bubble.bounds.c[2] = c.pos[2];
        st.bubble.visible = true;
      } else if (st.bubble) {
        this.r.remove(st.bubble);
        st.bubble = null;
      }
      // магнит: тянет к цели, пока она впереди
      if (st.magnet > 0) {
        st.magnet -= dt;
        const t = st.magnetTarget;
        const gap = t ? this.gapAhead(r, t) : -1;
        if (!t || t.finished || gap < 5 || gap > ITEM_TUNE.magnetRange * 1.4) {
          st.magnet = 0;
        } else {
          if (this.ownsRacer(r)) r.phys.nitro = Math.max(r.phys.nitro || 0, 0.12);
          // луч между машинами
          st.beam -= dt;
          if (st.beam <= 0 && this.game.fx) {
            st.beam = 0.05;
            const a = r.phys.pos;
            const b = t.phys.pos;
            for (let k = 1; k <= 5; k++) {
              const f = (k - Math.random() * 0.5) / 6;
              this.game.fx.spawnPuff(lerp(a[0], b[0], f), lerp(a[1], b[1], f) + 0.8, lerp(a[2], b[2], f), 0, 0.2, 0, 0.22, 0.7, [1, 0.35, 0.8], 0.75, 0.4);
            }
          }
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
    } else if ((m.a === "rocket" || m.a === "seeker") && who) {
      this.fireRocket(who, m.a === "seeker", m.target, true, m.id);
    } else if ((m.a === "banana" || m.a === "oil") && who) {
      this.dropTrap(who, m.a, [m.x, m.z, m.id], true);
    } else if (m.a === "nitro" && who) {
      this.nitro(who, true);
    } else if (m.a === "shield" && who) {
      this.shield(who, true);
    } else if (m.a === "magnet" && who) {
      this.magnet(who, m.target, true);
    } else if (m.a === "shock" && who) {
      this.shock(who, true);
    } else if (m.a === "wave" && who) {
      this.wave(who, [m.x, m.z], true);
    } else if (m.a === "hit") {
      if (m.proj) this.removeProjectile(m.proj);
      const victim = racers.find((r) => r.id === m.victim);
      if (victim && m.kind === "blocked") {
        this.state(victim).shield = 0;
      }
      if (who && who.kind === "player" && victim && this.game.ui) {
        this.game.ui.toast(m.kind === "blocked" ? "🛡️ " + victim.name + " закрылся щитом" : HIT_TEXT[m.kind][0] + victim.name + "!");
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
  // ПОПАДАНИЕ. Возвращает false, если удар принял на себя щит.
  //   rocket — крутит, сильно замедляет и подбрасывает;  banana — крутит;  oil — носит в сторону;
  //   shock — замедляет и на пару секунд «душит» мотор;  wave — отбрасывает от центра волны.
  hitRacer(r, kind, by, info) {
    const c = r.phys;
    const st = this.state(r);
    if (st.shield > 0) {
      st.shield = 0;
      this.burst(c.pos[0], c.pos[1] + 0.8, c.pos[2], [0.4, 0.85, 1], 12);
      if (r.kind === "player") {
        this.game.ui && this.game.ui.toast("🛡️ Щит спас от удара" + (by ? " (" + by.name + ")" : "") + "!");
        this.game.audio && this.game.audio.chime && this.game.audio.chime();
      } else if (by && by.kind === "player" && this.game.ui) {
        this.game.ui.toast("🛡️ " + r.name + " закрылся щитом");
      }
      return false;
    }
    const side = Math.random() < 0.5 ? -1 : 1;
    let shake = 0.5;
    if (kind === "rocket") {
      c.vx *= ITEM_TUNE.rocketSlow;
      c.vz *= ITEM_TUNE.rocketSlow;
      c.yawRate += side * 5;
      c.vy = 5;
      c.onGround = false;
      if (r.effects) r.effects.spin = ITEM_TUNE.spinTime;
      shake = 1;
    } else if (kind === "banana") {
      c.vx *= ITEM_TUNE.bananaSlow;
      c.vz *= ITEM_TUNE.bananaSlow;
      c.yawRate += side * 3.5;
      if (r.effects) r.effects.spin = ITEM_TUNE.bananaSpin;
    } else if (kind === "oil") {
      c.vx *= ITEM_TUNE.oilSlow;
      c.vz *= ITEM_TUNE.oilSlow;
      c.yawRate += side * 2.6;
      if (r.effects) r.effects.spin = ITEM_TUNE.oilSpin;
      shake = 0.3;
    } else if (kind === "shock") {
      c.vx *= ITEM_TUNE.shockSlow;
      c.vz *= ITEM_TUNE.shockSlow;
      c.yawRate += side * 1.2;
      if (r.effects) r.effects.slow = ITEM_TUNE.shockTime;
      this.bolt(c.pos);
      shake = 0.7;
    } else if (kind === "wave") {
      const dx = c.pos[0] - (info ? info.x : c.pos[0]);
      const dz = c.pos[2] - (info ? info.z : c.pos[2]);
      const d = Math.hypot(dx, dz) || 1;
      const k = ITEM_TUNE.wavePush * (1 - clamp(d / ITEM_TUNE.waveRadius, 0, 1) * 0.6);
      c.vx += (dx / d) * k;
      c.vz += (dz / d) * k;
      c.yawRate += side * 2.2;
      if (r.effects) r.effects.spin = 0.55;
      shake = 0.8;
    }
    c.nitro = 0;
    if (r.kind === "player") {
      this.game.rig && this.game.rig.addShake && this.game.rig.addShake(shake);
      this.game.onCarEvent && this.game.onCarEvent({ type: "hit", strength: kind === "rocket" ? 0.9 : 0.4 });
      this.game.ui && this.game.ui.toast(HIT_TEXT[kind][1] + (by ? by.name : "соперника") + "!");
    } else if (by && by.kind === "player" && this.game.ui) {
      this.game.ui.toast(HIT_TEXT[kind][0] + r.name + "!");
    }
    return true;
  }

  // ИИ БОТА: пару раз в секунду решает, применять ли способность. Чем выше уровень — тем реже зевает.
  botThink(bot, dt, racers) {
    bot.itemThink -= dt;
    if (bot.itemThink > 0) return;
    bot.itemThink = 0.35 + Math.random() * 0.4;
    const kinds = this.mode === "boxes" ? (bot.item ? [bot.item] : []) : bot.meter >= 1 && bot.hand ? bot.hand : [];
    if (!kinds.length) return;
    const sharp = bot.level ? clamp(bot.level.line, 0.4, 1) : 0.8;
    if (Math.random() > sharp) return;
    let ahead = Infinity;
    let behind = Infinity;
    let aheadCount = 0;
    let near = Infinity;
    for (const r of racers) {
      if (r === bot || r.finished) continue;
      const gap = this.gapAhead(bot, r);
      if (gap > 0) {
        ahead = Math.min(ahead, gap);
        if (gap < ITEM_TUNE.shockRange) aheadCount++;
      } else {
        behind = Math.min(behind, -gap);
      }
      near = Math.min(near, Math.hypot(r.phys.pos[0] - bot.phys.pos[0], r.phys.pos[2] - bot.phys.pos[2]));
    }
    // летит ли в бота ракета?
    let incoming = false;
    for (const rk of this.rockets) {
      if (rk.target === bot && Math.hypot(rk.pos[0] - bot.phys.pos[0], rk.pos[2] - bot.phys.pos[2]) < 90) incoming = true;
    }
    const straight = Math.abs(bot.input.steer) < 0.14 && bot.phys.speed > 15;
    const held = (bot.heldFor = (bot.heldFor || 0) + 0.5);
    const want = {
      rocket: ahead < 170 && straight,
      seeker: bot.place >= 3 || (ahead > 60 && ahead < 600),
      shock: aheadCount >= 2 || ahead < 220,
      wave: near < 9,
      nitro: straight && !incoming,
      magnet: ahead > 25 && ahead < ITEM_TUNE.magnetRange && straight,
      banana: behind < 40 || (bot.place === 1 && held > 6),
      oil: behind < 45 || (bot.place === 1 && held > 6),
      shield: incoming || behind < 22 || held > 12,
    };
    // давно держит и применить не выходит — сбрасывает что получится, чтобы взять новое
    for (const k of kinds) {
      if (want[k] || held > 22) {
        bot.heldFor = 0;
        this.use(bot, this.mode === "boxes" ? undefined : k);
        return;
      }
    }
  }
  dispose() {
    for (const b of this.boxes) this.r.remove(b.item);
    for (const rk of this.rockets) this.r.remove(rk.item);
    for (const ban of this.bananas) this.r.remove(ban.item);
    for (const st of this.states.values()) if (st.bubble) this.r.remove(st.bubble);
    this.states.clear();
    this.boxes = [];
    this.rockets = [];
    this.bananas = [];
  }
}

// Тексты попаданий: [«вы попали в …», «в вас попал …»].
const HIT_TEXT = {
  rocket: ["💥 Попадание в ", "💥 Ракета от "],
  banana: ["🍌 На банане: ", "🍌 Банан от "],
  oil: ["🛢️ В масле: ", "🛢️ Масло от "],
  shock: ["🌩️ Молния ударила: ", "🌩️ Молния от "],
  wave: ["💥 Волна отбросила: ", "💥 Ударная волна от "],
};
