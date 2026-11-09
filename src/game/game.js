// Игра: связывает мир, машину, камеру, эффекты и звук; frame() — один кадр игры.

import * as MAP from "../world/mapData.js";
import { clamp } from "../core/math.js";
import { Camera } from "../render/camera.js";
import { SPAWN } from "../world/mapData.js";
import { MeshBuilder, boxGeo, makeTransform } from "../render/mesh.js";
import { biomeAt } from "../world/biomes.js";
import { LIGHTING_PRESETS, blendAtmosphere } from "../render/sky.js";
import { CarPhysics } from "../car/physics.js";
import { CARS } from "../car/cars.js";
import { CarView } from "../car/carView.js";
import { CameraRig, CAMERA_MODES } from "../camera/cameraRig.js";
import { Reflections } from "../render/reflections.js";
import { loadSpot, saveSpot } from "./settings.js";
import { NetSession } from "../net/net.js";
import { collideCars } from "../race/bots.js";
import { TEST_GROUND, inTestValley, testGroundSpawn } from "../world/testGround.js";
import { Telemetry } from "./telemetry.js";

// Главный объект игры. Хранит мир, машину (car — физика, carView — модель), камеру, эффекты, звук, интерфейс.
export class Game {
  constructor(deps) {
    Object.assign(this, deps);
    this.layout = MAP;
    this.cam = new Camera();
    this.rig = new CameraRig(this.cam, this.world);
    // второй вид в окошке справа снизу (Настройки → Управление → «Второй вид»)
    this.cam2 = new Camera();
    this.rig2 = new CameraRig(this.cam2, this.world);
    this.time = 0;
    this.state = "menu";
    this.hudVisible = true;
    this.fpsAcc = 0;
    this.fpsN = 0;
    this.fps = 60;
    this.setLighting(this.settings.timeOfDay);
    this.spawnCar(this.settings.car);
    this.placeAtSpawn();
    this.rig.mode = this.settings.cameraMode || 0;
    this.rig.doorSide = this.settings.doorSide || 1;
    this.applyCamSettings(this.settings);
    this.water = new Reflections(this.renderer, this.world);
    this.buildParkedCars();
    this.spotTimer = 0;
    // эффекты способностей на машине игрока: spin — крутит после банана/ракеты, boost — нитро
    this.playerFx = { spin: 0, boost: 0 };
    // онлайн-игра с друзьями (src/net/net.js): пока не создана комната — выключена
    this.net = new NetSession(this);
    // полигон за картой (world/testGround.js) и замеры на нём
    this.testGround = TEST_GROUND;
    this.telemetry = new Telemetry();
    // при закрытии вкладки запоминаем, где стоит машина
    window.addEventListener("pagehide", () => this.rememberSpot());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.rememberSpot();
    });
  }
  // В комнате с друзьями?
  isOnline() {
    return !!(this.net && this.net.status === "online");
  }
  // Машина на полигоне за картой?
  onPolygon() {
    return !!this.car && inTestValley(this.car.pos[0], this.car.pos[2]);
  }
  // Поставить машину на старт полигона.
  placeAtTestGround() {
    const s = testGroundSpawn();
    this.car.place(s.x, s.z, s.yaw);
    this.rig.snap = true;
    this.rig2.snap = true;
    if (this.fx) this.fx.clearTrails();
  }
  // СОХРАНЕНИЕ МЕСТА НА КАРТЕ: только в свободной езде (не в заезде, не в гараже/меню, не на полигоне).
  rememberSpot() {
    if (this.noSave || !this.car || this.onPolygon()) return;
    const free = this.state === "drive" || this.state === "paused";
    if (!free || (this.events && this.events.active)) return;
    if (this.car.inWater > 0 || !this.car.onGround) return;
    saveSpot({
      x: +this.car.pos[0].toFixed(2),
      z: +this.car.pos[2].toFixed(2),
      yaw: +this.car.yaw.toFixed(4),
    });
  }
  buildParkedCars() {
    let { LANDMARKS: t } = this.layout;
    const e = t.festival;
    this.parked = [];
    const s = new MeshBuilder();
    s.ext = [];
    const o = (h, l, m, p) => {
      const d = s.vertexCount;
      s.append(h, l, m, "set");
      for (let x = d; x < s.vertexCount; x++) {
        s.ext[x * 4] = p;
        s.ext[x * 4 + 1] = 0;
        s.ext[x * 4 + 2] = 0;
        s.ext[x * 4 + 3] = 0;
        s.col[x * 4 + 3] = 0;
      }
    };
    let i = e.x;
    let n = e.z;
    let a = Infinity;
    for (let h = -170; h <= 170; h += 8) {
      for (let l = -170; l <= 170; l += 8) {
        const m = e.x + h;
        const p = e.z + l;
        const d = Math.hypot(h, l);
        if (d >= a || this.world.colliders.query(m, p, 22, []).length) {
          continue;
        }
        const x = this.world.roads.nearest(m, p, 60);
        if (x && x.d < x.hw + 22) {
          continue;
        }
        let v = Infinity;
        let g = -Infinity;
        for (let b = -18; b <= 18; b += 6) {
          for (let y = -6; y <= 6; y += 6) {
            const k = this.world.terrain.heightAt(m + b, p + y);
            v = Math.min(v, k);
            g = Math.max(g, k);
          }
        }
        if (!(g - v > 1)) {
          i = m;
          n = p;
          a = d;
        }
      }
    }
    const r = this.world.terrain.heightAt(i, n);
    let c = -Infinity;
    for (let h = -18; h <= 18; h += 3) {
      for (let l = -6; l <= 6; l += 3) {
        c = Math.max(c, this.world.terrain.heightAt(i + h, n + l));
      }
    }
    c += 0.15;
    o(boxGeo(36, 3, 12), makeTransform(i, c - 1.42, n), [0.3, 0.31, 0.34], 0.1);
    o(boxGeo(36.4, 0.25, 12.4), makeTransform(i, c - 0.02, n), [0.36, 0.37, 0.4], 0.15);
    for (let h = 0; h <= 5; h++) {
      o(
        boxGeo(0.14, 0.02, 5.6),
        makeTransform(i - 15.5 + h * 6.2, c + 0.09, n - 2.5),
        [0.95, 0.95, 0.92],
        0.1,
      );
    }
    o(boxGeo(36.4, 0.35, 0.5), makeTransform(i, c + 0.1, n + 6), [0.85, 0.83, 0.78], 0.1);
    this.world.colliders.addBox(i, n, 36.2, 12.2, 0, c - 3, c + 0.05);
    this.padY = c + 0.08;
    const u = s.bounds();
    this.renderer.add({
      mesh: this.renderer.createMesh(s),
      defines: ["CARMAT"],
      bounds: {
        c: u.center,
        r: u.radius,
      },
      maxDist: 600,
      reflect: false,
    });
    CARS.forEach((h, l) => {
      const m = i - 12.4 + l * 6.2;
      const p = n - 2.5;
      const d = Math.PI;
      const x = new CarView(this.renderer, h, h.colors[0], { maxDist: 420 });
      const v = this.padY;
      x.update({
        pos: [m, v, p],
        yaw: d,
        pitch: 0,
        roll: 0,
        bodyPitch: 0,
        bodyRoll: 0,
        steer: 0.25,
        wheelSpin: 0,
        braking: false,
        groundH: v,
      });
      this.world.colliders.addBox(m, p, h.body.W, h.body.L, d, v - 1, v + 2);
      this.parked.push(x);
    });
  }
  applySettings() {
    const settings = this.settings;
    const gfx = settings.graphics;
    const renderer = this.renderer;
    renderer.pixelRatio = gfx.pixelRatio * Math.min(window.devicePixelRatio || 1, 1.5);
    renderer.setShadowSize(gfx.shadows);
    this.world.quality.drawDist = gfx.drawDist;
    this.world.quality.lodScale = gfx.lodScale || 1;
    if (this.world.vegetation) {
      this.world.vegetation.setQuality(this.world.quality);
    }
    if (this.fx) {
      this.fx.setQuality(gfx.particles);
    }
    this.setLighting(settings.timeOfDay);
    this.car.settings.steerSens = settings.steerSens;
    this.car.settings.driftStrength = settings.driftStrength;
    this.rig.mode = settings.cameraMode || 0;
    this.rig.doorSide = settings.doorSide || 1;
    this.applyCamSettings(settings);
    if (this.audio) {
      this.audio.applyVolumes();
    }
  }
  setLighting(timeOfDay) {
    const preset = LIGHTING_PRESETS[timeOfDay] || LIGHTING_PRESETS.day;
    this.light = preset;
    Object.assign(this.renderer.globals, {
      u_sunDir: preset.sunDir,
      u_sunColor: preset.sunColor,
      u_skyTop: preset.skyTop,
      u_skyHorizon: preset.skyHorizon,
      u_skyAmb: preset.skyAmb,
      u_groundAmb: preset.groundAmb,
      u_fogColor: preset.fogColor,
      u_fogDensity: preset.fogDensity,
      u_fogHeight: preset.fogHeight,
    });
    if (this.air) {
      this.updateAtmosphere(0);
    }
  }
  // Настройки камер: стиль вертолёта и второй вид в окошке.
  applyCamSettings(settings) {
    for (const r of [this.rig, this.rig2]) {
      r.heliStyle = settings.heliStyle || "news";
      r.doorSide = settings.doorSide || 1;
    }
    const pip = settings.pipMode == null ? -1 : +settings.pipMode;
    if (pip !== this.rig2.mode) this.rig2.snap = true;
    this.rig2.mode = pip;
    this.pipOn = pip >= 0;
  }
  // Где на экране окошко второго вида (в CSS-пикселях): справа, над спидометром.
  pipRect() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const w = Math.round(clamp(W * 0.28, 200, 460));
    const h = Math.round((w * 9) / 16);
    const right = 20;
    const bottom = Math.min(250, Math.max(20, H - h - 140));
    return { x: W - w - right, y: H - h - bottom, w, h, bottom, right };
  }
  updateAtmosphere(dt) {
    const camPos = this.cam.pos;
    const target = biomeAt(camPos[0], camPos[2]);
    if (!this.air || dt <= 0 || dt > 0.5) {
      this.air = target;
    } else {
      const k = 1 - Math.exp(-1.6 * dt);
      for (let c = 0; c < 3; c++) {
        this.air[c] += (target[c] - this.air[c]) * k;
      }
    }
    blendAtmosphere(
      this.renderer.globals,
      this.light,
      this.air,
      this.settings.timeOfDay === "sunset" ? 0.45 : 1,
    );
  }
  carSpec(id) {
    return CARS.find((c) => c.id === id) || CARS[0];
  }
  carColor(spec) {
    const idx = this.settings.colors[spec.id] || 0;
    return spec.colors[idx % spec.colors.length];
  }
  spawnCar(id) {
    const spec = this.carSpec(id);
    const prevCar = this.car;
    if (this.carView) {
      this.carView.dispose();
    }
    this.carView = new CarView(this.renderer, spec, this.carColor(spec));
    if (this.car) {
      this.car.setSpec(spec);
    } else {
      this.car = new CarPhysics(this.world, spec);
    }
    this.car.settings.steerSens = this.settings.steerSens;
    this.car.settings.driftStrength = this.settings.driftStrength;
    if (prevCar) {
      this.carView.update(this.carViewState());
    }
  }
  // Поставить машину туда, где игрок был в прошлый раз; если такого места нет — на старт карты.
  placeAtSpawn(fresh = false) {
    const spot = fresh || this.noSave ? null : loadSpot();
    if (spot) {
      const g = this.world.groundAt(spot.x, spot.z, {});
      const inside = Math.abs(spot.x) < 5000 && Math.abs(spot.z) < 5000;
      if (inside && g && isFinite(g.h) && g.surface !== "water") {
        this.car.place(spot.x, spot.z, spot.yaw);
        this.rig.snap = true;
        return;
      }
    }
    const road = this.world.roads.byId[SPAWN.road];
    const idx = this.world.roads.indexAtDist(road, SPAWN.dist);
    const heading = Math.atan2(road.tx[idx], road.tz[idx]);
    const sideX = -Math.cos(heading);
    const sideZ = Math.sin(heading);
    this.car.place(
      road.x[idx] + sideX * road.hw * 0.45,
      road.z[idx] + sideZ * road.hw * 0.45,
      heading,
    );
    this.rig.snap = true;
  }
  carViewState() {
    const car = this.car;
    car.braking = this.controls
      ? (this.controls.brake > 0 && car.vForward > 0.5) || this.controls.handbrake
      : false;
    car.groundH = car.ground.h;
    return car;
  }
  // ОДИН КАДР ИГРЫ: ввод -> физика машины -> камера -> модель машины -> заезд -> эффекты -> звук -> интерфейс -> рендер.
  // state: "menu" | "garage" | "drive" | "paused" | "free".
  frame(dt, noRender = false) {
    dt = clamp(dt, 0, 1 / 20);
    this.time += dt;
    this.renderer.globals.u_time = this.time;
    const pressed = this.input.consumePressed();
    const controls = this.input.poll();
    this.controls = controls;
    if (this.ui) {
      this.ui.handlePressed(pressed, this);
    }
    const driving = this.state === "drive";
    if (driving) {
      if (pressed.has("camera")) {
        this.rig.cycle();
        this.settings.cameraMode = this.rig.mode;
        if (this.ui) {
          this.ui.toast("Камера: " + CAMERA_MODES[this.rig.mode]);
        }
      }
      if (pressed.has("respawn")) {
        this.respawn();
      }
      if (pressed.has("hud")) {
        this.hudVisible = !this.hudVisible;
        if (this.ui) {
          this.ui.setHudVisible(this.hudVisible);
        }
      }
      // СПОСОБНОСТИ ИГРОКА: F — из коробки, 1/2/3 — со шкалы
      const items = this.events && this.events.items;
      if (items) {
        const me = this.events.playerRacer();
        if (pressed.has("item")) items.use(me);
        if (pressed.has("item1")) items.use(me, "rocket");
        if (pressed.has("item2")) items.use(me, "nitro");
        if (pressed.has("item3")) items.use(me, "banana");
      }
      // после банана или ракеты машину несколько мгновений крутит — руль не слушается
      let spinInput = null;
      if (this.playerFx.spin > 0) {
        this.playerFx.spin -= dt;
        spinInput = { throttle: 0, brake: 0.3, steer: Math.sin(this.playerFx.spin * 14), handbrake: true, boost: false };
      }
      const carInput = spinInput ? spinInput :
        this.events && this.events.lockControls
          ? {
              throttle: 0,
              brake: 0,
              steer: 0,
              handbrake: true,
              boost: false,
            }
          : controls;
      this.car.update(dt, carInput);
      for (const ev of this.car.events) {
        this.onCarEvent(ev);
      }
      // ЗАМЕРЫ НА ПОЛИГОНЕ (game/telemetry.js); другая машина — замеры с нуля
      if (this.onPolygon()) {
        if (this.telemetry.carId !== this.settings.car) {
          this.telemetry.reset();
          this.telemetry.carId = this.settings.car;
        }
        this.telemetry.update(dt, this.car, carInput);
      }
      if (this.car.inWater > 1.2) {
        this.respawn(true);
      }
      this.spotTimer += dt;
      if (this.spotTimer > 2) {
        this.spotTimer = 0;
        this.rememberSpot();
      }
    }
    if (this.state !== "free") {
      if (this.state === "menu" || this.state === "garage") {
        if (this.ui) {
          this.ui.updateMenuCamera(dt, this);
        }
      } else {
        this.car.inMenu = false;
        this.rig.update(this.state === "paused" ? 0 : dt, this.car, {
          lookBack: controls.lookBack,
        });
        if (this.pipOn) {
          this.rig2.update(this.state === "paused" ? 0 : dt, this.car, {});
        }
      }
    }
    // рамка окошка второго вида
    const pipShow = this.pipOn && (this.state === "drive" || this.state === "paused") && this.hudVisible;
    this.updatePipFrame(pipShow);
    // плашка «ЭФИР» для камеры «Вертолёт»
    const heliOn = this.rig.mode === 3 && (this.state === "drive" || this.state === "paused");
    if (heliOn !== this.heliTagOn) {
      this.heliTagOn = heliOn;
      const tag = document.getElementById("helitag");
      if (tag) tag.classList.toggle("hidden", !heliOn);
    }
    if (heliOn) {
      const clock = document.getElementById("heliclock");
      const d = new Date();
      const txt = [d.getHours(), d.getMinutes(), d.getSeconds()].map((n) => String(n).padStart(2, "0")).join(":");
      if (clock && clock.textContent !== txt) clock.textContent = txt;
    }
    this.carView.update(this.carViewState());
    if (this.events && driving) {
      this.events.update(dt, this);
    }
    // сеть: отправить своё положение, сдвинуть машины друзей
    if (this.net) {
      this.net.update(dt);
    }
    // СТОЛКНОВЕНИЯ МАШИН: игрок, боты, друзья (толкаем только свою машину и ботов, чужие придут по сети)
    if (driving) {
      const others = this.events && this.events.active ? this.events.racers().slice(1) : this.isOnline() ? this.net.allCars() : [];
      if (others.length) {
        collideCars([this.car, ...others.map((r) => r.phys)], (car, strength) => {
          if (car === this.car) this.onCarEvent({ type: "hit", strength });
        });
      }
    }
    if (this.fx) {
      this.fx.update(dt, this);
    }
    if (this.audio) {
      this.audio.update(dt, this);
    }
    if (this.ui) {
      this.ui.update(dt, this);
    }
    if (!noRender) {
      this.updateAtmosphere(dt);
      this.render(dt);
      this.updateNameTags();
    }
    this.fpsAcc += dt;
    this.fpsN++;
    if (this.fpsAcc > 0.5) {
      this.fps = this.fpsN / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsN = 0;
    }
  }
  // Вернуть машину на дорогу с затемнением экрана.
  respawn(fromWater) {
    // на полигоне — обратно на линию старта
    if (this.onPolygon() && !(this.events && this.events.active)) {
      if (this.ui) this.ui.fade(() => this.placeAtTestGround());
      else this.placeAtTestGround();
      return;
    }
    if (this.ui) {
      this.ui.fade(
        () => {
          this.car.respawn();
          this.rig.snap = true;
          if (this.fx) {
            this.fx.clearTrails();
          }
        },
        fromWater ? "Машина в воде — возвращаемся на дорогу" : null,
      );
    } else {
      this.car.respawn();
    }
  }
  // Реакция на события физики: удар (hit), приземление (land), переключение передачи (shift).
  onCarEvent(ev) {
    if (ev.type === "hit") {
      this.rig.addShake(ev.strength * 0.8);
      if (this.audio) {
        this.audio.impact(ev.strength);
      }
      if (this.events) {
        this.events.onCrash(ev.strength);
      }
    } else if (ev.type === "land") {
      this.rig.addShake(ev.strength * 0.6);
      if (this.audio) {
        this.audio.impact(ev.strength * 0.5);
      }
    } else if (ev.type === "shift" && this.audio) {
      this.audio.shift(ev.up);
    }
  }
  // ИМЕНА НАД МАШИНАМИ СОПЕРНИКОВ: точку над крышей переводим в координаты экрана.
  updateNameTags() {
    let box = this.tagBox;
    if (!box) {
      box = this.tagBox = document.createElement("div");
      box.id = "nametags";
      document.body.appendChild(box);
      this.tagEls = [];
    }
    const racers = [];
    const show = this.settings.nameTags !== false && this.hudVisible && (this.state === "drive" || this.state === "paused");
    if (show && this.events && this.events.bots) racers.push(...this.events.bots.bots);
    if (show && this.isOnline()) racers.push(...this.net.allCars().filter((c) => !racers.includes(c)));
    const M = this.cam.viewProj;
    const W = window.innerWidth;
    const H = window.innerHeight;
    let used = 0;
    for (const r of racers) {
      const p = r.phys.pos;
      const d = Math.hypot(p[0] - this.cam.pos[0], p[1] - this.cam.pos[1], p[2] - this.cam.pos[2]);
      if (d > 140) continue;
      const x = p[0];
      const y = p[1] + 1.9;
      const z = p[2];
      const w = M[3] * x + M[7] * y + M[11] * z + M[15];
      if (w < 0.5) continue;
      const sx = ((M[0] * x + M[4] * y + M[8] * z + M[12]) / w) * 0.5 + 0.5;
      const sy = 0.5 - ((M[1] * x + M[5] * y + M[9] * z + M[13]) / w) * 0.5;
      if (sx < -0.1 || sx > 1.1 || sy < -0.1 || sy > 1.1) continue;
      let el = this.tagEls[used];
      if (!el) {
        el = this.tagEls[used] = document.createElement("div");
        el.className = "tag";
        box.appendChild(el);
      }
      const color = "#" + (r.color >>> 0).toString(16).padStart(6, "0");
      const html = `<i style="background:${color}">${r.place || ""}</i>${r.name}`;
      if (el._html !== html) {
        el.innerHTML = html;
        el._html = html;
      }
      el.style.display = "";
      el.style.left = (sx * W).toFixed(1) + "px";
      el.style.top = (sy * H).toFixed(1) + "px";
      el.style.opacity = d > 90 ? String(Math.max(0, (140 - d) / 50)) : "1";
      used++;
    }
    for (let k = used; k < this.tagEls.length; k++) this.tagEls[k].style.display = "none";
  }
  updatePipFrame(show) {
    let el = this.pipEl;
    if (!el) {
      el = this.pipEl = document.createElement("div");
      el.id = "pipframe";
      el.innerHTML = '<span class="pip-label"></span>';
      document.body.appendChild(el);
    }
    this.pipVisible = show;
    el.style.display = show ? "block" : "none";
    if (!show) return;
    const r = this.pipRect();
    const key = r.x + "," + r.y + "," + r.w + "," + this.rig2.mode;
    if (el.dataset.key !== key) {
      el.dataset.key = key;
      Object.assign(el.style, { left: r.x + "px", top: r.y + "px", width: r.w + "px", height: r.h + "px" });
      el.firstChild.textContent = CAMERA_MODES[this.rig2.mode] + (this.rig2.mode === 3 ? " · ● ЭФИР" : "");
    }
  }
  // Рисует кадр: обновление LOD мира, тени, отражения, сцена.
  render() {
    const renderer = this.renderer;
    this.world.update(this.cam.pos, 0, this.time, this.cam);
    if (renderer.shadowSize) {
      const cam = this.cam;
      const dx = cam.target[0] - cam.pos[0];
      const dz = cam.target[2] - cam.pos[2];
      const len = Math.hypot(dx, dz) || 1;
      // тени рисуются вокруг области перед камерой; у далёкой камеры (вертолёт) — вокруг машины
      const ahead = len > 60 ? len : 45;
      const cx = cam.pos[0] + (dx / len) * ahead;
      const cz = cam.pos[2] + (dz / len) * ahead;
      renderer.renderShadows(
        [cx, this.world.terrain.heightAt(cx, cz), cz],
        renderer.globals.u_sunDir,
        75,
      );
    }
    if (this.water) {
      this.water.render(this);
    }
    renderer.render(this.cam);
    // ВТОРОЙ ВИД: та же сцена ещё раз, другой камерой, в окошке справа снизу
    if (this.pipVisible) {
      const r = this.pipRect();
      const pr = renderer.pixelRatio;
      const H = renderer.canvas.height;
      this.world.update(this.cam2.pos, 0, this.time, this.cam2);
      const waters = this.world.waterItems;
      const refl = waters.map((w) => w.uniforms.u_useRefl);
      for (const w of waters) w.uniforms.u_useRefl = 0; // отражения в воде — только в основном виде
      renderer.render(this.cam2, {
        viewport: [
          Math.round(r.x * pr),
          Math.round(H - (r.y + r.h) * pr),
          Math.round(r.w * pr),
          Math.round(r.h * pr),
        ],
      });
      waters.forEach((w, i) => (w.uniforms.u_useRefl = refl[i]));
    }
  }
}
