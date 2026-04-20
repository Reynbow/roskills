/**
 * Fetches rAthena pre-renewal item_db_etc.yml + mob_db.yml and emits src/data/cards.json
 * — all Type: Card items, with monster drop sources and rates (permyriad: 10000 = 100%).
 *
 * Card effect text: from RagnaAPI old-times items/{id} (iRO Wiki DB) — `description` and/or `skills`.
 * SKIP_CARD_DESC_FETCH=1 skips those HTTP requests (descriptions left empty).
 *
 * Local override: place files in third_party/rathena-pre-re/{item_db_etc.yml,mob_db.yml}
 * SKIP_RATHENA_FETCH=1 uses only those files; if missing, leaves existing cards.json unchanged.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "src", "data", "cards.json");
const RATHENA_DIR = path.join(ROOT, "third_party", "rathena-pre-re");

const ITEM_URL =
  "https://raw.githubusercontent.com/rathena/rathena/master/db/pre-re/item_db_etc.yml";
const MOB_URL = "https://raw.githubusercontent.com/rathena/rathena/master/db/pre-re/mob_db.yml";

const RAGNAPI_ITEM = (id) =>
  `https://ragnapi.com/api/v1/old-times/items/${id}`;

/**
 * @param {unknown} skills
 * @returns {string[]}
 */
function flattenSkillLines(skills) {
  if (skills == null) return [];
  if (typeof skills === "string") return [skills];
  if (!Array.isArray(skills)) return [];
  /** @type {string[]} */
  const out = [];
  for (const s of skills) {
    if (typeof s === "string") {
      out.push(s);
      continue;
    }
    if (s && typeof s === "object" && Array.isArray(s.combo)) {
      for (const line of s.combo) {
        if (typeof line === "string") out.push(line);
      }
    }
  }
  return out;
}

/**
 * @param {number} id
 * @returns {Promise<{ description: string; img: string; cardArt: string }>}
 */
async function fetchCardInfoFromRagnapi(id) {
  const res = await fetch(RAGNAPI_ITEM(id), {
    headers: { "User-Agent": "ro-pre-renewal-skill-planner/import-cards" },
  });
  if (!res.ok) return { description: "", img: "", cardArt: "" };
  let text = await res.text();
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { description: "", img: "", cardArt: "" };
  }
  const desc = typeof data.description === "string" ? data.description.trim() : "";
  const img = typeof data.img === "string" ? data.img.trim() : "";
  const skillLines = flattenSkillLines(data.skills);
  const skillText = skillLines.join("\n").trim();
  let description = "";
  if (desc && skillText) description = `${desc}\n${skillText}`;
  else description = desc || skillText;
  // Card illustration artwork (not the item icon)
  const cardArt = `https://static.divine-pride.net/images/items/cards/${id}.png`;
  return { description, img, cardArt };
}

/** @param {string} rel */
function localPath(rel) {
  return path.join(RATHENA_DIR, rel);
}

/** @param {string} rel @param {string} url */
async function loadYamlText(rel, url) {
  const p = localPath(rel);
  if (fs.existsSync(p)) {
    return fs.readFileSync(p, "utf8");
  }
  if (process.env.SKIP_RATHENA_FETCH === "1") {
    throw new Error(`Missing local ${p} (SKIP_RATHENA_FETCH=1)`);
  }
  const res = await fetch(url, {
    headers: { "User-Agent": "ro-pre-renewal-skill-planner/import-cards" },
  });
  if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
  return res.text();
}

/**
 * @param {Record<string, unknown> | null | undefined} loc
 * @returns {string | undefined}
 */
function formatSlot(loc) {
  if (!loc || typeof loc !== "object") return undefined;
  const keys = Object.keys(loc).filter((k) => loc[k] === true);
  if (!keys.length) return undefined;
  return keys
    .map((k) =>
      k
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase()),
    )
    .join(", ");
}

/**
 * @param {unknown} body
 * @returns {Array<Record<string, unknown>>}
 */
function bodyArray(body) {
  return Array.isArray(body) ? body : [];
}

/**
 * @param {Map<string, Array<{ monster: string; rate: number; isMvp: boolean }>>} byAegis
 * @param {string} monsterName
 * @param {unknown} drops
 * @param {boolean} isMvp
 */
function collectDrops(byAegis, monsterName, drops, isMvp) {
  if (!Array.isArray(drops)) return;
  for (const d of drops) {
    if (!d || typeof d !== "object") continue;
    const item = d.Item;
    const rate = d.Rate;
    if (typeof item !== "string" || typeof rate !== "number") continue;
    const list = byAegis.get(item);
    if (!list) continue;
    list.push({ monster: monsterName, rate, isMvp: Boolean(isMvp) });
  }
}

/**
 * Best-effort: convert simple `bonus bX,n;` lines into readable stats.
 * Only returns a value when the script looks "stats-only" (no bonus2/3/etc, no sc_start, etc.).
 * @param {unknown} script
 * @returns {string | null}
 */
function scriptToStatsOnlyDescription(script) {
  if (typeof script !== "string") return null;
  const raw = script.trim();
  if (!raw) return null;

  // If it contains complex scripting, don't guess.
  if (/\bbonus[2-9]\b/i.test(raw)) return null;
  if (/\bsc_start\b|\bautobonus\b|\bskill\b|\bcallfunc\b|\bgetitem\b|\bheal\b/i.test(raw)) return null;
  if (/\bbonus\b/i.test(raw) === false) return null;

  const map = new Map([
    ["bStr", "STR"],
    ["bAgi", "AGI"],
    ["bVit", "VIT"],
    ["bInt", "INT"],
    ["bDex", "DEX"],
    ["bLuk", "LUK"],
    ["bMaxHP", "Max HP"],
    ["bMaxSP", "Max SP"],
    ["bMaxHPrate", "Max HP"],
    ["bMaxSPrate", "Max SP"],
    ["bAtk", "ATK"],
    ["bBaseAtk", "ATK"],
    ["bMatk", "MATK"],
    ["bDef", "DEF"],
    ["bMdef", "MDEF"],
    ["bHit", "HIT"],
    ["bFlee", "FLEE"],
    ["bFlee2", "Perfect Dodge"],
    ["bCritical", "CRIT"],
    ["bAspdRate", "ASPD"],
    // Common damage-taken reductions
    ["bLongAtkDef", "Ranged damage received"],
    ["bNearAtkDef", "Melee damage received"],
    ["bHPrecovRate", "HP Recovery"],
    ["bSPrecovRate", "SP Recovery"],
  ]);
  const percentKeys = new Set(["bLongAtkDef", "bNearAtkDef", "bHPrecovRate", "bSPrecovRate"]);

  /** @type {string[]} */
  const out = [];
  const re = /\bbonus\s+([A-Za-z0-9_]+)\s*,\s*([-+]?\d+)\s*;/g;
  let m;
  while ((m = re.exec(raw))) {
    const key = m[1];
    const n = Number.parseInt(m[2], 10);
    if (!key || !Number.isFinite(n)) continue;
    const label = map.get(key);
    if (!label) return null; // unknown bonus → treat as non-stats-only
    if (percentKeys.has(key) || key === "bMaxHPrate" || key === "bMaxSPrate" || key === "bAspdRate") {
      if (key === "bLongAtkDef" || key === "bNearAtkDef") {
        // For these, positive values usually mean reduction.
        out.push(`${label} -${Math.abs(n)}%`);
      } else {
        const sign = n >= 0 ? "+" : "";
        out.push(`${label} ${sign}${n}%`);
      }
    } else {
      const sign = n >= 0 ? "+" : "";
      out.push(`${label} ${sign}${n}`);
    }
  }

  if (out.length === 0) return null;
  return out.join("\n");
}

async function main() {
  let itemText;
  let mobText;
  try {
    itemText = await loadYamlText("item_db_etc.yml", ITEM_URL);
    mobText = await loadYamlText("mob_db.yml", MOB_URL);
  } catch (e) {
    if (process.env.SKIP_RATHENA_FETCH === "1" && fs.existsSync(OUT)) {
      console.warn("import-cards:", (e && e.message) || e);
      console.warn("import-cards: leaving", OUT, "unchanged");
      process.exit(0);
    }
    throw e;
  }

  /** @type {{ Body?: unknown }} */
  const itemDoc = parseYaml(itemText);
  /** @type {{ Body?: unknown }} */
  const mobDoc = parseYaml(mobText);

  const items = bodyArray(itemDoc.Body);
  const cards = items.filter((it) => it && it.Type === "Card");

  /** @type {Map<string, Array<{ monster: string; rate: number; isMvp: boolean }>>} */
  const byAegis = new Map();
  for (const c of cards) {
    const a = c.AegisName;
    if (typeof a === "string") byAegis.set(a, []);
  }

  const mobs = bodyArray(mobDoc.Body);
  for (const mob of mobs) {
    if (!mob || typeof mob !== "object") continue;
    const name = mob.Name;
    if (typeof name !== "string") continue;
    const isMvp =
      (Array.isArray(mob.MvpDrops) && mob.MvpDrops.length > 0) ||
      (typeof mob.MvpExp === "number" && mob.MvpExp > 0) ||
      (typeof mob.Mvp1id === "number" && mob.Mvp1id > 0);
    collectDrops(byAegis, name, mob.Drops, isMvp);
    collectDrops(byAegis, name, mob.MvpDrops, isMvp);
  }

  const out = [];
  for (const c of cards) {
    const id = c.Id;
    const aegisName = c.AegisName;
    const name = c.Name;
    if (typeof id !== "number" || typeof aegisName !== "string" || typeof name !== "string") {
      continue;
    }
    const slot = formatSlot(
      c.Locations && typeof c.Locations === "object" ? c.Locations : undefined,
    );
    let drops = byAegis.get(aegisName) ?? [];
    drops = drops
      .slice()
      .sort((a, b) => a.monster.localeCompare(b.monster) || a.rate - b.rate);
    const row = {
      id,
      aegisName,
      name,
      ...(slot ? { slot } : {}),
      drops,
      // Card illustration artwork (not the item icon). Deterministic by item ID.
      cardArt: `https://static.divine-pride.net/images/items/cards/${id}.png`,
      scriptStatsFallback: scriptToStatsOnlyDescription(c.Script),
    };
    out.push(row);
  }

  out.sort((a, b) => a.name.localeCompare(b.name));

  const existingById = new Map();
  if (fs.existsSync(OUT)) {
    try {
      const raw = fs.readFileSync(OUT, "utf8");
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        for (const row of parsed) {
          if (!row || typeof row !== "object") continue;
          if (typeof row.id !== "number") continue;
          existingById.set(row.id, {
            description: typeof row.description === "string" ? row.description : "",
            img: typeof row.img === "string" ? row.img : "",
            cardArt: typeof row.cardArt === "string" ? row.cardArt : "",
          });
        }
      }
    } catch {
      // ignore parse errors; we'll just re-fetch where needed
    }
  }

  const skipDesc = process.env.SKIP_CARD_DESC_FETCH === "1";
  if (skipDesc) {
    console.warn("import-cards: SKIP_CARD_DESC_FETCH=1 — card descriptions omitted");
    for (const row of out) {
      const prev = existingById.get(row.id);
      if (!prev) continue;
      if (!row.description && prev.description) row.description = prev.description;
      if (!row.img && prev.img) row.img = prev.img;
      if (!row.cardArt && prev.cardArt) row.cardArt = prev.cardArt;
    }
  } else {
    let ok = 0;
    let fail = 0;
    const delayMs = Number(process.env.CARD_DESC_FETCH_DELAY_MS ?? 80);
    for (const row of out) {
      try {
        const info = await fetchCardInfoFromRagnapi(row.id);
        const description = info?.description?.trim?.() ? info.description.trim() : "";
        const img = info?.img?.trim?.() ? info.img.trim() : "";
        const cardArt = info?.cardArt?.trim?.() ? info.cardArt.trim() : "";
        if (description) row.description = description;
        if (img) row.img = img;
        if (cardArt) row.cardArt = cardArt;
        if (description || img || cardArt) ok++;
        else fail++;
      } catch {
        fail++;
      }
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    console.log(
      `import-cards: RagnaAPI item info — ${ok} cards with description and/or image, ${fail} empty or failed (${out.length} total)`,
    );
  }

  // If RagnaAPI had no effect text, fall back to rAthena script-derived stats-only text when safe.
  let fallbackFilled = 0;
  let fallbackPrepended = 0;
  for (const row of out) {
    const fb = typeof row.scriptStatsFallback === "string" ? row.scriptStatsFallback.trim() : "";
    if (!fb) continue;

    if (!row.description) {
      row.description = fb;
      fallbackFilled++;
      continue;
    }

    // Some items (e.g. set cards) come back from RagnaAPI with only the set-bonus block.
    // If we have a clean stats-only script, prepend it so the card has its own base effect too.
    if (/^\s*Set bonus with\b/i.test(row.description.trim())) {
      row.description = `${fb}\n${row.description.trim()}`;
      fallbackPrepended++;
    }
  }
  if (fallbackFilled) {
    console.log(`import-cards: filled ${fallbackFilled} descriptions from rAthena Script stats-only fallback`);
  }
  if (fallbackPrepended) {
    console.log(`import-cards: prepended ${fallbackPrepended} base effects before set-bonus-only descriptions`);
  }

  // Don't ship internal fields
  for (const row of out) {
    delete row.scriptStatsFallback;
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`, "utf8");
  console.log(
    `Wrote ${OUT} (${out.length} cards, rAthena pre-renewal item_db_etc + mob_db)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
