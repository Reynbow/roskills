/**
 * Aggregates rAthena pre-renewal field/dungeon spawn scripts into top map names per monster.
 * Reads npc/pre-re/mobs (all .txt spawn scripts) from the rAthena repo (GitHub tree + raw) and db/pre-re/mob_db.yml
 * for Id → Name. Writes src/data/mob-spawn-maps.json as { [monsterName]: { map, count }[] } (top 5 maps by summed spawn amount).
 *
 * Local mob_db: third_party/rathena-pre-re/mob_db.yml
 * SKIP_RATHENA_FETCH=1 requires local mob_db; spawn files are always fetched from GitHub.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "src", "data", "mob-spawn-maps.json");
const RATHENA_DIR = path.join(ROOT, "third_party", "rathena-pre-re");
const MOB_URL = "https://raw.githubusercontent.com/rathena/rathena/master/db/pre-re/mob_db.yml";
const TREE_URL = "https://api.github.com/repos/rathena/rathena/git/trees/master?recursive=1";
const RAW_PREFIX = "https://raw.githubusercontent.com/rathena/rathena/master/";

/** @param {string} rel @param {string} url */
async function loadMobYaml(rel, url) {
  const p = path.join(RATHENA_DIR, rel);
  if (fs.existsSync(p)) return fs.readFileSync(p, "utf8");
  if (process.env.SKIP_RATHENA_FETCH === "1") {
    throw new Error(`Missing local ${p} (SKIP_RATHENA_FETCH=1)`);
  }
  const res = await fetch(url, {
    headers: { "User-Agent": "ro-pre-renewal-skill-planner/build-mob-spawn-maps" },
  });
  if (!res.ok) throw new Error(`${rel}: HTTP ${res.status}`);
  return res.text();
}

/**
 * map,x,y[,...] tab monster tab Name tab id,amount[,...]
 * @param {string} line
 * @returns {{ mapName: string; mobId: number; amount: number } | null}
 */
function parseMonsterSpawnLine(line) {
  const t = line.trim();
  if (!t || t.startsWith("//")) return null;
  const m = t.match(/^([^\t]+)\t(monster|bossmonster)\t(.+)\t(\d+),(\d+)/i);
  if (!m) return null;
  const mapName = String(m[1] || "").split(",")[0]?.trim();
  if (!mapName) return null;
  const mobId = Number(m[4], 10);
  const amount = Number(m[5], 10);
  if (!Number.isFinite(mobId) || !Number.isFinite(amount) || amount < 1) return null;
  return { mapName, mobId, amount };
}

/**
 * @param {unknown} body
 * @returns {Array<Record<string, unknown>>}
 */
function bodyArray(body) {
  return Array.isArray(body) ? body : [];
}

async function main() {
  const mobText = await loadMobYaml("mob_db.yml", MOB_URL);
  const mobDoc = parseYaml(mobText);
  const mobs = bodyArray(mobDoc.Body);

  /** @type {Map<number, string>} */
  const idToName = new Map();
  for (const mob of mobs) {
    if (!mob || typeof mob !== "object") continue;
    const id = mob.Id;
    const name = mob.Name;
    if (typeof id !== "number" || typeof name !== "string" || !name.trim()) continue;
    idToName.set(id, name);
  }

  const treeRes = await fetch(TREE_URL, {
    headers: { "User-Agent": "ro-pre-renewal-skill-planner/build-mob-spawn-maps" },
  });
  if (!treeRes.ok) throw new Error(`GitHub tree: HTTP ${treeRes.status}`);
  /** @type {{ tree?: Array<{ path?: string; type?: string }> }} */
  const treeJson = await treeRes.json();
  const paths = (treeJson.tree ?? [])
    .filter((e) => typeof e.path === "string" && e.type === "blob")
    .map((e) => /** @type {string} */ (e.path))
    .filter((p) => p.startsWith("npc/pre-re/mobs/") && p.endsWith(".txt"));

  /** @type {Map<number, Map<string, number>>} */
  const byMob = new Map();

  for (const p of paths) {
    const url = RAW_PREFIX + p;
    const res = await fetch(url, {
      headers: { "User-Agent": "ro-pre-renewal-skill-planner/build-mob-spawn-maps" },
    });
    if (!res.ok) {
      console.warn("build-mob-spawn-maps: skip", p, res.status);
      continue;
    }
    const text = await res.text();
    for (const line of text.split(/\r?\n/)) {
      const parsed = parseMonsterSpawnLine(line);
      if (!parsed) continue;
      let mapCounts = byMob.get(parsed.mobId);
      if (!mapCounts) {
        mapCounts = new Map();
        byMob.set(parsed.mobId, mapCounts);
      }
      const prev = mapCounts.get(parsed.mapName) ?? 0;
      mapCounts.set(parsed.mapName, prev + parsed.amount);
    }
  }

  /** @type {Record<string, Array<{ map: string; count: number }>>} */
  const byMonsterName = {};

  for (const [mobId, mapCounts] of byMob) {
    const monsterName = idToName.get(mobId);
    if (!monsterName) continue;
    const ranked = [...mapCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 5)
      .map(([mapName, count]) => ({ map: mapName, count }));
    if (ranked.length) byMonsterName[monsterName] = ranked;
  }

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(byMonsterName, null, 2)}\n`, "utf8");
  console.log(
    `Wrote ${OUT} (${Object.keys(byMonsterName).length} monsters with spawn data, ${paths.length} spawn files)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
