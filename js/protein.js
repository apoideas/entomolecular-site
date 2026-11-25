(function () {
  const status = document.getElementById("status");
  const host = document.getElementById("viewport");
  if (!status || !host) return;

  const canvas = document.createElement("canvas");
  canvas.style.cssText = "display:block;width:100%;height:100%;cursor:grab";
  host.appendChild(canvas);
  const ctx = canvas.getContext("2d", { alpha: true });

  const hud = document.getElementById("protein-hud");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Canonical Kunitz disulfide pairs verified from Habropoda laboriosa PDB (Cα–Cα: 5.61, 5.47, 6.01 Å)
  const CYS_SET = new Set([6, 15, 31, 39, 52, 56]);
  const DISULFIDES = [
    [6, 56],
    [15, 39],
    [31, 52],
  ];

  // Base RGB colors aligned to css/site.css tokens
  const RGB = {
    H: [111, 212, 228], // --cyan #6fd4e4 (alpha helix)
    E: [58, 168, 188],  // --cyan-deep #3aa8bc (beta sheet)
    C: [197, 238, 245], // --cyan-soft #c5eef5 (loop/coil)
  };
  const BG_RGB = [18, 18, 18]; // --stage #121212
  const SS_LABEL = { H: "α-helix", E: "β-sheet", C: "loop" };

  function parsePDB(pdbText) {
    const pts = [];
    const lines = pdbText.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.startsWith("ATOM")) continue;
      if (line.substring(12, 16).trim() !== "CA") continue;
      pts.push({
        resi: parseInt(line.substring(22, 26), 10),
        resn: line.substring(17, 20).trim(),
        x: parseFloat(line.substring(30, 38)),
        y: parseFloat(line.substring(38, 46)),
        z: parseFloat(line.substring(46, 54)),
        plddt: parseFloat(line.substring(60, 66)) || 0,
      });
    }
    return pts;
  }

  function centerPoints(pts) {
    let x = 0, y = 0, z = 0;
    for (let i = 0; i < pts.length; i++) {
      x += pts[i].x;
      y += pts[i].y;
      z += pts[i].z;
    }
    x /= pts.length;
    y /= pts.length;
    z /= pts.length;
    let maxR = 1;
    for (let i = 0; i < pts.length; i++) {
      pts[i].x -= x;
      pts[i].y -= y;
      pts[i].z -= z;
      const r = Math.hypot(pts[i].x, pts[i].y, pts[i].z);
      if (r > maxR) maxR = r;
    }
    return maxR;
  }

  function catmullRom(p0, p1, p2, p3, t) {
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      0.5 *
      (2 * p1 +
        (-p0 + p2) * t +
        (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
        (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
    );
  }

  function norm3(x, y, z) {
    const l = Math.hypot(x, y, z) || 1;
    return [x / l, y / l, z / l];
  }

  function buildGeometry(residues, ssMap) {
    const n = residues.length;
    const sub = 8; // 8 smooth spline samples per residue -> 448 slices
    const samples = [];

    for (let i = 0; i < n - 1; i++) {
      const p0 = residues[Math.max(0, i - 1)];
      const p1 = residues[i];
      const p2 = residues[i + 1];
      const p3 = residues[Math.min(n - 1, i + 2)];
      const ss1 = ssMap[String(p1.resi)] || "C";
      const ss2 = ssMap[String(p2.resi)] || "C";
      const isArrowEnd = ss1 === "E" && ss2 !== "E";

      for (let s = 0; s < sub; s++) {
        const t = s / sub;
        const ss = t < 0.5 ? ss1 : ss2;
        samples.push({
          x: catmullRom(p0.x, p1.x, p2.x, p3.x, t),
          y: catmullRom(p0.y, p1.y, p2.y, p3.y, t),
          z: catmullRom(p0.z, p1.z, p2.z, p3.z, t),
          ss: ss,
          resi: t < 0.5 ? p1.resi : p2.resi,
          arrowFrac: isArrowEnd && t >= 0.35 ? (t - 0.35) / 0.65 : -1,
        });
      }
    }
    const last = residues[n - 1];
    samples.push({
      x: last.x,
      y: last.y,
      z: last.z,
      ss: ssMap[String(last.resi)] || "C",
      resi: last.resi,
      arrowFrac: -1,
    });

    // Compute smooth tangents & ribbon normals (Frenet-like with flip prevention)
    let prevN = [0, 1, 0];
    for (let i = 0; i < samples.length; i++) {
      const a = samples[Math.max(0, i - 1)];
      const b = samples[Math.min(samples.length - 1, i + 1)];
      const t = norm3(b.x - a.x, b.y - a.y, b.z - a.z);
      // Curvature vector from neighbors
      const a2 = samples[Math.max(0, i - 2)];
      const b2 = samples[Math.min(samples.length - 1, i + 2)];
      let nx = a2.x - 2 * samples[i].x + b2.x;
      let ny = a2.y - 2 * samples[i].y + b2.y;
      let nz = a2.z - 2 * samples[i].z + b2.z;
      // Orthogonalize against tangent
      const dotT = nx * t[0] + ny * t[1] + nz * t[2];
      nx -= dotT * t[0];
      ny -= dotT * t[1];
      nz -= dotT * t[2];
      let nl = Math.hypot(nx, ny, nz);
      if (nl < 1e-4) {
        nx = prevN[0];
        ny = prevN[1];
        nz = prevN[2];
        nl = Math.hypot(nx, ny, nz) || 1;
      }
      nx /= nl;
      ny /= nl;
      nz /= nl;
      // Keep ribbon normal smoothly aligned (avoid 180-degree twists)
      if (nx * prevN[0] + ny * prevN[1] + nz * prevN[2] < 0) {
        nx = -nx;
        ny = -ny;
        nz = -nz;
      }
      // Smooth blend with previous normal
      const blend = norm3(
        nx * 0.28 + prevN[0] * 0.72,
        ny * 0.28 + prevN[1] * 0.72,
        nz * 0.28 + prevN[2] * 0.72
      );
      prevN = blend;
      // Binormal = T x N (ribbon face orientation)
      const bn = norm3(
        t[1] * blend[2] - t[2] * blend[1],
        t[2] * blend[0] - t[0] * blend[2],
        t[0] * blend[1] - t[1] * blend[0]
      );
      samples[i].tx = t[0];
      samples[i].ty = t[1];
      samples[i].tz = t[2];
      samples[i].bx = bn[0];
      samples[i].by = bn[1];
      samples[i].bz = bn[2];
    }

    const byResi = new Map();
    for (let i = 0; i < residues.length; i++) {
      byResi.set(residues[i].resi, residues[i]);
    }
    return { samples, byResi };
  }

  let residues = [];
  let ssMap = {};
  let samples = [];
  let byResi = new Map();
  let radius = 16;

  // Camera & physics state
  let yaw = 0.52;
  let pitch = 0.24;
  let velYaw = 0;
  let velPitch = 0;
  let zoom = 1;
  let targetZoom = 1;
  let autoSpin = !reduce;
  let dragging = false;
  let interacted = false;
  let lastX = 0;
  let lastY = 0;
  let hoverX = -1;
  let hoverY = -1;
  let resumeTimer = 0;
  let raf = 0;
  let lastTime = 0;
  let isVisible = false;
  let viewW = 0;
  let viewH = 0;
  let viewDpr = 1;
  let needsDraw = true;

  const pointers = new Map();
  let pinchDist = 0;
  let gestureZoom = false;
  let gestureBase = 1;

  // Pre-allocated projected buffers
  let projSamples = [];
  let projResidues = [];

  function clampZoom(v) {
    return Math.max(0.45, Math.min(3.4, v));
  }

  function pointerDistance() {
    const list = Array.from(pointers.values());
    if (list.length < 2) return 0;
    return Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y);
  }

  function resizeCanvas() {
    const rect = host.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    viewW = w;
    viewH = h;
    viewDpr = dpr;
    needsDraw = true;
  }

  function rotPoint(p, cy, sy, cp, sp, scale, cx, cy0, out) {
    const x1 = p.x * cy + p.z * sy;
    const z1 = p.z * cy - p.x * sy;
    const y2 = p.y * cp - z1 * sp;
    const z2 = p.y * sp + z1 * cp;
    const persp = 95 / (95 - z2); // z2 > 0 is closer to camera
    out.sx = cx + x1 * scale * persp;
    out.sy = cy0 - y2 * scale * persp;
    out.z = z2;
    out.persp = persp;
  }

  function rotVec(vx, vy, vz, cy, sy, cp, sp) {
    const x1 = vx * cy + vz * sy;
    const z1 = vz * cy - vx * sy;
    const y2 = vy * cp - z1 * sp;
    const z2 = vy * sp + z1 * cp;
    return [x1, y2, z2];
  }

  function shadeRGB(base, fog, diffuse, spec) {
    // Blend toward stage dark fog on far side, then add key + specular lift
    const r = BG_RGB[0] + (base[0] * diffuse + spec * 195 - BG_RGB[0]) * fog;
    const g = BG_RGB[1] + (base[1] * diffuse + spec * 215 - BG_RGB[1]) * fog;
    const b = BG_RGB[2] + (base[2] * diffuse + spec * 225 - BG_RGB[2]) * fog;
    return (
      "rgb(" +
      Math.max(0, Math.min(255, r | 0)) +
      "," +
      Math.max(0, Math.min(255, g | 0)) +
      "," +
      Math.max(0, Math.min(255, b | 0)) +
      ")"
    );
  }

  // Soft directional key light (upper-left front)
  const L = norm3(-0.42, 0.58, 0.70);

  function render() {
    if (!samples.length || viewW < 4 || viewH < 4) return;

    ctx.clearRect(0, 0, viewW, viewH);

    // Subtle radial ambient stage vignette directly behind the protein
    const cx = viewW * 0.5;
    const cy0 = viewH * 0.5;
    const glowR = Math.min(viewW, viewH) * 0.44;
    const bgGrad = ctx.createRadialGradient(cx, cy0, 0, cx, cy0, glowR);
    bgGrad.addColorStop(0, "rgba(111, 212, 228, 0.055)");
    bgGrad.addColorStop(0.6, "rgba(58, 168, 188, 0.018)");
    bgGrad.addColorStop(1, "rgba(18, 18, 18, 0)");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, viewW, viewH);

    const scale = (Math.min(viewW, viewH) * 0.36 * zoom) / radius;
    const cy = Math.cos(yaw);
    const sy = Math.sin(yaw);
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);

    // Project spline samples
    for (let i = 0; i < samples.length; i++) {
      rotPoint(samples[i], cy, sy, cp, sp, scale, cx, cy0, projSamples[i]);
      const bn = rotVec(samples[i].bx, samples[i].by, samples[i].bz, cy, sy, cp, sp);
      projSamples[i].bx = bn[0];
      projSamples[i].by = bn[1];
      projSamples[i].bz = bn[2];
    }

    // Project residue Cα positions (for Cys spheres, disulfide bridges, & hover hit-testing)
    const resMapProj = new Map();
    for (let i = 0; i < residues.length; i++) {
      rotPoint(residues[i], cy, sy, cp, sp, scale, cx, cy0, projResidues[i]);
      projResidues[i].meta = residues[i];
      resMapProj.set(residues[i].resi, projResidues[i]);
    }

    // Build unified Painter's Z-sorted draw list (backbone slices + disulfide bonds + Cys spheres)
    const drawList = [];

    for (let i = 0; i < samples.length - 1; i++) {
      const a = projSamples[i];
      const b = projSamples[i + 1];
      drawList.push({
        kind: 0,
        z: (a.z + b.z) * 0.5,
        a: a,
        b: b,
        s: samples[i],
      });
    }

    // Add 3 canonical Kunitz disulfide bridges (segmented for accurate Z-sorting)
    for (let d = 0; d < DISULFIDES.length; d++) {
      const pA = resMapProj.get(DISULFIDES[d][0]);
      const pB = resMapProj.get(DISULFIDES[d][1]);
      if (!pA || !pB) continue;
      const steps = 4;
      for (let k = 0; k < steps; k++) {
        const t0 = k / steps;
        const t1 = (k + 1) / steps;
        drawList.push({
          kind: 1,
          z: pA.z + (pB.z - pA.z) * ((t0 + t1) * 0.5),
          x0: pA.sx + (pB.sx - pA.sx) * t0,
          y0: pA.sy + (pB.sy - pA.sy) * t0,
          x1: pA.sx + (pB.sx - pA.sx) * t1,
          y1: pA.sy + (pB.sy - pA.sy) * t1,
          persp: (pA.persp + pB.persp) * 0.5,
        });
      }
    }

    // Add 6 cysteine sulfur spheres
    for (let i = 0; i < residues.length; i++) {
      if (!CYS_SET.has(residues[i].resi)) continue;
      const pr = projResidues[i];
      drawList.push({
        kind: 2,
        z: pr.z + 0.35, // sit cleanly at surface of backbone
        p: pr,
      });
    }

    // Sort back-to-front (smaller z is further away)
    drawList.sort(function (u, v) {
      return u.z - v.z;
    });

    // Hover hit test for subtle residue inspection
    let hoveredRes = null;
    if (hoverX >= 0 && hoverY >= 0 && !dragging) {
      let bestDist = 18 * viewDpr;
      let bestZ = -1e9;
      for (let i = 0; i < projResidues.length; i++) {
        const pr = projResidues[i];
        const dist = Math.hypot(pr.sx - hoverX, pr.sy - hoverY);
        const thresh = CYS_SET.has(pr.meta.resi) ? 20 * viewDpr : 13 * viewDpr;
        if (dist < thresh && (dist < bestDist || pr.z > bestZ)) {
          bestDist = dist;
          bestZ = pr.z;
          hoveredRes = pr;
        }
      }
    }

    const zSpan = radius * 1.15;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    for (let i = 0; i < drawList.length; i++) {
      const item = drawList[i];
      // Atmospheric depth fog: 0.36 at far back -> 1.0 at front
      const depthNorm = Math.max(0, Math.min(1, (item.z + zSpan) / (2 * zSpan)));
      const fog = 0.36 + 0.64 * depthNorm;

      if (item.kind === 0) {
        const a = item.a;
        const b = item.b;
        const s = item.s;
        const pScale = ((a.persp + b.persp) * 0.5) * viewDpr;
        const isHelix = s.ss === "H";
        const isSheet = s.ss === "E";

        // Ribbon width & 3D shading
        let width;
        if (isHelix) {
          width = 9.4 * pScale;
        } else if (isSheet) {
          // Beta ribbon flattens gracefully when viewed edge-on, flares at C-terminal arrowhead
          const face = 0.45 + 0.55 * Math.abs(a.bz);
          const arrowBoost = s.arrowFrac >= 0 ? 1.85 * (1 - s.arrowFrac) + 0.32 : 1.0;
          width = 7.4 * face * arrowBoost * pScale;
        } else {
          width = 2.8 * pScale;
        }

        // Key-light shading from ribbon orientation & camera depth
        const ndotl = Math.abs(a.bx * L[0] + a.by * L[1] + a.bz * L[2]);
        const diffuse = isSheet
          ? 0.58 + 0.48 * ndotl
          : isHelix
          ? 0.62 + 0.46 * Math.max(0.2, ndotl)
          : 0.64 + 0.36 * depthNorm;
        const spec = isHelix ? Math.pow(ndotl, 6) * 0.52 : isSheet ? Math.pow(ndotl, 7) * 0.36 : 0.08 * depthNorm;

        // 1. Dark contact silhouette outline (ChimeraX / Mol* depth separation)
        ctx.strokeStyle = "rgba(8, 10, 12, " + (0.68 * fog).toFixed(2) + ")";
        ctx.lineWidth = width + 2.4 * pScale;
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.stroke();

        // 2. Main shaded ribbon body
        ctx.strokeStyle = shadeRGB(RGB[s.ss] || RGB.C, fog, diffuse, spec);
        ctx.lineWidth = width;
        ctx.beginPath();
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
        ctx.stroke();

        // 3. Crisp specular highlight ridge along helices and front sheets
        if ((isHelix || isSheet) && depthNorm > 0.32) {
          ctx.strokeStyle = "rgba(232, 250, 255, " + (0.28 * fog * depthNorm).toFixed(2) + ")";
          ctx.lineWidth = Math.max(1, width * 0.24);
          ctx.beginPath();
          ctx.moveTo(a.sx - 0.7 * pScale, a.sy - 0.9 * pScale);
          ctx.lineTo(b.sx - 0.7 * pScale, b.sy - 0.9 * pScale);
          ctx.stroke();
        }
      } else if (item.kind === 1) {
        // Covalent disulfide bridge (S–S) in warm gold
        const w = 2.6 * item.persp * viewDpr;
        ctx.strokeStyle = "rgba(10, 8, 4, " + (0.7 * fog).toFixed(2) + ")";
        ctx.lineWidth = w + 2.2 * viewDpr;
        ctx.beginPath();
        ctx.moveTo(item.x0, item.y0);
        ctx.lineTo(item.x1, item.y1);
        ctx.stroke();

        ctx.strokeStyle = shadeRGB([230, 195, 106], fog, 0.95, 0.12);
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.moveTo(item.x0, item.y0);
        ctx.lineTo(item.x1, item.y1);
        ctx.stroke();

        // Specular filament
        ctx.strokeStyle = "rgba(255, 245, 205, " + (0.42 * fog).toFixed(2) + ")";
        ctx.lineWidth = Math.max(0.8, w * 0.32);
        ctx.beginPath();
        ctx.moveTo(item.x0, item.y0);
        ctx.lineTo(item.x1, item.y1);
        ctx.stroke();
      } else if (item.kind === 2) {
        // 3D radial-gradient gold cysteine sphere
        const pr = item.p;
        const isHot = hoveredRes && hoveredRes.meta.resi === pr.meta.resi;
        const r = (isHot ? 6.4 : 5.0) * pr.persp * viewDpr;

        // Subtle warm halo
        const halo = ctx.createRadialGradient(pr.sx, pr.sy, r * 0.4, pr.sx, pr.sy, r * 2.4);
        halo.addColorStop(0, "rgba(230, 195, 106, " + ((isHot ? 0.42 : 0.22) * fog).toFixed(2) + ")");
        halo.addColorStop(1, "rgba(230, 195, 106, 0)");
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(pr.sx, pr.sy, r * 2.4, 0, Math.PI * 2);
        ctx.fill();

        // Dark occlusion rim
        ctx.fillStyle = "rgba(8, 8, 8, " + (0.78 * fog).toFixed(2) + ")";
        ctx.beginPath();
        ctx.arc(pr.sx, pr.sy, r + 1.1 * viewDpr, 0, Math.PI * 2);
        ctx.fill();

        // 3D sphere shading
        const sg = ctx.createRadialGradient(
          pr.sx - r * 0.32,
          pr.sy - r * 0.35,
          r * 0.1,
          pr.sx,
          pr.sy,
          r
        );
        sg.addColorStop(0, "rgba(255, 247, 214, " + Math.min(1, fog + 0.15).toFixed(2) + ")");
        sg.addColorStop(0.45, shadeRGB([230, 195, 106], fog, 1.0, 0.05));
        sg.addColorStop(1, shadeRGB([120, 92, 34], fog, 0.85, 0));
        ctx.fillStyle = sg;
        ctx.beginPath();
        ctx.arc(pr.sx, pr.sy, r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Subtle HUD update (either hovered residue or quiet interaction cue)
    if (hud) {
      if (hoveredRes) {
        const m = hoveredRes.meta;
        const ssCode = ssMap[String(m.resi)] || "C";
        let partner = null;
        for (let d = 0; d < DISULFIDES.length; d++) {
          if (DISULFIDES[d][0] === m.resi) partner = DISULFIDES[d][1];
          else if (DISULFIDES[d][1] === m.resi) partner = DISULFIDES[d][0];
        }
        if (partner) {
          hud.textContent =
            "CYS " + m.resi + " — CYS " + partner + " · S–S BRIDGE · pLDDT " + m.plddt.toFixed(0);
        } else {
          hud.textContent =
            m.resn + " " + m.resi + " · " + (SS_LABEL[ssCode] || "loop") + " · pLDDT " + m.plddt.toFixed(0);
        }
        hud.classList.add("is-active");
      } else {
        hud.textContent = interacted ? "57 aa · 3 S–S bridges" : "Drag to rotate · scroll to zoom";
        hud.classList.remove("is-active");
      }
    }

    needsDraw = false;
  }

  function step(now) {
    if (!isVisible || document.hidden) {
      raf = 0;
      lastTime = 0;
      return;
    }

    const dt = lastTime ? Math.min(0.05, (now - lastTime) / 1000) : 0.016;
    lastTime = now;

    // Smooth zoom easing
    const zDiff = targetZoom - zoom;
    if (Math.abs(zDiff) > 0.0005) {
      zoom += zDiff * Math.min(1, dt * 11);
      needsDraw = true;
    }

    // Angular momentum / gentle idle spin
    if (!dragging) {
      if (Math.abs(velYaw) > 0.0002 || Math.abs(velPitch) > 0.0002) {
        yaw += velYaw;
        pitch = Math.max(-1.28, Math.min(1.28, pitch + velPitch));
        const damp = Math.exp(-dt * 4.5);
        velYaw *= damp;
        velPitch *= damp;
        needsDraw = true;
      } else if (autoSpin) {
        yaw += dt * 0.34;
        needsDraw = true;
      }
    }

    if (needsDraw) render();

    // If reduced-motion and settled, pause loop until next user input
    const moving =
      dragging ||
      autoSpin ||
      Math.abs(zDiff) > 0.0005 ||
      Math.abs(velYaw) > 0.0002 ||
      Math.abs(velPitch) > 0.0002;
    if (moving) {
      raf = requestAnimationFrame(step);
    } else {
      raf = 0;
      lastTime = 0;
    }
  }

  function wake() {
    needsDraw = true;
    if (!raf && isVisible && !document.hidden && samples.length) {
      lastTime = 0;
      raf = requestAnimationFrame(step);
    }
  }

  function pauseSpin() {
    autoSpin = false;
    clearTimeout(resumeTimer);
  }

  function resumeSpin() {
    if (reduce) return;
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(function () {
      autoSpin = true;
      wake();
    }, 1800);
  }

  // Pointer & touch controls with momentum inertia
  host.addEventListener("pointerdown", function (event) {
    interacted = true;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (host.setPointerCapture) host.setPointerCapture(event.pointerId);
    pauseSpin();
    velYaw = 0;
    velPitch = 0;
    canvas.style.cursor = "grabbing";
    if (pointers.size >= 2) {
      dragging = false;
      pinchDist = pointerDistance();
    } else {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
    }
    wake();
  });

  host.addEventListener("pointermove", function (event) {
    const rect = host.getBoundingClientRect();
    hoverX = (event.clientX - rect.left) * viewDpr;
    hoverY = (event.clientY - rect.top) * viewDpr;

    if (!pointers.has(event.pointerId)) {
      if (samples.length) wake();
      return;
    }
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2) {
      if (gestureZoom) return;
      const dist = pointerDistance();
      if (pinchDist > 8 && dist > 8) {
        targetZoom = clampZoom(targetZoom * (dist / pinchDist));
      }
      pinchDist = dist;
      dragging = false;
      wake();
      return;
    }
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    const dYaw = dx * 0.011;
    const dPitch = dy * 0.009;
    yaw += dYaw;
    pitch = Math.max(-1.28, Math.min(1.28, pitch + dPitch));
    velYaw = velYaw * 0.4 + dYaw * 0.6;
    velPitch = velPitch * 0.4 + dPitch * 0.6;
    wake();
  });

  host.addEventListener("pointerleave", function () {
    hoverX = -1;
    hoverY = -1;
    if (samples.length) wake();
  });

  function endPointer(event) {
    pointers.delete(event.pointerId);
    pinchDist = pointers.size >= 2 ? pointerDistance() : 0;
    if (pointers.size === 0) {
      dragging = false;
      canvas.style.cursor = "grab";
      resumeSpin();
      wake();
      return;
    }
    if (pointers.size === 1) {
      const remaining = pointers.values().next().value;
      lastX = remaining.x;
      lastY = remaining.y;
      dragging = true;
    }
  }
  host.addEventListener("pointerup", endPointer);
  host.addEventListener("pointercancel", endPointer);

  host.addEventListener(
    "wheel",
    function (event) {
      event.preventDefault();
      interacted = true;
      let dy = event.deltaY;
      if (event.deltaMode === 1) dy *= 16;
      else if (event.deltaMode === 2) dy *= host.clientHeight || 400;
      targetZoom = clampZoom(targetZoom * Math.exp(-dy * 0.0014));
      wake();
    },
    { passive: false }
  );

  host.addEventListener(
    "touchmove",
    function (event) {
      if (event.touches.length >= 2) event.preventDefault();
    },
    { passive: false }
  );

  host.addEventListener("gesturestart", function (event) {
    event.preventDefault();
    gestureZoom = true;
    gestureBase = targetZoom;
    pauseSpin();
  });
  host.addEventListener("gesturechange", function (event) {
    event.preventDefault();
    targetZoom = clampZoom(gestureBase * event.scale);
    wake();
  });
  host.addEventListener("gestureend", function () {
    gestureZoom = false;
    resumeSpin();
  });

  // Pause rendering whenever #findings is scrolled off-screen or browser tab is hidden
  const findingsPanel = document.getElementById("findings");
  if ("IntersectionObserver" in window && findingsPanel) {
    const io = new IntersectionObserver(
      function (entries) {
        isVisible = entries[0].isIntersecting;
        if (isVisible) {
          resizeCanvas();
          wake();
        } else if (raf) {
          cancelAnimationFrame(raf);
          raf = 0;
          lastTime = 0;
        }
      },
      { threshold: 0.05 }
    );
    io.observe(findingsPanel);
  } else {
    isVisible = true;
  }

  window.addEventListener("em:panel", function (event) {
    if (event.detail && event.detail.id === "findings") {
      isVisible = true;
      resizeCanvas();
      wake();
    }
  });

  document.addEventListener("visibilitychange", function () {
    if (!document.hidden && isVisible) wake();
  });

  const ro = new ResizeObserver(function () {
    resizeCanvas();
    if (isVisible && samples.length) wake();
  });
  ro.observe(host);

  Promise.all([
    fetch("structure_viewer/habropoda_XP_017789145_mature.pdb"),
    fetch("structure_viewer/ss_map.json"),
  ])
    .then(function (responses) {
      if (!responses[0].ok || !responses[1].ok) throw new Error("Could not load the structure.");
      return Promise.all([responses[0].text(), responses[1].json()]);
    })
    .then(function (loaded) {
      residues = parsePDB(loaded[0]);
      if (residues.length < 2) throw new Error("No backbone atoms in the structure file.");
      radius = centerPoints(residues);
      ssMap = (loaded[1] && loaded[1].by_resi) || {};
      const geom = buildGeometry(residues, ssMap);
      samples = geom.samples;
      byResi = geom.byResi;
      projSamples = Array.from({ length: samples.length }, function () {
        return { sx: 0, sy: 0, z: 0, persp: 1, bx: 0, by: 0, bz: 1 };
      });
      projResidues = Array.from({ length: residues.length }, function () {
        return { sx: 0, sy: 0, z: 0, persp: 1, meta: null };
      });
      status.classList.add("hidden");
      resizeCanvas();
      render();
      wake();
    })
    .catch(function (err) {
      status.textContent = String(err.message || err);
    });
})();
