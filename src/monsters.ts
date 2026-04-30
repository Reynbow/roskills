import "./style.css";
import { inject } from "@vercel/analytics";
import monstersRaw from "./data/monsters.json";
import armourRaw from "./data/armour.json";
import weaponsRaw from "./data/weapons.json";
import cardsRaw from "./data/cards.json";

// Initialize Vercel Web Analytics (never block app shell if script fails)
try {
  inject();
} catch {
  /* ignore */
}

type MonsterEntry = {
  id: number;
  aegisName: string;
  name: string;
  level: number;
  hp: number | null;
  sp: number | null;
  baseExp: number | null;
  jobExp: number | null;
  attackMin: number | null;
  attackMax: number | null;
  defense: number | null;
  magicDefense: number | null;
  race: string | null;
  size: string | null;
  element: string | null;
  elementLevel: number | null;
  atkRange: number | null;
  hit: number | null;
  flee: number | null;
  isMvp: boolean;
  sprite: string;
  maps: Array<{ map: string; count: number }>;
  drops?: Array<{ aegis: string; id: number | null; name: string | null; rate: number; isMvp: boolean }>;
};

type FilterState = {
  q: string;
  mobId: number | null;
  dropItemId: number | null;
  races: Set<string>;
  elements: Set<string>;
  sizes: Set<string>;
  mvp: Set<"mvp" | "normal">;
};

const monstersAll: MonsterEntry[] = (monstersRaw as MonsterEntry[])
  .slice()
  .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);

type MonsterDerived = {
  m: MonsterEntry;
  hay: string;
  dropIds: number[];
};

const monstersDerived: MonsterDerived[] = monstersAll.map((m) => {
  const drops = Array.isArray(m.drops) ? m.drops : [];
  const dropHay = drops
    .flatMap((d) => [d?.name ?? "", d?.aegis ?? ""])
    .map((x) => String(x || "").trim())
    .filter(Boolean)
    .join(" ");
  const hay = normalize([m.name, m.aegisName, m.race ?? "", m.element ?? "", m.size ?? "", dropHay].join(" "));
  const dropIds = drops
    .map((d) => (d && typeof d.id === "number" && Number.isFinite(d.id) ? d.id : null))
    .filter((x): x is number => typeof x === "number");
  return { m, hay, dropIds };
});

type DropItemOption = { id: number; name: string };
const dropItems: DropItemOption[] = (() => {
  const byId = new Map<number, string>();
  for (const m of monstersAll) {
    const drops = Array.isArray(m.drops) ? m.drops : [];
    for (const d of drops) {
      const id = typeof d?.id === "number" && Number.isFinite(d.id) ? d.id : null;
      const name = String(d?.name || "").trim();
      if (!id || !name) continue;
      if (!byId.has(id)) byId.set(id, name);
    }
  }
  return [...byId.entries()]
    .map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
})();

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const qq = Math.max(0, Math.min(1, q));
  const pos = (sorted.length - 1) * qq;
  const base = Math.floor(pos);
  const rest = pos - base;
  const a = sorted[base] ?? sorted[0]!;
  const b = sorted[Math.min(base + 1, sorted.length - 1)] ?? a;
  return a + (b - a) * rest;
}

const DEF_VALUES = monstersAll
  .map((m) => m.defense)
  .filter((x): x is number => typeof x === "number" && Number.isFinite(x))
  .sort((a, b) => a - b);
const MDEF_VALUES = monstersAll
  .map((m) => m.magicDefense)
  .filter((x): x is number => typeof x === "number" && Number.isFinite(x))
  .sort((a, b) => a - b);

const DEF_Q25 = quantile(DEF_VALUES, 0.25);
const DEF_Q75 = quantile(DEF_VALUES, 0.75);
const MDEF_Q25 = quantile(MDEF_VALUES, 0.25);
const MDEF_Q75 = quantile(MDEF_VALUES, 0.75);

function defBand(kind: "def" | "mdef", v: number | null): "high" | "low" | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  const q25 = kind === "def" ? DEF_Q25 : MDEF_Q25;
  const q75 = kind === "def" ? DEF_Q75 : MDEF_Q75;
  if (v >= q75) return "high";
  if (v <= q25) return "low";
  return null;
}

function defChevronHtml(kind: "def" | "mdef", v: number | null): string {
  const band = defBand(kind, v);
  if (band === "high") {
    return `<span class="equip-col__chev equip-col__chev--up" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none"><path d="M2.2 7.6 6 3.8l3.8 3.8" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
  }
  if (band === "low") {
    return `<span class="equip-col__chev equip-col__chev--down" aria-hidden="true"><svg viewBox="0 0 12 12" fill="none"><path d="M2.2 4.4 6 8.2l3.8-3.8" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;
  }
  return "";
}

type EquipIndexEntry = { id: number };
const armourIdSet = new Set<number>((armourRaw as EquipIndexEntry[]).map((x) => x.id).filter((x) => typeof x === "number"));
const weaponsIdSet = new Set<number>((weaponsRaw as EquipIndexEntry[]).map((x) => x.id).filter((x) => typeof x === "number"));
const cardIdSet = new Set<number>(((cardsRaw as Array<{ id: number }>).map((x) => x.id) as number[]).filter((x) => typeof x === "number"));

function escapeHtml(s: string): string {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalize(s: string): string {
  return String(s || "").trim().toLowerCase();
}

/** Divine Pride large minimap PNG; unknown ids return a tiny placeholder image. */
function divinePrideMapImageUrl(mapId: string): string {
  const id = mapId.trim();
  return `https://static.divine-pride.net/images/maps/large/${encodeURIComponent(id)}.png`;
}

const ELEMENTS: readonly string[] = [
  "Neutral",
  "Water",
  "Earth",
  "Fire",
  "Wind",
  "Poison",
  "Holy",
  "Dark",
  "Ghost",
  "Undead",
];

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Lightweight element matchup model (pre-renewal-ish).
 * Returns "damage taken" multipliers by attack element (percent).
 * This is intentionally simple and readable; we can swap to a canonical rAthena table later if desired.
 */
function elementDamageTaken(defElem: string | null, defLv: number | null): Array<{ elem: string; pct: number }> {
  const e = String(defElem || "").trim();
  const lv = clamp(typeof defLv === "number" && Number.isFinite(defLv) ? defLv : 1, 1, 4);

  const base = new Map(ELEMENTS.map((k) => [k, 100]));

  // Wheel: Fire -> Earth -> Wind -> Water -> Fire
  const strongAgainst: Record<string, string> = { Fire: "Earth", Earth: "Wind", Wind: "Water", Water: "Fire" };
  const weakAgainst: Record<string, string> = { Fire: "Water", Earth: "Fire", Wind: "Earth", Water: "Wind" };

  const set = (atk: string, pct: number): void => {
    if (base.has(atk)) base.set(atk, pct);
  };

  if (e in strongAgainst || e in weakAgainst) {
    // More extreme at higher element levels.
    const weakPct = 125 + (lv - 1) * 25; // 125,150,175,200
    const resistPct = 75 - (lv - 1) * 25; // 75,50,25,0
    set(weakAgainst[e]!, weakPct);
    set(strongAgainst[e]!, resistPct);
    // Same element tends to resist more at higher levels
    set(e, resistPct);
  }

  if (e === "Holy") {
    set("Dark", 150 + (lv - 1) * 25);
    set("Undead", 150 + (lv - 1) * 25);
    set("Holy", 75 - (lv - 1) * 25);
  } else if (e === "Dark") {
    set("Holy", 150 + (lv - 1) * 25);
    set("Dark", 75 - (lv - 1) * 25);
  } else if (e === "Ghost") {
    // Ghost: neutral hits reduced, ghost hits increased (simplified).
    set("Neutral", 75 - (lv - 1) * 25);
    set("Ghost", 125 + (lv - 1) * 25);
  } else if (e === "Undead") {
    set("Holy", 150 + (lv - 1) * 25);
    set("Poison", 75 - (lv - 1) * 25);
    set("Undead", 75 - (lv - 1) * 25);
  } else if (e === "Poison") {
    set("Fire", 125 + (lv - 1) * 25);
    set("Poison", 75 - (lv - 1) * 25);
  } else if (e === "Neutral") {
    set("Ghost", 75 - (lv - 1) * 25);
  }

  return ELEMENTS.map((k) => ({ elem: k, pct: base.get(k) ?? 100 }));
}

function elementChartHtml(m: MonsterEntry): string {
  const el = m.element ?? "Neutral";
  const lv = typeof m.elementLevel === "number" ? m.elementLevel : 1;
  const rows = elementDamageTaken(el, lv);
  return `<div class="elem-chart" role="group" aria-label="Element damage taken chart">${rows
    .map((r) => {
      const pct = clamp(Math.round(r.pct), 0, 300);
      const cls = pct > 100 ? "elem-chip elem-chip--weak" : pct < 100 ? "elem-chip elem-chip--resist" : "elem-chip";
      const vLabel = pct === 0 ? "IMMUNE" : `${pct}%`;
      const title = pct === 0 ? `${r.elem} immune` : `${r.elem} ${pct}%`;
      return `<div class="${cls}" title="${escapeHtml(title)}"><div class="elem-chip__k">${escapeHtml(
        r.elem,
      )}</div><div class="elem-chip__v">${escapeHtml(vLabel)}</div></div>`;
    })
    .join("")}</div>`;
}

function chipButton(id: string, label: string, pressed: boolean, kind: string, desc?: string): string {
  const cls = pressed ? "cards-chip cards-chip--on" : "cards-chip";
  const tip = desc ? ` data-tooltip="${escapeHtml(label)}" data-tipbody="${escapeHtml(desc)}"` : "";
  return `<button type="button" class="${cls}" data-kind="${escapeHtml(kind)}" data-id="${escapeHtml(
    id,
  )}" aria-pressed="${pressed ? "true" : "false"}"${tip}>${escapeHtml(label)}</button>`;
}

function renderFilters(state: FilterState, races: string[], elements: string[], sizes: string[]): string {
  const raceChips = races.map((r) => chipButton(r, r, state.races.has(r), "race")).join("");
  const elementChips = elements.map((e) => chipButton(e, e, state.elements.has(e), "element")).join("");
  const sizeChips = sizes.map((s) => chipButton(s, s, state.sizes.has(s), "size")).join("");
  const mvpChips = [
    chipButton("mvp", "MVP", state.mvp.has("mvp"), "mvp", "MVP monsters"),
    chipButton("normal", "Normal", state.mvp.has("normal"), "mvp", "Non‑MVP monsters"),
  ].join("");

  const anyOn =
    state.mobId !== null ||
    state.dropItemId !== null ||
    Boolean(state.q.trim()) ||
    state.races.size ||
    state.elements.size ||
    state.sizes.size ||
    state.mvp.size
      ? true
      : false;

  return `
    <div class="cards-filters equip-filters" aria-label="Monster filters">
      <div class="cards-filters__head">
        <div class="cards-filters__title">Filters</div>
        <button type="button" class="cards-filter-clear" id="btn-clear" ${anyOn ? "" : "disabled"}>Clear</button>
      </div>
      <div class="cards-filter-group">
        <div class="cards-filter-title">Race</div>
        <div class="cards-filter-chips" id="chips-race">${raceChips}</div>
      </div>
      <div class="cards-filter-group">
        <div class="cards-filter-title">Element</div>
        <div class="cards-filter-chips" id="chips-element">${elementChips}</div>
      </div>
      <div class="cards-filter-group">
        <div class="cards-filter-title">Size</div>
        <div class="cards-filter-chips" id="chips-size">${sizeChips}</div>
      </div>
      <div class="cards-filter-group">
        <div class="cards-filter-title">Type</div>
        <div class="cards-filter-chips" id="chips-mvp">${mvpChips}</div>
      </div>
    </div>
  `;
}

function statColsHtml(m: MonsterEntry): string {
  const atk =
    typeof m.attackMin === "number" && typeof m.attackMax === "number"
      ? `${m.attackMin}–${m.attackMax}`
      : typeof m.attackMin === "number"
        ? String(m.attackMin)
        : "-";

  const rows: Array<{ k: string; v: string }> = [
    { k: "ATK", v: atk },
    { k: "DEF", v: typeof m.defense === "number" ? String(m.defense) : "-" },
    { k: "MDEF", v: typeof m.magicDefense === "number" ? String(m.magicDefense) : "-" },
    { k: "Size", v: m.size || "-" },
    { k: "Base EXP", v: typeof m.baseExp === "number" ? m.baseExp.toLocaleString() : "-" },
    { k: "Job EXP", v: typeof m.jobExp === "number" ? m.jobExp.toLocaleString() : "-" },
  ];

  return `<div class="equip-cols" role="list">${rows
    .map((r) => {
      const k = r.k;
      const chev =
        k === "DEF"
          ? defChevronHtml("def", m.defense)
          : k === "MDEF"
            ? defChevronHtml("mdef", m.magicDefense)
            : "";
      const defTip =
        k === "DEF"
          ? defBand("def", m.defense)
          : k === "MDEF"
            ? defBand("mdef", m.magicDefense)
            : null;
      const defTipAttr =
        defTip === "high"
          ? ` data-tooltip="${escapeHtml(k === "DEF" ? "High DEF" : "High MDEF")}" data-tipbody="${escapeHtml(
              "Top 25% relative to all monsters.",
            )}"`
          : defTip === "low"
            ? ` data-tooltip="${escapeHtml(k === "DEF" ? "Low DEF" : "Low MDEF")}" data-tipbody="${escapeHtml(
                "Bottom 25% relative to all monsters.",
              )}"`
            : "";
      const sizeTip =
        k === "Size"
          ? ` data-tooltip="${escapeHtml("Monster size")}" data-tipbody="${escapeHtml(
              "Physical weapon damage is multiplied by a size modifier (Small/Medium/Large):\nDagger 100/75/50\n1H Sword 75/100/75\n2H Sword 75/75/100\nSpear 75/75/100\nAxe 50/75/100\nMace 75/100/100\nBow 100/100/75\nKatar 75/100/75\nBook 100/100/50\n(Guns/Rods/Staff are often 100/100/100.)",
            )}"`
          : "";
      return `<div class="equip-col" role="listitem"${sizeTip}><div class="equip-col__k">${escapeHtml(
        k,
      )}</div><div class="equip-col__v">${escapeHtml(r.v)}</div>${chev}</div>`.replace(
        'role="listitem"',
        `role="listitem"${defTipAttr}${sizeTip}`,
      );
    })
    .join("")}</div>`;
}

function mapsHtml(m: MonsterEntry): string {
  const maps = Array.isArray(m.maps) ? m.maps : [];
  if (!maps.length) return `<div class="cards-empty">Unknown</div>`;
  return `<div class="cards-drop-maps">${maps
    .map((x) => {
      const count = typeof x.count === "number" && Number.isFinite(x.count) ? x.count : 0;
      const countHtml =
        count > 0
          ? `<span class="cards-drop-map__count" aria-label="${count.toLocaleString()} spawns in rAthena scripts">${count.toLocaleString()}</span>`
          : "";
      return `<button type="button" class="cards-drop-map" data-map="${escapeHtml(
        x.map,
      )}" aria-label="Map ${escapeHtml(
        x.map,
      )}: click to copy name, hover for preview"><span class="cards-drop-map__name">${escapeHtml(
        x.map,
      )}</span>${countHtml}</button>`;
    })
    .join("")}</div>`;
}

function dropsHtml(m: MonsterEntry): string {
  const drops = Array.isArray(m.drops) ? m.drops : [];
  if (!drops.length) {
    return `<div class="desc-block desc-block--plain"><div class="equip-stat__k">Drops</div><div class="cards-empty">Unknown</div></div>`;
  }

  return `<div class="desc-block desc-block--plain">
    <div class="equip-stat__k">Drops</div>
    <div class="equip-obtain-grid">
      ${drops
        .slice(0, 18)
        .map((d) => {
          const label = d.name || d.aegis;
          const meta = `${d.isMvp ? "MVP " : ""}${(d.rate / 100).toFixed(2)}%`;
          const icon =
            typeof d.id === "number" && Number.isFinite(d.id)
              ? `https://static.divine-pride.net/images/items/item/${d.id}.png`
              : "";
          const iconHtml = icon
            ? `<img class="monster-drop-icon" src="${escapeHtml(icon)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" />`
            : "";
          const id = typeof d.id === "number" && Number.isFinite(d.id) ? d.id : null;
          const href =
            id && armourIdSet.has(id)
              ? `/armour?item=${id}`
              : id && weaponsIdSet.has(id)
                ? `/weapons?item=${id}`
                : id && cardIdSet.has(id)
                  ? `/cards?card=${id}`
                  : "";
          const cls = href ? "equip-obtain equip-obtain--drop monster-drop-link" : "equip-obtain equip-obtain--drop";
          const inner = `${iconHtml}<span class="monster-drop-name">${escapeHtml(label)}</span> <span class="pets-source__meta">${escapeHtml(meta)}</span>`;
          return href
            ? `<a class="${cls}" href="${escapeHtml(href)}" aria-label="View ${escapeHtml(
                label,
              )} in equipment library">${inner}</a>`
            : `<div class="${cls}">${inner}</div>`;
        })
        .join("")}
    </div>
  </div>`;
}

function rowCardHtml(m: MonsterEntry): string {
  const sprite = m.sprite ? escapeHtml(m.sprite) : "";
  const mobBackdrop = sprite
    ? `<img class="cards-rowcard__mob" src="${sprite}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" />`
    : "";

  const subtitle = `${m.isMvp ? "MVP · " : ""}${m.race ?? "Unknown"} · ${m.element ?? "?"}${typeof m.elementLevel === "number" ? ` ${m.elementLevel}` : ""}`;
  const lvLine = `Lv ${escapeHtml(String(m.level ?? "-"))}`;
  const hpLine = `HP ${escapeHtml(typeof m.hp === "number" ? m.hp.toLocaleString() : "-")}`;
  return `<article class="cards-rowcard">
    ${mobBackdrop}
    <div class="cards-rowcard__name">
      <div class="cards-name-block">
        <div class="cards-name">${escapeHtml(m.name)}<span class="entity-id">#${escapeHtml(String(m.id))}</span></div>
        <div class="monsters-meta">${lvLine} · ${hpLine}</div>
        <div class="cards-rowcard__slot">${escapeHtml(subtitle)}</div>
      </div>
    </div>
    <div class="cards-rowcard__desc">
      <div class="desc-blocks">
        <div class="monster-split">
          <div class="desc-block desc-block--plain">${statColsHtml(m)}</div>
          <div class="desc-block desc-block--plain">${elementChartHtml(m)}</div>
        </div>
        ${dropsHtml(m)}
      </div>
    </div>
    <div class="cards-rowcard__drops">
      ${mapsHtml(m)}
    </div>
  </article>`;
}

function renderRows(rows: MonsterEntry[]): string {
  if (!rows.length) return `<div class="cards-empty">No matches.</div>`;
  return rows.map(rowCardHtml).join("");
}

function mount(root: HTMLElement): void {
  const races = Array.from(new Set(monstersAll.map((m) => m.race).filter(Boolean) as string[])).sort((a, b) =>
    a.localeCompare(b),
  );
  const elements = Array.from(new Set(monstersAll.map((m) => m.element).filter(Boolean) as string[])).sort((a, b) =>
    a.localeCompare(b),
  );
  const sizes = Array.from(new Set(monstersAll.map((m) => m.size).filter(Boolean) as string[])).sort((a, b) =>
    a.localeCompare(b),
  );

  root.innerHTML = `
    <header class="site-header">
      <div class="site-header__left">
        <a class="site-brand" href="/">RO Pre-Renewal</a>
        <nav class="site-nav" aria-label="Site">
          <a class="site-nav__link" href="/skills">Skill Planner</a>
          <a class="site-nav__link" href="/cards">Card Library</a>
          <a class="site-nav__link" href="/pets">Pets</a>
          <a class="site-nav__link" href="/mounts">Mounts</a>
          <a class="site-nav__link site-nav__link--active" href="/monsters" aria-current="page">Monsters</a>
          <a class="site-nav__link" href="/armour">Armour</a>
          <a class="site-nav__link" href="/weapons">Weapons</a>
        </nav>
      </div>
    </header>

    <section class="page equip-page equip-page--monsters">
      <div class="cards-windowhead" role="banner" aria-label="Monsters page header">
        <div class="cards-windowhead__left">
          <h1 class="cards-windowhead__title">Monsters</h1>
        </div>
      </div>

      <div class="cards-toolbar" role="search">
        <label class="cards-search">
          <input id="q" class="cards-search__input" type="search" placeholder="search..." autocomplete="off" aria-label="Search monsters" />
        </label>
        <label class="cards-search">
          <input
            id="drop-item"
            class="cards-search__input"
            type="search"
            placeholder="drop item..."
            autocomplete="off"
            aria-label="Filter by dropped item"
            list="drop-items"
          />
        </label>
        <datalist id="drop-items">
          ${dropItems.map((it) => `<option value="${escapeHtml(it.name)} (#${it.id})"></option>`).join("")}
        </datalist>
        <div class="cards-count" id="count" role="status" aria-live="polite"></div>
      </div>

      ${renderFilters(
        { q: "", mobId: null, dropItemId: null, races: new Set(), elements: new Set(), sizes: new Set(), mvp: new Set() },
        races,
        elements,
        sizes,
      )}

      <div id="equip-tooltip" class="cards-filter-tooltip equip-tooltip" role="tooltip" aria-hidden="true"></div>
      <div id="cards-map-tooltip" class="cards-map-tooltip" role="tooltip" aria-hidden="true"></div>
      <div id="cards-copy-toast" class="cards-copy-toast" role="status" aria-live="polite" aria-atomic="true" aria-hidden="true"></div>

      <div class="cards-rowcards-wrap" id="rows-wrap">
        <div class="cards-rowcards" id="rows"></div>
      </div>
    </section>
  `;

  const q = root.querySelector("#q") as HTMLInputElement;
  const dropItem = root.querySelector("#drop-item") as HTMLInputElement;
  const rowsEl = root.querySelector("#rows") as HTMLElement;
  const countEl = root.querySelector("#count") as HTMLElement;
  const tipEl = root.querySelector("#equip-tooltip") as HTMLElement;
  const mapTooltip = root.querySelector("#cards-map-tooltip") as HTMLElement;
  const copyToastEl = root.querySelector("#cards-copy-toast") as HTMLElement;
  const listWrapEl = root.querySelector("#rows-wrap") as HTMLElement;
  const filtersEl = root.querySelector(".equip-filters") as HTMLElement;
  const clearBtn = root.querySelector("#btn-clear") as HTMLButtonElement;

  const state: FilterState = {
    q: "",
    mobId: null,
    dropItemId: null,
    races: new Set(),
    elements: new Set(),
    sizes: new Set(),
    mvp: new Set(),
  };
  let tipActive: HTMLElement | null = null;
  let applyTimer: number | undefined;

  const hideTip = (): void => {
    tipEl.classList.remove("cards-filter-tooltip--visible");
    tipEl.classList.remove("cards-filter-tooltip--below");
    tipEl.setAttribute("aria-hidden", "true");
    tipEl.innerHTML = "";
    tipActive = null;
  };

  const showTip = (target: HTMLElement): void => {
    const label = (target.getAttribute("data-tooltip") || "").trim();
    if (!label) return;
    if (tipActive === target && tipEl.classList.contains("cards-filter-tooltip--visible")) return;
    tipActive = target;
    const body = (target.getAttribute("data-tipbody") || "").trim();
    tipEl.innerHTML = `<div class="cards-filter-tooltip__inner"><strong class="cards-filter-tooltip__label">${escapeHtml(
      label,
    )}</strong>${body ? `<p class="cards-filter-tooltip__desc">${escapeHtml(body)}</p>` : ""}</div>`;
    tipEl.setAttribute("aria-hidden", "false");
    tipEl.classList.remove("cards-filter-tooltip--visible");
    tipEl.classList.remove("cards-filter-tooltip--below");
    void tipEl.offsetWidth;

    const r = target.getBoundingClientRect();
    const gap = 10;
    const cx = r.left + r.width / 2;
    tipEl.style.left = `${cx}px`;
    tipEl.style.top = `${r.top - gap}px`;

    requestAnimationFrame(() => {
      const tr = tipEl.getBoundingClientRect();
      if (tr.top < 8) {
        tipEl.classList.add("cards-filter-tooltip--below");
        tipEl.style.top = `${r.bottom + gap}px`;
      }
      const tr2 = tipEl.getBoundingClientRect();
      const pad = 8;
      let shift = 0;
      if (tr2.left < pad) shift = pad - tr2.left;
      else if (tr2.right > window.innerWidth - pad) shift = window.innerWidth - pad - tr2.right;
      if (shift !== 0) {
        const cur = parseFloat(tipEl.style.left) || cx;
        tipEl.style.left = `${cur + shift}px`;
      }
      requestAnimationFrame(() => {
        tipEl.classList.add("cards-filter-tooltip--visible");
      });
    });
  };

  const apply = (): void => {
    const query = normalize(q.value);
    state.q = query;
    const out: MonsterEntry[] = [];
    for (const d of monstersDerived) {
      const m = d.m;
      if (state.mobId !== null) {
        if (m.id === state.mobId) out.push(m);
        continue;
      }
      if (state.dropItemId !== null) {
        // Drops are short (<= ~12), linear scan is fine but avoid rebuilding arrays/strings.
        if (!d.dropIds.includes(state.dropItemId)) continue;
      }
      if (query && !d.hay.includes(query)) continue;
      if (state.races.size && (!m.race || !state.races.has(m.race))) continue;
      if (state.elements.size && (!m.element || !state.elements.has(m.element))) continue;
      if (state.sizes.size && (!m.size || !state.sizes.has(m.size))) continue;
      if (state.mvp.size) {
        const key: "mvp" | "normal" = m.isMvp ? "mvp" : "normal";
        if (!state.mvp.has(key)) continue;
      }
      out.push(m);
    }
    rowsEl.innerHTML = renderRows(out);
    countEl.textContent = `${out.length.toLocaleString()} / ${monstersAll.length.toLocaleString()} monsters`;
  };

  const scheduleApply = (): void => {
    if (applyTimer !== undefined) window.clearTimeout(applyTimer);
    // Debounce keystrokes to avoid doing full list filtering on every single input event.
    applyTimer = window.setTimeout(() => {
      applyTimer = undefined;
      apply();
    }, 70);
  };

  q.addEventListener("input", () => {
    syncClear();
    scheduleApply();
  });
  dropItem.addEventListener("input", () => {
    const raw = String(dropItem.value || "").trim();
    const m = /#(\d+)\s*\)?\s*$/.exec(raw);
    if (m) {
      const n = parseInt(m[1]!, 10);
      state.dropItemId = Number.isFinite(n) ? n : null;
    } else {
      state.dropItemId = null;
    }
    syncClear();
    scheduleApply();
  });

  // Deep link: /monsters?mob=<id>
  {
    const sp = new URLSearchParams(window.location.search);
    const mob = sp.get("mob");
    if (mob) {
      const n = parseInt(mob, 10);
      if (Number.isFinite(n)) state.mobId = n;
    }
  }
  syncClear();
  apply();

  function syncClear(): void {
    const anyOn =
      state.mobId !== null ||
      state.dropItemId !== null ||
      Boolean(q.value.trim()) ||
      Boolean(dropItem.value.trim()) ||
      state.races.size ||
      state.elements.size ||
      state.sizes.size ||
      state.mvp.size
        ? true
        : false;
    if (clearBtn) clearBtn.disabled = !anyOn;
    clearBtn?.classList.toggle("cards-btn--disabled", !anyOn);
  }

  filtersEl?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement | null)?.closest("button.cards-chip") as HTMLButtonElement | null;
    if (!btn || !filtersEl.contains(btn)) return;
    const kind = btn.getAttribute("data-kind") || "";
    const id = btn.getAttribute("data-id") || "";
    if (!kind || !id) return;

    if (kind === "race") {
      if (state.races.has(id)) state.races.delete(id);
      else state.races.add(id);
    } else if (kind === "element") {
      if (state.elements.has(id)) state.elements.delete(id);
      else state.elements.add(id);
    } else if (kind === "size") {
      if (state.sizes.has(id)) state.sizes.delete(id);
      else state.sizes.add(id);
    } else if (kind === "mvp") {
      if (id === "mvp" || id === "normal") {
        if (state.mvp.has(id)) state.mvp.delete(id);
        else state.mvp.add(id);
      }
    }

    const pressed = btn.getAttribute("aria-pressed") === "true";
    btn.setAttribute("aria-pressed", pressed ? "false" : "true");
    btn.classList.toggle("cards-chip--on", !pressed);
    syncClear();
    apply();
  });

  clearBtn?.addEventListener("click", () => {
    state.mobId = null;
    state.dropItemId = null;
    state.races.clear();
    state.elements.clear();
    state.sizes.clear();
    state.mvp.clear();
    q.value = "";
    dropItem.value = "";
    filtersEl?.querySelectorAll("button.cards-chip").forEach((b) => {
      b.classList.remove("cards-chip--on");
      b.setAttribute("aria-pressed", "false");
    });
    syncClear();
    apply();
  });

  // Tooltips for filter chips.
  filtersEl?.addEventListener("pointerover", (e) => {
    const btn = (e.target as HTMLElement | null)?.closest("button.cards-chip") as HTMLElement | null;
    if (!btn || !filtersEl.contains(btn)) return;
    showTip(btn);
  });
  filtersEl?.addEventListener("pointerout", (e) => {
    const related = e.relatedTarget as Node | null;
    if (related && filtersEl.contains(related)) {
      const toBtn = (related as HTMLElement).closest("button.cards-chip") as HTMLElement | null;
      if (toBtn) {
        showTip(toBtn);
        return;
      }
      hideTip();
      return;
    }
    hideTip();
  });

  // Tooltips for monster stat tiles (e.g. Size, DEF/MDEF bands).
  root.addEventListener("pointerover", (e) => {
    const el = (e.target as HTMLElement | null)?.closest(".equip-col[data-tooltip]") as HTMLElement | null;
    if (!el || !root.contains(el)) return;
    showTip(el);
  });
  root.addEventListener("pointerout", (e) => {
    const related = e.relatedTarget as Node | null;
    if (related && root.contains(related)) {
      const toEl = (related as HTMLElement).closest(".equip-col[data-tooltip]") as HTMLElement | null;
      if (toEl) {
        showTip(toEl);
        return;
      }
    }
    hideTip();
  });

  // Map hover preview + click-to-copy (same behavior as Card Library).
  let mapTipActiveBtn: HTMLButtonElement | null = null;
  let mapTipContentKey = "";

  const hideMapTooltip = (): void => {
    mapTooltip.classList.remove("cards-map-tooltip--visible");
    mapTooltip.classList.remove("cards-map-tooltip--below");
    mapTooltip.setAttribute("aria-hidden", "true");
    mapTooltip.innerHTML = "";
    mapTipContentKey = "";
    mapTipActiveBtn?.removeAttribute("aria-describedby");
    mapTipActiveBtn = null;
  };

  const showMapTooltip = (btn: HTMLButtonElement): void => {
    const mapId = btn.dataset.map?.trim();
    if (!mapId) return;
    hideTip();

    const url = divinePrideMapImageUrl(mapId);
    const key = `${mapId}\0${url}`;
    if (mapTipActiveBtn === btn && mapTipContentKey === key && mapTooltip.classList.contains("cards-map-tooltip--visible")) {
      return;
    }

    mapTipContentKey = key;
    mapTooltip.innerHTML = `<div class="cards-map-tooltip__inner">
      <div class="cards-map-tooltip__label">${escapeHtml(mapId)}</div>
      <img class="cards-map-tooltip__img" src="${escapeHtml(url)}" alt="" width="512" height="512" decoding="async" referrerpolicy="no-referrer" />
      <p class="cards-map-tooltip__missing" hidden>No preview for this map id on Divine Pride.</p>
    </div>`;
    mapTipActiveBtn?.removeAttribute("aria-describedby");
    mapTipActiveBtn = btn;
    btn.setAttribute("aria-describedby", "cards-map-tooltip");
    mapTooltip.setAttribute("aria-hidden", "false");

    const img = mapTooltip.querySelector(".cards-map-tooltip__img") as HTMLImageElement | null;
    const missing = mapTooltip.querySelector(".cards-map-tooltip__missing") as HTMLElement | null;
    const finishImg = (): void => {
      if (!img || !missing) return;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (w > 0 && h > 0 && w <= 32 && h <= 32) {
        img.hidden = true;
        missing.hidden = false;
      } else {
        img.hidden = false;
        missing.hidden = true;
      }
    };
    if (img) {
      if (img.complete) finishImg();
      else {
        img.addEventListener("load", finishImg, { once: true });
        img.addEventListener(
          "error",
          () => {
            img.hidden = true;
            if (missing) missing.hidden = false;
          },
          { once: true },
        );
      }
    }

    mapTooltip.classList.remove("cards-map-tooltip--visible");
    mapTooltip.classList.remove("cards-map-tooltip--below");
    void mapTooltip.offsetWidth;

    const r = btn.getBoundingClientRect();
    const gap = 10;
    const cx = r.left + r.width / 2;
    mapTooltip.style.left = `${cx}px`;
    mapTooltip.style.top = `${r.top - gap}px`;

    requestAnimationFrame(() => {
      const tr = mapTooltip.getBoundingClientRect();
      if (tr.top < 8) {
        mapTooltip.classList.add("cards-map-tooltip--below");
        mapTooltip.style.top = `${r.bottom + gap}px`;
      }
      const tr2 = mapTooltip.getBoundingClientRect();
      const pad = 8;
      let shift = 0;
      if (tr2.left < pad) shift = pad - tr2.left;
      else if (tr2.right > window.innerWidth - pad) shift = window.innerWidth - pad - tr2.right;
      if (shift !== 0) {
        const cur = parseFloat(mapTooltip.style.left) || cx;
        mapTooltip.style.left = `${cur + shift}px`;
      }
      requestAnimationFrame(() => {
        mapTooltip.classList.add("cards-map-tooltip--visible");
      });
    });
  };

  let copyToastHideTimer: number | undefined;
  const hideCopyToast = (): void => {
    if (copyToastHideTimer !== undefined) {
      window.clearTimeout(copyToastHideTimer);
      copyToastHideTimer = undefined;
    }
    copyToastEl.classList.remove("cards-copy-toast--visible");
    copyToastEl.classList.remove("cards-copy-toast--below");
    copyToastEl.setAttribute("aria-hidden", "true");
    copyToastEl.textContent = "";
  };

  const showCopyToast = (anchor: HTMLElement, message: string): void => {
    hideCopyToast();
    copyToastEl.textContent = message;
    copyToastEl.setAttribute("aria-hidden", "false");
    copyToastEl.classList.remove("cards-copy-toast--visible");
    copyToastEl.classList.remove("cards-copy-toast--below");
    void copyToastEl.offsetWidth;

    const gap = 10;
    const r = anchor.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    copyToastEl.style.left = `${cx}px`;
    copyToastEl.style.top = `${r.top - gap}px`;

    requestAnimationFrame(() => {
      const tr = copyToastEl.getBoundingClientRect();
      if (tr.top < 8) {
        copyToastEl.classList.add("cards-copy-toast--below");
        copyToastEl.style.top = `${r.bottom + gap}px`;
      }
      const tr2 = copyToastEl.getBoundingClientRect();
      const pad = 8;
      let shift = 0;
      if (tr2.left < pad) shift = pad - tr2.left;
      else if (tr2.right > window.innerWidth - pad) shift = window.innerWidth - pad - tr2.right;
      if (shift !== 0) {
        const cur = parseFloat(copyToastEl.style.left) || cx;
        copyToastEl.style.left = `${cur + shift}px`;
      }
      requestAnimationFrame(() => {
        copyToastEl.classList.add("cards-copy-toast--visible");
      });
    });

    copyToastHideTimer = window.setTimeout(() => {
      hideCopyToast();
    }, 2200);
  };

  const hideFloatingTooltipsOnScroll = (): void => {
    hideTip();
    hideMapTooltip();
    hideCopyToast();
  };
  window.addEventListener("scroll", hideFloatingTooltipsOnScroll, true);
  window.addEventListener("resize", hideFloatingTooltipsOnScroll);
  listWrapEl.addEventListener("scroll", hideFloatingTooltipsOnScroll, { passive: true });

  root.addEventListener("pointerover", (e) => {
    const btn = (e.target as HTMLElement).closest("button.cards-drop-map") as HTMLButtonElement | null;
    if (!btn || !root.contains(btn)) return;
    showMapTooltip(btn);
  });
  root.addEventListener("pointerout", (e) => {
    const related = e.relatedTarget as Node | null;
    if (related && root.contains(related)) {
      const toBtn = (related as HTMLElement).closest("button.cards-drop-map") as HTMLButtonElement | null;
      if (toBtn) {
        showMapTooltip(toBtn);
        return;
      }
    }
    hideMapTooltip();
  });
  root.addEventListener("focusin", (e) => {
    const btn = (e.target as HTMLElement).closest("button.cards-drop-map") as HTMLButtonElement | null;
    if (btn && root.contains(btn)) showMapTooltip(btn);
  });
  root.addEventListener("focusout", (e) => {
    const related = e.relatedTarget as Node | null;
    if (related && root.contains(related) && (related as HTMLElement).closest("button.cards-drop-map")) return;
    hideMapTooltip();
  });
  root.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest("button.cards-drop-map") as HTMLButtonElement | null;
    if (!btn || !root.contains(btn)) return;
    const mapId = btn.dataset.map?.trim();
    if (!mapId) return;
    e.preventDefault();
    void (async () => {
      try {
        await navigator.clipboard.writeText(mapId);
        hideMapTooltip();
        btn.classList.add("cards-drop-map--copied");
        const nameEl = btn.querySelector(".cards-drop-map__name") as HTMLElement | null;
        if (nameEl) {
          void nameEl.offsetWidth;
          nameEl.classList.remove("cards-drop-map__name--wave");
          void nameEl.offsetWidth;
          nameEl.classList.add("cards-drop-map__name--wave");
        }
        showCopyToast(btn, "Copied map name");
        const prev = btn.dataset.copyTimerId;
        if (prev) window.clearTimeout(Number.parseInt(prev, 10));
        const tid = window.setTimeout(() => {
          btn.classList.remove("cards-drop-map--copied");
          btn.querySelector(".cards-drop-map__name")?.classList.remove("cards-drop-map__name--wave");
          delete btn.dataset.copyTimerId;
        }, 1200);
        btn.dataset.copyTimerId = String(tid);
      } catch {
        /* clipboard API unavailable or blocked */
      }
    })();
  });
}

mount(document.querySelector("#app") as HTMLElement);

