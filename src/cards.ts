import "./style.css";
import { inject } from "@vercel/analytics";
import cardsRaw from "./data/cards.json";

inject();

type CardDrop = {
  monster: string;
  /** rAthena drop rate in 1/10000 units (e.g. 1 → 0.01%). */
  rate: number;
};

type CardEntry = {
  id: number;
  aegisName: string;
  name: string;
  slot?: string;
  /** Plain-language effect text (from import; iRO Wiki DB via RagnaAPI). */
  description?: string;
  drops: CardDrop[];
};

type CategoryKey = "set" | "autocast" | "stats" | "damage" | "resist" | "exp" | "status" | "utility";
type StatKey = "STR" | "AGI" | "VIT" | "INT" | "DEX" | "LUK";

type CardDerived = {
  descText: string;
  categories: Set<CategoryKey>;
  stats: Set<StatKey>;
  setMembers: string[];
};

const cardsAll: CardEntry[] = (cardsRaw as CardEntry[])
  .filter((c) => Array.isArray(c.drops) && c.drops.length > 0)
  .slice()
  .sort((a, b) => a.name.localeCompare(b.name));

function formatDropRate(rate: number): string {
  if (typeof rate !== "number" || !Number.isFinite(rate)) return "—";
  return `${(rate / 100).toFixed(2)}%`;
}

function dropsDisplayText(c: CardEntry): string {
  if (!c.drops?.length) return "—";
  return c.drops.map((d) => `${d.monster} (${formatDropRate(d.rate)})`).join(", ");
}

function normalizeSlotLabel(slotRaw: string | undefined): string {
  if (!slotRaw) return "—";
  const s = slotRaw.trim();
  if (!s) return "—";
  // Normalize rAthena-ish location labels into player-facing slots
  if (s === "Right Hand") return "Weapon";
  if (s === "Left Hand") return "Shield";
  if (s === "Both Accessory") return "Accessory";
  if (s === "Right Accessory" || s === "Left Accessory") return "Accessory";
  return s;
}

/** Strip RO client colour codes (^RRGGBB) for readable table text. */
function stripRoColorCodes(s: string): string {
  return s.replace(/\^[0-9a-fA-F]{6}/g, "");
}

function normalizeDescriptionText(s: string): string {
  const base = stripRoColorCodes(s.replace(/\r\n/g, "\n")).trim();
  if (!base) return base;
  // Some upstream descriptions (especially set bonuses) miss newlines, e.g. "5%.Agi +5Dex +3..."
  // Insert conservative breaks so blocks and highlights work reliably.
  return (
    base
      // Sentence boundary right after "%." / "."
      .replace(/%\.(?=\S)/g, "%.\n")
      .replace(/\.(?=[A-Z])/g, ".\n")
      // Close-bracket followed by a new sentence
      .replace(/\](?=[A-Z])/g, "]\n")
      // Common stat concatenations like "Agi +5Dex +3" or "Dex +5Increases ..."
      .replace(/([0-9])(?=(?:Str|Agi|Vit|Int|Dex|Luk)\b)/gi, "$1\n")
      .replace(/([0-9])(?=(?:Perfect Hit|Max HP|Max SP|Increases|Reduces)\b)/gi, "$1\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

function normalizeSetMemberName(raw: string): string {
  return raw
    .replace(/\s*\[[^\]]+\]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSetBonusMembers(descText: string): string[] {
  const lines = descText.split("\n").map((l) => l.trim());
  const members: string[] = [];
  for (const ln of lines) {
    const m = ln.match(/^Set bonus with\s+(.+)$/i);
    if (!m) continue;
    const tail = m[1] ?? "";
    // Split on commas; keep "Card" suffix as part of name.
    for (const part of tail.split(",")) {
      const n = normalizeSetMemberName(part);
      if (!n) continue;
      members.push(n);
    }
  }
  // Deduplicate while preserving order
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of members) {
    const key = m.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(m);
  }
  return out;
}

function deriveCard(c: CardEntry): CardDerived {
  const descText = c.description ? normalizeDescriptionText(c.description) : "";
  const d = descText.toLowerCase();
  const categories = new Set<CategoryKey>();
  const stats = new Set<StatKey>();
  const setMembers = parseSetBonusMembers(descText);

  // Autocast / trigger effects
  if (/\bchance of using\b|\badds a \d/.test(d) || /\bwhen physically attacked\b|\bwhen attacking\b/.test(d)) {
    categories.add("autocast");
  }
  if (/\bautocast\b|\bcast\b/.test(d) && /\blv\b|\blevel\b/.test(d)) {
    categories.add("autocast");
  }

  // Core stats
  const statHits: Array<[StatKey, RegExp]> = [
    ["STR", /\bstr\b/],
    ["AGI", /\bagi\b/],
    ["VIT", /\bvit\b/],
    ["INT", /\bint\b/],
    ["DEX", /\bdex\b/],
    ["LUK", /\bluk\b/],
  ];
  for (const [k, re] of statHits) {
    if (re.test(d)) stats.add(k);
  }
  if (stats.size) categories.add("stats");

  // Damage modifiers
  if (/\bincreases .*damage\b|\badditional damage\b|\bdamage against\b|\bdamage on\b|\bperfect hit\b/.test(d)) {
    categories.add("damage");
  }
  if (/\brace\b|\belement\b|\bsize\b/.test(d) && /\bdamage\b/.test(d)) {
    categories.add("damage");
  }

  // Resist / reductions
  if (/\breduces damage\b|\bdamage received\b|\bresist\b|\bimmun/.test(d)) {
    categories.add("resist");
  }

  // EXP / drops
  if (/\bexperience\b|\bexp\b/.test(d)) {
    categories.add("exp");
  }

  // Status / proc chances
  if (
    /\bcoma\b|\bstun\b|\bsilence\b|\bfrozen\b|\bpoison\b|\bbleeding\b|\bcurse\b|\bblind\b|\bsleep\b|\bstone\b/.test(d)
  ) {
    categories.add("status");
  }

  // Utility-ish signals (teleport, heal, etc.)
  if (/\bteleport\b|\bheal\b|\brestore\b|\brecovery\b|\benables\b|\bdisables\b/.test(d)) {
    categories.add("utility");
  }

  if (setMembers.length) categories.add("set");
  return { descText, categories, stats, setMembers };
}

const derivedById = new Map<number, CardDerived>();
for (const c of cardsAll) derivedById.set(c.id, deriveCard(c));

const cardByNameLower = new Map<string, CardEntry>();
for (const c of cardsAll) {
  cardByNameLower.set(c.name.toLowerCase(), c);
}

function escapeHtml(s: string): string {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function highlightKeywords(escaped: string): string {
  const rep = (re: RegExp, cls: string): void => {
    escaped = escaped.replace(re, (_m, g1: string) => `<span class="kw ${cls}">${g1}</span>`);
  };
  const repTextOnly = (re: RegExp, cls: string): void => {
    escaped = escaped.replace(
      re,
      (_m, g1: string) => `<span class="kw-text ${cls}">${g1}</span>`,
    );
  };

  // Core stats (case-insensitive; keep original casing in output)
  rep(/\b(STR)\b/gi, "kw--str");
  rep(/\b(AGI)\b/gi, "kw--agi");
  rep(/\b(VIT)\b/gi, "kw--vit");
  rep(/\b(INT)\b/gi, "kw--int");
  rep(/\b(DEX)\b/gi, "kw--dex");
  rep(/\b(LUK)\b/gi, "kw--luk");

  // Common stat-y phrases
  rep(/\b(Max HP|Max SP)\b/gi, "kw--hp");
  rep(/\b(ATK|MATK|HIT|FLEE|DEF|MDEF)\b/gi, "kw--stat");

  // Verbs should be color-coded but NOT pill-highlighted
  repTextOnly(/\b(Reduces|Increases)\b/gi, "kw-text--verb");
  return escaped;
}

function descriptionToBlocks(descRaw: string): Array<{ cls: string; html: string; isSet: boolean }> {
  const norm = descRaw.replace(/\r\n/g, "\n").trim();
  if (!norm) return [];

  const lines = norm.split("\n");
  /** @type {Array<{ cls: string; html: string; isSet: boolean }>} */
  const blocks: Array<{ cls: string; html: string; isSet: boolean }> = [];
  /** @type {string[]} */
  let cur: string[] = [];
  let curIsSet = false;

  const flush = (): void => {
    if (!cur.length) return;
    const joined = cur.join("\n").trim();
    if (!joined) return;
    const esc = highlightKeywords(escapeHtml(joined)).replace(/\n/g, "<br/>");
    blocks.push({
      cls: curIsSet ? "desc-block desc-block--set" : "desc-block",
      html: esc,
      isSet: curIsSet,
    });
    cur = [];
    curIsSet = false;
  };

  for (const ln of lines) {
    const t = ln.trim();
    const isSet = /^set bonus\b/i.test(t);
    const isBlank = t === "";
    if (isBlank) {
      flush();
      continue;
    }
    if (isSet) {
      flush();
      curIsSet = true;
      cur.push(ln);
      continue;
    }
    cur.push(ln);
  }
  flush();
  return blocks;
}

function descriptionToNonSetBlocksHtml(descRaw: string): string {
  const blocks = descriptionToBlocks(descRaw).filter((b) => !b.isSet);
  if (!blocks.length) return "";
  return `<div class="desc-blocks">${blocks.map((b) => `<div class="${b.cls}">${b.html}</div>`).join("")}</div>`;
}

function descriptionToSetBlocksHtml(descRaw: string): string {
  const blocks = descriptionToBlocks(descRaw).filter((b) => b.isSet);
  if (!blocks.length) return "";
  return `<div class="desc-blocks">${blocks
    .map((b) => `<div class="${b.cls}">${b.html}</div>`)
    .join("")}</div>`;
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function renderRows(rows: CardEntry[]): string {
  if (rows.length === 0) {
    return `<tr><td class="cards-empty" colspan="5">No matches.</td></tr>`;
  }
  return rows
    .map((c) => {
      const slot = escapeHtml(normalizeSlotLabel(c.slot));
      const descRaw = derivedById.get(c.id)?.descText ?? "";
      const blocks = descriptionToBlocks(descRaw);
      const descHtml =
        blocks.length > 0
          ? `<div class="desc-blocks">${blocks
              .map((b) =>
                b.isSet
                  ? `<button type="button" class="${b.cls} desc-block--click" data-set-for="${c.id}" aria-label="Open set bonus details">${b.html}</button>`
                  : `<div class="${b.cls}">${b.html}</div>`,
              )
              .join("")}</div>`
          : "—";
      return `<tr>
        <td class="cards-col-id">${c.id}</td>
        <td class="cards-col-name">
          <div class="cards-name">${escapeHtml(c.name)}</div>
        </td>
        <td class="cards-col-slot">${slot}</td>
        <td class="cards-col-desc">${descHtml}</td>
        <td class="cards-col-drop">${escapeHtml(dropsDisplayText(c))}</td>
      </tr>`;
    })
    .join("");
}

type FilterState = {
  q: string;
  categories: Set<CategoryKey>;
  stats: Set<StatKey>;
};

const CATEGORY_LABELS: Record<CategoryKey, string> = {
  set: "Set bonus",
  autocast: "Autocast / proc",
  stats: "Stats",
  damage: "Damage",
  resist: "Resist",
  exp: "EXP",
  status: "Status",
  utility: "Utility",
};

function mount(root: HTMLElement): void {
  root.innerHTML = `
    <header class="site-header">
      <div class="site-header__left">
        <a class="site-brand" href="/index.html">RO Pre-Renewal</a>
        <nav class="site-nav" aria-label="Site">
          <a class="site-nav__link" href="/index.html">Skill Planner</a>
          <a class="site-nav__link site-nav__link--active" href="/cards.html" aria-current="page">Card Library</a>
        </nav>
      </div>
    </header>

    <section class="page">
      <div class="page-head">
        <h1 class="page-title">Card Library</h1>
        <p class="page-sub">Search by card name, effect, equip slot, or monster. Drops and IDs come from rAthena pre-re; effect text is filled from the iRO Wiki database (via RagnaAPI) when available.</p>
      </div>

      <div class="cards-toolbar" role="search">
        <label class="cards-search">
          <span class="cards-search__label">Search</span>
          <input id="q" class="cards-search__input" type="search" placeholder="e.g. hydra, poring, weapon..." autocomplete="off" />
        </label>
        <div class="cards-count" id="count" role="status" aria-live="polite"></div>
      </div>

      <div class="cards-filters" aria-label="Filters">
        <div class="cards-filter-group">
          <div class="cards-filter-title">Categories</div>
          <div class="cards-filter-chips" id="chips-cat"></div>
        </div>
        <div class="cards-filter-group">
          <div class="cards-filter-title">Stats</div>
          <div class="cards-filter-chips" id="chips-stat"></div>
        </div>
        <button type="button" class="cards-filter-clear" id="btn-clear">Clear filters</button>
      </div>

      <div class="cards-table-wrap">
        <table class="cards-table">
          <colgroup>
            <col class="cards-col-id" />
            <col class="cards-col-name" />
            <col class="cards-col-slot" />
            <col class="cards-col-desc" />
            <col class="cards-col-drop" />
          </colgroup>
          <thead>
            <tr>
              <th class="cards-col-id" scope="col">ID</th>
              <th class="cards-col-name" scope="col">Card</th>
              <th class="cards-col-slot" scope="col">Slot</th>
              <th class="cards-col-desc" scope="col">Description</th>
              <th class="cards-col-drop" scope="col">Dropped by</th>
            </tr>
          </thead>
          <tbody id="rows"></tbody>
        </table>
      </div>
    </section>

    <dialog class="cards-modal" id="set-modal" aria-labelledby="set-modal-title">
      <div class="cards-modal__panel">
        <div class="cards-modal__head">
          <h2 class="cards-modal__title" id="set-modal-title">Set bonus</h2>
          <button type="button" class="cards-modal__close" id="set-modal-close" aria-label="Close">×</button>
        </div>
        <div class="cards-modal__body" id="set-modal-body"></div>
      </div>
    </dialog>
  `;

  const q = root.querySelector("#q") as HTMLInputElement;
  const rowsEl = root.querySelector("#rows") as HTMLElement;
  const countEl = root.querySelector("#count") as HTMLElement;
  const catWrap = root.querySelector("#chips-cat") as HTMLElement;
  const statWrap = root.querySelector("#chips-stat") as HTMLElement;
  const clearBtn = root.querySelector("#btn-clear") as HTMLButtonElement;
  const modal = root.querySelector("#set-modal") as HTMLDialogElement;
  const modalBody = root.querySelector("#set-modal-body") as HTMLElement;
  const modalTitle = root.querySelector("#set-modal-title") as HTMLElement;
  const modalClose = root.querySelector("#set-modal-close") as HTMLButtonElement;

  const state: FilterState = { q: "", categories: new Set(), stats: new Set() };

  const chipButton = (id: string, label: string, pressed: boolean, kind: "cat" | "stat"): string => {
    const cls = pressed ? "cards-chip cards-chip--on" : "cards-chip";
    return `<button type="button" class="${cls}" data-kind="${kind}" data-id="${escapeHtml(id)}" aria-pressed="${pressed ? "true" : "false"}">${escapeHtml(label)}</button>`;
  };

  const renderChips = (): void => {
    const ordered: CategoryKey[] = ["set", "autocast", "stats", "damage", "resist", "exp", "status", "utility"];
    catWrap.innerHTML = ordered
      .map((k) => chipButton(k, CATEGORY_LABELS[k], state.categories.has(k), "cat"))
      .join("");
    const stats: StatKey[] = ["STR", "AGI", "VIT", "INT", "DEX", "LUK"];
    statWrap.innerHTML = stats
      .map((k) => chipButton(k, k, state.stats.has(k), "stat"))
      .join("");
  };

  const apply = (): void => {
    const query = normalize(state.q);
    const filtered = cardsAll.filter((c) => {
      const dv = derivedById.get(c.id);
      const hay = [
        c.name,
        c.aegisName,
        c.slot ?? "",
        dv?.descText ?? "",
        ...c.drops.map((d) => d.monster),
      ]
        .join(" ")
        .toLowerCase();

      if (query && !hay.includes(query)) return false;

      if (state.categories.size) {
        const cats = dv?.categories ?? new Set<CategoryKey>();
        for (const want of state.categories) {
          if (!cats.has(want)) return false;
        }
      }

      if (state.stats.size) {
        const st = dv?.stats ?? new Set<StatKey>();
        for (const want of state.stats) {
          if (!st.has(want)) return false;
        }
      }

      return true;
    });
    rowsEl.innerHTML = renderRows(filtered);
    countEl.textContent = `${filtered.length.toLocaleString()} / ${cardsAll.length.toLocaleString()} cards`;
  };

  q.addEventListener("input", () => {
    state.q = q.value;
    apply();
  });

  const onChipClick = (e: Event): void => {
    const btn = (e.target as HTMLElement | null)?.closest("button.cards-chip") as HTMLButtonElement | null;
    if (!btn) return;
    const kind = btn.dataset.kind;
    const id = btn.dataset.id;
    if (!kind || !id) return;
    if (kind === "cat") {
      const k = id as CategoryKey;
      if (state.categories.has(k)) state.categories.delete(k);
      else state.categories.add(k);
    } else {
      const k = id as StatKey;
      if (state.stats.has(k)) state.stats.delete(k);
      else state.stats.add(k);
    }
    renderChips();
    apply();
  };
  catWrap.addEventListener("click", onChipClick);
  statWrap.addEventListener("click", onChipClick);

  clearBtn.addEventListener("click", () => {
    state.q = "";
    q.value = "";
    state.categories.clear();
    state.stats.clear();
    renderChips();
    apply();
    q.focus();
  });

  renderChips();
  apply();
  q.focus();

  const closeModal = (): void => {
    if (modal.open) modal.close();
  };
  modalClose.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  const openSetModalForCard = (card: CardEntry): void => {
    const dv = derivedById.get(card.id);
    const members = dv?.setMembers ?? [];
    modalTitle.textContent = `${card.name} — Set bonus`;
    if (!members.length) {
      modalBody.innerHTML = `<div class="set-grid"><div class="set-col"><div class="set-col__body">No set bonus found.</div></div></div>`;
      modal.showModal();
      return;
    }
    const setDesc = dv?.descText ?? "";
    const setTopHtml = descriptionToSetBlocksHtml(setDesc);
    const cols = members.map((name) => {
      const hit = cardByNameLower.get(name.toLowerCase());
      const desc = hit ? (derivedById.get(hit.id)?.descText ?? "") : "";
      const bodyHtml = hit ? descriptionToNonSetBlocksHtml(desc) : "";
      const body =
        hit && bodyHtml
          ? bodyHtml
          : hit
            ? `<div class="set-col__body">No description.</div>`
            : `<div class="set-col__body">Not found in card list.</div>`;
      return `<section class="set-col">
        <h3 class="set-col__title">${escapeHtml(name)}</h3>
        ${body}
      </section>`;
    });
    modalBody.innerHTML = `
      ${setTopHtml ? `<div class="set-top">${setTopHtml}</div>` : ""}
      <div class="set-grid">${cols.join("")}</div>
    `;
    modal.showModal();

    // Constrain modal width to the card columns row (set-grid), not the set-bonus description.
    // The set-bonus block will wrap within this width.
    requestAnimationFrame(() => {
      const panel = modal.querySelector(".cards-modal__panel") as HTMLElement | null;
      const grid = modal.querySelector(".set-grid") as HTMLElement | null;
      if (!panel || !grid) return;
      const computed = getComputedStyle(panel);
      const padX =
        (parseFloat(computed.paddingLeft) || 0) +
        (parseFloat(computed.paddingRight) || 0) +
        (parseFloat(computed.borderLeftWidth) || 0) +
        (parseFloat(computed.borderRightWidth) || 0);
      const cols = grid.querySelectorAll(".set-col");
      let contentW = 0;
      if (cols.length) {
        const gStyle = getComputedStyle(grid);
        const gap = parseFloat(gStyle.columnGap || gStyle.gap || "0") || 0;
        cols.forEach((col, i) => {
          contentW += col.getBoundingClientRect().width;
          if (i < cols.length - 1) contentW += gap;
        });
      } else {
        contentW = grid.scrollWidth;
      }
      const want = contentW + padX;
      const cap = Math.max(320, window.innerWidth - 16);
      const w = Math.min(want, cap);
      panel.style.width = `${w}px`;
      panel.style.maxWidth = `${cap}px`;
    });
  };

  // Delegate clicks on set-bonus blocks inside the table.
  rowsEl.addEventListener("click", (e) => {
    const el = (e.target as HTMLElement | null)?.closest("button.desc-block--click") as HTMLElement | null;
    if (!el) return;
    const idAttr = el.getAttribute("data-set-for");
    const id = idAttr ? Number.parseInt(idAttr, 10) : NaN;
    if (!Number.isFinite(id)) return;
    const card = cardsAll.find((c) => c.id === id);
    if (!card) return;
    openSetModalForCard(card);
  });
}

const appRoot = document.querySelector("#app") as HTMLElement;
mount(appRoot);

