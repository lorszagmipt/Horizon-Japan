// Интерфейс: меню, гараж, выбор заезда, пауза, настройки, карта, результаты, спидометр и подсказки на экране.

import { clamp, damp, lerp } from "../core/math.js";
import { BIOMES, LANDMARKS, WORLD } from "../world/mapData.js";
import { biomeAt } from "../world/biomes.js";
import { ACTIONS, DEFAULT_BINDINGS, keyLabel } from "../input/input.js";
import { GRAPHICS_PRESETS, saveSettings } from "../game/settings.js";
import { CARS } from "../car/cars.js";
import { CAMERA_MODES } from "../camera/cameraRig.js";
import { EVENTS, EVENT_TYPES, formatTime } from "../race/events.js";
import { Compass, Minimap, drawMapImage } from "./minimap.js";

const el = (tag, cls, html) => {
  const node = document.createElement(tag);
  if (cls) {
    node.className = cls;
  }
  if (html !== undefined) {
    node.innerHTML = html;
  }
  return node;
};

const cssColor = (hex) => "#" + hex.toString(16).padStart(6, "0");

export class UI {
  constructor(t) {
    this.game = t;
    this.root = document.getElementById("ui");
    this.screen = null;
    this.focusIdx = 0;
    this.menuT = 0;
    this.shot = 0;
    this.regionId = null;
    this.regionTimer = 0;
    this.toastTimer = 0;
    this.garageYaw = 0;
    this.build();
    this.bindPointer();
  }
  build() {
    const t = this.root;
    t.innerHTML = "";
    this.speedlines = el("div", "speedlines");
    t.appendChild(this.speedlines);
    const e = el("div", "", "");
    e.id = "hud";
    e.innerHTML = `
      <div class="speedo">
        <svg viewBox="0 0 230 230">
          <defs><linearGradient id="rg" x1="0" x2="1"><stop offset="0" stop-color="#3db6ff"/><stop offset=".7" stop-color="#ff5c8a"/><stop offset="1" stop-color="#ffa62b"/></linearGradient></defs>
          <circle cx="115" cy="115" r="104" fill="rgba(16,18,34,.62)" stroke="rgba(255,255,255,.15)" stroke-width="2"/>
          <path id="rpmbg" d="" fill="none" stroke="rgba(255,255,255,.14)" stroke-width="12" stroke-linecap="round"/>
          <path id="rpmred" d="" fill="none" stroke="rgba(255,80,80,.55)" stroke-width="12"/>
          <path id="rpm" d="" fill="none" stroke="url(#rg)" stroke-width="12" stroke-linecap="round"/>
          <g id="ticks"></g>
        </svg>
        <div class="num" id="spd">0</div><div class="unit" id="unit">КМ/Ч</div><div class="gear" id="gear">N</div>
      </div>
      <div class="boostlbl">УСКОРЕНИЕ · SHIFT</div>
      <div class="boostbar"><div id="boost"></div></div>
      <div class="region" id="region"><i></i><span></span></div>
      <div class="minimap"><canvas id="mm"></canvas></div>
      <div class="compass"><canvas id="cmp"></canvas></div>
      <div class="drift" id="drift" style="opacity:0"><div class="lbl" id="driftlbl">ДРИФТ</div><div class="pts"><span id="driftpts">0</span><span class="mult" id="driftmult">×1</span></div><div class="sub" id="driftsub"></div></div>
      <div class="banner" id="banner"><div class="b1" id="b1"></div><div class="b2" id="b2"></div><div class="b3" id="b3"></div></div>
      <div class="prompt hidden" id="prompt"></div>
      <div class="keys" id="keys"></div>
      <div class="panel evhud hidden" id="evhud"><div class="t1" id="evtype"></div><div class="t2" id="evname"></div><div class="time" id="evtime">0:00.00</div><div class="line"><span id="evcp"></span><span id="evbest"></span></div></div>
      <div class="countdown hidden" id="countdown"></div>
      <div class="fps hidden" id="fps"></div>
      <div class="toast" id="toast"></div>`;
    t.appendChild(e);
    this.hud = e;
    this.$ = (s) => document.getElementById(s);
    this.buildSpeedo();
    this.fadeEl = el("div", "fade");
    document.body.appendChild(this.fadeEl);
    this.screens = {};
    for (const s of ["menu", "events", "garage", "settings", "pause", "map", "results", "help"]) {
      const o = el("div", "screen hidden");
      o.dataset.name = s;
      t.appendChild(o);
      this.screens[s] = o;
    }
    this.buildMenu();
    this.vignette = el("div", "vignette");
    document.body.appendChild(this.vignette);
  }
  buildSpeedo() {
    const o = (135 * Math.PI) / 180;
    const i = (405 * Math.PI) / 180;
    const n = (r, c) => {
      const u = [115 + Math.cos(r) * 92, 115 + Math.sin(r) * 92];
      const h = [115 + Math.cos(c) * 92, 115 + Math.sin(c) * 92];
      const l = c - r > Math.PI ? 1 : 0;
      return `M${u[0].toFixed(1)} ${u[1].toFixed(1)} A92 92 0 ${l} 1 ${h[0].toFixed(1)} ${h[1].toFixed(1)}`;
    };
    this.arc = (r) => n(o, o + (i - o) * clamp(r, 0.001, 1));
    this.$("rpmbg").setAttribute("d", n(o, i));
    this.$("rpmred").setAttribute("d", n(o + (i - o) * 0.86, i));
    let a = "";
    for (let r = 0; r <= 8; r++) {
      const c = o + ((i - o) * r) / 8;
      const u = 115 + Math.cos(c) * 76;
      const h = 115 + Math.sin(c) * 76;
      const l = 115 + Math.cos(c) * 82;
      const m = 115 + Math.sin(c) * 82;
      a += `<line x1="${u}" y1="${h}" x2="${l}" y2="${m}" stroke="rgba(255,255,255,.5)" stroke-width="2"/>`;
      const p = 115 + Math.cos(c) * 64;
      const d = 115 + Math.sin(c) * 64 + 4;
      a += `<text x="${p}" y="${d}" fill="rgba(255,255,255,.6)" font-size="11" text-anchor="middle" font-family="Bahnschrift, Arial">${r}</text>`;
    }
    this.$("ticks").innerHTML = a;
  }
  initMaps() {
    if (!this.mapImg) {
      this.mapImg = drawMapImage(this.game.world, 1024);
      this.minimap = new Minimap(this.game.world, this.$("mm"), this.mapImg);
      this.compass = new Compass(this.$("cmp"));
    }
  }
  show(t) {
    for (const e in this.screens) {
      this.screens[e].classList.toggle("hidden", e !== t);
    }
    this.screen = t;
    this.focusIdx = 0;
    this.hud.classList.toggle("hidden", !!t && t !== null);
    this.updateFocus();
    if (this.game.audio) {
      this.game.audio.ui();
    }
  }
  hideScreens() {
    for (const t in this.screens) {
      this.screens[t].classList.add("hidden");
    }
    this.screen = null;
    this.hud.classList.toggle("hidden", !this.game.hudVisible);
  }
  focusables() {
    return this.screen
      ? [...this.screens[this.screen].querySelectorAll(".btn, .ev, [data-nav]")].filter(
          (t) => t.offsetParent !== null,
        )
      : [];
  }
  updateFocus() {
    this.focusables().forEach((e, s) => e.classList.toggle("focus", s === this.focusIdx));
  }
  buildMenu() {
    const t = this.screens.menu;
    t.innerHTML = `<div class="menu-shade"></div>
      <div class="menu-left">
        <div class="logo"><div class="l1">PAINTED</div><div class="l2"><span class="dot"></span>ROADS</div><div class="l3">JAPAN</div><div class="brush"></div></div>
        <div class="menu-list">
          <div class="btn" data-act="free"><div class="ico">\u{1F697}</div><div>Свободная езда<small>Открытый мир: сакура, клёны и Фудзи</small></div></div>
          <div class="btn" data-act="events"><div class="ico">\u{1F3C1}</div><div>Заезды<small>Спринты, кольца и дрифт-зона</small></div></div>
          <div class="btn" data-act="garage"><div class="ico">\u{1F527}</div><div>Гараж<small>Выбор автомобиля и цвета</small></div></div>
          <div class="btn" data-act="settings"><div class="ico">⚙</div><div>Настройки<small>Графика, управление, звук, клавиши</small></div></div>
          <div class="btn" data-act="help"><div class="ico">?</div><div>Как играть<small>Управление и советы</small></div></div>
        </div>
      </div>
      <div class="menu-foot">Мышь, клавиатура (↑ ↓ Enter) или геймпад<br>Оригинальная игра-вдохновение · все модели и музыка созданы процедурно</div>`;
    t.querySelectorAll(".btn").forEach((e) =>
      e.addEventListener("click", () => this.menuAction(e.dataset.act)),
    );
  }
  menuAction(t) {
    const e = this.game;
    if (e.audio) {
      e.audio.resume();
    }
    if (t === "free") {
      this.startFreeRoam();
    } else if (t === "events") {
      this.openEvents();
    } else if (t === "garage") {
      this.openGarage();
    } else if (t === "settings") {
      this.openSettings();
    } else if (t === "help") {
      this.openHelp();
    }
  }
  startFreeRoam(t) {
    const e = this.game;
    this.fade(() => {
      if (e.events) {
        e.events.cancel();
      }
      if (!t) {
        e.placeAtSpawn();
      }
      e.state = "drive";
      e.rig.snap = true;
      this.hideScreens();
      this.initMaps();
      this.showBanner("СВОБОДНАЯ ЕЗДА", "Добро пожаловать!", "#ff5c8a");
      this.regionId = null;
    });
  }
  menuShots() {
    if (this._shots) {
      return this._shots;
    }
    const t = this.game.world;
    const e = (x, v) => t.terrain.heightAt(x, v);
    const s = WORLD.fuji;
    const o = t.terrain.lakes.find((x) => x.id === "fuji");
    const i = t.terrain.lakes.find((x) => x.id === "mirror");
    const n = t.roads.byId.sakura;
    const a = (x, v) => {
      const g = t.roads.indexAtDist(x, v);
      return [x.x[g], x.h[g], x.z[g]];
    };
    const r = a(n, 160);
    const c = a(n, 300);
    const u = a(n, 380);
    const h = t.roads.byId.autumn;
    const l = a(h, 330);
    const m = a(h, 470);
    const p = a(h, 540);
    const d = LANDMARKS.pagoda;
    this._shots = [
      {
        from: [o.x + 20, o.level + 5, o.z + o.rz + 70],
        to: [o.x - 10, o.level + 8, o.z + o.rz + 20],
        look: [s.x, 700, s.z],
        fov: 50,
        shift: 0.18,
      },
      {
        road: n,
        d0: 160,
        d1: 300,
        h: 3.4,
        ahead: 70,
        fov: 62,
        shift: 0.12,
      },
      {
        from: [d.x + 95, e(d.x + 95, d.z + 30) + 14, d.z + 30],
        to: [d.x + 80, e(d.x + 80, d.z + 60) + 12, d.z + 60],
        look: [d.x, e(d.x, d.z) + 15, d.z],
        fov: 48,
        shift: 0.22,
      },
      {
        from: [i.x + 20, i.level + 4, i.z + i.rz + 30],
        to: [i.x + 60, i.level + 6, i.z + i.rz + 20],
        look: [i.x + 40, i.level + 6, i.z - 10],
        fov: 52,
        shift: 0.22,
      },
      {
        road: h,
        d0: 300,
        d1: 430,
        h: 3,
        ahead: 60,
        fov: 62,
        shift: 0.12,
      },
    ];
    return this._shots;
  }
  updateMenuCamera(t, e) {
    const s = e.cam;
    if (this.screen === "garage" || e.state === "garage") {
      const p = e.car;
      this.garageYaw += t * 0.16;
      const d = p.yaw + 2.5 + this.garageYaw + (this.dragYaw || 0);
      const x = 6.9;
      const v = p.pos[0] + Math.sin(d) * x;
      const g = p.pos[2] + Math.cos(d) * x;
      const b = p.pos[1] + 1.75;
      if (this.garageSnap) {
        s.pos = [v, b, g];
        this.garageSnap = false;
      }
      s.pos = [damp(s.pos[0], v, 5, t), damp(s.pos[1], b, 5, t), damp(s.pos[2], g, 5, t)];
      const y = p.pos[0] - s.pos[0];
      const k = p.pos[2] - s.pos[2];
      const w = Math.hypot(y, k) || 1;
      const M = -k / w;
      const _ = y / w;
      const z = window.innerWidth > 900 ? 0.9 : 0;
      s.target = [p.pos[0] + M * z, p.pos[1] + 0.45, p.pos[2] + _ * z];
      s.fov = 46;
      return;
    }
    const o = this.menuShots();
    const i = 11;
    this.menuT += t;
    if (this.menuT > i) {
      this.menuT = 0;
      this.shot = (this.shot + 1) % o.length;
    }
    let n = o[this.shot];
    const a = this.menuT / i;
    const r = a * a * (3 - 2 * a);
    if (n.road) {
      const p = n.road;
      const d = e.world.roads;
      const x = (y) => {
        const k = d.indexAtDist(p, y);
        return [p.x[k], p.h[k], p.z[k]];
      };
      const v = lerp(n.d0, n.d1, a);
      const g = x(v);
      const b = x(v + n.ahead);
      n = {
        ...n,
        from: [g[0], g[1] + n.h, g[2]],
        to: [g[0], g[1] + n.h, g[2]],
        look: [b[0], b[1] + n.h * 0.6, b[2]],
      };
    }
    s.pos = [lerp(n.from[0], n.to[0], r), lerp(n.from[1], n.to[1], r), lerp(n.from[2], n.to[2], r)];
    const c = n.look[0] - s.pos[0];
    const u = n.look[2] - s.pos[2];
    const h = Math.hypot(c, u) || 1;
    const l = (n.shift || 0) * h * (window.innerWidth > 900 ? 1 : 0);
    s.target = [n.look[0] + (u / h) * l * -1 * -1, n.look[1], n.look[2] - (c / h) * l * -1 * -1];
    s.fov = n.fov;
    const m = Math.min(this.menuT, i - this.menuT);
    this.fadeEl.style.transition = "none";
    this.fadeEl.style.opacity = m < 0.6 ? String(1 - m / 0.6) : "0";
  }
  openGarage(t) {
    const e = this.game;
    this.garageFromPause = !!t;
    this.garageReturn = {
      pos: e.car.pos.slice(),
      yaw: e.car.yaw,
      state: e.state,
    };
    this.garageReturnCar = e.settings.car;
    this.garageIdx = Math.max(
      0,
      CARS.findIndex((i) => i.id === e.settings.car),
    );
    e.state = "garage";
    const s = e.world.roads.byId.sakura;
    const o = e.world.roads.indexAtDist(s, 610);
    this.fade(() => {
      e.car.place(s.x[o], s.z[o], Math.atan2(s.tx[o], s.tz[o]));
      e.carView.update(e.carViewState());
      this.garageSnap = true;
      this.garageYaw = 0;
      this.renderGarage();
      this.show("garage");
    });
  }
  renderGarage() {
    const t = this.game;
    const e = CARS[this.garageIdx];
    const s = t.settings.colors[e.id] || 0;
    if (t.car.spec.id !== e.id) {
      t.settings.car = e.id;
      t.spawnCar(e.id);
      t.carView.update(t.carViewState());
    }
    t.carView.setColor(e.colors[s]);
    const o = this.screens.garage;
    const i = e.stats;
    const n = e.phys;
    const a = (r, c, u) =>
      `<div class="stat"><span>${r}</span><div class="barbg"><div class="bar" style="width:${Math.round(c * 100)}%"></div></div><span>${u}</span></div>`;
    o.innerHTML = `
      <div class="garage-count">ГАРАЖ · ${this.garageIdx + 1} / ${CARS.length}</div>
      <div class="garage-arrows"><button data-g="prev">‹</button><button data-g="next">›</button></div>
      <div class="panel garage-info">
        <span class="tag">${e.tag}</span>
        <div class="name">${e.name}</div>
        <div class="cls">${e.cls}</div>
        <p>${e.desc}</p>
        ${a("Скорость", i.speed, Math.round(n.vmax * 3.6 * 0.86))}
        ${a("Разгон", i.accel, "")}
        ${a("Управляемость", i.handling, "")}
        ${a("Дрифт", i.drift, "")}
        <div class="note">${n.awd ? "Полный привод" : "Задний привод"} · ${Math.round(n.mass)} кг</div>
        <div class="swatches">${e.colors.map((r, c) => `<div class="swatch ${c === s ? "on" : ""}" data-c="${c}" style="background:${cssColor(r)}"></div>`).join("")}</div>
      </div>
      <div class="garage-nav">
        <div class="btn" data-act="choose"><div class="ico">✓</div><div>${this.garageFromPause ? "Ехать на этой машине" : "Выбрать и поехать"}</div></div>
        <div class="btn ghost" data-act="back"><div class="ico">←</div><div>Назад</div></div>
      </div>`;
    o.querySelector("[data-g=prev]").onclick = () => this.garageStep(-1);
    o.querySelector("[data-g=next]").onclick = () => this.garageStep(1);
    o.querySelectorAll(".swatch").forEach((r) => {
      r.onclick = () => {
        t.settings.colors[e.id] = +r.dataset.c;
        saveSettings(t.settings);
        this.renderGarage();
      };
    });
    o.querySelector("[data-act=choose]").onclick = () => this.garageChoose();
    o.querySelector("[data-act=back]").onclick = () => this.back();
    this.updateFocus();
  }
  garageStep(t) {
    this.garageIdx = (this.garageIdx + t + CARS.length) % CARS.length;
    this.renderGarage();
    if (this.game.audio) {
      this.game.audio.ui();
    }
  }
  garageChoose() {
    const t = this.game;
    t.settings.car = CARS[this.garageIdx].id;
    saveSettings(t.settings);
    if (this.garageFromPause) {
      const e = this.garageReturn;
      this.fade(() => {
        t.car.place(e.pos[0], e.pos[2], e.yaw);
        t.state = "drive";
        t.rig.snap = true;
        this.hideScreens();
      });
    } else {
      this.startFreeRoam();
    }
  }
  openEvents(t) {
    this.eventsFromPause = !!t;
    const e = this.game.events;
    const s = this.screens.events;
    s.innerHTML = `<div class="panel center-panel"><h2>Заезды</h2><div class="note">Выберите заезд — машина перенесётся на старт. Маркеры заездов есть и в мире: подъезжайте к светящимся столбам и нажмите E.</div>
      <div class="ev-grid">${EVENTS.map((o) => {
        const i = e.best[o.id] && e.best[o.id].best;
        const n = ((e.paths[o.id].length * (o.laps || 1)) / 1000).toFixed(1);
        return `<div class="ev" data-ev="${o.id}"><div class="stripe" style="background:${o.color}"></div><span class="type" style="background:${o.color}">${EVENT_TYPES[o.type]}</span>
          <div class="title">${o.name}</div><div class="meta">${o.region} · ${n} км${o.laps ? " · кругов: " + o.laps : ""}<br>${o.desc}</div>
          <div class="best">Рекорд: ${i == null ? "—" : o.type === "drift" ? i.toLocaleString("ru") + " очков" : formatTime(i)}</div></div>`;
      }).join("")}</div>
      <div class="foot-btns"><div class="btn small ghost" data-act="back">← Назад</div></div></div>`;
    s.querySelectorAll(".ev").forEach((o) => {
      o.onclick = () => this.startEvent(o.dataset.ev);
    });
    s.querySelector("[data-act=back]").onclick = () => this.back();
    this.show("events");
  }
  startEvent(t) {
    const e = this.game;
    if (e.audio) {
      e.audio.resume();
    }
    this.fade(() => {
      this.hideScreens();
      this.initMaps();
      e.events.start(t);
    });
  }
  onEventStart(t) {
    this.$("evhud").classList.remove("hidden");
    this.$("evtype").textContent = EVENT_TYPES[t.def.type] + " · " + t.def.region.toUpperCase();
    this.$("evname").textContent = t.def.name;
    this.$("countdown").classList.remove("hidden");
    this.showBanner(EVENT_TYPES[t.def.type], t.def.name, t.def.color);
  }
  onEventEnd() {
    this.$("evhud").classList.add("hidden");
    this.$("countdown").classList.add("hidden");
    this.hideScreens();
    this.game.state = "drive";
  }
  flashCheckpoint(t) {
    this.toast(
      "Контрольная точка " +
        t.next +
        " / " +
        t.cps.length +
        (t.def.type === "circuit" ? " · круг " + t.lap + "/" + t.laps : ""),
    );
  }
  showResults(t) {
    const e = this.screens.results;
    const s = {
      gold: ["ЗОЛОТО", "#ffd23f", "#3a2a00"],
      silver: ["СЕРЕБРО", "#dfe6f0", "#222"],
      bronze: ["БРОНЗА", "#e09a5a", "#2a1500"],
    };
    const o = t.medal ? s[t.medal] : null;
    const i = (a) => (t.isDrift ? Math.round(a).toLocaleString("ru") : formatTime(a));
    const n = (t.history || [])
      .map((a, r) => `<tr><td>${r + 1}.</td><td>${a.car}</td><td>${i(a.v)}</td></tr>`)
      .join("");
    e.innerHTML = `<div class="panel center-panel results" style="width:min(620px,92vw)">
      <div class="note" style="letter-spacing:.3em">${t.def.name.toUpperCase()}</div>
      <h2 style="margin-top:8px">${t.isDrift ? "Очки дрифта" : "Финиш!"}</h2>
      <div class="big">${i(t.result)}</div>
      ${o ? `<div class="medal" style="background:${o[1]};color:${o[2]}">${o[0]}</div>` : '<div class="note">Без медали — попробуйте ещё раз!</div>'}
      ${t.newBest ? '<div style="margin-top:12px;color:#ffd23f;font-weight:700;letter-spacing:.15em">НОВЫЙ РЕКОРД!</div>' : ""}
      <div class="note" style="margin-top:10px">Лучший в этой сессии: ${i(t.session)} · Рекорд: ${i(t.best)}<br>
      Медали: золото ${i(t.ref[0])} · серебро ${i(t.ref[1])} · бронза ${i(t.ref[2])}</div>
      <table>${n}</table>
      <div class="foot-btns" style="justify-content:center"><div class="btn small" data-act="retry">↻ Повторить</div><div class="btn small ghost" data-act="cont">Продолжить езду</div></div></div>`;
    e.querySelector("[data-act=retry]").onclick = () =>
      this.fade(() => {
        this.hideScreens();
        this.game.events.closeResults(true);
      });
    e.querySelector("[data-act=cont]").onclick = () => {
      this.game.events.closeResults(false);
    };
    this.$("evhud").classList.add("hidden");
    this.show("results");
    this.game.state = "results";
  }
  openPause() {
    const t = this.game;
    t.state = "paused";
    const e = t.events && t.events.active;
    const s = this.screens.pause;
    s.innerHTML = `<div class="menu-shade"></div><div class="menu-left">
      <div class="logo"><div class="l1" style="font-size:56px">ПАУЗА</div><div class="l3">${e ? t.events.active.def.name : "СВОБОДНАЯ ЕЗДА"}</div></div>
      <div class="menu-list">
        <div class="btn" data-act="resume"><div class="ico">▶</div><div>Продолжить</div></div>
        ${e ? '<div class="btn" data-act="restart"><div class="ico">↻</div><div>Начать заезд заново</div></div><div class="btn" data-act="quitev"><div class="ico">✕</div><div>Покинуть заезд</div></div>' : ""}
        <div class="btn" data-act="respawn"><div class="ico">⟲</div><div>Вернуться на дорогу</div></div>
        <div class="btn" data-act="map"><div class="ico">\u{1F5FA}</div><div>Карта мира</div></div>
        ${e ? "" : '<div class="btn" data-act="events"><div class="ico">🏁</div><div>Заезды</div></div><div class="btn" data-act="garage"><div class="ico">🔧</div><div>Гараж</div></div>'}
        <div class="btn" data-act="settings"><div class="ico">⚙</div><div>Настройки</div></div>
        <div class="btn" data-act="menu"><div class="ico">⌂</div><div>Главное меню</div></div>
      </div></div>`;
    s.querySelectorAll(".btn").forEach((o) => {
      o.onclick = () => this.pauseAction(o.dataset.act);
    });
    this.show("pause");
    if (t.audio) {
      t.audio.setPaused(true);
    }
  }
  pauseAction(t) {
    const e = this.game;
    if (t === "resume") {
      this.resume();
    } else if (t === "restart") {
      const s = e.events.active.def.id;
      this.resume();
      this.fade(() => e.events.start(s));
    } else if (t === "quitev") {
      e.events.cancel();
      this.resume();
    } else if (t === "respawn") {
      this.resume();
      if (e.events && e.events.active) {
        e.events.respawnAtCheckpoint();
      } else {
        e.respawn();
      }
    } else if (t === "map") {
      this.openMap();
    } else if (t === "events") {
      this.openEvents(true);
    } else if (t === "garage") {
      this.openGarage(true);
    } else if (t === "settings") {
      this.openSettings(true);
    } else if (t === "menu") {
      this.toMainMenu();
    }
  }
  resume() {
    this.hideScreens();
    this.game.state = "drive";
    if (this.game.audio) {
      this.game.audio.setPaused(false);
    }
  }
  toMainMenu() {
    const t = this.game;
    this.fade(() => {
      if (t.events) {
        t.events.cancel();
      }
      t.state = "menu";
      this.menuT = 0;
      this.show("menu");
      if (t.audio) {
        t.audio.setPaused(false);
      }
    });
  }
  openMap() {
    const t = this.game;
    this.initMaps();
    const e = this.screens.map;
    e.innerHTML = `<div class="panel center-panel"><h2>Карта мира</h2><div class="mapwrap"><canvas id="bigmap"></canvas>
      <div class="legend"><div><i style="background:#ff8fb8"></i>Долина Сакуры (юго-запад)</div><div><i style="background:#ff9a3c"></i>Лес Золотых Клёнов (восток)</div>
      <div><i style="background:#8fc7ff"></i>Нагорье Фудзи (север)</div><div><i style="background:#9cd06a"></i>Равнина Фестиваля (центр)</div>
      <div><i style="background:#ffd36b"></i>Шоссе «Окружное»</div><div><i style="background:#fff;border:2px solid #f5c"></i>Вы здесь</div>
      <div style="margin-top:8px;color:#b9b6cf">Цветные круги — старты заездов.<br>Фудзи — к северу от карты.</div></div></div>
      <div class="foot-btns"><div class="btn small ghost" data-act="back">← Назад</div></div></div>`;
    const s = e.querySelector("#bigmap");
    s.width = s.height = 1024;
    const o = s.getContext("2d");
    o.drawImage(this.mapImg, 0, 0);
    const i = 1024 / 3200;
    for (const a of t.events.markers) {
      o.fillStyle = a.def.color;
      o.strokeStyle = "#fff";
      o.lineWidth = 4;
      o.beginPath();
      o.arc((a.x + 1600) * i, (a.z + 1600) * i, 13, 0, Math.PI * 2);
      o.fill();
      o.stroke();
      o.fillStyle = "#fff";
      o.font = "bold 16px Bahnschrift, Arial";
      o.textAlign = "left";
      o.fillText(a.def.name, (a.x + 1600) * i + 18, (a.z + 1600) * i + 6);
    }
    const n = t.car.pos;
    o.save();
    o.translate((n[0] + 1600) * i, (n[2] + 1600) * i);
    o.rotate(Math.atan2(Math.cos(t.car.yaw), Math.sin(t.car.yaw)) + Math.PI / 2);
    o.fillStyle = "#fff";
    o.strokeStyle = "#ff5c8a";
    o.lineWidth = 5;
    o.beginPath();
    o.moveTo(0, -22);
    o.lineTo(15, 16);
    o.lineTo(0, 8);
    o.lineTo(-15, 16);
    o.closePath();
    o.stroke();
    o.fill();
    o.restore();
    e.querySelector("[data-act=back]").onclick = () => this.back();
    this.show("map");
  }
  openSettings(t) {
    this.settingsFrom = t ? "pause" : "menu";
    this.settingsTab = this.settingsTab || "gfx";
    this.renderSettings();
    this.show("settings");
  }
  renderSettings() {
    const t = this.game;
    const e = t.settings;
    const s = e.graphics;
    const o = this.screens.settings;
    const i = (h, l, m) =>
      `<div class="seg" data-seg="${h}">${l.map(([p, d]) => `<button data-v="${p}" class="${String(m) === String(p) ? "on" : ""}">${d}</button>`).join("")}</div>`;
    const n = (h, l, m, p, d, x) =>
      `<input type="range" data-range="${h}" min="${l}" max="${m}" step="${p}" value="${d}"><span class="val" data-val="${h}">${x(d)}</span>`;
    let a = "";
    const r = this.settingsTab;
    if (r === "gfx") {
      a = `
        <div class="row"><label>Пресет качества</label>${i(
          "preset",
          [
            ["low", "Низкое"],
            ["medium", "Среднее"],
            ["high", "Высокое"],
          ],
          e.preset,
        )}</div>
        <div class="row"><label>Тени</label>${i(
          "shadows",
          [
            [0, "Выкл"],
            [1024, "Мягкие"],
            [2048, "Чёткие"],
          ],
          s.shadows,
        )}</div>
        <div class="row"><label>Дальность прорисовки, м</label><div>${n("drawDist", 600, 2000, 50, s.drawDist, (h) => h)}</div></div>
        <div class="row"><label>Масштаб рендеринга</label><div>${n("pixelRatio", 0.5, 1.5, 0.05, s.pixelRatio, (h) => Math.round(h * 100) + "%")}</div></div>
        <div class="row"><label>Частицы (лепестки, дым)</label><div>${n("particles", 0.2, 1, 0.05, s.particles, (h) => Math.round(h * 100) + "%")}</div></div>
        <div class="row"><label>Отражения в озёрах</label>${i(
          "reflections",
          [
            [false, "Выкл"],
            [true, "Вкл"],
          ],
          s.reflections,
        )}</div>
        <div class="row"><label>Плотность растительности <span class="note">(после перезапуска)</span></label><div>${n("vegetation", 0.4, 1, 0.05, s.vegetation, (h) => Math.round(h * 100) + "%")}</div></div>
        <div class="row"><label>Время суток</label>${i(
          "timeOfDay",
          [
            ["day", "День"],
            ["sunset", "Закат"],
          ],
          e.timeOfDay,
        )}</div>
        <div class="row"><label>Эффект скорости</label>${i(
          "speedFx",
          [
            [true, "Вкл"],
            [false, "Выкл"],
          ],
          e.speedFx,
        )}</div>
        <div class="row"><label>Счётчик FPS</label>${i(
          "showFps",
          [
            [false, "Выкл"],
            [true, "Вкл"],
          ],
          e.showFps,
        )}</div>
        <div class="row"><label>Полноэкранный режим</label><div class="seg"><button data-fs="1">${document.fullscreenElement ? "Выйти" : "Включить"}</button></div></div>`;
    } else if (r === "ctl") {
      a = `
        <div class="row"><label>Чувствительность руля</label><div>${n("steerSens", 0.5, 1.5, 0.05, e.steerSens, (h) => Math.round(h * 100) + "%")}</div></div>
        <div class="row"><label>Сила дрифта</label><div>${n("driftStrength", 0.4, 1.6, 0.05, e.driftStrength, (h) => Math.round(h * 100) + "%")}</div></div>
        <div class="row"><label>Единицы скорости</label>${i(
          "units",
          [
            ["kmh", "км/ч"],
            ["mph", "mph"],
          ],
          e.units,
        )}</div>
        <div class="row"><label>Камера по умолчанию</label>${i(
          "cameraMode",
          CAMERA_MODES.map((h, l) => [l, h]),
          e.cameraMode,
        )}</div>
        <div class="note">Геймпад: левый стик — руль, R2/RT — газ, L2/LT — тормоз, A — ручник, RB — ускорение, Y — камера, B — на дорогу, X — старт заезда, Start — пауза.</div>`;
    } else if (r === "snd") {
      const h = e.volume;
      a = ["master", "engine", "music", "ambient"]
        .map(
          (l) =>
            `<div class="row"><label>${
              {
                master: "Общая громкость",
                engine: "Двигатель и шины",
                music: "Музыка",
                ambient: "Окружение (птицы, ветер, вода)",
              }[l]
            }</label><div>${n("vol_" + l, 0, 1, 0.05, h[l], (m) => Math.round(m * 100) + "%")}</div></div>`,
        )
        .join("");
    } else {
      a =
        ACTIONS.map((h) => {
          const l = e.bindings[h.id] || [];
          return `<div class="row"><label>${h.name}</label><div><button class="keybtn" data-bind="${h.id}" data-slot="0">${keyLabel(l[0])}</button> <button class="keybtn" data-bind="${h.id}" data-slot="1">${keyLabel(l[1])}</button></div></div>`;
        }).join("") +
        `<div class="note">Нажмите на кнопку и затем на нужную клавишу. Esc — отмена, Backspace — очистить.</div>
        <div class="foot-btns" style="justify-content:flex-start"><div class="btn small ghost" data-act="resetkeys">Сбросить клавиши</div></div>`;
    }
    o.innerHTML = `<div class="panel center-panel"><h2>Настройки</h2>
      <div class="tabs">${[
        ["gfx", "Графика"],
        ["ctl", "Управление"],
        ["snd", "Звук"],
        ["keys", "Клавиши"],
      ]
        .map(([h, l]) => `<button data-tab="${h}" class="${h === r ? "on" : ""}">${l}</button>`)
        .join("")}</div>
      <div>${a}</div>
      <div class="foot-btns"><div class="btn small ghost" data-act="back">← Готово</div></div></div>`;
    o.querySelectorAll("[data-tab]").forEach((h) => {
      h.onclick = () => {
        this.settingsTab = h.dataset.tab;
        this.renderSettings();
      };
    });
    o.querySelectorAll("[data-seg] button").forEach((h) => {
      h.onclick = () => {
        const l = h.parentElement.dataset.seg;
        let m = h.dataset.v;
        if (m === "true") {
          m = true;
        } else if (m === "false") {
          m = false;
        } else if (!isNaN(+m) && l !== "preset") {
          m = +m;
        }
        this.applySetting(l, m);
        this.renderSettings();
      };
    });
    o.querySelectorAll("[data-range]").forEach((h) => {
      h.oninput = () => {
        const l = h.dataset.range;
        const m = +h.value;
        const p = o.querySelector(`[data-val="${l}"]`);
        if (p) {
          p.textContent = l === "drawDist" ? m : Math.round(m * 100) + "%";
        }
        this.applySetting(l, m);
      };
    });
    const c = o.querySelector("[data-fs]");
    if (c) {
      c.onclick = () => {
        try {
          if (document.fullscreenElement) {
            document.exitFullscreen();
          } else {
            document.documentElement.requestFullscreen();
          }
        } catch {}
        setTimeout(() => this.renderSettings(), 300);
      };
    }
    o.querySelectorAll("[data-bind]").forEach((h) => {
      h.onclick = () => {
        h.classList.add("wait");
        h.textContent = "нажмите…";
        t.input.capture = (l) => {
          if (l !== "Escape") {
            const m = (e.bindings[h.dataset.bind] || []).slice();
            if (l === "Backspace") {
              m[+h.dataset.slot] = undefined;
            } else {
              for (const p in e.bindings) {
                e.bindings[p] = (e.bindings[p] || []).map((d) => (d === l ? undefined : d));
              }
              m[+h.dataset.slot] = l;
            }
            e.bindings[h.dataset.bind] = m
              .filter((p, d) => p !== undefined || d === 0)
              .map((p) => p);
            e.bindings[h.dataset.bind] = [m[0], m[1]].filter((p) => p);
            t.input.setBindings(e.bindings);
            saveSettings(e);
          }
          this.renderSettings();
        };
      };
    });
    const u = o.querySelector("[data-act=resetkeys]");
    if (u) {
      u.onclick = () => {
        e.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
        t.input.setBindings(e.bindings);
        saveSettings(e);
        this.renderSettings();
      };
    }
    o.querySelector("[data-act=back]").onclick = () => this.back();
    this.updateFocus();
  }
  applySetting(t, e) {
    const s = this.game;
    const o = s.settings;
    const i = o.graphics;
    if (t === "preset") {
      o.preset = e;
      o.graphics = { ...GRAPHICS_PRESETS[e] };
    } else if (
      ["shadows", "drawDist", "pixelRatio", "particles", "reflections", "vegetation"].includes(t)
    ) {
      i[t] = e;
    } else if (t.startsWith("vol_")) {
      o.volume[t.slice(4)] = e;
    } else {
      o[t] = e;
    }
    s.applySettings();
    saveSettings(o);
  }
  openHelp() {
    const t = this.screens.help;
    const e = this.game.settings.bindings;
    const s = (o) => (e[o] || []).map(keyLabel).join(" / ");
    t.innerHTML = `<div class="panel center-panel"><h2>Как играть</h2>
      <h3>Управление</h3>
      <div class="row"><label>Газ / тормоз и задний ход</label><span>${s("throttle")} · ${s("brake")}</span></div>
      <div class="row"><label>Руль</label><span>${s("left")} · ${s("right")}</span></div>
      <div class="row"><label>Ручной тормоз — вход в занос</label><span>${s("handbrake")}</span></div>
      <div class="row"><label>Ускорение (заряжается в заносах)</label><span>${s("boost")}</span></div>
      <div class="row"><label>Вернуться на дорогу</label><span>${s("respawn")}</span></div>
      <div class="row"><label>Камера / смотреть назад</label><span>${s("camera")} · ${s("lookBack")}</span></div>
      <div class="row"><label>Начать заезд у маркера</label><span>${s("interact")}</span></div>
      <div class="row"><label>Пауза / скрыть интерфейс</label><span>${s("pause")} · ${s("hud")}</span></div>
      <div class="row"><label>Осмотр вокруг машины</label><span>Зажать левую кнопку мыши и вести</span></div>
      <h3>Советы</h3>
      <div class="note" style="font-size:15px;line-height:1.6">• Дрифт: на скорости от 40 км/ч коротко нажмите ручник с поворотом руля, затем держите газ и рулите в сторону поворота — угол заноса регулируется рулём.<br>
      • Очки дрифта растут с углом и скоростью; множитель увеличивается, пока занос не прерывается. Удар о препятствие срывает серию.<br>
      • Светящиеся столбы на карте — старты заездов. Подъедьте и нажмите ${s("interact")}.<br>
      • Фудзи — главный ориентир: она всегда на севере.<br>
      • Если игра идёт медленно — выберите пресет «Низкое» в настройках графики.</div>
      <div class="foot-btns"><div class="btn small ghost" data-act="back">← Назад</div></div></div>`;
    t.querySelector("[data-act=back]").onclick = () => this.back();
    this.show("help");
  }
  back() {
    const t = this.game;
    const e = this.screen;
    if (e === "garage") {
      if (this.garageReturnCar && t.car.spec.id !== this.garageReturnCar) {
        t.settings.car = this.garageReturnCar;
        t.spawnCar(this.garageReturnCar);
        saveSettings(t.settings);
      }
      if (this.garageFromPause) {
        const s = this.garageReturn;
        this.fade(() => {
          t.car.place(s.pos[0], s.pos[2], s.yaw);
          t.state = "paused";
          this.openPause();
        });
      } else {
        this.fade(() => {
          t.placeAtSpawn();
          t.state = "menu";
          this.show("menu");
        });
      }
    } else if (e === "events") {
      if (this.eventsFromPause) {
        this.openPause();
      } else {
        this.show("menu");
      }
    } else if (e === "settings") {
      if (this.settingsFrom === "pause") {
        this.openPause();
      } else {
        this.show("menu");
      }
    } else if (e === "map") {
      this.openPause();
    } else if (e === "help") {
      this.show("menu");
    } else if (e === "pause") {
      this.resume();
    } else if (e === "results") {
      this.game.events.closeResults(false);
    }
  }
  bindPointer() {
    const t = document.getElementById("gl");
    let e = false;
    let s = 0;
    let o = 0;
    t.addEventListener("pointerdown", (i) => {
      e = true;
      s = i.clientX;
      o = i.clientY;
      if (this.game.audio) {
        this.game.audio.resume();
      }
    });
    window.addEventListener("pointerup", () => {
      e = false;
    });
    window.addEventListener("pointermove", (i) => {
      if (!e) {
        return;
      }
      const n = i.clientX - s;
      const a = i.clientY - o;
      s = i.clientX;
      o = i.clientY;
      if (this.game.state === "drive") {
        this.game.rig.mouseDrag(n, a);
      }
      if (this.game.state === "garage") {
        this.dragYaw = (this.dragYaw || 0) - n * 0.008;
      }
    });
    window.addEventListener("keydown", () => {
      if (this.game.audio) {
        this.game.audio.resume();
      }
    });
  }
  handlePressed(t, e) {
    if (e.input.capture) {
      return;
    }
    const s = this.screen;
    const o = e.input.down;
    if (s) {
      const i = this.focusables();
      const n = (a) => {
        if (i.length) {
          this.focusIdx = (this.focusIdx + a + i.length) % i.length;
          this.updateFocus();
          if (e.audio) {
            e.audio.ui(true);
          }
        }
      };
      if (t.has("nav_down") || this._key("ArrowDown")) {
        n(1);
      }
      if (t.has("nav_up") || this._key("ArrowUp")) {
        n(-1);
      }
      if (s === "garage" && (t.has("nav_left") || this._key("ArrowLeft"))) {
        this.garageStep(-1);
      }
      if (s === "garage" && (t.has("nav_right") || this._key("ArrowRight"))) {
        this.garageStep(1);
      }
      if (s === "events" && (t.has("nav_right") || this._key("ArrowRight"))) {
        n(1);
      }
      if (s === "events" && (t.has("nav_left") || this._key("ArrowLeft"))) {
        n(-1);
      }
      if (t.has("nav_accept") || this._key("Enter") || this._key("Space")) {
        const a = i[this.focusIdx];
        if (a) {
          a.click();
        }
      }
      if (t.has("pause") && s !== "menu") {
        this.back();
      }
      this._keys.clear();
      return;
    }
    this._keys.clear();
    if (e.state === "drive") {
      if (t.has("pause")) {
        this.openPause();
        return;
      }
      if (t.has("interact") && e.events.nearMarker && !e.events.active) {
        this.startEvent(e.events.nearMarker.def.id);
      }
      if (t.has("respawn") && e.events.active && e.events.active.started) {
        e.events.respawnAtCheckpoint();
        t.delete("respawn");
      }
    }
  }
  get _keys() {
    if (!this.__k) {
      this.__k = new Set();
      window.addEventListener("keydown", (t) => {
        if (!t.repeat) {
          this.__k.add(t.code);
        }
      });
    }
    return this.__k;
  }
  _key(t) {
    return this._keys.has(t);
  }
  fade(t, e) {
    const s = this.fadeEl;
    s.style.transition = "opacity .3s";
    s.textContent = e || "";
    s.classList.add("on");
    s.style.opacity = "1";
    setTimeout(() => {
      try {
        if (t) {
          t();
        }
      } catch (o) {
        console.error(o);
      }
      setTimeout(
        () => {
          s.classList.remove("on");
          s.style.opacity = "0";
        },
        e ? 900 : 120,
      );
    }, 320);
  }
  toast(t) {
    const e = this.$("toast");
    e.textContent = t;
    e.classList.add("show");
    this.toastTimer = 2.2;
  }
  showBanner(t, e, s) {
    const o = this.$("banner");
    this.$("b1").textContent = t;
    this.$("b2").textContent = e;
    this.$("b3").style.background = `linear-gradient(90deg, transparent, ${s}, transparent)`;
    o.classList.add("show");
    this.bannerTimer = 3.2;
  }
  setHudVisible(t) {
    this.hud.classList.toggle("hidden", !t);
  }
  update(t, e) {
    if (this.toastTimer > 0) {
      this.toastTimer -= t;
      if (this.toastTimer <= 0) {
        this.$("toast").classList.remove("show");
      }
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= t;
      if (this.bannerTimer <= 0) {
        this.$("banner").classList.remove("show");
      }
    }
    const s = this.$("fps");
    s.classList.toggle("hidden", !e.settings.showFps);
    if (e.settings.showFps) {
      s.textContent =
        Math.round(e.fps) +
        " FPS · " +
        e.renderer.stats.draws +
        " вызовов · " +
        Math.round(e.renderer.stats.tris / 1000) +
        "k треуг.";
    }
    if (!(e.state === "drive") || this.screen) {
      this.speedlines.style.opacity = 0;
      return;
    }
    if (!this.mapImg) {
      this.initMaps();
    }
    const i = e.car;
    if (!this.perfHinted && e.settings.preset !== "low") {
      this.slowTime = e.fps < 32 ? (this.slowTime || 0) + t : 0;
      if (this.slowTime > 8) {
        this.perfHinted = true;
        this.toast("Низкий FPS — попробуйте пресет «Низкое» в настройках графики");
        this.toastTimer = 6;
      }
    }
    const n = e.settings.units === "mph";
    const a = i.speed * 3.6 * (n ? 0.621 : 1);
    this.$("spd").textContent = Math.round(a);
    this.$("unit").textContent = n ? "MPH" : "КМ/Ч";
    this.$("gear").textContent =
      i.gear < 0 ? "R" : i.speed < 0.5 && e.controls.throttle === 0 ? "N" : i.gear;
    this.$("rpm").setAttribute("d", this.arc(i.rpm / 8000));
    this.$("boost").style.width = Math.round(i.boost * 100) + "%";
    const r = e.settings.speedFx
      ? clamp((i.speed - 38) / 30, 0, 1) * 0.35 + (i.boosting ? 0.25 : 0)
      : 0;
    this.speedlines.style.opacity = r.toFixed(2);
    this.speedlines.style.transform = `rotate(${(e.time * 40) % 360}deg)`;
    this.regionTimer -= t;
    if (this.regionTimer <= 0) {
      this.regionTimer = 0.5;
      const [M, _, z] = biomeAt(i.pos[0], i.pos[2]);
      const T = Math.max(M, _, z);
      const S = T < 0.4 ? "plains" : T === M ? "sakura" : T === _ ? "autumn" : "high";
      const E =
        S === "plains"
          ? {
              name: "Равнина Фестиваля",
              en: "Festival Plains",
              color: "#9cd06a",
            }
          : BIOMES.find((P) => P.id === S);
      if (S !== this.regionId) {
        if (this.regionId !== null) {
          this.showBanner(E.en.toUpperCase(), E.name, E.color);
        }
        this.regionId = S;
        const P = this.$("region");
        P.querySelector("i").style.background = E.color;
        P.querySelector("span").textContent = E.name;
      }
    }
    const c = e.events;
    const u = c && c.active;
    let h = null;
    if (u && !u.finished) {
      const M = u.cps[Math.min(u.next, u.cps.length - 1)];
      const _ = c.pathIndexForDist(M);
      h = [u.P.x[_], u.P.z[_]];
    }
    const l = u
      ? []
      : c.markers.map((M) => ({
          x: M.x,
          z: M.z,
          color: M.def.color,
          ch: M.def.type === "drift" ? "D" : M.def.type === "circuit" ? "○" : "▶",
        }));
    this.minimap.draw(i, l, h);
    const m = [Math.sin(i.yaw), Math.cos(i.yaw)];
    const p = ((Math.atan2(m[0], -m[1]) * 180) / Math.PI + 360) % 360;
    const d = (M, _) => ((Math.atan2(M - i.pos[0], -(_ - i.pos[2])) * 180) / Math.PI + 360) % 360;
    const x = [
      {
        bearing: d(WORLD.fuji.x, WORLD.fuji.z),
        label: "▲ ФУДЗИ",
        color: "#cfe3ff",
      },
    ];
    if (h) {
      x.push({
        bearing: d(h[0], h[1]),
        label: "◆",
        color: "#ffd23f",
      });
    }
    this.compass.draw(p, x);
    const v = c.drift;
    const g = this.$("drift");
    if (v.active && v.chain > 30) {
      g.style.opacity = 1;
      this.$("driftlbl").textContent = "ДРИФТ";
      this.$("driftlbl").style.color = "";
      this.$("driftpts").textContent = Math.round(v.chain).toLocaleString("ru");
      this.$("driftmult").textContent = "×" + v.mult;
      this.$("driftmult").style.display = "";
      this.$("driftsub").textContent =
        u && u.def.type === "drift"
          ? "Всего: " + Math.round(v.total).toLocaleString("ru")
          : "Лучшая серия: " + v.sessionBest.toLocaleString("ru");
    } else if (v.failedTimer > 0) {
      g.style.opacity = 1;
      this.$("driftlbl").textContent = "СЕРИЯ СОРВАНА";
      this.$("driftlbl").style.color = "#ff6b6b";
      this.$("driftpts").textContent = "";
      this.$("driftmult").style.display = "none";
      this.$("driftsub").textContent = "";
    } else if (v.bankedTimer > 0) {
      g.style.opacity = Math.min(1, v.bankedTimer);
      this.$("driftlbl").textContent = "ОЧКИ ЗАСЧИТАНЫ";
      this.$("driftlbl").style.color = "";
      this.$("driftpts").textContent = "+" + v.lastBanked.toLocaleString("ru");
      this.$("driftmult").style.display = "none";
      this.$("driftsub").textContent = "Лучшая серия: " + v.sessionBest.toLocaleString("ru");
    } else {
      g.style.opacity = 0;
    }
    if (u) {
      const M = this.$("countdown");
      if (u.started) {
        if (u.time < 1) {
          M.textContent = "СТАРТ!";
        } else {
          M.classList.add("hidden");
        }
      } else {
        M.classList.remove("hidden");
        const z = Math.ceil(u.countdown - 0.5);
        M.textContent = z > 0 ? z : "СТАРТ!";
      }
      this.$("evtime").textContent =
        u.def.type === "drift"
          ? Math.round(v.total + (v.active ? v.chain : 0)).toLocaleString("ru")
          : formatTime(u.time);
      this.$("evcp").textContent =
        u.def.type === "circuit"
          ? `Круг ${u.lap}/${u.laps} · КТ ${Math.min(u.next + 1, u.cps.length)}/${u.cps.length}`
          : `КТ ${Math.min(u.next + 1, u.cps.length)}/${u.cps.length}`;
      const _ = c.best[u.def.id] && c.best[u.def.id].best;
      this.$("evbest").textContent =
        "Рекорд: " +
        (_ == null
          ? "—"
          : u.def.type === "drift"
            ? Math.round(_).toLocaleString("ru")
            : formatTime(_));
    }
    const b = this.$("prompt");
    if (!u && c.nearMarker) {
      b.classList.remove("hidden");
      const M = keyLabel((e.settings.bindings.interact || [])[0]);
      b.innerHTML = `<b>${c.nearMarker.def.name}</b> · ${EVENT_TYPES[c.nearMarker.def.type]}<br>Нажмите <span class="k">${M}</span> чтобы начать`;
    } else {
      b.classList.add("hidden");
    }
    const y = e.settings.bindings;
    const k = (M) => keyLabel((y[M] || [])[0]);
    const w = `${k("throttle")}/${k("brake")} газ/тормоз<b>${k("left")} ${k("right")}</b><br>ручник<b>${k("handbrake")}</b> ускорение<b>${k("boost")}</b><br>на дорогу<b>${k("respawn")}</b> камера<b>${k("camera")}</b><br>пауза<b>${k("pause")}</b> скрыть<b>${k("hud")}</b>`;
    if (this._keysHtml !== w) {
      this.$("keys").innerHTML = w;
      this._keysHtml = w;
    }
  }
}
