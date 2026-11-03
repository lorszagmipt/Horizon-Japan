// Точка входа: создаёт рендерер, генерирует мир, запускает игру и игровой цикл.

import { Renderer } from "./render/renderer.js";
import { World } from "./world/world.js";
import { Input } from "./input/input.js";
import { loadSettings } from "./game/settings.js";
import { Game } from "./game/game.js";
import { RaceManager } from "./race/raceManager.js";
import { Effects } from "./fx/effects.js";
import { UI } from "./ui/ui.js";
import { AudioEngine } from "./audio/audio.js";
import { autopilot } from "./game/autopilot.js";

// Тестовый режим: открой игру с ?test в адресе. Убрать из версии для Яндекса.
const TEST_MODE = location.search.includes("test");

// Запуск игры.
async function main() {
  const canvas = document.getElementById("gl");
  let renderer;
  try {
    renderer = new Renderer(canvas);
  } catch (err) {
    document.getElementById("ui").innerHTML =
      '<div class="fatal"><h1>WebGL2 недоступен</h1><p>Откройте игру в свежей версии Chrome, Edge или Firefox и включите аппаратное ускорение графики.</p></div>';
    throw err;
  }
  const settings = loadSettings(TEST_MODE ? null : renderer.gl);
  const input = new Input();
  input.setBindings(settings.bindings);
  const world = new World(renderer);
  world.quality = {
    vegetation: settings.graphics.vegetation,
    drawDist: settings.graphics.drawDist,
    lodScale: settings.graphics.lodScale,
  };
  renderer.pixelRatio = settings.graphics.pixelRatio * Math.min(window.devicePixelRatio || 1, 1.5);
  const t0 = performance.now();
  await world.generate((progress, message) => {
    const bar = document.getElementById("loadbar");
    if (bar) {
      bar.style.width = Math.round(progress * 100) + "%";
    }
    const msg = document.getElementById("loadmsg");
    if (msg) {
      msg.textContent = message;
    }
  });
  console.log("world generated in", ((performance.now() - t0) / 1000).toFixed(1), "s");
  renderer.setShadowSize(settings.graphics.shadows);
  const game = new Game({
    renderer: renderer,
    world: world,
    input: input,
    settings: settings,
  });
  game.fx = new Effects(renderer, world, settings.graphics.particles);
  game.events = new RaceManager(game);
  game.audio = new AudioEngine(settings);
  game.ui = new UI(game);
  game.applySettings();
  window.__game = game;
  // Режим отладки: подключается только при запуске через `npm run dev`.
  // В архив для Яндекса (npm run build / zip) этот код не попадает.
  if (import.meta.env.DEV) {
    import("./debug/debug.js").then((m) => m.installDebug(game));
  }
  game.state = "menu";
  game.ui.show("menu");
  if (TEST_MODE && location.search.includes("drive")) {
    game.state = "drive";
    game.ui.hideScreens();
    game.ui.initMaps();
  }
  const loading = document.getElementById("loading");
  if (loading) {
    if (TEST_MODE) {
      loading.remove();
    } else {
      loading.style.opacity = "0";
      setTimeout(() => loading.remove(), 900);
    }
  }
  window.__sim = (seconds, controls, steps = 30) => {
    input.virtual = Object.assign(
      {
        throttle: 0,
        brake: 0,
        steer: 0,
        handbrake: false,
        boost: false,
      },
      controls,
    );
    const stepDt = seconds / steps;
    for (let k = 0; k < steps; k++) {
      game.frame(stepDt, true);
    }
    input.virtual = null;
    const car = game.car;
    return {
      x: +car.pos[0].toFixed(1),
      y: +car.pos[1].toFixed(2),
      z: +car.pos[2].toFixed(1),
      yaw: +car.yaw.toFixed(2),
      kmh: +(car.speed * 3.6).toFixed(1),
      drift: car.drifting,
      slip: +car.slip.toFixed(2),
      gear: car.gear,
      rpm: Math.round(car.rpm),
      surf: car.surface,
    };
  };
  window.__autodrive = (eventId, maxTime = 400, carId) => {
    if (carId) {
      settings.car = carId;
      game.spawnCar(carId);
    }
    game.events.start(eventId);
    const run = game.events.active;
    run.countdown = 0.4;
    const ai = {
      idx: 0,
      loop: run.def.type === "circuit",
    };
    const dt = 1 / 60;
    let time = 0;
    const unused = Infinity;
    let stuck = 0;
    let respawns = 0;
    let hits = 0;
    while (time < maxTime && game.events.active && !game.events.active.finished) {
      input.virtual = autopilot(game, run.P, ai);
      game.frame(dt, true);
      for (const ev of game.car.events) {
        if (ev.type === "hit") {
          hits++;
        }
      }
      time += dt;
      if (game.car.speed < 1.5 && run.started) {
        stuck += dt;
      } else {
        stuck = 0;
      }
      if (stuck > 4) {
        game.events.respawnAtCheckpoint();
        stuck = 0;
        respawns++;
      }
    }
    input.virtual = null;
    const result = {
      id: eventId,
      finished: !!(game.events.active && game.events.active.finished),
      time: run.time,
      next: run.next,
      cps: run.cps.length,
      progress: Math.round(run.progress),
      total: Math.round(run.total),
      respawns: respawns,
      hits: hits,
      drift: Math.round(game.events.drift.total),
    };
    if (game.events.active && game.events.active.finished) {
      game.events.closeResults(false);
    } else {
      game.events.cancel();
    }
    game.ui.hideScreens();
    return result;
  };
  let lastT = performance.now();
  const loop = (now) => {
    const dt2 = (now - lastT) / 1000;
    lastT = now;
    game.frame(dt2);
    requestAnimationFrame(loop);
  };
  if (TEST_MODE) {
    window.__frame = () => {
      game.frame(1 / 60);
      window.__stats = { ...renderer.stats };
    };
  } else {
    requestAnimationFrame(loop);
  }
  window.__ready = true;
}

main().catch((f) => {
  console.error(f);
  window.__error = String(f.stack || f);
});
