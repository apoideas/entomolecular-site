(function () {
  const modal = document.getElementById("figure-modal");
  if (!modal) return;

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

  // Structured text tokens ("em" or "sup") so scientific italics and exponents render cleanly without innerHTML
  const FIGURES = {
    core: {
      url: "figures/core-erosion.svg",
      title: "Deep branching erodes the sequence-conserved core",
      paragraphs: [
        [
          "Each point counts universal single-copy orthologs (",
          { em: "BUSCO odb10" },
          ") — essential ancestral genes still recognizable as a single shared copy across almost every member of a group. Across 14 mammal and insect clades, those shared genes decay exponentially with crown age (half-life ≈ 156 Ma, R",
          { sup: "2" },
          " = 0.92, p = 6.4 × 10",
          { sup: "-8" },
          ")."
        ],
        [
          "Every mammal sits inside a 177 Ma window and still shares 9,226 single-copy genes class-wide (~45% of its proteome). Across ",
          { em: "Insecta" },
          " (479 Ma, with 2–3× faster amino acid clocks), only 1,367 remain universally conserved (10%) — a 6.75× drop that leaves ~90% of each insect proteome free to diverge and specialize."
        ]
      ],
      source:
        "OrthoDB / BUSCO odb10 (normalized to NCBI medians: 20,428 Mammalia, 13,598 Insecta) · Misof et al. (2014) Science; Peters et al. (2017); Foley et al. (2023) Science · Zdobnov et al. (2002) Science"
    },
    morphospace: {
      url: "figures/genome-morphospace.svg",
      title: "Insect genomes occupy a 12.9× wider architectural space",
      paragraphs: [
        [
          "Each hexagon summarizes public NCBI reference genomes (5,846 scaffold- and chromosome-level assemblies ≥ 50 Mb) by total DNA length (horizontal log axis) and GC content — the share of G and C bases in the sequence (vertical axis). Marginal curves show density along each axis."
        ],
        [
          "Every mammal — whale, bat, human, platypus — clusters inside a tight golden kernel around 2.57 Gb and 41.5% GC (1.0% GC IQR). Insects span 57 Mb midges to 10.17 Gb locusts and 21.5–56.5% GC: a 12.9× wider 95% confidence ellipse (Fligner–Killeen p < 10",
          { sup: "-142" },
          "). Our Kunitz candidate bee, ",
          { em: "Habropoda laboriosa" },
          ", fits into 297 Mb — a tenth the size of a human genome."
        ]
      ],
      source:
        "NCBI Datasets v2 reference assemblies (4,896 Insecta; 950 Mammalia; scaffold/chromosome ≥ 50 Mb) · 95% bivariate covariance ellipses (χ²₂ = 5.991) · Two-sided Fligner–Killeen dispersion tests"
    },
    novelty: {
      url: "figures/proteome-novelty.svg",
      title: "Every insect genome unlocks 4× denser protein novelty",
      paragraphs: [
        [
          { em: "UniRef50" },
          " groups every known protein sharing at least 50% amino acid identity into one family, removing near-duplicates. Plotting total sequenced proteins against distinct families separates ",
          { em: "Insecta" },
          " and ",
          { em: "Mammalia" },
          " onto parallel Heaps' law tracks (R",
          { sup: "2" },
          " = 0.992 and 0.972), offset nearly fourfold."
        ],
        [
          "Mammals have 6.22M UniProt entries but collapse into just 599,738 families (9.6% unique). From 23% fewer sequences (4.79M), insects yield 1,824,933 distinct families (38.1% unique — 3.04× more families, 3.95× novelty yield) and 11,820 Pfam domains vs 10,761, while 99.4% of insect species and families remain unsequenced or unreviewed."
        ]
      ],
      source:
        "EBI UniProtKB, UniRef50, Swiss-Prot, and InterPro/Pfam across Insecta (50557), Mammalia (40674), and 16 major orders · Species coverage vs NCBI Datasets v2 reference assemblies"
    }
  };

  const cache = new Map();
  let activeId = null;
  let lastTrigger = null;

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

  function renderSvg(svgText) {
    const doc = new DOMParser().parseFromString(svgText, "image/svg+xml");
    const svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== "svg") {
      throw new Error("Could not parse figure.");
    }
    viewport.replaceChildren(document.importNode(svg, true));
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

    if (cache.has(id)) {
      renderSvg(cache.get(id));
      return;
    }

    viewport.replaceChildren();
    statusEl.textContent = "Loading figure…";
    statusEl.classList.remove("hidden");

    fetch(spec.url)
      .then(function (resp) {
        if (!resp.ok) throw new Error("Could not load figure.");
        return resp.text();
      })
      .then(function (svgText) {
        cache.set(id, svgText);
        if (activeId === id) renderSvg(svgText);
      })
      .catch(function (err) {
        if (activeId === id) {
          statusEl.textContent = String(err.message || err);
        }
      });
  }

  function openModal(id, triggerEl) {
    if (!FIGURES[id]) return;
    if (triggerEl) lastTrigger = triggerEl;
    modal.hidden = false;
    document.body.classList.add("has-figure-modal");
    loadFigure(id);
    const card = modal.querySelector(".figure-dialog");
    if (card) card.scrollTop = 0;
    if (closeBtn) closeBtn.focus({ preventScroll: true });
  }

  function closeModal() {
    if (modal.hidden) return;
    modal.hidden = true;
    document.body.classList.remove("has-figure-modal");
    activeId = null;
    triggers.forEach(function (btn) {
      btn.setAttribute("aria-expanded", "false");
      btn.classList.remove("is-open");
      const item = btn.closest("li");
      if (item) item.classList.remove("is-open");
    });
    if (lastTrigger && typeof lastTrigger.focus === "function") {
      lastTrigger.focus({ preventScroll: true });
    }
  }

  triggers.forEach(function (btn) {
    btn.addEventListener("click", function () {
      const id = btn.getAttribute("data-figure");
      if (!modal.hidden && activeId === id) {
        closeModal();
      } else {
        openModal(id, btn);
      }
    });
  });

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      const id = tab.getAttribute("data-figure-tab");
      if (id && id !== activeId) {
        loadFigure(id);
        const card = modal.querySelector(".figure-dialog");
        if (card) card.scrollTop = 0;
      }
    });
  });

  if (closeBtn) closeBtn.addEventListener("click", closeModal);
  if (backdrop) backdrop.addEventListener("click", closeModal);

  window.addEventListener("keydown", function (event) {
    if (modal.hidden) return;
    if (event.key === "Escape") {
      event.preventDefault();
      closeModal();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      const idx = ORDER.indexOf(activeId);
      loadFigure(ORDER[(idx + 1) % ORDER.length]);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      const idx = ORDER.indexOf(activeId);
      loadFigure(ORDER[(idx - 1 + ORDER.length) % ORDER.length]);
    }
  });
})();
