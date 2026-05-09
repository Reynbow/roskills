/**
 * Restores src/data/monsters-renewal.json from monsters-renewal.backup.json
 * (snapshot before Divine Pride re-import or other bulk updates).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const backup = path.join(root, "src", "data", "monsters-renewal.backup.json");
const target = path.join(root, "src", "data", "monsters-renewal.json");

if (!fs.existsSync(backup)) {
  console.error("Missing backup:", backup);
  process.exit(1);
}
fs.copyFileSync(backup, target);
console.log("Restored", target, "from backup.");
