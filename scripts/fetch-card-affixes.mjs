/**
 * Fills `prefix` and `suffix` on each entry in src/data/cards.json from Divine Pride HTML
 * (compound equipment names when the card is compounded). Does not re-run rAthena / RagnaAPI.
 *
 * Usage: node scripts/fetch-card-affixes.mjs
 * Optional: CARD_DESC_FETCH_DELAY_MS (default 80)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseDivinePrideAffixes } from "./parse-divine-pride-affixes.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "src", "data", "cards.json");

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

const raw = fs.readFileSync(OUT, "utf8");
/** @type {unknown[]} */
const cards = JSON.parse(raw);
if (!Array.isArray(cards)) {
  console.error("fetch-card-affixes: expected array in", OUT);
  process.exit(1);
}

let ok = 0;
let fail = 0;
const delayMs = Number(process.env.CARD_DESC_FETCH_DELAY_MS ?? 80);

for (const row of cards) {
  if (!row || typeof row !== "object") continue;
  if (typeof row.id !== "number" || typeof row.name !== "string") continue;
  try {
    const slug = slugify(row.name);
    const res = await fetch(DIVINE_PRIDE_ITEM(row.id, slug), {
      headers: { "User-Agent": "ro-pre-renewal-skill-planner/fetch-card-affixes" },
    });
    if (!res.ok) {
      fail++;
      continue;
    }
    const html = await res.text();
    const aff = parseDivinePrideAffixes(html);
    if (aff.prefix) row.prefix = aff.prefix;
    else delete row.prefix;
    if (aff.suffix) row.suffix = aff.suffix;
    else delete row.suffix;
    if (aff.prefix || aff.suffix) ok++;
  } catch {
    fail++;
  }
  if (delayMs > 0) {
    await new Promise((r) => setTimeout(r, delayMs));
  }
}

fs.writeFileSync(OUT, `${JSON.stringify(cards, null, 2)}\n`, "utf8");
console.log(`fetch-card-affixes: wrote ${OUT} — ${ok} cards with prefix and/or suffix, ${fail} failures`);
