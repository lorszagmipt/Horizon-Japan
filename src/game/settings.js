// Настройки игры и лучшие результаты: значения по умолчанию, пресеты графики, сохранение в браузере.

import { DEFAULT_BINDINGS } from "../input/input.js";

// Пресеты графики: разрешение, тени, дальность прорисовки, густота растительности, частицы, отражения.
export const GRAPHICS_PRESETS = {
  low: {
    label: "Низкое",
    pixelRatio: 0.7,
    shadows: 0,
    drawDist: 750,
    vegetation: 0.55,
    lodScale: 0.7,
    particles: 0.35,
    reflections: false,
  },
  medium: {
    label: "Среднее",
    pixelRatio: 1,
    shadows: 1024,
    drawDist: 1100,
    vegetation: 0.8,
    lodScale: 0.9,
    particles: 0.7,
    reflections: false,
  },
  high: {
    label: "Высокое",
    pixelRatio: 1,
    shadows: 2048,
    drawDist: 1500,
    vegetation: 1,
    lodScale: 1.1,
    particles: 1,
    reflections: true,
  },
};

// Ключ, под которым настройки сохраняются в браузере (localStorage).
const SETTINGS_KEY = "painted-roads-settings-v1";

// Ключ для лучших результатов заездов.
const BEST_KEY = "painted-roads-best-v1";

// Ключ для места на карте, где игрок был в прошлый раз (x, z, поворот).
const SPOT_KEY = "painted-roads-spot-v1";

const DEFAULT_SETTINGS = {
  preset: "medium",
  graphics: { ...GRAPHICS_PRESETS.medium },
  timeOfDay: "day",
  speedFx: true,
  showFps: false,
  units: "kmh",
  steerSens: 1,
  driftStrength: 1,
  volume: {
    master: 0.8,
    engine: 0.8,
    music: 0.5,
    ambient: 0.7,
  },
  car: "kaze",
  colors: {},
  bindings: DEFAULT_BINDINGS,
  cameraMode: 0,
  doorSide: 1, // камера «У двери»: 1 — справа, -1 — слева
  heliStyle: "news", // камера «Вертолёт»: "news" — новости, "course" — по курсу
  pipMode: -1, // второй вид в окошке: -1 — выключен, иначе номер режима камеры
  bots: 3, // сколько ботов-соперников в заездах (0 — без соперников)
  botLevel: "normal", // сложность ботов: "easy" | "normal" | "hard"
  nameTags: true, // имена над машинами соперников
  netName: "", // имя в онлайн-игре
  items: "boxes", // способности: "boxes" — коробки на трассе, "meter" — шкала, "off" — выключены
};

function storageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {}
}

// Слабая видеокарта (встроенная/мобильная) -> пресет "low".
function detectPreset(gl) {
  try {
    const ext = gl.getExtension("WEBGL_debug_renderer_info");
    const gpu = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    if (/HD Graphics|UHD Graphics|Mali|Adreno|PowerVR|SwiftShader|llvmpipe/i.test(gpu)) {
      return "low";
    }
  } catch {}
  return "medium";
}

// Загрузить настройки: значения по умолчанию + сохранённые игроком.
export function loadSettings(gl) {
  const settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  if (gl && !storageGet(SETTINGS_KEY)) {
    settings.preset = detectPreset(gl);
    settings.graphics = { ...GRAPHICS_PRESETS[settings.preset] };
    settings.autoPreset = true;
  }
  try {
    const raw = storageGet(SETTINGS_KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      Object.assign(settings, saved);
      settings.graphics = Object.assign(
        {},
        GRAPHICS_PRESETS[settings.preset] || GRAPHICS_PRESETS.medium,
        saved.graphics || {},
      );
      settings.volume = Object.assign({}, DEFAULT_SETTINGS.volume, saved.volume || {});
      settings.bindings = Object.assign({}, DEFAULT_SETTINGS.bindings, saved.bindings || {});
    }
  } catch {}
  return settings;
}

export function saveSettings(settings) {
  storageSet(SETTINGS_KEY, JSON.stringify(settings));
}

export function loadBest() {
  try {
    return JSON.parse(storageGet(BEST_KEY) || "{}") || {};
  } catch {
    return {};
  }
}

export function saveBest(best) {
  storageSet(BEST_KEY, JSON.stringify(best));
}

// Место на карте из прошлой игры: { x, z, yaw } или null.
export function loadSpot() {
  try {
    const spot = JSON.parse(storageGet(SPOT_KEY) || "null");
    return spot && isFinite(spot.x) && isFinite(spot.z) && isFinite(spot.yaw) ? spot : null;
  } catch {
    return null;
  }
}

export function saveSpot(spot) {
  storageSet(SPOT_KEY, JSON.stringify(spot));
}
