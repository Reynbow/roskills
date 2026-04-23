/**
 * Fetches rAthena pre-renewal item_db_etc.yml + mob_db.yml and emits src/data/cards.json
 * — all Type: Card items, with monster drop sources and rates (permyriad: 10000 = 100%).
 *
 * Card effect text: from RagnaAPI old-times items/{id} (iRO Wiki DB) — `description` and/or `skills`.
 * SKIP_CARD_DESC_FETCH=1 skips those HTTP requests (descriptions left empty).
 *
 * Local override: place files in third_party/rathena-pre-re/{item_db_etc.yml,mob_db.yml}
 * SKIP_RATHENA_FETCH=1 uses only those files; if missing, leaves existing cards.json unchanged.
 *
 * Top spawn maps per monster: optional src/data/mob-spawn-maps.json (run scripts/build-mob-spawn-maps.mjs).
 *
 * Prefix/suffix (compound name when carded): scraped from Divine Pride item HTML for every card unless
 * SKIP_DIVINE_PRIDE_FETCH=1 (then preserved from existing cards.json when re-importing).
 * SKIP_DIVINE_PRIDE_SETS=1 still fetches DP for affixes, but skips parsing set-bonus titles from HTML.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { parseDivinePrideAffixes } from "./parse-divine-pride-affixes.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "src", "data", "cards.json");
const SPAWN_MAPS_JSON = path.join(ROOT, "src", "data", "mob-spawn-maps.json");
const RATHENA_DIR = path.join(ROOT, "third_party", "rathena-pre-re");

const ITEM_URL =
  "https://raw.githubusercontent.com/rathena/rathena/master/db/pre-re/item_db_etc.yml";
const MOB_URL = "https://raw.githubusercontent.com/rathena/rathena/master/db/pre-re/mob_db.yml";

const RAGNAPI_ITEM = (id) =>
  `https://ragnapi.com/api/v1/old-times/items/${id}`;

const DIVINE_PRIDE_ITEM = (id, slug) =>
  `https://www.divine-pride.net/database/item/${id}/${slug}`;

/**
 * @param {string} s
 */
function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Parse Divine Pride "Set Bonus" blocks to get set titles + members.
 * Works for cases like:
 *   <font ...>Hunter Card Set</font><br />
 *   <font ...>Cruiser Card</font><br />...
 *
 * @param {string} html
 * @returns {Array<{ title: string; members: string[] }>}
 */
function parseDivinePrideSets(html) {
  const out = [];
  if (typeof html !== "string" || !html) return out;

  const norm = html.replace(/\r\n/g, "\n");
  const titleRe = /<font\s+color="#6A5ACD">\s*([^<]+?)\s*<\/font>\s*<br\s*\/?>/gi;
  let m;
  while ((m = titleRe.exec(norm))) {
    const title = String(m[1] || "").trim();
    if (!title) continue;
    const start = titleRe.lastIndex;
    const nextTitleIdx = norm.slice(start).search(titleRe);
    const end = nextTitleIdx >= 0 ? start + nextTitleIdx : norm.length;
    const chunk = norm.slice(start, end);
    const members = [];
    const memberRe = /<font\s+color="#3CB371">\s*([^<]+?)\s*<\/font>/gi;
    let mm;
    while ((mm = memberRe.exec(chunk))) {
      const n = String(mm[1] || "").trim();
      if (n) members.push(n);
    }
    if (members.length) out.push({ title, members });
  }

  // Dedupe by (title + members)
  const seen = new Set();
  return out.filter((s) => {
    const key = `${s.title}::${s.members.map((x) => x.toLowerCase()).join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

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

/** @returns {Record<string, unknown>} */
function loadSpawnMapsByMonster() {
  if (!fs.existsSync(SPAWN_MAPS_JSON)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(SPAWN_MAPS_JSON, "utf8"));
    if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw;
  } catch (e) {
    console.warn("import-cards: could not read mob-spawn-maps.json", (e && e.message) || e);
  }
  return {};
}

/**
 * @param {unknown} maps
 * @returns {Array<{ map: string; count: number }> | null}
 */
function normalizeSpawnMapsList(maps) {
  if (!Array.isArray(maps) || maps.length === 0) return null;
  /** @type {Array<{ map: string; count: number }>} */
  const out = [];
  for (const x of maps) {
    if (typeof x === "string") {
      out.push({ map: x, count: 0 });
      continue;
    }
    if (x && typeof x === "object" && typeof x.map === "string") {
      const count = typeof x.count === "number" && Number.isFinite(x.count) ? x.count : 0;
      out.push({ map: x.map, count });
    }
  }
  return out.length ? out.slice(0, 5) : null;
}

/**
 * @param {Array<{ monster: string; rate: number; isMvp: boolean; maps?: unknown }>} drops
 * @param {Record<string, unknown>} byMonster
 */
function attachSpawnMaps(drops, byMonster) {
  return drops.map((d) => {
    const maps = normalizeSpawnMapsList(byMonster[d.monster]);
    if (!maps) return d;
    return { ...d, maps };
  });
}

/**
 * One row per mob display name (rAthena may define several mob_db Body entries with the same Name).
 * Keeps the first row after sort (stable: lowest rate, then MVP flag).
 * @param {Array<Record<string, unknown>>} drops
 */
function dedupeDropsByMonsterName(drops) {
  if (!Array.isArray(drops)) return [];
  const seen = new Set();
  /** @type {Array<Record<string, unknown>>} */
  const res = [];
  for (const d of drops) {
    if (!d || typeof d !== "object") continue;
    if (typeof d.monster !== "string") continue;
    if (typeof d.rate !== "number") continue;
    if (seen.has(d.monster)) continue;
    seen.add(d.monster);
    res.push(d);
  }
  return res;
}

const ANT_WORKER_MOBS = new Set(["Andre", "Deniro", "Piere"]);

/**
 * rAthena pre-re uses Item Andre_Card for Andre, Deniro, and Piere. Present one combined drop line;
 * map list uses Andre spawns only.
 * @param {Array<Record<string, unknown>>} drops
 * @param {Record<string, unknown>} spawnMapsByMonster
 */
function collapseSharedAntAndreCardDrops(drops, spawnMapsByMonster) {
  if (!Array.isArray(drops) || drops.length === 0) return drops;

  const antOnly = drops.filter((d) => d && ANT_WORKER_MOBS.has(String(d.monster)));
  if (antOnly.length === 0) return drops;
  if (antOnly.length !== drops.length) return drops;

  const rate = antOnly[0].rate;
  const isMvp = Boolean(antOnly[0].isMvp);
  if (!antOnly.every((d) => d.rate === rate && Boolean(d.isMvp) === isMvp)) return drops;

  const maps = normalizeSpawnMapsList(spawnMapsByMonster["Andre"]);
  /** @type {Record<string, unknown>} */
  const row = {
    monster: "Andre/Piere/Deniro",
    rate,
    isMvp,
  };
  if (maps && maps.length) row.maps = maps;
  return [row];
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
  const spawnMapsByMonster = loadSpawnMapsByMonster();
  if (Object.keys(spawnMapsByMonster).length) {
    console.log(
      `import-cards: merging spawn maps for ${Object.keys(spawnMapsByMonster).length} monsters from mob-spawn-maps.json`,
    );
  }

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
    drops = dedupeDropsByMonsterName(drops);
    drops = attachSpawnMaps(drops, spawnMapsByMonster);
    if (aegisName === "Andre_Card") {
      drops = collapseSharedAntAndreCardDrops(drops, spawnMapsByMonster);
    }
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
            prefix: typeof row.prefix === "string" ? row.prefix : "",
            suffix: typeof row.suffix === "string" ? row.suffix : "",
            setBonuses: Array.isArray(row.setBonuses) ? row.setBonuses : undefined,
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
      if (!row.prefix && prev.prefix) row.prefix = prev.prefix;
      if (!row.suffix && prev.suffix) row.suffix = prev.suffix;
      if (!row.setBonuses?.length && prev.setBonuses?.length) row.setBonuses = prev.setBonuses;
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

  // Divine Pride: prefix/suffix (compound names) for every card; set titles only when description mentions set bonus.
  const skipDpFetch = process.env.SKIP_DIVINE_PRIDE_FETCH === "1";
  const skipDpSets = process.env.SKIP_DIVINE_PRIDE_SETS === "1";
  if (skipDpFetch) {
    console.warn(
      "import-cards: SKIP_DIVINE_PRIDE_FETCH=1 — no Divine Pride requests; affixes / set titles kept only from existing cards.json",
    );
    for (const row of out) {
      const prev = existingById.get(row.id);
      if (!prev) continue;
      if (!row.prefix && prev.prefix) row.prefix = prev.prefix;
      if (!row.suffix && prev.suffix) row.suffix = prev.suffix;
      if (!row.setBonuses?.length && prev.setBonuses?.length) row.setBonuses = prev.setBonuses;
    }
  } else {
    let okAff = 0;
    let okSets = 0;
    let fail = 0;
    const delayMs = Number(process.env.CARD_DESC_FETCH_DELAY_MS ?? 80);
    for (const row of out) {
      try {
        const slug = slugify(row.name);
        const res = await fetch(DIVINE_PRIDE_ITEM(row.id, slug), {
          headers: { "User-Agent": "ro-pre-renewal-skill-planner/import-cards" },
        });
        if (!res.ok) {
          fail++;
          continue;
        }
        const html = await res.text();
        const aff = parseDivinePrideAffixes(html);
        let anyAff = false;
        if (aff.prefix) {
          row.prefix = aff.prefix;
          anyAff = true;
        }
        if (aff.suffix) {
          row.suffix = aff.suffix;
          anyAff = true;
        }
        if (anyAff) okAff++;

        if (
          !skipDpSets &&
          typeof row.description === "string" &&
          row.description.toLowerCase().includes("set bonus")
        ) {
          const sets = parseDivinePrideSets(html);
          if (sets.length) {
            row.setBonuses = sets;
            okSets++;
          }
        }
      } catch {
        fail++;
      }
      if (delayMs > 0) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }
    console.log(
      `import-cards: Divine Pride — ${okAff} cards with prefix and/or suffix, ${okSets} with set titles, ${fail} fetch/parse failures`,
    );
  }

  if (!skipDpFetch && skipDpSets) {
    for (const row of out) {
      const prev = existingById.get(row.id);
      if (!row.setBonuses?.length && prev?.setBonuses?.length) row.setBonuses = prev.setBonuses;
    }
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

  // Targeted fix: some RagnaAPI descriptions omit rAthena script stats.
  for (const row of out) {
    if (row?.aegisName !== "Lady_Tanee_Card") continue;
    const want = ["Maximum HP -40%", "Maximum SP +50%"];
    const cur = typeof row.description === "string" ? row.description : "";
    const missing = want.filter((x) => !cur.includes(x));
    if (!missing.length) continue;
    row.description = `${missing.join("\n")}\n${cur}`.trim();
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
