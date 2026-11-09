// БОТЫ-СОПЕРНИКИ: машины с компьютерным управлением в заездах.
// Боты ездят на той же физике, что и игрок (CarPhysics): компьютер только «жмёт педали и крутит руль».
// Здесь же — столкновения машин друг с другом и места в гонке.

import { CarPhysics } from "../car/physics.js";
import { CarView } from "../car/carView.js";
import { CARS } from "../car/cars.js";
import { clamp, wrapAngle } from "../core/math.js";

// Имена соперников (берутся по порядку, перемешанные).
export const BOT_NAMES = ["Кэнта", "Юки", "Харуто", "Сора", "Рин", "Аой", "Дайки", "Мэй", "Рэн"];

// Сложность: доля от «безопасной» скорости, с которой бот проходит повороты и прямые.
// 1.0 — едет почти идеально (быстрее золотой медали), 0.85 — заметно осторожнее.
export const BOT_LEVELS = {
  easy: 0.8, // примерно бронза
  normal: 0.88, // примерно серебро
  hard: 0.97, // около золота
};

// НАСТРОЙКИ БОТОВ — меняй числа, игра перезагрузится сама.
export const BOT_TUNE = {
  spread: 0.035, // разброс силы между ботами (± доля)
  rubberBehind: 0.07, // насколько бот прибавляет, если сильно отстал от игрока
  rubberAhead: 0.07, // насколько сбрасывает, если сильно впереди игрока
  rubberRange: 300, // на каком отрыве (м) эффект «резинки» максимальный
  lane: 0.38, // насколько боты разъезжаются по ширине дороги (доля полуширины)
  gridGap: 9, // расстояние между рядами на старте, м
  stuckTime: 3, // через сколько секунд «стою на месте» бот возвращается на трассу
};

// Ищем ближайшую точку маршрута рядом с прошлой (окно -40..+160 точек), как для игрока.
function nearestOnPath(path, isCircuit, x, z, fromIdx) {
  let bestD2 = Infinity;
  let bestIdx = fromIdx;
  for (let k = -40; k <= 160; k++) {
    let idx = fromIdx + k;
    if (isCircuit) {
      idx = ((idx % path.n) + path.n) % path.n;
    } else if (idx < 0 || idx >= path.n) {
      continue;
    }
    const d2 = (path.x[idx] - x) ** 2 + (path.z[idx] - z) ** 2;
    if (d2 < bestD2) {
      bestD2 = d2;
      bestIdx = idx;
    }
  }
  return [bestIdx, Math.sqrt(bestD2)];
}

// Прогресс по маршруту (метры от старта, с учётом кругов). Тот же расчёт, что у игрока в raceManager.
export function trackProgress(r, path, isCircuit, x, z) {
  const [bestIdx, dist] = nearestOnPath(path, isCircuit, x, z, r.idx);
  const lapBase = isCircuit ? Math.floor(r.progress / path.lapLen) * path.lapLen : 0;
  let d = path.d[bestIdx] + lapBase;
  if (isCircuit && bestIdx < r.idx - path.n / 2) {
    d += path.lapLen;
  }
  if (isCircuit && bestIdx > r.idx + path.n / 2) {
    d -= path.lapLen;
  }
  r.idx = bestIdx;
  r.offDist = dist;
  if (dist < 40 && d > r.progress - 60) {
    r.progress = Math.max(r.progress, d);
  }
  return d;
}

// Сдвиг вбок от оси маршрута: плюс — вправо по ходу.
function lateralOf(path, idx, x, z) {
  return (x - path.x[idx]) * path.tz[idx] - (z - path.z[idx]) * path.tx[idx];
}

// Один бот.
class Bot {
  constructor(game, spec, color, name, skill, lane) {
    this.kind = "bot";
    this.name = name;
    this.spec = spec;
    this.color = color;
    this.phys = new CarPhysics(game.world, spec);
    this.view = new CarView(game.renderer, spec, color);
    this.skill = skill;
    this.lane = lane;
    this.laneNow = lane;
    this.idx = 0;
    this.progress = 0;
    this.offDist = 0;
    this.finished = false;
    this.finishTime = null;
    this.stuck = 0;
    this.lost = 0;
    this.place = 0;
    this.effects = { spin: 0, boost: 0 }; // для способностей (банан, ракета, нитро)
    this.item = null; // способность в руках (режим «коробки»)
    this.meter = 0; // шкала способностей (режим «шкала»), 0..1
    this.itemThink = 0;
    this.input = { throttle: 0, brake: 0, steer: 0, handbrake: true, boost: false };
  }
  dispose() {
    this.view.dispose();
  }
}

// Все боты одного заезда.
export class BotField {
  constructor(game, run, count, level, firstSlot = 1) {
    this.game = game;
    this.run = run;
    this.bots = [];
    const path = run.P;
    this.isCircuit = run.def.type === "circuit";
    const base = BOT_LEVELS[level] || BOT_LEVELS.normal;
    // имена ботов не должны совпадать с именами игроков в комнате
    const taken = new Set(game.isOnline() ? [...game.net.players.values()].map((p) => p.name) : []);
    const names = BOT_NAMES.filter((n) => !taken.has(n)).sort(() => Math.random() - 0.5);
    for (let k = 0; k < count; k++) {
      const spec = CARS[Math.floor(Math.random() * CARS.length)];
      const color = spec.colors[Math.floor(Math.random() * Math.min(spec.colors.length, 12))];
      // сила: от слабого к сильному, чтобы в гонке была «лесенка» соперников
      const t = count > 1 ? k / (count - 1) : 0.5;
      const skill = base * (1 - BOT_TUNE.spread + 2 * BOT_TUNE.spread * t);
      const lane = (k % 2 ? 1 : -1) * BOT_TUNE.lane;
      const bot = new Bot(game, spec, color, names[k % names.length], skill, lane);
      bot.id = "bot" + k;
      this.bots.push(bot);
    }
    this.placeGrid(path, firstSlot);
  }
  // СТАРТОВАЯ РЕШЁТКА: боты встают за игроками (места firstSlot, firstSlot+1, ...).
  placeGrid(path, firstSlot) {
    this.bots.forEach((bot, k) => {
      const p = this.game.events.gridPos(path, firstSlot + k, this.isCircuit);
      bot.phys.place(p[0], p[1], p[2]);
      bot.phys.boost = 1;
      bot.idx = 0;
      bot.progress = -p[3];
      if (this.isCircuit && p[3] > 0) {
        bot.idx = this.game.events.pathPoint(path, path.lapLen - p[3]);
      }
      bot.view.update(this.viewState(bot));
    });
  }
  viewState(bot) {
    const car = bot.phys;
    car.braking = bot.input.brake > 0 && car.vForward > 0.5;
    car.groundH = car.ground.h;
    return car;
  }
  // Все машины заезда (для столкновений, ракет и бананов): игрок + боты.
  cars() {
    return this.game.events.racers().map((r) => r.phys);
  }
  // КАЖДЫЙ КАДР: решения ботов, физика, возврат застрявших, прогресс, места.
  update(dt, playerProgress) {
    const run = this.run;
    const path = run.P;
    for (const bot of this.bots) {
      if (!run.started) {
        bot.input = { throttle: 0, brake: 0, steer: 0, handbrake: true, boost: false };
      } else if (bot.finished) {
        bot.input = this.isCircuit ? this.drive(bot, path, playerProgress, 0.7) : { throttle: 0, brake: 0.5, steer: 0, handbrake: false, boost: false };
      } else {
        bot.input = this.drive(bot, path, playerProgress, 1);
      }
      this.applyEffects(bot, dt);
      bot.phys.update(dt, bot.input);
      trackProgress(bot, path, this.isCircuit, bot.phys.pos[0], bot.phys.pos[2]);
      if (!bot.finished && bot.progress >= run.total) {
        bot.finished = true;
        bot.finishTime = run.time;
      }
      // застрял, уехал с маршрута или в воде — возвращаем на трассу
      if (run.started) {
        bot.stuck = bot.phys.speed < 1.5 && bot.effects.spin <= 0 ? bot.stuck + dt : 0;
        bot.lost = bot.offDist > 30 ? bot.lost + dt : 0;
        if (bot.stuck > BOT_TUNE.stuckTime || bot.lost > 3 || bot.phys.inWater > 0.5) {
          this.respawnBot(bot);
        }
      }
    }
    for (const bot of this.bots) {
      bot.view.update(this.viewState(bot));
    }
  }
  respawnBot(bot) {
    const path = this.run.P;
    const idx = Math.max(0, Math.min(path.n - 1, bot.idx));
    const lat = bot.lane * path.hw[idx];
    bot.phys.place(path.x[idx] + path.tz[idx] * lat, path.z[idx] - path.tx[idx] * lat, Math.atan2(path.tx[idx], path.tz[idx]));
    bot.stuck = 0;
    bot.lost = 0;
  }
  // Банан / ракета замедляют и крутят машину, нитро разгоняет (см. items.js).
  applyEffects(bot, dt) {
    const e = bot.effects;
    if (e.spin > 0) {
      e.spin -= dt;
      bot.input = { throttle: 0, brake: 0.3, steer: Math.sin(e.spin * 14), handbrake: true, boost: false };
    }
    if (e.boost > 0) {
      e.boost -= dt;
      bot.input.boost = true;
    }
  }
  // ВОЖДЕНИЕ БОТА: держит свою полосу, сбрасывает скорость перед поворотами, объезжает машины впереди.
  drive(bot, path, playerProgress, mood) {
    const car = bot.phys;
    const n = path.n;
    const isCircuit = this.isCircuit;
    const bestIdx = bot.idx;
    const speed = car.speed;
    const at = (off) => (isCircuit ? (((bestIdx + off) % n) + n) % n : Math.min(n - 1, Math.max(0, bestIdx + off)));
    // «резинка»: сильно отстал от игрока — прибавляет, сильно впереди — сбрасывает
    const gap = clamp((playerProgress - bot.progress) / BOT_TUNE.rubberRange, -1, 1);
    const skill = bot.skill * mood * (1 + (gap > 0 ? gap * BOT_TUNE.rubberBehind : gap * BOT_TUNE.rubberAhead));
    // объезд: машина впереди близко и на той же полосе — уходим на другую сторону
    const myLat = lateralOf(path, bestIdx, car.pos[0], car.pos[2]);
    let wantLane = bot.lane;
    for (const other of this.allRacers()) {
      if (other === bot) continue;
      const ahead = other.progress - bot.progress;
      if (ahead > 1 && ahead < 22) {
        const lat = lateralOf(path, other.idx, other.phys.pos[0], other.phys.pos[2]);
        if (Math.abs(lat - myLat) < 2.6) {
          wantLane = lat > 0 ? -BOT_TUNE.lane * 1.15 : BOT_TUNE.lane * 1.15;
        }
      }
    }
    bot.laneNow += (wantLane - bot.laneNow) * 0.04;
    const look = Math.round((7 + speed * 0.55) / 2);
    const target = at(look);
    const lat = bot.laneNow * path.hw[target];
    const dx = path.x[target] + path.tz[target] * lat - car.pos[0];
    const dz = path.z[target] - path.tx[target] * lat - car.pos[2];
    const yawErr = wrapAngle(Math.atan2(dx, dz) - car.yaw);
    // безопасная скорость по самому крутому повороту впереди (как у автопилота, с учётом сцепления машины)
    const grip = 9.5 * Math.sqrt(car.P.grip || 1);
    let maxCurv = 0;
    for (let k2 = 2; k2 < 45; k2 += 2) {
      const i0 = at(k2);
      const i1 = at(k2 + 4);
      const curv = Math.abs(wrapAngle(Math.atan2(path.tx[i1], path.tz[i1]) - Math.atan2(path.tx[i0], path.tz[i0]))) / 8;
      const safe = Math.sqrt(grip / Math.max(curv, 0.0001)) + k2 * 2 * 0.35;
      maxCurv = Math.max(maxCurv, 1 / (safe * safe));
    }
    const safeSpeed = clamp(Math.sqrt(1 / Math.max(maxCurv, 0.000001)), 8, 80) * skill;
    let throttle = speed < safeSpeed ? 1 : speed < safeSpeed + 1.5 ? 0.25 : 0;
    let brake = speed > safeSpeed + 3 ? clamp((speed - safeSpeed) / 8, 0.2, 1) : 0;
    if (Math.abs(yawErr) > 0.6 && speed > 12) {
      throttle = 0.2;
      brake = 0.4;
    }
    // нитро на прямой, если есть запас и бот не впереди всех с отрывом
    const boost = car.boost > 0.35 && safeSpeed > speed + 10 && Math.abs(yawErr) < 0.08 && gap > -0.5;
    return { throttle, brake, steer: clamp(-yawErr * 2.6, -1, 1), handbrake: false, boost };
  }
  // Все гонщики заезда (игрок, боты, друзья по сети) — общий список у raceManager.
  allRacers() {
    return this.game.events.racers();
  }
  standings() {
    return this.game.events.standings();
  }
  dispose() {
    for (const bot of this.bots) bot.dispose();
    this.bots = [];
  }
}

// СТОЛКНОВЕНИЯ МАШИН: каждая машина — три круга вдоль кузова; пересеклись — расталкиваем и обмениваемся скоростью.
export function collideCars(cars, onHit) {
  const circles = (c) => {
    const s = Math.sin(c.yaw);
    const co = Math.cos(c.yaw);
    const r = c.halfW * 0.95;
    const off = c.halfL - r * 0.9;
    return [off, 0, -off].map((o) => [c.pos[0] + s * o, c.pos[2] + co * o, r]);
  };
  const cs = cars.map(circles);
  for (let i = 0; i < cars.length; i++) {
    for (let j = i + 1; j < cars.length; j++) {
      const a = cars[i];
      const b = cars[j];
      if (Math.abs(a.pos[1] - b.pos[1]) > 1.6) continue;
      if (Math.hypot(a.pos[0] - b.pos[0], a.pos[2] - b.pos[2]) > a.halfL + b.halfL + 1) continue;
      for (const ca of cs[i]) {
        for (const cb of cs[j]) {
          let nx = cb[0] - ca[0];
          let nz = cb[1] - ca[1];
          const d = Math.hypot(nx, nz);
          const minD = ca[2] + cb[2];
          if (d >= minD || d < 1e-4) continue;
          nx /= d;
          nz /= d;
          const pen = minD - d;
          const ma = a.P.mass || 1300;
          const mb = b.P.mass || 1300;
          const wa = mb / (ma + mb);
          const wb = ma / (ma + mb);
          a.pos[0] -= nx * pen * wa;
          a.pos[2] -= nz * pen * wa;
          b.pos[0] += nx * pen * wb;
          b.pos[2] += nz * pen * wb;
          const vrel = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
          if (vrel < 0) {
            const e = 0.25;
            const jimp = (-(1 + e) * vrel) / (1 / ma + 1 / mb);
            a.vx -= (jimp / ma) * nx;
            a.vz -= (jimp / ma) * nz;
            b.vx += (jimp / mb) * nx;
            b.vz += (jimp / mb) * nz;
            // немного закручиваем — удар в бок разворачивает машину
            a.yawRate += clamp(-vrel * 0.02, -0.4, 0.4) * Math.sign(nx * Math.cos(a.yaw) - nz * Math.sin(a.yaw));
            b.yawRate -= clamp(-vrel * 0.02, -0.4, 0.4) * Math.sign(nx * Math.cos(b.yaw) - nz * Math.sin(b.yaw));
            if (-vrel > 2 && onHit) {
              const strength = clamp(-vrel / 20, 0, 1);
              onHit(a, strength);
              onHit(b, strength);
            }
          }
        }
      }
    }
  }
}
