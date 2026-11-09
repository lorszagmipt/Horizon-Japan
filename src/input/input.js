// Управление: клавиатура и геймпад, назначение клавиш.

// Действия, которые можно назначить на клавиши (экран настроек управления).
export const ACTIONS = [
  {
    id: "throttle",
    name: "Газ",
  },
  {
    id: "brake",
    name: "Тормоз / задний ход",
  },
  {
    id: "left",
    name: "Руль влево",
  },
  {
    id: "right",
    name: "Руль вправо",
  },
  {
    id: "handbrake",
    name: "Ручной тормоз (дрифт)",
  },
  {
    id: "boost",
    name: "Ускорение",
  },
  {
    id: "respawn",
    name: "Вернуться на дорогу",
  },
  {
    id: "camera",
    name: "Сменить камеру",
  },
  {
    id: "interact",
    name: "Начать заезд у маркера",
  },
  {
    id: "lookBack",
    name: "Смотреть назад",
  },
  {
    id: "item",
    name: "Способность (коробки)",
  },
  {
    id: "item1",
    name: "Ракета (шкала)",
  },
  {
    id: "item2",
    name: "Нитро (шкала)",
  },
  {
    id: "item3",
    name: "Банан (шкала)",
  },
  {
    id: "pause",
    name: "Пауза",
  },
  {
    id: "hud",
    name: "Скрыть/показать интерфейс",
  },
];

// Клавиши по умолчанию. Используются коды клавиш (KeyW и т. п.), поэтому раскладка не важна.
export const DEFAULT_BINDINGS = {
  throttle: ["KeyW", "ArrowUp"],
  brake: ["KeyS", "ArrowDown"],
  left: ["KeyA", "ArrowLeft"],
  right: ["KeyD", "ArrowRight"],
  handbrake: ["Space"],
  boost: ["ShiftLeft", "ShiftRight"],
  respawn: ["KeyR"],
  camera: ["KeyC"],
  interact: ["KeyE", "Enter"],
  lookBack: ["KeyQ"],
  pause: ["Escape", "KeyP"],
  hud: ["KeyH"],
  item: ["KeyF"],
  item1: ["Digit1"],
  item2: ["Digit2"],
  item3: ["Digit3"],
};

export function keyLabel(code) {
  if (!code) {
    return "—";
  }
  const NAMES = {
    Space: "Пробел",
    ShiftLeft: "Shift",
    ShiftRight: "Правый Shift",
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Escape: "Esc",
    Enter: "Enter",
    ControlLeft: "Ctrl",
    ControlRight: "Правый Ctrl",
    AltLeft: "Alt",
    Tab: "Tab",
    Backspace: "Backspace",
  };
  return NAMES[code]
    ? NAMES[code]
    : code.startsWith("Key")
      ? code.slice(3)
      : code.startsWith("Digit")
        ? code.slice(5)
        : code.startsWith("Numpad")
          ? "Num " + code.slice(6)
          : code;
}

// Ввод с клавиатуры и геймпада.
export class Input {
  constructor() {
    this.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS));
    this.down = new Set();
    this.pressedQueue = new Set();
    this.listeners = [];
    this.capture = null;
    this.gamepad = null;
    this.gpPrev = {};
    this.state = {
      throttle: 0,
      brake: 0,
      steer: 0,
      handbrake: false,
      boost: false,
    };
    this.virtual = null;
    window.addEventListener("keydown", (ev) => {
      if (this.capture) {
        ev.preventDefault();
        const cb = this.capture;
        this.capture = null;
        cb(ev.code);
        return;
      }
      if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(ev.code)) {
        ev.preventDefault();
      }
      if (!this.down.has(ev.code)) {
        for (const action in this.bindings) {
          if (this.bindings[action].includes(ev.code)) {
            this.pressedQueue.add(action);
          }
        }
      }
      this.down.add(ev.code);
    });
    window.addEventListener("keyup", (ev2) => this.down.delete(ev2.code));
    window.addEventListener("blur", () => this.down.clear());
  }
  setBindings(saved) {
    for (const action in DEFAULT_BINDINGS) {
      this.bindings[action] =
        saved && saved[action] ? saved[action].slice() : DEFAULT_BINDINGS[action].slice();
    }
  }
  held(action) {
    const keys = this.bindings[action] || [];
    for (const code of keys) {
      if (this.down.has(code)) {
        return true;
      }
    }
    return false;
  }
  // Какие действия были НАЖАТЫ с прошлого кадра (для кнопок меню, камеры, паузы).
  consumePressed() {
    const pressed = new Set(this.pressedQueue);
    this.pressedQueue.clear();
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let pad = null;
    for (const p of pads) {
      if (p && p.connected) {
        pad = p;
        break;
      }
    }
    this.gamepad = pad;
    if (pad) {
      const BUTTONS = {
        9: "pause",
        3: "camera",
        2: "interact",
        1: "respawn",
        8: "hud",
        4: "lookBack",
        13: "item", // крестовина вниз — способность
        14: "item1", // крестовина влево — ракета (шкала)
        12: "item2", // вверх — нитро (шкала)
        15: "item3", // вправо — банан (шкала)
      };
      for (const btn in BUTTONS) {
        const b = pad.buttons[btn];
        const isDown = !!(b && b.pressed);
        if (isDown && !this.gpPrev[btn]) {
          pressed.add(BUTTONS[btn]);
        }
        this.gpPrev[btn] = isDown;
      }
      const NAV = {
        12: "up",
        13: "down",
        14: "left",
        15: "right",
        0: "accept",
      };
      for (const btn2 in NAV) {
        const b2 = pad.buttons[btn2];
        const isDown2 = !!(b2 && b2.pressed);
        if (isDown2 && !this.gpPrev["n" + btn2]) {
          pressed.add("nav_" + NAV[btn2]);
        }
        this.gpPrev["n" + btn2] = isDown2;
      }
    }
    return pressed;
  }
  // Текущее состояние управления машиной: { throttle, brake, steer, handbrake, boost, lookBack }.
  // Если задан this.virtual — вместо клавиатуры используется он (автопилот, тесты).
  poll() {
    const st = this.state;
    if (this.virtual) {
      Object.assign(st, this.virtual);
      return st;
    }
    let throttle = this.held("throttle") ? 1 : 0;
    let brake = this.held("brake") ? 1 : 0;
    let steer = (this.held("right") ? 1 : 0) - (this.held("left") ? 1 : 0);
    let handbrake = this.held("handbrake");
    let boost = this.held("boost");
    const pad = this.gamepad;
    if (pad) {
      const axis = pad.axes[0] || 0;
      if (Math.abs(axis) > 0.12) {
        steer = Math.sign(axis) * ((Math.abs(axis) - 0.12) / 0.88) ** 1.4;
      }
      const rt = pad.buttons[7] ? pad.buttons[7].value : 0;
      const lt = pad.buttons[6] ? pad.buttons[6].value : 0;
      if (rt > 0.05) {
        throttle = Math.max(throttle, rt);
      }
      if (lt > 0.05) {
        brake = Math.max(brake, lt);
      }
      if (pad.buttons[0] && pad.buttons[0].pressed) {
        handbrake = true;
      }
      if (pad.buttons[5] && pad.buttons[5].pressed) {
        boost = true;
      }
    }
    st.throttle = throttle;
    st.brake = brake;
    st.steer = steer;
    st.handbrake = handbrake;
    st.boost = boost;
    st.lookBack = this.held("lookBack") || !!(pad && pad.buttons[4] && pad.buttons[4].pressed);
    return st;
  }
}
