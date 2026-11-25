(function () {
  const modal = document.getElementById("figure-modal");
  if (!modal) return;

  const dialog = modal.querySelector(".figure-dialog");
  const tabsHost = modal.querySelector(".figure-tabs");
  const viewport = document.getElementById("figure-viewport");
  const statusEl = document.getElementById("figure-status");
  const titleEl = document.getElementById("figure-title");
  const bodyEl = document.getElementById("figure-body");
  const sourceEl = document.getElementById("figure-source");
  const closeBtn = modal.querySelector(".figure-close");
  const backdrop = modal.querySelector(".figure-backdrop");
  const triggers = Array.from(document.querySelectorAll("[data-figure]"));

  // Calm, standard hover-intent timings (click still opens/switches immediately)
  const HOVER_OPEN_MS = 420;
  const HOVER_TAB_MS = 220;
  const HOVER_CLOSE_MS = 320;
  const BACKDROP_GRACE_MS = 500;

  const GROUPS = {
    insects: [
      { id: "biodiversity", label: "01 · Biodiversity" },
      { id: "sequencing", label: "02 · Sequenced genomes" },
      { id: "niches", label: "03 · Protein toolkits" },
    ],
    proteins: [
      { id: "luciferase", label: "01 · Luciferase" },
      { id: "fibroin", label: "02 · Fibroin" },
      { id: "cecropin", label: "03 · Cecropin" },
      { id: "melittin", label: "04 · Melittin" },
      { id: "afp", label: "05 · Antifreeze" },
    ],
    divergence: [
      { id: "core", label: "01 · Core erosion" },
      { id: "morphospace", label: "02 · Genome space" },
      { id: "novelty", label: "03 · Protein novelty" },
    ],
  };

  const ITEMS = {
    // === SLIDE: WHY INSECTS? ===
    biodiversity: {
      group: "insects",
      kind: "svg",
      url: "figures/insect-share.svg",
      title: "Two-thirds of all named animals are insects — and most remain unnamed",
      paragraphs: [
        [
          "Each square in this 1,000-tile grid represents 1,500 described animal species. Roughly two-thirds of the entire grid (667 squares, ~1 million species) belongs to ",
          { em: "Insecta" },
          ", led by beetles, moths, flies, wasps, and true bugs. Every mammal on Earth — whales, bats, primates, rodents, marsupials — fits into just four gold squares at the bottom right (0.44%)."
        ],
        [
          "Even that 1-million figure is only the tip of the iceberg. Entomologists estimate around 5.5 million living insect species in total, meaning roughly 82% have never even been formally named — representing the largest reservoir of evolved molecular machinery on the planet."
        ]
      ],
      source:
        "Species counts: Zhang (2011) Zootaxa; Stork (2018) Annu. Rev. Entomol. (~5.5M estimated Insecta); Mammal Diversity Database (~6,640 Mammalia)"
    },
    sequencing: {
      group: "insects",
      kind: "svg",
      url: "figures/sequenced-genomes.svg",
      title: "Insects outnumber mammals 6-to-1 in genome files — yet remain 25× less sequenced",
      paragraphs: [
        [
          "Public databases already contain 6,063 reference insect genomes compared to 1,010 mammal genomes (left panel, log scale). Because insect biodiversity is 150× larger, however, that covers only 0.61% of described insect species versus 15.2% of mammals — and beetles (~387,000 species) sit at just 0.17% sequenced (right panel)."
        ],
        [
          "The annotation gap is even steeper. Only 456 of those 6,063 reference insect genomes (7.5%) carry standard gene annotations that make their proteins legible, compared to 31.7% in mammals. More than 92% of already-public insect genomes sit largely unread — a vast, free dataset waiting for structure-first search."
        ]
      ],
      source:
        "Live NCBI Datasets v2 reference assemblies (Insecta taxid 50557: 6,063 ref / 456 annotated; Mammalia taxid 40674: 1,010 ref / 320 annotated) vs described species counts"
    },
    niches: {
      group: "insects",
      kind: "svg",
      url: "figures/niche-proteomes.svg",
      title: "Extreme insect lifestyles run on specialized secreted proteins",
      paragraphs: [
        [
          "Insects survive in nearly every terrestrial habitat by evolving specialized molecular tools: parasitoid wasps hijack host nervous systems with venom neurotoxins, blood-feeders inject salivary anticoagulants and anesthetics, moths neutralize bacteria with pore-forming immune peptides, and winter beetles arrest ice crystals at sub-zero temperatures."
        ],
        [
          "Many of the most potent bioactive molecules cluster inside the 25-to-100 amino acid window highlighted in cyan. These short secreted peptides are often locked into rigid shapes by cysteine disulfide bridges — making them small enough to fold rapidly with AI models and stable enough to synthesize and test as drugs or agrichemicals."
        ]
      ],
      source:
        "Representative insect functional protein classes & mature chain lengths from UniProtKB / PDB reference scaffolds"
    },

    // === SLIDE: FIVE INSECT PROTEINS ALREADY IN USE ===
    luciferase: {
      group: "proteins",
      kind: "photos",
      insectImg: "images/proteins/luciferase-insect.jpg",
      insectTag: "SOURCE · COLEOPTERA",
      insectCaption: "Common eastern firefly, Photinus pyralis",
      productImg: "images/proteins/luciferase-product.jpg",
      productTag: "DERIVED APPLICATION",
      productCaption: "In vivo bioluminescence imaging (BLI) & ATP assays",
      title: "Firefly Luciferase — turning chemical energy into diagnostic light",
      paragraphs: [
        [
          "Fireflies (",
          { em: "Photinus pyralis" },
          ") produce their courtship glow using luciferase, a 550-amino-acid enzyme that reacts with cellular ATP and oxygen to emit visible light with remarkable efficiency (~41% quantum yield) and almost zero wasted heat."
        ],
        [
          "Cloned into biotechnology in the 1980s, firefly luciferase became an indispensable global tool. Hospitals and food plants use instant ATP luminometer swabs to detect microbial contamination in seconds, while pharmaceutical labs rely on luciferase reporter assays and live bioluminescence imaging to track tumor growth, gene expression, and viral clearance in real time."
        ]
      ],
      source:
        "Enzyme: Photinus pyralis luciferase (UniProt P08659, 550 aa) · Photos: Celari817 (CC BY 4.0) & Mollyemcnulty (CC BY-SA 4.0), Wikimedia Commons"
    },
    fibroin: {
      group: "proteins",
      kind: "photos",
      insectImg: "images/proteins/fibroin-insect.jpg",
      insectTag: "SOURCE · LEPIDOPTERA",
      insectCaption: "Domestic silkworm, Bombyx mori",
      productImg: "images/proteins/fibroin-product.jpg",
      productTag: "DERIVED APPLICATION",
      productCaption: "Lamellar silk fibroin tissue scaffold (fluorescence)",
      title: "Silk Fibroin — tough, biodegradable protein scaffolds for medicine",
      paragraphs: [
        [
          "Silkworm caterpillars (",
          { em: "Bombyx mori" },
          ") spin protective cocoons from silk fibroin, a giant structural protein whose repeating amino acid motifs pack into microscopic β-sheet crystals. That architecture gives silk extraordinary tensile toughness while remaining completely non-toxic and gradually absorbable inside the human body."
        ],
        [
          "Beyond millennia of textiles, purified silk fibroin has been engineered into FDA-cleared surgical sutures, bioresorbable reconstructive surgical meshes, tissue-engineering scaffolds (shown right), and dissolvable microneedle patches that stabilize vaccines without refrigeration."
        ]
      ],
      source:
        "Protein: Bombyx mori fibroin heavy chain (UniProt P05790) · Photos: Amada44 (CC BY-SA 3.0) & Bibhas kumar Bhunia (CC BY-SA 3.0), Wikimedia Commons"
    },
    cecropin: {
      group: "proteins",
      kind: "photos",
      insectImg: "images/proteins/cecropin-insect.jpg",
      insectTag: "SOURCE · LEPIDOPTERA",
      insectCaption: "Cecropia moth larva, Hyalophora cecropia",
      productImg: "images/proteins/cecropin-product.jpg",
      productTag: "DERIVED APPLICATION",
      productCaption: "Bacterial zone-of-inhibition assay plate",
      title: "Cecropin — the first animal antimicrobial peptide ever discovered",
      paragraphs: [
        [
          "Insects lack antibodies and adaptive immune systems, yet thrive in microbe-rich environments by secreting short defensive peptides directly into their hemolymph. In 1981, researchers isolated cecropin — a 37-amino-acid helical peptide — from the giant cecropia moth (",
          { em: "Hyalophora cecropia" },
          "), making it the first antimicrobial peptide ever characterized in animals."
        ],
        [
          "Cecropin selectively binds negatively charged bacterial membranes and punches lethal pores within minutes, making it hard for pathogens to evolve resistance. Its discovery launched the modern field of host-defense peptide therapeutics, inspiring engineered antibacterials for multidrug-resistant infections, crop protection, and antibiotic-free animal health."
        ]
      ],
      source:
        "Peptide: Hyalophora cecropia cecropin A (UniProt P01507, 37 aa mature) · Photos: Alex Abair (CC BY 4.0) & Public Domain antibiogram plate, Wikimedia Commons"
    },
    melittin: {
      group: "proteins",
      kind: "photos",
      insectImg: "images/proteins/melittin-insect.jpg",
      insectTag: "SOURCE · HYMENOPTERA",
      insectCaption: "Western honeybee, Apis mellifera",
      productImg: "images/proteins/melittin-product.jpg",
      productTag: "DERIVED APPLICATION",
      productCaption: "Fluorescent lipid nanocarriers (liposomes)",
      title: "Melittin — a 26-amino-acid venom peptide harnessed for nanomedicine",
      paragraphs: [
        [
          "Roughly half the dry weight of honeybee (",
          { em: "Apis mellifera" },
          ") venom is melittin, a compact 26-amino-acid peptide with one water-loving face and one oil-loving face. That amphipathic geometry allows melittin to wedge straight into cell membranes and open controlled pores — a textbook example of a high-potency short insect peptide."
        ],
        [
          "Standardized bee venom is already an FDA-approved clinical immunotherapy for severe sting allergies. In modern drug delivery, researchers encapsulate melittin inside targeted lipid nanoparticles (shown right) and engineered tumor-selective conjugates, shielding healthy cells in circulation while unleashing rapid membrane disruption directly inside solid tumors and viral envelopes."
        ]
      ],
      source:
        "Peptide: Apis mellifera melittin (UniProt P01501, 26 aa mature) · Photos: Fir0002 (GFDL 1.2) & Sergey Arkhipov (CC BY-SA 4.0), Wikimedia Commons"
    },
    afp: {
      group: "proteins",
      kind: "photos",
      insectImg: "images/proteins/afp-insect.jpg",
      insectTag: "SOURCE · COLEOPTERA",
      insectCaption: "Yellow mealworm beetle, Tenebrio molitor",
      productImg: "images/proteins/afp-product.jpg",
      productTag: "DERIVED APPLICATION",
      productCaption: "Cryogenic cell preservation in liquid nitrogen",
      title: "Insect Antifreeze Proteins — arresting ice crystals 10–100× better than fish",
      paragraphs: [
        [
          "To survive winter freezes without bursting their cells, beetles like ",
          { em: "Tenebrio molitor" },
          " secrete hyperactive antifreeze proteins (TmAFP): compact, 84-amino-acid coils reinforced by eight internal cysteine disulfide bridges. One flat face displays an exact geometric array of threonine residues that snaps directly onto nascent ice crystals, halting crystal growth 10 to 100 times more effectively than classic Arctic fish antifreeze proteins."
        ],
        [
          "Because ice recrystallization during thawing destroys fragile cells, insect-derived antifreeze proteins and synthetic mimics are advancing cryopreservation of stem cells, blood products, and transplant organs — as well as cold-chain stabilization of temperature-sensitive biologics and food textures."
        ]
      ],
      source:
        "Protein: Tenebrio molitor thermal hysteresis protein TmAFP (UniProt O16119, 84 aa, 8 S–S bridges) · Photos: ImagePerson (CC BY 4.0) & AMA Regenerative Medicine (CC BY-SA 4.0), Wikimedia Commons"
    },

    // === SLIDE: DEEP TREES BUILD WIDER PROTEOMES ===
    core: {
      group: "divergence",
      kind: "svg",
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
      group: "divergence",
      kind: "svg",
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
      group: "divergence",
      kind: "svg",
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
    },
  };

  const parsedSvgCache = new Map();
  const inflightSvg = new Map();
  const preloadedImgs = new Set();
  let activeId = null;
  let activeGroup = null;
  let lastTrigger = null;
  let pinned = false;
  let openedAt = 0;
  let hoverOpenTimer = 0;
  let hoverTabTimer = 0;
  let hoverCloseTimer = 0;
  const fineHover = matchMedia("(hover: hover) and (pointer: fine)");

  function prefetchSvg(id) {
    if (parsedSvgCache.has(id) || inflightSvg.has(id)) {
      return inflightSvg.get(id) || Promise.resolve(parsedSvgCache.get(id));
    }
    const spec = ITEMS[id];
    if (!spec || spec.kind !== "svg") return Promise.resolve();
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
        parsedSvgCache.set(id, svg);
        inflightSvg.delete(id);
        return svg;
      })
      .catch(function (err) {
        inflightSvg.delete(id);
        throw err;
      });
    inflightSvg.set(id, p);
    return p;
  }

  function prefetchImg(url) {
    if (!url || preloadedImgs.has(url)) return;
    preloadedImgs.add(url);
    const img = new Image();
    img.decoding = "async";
    img.src = url;
  }

  function prefetchGroup(groupName) {
    const list = GROUPS[groupName];
    if (!list) return;
    list.forEach(function (entry) {
      const spec = ITEMS[entry.id];
      if (!spec) return;
      if (spec.kind === "svg") prefetchSvg(entry.id);
      else if (spec.kind === "photos") {
        prefetchImg(spec.insectImg);
        prefetchImg(spec.productImg);
      }
    });
  }

  function prefetchAll() {
    prefetchGroup("insects");
    prefetchGroup("proteins");
    prefetchGroup("divergence");
  }

  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(prefetchAll, { timeout: 1200 });
  } else {
    setTimeout(prefetchAll, 250);
  }
  window.addEventListener("em:panel", function (event) {
    clearTimers();
    const id = event.detail && event.detail.id;
    if (id === "search" || id === "insects") {
      prefetchGroup("insects");
      prefetchGroup("proteins");
    } else if (id === "proteins" || id === "divergence") {
      prefetchGroup("proteins");
      prefetchGroup("divergence");
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

  function buildPhotoCard(src, tag, caption) {
    const card = document.createElement("figure");
    card.className = "photo-plate";
    const frame = document.createElement("div");
    frame.className = "photo-frame";
    const badge = document.createElement("span");
    badge.className = "photo-tag";
    badge.textContent = tag;
    const img = document.createElement("img");
    img.src = src;
    img.alt = caption;
    img.decoding = "async";
    frame.appendChild(badge);
    frame.appendChild(img);
    const cap = document.createElement("figcaption");
    cap.textContent = caption;
    card.appendChild(frame);
    card.appendChild(cap);
    return card;
  }

  function renderTabs(groupName, currentId) {
    const entries = GROUPS[groupName] || [];
    if (activeGroup !== groupName) {
      tabsHost.replaceChildren();
      entries.forEach(function (entry) {
        const btn = document.createElement("button");
        btn.className = "figure-tab";
        btn.type = "button";
        btn.setAttribute("role", "tab");
        btn.setAttribute("data-figure-tab", entry.id);
        btn.textContent = entry.label;

        btn.addEventListener("pointerenter", function (event) {
          if (event.pointerType !== "mouse" || !fineHover.matches) return;
          clearTimeout(hoverCloseTimer);
          clearTimeout(hoverTabTimer);
          hoverTabTimer = setTimeout(function () {
            if (!modal.hidden && entry.id !== activeId) loadItem(entry.id);
          }, HOVER_TAB_MS);
        });
        btn.addEventListener("pointerleave", function () {
          clearTimeout(hoverTabTimer);
          hoverTabTimer = 0;
        });
        btn.addEventListener("click", function () {
          clearTimeout(hoverTabTimer);
          pinned = true;
          if (entry.id !== activeId) {
            loadItem(entry.id);
            if (dialog) dialog.scrollTop = 0;
          }
        });
        tabsHost.appendChild(btn);
      });
      activeGroup = groupName;
    }

    Array.from(tabsHost.querySelectorAll(".figure-tab")).forEach(function (tab) {
      const selected = tab.getAttribute("data-figure-tab") === currentId;
      tab.setAttribute("aria-selected", selected ? "true" : "false");
      tab.classList.toggle("is-active", selected);
    });
  }

  function loadItem(id) {
    const spec = ITEMS[id];
    if (!spec) return;
    activeId = id;
    renderTabs(spec.group, id);

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

    if (spec.kind === "photos") {
      const pair = document.createElement("div");
      pair.className = "photo-pair";
      pair.appendChild(buildPhotoCard(spec.insectImg, spec.insectTag, spec.insectCaption));
      pair.appendChild(buildPhotoCard(spec.productImg, spec.productTag, spec.productCaption));
      viewport.replaceChildren(pair);
      statusEl.classList.add("hidden");
      return;
    }

    if (parsedSvgCache.has(id)) {
      viewport.replaceChildren(document.importNode(parsedSvgCache.get(id), true));
      statusEl.classList.add("hidden");
      return;
    }

    viewport.replaceChildren();
    statusEl.textContent = "Loading figure…";
    statusEl.classList.remove("hidden");

    prefetchSvg(id)
      .then(function (svgNode) {
        if (activeId === id) {
          viewport.replaceChildren(document.importNode(svgNode, true));
          statusEl.classList.add("hidden");
        }
      })
      .catch(function (err) {
        if (activeId === id) {
          statusEl.textContent = String(err.message || err);
        }
      });
  }

  function clearTimers() {
    clearTimeout(hoverOpenTimer);
    clearTimeout(hoverTabTimer);
    clearTimeout(hoverCloseTimer);
    hoverOpenTimer = 0;
    hoverTabTimer = 0;
    hoverCloseTimer = 0;
  }

  function openModal(id, triggerEl, opts) {
    if (!ITEMS[id]) return;
    const isHover = !!(opts && opts.viaHover);
    clearTimers();
    if (triggerEl) lastTrigger = triggerEl;
    if (!isHover) pinned = true;
    const wasHidden = modal.hidden;
    if (wasHidden) openedAt = performance.now();
    modal.hidden = false;
    document.body.classList.add("has-figure-modal");
    if (activeId !== id || wasHidden) {
      loadItem(id);
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
    }, HOVER_CLOSE_MS);
  }

  triggers.forEach(function (btn) {
    const id = btn.getAttribute("data-figure");
    const spec = ITEMS[id];

    btn.addEventListener("pointerenter", function (event) {
      if (event.pointerType !== "mouse" || !fineHover.matches) return;
      if (spec) prefetchGroup(spec.group);
      clearTimeout(hoverCloseTimer);
      clearTimeout(hoverOpenTimer);
      hoverOpenTimer = setTimeout(function () {
        openModal(id, btn, { viaHover: true });
      }, HOVER_OPEN_MS);
    });

    btn.addEventListener("pointerleave", function (event) {
      if (event.pointerType !== "mouse") return;
      clearTimeout(hoverOpenTimer);
      hoverOpenTimer = 0;
    });

    btn.addEventListener("click", function () {
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

  if (closeBtn) {
    closeBtn.addEventListener("click", function () {
      closeModal(true);
    });
  }
  if (backdrop) {
    backdrop.addEventListener("pointermove", function (event) {
      if (event.pointerType !== "mouse" || pinned || modal.hidden) return;
      if (performance.now() - openedAt < BACKDROP_GRACE_MS) return;
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
    } else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      const list = GROUPS[activeGroup];
      if (!list || !list.length) return;
      event.preventDefault();
      pinned = true;
      const idx = list.findIndex(function (e) {
        return e.id === activeId;
      });
      const step = event.key === "ArrowRight" ? 1 : -1;
      loadItem(list[(idx + step + list.length) % list.length].id);
    }
  });
})();
