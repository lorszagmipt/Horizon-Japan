// Подсчёт очков за дрифт: комбо копится, пока скользишь, и «банкуется», когда дрифт закончился без удара.

export class DriftScore {
  constructor() {
    this.chain = 0;
    this.mult = 1;
    this.chainTime = 0;
    this.grace = 0;
    this.active = false;
    this.sessionBest = 0;
    this.total = 0;
    this.lastBanked = 0;
    this.bankedTimer = 0;
    this.failedTimer = 0;
  }
  reset() {
    this.chain = 0;
    this.mult = 1;
    this.chainTime = 0;
    this.grace = 0;
    this.active = false;
    this.total = 0;
  }
  // Пока машина в заносе быстрее 9 м/с — очки копятся, множитель растёт каждые 2.2 с (до ×5).
  update(dt, car) {
    const sliding = car.drifting && car.onGround && car.speed > 9 && Math.abs(car.slip) > 0.16;
    if (this.bankedTimer > 0) {
      this.bankedTimer -= dt;
    }
    if (this.failedTimer > 0) {
      this.failedTimer -= dt;
    }
    if (sliding) {
      this.active = true;
      this.grace = 1.4;
      this.chainTime += dt;
      this.mult = Math.min(5, 1 + Math.floor(this.chainTime / 2.2));
      const gain = car.speed * 3.6 * Math.min(Math.abs(car.slip), 1.1) * dt * 9 * this.mult;
      this.chain += gain;
    } else if (this.active) {
      this.grace -= dt;
      if (this.grace <= 0) {
        this.bank();
      }
    }
  }
  // Дрифт закончился без удара — очки добавляются к сумме.
  bank() {
    if (this.chain > 50) {
      this.total += this.chain;
      this.lastBanked = Math.round(this.chain);
      this.bankedTimer = 2.2;
      this.sessionBest = Math.max(this.sessionBest, Math.round(this.chain));
    }
    this.chain = 0;
    this.mult = 1;
    this.chainTime = 0;
    this.active = false;
  }
  // Удар во время дрифта — цепочка сгорает.
  fail() {
    if (this.active && this.chain > 50) {
      this.failedTimer = 2;
    }
    this.chain = 0;
    this.mult = 1;
    this.chainTime = 0;
    this.active = false;
  }
}
