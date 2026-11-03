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
