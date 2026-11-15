// БОТЫ-СОПЕРНИКИ: машины с компьютерным управлением в заездах.
// Боты ездят на той же физике, что и игрок (CarPhysics): компьютер только «жмёт педали и крутит руль».
//
// Как думает бот:
//   1. Едет по ГОНОЧНОЙ ТРАЕКТОРИИ (raceLine.js): режет повороты от внешнего края к внутреннему и обратно.
//   2. Заранее знает, с какой скоростью пройдёт каждый поворот, и тормозит вовремя, а не «по факту».
//   3. Видит соперников: догнал — выбирает сторону и обгоняет; нет места — держится сзади и не таранит;
//      едут бок о бок — оставляет место; сзади подбирается быстрый — прикрывает траекторию.
//   4. Ошибается, как человек: иногда перетормаживает или выезжает широко (чем сложнее уровень — тем реже).
//   5. Застрял у стены — сдаёт назад; вылетел на траву — возвращается на асфальт; занесло — ловит машину.
// У каждого бота свой характер: напористость, аккуратность, манера старта.
// Здесь же — столкновения машин друг с другом и места в гонке.

import { CarPhysics } from "../car/physics.js";
import { CarView } from "../car/carView.js";
import { CARS } from "../car/cars.js";
import { clamp, lerp, wrapAngle } from "../core/math.js";
import { buildRaceLine, speedProfile } from "./raceLine.js";

// Имена соперников (берутся по порядку, перемешанные).
export const BOT_NAMES = ["Кэнта", "Юки", "Харуто", "Сора", "Рин", "Аой", "Дайки", "Мэй", "Рэн"];

// УРОВНИ СЛОЖНОСТИ.
//   corner  — какую долю от предела сцепления бот использует в поворотах (1 — на грани срыва);
//   brake   — насколько поздно и сильно тормозит (доля от возможностей машины);
//   line    — насколько точно держит гоночную траекторию (0 — едет по середине дороги, 1 — идеально);
//   errors  — как часто ошибается (раз в столько секунд в среднем);
//   react   — задержка на старте, с;
//   pace    — какую долю максимальной скорости своей машины бот выжимает на прямых;
//   fair    — потолок скорости относительно машины игрока (чтобы бот на суперкаре не уезжал от лёгкой машины
//             на прямой); 0 — без потолка.
export const BOT_LEVELS = {
  easy: { corner: 0.33, brake: 0.42, line: 0.45, errors: 9, react: 0.55, pace: 0.84, fair: 0.94 },
  normal: { corner: 0.46, brake: 0.62, line: 0.8, errors: 16, react: 0.35, pace: 0.92, fair: 0.99 },
  hard: { corner: 0.6, brake: 0.8, line: 1, errors: 30, react: 0.22, pace: 0.97, fair: 1.04 },
  master: { corner: 0.8, brake: 0.94, line: 1, errors: 70, react: 0.14, pace: 1, fair: 0 },
};

// НАСТРОЙКИ БОТОВ — меняй числа, игра перезагрузится сама.
export const BOT_TUNE = {
  grip: 17, // боковое ускорение на пределе для машины с grip = 1, м/с² (у бота — доля corner от него)
  spread: 0.05, // разброс силы между ботами (± доля): в гонке получается «лесенка» соперников
  rubberBehind: 0.05, // насколько бот прибавляет, если сильно отстал от игрока
  rubberAhead: 0.05, // насколько сбрасывает, если сильно впереди игрока
  rubberRange: 300, // на каком отрыве (м) эффект «резинки» максимальный
  gridGap: 9, // расстояние между рядами на старте, м
  carGap: 2.5, // сколько метров между серединами машин бот оставляет при обгоне
  stuckTime: 4, // через сколько секунд «стою на месте» бот возвращается на трассу (до этого пробует сдать назад)
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

const IDLE = () => ({ throttle: 0, brake: 0, steer: 0, handbrake: true, boost: false });

// Один бот.
class Bot {
  constructor(game, spec, color, name, level, strength) {
    this.kind = "bot";
    this.name = name;
    this.spec = spec;
    this.color = color;
    this.phys = new CarPhysics(game.world, spec);
    this.view = new CarView(game.renderer, spec, color);
    this.level = level;
    // ХАРАКТЕР: у каждого бота свой
    this.strength = strength; // общий множитель силы (около 1)
    this.skill = level.corner * strength; // «сила» одним числом — для таблиц и способностей
    this.aggression = 0.25 + Math.random() * 0.75; // напористость: обгоняет раньше, защищается жёстче
    this.calm = 0.6 + Math.random() * 0.8; // аккуратность: реже ошибается
    this.react = level.react * (0.7 + Math.random() * 0.7);
    this.lineBias = (Math.random() - 0.5) * 0.5; // любимая сторона дороги, м
    this.lane = 0;
    this.idx = 0;
    this.progress = 0;
    this.offDist = 0;
    this.finished = false;
    this.finishTime = null;
    this.stuck = 0;
    this.lost = 0;
    this.place = 0;
    this.shift = 0; // текущий сдвиг от гоночной траектории (обгон, объезд), м
    this.passSide = 0; // с какой стороны обгоняет: -1 слева, 1 справа, 0 — не обгоняет
    this.passHold = 0;
    this.blocked = false; // прикрыл траекторию (один раз на атаку)
    this.reverse = 0; // сколько ещё секунд сдаёт назад
    this.mistake = null; // текущая ошибка: { kind, t }
    this.nextMistake = level.errors * this.calm * (0.4 + Math.random());
    this.vp = null; // скорость в каждой точке траектории
    this.effects = { spin: 0, boost: 0, slow: 0 }; // для способностей: крутит (spin), мотор не тянет (slow)
    this.item = null; // способность в руках (режим «коробки»)
    this.meter = 0; // шкала способностей (режим «шкала»), 0..1
    this.itemThink = 0;
    this.input = IDLE();
  }
  dispose() {
    this.view.dispose();
  }
}

// Все боты одного заезда.
export class BotField {
  constructor(game, run, count, levelName, firstSlot = 1) {
    this.game = game;
    this.run = run;
    this.bots = [];
    const path = run.P;
    this.isCircuit = run.def.type === "circuit";
    this.line = buildRaceLine(path, this.isCircuit, game.world);
    const level = BOT_LEVELS[levelName] || BOT_LEVELS.normal;
    // имена ботов не должны совпадать с именами игроков в комнате
    const taken = new Set(game.isOnline() ? [...game.net.players.values()].map((p) => p.name) : []);
    const names = BOT_NAMES.filter((n) => !taken.has(n)).sort(() => Math.random() - 0.5);
    for (let k = 0; k < count; k++) {
      const spec = CARS[Math.floor(Math.random() * CARS.length)];
      const color = spec.colors[Math.floor(Math.random() * Math.min(spec.colors.length, 12))];
      // сила: от слабого к сильному, чтобы в гонке была «лесенка» соперников
      const t = count > 1 ? k / (count - 1) : 0.5;
      const strength = 1 - BOT_TUNE.spread + 2 * BOT_TUNE.spread * t;
      const bot = new Bot(game, spec, color, names[k % names.length], level, strength);
      bot.id = "bot" + k;
      bot.vp = this.profileFor(bot);
      this.bots.push(bot);
    }
    this.placeGrid(path, firstSlot);
  }
  // С какой скоростью этот бот на этой машине проходит каждую точку траектории.
  profileFor(bot) {
    const P = bot.phys.P;
    const aLat = BOT_TUNE.grip * (P.grip || 1) * bot.level.corner * bot.strength;
    const aBrake = (P.brake || 22) * bot.level.brake;
    let vmax = (P.vmax || 70) * bot.level.pace;
    const mine = this.game.car && this.game.car.P;
    if (bot.level.fair && mine && mine.vmax) {
      vmax = Math.min(vmax, mine.vmax * bot.level.fair * bot.strength);
    }
    return speedProfile(this.run.P, this.line, this.isCircuit, aLat, aBrake, vmax);
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
      // со старта бот едет своей полосой и только потом выходит на траекторию
      bot.shift = lateralOf(path, bot.idx, p[0], p[1]) - this.line.off[bot.idx];
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
        bot.input = IDLE();
      } else if (bot.finished) {
        bot.input = this.isCircuit ? this.drive(bot, dt, playerProgress, 0.7) : { throttle: 0, brake: 0.5, steer: 0, handbrake: false, boost: false };
      } else {
        bot.input = this.drive(bot, dt, playerProgress, 1);
      }
      this.applyEffects(bot, dt);
      bot.phys.update(dt, bot.input);
      trackProgress(bot, path, this.isCircuit, bot.phys.pos[0], bot.phys.pos[2]);
      if (!bot.finished && bot.progress >= run.total) {
        bot.finished = true;
        bot.finishTime = run.time;
      }
      // застрял, уехал с маршрута или в воде — возвращаем на трассу
      if (run.started && !(bot.finished && !this.isCircuit)) {
        bot.stuck = bot.phys.speed < 1.5 && bot.effects.spin <= 0 && run.time > bot.react + 1 ? bot.stuck + dt : 0;
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
    const lat = clamp(this.line.off[idx], -path.hw[idx] * 0.5, path.hw[idx] * 0.5);
    bot.phys.place(path.x[idx] + path.tz[idx] * lat, path.z[idx] - path.tx[idx] * lat, Math.atan2(path.tx[idx], path.tz[idx]));
    bot.stuck = 0;
    bot.lost = 0;
    bot.reverse = 0;
    bot.shift = 0;
    bot.passSide = 0;
  }
  // Попадания способностей крутят и замедляют машину, нитро разгоняет (см. items.js).
  applyEffects(bot, dt) {
    const e = bot.effects;
    if (e.spin > 0) {
      e.spin -= dt;
      bot.input = { throttle: 0, brake: 0.3, steer: Math.sin(e.spin * 14), handbrake: true, boost: false };
    }
    if (e.slow > 0) {
      // после молнии мотор пару секунд «не тянет»
      e.slow -= dt;
      bot.input.throttle = Math.min(bot.input.throttle, 0.4);
      bot.input.boost = false;
    }
    if (e.boost > 0) {
      e.boost -= dt;
      bot.input.boost = true;
    }
  }

  // ---------------------------------------------------------------------------------------------
  // ВОЖДЕНИЕ БОТА
  // ---------------------------------------------------------------------------------------------
  drive(bot, dt, playerProgress, mood) {
    const run = this.run;
    const path = run.P;
    const line = this.line;
    const car = bot.phys;
    const n = path.n;
    const isCircuit = this.isCircuit;
    const idx = bot.idx;
    const speed = car.speed;
    const at = (off) => (isCircuit ? (((idx + off) % n) + n) % n : clamp(idx + off, 0, n - 1));
    const lvl = bot.level;

    // старт: у каждого своя реакция
    if (run.time < bot.react) {
      return { throttle: 0, brake: 0, steer: 0, handbrake: true, boost: false };
    }

    // --- 1. Соперники вокруг ---
    const myLat = lateralOf(path, idx, car.pos[0], car.pos[2]);
    const myLine = lerp(bot.lineBias, line.off[idx], lvl.line);
    const lim = line.lim[idx] + 0.35;
    let wantShift = 0; // куда хотим сместиться относительно траектории
    let capSpeed = Infinity; // потолок скорости из-за машины впереди
    let passing = false;
    let nearest = null;
    let nearestGap = Infinity;
    for (const o of this.allRacers()) {
      if (o === bot || !o.phys) {
        continue;
      }
      let gap = o.progress - bot.progress;
      if (isCircuit) {
        // на кольце соперник может быть «на круг впереди» — берём расстояние по трассе
        gap = ((gap % path.lapLen) + path.lapLen * 1.5) % path.lapLen - path.lapLen / 2;
      }
      if (gap < -18 || gap > 60) {
        continue;
      }
      const oLat = lateralOf(path, o.idx ?? idx, o.phys.pos[0], o.phys.pos[2]);
      const side = oLat - myLat;
      const closing = speed - o.phys.speed;
      // (а) бок о бок: оставляем место
      if (Math.abs(gap) < 5.2) {
        const need = BOT_TUNE.carGap - Math.abs(side);
        if (need > 0) {
          wantShift += -Math.sign(side || bot.lineBias || 1) * need * 1.2;
        }
        continue;
      }
      if (gap > 0) {
        // (б) соперник впереди
        const reach = 9 + Math.max(0, closing) * (1.1 + bot.aggression * 0.9) + speed * 0.12;
        if (gap < reach && gap < nearestGap) {
          nearestGap = gap;
          nearest = { o, gap, oLat, closing };
        }
      } else if (!bot.blocked && gap > -14 && closing < -2.5 && bot.aggression > 0.55 && Math.abs(side) > 1.6 && Math.abs(side) < 5) {
        // (в) сзади подбирается быстрый: один раз прикрываем траекторию
        wantShift += Math.sign(side) * Math.min(1.6, Math.abs(side) - 1.2) * bot.aggression;
        bot.blocked = true;
        bot.passHold = 1.5;
      }
    }
    if (nearest) {
      const { o, gap, oLat, closing } = nearest;
      const inMyWay = Math.abs(oLat - (myLine + bot.shift)) < BOT_TUNE.carGap || Math.abs(oLat - myLat) < BOT_TUNE.carGap - 0.3;
      if (inMyWay || bot.passSide) {
        // с какой стороны больше места? (и на какую сторону уйдёт поворот — внутри обгонять выгоднее)
        const roomR = lim - oLat;
        const roomL = lim + oLat;
        if (!bot.passSide) {
          const kAhead = line.kappa[at(12)];
          const inside = Math.abs(kAhead) > 0.004 ? Math.sign(kAhead) : 0;
          const prefer = roomR - roomL + inside * 1.2 * bot.aggression + (myLat > oLat ? 0.8 : -0.8);
          const sideWant = prefer >= 0 ? 1 : -1;
          const room = sideWant > 0 ? roomR : roomL;
          const other = sideWant > 0 ? roomL : roomR;
          if (room > BOT_TUNE.carGap - 0.3) {
            bot.passSide = sideWant;
          } else if (other > BOT_TUNE.carGap - 0.3) {
            bot.passSide = -sideWant;
          }
        }
        if (bot.passSide) {
          passing = true;
          bot.passHold = 1.2;
          const targetLat = clamp(oLat + bot.passSide * BOT_TUNE.carGap, -lim, lim);
          wantShift += targetLat - myLine;
          // пока не поравнялись и места впритык — не тараним
          if (Math.abs(targetLat - oLat) < BOT_TUNE.carGap - 0.5 || Math.abs(myLat - oLat) < 1.7) {
            capSpeed = Math.min(capSpeed, o.phys.speed + (gap - 6.5) * 0.9);
          }
        } else {
          // обгонять негде — держимся сзади
          capSpeed = Math.min(capSpeed, o.phys.speed + (gap - 7) * 0.8);
        }
        if (closing > 4 && gap < 6 + closing * 0.5 && Math.abs(myLat - oLat) < 1.9) {
          capSpeed = Math.min(capSpeed, o.phys.speed - 1);
        }
      }
    }
    bot.passHold -= dt;
    if (!passing && bot.passHold <= 0) {
      bot.passSide = 0;
      bot.blocked = false;
    }

    // --- 2. Ошибки ---
    bot.nextMistake -= dt;
    if (!bot.mistake && bot.nextMistake <= 0 && speed > 14) {
      const kinds = ["late", "wide", "lift"];
      bot.mistake = { kind: kinds[Math.floor(Math.random() * kinds.length)], t: 1 + Math.random() * 1.4, dir: Math.random() < 0.5 ? -1 : 1 };
      bot.nextMistake = lvl.errors * bot.calm * (0.5 + Math.random());
    }
    let errSpeed = 1;
    let errThrottle = 1;
    if (bot.mistake) {
      bot.mistake.t -= dt;
      if (bot.mistake.kind === "late") errSpeed = 1.1;
      if (bot.mistake.kind === "wide") wantShift += bot.mistake.dir * 1.5;
      if (bot.mistake.kind === "lift") errThrottle = 0.55;
      if (bot.mistake.t <= 0) bot.mistake = null;
    }

    // --- 3. Куда рулить ---
    const offRoad = car.ground.surface === "grass" || Math.abs(myLat) > path.hw[idx] + 1.3;
    if (offRoad) {
      wantShift = 0; // на траве не до манёвров — возвращаемся на асфальт
    }
    const maxShift = 2 * lim;
    wantShift = clamp(wantShift, -maxShift, maxShift);
    const rate = (passing ? 2.6 : 1.6) * (1 + bot.aggression * 0.5);
    bot.shift += clamp(wantShift - bot.shift, -rate * dt, rate * dt);
    const look = clamp(Math.round((6 + speed * 0.42) / 2), 4, 26);
    const ti = at(look);
    const tLine = lerp(bot.lineBias, line.off[ti], lvl.line);
    const tLat = clamp(tLine + bot.shift, -line.lim[ti] - 0.4, line.lim[ti] + 0.4);
    const dx = path.x[ti] + path.tz[ti] * tLat - car.pos[0];
    const dz = path.z[ti] - path.tx[ti] * tLat - car.pos[2];
    const yawErr = wrapAngle(Math.atan2(dx, dz) - car.yaw);
    let steer = -yawErr * (2.2 + speed * 0.02);
    // занос: ловим машину рулём в сторону заноса
    const slip = car.slip || 0;
    const sliding = Math.abs(slip) > 0.2 && speed > 9;
    if (sliding) {
      steer += slip * 1.3;
    }
    steer = clamp(steer, -1, 1);

    // --- 4. Скорость: по профилю траектории, чуть заглядывая вперёд ---
    const gapToPlayer = clamp((playerProgress - bot.progress) / BOT_TUNE.rubberRange, -1, 1);
    const rubber = 1 + (gapToPlayer > 0 ? gapToPlayer * BOT_TUNE.rubberBehind : gapToPlayer * BOT_TUNE.rubberAhead);
    const scale = mood * rubber * errSpeed;
    const ahead = Math.max(1, Math.round((speed * 0.22) / 2));
    let target = Math.min(bot.vp[at(ahead)], bot.vp[at(ahead + 2)], bot.vp[at(1)] + 2) * scale;
    // едем не по своей траектории (обгон, объезд) — поворот выйдет круче, чуть сбавляем
    target *= 1 - Math.min(0.12, Math.abs(bot.shift) * 0.02 * Math.min(1, Math.abs(line.kappa[at(6)]) * 120));
    target = Math.min(target, Math.max(capSpeed, 4));
    if (offRoad) {
      target = Math.min(target, 22);
    }
    let throttle = 0;
    let brake = 0;
    const dv = target - speed;
    if (dv > 0.6) {
      throttle = 1;
    } else if (dv > -0.8) {
      throttle = 0.35;
    } else {
      brake = clamp(-dv / 5, 0.15, 1);
    }
    // сильно не туда смотрим — сначала довернуться
    if (Math.abs(yawErr) > 0.7 && speed > 11) {
      throttle = Math.min(throttle, 0.25);
      brake = Math.max(brake, 0.35);
    }
    if (sliding) {
      throttle = Math.min(throttle, 0.35);
    }
    throttle *= errThrottle;

    // --- 5. Застрял: сдаём назад и выруливаем ---
    if (bot.reverse > 0) {
      bot.reverse -= dt;
      return { throttle: 0, brake: 1, steer: clamp(yawErr * 2.5, -1, 1), handbrake: false, boost: false };
    }
    if (bot.stuck > 1.1 && bot.stuck < BOT_TUNE.stuckTime - 1) {
      bot.reverse = 1.2;
    }
    // развернуло задом наперёд: тормозим и доворачиваемся
    if (Math.abs(yawErr) > 2 && speed < 6) {
      return { throttle: 0.6, brake: 0, steer: clamp(-yawErr * 3, -1, 1), handbrake: false, boost: false };
    }

    // --- 6. Ускорение (Shift): на прямой и чтобы закончить обгон ---
    const straight = Math.abs(line.kappa[at(8)]) < 0.003 && Math.abs(line.kappa[at(24)]) < 0.004 && Math.abs(yawErr) < 0.08;
    const boost = !sliding && throttle > 0.9 && ((straight && car.boost > 0.4 && dv > 6 && gapToPlayer > -0.6) || (passing && car.boost > 0.2 && dv > 2 && straight));
    return { throttle, brake, steer, handbrake: false, boost };
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
