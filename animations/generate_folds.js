/** Procedural self-avoiding orthogonal walks (domino folds). */

import { validateFold } from "./validate_folds.js";

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function key(x, y) {
  return `${x},${y}`;
}

/**
 * One self-avoiding walk of length n (n cells).
 * @param {number} n
 * @param {() => number} rnd
 * @returns {number[][] | null}
 */
export function generateFold(n = 13, rnd = Math.random) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const path = [[0, 0]];
    const used = new Set([key(0, 0)]);
    let ok = true;
    while (path.length < n) {
      const [x, y] = path[path.length - 1];
      const opts = DIRS.map(([dx, dy]) => [x + dx, y + dy]).filter(
        ([nx, ny]) => !used.has(key(nx, ny)),
      );
      if (!opts.length) {
        ok = false;
        break;
      }
      const [nx, ny] = opts[Math.floor(rnd() * opts.length)];
      path.push([nx, ny]);
      used.add(key(nx, ny));
    }
    if (!ok) continue;
    const v = validateFold(path, n);
    if (v.ok) return path;
  }
  return null;
}

/**
 * Generate unique folds not already in `existing`.
 * @param {number} count
 * @param {number[][][]} existing
 * @param {number} n
 * @returns {number[][][]}
 */
export function generateFolds(count, existing = [], n = 13) {
  const sig = (s) => s.map(([x, y]) => `${x},${y}`).join(";");
  const seen = new Set(existing.map(sig));
  const out = [];
  let guard = 0;
  while (out.length < count && guard < count * 40) {
    guard += 1;
    const fold = generateFold(n);
    if (!fold) continue;
    const s = sig(fold);
    if (seen.has(s)) continue;
    seen.add(s);
    out.push(fold);
  }
  return out;
}
