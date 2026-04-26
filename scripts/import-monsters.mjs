/**
 * Fetches rAthena pre-renewal mob_db.yml and emits src/data/monsters.json
 *
 * Local override: third_party/rathena-pre-re/mob_db.yml (SKIP_RATHENA_FETCH=1 requires local file)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "src", "data", "monsters.json");
const RATHENA_DIR = path.join(ROOT, "third_party", "rathena-pre-re");
const MOB_URL = "https://raw.githubusercontent.com/rathena/rathena/master/db/pre-re/mob_db.yml";
const ITEM_EQUIP_URL = "https://raw.githubusercontent.com/rathena/rathena/master/db/pre-re/item_db_equip.yml";
const ITEM_ETC_URL = "https://raw.githubusercontent.com/rathena/rathena/master/db/pre-re/item_db_etc.yml";
const ITEM_USABLE_URL = "https://raw.githubusercontent.com/rathena/rathena/master/db/pre-re/item_db_usable.yml";
const ITEM_DB_URL = "https://raw.githubusercontent.com/rathena/rathena/master/db/pre-re/item_db.yml";
const SPAWN_MAPS_PATH = path.join(ROOT, "src", "data", "mob-spawn-maps.json");

/** @param {string} rel @param {string} url */
async function loadYamlText(rel, url) {
  const p = path.join(RATHENA_DIR, rel);
  if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
  if (process.env.SKIP_RATHENA_FETCH === "1") throw new Error(`Missing local ${p} (SKIP_RATHENA_FETCH=1)`);
  const res = await fetch(url, { headers: { "User-Agent": "ro-pre-renewal-skill-planner/import-monsters" } });
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

function toInt(x) {
  return typeof x === "number" && Number.isFinite(x) ? Math.trunc(x) : null;
}

function toStr(x) {
  const s = typeof x === "string" ? x.trim() : "";
  return s || null;
}

function isMvpMob(m) {
  return (
    (Array.isArray(m?.MvpDrops) && m.MvpDrops.length > 0) ||
    (typeof m?.MvpExp === "number" && m.MvpExp > 0) ||
    (typeof m?.Mvp1id === "number" && m.Mvp1id > 0)
  );
}

function mobSpriteUrl(id) {
  if (!id) return "";
  // Keep consistent with pets.ts
  return `https://static.divine-pride.net/images/mobs/png/${id}.png`;
}

/**
 * @param {unknown} doc
 * @returns {Map<string, { id: number; aegis: string; name: string }>}
 */
function buildItemIndex(doc) {
  const out = new Map();
  const rows = bodyArray(doc?.Body);
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const id = toInt(r.Id);
    const aegis = toStr(r.AegisName);
    const name = toStr(r.Name);
    if (!id || !aegis || !name) continue;
    if (!out.has(aegis)) out.set(aegis, { id, aegis, name });
  }
  return out;
}

/**
 * @param {unknown} drops
 * @param {boolean} isMvpDrop
 * @param {Map<string, { id: number; aegis: string; name: string }>} items
 * @returns {Array<{ aegis: string; id: number | null; name: string | null; rate: number; isMvp: boolean }>}
 */
function parseDrops(drops, isMvpDrop, items) {
  if (!Array.isArray(drops)) return [];
  const out = [];
  for (const d of drops) {
    if (!d || typeof d !== "object") continue;
    const aegis = toStr(d.Item);
    const rate = toInt(d.Rate);
    if (!aegis || typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0) continue;
    const it = items.get(aegis);
    const pretty = aegis.replaceAll("_", " ").trim();
    out.push({ aegis, id: it?.id ?? null, name: it?.name ?? pretty, rate, isMvp: isMvpDrop });
  }
  out.sort((a, b) => b.rate - a.rate || a.aegis.localeCompare(b.aegis));
  return out;
}

function normalizeKey(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function pickBestVariant(rows) {
  // Prefer the “base” mob entry over event/guardian/duplicate variants that share the same display name.
  // This keeps the Monsters page readable (one entry per display name).
  const penalizePrefixes = ["G_", "EVENT_", "R_", "E_", "M_", "A_", "B_"];
  const score = (r) => {
    const a = String(r.aegisName || "");
    let s = 0;
    for (const p of penalizePrefixes) if (a.startsWith(p)) s -= 5;
    if (/_\d+$/.test(a)) s -= 1; // suffix variants like *_1, *_2
    if (r.isMvp) s += 1;
    // Prefer entries with real stats filled in.
    if (typeof r.hp === "number") s += 1;
    if (typeof r.attackMin === "number" || typeof r.attackMax === "number") s += 1;
    return s;
  };
  let best = rows[0];
  let bestScore = score(best);
  for (const r of rows.slice(1)) {
    const sc = score(r);
    if (sc > bestScore) {
      best = r;
      bestScore = sc;
    }
  }
  return best;
}

function mergeMaps(rows) {
  const byMap = new Map();
  for (const r of rows) {
    const maps = Array.isArray(r.maps) ? r.maps : [];
    for (const m of maps) {
      const map = typeof m?.map === "string" ? m.map : "";
      const count = typeof m?.count === "number" ? m.count : 0;
      if (!map || !Number.isFinite(count) || count <= 0) continue;
      byMap.set(map, (byMap.get(map) ?? 0) + count);
    }
  }
  return [...byMap.entries()]
    .map(([map, count]) => ({ map, count }))
    .sort((a, b) => b.count - a.count || a.map.localeCompare(b.map));
}

async function main() {
  const mobText = await loadYamlText("mob_db.yml", MOB_URL);
  const mobDoc = parseYaml(mobText);
  const mobs = bodyArray(mobDoc?.Body);

  const equipText = await loadYamlText("item_db_equip.yml", ITEM_EQUIP_URL);
  const etcText = await loadYamlText("item_db_etc.yml", ITEM_ETC_URL);
  const usableText = await loadYamlText("item_db_usable.yml", ITEM_USABLE_URL);
  const itemDbText = await loadYamlText("item_db.yml", ITEM_DB_URL);
  const itemsEquip = buildItemIndex(parseYaml(equipText));
  const itemsEtc = buildItemIndex(parseYaml(etcText));
  const itemsUsable = buildItemIndex(parseYaml(usableText));
  const itemsDb = buildItemIndex(parseYaml(itemDbText));
  const items = new Map([...itemsDb.entries(), ...itemsUsable.entries(), ...itemsEtc.entries(), ...itemsEquip.entries()]);

  /** @type {Record<string, Array<{ map: string; count: number }>>} */
  const spawnByMonsterName = fs.existsSync(SPAWN_MAPS_PATH)
    ? JSON.parse(fs.readFileSync(SPAWN_MAPS_PATH, "utf8"))
    : {};

  const raw = [];
  for (const m of mobs) {
    if (!m || typeof m !== "object") continue;
    const id = toInt(m.Id);
    const aegisName = toStr(m.AegisName);
    const name = toStr(m.Name);
    if (!id || !aegisName || !name) continue;

    const maps = Array.isArray(spawnByMonsterName[name]) ? spawnByMonsterName[name] : [];
    const drops = [
      ...parseDrops(m.Drops, false, items),
      ...parseDrops(m.MvpDrops, true, items),
    ].sort((a, b) => Number(b.isMvp) - Number(a.isMvp) || b.rate - a.rate || a.aegis.localeCompare(b.aegis));

    raw.push({
      id,
      aegisName,
      name,
      level: toInt(m.Level) ?? 1,
      hp: toInt(m.Hp),
      sp: toInt(m.Sp),
      baseExp: toInt(m.BaseExp),
      jobExp: toInt(m.JobExp),
      attackMin: toInt(m.Attack),
      attackMax: toInt(m.Attack2),
      defense: toInt(m.Defense),
      magicDefense: toInt(m.MagicDefense),
      race: toStr(m.Race),
      size: toStr(m.Size),
      element: toStr(m.Element),
      elementLevel: toInt(m.ElementLevel),
      atkRange: toInt(m.AttackRange),
      hit: toInt(m.Hit),
      flee: toInt(m.Flee),
      isMvp: isMvpMob(m),
      sprite: mobSpriteUrl(id),
      maps,
      drops: drops.slice(0, 12),
    });
  }

  /** @type {Map<string, any[]>} */
  const byName = new Map();
  for (const r of raw) {
    const k = normalizeKey(r.name);
    if (!k) continue;
    const arr = byName.get(k);
    if (arr) arr.push(r);
    else byName.set(k, [r]);
  }

  const out = [];
  for (const rows of byName.values()) {
    const best = pickBestVariant(rows);
    out.push({ ...best, maps: mergeMaps(rows) });
  }

  out.sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(out, null, 2)}\n`, "utf8");
  console.log(`Wrote ${OUT} (${out.length} monsters)`); // eslint-disable-line no-console
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

