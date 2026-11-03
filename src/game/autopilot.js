// Автопилот для тестов: сам ведёт машину по трассе заезда (используется window.__autodrive).

import { clamp, wrapAngle } from "../core/math.js";

// Простой автопилот: держит машину на траектории заезда и сбрасывает скорость перед поворотами.
export function autopilot(game, path, ai) {
  const car = game.car;
  const n = path.n;
  let bestD2 = Infinity;
  let bestIdx = ai.idx || 0;
  for (let k = -20; k <= 120; k++) {
    let idx = (ai.idx || 0) + k;
    if (ai.loop) {
      idx = ((idx % n) + n) % n;
    } else if (idx < 0 || idx >= n) {
      continue;
    }
    const d2 = (path.x[idx] - car.pos[0]) ** 2 + (path.z[idx] - car.pos[2]) ** 2;
    if (d2 < bestD2) {
      bestD2 = d2;
      bestIdx = idx;
    }
  }
  ai.idx = bestIdx;
  const speed = car.speed;
  const look = Math.round((7 + speed * 0.55) / 2);
  const at = (off) => (ai.loop ? (((bestIdx + off) % n) + n) % n : Math.min(n - 1, bestIdx + off));
  const target = at(look);
  const offX = -path.tz[target] * -path.hw[target] * 0;
  const offZ = path.tx[target] * path.hw[target] * 0;
  const dx = path.x[target] + offX - car.pos[0];
  const dz = path.z[target] + offZ - car.pos[2];
  const aimYaw = Math.atan2(dx, dz);
  const yawErr = wrapAngle(aimYaw - car.yaw);
  let maxCurv = 0;
  for (let k2 = 2; k2 < 45; k2 += 2) {
    const i0 = at(k2);
    const i1 = at(k2 + 4);
    const a0 = Math.atan2(path.tx[i0], path.tz[i0]);
    const a1 = Math.atan2(path.tx[i1], path.tz[i1]);
    const curv = Math.abs(wrapAngle(a1 - a0)) / 8;
    const ahead = k2 * 2;
    const safe = Math.sqrt(9.5 / Math.max(curv, 0.0001)) + ahead * 0.35;
    maxCurv = Math.max(maxCurv, 1 / (safe * safe));
  }
  const safeSpeed = clamp(Math.sqrt(1 / Math.max(maxCurv, 0.000001)), 8, 80);
  const steer = clamp(-yawErr * 2.6, -1, 1);
  let throttle = speed < safeSpeed ? 1 : 0;
  let brake = speed > safeSpeed + 3 ? clamp((speed - safeSpeed) / 8, 0.2, 1) : 0;
  if (Math.abs(yawErr) > 0.6 && speed > 12) {
    throttle = 0.2;
    brake = 0.4;
  }
  return {
    throttle: throttle,
    brake: brake,
    steer: steer,
    handbrake: false,
    boost: false,
  };
}
