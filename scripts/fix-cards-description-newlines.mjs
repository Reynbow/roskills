/**
 * Fixes common smashed-together card description lines directly in src/data/cards.json
 * by inserting conservative "\n" breaks between known stat tokens.
 *
 * Usage: node scripts/fix-cards-description-newlines.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const CARDS = path.join(ROOT, "src", "data", "cards.json");

const KEYWORDS =
  "(?:Str|Agi|Vit|Int|Dex|Luk|Aspd|Atk|Matk|Def|Mdef|Hit|Flee|Cri|Critical|Perfect Hit|Max HP|Max SP|HP Recovery Rate|SP Recovery Rate|If|Increases|Reduces)";

/** @param {string} s */
function fixDesc(s) {
  const base = String(s || "").replace(/\r\n/g, "\n");
  if (!base.trim()) return base;
  let out = base;

  // Example: "3%Aspd" / "5%If" / "30%SP Recovery Rate"
  out = out.replace(new RegExp(`%(?=${KEYWORDS}\\b)`, "gi"), "%\n");

  // Example: "4Int" / "1Atk" / "5Dex"
  out = out.replace(new RegExp(`([0-9])(?=${KEYWORDS}\\b)`, "gi"), "$1\n");

  // Example: "...+4HP..." where the stat is a multi-word keyword
  out = out.replace(/([0-9])(?=(?:HP|SP)\s+Recovery\s+Rate\b)/gi, "$1\n");
  out = out.replace(/([0-9])(?=(?:Max)\s+(?:HP|SP)\b)/gi, "$1\n");
  out = out.replace(/%(?=(?:HP|SP)\s+Recovery\s+Rate\b)/gi, "%\n");
  out = out.replace(/%(?=(?:Max)\s+(?:HP|SP)\b)/gi, "%\n");

  // Keep spacing sane
  out = out.replace(/\n{3,}/g, "\n\n").trim();
  return out;
}

const raw = fs.readFileSync(CARDS, "utf8");
const cards = JSON.parse(raw);
if (!Array.isArray(cards)) {
  console.error("Expected array in", CARDS);
  process.exit(1);
}

let changed = 0;
/** @type {Array<{ id: number; name: string }>} */
const touched = [];

for (const c of cards) {
  if (!c || typeof c !== "object") continue;
  if (typeof c.description !== "string" || !c.description) continue;
  const next = fixDesc(c.description);
  if (next !== c.description) {
    c.description = next;
    changed++;
    if (typeof c.id === "number" && typeof c.name === "string") touched.push({ id: c.id, name: c.name });
  }
}

fs.writeFileSync(CARDS, `${JSON.stringify(cards, null, 2)}\n`, "utf8");
console.log(`fix-cards-description-newlines: updated ${changed} cards`);
if (touched.length) {
  console.log("Sample:", touched.slice(0, 12).map((x) => `${x.name} (${x.id})`).join(", "));
}

