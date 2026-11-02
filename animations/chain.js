/**
 * Canonical entomolecular brand animation (embeddable).
 *
 * Fixed letter sequence folds through rectilinear conformations.
 * See web/README.md for options and shipping notes.
 *
 *   const ctrl = await mountChain(element, options?)
 */

import { filterValidFolds } from "./validate_folds.js";
import { generateFolds } from "./generate_folds.js";

const DEFAULTS = {
  letters: "ENTOMOLECULAR",
  holdMinMs: 3000,
  holdMaxMs: 5000,
  transitionMs: 2600,
  staggerMs: 55,
  jigglePx: 0.55,
  jiggleHz: 0.055,
  jiggleFollow: 1.15,
  linearEvery: 7,
  generatedFolds: 12,
  showCaption: true,
  fontFamily: '"Space Grotesk", ui-sans-serif, system-ui, sans-serif',
  /** First pose hold before the first fold. Null uses the random hold range. */
  initialHoldMs: null,
  /** Size the lattice to the element so a small header logo can still fold. */
  fitStep: false,
  /** "transparent" skips the black fill so the logo can sit over the page. */
  background: "#000",
};

function smootherstep(t) {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * x * (x * (x * 6 - 15) + 10);
}

function lerp(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
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
  const ctx = canvas.getContext("2d");

  let caption = null;
  if (cfg.showCaption) {
    caption = document.createElement("p");
    caption.className = "em-chain-caption";
    caption.textContent = "folding · click to advance";
    caption.style.cssText = [
      "position:absolute",
      "left:1.25rem",
      "bottom:0.85rem",
      "margin:0",
      "font:400 0.65rem/1.2 ui-sans-serif,system-ui,sans-serif",
      "letter-spacing:0.08em",
      "text-transform:uppercase",
      "color:#666",
      "pointer-events:none",
      "opacity:1",
      "transition:opacity 1.2s ease",
    ].join(";");
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
    if (data.letters && data.letters.length === N) {
      /* keep cfg.letters */
    }
  }

  curated = filterValidFolds(curated, N);
  if (!curated.length) throw new Error("no valid curated folds");

  const procedural = cfg.generatedFolds > 0 ? generateFolds(cfg.generatedFolds, curated, N) : [];
  const shapes = curated.concat(procedural);

  let W = 0;
  let H = 0;
  let STEP = 34;
  let foldIndex = linearIndex;
  let lastFoldIndex = -1;
  let loopCount = 0; // completed holds; every linearEvery → force linear
  let holdMs = cfg.holdMinMs;
  let targets = [];
  let fromPts = [];
  let pts = [];
  const jig = Array.from({ length: N }, () => ({ x: 0, y: 0 }));
  let phase = "hold";
  let phaseStart = 0;
  let transitionProgress = 1; // 0..1 clock within a rearrange
  let bondVis = 1; // smoothed bond visibility 0..1 (never snaps)
  const BOND_FOLLOW = 0.045;
  let captionFaded = false;
  let raf = 0;
  let alive = true;
  let fontReady = false;
  let sized = false;
  let pixelScale = window.devicePixelRatio || 1;
  let prevNow = 0;

  document.fonts?.load(`600 18px ${cfg.fontFamily}`).then(() => {
    fontReady = true;
  });

  function placeShape(shape) {
    const xs = shape.map((p) => p[0]);
    const ys = shape.map((p) => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const ox = Math.round((W - (maxX - minX) * STEP) / 2 - minX * STEP);
    const oy = Math.round((H - (maxY - minY) * STEP) / 2 - minY * STEP);
    return shape.map(([cx, cy]) => ({ x: ox + cx * STEP, y: oy + cy * STEP }));
  }

  function letterT(globalT, i) {
    const staggerSpan = (cfg.staggerMs * (N - 1)) / cfg.transitionMs;
    const start = (i / Math.max(N - 1, 1)) * staggerSpan;
    const span = 1 - staggerSpan;
    return smootherstep((globalT - start) / span);
  }

  function randomHoldMs() {
    return cfg.holdMinMs + Math.random() * (cfg.holdMaxMs - cfg.holdMinMs);
  }

  function pickNextFold() {
    loopCount += 1;
    // Every N completed transitions, show the readable linear name.
    if (cfg.linearEvery > 0 && loopCount % cfg.linearEvery === 0) {
      return linearIndex;
    }
    let next;
    do {
      next = Math.floor(Math.random() * shapes.length);
    } while (next === foldIndex && shapes.length > 1);
    return next;
  }

  function applyFold(forced) {
    fromPts = pts.map((p) => ({ ...p }));
    lastFoldIndex = foldIndex;
    foldIndex =
      forced != null
        ? ((forced % shapes.length) + shapes.length) % shapes.length
        : pickNextFold();
    targets = placeShape(shapes[foldIndex]);
    phase = reduce ? "hold" : "transition";
    phaseStart = performance.now();
    transitionProgress = reduce ? 1 : 0;
    // bondVis is not snapped — it eases via BOND_FOLLOW in update()
    if (!captionFaded && caption) {
      captionFaded = true;
      caption.style.opacity = "0";
    }
    if (reduce) {
      pts = targets.map((p) => ({ ...p }));
      jig.forEach((j) => {
        j.x = 0;
        j.y = 0;
      });
      holdMs = randomHoldMs();
      transitionProgress = 1;
      bondVis = 1;
    }
  }

  function resize() {
    const cssW = el.clientWidth || el.getBoundingClientRect().width;
    const cssH = el.clientHeight || el.getBoundingClientRect().height;
    // Extra resolution so the CSS-scaled logo does not quantize subpixel drift.
    pixelScale = (window.devicePixelRatio || 1) * 2;
    W = Math.max(1, Math.floor(cssW * pixelScale));
    H = Math.max(1, Math.floor(cssH * pixelScale));
    canvas.width = W;
    canvas.height = H;
    // Layout size, not the CSS-transformed visual size, so a scale() does not double.
    const cssMin = Math.min(cssW, cssH);
    if (cfg.fitStep) {
      STEP = Math.max(4, cssMin / 14) * pixelScale;
    } else {
      STEP = Math.round(Math.min(40, Math.max(22, cssMin * 0.038)) * pixelScale);
    }
    targets = placeShape(shapes[foldIndex]);
    if (phase !== "transition") {
      pts = targets.map((p) => ({ ...p }));
      fromPts = pts.map((p) => ({ ...p }));
      jig.forEach((j) => {
        j.x = 0;
        j.y = 0;
      });
      transitionProgress = 1;
    }
    if (!sized) {
      phase = "hold";
      phaseStart = performance.now();
      holdMs = Number.isFinite(cfg.initialHoldMs) ? cfg.initialHoldMs : randomHoldMs();
      transitionProgress = 1;
      sized = true;
    }
  }

  function bondTarget() {
    // Hold: fully visible. Transition: soft dip mid-move (ends stay brighter).
    if (phase === "hold" || reduce) return 1;
    const r = transitionProgress;
    const midDip = Math.sin(Math.PI * r); // 0→1→0
    return 1 - 0.72 * midDip;
  }

  function update(now) {
    const dt = prevNow ? Math.min(0.05, (now - prevNow) / 1000) : 0.016;
    prevNow = now;
    if (phase === "transition") {
      const raw = (now - phaseStart) / cfg.transitionMs;
      transitionProgress = Math.min(1, Math.max(0, raw));
      if (raw >= 1) {
        pts = targets.map((p) => ({ ...p }));
        jig.forEach((j) => {
          j.x = 0;
          j.y = 0;
        });
        phase = "hold";
        phaseStart = now;
        holdMs = randomHoldMs();
        transitionProgress = 1;
      } else {
        for (let i = 0; i < N; i++) {
          pts[i] = lerp(fromPts[i], targets[i], letterT(raw, i));
        }
      }
    } else {
      const t = now / 1000;
      const follow = 1 - Math.exp(-dt / Math.max(0.05, cfg.jiggleFollow));
      const amp = cfg.jigglePx * pixelScale;
      const hz = cfg.jiggleHz;
      for (let i = 0; i < N; i++) {
        const tgt = targets[i];
        if (reduce) {
          pts[i] = { x: tgt.x, y: tgt.y };
          continue;
        }
        const ph = i * 1.7;
        const wantX =
          amp *
          (0.75 * Math.sin(t * hz + ph) + 0.25 * Math.sin(t * hz * 0.57 + ph * 2.3));
        const wantY =
          amp *
          (0.75 * Math.cos(t * hz * 0.86 + ph * 1.3) +
            0.25 * Math.sin(t * hz * 0.41 + ph * 0.7));
        jig[i].x += (wantX - jig[i].x) * follow;
        jig[i].y += (wantY - jig[i].y) * follow;
        pts[i] = { x: tgt.x + jig[i].x, y: tgt.y + jig[i].y };
      }
    }
    const bondFollow = 1 - Math.exp(-dt / 0.28);
    bondVis += (bondTarget() - bondVis) * bondFollow;
  }

  function draw() {
    if (transparent) ctx.clearRect(0, 0, W, H);
    else {
      ctx.fillStyle = cfg.background;
      ctx.fillRect(0, 0, W, H);
    }

    // Bonds: opacity + width follow smoothed bondVis
    const bond =
      (0.55 + bondVis * 1.25) * Math.max(1, devicePixelRatio * 0.65);
    const alpha = 0.06 + bondVis * 0.2;
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
    ctx.lineWidth = bond;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();

    const fontPx = Math.round(Math.max(14, STEP * 0.52));
    ctx.fillStyle = "#fff";
    ctx.font = `600 ${fontPx}px ${cfg.fontFamily}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    pts.forEach((p, i) => ctx.fillText(letters[i], p.x, p.y));
    void fontReady;
  }

  function loop(now) {
    if (!alive) return;
    update(now);
    draw();
    raf = requestAnimationFrame(loop);
  }

  const onClick = () => applyFold();
  const onKey = (e) => {
    if (!el.contains(document.activeElement) && document.activeElement !== canvas) {
      /* allow when focused host */
    }
    if (e.key === "ArrowRight" || e.key === " ") {
      e.preventDefault();
      applyFold();
    }
  };

  canvas.tabIndex = 0;
  canvas.addEventListener("click", onClick);
  canvas.addEventListener("keydown", onKey);
  const ro = new ResizeObserver(() => resize());
  ro.observe(el);

  // Start on linear name
  foldIndex = linearIndex;
  resize();
  raf = requestAnimationFrame(loop);

  const holdTimer = setInterval(() => {
    if (!alive || reduce) return;
    if (phase === "hold" && performance.now() - phaseStart >= holdMs - 50) {
      applyFold();
    }
  }, 200);

  return {
    next: () => applyFold(),
    destroy() {
      alive = false;
      cancelAnimationFrame(raf);
      clearInterval(holdTimer);
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
