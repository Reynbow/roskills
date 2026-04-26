/**
 * Fetches rAthena pre-renewal item_db_equip.yml and emits:
 * - src/data/weapons.json
 * - src/data/armour.json
 *
 * Local override: place file in third_party/rathena-pre-re/item_db_equip.yml
 * SKIP_RATHENA_FETCH=1 uses only that file; if missing, leaves outputs unchanged.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const RATHENA_DIR = path.join(ROOT, "third_party", "rathena-pre-re");

const EQUIP_URL =
  "https://raw.githubusercontent.com/rathena/rathena/master/db/pre-re/item_db_equip.yml";
const MOB_URL =
  "https://raw.githubusercontent.com/rathena/rathena/master/db/pre-re/mob_db.yml";

const OUT_WEAPONS = path.join(ROOT, "src", "data", "weapons.json");
const OUT_ARMOUR = path.join(ROOT, "src", "data", "armour.json");

function braceContents(str, openBraceIdx) {
  let depth = 0;
  for (let i = openBraceIdx; i < str.length; i++) {
    const c = str[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return [str.slice(openBraceIdx + 1, i), i + 1];
    }
  }
  return [null, -1];
}

function stripCaretColors(s) {
  return String(s || "").replace(/\^[0-9A-Fa-f]{6}/g, "");
}

function unescapeLuaString(s) {
  return String(s || "")
    .replace(/\\\\/g, "\\")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t");
}

function parseLuaStringList(inner) {
  const out = [];
  const re = /"((?:\\.|[^"\\])*)"/g;
  let m;
  while ((m = re.exec(inner))) out.push(unescapeLuaString(m[1]));
  return out;
}

function findItemInfoFile() {
  const candidates = [];

  // User-provided RO client data folder (recommended).
  // Should point at your extracted RO `data` folder.
  if (process.env.RO_CLIENT_DATA) {
    candidates.push(path.join(process.env.RO_CLIENT_DATA, "System", "itemInfo.lub"));
    candidates.push(path.join(process.env.RO_CLIENT_DATA, "System", "itemInfo_true.lub"));
    candidates.push(path.join(process.env.RO_CLIENT_DATA, "System", "itemInfo_true_EN.lub"));
  }

  // Optional repo-local drop-in paths.
  candidates.push(path.join(ROOT, "third_party", "ro-client", "System", "itemInfo.lub"));
  candidates.push(path.join(ROOT, "third_party", "ro-client", "System", "itemInfo_true.lub"));

  for (const p of candidates) {
    try {
      if (p && fs.existsSync(p)) return p;
    } catch {
      // ignore
    }
  }
  return null;
}

function loadItemDescriptionsById() {
  const file = findItemInfoFile();
  if (!file) return { byId: {}, source: null };

  const text = fs.readFileSync(file, "utf8");
  /** @type {Record<number, string>} */
  const byId = {};

  // Scans for `[123] = { ... }` and reads identifiedDescriptionName.
  const re = /\[\s*(\d+)\s*\]\s*=\s*\{/g;
  let m;
  while ((m = re.exec(text))) {
    const id = parseInt(m[1], 10);
    const openIdx = text.indexOf("{", m.index);
    if (openIdx === -1) continue;
    const [inner, nextIdx] = braceContents(text, openIdx);
    if (!inner || nextIdx === -1) continue;
    re.lastIndex = nextIdx;

    const kIdx = inner.indexOf("identifiedDescriptionName");
    if (kIdx === -1) continue;
    const eq = inner.indexOf("=", kIdx);
    if (eq === -1) continue;
    let j = eq + 1;
    while (j < inner.length && /\s/.test(inner[j])) j++;

    let desc = "";
    if (inner[j] === "{") {
      const [descInner] = braceContents(inner, j);
      if (descInner) desc = parseLuaStringList(descInner).join("\n");
    } else if (inner[j] === '"') {
      const one = inner.slice(j).match(/^"((?:\\.|[^"\\])*)"/);
      if (one) desc = unescapeLuaString(one[1]);
    }

    desc = stripCaretColors(desc).trim();
    if (desc) byId[id] = desc;
  }

  return { byId, source: file };
}

async function loadItemDescriptionsFromDivinePride(ids) {
  const apiKey = process.env.DIVINE_PRIDE_API_KEY || "";
  if (!apiKey) return { byId: {}, source: null };

  const isDupSectionLine = (line) => {
    const s = String(line || "").trim();
    if (!s) return true;
    // Hide tooltip stat lines we already render in our UI tiles.
    return (
      /^Class\s*:/i.test(s) ||
      /^(ATK|MATK)\s*:/i.test(s) ||
      /^Defense\s*:/i.test(s) ||
      /^Magic Defense\s*:/i.test(s) ||
      /^Location\s*:/i.test(s) ||
      /^Weight\s*:/i.test(s) ||
      /^Required Level\s*:/i.test(s) ||
      /^Jobs?\s*:/i.test(s) ||
      /^Weapon LV\s*:/i.test(s) ||
      /^Armor LV\s*:/i.test(s) ||
      /^Slots?\s*:/i.test(s)
    );
  };

  const normalizeDesc = (raw) => {
    const s = stripCaretColors(String(raw || "")).replaceAll("\r\n", "\n");
    const kept = [];
    for (const rawLine of s.split("\n")) {
      const l = String(rawLine || "").trim();
      if (!l) continue;
      if (isDupSectionLine(l)) break; // stop at the tooltip "stats" section
      kept.push(l);
    }
    // Remove all remaining line breaks and compress whitespace.
    return kept.join(" ").replace(/\s+/g, " ").trim();
  };

  const server = process.env.DIVINE_PRIDE_SERVER || "iROC";
  const obtainFallbackServer =
    process.env.DIVINE_PRIDE_OBTAIN_FALLBACK_SERVER || (server === "iROC" ? "iRO" : "");
  const cacheDir = path.join(ROOT, "scripts", ".cache");
  const cacheFile = path.join(cacheDir, `divine-pride-item-desc-${server}.json`);
  fs.mkdirSync(cacheDir, { recursive: true });

  /** @type {Record<string, any>} */
  let cache = {};
  try {
    if (fs.existsSync(cacheFile)) cache = JSON.parse(fs.readFileSync(cacheFile, "utf8"));
  } catch {
    cache = {};
  }

  /** @type {Record<number, { description: string, attack: number|null, defense: number|null, weight: number|null, slots: number|null, location: string|null, requiredLevel: number|null, soldBy: any[], containedIn: any[], obtainFrom?: string }>} */
  const itemById = {};
  const missing = [];
  for (const id of ids) {
    const k = String(id);
    const cached = cache[k];
    if (cached && typeof cached === "object") {
      const hasObtainFields = Array.isArray(cached.soldBy) && Array.isArray(cached.containedIn);
      itemById[id] = {
        description: typeof cached.description === "string" ? normalizeDesc(cached.description) : "",
        attack: typeof cached.attack === "number" ? cached.attack : null,
        defense: typeof cached.defense === "number" ? cached.defense : null,
        weight: typeof cached.weight === "number" ? cached.weight : null,
        slots: typeof cached.slots === "number" ? cached.slots : null,
        location: typeof cached.location === "string" ? cached.location : null,
        requiredLevel: typeof cached.requiredLevel === "number" ? cached.requiredLevel : null,
        soldBy: Array.isArray(cached.soldBy) ? cached.soldBy : [],
        containedIn: Array.isArray(cached.containedIn) ? cached.containedIn : [],
      };
      // Cache refresh: older cache versions stored only description/numbers.
      // Force a refetch so we can populate obtain sources.
      if (!hasObtainFields) missing.push(id);
    } else if (typeof cached === "string") {
      // Back-compat cache: older versions stored only description string.
      itemById[id] = {
        description: normalizeDesc(cached),
        attack: null,
        defense: null,
        weight: null,
        slots: null,
        location: null,
        requiredLevel: null,
        soldBy: [],
        containedIn: [],
      };
      missing.push(id);
    } else {
      missing.push(id);
    }
  }

  const concurrency = Math.max(
    1,
    Math.min(10, parseInt(process.env.DIVINE_PRIDE_CONCURRENCY || "6", 10) || 6),
  );

  let inFlight = 0;
  let idx = 0;
  await new Promise((resolve, reject) => {
    const next = () => {
      if (idx >= missing.length && inFlight === 0) return resolve();
      while (inFlight < concurrency && idx < missing.length) {
        const id = missing[idx++];
        inFlight++;
        const url = `https://www.divine-pride.net/api/database/Item/${id}?apiKey=${encodeURIComponent(
          apiKey,
        )}&server=${encodeURIComponent(server)}`;
        fetch(url, { headers: { "User-Agent": "ro-pre-renewal-skill-planner/import-equip" } })
          .then(async (res) => {
            if (!res.ok) return;
            const data = await res.json();
            const raw = typeof data?.description === "string" ? data.description : "";
            const cleaned = normalizeDesc(raw);
            const entry = {
              description: cleaned,
              attack: typeof data?.attack === "number" ? data.attack : null,
              defense: typeof data?.defense === "number" ? data.defense : null,
              weight: typeof data?.weight === "number" ? data.weight : null,
              slots: typeof data?.slots === "number" ? data.slots : null,
              location: typeof data?.location === "string" ? data.location : null,
              requiredLevel:
                typeof data?.requiredLevel === "number"
                  ? data.requiredLevel
                  : typeof data?.limitLevel === "number"
                    ? data.limitLevel
                    : null,
              soldBy: Array.isArray(data?.soldBy) ? data.soldBy : [],
              containedIn: Array.isArray(data?.itemSummonInfoContainedIn) ? data.itemSummonInfoContainedIn : [],
            };

            // Divine Pride iROC often has empty soldBy; optionally fall back to iRO to fill "NPC:" sources.
            if (
              obtainFallbackServer &&
              obtainFallbackServer !== server &&
              (!entry.soldBy?.length || entry.soldBy.length === 0) &&
              (!entry.containedIn?.length || entry.containedIn.length === 0)
            ) {
              try {
                const url2 = `https://www.divine-pride.net/api/database/Item/${id}?apiKey=${encodeURIComponent(
                  apiKey,
                )}&server=${encodeURIComponent(obtainFallbackServer)}`;
                const res2 = await fetch(url2, {
                  headers: { "User-Agent": "ro-pre-renewal-skill-planner/import-equip" },
                });
                if (res2.ok) {
                  const d2 = await res2.json();
                  const sold2 = Array.isArray(d2?.soldBy) ? d2.soldBy : [];
                  const cont2 = Array.isArray(d2?.itemSummonInfoContainedIn) ? d2.itemSummonInfoContainedIn : [];
                  if (sold2.length) entry.soldBy = sold2;
                  if (cont2.length) entry.containedIn = cont2;
                  if (sold2.length || cont2.length) entry.obtainFrom = obtainFallbackServer;
                }
              } catch {
                // ignore
              }
            }

            itemById[id] = entry;
            cache[String(id)] = entry;
          })
          .catch(() => {
            // ignore individual failures; still write what we got
          })
          .finally(() => {
            inFlight--;
            next();
          });
      }
    };
    try {
      next();
    } catch (e) {
      reject(e);
    }
  });

  try {
    fs.writeFileSync(cacheFile, `${JSON.stringify(cache)}\n`, "utf8");
  } catch {
    // ignore
  }

  return { itemById, source: `Divine Pride API (${server})` };
}

function getDescriptionSourceHint() {
  return [
    "To use online descriptions, set DIVINE_PRIDE_API_KEY (and optionally DIVINE_PRIDE_SERVER=iROC or iRO).",
    "Example (PowerShell):",
    '  $env:DIVINE_PRIDE_API_KEY="YOUR_KEY"; $env:DIVINE_PRIDE_SERVER="iROC"; npm run import-equip',
  ].join("\n");
}

/** @param {string} rel */
function localPath(rel) {
  return path.join(RATHENA_DIR, rel);
}

/** @param {string} rel @param {string} url */
async function loadYamlText(rel, url) {
  const p = localPath(rel);
  if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
  if (process.env.SKIP_RATHENA_FETCH === "1") {
    throw new Error(`Missing local ${p} (SKIP_RATHENA_FETCH=1)`);
  }
  const res = await fetch(url, {
    headers: { "User-Agent": "ro-pre-renewal-skill-planner/import-equip" },
  });
  if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
  return res.text();
}

/**
 * @param {unknown} body
 * @returns {Array<Record<string, unknown>>}
 */
function bodyArray(body) {
  return Array.isArray(body) ? body : [];
}

/** @param {unknown} s */
function str(s) {
  return typeof s === "string" ? s.trim() : "";
}

/** @param {unknown} n */
function num(n) {
  return typeof n === "number" && Number.isFinite(n) ? n : null;
}

/** @param {Record<string, unknown> | null | undefined} loc */
function formatLocations(loc) {
  if (!loc || typeof loc !== "object") return [];
  const out = [];
  for (const [k, v] of Object.entries(loc)) {
    if (v !== true) continue;
    out.push(
      k
        .replace(/_/g, " ")
        .trim()
        .replace(/\b\w/g, (c) => c.toUpperCase()),
    );
  }
  return out;
}

function buildIconUrl(id) {
  return typeof id === "number" && Number.isFinite(id)
    ? `https://static.divine-pride.net/images/items/item/${id}.png`
    : "";
}

function normalizeEquipLocationLabel(s) {
  const x = String(s || "").trim();
  if (!x) return "";
  if (x.toLowerCase() === "both accessory") return "Accessory";
  return x;
}

function formatDropRate(rate) {
  const r = typeof rate === "number" && Number.isFinite(rate) ? rate : null;
  if (r === null) return "";
  return `${(r / 100).toFixed(2)}%`;
}

async function loadMobDropsByItemAegis() {
  let text;
  try {
    text = await loadYamlText("mob_db.yml", MOB_URL);
  } catch {
    return {};
  }

  const doc = parseYaml(text);
  const rows = bodyArray(doc?.Body);

  /** @type {Record<string, Array<{ mob: string, rate: number }>>} */
  const dropsByAegis = {};
  for (const mob of rows) {
    if (!mob || typeof mob !== "object") continue;
    const name = str(mob.Name) || str(mob.AegisName);
    const drops = Array.isArray(mob.Drops) ? mob.Drops : [];
    if (!name || !drops.length) continue;

    for (const d of drops) {
      if (!d || typeof d !== "object") continue;
      const item = str(d.Item);
      const rate = typeof d.Rate === "number" ? d.Rate : null;
      if (!item || rate === null || !Number.isFinite(rate) || rate <= 0) continue;
      if (!dropsByAegis[item]) dropsByAegis[item] = [];
      dropsByAegis[item].push({ mob: name, rate });
    }
  }

  for (const k of Object.keys(dropsByAegis)) {
    dropsByAegis[k].sort((a, b) => b.rate - a.rate || a.mob.localeCompare(b.mob));
  }
  return dropsByAegis;
}

async function main() {
  let equipText;
  try {
    equipText = await loadYamlText("item_db_equip.yml", EQUIP_URL);
  } catch (e) {
    if (process.env.SKIP_RATHENA_FETCH === "1" && fs.existsSync(OUT_WEAPONS) && fs.existsSync(OUT_ARMOUR)) {
      console.warn("import-equip:", (e && e.message) || e);
      console.warn("import-equip: leaving outputs unchanged");
      process.exit(0);
    }
    throw e;
  }

  /** @type {{ Body?: unknown }} */
  const doc = parseYaml(equipText);
  const rows = bodyArray(doc?.Body);

  const ids = rows
    .map((it) => (it && typeof it === "object" ? it.Id : null))
    .filter((x) => typeof x === "number" && Number.isFinite(x));

  // Prefer an online canonical source when available.
  /** @type {Record<number, any>} */
  let dpItemById = {};
  let descSource = null;
  const dp = await loadItemDescriptionsFromDivinePride(ids);
  if (dp?.source) {
    dpItemById = dp.itemById || {};
    descSource = dp.source;
  } else {
    const local = loadItemDescriptionsById();
    dpItemById = {};
    descSource = local.source;

    // Keep local descriptions working when no DP key is set.
    // (Local source is only descriptions, no numeric fields.)
    if (local?.byId) {
      for (const [k, v] of Object.entries(local.byId)) {
        const id = Number(k);
        if (!Number.isFinite(id)) continue;
        dpItemById[id] = { description: v };
      }
    }
  }

  if (descSource) console.log(`Using item descriptions from: ${descSource}`);

  /** @type {any[]} */
  const weapons = [];
  /** @type {any[]} */
  const armour = [];

  /** @type {Record<string, number>} */
  const equipIdByAegis = {};
  for (const it of rows) {
    if (!it || typeof it !== "object") continue;
    const id = it.Id;
    const aegis = str(it.AegisName);
    if (typeof id !== "number" || !Number.isFinite(id) || !aegis) continue;
    equipIdByAegis[aegis] = id;
  }

  const mobDropsByAegis = await loadMobDropsByItemAegis();

  for (const it of rows) {
    if (!it || typeof it !== "object") continue;
    const id = it.Id;
    const name = str(it.Name);
    const aegis = str(it.AegisName);
    const type = str(it.Type);
    if (typeof id !== "number" || !Number.isFinite(id) || !name || !aegis || !type) continue;

    const rec = {
      id,
      aegisName: aegis,
      name,
      type,
      subType: str(it.SubType),
      description: "",
      obtain: /** @type {string[]} */ ([]),
      buy: num(it.Buy),
      jobsAll: false,
      jobs: [],
      slots: num(it.Slots) ?? 0,
      weight: num(it.Weight),
      refineable: it.Refineable === true,
      equipLevel: num(it.EquipLevelMin),
      locations: formatLocations(it.Locations && typeof it.Locations === "object" ? it.Locations : undefined),
      weaponLevel: num(it.WeaponLevel),
      armorLevel: num(it.ArmorLevel),
      attack: num(it.Attack),
      defense: num(it.Defense),
      magicDefense: num(it.MagicDefense),
      view: num(it.View),
      icon: buildIconUrl(id),
    };

    const jobsObj = it.Jobs && typeof it.Jobs === "object" ? it.Jobs : null;
    if (!jobsObj) {
      rec.jobsAll = true;
      rec.jobs = [];
    } else {
      const entries = Object.entries(jobsObj);
      const all = entries.some(([k, v]) => String(k).toLowerCase() === "all" && v === true);
      rec.jobsAll = all || entries.length === 0;
      rec.jobs = entries
        .filter(([k, v]) => v === true && String(k).toLowerCase() !== "all")
        .map(([k]) => String(k));
    }

    const dpIt = dpItemById[id];
    if (dpIt && typeof dpIt === "object") {
      if (typeof dpIt.description === "string") rec.description = dpIt.description;
      // Prefer Divine Pride values for fields duplicated in tooltip descriptions.
      if (typeof dpIt.attack === "number") rec.attack = dpIt.attack;
      if (typeof dpIt.defense === "number") rec.defense = dpIt.defense;
      if (typeof dpIt.weight === "number") rec.weight = dpIt.weight;
      if (typeof dpIt.slots === "number") rec.slots = dpIt.slots;
      if (typeof dpIt.requiredLevel === "number") rec.equipLevel = dpIt.requiredLevel;
      if (typeof dpIt.location === "string" && dpIt.location.trim())
        rec.locations = [normalizeEquipLocationLabel(dpIt.location)];

      // Obtain sources from Divine Pride when present
      if (Array.isArray(dpIt.soldBy) && dpIt.soldBy.length) {
        for (const s of dpIt.soldBy.slice(0, 5)) {
          if (s && typeof s === "object" && typeof s.name === "string") {
            const from = typeof dpIt.obtainFrom === "string" && dpIt.obtainFrom ? ` (${dpIt.obtainFrom})` : "";
            rec.obtain.push(`NPC: ${s.name}${from}`);
          }
        }
      }
    }

    // Monster drops from rAthena pre-re mob_db
    const drops = mobDropsByAegis[aegis] || [];
    if (drops.length) {
      const top = drops.slice(0, 5).map((d) => `Drop: ${d.mob} (${formatDropRate(d.rate)})`);
      rec.obtain.push(...top);
    }

    // If it has a Buy price and we don't have any explicit sources, mark as generic NPC shop.
    if (!rec.obtain.length && typeof rec.buy === "number" && rec.buy > 0) {
      rec.obtain.push(`NPC shop (Buy: ${rec.buy.toLocaleString()}z)`);
    }

    // De-dupe while keeping order.
    if (rec.obtain.length) {
      const seen = new Set();
      rec.obtain = rec.obtain.filter((x) => {
        const k = String(x || "").trim();
        if (!k) return false;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    } else rec.obtain = [];

    if (type.toLowerCase() === "weapon") weapons.push(rec);
    else armour.push(rec);
  }

  weapons.sort((a, b) => a.name.localeCompare(b.name));
  armour.sort((a, b) => a.name.localeCompare(b.name));

  fs.mkdirSync(path.dirname(OUT_WEAPONS), { recursive: true });
  fs.writeFileSync(OUT_WEAPONS, `${JSON.stringify(weapons, null, 2)}\n`, "utf8");
  fs.writeFileSync(OUT_ARMOUR, `${JSON.stringify(armour, null, 2)}\n`, "utf8");
  console.log(`Wrote ${OUT_WEAPONS} (${weapons.length} weapons)`);
  console.log(`Wrote ${OUT_ARMOUR} (${armour.length} armour items)`);

  if (!descSource) {
    console.warn("No item description source found.");
    console.warn(getDescriptionSourceHint());
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

