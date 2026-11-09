// ПОЛИГОН — огромная ровная площадка за южными горами, вне карты: проверять разгон, тормоза, руль, дрифт.
// Площадка 4 × 4 км стоит на дне долины, которую мы «вырезаем» в дальних горах (см. terrain.js → baseHeight).
// Разметка (сетка, прямая для замеров, круги, слалом) рисуется шейдером PAD_GLSL — без текстур и мешей.
// Чтобы поменять размеры — правь TEST_GROUND ниже: всё остальное (шейдер, стенки, щиты, мини-карта) считается от него.

import { smoothstep } from "../core/math.js";
import { MeshBuilder, boxGeo, makeTransform } from "../render/mesh.js";
import { StaticBatch } from "./batch.js";

export const TEST_GROUND = {
  x: 0, // центр площадки в мире (карта — примерно от −1500 до 1500, горы — дальше)
  z: 8600, // к югу за горами, Фудзи видно на севере
  y: 40, // высота асфальта
  half: 2000, // половина стороны асфальта: площадка 4 × 4 км
  apron: 80, // гравий за стенкой
  flat: 2500, // ровное дно долины (от центра до начала склонов)
  blend: 1300, // ширина склонов долины до гор
  wallH: 1.1, // высота бетонной стенки по краю
  // ПРЯМАЯ ДЛЯ ЗАМЕРОВ: полоса шириной 2·hw вдоль оси долины, едем на север (к Фудзи).
  // start / end — где старт и конец полосы (в метрах от центра площадки по оси z, север — минус).
  strip: { x: 0, hw: 15, start: 1900, end: -1950 },
  // КРУГИ ДЛЯ ПОВОРОТОВ И ДРИФТА: центр и радиусы, м
  skidpad: { x: -1000, z: 0, r: [30, 60, 100] },
  // СЛАЛОМ: ряды точек-«фишек» с шагом step, м (от z = +from до z = −from)
  slalom: [
    { x: 900, step: 15 },
    { x: 1100, step: 25 },
  ],
  slalomFrom: 1500,
};

const T = TEST_GROUND;

// Где ставить машину на полигоне: перед линией старта, носом на север.
export function testGroundSpawn() {
  return { x: T.x + T.strip.x, z: T.z + T.strip.start + 15, yaw: Math.PI };
}

// Расстояние от центра площадки «скруглённым квадратом» (углы долины не острые).
function valleyDist(x, z) {
  const u = Math.abs(x - T.x) / 1000;
  const w = Math.abs(z - T.z) / 1000;
  return Math.pow(u ** 6 + w ** 6, 1 / 6) * 1000;
}

// Насколько точка «в долине»: 1 — ровное дно, 0 — горы вокруг (между ними — склоны).
export function valleyMask(x, z) {
  if (Math.abs(x - T.x) > T.flat + T.blend || Math.abs(z - T.z) > T.flat + T.blend) return 0;
  const d = valleyDist(x, z);
  return 1 - smoothstep(T.flat, T.flat + T.blend, d);
}

// Точка в долине полигона (вместе со склонами)? Тогда groundAt не ищет дороги карты.
export function inTestValley(x, z) {
  return Math.abs(x - T.x) < T.flat + T.blend && Math.abs(z - T.z) < T.flat + T.blend;
}

// На асфальте полигона? margin > 0 — с запасом наружу.
export function onTestPad(x, z, margin = 0) {
  return Math.abs(x - T.x) < T.half + margin && Math.abs(z - T.z) < T.half + margin;
}

// ---------- РАЗМЕТКА В ШЕЙДЕРЕ (вставляется в render/shaders.js) ----------
const f = (v) => (+v).toFixed(1);

// Вспомогательная функция: насколько пиксель закрыт линией полушириной hw на расстоянии d (aa — метров в пикселе).
// Если линия тоньше пикселя — она бледнеет, а не мерцает.
export const PAD_GLSL_FUNCS = `
float padLine(float d, float hw, float aa) {
  float w = max(hw, aa * 0.75);
  return (1.0 - smoothstep(w - aa * 0.75, w + aa * 0.75, d)) * min(hw / w, 1.0);
}
`;

const S = T.strip;
const K = T.skidpad;
export const PAD_GLSL = `
  {
    vec2 p = wxz - vec2(${f(T.x)}, ${f(T.z)}); // координаты от центра площадки, м
    vec2 fw = max(fwidth(p), vec2(0.0005));
    float px = max(fw.x, fw.y); // метров в одном пикселе (чем дальше, тем больше)
    float n1 = vnoise(wxz * 0.8);
    float n2 = vnoise(wxz * 0.045);
    vec3 col = vec3(0.245, 0.25, 0.275) * (0.9 + n1 * 0.08 * (1.0 - smoothstep(0.05, 0.3, px)) + n2 * 0.16);
    // плиты 50 × 50 м шахматкой — по ним видно скорость
    vec2 cell = floor(p / 50.0);
    col *= 1.0 - 0.06 * mod(cell.x + cell.y, 2.0);
    float sx = abs(p.x - ${f(S.x)});
    float inStrip = step(sx, ${f(S.hw)}) * step(${f(S.end)}, p.y) * step(p.y, ${f(S.start + 30)});
    // сетка: тонкие линии каждые 10 м, заметнее — каждые 50 м (на прямой сетки нет)
    vec2 d10 = abs(fract(p / 10.0 + 0.5) - 0.5) * 10.0;
    vec2 d50 = abs(fract(p / 50.0 + 0.5) - 0.5) * 50.0;
    float g10 = max(padLine(d10.x, 0.05, fw.x), padLine(d10.y, 0.05, fw.y)) * (1.0 - smoothstep(0.04, 0.12, px));
    float g50 = max(padLine(d50.x, 0.12, fw.x), padLine(d50.y, 0.12, fw.y)) * (1.0 - smoothstep(0.2, 0.8, px));
    col = mix(col, vec3(0.78, 0.78, 0.74), max(g10 * 0.12, g50 * 0.28) * (1.0 - inStrip));
    vec3 white = vec3(0.93, 0.93, 0.90);
    vec3 yellow = vec3(0.98, 0.78, 0.18);
    vec3 orange = vec3(1.0, 0.42, 0.08);
    // ПРЯМАЯ: полоса свежего асфальта, боковые линии, метки каждые 10 м у краёв и через всю полосу каждые 100 м
    col = mix(col, col * 0.84, inStrip);
    float m = 0.0;
    float s = ${f(S.start)} - p.y; // метров от линии старта
    float along = step(-30.0, s) * step(s, ${f(S.start - S.end)});
    m = max(m, padLine(abs(sx - ${f(S.hw - 0.4)}), 0.15, fw.x) * along);
    float t10 = abs(fract(s / 10.0 + 0.5) - 0.5) * 10.0;
    float t100 = abs(fract(s / 100.0 + 0.5) - 0.5) * 100.0;
    float inS = step(0.0, s) * step(s, ${f(S.start - S.end)});
    m = max(m, padLine(t10, 0.12, fw.y) * step(${f(S.hw - 3.5)}, sx) * step(sx, ${f(S.hw - 0.4)}) * inS);
    m = max(m, padLine(t100, 0.3, fw.y) * step(sx, ${f(S.hw - 0.4)}) * inS);
    col = mix(col, white, m * 0.92);
    // линия старта — шахматка с клетками 1 м
    if (abs(s) < 1.5 && sx < ${f(S.hw - 0.4)}) {
      float ch = mod(floor(p.x) + floor(s + 1.5), 2.0);
      col = mix(vec3(0.07), vec3(0.93), ch);
    }
    // КРУГИ: жёлтые окружности и точка в центре
    float r = length(p - vec2(${f(K.x)}, ${f(K.z)}));
    float dr = min(min(abs(r - ${f(K.r[0])}), abs(r - ${f(K.r[1])})), abs(r - ${f(K.r[2])}));
    float ring = max(padLine(dr, 0.22, px), padLine(r, 1.4, px));
    col = mix(col, yellow, ring * 0.9);
    // СЛАЛОМ: оранжевые «фишки» с белой каймой
    float onRow = step(abs(p.y), ${f(T.slalomFrom)});
    ${T.slalom
      .map(
        (row) => `{
      vec2 q = vec2(p.x - ${f(row.x)}, mod(p.y + ${f(row.step / 2)}, ${f(row.step)}) - ${f(row.step / 2)});
      float dd = length(q);
      col = mix(col, white, padLine(dd, 0.85, px) * onRow);
      col = mix(col, orange, padLine(dd, 0.6, px) * onRow);
    }`,
      )
      .join("\n    ")}
    // белая линия в 3 м от стенки
    float edge = max(abs(p.x), abs(p.y));
    col = mix(col, white, padLine(abs(edge - ${f(T.half - 3)}), 0.15, px) * 0.85);
    // за стенкой — гравий
    vec3 gravel = vec3(0.52, 0.49, 0.44) * (0.85 + 0.2 * n1 + 0.1 * n2);
    col = mix(col, gravel, step(${f(T.half)}, edge));
    albedo = col * u_color;
    gloss = 0.05;
  }
`;

// ---------- 3D: асфальт, стенки, стартовая арка, щиты с метрами ----------

// Цифры как на электронных часах: из каких отрезков (a…g) состоит каждая.
const SEGMENTS = {
  0: "abcdef",
  1: "bc",
  2: "abged",
  3: "abgcd",
  4: "fgbc",
  5: "afgcd",
  6: "afgedc",
  7: "abc",
  8: "abcdefg",
  9: "abcdfg",
};

// Плоский прямоугольник, видный только спереди (со стороны +z).
function quadGeo(w, h) {
  const g = new MeshBuilder();
  const a = g.vertex(-w / 2, -h / 2, 0, 0, 0, 1);
  const b = g.vertex(w / 2, -h / 2, 0, 0, 0, 1);
  const c = g.vertex(w / 2, h / 2, 0, 0, 0, 1);
  const d = g.vertex(-w / 2, h / 2, 0, 0, 0, 1);
  g.quad(a, b, c, d);
  return g;
}

// Добавить число text на щит: цифры смотрят в сторону +z (навстречу машине, которая едет на север).
// Цифры — плоские, видны только спереди: сзади щита их не просвечивает.
function addNumber(batch, text, cx, cy, cz, color) {
  const W = 0.52; // ширина цифры
  const H = 0.9; // высота цифры
  const t = 0.12; // толщина штриха
  const gap = 0.16;
  const total = text.length * W + (text.length - 1) * gap;
  const seg = {
    a: [0, H / 2 - t / 2, W, t],
    g: [0, 0, W, t],
    d: [0, -H / 2 + t / 2, W, t],
    f: [-W / 2 + t / 2, H / 4, t, H / 2],
    b: [W / 2 - t / 2, H / 4, t, H / 2],
    e: [-W / 2 + t / 2, -H / 4, t, H / 2],
    c: [W / 2 - t / 2, -H / 4, t, H / 2],
  };
  for (let i = 0; i < text.length; i++) {
    const dx = -total / 2 + W / 2 + i * (W + gap);
    for (const ch of SEGMENTS[text[i]] || "") {
      const [sx, sy, sw, sh] = seg[ch];
      batch.add(quadGeo(sw, sh), makeTransform(cx + dx + sx, cy + sy, cz), cx, cz, color, 0.05);
    }
  }
}

export function buildTestGround(world, renderer) {
  const Y = T.y;
  // 1) АСФАЛТ: большие квадраты, вся разметка — в шейдере PAD
  const pad = new MeshBuilder();
  const R = T.half + T.apron;
  const N = 8;
  const step = (2 * R) / N;
  const idx = [];
  for (let k = 0; k <= N; k++) {
    for (let i = 0; i <= N; i++) {
      idx.push(pad.vertex(T.x - R + i * step, Y, T.z - R + k * step, 0, 1, 0, [1, 1, 1, 0]));
    }
  }
  for (let k = 0; k < N; k++) {
    for (let i = 0; i < N; i++) {
      const a = idx[k * (N + 1) + i];
      pad.quad(a, a + N + 1, a + N + 2, a + 1);
    }
  }
  const b = pad.bounds();
  const padItem = renderer.add({
    mesh: renderer.createMesh(pad),
    defines: ["PAD"],
    bounds: { c: b.center, r: b.radius },
    cull: "none",
    reflect: false,
    shadow: false,
  });

  // 2) СТЕНКИ по краю: бетон красно-белыми кусками по 10 м, на углах и через каждые 250 м — столбики
  const walls = new StaticBatch(renderer, { cell: 500, maxDist: 4200 });
  const red = [0.78, 0.16, 0.14];
  const white = [0.92, 0.92, 0.9];
  const th = 0.8;
  const off = T.half + th / 2;
  for (let s = -T.half; s < T.half; s += 10) {
    const col = Math.round((s + T.half) / 10) % 2 ? red : white;
    const mid = s + 5;
    const sides = [
      [T.x + mid, T.z - off, 10, th],
      [T.x + mid, T.z + off, 10, th],
      [T.x - off, T.z + mid, th, 10],
      [T.x + off, T.z + mid, th, 10],
    ];
    for (const [x, z, w, d] of sides) {
      walls.add(boxGeo(w, T.wallH, d), makeTransform(x, Y + T.wallH / 2, z), x, z, col, 0.05);
    }
  }
  for (let s = -T.half; s <= T.half; s += 250) {
    for (const [x, z] of [
      [T.x + s, T.z - off],
      [T.x + s, T.z + off],
      [T.x - off, T.z + s],
      [T.x + off, T.z + s],
    ]) {
      walls.add(boxGeo(0.35, 5, 0.35), makeTransform(x, Y + 2.5, z), x, z, [0.95, 0.95, 0.95], 0.1);
      walls.add(boxGeo(0.5, 0.8, 0.5), makeTransform(x, Y + 5.2, z), x, z, [1, 0.45, 0.1], 0.1, 0.4);
    }
  }
  const items = walls.build();
  // столкновения со стенками (с внутренней стороны)
  const h0 = Y - 2;
  const h1 = Y + 1.6;
  const H = T.half;
  world.colliders.addSegment(T.x - H, T.z - H, T.x + H, T.z - H, h0, h1, "wall");
  world.colliders.addSegment(T.x - H, T.z + H, T.x + H, T.z + H, h0, h1, "wall");
  world.colliders.addSegment(T.x - H, T.z - H, T.x - H, T.z + H, h0, h1, "wall");
  world.colliders.addSegment(T.x + H, T.z - H, T.x + H, T.z + H, h0, h1, "wall");

  // 3) СТАРТОВАЯ АРКА и ЩИТЫ С МЕТРАМИ вдоль прямой
  const deco = new StaticBatch(renderer, { cell: 250, maxDist: 1600 });
  const digits = new StaticBatch(renderer, { cell: 250, maxDist: 1600, shadow: false });
  const S = T.strip;
  const sx = T.x + S.x;
  const sz = T.z + S.start;
  const px = S.hw + 3;
  for (const side of [-1, 1]) {
    deco.add(boxGeo(1, 7.5, 1), makeTransform(sx + side * px, Y + 3.75, sz), sx, sz, [0.18, 0.19, 0.22], 0.1);
    world.colliders.addCircle(sx + side * px, sz, 0.75, Y - 2, Y + 8);
  }
  const cells = 20;
  const cw = (2 * px + 1) / cells;
  for (let i = 0; i < cells; i++) {
    for (let j = 0; j < 2; j++) {
      const x = sx - px - 0.5 + cw * (i + 0.5);
      const black = (i + j) % 2 === 0;
      deco.add(
        boxGeo(cw, 0.8, 0.9),
        makeTransform(x, Y + 7.5 + 0.4 + j * 0.8, sz),
        x,
        sz,
        black ? [0.06, 0.06, 0.07] : [0.95, 0.95, 0.95],
        0.1,
      );
    }
  }
  // щиты каждые 100 м по обе стороны прямой: «сколько метров от старта»
  const length = S.start - S.end;
  for (let dist = 100; dist <= length - 40; dist += 100) {
    const z = T.z + S.start - dist;
    for (const side of [-1, 1]) {
      const x = sx + side * (S.hw + 9);
      const big = dist % 1000 === 0;
      for (const pp of [-1.2, 1.2]) {
        deco.add(boxGeo(0.16, 2.4, 0.16), makeTransform(x + pp, Y + 1.2, z), x, z, [0.55, 0.56, 0.6], 0.1);
        world.colliders.addCircle(x + pp, z, 0.25, Y - 2, Y + 3);
      }
      deco.add(
        boxGeo(3.3, 1.3, 0.12),
        makeTransform(x, Y + 2.35, z),
        x,
        z,
        big ? [1, 0.82, 0.2] : [0.95, 0.95, 0.93],
        0.1,
      );
      addNumber(digits, String(dist), x, Y + 2.35, z + 0.065, [0.05, 0.05, 0.06]);
    }
  }
  // флагшток в центре кругов
  const kx = T.x + K.x;
  const kz = T.z + K.z;
  deco.add(boxGeo(0.2, 6, 0.2), makeTransform(kx, Y + 3, kz), kx, kz, [0.95, 0.95, 0.95], 0.1);
  deco.add(boxGeo(1.4, 0.8, 0.06), makeTransform(kx + 0.8, Y + 5.5, kz), kx, kz, [1, 0.45, 0.1], 0.1, 0.3);
  world.colliders.addCircle(kx, kz, 0.35, Y - 2, Y + 7);
  items.push(...deco.build());
  // цифры рисуются поверх лицевой стороны щита (сдвиг глубины), чтобы не мерцали вдали
  for (const it of digits.build()) {
    it.polyOffset = [-1, -4];
    items.push(it);
  }
  return [padItem, ...items];
}

// Картинка полигона для мини-карты (вид сверху, север — вверх).
export function drawTestGroundImage(size = 1024) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d");
  const R = T.half + T.apron;
  const k = size / (2 * R);
  const X = (x) => (x + R) * k; // x от центра площадки → пиксели
  const Z = (z) => (z + R) * k;
  g.fillStyle = "#857b6c";
  g.fillRect(0, 0, size, size);
  g.fillStyle = "#3e4048";
  g.fillRect(X(-T.half), Z(-T.half), 2 * T.half * k, 2 * T.half * k);
  g.strokeStyle = "rgba(255,255,255,0.10)";
  g.lineWidth = 1;
  for (let s = -T.half; s <= T.half; s += 250) {
    g.beginPath();
    g.moveTo(X(s), Z(-T.half));
    g.lineTo(X(s), Z(T.half));
    g.moveTo(X(-T.half), Z(s));
    g.lineTo(X(T.half), Z(s));
    g.stroke();
  }
  const S = T.strip;
  g.fillStyle = "#33343b";
  g.fillRect(X(S.x - S.hw), Z(S.end), 2 * S.hw * k, (S.start - S.end) * k);
  g.strokeStyle = "#f2f2ee";
  g.lineWidth = 2;
  g.strokeRect(X(S.x - S.hw), Z(S.end), 2 * S.hw * k, (S.start - S.end) * k);
  g.fillStyle = "#fff";
  g.font = "bold 22px Bahnschrift, Arial";
  g.textAlign = "left";
  g.textBaseline = "middle";
  for (let d = 500; d <= S.start - S.end; d += 500) {
    g.fillText(String(d), X(S.x + S.hw + 12), Z(S.start - d));
    g.fillRect(X(S.x - S.hw), Z(S.start - d) - 1, 2 * S.hw * k, 2);
  }
  g.fillStyle = "#111";
  g.fillRect(X(S.x - S.hw), Z(S.start) - 3, 2 * S.hw * k, 6);
  const K2 = T.skidpad;
  g.strokeStyle = "#ffd23f";
  g.lineWidth = 2;
  for (const r of K2.r) {
    g.beginPath();
    g.arc(X(K2.x), Z(K2.z), r * k, 0, Math.PI * 2);
    g.stroke();
  }
  g.fillStyle = "#ff6a14";
  for (const row of T.slalom) {
    for (let z = -T.slalomFrom; z <= T.slalomFrom; z += row.step * 4) {
      g.fillRect(X(row.x) - 2, Z(z) - 2, 4, 4);
    }
  }
  g.strokeStyle = "#d33";
  g.lineWidth = 4;
  g.strokeRect(X(-T.half), Z(-T.half), 2 * T.half * k, 2 * T.half * k);
  return { img: c, half: R, cx: T.x, cz: T.z };
}
