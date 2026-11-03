// РЕЖИМ ОТЛАДКИ. Работает только при запуске через `npm run dev` (в архив для Яндекса не попадает).
//
// Клавиши:
//   `  (Ё)  — показать / скрыть панель отладки
//   F2      — пауза физики (стоп-кадр).  «.» (точка) — на паузе сделать один кадр вперёд
//   F4      — свободная камера: W A S D — лететь, Пробел / Z — вверх / вниз, Shift — быстрее, мышь — смотреть
//   T       — в свободной камере: перенести машину в точку под прицелом
//   -       — замедление времени: ×1 → ×0.25 → ×0.1
//   F8      — сохранить «точку бага» (последние 10 секунд езды)
//   F9      — повторить сохранённую точку бага
//
// Как это устроено: функции игры game.frame, car.update и rig.update «оборачиваются» —
// перед вызовом и после него отладка записывает состояние машины и нажатые клавиши, а при повторе
// подставляет записанное. Физика детерминирована: одинаковое начальное состояние + одинаковые нажатия
// = одинаковый результат, поэтому баг воспроизводится точно.

import { clamp } from "../core/math.js";

const HISTORY_SEC = 12; // сколько секунд езды помнит «чёрный ящик»
const BUG_SEC = 10; // сколько секунд сохраняет точка бага
const LAUNCH_VY = 5; // автодетектор: отрыв от земли с вертикальной скоростью больше этой (м/с)
const GRAPH_SEC = 8; // ширина графика, секунд
const SKIP_KEYS = new Set([
  "world",
  "spec",
  "P",
  "events",
  "contacts",
  "update",
  "settings",
  "ground",
]);

// ---------- хранилище браузера (тихо игнорирует ошибки) ----------
const store = {
  get(key, def) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? def : JSON.parse(v);
    } catch {
      return def;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {}
  },
};

// ---------- снимок состояния машины ----------
function snapshot(car) {
  const s = {};
  for (const k of Object.keys(car)) {
    if (SKIP_KEYS.has(k)) continue;
    const v = car[k];
    if (v === null || typeof v === "number" || typeof v === "boolean" || typeof v === "string")
      s[k] = v;
    else if (Array.isArray(v) && v.every((x) => typeof x === "number")) s[k] = v.slice();
  }
  s.settings = { ...car.settings };
  s.ground = {
    h: car.ground.h,
    surface: car.ground.surface,
    bridge: car.ground.bridge,
    tunnel: car.ground.tunnel,
  };
  return s;
}
function restore(car, s) {
  for (const k of Object.keys(car)) {
    if (SKIP_KEYS.has(k)) continue;
    const v = car[k];
    const simple =
      v === null || v === undefined || ["number", "boolean", "string"].includes(typeof v);
    if (simple && !(k in s)) delete car[k];
  }
  for (const [k, v] of Object.entries(s)) {
    if (k === "settings") Object.assign(car.settings, v);
    else if (k === "ground") Object.assign(car.ground, v);
    else car[k] = Array.isArray(v) ? v.slice() : v;
  }
  car.events.length = 0;
}
const copyInput = (c) => ({
  throttle: c.throttle || 0,
  brake: c.brake || 0,
  steer: c.steer || 0,
  handbrake: !!c.handbrake,
  boost: !!c.boost,
});
const fmt = (v, d = 2) => (typeof v === "number" && isFinite(v) ? v.toFixed(d) : String(v));

const CSS = `
#dbg { position: fixed; left: 10px; top: 10px; width: 330px; max-height: calc(100vh - 20px); overflow: auto; z-index: 1000;
  background: rgba(12,14,24,.86); color: #e8ecf5; font: 12px/1.35 Consolas, "Courier New", monospace; border: 1px solid #3a4060;
  border-radius: 8px; padding: 7px 9px; user-select: text; -webkit-user-select: text; }
#dbg.hidden { display: none; }
#dbg h3 { margin: 7px 0 3px; font: bold 11px Consolas, monospace; color: #ffb02e; letter-spacing: .05em; text-transform: none; }
#dbg .dbg-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-start; gap: 4px; margin: 3px 0; padding: 0; border: 0; }
#dbg button { font: inherit; color: #e8ecf5; background: #2a3050; border: 1px solid #4a5280; border-radius: 4px; padding: 3px 7px; cursor: pointer; }
#dbg button:hover { background: #3a4270; }
#dbg button.on { background: #ff5c8a; border-color: #ff8aaa; color: #fff; }
#dbg label { display: inline-flex; align-items: center; gap: 3px; margin-right: 6px; cursor: pointer; font: inherit; }
#dbg input[type=checkbox] { margin: 0; width: 12px; height: 12px; accent-color: #ff5c8a; }
#dbg pre { margin: 0; white-space: pre; font: inherit; }
#dbg .warn { color: #ff6b6b; }
#dbg .ok { color: #7dffa0; }
#dbg .muted { color: #8a90b0; }
#dbg canvas { display: block; background: rgba(0,0,0,.35); border-radius: 4px; margin-top: 4px; }
#dbg input[type=range] { width: 120px; margin: 0 4px; accent-color: #ff5c8a; }
#dbg-overlay { position: fixed; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: 5; }
#dbg-help { position: fixed; right: 10px; bottom: 10px; z-index: 1000; background: rgba(12,14,24,.8); color: #cfd6ee;
  font: 11px/1.4 Consolas, monospace; padding: 6px 8px; border-radius: 6px; pointer-events: none; white-space: pre; }
`;

export function installDebug(game) {
  const dbg = new DebugTools(game);
  window.__debug = dbg;
  return dbg;
}

class DebugTools {
  constructor(game) {
    this.game = game;
    this.visible = store.get("dbg.visible", true);
    this.layers = store.get("dbg.layers", { colliders: true, edges: true, steps: true, car: true });
    this.autoDetect = store.get("dbg.autoDetect", true);
    this.autoReplay = store.get("dbg.autoReplay", false);
    this.loopReplay = store.get("dbg.loop", false);
    this.startOffset = store.get("dbg.startOffset", 10);
    this.paused = false;
    this.stepOnce = false;
    this.timeScale = 1;
    this.freecam = null;
    this.keys = new Set();
    this.history = [];
    this.historyTime = 0;
    this.graph = [];
    this.graphTime = 0;
    this.events = []; // отметки на графике
    this.pendingSave = null;
    this.replay = null;
    this.bug = store.get("dbg.bug", null);
    this.hover = null;
    this.pin = null;
    this.mouse = { x: 0, y: 0, inside: false };
    this.tmpGround = { h: 0, surface: "", bridge: false, tunnel: false, road: null };
    this.tmpList = [];
    this.uiTimer = 0;

    this.buildDom();
    this.hook();
    this.bindKeys();
    this.setVisible(this.visible);
    if (this.autoReplay && this.bug) setTimeout(() => this.startReplay(), 300);
  }

  // ================= перехват функций игры =================
  hook() {
    const game = this.game;
    const frame = game.frame.bind(game);
    game.frame = (dt, noRender) => {
      if (game.car !== this.car) this.hookCar(game.car);
      if (this.freecam) this.updateFreecam(dt);
      let scaled = dt * this.timeScale;
      if (this.paused) scaled = this.stepOnce ? 1 / 60 : 0;
      this.stepOnce = false;
      frame(scaled, noRender);
      if (!noRender) this.afterFrame(dt, scaled);
    };
    const rigUpdate = game.rig.update.bind(game.rig);
    game.rig.update = (dt, car, opts) => {
      if (this.freecam) this.applyFreecam();
      else rigUpdate(dt, car, opts);
    };
    this.hookCar(game.car);
  }
  hookCar(car) {
    this.car = car;
    if (car.__debugHooked) return;
    car.__debugHooked = true;
    const update = car.update.bind(car);
    car.update = (dt, controls) => {
      if (dt <= 0) {
        car.events.length = 0;
        return;
      }
      // --- повтор записи: подставляем записанные dt и нажатия
      if (this.replay) {
        const r = this.replay;
        r.acc += dt;
        let consumed = false;
        while (r.i < r.frames.length && r.acc >= r.frames[r.i].dt - 1e-9) {
          const f = r.frames[r.i++];
          r.acc -= f.dt;
          update(f.dt, f.input);
          consumed = true;
          this.sampleGraph(f.dt);
        }
        if (!consumed) car.events.length = 0;
        if (r.i >= r.frames.length) this.endReplay();
        return;
      }
      // --- обычная езда: записываем в «чёрный ящик»
      const state = snapshot(car);
      const wasOnGround = car.onGround;
      update(dt, controls);
      this.history.push({ dt, input: copyInput(controls), state });
      this.historyTime += dt;
      while (this.historyTime > HISTORY_SEC && this.history.length > 1)
        this.historyTime -= this.history.shift().dt;
      this.sampleGraph(dt);
      // --- автодетектор «подлётов»
      if (
        this.autoDetect &&
        wasOnGround &&
        !car.onGround &&
        car.vy > LAUNCH_VY &&
        !this.pendingSave
      ) {
        this.events.push({ t: this.graphTime, text: "подлёт" });
        this.pendingSave = { left: 1.5, reason: `подлёт: vy = ${fmt(car.vy, 1)} м/с` };
        this.toast(
          `Отладка: подозрительный подлёт (vy ${fmt(car.vy, 1)} м/с) — сохраняю точку бага`,
        );
      }
      if (this.pendingSave) {
        this.pendingSave.left -= dt;
        if (this.pendingSave.left <= 0) {
          this.saveBug(this.pendingSave.reason);
          this.pendingSave = null;
        }
      }
    };
  }

  // ================= точка бага: сохранение и повтор =================
  saveBug(reason = "вручную (F8)") {
    let t = 0;
    let k = this.history.length;
    while (k > 0 && t < BUG_SEC) t += this.history[--k].dt;
    const frames = this.history.slice(k);
    if (!frames.length) {
      this.toast("Отладка: нечего сохранять — сначала проедь немного");
      return;
    }
    const car = this.game.car;
    this.bug = {
      version: 1,
      reason,
      savedAt: new Date().toISOString(),
      carId: car.spec.id,
      pos: car.pos.map((v) => +v.toFixed(1)),
      duration: +t.toFixed(2),
      frames,
    };
    store.set("dbg.bug", this.bug);
    this.toast(`Точка бага сохранена (${fmt(t, 1)} с): ${reason}. F9 — повтор`);
    this.refreshBugInfo();
  }
  startReplay() {
    const bug = this.bug;
    if (!bug) {
      this.toast("Отладка: точка бага ещё не сохранена (F8)");
      return;
    }
    const game = this.game;
    // откуда начинать: за startOffset секунд до конца записи
    let t = 0;
    let k = bug.frames.length;
    while (k > 0 && t < this.startOffset) t += bug.frames[--k].dt;
    if (game.events && game.events.active) game.events.cancel();
    if (game.car.spec.id !== bug.carId) {
      game.settings.car = bug.carId;
      game.spawnCar(bug.carId);
      this.hookCar(game.car);
    }
    if (game.state !== "drive") {
      game.state = "drive";
      game.ui.hideScreens();
      game.ui.initMaps();
    }
    restore(game.car, bug.frames[k].state);
    game.rig.snap = true;
    if (game.fx) game.fx.clearTrails();
    this.replay = { frames: bug.frames.slice(k), i: 0, acc: 0 };
    this.paused = false;
    this.freecam = null;
    this.graph = [];
    this.toast(`Повтор: ${fmt(t, 1)} с записи`);
    this.refreshButtons();
  }
  endReplay() {
    this.replay = null;
    if (this.loopReplay) {
      setTimeout(() => this.startReplay(), 400);
    } else {
      this.paused = true;
      this.toast("Повтор закончен — пауза (F2 — продолжить, F9 — ещё раз)");
    }
    this.refreshButtons();
  }
  exportBug() {
    if (!this.bug) return this.toast("Нечего экспортировать");
    const blob = new Blob([JSON.stringify(this.bug)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "bug-" + this.bug.savedAt.replace(/[:.]/g, "-").slice(0, 19) + ".json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  importBug() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.onchange = async () => {
      try {
        const bug = JSON.parse(await input.files[0].text());
        if (!bug.frames || !bug.frames.length) throw new Error("нет кадров");
        this.bug = bug;
        store.set("dbg.bug", bug);
        this.refreshBugInfo();
        this.toast("Точка бага загружена — F9 для повтора");
      } catch (e) {
        this.toast("Не удалось прочитать файл: " + e.message);
      }
    };
    input.click();
  }

  // ================= свободная камера =================
  toggleFreecam() {
    if (this.freecam) {
      this.freecam = null;
      this.game.rig.snap = true;
    } else {
      const cam = this.game.cam;
      const d = [
        cam.target[0] - cam.pos[0],
        cam.target[1] - cam.pos[1],
        cam.target[2] - cam.pos[2],
      ];
      this.freecam = {
        pos: cam.pos.slice(),
        yaw: Math.atan2(d[0], d[2]),
        pitch: Math.atan2(d[1], Math.hypot(d[0], d[2])),
        speed: 15,
      };
      this.paused = true;
    }
    this.refreshButtons();
  }
  freecamDir() {
    const f = this.freecam;
    return [
      Math.sin(f.yaw) * Math.cos(f.pitch),
      Math.sin(f.pitch),
      Math.cos(f.yaw) * Math.cos(f.pitch),
    ];
  }
  updateFreecam(dt) {
    const f = this.freecam;
    const k = this.keys;
    const dir = this.freecamDir();
    const right = [-Math.cos(f.yaw), 0, Math.sin(f.yaw)];
    const v = f.speed * (k.has("ShiftLeft") || k.has("ShiftRight") ? 5 : 1) * Math.min(dt, 0.1);
    const move = (vec, s) => {
      for (let i = 0; i < 3; i++) f.pos[i] += vec[i] * s;
    };
    if (k.has("KeyW") || k.has("ArrowUp")) move(dir, v);
    if (k.has("KeyS") || k.has("ArrowDown")) move(dir, -v);
    if (k.has("KeyA") || k.has("ArrowLeft")) move(right, v);
    if (k.has("KeyD") || k.has("ArrowRight")) move(right, -v);
    if (k.has("Space")) f.pos[1] += v;
    if (k.has("KeyZ")) f.pos[1] -= v;
  }
  applyFreecam() {
    const f = this.freecam;
    const cam = this.game.cam;
    const d = this.freecamDir();
    cam.pos = f.pos.slice();
    cam.target = [f.pos[0] + d[0], f.pos[1] + d[1], f.pos[2] + d[2]];
    cam.fov = 70;
  }
  teleportCar() {
    const p = this.pin || this.hover;
    if (!p) return this.toast("Наведи прицел на землю");
    const yaw = this.freecam ? this.freecam.yaw : this.game.car.yaw;
    this.game.car.place(p.x, p.z, yaw);
    this.toast(`Машина перенесена в (${fmt(p.x, 1)}, ${fmt(p.z, 1)})`);
  }

  // ================= клавиши и мышь =================
  bindKeys() {
    window.addEventListener("keydown", (e) => {
      this.keys.add(e.code);
      if (e.repeat) return;
      const map = {
        Backquote: () => this.setVisible(!this.visible),
        F2: () => this.togglePause(),
        F4: () => this.toggleFreecam(),
        F8: () => this.saveBug(),
        F9: () => this.startReplay(),
        Period: () => this.paused && (this.stepOnce = true),
        Minus: () => this.cycleSlowmo(),
        KeyT: () => this.freecam && this.teleportCar(),
      };
      if (map[e.code]) {
        if (e.code.startsWith("F")) e.preventDefault();
        map[e.code]();
      }
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.code));
    window.addEventListener("blur", () => this.keys.clear());
    // мышь слушаем на всём окне (поверх холста лежат прозрачные слои интерфейса), кроме самой панели
    const onGameArea = (e) =>
      !this.panel.contains(e.target) &&
      !(e.target.closest && e.target.closest("button, input, .screen"));
    let drag = null;
    window.addEventListener("pointerdown", (e) => {
      if (onGameArea(e)) drag = { x: e.clientX, y: e.clientY, moved: 0 };
    });
    window.addEventListener("pointerup", (e) => {
      if (drag && drag.moved < 4 && this.visible && (this.paused || this.freecam)) {
        this.pin = this.pick(e.clientX, e.clientY);
      }
      drag = null;
    });
    window.addEventListener("pointermove", (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      this.mouse.inside = onGameArea(e);
      if (!drag) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      drag.x = e.clientX;
      drag.y = e.clientY;
      if (this.freecam) {
        this.freecam.yaw -= dx * 0.004;
        this.freecam.pitch = clamp(this.freecam.pitch - dy * 0.004, -1.5, 1.5);
      }
    });
    window.addEventListener("wheel", (e) => {
      if (!this.freecam) return;
      this.freecam.speed = clamp(this.freecam.speed * (e.deltaY > 0 ? 0.8 : 1.25), 2, 400);
    });
  }
  togglePause() {
    this.paused = !this.paused;
    if (!this.paused && this.freecam) this.toggleFreecam();
    this.refreshButtons();
  }
  cycleSlowmo() {
    this.timeScale = this.timeScale === 1 ? 0.25 : this.timeScale === 0.25 ? 0.1 : 1;
    this.refreshButtons();
  }
  toast(text) {
    if (this.game.ui) this.game.ui.toast(text);
    console.log("[debug] " + text);
  }

  // ================= выбор точки на земле =================
  pick(mx, my) {
    const cam = this.game.cam;
    if (!cam.forward) return null;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const nx = (mx / w) * 2 - 1;
    const ny = 1 - (my / h) * 2;
    const tanY = Math.tan((cam.fov * Math.PI) / 360);
    const tanX = tanY * (cam.aspect || w / h);
    const f = cam.forward;
    const r = cam.right;
    const u = cam.upv;
    let dir = [0, 1, 2].map((i) => f[i] + r[i] * nx * tanX + u[i] * ny * tanY);
    const len = Math.hypot(dir[0], dir[1], dir[2]);
    dir = dir.map((v) => v / len);
    const world = this.game.world;
    const g = this.tmpGround;
    const below = (t) => {
      const x = cam.pos[0] + dir[0] * t;
      const z = cam.pos[2] + dir[2] * t;
      return cam.pos[1] + dir[1] * t < world.groundAt(x, z, g).h;
    };
    let t0 = 0.3;
    let t1 = 0;
    for (let t = 0.3; t < 1500; t += Math.max(0.4, t * 0.015)) {
      if (below(t)) {
        t1 = t;
        break;
      }
      t0 = t;
    }
    if (!t1) return null;
    for (let i = 0; i < 16; i++) {
      const m = (t0 + t1) / 2;
      if (below(m)) t1 = m;
      else t0 = m;
    }
    return this.probe(cam.pos[0] + dir[0] * t1, cam.pos[2] + dir[2] * t1);
  }
  probe(x, z) {
    const world = this.game.world;
    const g = world.groundAt(x, z, { h: 0, surface: "", bridge: false, tunnel: false, road: null });
    const terrainH = world.terrain.heightAt(x, z);
    const near = world.roads.nearest(x, z, 60);
    const road = near
      ? {
          name: near.road.name,
          id: near.road.id,
          d: near.d,
          hw: near.hw,
          h: near.h,
          bridge: near.bridge,
          tunnel: near.tunnel,
          physEdge: near.hw + 1.45,
        }
      : null;
    return {
      x,
      z,
      h: g.h,
      surface: g.surface,
      terrainH,
      road,
      edgeDist: world.roads.edgeDist(x, z),
    };
  }

  // ================= каждый кадр =================
  sampleGraph(dt) {
    const car = this.game.car;
    this.graphTime += dt;
    this.graph.push({
      t: this.graphTime,
      vy: car.vy,
      gvy: car.prevGroundVy || 0,
      air: !car.onGround,
      above: car.pos[1] - car.ground.h,
    });
    while (this.graph.length && this.graph[0].t < this.graphTime - GRAPH_SEC) this.graph.shift();
    while (this.events.length && this.events[0].t < this.graphTime - GRAPH_SEC) this.events.shift();
  }
  afterFrame(dt) {
    if (!this.visible) return;
    if (this.paused || this.freecam) {
      this.hover = this.mouse.inside ? this.pick(this.mouse.x, this.mouse.y) : null;
    } else this.hover = null;
    this.drawOverlay();
    this.uiTimer -= dt;
    if (this.uiTimer <= 0) {
      this.uiTimer = 0.1;
      this.refreshText();
    }
    this.drawGraph();
  }

  // ================= рисование поверх 3D =================
  drawOverlay() {
    const cv = this.overlay;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (cv.width !== w || cv.height !== h) {
      cv.width = w;
      cv.height = h;
    }
    const g = this.overlayCtx;
    g.clearRect(0, 0, w, h);
    const m = this.game.cam.viewProj;
    if (!m) return;
    const proj = (x, y, z) => {
      const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
      if (cw < 0.2) return null;
      return [
        (((m[0] * x + m[4] * y + m[8] * z + m[12]) / cw) * 0.5 + 0.5) * w,
        (1 - (((m[1] * x + m[5] * y + m[9] * z + m[13]) / cw) * 0.5 + 0.5)) * h,
      ];
    };
    const line = (a, b, color, width = 1.5, dash = null) => {
      const p = proj(a[0], a[1], a[2]);
      const q = proj(b[0], b[1], b[2]);
      if (!p || !q) return;
      g.strokeStyle = color;
      g.lineWidth = width;
      g.setLineDash(dash || []);
      g.beginPath();
      g.moveTo(p[0], p[1]);
      g.lineTo(q[0], q[1]);
      g.stroke();
    };
    const text = (pt, str, color) => {
      const p = proj(pt[0], pt[1], pt[2]);
      if (!p) return;
      g.font = "11px Consolas, monospace";
      g.fillStyle = "rgba(0,0,0,.6)";
      g.fillRect(p[0] + 3, p[1] - 12, g.measureText(str).width + 4, 14);
      g.fillStyle = color;
      g.fillText(str, p[0] + 5, p[1] - 1);
    };
    const world = this.game.world;
    const car = this.game.car;
    const center = this.freecam ? this.freecam.pos : car.pos;
    const cx = center[0];
    const cz = center[2];
    const gr = this.tmpGround;
    const RADIUS = 90;

    // --- препятствия
    if (this.layers.colliders) {
      for (const o of world.colliders.query(cx, cz, RADIUS, this.tmpList)) {
        if (o.type === 1) {
          const ya = world.groundAt(o.ax, o.az, gr).h + 0.6;
          const yb = world.groundAt(o.bx, o.bz, gr).h + 0.6;
          line([o.ax, ya, o.az], [o.bx, yb, o.bz], o.kind === "wall" ? "#ff4d4d" : "#ffb02e", 2);
        } else {
          const y = world.groundAt(o.x, o.z, gr).h + 0.4;
          for (let i = 0; i < 10; i++) {
            const a0 = (i / 10) * Math.PI * 2;
            const a1 = ((i + 1) / 10) * Math.PI * 2;
            line(
              [o.x + Math.cos(a0) * o.r, y, o.z + Math.sin(a0) * o.r],
              [o.x + Math.cos(a1) * o.r, y, o.z + Math.sin(a1) * o.r],
              "#ffe14d",
              1.5,
            );
          }
        }
      }
    }
    // --- края дорог и «ступеньки» между дорогой и землёй
    if (this.layers.edges || this.layers.steps) {
      for (const road of world.roads.roads) {
        let prev = null;
        for (let i = 0; i < road.n; i++) {
          const x = road.x[i];
          const z = road.z[i];
          if (Math.abs(x - cx) > RADIUS || Math.abs(z - cz) > RADIUS) {
            prev = null;
            continue;
          }
          const nx = road.tz[i];
          const nz = -road.tx[i];
          const y = road.h[i] + 0.03;
          const hw = road.hw;
          const pe = hw + 1.45;
          const cur = {
            l: [x + nx * hw, y, z + nz * hw],
            r: [x - nx * hw, y, z - nz * hw],
            pl: [x + nx * pe, y, z + nz * pe],
            pr: [x - nx * pe, y, z - nz * pe],
          };
          if (this.layers.edges && prev) {
            line(prev.l, cur.l, "rgba(255,255,255,.85)", 1.2);
            line(prev.r, cur.r, "rgba(255,255,255,.85)", 1.2);
            line(prev.pl, cur.pl, "#33e0ff", 1.2, [5, 4]);
            line(prev.pr, cur.pr, "#33e0ff", 1.2, [5, 4]);
          }
          if (this.layers.steps && i % 2 === 0 && !(road.flags[i] & 1)) {
            for (const side of [cur.pl, cur.pr]) {
              const th = world.terrain.heightAt(side[0], side[2]);
              const step = road.h[i] - th;
              if (Math.abs(step) > 0.15) {
                const bad = Math.abs(step) > 0.3;
                line(
                  [side[0], th, side[2]],
                  [side[0], road.h[i], side[2]],
                  bad ? "#ff3b3b" : "#ffd23b",
                  bad ? 3 : 2,
                );
                if (bad && Math.hypot(side[0] - cx, side[2] - cz) < 35)
                  text(
                    [side[0], road.h[i], side[2]],
                    (step > 0 ? "+" : "") + fmt(step, 2),
                    "#ff8080",
                  );
              }
            }
          }
          prev = cur;
        }
      }
    }
    // --- машина: три круга столкновений
    if (this.layers.car) {
      const s = Math.sin(car.yaw);
      const c = Math.cos(car.yaw);
      const r = car.halfW * 0.95;
      const y = car.pos[1] + 0.5;
      for (const off of [car.halfL - r * 0.9, 0, -(car.halfL - r * 0.9)]) {
        const px = car.pos[0] + s * off;
        const pz = car.pos[2] + c * off;
        for (let i = 0; i < 12; i++) {
          const a0 = (i / 12) * Math.PI * 2;
          const a1 = ((i + 1) / 12) * Math.PI * 2;
          line(
            [px + Math.cos(a0) * r, y, pz + Math.sin(a0) * r],
            [px + Math.cos(a1) * r, y, pz + Math.sin(a1) * r],
            "#5dff8a",
            1.5,
          );
        }
      }
      line(
        [car.pos[0], car.ground.h, car.pos[2]],
        [car.pos[0], car.pos[1] + 1.5, car.pos[2]],
        "#5dff8a",
        1,
      );
    }
    // --- прицел и закреплённая точка
    for (const [p, color] of [
      [this.hover, "#ffffff"],
      [this.pin, "#ff5c8a"],
    ]) {
      if (!p) continue;
      line([p.x, p.h, p.z], [p.x, p.h + 2.5, p.z], color, 2);
      line([p.x - 0.6, p.h + 0.02, p.z], [p.x + 0.6, p.h + 0.02, p.z], color, 2);
      line([p.x, p.h + 0.02, p.z - 0.6], [p.x, p.h + 0.02, p.z + 0.6], color, 2);
    }
    g.setLineDash([]);
  }

  // ================= график =================
  drawGraph() {
    const cv = this.graphCanvas;
    const g = this.graphCtx;
    const W = cv.width;
    const H = cv.height;
    g.clearRect(0, 0, W, H);
    const t1 = this.graphTime;
    const t0 = t1 - GRAPH_SEC;
    const X = (t) => ((t - t0) / GRAPH_SEC) * W;
    const VMAX = 25;
    const Y = (v) => H / 2 - (clamp(v, -VMAX, VMAX) / VMAX) * (H / 2 - 4);
    // полёт — фоном
    g.fillStyle = "rgba(255,92,138,.18)";
    for (let i = 1; i < this.graph.length; i++) {
      if (this.graph[i].air)
        g.fillRect(X(this.graph[i - 1].t), 0, X(this.graph[i].t) - X(this.graph[i - 1].t) + 0.5, H);
    }
    // сетка
    g.strokeStyle = "rgba(255,255,255,.12)";
    g.lineWidth = 1;
    for (const v of [-20, -10, 10, 20]) {
      g.beginPath();
      g.moveTo(0, Y(v));
      g.lineTo(W, Y(v));
      g.stroke();
    }
    g.strokeStyle = "rgba(255,255,255,.35)";
    g.beginPath();
    g.moveTo(0, Y(0));
    g.lineTo(W, Y(0));
    g.stroke();
    const plot = (key, color) => {
      g.strokeStyle = color;
      g.lineWidth = 1.5;
      g.beginPath();
      this.graph.forEach((s, i) => (i ? g.lineTo(X(s.t), Y(s[key])) : g.moveTo(X(s.t), Y(s[key]))));
      g.stroke();
    };
    plot("gvy", "#ffb02e");
    plot("vy", "#5db8ff");
    for (const e of this.events) {
      g.strokeStyle = "#ff3b3b";
      g.beginPath();
      g.moveTo(X(e.t), 0);
      g.lineTo(X(e.t), H);
      g.stroke();
    }
    g.fillStyle = "#8a90b0";
    g.font = "10px Consolas, monospace";
    g.fillText("+20", 2, Y(20) - 2);
    g.fillText("-20", 2, Y(-20) - 2);
    g.fillStyle = "#5db8ff";
    g.fillText("vy машины", W - 170, 11);
    g.fillStyle = "#ffb02e";
    g.fillText("скорость земли", W - 88, 11);
  }

  // ================= панель =================
  buildDom() {
    const style = document.createElement("style");
    style.textContent = CSS;
    document.head.appendChild(style);
    this.overlay = document.createElement("canvas");
    this.overlay.id = "dbg-overlay";
    document.body.appendChild(this.overlay);
    this.overlayCtx = this.overlay.getContext("2d");
    const el = document.createElement("div");
    el.id = "dbg";
    el.innerHTML = `
      <div class="dbg-row" style="justify-content:space-between"><b>ОТЛАДКА</b><span class="muted">\` — скрыть</span></div>
      <div class="dbg-row">
        <button data-a="pause">Пауза F2</button>
        <button data-a="step">Кадр .</button>
        <button data-a="free">Камера F4</button>
        <button data-a="slow">×1</button>
      </div>
      <pre id="dbg-tel"></pre>
      <canvas id="dbg-graph" width="310" height="90"></canvas>
      <h3>ТОЧКА БАГА</h3>
      <div class="dbg-row">
        <button data-a="save">Сохранить F8</button>
        <button data-a="replay">Повтор F9</button>
        <button data-a="export">Экспорт</button>
        <button data-a="import">Импорт</button>
      </div>
      <div class="dbg-row">Начать за <input id="dbg-offset" type="range" min="1" max="10" step="0.5"> <span id="dbg-offset-v"></span> с до конца</div>
      <div class="dbg-row">
        <label><input type="checkbox" data-o="autoDetect">автодетектор</label>
        <label><input type="checkbox" data-o="loopReplay">по кругу</label>
        <label><input type="checkbox" data-o="autoReplay">повтор после перезагрузки</label>
      </div>
      <pre id="dbg-bug" class="muted"></pre>
      <h3>СЛОИ</h3>
      <div class="dbg-row">
        <label><input type="checkbox" data-l="colliders">препятствия</label>
        <label><input type="checkbox" data-l="edges">края дорог</label>
        <label><input type="checkbox" data-l="steps">ступеньки</label>
        <label><input type="checkbox" data-l="car">машина</label>
      </div>
      <h3>ТОЧКА НА ЗЕМЛЕ <span class="muted">(на паузе: навести / кликнуть)</span></h3>
      <pre id="dbg-probe" class="muted">—</pre>`;
    document.body.appendChild(el);
    this.panel = el;
    this.help = document.createElement("div");
    this.help.id = "dbg-help";
    this.help.textContent =
      "СВОБОДНАЯ КАМЕРА\nWASD — лететь, Пробел/Z — вверх/вниз\nShift — быстрее, колесо — скорость\nмышь (зажать) — смотреть, клик — точка\nT — перенести машину, F4 — выйти";
    document.body.appendChild(this.help);
    this.graphCanvas = el.querySelector("#dbg-graph");
    this.graphCtx = this.graphCanvas.getContext("2d");
    const actions = {
      pause: () => this.togglePause(),
      step: () => {
        this.paused = true;
        this.stepOnce = true;
        this.refreshButtons();
      },
      free: () => this.toggleFreecam(),
      slow: () => this.cycleSlowmo(),
      save: () => this.saveBug(),
      replay: () => this.startReplay(),
      export: () => this.exportBug(),
      import: () => this.importBug(),
    };
    el.querySelectorAll("button[data-a]").forEach((b) => {
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        actions[b.dataset.a]();
        b.blur();
      });
    });
    el.querySelectorAll("input[data-o]").forEach((c) => {
      c.checked = !!this[c.dataset.o];
      c.addEventListener("change", () => {
        this[c.dataset.o] = c.checked;
        store.set("dbg." + c.dataset.o, c.checked);
        c.blur();
      });
    });
    el.querySelectorAll("input[data-l]").forEach((c) => {
      c.checked = !!this.layers[c.dataset.l];
      c.addEventListener("change", () => {
        this.layers[c.dataset.l] = c.checked;
        store.set("dbg.layers", this.layers);
        c.blur();
      });
    });
    const off = el.querySelector("#dbg-offset");
    const offV = el.querySelector("#dbg-offset-v");
    off.value = this.startOffset;
    offV.textContent = this.startOffset;
    off.addEventListener("input", () => {
      this.startOffset = +off.value;
      offV.textContent = off.value;
      store.set("dbg.startOffset", this.startOffset);
    });
    off.addEventListener("change", () => off.blur());
    // клавиши в панели не должны управлять машиной
    el.addEventListener("pointerdown", (e) => e.stopPropagation());
    this.refreshButtons();
    this.refreshBugInfo();
  }
  setVisible(v) {
    this.visible = v;
    store.set("dbg.visible", v);
    this.panel.classList.toggle("hidden", !v);
    this.overlay.style.display = v ? "block" : "none";
    this.refreshButtons();
  }
  refreshButtons() {
    if (!this.panel) return;
    const q = (a) => this.panel.querySelector(`button[data-a="${a}"]`);
    q("pause").classList.toggle("on", this.paused);
    q("free").classList.toggle("on", !!this.freecam);
    q("replay").classList.toggle("on", !!this.replay);
    q("slow").textContent = "×" + this.timeScale;
    q("slow").classList.toggle("on", this.timeScale !== 1);
    this.help.style.display = this.freecam && this.visible ? "block" : "none";
  }
  refreshBugInfo() {
    const el = this.panel.querySelector("#dbg-bug");
    const b = this.bug;
    el.textContent = b
      ? `${b.reason}\n${b.savedAt.replace("T", " ").slice(0, 19)} · ${b.carId} · ${fmt(b.duration, 1)} с\nместо: ${b.pos.join(", ")}`
      : "не сохранена";
  }
  refreshText() {
    const game = this.game;
    const car = game.car;
    const gr = car.ground;
    const road = gr.road ? gr.road.name : "—";
    const above = car.pos[1] - gr.h;
    const lines = [
      `${this.replay ? "▶ ПОВТОР " + this.replay.i + "/" + this.replay.frames.length : this.paused ? "⏸ ПАУЗА" : "● езда"}   fps ${fmt(game.fps, 0)}   время ×${this.timeScale}`,
      `скорость   ${fmt(car.speed * 3.6, 1)} км/ч   вперёд ${fmt(car.vForward, 1)} м/с`,
      `позиция    ${fmt(car.pos[0], 1)}, ${fmt(car.pos[1], 2)}, ${fmt(car.pos[2], 1)}`,
      `поворот    ${fmt((car.yaw * 180) / Math.PI, 0)}°   yawRate ${fmt(car.yawRate, 2)}`,
      `vy         <b class="${car.vy > LAUNCH_VY ? "warn" : ""}">${fmt(car.vy, 2)}</b> м/с   земля ${fmt(car.prevGroundVy || 0, 2)} м/с`,
      `на земле   ${car.onGround ? '<span class="ok">да</span>' : '<span class="warn">НЕТ</span> ' + fmt(car.airTime, 2) + " с"}   над землёй ${fmt(above, 2)} м`,
      `покрытие   ${gr.surface}   высота ${fmt(gr.h, 2)}${gr.bridge ? "  МОСТ" : ""}${gr.tunnel ? "  ТОННЕЛЬ" : ""}`,
      `дорога     ${road}`,
      `дрифт      ${car.drifting ? "да" : "нет"}   занос ${fmt(car.slip, 2)}   ускорение ${fmt(car.boost * 100, 0)}%`,
      `передача   ${car.gear}   обороты ${fmt(car.rpm, 0)}`,
      `камера     ${this.freecam ? "свободная (F4)" : "игровая"}   запись ${fmt(this.historyTime, 1)} с`,
    ];
    this.panel.querySelector("#dbg-tel").innerHTML = lines.join("\n");
    const p = this.pin || this.hover;
    const probeEl = this.panel.querySelector("#dbg-probe");
    if (!p) {
      probeEl.textContent =
        this.paused || this.freecam ? "наведи мышь на землю" : "поставь паузу (F2)";
    } else {
      const r = p.road;
      probeEl.innerHTML = [
        `${this.pin ? "закреплена (клик)" : "под курсором"}`,
        `x ${fmt(p.x, 2)}   z ${fmt(p.z, 2)}`,
        `высота физики  ${fmt(p.h, 3)}   (${p.surface})`,
        `высота рельефа ${fmt(p.terrainH, 3)}`,
        r
          ? `дорога: ${r.name}\n  до оси ${fmt(r.d, 2)} м, асфальт до ${fmt(r.hw, 2)}, физика до ${fmt(r.physEdge, 2)}\n  высота полотна ${fmt(r.h, 3)}   разница с рельефом <b class="${Math.abs(r.h - p.terrainH) > 0.3 ? "warn" : ""}">${fmt(r.h - p.terrainH, 3)}</b>${r.bridge ? "  МОСТ" : ""}${r.tunnel ? "  ТОННЕЛЬ" : ""}`
          : "дорог рядом нет",
        `до края дороги (сетка) ${fmt(p.edgeDist, 2)} м`,
      ].join("\n");
    }
  }
}
