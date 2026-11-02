(function () {
  const deck = document.getElementById("deck");
  const panels = Array.from(deck.querySelectorAll(".panel"));
  const up = document.querySelector(".arrow-up");
  const down = document.querySelector(".arrow-down");
  const toggle = document.querySelector(".nav-toggle");
  const panel = document.getElementById("nav-panel");
  const menu = document.querySelector(".menu");
  const logo = document.getElementById("logo-float");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  let index = 0;
  let lock = false;

  function height() {
    return panels[0].offsetHeight || window.innerHeight;
  }

  const mobileLogo = matchMedia("(max-width: 800px)");

  let coverIdle = 0;
  let coverFrame = 0;

  function textHitsLogo() {
    const raw = logo.getBoundingClientRect();
    const insetX = raw.width * 0.2;
    const insetY = raw.height * 0.22;
    const box = {
      left: raw.left + insetX,
      right: raw.right - insetX,
      top: raw.top + insetY,
      bottom: raw.bottom - insetY,
    };
    if (box.right - box.left < 8 || box.bottom - box.top < 8) return false;
    const nodes = panels[index].querySelectorAll("h1, h2, p, li");
    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      if (!node.textContent || !node.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = range.getClientRects();
      for (let j = 0; j < rects.length; j++) {
        const r = rects[j];
        if (r.width < 1 || r.height < 1) continue;
        if (r.left < box.right && r.right > box.left && r.top < box.bottom && r.bottom > box.top) {
          return true;
        }
      }
    }
    return false;
  }

  function logoCover() {
    if (!logo) return;
    if (lock || !logo.classList.contains("is-docked") || !mobileLogo.matches) {
      if (!lock && logo) logo.classList.remove("is-covered");
      return;
    }
    logo.classList.toggle("is-covered", textHitsLogo());
  }

  function onContentScroll() {
    if (lock || !logo || !logo.classList.contains("is-docked") || !mobileLogo.matches) return;
    if (coverFrame) return;
    coverFrame = requestAnimationFrame(function () {
      coverFrame = 0;
      if (textHitsLogo()) logo.classList.add("is-covered");
      clearTimeout(coverIdle);
      coverIdle = setTimeout(logoCover, 280);
    });
  }

  function scheduleLogoCover() {
    clearTimeout(coverIdle);
    coverIdle = setTimeout(logoCover, 900);
  }

  function sync() {
    const wasDocked = !!(logo && logo.classList.contains("is-docked"));
    up.hidden = index === 0;
    down.hidden = index === panels.length - 1;
    if (logo) logo.classList.toggle("is-docked", index > 0);
    if (!logo || !logo.classList.contains("is-docked") || !mobileLogo.matches) {
      if (logo) logo.classList.remove("is-covered");
      return;
    }
    if (wasDocked) logoCover();
    else scheduleLogoCover();
  }

  function go(next) {
    if (lock) return;
    next = Math.max(0, Math.min(panels.length - 1, next));
    if (next === index) return;
    lock = true;
    const forward = next > index;
    index = next;
    const dest = panels[index];
    if (forward) dest.scrollTop = 0;
    else dest.scrollTop = Math.max(0, dest.scrollHeight - dest.clientHeight);
    sync();
    const top = index * height();
    if (reduce) {
      deck.scrollTop = top;
      lock = false;
      logoCover();
      return;
    }
    const start = deck.scrollTop;
    const dist = top - start;
    const t0 = performance.now();
    (function frame(now) {
      const t = Math.min(1, (now - t0) / 850);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      deck.scrollTop = start + dist * e;
      if (t < 1) requestAnimationFrame(frame);
      else {
        lock = false;
        logoCover();
        if (index === 1 && typeof window.emProteinResize === "function") window.emProteinResize();
      }
    })(performance.now());
  }

  document.querySelectorAll(".arrow").forEach(function (button) {
    button.addEventListener("click", function () {
      go(index + Number(button.getAttribute("data-dir")));
    });
  });

  if (logo) {
    logo.addEventListener("transitionend", function (event) {
      if (event.propertyName === "transform") logoCover();
    });
    logo.addEventListener(
      "click",
      function (event) {
        if (!logo.classList.contains("is-docked")) return;
        event.preventDefault();
        event.stopPropagation();
        go(0);
      },
      true
    );
  }

  window.addEventListener(
    "wheel",
    function (event) {
      if (event.target.closest && event.target.closest("#viewport, .stage")) return;
      const down = event.deltaY > 0;
      if (innerScrollAbsorbs(event.target, down ? -1 : 1)) return;
      event.preventDefault();
      if (Math.abs(event.deltaY) < 6) return;
      go(index + (down ? 1 : -1));
    },
    { passive: false }
  );

  let touchY = null;
  let touchOnStructure = false;
  let multiTouch = false;
  window.addEventListener(
    "touchstart",
    function (event) {
      if (event.touches.length > 1) multiTouch = true;
      touchY = event.touches[0].clientY;
      const target = event.target;
      touchOnStructure = !!(target.closest && target.closest("#viewport, .stage"));
    },
    { passive: true }
  );
  window.addEventListener(
    "touchmove",
    function (event) {
      if (event.touches.length > 1) multiTouch = true;
    },
    { passive: true }
  );
  window.addEventListener("touchend", function (event) {
    if (multiTouch) {
      if (event.touches.length === 0) {
        multiTouch = false;
        touchY = null;
      }
      return;
    }
    if (touchY == null || touchOnStructure) {
      touchY = null;
      return;
    }
    const dy = event.changedTouches[0].clientY - touchY;
    const target = event.target;
    touchY = null;
    if (Math.abs(dy) < 48) return;
    if (innerScrollAbsorbs(target, dy)) return;
    go(index + (dy < 0 ? 1 : -1));
  });

  function innerScrollAbsorbs(start, dy) {
    let node = start && start.nodeType === 1 ? start : null;
    while (node && node !== document.body) {
      const style = window.getComputedStyle(node);
      const canScroll = /(auto|scroll)/.test(style.overflowY);
      if (canScroll && node.scrollHeight > node.clientHeight + 4) {
        if (dy < 0 && node.scrollTop + node.clientHeight < node.scrollHeight - 4) return true;
        if (dy > 0 && node.scrollTop > 4) return true;
      }
      node = node.parentElement;
    }
    return false;
  }

  window.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && panel && !panel.hidden) {
      setMenu(false);
      return;
    }
    if (event.key === "ArrowDown" || event.key === "PageDown") {
      event.preventDefault();
      go(index + 1);
    } else if (event.key === "ArrowUp" || event.key === "PageUp") {
      event.preventDefault();
      go(index - 1);
    }
  });

  panels.forEach(function (page) {
    page.addEventListener("scroll", onContentScroll, { passive: true });
  });

  window.addEventListener("resize", function () {
    deck.scrollTop = index * height();
    logoCover();
  });

  function setMenu(open) {
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "Close menu" : "Menu");
    panel.hidden = !open;
  }

  toggle.addEventListener("click", function (event) {
    event.stopPropagation();
    setMenu(panel.hidden);
  });

  panel.querySelectorAll("[data-go]").forEach(function (item) {
    item.addEventListener("click", function () {
      const next = panels.findIndex(function (page) {
        return page.id === item.getAttribute("data-go");
      });
      setMenu(false);
      if (next >= 0) go(next);
    });
  });

  document.addEventListener("click", function (event) {
    if (panel.hidden) return;
    if (menu && menu.contains(event.target)) return;
    setMenu(false);
  });

  sync();
})();
