// Матрицы 4×4 (для камеры и рендера) и проверка видимости в кадре (frustum culling).

export function mat4Create() {
  const f = new Float32Array(16);
  f[0] = f[5] = f[10] = f[15] = 1;
  return f;
}

export function mat4Multiply(out, m1, m2) {
  const s = m1[0];
  const o = m1[1];
  const i = m1[2];
  const n = m1[3];
  const a = m1[4];
  const r = m1[5];
  const c = m1[6];
  const u = m1[7];
  const h = m1[8];
  const l = m1[9];
  const m = m1[10];
  const p = m1[11];
  const d = m1[12];
  const x = m1[13];
  const v = m1[14];
  const g = m1[15];
  for (let b = 0; b < 4; b++) {
    const y = m2[b * 4];
    const k = m2[b * 4 + 1];
    const w = m2[b * 4 + 2];
    const M = m2[b * 4 + 3];
    out[b * 4] = y * s + k * a + w * h + M * d;
    out[b * 4 + 1] = y * o + k * r + w * l + M * x;
    out[b * 4 + 2] = y * i + k * c + w * m + M * v;
    out[b * 4 + 3] = y * n + k * u + w * p + M * g;
  }
  return out;
}

export function mat4Perspective(out, fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2);
  out.fill(0);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) / (near - far);
  out[11] = -1;
  out[14] = (2 * far * near) / (near - far);
  return out;
}

export function mat4Ortho(out, left, right, bottom, top, near, far) {
  out.fill(0);
  out[0] = 2 / (right - left);
  out[5] = 2 / (top - bottom);
  out[10] = -2 / (far - near);
  out[12] = -(right + left) / (right - left);
  out[13] = -(top + bottom) / (top - bottom);
  out[14] = -(far + near) / (far - near);
  out[15] = 1;
  return out;
}

export function mat4LookAt(out, eye, center, up) {
  let o = eye[0] - center[0];
  let i = eye[1] - center[1];
  let n = eye[2] - center[2];
  let a = Math.hypot(o, i, n) || 1;
  o /= a;
  i /= a;
  n /= a;
  let r = up[1] * n - up[2] * i;
  let c = up[2] * o - up[0] * n;
  let u = up[0] * i - up[1] * o;
  a = Math.hypot(r, c, u) || 1;
  r /= a;
  c /= a;
  u /= a;
  const h = i * u - n * c;
  const l = n * r - o * u;
  const m = o * c - i * r;
  out[0] = r;
  out[1] = h;
  out[2] = o;
  out[3] = 0;
  out[4] = c;
  out[5] = l;
  out[6] = i;
  out[7] = 0;
  out[8] = u;
  out[9] = m;
  out[10] = n;
  out[11] = 0;
  out[12] = -(r * eye[0] + c * eye[1] + u * eye[2]);
  out[13] = -(h * eye[0] + l * eye[1] + m * eye[2]);
  out[14] = -(o * eye[0] + i * eye[1] + n * eye[2]);
  out[15] = 1;
  return out;
}

export function frustumPlanes(m, planesOut) {
  const planes = planesOut || [
    new Float32Array(4),
    new Float32Array(4),
    new Float32Array(4),
    new Float32Array(4),
    new Float32Array(4),
    new Float32Array(4),
  ];
  const setPlane = (o, i, n, a, r) => {
    const c = Math.hypot(i, n, a);
    o[0] = i / c;
    o[1] = n / c;
    o[2] = a / c;
    o[3] = r / c;
  };
  setPlane(planes[0], m[3] + m[0], m[7] + m[4], m[11] + m[8], m[15] + m[12]);
  setPlane(planes[1], m[3] - m[0], m[7] - m[4], m[11] - m[8], m[15] - m[12]);
  setPlane(planes[2], m[3] + m[1], m[7] + m[5], m[11] + m[9], m[15] + m[13]);
  setPlane(planes[3], m[3] - m[1], m[7] - m[5], m[11] - m[9], m[15] - m[13]);
  setPlane(planes[4], m[3] + m[2], m[7] + m[6], m[11] + m[10], m[15] + m[14]);
  setPlane(planes[5], m[3] - m[2], m[7] - m[6], m[11] - m[10], m[15] - m[14]);
  return planes;
}

export function sphereInFrustum(planes, x, y, z, radius) {
  for (let k = 0; k < 6; k++) {
    const p = planes[k];
    if (p[0] * x + p[1] * y + p[2] * z + p[3] < -radius) {
      return false;
    }
  }
  return true;
}
