(function () {
  const modal = document.getElementById("figure-modal");
  if (!modal) return;

  const dialog = modal.querySelector(".figure-dialog");
  const viewport = document.getElementById("figure-viewport");
  const statusEl = document.getElementById("figure-status");
  const titleEl = document.getElementById("figure-title");
  const bodyEl = document.getElementById("figure-body");
  const sourceEl = document.getElementById("figure-source");
  const closeBtn = modal.querySelector(".figure-close");
  const backdrop = modal.querySelector(".figure-backdrop");
  const tabs = Array.from(modal.querySelectorAll(".figure-tab"));
  const triggers = Array.from(document.querySelectorAll("[data-figure]"));

  const ORDER = ["core", "morphospace", "novelty"];

  const FIGURES = {
    core: {
      url: "figures/core-erosion.svg",
      title: "Older branches keep fewer shared genes",
      paragraphs: [
        [
          "Each dot represents an animal group plotted by how long ago its living members last shared a common ancestor (horizontal axis) against the share of genes still recognizable as identical, single-copy holdovers across the entire group (vertical axis). Much like forks of a codebase drifting apart over time, that shared core shrinks exponentially — losing roughly half its genes every 150 million years."
        ],
        [
          "Every mammal sits in the top-left corner: mammals branched recently enough (~177 million years ago) that nearly half of a mammal's genes (9,226) are still shared from whales to mice. Insects have been branching nearly three times longer (~479 million years) and accumulate protein mutations 2–3× faster. Across all of ",
          { em: "Insecta" },
          ", only 10% of genes (1,367) remain conserved — leaving roughly 90% of every insect proteome made of diverged, duplicated, or lineage-specific proteins."
        ]
      ],
      source:
        "OrthoDB / BUSCO odb10 (14 clades normalized to NCBI medians: 20,428 Mammalia, 13,598 Insecta) · Log-linear fit: t½ = 156 Ma, R² = 0.92, p = 6.4e-8 · Misof et al. (2014); Foley et al. (2023); Zdobnov et al. (2002)"
    },
    morphospace: {
      url: "figures/genome-morphospace.svg",
      title: "Insect DNA blueprints vary 13× more than mammals'",
      paragraphs: [
        [
          "This map compares 5,846 public reference genomes along two basic design parameters: total blueprint length on the horizontal axis (millions to billions of DNA letters, log scale) and GC content on the vertical axis (the ratio of G/C versus A/T letters, which shapes gene density and chromosome structure). Brighter hexagons mark where more species pile up; the curves along the top and right show each axis on its own."
        ],
        [
          "Every mammal — whale, bat, human, platypus — packs into one narrow golden patch near 2.6 billion letters and ~41.5% GC. Insects break out in every direction, from compact 57-million-letter midges to 10-billion-letter locusts, spanning a 12.9× wider architectural footprint. That structural freedom mirrors deep genomic turnover — including compact, specialized genomes like the blueberry bee ",
          { em: "Habropoda laboriosa" },
          " (297 million letters, a tenth the size of the human genome), where our first Kunitz candidate came from."
        ]
      ],
      source:
        "NCBI Datasets v2 scaffold/chromosome reference assemblies ≥ 50 Mb (4,896 Insecta; 950 Mammalia) · 95% bivariate ellipses (12.9× area ratio) · Size variance 14.5× (p < 1e-173), GC variance 10.4× (p < 1e-142), Fligner–Killeen"
    },
    novelty: {
      url: "figures/proteome-novelty.svg",
      title: "Every sequenced insect adds 4× more distinct proteins",
      paragraphs: [
        [
          "Sequencing more species only pays off if they reveal genuinely new proteins rather than near-duplicates of ones we already know. Here, every known protein sharing at least 50% of its amino acid sequence is grouped into a single family (",
          { em: "UniRef50" },
          "). Plotting total sequenced proteins (horizontal) against distinct families (vertical) shows how fast each animal group yields novel sequences: the higher a group sits, the less redundant its proteomes are."
        ],
        [
          "Mammalian databases hold 6.2 million proteins, yet 9 out of 10 collapse into repeats of the same 600,000 families. Insects sit on a dramatically higher curve: from 23% fewer sequenced proteins (4.8 million), they already yield 1.82 million distinct protein families — 3× more total families and nearly 4× more novelty per protein. And as the two bars at the bottom show, we have barely begun: 99.4% of described insect species still lack a reference genome, and 99.4% of insect protein families have never been manually reviewed."
        ]
      ],
      source:
        "EBI UniProtKB, UniRef50 (<50% AA identity), Swiss-Prot, and InterPro/Pfam (11,820 Insecta vs 10,761 Mammalia domains) · Heaps' law fits across 16 orders: R² = 0.992 (Insecta), 0.972 (Mammalia) · Coverage vs NCBI Datasets v2"
    }
  };

  // Pre-parsed SVG DOM node cache + in-flight promise map for 0ms hover opens
  const parsedCache = new Map();
  const inflight = new Map();
  let activeId = null;
  let lastTrigger = null;
  let pinned = false;
  let openedAt = 0;
  let hoverOpenTimer = 0;
  let hoverCloseTimer = 0;
  const fineHover = matchMedia("(hover: hover) and (pointer: fine)");

  function prefetch(id) {
    if (parsedCache.has(id) || inflight.has(id)) return inflight.get(id) || Promise.resolve();
    const spec = FIGURES[id];
    if (!spec) return Promise.resolve();
    const p = fetch(spec.url, { priority: "low" })
      .then(function (resp) {
        if (!resp.ok) throw new Error("Could not load figure.");
        return resp.text();
      })
      .then(function (svgText) {
        const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
        const svg = doc.documentElement;
        if (!svg || svg.nodeName.toLowerCase() !== "svg") {
          throw new Error("Could not parse figure.");
        }
        parsedCache.set(id, svg);
        inflight.delete(id);
        return svg;
      })
      .catch(function (err) {
        inflight.delete(id);
        throw err;
      });
    inflight.set(id, p);
    return p;
  }

  function prefetchAll() {
    ORDER.forEach(prefetch);
  }

  // Warm cache quietly right after initial paint so hover popups open in <1 frame
  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(prefetchAll, { timeout: 900 });
  } else {
    setTimeout(prefetchAll, 150);
  }
  window.addEventListener("em:panel", function (event) {
    if (event.detail && (event.detail.id === "insects" || event.detail.id === "divergence")) {
      prefetchAll();
    }
  });

  function buildParagraph(parts) {
    const p = document.createElement("p");
    parts.forEach(function (part) {
      if (typeof part === "string") {
        p.appendChild(document.createTextNode(part));
      } else if (part.em) {
        const el = document.createElement("em");
        el.textContent = part.em;
        p.appendChild(el);
      } else if (part.sup) {
        const el = document.createElement("sup");
        el.textContent = part.sup;
        p.appendChild(el);
      }
    });
    return p;
  }

  function mountSvg(svgNode) {
    viewport.replaceChildren(document.importNode(svgNode, true));
    statusEl.classList.add("hidden");
  }

  function loadFigure(id) {
    const spec = FIGURES[id];
    if (!spec) return;
    activeId = id;

    tabs.forEach(function (tab) {
      const selected = tab.getAttribute("data-figure-tab") === id;
      tab.setAttribute("aria-selected", selected ? "true" : "false");
      tab.classList.toggle("is-active", selected);
    });

    triggers.forEach(function (btn) {
      const isCurrent = btn.getAttribute("data-figure") === id;
      btn.setAttribute("aria-expanded", isCurrent ? "true" : "false");
      btn.classList.toggle("is-open", isCurrent);
      const item = btn.closest("li");
      if (item) item.classList.toggle("is-open", isCurrent);
    });

    titleEl.textContent = spec.title;
    bodyEl.replaceChildren();
    spec.paragraphs.forEach(function (parts) {
      bodyEl.appendChild(buildParagraph(parts));
    });
    sourceEl.textContent = spec.source;

    if (parsedCache.has(id)) {
      mountSvg(parsedCache.get(id));
      return;
    }

    viewport.replaceChildren();
    statusEl.textContent = "Loading figure…";
    statusEl.classList.remove("hidden");

    prefetch(id)
      .then(function (svgNode) {
        if (activeId === id) mountSvg(svgNode);
      })
      .catch(function (err) {
        if (activeId === id) {
          statusEl.textContent = String(err.message || err);
        }
      });
  }

  function clearTimers() {
    clearTimeout(hoverOpenTimer);
    clearTimeout(hoverCloseTimer);
    hoverOpenTimer = 0;
    hoverCloseTimer = 0;
  }

  function openModal(id, triggerEl, opts) {
    if (!FIGURES[id]) return;
    const isHover = !!(opts && opts.viaHover);
    clearTimers();
    if (triggerEl) lastTrigger = triggerEl;
    if (!isHover) pinned = true;
    const wasHidden = modal.hidden;
    if (wasHidden) openedAt = performance.now();
    modal.hidden = false;
    document.body.classList.add("has-figure-modal");
    if (activeId !== id || wasHidden) {
      loadFigure(id);
      if (dialog) dialog.scrollTop = 0;
    }
    if (!isHover && closeBtn) closeBtn.focus({ preventScroll: true });
  }

  function closeModal(restoreFocus) {
    clearTimers();
    if (modal.hidden) return;
    modal.hidden = true;
    pinned = false;
    document.body.classList.remove("has-figure-modal");
    activeId = null;
    triggers.forEach(function (btn) {
      btn.setAttribute("aria-expanded", "false");
      btn.classList.remove("is-open");
      const item = btn.closest("li");
      if (item) item.classList.remove("is-open");
    });
    if (restoreFocus && lastTrigger && typeof lastTrigger.focus === "function") {
      lastTrigger.focus({ preventScroll: true });
    }
  }

  function scheduleHoverClose() {
    if (pinned || modal.hidden) return;
    clearTimeout(hoverCloseTimer);
    hoverCloseTimer = setTimeout(function () {
      if (!pinned) closeModal(false);
    }, 240);
  }

  triggers.forEach(function (btn) {
    const id = btn.getAttribute("data-figure");

    btn.addEventListener("pointerenter", function (event) {
      if (event.pointerType !== "mouse" || !fineHover.matches) return;
      prefetchAll();
      clearTimeout(hoverCloseTimer);
      clearTimeout(hoverOpenTimer);
      hoverOpenTimer = setTimeout(function () {
        openModal(id, btn, { viaHover: true });
      }, 90);
    });

    btn.addEventListener("pointerleave", function (event) {
      if (event.pointerType !== "mouse") return;
      clearTimeout(hoverOpenTimer);
      hoverOpenTimer = 0;
    });

    btn.addEventListener("click", function () {
      // Clicking pins the modal open (or switches to this figure and pins)
      openModal(id, btn, { viaHover: false });
    });
  });

  if (dialog) {
    dialog.addEventListener("pointerenter", function () {
      clearTimeout(hoverCloseTimer);
    });
    dialog.addEventListener("pointerleave", function (event) {
      if (event.pointerType !== "mouse" || pinned) return;
      scheduleHoverClose();
    });
    dialog.addEventListener("click", function (event) {
      if (event.target.closest(".figure-close")) return;
      pinned = true;
    });
  }

  tabs.forEach(function (tab) {
    const id = tab.getAttribute("data-figure-tab");
    tab.addEventListener("pointerenter", function (event) {
      if (event.pointerType !== "mouse" || !fineHover.matches) return;
      clearTimeout(hoverCloseTimer);
      if (id && id !== activeId) loadFigure(id);
    });
    tab.addEventListener("click", function () {
      pinned = true;
      if (id && id !== activeId) {
        loadFigure(id);
        if (dialog) dialog.scrollTop = 0;
      }
    });
  });

  if (closeBtn) {
    closeBtn.addEventListener("click", function () {
      closeModal(true);
    });
  }
  if (backdrop) {
    backdrop.addEventListener("pointermove", function (event) {
      if (event.pointerType !== "mouse" || pinned || modal.hidden) return;
      if (performance.now() - openedAt < 450) return;
      scheduleHoverClose();
    });
    backdrop.addEventListener("click", function () {
      closeModal(true);
    });
  }

  window.addEventListener("keydown", function (event) {
    if (modal.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeModal(true);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      pinned = true;
      const idx = ORDER.indexOf(activeId);
      loadFigure(ORDER[(idx + 1) % ORDER.length]);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      pinned = true;
      const idx = ORDER.indexOf(activeId);
      loadFigure(ORDER[(idx - 1 + ORDER.length) % ORDER.length]);
    }
  });
})();
