// Звук: мотор, шины, удары, интерфейс, музыка и птицы — всё синтезируется на лету через Web Audio.

import { clamp } from "../core/math.js";
import { biomeAt } from "../world/biomes.js";

export class AudioEngine {
  constructor(t) {
    this.settings = t;
    this.ctx = null;
    this.ok = false;
    this.paused = false;
    this.nextNote = 0;
    this.step = 0;
    this.birdT = 2;
  }
  resume() {
    try {
      if (!this.ctx) {
        this.init();
      }
      if (this.ctx && this.ctx.state === "suspended") {
        this.ctx.resume();
      }
    } catch {
      this.ok = false;
    }
  }
  init() {
    const t = window.AudioContext || window.webkitAudioContext;
    if (!t) {
      return;
    }
    const e = new t();
    this.ctx = e;
    const s = (b = 1, y) => {
      const k = e.createGain();
      k.gain.value = b;
      k.connect(y || this.master);
      return k;
    };
    this.master = e.createGain();
    const o = e.createDynamicsCompressor();
    o.threshold.value = -14;
    o.ratio.value = 3;
    this.master.connect(o);
    o.connect(e.destination);
    this.busEngine = s(1);
    this.busSfx = s(1);
    this.busAmb = s(1);
    this.busMusic = s(1);
    const i = e.sampleRate * 2;
    const n = e.createBuffer(1, i, e.sampleRate);
    const a = n.getChannelData(0);
    for (let b = 0; b < i; b++) {
      a[b] = Math.random() * 2 - 1;
    }
    this.noiseBuf = n;
    const r = () => {
      const b = e.createBufferSource();
      b.buffer = n;
      b.loop = true;
      b.start();
      return b;
    };
    this.engGain = s(0, this.busEngine);
    this.engFilter = e.createBiquadFilter();
    this.engFilter.type = "lowpass";
    this.engFilter.Q.value = 2.5;
    const c = e.createWaveShaper();
    const u = new Float32Array(1024);
    for (let b = 0; b < 1024; b++) {
      const y = b / 512 - 1;
      u[b] = Math.tanh(y * 2.2);
    }
    c.curve = u;
    this.engFilter.connect(c);
    c.connect(this.engGain);
    this.osc = [];
    for (const [b, y, k] of [
      ["sawtooth", 1, 0.32],
      ["sawtooth", 1.007, 0.25],
      ["square", 0.5, 0.22],
      ["triangle", 2, 0.12],
    ]) {
      const w = e.createOscillator();
      w.type = b;
      const M = e.createGain();
      M.gain.value = k;
      w.connect(M);
      M.connect(this.engFilter);
      w.start();
      this.osc.push({
        o: w,
        mul: y,
      });
    }
    const h = r();
    this.intakeF = e.createBiquadFilter();
    this.intakeF.type = "bandpass";
    this.intakeF.Q.value = 1.2;
    this.intakeG = s(0, this.busEngine);
    h.connect(this.intakeF);
    this.intakeF.connect(this.intakeG);
    const l = r();
    this.tireF = e.createBiquadFilter();
    this.tireF.type = "bandpass";
    this.tireF.frequency.value = 1100;
    this.tireF.Q.value = 4;
    this.tireG = s(0, this.busEngine);
    l.connect(this.tireF);
    this.tireF.connect(this.tireG);
    const m = r();
    this.gravF = e.createBiquadFilter();
    this.gravF.type = "lowpass";
    this.gravF.frequency.value = 600;
    this.gravG = s(0, this.busEngine);
    m.connect(this.gravF);
    this.gravF.connect(this.gravG);
    const p = r();
    this.windF = e.createBiquadFilter();
    this.windF.type = "lowpass";
    this.windG = s(0, this.busAmb);
    p.connect(this.windF);
    this.windF.connect(this.windG);
    const d = r();
    this.waterF = e.createBiquadFilter();
    this.waterF.type = "bandpass";
    this.waterF.frequency.value = 900;
    this.waterF.Q.value = 0.6;
    this.waterG = s(0, this.busAmb);
    d.connect(this.waterF);
    this.waterF.connect(this.waterG);
    this.musicIn = e.createGain();
    this.musicIn.connect(this.busMusic);
    const x = e.createDelay(1);
    x.delayTime.value = 0.38;
    const v = e.createGain();
    v.gain.value = 0.38;
    const g = e.createBiquadFilter();
    g.type = "lowpass";
    g.frequency.value = 2200;
    this.musicIn.connect(x);
    x.connect(g);
    g.connect(v);
    v.connect(x);
    g.connect(this.busMusic);
    this.nextNote = e.currentTime + 0.5;
    this.ok = true;
    this.applyVolumes();
  }
  applyVolumes() {
    if (!this.ok) {
      return;
    }
    const t = this.settings.volume;
    const e = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(t.master, e, 0.05);
    this.busEngine.gain.setTargetAtTime(t.engine, e, 0.05);
    this.busSfx.gain.setTargetAtTime(Math.max(t.engine, 0.3), e, 0.05);
    this.busAmb.gain.setTargetAtTime(t.ambient, e, 0.05);
    this.busMusic.gain.setTargetAtTime(t.music * 0.55, e, 0.05);
  }
  setPaused(t) {
    this.paused = t;
  }
  _env(t, e, s, o, i) {
    t.gain.setValueAtTime(0.0001, e);
    t.gain.exponentialRampToValueAtTime(o, e + s);
    t.gain.exponentialRampToValueAtTime(0.0001, e + s + i);
  }
  tone(t, e, s = "sine", o = 0.2, i, n) {
    if (!this.ok) {
      return;
    }
    const a = this.ctx;
    const r = a.currentTime;
    const c = a.createOscillator();
    c.type = s;
    c.frequency.setValueAtTime(t, r);
    if (n) {
      c.frequency.exponentialRampToValueAtTime(n, r + e);
    }
    const u = a.createGain();
    c.connect(u);
    u.connect(i || this.busSfx);
    this._env(u, r, 0.005, o, e);
    c.start(r);
    c.stop(r + e + 0.05);
  }
  noiseHit(t, e, s) {
    if (!this.ok) {
      return;
    }
    const o = this.ctx;
    const i = o.currentTime;
    const n = o.createBufferSource();
    n.buffer = this.noiseBuf;
    const a = o.createBiquadFilter();
    a.type = "lowpass";
    a.frequency.value = e;
    const r = o.createGain();
    n.connect(a);
    a.connect(r);
    r.connect(this.busSfx);
    this._env(r, i, 0.004, s, t);
    n.start(i, Math.random());
    n.stop(i + t + 0.05);
  }
  ui(t) {
    this.tone(t ? 880 : 660, 0.06, "triangle", 0.06);
  }
  beep(t) {
    if (t === 2) {
      this.tone(1046, 0.5, "square", 0.12);
      this.tone(1568, 0.5, "triangle", 0.08);
    } else {
      this.tone(523, 0.18, "square", 0.1);
    }
  }
  chime() {
    [784, 988, 1318].forEach((t, e) =>
      setTimeout(() => this.tone(t, 0.35, "triangle", 0.09), e * 70),
    );
  }
  fanfare() {
    [523, 659, 784, 1046, 1318].forEach((t, e) =>
      setTimeout(() => this.tone(t, 0.5, "triangle", 0.1), e * 110),
    );
  }
  impact(t) {
    if (t > 0.05) {
      this.noiseHit(0.25 + t * 0.3, 500 + t * 900, 0.15 + t * 0.6);
      this.tone(70, 0.25, "sine", 0.2 * t);
    }
  }
  shift(t) {
    if (t) {
      this.noiseHit(0.05, 2500, 0.05);
      this.tone(140, 0.07, "square", 0.04);
    }
  }
  music() {
    const t = this.ctx;
    const s = 60 / 76 / 2;
    const o = [62, 64, 67, 69, 71, 74, 76, 79, 81, 83];
    const i = [
      [50, 57, 62, 66],
      [47, 54, 59, 62],
      [43, 50, 55, 59],
      [45, 52, 57, 61],
    ];
    const n = (a) => 440 * Math.pow(2, (a - 69) / 12);
    while (this.nextNote < t.currentTime + 0.6) {
      const a = this.nextNote;
      const r = Math.floor(this.step / 16) % 4;
      const c = this.step % 16;
      if (c === 0) {
        for (const m of i[r]) {
          const p = t.createOscillator();
          p.type = "triangle";
          p.frequency.value = n(m);
          const d = t.createOscillator();
          d.type = "sine";
          d.frequency.value = n(m) * 1.003;
          const x = t.createGain();
          p.connect(x);
          d.connect(x);
          x.connect(this.musicIn);
          x.gain.setValueAtTime(0.0001, a);
          x.gain.exponentialRampToValueAtTime(0.035, a + 1.2);
          x.gain.exponentialRampToValueAtTime(0.0001, a + s * 16 + 0.6);
          p.start(a);
          d.start(a);
          p.stop(a + s * 16 + 0.8);
          d.stop(a + s * 16 + 0.8);
        }
        const h = t.createOscillator();
        h.type = "sine";
        h.frequency.value = n(i[r][0] - 12);
        const l = t.createGain();
        h.connect(l);
        l.connect(this.musicIn);
        this._env(l, a, 0.05, 0.08, s * 14);
        h.start(a);
        h.stop(a + s * 15);
      }
      const u = [1, 0, 0.5, 0, 0.8, 0, 0.4, 0.3, 0.9, 0, 0.5, 0, 0.7, 0.2, 0.4, 0][c];
      if (Math.random() < u * 0.85) {
        this.melIdx = clamp(
          (this.melIdx || 4) + Math.round((Math.random() - 0.5) * 3.2),
          0,
          o.length - 1,
        );
        const h = n(o[this.melIdx]);
        const l = t.createOscillator();
        l.type = "triangle";
        l.frequency.setValueAtTime(h * 1.01, a);
        l.frequency.exponentialRampToValueAtTime(h, a + 0.05);
        const m = t.createOscillator();
        m.type = "sine";
        m.frequency.value = h * 2;
        const p = t.createGain();
        const d = t.createGain();
        d.gain.value = 0.3;
        l.connect(p);
        m.connect(d);
        d.connect(p);
        p.connect(this.musicIn);
        this._env(p, a, 0.004, 0.07, 1.1);
        l.start(a);
        m.start(a);
        l.stop(a + 1.3);
        m.stop(a + 1.3);
      }
      if (c % 4 === 2 && Math.random() < 0.6) {
        const h = t.createBufferSource();
        h.buffer = this.noiseBuf;
        const l = t.createBiquadFilter();
        l.type = "highpass";
        l.frequency.value = 6000;
        const m = t.createGain();
        h.connect(l);
        l.connect(m);
        m.connect(this.musicIn);
        this._env(m, a, 0.002, 0.025, 0.06);
        h.start(a, Math.random());
        h.stop(a + 0.1);
      }
      this.nextNote += s;
      this.step++;
    }
  }
  bird() {
    const t = this.ctx;
    const e = t.currentTime;
    const s = 2200 + Math.random() * 1800;
    const o = 2 + Math.floor(Math.random() * 4);
    for (let i = 0; i < o; i++) {
      const n = e + i * (0.09 + Math.random() * 0.05);
      const a = t.createOscillator();
      a.type = "sine";
      a.frequency.setValueAtTime(s, n);
      a.frequency.exponentialRampToValueAtTime(s * (1.3 + Math.random() * 0.4), n + 0.06);
      const r = t.createGain();
      a.connect(r);
      r.connect(this.busAmb);
      this._env(r, n, 0.005, 0.03, 0.07);
      a.start(n);
      a.stop(n + 0.12);
    }
  }
  update(t, e) {
    if (!this.ok) {
      return;
    }
    this.applyVolumes();
    const s = this.ctx;
    const o = s.currentTime;
    const i = e.car;
    const n = (e.state === "drive" || e.state === "results") && !this.paused;
    const a = e.controls ? e.controls.throttle : 0;
    const r = i.rpm;
    const c = 28 + r * 0.026;
    for (const b of this.osc) {
      b.o.frequency.setTargetAtTime(c * b.mul, o, 0.03);
    }
    this.engFilter.frequency.setTargetAtTime(400 + a * 2200 + r * 0.25, o, 0.05);
    const u = n ? 0.1 + a * 0.12 + (r / 8000) * 0.05 : e.state === "garage" ? 0.06 : 0;
    this.engGain.gain.setTargetAtTime(u, o, 0.08);
    this.intakeF.frequency.setTargetAtTime(300 + r * 0.3, o, 0.05);
    this.intakeG.gain.setTargetAtTime(n ? a * 0.06 : 0, o, 0.08);
    const h = i.onGround ? Math.abs(i.slip) : 0;
    const l =
      n &&
      (i.drifting || (e.controls && e.controls.handbrake && i.speed > 4)) &&
      i.surface !== "grass"
        ? clamp(h * 1.5, 0.2, 1) * clamp(i.speed / 15, 0, 1)
        : 0;
    this.tireG.gain.setTargetAtTime(l * 0.18, o, 0.05);
    this.tireF.frequency.setTargetAtTime(900 + i.speed * 6, o, 0.1);
    const m =
      n && i.onGround && (i.surface === "grass" || i.surface === "gravel")
        ? clamp(i.speed / 25, 0, 1)
        : 0;
    this.gravG.gain.setTargetAtTime(m * 0.16, o, 0.08);
    const p = n ? i.speed : 3;
    this.windF.frequency.setTargetAtTime(300 + p * 22, o, 0.1);
    this.windG.gain.setTargetAtTime(0.015 + clamp(p / 60, 0, 1) ** 2 * 0.14, o, 0.15);
    const d = e.cam.pos;
    let x = Infinity;
    const v = e.world;
    for (const b of v.terrain.lakes) {
      x = Math.min(x, Math.hypot(b.x - d[0], b.z - d[2]) - Math.max(b.rx, b.rz));
    }
    const g = v.terrain.riverQuery(d[0], d[2]);
    if (g) {
      x = Math.min(x, g.d);
    }
    if (v.waterfallPos) {
      x = Math.min(x, Math.hypot(v.waterfallPos[0] - d[0], v.waterfallPos[2] - d[2]) - 10);
    }
    this.waterG.gain.setTargetAtTime(clamp(1 - x / 90, 0, 1) * 0.09, o, 0.3);
    this.birdT -= t;
    if (this.birdT <= 0) {
      const [b, y] = biomeAt(d[0], d[2]);
      this.birdT = 1.5 + Math.random() * 4;
      if (Math.random() < (b + y) * 0.9 + 0.15 && p < 30) {
        this.bird();
      }
    }
    if (this.settings.volume.music > 0.01) {
      this.music();
    } else {
      this.nextNote = o + 0.3;
    }
  }
}
