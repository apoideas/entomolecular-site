/** Procedural self-avoiding orthogonal walks (domino folds). */

import { validateFold } from "./validate_folds.js";

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

// Compact integer cell key (avoids per-step string allocations)
function cellKey(x, y) {
  return ((x + 64) << 7) | (y + 64);
}

/**
 * One self-avoiding walk of length n (n cells).
 * @param {number} n
 * @param {() => number} rnd
 * @returns {number[][] | null}
 */
export function generateFold(n = 13, rnd = Math.random) {
  const opts = new Array(4);
  for (let attempt = 0; attempt < 80; attempt++) {
    const path = [[0, 0]];
    const used = new Set([cellKey(0, 0)]);
    let ok = true;
    while (path.length < n) {
      const last = path[path.length - 1];
      const x = last[0];
      const y = last[1];
      let count = 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DIRS[d][0];
        const ny = y + DIRS[d][1];
        if (!used.has(cellKey(nx, ny))) {
          opts[count++] = [nx, ny];
        }
      }
      if (!count) {
        ok = false;
        break;
      }
      const next = opts[(rnd() * count) | 0];
      path.push(next);
      used.add(cellKey(next[0], next[1]));
    }
    if (!ok) continue;
    if (validateFold(path, n).ok) return path;
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
  const sig = (s) => {
    let out = "";
    for (let i = 0; i < s.length; i++) out += (i ? ";" : "") + s[i][0] + "," + s[i][1];
    return out;
  };
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
