// ФИЗИКА МАШИНЫ: разгон, торможение, руль, сцепление, дрифт, прыжки, удары, коробка передач.
// Вызывается 120 раз в секунду (шаг PHYSICS_STEP).

import { clamp, lerp, smoothstep, wrapAngle } from "../core/math.js";
import { inTestValley } from "../world/testGround.js";

// Ускорение свободного падения, м/с².
const GRAVITY = 9.81;

// Шаг физики: 1/120 секунды. Кадр игры (1/60 с) делится на такие шаги,
// чтобы физика вела себя одинаково при любом FPS.
const PHYSICS_STEP = 1 / 120;

// Физическая модель машины.
// Состояние: pos (x, y, z), yaw (поворот), vx/vz (скорость по земле), vy (вертикальная скорость),
// onGround (стоит ли на земле), drifting (в дрифте ли), gear/rpm (передача и обороты).
// Параметры машины берутся из cars.js -> phys (здесь доступны как this.P).
// Оси: X — восток, Z — север (вперёд при yaw = 0), Y — вверх.
export class CarPhysics {
  constructor(world, spec) {
    this.world = world;
    this.setSpec(spec);
    this.pos = [0, 0, 0];
    this.yaw = 0;
    this.vx = 0;
    this.vz = 0;
    this.vy = 0;
    this.yawRate = 0;
    this.steer = 0;
    this.steerInput = 0;
    this.onGround = true;
    this.airTime = 0;
    this.pitch = 0;
    this.roll = 0;
    this.bodyPitch = 0;
    this.bodyRoll = 0;
    this.bodyPitchV = 0;
    this.bodyRollV = 0;
    this.wheelSpin = 0;
    this.gear = 1;
    this.rpm = 900;
    this.shiftTimer = 0;
    this.drifting = false;
    this.driftTimer = 0;
    this.slip = 0;
    this.boost = 1;
    this.boosting = false;
    this.nitro = 0; // способность «Нитро»: сколько секунд ещё действует сильное ускорение
    this.surface = "road";
    this.ground = {
      h: 0,
      surface: "road",
      bridge: false,
      tunnel: false,
      road: null,
    };
    this.acc = 0;
    this.events = [];
    this.inWater = 0;
    this.contacts = [];
    this.lastVelAngle = 0;
    this.longAccel = 0;
    this.latAccel = 0;
    this.settings = {
      steerSens: 1,
      driftStrength: 1,
      assist: true,
    };
    this.slipLong = 0;
  }
  // Подставить другую машину (характеристики и размеры).
  setSpec(spec) {
    this.spec = spec;
    this.P = spec.phys;
    this.wb = spec.body.wb;
    this.halfW = spec.body.W / 2;
    this.halfL = spec.body.L / 2;
  }
  // Скорость по земле, м/с (умножь на 3.6, чтобы получить км/ч).
  get speed() {
    return Math.hypot(this.vx, this.vz);
  }
  // Единичный вектор «вперёд» по земле: [x, z].
  get forward() {
    return [Math.sin(this.yaw), Math.cos(this.yaw)];
  }
  // Скорость вдоль направления машины (отрицательная — едем назад).
  get vForward() {
    return this.vx * Math.sin(this.yaw) + this.vz * Math.cos(this.yaw);
  }
  // Поставить машину в точку (x, z) с поворотом yaw и обнулить скорость.
  place(x, z, yaw) {
    const ground = this.world.groundAt(x, z, this.ground);
    this.pos = [x, ground.h + 0.02, z];
    this.yaw = yaw;
    this.vx = this.vz = this.vy = 0;
    this.yawRate = 0;
    this.steer = 0;
    this.drifting = false;
    this.onGround = true;
    this.inWater = 0;
    this.gear = 1;
    this.nitro = 0;
    this.bodyPitch = this.bodyRoll = this.bodyPitchV = this.bodyRollV = 0;
    this.updateTilt(1);
  }
  // Вернуть машину на ближайшую дорогу (кнопка R).
  respawn() {
    const roads = this.world.roads;
    let best = null;
    for (let radius = 40; radius <= 2000 && !best; radius *= 2) {
      let bestD2 = Infinity;
      for (const rd of roads.roads) {
        for (let j = 0; j < rd.n; j += 2) {
          const d2 = (rd.x[j] - this.pos[0]) ** 2 + (rd.z[j] - this.pos[2]) ** 2;
          if (d2 < bestD2 && d2 < radius * radius && !(rd.flags[j] & 1)) {
            bestD2 = d2;
            best = {
              road: rd,
              i: j,
            };
          }
        }
      }
    }
    if (!best) {
      return;
    }
    let { road: road, i: idx } = best;
    let heading = Math.atan2(road.tx[idx], road.tz[idx]);
    if (Math.abs(wrapAngle(heading - this.yaw)) > Math.PI / 2) {
      heading = wrapAngle(heading + Math.PI);
    }
    const sideX = -Math.cos(heading);
    const sideZ = Math.sin(heading);
    const offset = road.hw * 0.45;
    this.place(road.x[idx] + sideX * offset, road.z[idx] + sideZ * offset, heading);
  }
  // Наклон машины по рельефу: высота земли под передней/задней осью и под бортами.
  updateTilt(k) {
    const fwd = this.forward;
    const side = [-fwd[1], fwd[0]];
    const x = this.pos[0];
    const z = this.pos[2];
    const halfBase = this.wb / 2;
    const halfTrack = this.halfW * 0.85;
    const ground = this.ground;
    const hFront = this.world.groundAt(x + fwd[0] * halfBase, z + fwd[1] * halfBase, ground).h;
    const hRear = this.world.groundAt(x - fwd[0] * halfBase, z - fwd[1] * halfBase, ground).h;
    const hSideA = this.world.groundAt(x + side[0] * halfTrack, z + side[1] * halfTrack, ground).h;
    const hSideB = this.world.groundAt(x - side[0] * halfTrack, z - side[1] * halfTrack, ground).h;
    const pitchTarget = Math.atan2(hFront - hRear, halfBase * 2);
    const rollTarget = Math.atan2(hSideA - hSideB, halfTrack * 2);
    this.pitch = lerp(this.pitch, clamp(pitchTarget, -0.6, 0.6), k);
    this.roll = lerp(this.roll, clamp(rollTarget, -0.5, 0.5), k);
    this.slopeF = Math.sin(pitchTarget);
  }
  // Главный вызов каждый кадр: делит время кадра dt на шаги по PHYSICS_STEP и для каждого вызывает step().
  // controls — { throttle, brake, steer, handbrake, boost } из input.js.
  update(dt, controls) {
    this.events.length = 0;
    let remaining = dt;
    while (remaining > 0.000001) {
      const h = Math.min(PHYSICS_STEP, remaining);
      this.step(h, controls);
      remaining -= h;
    }
  }
  // Один шаг физики длиной dt секунд. Ниже по блокам: руль, тяга и тормоза, дрифт, поворот,
  // боковое сцепление, удары, высота и прыжки, вода, раскачка кузова, коробка передач.
  step(dt, input) {
    const phys = this.P;
    const cfg = this.settings;
    const yaw = this.yaw;
    const sinYaw = Math.sin(yaw);
    const cosYaw = Math.cos(yaw);
    const latX = -cosYaw;
    const latZ = sinYaw;
    // Скорость раскладываем на «вдоль машины» (vLong) и «вбок» (vLat).
    let vLong = this.vx * sinYaw + this.vz * cosYaw;
    const vLat = this.vx * latX + this.vz * latZ;
    const speed = Math.hypot(vLong, vLat);
    const ground = this.world.groundAt(this.pos[0], this.pos[2], this.ground);
    this.surface = ground.surface;
    // --- ПОКРЫТИЕ: сцепление (surfaceGrip) и сопротивление качению (surfaceDrag) ---
    let surfaceGrip =
      {
        road: 1,
        shoulder: 0.94,
        gravel: 0.8,
        grass: 0.76,
      }[ground.surface] || 1;
    if (phys.offroad && ground.surface !== "road") {
      surfaceGrip = lerp(surfaceGrip, 1, 0.45);
    }
    const surfaceDrag =
      ground.surface === "grass"
        ? phys.offroad
          ? 0.03
          : 0.045
        : ground.surface === "gravel"
          ? 0.025
          : 0;
    const onGround = this.onGround;
    // --- РУЛЬ: плавный поворот руля; на скорости максимальный угол меньше ---
    const steerIn = clamp(input.steer, -1, 1);
    const steerRate =
      Math.abs(steerIn) > Math.abs(this.steerInput) && steerIn * this.steerInput >= 0
        ? lerp(11, 6.5, smoothstep(12, 55, speed))
        : 15;
    this.steerInput = lerp(this.steerInput, steerIn, 1 - Math.exp(-steerRate * dt));
    const steerMax = lerp(0.62, 0.2, smoothstep(0, 55, speed)) * phys.steer * cfg.steerSens;
    const steerTarget = this.steerInput * steerMax;
    this.steer = lerp(this.steer, steerTarget, 1 - Math.exp(-16 * dt));
    // --- УСКОРЕНИЕ (Shift): тратит шкалу boost, в дрифте шкала копится быстрее ---
    // способность «Нитро» (items.js): сильнее обычного ускорения и не тратит шкалу
    const nitroOn = this.nitro > 0;
    if (nitroOn) {
      this.nitro = Math.max(0, this.nitro - dt);
    }
    this.boosting = input.boost && this.boost > 0.02 && input.throttle > 0.1;
    if (nitroOn) {
      // шкала не тратится и не копится; пламя из выхлопа и эффект скорости — как при ускорении
      this.boosting = true;
    } else if (this.boosting) {
      this.boost = Math.max(0, this.boost - dt * 0.22);
    } else {
      this.boost = Math.min(1, this.boost + dt * (0.035 + (this.drifting ? 0.06 : 0)));
    }
    // --- ТЯГА И ТОРМОЗА: accel — продольное ускорение, м/с² ---
    const topSpeed = phys.vmax * (nitroOn ? 1.25 : this.boosting ? 1.12 : 1);
    let accel = 0;
    const throttle = input.throttle;
    const brake = input.brake;
    if (this.shiftTimer > 0) {
      this.shiftTimer -= dt;
    }
    const shiftFactor = this.shiftTimer > 0 ? 0.55 : 1;
    // с нитро машина тянет, даже если газ не нажат
    const throttleN = nitroOn ? Math.max(throttle, 1) : throttle;
    if (throttleN > 0 && vLong > -1) {
      const powerCurve = 1 - Math.pow(clamp(vLong / topSpeed, 0, 1.05), 2.4);
      accel +=
        phys.power *
        throttleN *
        Math.max(powerCurve, -0.3) *
        shiftFactor *
        (nitroOn ? 1.9 : this.boosting ? 1.45 : 1) *
        (onGround ? 1 : 0);
    }
    if (brake > 0) {
      if (vLong > 0.8) {
        accel -= phys.brake * brake;
        this.revTimer = 0;
      } else if (throttle < 0.1) {
        this.revTimer = (this.revTimer || 0) + dt;
        if (this.revTimer > 0.35 || vLong < -0.5) {
          accel -= 7.5 * brake * (vLong > -13 ? 1 : 0);
        } else if (vLong > 0) {
          accel -= phys.brake * brake;
        }
      }
    } else {
      this.revTimer = 0;
    }
    if (throttle > 0 && vLong < -0.8) {
      accel += phys.brake * throttle;
    }
    if (input.handbrake && onGround) {
      accel -= Math.sign(vLong) * 5.5;
    }
    // сопротивление воздуха (растёт как квадрат скорости) и качению
    accel -= 0.0009 * vLong * Math.abs(vLong);
    accel -= (0.12 + surfaceDrag * Math.abs(vLong)) * Math.sign(vLong);
    if (throttle === 0 && brake === 0 && !input.handbrake) {
      accel -= 0.6 * Math.sign(vLong);
    }
    if (onGround) {
      // в гору машина замедляется, под гору — разгоняется
      accel -= GRAVITY * (this.slopeF || 0) * 0.85;
    }
    let vLongNew = vLong + accel * dt;
    if (Math.sign(vLongNew) !== Math.sign(vLong) && Math.abs(vLong) > 0.01 && throttle === 0) {
      vLongNew = 0;
    }
    if (
      throttle === 0 &&
      brake === 0 &&
      Math.abs(vLongNew) < 0.15 &&
      Math.abs(this.slopeF || 0) < 0.06
    ) {
      vLongNew = 0;
    }
    this.longAccel = (vLongNew - vLong) / dt;
    vLong = vLongNew;
    // --- ДРИФТ: угол заноса slipAngle; вход в дрифт — ручник или сильный занос на газу ---
    const slipAngle = Math.atan2(vLat, Math.abs(vLong) + 0.5);
    this.slip = slipAngle;
    const driftSkill = phys.drift * cfg.driftStrength;
    if (onGround) {
      if (this.drifting) {
        this.driftTimer += dt;
        if (
          (Math.abs(slipAngle) < 0.09 && !input.handbrake && this.driftTimer > 0.35) ||
          speed < 6
        ) {
          this.drifting = false;
        }
      } else {
        const driftEntrySlide = 2.6 + (1 - driftSkill) * 3.5;
        if (
          (input.handbrake && speed > 9) ||
          (Math.abs(vLat) > driftEntrySlide && speed > 12 && throttle > 0.5)
        ) {
          this.drifting = true;
          this.driftTimer = 0;
          if (input.handbrake) {
            this.yawRate +=
              -Math.sign(steerIn || -vLat || 1) * (0.9 + driftSkill * 0.6) * (steerIn ? 1 : 0.3);
          }
        }
      }
    } else if (this.airTime > 0.5) {
      this.drifting = false;
    }
    this.vx = vLong * sinYaw + vLat * latX;
    this.vz = vLong * cosYaw + vLat * latZ;
    // --- ПОВОРОТ: скорость вращения машины yawRate ---
    const velAngle = Math.atan2(this.vx, this.vz);
    let velTurnRate = wrapAngle(velAngle - this.lastVelAngle) / dt;
    if (speed < 2) {
      velTurnRate = 0;
    }
    this.lastVelAngle = velAngle;
    let yawTarget;
    if (this.drifting) {
      const driftAngle = 0.55 + 0.35 * driftSkill;
      const targetSlip = -this.steerInput * driftAngle * (0.55 + 0.45 * throttle);
      yawTarget = clamp(velTurnRate, -2.5, 2.5) - 3.2 * (slipAngle - targetSlip);
      this.yawRate = lerp(this.yawRate, yawTarget, 1 - Math.exp(-6 * dt));
    } else {
      const maxLatAccel =
        GRAVITY *
        1.9 *
        phys.grip *
        surfaceGrip *
        lerp(1, 0.88, smoothstep(30, 70, speed)) *
        lerp(1, cfg.steerSens, 0.6);
      const kinematicYawRate = (Math.abs(vLong) * Math.tan(Math.abs(steerMax))) / this.wb;
      const yawRateLimit =
        speed > 1 ? Math.min(kinematicYawRate, maxLatAccel / speed) : kinematicYawRate;
      yawTarget = -(vLong >= 0 ? 1 : -1) * clamp(this.steerInput, -1, 1) * yawRateLimit;
      this.yawRate = lerp(this.yawRate, yawTarget, 1 - Math.exp(-(onGround ? 12 : 1.5) * dt));
    }
    if (!onGround) {
      this.yawRate *= Math.exp(-0.8 * dt);
    }
    this.yaw = wrapAngle(this.yaw + this.yawRate * dt);
    const sinYaw2 = Math.sin(this.yaw);
    const cosYaw2 = Math.cos(this.yaw);
    const latX2 = -cosYaw2;
    const latZ2 = sinYaw2;
    let vLong2 = this.vx * sinYaw2 + this.vz * cosYaw2;
    const vLat2 = this.vx * latX2 + this.vz * latZ2;
    // --- БОКОВОЕ СЦЕПЛЕНИЕ: гасит скорость вбок. Чем больше latGrip, тем сильнее машина «держит дорогу» ---
    let latGrip = 12 * phys.grip * surfaceGrip;
    if (this.drifting) {
      latGrip =
        (1.15 + (1 - driftSkill) * 1.6 + (1 - throttle) * 1.6) *
        surfaceGrip *
        (input.handbrake ? 0.6 : 1);
    }
    if (!onGround) {
      latGrip = 0.3;
    }
    const vLatNew = vLat2 * Math.exp(-latGrip * dt);
    const latLost = Math.abs(vLat2) - Math.abs(vLatNew);
    if (vLong2 > 0) {
      vLong2 += latLost * (this.drifting ? (input.handbrake ? 0.12 : 0.3 + 0.2 * throttle) : 0.1);
    }
    this.latAccel = (vLatNew - vLat2) / dt + vLong2 * this.yawRate;
    this.vx = vLong2 * sinYaw2 + vLatNew * latX2;
    this.vz = vLong2 * cosYaw2 + vLatNew * latZ2;
    this.pos[0] += this.vx * dt;
    this.pos[2] += this.vz * dt;
    // --- СТОЛКНОВЕНИЯ ---
    this.collide(dt);
    // --- ВЫСОТА И ПРЫЖКИ ---
    // Пока машина на земле, она «прилипает» к поверхности, а её вертикальная скорость = скорость подъёма земли под ней.
    // Если земля резко ушла вниз — машина отрывается и летит. Если земля под машиной за один шаг резко подскочила
    // (ступенька), groundVy получается большим, и следующий отрыв подбросит машину вверх — источник «подлётов».
    const groundH = this.world.groundAt(this.pos[0], this.pos[2], this.ground).h;
    if (this.onGround) {
      const heightAbove = this.pos[1] - groundH;
      const groundVy = (groundH - this.pos[1]) / dt;
      if (heightAbove > 0.12 && groundVy < this.vy - GRAVITY * dt * 1.5 && speed > 12) {
        this.onGround = false;
        this.airTime = 0;
        this.vy = Math.min(this.vy, this.prevGroundVy || 0);
      } else {
        // вертикальная скорость от рельефа ограничена ±20 м/с
        this.prevGroundVy = clamp(groundVy, -20, 20);
        this.vy = this.prevGroundVy;
        this.pos[1] = groundH;
      }
    }
    if (!this.onGround) {
      this.airTime += dt;
      // в полёте гравитация ×1.25 — для «аркадности»
      this.vy -= GRAVITY * 1.25 * dt;
      this.pos[1] += this.vy * dt;
      if (this.pos[1] <= groundH) {
        const impactSpeed = -this.vy;
        this.pos[1] = groundH;
        this.onGround = true;
        this.vy = 0;
        if (this.airTime > 0.25) {
          this.events.push({
            type: "land",
            strength: clamp(impactSpeed / 10, 0, 1),
            air: this.airTime,
          });
        }
      }
    }
    // --- ВОДА: тормозит машину; через 1.2 с в воде — возврат на дорогу (game.js) ---
    const waterLevel = this.world.waterLevelAt(this.pos[0], this.pos[2]);
    if (this.pos[1] < waterLevel - 0.5) {
      this.inWater += dt;
      this.vx *= Math.exp(-2.5 * dt);
      this.vz *= Math.exp(-2.5 * dt);
    } else {
      this.inWater = 0;
    }
    this.updateTilt(1 - Math.exp(-10 * dt));
    // --- РАСКАЧКА КУЗОВА: пружина-демпфер, только для красоты (на управление не влияет) ---
    const bodySpring = 60;
    const bodyDamping = 11;
    const pitchTarget = clamp(-this.longAccel * 0.0055, -0.07, 0.07);
    const rollTarget = clamp(this.latAccel * 0.0065, -0.08, 0.08);
    this.bodyPitchV +=
      (bodySpring * (pitchTarget - this.bodyPitch) - bodyDamping * this.bodyPitchV) * dt;
    this.bodyRollV +=
      (bodySpring * (rollTarget - this.bodyRoll) - bodyDamping * this.bodyRollV) * dt;
    this.bodyPitch += this.bodyPitchV * dt;
    this.bodyRoll += this.bodyRollV * dt;
    const wheelSpeed = this.vForward;
    this.wheelSpin += (wheelSpeed / this.spec.body.wr) * dt;
    // --- КОРОБКА ПЕРЕДАЧ И ОБОРОТЫ (для звука и тахометра) ---
    const gearSteps = [0, 0.18, 0.32, 0.47, 0.63, 0.8, 1];
    const speedFrac = Math.abs(wheelSpeed) / phys.vmax;
    if (wheelSpeed < -0.5) {
      this.gear = -1;
    } else if (this.gear < 1) {
      this.gear = 1;
    }
    if (this.gear >= 1) {
      const gearLo = gearSteps[this.gear - 1];
      const gearHi = gearSteps[this.gear];
      let gearPos = (speedFrac - gearLo * 0.75) / (gearHi - gearLo * 0.75);
      if (gearPos > 1 && this.gear < 6) {
        this.gear++;
        this.shiftTimer = 0.18;
        this.events.push({
          type: "shift",
          up: true,
        });
      } else if (gearPos < 0.32 && this.gear > 1) {
        this.gear--;
        this.events.push({
          type: "shift",
          up: false,
        });
      }
      const gearLo2 = gearSteps[this.gear - 1];
      const gearHi2 = gearSteps[this.gear];
      gearPos = clamp((speedFrac - gearLo2 * 0.75) / (gearHi2 - gearLo2 * 0.75), 0, 1.05);
      let targetRpm = 1000 + gearPos * 6600;
      if (this.drifting || (!onGround && throttle > 0)) {
        targetRpm = Math.max(targetRpm, 4200 + throttle * 3000);
      }
      if (throttle > 0 && speed < 2) {
        targetRpm = 2200 + throttle * 2500;
      }
      this.rpm = lerp(this.rpm, targetRpm, 1 - Math.exp(-10 * dt));
    } else {
      this.rpm = lerp(this.rpm, 1200 + speedFrac * 9000, 1 - Math.exp(-8 * dt));
    }
  }
  // Столкновения с отбойниками, стенами и стволами + невидимая граница карты.
  // Машина проверяется тремя кругами вдоль кузова (перед, центр, зад).
  collide(dt) {
    const sinYaw = Math.sin(this.yaw);
    const cosYaw = Math.cos(this.yaw);
    const radius = this.halfW * 0.95;
    const offsets = [this.halfL - radius * 0.9, 0, -(this.halfL - radius * 0.9)];
    const colliders = this.world.colliders;
    let pushX = 0;
    let pushZ = 0;
    let impact = 0;
    for (const off of offsets) {
      const cx = this.pos[0] + sinYaw * off;
      const cz = this.pos[2] + cosYaw * off;
      const hits = colliders.resolveCircle(cx, cz, radius, this.pos[1] + 0.5, this.contacts);
      for (const hit of hits) {
        const vn = this.vx * hit.nx + this.vz * hit.nz;
        pushX += hit.nx * hit.pen;
        pushZ += hit.nz * hit.pen;
        if (vn < 0) {
          const isRound = hit.obj.type === 0;
          const speed = Math.hypot(this.vx, this.vz) || 1;
          const hitFrac = clamp(-vn / speed, 0, 1);
          const bounce = isRound ? 0 : 0.06;
          this.vx -= (1 + bounce) * vn * hit.nx;
          this.vz -= (1 + bounce) * vn * hit.nz;
          const keep = 1 - (isRound ? 0.55 : 0.22) * hitFrac;
          this.vx *= keep;
          this.vz *= keep;
          const torque = off * (hit.nx * cosYaw - hit.nz * sinYaw) * -vn;
          this.yawRate += clamp(torque * (isRound ? 0.025 : 0.04), -0.7, 0.7);
          impact = Math.max(impact, -vn);
        }
      }
    }
    // невидимая стена на краю карты (на полигоне за картой её нет — там свои стенки)
    const LIMIT = 1530;
    const onPolygon = inTestValley(this.pos[0], this.pos[2]);
    for (const axis of [0, 2]) {
      if (!onPolygon && Math.abs(this.pos[axis]) > LIMIT) {
        const side = Math.sign(this.pos[axis]);
        this.pos[axis] = side * LIMIT;
        const vel = axis === 0 ? this.vx : this.vz;
        if (vel * side > 0) {
          if (axis === 0) {
            this.vx = 0;
          } else {
            this.vz = 0;
          }
          impact = Math.max(impact, Math.abs(vel));
          this.events.push({ type: "boundary" });
        }
      }
    }
    if (pushX || pushZ) {
      const len = Math.hypot(pushX, pushZ);
      const scale = Math.min(len, 1.5) / len;
      this.pos[0] += pushX * scale;
      this.pos[2] += pushZ * scale;
    }
    if (impact > 2) {
      this.events.push({
        type: "hit",
        strength: clamp(impact / 25, 0, 1),
      });
      if (impact > 6) {
        this.drifting = false;
      }
    }
  }
}
