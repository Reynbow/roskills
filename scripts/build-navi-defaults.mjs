/**
 * Builds a map id → default /navi coordinates table from a public client navigation file.
 *
 * Source: scriptord3/Ragnarok-Client-Scripts `navi_map_xx.lua`
 * Writes: src/data/navi-defaults.json as { [mapId]: { x: number, y: number } }
 *
 * Note: in `navi_map_xx.lua` the last two numbers are map dimensions (width/height),
 * not a destination point. We convert to a safe default `/navi` point by using the
 * map center: floor(width/2), floor(height/2).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
 
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "src", "data", "navi-defaults.json");
 
const NAVI_MAP_URL =
  "https://raw.githubusercontent.com/scriptord3/Ragnarok-Client-Scripts/master/data/luafiles514/lua%20files/navigation/navi_map_xx.lua";
 
/**
 * @param {string} lua
 * @returns {Record<string, { x: number; y: number }>}
 */
function parseNaviMapLua(lua) {
  /** @type {Record<string, { x: number; y: number }>} */
  const out = {};
 
  // Blocks look like:
  // {
  //   "prt_fild05",
  //   "Prontera Field",
  //   5001,
  //   400,
  //   400
  // },
  const re =
    /\{\s*"([^"]+)"\s*,\s*"([^"]*)"\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\}/g;
 
  let m;
  while ((m = re.exec(lua))) {
    const mapId = String(m[1] || "").trim();
    const w = Number.parseInt(m[4] ?? "", 10);
    const h = Number.parseInt(m[5] ?? "", 10);
    if (!mapId) continue;
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) continue;
    out[mapId] = { x: Math.floor(w / 2), y: Math.floor(h / 2) };
  }
 
  return out;
}
 
async function main() {
  const res = await fetch(NAVI_MAP_URL, {
    headers: { "User-Agent": "ro-pre-renewal-skill-planner/build-navi-defaults" },
  });
  if (!res.ok) throw new Error(`navi_map_xx.lua: HTTP ${res.status}`);
  const lua = await res.text();
  const parsed = parseNaviMapLua(lua);
 
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
  console.log(`Wrote ${OUT} (${Object.keys(parsed).length} maps)`); // eslint-disable-line no-console
}
 
main().catch((e) => {
  console.error(e); // eslint-disable-line no-console
  process.exit(1);
});

