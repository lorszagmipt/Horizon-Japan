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
import { CameraRig } from "../camera/cameraRig.js";
import { Reflections } from "../render/reflections.js";

// Главный объект игры. Хранит мир, машину (car — физика, carView — модель), камеру, эффекты, звук, интерфейс.
export class Game {
  constructor(deps) {
    Object.assign(this, deps);
    this.layout = MAP;
    this.cam = new Camera();
    this.rig = new CameraRig(this.cam, this.world);
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
    this.water = new Reflections(this.renderer, this.world);
    this.buildParkedCars();
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
  placeAtSpawn() {
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
          this.ui.toast("Камера: " + ["Погоня", "Близко", "Капот", "Кино"][this.rig.mode]);
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
      const carInput =
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
      if (this.car.inWater > 1.2) {
        this.respawn(true);
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
      }
    }
    this.carView.update(this.carViewState());
    if (this.events && driving) {
      this.events.update(dt, this);
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
  // Рисует кадр: обновление LOD мира, тени, отражения, сцена.
  render() {
    const renderer = this.renderer;
    this.world.update(this.cam.pos, 0, this.time, this.cam);
    if (renderer.shadowSize) {
      const cam = this.cam;
      const dx = cam.target[0] - cam.pos[0];
      const dz = cam.target[2] - cam.pos[2];
      const len = Math.hypot(dx, dz) || 1;
      const cx = cam.pos[0] + (dx / len) * 45;
      const cz = cam.pos[2] + (dz / len) * 45;
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
  }
}
