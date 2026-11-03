// Игровая камера: режимы (погоня, близко, капот, кино), плавное следование, тряска.

import { clamp, damp, dampAngle, lerp, wrapAngle } from "../core/math.js";

// Названия режимов камеры (клавиша C).
export const CAMERA_MODES = ["Погоня", "Близко", "Капот", "Кино"];

// Игровая камера, которая следует за машиной.
export class CameraRig {
  constructor(cam, world) {
    this.cam = cam;
    this.world = world;
    this.mode = 0;
    this.yaw = 0;
    this.pos = [0, 10, 0];
    this.look = [0, 0, 0];
    this.dist = 6.5;
    this.h = 2.2;
    this.fov = 62;
    this.shake = 0;
    this.accOffset = 0;
    this.latOffset = 0;
    this.orbitYaw = 0;
    this.orbitPitch = 0;
    this.mouseIdle = 99;
    this.cine = null;
    this.cineT = 0;
    this.stillTime = 0;
    this.g = {};
    this.snap = true;
  }
  cycle() {
    this.mode = (this.mode + 1) % CAMERA_MODES.length;
    this.cine = null;
    this.snap = true;
  }
  mouseDrag(dx, dy) {
    this.orbitYaw = clamp(this.orbitYaw - dx * 0.006, -Math.PI, Math.PI);
    this.orbitPitch = clamp(this.orbitPitch + dy * 0.004, -0.25, 0.9);
    this.mouseIdle = 0;
  }
  addShake(amount) {
    this.shake = Math.min(1.2, this.shake + amount);
  }
  groundY(x, z) {
    return this.world.groundAt(x, z, this.g).h;
  }
  // Каждый кадр ставит камеру. Режимы: 0 — погоня, 1 — близко, 2 — капот, 3 — кино.
  // Камера не уходит в стены и под землю: проверяет лучом и высотой рельефа по пути к машине.
  update(dt, car, opts = {}) {
    const cam = this.cam;
    const carPos = car.pos;
    const speed = car.speed;
    const carYaw = car.yaw;
    const velYaw = Math.atan2(car.vx, car.vz);
    const vFwd = car.vForward;
    this.mouseIdle += dt;
    if (this.mouseIdle > 1.6) {
      this.orbitYaw = damp(this.orbitYaw, 0, 2.5, dt);
      this.orbitPitch = damp(this.orbitPitch, 0, 2.5, dt);
    }
    const boostFov = car.boosting ? 5 : 0;
    let fov = 58 + clamp(speed * 0.14, 0, 12) + boostFov;
    if (car.inMenu) {
      fov = 45;
    }
    if (this.mode === 0 || this.mode === 1) {
      const close = this.mode === 1;
      let targetYaw = carYaw;
      if (speed > 4 && vFwd > 0) {
        const slipYaw = wrapAngle(velYaw - carYaw);
        targetYaw = carYaw + slipYaw * 0.55;
      }
      if (opts.lookBack) {
        targetYaw += Math.PI;
      }
      targetYaw += this.orbitYaw;
      if (this.snap) {
        this.yaw = targetYaw;
      }
      this.yaw = dampAngle(this.yaw, targetYaw, close ? 7 : 5.2, dt);
      const baseDist = close ? 4.6 : 6.6;
      const baseHeight = close ? 1.55 : 2.25;
      this.accOffset = damp(this.accOffset, clamp(car.longAccel * 0.035, -0.9, 0.9), 3, dt);
      this.latOffset = damp(this.latOffset, clamp(car.latAccel * 0.03, -0.7, 0.7), 3, dt);
      const dist = baseDist + clamp(speed * 0.016, 0, 1.2) + this.accOffset;
      const height = baseHeight + clamp(speed * 0.006, 0, 0.6) + this.orbitPitch * 4;
      const sinY = Math.sin(this.yaw);
      const cosY = Math.cos(this.yaw);
      let camX = carPos[0] - sinY * dist - cosY * this.latOffset * 0.45;
      let camZ = carPos[2] - cosY * dist + sinY * this.latOffset * 0.45;
      let camY = carPos[1] + height;
      const hitFrac = this.world.colliders.raycast(
        carPos[0],
        carPos[2],
        camX,
        camZ,
        carPos[1] + 1.5,
      );
      if (hitFrac < 1) {
        const keep = Math.max(0.25, hitFrac - 0.08);
        camX = carPos[0] + (camX - carPos[0]) * keep;
        camZ = carPos[2] + (camZ - carPos[2]) * keep;
      }
      for (let step = 1; step <= 6; step++) {
        const k = step / 6;
        const sx = lerp(carPos[0], camX, k);
        const sz = lerp(carPos[2], camZ, k);
        const groundH = this.groundY(sx, sz) + 0.6;
        const lineH = lerp(carPos[1] + 1.2, camY, k);
        if (groundH > lineH) {
          const cut = Math.max(0.35, (step - 1) / 6);
          camX = lerp(carPos[0], camX, cut);
          camZ = lerp(carPos[2], camZ, cut);
          camY = lerp(carPos[1] + 1.2, camY, cut);
          break;
        }
      }
      let minY = this.groundY(camX, camZ) + 0.9;
      for (let step2 = 1; step2 <= 4; step2++) {
        const k2 = step2 / 5;
        const sx2 = lerp(carPos[0], camX, k2);
        const sz2 = lerp(carPos[2], camZ, k2);
        const groundH2 = this.groundY(sx2, sz2) + 0.5;
        const lineH2 = lerp(carPos[1] + 1.2, camY, k2);
        if (groundH2 > lineH2) {
          minY = Math.max(minY, carPos[1] + 1.2 + (groundH2 - carPos[1] - 1.2) / k2);
        }
      }
      camY = Math.max(camY, minY);
      if (car.ground && car.ground.tunnel) {
        camY = Math.min(camY, carPos[1] + 5.2);
      }
      const lookAhead = clamp(2.5 + speed * 0.1, 2.5, 9);
      const lookX = carPos[0] + Math.sin(carYaw) * lookAhead * (opts.lookBack ? -1 : 1);
      const lookZ = carPos[2] + Math.cos(carYaw) * lookAhead * (opts.lookBack ? -1 : 1);
      if (this.snap) {
        this.pos = [camX, camY, camZ];
        this.look = [lookX, carPos[1] + 1.1, lookZ];
      }
      const follow = 12 + clamp(speed * 0.15, 0, 10);
      this.pos[0] = damp(this.pos[0], camX, follow, dt);
      this.pos[1] = damp(this.pos[1], camY, 9, dt);
      this.pos[2] = damp(this.pos[2], camZ, follow, dt);
      this.pos[1] = Math.max(this.pos[1], this.groundY(this.pos[0], this.pos[2]) + 0.6);
      this.look[0] = damp(this.look[0], lookX, 12, dt);
      this.look[1] = damp(this.look[1], carPos[1] + (close ? 1 : 1.15), 10, dt);
      this.look[2] = damp(this.look[2], lookZ, 12, dt);
      cam.pos = this.pos.slice();
      cam.target = this.look.slice();
    } else if (this.mode === 2) {
      const view = car.viewMatrix;
      const sinY2 = Math.sin(carYaw);
      const cosY2 = Math.cos(carYaw);
      const pitch = car.pitch - car.bodyPitch;
      const fwdOff = car.spec.body.cabin.z0 + 0.45;
      const upOff = car.spec.body.H - 0.05;
      const eyeX = carPos[0] + sinY2 * fwdOff;
      const eyeZ = carPos[2] + cosY2 * fwdOff;
      const eyeY = carPos[1] + upOff + Math.sin(pitch) * fwdOff;
      cam.pos = [eyeX, eyeY, eyeZ];
      const dir = opts.lookBack ? -1 : 1;
      cam.target = [
        eyeX + sinY2 * 20 * dir,
        eyeY + Math.sin(pitch) * 20 - 1.1,
        eyeZ + cosY2 * 20 * dir,
      ];
      fov = 68 + clamp(speed * 0.12, 0, 9) + boostFov;
      this.pos = cam.pos.slice();
      this.look = cam.target.slice();
      this.yaw = carYaw;
    } else {
      if (speed < 3) {
        this.stillTime += dt;
      } else {
        this.stillTime = 0;
      }
      if (this.stillTime > 0.5) {
        this.orbitYaw += dt * 0.12;
        const orbitYaw = carYaw + 2.3 + this.orbitYaw;
        const orbitR = 9.5;
        const ox = carPos[0] + Math.sin(orbitYaw) * orbitR;
        const oz = carPos[2] + Math.cos(orbitYaw) * orbitR;
        const oy = Math.max(carPos[1] + 2, this.groundY(ox, oz) + 1.2);
        this.pos = [
          damp(this.pos[0], ox, 3, dt),
          damp(this.pos[1], oy, 3, dt),
          damp(this.pos[2], oz, 3, dt),
        ];
        this.look = [carPos[0], carPos[1] + 0.9, carPos[2]];
        fov = 48;
        this.cine = null;
      } else {
        this.cineT += dt;
        if (
          !this.cine ||
          this.cineT > 6 ||
          Math.hypot(this.cine[0] - carPos[0], this.cine[2] - carPos[2]) > 75 ||
          (this.cine[0] - carPos[0]) * car.vx + (this.cine[2] - carPos[2]) * car.vz < -400
        ) {
          const ahead = clamp(speed * 2.2, 15, 60);
          const sideSign = Math.random() < 0.5 ? -1 : 1;
          const dirX = car.vx / (speed || 1);
          const dirZ = car.vz / (speed || 1);
          const sideOff = 6 + Math.random() * 10;
          const spotX = carPos[0] + dirX * ahead - dirZ * sideOff * sideSign;
          const spotZ = carPos[2] + dirZ * ahead + dirX * sideOff * sideSign;
          this.cine = [spotX, this.groundY(spotX, spotZ) + 1 + Math.random() * 4, spotZ];
          this.cineT = 0;
        }
        this.pos = this.cine.slice();
        this.look = [
          damp(this.look[0], carPos[0], 8, dt),
          damp(this.look[1], carPos[1] + 0.8, 8, dt),
          damp(this.look[2], carPos[2], 8, dt),
        ];
        const distToCar = Math.hypot(this.pos[0] - carPos[0], this.pos[2] - carPos[2]);
        fov = clamp((2 * Math.atan(7 / Math.max(distToCar, 1)) * 180) / Math.PI, 18, 65);
      }
      cam.pos = this.pos.slice();
      cam.target = this.look.slice();
    }
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const roughness = car.surface === "grass" || car.surface === "gravel" ? 0.04 : 0;
    const shakeAmp =
      (this.shake * 0.12 +
        roughness * clamp(speed / 30, 0, 1) +
        clamp((speed - 50) / 40, 0, 1) * 0.012) *
      (this.mode === 3 ? 0.3 : 1);
    if (shakeAmp > 0) {
      const tm = performance.now() / 1000;
      cam.pos[0] += Math.sin(tm * 37) * shakeAmp;
      cam.pos[1] += Math.sin(tm * 43 + 1) * shakeAmp;
      cam.pos[2] += Math.cos(tm * 31) * shakeAmp;
    }
    this.fov = this.snap ? fov : damp(this.fov, fov, 3, dt);
    cam.fov = this.fov;
    this.snap = false;
  }
}
