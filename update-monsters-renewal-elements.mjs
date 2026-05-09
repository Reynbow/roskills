/**
 * Patch `src/data/monsters-renewal.json` element/race/size fields from rAthena Renewal mob_db.yml.
 *
 * Why: Divine Pride's element encoding differs, and some entries were imported with incorrect
 * element/level. rAthena is the canonical Renewal reference for mob element/race/size.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as yaml from "yaml";

const root = path.dirname(fileURLToPath(import.meta.url));
const monstersPath = path.join(root, "src", "data", "monsters-renewal.json");
const url = "https://raw.githubusercontent.com/rathena/rathena/master/db/re/mob_db.yml";

function normalizeElement(s) {
  const t = String(s || "").trim();
  return t || null;
}

async function main() {
  if (!fs.existsSync(monstersPath)) throw new Error(`Missing ${monstersPath}`);
  const monsters = JSON.parse(fs.readFileSync(monstersPath, "utf8"));
  if (!Array.isArray(monsters)) throw new Error("monsters-renewal.json is not an array");

  const text = await (await fetch(url)).text();
  const doc = yaml.parseDocument(text, { uniqueKeys: false });
  const js = doc.toJS();
  const body = Array.isArray(js?.Body) ? js.Body : [];

  /** @type {Map<number, {element: string|null, elementLevel: number|null, race: string|null, size: string|null}>} */
  const byId = new Map();
  for (const row of body) {
    const id = typeof row?.Id === "number" ? row.Id : parseInt(String(row?.Id || ""), 10);
    if (!Number.isFinite(id)) continue;
    const element = normalizeElement(row?.Element);
    const elementLevel =
      typeof row?.ElementLevel === "number"
        ? row.ElementLevel
        : row?.ElementLevel != null
          ? parseInt(String(row.ElementLevel), 10)
          : null;
    const race = typeof row?.Race === "string" ? row.Race.trim() || null : null;
    const size = typeof row?.Size === "string" ? row.Size.trim() || null : null;
    byId.set(id, {
      element,
      elementLevel: Number.isFinite(elementLevel) ? elementLevel : null,
      race,
      size,
    });
  }

  let patched = 0;
  let missing = 0;
  for (const m of monsters) {
    const id = typeof m?.id === "number" ? m.id : null;
    if (!id) continue;
    const r = byId.get(id);
    if (!r) {
      missing += 1;
      continue;
    }
    if (m.element !== r.element || m.elementLevel !== r.elementLevel || m.race !== r.race || m.size !== r.size) {
      m.element = r.element;
      m.elementLevel = r.elementLevel;
      m.race = r.race;
      m.size = r.size;
      patched += 1;
    }
  }

  fs.writeFileSync(monstersPath, JSON.stringify(monsters, null, 2) + "\n", "utf8");
  console.log(`Patched ${patched} monsters (missing ${missing} in rAthena body)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

