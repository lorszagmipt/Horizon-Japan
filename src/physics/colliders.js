// Столкновения: отбойники, стволы деревьев, стены домов. Хранятся в сетке-ячейках, чтобы быстро находить ближайшие.

// Препятствия для машины: круги (type 0: стволы, столбы) и отрезки (type 1: отбойники "rail", стены "wall").
// y0..y1 — по какой высоте препятствие действует (чтобы мост не мешал ехать под ним).
export class ColliderGrid {
  constructor(cellSize = 16) {
    this.cell = cellSize;
    this.map = new Map();
    this.circles = [];
    this.segments = [];
  }
  _key(cx, cz) {
    return cx * 73856093 + cz * 19349663;
  }
  _insert(obj, minX, minZ, maxX, maxZ) {
    const cell = this.cell;
    for (let cx = Math.floor(minX / cell); cx <= Math.floor(maxX / cell); cx++) {
      for (let cz = Math.floor(minZ / cell); cz <= Math.floor(maxZ / cell); cz++) {
        const key = this._key(cx, cz);
        let list = this.map.get(key);
        if (!list) {
          list = [];
          this.map.set(key, list);
        }
        list.push(obj);
      }
    }
  }
  addCircle(x, z, radius, yMin = -1000000000, yMax = 1000000000) {
    const obj = {
      type: 0,
      x: x,
      z: z,
      r: radius,
      y0: yMin,
      y1: yMax,
      id: this.circles.length,
    };
    this.circles.push(obj);
    this._insert(obj, x - radius, z - radius, x + radius, z + radius);
    return obj;
  }
  addSegment(ax, az, bx, bz, yMin = -1000000000, yMax = 1000000000, kind = "rail") {
    const obj = {
      type: 1,
      ax: ax,
      az: az,
      bx: bx,
      bz: bz,
      y0: yMin,
      y1: yMax,
      kind: kind,
      id: this.segments.length,
    };
    this.segments.push(obj);
    this._insert(
      obj,
      Math.min(ax, bx) - 1,
      Math.min(az, bz) - 1,
      Math.max(ax, bx) + 1,
      Math.max(az, bz) + 1,
    );
    return obj;
  }
  addBox(x, z, width, depth, yaw, yMin, yMax) {
    const cosA = Math.cos(yaw);
    const sinA = Math.sin(yaw);
    const corners = [
      [-width / 2, -depth / 2],
      [width / 2, -depth / 2],
      [width / 2, depth / 2],
      [-width / 2, depth / 2],
    ].map(([dx, dz]) => [x + dx * cosA + dz * sinA, z - dx * sinA + dz * cosA]);
    for (let k = 0; k < 4; k++) {
      const p0 = corners[k];
      const p1 = corners[(k + 1) % 4];
      this.addSegment(p0[0], p0[1], p1[0], p1[1], yMin, yMax, "wall");
    }
  }
  query(x, z, radius, out = []) {
    out.length = 0;
    const cell = this.cell;
    const seen = this._seen || (this._seen = new Set());
    seen.clear();
    for (let cx = Math.floor((x - radius) / cell); cx <= Math.floor((x + radius) / cell); cx++) {
      for (let cz = Math.floor((z - radius) / cell); cz <= Math.floor((z + radius) / cell); cz++) {
        const list = this.map.get(this._key(cx, cz));
        if (list) {
          for (const obj of list) {
            const uid = obj.type * 10000000 + obj.id;
            if (!seen.has(uid)) {
              seen.add(uid);
              out.push(obj);
            }
          }
        }
      }
    }
    return out;
  }
  // Какие препятствия задевает круг (x, z, radius) на высоте y: нормаль, глубина проникновения.
  resolveCircle(x, z, radius, y, out) {
    out.length = 0;
    const near = this.query(x, z, radius + 1, this._tmp || (this._tmp = []));
    for (const obj of near) {
      if (!(y < obj.y0 - 0.5 || y > obj.y1)) {
        if (obj.type === 0) {
          const dx = x - obj.x;
          const dz = z - obj.z;
          const dist = Math.hypot(dx, dz);
          const pen = radius + obj.r - dist;
          if (pen > 0 && dist > 0.00001) {
            out.push({
              nx: dx / dist,
              nz: dz / dist,
              pen: pen,
              obj: obj,
            });
          }
        } else {
          const sx = obj.bx - obj.ax;
          const sz = obj.bz - obj.az;
          const len2 = sx * sx + sz * sz;
          let k = len2 > 0 ? ((x - obj.ax) * sx + (z - obj.az) * sz) / len2 : 0;
          k = k < 0 ? 0 : k > 1 ? 1 : k;
          const px = obj.ax + sx * k;
          const pz = obj.az + sz * k;
          const dx = x - px;
          const dz = z - pz;
          const dist = Math.hypot(dx, dz);
          const pen = radius - dist;
          if (pen > 0 && dist > 0.00001) {
            out.push({
              nx: dx / dist,
              nz: dz / dist,
              pen: pen,
              obj: obj,
            });
          }
        }
      }
    }
    return out;
  }
  // Луч от (x0, z0) к (x1, z1): доля пути до первой стены (1 — стен нет). Нужно камере.
  raycast(x0, z0, x1, z1, y) {
    let tMin = 1;
    const minX = Math.min(x0, x1);
    const maxX = Math.max(x0, x1);
    const minZ = Math.min(z0, z1);
    const maxZ = Math.max(z0, z1);
    const radius = Math.max(maxX - minX, maxZ - minZ) / 2 + 2;
    const near = this.query((x0 + x1) / 2, (z0 + z1) / 2, radius, this._tmp2 || (this._tmp2 = []));
    const dx = x1 - x0;
    const dz = z1 - z0;
    for (const seg of near) {
      if (seg.type !== 1 || seg.kind !== "wall" || y < seg.y0 || y > seg.y1) {
        continue;
      }
      const sx = seg.bx - seg.ax;
      const sz = seg.bz - seg.az;
      const den = dx * sz - dz * sx;
      if (Math.abs(den) < 0.000001) {
        continue;
      }
      const tRay = ((seg.ax - x0) * sz - (seg.az - z0) * sx) / den;
      const tSeg = ((seg.ax - x0) * dz - (seg.az - z0) * dx) / den;
      if (tRay >= 0 && tRay <= 1 && tSeg >= 0 && tSeg <= 1 && tRay < tMin) {
        tMin = tRay;
      }
    }
    return tMin;
  }
}
