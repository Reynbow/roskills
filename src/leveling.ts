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
  race?: string | null;
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

const E3: Record<string, string> = {
  Neutral: "NEU",
  Water: "WAT",
  Earth: "ERT",
  Fire: "FIR",
  Wind: "WND",
  Poison: "PSN",
  Holy: "HLY",
  Dark: "DRK",
  Ghost: "GST",
  Undead: "UND",
};

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

/**
 * Element damage taken table (Renewal), sourced from rAthena `db/re/attr_fix.yml`.
 * Returns "damage taken" multipliers by attack element (percent).
 */
function elementDamageTaken(defElem: string | null, defLv: number | null): Array<{ elem: string; pct: number }> {
  const e = String(defElem || "Neutral").trim() || "Neutral";
  const lv = clamp(typeof defLv === "number" && Number.isFinite(defLv) ? defLv : 1, 1, 4);

  const T: Record<number, Record<string, Record<string, number>>> = {
    1: {
      Neutral: { Neutral: 100, Water: 100, Earth: 100, Fire: 100, Wind: 100, Poison: 100, Holy: 100, Dark: 100, Ghost: 90, Undead: 100 },
      Water: { Neutral: 100, Water: 25, Earth: 100, Fire: 150, Wind: 90, Poison: 150, Holy: 100, Dark: 100, Ghost: 100, Undead: 100 },
      Earth: { Neutral: 100, Water: 100, Earth: 25, Fire: 90, Wind: 150, Poison: 150, Holy: 100, Dark: 100, Ghost: 100, Undead: 100 },
      Fire: { Neutral: 100, Water: 90, Earth: 150, Fire: 25, Wind: 100, Poison: 150, Holy: 100, Dark: 100, Ghost: 100, Undead: 125 },
      Wind: { Neutral: 100, Water: 150, Earth: 90, Fire: 100, Wind: 25, Poison: 150, Holy: 100, Dark: 100, Ghost: 100, Undead: 100 },
      Poison: { Neutral: 100, Water: 150, Earth: 150, Fire: 150, Wind: 150, Poison: 0, Holy: 75, Dark: 75, Ghost: 75, Undead: 75 },
      Holy: { Neutral: 100, Water: 100, Earth: 100, Fire: 100, Wind: 100, Poison: 75, Holy: 0, Dark: 125, Ghost: 100, Undead: 125 },
      Dark: { Neutral: 100, Water: 100, Earth: 100, Fire: 100, Wind: 100, Poison: 75, Holy: 125, Dark: 0, Ghost: 100, Undead: 0 },
      Ghost: { Neutral: 90, Water: 100, Earth: 100, Fire: 100, Wind: 100, Poison: 75, Holy: 90, Dark: 90, Ghost: 125, Undead: 100 },
      Undead: { Neutral: 100, Water: 100, Earth: 100, Fire: 90, Wind: 100, Poison: 75, Holy: 125, Dark: 0, Ghost: 100, Undead: 0 },
    },
    2: {
      Neutral: { Neutral: 100, Water: 100, Earth: 100, Fire: 100, Wind: 100, Poison: 100, Holy: 100, Dark: 100, Ghost: 70, Undead: 100 },
      Water: { Neutral: 100, Water: 0, Earth: 100, Fire: 175, Wind: 80, Poison: 150, Holy: 100, Dark: 100, Ghost: 100, Undead: 100 },
      Earth: { Neutral: 100, Water: 100, Earth: 0, Fire: 80, Wind: 175, Poison: 150, Holy: 100, Dark: 100, Ghost: 100, Undead: 100 },
      Fire: { Neutral: 100, Water: 80, Earth: 175, Fire: 0, Wind: 100, Poison: 150, Holy: 100, Dark: 100, Ghost: 100, Undead: 150 },
      Wind: { Neutral: 100, Water: 175, Earth: 80, Fire: 100, Wind: 0, Poison: 150, Holy: 100, Dark: 100, Ghost: 100, Undead: 100 },
      Poison: { Neutral: 100, Water: 150, Earth: 150, Fire: 150, Wind: 150, Poison: 0, Holy: 75, Dark: 75, Ghost: 75, Undead: 50 },
      Holy: { Neutral: 100, Water: 100, Earth: 100, Fire: 100, Wind: 100, Poison: 75, Holy: 0, Dark: 150, Ghost: 100, Undead: 150 },
      Dark: { Neutral: 100, Water: 100, Earth: 100, Fire: 100, Wind: 100, Poison: 75, Holy: 150, Dark: 0, Ghost: 100, Undead: 0 },
      Ghost: { Neutral: 70, Water: 100, Earth: 100, Fire: 100, Wind: 100, Poison: 75, Holy: 80, Dark: 80, Ghost: 150, Undead: 125 },
      Undead: { Neutral: 100, Water: 100, Earth: 100, Fire: 80, Wind: 100, Poison: 50, Holy: 150, Dark: 0, Ghost: 125, Undead: 0 },
    },
    3: {
      Neutral: { Neutral: 100, Water: 100, Earth: 100, Fire: 100, Wind: 100, Poison: 100, Holy: 100, Dark: 100, Ghost: 50, Undead: 100 },
      Water: { Neutral: 100, Water: 0, Earth: 100, Fire: 200, Wind: 70, Poison: 125, Holy: 100, Dark: 100, Ghost: 100, Undead: 100 },
      Earth: { Neutral: 100, Water: 100, Earth: 0, Fire: 70, Wind: 200, Poison: 125, Holy: 100, Dark: 100, Ghost: 100, Undead: 100 },
      Fire: { Neutral: 100, Water: 70, Earth: 200, Fire: 0, Wind: 100, Poison: 125, Holy: 100, Dark: 100, Ghost: 100, Undead: 175 },
      Wind: { Neutral: 100, Water: 200, Earth: 70, Fire: 100, Wind: 0, Poison: 125, Holy: 100, Dark: 100, Ghost: 100, Undead: 100 },
      Poison: { Neutral: 100, Water: 125, Earth: 125, Fire: 125, Wind: 125, Poison: 0, Holy: 50, Dark: 50, Ghost: 50, Undead: 25 },
      Holy: { Neutral: 100, Water: 100, Earth: 100, Fire: 100, Wind: 100, Poison: 50, Holy: 0, Dark: 175, Ghost: 100, Undead: 175 },
      Dark: { Neutral: 100, Water: 100, Earth: 100, Fire: 100, Wind: 100, Poison: 50, Holy: 175, Dark: 0, Ghost: 100, Undead: 0 },
      Ghost: { Neutral: 50, Water: 100, Earth: 100, Fire: 100, Wind: 100, Poison: 50, Holy: 70, Dark: 70, Ghost: 175, Undead: 150 },
      Undead: { Neutral: 100, Water: 100, Earth: 100, Fire: 70, Wind: 100, Poison: 25, Holy: 175, Dark: 0, Ghost: 150, Undead: 0 },
    },
    4: {
      Neutral: { Neutral: 100, Water: 100, Earth: 100, Fire: 100, Wind: 100, Poison: 100, Holy: 100, Dark: 100, Ghost: 0, Undead: 100 },
      Water: { Neutral: 100, Water: 0, Earth: 100, Fire: 200, Wind: 60, Poison: 125, Holy: 100, Dark: 100, Ghost: 100, Undead: 100 },
      Earth: { Neutral: 100, Water: 100, Earth: 0, Fire: 60, Wind: 200, Poison: 125, Holy: 100, Dark: 100, Ghost: 100, Undead: 100 },
      Fire: { Neutral: 100, Water: 60, Earth: 200, Fire: 0, Wind: 100, Poison: 125, Holy: 100, Dark: 100, Ghost: 100, Undead: 200 },
      Wind: { Neutral: 100, Water: 200, Earth: 60, Fire: 100, Wind: 0, Poison: 125, Holy: 100, Dark: 100, Ghost: 100, Undead: 100 },
      Poison: { Neutral: 100, Water: 125, Earth: 125, Fire: 125, Wind: 125, Poison: 0, Holy: 50, Dark: 50, Ghost: 50, Undead: 0 },
      Holy: { Neutral: 100, Water: 100, Earth: 100, Fire: 100, Wind: 100, Poison: 50, Holy: 0, Dark: 200, Ghost: 100, Undead: 200 },
      Dark: { Neutral: 100, Water: 100, Earth: 100, Fire: 100, Wind: 100, Poison: 50, Holy: 200, Dark: 0, Ghost: 100, Undead: 0 },
      Ghost: { Neutral: 0, Water: 100, Earth: 100, Fire: 100, Wind: 100, Poison: 50, Holy: 60, Dark: 60, Ghost: 200, Undead: 175 },
      Undead: { Neutral: 100, Water: 100, Earth: 100, Fire: 60, Wind: 100, Poison: 0, Holy: 200, Dark: 0, Ghost: 175, Undead: 0 },
    },
  };

  const row = T[lv] ?? T[1];
  return ELEMENTS.map((atk) => ({ elem: atk, pct: row[atk]?.[e] ?? 100 }));
}

function elementPreviewHtml(m: MonsterEntry): string {
  const defElem = m.element ?? "Neutral";
  const defLv = typeof m.elementLevel === "number" ? m.elementLevel : 1;
  const rows = elementDamageTaken(defElem, defLv);

  const weak = rows
    .filter((r) => r.pct > 100)
    .sort((a, b) => b.pct - a.pct || a.elem.localeCompare(b.elem))[0];
  const resist = rows
    .filter((r) => r.pct < 100)
    .sort((a, b) => a.pct - b.pct || a.elem.localeCompare(b.elem))[0];

  const w3 = weak ? E3[weak.elem] ?? weak.elem.slice(0, 3).toUpperCase() : "—";
  const r3 = resist ? E3[resist.elem] ?? resist.elem.slice(0, 3).toUpperCase() : "—";

  return `<span class="leveling-elem" aria-label="Element preview">
    <span class="leveling-elem__w" title="${escapeHtml(weak ? `${weak.elem} ${weak.pct}%` : "No weakness")}">${escapeHtml(
      w3,
    )}↑</span>
    <span class="leveling-elem__sep" aria-hidden="true">/</span>
    <span class="leveling-elem__r" title="${escapeHtml(
      resist ? `${resist.elem} ${resist.pct}%` : "No resist",
    )}">${escapeHtml(r3)}↓</span>
  </span>`;
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

function dropDisplayName(d: { name: string | null; aegis: string; id: number | null }): string {
  const n = String(d.name ?? "").trim();
  if (n) return n;
  const aegis = String(d.aegis ?? "").trim();
  if (typeof d.id === "number" && Number.isFinite(d.id)) {
    if (/^ITEM_\d+$/i.test(aegis)) return `Item #${d.id}`;
  }
  if (aegis) return aegis.replace(/_/g, " ");
  return typeof d.id === "number" && Number.isFinite(d.id) ? `Item #${d.id}` : "Unknown item";
}

/** Single drop matches item filter (same rules as monster list filter). */
function dropMatchesItemQuery(
  d: NonNullable<MonsterEntry["drops"]>[number],
  itemQn: string,
): boolean {
  const qn = normalize(itemQn);
  if (!qn) return false;
  if (/^\d+$/.test(qn)) {
    const idQ = parseInt(qn, 10);
    return typeof d.id === "number" && d.id === idQ;
  }
  const compactQ = qn.replace(/\s+/g, "");
  const dn = normalize(dropDisplayName(d));
  if (dn.includes(qn)) return true;
  const raw = String(d.aegis || "").replace(/^ITEM_/i, "");
  const ag = normalize(raw.replace(/_/g, " "));
  if (ag.includes(qn)) return true;
  const agCompact = normalize(raw).replace(/_/g, "");
  if (agCompact.includes(compactQ)) return true;
  return false;
}

/** True if monster has a drop matching item filter (name substring or numeric item id). */
function monsterMatchesItemQuery(m: MonsterEntry, itemQn: string): boolean {
  const qn = normalize(itemQn);
  if (!qn) return true;
  const drops = Array.isArray(m.drops) ? m.drops : [];
  return drops.some((d) => dropMatchesItemQuery(d, qn));
}

function bestMatchingDropForItemQuery(
  m: MonsterEntry,
  itemQn: string,
): { rate: number; isMvp: boolean; itemLabel: string; itemId: number | null } | null {
  const qn = normalize(itemQn);
  if (!qn) return null;
  const drops = Array.isArray(m.drops) ? m.drops : [];
  let best: { rate: number; isMvp: boolean; itemLabel: string; itemId: number | null } | null = null;
  for (const d of drops) {
    if (!d || typeof d.rate !== "number" || d.rate <= 0) continue;
    if (!dropMatchesItemQuery(d, qn)) continue;
    if (!best || d.rate > best.rate) {
      const itemId = typeof d.id === "number" && Number.isFinite(d.id) ? d.id : null;
      best = { rate: d.rate, isMvp: !!d.isMvp, itemLabel: dropDisplayName(d), itemId };
    }
  }
  return best;
}

function dropsHtml(m: MonsterEntry, mult: { drop: number }, itemQueryRaw: string): string {
  const iq = normalize(itemQueryRaw);
  const drops = Array.isArray(m.drops) ? m.drops.slice() : [];
  const rows = drops
    .filter((d) => d && typeof d.rate === "number" && d.rate > 0)
    .sort((a, b) => Number(b.isMvp) - Number(a.isMvp) || b.rate - a.rate)
    .map((d) => ({
      name: dropDisplayName(d),
      id: typeof d.id === "number" && Number.isFinite(d.id) ? d.id : null,
      rate: d.rate,
      isMvp: !!d.isMvp,
      searchHit: Boolean(iq && dropMatchesItemQuery(d, iq)),
    }));

  if (!rows.length) return `<div class="leveling-drops__empty">—</div>`;

  return `<div class="leveling-drops__list">${rows
    .map((r) => {
      const hitCls = r.searchHit ? " leveling-droprow--search-hit" : "";
      const cls =
        (r.isMvp ? "leveling-droprow leveling-droprow--mvp" : "leveling-droprow") + hitCls;
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

function monsterCardHtml(
  m: MonsterEntry,
  playerLevel: number,
  mult: { base: number; job: number; drop: number },
  itemQueryRaw: string,
): string {
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
  const race = (m.race || "").trim() || "—";
  const elem = (m.element || "").trim() || "—";
  const elemLv = typeof m.elementLevel === "number" && Number.isFinite(m.elementLevel) ? m.elementLevel : null;
  const elemLabel = elemLv ? `${elem} ${elemLv}` : elem;

  return `
    <div class="pets-card leveling-card" style="max-width: 980px;">
      <div class="pets-card__body leveling-card__body">
        <div class="leveling-card__top">
          <div class="leveling-card__top-left">
            <div class="pets-card__k">Monster</div>
            <div class="pets-monster__name">
              ${escapeHtml(m.name)} ${badge}
              <span class="leveling-name__id">#${escapeHtml(String(m.id))}</span>
            </div>
            <div class="leveling-spec" aria-label="Monster details">
              <div class="leveling-spec__row"><div class="leveling-spec__k">Level</div><div class="leveling-spec__v">${escapeHtml(
                String(m.level),
              )}</div></div>
              <div class="leveling-spec__row"><div class="leveling-spec__k">Race</div><div class="leveling-spec__v">${escapeHtml(
                race,
              )}</div></div>
              <div class="leveling-spec__row"><div class="leveling-spec__k">Element</div><div class="leveling-spec__v">${escapeHtml(
                elemLabel,
              )}</div></div>
            </div>

            <div class="leveling-expgrid" aria-label="Experience information">
              <div class="leveling-exp">
                <span class="leveling-exp__label">EXP yield</span>
                <span class="leveling-exp__pct ${pctTone}">${pct}%</span>
                <span class="leveling-exp__sub">(diff ${diff >= 0 ? "+" : ""}${diff})</span>
              </div>

              <div class="leveling-expgrid__row">
                <span class="leveling-expgrid__k">Bonus EXP range</span>
                <span class="leveling-expgrid__v leveling-expgrid__v--up">Lv ${escapeHtml(
                  String(bonusMinPlayerLv),
                )}–${escapeHtml(String(bonusMaxPlayerLv))}</span>
              </div>

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
              ${dropsHtml(m, mult, itemQueryRaw)}
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
  effJob: number | null;
  diff: number;
};

function isBossLike(m: MonsterEntry | undefined): boolean {
  if (!m) return false;
  return !!m.isMvp || !!m.isBoss;
}

function scoreMonster(m: MonsterEntry, playerLevel: number, mult: { base: number; job: number }): ScoredMonster {
  const diff = m.level - playerLevel;
  const pct = renewalExpYieldPercent(diff);
  const effBase =
    typeof m.baseExp === "number" ? Math.round(((m.baseExp * pct) / 100) * mult.base) : null;
  const effJob =
    typeof m.jobExp === "number" ? Math.round(((m.jobExp * pct) / 100) * mult.job) : null;
  return { m, pct, effBase, effJob, diff };
}

function sortScoredByItemDrop(items: ScoredMonster[], itemQn: string): ScoredMonster[] {
  const qn = normalize(itemQn);
  if (!qn) return items.slice();
  return items.slice().sort((a, b) => {
    const ra = bestMatchingDropForItemQuery(a.m, qn)?.rate ?? -1;
    const rb = bestMatchingDropForItemQuery(b.m, qn)?.rate ?? -1;
    if (rb !== ra) return rb - ra;
    return a.m.name.localeCompare(b.m.name) || a.m.id - b.m.id;
  });
}

/** Min/max raw drop rates (per 10000) for the current item filter; used to color rows red→green. */
function itemDropColorScale(list: ScoredMonster[], itemQueryRaw: string): { min: number; max: number } | null {
  const rates: number[] = [];
  for (const s of list) {
    const d = bestMatchingDropForItemQuery(s.m, itemQueryRaw);
    if (d && d.rate > 0) rates.push(d.rate);
  }
  if (rates.length === 0) return null;
  return { min: Math.min(...rates), max: Math.max(...rates) };
}

/** CSS color: low rate → red (hue 0), high → green (hue 120). */
function dropChanceColorForRate(rate: number, scale: { min: number; max: number }): string {
  const { min, max } = scale;
  if (!Number.isFinite(rate) || rate <= 0 || max <= 0) return "hsl(0, 65%, 58%)";
  if (max === min) return "hsl(120, 65%, 52%)";
  const t = Math.max(0, Math.min(1, (rate - min) / (max - min)));
  const h = t * 120;
  return `hsl(${h}, 72%, 52%)`;
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
  const effJob = s.effJob == null ? "-" : s.effJob.toLocaleString();
  const diff = `${s.diff >= 0 ? "+" : ""}${s.diff}`;
  const active = isActive ? " leveling-row--active" : "";
  const badge =
    s.m.isMvp ? `<span class="leveling-badge leveling-badge--mvp">MVP</span>`
    : s.m.isBoss ? `<span class="leveling-badge leveling-badge--mini">Mini</span>`
    : `<span class="leveling-badge leveling-badge--empty" aria-hidden="true"></span>`;
  return `<button type="button" class="leveling-row${active}" data-focus-mob="${id}">
    <span class="leveling-row__name">${name} <span class="leveling-row__id">#${id}</span></span>
    <span class="leveling-row__tag" aria-label="${s.m.isMvp ? "MVP" : s.m.isBoss ? "Mini Boss" : ""}">${badge}</span>
    <span class="leveling-row__elem">${elementPreviewHtml(s.m)}</span>
    <span class="leveling-row__meta">Lv ${lv}</span>
    <span class="leveling-row__pct ${pctCls}">${escapeHtml(String(s.pct))}%</span>
    <span class="leveling-row__eff">${escapeHtml(eff)}</span>
    <span class="leveling-row__job">${escapeHtml(effJob)}</span>
    <span class="leveling-row__diff">${escapeHtml(diff)}</span>
  </button>`;
}

function monsterRowItemSearchHtml(
  s: ScoredMonster,
  isActive: boolean,
  itemQueryRaw: string,
  dropMult: number,
  colorScale: { min: number; max: number } | null,
): string {
  const name = escapeHtml(s.m.name);
  const id = escapeHtml(String(s.m.id));
  const det = bestMatchingDropForItemQuery(s.m, itemQueryRaw);
  const pctLabel = det ? dropRateLabel(det.rate, dropMult) : "—";
  const itemLabel = det?.itemLabel ?? "—";
  const itemTitle = det ? escapeHtml(det.itemLabel) : "";
  const itemIcon =
    !det ? ""
    : det.itemId == null ?
      `<span class="leveling-drop__icon leveling-drop__icon--missing leveling-row__matched-icon" aria-hidden="true"></span>`
    : `<img class="leveling-drop__icon leveling-row__matched-icon" src="https://static.divine-pride.net/images/items/item/${escapeHtml(
        String(det.itemId),
      )}.png" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" />`;
  const pctColor =
    det && colorScale ? dropChanceColorForRate(det.rate, colorScale) : "";
  const pctStyle = pctColor ? ` style="color:${pctColor}"` : "";
  const mvpDrop =
    det?.isMvp ?
      `<span class="leveling-row__drop-note" title="Drop is from MVP loot">MVP</span>`
    : "";
  const active = isActive ? " leveling-row--active" : "";
  const badge =
    s.m.isMvp ? `<span class="leveling-badge leveling-badge--mvp">MVP</span>`
    : s.m.isBoss ? `<span class="leveling-badge leveling-badge--mini">Mini</span>`
    : `<span class="leveling-badge leveling-badge--empty" aria-hidden="true"></span>`;
  return `<button type="button" class="leveling-row leveling-row--itemdrop${active}" data-focus-mob="${id}">
    <span class="leveling-row__item-primary">
      <span class="leveling-row__name">${name} <span class="leveling-row__id">#${id}</span></span>
      <span class="leveling-row__tag" aria-label="${s.m.isMvp ? "MVP" : s.m.isBoss ? "Mini Boss" : ""}">${badge}</span>
    </span>
    <span class="leveling-row__matched-item"${itemTitle ? ` title="${itemTitle}"` : ""}>${itemIcon}<span class="leveling-row__matched-item-text">${escapeHtml(itemLabel)}</span></span>
    <span class="leveling-row__drop" aria-label="Drop chance for your search">
      <span class="leveling-row__drop-pct"${pctStyle}>${escapeHtml(pctLabel)}</span>${mvpDrop}
    </span>
  </button>`;
}

type SortKey = "name" | "tag" | "level" | "pct" | "effBase" | "effJob" | "diff";
type SortDir = "asc" | "desc";

function sortLabel(key: SortKey): string {
  switch (key) {
    case "name":
      return "Name";
    case "tag":
      return "Tag";
    case "level":
      return "Lv";
    case "pct":
      return "%";
    case "effBase":
      return "Base";
    case "effJob":
      return "Job";
    case "diff":
      return "Δ";
  }
}

function sortButtonHtml(key: SortKey, activeKey: SortKey, dir: SortDir): string {
  const isActive = key === activeKey;
  const arrow = !isActive ? "" : dir === "asc" ? " ▲" : " ▼";
  const cls = `leveling-colbtn${isActive ? " leveling-colbtn--active" : ""}`;
  return `<button type="button" class="${cls}" data-sort-key="${escapeHtml(
    key,
  )}" aria-label="Sort by ${escapeHtml(sortLabel(key))}${isActive ? (dir === "asc" ? " ascending" : " descending") : ""}">${escapeHtml(
    sortLabel(key),
  )}${arrow}</button>`;
}

function sortScored(items: ScoredMonster[], key: SortKey, dir: SortDir): ScoredMonster[] {
  const sign = dir === "asc" ? 1 : -1;
  const tagRank = (m: MonsterEntry): number => (m.isMvp ? 2 : m.isBoss ? 1 : 0);
  const num = (n: number | null): number => (typeof n === "number" && Number.isFinite(n) ? n : -Infinity);
  return items.slice().sort((a, b) => {
    let c = 0;
    if (key === "name") c = a.m.name.localeCompare(b.m.name) || a.m.id - b.m.id;
    else if (key === "tag") c = tagRank(b.m) - tagRank(a.m) || a.m.name.localeCompare(b.m.name);
    else if (key === "level") c = a.m.level - b.m.level || a.m.name.localeCompare(b.m.name);
    else if (key === "pct") c = a.pct - b.pct || num(a.effBase) - num(b.effBase);
    else if (key === "effBase") c = num(a.effBase) - num(b.effBase) || a.m.level - b.m.level;
    else if (key === "effJob") c = num(a.effJob) - num(b.effJob) || a.m.level - b.m.level;
    else if (key === "diff") c = a.diff - b.diff || num(a.effBase) - num(b.effBase);
    return c * sign;
  });
}

function sectionHtml(
  title: string,
  items: ScoredMonster[],
  focusId: number,
  limit: number,
  empty: string,
  itemDropMode?: { query: string; dropMult: number },
): string {
  const shown = items.slice(0, limit);
  const dropScale = itemDropMode ? itemDropColorScale(items, itemDropMode.query) : null;
  const rows = itemDropMode
    ? shown
        .map((s) =>
          monsterRowItemSearchHtml(s, s.m.id === focusId, itemDropMode.query, itemDropMode.dropMult, dropScale),
        )
        .join("")
    : shown.map((s) => monsterRowHtml(s, s.m.id === focusId)).join("");
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
  itemQuery: string,
  focusId: number,
  mult: { base: number; job: number; drop: number },
  opts: { hideBosses: boolean; mapFocus: string; sortKey: SortKey; sortDir: SortDir },
): string {
  const q = normalize(query);
  const isIdQuery = q && /^\d+$/.test(q);
  const idQuery = isIdQuery ? parseInt(q, 10) : null;
  const iq = normalize(itemQuery);
  const itemDropMode = iq ? { query: itemQuery, dropMult: mult.drop } : undefined;

  const mapFocus = (opts.mapFocus || "").trim();
  const mapItems = mapFocus
    ? monstersAll
        .filter((m) => {
          if (opts.hideBosses && isBossLike(m)) return false;
          if (!monsterMatchesItemQuery(m, iq)) return false;
          const maps = Array.isArray(m.maps) ? m.maps : [];
          return maps.some((x) => x && typeof x.map === "string" && x.map === mapFocus);
        })
        .map((m) => scoreMonster(m, playerLevel, mult))
    : [];

  const filtered = monstersAll.filter((m) => {
    if (opts.hideBosses && isBossLike(m)) return false;
    if (!monsterMatchesItemQuery(m, iq)) return false;
    if (!q) return true;
    if (idQuery != null) return m.id === idQuery;
    return normalize(m.name).includes(q);
  });

  const scored = filtered.map((m) => scoreMonster(m, playerLevel, mult));

  const isSearching = Boolean(q) || Boolean(iq);
  const bonus = scored.filter((s) => s.pct > 100);
  const itemsRaw = isSearching ? scored : bonus;
  const items = itemDropMode ? sortScoredByItemDrop(itemsRaw, itemQuery) : sortScored(itemsRaw, opts.sortKey, opts.sortDir);
  const mapItemsSorted = mapItems.length
    ? itemDropMode
      ? sortScoredByItemDrop(mapItems, itemQuery)
      : sortScored(mapItems, opts.sortKey, opts.sortDir)
    : mapItems;

  const LIMIT = q || iq ? 60 : 30;

  let sectionTitle = "Bonus EXP (>100%)";
  let sectionEmpty = "No bonus monsters in this filter.";
  if (iq && !q) {
    sectionTitle = "Item drops";
    sectionEmpty = "No monsters drop a matching item.";
  } else if (q) {
    sectionTitle = "Matches";
    sectionEmpty = "No matches.";
  }

  const listHeadCols = itemDropMode
    ? `<div class="leveling-cols leveling-cols--itemdrop" aria-hidden="true">
        <div class="leveling-coltxt">Monster</div>
        <div class="leveling-coltxt">Matched item</div>
        <div class="leveling-coltxt leveling-coltxt--num" title="Chance for this item (uses Drops rate multiplier)">Drop chance</div>
      </div>`
    : `<div class="leveling-cols" aria-hidden="true">
        ${sortButtonHtml("name", opts.sortKey, opts.sortDir)}
        ${sortButtonHtml("tag", opts.sortKey, opts.sortDir)}
        <div class="leveling-coltxt" title="Element preview">Elm</div>
        ${sortButtonHtml("level", opts.sortKey, opts.sortDir)}
        ${sortButtonHtml("pct", opts.sortKey, opts.sortDir)}
        ${sortButtonHtml("effBase", opts.sortKey, opts.sortDir)}
        ${sortButtonHtml("effJob", opts.sortKey, opts.sortDir)}
        ${sortButtonHtml("diff", opts.sortKey, opts.sortDir)}
      </div>`;

  const mapDropScale = itemDropMode && mapItemsSorted.length ? itemDropColorScale(mapItemsSorted, itemQuery) : null;

  const mapRowsHtml = (() => {
    if (!mapItemsSorted.length) return `<div class="leveling-empty">No spawns found for this map.</div>`;
    const slice = mapItemsSorted.slice(0, LIMIT);
    return itemDropMode
      ? slice.map((s) =>
          monsterRowItemSearchHtml(s, s.m.id === focusId, itemQuery, mult.drop, mapDropScale),
        ).join("")
      : slice.map((s) => monsterRowHtml(s, s.m.id === focusId)).join("");
  })();

  return `<div class="leveling-list">
    <div class="leveling-list__head">
      ${listHeadCols}
    </div>
    ${
      mapFocus
        ? `<section class="leveling-section leveling-section--map">
      <div class="leveling-section__head">
        <div class="pets-card__k">Map: ${escapeHtml(mapFocus)}</div>
        <div style="display:flex; align-items:baseline; gap:.6rem;">
          <div class="leveling-section__count">${mapItems.length.toLocaleString()}</div>
          <button type="button" class="cards-filter-clear" data-clear-map="1">Clear</button>
        </div>
      </div>
      <div class="leveling-rows">${mapRowsHtml}</div>
    </section>`
        : ""
    }
    ${sectionHtml(sectionTitle, items, focusId, LIMIT, sectionEmpty, itemDropMode)}
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
  let initialItemQuery = readLs("levelingItemQuery") || "";
  if (initialQuery.trim() && initialItemQuery.trim()) {
    initialItemQuery = "";
    writeLs("levelingItemQuery", "");
  }
  const initialFocusId = DEFAULT_FOCUS_MOB_ID;
  const initialHideBosses = localStorage.getItem("levelingHideBosses") === "1";
  const initialMultBase = readLs("levelingMultBase") || "1";
  const initialMultJob = readLs("levelingMultJob") || "1";
  const initialMultDrops = readLs("levelingMultDrops") || "1";

  root.innerHTML = `
    ${siteHeaderRowHtml("re-monsters")}

    <section class="page leveling-page">
      <div class="leveling-topbar">
        <div class="cards-toolbar">
          <div class="leveling-toolbar-main">
            <div class="leveling-level">
            <label class="cards-search leveling-level__search">
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
          </div>
        </div>
        <aside class="leveling-itemdrop-panel" aria-label="Filter monsters by item drop">
          <div class="leveling-itemdrop-panel__title">Item drop</div>
          <label class="cards-search">
            <span class="cards-search__label">Search drops</span>
            <span class="leveling-searchwrap">
              <input id="itemDropQuery" class="cards-search__input" type="search" placeholder="e.g. jellopy or 909" autocomplete="off" value="${escapeHtml(
                initialItemQuery,
              )}" />
              <button type="button" class="leveling-clear" id="itemDropClear" aria-label="Clear item search" title="Clear" ${
                initialItemQuery.trim() ? "" : "hidden"
              }>×</button>
            </span>
          </label>
        </aside>
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
  const itemDrop = root.querySelector<HTMLInputElement>("#itemDropQuery")!;
  const itemDropClear = root.querySelector<HTMLButtonElement>("#itemDropClear")!;
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
  let mapFocus = readLs("levelingMapFocus") || "";
  let sortKey = (readLs("levelingSortKey") || "effBase") as SortKey;
  let sortDir = (readLs("levelingSortDir") || "desc") as SortDir;
  let persistTimer: number | undefined;

  const schedulePersist = (): void => {
    if (persistTimer !== undefined) window.clearTimeout(persistTimer);
    persistTimer = window.setTimeout(() => {
      persistTimer = undefined;
      writeLs("levelingPlayerLevel", input.value || "");
      writeLs("levelingMonsterQuery", query.value || "");
      writeLs("levelingItemQuery", itemDrop.value || "");
      writeLs("levelingMultBase", multBase.value || "");
      writeLs("levelingMultJob", multJob.value || "");
      writeLs("levelingMultDrops", multDrops.value || "");
      writeLs("levelingMapFocus", mapFocus || "");
      writeLs("levelingSortKey", sortKey);
      writeLs("levelingSortDir", sortDir);
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
    const iqRaw = itemDrop.value || "";
    const iq = normalize(iqRaw);
    const focusMonster0 = monstersById.get(focusId);
    const mapFocusOn = (mapFocus || "").trim();
    const inMapFocus =
      !mapFocusOn ||
      (Array.isArray(focusMonster0?.maps) &&
        focusMonster0!.maps!.some((x) => x && typeof x.map === "string" && x.map === mapFocusOn));

    const nameConstrainsFocus = !mapFocusOn && Boolean(qn);
    const nameOk =
      !nameConstrainsFocus ||
      (idQ != null ? focusId === idQ : normalize(focusMonster0?.name ?? "").includes(qn));
    const itemOk =
      !iq || (!!focusMonster0 && monsterMatchesItemQuery(focusMonster0, iq));

    const inFilter = (!hideBossesOn || !isBossLike(focusMonster0)) && inMapFocus && nameOk && itemOk;
    if (!inFilter) {
      const first = monstersAll.find((m) => {
        if (hideBossesOn && isBossLike(m)) return false;
        if (!monsterMatchesItemQuery(m, iq)) return false;
        if (mapFocusOn) {
          const maps = Array.isArray(m.maps) ? m.maps : [];
          if (!maps.some((x) => x && typeof x.map === "string" && x.map === mapFocusOn)) return false;
          return true;
        }
        if (!qn) return true;
        return idQ != null ? m.id === idQ : normalize(m.name).includes(qn);
      });
      if (first) focusId = first.id;
    }

    const focusMonster =
      monstersById.get(focusId) ??
      (hideBossesOn ? monstersAll.find((m) => !isBossLike(m)) : null) ??
      monstersById.get(DEFAULT_FOCUS_MOB_ID);
    focusEl.innerHTML = focusMonster ? monsterCardHtml(focusMonster, lv, mult, iqRaw) : "";
    listEl.innerHTML = monsterListHtml(
      lv,
      q,
      iqRaw,
      focusId,
      { base: mult.base, job: mult.job, drop: mult.drop },
      { hideBosses: hideBossesOn, mapFocus, sortKey, sortDir },
    );
  };

  const clearItemDropFilter = (): void => {
    itemDrop.value = "";
    itemDropClear.hidden = true;
    writeLs("levelingItemQuery", "");
  };

  const setLevel = (lv: number): void => {
    clearItemDropFilter();
    input.value = String(clampInt(lv, 1, 275));
    schedulePersist();
    render();
  };

  input.addEventListener("input", () => {
    clearItemDropFilter();
    schedulePersist();
    render();
  });
  slider.addEventListener("input", () => setLevel(parseInt(slider.value || "", 10)));
  minus.addEventListener("click", () => setLevel(parseInt(input.value || "", 10) - 1));
  plus.addEventListener("click", () => setLevel(parseInt(input.value || "", 10) + 1));
  query.addEventListener("input", () => {
    if (itemDrop.value.trim()) {
      itemDrop.value = "";
      itemDropClear.hidden = true;
      writeLs("levelingItemQuery", "");
    }
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
    clearItemDropFilter();
    localStorage.setItem("levelingHideBosses", hideBosses.checked ? "1" : "0");
    schedulePersist();
    render();
  });

  itemDrop.addEventListener("input", () => {
    if (query.value.trim()) {
      query.value = "";
      queryClear.hidden = true;
      writeLs("levelingMonsterQuery", "");
    }
    itemDropClear.hidden = !itemDrop.value.trim();
    schedulePersist();
    render();
  });

  queryClear.addEventListener("click", () => {
    query.value = "";
    queryClear.hidden = true;
    schedulePersist();
    render();
    query.focus();
  });

  itemDropClear.addEventListener("click", () => {
    itemDrop.value = "";
    itemDropClear.hidden = true;
    schedulePersist();
    render();
    itemDrop.focus();
  });

  root.addEventListener("click", (e) => {
    const sortBtn = (e.target as HTMLElement | null)?.closest?.("[data-sort-key]") as HTMLButtonElement | null;
    if (sortBtn && root.contains(sortBtn)) {
      e.preventDefault();
      const key = (sortBtn.getAttribute("data-sort-key") || "") as SortKey | "";
      if (!key) return;
      if (key === sortKey) sortDir = sortDir === "asc" ? "desc" : "asc";
      else {
        sortKey = key;
        sortDir = key === "name" ? "asc" : "desc";
      }
      schedulePersist();
      render();
      return;
    }

    const clearMap = (e.target as HTMLElement | null)?.closest?.("[data-clear-map]") as HTMLButtonElement | null;
    if (clearMap && root.contains(clearMap)) {
      e.preventDefault();
      mapFocus = "";
      schedulePersist();
      render();
      return;
    }

    const copyBtn = (e.target as HTMLElement | null)?.closest?.("[data-copy-map]") as HTMLButtonElement | null;
    if (copyBtn && root.contains(copyBtn)) {
      e.preventDefault();
      e.stopPropagation();
      const map = (copyBtn.getAttribute("data-copy-map") || "").trim();
      if (!map) return;
      mapFocus = map;
      schedulePersist();
      render();

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

    // If the user manually selects a monster that doesn't match the currently
    // selected map-focus constraint, treat that as intent to switch away from
    // the map constraint (otherwise focus will "snap back" and feel unclickable).
    const mapFocusOn = (mapFocus || "").trim();
    if (mapFocusOn) {
      const m = monstersById.get(id);
      const maps = Array.isArray(m?.maps) ? m!.maps! : [];
      const inMap = maps.some((x) => x && typeof x.map === "string" && x.map === mapFocusOn);
      if (!inMap) {
        mapFocus = "";
        schedulePersist();
      }
    }
    focusId = id;
    render();
  });

  render();
}

mount(document.querySelector("#app") as HTMLElement);

