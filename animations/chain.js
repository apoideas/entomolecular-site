/**
 * Canonical entomolecular brand animation (optimized, zero-GC hot loop).
 *
 * Fixed letter sequence folds through rectilinear conformations.
 *   const ctrl = await mountChain(element, options?)
 */

import { filterValidFolds } from "./validate_folds.js";
import { generateFolds } from "./generate_folds.js";

const DEFAULTS = {
  letters: "ENTOMOLECULAR",
  holdMinMs: 3200,
  holdMaxMs: 5200,
  transitionMs: 2400,
  staggerMs: 52,
  jigglePx: 0.55,
  jiggleHz: 0.055,
  jiggleFollow: 1.15,
  linearEvery: 7,
  generatedFolds: 10,
  showCaption: true,
  fontFamily: '"Space Grotesk", ui-sans-serif, system-ui, sans-serif',
  initialHoldMs: null,
  fitStep: false,
  background: "#000",
};

function smootherstep(t) {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * x * (x * (x * 6 - 15) + 10);
}

/**
 * @param {HTMLElement} el
 * @param {Partial<typeof DEFAULTS> & { foldsUrl?: string, shapes?: number[][][] }} [opts]
 */
export async function mountChain(el, opts = {}) {
  const cfg = { ...DEFAULTS, ...opts };
  const letters = String(cfg.letters).toUpperCase().split("");
  const N = letters.length;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  el.replaceChildren();
  el.classList.add("em-chain-host");
  const transparent = cfg.background === "transparent";
  el.style.cssText = [
    "position:relative",
    "display:block",
    "width:100%",
    "height:100%",
    cfg.fitStep ? "min-height:0" : "min-height:240px",
    `background:${transparent ? "transparent" : cfg.background}`,
    "overflow:hidden",
  ].join(";");

  const canvas = document.createElement("canvas");
  canvas.setAttribute("aria-label", letters.join("") + " folding peptide animation");
  canvas.style.cssText = "display:block;width:100%;height:100%;cursor:pointer";
  el.appendChild(canvas);
  const ctx = canvas.getContext("2d", { alpha: transparent });

  let caption = null;
  if (cfg.showCaption) {
    caption = document.createElement("p");
    caption.className = "em-chain-caption";
    caption.textContent = "folding · click to advance";
    caption.style.cssText =
      "position:absolute;left:1.25rem;bottom:0.85rem;margin:0;font:400 0.65rem/1.2 ui-sans-serif,system-ui,sans-serif;letter-spacing:0.08em;text-transform:uppercase;color:#666;pointer-events:none;opacity:1;transition:opacity 1.2s ease";
    el.appendChild(caption);
  }

  // Load curated folds
  let curated = opts.shapes || null;
  let linearIndex = 0;
  if (!curated) {
    const url = opts.foldsUrl || new URL("./folds.json", import.meta.url).href;
    const data = await fetch(url).then((r) => r.json());
    curated = data.shapes;
    linearIndex = data.linearIndex ?? 0;
  }

  curated = filterValidFolds(curated, N);
  if (!curated.length) throw new Error("no valid curated folds");

  // Precompute bounding boxes for every curated shape once
  const procedural = cfg.generatedFolds > 0 ? generateFolds(cfg.generatedFolds, curated, N) : [];
  const shapes = curated.concat(procedural);
  const shapeBounds = shapes.map((s) => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (let i = 0; i < N; i++) {
      const x = s[i][0];
      const y = s[i][1];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    return { minX, maxX, minY, maxY };
  });

  // Pre-allocated point buffers (zero GC churn per frame)
  const pts = Array.from({ length: N }, () => ({ x: 0, y: 0 }));
  const fromPts = Array.from({ length: N }, () => ({ x: 0, y: 0 }));
  const targets = Array.from({ length: N }, () => ({ x: 0, y: 0 }));
  const jig = Array.from({ length: N }, () => ({ x: 0, y: 0 }));

  let W = 0;
  let H = 0;
  let STEP = 34;
  let fontStr = "";
  let bondScale = 1;
  let pixelScale = 1;
  let foldIndex = linearIndex;
  let loopCount = 0;
  let holdMs = cfg.holdMinMs;
  let phase = "hold";
  let phaseStart = 0;
  let transitionProgress = 1;
  let bondVis = 1;
  let captionFaded = false;
  let raf = 0;
  let alive = true;
  let sized = false;
  let prevNow = 0;
  let lastHoldDraw = 0;

  const staggerSpan = (cfg.staggerMs * (N - 1)) / cfg.transitionMs;
  const invSpan = 1 / Math.max(0.01, 1 - staggerSpan);
  const invNMinus1 = 1 / Math.max(N - 1, 1);

  function fillTargets(idx) {
    const shape = shapes[idx];
    const b = shapeBounds[idx];
    const ox = Math.round((W - (b.maxX - b.minX) * STEP) * 0.5 - b.minX * STEP);
    const oy = Math.round((H - (b.maxY - b.minY) * STEP) * 0.5 - b.minY * STEP);
    for (let i = 0; i < N; i++) {
      targets[i].x = ox + shape[i][0] * STEP;
      targets[i].y = oy + shape[i][1] * STEP;
    }
  }

  function randomHoldMs() {
    return cfg.holdMinMs + Math.random() * (cfg.holdMaxMs - cfg.holdMinMs);
  }

  function pickNextFold() {
    loopCount += 1;
    if (cfg.linearEvery > 0 && loopCount % cfg.linearEvery === 0) {
      return linearIndex;
    }
    let next;
    do {
      next = (Math.random() * shapes.length) | 0;
    } while (next === foldIndex && shapes.length > 1);
    return next;
  }

  function applyFold(forced) {
    for (let i = 0; i < N; i++) {
      fromPts[i].x = pts[i].x;
      fromPts[i].y = pts[i].y;
    }
    foldIndex =
      forced != null
        ? ((forced % shapes.length) + shapes.length) % shapes.length
        : pickNextFold();
    fillTargets(foldIndex);
    phase = reduce ? "hold" : "transition";
    phaseStart = performance.now();
    transitionProgress = reduce ? 1 : 0;
    if (!captionFaded && caption) {
      captionFaded = true;
      caption.style.opacity = "0";
    }
    if (reduce) {
      for (let i = 0; i < N; i++) {
        pts[i].x = targets[i].x;
        pts[i].y = targets[i].y;
        jig[i].x = 0;
        jig[i].y = 0;
      }
      holdMs = randomHoldMs();
      transitionProgress = 1;
      bondVis = 1;
      draw();
    }
  }

  function applyCanvasDefaults() {
    const fontPx = Math.round(Math.max(14, STEP * 0.52));
    fontStr = `600 ${fontPx}px ${cfg.fontFamily}`;
    bondScale = Math.max(1, Math.min(window.devicePixelRatio || 1, 2) * 0.65);
    ctx.font = fontStr;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
  }

  function resize() {
    const rect = el.getBoundingClientRect();
    const cssW = el.clientWidth || rect.width;
    const cssH = el.clientHeight || rect.height;
    if (cssW < 2 || cssH < 2) return;
    // Cap backing scale so Retina screens stay razor-sharp without 4x overdraw
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    pixelScale = dpr * 1.25;
    W = Math.max(1, Math.floor(cssW * pixelScale));
    H = Math.max(1, Math.floor(cssH * pixelScale));
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    const cssMin = Math.min(cssW, cssH);
    if (cfg.fitStep) {
      STEP = Math.max(4, cssMin / 14) * pixelScale;
    } else {
      STEP = Math.round(Math.min(40, Math.max(22, cssMin * 0.038)) * pixelScale);
    }
    applyCanvasDefaults();
    fillTargets(foldIndex);
    if (phase !== "transition") {
      for (let i = 0; i < N; i++) {
        pts[i].x = targets[i].x;
        pts[i].y = targets[i].y;
        fromPts[i].x = targets[i].x;
        fromPts[i].y = targets[i].y;
        jig[i].x = 0;
        jig[i].y = 0;
      }
      transitionProgress = 1;
    }
    if (!sized) {
      phase = "hold";
      phaseStart = performance.now();
      holdMs = Number.isFinite(cfg.initialHoldMs) ? cfg.initialHoldMs : randomHoldMs();
      transitionProgress = 1;
      sized = true;
    }
    draw();
  }

  function update(now) {
    const dt = prevNow ? Math.min(0.05, (now - prevNow) / 1000) : 0.016;
    prevNow = now;

    if (phase === "transition") {
      const raw = (now - phaseStart) / cfg.transitionMs;
      transitionProgress = raw < 0 ? 0 : raw > 1 ? 1 : raw;
      if (raw >= 1) {
        for (let i = 0; i < N; i++) {
          pts[i].x = targets[i].x;
          pts[i].y = targets[i].y;
          jig[i].x = 0;
          jig[i].y = 0;
        }
        phase = "hold";
        phaseStart = now;
        holdMs = randomHoldMs();
        transitionProgress = 1;
      } else {
        for (let i = 0; i < N; i++) {
          const start = i * invNMinus1 * staggerSpan;
          const lt = smootherstep((raw - start) * invSpan);
          pts[i].x = fromPts[i].x + (targets[i].x - fromPts[i].x) * lt;
          pts[i].y = fromPts[i].y + (targets[i].y - fromPts[i].y) * lt;
        }
      }
    } else {
      // Frame-accurate hold trigger (replaces separate setInterval)
      if (!reduce && now - phaseStart >= holdMs) {
        applyFold();
        return;
      }
      const t = now * 0.001;
      const follow = 1 - Math.exp(-dt / Math.max(0.05, cfg.jiggleFollow));
      const amp = cfg.jigglePx * pixelScale;
      const hz = cfg.jiggleHz;
      for (let i = 0; i < N; i++) {
        const ph = i * 1.7;
        const wantX =
          amp * (0.75 * Math.sin(t * hz + ph) + 0.25 * Math.sin(t * hz * 0.57 + ph * 2.3));
        const wantY =
          amp * (0.75 * Math.cos(t * hz * 0.86 + ph * 1.3) + 0.25 * Math.sin(t * hz * 0.41 + ph * 0.7));
        jig[i].x += (wantX - jig[i].x) * follow;
        jig[i].y += (wantY - jig[i].y) * follow;
        pts[i].x = targets[i].x + jig[i].x;
        pts[i].y = targets[i].y + jig[i].y;
      }
    }

    const bondTarget =
      phase === "hold" || reduce ? 1 : 1 - 0.72 * Math.sin(Math.PI * transitionProgress);
    bondVis += (bondTarget - bondVis) * (1 - Math.exp(-dt / 0.28));
  }

  function draw() {
    if (!W || !H) return;
    if (transparent) {
      ctx.clearRect(0, 0, W, H);
    } else {
      ctx.fillStyle = cfg.background;
      ctx.fillRect(0, 0, W, H);
    }

    // Backbone bonds
    const alpha = (0.06 + bondVis * 0.2).toFixed(3);
    ctx.strokeStyle = "rgba(255,255,255," + alpha + ")";
    ctx.lineWidth = (0.55 + bondVis * 1.25) * bondScale;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < N; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();

    // Letter residues (cached font & alignment)
    ctx.fillStyle = "#fff";
    for (let i = 0; i < N; i++) {
      ctx.fillText(letters[i], pts[i].x, pts[i].y);
    }
  }

  function loop(now) {
    if (!alive || document.hidden || reduce) {
      raf = 0;
      prevNow = 0;
      return;
    }
    // 60fps during transitions; gentle 30fps cadence during quiet ambient hold
    if (phase === "hold" && now - lastHoldDraw < 32 && now - phaseStart < holdMs) {
      raf = requestAnimationFrame(loop);
      return;
    }
    if (phase === "hold") lastHoldDraw = now;
    update(now);
    draw();
    raf = requestAnimationFrame(loop);
  }

  function startLoop() {
    if (!alive || reduce || document.hidden || raf) return;
    prevNow = 0;
    raf = requestAnimationFrame(loop);
  }

  const onVisibility = () => {
    if (document.hidden) {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      prevNow = 0;
    } else {
      // Prevent stale phaseStart jump after waking a background tab
      if (phase === "hold") phaseStart = performance.now();
      startLoop();
    }
  };

  // Redraw crisp glyphs once Space Grotesk finishes loading
  if (document.fonts && document.fonts.load) {
    document.fonts.load(`600 18px ${cfg.fontFamily}`).then(() => {
      if (alive) {
        applyCanvasDefaults();
        draw();
      }
    });
  }

  const onClick = () => applyFold();
  const onKey = (e) => {
    if (e.key === "ArrowRight" || e.key === " ") {
      e.preventDefault();
      applyFold();
    }
  };

  canvas.tabIndex = 0;
  canvas.addEventListener("click", onClick);
  canvas.addEventListener("keydown", onKey);
  document.addEventListener("visibilitychange", onVisibility);

  const ro = new ResizeObserver(() => resize());
  ro.observe(el);

  foldIndex = linearIndex;
  resize();
  startLoop();

  return {
    next: () => applyFold(),
    destroy() {
      alive = false;
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVisibility);
      ro.disconnect();
      canvas.removeEventListener("click", onClick);
      canvas.removeEventListener("keydown", onKey);
      el.replaceChildren();
    },
    get foldCount() {
      return shapes.length;
    },
    get curatedCount() {
      return curated.length;
    },
    get proceduralCount() {
      return procedural.length;
    },
  };
}
