(function () {
  const status = document.getElementById("status");
  const host = document.getElementById("viewport");
  if (!status || !host) return;

  const canvas = document.createElement("canvas");
  canvas.style.cssText = "display:block;width:100%;height:100%;cursor:grab";
  host.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  const COLOR = { H: "#6fd4e4", E: "#3aa8bc", C: "#d5f4f8" };
  const WIDTH = { H: 7.2, E: 5.2, C: 2.4 };
  const CYS = new Set([6, 15, 31, 39, 52, 56]);

  function parseCA(pdbText) {
    const pts = [];
    for (const line of pdbText.split("\n")) {
      if (!line.startsWith("ATOM")) continue;
      if (line.substring(12, 16).trim() !== "CA") continue;
      pts.push({
        resi: parseInt(line.substring(22, 26), 10),
        x: parseFloat(line.substring(30, 38)),
        y: parseFloat(line.substring(38, 46)),
        z: parseFloat(line.substring(46, 54)),
      });
    }
    return pts;
  }

  function center(pts) {
    let x = 0, y = 0, z = 0;
    pts.forEach(function (p) { x += p.x; y += p.y; z += p.z; });
    x /= pts.length; y /= pts.length; z /= pts.length;
    pts.forEach(function (p) { p.x -= x; p.y -= y; p.z -= z; });
  }

  let pts = [];
  let ss = {};
  let yaw = 0.4;
  let pitch = 0.2;
  let zoom = 1;
  let spinning = true;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let resumeTimer = null;
  let last = 0;
  let alive = true;
  const pointers = new Map();
  let pinchDist = 0;
  let gestureZoom = false;
  let gestureBase = 1;

  function clampZoom(value) {
    return Math.max(0.35, Math.min(4.5, value));
  }
  function pointerDistance() {
    const pts = Array.from(pointers.values());
    if (pts.length < 2) return 0;
    return Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
  }

  function sizeCanvas() {
    const rect = host.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.floor(rect.width * dpr));
    const h = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return { w: canvas.width, h: canvas.height, dpr: dpr };
  }

  function project(p, scale) {
    const cyaw = Math.cos(yaw);
    const syaw = Math.sin(yaw);
    const x1 = p.x * cyaw + p.z * syaw;
    const z1 = p.z * cyaw - p.x * syaw;
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);
    const y2 = p.y * cp - z1 * sp;
    const z2 = p.y * sp + z1 * cp;
    const depth = 320 / (320 + z2);
    return { x: x1 * scale * depth, y: y2 * scale * depth, z: z2 };
  }

  function frame(now) {
    if (!alive) return;
    const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
    last = now;
    if (spinning) yaw += dt * 0.45;

    const view = sizeCanvas();
    ctx.clearRect(0, 0, view.w, view.h);
    if (pts.length > 1 && view.w > 2 && view.h > 2) {
      const scale = Math.min(view.w, view.h) * 0.034 * zoom;
      const cx = view.w / 2;
      const cy = view.h / 2;
      const proj = pts.map(function (p) {
        return Object.assign(project(p, scale), { resi: p.resi, ss: ss[String(p.resi)] || "C" });
      });
      const segs = [];
      for (let i = 0; i < proj.length - 1; i++) segs.push([proj[i], proj[i + 1]]);
      segs.sort(function (a, b) { return (a[0].z + a[1].z) - (b[0].z + b[1].z); });
      segs.forEach(function (seg) {
        const a = seg[0];
        const b = seg[1];
        const w = (WIDTH[a.ss] || WIDTH.C) * view.dpr;
        ctx.strokeStyle = COLOR[a.ss] || COLOR.C;
        ctx.lineWidth = w;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(cx + a.x, cy - a.y);
        ctx.lineTo(cx + b.x, cy - b.y);
        ctx.stroke();
      });
      proj.forEach(function (p) {
        if (!CYS.has(p.resi)) return;
        ctx.fillStyle = "#e6c36a";
        ctx.beginPath();
        ctx.arc(cx + p.x, cy - p.y, 4.2 * view.dpr, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    requestAnimationFrame(frame);
  }

  function pauseSpin() {
    spinning = false;
    clearTimeout(resumeTimer);
  }
  function resumeSpin() {
    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(function () { spinning = true; }, 900);
  }

  host.addEventListener("pointerdown", function (event) {
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (host.setPointerCapture) host.setPointerCapture(event.pointerId);
    pauseSpin();
    canvas.style.cursor = "grabbing";
    if (pointers.size >= 2) {
      dragging = false;
      pinchDist = pointerDistance();
    } else {
      dragging = true;
      lastX = event.clientX;
      lastY = event.clientY;
    }
  });
  host.addEventListener("pointermove", function (event) {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size >= 2) {
      if (gestureZoom) return;
      const dist = pointerDistance();
      if (pinchDist > 8 && dist > 8) {
        zoom = clampZoom(zoom * (dist / pinchDist));
      }
      pinchDist = dist;
      dragging = false;
      return;
    }
    if (!dragging) return;
    const dx = event.clientX - lastX;
    const dy = event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
    yaw += dx * 0.012;
    pitch = Math.max(-1.25, Math.min(1.25, pitch + dy * 0.01));
  });
  function endPointer(event) {
    pointers.delete(event.pointerId);
    pinchDist = pointers.size >= 2 ? pointerDistance() : 0;
    if (pointers.size === 0) {
      dragging = false;
      canvas.style.cursor = "grab";
      resumeSpin();
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
      let dy = event.deltaY;
      if (event.deltaMode === 1) dy *= 16;
      else if (event.deltaMode === 2) dy *= host.clientHeight || 400;
      zoom = clampZoom(zoom * Math.exp(-dy * 0.0016));
    },
    { passive: false }
  );

  host.addEventListener("touchmove", function (event) {
    if (event.touches.length >= 2) event.preventDefault();
  }, { passive: false });

  host.addEventListener("gesturestart", function (event) {
    event.preventDefault();
    gestureZoom = true;
    gestureBase = zoom;
    pauseSpin();
  });
  host.addEventListener("gesturechange", function (event) {
    event.preventDefault();
    zoom = clampZoom(gestureBase * event.scale);
  });
  host.addEventListener("gestureend", function () {
    gestureZoom = false;
    resumeSpin();
  });

  Promise.all([
    fetch("structure_viewer/habropoda_XP_017789145_mature.pdb"),
    fetch("structure_viewer/ss_map.json"),
  ])
    .then(function (responses) {
      if (!responses[0].ok || !responses[1].ok) throw new Error("Could not load the structure.");
      return Promise.all([responses[0].text(), responses[1].json()]);
    })
    .then(function (loaded) {
      pts = parseCA(loaded[0]);
      if (pts.length < 2) throw new Error("No backbone atoms in the structure file.");
      center(pts);
      ss = (loaded[1] && loaded[1].by_resi) || {};
      status.classList.add("hidden");
      requestAnimationFrame(frame);
    })
    .catch(function (err) {
      status.textContent = String(err.message || err);
    });
})();
