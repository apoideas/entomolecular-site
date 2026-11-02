/** Validate rectilinear domino folds (orthogonal, no overlaps). */

/**
 * @param {number[][]} shape
 * @param {number} n
 * @returns {{ ok: boolean, reason?: string }}
 */
export function validateFold(shape, n = 13) {
  if (!Array.isArray(shape) || shape.length !== n) {
    return { ok: false, reason: `expected length ${n}` };
  }
  const seen = new Set();
  for (let i = 0; i < shape.length; i++) {
    const p = shape[i];
    if (!Array.isArray(p) || p.length !== 2) {
      return { ok: false, reason: `bad point at ${i}` };
    }
    const [x, y] = p;
    if (!Number.isInteger(x) || !Number.isInteger(y)) {
      return { ok: false, reason: `non-integer at ${i}` };
    }
    const key = `${x},${y}`;
    if (seen.has(key)) return { ok: false, reason: `overlap at ${key}` };
    seen.add(key);
    if (i > 0) {
      const [px, py] = shape[i - 1];
      const d = Math.abs(x - px) + Math.abs(y - py);
      if (d !== 1) return { ok: false, reason: `non-orthogonal edge at ${i}` };
    }
  }
  return { ok: true };
}

/**
 * @param {number[][][]} shapes
 * @param {number} n
 * @returns {number[][][]}
 */
export function filterValidFolds(shapes, n = 13) {
  return shapes.filter((s) => validateFold(s, n).ok);
}
