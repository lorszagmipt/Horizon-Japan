// Игровая камера: режимы (погоня, близко, капот, вертолёт, у двери), плавное следование, тряска.

import { clamp, damp, dampAngle, lerp, wrapAngle } from "../core/math.js";
import { makeTransform } from "../render/mesh.js";

// Названия режимов камеры (клавиша C).
export const CAMERA_MODES = ["Погоня", "Близко", "Капот", "Вертолёт", "У двери"];

// НАСТРОЙКИ КАМЕРЫ «ВЕРТОЛЁТ» — меняй числа, игра перезагрузится сама.
export const HELI = {
  height: 95, // высота над машиной, м
  radius: 120, // расстояние от машины по земле, м
  angle: 2.2, // с какой стороны висит (радианы от направления машины; 0 — спереди, 3.14 — сзади)
  orbitSpeed: 0.035, // скорость облёта вокруг машины, рад/с (0 — не облетать)
  lead: 1.2, // насколько вертолёт летит на опережение, с
  maxSpeed: 65, // максимальная скорость вертолёта, м/с (быструю машину он догоняет не сразу)
  minClear: 45, // не ниже этого над землёй, м
  follow: 2.2, // как быстро оператор доводит машину в центр кадра (меньше — сильнее запаздывает)
  wobble: 0.0016, // «плавание» камеры в руках (доля расстояния)
  frame: 22, // сколько метров видно в кадре на месте
  frameSpeed: 0.35, // на сколько шире кадр на каждый м/с скорости
  zoomSpeed: 0.7, // как быстро оператор крутит зум
  pull: 0.6, // как сильно вертолёт тянется к своему месту
  accel: 12, // максимальное ускорение вертолёта, м/с²
  hideTime: 0.6, // через сколько секунд «не видно машину» вертолёт перелетает, с
};

// Стиль «По курсу»: вертолёт позади-сверху, смотрит туда, куда едет машина.
export const HELI_COURSE = {
  height: 48, // высота над машиной, м
  radius: 45, // насколько позади машины (по земле), м
  radiusSpeed: 0.5, // на сколько дальше за каждый м/с скорости
  angle: 0.35, // чуть сбоку от линии движения, рад (0 — строго сзади)
  turn: 1.1, // как быстро разворачивается за машиной (меньше — плавнее)
  lead: 1.0, // опережение, с
  maxSpeed: 95, // м/с
  minClear: 30, // не ниже этого над землёй, м
  ahead: 10, // на сколько метров впереди машины точка прицела
  aheadSpeed: 0.7, // + столько метров на каждый м/с
  aheadMax: 45, // но не дальше
  follow: 3, // как быстро оператор доводит прицел
  wobble: 0.0012,
  frame: 24, // ширина кадра на месте, м
  frameSpeed: 0.25,
  zoomSpeed: 1.2,
  pull: 1.2,
  accel: 30,
  hideTime: 0.45,
};

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
    // камера «У двери»: 1 — справа, -1 — слева (меняется в настройках)
    this.doorSide = 1;
    // стиль вертолёта: "news" — новости, "course" — по курсу
    this.heliStyle = "news";
  }
  cycle() {
    this.mode = (this.mode + 1) % CAMERA_MODES.length;
    this.cine = null;
    this.heli = null;
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
  // Каждый кадр ставит камеру. Режимы: 0 — погоня, 1 — близко, 2 — капот, 3 — вертолёт, 4 — у двери.
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
    } else if (this.mode === 4) {
      // --- У ДВЕРИ: камера закреплена снаружи у передней двери (как экшн-камера на присоске),
      // смотрит строго вперёд вдоль машины; в кадре видно, как поворачивается переднее колесо.
      // Положение задаётся в координатах машины: x — вбок, y — вверх от земли, z — вперёд.
      const b = car.spec.body;
      const M = makeTransform(
        carPos[0],
        carPos[1],
        carPos[2],
        carYaw,
        1,
        1,
        1,
        -(car.pitch - car.bodyPitch),
        -(car.roll + car.bodyRoll),
      );
      const toWorld = (x, y, z, w) => [
        M[0] * x + M[4] * y + M[8] * z + M[12] * w,
        M[1] * x + M[5] * y + M[9] * z + M[13] * w,
        M[2] * x + M[6] * y + M[10] * z + M[14] * w,
      ];
      const side = -this.doorSide; // в координатах машины +x — левый борт
      const DOOR_OUT = 0.32; // насколько камера вынесена наружу от борта, м
      const DOOR_H = 0.58; // высота камеры (доля высоты кузова)
      const DOOR_Z = -0.1; // положение вдоль машины, м (0 — середина, плюс — к капоту)
      const eye = toWorld(side * (b.W / 2 + DOOR_OUT), b.H * DOOR_H, DOOR_Z, 1);
      const dir = opts.lookBack ? -1 : 1;
      const fwd = toWorld(0, -0.06, dir, 0); // чуть вниз, чтобы колесо было в кадре
      cam.pos = eye;
      cam.target = [eye[0] + fwd[0] * 20, eye[1] + fwd[1] * 20, eye[2] + fwd[2] * 20];
      fov = 74 + clamp(speed * 0.1, 0, 8) + boostFov;
      this.pos = cam.pos.slice();
      this.look = cam.target.slice();
      this.yaw = carYaw;
    } else {
      // --- ВЕРТОЛЁТ. Два стиля (Настройки → Управление):
      //  «Новости» — висит высоко сбоку и медленно облетает машину, длинный объектив;
      //  «По курсу» — держится позади-сверху и смотрит туда, куда едет машина, чтобы видеть дорогу.
      // Если машину закрыли деревья, дома или холм — вертолёт перелетает туда, откуда её видно.
      const course = this.heliStyle === "course";
      const H = course ? HELI_COURSE : HELI;
      const hs = this.heli || (this.heli = { pos: null, look: null, ang: 0, fov: 20, t: 0 });
      hs.t += dt;
      hs.ang += dt * (course ? 0 : H.orbitSpeed);
      const vx = car.vx || 0;
      const vz = car.vz || 0;
      // куда едет машина (сглажено, чтобы вертолёт не дёргался на каждом повороте руля)
      const travel = speed > 3 && vFwd > 0 ? velYaw : carYaw;
      if (hs.dir == null || this.snap) hs.dir = travel;
      hs.dir = dampAngle(hs.dir, travel, course ? H.turn : 1, dt);
      const fwdX = Math.sin(hs.dir);
      const fwdZ = Math.cos(hs.dir);
      // точка, на которую смотрит оператор: в «По курсу» — впереди машины
      const ahead = course ? clamp(H.ahead + speed * H.aheadSpeed, 0, H.aheadMax) : 0;
      const aimX = carPos[0] + vx * 0.25 + fwdX * ahead;
      const aimZ = carPos[2] + vz * 0.25 + fwdZ * ahead;
      // где вертолёт хочет висеть при данном уходе в сторону (avoid, рад) и подъёме (lift, м)
      const want = (avoid, lift) => {
        const ang = (course ? hs.dir + Math.PI + H.angle : carYaw + H.angle + hs.ang) + avoid;
        const r = H.radius + (course ? speed * H.radiusSpeed : 0);
        const x = carPos[0] + vx * H.lead + Math.sin(ang) * r;
        const z = carPos[2] + vz * H.lead + Math.cos(ang) * r;
        const y = Math.max(carPos[1] + H.height + lift, this.groundY(x, z) + H.minClear + lift);
        return [x, y, z];
      };
      if (hs.avoid == null || this.snap) {
        hs.avoid = 0;
        hs.avoidTo = 0;
        hs.lift = 0;
        hs.liftTo = 0;
        hs.blocked = 0;
        hs.clear = 0;
        hs.check = 0;
      }
      // ПРОВЕРКА ВИДИМОСТИ: несколько раз в секунду смотрим, не закрыта ли машина
      hs.check -= dt;
      if (hs.pos && hs.check <= 0) {
        hs.check = 0.15;
        const carPt = [carPos[0], carPos[1] + 0.8, carPos[2]];
        if (this.world.lineOfSight(hs.pos, carPt)) {
          hs.blocked = 0;
          hs.clear += 0.15;
          // «По курсу»: когда машину долго видно — пробуем вернуться на место позади неё
          if (course && hs.clear > 2 && (hs.avoidTo !== 0 || hs.liftTo !== 0)) {
            if (this.world.lineOfSight(want(0, 0), carPt)) {
              hs.avoidTo = 0;
              hs.liftTo = 0;
            }
            hs.clear = 0;
          }
        } else {
          hs.clear = 0;
          hs.blocked += 0.15;
          if (hs.blocked >= H.hideTime) {
            // ищем ближайшее место на круге, откуда машину видно; если нет — поднимаемся выше
            let found = false;
            for (const lift of [0, 35, 70]) {
              for (const d of [0, 0.45, -0.45, 0.9, -0.9, 1.4, -1.4, 2, -2, 2.7, -2.7, Math.PI]) {
                if (lift === 0 && d === 0) continue;
                if (this.world.lineOfSight(want(hs.avoidTo + d, lift), carPt)) {
                  hs.avoidTo += d;
                  hs.liftTo = lift;
                  found = true;
                  break;
                }
              }
              if (found) break;
            }
            hs.blocked = 0;
          }
        }
      }
      hs.avoid = damp(hs.avoid, hs.avoidTo, 0.9, dt);
      hs.lift = damp(hs.lift, hs.liftTo, 0.9, dt);
      const [wantX, wantY, wantZ] = want(hs.avoid, hs.lift);
      const far = hs.pos && Math.hypot(hs.pos[0] - carPos[0], hs.pos[2] - carPos[2]) > H.radius * 4;
      if (!hs.pos || this.snap || far) {
        hs.pos = [wantX, wantY, wantZ];
        hs.look = [aimX, carPos[1], aimZ];
        hs.vel = [0, 0, 0];
      } else {
        // вертолёт тяжёлый: разгоняется плавно и не быстрее maxSpeed — на большой скорости отстаёт
        const wantP = [wantX, wantY, wantZ];
        for (let k = 0; k < 3; k++) {
          const accel = clamp((wantP[k] - hs.pos[k]) * H.pull - hs.vel[k] * 1.2, -H.accel, H.accel);
          hs.vel[k] += accel * dt;
        }
        const sp = Math.hypot(hs.vel[0], hs.vel[1], hs.vel[2]);
        if (sp > H.maxSpeed) for (let k = 0; k < 3; k++) hs.vel[k] *= H.maxSpeed / sp;
        for (let k = 0; k < 3; k++) hs.pos[k] += hs.vel[k] * dt;
        hs.pos[1] = Math.max(hs.pos[1], this.groundY(hs.pos[0], hs.pos[2]) + H.minClear * 0.7);
      }
      // оператор ведёт машину с небольшим опозданием
      hs.look = [
        damp(hs.look[0], aimX, H.follow, dt),
        damp(hs.look[1], carPos[1] + 0.5, H.follow, dt),
        damp(hs.look[2], aimZ, H.follow, dt),
      ];
      const dist = Math.hypot(hs.pos[0] - hs.look[0], hs.pos[1] - hs.look[1], hs.pos[2] - hs.look[2]);
      // «плавание» камеры в руках оператора: медленные несинхронные колебания точки прицела
      const t = hs.t;
      const wob = dist * H.wobble;
      const jx = (Math.sin(t * 0.73) + Math.sin(t * 1.91 + 1.3) * 0.5 + Math.sin(t * 4.3 + 0.4) * 0.15) * wob;
      const jy = (Math.sin(t * 0.61 + 2.1) + Math.sin(t * 2.37) * 0.5 + Math.sin(t * 5.1 + 1.7) * 0.15) * wob;
      const jz = (Math.sin(t * 0.83 + 4.2) + Math.sin(t * 1.57 + 0.7) * 0.5) * wob;
      // зум: в кадре примерно frame метров (в «По курсу» — с запасом, чтобы машина и дорога впереди влезли)
      const frame = H.frame + clamp(speed, 0, 60) * H.frameSpeed + ahead * (course ? 1.6 : 0);
      const wantFov = clamp((2 * Math.atan(frame / 2 / Math.max(dist, 1)) * 180) / Math.PI, 3, 60);
      hs.fov = this.snap ? wantFov : damp(hs.fov, wantFov, H.zoomSpeed, dt);
      cam.pos = hs.pos.slice();
      cam.target = [hs.look[0] + jx, hs.look[1] + jy, hs.look[2] + jz];
      this.pos = cam.pos.slice();
      this.look = hs.look.slice();
      this.yaw = Math.atan2(hs.look[0] - hs.pos[0], hs.look[2] - hs.pos[2]);
      fov = hs.fov;
      this.fov = fov; // зум ведёт сам вертолёт, общее сглаживание не нужно
    }
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const roughness = car.surface === "grass" || car.surface === "gravel" ? 0.04 : 0;
    const shakeAmp =
      (this.shake * 0.12 +
        roughness * clamp(speed / 30, 0, 1) +
        clamp((speed - 50) / 40, 0, 1) * 0.012) *
      (this.mode === 3 ? 0 : this.mode === 4 ? 0.5 : 1);
    // тряска идёт по игровому времени: на паузе (dt = 0) камера замирает, а не дрожит на месте
    this.shakeTime = (this.shakeTime || 0) + dt;
    if (shakeAmp > 0) {
      const tm = this.shakeTime;
      cam.pos[0] += Math.sin(tm * 37) * shakeAmp;
      cam.pos[1] += Math.sin(tm * 43 + 1) * shakeAmp;
      cam.pos[2] += Math.cos(tm * 31) * shakeAmp;
    }
    this.fov = this.snap ? fov : damp(this.fov, fov, 3, dt);
    cam.fov = this.fov;
    this.snap = false;
  }
}
