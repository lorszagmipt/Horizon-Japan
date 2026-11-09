// ТЕЛЕМЕТРИЯ НА ПОЛИГОНЕ: замеры сами начинаются и заканчиваются по тому, как едет машина.
//  • 0–100 и 0–200 км/ч — стартуй с места (стоять, потом газ). Если тормознул раньше — замер сбрасывается.
//  • 100–0 км/ч — разгонись выше 100 и тормози до полной остановки (газ не трогать).
//  • Боковая перегрузка — в повороте без заноса, в g (1 g — как сила тяжести).
// Числа показывает панель в ui.js (updateTelemetry).

const G = 9.81;

export class Telemetry {
  constructor() {
    this.reset();
  }
  reset() {
    this.top = 0; // макс. скорость, м/с
    this.t100 = null; // последний разгон 0–100, с
    this.best100 = null;
    this.t200 = null;
    this.best200 = null;
    this.brake = null; // последнее торможение 100–0: { d — метры, t — секунды }
    this.bestBrake = null;
    this.lat = 0; // боковая перегрузка сейчас (сглаженная), g
    this.maxLat = 0;
    this.slip = 0; // угол заноса, градусы
    this.sliding = false; // машина в заносе (перегрузку тогда не меряем)
    this.run = null; // идёт разгон с места
    this.stop = null; // идёт торможение со 100
    this.armed = false; // машина стояла — следующий разгон считается «с места»
    this.prev = null;
    this.carId = null;
  }
  update(dt, car, ctl) {
    if (dt <= 0) return;
    const v = car.speed;
    const kmh = v * 3.6;
    const fwd = car.vForward;
    if (car.onGround && fwd > 0) this.top = Math.max(this.top, v);

    // РАЗГОН С МЕСТА
    if (kmh < 0.5) {
      this.armed = true;
      this.run = null;
    } else if (this.armed && fwd > 0) {
      this.armed = false;
      this.run = { t: 0, peak: kmh };
    }
    if (this.run) {
      const r = this.run;
      r.t += dt;
      r.peak = Math.max(r.peak, kmh);
      if (r.t100 == null && kmh >= 100) {
        r.t100 = r.t;
        this.t100 = r.t;
        if (this.best100 == null || r.t < this.best100) this.best100 = r.t;
      }
      if (r.t200 == null && kmh >= 200) {
        r.t200 = r.t;
        this.t200 = r.t;
        if (this.best200 == null || r.t < this.best200) this.best200 = r.t;
      }
      // тормоз, заметная потеря скорости или слишком долго — замер окончен
      const slowed = kmh < r.peak - 8;
      if (r.t200 != null || ctl.brake > 0.3 || slowed || r.t > 90) this.run = null;
    }

    // ТОРМОЖЕНИЕ СО 100 ДО НУЛЯ
    const prevKmh = this.prev ? this.prev.kmh : kmh;
    if (!this.stop && prevKmh >= 100 && kmh < 100 && fwd > 0 && ctl.brake > 0.5 && ctl.throttle < 0.1) {
      this.stop = { d: 0, t: 0 };
    }
    if (this.stop) {
      this.stop.d += v * dt;
      this.stop.t += dt;
      if (ctl.throttle > 0.1 || (ctl.brake < 0.2 && !ctl.handbrake)) {
        this.stop = null;
      } else if (kmh < 0.5) {
        this.brake = { d: this.stop.d, t: this.stop.t };
        if (!this.bestBrake || this.brake.d < this.bestBrake.d) this.bestBrake = this.brake;
        this.stop = null;
      }
    }

    // БОКОВАЯ ПЕРЕГРУЗКА: как меняется скорость поперёк кузова (по кадрам, со сглаживанием).
    // Меряем только в повороте «на сцеплении»: в заносе резкие рывки ничего не говорят о машине.
    this.sliding = car.drifting || Math.abs(car.slip) > 0.17;
    if (this.sliding) {
      this.lat *= Math.exp(-dt * 4);
    } else if (this.prev && car.onGround) {
      const ax = (car.vx - this.prev.vx) / dt;
      const az = (car.vz - this.prev.vz) / dt;
      const rx = Math.cos(car.yaw);
      const rz = -Math.sin(car.yaw);
      const lat = Math.abs(ax * rx + az * rz) / G;
      const k = 1 - Math.exp(-dt / 0.3);
      this.lat += (Math.min(lat, 4) - this.lat) * k;
      if (v > 5) this.maxLat = Math.max(this.maxLat, this.lat);
    } else {
      this.lat *= 0.9;
    }
    this.slip = v > 3 ? Math.abs(car.slip) * (180 / Math.PI) : 0;
    this.prev = { vx: car.vx, vz: car.vz, kmh };
  }
  // Сейчас идёт разгон (для живого секундомера на панели)
  runningTime() {
    return this.run && this.run.t100 == null ? this.run.t : null;
  }
}
