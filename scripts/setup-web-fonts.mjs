/**
 * Fetches Galmuri11 (SIL OFL) WOFF2 files into public/fonts/.
 * RO client .eot files use MTX-compressed payloads; use FontForge + libeot on Linux/WSL
 * or a desktop converter if you need the exact game outlines.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "..", "public", "fonts");

const FILES = [
  [
    "Galmuri11.woff2",
    "https://raw.githubusercontent.com/quiple/galmuri/v2.40.3/dist/Galmuri11.woff2",
  ],
  [
    "Galmuri11-Bold.woff2",
    "https://raw.githubusercontent.com/quiple/galmuri/v2.40.3/dist/Galmuri11-Bold.woff2",
  ],
  [
    "Galmuri-LICENSE.txt",
    "https://raw.githubusercontent.com/quiple/galmuri/v2.40.3/dist/LICENSE.txt",
  ],
];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, url] of FILES) {
    const dest = path.join(OUT, name);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 1000) {
      console.log("skip (exists):", name);
      continue;
    }
    const res = await fetch(url);
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
    fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
    console.log("wrote", dest);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
