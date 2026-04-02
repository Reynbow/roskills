/**
 * Many Windows RO "data" extracts store Korean folder/file names as CP949 bytes
 * misinterpreted as Latin-1 (mojibake). zrenderer opens paths as UTF-8 Korean and
 * fails with "No such file" unless names are fixed.
 *
 * Usage:
 *   node scripts/fix-ro-sprite-cp949-names.mjs --dry-run "C:\path\to\data\data\sprite"
 *   node scripts/fix-ro-sprite-cp949-names.mjs --apply "C:\path\to\data\data\sprite"
 *
 * Only renames when decode(name) !== name (safe for ASCII-only names).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import iconv from "iconv-lite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DRY = !process.argv.includes("--apply");
const positional = process.argv.filter((a) => !a.startsWith("--"));
const target = positional[positional.length - 1];

function usage() {
  console.error(
    "Usage:\n" +
      "  node scripts/fix-ro-sprite-cp949-names.mjs --dry-run <path-to-sprite-folder>\n" +
      "  node scripts/fix-ro-sprite-cp949-names.mjs --apply   <path-to-sprite-folder>\n" +
      "\n" +
      "Typical path: ...\\extracted\\data\\data\\sprite",
  );
  process.exit(1);
}

const scriptBase = path.basename(process.argv[1] ?? "");
if (!target || target === process.argv[0] || path.basename(target) === scriptBase) {
  usage();
}

const spriteRoot = path.resolve(target);
if (!fs.existsSync(spriteRoot) || !fs.statSync(spriteRoot).isDirectory()) {
  console.error(`Not a directory: ${spriteRoot}`);
  process.exit(1);
}

/** CP949 bytes stored as Latin-1 mojibake → proper Unicode string */
function decodeCp949Mojibake(name) {
  try {
    const buf = Buffer.from(name, "latin1");
    return iconv.decode(buf, "cp949");
  } catch {
    return name;
  }
}

function collectEntries(root) {
  const out = [];
  function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      out.push({ dir, name: ent.name, full, isDir: ent.isDirectory() });
    }
  }
  walk(root);
  return out;
}

const entries = collectEntries(spriteRoot);
/** Deepest paths first so parents rename after children */
entries.sort((a, b) => b.full.split(path.sep).length - a.full.split(path.sep).length);

let would = 0;
let done = 0;
let skipped = 0;

for (const { dir, name, full, isDir } of entries) {
  const fixed = decodeCp949Mojibake(name);
  if (fixed === name) {
    skipped++;
    continue;
  }
  const dest = path.join(dir, fixed);
  if (path.resolve(dest) === path.resolve(full)) {
    skipped++;
    continue;
  }
  if (fs.existsSync(dest)) {
    console.error(`Skip (target exists): ${full}\n  → ${dest}`);
    skipped++;
    continue;
  }
  would++;
  if (DRY) {
    console.log(`[dry-run] ${isDir ? "dir " : "file"} ${name}\n         → ${fixed}`);
  } else {
    fs.renameSync(full, dest);
    console.log(`renamed: ${fixed}`);
    done++;
  }
}

if (DRY) {
  console.log(`\n${would} renames (dry-run). Run with --apply to execute.`);
} else {
  console.log(`\nDone: ${done} renamed, ${skipped} unchanged or skipped.`);
}
