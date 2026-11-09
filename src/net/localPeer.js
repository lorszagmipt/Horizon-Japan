// «Сеть» внутри одного браузера: две вкладки игры общаются через BroadcastChannel.
// Повторяет нужную часть интерфейса PeerJS (Peer, connect, on('connection'), send),
// поэтому вся сетевая логика работает одинаково. Включается адресом ...?netlocal
// (удобно проверять мультиплеер одному: открой игру в двух вкладках).

const CHANNEL = "horizon-japan-net";

class Emitter {
  constructor() {
    this.handlers = {};
  }
  on(ev, fn) {
    (this.handlers[ev] || (this.handlers[ev] = [])).push(fn);
    return this;
  }
  emit(ev, ...args) {
    for (const fn of this.handlers[ev] || []) fn(...args);
  }
}

class LocalConn extends Emitter {
  constructor(peer, remoteId) {
    super();
    this.peer = peer;
    this.peerId = remoteId;
    this.open = false;
  }
  send(data) {
    if (!this.open) return;
    this.peer.post({ kind: "data", to: this.peerId, data });
  }
  close() {
    if (!this.open) return;
    this.open = false;
    this.peer.post({ kind: "close", to: this.peerId });
    this.peer.conns.delete(this.peerId);
    this.emit("close");
  }
}

export class LocalPeer extends Emitter {
  constructor(id) {
    super();
    this.id = id || "local-" + Math.random().toString(36).slice(2, 8);
    this.conns = new Map();
    this.bc = new BroadcastChannel(CHANNEL);
    this.bc.onmessage = (e) => this.receive(e.data);
    // как у PeerJS: если такой id уже занят другой вкладкой — ошибка unavailable-id
    this.post({ kind: "who", to: this.id });
    this.taken = false;
    setTimeout(() => {
      if (this.taken) this.emit("error", { type: "unavailable-id", message: "id занят" });
      else this.emit("open", this.id);
    }, 150);
  }
  post(msg) {
    msg.from = this.id;
    this.bc.postMessage(msg);
  }
  receive(m) {
    if (m.kind === "who" && m.to === this.id && m.from !== this.id) {
      this.post({ kind: "here", to: m.from });
      return;
    }
    if (m.to !== this.id) return;
    if (m.kind === "here") {
      this.taken = true;
    } else if (m.kind === "connect") {
      const c = new LocalConn(this, m.from);
      this.conns.set(m.from, c);
      this.emit("connection", c);
      this.post({ kind: "accept", to: m.from });
      setTimeout(() => {
        c.open = true;
        c.emit("open");
      }, 0);
    } else if (m.kind === "accept") {
      const c = this.conns.get(m.from);
      if (c && !c.open) {
        c.open = true;
        clearTimeout(c.timer);
        c.emit("open");
      }
    } else if (m.kind === "data") {
      const c = this.conns.get(m.from);
      if (c && c.open) c.emit("data", m.data);
    } else if (m.kind === "close") {
      const c = this.conns.get(m.from);
      if (c) {
        c.open = false;
        this.conns.delete(m.from);
        c.emit("close");
      }
    }
  }
  connect(id) {
    const c = new LocalConn(this, id);
    this.conns.set(id, c);
    this.post({ kind: "connect", to: id });
    c.timer = setTimeout(() => {
      if (!c.open) {
        this.conns.delete(id);
        this.emit("error", { type: "peer-unavailable", message: "нет такой комнаты" });
      }
    }, 2500);
    return c;
  }
  destroy() {
    for (const c of [...this.conns.values()]) c.close();
    this.bc.close();
  }
}
