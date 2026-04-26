import "./style.css";
import { inject } from "@vercel/analytics";
import armourRaw from "./data/armour.json";

inject();

type EquipEntry = {
  id: number;
  aegisName: string;
  name: string;
  type: string;
  description: string;
  obtain: string[];
  jobs?: string[];
  jobsAll?: boolean;
  slots: number;
  weight: number | null;
  refineable: boolean;
  equipLevel: number | null;
  locations: string[];
  weaponLevel: number | null;
  armorLevel: number | null;
  attack: number | null;
  defense: number | null;
  magicDefense: number | null;
  view: number | null;
  icon: string;
};

const armourAll: EquipEntry[] = (armourRaw as EquipEntry[]).slice().sort((a, b) => a.name.localeCompare(b.name));

type FilterState = {
  q: string;
  itemId: number | null;
  loc: Set<string>;
  slots: number | null;
  /** Class / job keys from `JOB_ORDER`, plus `__jobsAll__` for items usable by all jobs. */
  jobs: Set<string>;
};

const JOB_FILTER_ALL = "__jobsAll__";

function jobDisplayName(jobKey: string): string {
  if (jobKey === JOB_FILTER_ALL) return "All jobs";
  return jobKey.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function itemMatchesJobFilters(it: EquipEntry, wanted: Set<string>): boolean {
  if (!wanted.size) return true;
  for (const key of wanted) {
    if (key === JOB_FILTER_ALL) {
      if (it.jobsAll) return true;
    } else {
      if (it.jobsAll) return true;
      const jobs = Array.isArray(it.jobs) ? it.jobs : [];
      if (jobs.includes(key)) return true;
    }
  }
  return false;
}

function expandLocations(raw: unknown): string[] {
  const locs = Array.isArray(raw)
    ? raw
        .map((x) => String(x || "").trim())
        .filter(Boolean)
        .map((l) => {
          // Normalize a few location variants so filters don't duplicate.
          if (l === "Both Accessory") return "Accessory";
          if (l === "Lower") return "Head Low";
          if (l === "Middle") return "Head Mid";
          if (l === "Upper") return "Head Top";
          return l;
        })
    : [];
  const out: string[] = [];
  for (const l of locs) {
    // Normalize combined headgear labels into individual parts so "Upper/Middle/Lower" filters still match.
    if (/head/i.test(l)) {
      const hasTop = /\btop\b/i.test(l);
      const hasMid = /\bmid(?:dle)?\b/i.test(l);
      const hasLow = /\blow(?:er)?\b/i.test(l);
      const any = hasTop || hasMid || hasLow;
      if (any) {
        if (hasTop) out.push("Head Top");
        if (hasMid) out.push("Head Mid");
        if (hasLow) out.push("Head Low");
        continue;
      }
    }
    out.push(l);
  }
  return Array.from(new Set(out));
}

function locChipLabel(id: string): string {
  if (id === "Head Top") return "Upper";
  if (id === "Head Mid") return "Middle";
  if (id === "Head Low") return "Lower";
  return id;
}

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

function formatDescForDisplay(desc: string): string {
  // Convert inline stat fragments into new lines for readability.
  // Keep this as a display-only transformation; raw JSON stays single-line.
  let s = String(desc || "").replace(/\s+/g, " ").trim();
  if (!s) return "";

  const statToken =
    "(?:STR|AGI|VIT|INT|DEX|LUK|ATK|MATK|HIT|FLEE|CRIT|ASPD|HP|SP|DEF|MDEF|Max HP|Max SP|Maximum HP|Maximum SP)";

  s = s.replace(new RegExp(`\\s+(?=(${statToken})\\s*[+-]\\s*\\d+(?:\\.\\d+)?%?)`, "gi"), "\n");
  s = s.replace(
    /\s+(?=((?:Damage|Resistance|Resist(?:ance)?|Reduce(?:s)?|Increase(?:s)?)\b[^.]{0,40}?[+-]\s*\d+(?:\.\d+)?%?))/gi,
    "\n",
  );
  s = s.replace(/\n{2,}/g, "\n").trim();
  return s;
}

function highlightEquipKeywords(escaped: string): string {
  let s = escaped;

  s = s.replace(
    /\b(STR|AGI|VIT|INT|DEX|LUK|ATK|MATK|HIT|FLEE|CRIT|ASPD|DEF|MDEF)\b/g,
    `<span class="equip-hl-stat">$1</span>`,
  );
  s = s.replace(
    /\b(Max(?:imum)?\s+(?:HP|SP)|Max\s+(?:HP|SP))\b/gi,
    (m) => `<span class="equip-hl-stat">${m}</span>`,
  );
  s = s.replace(/([+-]?\d+(?:\.\d+)?%)/g, `<span class="equip-hl-pct">$1</span>`);
  s = s.replace(
    /\b(Fire|Water|Wind|Earth|Holy|Shadow|Ghost|Neutral|Poison|Undead)\b/g,
    `<span class="equip-hl-elem">$1</span>`,
  );
  return s;
}

function itemIconHtml(it: EquipEntry): string {
  const src = it.icon ? escapeHtml(it.icon) : "";
  if (!src) return `<div class="equip-icon equip-icon--empty" aria-hidden="true"></div>`;
  return `<img class="equip-icon" src="${src}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-id="${escapeHtml(
    String(it.id),
  )}" />`;
}

function statLine(it: EquipEntry): string {
  const parts: string[] = [];
  if (typeof it.defense === "number") parts.push(`DEF ${it.defense}`);
  if (typeof it.magicDefense === "number") parts.push(`MDEF ${it.magicDefense}`);
  if (typeof it.armorLevel === "number") parts.push(`ALv ${it.armorLevel}`);
  if (typeof it.weight === "number") parts.push(`Weight ${it.weight}`);
  if (typeof it.equipLevel === "number") parts.push(`Req Lv ${it.equipLevel}`);
  if (it.slots) parts.push(`Slots ${it.slots}`);
  if (it.refineable) parts.push("Refine");
  return parts.length ? parts.join(" · ") : "-";
}

function statColsHtml(it: EquipEntry): string {
  const rows: Array<{ k: string; v: string }> = [];
  rows.push({ k: "DEF", v: typeof it.defense === "number" ? String(it.defense) : "-" });
  rows.push({ k: "MDEF", v: typeof it.magicDefense === "number" ? String(it.magicDefense) : "-" });
  rows.push({ k: "Armor Lv", v: typeof it.armorLevel === "number" ? String(it.armorLevel) : "-" });
  rows.push({ k: "Req Lv", v: typeof it.equipLevel === "number" ? String(it.equipLevel) : "-" });
  rows.push({ k: "Weight", v: typeof it.weight === "number" ? String(it.weight) : "-" });
  rows.push({ k: "Refine", v: it.refineable ? "Yes" : "No" });

  return `<div class="equip-cols" role="list">${rows
    .map(
      (r) =>
        `<div class="equip-col" role="listitem"><div class="equip-col__k">${escapeHtml(
          r.k,
        )}</div><div class="equip-col__v">${escapeHtml(r.v)}</div></div>`,
    )
    .join("")}</div>`;
}

function slotIconsHtml(slots: number): string {
  const n = Math.max(0, Math.min(4, Number(slots) || 0));
  const icons = Array.from({ length: 4 }, (_, i) => {
    const on = i < n;
    return `<span class="equip-slot ${on ? "equip-slot--on" : "equip-slot--off"}" aria-hidden="true"></span>`;
  }).join("");
  return `<div class="equip-slots" role="img" aria-label="${n} slot${n === 1 ? "" : "s"}">${icons}</div>`;
}

function chipButton(id: string, label: string, pressed: boolean, kind: string, desc?: string): string {
  const cls = pressed ? "cards-chip cards-chip--on" : "cards-chip";
  const tip = desc ? ` data-tooltip="${escapeHtml(label)}" data-tipbody="${escapeHtml(desc)}"` : "";
  return `<button type="button" class="${cls}" data-kind="${escapeHtml(kind)}" data-id="${escapeHtml(
    id,
  )}" aria-pressed="${pressed ? "true" : "false"}"${tip}>${escapeHtml(label)}</button>`;
}

const JOB_ICON_ID: Record<string, number> = {
  Novice: 0,
  Swordsman: 1,
  Magician: 2,
  Archer: 3,
  Acolyte: 4,
  Merchant: 5,
  Thief: 6,
  Knight: 7,
  Priest: 8,
  Wizard: 9,
  Blacksmith: 10,
  Hunter: 11,
  Assassin: 12,
  Crusader: 14,
  Monk: 15,
  Sage: 16,
  Rogue: 17,
  Alchemist: 18,
  Bard: 19,
  Dancer: 20,
  SuperNovice: 23,
};

const JOB_SECONDARY = new Set([
  "Knight",
  "Crusader",
  "Wizard",
  "Sage",
  "Hunter",
  "Bard",
  "Dancer",
  "Priest",
  "Monk",
  "Rogue",
  "Assassin",
  "Blacksmith",
  "Alchemist",
]);

const JOB_REBIRTH = new Set([
  "LordKnight",
  "Paladin",
  "HighWizard",
  "Professor",
  "Sniper",
  "Clown",
  "Gypsy",
  "HighPriest",
  "Champion",
  "Whitesmith",
  "Creator",
  "AssassinCross",
  "Stalker",
]);

/** Rebirth classes use the same party-frame sprite as their 2nd class (Icon_jobs_*.png set has no separate rebirth IDs). */
const JOB_REBIRTH_ICON_PARENT: Record<string, string> = {
  LordKnight: "Knight",
  Paladin: "Crusader",
  HighWizard: "Wizard",
  Professor: "Sage",
  Sniper: "Hunter",
  Clown: "Bard",
  Gypsy: "Dancer",
  HighPriest: "Priest",
  Champion: "Monk",
  Whitesmith: "Blacksmith",
  Creator: "Alchemist",
  AssassinCross: "Assassin",
  Stalker: "Rogue",
};

function jobPartyIconId(jobKey: string): number | null {
  const direct = JOB_ICON_ID[jobKey];
  if (typeof direct === "number") return direct;
  const parent = JOB_REBIRTH_ICON_PARENT[jobKey];
  if (parent) {
    const id = JOB_ICON_ID[parent];
    if (typeof id === "number") return id;
  }
  return null;
}

const JOB_ORDER: string[] = [
  // Novice / Super Novice first
  "Novice",
  "SuperNovice",
  // 1st jobs
  "Swordsman",
  "Magician",
  "Archer",
  "Acolyte",
  "Merchant",
  "Thief",
  // 2nd jobs
  "Knight",
  "Crusader",
  "Wizard",
  "Sage",
  "Hunter",
  "Bard",
  "Dancer",
  "Priest",
  "Monk",
  "Rogue",
  "Assassin",
  "Blacksmith",
  "Alchemist",
  // Rebirth jobs
  "LordKnight",
  "Paladin",
  "HighWizard",
  "Professor",
  "Sniper",
  "Clown",
  "Gypsy",
  "HighPriest",
  "Champion",
  "Whitesmith",
  "Creator",
  "AssassinCross",
  "Stalker",
];

const JOB_ORDER_RANK: Record<string, number> = Object.fromEntries(JOB_ORDER.map((k, i) => [k, i]));

function jobFilterChipButton(jobKey: string, pressed: boolean): string {
  const idEsc = escapeHtml(jobKey);
  const label = jobDisplayName(jobKey);
  const tip = ` data-tooltip="${escapeHtml(label)}" data-tipbody="${escapeHtml("Filter by equippable jobs")}"`;
  if (jobKey === JOB_FILTER_ALL) {
    const cls = pressed ? "cards-chip cards-chip--on cards-chip--slot" : "cards-chip cards-chip--slot";
    return `<button type="button" class="${cls} equip-filter-job--all" data-kind="job" data-id="${idEsc}" aria-pressed="${
      pressed ? "true" : "false"
    }" aria-label="Filter: ${escapeHtml(label)}"${tip}><img class="cards-chip-slot-icon equip-filter-jobicon" src="/job-icons/all.svg" alt="" width="24" height="24" decoding="async" loading="lazy" referrerpolicy="no-referrer" /></button>`;
  }
  const iconId = jobPartyIconId(jobKey);
  if (typeof iconId === "number") {
    const tier = JOB_REBIRTH.has(jobKey)
      ? " equip-filter-job--rebirth"
      : JOB_SECONDARY.has(jobKey)
        ? " equip-filter-job--secondary"
        : "";
    const cls = pressed ? "cards-chip cards-chip--on cards-chip--slot" : "cards-chip cards-chip--slot";
    const src = `/job-icons/Icon_jobs_${iconId}.png`;
    return `<button type="button" class="${cls}${tier}" data-kind="job" data-id="${idEsc}" aria-pressed="${
      pressed ? "true" : "false"
    }" aria-label="Filter: ${escapeHtml(label)}"${tip}><img class="cards-chip-slot-icon equip-filter-jobicon" src="${escapeHtml(
      src,
    )}" alt="" width="24" height="24" decoding="async" loading="lazy" referrerpolicy="no-referrer" /></button>`;
  }
  return chipButton(jobKey, label, pressed, "job", "Job filter");
}

function renderJobFilterChips(state: FilterState): string {
  const allChip = jobFilterChipButton(JOB_FILTER_ALL, state.jobs.has(JOB_FILTER_ALL));
  const rest = JOB_ORDER.filter((j) => !JOB_REBIRTH.has(j))
    .map((j) => jobFilterChipButton(j, state.jobs.has(j)))
    .join("");
  return `${allChip}${rest}`;
}

function renderFilters(state: FilterState, locs: string[]): string {
  const locComboIds = new Set(["MiddleLower", "MiddleUpper", "UpperLower", "UpperMiddleLower"]);
  const locMain: string[] = [];
  const locCombos: string[] = [];
  for (const l of locs) {
    if (locComboIds.has(l)) locCombos.push(l);
    else locMain.push(l);
  }

  const locChipsMain = locMain.map((l) => chipButton(l, locChipLabel(l), state.loc.has(l), "loc")).join("");
  const locChipsCombo = locCombos.map((l) => chipButton(l, locChipLabel(l), state.loc.has(l), "loc")).join("");
  const locChips = locChipsCombo
    ? `${locChipsMain}<div class="equip-loc-combos" aria-label="Head combo locations">${locChipsCombo}</div>`
    : locChipsMain;
  const slotChips = [0, 1, 2, 3, 4].map((n) =>
    chipButton(String(n), `${n}`, state.slots === n, "slots", "Slots"),
  );
  const jobChips = renderJobFilterChips(state);
  const anyOn = state.loc.size || state.slots !== null || state.jobs.size ? true : false;

  return `
    <div class="cards-filters equip-filters" aria-label="Armour filters">
      <div class="cards-filters__head">
        <div class="cards-filters__title">Filters</div>
        <button type="button" class="cards-filter-clear" id="btn-clear" ${anyOn ? "" : "disabled"}>Clear</button>
      </div>
      <div class="cards-filter-group">
        <div class="cards-filter-title">Location</div>
        <div class="cards-filter-chips" id="chips-loc">${locChips}</div>
      </div>
      <div class="cards-filter-group">
        <div class="cards-filter-title">Class</div>
        <div class="cards-filter-chips" id="chips-job">${jobChips}</div>
      </div>
      <div class="cards-filter-group">
        <div class="cards-filter-title">Slots</div>
        <div class="cards-filter-chips" id="chips-slots">${slotChips.join("")}</div>
      </div>
    </div>
  `;
}

function jobIconsHtml(it: EquipEntry): string {
  const jobs = (Array.isArray(it.jobs) ? it.jobs : []).slice().sort((a, b) => {
    const ra = JOB_ORDER_RANK[a] ?? 9999;
    const rb = JOB_ORDER_RANK[b] ?? 9999;
    if (ra !== rb) return ra - rb;
    return a.localeCompare(b);
  });
  if (!jobs.length && it.jobsAll) {
    return `<div class="equip-jobs" aria-label="Jobs"><span class="equip-jobiconwrap" data-tooltip="All jobs"><img class="equip-jobicon equip-jobicon--all" src="/job-icons/all.svg" alt="" loading="lazy" decoding="async" /></span></div>`;
  }
  const icons = jobs
    .map((j) => {
      const id = jobPartyIconId(j);
      if (typeof id !== "number") return "";
      const src = `/job-icons/Icon_jobs_${id}.png`;
      const tier =
        JOB_REBIRTH.has(j) ? "equip-jobicon--rebirth" : JOB_SECONDARY.has(j) ? "equip-jobicon--secondary" : "";
      const label = escapeHtml(j.replace(/([a-z])([A-Z])/g, "$1 $2"));
      return `<span class="equip-jobiconwrap" data-tooltip="${label}"><img class="equip-jobicon ${tier}" src="${src}" alt="" loading="lazy" decoding="async" /></span>`;
    })
    .filter(Boolean)
    .join("");
  if (!icons) return "";
  return `<div class="equip-jobs" aria-label="Jobs">${icons}</div>`;
}

function obtainHtml(it: EquipEntry): string {
  const lines = Array.isArray(it.obtain) ? it.obtain.filter(Boolean) : [];
  if (!lines.length) return `<div class="cards-empty">Unknown</div>`;
  return `<div class="desc-blocks"><div class="desc-block desc-block--plain">${lines
    .slice(0, 8)
    .map((x) => `<div class="equip-obtain">${escapeHtml(x)}</div>`)
    .join("")}</div></div>`;
}

function rowCardHtml(it: EquipEntry): string {
  const locs = Array.isArray(it.locations) && it.locations.length ? it.locations : [];
  const loc = locs.length ? locs.map((l) => (l === "Both Accessory" ? "Accessory" : l)).join(", ") : "-";
  const desc = formatDescForDisplay(String(it.description || ""));
  const jobsHtml = jobIconsHtml(it);
  return `<article class="cards-rowcard">
    ${itemIconHtml(it)}
    <div class="cards-rowcard__name">
      <div class="cards-name-block">
        <div class="cards-name">${escapeHtml(it.name)}<span class="entity-id">#${escapeHtml(String(it.id))}</span></div>
        ${loc !== "-" ? `<div class="cards-rowcard__slot">${escapeHtml(loc)}</div>` : ""}
        ${slotIconsHtml(it.slots)}
      </div>
    </div>
    <div class="cards-rowcard__jobs">
      ${jobsHtml || ""}
    </div>
    <div class="cards-rowcard__desc">
      <div class="desc-blocks">
        <div class="desc-block desc-block--plain">${statColsHtml(it)}</div>
        ${
          desc
            ? `<div class="desc-block desc-block--plain"><div class="equip-desc">${highlightEquipKeywords(
                escapeHtml(desc),
              )}</div></div>`
            : ""
        }
      </div>
    </div>
    <div class="cards-rowcard__drops">
      ${obtainHtml(it)}
    </div>
  </article>`;
}

function renderRows(rows: EquipEntry[]): string {
  if (!rows.length) return `<div class="cards-empty">No matches.</div>`;
  return rows.map(rowCardHtml).join("");
}

function mount(root: HTMLElement): void {
  const locs = Array.from(
    new Set(armourAll.flatMap((a) => expandLocations(a.locations)).map((x) => String(x || "").trim()).filter(Boolean)),
  )
    // For headgear, only keep the 3 canonical chips (Upper/Middle/Lower).
    // Any other head combo/location label should not show as a filter chip.
    .filter((l) => {
      if (!/\bhead\b/i.test(l)) return true;
      return l === "Head Top" || l === "Head Mid" || l === "Head Low";
    })
    .sort((a, b) => a.localeCompare(b));
  root.innerHTML = `
    <header class="site-header">
      <div class="site-header__left">
        <a class="site-brand" href="/">RO Pre-Renewal</a>
        <nav class="site-nav" aria-label="Site">
          <a class="site-nav__link" href="/skills">Skill Planner</a>
          <a class="site-nav__link" href="/cards">Card Library</a>
          <a class="site-nav__link" href="/pets">Pets</a>
          <a class="site-nav__link" href="/monsters">Monsters</a>
          <a class="site-nav__link site-nav__link--active" href="/armour" aria-current="page">Armour</a>
          <a class="site-nav__link" href="/weapons">Weapons</a>
        </nav>
      </div>
    </header>

    <section class="page equip-page equip-page--armour">
      <div class="cards-windowhead" role="banner" aria-label="Armour page header">
        <div class="cards-windowhead__left">
          <h1 class="cards-windowhead__title">Armour</h1>
        </div>
      </div>

      <div class="cards-toolbar" role="search">
        <label class="cards-search">
          <input id="q" class="cards-search__input" type="search" placeholder="search..." autocomplete="off" aria-label="Search armour" />
        </label>
        <div class="cards-count" id="count" role="status" aria-live="polite"></div>
      </div>

      ${renderFilters({ q: "", itemId: null, loc: new Set(), slots: null, jobs: new Set() }, locs)}

      <div id="equip-tooltip" class="cards-filter-tooltip equip-tooltip" role="tooltip" aria-hidden="true"></div>

      <div class="cards-rowcards-wrap" id="rows-wrap">
        <div class="cards-rowcards" id="rows"></div>
      </div>
    </section>
  `;

  const q = root.querySelector("#q") as HTMLInputElement;
  const rowsEl = root.querySelector("#rows") as HTMLElement;
  const countEl = root.querySelector("#count") as HTMLElement;
  const listWrapEl = root.querySelector("#rows-wrap") as HTMLElement;
  const tipEl = root.querySelector("#equip-tooltip") as HTMLElement;
  const filtersEl = root.querySelector(".equip-filters") as HTMLElement;
  const clearBtn = root.querySelector("#btn-clear") as HTMLButtonElement;
  const state: FilterState = { q: "", itemId: null, loc: new Set(), slots: null, jobs: new Set() };
  let tipActive: HTMLElement | null = null;

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
    const filtered = armourAll.filter((it) => {
      if (state.itemId !== null) return it.id === state.itemId;
      const hay = normalize(
        [it.name, it.aegisName, it.type, it.locations?.join(" ") ?? "", statLine(it), it.description || ""].join(
          " ",
        ),
      );
      if (query && !hay.includes(query)) return false;
      if (state.loc.size) {
        const loc = expandLocations(it.locations);
        if (!loc.some((l) => state.loc.has(l))) return false;
      }
      if (state.slots !== null && state.slots !== Math.max(0, Math.min(4, Number(it.slots) || 0))) return false;
      if (!itemMatchesJobFilters(it, state.jobs)) return false;
      return true;
    });
    rowsEl.innerHTML = renderRows(filtered);
    countEl.textContent = `${filtered.length.toLocaleString()} / ${armourAll.length.toLocaleString()} items`;
  };

  q.addEventListener("input", apply);

  // Deep link: /armour?item=<id>
  {
    const sp = new URLSearchParams(window.location.search);
    const item = sp.get("item");
    if (item) {
      const n = parseInt(item, 10);
      if (Number.isFinite(n)) state.itemId = n;
    }
  }
  apply();

  const syncClear = (): void => {
    const anyOn = state.loc.size || state.slots !== null || state.jobs.size ? true : false;
    if (clearBtn) clearBtn.disabled = !anyOn;
    clearBtn?.classList.toggle("cards-btn--disabled", !anyOn);
  };

  filtersEl?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement | null)?.closest("button.cards-chip") as HTMLButtonElement | null;
    if (!btn || !filtersEl.contains(btn)) return;
    const kind = btn.getAttribute("data-kind") || "";
    const id = btn.getAttribute("data-id") || "";
    if (!kind || !id) return;

    if (kind === "loc") {
      if (state.loc.has(id)) state.loc.delete(id);
      else state.loc.add(id);
    } else if (kind === "job") {
      if (state.jobs.has(id)) state.jobs.delete(id);
      else state.jobs.add(id);
    } else if (kind === "slots") {
      const n = parseInt(id, 10);
      if (Number.isFinite(n)) {
        state.slots = state.slots === n ? null : n;
        // Enforce single-select for slots: turn off all other slot chips
        filtersEl?.querySelectorAll('button.cards-chip[data-kind="slots"]').forEach((b) => {
          const bid = b.getAttribute("data-id") || "";
          const bn = parseInt(bid, 10);
          const on = Number.isFinite(bn) && bn === state.slots;
          b.classList.toggle("cards-chip--on", on);
          b.setAttribute("aria-pressed", on ? "true" : "false");
        });
      }
    }

    if (kind !== "slots") {
      const pressed = btn.getAttribute("aria-pressed") === "true";
      btn.setAttribute("aria-pressed", pressed ? "false" : "true");
      btn.classList.toggle("cards-chip--on", !pressed);
    }
    syncClear();
    apply();
  });

  clearBtn?.addEventListener("click", () => {
    state.itemId = null;
    state.loc.clear();
    state.slots = null;
    state.jobs.clear();
    q.value = "";
    filtersEl?.querySelectorAll("button.cards-chip").forEach((b) => {
      b.classList.remove("cards-chip--on");
      b.setAttribute("aria-pressed", "false");
    });
    syncClear();
    apply();
  });

  // Cards-style tooltip for filter chips
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

  listWrapEl.addEventListener("pointerover", (e) => {
    const el = (e.target as HTMLElement | null)?.closest(".equip-jobiconwrap") as HTMLElement | null;
    if (!el || !listWrapEl.contains(el)) return;
    showTip(el);
  });
  listWrapEl.addEventListener("pointerout", (e) => {
    const related = e.relatedTarget as Node | null;
    if (related && listWrapEl.contains(related)) {
      const toEl = (related as HTMLElement).closest(".equip-jobiconwrap") as HTMLElement | null;
      if (toEl) {
        showTip(toEl);
        return;
      }
      hideTip();
      return;
    }
    hideTip();
  });
  listWrapEl.addEventListener("focusin", (e) => {
    const el = (e.target as HTMLElement | null)?.closest(".equip-jobiconwrap") as HTMLElement | null;
    if (el && listWrapEl.contains(el)) showTip(el);
  });
  listWrapEl.addEventListener("focusout", (e) => {
    const related = e.relatedTarget as Node | null;
    if (related && listWrapEl.contains(related) && (related as HTMLElement).closest(".equip-jobiconwrap")) return;
    hideTip();
  });
}

mount(document.querySelector("#app") as HTMLElement);

