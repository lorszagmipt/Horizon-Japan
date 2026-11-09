// ОНЛАЙН-ИГРА С ДРУЗЬЯМИ: комната по коду, машины друг друга, общие заезды и способности.
//
// Как устроено:
//  • Один игрок «создаёт комнату» — он хозяин. Его компьютер получает адрес hzjp-<КОД> на бесплатном
//    сервере знакомств PeerJS. Друзья вводят КОД и подключаются к хозяину напрямую (WebRTC).
//  • Каждый сам считает физику своей машины и 15 раз в секунду отправляет хозяину, где она.
//    Хозяин пересылает всем положения всех машин (и своих ботов). Чужие машины плавно
//    «дорисовываются» между сообщениями (интерполяция с задержкой ~0,1 с).
//  • Заезд выбирает хозяин: всем приходит «старт» — места на решётке, боты, режим способностей.
//  • Ракеты и бананы видны у всех; попадание засчитывает тот, в чью машину попали.
//
// Адрес игры с ?netlocal — «сеть» между вкладками одного браузера (без интернета, для проверки).

import { CarView } from "../car/carView.js";
import { CARS } from "../car/cars.js";
import { clamp, lerp, wrapAngle } from "../core/math.js";

export const NET_PREFIX = "hzjp-"; // начало адреса комнаты на сервере PeerJS
export const NET_RATE = 15; // сколько раз в секунду отправлять положение машины
export const NET_DELAY = 0.1; // на сколько секунд «в прошлом» рисовать чужие машины (сглаживание)
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // без похожих символов (0/O, 1/I)

async function createPeer(id) {
  if (location.search.includes("netlocal")) {
    const { LocalPeer } = await import("./localPeer.js");
    return new LocalPeer(id);
  }
  // настоящая сеть: библиотека PeerJS (npm install peerjs) и её бесплатный сервер 0.peerjs.com
  const mod = await import("peerjs");
  const Peer = mod.Peer || mod.default;
  return new Peer(id, { debug: 1 });
}

function makeCode() {
  let s = "";
  for (let k = 0; k < 5; k++) s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  return s;
}

// «Физика» чужой машины: только то, что нужно для рисования, столкновений и способностей.
class RemotePhys {
  constructor(spec) {
    this.setSpec(spec);
    this.pos = [0, -1000, 0];
    this.yaw = 0;
    this.vx = 0;
    this.vz = 0;
    this.vy = 0;
    this.yawRate = 0;
    this.pitch = 0;
    this.roll = 0;
    this.bodyPitch = 0;
    this.bodyRoll = 0;
    this.steer = 0;
    this.wheelSpin = 0;
    this.braking = false;
    this.boosting = false;
    this.drifting = false;
    this.nitro = 0;
    this.onGround = true;
    this.groundH = 0;
    this.ground = { h: 0 };
  }
  setSpec(spec) {
    this.spec = spec;
    this.P = spec.phys;
    this.halfW = spec.body.W / 2;
    this.halfL = spec.body.L / 2;
  }
  get speed() {
    return Math.hypot(this.vx, this.vz);
  }
}

// Чужая машина (друг или бот хозяина): модель, буфер сообщений, прогресс в заезде.
class RemoteCar {
  constructor(game, info) {
    this.game = game;
    this.kind = "remote";
    this.id = info.id;
    this.isBot = !!info.bot;
    this.name = info.name;
    this.color = info.color;
    this.spec = CARS.find((c) => c.id === info.car) || CARS[0];
    this.phys = new RemotePhys(this.spec);
    this.view = new CarView(game.renderer, this.spec, this.color);
    this.view.setVisible(false);
    this.buf = [];
    this.progress = 0;
    this.idx = 0;
    this.ev = null;
    this.finished = false;
    this.finishTime = null;
    this.place = 0;
    this.effects = { spin: 0, boost: 0 };
    this.item = null;
    this.meter = 0;
  }
  setLook(car, color) {
    if (car !== this.spec.id) {
      this.spec = CARS.find((c) => c.id === car) || CARS[0];
      this.phys.setSpec(this.spec);
      this.view.dispose();
      this.view = new CarView(this.game.renderer, this.spec, color);
      this.color = color;
    } else if (color !== this.color) {
      this.color = color;
      this.view.setColor(color);
    }
  }
  push(st, now) {
    if (st.c && (st.c !== this.spec.id || st.k !== this.color)) this.setLook(st.c, st.k);
    this.buf.push({ t: now, st });
    if (this.buf.length > 30) this.buf.shift();
    this.progress = st.pr || 0;
    this.ev = st.ev || null;
    this.finished = !!st.f;
    this.finishTime = st.ft ?? null;
    if (st.n) this.name = st.n;
  }
  // Положение «на NET_DELAY секунд назад» — между двумя ближайшими сообщениями.
  update(now) {
    const b = this.buf;
    if (!b.length) return;
    const t = now - NET_DELAY;
    let a = b[0];
    let c = null;
    for (let i = b.length - 1; i >= 0; i--) {
      if (b[i].t <= t) {
        a = b[i];
        c = b[i + 1] || null;
        break;
      }
    }
    const p = this.phys;
    const A = a.st;
    if (c) {
      const k = clamp((t - a.t) / Math.max(0.001, c.t - a.t), 0, 1);
      const C = c.st;
      for (let i = 0; i < 3; i++) p.pos[i] = lerp(A.p[i], C.p[i], k);
      p.yaw = A.y + wrapAngle(C.y - A.y) * k;
      p.vx = lerp(A.v[0], C.v[0], k);
      p.vz = lerp(A.v[1], C.v[1], k);
      p.steer = lerp(A.s, C.s, k);
      p.pitch = lerp(A.pt, C.pt, k);
      p.roll = lerp(A.rl, C.rl, k);
    } else {
      // новых сообщений нет — немного «досчитываем» по скорости (не дольше 0,25 с)
      const dt = clamp(t - a.t, 0, 0.25);
      p.pos[0] = A.p[0] + A.v[0] * dt;
      p.pos[1] = A.p[1];
      p.pos[2] = A.p[2] + A.v[1] * dt;
      p.yaw = A.y;
      p.vx = A.v[0];
      p.vz = A.v[1];
      p.steer = A.s;
      p.pitch = A.pt;
      p.roll = A.rl;
    }
    p.wheelSpin += (p.vx * Math.sin(p.yaw) + p.vz * Math.cos(p.yaw)) * (1 / 60) / 0.34;
    p.braking = !!A.br;
    p.boosting = !!A.bo;
    p.drifting = !!A.dr;
    p.groundH = this.game.world.groundAt(p.pos[0], p.pos[2], p.ground).h;
    this.view.setVisible(true);
    this.view.update(p);
  }
  dispose() {
    this.view.dispose();
  }
}

export class NetSession {
  constructor(game) {
    this.game = game;
    this.peer = null;
    this.isHost = false;
    this.code = null;
    this.myId = null;
    this.hostConn = null; // у гостя: соединение с хозяином
    this.conns = new Map(); // у хозяина: id игрока -> соединение
    this.players = new Map(); // id -> { id, name, car, color }
    this.cars = new Map(); // id -> RemoteCar (друзья и боты хозяина)
    this.sendAcc = 0;
    this.nextGuest = 1;
    this.status = "off"; // off | connecting | online
    this.onChange = null; // интерфейс подписывается, чтобы обновить список игроков
    this.onMessage = null; // всплывающие сообщения («Юки подключился»)
  }
  get name() {
    return this.game.settings.netName || "Игрок";
  }
  myInfo() {
    const g = this.game;
    return { id: this.myId, name: this.name, car: g.car.spec.id, color: g.carColor(g.car.spec) };
  }
  // СОЗДАТЬ КОМНАТУ (хозяин). Код — 5 символов; если занят — пробуем другой.
  async host() {
    this.leave(true);
    this.status = "connecting";
    for (let attempt = 0; attempt < 4; attempt++) {
      const code = makeCode();
      try {
        const peer = await createPeer(NET_PREFIX + code);
        await new Promise((res, rej) => {
          peer.on("open", res);
          peer.on("error", rej);
        });
        this.peer = peer;
        this.code = code;
        this.isHost = true;
        this.myId = "h";
        this.players.set("h", this.myInfo());
        peer.on("connection", (conn) => this.acceptGuest(conn));
        peer.on("error", (e) => this.say("Сеть: " + (e.type || e.message)));
        this.status = "online";
        this.changed();
        return code;
      } catch (e) {
        if (e && e.type !== "unavailable-id") {
          this.status = "off";
          throw e;
        }
      }
    }
    this.status = "off";
    throw new Error("не удалось создать комнату");
  }
  // ВОЙТИ ПО КОДУ (гость).
  async join(code) {
    this.leave(true);
    code = String(code || "").trim().toUpperCase();
    this.status = "connecting";
    const peer = await createPeer();
    await new Promise((res, rej) => {
      peer.on("open", res);
      peer.on("error", rej);
    });
    this.peer = peer;
    this.isHost = false;
    this.code = code;
    const conn = peer.connect(NET_PREFIX + code, { reliable: true });
    this.hostConn = conn;
    await new Promise((res, rej) => {
      const fail = (e) => rej(e && e.type === "peer-unavailable" ? new Error("Комната " + code + " не найдена") : e);
      peer.on("error", fail);
      conn.on("open", () => {
        conn.send({ t: "hello", ...this.myInfo() });
        res();
      });
      setTimeout(() => rej(new Error("Нет ответа от комнаты " + code)), 12000);
    });
    conn.on("data", (m) => this.receive(m, "h"));
    conn.on("close", () => {
      this.say("Хозяин комнаты отключился");
      this.leave();
    });
    // ждём, пока хозяин выдаст нам номер
    await new Promise((res, rej) => {
      this.welcomed = res;
      setTimeout(() => rej(new Error("Хозяин не ответил")), 8000);
    });
    this.status = "online";
    this.changed();
  }
  acceptGuest(conn) {
    conn.on("data", (m) => {
      if (m.t === "hello") {
        if (this.conns.size >= 7) {
          conn.send({ t: "full" });
          setTimeout(() => conn.close(), 300);
          return;
        }
        const id = "p" + this.nextGuest++;
        conn.netId = id;
        this.conns.set(id, conn);
        this.players.set(id, { id, name: m.name, car: m.car, color: m.color });
        conn.send({ t: "welcome", you: id, code: this.code });
        this.broadcast({ t: "roster", players: [...this.players.values()] });
        this.say(m.name + " в комнате");
        this.changed();
        return;
      }
      if (!conn.netId) return;
      this.receive(m, conn.netId);
    });
    conn.on("close", () => {
      const id = conn.netId;
      if (!id) return;
      this.conns.delete(id);
      const p = this.players.get(id);
      this.players.delete(id);
      this.removeCar(id);
      this.broadcast({ t: "roster", players: [...this.players.values()] });
      this.broadcast({ t: "gone", id });
      this.say((p ? p.name : "Игрок") + " вышел");
      this.changed();
    });
  }
  // ОТПРАВКА: хозяин — всем гостям (кроме except), гость — хозяину.
  broadcast(m, except) {
    if (this.isHost) {
      for (const [id, c] of this.conns) if (id !== except && c.open !== false) c.send(m);
    } else if (this.hostConn) {
      this.hostConn.send(m);
    }
  }
  receive(m, from) {
    const now = performance.now() / 1000;
    const g = this.game;
    switch (m.t) {
      case "welcome":
        this.myId = m.you;
        if (this.welcomed) this.welcomed();
        break;
      case "full":
        this.say("Комната заполнена");
        break;
      case "roster":
        this.players = new Map(m.players.map((p) => [p.id, p]));
        for (const id of [...this.cars.keys()]) {
          const c = this.cars.get(id);
          if (!c.isBot && !this.players.has(id)) this.removeCar(id);
        }
        this.changed();
        break;
      case "gone":
        this.removeCar(m.id);
        break;
      case "st": {
        // гость прислал своё положение хозяину; хозяин присылает пачку положений всех
        const list = m.list || [m];
        for (const st of list) {
          if (st.id === this.myId) continue;
          let car = this.cars.get(st.id);
          if (!car) {
            const info = this.players.get(st.id) || { id: st.id, name: st.n || st.id, car: st.c, color: st.k, bot: st.b };
            car = new RemoteCar(g, { ...info, bot: st.b });
            this.cars.set(st.id, car);
          }
          car.push(st, now);
        }
        if (this.isHost && from !== "h") this.lastStates = Object.assign(this.lastStates || {}, { [from]: m });
        break;
      }
      case "start":
        // хозяин запустил заезд
        if (!this.isHost) g.events.startNet(m);
        break;
      case "act":
        // способность: ракета, банан, нитро, коробка, попадание
        if (this.isHost) this.broadcast(m, from);
        if (g.events.items) g.events.items.applyRemote(m);
        break;
      default:
        break;
    }
  }
  // Своё состояние: положение, скорость, наклон, прогресс в заезде.
  stateOf(id, phys, extra) {
    const r2 = (v) => Math.round(v * 100) / 100;
    return {
      id,
      p: [r2(phys.pos[0]), r2(phys.pos[1]), r2(phys.pos[2])],
      y: Math.round(phys.yaw * 1000) / 1000,
      v: [r2(phys.vx), r2(phys.vz)],
      s: Math.round(phys.steer * 100) / 100,
      pt: Math.round((phys.pitch - phys.bodyPitch) * 1000) / 1000,
      rl: Math.round((phys.roll + phys.bodyRoll) * 1000) / 1000,
      br: phys.braking ? 1 : 0,
      bo: phys.boosting ? 1 : 0,
      dr: phys.drifting ? 1 : 0,
      ...extra,
    };
  }
  myState() {
    const g = this.game;
    const run = g.events.active;
    const fin = run && run.finished;
    return this.stateOf(this.myId, g.car, {
      n: this.name,
      c: g.car.spec.id,
      k: g.carColor(g.car.spec),
      ev: run ? run.def.id : null,
      pr: run ? Math.round(run.progress) : 0,
      f: fin ? 1 : 0,
      ft: fin ? Math.round(run.time * 1000) / 1000 : null,
    });
  }
  // КАЖДЫЙ КАДР: отправить своё положение (15 раз/с), обновить чужие машины.
  update(dt) {
    if (this.status !== "online") return;
    const now = performance.now() / 1000;
    this.sendAcc += dt;
    if (this.sendAcc >= 1 / NET_RATE) {
      this.sendAcc = 0;
      const mine = this.myState();
      if (this.isHost) {
        const list = [mine];
        // положения гостей — пересылаем остальным
        for (const id in this.lastStates || {}) {
          const st = { ...this.lastStates[id] };
          delete st.t;
          list.push(st);
        }
        // боты хозяина
        const field = this.game.events.bots;
        const run = this.game.events.active;
        if (field && run) {
          for (const b of field.bots) {
            list.push(
              this.stateOf(b.id, b.phys, {
                b: 1,
                n: b.name,
                c: b.spec.id,
                k: b.color,
                ev: run.def.id,
                pr: Math.round(b.progress),
                f: b.finished ? 1 : 0,
                ft: b.finished ? b.finishTime : null,
              }),
            );
          }
        }
        this.broadcast({ t: "st", list });
        this.lastStates = {};
      } else {
        this.broadcast({ t: "st", ...mine });
      }
    }
    for (const car of this.cars.values()) car.update(now);
  }
  // Гонщики для заезда: чужие машины в том же заезде.
  remoteRacers() {
    const run = this.game.events && this.game.events.active;
    const list = [];
    for (const car of this.cars.values()) {
      if (!car.buf.length) continue;
      if (run && car.ev !== run.def.id) continue;
      if (!run && car.isBot) continue;
      list.push(car);
    }
    return list;
  }
  // Все чужие машины (для имён над машинами и столкновений в свободной езде).
  allCars() {
    return [...this.cars.values()].filter((c) => c.buf.length && !(c.isBot && !this.game.events.active));
  }
  // Хозяин запустил заезд — рассылаем всем: решётка, боты, способности.
  sendStart(m) {
    this.broadcast({ t: "start", ...m });
  }
  sendAction(a) {
    this.broadcast({ t: "act", from: this.myId, ...a });
  }
  removeCar(id) {
    const c = this.cars.get(id);
    if (c) {
      c.dispose();
      this.cars.delete(id);
    }
  }
  // Убрать ботов прошлого заезда (у гостя они приходят от хозяина).
  clearBots() {
    for (const [id, c] of [...this.cars]) if (c.isBot) this.removeCar(id);
  }
  say(text) {
    if (this.onMessage) this.onMessage(text);
    else if (this.game.ui) this.game.ui.toast(text);
  }
  changed() {
    if (this.onChange) this.onChange();
  }
  // ВЫЙТИ ИЗ КОМНАТЫ
  leave(silent) {
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch (e) {
        // соединение уже закрыто
      }
    }
    for (const id of [...this.cars.keys()]) this.removeCar(id);
    this.peer = null;
    this.hostConn = null;
    this.conns.clear();
    this.players.clear();
    this.isHost = false;
    this.code = null;
    this.myId = null;
    this.lastStates = {};
    const was = this.status;
    this.status = "off";
    if (!silent && was !== "off") this.changed();
  }
}
