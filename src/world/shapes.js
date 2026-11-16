// Простые «кирпичики» для построек: грань, усечённая пирамида (стены и крыши), брус между двумя точками,
// треугольный фронтон. Всё строится сразу с цветом и ровными (плоскими) нормалями.

// Грань из 3 или 4 точек, повёрнутая лицом в сторону hint. twoSided — видна с обеих сторон.
export function face(mb, pts, hint, col, twoSided = false) {
  const [a, b, c] = pts;
  let n = [
    (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]),
    (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]),
  ];
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  n = [n[0] / l, n[1] / l, n[2] / l];
  let p = pts;
  if (n[0] * hint[0] + n[1] * hint[1] + n[2] * hint[2] < 0) {
    n = [-n[0], -n[1], -n[2]];
    p = [...pts].reverse();
  }
  const put = (q, nn) => {
    const ids = q.map((v) => mb.vertex(v[0], v[1], v[2], nn[0], nn[1], nn[2], col));
    if (ids.length === 4) {
      mb.quad(ids[0], ids[1], ids[2], ids[3]);
    } else {
      mb.tri(ids[0], ids[1], ids[2]);
    }
  };
  put(p, n);
  if (twoSided) {
    put([...p].reverse(), [-n[0], -n[1], -n[2]]);
  }
}

// Усечённая пирамида с прямоугольным основанием: внизу w0 × d0 на высоте y0, вверху w1 × d1 на высоте y1.
// Годится и для каменного основания (сужается кверху), и для ската крыши вокруг этажа.
export function frustum(mb, w0, d0, y0, w1, d1, y1, col, cap = true) {
  const ring = (w, d, y) => [
    [-w / 2, y, -d / 2],
    [w / 2, y, -d / 2],
    [w / 2, y, d / 2],
    [-w / 2, y, d / 2],
  ];
  const A = ring(w0, d0, y0);
  const B = ring(w1, d1, y1);
  for (let k = 0; k < 4; k++) {
    const k2 = (k + 1) % 4;
    const hint = [A[k][0] + A[k2][0], 0.001, A[k][2] + A[k2][2]];
    face(mb, [A[k], A[k2], B[k2], B[k]], hint, col);
  }
  if (cap) {
    face(mb, B, [0, 1, 0], col);
  }
}

// Брус от точки p0 до p1: ширина w, высота h (вверх от линии).
export function beam(mb, p0, p1, w, h, col) {
  let u = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const ul = Math.hypot(u[0], u[1], u[2]) || 1;
  u = [u[0] / ul, u[1] / ul, u[2] / ul];
  // вбок: поперёк бруса по горизонтали
  let s = [u[2], 0, -u[0]];
  const sl = Math.hypot(s[0], s[2]);
  s = sl > 1e-4 ? [s[0] / sl, 0, s[2] / sl] : [1, 0, 0];
  // вверх: перпендикулярно брусу
  const t = [s[1] * u[2] - s[2] * u[1], s[2] * u[0] - s[0] * u[2], s[0] * u[1] - s[1] * u[0]];
  if (t[1] < 0) {
    t[0] = -t[0];
    t[1] = -t[1];
    t[2] = -t[2];
  }
  const pt = (p, a, b) => [p[0] + s[0] * a + t[0] * b, p[1] + s[1] * a + t[1] * b, p[2] + s[2] * a + t[2] * b];
  const A = [pt(p0, -w / 2, 0), pt(p0, w / 2, 0), pt(p0, w / 2, h), pt(p0, -w / 2, h)];
  const B = [pt(p1, -w / 2, 0), pt(p1, w / 2, 0), pt(p1, w / 2, h), pt(p1, -w / 2, h)];
  const neg = (v) => [-v[0], -v[1], -v[2]];
  face(mb, A, neg(u), col);
  face(mb, B, u, col);
  face(mb, [A[0], A[1], B[1], B[0]], neg(t), col);
  face(mb, [A[3], A[2], B[2], B[3]], t, col);
  face(mb, [A[1], A[2], B[2], B[1]], s, col);
  face(mb, [A[0], A[3], B[3], B[0]], neg(s), col);
}

// Треугольный фронтон: маленькая двускатная крыша, которая «выходит» из стены наружу.
// (cx, y, cz) — середина основания у стены; (dx, dz) — направление наружу; len — вынос от стены.
export function dormer(mb, cx, y, cz, dx, dz, width, height, len, roofCol, wallCol, back = 0) {
  const sx = dz;
  const sz = -dx;
  const P = (a, h, o) => [cx + sx * a + dx * o, y + h, cz + sz * a + dz * o];
  const hw = width / 2;
  // белый треугольник спереди
  face(mb, [P(-hw, 0, len), P(hw, 0, len), P(0, height, len)], [dx, 0, dz], wallCol);
  // два ската с небольшим свесом
  const e = 0.35;
  const k = height / hw;
  for (const sgn of [-1, 1]) {
    face(
      mb,
      [
        P(sgn * (hw + e), -e * k + 0.12, -back),
        P(sgn * (hw + e), -e * k + 0.12, len + 0.45),
        P(0, height + 0.12, len + 0.45),
        P(0, height + 0.12, -back),
      ],
      [sx * sgn, 1, sz * sgn],
      roofCol,
      true,
    );
  }
  // конёк
  beam(mb, P(0, height + 0.1, -back), P(0, height + 0.1, len + 0.55), 0.3, 0.16, [
    roofCol[0] * 0.8,
    roofCol[1] * 0.8,
    roofCol[2] * 0.8,
  ]);
}
