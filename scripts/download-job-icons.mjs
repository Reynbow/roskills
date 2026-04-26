/**
 * Downloads job icon PNGs referenced on:
 * https://ragnarok-online-encyclopedia.fandom.com/wiki/Classes
 *
 * Output: public/job-icons/Icon_jobs_<id>.png
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "job-icons");
fs.mkdirSync(OUT_DIR, { recursive: true });

async function json(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

async function download(url, outPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(outPath, buf);
}

async function main() {
  // First, ask the wiki page what images it references (fast & canonical).
  const parse = await json(
    "https://ragnarok-online-encyclopedia.fandom.com/api.php?action=parse&page=Classes&prop=images&format=json",
  );
  const files = Array.isArray(parse?.parse?.images) ? parse.parse.images : [];
  const iconFiles = files
    .filter((x) => typeof x === "string" && /^Icon_jobs_\d+\.png$/i.test(x))
    .sort((a, b) => {
      const na = parseInt(a.match(/\d+/)?.[0] ?? "0", 10);
      const nb = parseInt(b.match(/\d+/)?.[0] ?? "0", 10);
      return na - nb;
    });

  let ok = 0;
  let fail = 0;
  for (const file of iconFiles) {
    const id = parseInt(file.match(/\d+/)?.[0] ?? "0", 10);
    const outPath = path.join(OUT_DIR, `Icon_jobs_${id}.png`);
    if (fs.existsSync(outPath)) continue;

    try {
      const q = await json(
        `https://ragnarok-online-encyclopedia.fandom.com/api.php?action=query&titles=File:${encodeURIComponent(
          file,
        )}&prop=imageinfo&iiprop=url&format=json`,
      );
      const page = Object.values(q?.query?.pages ?? {})[0];
      const url = page?.imageinfo?.[0]?.url;
      if (typeof url !== "string" || !url) throw new Error("missing image url");

      const original = url
        .replace(/\/revision\/latest\?.*$/, "/revision/latest?format=original")
        .replace(/\/revision\/latest$/, "/revision/latest?format=original");

      await download(original, outPath);
      ok++;
    } catch (e) {
      fail++;
      console.warn("Failed:", file, e?.message ?? e);
    }
  }

  console.log(`Downloaded ${ok} icons (${fail} failed). Output: ${OUT_DIR}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

