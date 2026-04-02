/**
 * Downloads the official Windows x64 zrenderer CLI release into third_party/zrenderer-win/
 * (not committed — see .gitignore). Run: npm run setup:zrenderer
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const DEST = path.join(ROOT, "third_party", "zrenderer-win");
const ZIP_NAME = "zrenderer-windows-x64-v1.4.3.zip";
const ZIP_URL = `https://github.com/zhad3/zrenderer/releases/download/v1.4.3/${ZIP_NAME}`;
const EXE = path.join(DEST, "zrenderer.exe");

if (fs.existsSync(EXE)) {
  console.log(`Already present: ${EXE}`);
  process.exit(0);
}

fs.mkdirSync(DEST, { recursive: true });
const zipPath = path.join(DEST, ZIP_NAME);

console.log(`Downloading ${ZIP_URL} …`);
const res = await fetch(ZIP_URL);
if (!res.ok) {
  console.error(`HTTP ${res.status}`);
  process.exit(1);
}
const buf = Buffer.from(await res.arrayBuffer());
fs.writeFileSync(zipPath, buf);
console.log(`Wrote ${zipPath} (${buf.length} bytes)`);

const ps = `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${DEST.replace(/'/g, "''")}' -Force`;
const x = spawnSync("powershell.exe", ["-NoProfile", "-Command", ps], {
  stdio: "inherit",
  cwd: ROOT,
});
if (x.status !== 0) {
  console.error("Expand-Archive failed");
  process.exit(1);
}

if (!fs.existsSync(EXE)) {
  console.error(`Expected ${EXE} after extract — check zip layout.`);
  process.exit(1);
}
console.log(`Ready: ${EXE}`);
