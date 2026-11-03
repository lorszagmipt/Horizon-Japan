// Генератор псевдослучайных чисел с «зерном»: одно и то же зерно — одна и та же последовательность. Благодаря этому мир каждый раз генерируется одинаково.

export function seededRandom(seed) {
  let state = seed >>> 0;
  return function () {
    state |= 0;
    state = (state + 1831565813) | 0;
    let r = Math.imul(state ^ (state >>> 15), 1 | state);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
