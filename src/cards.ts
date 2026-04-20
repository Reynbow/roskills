import "./style.css";
import { inject } from "@vercel/analytics";
import cardsRaw from "./data/cards.json";

inject();

type CardDrop = {
  monster: string;
  /** rAthena drop rate in 1/10000 units (e.g. 1 → 0.01%). */
  rate: number;
  isMvp?: boolean;
};

type CardEntry = {
  id: number;
  aegisName: string;
  name: string;
  slot?: string;
  /** Plain-language effect text (from import; iRO Wiki DB via RagnaAPI). */
  description?: string;
  /** Item icon image URL (from import; iRO Wiki DB via RagnaAPI). */
  img?: string;
  /** Card illustration artwork URL (from import; Divine Pride). */
  cardArt?: string;
  /** Structured set bonus titles + members (scraped from Divine Pride). */
  setBonuses?: Array<{ title: string; members: string[] }>;
  drops: CardDrop[];
};

type CategoryKey = "mvp" | "set" | "autocast" | "stats" | "damage" | "resist" | "exp" | "status" | "utility";
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
  if (typeof rate !== "number" || !Number.isFinite(rate)) return "-";
  return `${(rate / 100).toFixed(2)}%`;
}

function dropsDisplayText(c: CardEntry): string {
  if (!c.drops?.length) return "-";
  return c.drops.map((d) => `${d.monster} (${formatDropRate(d.rate)})`).join(", ");
}

function normalizeSlotLabel(slotRaw: string | undefined): string {
  if (!slotRaw) return "-";
  const s = slotRaw.trim();
  if (!s) return "-";
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
    // Some sources include a title on the same line, e.g. "Hunter Set: Set bonus with ..."
    const idx = ln.toLowerCase().indexOf("set bonus with");
    if (idx < 0) continue;
    const tail = ln.slice(idx + "set bonus with".length).trim();
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

  // MVP-only: the card is dropped exclusively by MVP monsters.
  if (Array.isArray(c.drops) && c.drops.length > 0 && c.drops.every((dr) => dr.isMvp === true)) {
    categories.add("mvp");
  }

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

function looksLikeSetTitleLine(t: string): boolean {
  const s = t.trim();
  if (!s) return false;
  if (s.length > 48) return false;
  if (!/\bset\b/i.test(s)) return false;
  // Avoid misclassifying actual effect text as a title.
  if (/[.%:;]/.test(s)) return false;
  if (/\bbonus\b|\bchance\b|\bincreases?\b|\breduces?\b/i.test(s)) return false;
  return true;
}

function parseSetBonusTitleFromLine(ln: string): string {
  const s = ln.trim();
  const idx = s.toLowerCase().indexOf("set bonus with");
  if (idx <= 0) return "";
  const head = s.slice(0, idx).trim().replace(/[:\\-–]\\s*$/g, "").trim();
  if (!head) return "";
  if (!looksLikeSetTitleLine(head)) return "";
  return head;
}

function descriptionToBlocks(descRaw: string): Array<{ cls: string; html: string; isSet: boolean; rawText: string }> {
  const norm = descRaw.replace(/\r\n/g, "\n").trim();
  if (!norm) return [];

  const lines = norm.split("\n");
  /** @type {Array<{ cls: string; html: string; isSet: boolean; rawText: string }>} */
  const blocks: Array<{ cls: string; html: string; isSet: boolean; rawText: string }> = [];
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
      rawText: joined,
    });
    cur = [];
    curIsSet = false;
  };

  for (let i = 0; i < lines.length; i++) {
    const ln = lines[i] ?? "";
    const t = ln.trim();
    const next = (lines[i + 1] ?? "").trim();
    const isSet =
      t.toLowerCase().includes("set bonus") ||
      /^set bonus\b/i.test(t) ||
      (looksLikeSetTitleLine(t) && /^set bonus\b/i.test(next));
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

function parseSetBonusTitleAndMembers(setBlockRawText: string): { title: string; members: string[] } {
  const lines = setBlockRawText.split("\n").map((l) => l.trim()).filter(Boolean);
  let title = "";
  if (lines.length >= 2 && looksLikeSetTitleLine(lines[0]) && /^set bonus\b/i.test(lines[1])) {
    title = lines[0];
  }
  if (!title) {
    for (const ln of lines) {
      const t = parseSetBonusTitleFromLine(ln);
      if (t) {
        title = t;
        break;
      }
    }
  }
  const members = parseSetBonusMembers(setBlockRawText);
  return { title, members };
}

/** Sorted multiset key for comparing member lists (order-insensitive). */
function memberListKey(names: string[]): string {
  return [...new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean))].sort().join("\0");
}

/**
 * RagnaAPI/wiki text often lists only the *other* cards in the set ("Set bonus with A, B, C")
 * and omits the card you're reading. Divine Pride lists the full set including the current card.
 * Match either exact equality or equality after adding the current card name to the parsed list.
 */
function divineSetMatchesParsedMembers(
  divineMembers: string[],
  parsedMembers: string[],
  currentCardName: string,
): boolean {
  const d = memberListKey(divineMembers);
  const p = memberListKey(parsedMembers);
  if (d === p) return true;
  const withSelf = memberListKey([...parsedMembers, currentCardName]);
  return d === withSelf;
}

function setBlockRawToHtml(setBlockRawText: string): string {
  const esc = highlightKeywords(escapeHtml(setBlockRawText.trim())).replace(/\n/g, "<br/>");
  return `<div class="desc-blocks"><div class="desc-block desc-block--set">${esc}</div></div>`;
}

function descriptionToNonSetBlocksHtml(descRaw: string): string {
  const blocks = descriptionToBlocks(descRaw).filter((b) => !b.isSet);
  if (!blocks.length) return "";
  return `<div class="desc-blocks">${blocks.map((b) => `<div class="${b.cls}">${b.html}</div>`).join("")}</div>`;
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function cardArtUrl(c: CardEntry): string {
  const raw = (c.cardArt ?? "").trim();
  if (raw) return raw;
  // Deterministic default: Divine Pride hosts the card illustration artwork by item id.
  return `https://static.divine-pride.net/images/items/cards/${c.id}.png`;
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
                  ? (() => {
                      let { title, members } = parseSetBonusTitleAndMembers(b.rawText);
                      if (!title && Array.isArray(c.setBonuses) && c.setBonuses.length && members.length) {
                        const hit = c.setBonuses.find(
                          (s) =>
                            Array.isArray(s.members) &&
                            divineSetMatchesParsedMembers(s.members, members, c.name),
                        );
                        if (hit && typeof hit.title === "string") title = hit.title.trim();
                      }
                      const membersAttr = escapeHtml(encodeURIComponent(JSON.stringify(members)));
                      const titleAttr = escapeHtml(encodeURIComponent(title));
                      const rawAttr = escapeHtml(encodeURIComponent(b.rawText));
                      const titleChip = title ? `<div class="desc-set-title">${escapeHtml(title)}</div>` : "";
                      return `<button type="button" class="${b.cls} desc-block--click" data-set-for="${c.id}" data-set-members="${membersAttr}" data-set-title="${titleAttr}" data-set-raw="${rawAttr}" aria-label="Open set bonus details">${titleChip}${b.html}</button>`;
                    })()
                  : `<div class="${b.cls}">${b.html}</div>`,
              )
              .join("")}</div>`
          : "-";
      const imgUrl = escapeHtml(cardArtUrl(c));
      return `<tr>
        <td class="cards-col-art">
          <button type="button" class="cards-art-btn" data-art-for="${c.id}" aria-label="Open card artwork">
            <img class="cards-art" src="${imgUrl}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-id="${c.id}" />
          </button>
        </td>
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
  mvp: "MVP cards",
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
            <col class="cards-col-art" />
            <col class="cards-col-name" />
            <col class="cards-col-slot" />
            <col class="cards-col-desc" />
            <col class="cards-col-drop" />
          </colgroup>
          <thead>
            <tr>
              <th class="cards-col-art" scope="col">Art</th>
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

    <dialog class="cards-modal" id="art-modal" aria-labelledby="art-modal-title">
      <button type="button" class="cards-art-nav cards-art-nav--prev" id="art-modal-prev" aria-label="Previous card artwork">‹</button>
      <button type="button" class="cards-art-nav cards-art-nav--next" id="art-modal-next" aria-label="Next card artwork">›</button>
      <div class="cards-modal__panel cards-art-modal__panel">
        <div class="cards-modal__head">
          <h2 class="cards-modal__title" id="art-modal-title">Card artwork</h2>
          <button type="button" class="cards-modal__close" id="art-modal-close" aria-label="Close">×</button>
        </div>
        <div class="cards-modal__body">
          <img class="cards-art-full" id="art-modal-img" alt="" />
        </div>
      </div>
    </dialog>

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
  const artModal = root.querySelector("#art-modal") as HTMLDialogElement;
  const artModalTitle = root.querySelector("#art-modal-title") as HTMLElement;
  const artModalClose = root.querySelector("#art-modal-close") as HTMLButtonElement;
  const artModalImg = root.querySelector("#art-modal-img") as HTMLImageElement;
  const artModalPrev = root.querySelector("#art-modal-prev") as HTMLButtonElement;
  const artModalNext = root.querySelector("#art-modal-next") as HTMLButtonElement;
  const artModalPanel = root.querySelector("#art-modal .cards-art-modal__panel") as HTMLElement;
  const imgFallbackFor = (id: number): string => `https://static.divine-pride.net/images/items/collection/${id}.png`;

  const state: FilterState = { q: "", categories: new Set(), stats: new Set() };
  let visibleArtIds: number[] = [];
  let artIndex = -1;

  const chipButton = (id: string, label: string, pressed: boolean, kind: "cat" | "stat"): string => {
    const cls = pressed ? "cards-chip cards-chip--on" : "cards-chip";
    return `<button type="button" class="${cls}" data-kind="${kind}" data-id="${escapeHtml(id)}" aria-pressed="${pressed ? "true" : "false"}">${escapeHtml(label)}</button>`;
  };

  const renderChips = (): void => {
    const ordered: CategoryKey[] = ["mvp", "set", "autocast", "stats", "damage", "resist", "exp", "status", "utility"];
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
    visibleArtIds = filtered.map((c) => c.id);
  };

  // If a card art image is missing, fall back to Divine Pride's collection icon.
  rowsEl.addEventListener(
    "error",
    (e) => {
      const img = e.target as HTMLImageElement | null;
      if (!img || img.tagName !== "IMG" || !img.classList.contains("cards-art")) return;
      if (img.dataset.fallbackApplied === "1") return;
      const id = img.dataset.id ? Number.parseInt(img.dataset.id, 10) : NaN;
      if (!Number.isFinite(id)) return;
      img.dataset.fallbackApplied = "1";
      img.src = imgFallbackFor(id);
    },
    true,
  );

  const closeArtModal = (): void => {
    if (artModal.open) artModal.close();
  };
  const positionArtNav = (): void => {
    if (!artModal.open) return;
    const r = artModalPanel.getBoundingClientRect();
    const y = r.top + r.height * 0.52;
    const gap = 16;
    const bw = artModalPrev.getBoundingClientRect().width || 42;
    const left = Math.max(8, r.left - gap - bw);
    const right = Math.min(window.innerWidth - 8 - bw, r.right + gap);
    artModalPrev.style.left = `${left}px`;
    artModalPrev.style.top = `${y}px`;
    artModalNext.style.left = `${right}px`;
    artModalNext.style.top = `${y}px`;
  };
  artModalClose.addEventListener("click", closeArtModal);
  artModal.addEventListener("click", (e) => {
    if (e.target === artModal) closeArtModal();
  });
  window.addEventListener("resize", positionArtNav);

  const setArtModalCardById = (id: number): void => {
    const card = cardsAll.find((c) => c.id === id);
    if (!card) return;
    artModalTitle.textContent = card.name;
    artModalImg.alt = `${card.name} card artwork`;
    artModalImg.src = cardArtUrl(card);
    requestAnimationFrame(positionArtNav);
  };

  const stepArt = (dir: -1 | 1): void => {
    if (!visibleArtIds.length) return;
    if (artIndex < 0) artIndex = 0;
    artIndex = (artIndex + dir + visibleArtIds.length) % visibleArtIds.length;
    const id = visibleArtIds[artIndex];
    if (typeof id !== "number") return;
    setArtModalCardById(id);
  };

  artModalPrev.addEventListener("click", () => stepArt(-1));
  artModalNext.addEventListener("click", () => stepArt(1));
  artModal.addEventListener("keydown", (e) => {
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      stepArt(-1);
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      stepArt(1);
    }
  });

  rowsEl.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement | null)?.closest("button.cards-art-btn") as HTMLButtonElement | null;
    if (!btn) return;
    const idAttr = btn.getAttribute("data-art-for");
    const id = idAttr ? Number.parseInt(idAttr, 10) : NaN;
    if (!Number.isFinite(id)) return;
    const ix = visibleArtIds.indexOf(id);
    artIndex = ix >= 0 ? ix : 0;
    setArtModalCardById(id);
    artModal.showModal();
    requestAnimationFrame(positionArtNav);
  });

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
    if (!modal.open) return;
    modal.close();
    const panelEl = modal.querySelector(".cards-modal__panel") as HTMLElement | null;
    modal.style.removeProperty("width");
    modal.style.removeProperty("max-width");
    panelEl?.style.removeProperty("width");
    panelEl?.style.removeProperty("max-width");
  };
  modalClose.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  // Delegate clicks on set-bonus blocks inside the table.
  rowsEl.addEventListener("click", (e) => {
    const el = (e.target as HTMLElement | null)?.closest("button.desc-block--click") as HTMLElement | null;
    if (!el) return;
    const idAttr = el.getAttribute("data-set-for");
    const id = idAttr ? Number.parseInt(idAttr, 10) : NaN;
    if (!Number.isFinite(id)) return;
    const card = cardsAll.find((c) => c.id === id);
    if (!card) return;
    const membersAttr = el.getAttribute("data-set-members") ?? "";
    const titleAttr = el.getAttribute("data-set-title") ?? "";
    const rawAttr = el.getAttribute("data-set-raw") ?? "";
    let members: string[] = [];
    let setTitle = "";
    let rawText = "";
    try {
      const parsed = JSON.parse(decodeURIComponent(membersAttr));
      if (Array.isArray(parsed)) members = parsed.filter((x) => typeof x === "string");
    } catch {
      members = [];
    }
    try {
      setTitle = decodeURIComponent(titleAttr || "");
    } catch {
      setTitle = "";
    }
    try {
      rawText = decodeURIComponent(rawAttr || "");
    } catch {
      rawText = "";
    }

    // Only show the specific set bonus clicked.
    modalTitle.textContent = setTitle ? `${card.name} - ${setTitle}` : `${card.name} - Set bonus`;
    if (!members.length) {
      modalBody.innerHTML = `<div class="set-grid"><div class="set-col"><div class="set-col__body">No set bonus found.</div></div></div>`;
      modal.showModal();
      return;
    }
    // Wiki text often omits the equipped card from "Set bonus with ..."; always include the row card in the modal.
    const selfKey = card.name.trim().toLowerCase();
    const hasSelf = members.some((m) => m.trim().toLowerCase() === selfKey);
    const displayMembers = hasSelf ? members : [card.name, ...members];

    const setTopHtml = setBlockRawToHtml(rawText || (el.textContent ?? "").trim());
    const cols = displayMembers.map((name) => {
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
      // Width from the card columns row only (fixed flex basis per .set-col). Do not use set-bonus
      // text width or summed rects after wrap — those inflate the modal past the panel row.
      const colEls = grid.querySelectorAll(".set-col");
      let contentW = 0;
      if (colEls.length) {
        const gStyle = getComputedStyle(grid);
        const gap = parseFloat(gStyle.columnGap || gStyle.gap || "0") || 0;
        const cw = colEls[0].getBoundingClientRect().width;
        const n = colEls.length;
        contentW = n * cw + (n - 1) * gap;
      } else {
        contentW = grid.scrollWidth;
      }
      const want = contentW + padX;
      const cap = Math.max(320, window.innerWidth - 16);
      const w = Math.min(want, cap);
      panel.style.width = `${w}px`;
      panel.style.maxWidth = `${cap}px`;
    });
  });
}

const appRoot = document.querySelector("#app") as HTMLElement;
mount(appRoot);

