/**
 * Fetches rAthena pre-renewal pet_db.yml and emits src/data/pets.json.
 *
 * Data source: rAthena master db/pre-re/pet_db.yml + mob_db.yml + item_db_* (usable/equip/etc)
 * (pet_db references item AegisNames; we resolve those to display Names via item DB).
 *
 * Local override: place files in third_party/rathena-pre-re/{pet_db.yml,mob_db.yml,item_db_usable.yml,item_db_equip.yml,item_db_etc.yml}
 * SKIP_RATHENA_FETCH=1 uses only those files; if missing, leaves existing pets.json unchanged.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "src", "data", "pets.json");
const RATHENA_DIR = path.join(ROOT, "third_party", "rathena-pre-re");

const PET_URL = "https://raw.githubusercontent.com/rathena/rathena/master/db/pre-re/pet_db.yml";
const MOB_URL = "https://raw.githubusercontent.com/rathena/rathena/master/db/pre-re/mob_db.yml";
const ITEM_USABLE_URL =
  "https://raw.githubusercontent.com/rathena/rathena/master/db/pre-re/item_db_usable.yml";
const ITEM_EQUIP_URL =
  "https://raw.githubusercontent.com/rathena/rathena/master/db/pre-re/item_db_equip.yml";
const ITEM_ETC_URL =
  "https://raw.githubusercontent.com/rathena/rathena/master/db/pre-re/item_db_etc.yml";
const BARTERS_ROOT_URL = "https://raw.githubusercontent.com/rathena/rathena/master/npc/barters.yml";
const BARTERS_PET_GROOMER_URL =
  "https://raw.githubusercontent.com/rathena/rathena/master/npc/re/merchants/barters/Pet_Groomer.yml";

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
    headers: { "User-Agent": "ro-pre-renewal-skill-planner/import-pets" },
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

/**
 * @param {unknown} barterDoc
 * @returns {Record<string, Array<{ npc: string; map?: string; x?: number; y?: number; zeny?: number; requires: Array<{ item: string; amount: number }> }>>}
 */
/** @param {string} s */
function titleizeAegis(s) {
  return String(s || "")
    .replace(/^barter_/i, "")
    .replace(/_/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function indexBarters(barterDoc, itemByAegis) {
  const out = {};
  const rows = bodyArray(barterDoc?.Body);
  for (const shop of rows) {
    const npcRaw = typeof shop?.Name === "string" ? shop.Name : "";
    const npc = npcRaw ? titleizeAegis(npcRaw) : "";
    const map = typeof shop?.Map === "string" ? shop.Map : undefined;
    const x = typeof shop?.X === "number" ? shop.X : undefined;
    const y = typeof shop?.Y === "number" ? shop.Y : undefined;
    const items = Array.isArray(shop?.Items) ? shop.Items : [];
    for (const it of items) {
      const item = typeof it?.Item === "string" ? it.Item : "";
      if (!item) continue;
      const requires = [];
      if (Array.isArray(it?.RequiredItems)) {
        for (const r of it.RequiredItems) {
          const ri = typeof r?.Item === "string" ? r.Item : "";
          const amt = typeof r?.Amount === "number" ? r.Amount : 1;
          if (ri) {
            const resolved = itemFromAegis(ri, itemByAegis);
            requires.push({ item: resolved.name || ri, amount: amt });
          }
        }
      }
      const zeny = typeof it?.Zeny === "number" ? it.Zeny : undefined;
      const rec = { npc: npc || "Barter", map, x, y, zeny, requires };
      (out[item] ??= []).push(rec);
    }
  }
  return out;
}

/**
 * Best-effort: convert simple `bonus ...;` lines into readable stats.
 * Mirrors the approach used in import-cards.mjs (intentionally conservative).
 * @param {unknown} script
 * @returns {string[]}
 */
function scriptToLines(script) {
  if (typeof script !== "string") return [];
  const raw = script.trim();
  if (!raw) return [];

  // Strip leading conditional boilerplate often present in pet scripts.
  const body = raw
    .replace(/\r\n/g, "\n")
    .replace(/^\s*\.\@i\s*=.*?\n/gi, "")
    .replace(/^\s*if\s*\(.*?\)\s*\{\s*\n/gi, "")
    .replace(/\n\s*\}\s*$/g, "")
    .trim();

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
    ["bMatk", "MATK"],
    ["bDef", "DEF"],
    ["bMdef", "MDEF"],
    ["bHit", "HIT"],
    ["bFlee", "FLEE"],
    ["bFlee2", "Perfect Dodge"],
    ["bCritical", "CRIT"],
    ["bAspdRate", "ASPD"],
    ["bCastrate", "Cast time"],
    ["bHPrecovRate", "HP Recovery"],
    ["bSPrecovRate", "SP Recovery"],
    ["bCritAtkRate", "Critical damage"],
    ["bMaxSPRate", "Max SP"],
    ["bMatkRate", "MATK"],
    ["bAtkRate", "ATK"],
  ]);
  const percentKeys = new Set([
    "bMaxHPrate",
    "bMaxSPrate",
    "bAspdRate",
    "bCastrate",
    "bHPrecovRate",
    "bSPrecovRate",
    "bCritAtkRate",
    "bMaxSPRate",
    "bMatkRate",
    "bAtkRate",
  ]);

  /** @type {string[]} */
  const out = [];
  const re = /\bbonus\s+([A-Za-z0-9_]+)\s*,\s*([-+]?\d+)\s*;/g;
  let m;
  while ((m = re.exec(body))) {
    const key = m[1];
    const n = Number.parseInt(m[2], 10);
    if (!key || !Number.isFinite(n)) continue;
    const label = map.get(key);
    if (!label) continue;
    if (percentKeys.has(key)) {
      const sign = n >= 0 ? "+" : "";
      out.push(`${label} ${sign}${n}%`);
    } else {
      const sign = n >= 0 ? "+" : "";
      out.push(`${label} ${sign}${n}`);
    }
  }

  // Bonus2: simple structured effects commonly used in pet scripts.
  const bonus2Re = /\bbonus2\s+([A-Za-z0-9_]+)\s*,\s*([A-Za-z0-9_]+)\s*,\s*([-+]?\d+)\s*;/g;
  while ((m = bonus2Re.exec(body))) {
    const key = m[1];
    const a = m[2];
    const n = Number.parseInt(m[3], 10);
    if (!key || !a || !Number.isFinite(n)) continue;

    if (key === "bResEff" && /^Eff_/i.test(a)) {
      const eff = a.replace(/^Eff_/i, "").replace(/_/g, " ").toLowerCase();
      out.push(`Resist ${eff} ${n >= 0 ? "+" : ""}${n / 100}%`);
      continue;
    }
    if (key === "bSubEle" && /^Ele_/i.test(a)) {
      const ele = a.replace(/^Ele_/i, "").replace(/_/g, " ").toLowerCase();
      out.push(`${ele} damage taken ${n >= 0 ? "-" : "+"}${Math.abs(n)}%`);
      continue;
    }
    if (key === "bAddEle" && /^Ele_/i.test(a)) {
      const ele = a.replace(/^Ele_/i, "").replace(/_/g, " ").toLowerCase();
      out.push(`${ele} damage ${n >= 0 ? "+" : ""}${n}%`);
      continue;
    }
    if (key === "bSubRace" && /^RC_/i.test(a)) {
      const race = a.replace(/^RC_/i, "").replace(/_/g, " ").toLowerCase();
      out.push(`Damage taken from ${race} ${n >= 0 ? "-" : "+"}${Math.abs(n)}%`);
      continue;
    }
    if (key === "bAddRace" && /^RC_/i.test(a)) {
      const race = a.replace(/^RC_/i, "").replace(/_/g, " ").toLowerCase();
      out.push(`Damage vs ${race} ${n >= 0 ? "+" : ""}${n}%`);
      continue;
    }
    if (key === "bMagicAddRace" && /^RC_/i.test(a)) {
      const race = a.replace(/^RC_/i, "").replace(/_/g, " ").toLowerCase();
      out.push(`Magic damage vs ${race} ${n >= 0 ? "+" : ""}${n}%`);
      continue;
    }

    // Fallback: keep it readable but not “code”.
    out.push(`Special effect: ${key} (${a}, ${n})`);
  }

  // Bonus3: a few pet scripts use auto-spell when hit; render minimally.
  const bonus3AutoWhenHit =
    /\bbonus3\s+bAutoSpellWhenHit\s*,\s*\"([A-Za-z0-9_]+)\"\s*,\s*(\d+)\s*,\s*(\d+)\s*;/g;
  while ((m = bonus3AutoWhenHit.exec(body))) {
    const skid = m[1];
    const lv = Number.parseInt(m[2], 10);
    const chance = Number.parseInt(m[3], 10);
    if (!skid || !Number.isFinite(lv) || !Number.isFinite(chance)) continue;
    out.push(`Autocast when hit: ${skid} Lv ${lv} (chance ${chance})`);
  }

  // Keep script lines we can't safely parse but that are still informative.
  if (out.length === 0) {
    const cleaned = body
      .replace(/\s+/g, " ")
      .replace(/\s*;\s*/g, ";\n")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 6);
    // Make them “human-ish” by removing leading `bonusX` / punctuation where possible.
    const softened = cleaned.map((l) =>
      l
        .replace(/^\s*bonus[0-9]*\s+/i, "Special effect: ")
        .replace(/;$/, "")
        .replace(/\s+/g, " "),
    );
    return softened.length ? softened : [];
  }

  return out;
}

/**
 * @param {string} aegis
 * @param {Record<string, {id: number; name: string}>} byAegis
 * @returns {{ aegis: string; id: number | null; name: string; icon: string }}
 */
function itemFromAegis(aegis, byAegis) {
  const k = String(aegis || "").trim();
  if (!k) return { aegis: "", id: null, name: "", icon: "" };
  const hit = byAegis[k];
  const id = hit?.id ?? null;
  return {
    aegis: k,
    id,
    name: hit?.name ?? k,
    // Divine Pride item icons; if missing we'll still show the name.
    icon: id ? `https://static.divine-pride.net/images/items/item/${id}.png` : "",
  };
}

const ICON_SIZE_PLACEHOLDER_BYTES = 330; // DP "apple" placeholder is ~315 bytes
/** @type {Map<string, boolean>} */
const iconOkCache = new Map();

async function iconLooksReal(url) {
  if (!url) return false;
  const cached = iconOkCache.get(url);
  if (cached !== undefined) return cached;
  try {
    const res = await fetch(url, { method: "HEAD" });
    const len = Number(res.headers.get("content-length") || "0");
    const ok = res.ok && len > ICON_SIZE_PLACEHOLDER_BYTES;
    iconOkCache.set(url, ok);
    return ok;
  } catch {
    // best-effort: don't strip if HEAD isn't possible
    iconOkCache.set(url, true);
    return true;
  }
}

async function stripPlaceholderIcons(pets) {
  const jobs = [];
  const fields = ["tameItem", "eggItem", "accessoryItem", "foodItem"];
  for (const p of pets) {
    for (const f of fields) {
      const it = p?.[f];
      const url = typeof it?.icon === "string" ? it.icon : "";
      if (!url) continue;
      jobs.push(
        (async () => {
          const ok = await iconLooksReal(url);
          if (!ok) it.icon = "";
        })(),
      );
    }
  }
  await Promise.all(jobs);
}

function normalizeKey(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function splitBonusesCell(s) {
  const raw = String(s || "").trim();
  if (!raw || /^none$/i.test(raw)) return [];
  return raw
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => x.replace(/\s*\+\s*/g, " +").replace(/\s*-\s*/g, " -"));
}

/**
 * iRO Classic list overrides (from https://irowiki.org/classic/Pet_System).
 * Keys are monster display names.
 */
const IRO_CLASSIC_PETS = [
  { monster: "Alice", tame: "Soft Apron", food: "White Potion", accessory: "None", bonuses: "MDEF+1, Demi Human Resistance +1%" },
  { monster: "Baby Desert Wolf", tame: "Well-Dried Bone", food: "Pet Food", accessory: "Transparent Head Protector", bonuses: "INT +1, SP +20" },
  { monster: "Baphomet Jr.", tame: "Book of the Devil", food: "Honey", accessory: "Skull Helm", bonuses: "DEF/MDEF+1, Stun Resistance -1%" },
  { monster: "Bongun", tame: "Her Heart", food: "Pet Food", accessory: "Grave Keeper's Sword", bonuses: "VIT+1, Stun Resistance +1%" },
  { monster: "Chonchon", tame: "Rotten Fish", food: "Pet Food", accessory: "Monster Oxygen Mask", bonuses: "AGI+1, FLEE +2" },
  { monster: "Deviruchi", tame: "Contract in Shadow", food: "Shoot", accessory: "Pacifier", bonuses: "ATK/MATK +1%, HP/SP -3%" },
  { monster: "Dokebi", tame: "Old Broom", food: "Pet Food", accessory: "Wig", bonuses: "MATK +1%, ATK -1%" },
  { monster: "Drops", tame: "Orange Juice", food: "Yellow Herb", accessory: "Backpack", bonuses: "HIT +3, ATK +3" },
  /** rAthena mob name is "Petite"; match by Aegis so this pet is not dropped from the iRO Classic list. */
  { monster: "Earth Petite (Green)", mobAegis: "PETIT", tame: "Shining Stone", food: "Pet Food", accessory: "Stellar Hairpin", bonuses: "DEF/MDEF -2, ASPD +1%" },
  { monster: "Green Maiden", tame: "Tantan Noodles", food: "Bun", accessory: "None", bonuses: "DEF +1, Demi Human Resistance +1%" },
  /** Mob display name in db is "Rice Cake". */
  { monster: "Hot Rice Cake", mobAegis: "EVENT_RICECAKE", tame: "Chewy Rice Powder", food: "Green Herb", accessory: "None", bonuses: "Neutral Element Resistance +1%, HP -1%" },
  { monster: "Hunter Fly", tame: "Monster Juice", food: "Red Gemstone", accessory: "Monster Oxygen Mask", bonuses: "FLEE -5, Perfect Dodge +2" },
  /** Mob display name in db is "Fire Imp". */
  { monster: "Imp", mobAegis: "IMP", tame: "Ice Fireworks", food: "Flame Gemstone", accessory: "Horn Barrier", bonuses: "Fire Element Resistance + 2%, Damage to Fire Element monster + 1 %" },
  { monster: "Isis", tame: "Armlet of Obedience", food: "Pet Food", accessory: "Queen's Hair Ornament", bonuses: "MATK -1%, ATK +1%" },
  { monster: "Lunatic", tame: "Rainbow Carrot", food: "Carrot Juice", accessory: "Silk Ribbon", bonuses: "CRIT +2, ATK +2" },
  { monster: "Munak", tame: "No Recipient", food: "Pet Food", accessory: "Punisher", bonuses: "INT +1, DEF +1" },
  { monster: "New Year Doll", tame: "Event Quest", food: "Mojji", accessory: "None", bonuses: "None" },
  { monster: "Orc Warrior", tame: "Orc Trophy", food: "Pet Food", accessory: "Wild Flower", bonuses: "ATK +10, DEF -3" },
  { monster: "Peco Peco", tame: "Fat Chubby Earthworm", food: "Pet Food", accessory: "Battered Pot", bonuses: "HP +150, SP -10" },
  { monster: "Picky", tame: "Earthworm the Dude", food: "Red Herb", accessory: "Tiny Egg Shell", bonuses: "STR+1, ATK +5" },
  { monster: "Poison Spore", tame: "Deadly Noxious Herb", food: "Pet Food", accessory: "Bark Shorts", bonuses: "STR +1, INT +1" },
  { monster: "Poporing", tame: "Bitter Herb", food: "Green Herb", accessory: "Backpack", bonuses: "LUK +2, Poison Element Resistance +10%" },
  { monster: "Poring", tame: "Unripe Apple", food: "Apple Juice", accessory: "Backpack", bonuses: "LUK +2, CRIT +1" },
  { monster: "Rocker", tame: "Singing Flower", food: "Pet Food", accessory: "Rocker Glasses", bonuses: "HP Recovery +5%, HP +25" },
  /** Mob display name in db is "Christmas Goblin". */
  { monster: "Santa Goblin", mobAegis: "GOBLINE_XMAS", tame: "Sweet Candy Cane", food: "Scell", accessory: "None", bonuses: "HP +30, Water Element Resistance +1%" },
  /** Mob display name in db is "Savage Babe". */
  { monster: "Savage Bebe", mobAegis: "SAVAGE_BABE", tame: "Sweet Milk", food: "Pet Food", accessory: "Green Lace", bonuses: "VIT +1, HP +50" },
  { monster: "Smokie", tame: "Sweet Potato", food: "Pet Food", accessory: "Red Scarf", bonuses: "AGI +1, Perfect Dodge +1" },
  { monster: "Sohee", tame: "Silver Knife of Chastity", food: "Pet Food", accessory: "Golden Bell", bonuses: "STR +1, DEX +1" },
  { monster: "Spore", tame: "Dew Laden Moss", food: "Pet Food", accessory: "Bark Shorts", bonuses: "HIT +5, ATK -2" },
  { monster: "Steel Chonchon", tame: "Rusty Iron", food: "Iron Ore", accessory: "Monster Oxygen Mask", bonuses: "FLEE +6, AGI -1" },
  { monster: "Succubus", tame: "Boy's Pure Heart", food: "Vital Flower", accessory: "Black Butterfly Mask", bonuses: "2% chance to drain HP equivalent to attack" },
  { monster: "Wanderer", tame: "Vagabond's Skull", food: "Spirit Liquor", accessory: "None", bonuses: "None" },
  { monster: "Yoyo", tame: "Tropical Banana", food: "Banana Juice", accessory: "Monkey Circlet", bonuses: "CRIT +3, LUK -1" },
  { monster: "Zealotus", tame: "Forbidden Red Candle", food: "Immortal Heart", accessory: "None", bonuses: "ATK +2%,MATK damage to Demi Human +2%" },
];

function buildItemByName(items) {
  /** @type {Record<string, { id: number; aegis: string; name: string }>} */
  const out = {};
  for (const it of items) {
    const id = it?.Id;
    const a = it?.AegisName;
    const n = it?.Name;
    if (typeof id !== "number" || typeof a !== "string" || typeof n !== "string") continue;
    out[normalizeKey(n)] = { id, aegis: a, name: n.trim() };
  }
  return out;
}

function itemFromName(name, itemByName) {
  const n = String(name || "").trim();
  if (!n || /^none$/i.test(n)) return { aegis: "", id: null, name: "", icon: "" };
  const hit = itemByName[normalizeKey(n)];
  if (!hit) return { aegis: "", id: null, name: n, icon: "" };
  return {
    aegis: hit.aegis,
    id: hit.id,
    name: hit.name,
    icon: `https://static.divine-pride.net/images/items/item/${hit.id}.png`,
  };
}

function applyIroClassicOverrides(pets, items) {
  const itemByName = buildItemByName(items);
  const allowByMonsterName = new Set(IRO_CLASSIC_PETS.map((r) => normalizeKey(r.monster)));
  const byMonster = new Map(IRO_CLASSIC_PETS.map((r) => [normalizeKey(r.monster), r]));
  /** @type {Map<string, object>} */
  const byMobAegis = new Map();
  for (const r of IRO_CLASSIC_PETS) {
    const a = typeof r.mobAegis === "string" ? r.mobAegis.trim().toUpperCase() : "";
    if (a) byMobAegis.set(a, r);
  }

  const filtered = pets.filter((p) => {
    if (allowByMonsterName.has(normalizeKey(p.name))) return true;
    const aegis = typeof p.mobAegis === "string" ? p.mobAegis.trim().toUpperCase() : "";
    return aegis ? byMobAegis.has(aegis) : false;
  });
  for (const p of filtered) {
    const aegis = typeof p.mobAegis === "string" ? p.mobAegis.trim().toUpperCase() : "";
    const row = byMonster.get(normalizeKey(p.name)) ?? (aegis ? byMobAegis.get(aegis) : undefined);
    if (!row) continue;
    p.name = row.monster;
    p.tameItem = itemFromName(row.tame, itemByName);
    p.foodItem = itemFromName(row.food, itemByName);
    p.accessoryItem = itemFromName(row.accessory, itemByName);
    p.bonuses = splitBonusesCell(row.bonuses);
    p.supportBonuses = [];
  }
  filtered.sort((a, b) => String(a.name).localeCompare(String(b.name)));
  return filtered;
}

async function main() {
  let petText;
  let mobText;
  let itemEtcText;
  let itemUsableText;
  let itemEquipText;
  let bartersPetText;
  try {
    petText = await loadYamlText("pet_db.yml", PET_URL);
    mobText = await loadYamlText("mob_db.yml", MOB_URL);
    itemUsableText = await loadYamlText("item_db_usable.yml", ITEM_USABLE_URL);
    itemEquipText = await loadYamlText("item_db_equip.yml", ITEM_EQUIP_URL);
    itemEtcText = await loadYamlText("item_db_etc.yml", ITEM_ETC_URL);
    // Best-effort: NPC barter sources for taming items (not strictly pre-re, but useful when present)
    bartersPetText = await loadYamlText("npc-re-pet-groomer-barters.yml", BARTERS_PET_GROOMER_URL);
  } catch (e) {
    if (process.env.SKIP_RATHENA_FETCH === "1" && fs.existsSync(OUT)) {
      console.warn("import-pets:", (e && e.message) || e);
      console.warn("import-pets: leaving", OUT, "unchanged");
      process.exit(0);
    }
    throw e;
  }

  const petDoc = parseYaml(petText);
  const mobDoc = parseYaml(mobText);
  const itemEtcDoc = parseYaml(itemEtcText);
  const itemUsableDoc = parseYaml(itemUsableText);
  const itemEquipDoc = parseYaml(itemEquipText);
  const bartersPetDoc = parseYaml(bartersPetText);

  const pets = bodyArray(petDoc?.Body);
  const mobs = bodyArray(mobDoc?.Body);
  const items = [
    ...bodyArray(itemUsableDoc?.Body),
    ...bodyArray(itemEquipDoc?.Body),
    ...bodyArray(itemEtcDoc?.Body),
  ];

  /** @type {Record<string, { id: number; name: string }>} */
  const itemByAegis = {};
  for (const it of items) {
    const id = it?.Id;
    const a = it?.AegisName;
    const n = it?.Name;
    if (typeof id !== "number" || typeof a !== "string" || typeof n !== "string") continue;
    itemByAegis[a] = { id, name: n.trim() };
  }

  const barterByItemAegis = indexBarters(bartersPetDoc, itemByAegis);

  /** @type {Record<string, { name: string; id: number; level: number }>} */
  const mobByAegis = {};
  for (const m of mobs) {
    const a = m?.AegisName;
    const n = m?.Name;
    const id = m?.Id;
    const level = m?.Level;
    if (typeof a !== "string" || typeof n !== "string" || typeof id !== "number") continue;
    mobByAegis[a] = { name: n.trim(), id, level: typeof level === "number" ? level : 1 };
  }

  /**
   * Build item AegisName -> droppers list (top by rate).
   * @type {Record<string, Array<{ monster: string; level: number; rate: number }>>}
   */
  const droppersByItemAegis = {};
  for (const m of mobs) {
    const mobName = typeof m?.Name === "string" ? m.Name.trim() : "";
    const mobLevel = typeof m?.Level === "number" ? m.Level : 1;
    if (!mobName) continue;

    /** @param {unknown} drops */
    const scan = (drops) => {
      if (!Array.isArray(drops)) return;
      for (const d of drops) {
        if (!d || typeof d !== "object") continue;
        const item = d.Item;
        const rate = d.Rate;
        if (typeof item !== "string" || typeof rate !== "number") continue;
        const list = (droppersByItemAegis[item] ??= []);
        list.push({ monster: mobName, level: mobLevel, rate });
      }
    };
    scan(m?.Drops);
    scan(m?.MvpDrops);
  }
  for (const k of Object.keys(droppersByItemAegis)) {
    const list = droppersByItemAegis[k];
    list.sort((a, b) => b.rate - a.rate || a.monster.localeCompare(b.monster));
    // Dedupe by monster (some mobs can list same item more than once)
    const seen = new Set();
    droppersByItemAegis[k] = list.filter((x) => {
      if (seen.has(x.monster)) return false;
      seen.add(x.monster);
      return true;
    });
  }

  /** @type {Array<Record<string, unknown>>} */
  const out = [];
  for (const p of pets) {
    const mobAegis = p?.Mob;
    if (typeof mobAegis !== "string" || !mobAegis.trim()) continue;
    const mob = mobByAegis[mobAegis.trim()];
    const name = mob?.name || mobAegis.trim();

    const tame = typeof p?.TameItem === "string" ? p.TameItem : "";
    const egg = typeof p?.EggItem === "string" ? p.EggItem : "";
    const equip = typeof p?.EquipItem === "string" ? p.EquipItem : "";
    const food = typeof p?.FoodItem === "string" ? p.FoodItem : "";
    const hungryDelay = typeof p?.HungryDelay === "number" ? p.HungryDelay : 60;

    const scriptLines = scriptToLines(p?.Script);
    const supportLines = scriptToLines(p?.SupportScript);

    out.push({
      mobAegis: mobAegis.trim(),
      mobId: mob?.id ?? null,
      mobLevel: mob?.level ?? 1,
      name,
      tameItem: itemFromAegis(tame, itemByAegis),
      tameItemSources: tame ? (droppersByItemAegis[tame] ?? []).slice(0, 6) : [],
      tameItemNpcSources: tame ? (barterByItemAegis[tame] ?? []) : [],
      eggItem: itemFromAegis(egg, itemByAegis),
      accessoryItem: itemFromAegis(equip, itemByAegis),
      foodItem: itemFromAegis(food, itemByAegis),
      captureRate: typeof p?.CaptureRate === "number" ? p.CaptureRate : null,
      fullness: typeof p?.Fullness === "number" ? p.Fullness : null,
      hungryDelaySeconds: hungryDelay,
      intimacyFed: typeof p?.IntimacyFed === "number" ? p.IntimacyFed : null,
      bonuses: scriptLines,
      supportBonuses: supportLines,
    });
  }

  let final = out;
  // Constrain to iRO Classic list + override conflicting fields.
  final = applyIroClassicOverrides(final, items);

  // Strip Divine Pride "apple placeholder" icons so we don't show incorrect images.
  await stripPlaceholderIcons(final);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(final, null, 2)}\n`, "utf8");
  console.log(`Wrote ${OUT} (${final.length} pets)`); // eslint-disable-line no-console
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

