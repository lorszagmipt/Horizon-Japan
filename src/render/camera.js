// Камера: положение, точка, куда смотрим, угол обзора. Из этого считаются матрицы для рендера.

import { vcross, vnormalize } from "../core/math.js";
import { mat4Create, mat4LookAt, mat4Multiply, mat4Perspective } from "../core/matrix.js";

export class Camera {
  constructor() {
    this.pos = [0, 10, -10];
    this.target = [0, 0, 0];
    this.up = [0, 1, 0];
    this.fov = 60;
    this.aspect = 16 / 9;
    this.near = 0.35;
    this.far = 5200;
    this.view = mat4Create();
    this.proj = mat4Create();
    this.viewProj = mat4Create();
  }
  update(t = this.near, e = this.far) {
    mat4LookAt(this.view, this.pos, this.target, this.up);
    mat4Perspective(this.proj, (this.fov * Math.PI) / 180, this.aspect, t, e);
    mat4Multiply(this.viewProj, this.proj, this.view);
    const s = vnormalize([
      this.target[0] - this.pos[0],
      this.target[1] - this.pos[1],
      this.target[2] - this.pos[2],
    ]);
    this.forward = s;
    this.right = vnormalize(vcross(s, this.up));
    this.upv = vcross(this.right, s);
    return this;
  }
}
