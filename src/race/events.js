// Заезды: список гонок (маршрут, тип, медали) и формат времени.

// Список заездов. type: "sprint" (из точки в точку), "circuit" (круги, laps), "drift" (очки за дрифт, medals).
// route — участки дорог: road (id дороги), from/to (метры от начала дороги, "end", "lap" или { at: id примыкания }).
// vref — эталонная средняя скорость (м/с): время на золото = длина / vref, серебро ×1.15, бронза ×1.35.
export const EVENTS = [
  {
    id: "sakura",
    name: "Сакуровый тоннель",
    type: "sprint",
    color: "#ff5c8a",
    region: "Долина Сакуры",
    desc: "Спринт через цветочные тоннели, мимо деревни и Зеркального озера к фестивалю.",
    route: [
      {
        road: "sakura",
        from: 0,
        to: "end",
      },
    ],
    vref: 37,
  },
  {
    id: "maple",
    name: "Кленовый серпантин",
    type: "sprint",
    color: "#ff8a2b",
    region: "Лес Золотых Клёнов",
    desc: "Извилистая дорога сквозь багряные клёны, мимо храма и пагоды.",
    route: [
      {
        road: "autumn",
        from: 0,
        to: "end",
      },
    ],
    vref: 30,
  },
  {
    id: "ring",
    name: "Фестивальное кольцо",
    type: "circuit",
    laps: 2,
    color: "#3db6ff",
    region: "Равнина Фестиваля",
    desc: "Два круга по кольцу фестиваля: шиканы, быстрые дуги и стартовая арка.",
    route: [
      {
        road: "ring",
        from: 20,
        to: "lap",
      },
    ],
    vref: 38.5,
  },
  {
    id: "pass",
    name: "Дрифт-зона «Перевал Фудзи»",
    type: "drift",
    color: "#b48cff",
    region: "Нагорье Фудзи",
    desc: "Набирайте очки заносами на шпильках серпантина до самой смотровой площадки.",
    route: [
      {
        road: "pass",
        from: 0,
        to: "summit",
      },
    ],
    vref: 18,
    medals: [20000, 11000, 5000],
  },
  {
    id: "climb",
    name: "Восхождение к Фудзи",
    type: "sprint",
    color: "#2ed3a0",
    region: "Через все регионы",
    desc: "От фестиваля через предгорья по шоссе и вверх по серпантину к панораме Фудзи.",
    route: [
      {
        road: "spine",
        from: 0,
        to: "end",
      },
      {
        road: "highway",
        from: { at: "spine" },
        to: { at: "pass" },
      },
      {
        road: "pass",
        from: 0,
        to: "summit",
      },
    ],
    vref: 35.5,
  },
  {
    id: "loop",
    name: "Скоростной круг",
    type: "circuit",
    laps: 1,
    color: "#ffd23f",
    region: "Шоссе «Окружное»",
    desc: "Полный круг по шоссе: тоннель, мосты, озёра и вид на Фудзи на максимальной скорости.",
    route: [
      {
        road: "highway",
        from: { at: "access" },
        to: "lap",
      },
    ],
    vref: 56,
  },
  {
    id: "hanami",
    name: "Кольцо Ханами",
    type: "circuit",
    laps: 2,
    color: "#ff7eb6",
    region: "Северные холмы",
    desc: "Большой брат Фестивального кольца: та же «почка» с прогибом, длинные дуги и перепады высот.",
    route: [
      {
        road: "hanami",
        from: 20,
        to: "lap",
      },
    ],
    vref: 39,
  },
  {
    id: "momiji",
    name: "Кольцо Момидзи",
    type: "circuit",
    laps: 2,
    color: "#ff6a3d",
    region: "Северо-восток",
    desc: "Длинная прямая, шпилька над обрывом и змейка через кленовый тоннель.",
    route: [
      {
        road: "momiji",
        from: 20,
        to: "lap",
      },
    ],
    vref: 36,
  },
  {
    id: "kawa",
    name: "Речной тракт",
    type: "sprint",
    color: "#36c6c0",
    region: "Долина Сакуры → водопад",
    desc: "Из сакуровой долины вдоль реки, полкруга по Ханами и через мост у водопада к шоссе.",
    route: [
      {
        road: "kawa",
        from: 0,
        to: "end",
      },
      {
        road: "hanami",
        from: { at: "kawa" },
        to: { at: "taki" },
      },
      {
        road: "taki",
        from: 0,
        to: "end",
      },
    ],
    vref: 34,
  },
  {
    id: "north",
    name: "Северный тур",
    type: "sprint",
    color: "#7d8cff",
    region: "Весь север",
    desc: "От водопада через оба новых кольца и Дорогу Предгорий — к восточному шоссе.",
    route: [
      {
        road: "taki",
        from: "end",
        to: 0,
      },
      {
        road: "hanami",
        from: { at: "taki" },
        to: { at: "hanami_link" },
      },
      {
        road: "hanami_link",
        from: 0,
        to: "end",
      },
      {
        road: "spine",
        from: { at: "hanami_link" },
        to: { at: "momiji_link" },
      },
      {
        road: "momiji_link",
        from: "end",
        to: 0,
      },
      {
        road: "momiji",
        from: { at: "momiji_link" },
        to: { at: "momiji_east" },
      },
      {
        road: "momiji_east",
        from: 0,
        to: "end",
      },
    ],
    vref: 36,
  },
];

export const EVENT_TYPES = {
  sprint: "СПРИНТ",
  circuit: "КОЛЬЦО",
  drift: "ДРИФТ",
};

// Секунды -> "м:сс.сс".
export function formatTime(seconds) {
  if (seconds == null || !isFinite(seconds)) {
    return "—";
  }
  const min = Math.floor(seconds / 60);
  const sec = seconds - min * 60;
  return min + ":" + (sec < 10 ? "0" : "") + sec.toFixed(2);
}
