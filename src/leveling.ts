import "./style.css";
import { inject } from "@vercel/analytics";
import { getPlannerGameMode, initPlannerGameModeFromUrlOrStorage, setAndPersistPlannerGameMode } from "./game-mode";
import { siteHeaderRowHtml, wireSiteGameModeToggle } from "./site-header";
import monstersRaw from "./data/monsters-renewal.json";

try {
  inject();
} catch {
  /* ignore */
}

function escapeHtml(s: string): string {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function copyTextToClipboard(text: string): Promise<void> {
  const s = String(text || "");
  if (!s) return Promise.resolve();
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(s);
  // Fallback for older/blocked clipboard APIs.
  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement("textarea");
      ta.value = s;
      ta.setAttribute("readonly", "true");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      resolve();
    } catch (e) {
      reject(e);
    }
  });
}

/**
 * Renewal EXP yield modifier based on level difference (mobLv - playerLv).
 * Source: iRO Wiki "Experience" → "Level Differences" table.
 */
function renewalExpYieldPercent(levelDiff: number): number {
  if (!Number.isFinite(levelDiff)) return 0;
  if (levelDiff >= 16) return 40;
  if (levelDiff === 15) return 115;
  if (levelDiff === 14) return 120;
  if (levelDiff === 13) return 125;
  if (levelDiff === 12) return 130;
  if (levelDiff === 11) return 135;
  if (levelDiff === 10) return 140;
  if (levelDiff === 9) return 135;
  if (levelDiff === 8) return 130;
  if (levelDiff === 7) return 125;
  if (levelDiff === 6) return 120;
  if (levelDiff === 5) return 115;
  if (levelDiff === 4) return 110;
  if (levelDiff === 3) return 105;
  if (levelDiff >= -5) return 100; // +2..-5, inclusive
  if (levelDiff >= -10) return 95;
  if (levelDiff >= -15) return 90;
  if (levelDiff >= -20) return 85;
  if (levelDiff >= -25) return 60;
  if (levelDiff >= -30) return 35;
  return 10; // -31 or lower
}

type MonsterEntry = {
  id: number;
  name: string;
  level: number;
  baseExp: number | null;
  jobExp: number | null;
  sprite?: string;
  element?: string | null;
  elementLevel?: number | null;
  isBoss?: boolean;
  isMvp?: boolean;
  maps?: Array<{ map: string; count: number }>;
  drops?: Array<{ aegis: string; id: number | null; name: string | null; rate: number; isMvp: boolean }>;
};

const monstersById = new Map<number, MonsterEntry>(
  (monstersRaw as unknown as MonsterEntry[]).map((m) => [m.id, m]),
);

const VARIANT_NAME_TOKENS = ["ringleader", "ringlea", "ringleade", "furious", "elusive", "swift", "solid"] as const;

function isVariantMonsterName(name: string): boolean {
  const n = normalize(name);
  // Prefer whole-word tokens to avoid false positives inside other words.
  // Some upstream names appear truncated (e.g. "... Ringlea"), so include those
  // as explicit tokens too.
  return VARIANT_NAME_TOKENS.some((t) => new RegExp(`\\b${t}\\b`, "i").test(n));
}

const monstersAll: MonsterEntry[] = (monstersRaw as unknown as MonsterEntry[])
  .slice()
  .filter((m) => typeof m.id === "number" && typeof m.name === "string" && typeof m.level === "number")
  .filter((m) => !isVariantMonsterName(m.name))
  .filter((m) => Array.isArray(m.maps) && m.maps.length > 0);

const DEFAULT_FOCUS_MOB_ID = 1015;

function clampInt(n: number, min: number, max: number): number {
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function readLs(key: string): string {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
}

function writeLs(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
}

function normalize(s: string): string {
  return String(s || "").trim().toLowerCase();
}

function rmsUrlForMob(mobId: number): string {
  return `https://ratemyserver.net/index.php?page=re_mob_db&quick=1&mob_name=${encodeURIComponent(
    String(mobId),
  )}&mob_search=Search`;
}

function divinePridePngSpriteUrl(mobId: number): string {
  return `https://static.divine-pride.net/images/mobs/png/${encodeURIComponent(String(mobId))}.png`;
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
 * Renewal-ish element matchup model, mirrored from `src/monsters.ts` (compact output).
 * Returns "damage taken" multipliers by attack element (percent).
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

function elementColumnHtml(monsterId: number): string {
  const m = monstersById.get(monsterId);
  const defElem = m?.element ?? "Neutral";
  const defLv = typeof m?.elementLevel === "number" ? m?.elementLevel : 1;
  const rows = elementDamageTaken(defElem, defLv)
    .filter((r) => Math.round(r.pct) !== 100)
    .sort((a, b) => Math.abs(b.pct - 100) - Math.abs(a.pct - 100));

  if (!rows.length) return `<div class="leveling-elemcol__empty">—</div>`;

  return `<div class="leveling-elemcol__list">${rows
    .map((r) => {
      const pct = clamp(Math.round(r.pct), 0, 300);
      const cls = pct > 100 ? "leveling-elemrow leveling-elemrow--weak" : "leveling-elemrow leveling-elemrow--resist";
      const v = pct === 0 ? "IMMUNE" : `${pct}%`;
      return `<div class="${cls}"><div class="leveling-elemrow__k">${escapeHtml(r.elem)}</div><div class="leveling-elemrow__v">${escapeHtml(
        v,
      )}</div></div>`;
    })
    .join("")}</div>`;
}

function locationsHtml(m: MonsterEntry): string {
  const maps = Array.isArray(m.maps) ? m.maps.slice() : [];
  const rows = maps
    .filter((x) => x && typeof x.map === "string" && x.map.trim())
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0));

  if (!rows.length) return `<div class="leveling-locs__empty">—</div>`;

  return `<div class="leveling-locs__list">${rows
    .map((r) => {
      const map = escapeHtml(r.map);
      const count = typeof r.count === "number" ? r.count : 0;
      return `<div class="leveling-locrow">
        <button type="button" class="leveling-locrow__k" data-copy-map="${map}" aria-label="Copy map name ${map}">${map}</button>
        <div class="leveling-locrow__v">${escapeHtml(
        String(count),
      )}</div>
      </div>`;
    })
    .join("")}</div>`;
}

function clampNum(n: number, lo: number, hi: number): number {
  if (!Number.isFinite(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}

function parseMultiplier(raw: string): number {
  const n = Number.parseFloat(String(raw || "").trim());
  if (!Number.isFinite(n)) return 1;
  // Keep sane bounds for UI; allow 0 to "hide" rewards.
  return clampNum(n, 0, 1000);
}

function dropRateLabel(rate: number, dropMult: number): string {
  // rAthena drop rates are per 10000 (10000 = 100%).
  const pct = (rate / 100) * dropMult;
  if (pct >= 1) return `${pct.toFixed(0)}%`;
  if (pct >= 0.1) return `${pct.toFixed(1)}%`;
  return `${pct.toFixed(2)}%`;
}

function dropsHtml(m: MonsterEntry, mult: { drop: number }): string {
  const drops = Array.isArray(m.drops) ? m.drops.slice() : [];
  const rows = drops
    .filter((d) => d && typeof d.rate === "number" && d.rate > 0)
    .sort((a, b) => Number(b.isMvp) - Number(a.isMvp) || b.rate - a.rate)
    .map((d) => ({
      name: String(d.name || d.aegis || "").trim() || d.aegis,
      id: typeof d.id === "number" && Number.isFinite(d.id) ? d.id : null,
      rate: d.rate,
      isMvp: !!d.isMvp,
    }));

  if (!rows.length) return `<div class="leveling-drops__empty">—</div>`;

  return `<div class="leveling-drops__list">${rows
    .map((r) => {
      const cls = r.isMvp ? "leveling-droprow leveling-droprow--mvp" : "leveling-droprow";
      const icon =
        r.id == null ?
          `<span class="leveling-drop__icon leveling-drop__icon--missing" aria-hidden="true"></span>`
        : `<img class="leveling-drop__icon" src="https://static.divine-pride.net/images/items/item/${escapeHtml(
            String(r.id),
          )}.png" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" />`;

      const href =
        r.id == null ?
          ""
        : `https://ratemyserver.net/index.php?page=re_item_db&item_id=${encodeURIComponent(String(r.id))}`;

      const nameHtml = `<span class="leveling-droprow__k">${escapeHtml(r.name)}</span>`;
      const inner = `${icon}${nameHtml}<span class="leveling-droprow__v">${escapeHtml(
        dropRateLabel(r.rate, mult.drop),
      )}</span>`;
      return href
        ? `<a class="${cls} leveling-droprow--link" href="${escapeHtml(
            href,
          )}" target="_blank" rel="noreferrer noopener">${inner}</a>`
        : `<div class="${cls}">${inner}</div>`;
    })
    .join("")}</div>`;
}

function monsterCardHtml(m: MonsterEntry, playerLevel: number, mult: { base: number; job: number; drop: number }): string {
  const diff = m.level - playerLevel;
  const pct = renewalExpYieldPercent(diff);
  const baseSrc = typeof m.baseExp === "number" ? m.baseExp : null;
  const jobSrc = typeof m.jobExp === "number" ? m.jobExp : null;
  const base = baseSrc == null ? null : Math.round(((baseSrc * pct) / 100) * mult.base);
  const job = jobSrc == null ? null : Math.round(((jobSrc * pct) / 100) * mult.job);
  const pctTone =
    pct > 100 ? "leveling-exp--up"
    : pct < 100 ? "leveling-exp--down"
    : "leveling-exp--flat";

  // Bonus range (green): EXP yield > 100%. From the iRO table this is diff +3..+15 (inclusive).
  const bonusMinPlayerLv = Math.max(1, m.level - 15);
  const bonusMaxPlayerLv = Math.max(1, m.level - 3);
  const spriteStatic = m.sprite || divinePridePngSpriteUrl(m.id);
  const badge =
    m.isMvp ? `<span class="leveling-badge leveling-badge--mvp">MVP</span>`
    : m.isBoss ? `<span class="leveling-badge leveling-badge--mini">Mini Boss</span>`
    : "";

  return `
    <div class="pets-card leveling-card" style="max-width: 980px;">
      <div class="pets-card__body leveling-card__body">
        <div class="leveling-card__top">
          <div class="leveling-card__top-left">
            <div class="pets-card__k">Monster</div>
            <div class="pets-monster__name">${escapeHtml(m.name)} ${badge} <span style="opacity:.65;">(#${m.id} · Lv ${m.level})</span></div>
            <div class="leveling-exp" style="margin-top:.15rem;">
              <span class="leveling-exp__label">EXP yield</span>
              <span class="leveling-exp__pct ${pctTone}">${pct}%</span>
              <span class="leveling-exp__sub">(diff ${diff >= 0 ? "+" : ""}${diff})</span>
            </div>

            <div style="margin-top:.55rem;">
              <span class="leveling-bonus">Bonus EXP range: <b>Lv ${bonusMinPlayerLv}–${bonusMaxPlayerLv}</b></span>
            </div>

            <div class="leveling-card__section leveling-card__section--exp" style="margin-top:.55rem;">
              <div class="leveling-card__kv">Base EXP: <span class="leveling-card__kv-v">${baseSrc ?? "-"}</span> → <b>${base ?? "-"}</b></div>
              <div class="leveling-card__kv">Job EXP: <span class="leveling-card__kv-v">${jobSrc ?? "-"}</span> → <b>${job ?? "-"}</b></div>
              <div style="margin-top:.25rem;">
                <a class="msq-step-card__wiki-cta" href="${escapeHtml(
                  rmsUrlForMob(m.id),
                )}" target="_blank" rel="noreferrer noopener">View on ratemyserver →</a>
              </div>
            </div>
          </div>

          <div class="leveling-card__top-right" aria-hidden="true">
            <img
              class="leveling-card__sprite"
              src="${escapeHtml(spriteStatic)}"
              alt=""
              loading="lazy"
              decoding="async"
              referrerpolicy="no-referrer"
            />
          </div>
        </div>

        <div class="leveling-card__section leveling-card__section--locs">
          <div class="leveling-card__twocol">
            <div class="leveling-card__twocol-col">
              <div class="pets-card__k">Locations</div>
              ${locationsHtml(m)}
            </div>
            <div class="leveling-card__twocol-col">
              <div class="pets-card__k">Drops</div>
              ${dropsHtml(m, mult)}
            </div>
          </div>
        </div>

        <div class="leveling-card__section leveling-card__section--elem">
          <div class="pets-card__k">
            Element <span class="leveling-weak-label">weaknesses</span> / <span class="leveling-resist-label">resists</span>
          </div>
          ${elementColumnHtml(m.id)}
        </div>
      </div>
    </div>
  `;
}

type ScoredMonster = {
  m: MonsterEntry;
  pct: number;
  effBase: number | null;
  diff: number;
};

function isBossLike(m: MonsterEntry | undefined): boolean {
  if (!m) return false;
  return !!m.isMvp || !!m.isBoss;
}

function scoreMonster(m: MonsterEntry, playerLevel: number, multBase: number): ScoredMonster {
  const diff = m.level - playerLevel;
  const pct = renewalExpYieldPercent(diff);
  const effBase =
    typeof m.baseExp === "number" ? Math.round(((m.baseExp * pct) / 100) * multBase) : null;
  return { m, pct, effBase, diff };
}

function pctToneClass(pct: number): string {
  return pct > 100 ? "leveling-exp--up" : pct < 100 ? "leveling-exp--down" : "leveling-exp--flat";
}

function monsterRowHtml(s: ScoredMonster, isActive: boolean): string {
  const name = escapeHtml(s.m.name);
  const id = escapeHtml(String(s.m.id));
  const lv = escapeHtml(String(s.m.level));
  const pctCls = pctToneClass(s.pct);
  const eff = s.effBase == null ? "-" : s.effBase.toLocaleString();
  const diff = `${s.diff >= 0 ? "+" : ""}${s.diff}`;
  const active = isActive ? " leveling-row--active" : "";
  const badge =
    s.m.isMvp ? `<span class="leveling-badge leveling-badge--mvp">MVP</span>`
    : s.m.isBoss ? `<span class="leveling-badge leveling-badge--mini">Mini</span>`
    : `<span class="leveling-badge leveling-badge--empty" aria-hidden="true"></span>`;
  return `<button type="button" class="leveling-row${active}" data-focus-mob="${id}">
    <span class="leveling-row__name">${name} <span class="leveling-row__id">#${id}</span></span>
    <span class="leveling-row__tag" aria-label="${s.m.isMvp ? "MVP" : s.m.isBoss ? "Mini Boss" : ""}">${badge}</span>
    <span class="leveling-row__meta">Lv ${lv}</span>
    <span class="leveling-row__pct ${pctCls}">${escapeHtml(String(s.pct))}%</span>
    <span class="leveling-row__eff">${escapeHtml(eff)}</span>
    <span class="leveling-row__diff">${escapeHtml(diff)}</span>
  </button>`;
}

function sectionHtml(
  title: string,
  items: ScoredMonster[],
  focusId: number,
  limit: number,
  empty: string,
): string {
  const shown = items.slice(0, limit);
  const rows = shown.map((s) => monsterRowHtml(s, s.m.id === focusId)).join("");
  const more = items.length > limit ? `<div class="leveling-more">Showing ${limit} of ${items.length}</div>` : "";
  const body = rows || `<div class="leveling-empty">${escapeHtml(empty)}</div>`;
  return `<section class="leveling-section">
    <div class="leveling-section__head">
      <div class="pets-card__k">${escapeHtml(title)}</div>
      <div class="leveling-section__count">${items.length.toLocaleString()}</div>
    </div>
    <div class="leveling-rows">${body}</div>
    ${more}
  </section>`;
}

function monsterListHtml(
  playerLevel: number,
  query: string,
  focusId: number,
  multBase: number,
  opts: { hideBosses: boolean },
): string {
  const q = normalize(query);
  const isIdQuery = q && /^\d+$/.test(q);
  const idQuery = isIdQuery ? parseInt(q, 10) : null;

  const filtered = monstersAll.filter((m) => {
    if (opts.hideBosses && isBossLike(m)) return false;
    if (!q) return true;
    if (idQuery != null) return m.id === idQuery;
    return normalize(m.name).includes(q);
  });

  const scored = filtered
    .map((m) => scoreMonster(m, playerLevel, multBase))
    // prefer monsters with exp data first
    .sort((a, b) => {
      const ae = a.effBase == null ? -1 : a.effBase;
      const be = b.effBase == null ? -1 : b.effBase;
      if (be !== ae) return be - ae;
      return a.m.level - b.m.level;
    });

  const isSearching = Boolean(q);
  const bonus = scored.filter((s) => s.pct > 100);
  const items = isSearching ? scored : bonus;

  const LIMIT = q ? 60 : 30;
  return `<div class="leveling-list">
    <div class="leveling-list__head">
      <div class="leveling-cols" aria-hidden="true">
        <span>Name</span><span>Tag</span><span>Lv</span><span>%</span><span>Eff Base</span><span>Δ</span>
      </div>
    </div>
    ${sectionHtml(
      isSearching ? "Matches" : "Bonus EXP (>100%)",
      items,
      focusId,
      LIMIT,
      isSearching ? "No matches." : "No bonus monsters in this filter.",
    )}
  </div>`;
}

function mount(root: HTMLElement): void {
  initPlannerGameModeFromUrlOrStorage();
  if (getPlannerGameMode() !== "renewal") {
    // If the user deep-links to a renewal-only page, automatically enable Renewal.
    setAndPersistPlannerGameMode("renewal");
  }

  const initialLevel = clampInt(parseInt(readLs("levelingPlayerLevel") || "", 10), 1, 275) || 17;
  const initialQuery = readLs("levelingMonsterQuery") || "";
  const initialFocusId = DEFAULT_FOCUS_MOB_ID;
  const initialHideBosses = localStorage.getItem("levelingHideBosses") === "1";
  const initialMultBase = readLs("levelingMultBase") || "1";
  const initialMultJob = readLs("levelingMultJob") || "1";
  const initialMultDrops = readLs("levelingMultDrops") || "1";

  root.innerHTML = `
    ${siteHeaderRowHtml("leveling")}

    <section class="page leveling-page">
      <div class="cards-toolbar">
        <div class="leveling-level" style="max-width: 560px;">
          <label class="cards-search" style="max-width: 320px;">
            <span class="cards-search__label">Your Base Level (Renewal)</span>
            <input id="playerLevel" class="cards-search__input" type="number" min="1" max="275" step="1" value="${initialLevel}" inputmode="numeric" />
          </label>
          <div class="leveling-level__controls" aria-label="Adjust level">
            <button type="button" class="cards-overflow-btn leveling-level__btn" id="lvMinus" aria-label="Decrease level">−</button>
            <button type="button" class="cards-overflow-btn leveling-level__btn" id="lvPlus" aria-label="Increase level">+</button>
          </div>
          <label class="leveling-level__slider" aria-label="Level slider">
            <input id="playerLevelSlider" type="range" min="1" max="275" step="1" value="${initialLevel}" />
          </label>
        </div>
        <div class="leveling-query">
          <label class="cards-search">
            <span class="cards-search__label">Monster name (filter)</span>
            <span class="leveling-searchwrap">
              <input id="monsterQuery" class="cards-search__input" type="search" placeholder="e.g. zombie or 1015" autocomplete="off" value="${escapeHtml(
                initialQuery,
              )}" />
              <button type="button" class="leveling-clear" id="monsterClear" aria-label="Clear monster search" title="Clear" ${
                initialQuery.trim() ? "" : "hidden"
              }>×</button>
            </span>
          </label>
          <label class="toolbar-toggle toolbar-toggle--compact leveling-toggle" title="Hide MVPs and Mini Bosses">
            <span class="toolbar-toggle-text">Hide bosses</span>
            <span class="toggle-switch">
              <input id="hideBosses" class="toggle-switch-input" type="checkbox" ${initialHideBosses ? "checked" : ""} />
              <span class="toggle-switch-track" aria-hidden="true"><span class="toggle-switch-thumb" aria-hidden="true"></span></span>
            </span>
          </label>
        </div>
        <div class="leveling-mults" aria-label="Rate multipliers">
          <div class="pets-card__k">Rates</div>
          <div class="leveling-mults__grid">
            <label class="leveling-mults__field">
              <span class="leveling-mults__k">Base</span>
              <input id="multBase" class="leveling-mults__input" type="number" min="0" step="0.1" value="${escapeHtml(
                initialMultBase,
              )}" inputmode="decimal" />
            </label>
            <label class="leveling-mults__field">
              <span class="leveling-mults__k">Job</span>
              <input id="multJob" class="leveling-mults__input" type="number" min="0" step="0.1" value="${escapeHtml(
                initialMultJob,
              )}" inputmode="decimal" />
            </label>
            <label class="leveling-mults__field">
              <span class="leveling-mults__k">Drops</span>
              <input id="multDrops" class="leveling-mults__input" type="number" min="0" step="0.1" value="${escapeHtml(
                initialMultDrops,
              )}" inputmode="decimal" />
            </label>
          </div>
        </div>
        <div class="cards-count" role="status" aria-live="polite" style="opacity:.75;">
        </div>
      </div>

      <div style="padding: 0 16px 24px;">
        <div class="leveling-layout">
          <div class="leveling-layout__left">
            <div id="list"></div>
          </div>
          <div class="leveling-layout__right">
            <div id="focus"></div>
          </div>
        </div>
      </div>

      <p class="msq-footnote" style="max-width: 980px;">
        EXP yield % follows Renewal level-difference rules from
        <a href="https://irowiki.org/wiki/Experience#Level_Differences" target="_blank" rel="noreferrer noopener">iRO Wiki (Experience → Level Differences)</a>.
      </p>
    </section>

    <div id="leveling-copy-toast" class="cards-copy-toast" role="status" aria-live="polite" aria-hidden="true"></div>
  `;

  wireSiteGameModeToggle(root);

  const input = root.querySelector<HTMLInputElement>("#playerLevel")!;
  const slider = root.querySelector<HTMLInputElement>("#playerLevelSlider")!;
  const minus = root.querySelector<HTMLButtonElement>("#lvMinus")!;
  const plus = root.querySelector<HTMLButtonElement>("#lvPlus")!;
  const query = root.querySelector<HTMLInputElement>("#monsterQuery")!;
  const queryClear = root.querySelector<HTMLButtonElement>("#monsterClear")!;
  const multBase = root.querySelector<HTMLInputElement>("#multBase")!;
  const multJob = root.querySelector<HTMLInputElement>("#multJob")!;
  const multDrops = root.querySelector<HTMLInputElement>("#multDrops")!;
  const hideBosses = root.querySelector<HTMLInputElement>("#hideBosses")!;
  const focusEl = root.querySelector<HTMLElement>("#focus")!;
  const listEl = root.querySelector<HTMLElement>("#list")!;
  const toast = root.querySelector<HTMLElement>("#leveling-copy-toast")!;

  // Reuse existing button styling but keep them visible here.
  minus.style.display = "inline-flex";
  plus.style.display = "inline-flex";

  let focusId = initialFocusId;
  let persistTimer: number | undefined;

  const schedulePersist = (): void => {
    if (persistTimer !== undefined) window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => {
      persistTimer = undefined;
      writeLs("levelingPlayerLevel", input.value || "");
      writeLs("levelingMonsterQuery", query.value || "");
      writeLs("levelingMultBase", multBase.value || "");
      writeLs("levelingMultJob", multJob.value || "");
      writeLs("levelingMultDrops", multDrops.value || "");
    }, 80);
  };

  const render = (): void => {
    const lv = clampInt(parseInt(input.value || "", 10), 1, 275);
    input.value = String(lv);
    slider.value = String(lv);

    const hideBossesOn = !!hideBosses.checked;
    const mult = {
      base: parseMultiplier(multBase.value),
      job: parseMultiplier(multJob.value),
      drop: parseMultiplier(multDrops.value),
    };

    // If current focus is filtered out, snap focus to the first filtered monster (or keep).
    const q = query.value || "";
    const qn = normalize(q);
    const isId = qn && /^\d+$/.test(qn);
    const idQ = isId ? parseInt(qn, 10) : null;
    const focusMonster0 = monstersById.get(focusId);
    const inFilter =
      (!qn ||
        (idQ != null ?
          focusId === idQ
        : normalize(focusMonster0?.name ?? "").includes(qn))) &&
      (!hideBossesOn || !isBossLike(focusMonster0));
    if (!inFilter) {
      const first = monstersAll.find((m) => {
        if (hideBossesOn && isBossLike(m)) return false;
        return idQ != null ? m.id === idQ : normalize(m.name).includes(qn);
      });
      if (first) focusId = first.id;
    }

    const focusMonster =
      monstersById.get(focusId) ??
      (hideBossesOn ? monstersAll.find((m) => !isBossLike(m)) : null) ??
      monstersById.get(DEFAULT_FOCUS_MOB_ID);
    focusEl.innerHTML = focusMonster ? monsterCardHtml(focusMonster, lv, mult) : "";
    listEl.innerHTML = monsterListHtml(lv, q, focusId, mult.base, { hideBosses: hideBossesOn });
  };

  const setLevel = (lv: number): void => {
    input.value = String(clampInt(lv, 1, 275));
    schedulePersist();
    render();
  };

  input.addEventListener("input", () => {
    schedulePersist();
    render();
  });
  slider.addEventListener("input", () => setLevel(parseInt(slider.value || "", 10)));
  minus.addEventListener("click", () => setLevel(parseInt(input.value || "", 10) - 1));
  plus.addEventListener("click", () => setLevel(parseInt(input.value || "", 10) + 1));
  query.addEventListener("input", () => {
    queryClear.hidden = !query.value.trim();
    schedulePersist();
    render();
  });
  multBase.addEventListener("input", () => {
    schedulePersist();
    render();
  });
  multJob.addEventListener("input", () => {
    schedulePersist();
    render();
  });
  multDrops.addEventListener("input", () => {
    schedulePersist();
    render();
  });
  hideBosses.addEventListener("input", () => {
    localStorage.setItem("levelingHideBosses", hideBosses.checked ? "1" : "0");
    render();
  });

  queryClear.addEventListener("click", () => {
    query.value = "";
    queryClear.hidden = true;
    schedulePersist();
    render();
    query.focus();
  });

  root.addEventListener("click", (e) => {
    const copyBtn = (e.target as HTMLElement | null)?.closest?.("[data-copy-map]") as HTMLButtonElement | null;
    if (copyBtn && root.contains(copyBtn)) {
      e.preventDefault();
      e.stopPropagation();
      const map = (copyBtn.getAttribute("data-copy-map") || "").trim();
      if (!map) return;

      const hide = (): void => {
        toast.classList.remove("cards-copy-toast--visible");
        toast.classList.remove("cards-copy-toast--below");
        toast.setAttribute("aria-hidden", "true");
        toast.textContent = "";
      };

      const show = (target: HTMLElement, label: string): void => {
        toast.textContent = label;
        toast.setAttribute("aria-hidden", "false");
        toast.classList.remove("cards-copy-toast--visible");
        toast.classList.remove("cards-copy-toast--below");
        void toast.offsetWidth;

        const r = target.getBoundingClientRect();
        const gap = 10;
        const cx = r.left + r.width / 2;
        toast.style.left = `${cx}px`;
        toast.style.top = `${r.top - gap}px`;

        requestAnimationFrame(() => {
          const tr = toast.getBoundingClientRect();
          if (tr.top < 8) {
            toast.classList.add("cards-copy-toast--below");
            toast.style.top = `${r.bottom + gap}px`;
          }
          toast.classList.add("cards-copy-toast--visible");
          window.setTimeout(hide, 900);
        });
      };

      void copyTextToClipboard(map)
        .then(() => show(copyBtn, "Copied to clipboard"))
        .catch(() => show(copyBtn, "Copy failed"));

      return;
    }

    const btn = (e.target as HTMLElement | null)?.closest?.("[data-focus-mob]") as HTMLElement | null;
    const idRaw = btn?.getAttribute("data-focus-mob");
    if (!idRaw) return;
    const id = parseInt(idRaw, 10);
    if (!Number.isFinite(id)) return;
    focusId = id;
    render();
  });

  render();
}

mount(document.querySelector("#app") as HTMLElement);

