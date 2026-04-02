/**
 * Batch-render sitting class sprites with zrenderer (action 17 = sit), then copy into public/job-sit/.
 *
 * Prerequisites:
 *   - zrenderer CLI on PATH, or set ZRENDERER_CMD to the executable (e.g. C:\ro\zrenderer.exe)
 *   - Unpacked RO client data (same layout as the game / zrenderer RESOURCES.md), path in:
 *       RO_ZRENDERER_RESOURCES
 *
 * @see https://github.com/zhad3/zrenderer
 * @see https://github.com/zhad3/zrenderer/blob/main/RESOURCES.md
 *
 * Sit direction: multi-frame export + --headdir=all so body/head directions stay in sync. zrenderer
 * maps output index i to head dir via i / (maxframes/3): the first third is front-facing, the last
 * third is left-facing. Default is auto: pick the middle of the last third. Set ZRENDERER_SIT_FRAME
 * to a number to force a slice, or ZRENDERER_SIT_LEGACY=1 for the old single-frame path.
 *
 * Usage:
 *   RO_ZRENDERER_RESOURCES="C:\path\to\extracted\data"  node scripts/render-job-sit-sprites.mjs
 *   node scripts/render-job-sit-sprites.mjs --print-only
 *   node scripts/render-job-sit-sprites.mjs --skip-existing
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "job-sit");
const TMP_ROOT = path.join(ROOT, ".tmp-zrender-sit");

const PRINT_ONLY = process.argv.includes("--print-only");
const SKIP_EXISTING = process.argv.includes("--skip-existing");
const FORCE = process.argv.includes("--force");

/** Client JOBID (skillinfo/jobinheritlist.lua) */
const JOBS = [
  ["JT_NOVICE", 0],
  ["JT_SUPERNOVICE", 23],
  ["JT_TAEKWON", 4046],
  ["JT_NINJA", 25],
  ["JT_GUNSLINGER", 24],
  ["JT_SWORDMAN", 1],
  ["JT_MAGICIAN", 2],
  ["JT_ARCHER", 3],
  ["JT_ACOLYTE", 4],
  ["JT_MERCHANT", 5],
  ["JT_THIEF", 6],
  ["JT_KNIGHT", 7],
  ["JT_PRIEST", 8],
  ["JT_WIZARD", 9],
  ["JT_BLACKSMITH", 10],
  ["JT_HUNTER", 11],
  ["JT_ASSASSIN", 12],
  ["JT_CRUSADER", 14],
  ["JT_MONK", 15],
  ["JT_SAGE", 16],
  ["JT_ROGUE", 17],
  ["JT_ALCHEMIST", 18],
  ["JT_BARD", 19],
  ["JT_DANCER", 20],
  ["JT_KNIGHT_H", 4008],
  ["JT_PRIEST_H", 4009],
  ["JT_WIZARD_H", 4010],
  ["JT_BLACKSMITH_H", 4011],
  ["JT_HUNTER_H", 4012],
  ["JT_ASSASSIN_H", 4013],
  ["JT_CRUSADER_H", 4015],
  ["JT_MONK_H", 4016],
  ["JT_SAGE_H", 4017],
  ["JT_ROGUE_H", 4018],
  ["JT_ALCHEMIST_H", 4019],
  ["JT_BARD_H", 4020],
  ["JT_DANCER_H", 4021],
];

const ACTION = Number(process.env.ZRENDERER_SIT_ACTION ?? 17);
const SIT_FRAME_RAW = process.env.ZRENDERER_SIT_FRAME?.trim() ?? "";
/** If unset or "auto", pick a slice from one of the three head-direction groups zrenderer uses (see pickAutoSitOutputIndex). */
const SIT_FRAME_AUTO = SIT_FRAME_RAW === "" || /^auto$/i.test(SIT_FRAME_RAW);
const SIT_PICK_FRAME_MANUAL = SIT_FRAME_AUTO ? NaN : Number(SIT_FRAME_RAW);
/**
 * Which head-direction third to prefer when auto-picking (zrenderer maps output i to dir i / (maxframes/3)).
 * left=dir 2 (last third), right=dir 1 (middle), straight=dir 0 (first). Default "right" (middle) tends
 * to read as a side view when only 3 sit frames exist; use "left" for zrenderer’s last third / README sit frame 2.
 */
const SIT_HEAD_DIR_GROUP = (process.env.ZRENDERER_SIT_HEAD_DIR ?? "right").trim().toLowerCase();
/**
 * Old pipeline: `--frame=SIT_PICK_FRAME` in one shot. Head often stays "front" because zrenderer only
 * applies --headdir when --frame < 0 (see zrenderer source/app.d + renderer.d).
 * Leave unset to use multi-frame export (recommended).
 */
const SIT_LEGACY = /^(1|true|yes)$/i.test(process.env.ZRENDERER_SIT_LEGACY?.trim() ?? "");
const DEFAULT_GENDER = process.env.ZRENDERER_GENDER ?? "male";
/** Fixed head id for every job; if unset, each job gets a stable pseudo-random head (see pickHeadId). */
const HEAD_FIXED = process.env.ZRENDERER_HEAD?.trim();
/** Only used with ZRENDERER_SIT_LEGACY=1; ignored for multi-frame export (uses all). */
const HEAD_DIR = process.env.ZRENDERER_HEAD_DIR ?? "left";
const HEAD_ID_MIN = Number(process.env.ZRENDERER_HEAD_MIN ?? 1);
const HEAD_ID_MAX = Number(process.env.ZRENDERER_HEAD_MAX ?? 24);
/** String mixed into the per-job head hash so you can reshuffle hairstyles without changing job keys. */
const HEAD_SEED = process.env.ZRENDERER_HEAD_SEED ?? "ro-sit-sprites";

/** RO uses female body sprites for dancer jobs; default CLI gender is male. */
const GENDER_FOR_JOB_KEY = {
  JT_DANCER: "female",
  JT_DANCER_H: "female",
};

function fnv1a32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

/** Stable hairstyle per job (same inputs → same head id). Override with ZRENDERER_HEAD=12. */
function pickHeadId(jobKey, gender) {
  if (HEAD_FIXED !== undefined && HEAD_FIXED !== "") {
    return String(Number(HEAD_FIXED));
  }
  const span = HEAD_ID_MAX - HEAD_ID_MIN + 1;
  if (span <= 0) return String(HEAD_ID_MIN);
  const n = fnv1a32(`${HEAD_SEED}\0${gender}\0${jobKey}`) % span;
  return String(HEAD_ID_MIN + n);
}

function bundledZrendererExe() {
  return path.join(ROOT, "third_party", "zrenderer-win", "zrenderer.exe");
}

function resolveZrendererCmd() {
  const fromEnv = process.env.ZRENDERER_CMD?.trim();
  if (fromEnv) return fromEnv;
  const b = bundledZrendererExe();
  if (fs.existsSync(b)) return b;
  return "zrenderer";
}

/**
 * Inner RO `data` folder (contains luafiles514/, sprite/, …).
 * zrenderer 1.4.x joins paths like `data/sprite/...` relative to a *client* root, so if your
 * tree is `...\something\data\` with `luafiles514` inside that inner `data`, pass that inner
 * path to assertRoDataRoot — and use zrendererResourceRoot() for --resourcepath.
 */
function assertRoDataRoot(dir) {
  const datainfo = path.join(dir, "luafiles514", "lua files", "datainfo");
  if (!fs.existsSync(datainfo)) {
    console.error(
      "RO_ZRENDERER_RESOURCES does not look like an RO client *data* folder.\n" +
        `Missing: ${datainfo}\n` +
        "Point it at the extracted `data` directory from your full client (see zrenderer RESOURCES.md).\n" +
        "This repo’s `skillinfo/` folder alone is not enough — you need sprites + lua datainfo from the game.",
    );
    process.exit(1);
  }
  let names;
  try {
    names = fs.readdirSync(datainfo);
  } catch {
    console.error(`Cannot read: ${datainfo}`);
    process.exit(1);
  }
  if (!names.some((f) => f.toLowerCase().startsWith("accessoryid"))) {
    console.error(
      `No accessoryid.* under ${datainfo} — resource tree is incomplete for zrenderer.`,
    );
    process.exit(1);
  }
}

/**
 * Directory to pass as zrenderer `--resourcepath`: parent of the inner `data` folder when the
 * layout is `<resourcepath>/data/luafiles514` (common for Gravity-style extracts).
 */
function zrendererResourceRoot(innerDataRoot) {
  const resolved = path.resolve(innerDataRoot);
  const base = path.basename(resolved);
  if (base.toLowerCase() !== "data") return resolved;
  const parent = path.dirname(resolved);
  const innerLua = path.join(resolved, "luafiles514");
  const innerSprite = path.join(resolved, "sprite");
  const viaParent = path.join(parent, "data", "luafiles514");
  if (
    fs.existsSync(innerLua) &&
    fs.existsSync(innerSprite) &&
    fs.existsSync(viaParent) &&
    path.resolve(viaParent) === path.resolve(innerLua)
  ) {
    return parent;
  }
  return resolved;
}

function zrendererCwd(cmd) {
  const exe = path.resolve(cmd);
  if (exe.endsWith(`${path.sep}zrenderer.exe`) || exe.endsWith(`${path.sep}zrenderer`)) {
    const d = path.dirname(exe);
    if (fs.existsSync(path.join(d, "resolver_data"))) return d;
  }
  return ROOT;
}

function* walkFiles(dir) {
  if (!fs.existsSync(dir)) return;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) yield* walkFiles(p);
    else yield p;
  }
}

/**
 * Indices of `action-N.png` zrenderer wrote under tmpOut/jobId/.
 */
function listSitOutputIndices(tmpOut, jobId, action) {
  const id = String(jobId);
  const dir = path.join(tmpOut, id);
  if (!fs.existsSync(dir)) return [];
  const prefix = `${action}-`;
  const suffix = ".png";
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.startsWith(prefix) || !name.endsWith(suffix)) continue;
    if (name.slice(prefix.length, -suffix.length).includes("-")) continue;
    const n = Number(name.slice(prefix.length, -suffix.length));
    if (Number.isFinite(n)) out.push(n);
  }
  return out.sort((a, b) => a - b);
}

/**
 * zrenderer renderer.d: for sit/stand + headdir=all, head dir = floor(i / (maxframes/3)).
 * Pick the middle frame of the chosen direction group (0=straight, 1=right, 2=left in zrenderer enums).
 */
function pickAutoSitOutputIndex(indices) {
  if (indices.length === 0) return 2;
  const maxIdx = indices[indices.length - 1];
  const maxframes = maxIdx + 1;
  if (maxframes < 3) {
    const i = Math.min(indices.length - 1, Math.max(0, Math.floor(indices.length / 2)));
    return indices[i];
  }
  const third = Math.floor(maxframes / 3);
  if (third < 1) return maxIdx;
  let dir = 2;
  if (SIT_HEAD_DIR_GROUP === "right" || SIT_HEAD_DIR_GROUP === "1") dir = 1;
  else if (
    SIT_HEAD_DIR_GROUP === "straight" ||
    SIT_HEAD_DIR_GROUP === "front" ||
    SIT_HEAD_DIR_GROUP === "0"
  ) {
    dir = 0;
  }
  const start = dir * third;
  const end = Math.min(maxIdx, (dir + 1) * third - 1);
  if (start > end) return indices[Math.floor(indices.length / 2)];
  return start + Math.floor((end - start) / 2);
}

function resolveSitPickFrame(tmpOut, jobId, action, legacy) {
  if (legacy) {
    return Number.isFinite(SIT_PICK_FRAME_MANUAL) ? SIT_PICK_FRAME_MANUAL : 2;
  }
  if (Number.isFinite(SIT_PICK_FRAME_MANUAL)) return SIT_PICK_FRAME_MANUAL;
  const indices = listSitOutputIndices(tmpOut, jobId, action);
  return pickAutoSitOutputIndex(indices);
}

/**
 * Multi-frame + --singleframes writes `tmpOut/<jobId>/<action>-<i>.png`.
 * Legacy single shot uses `job_action_frame.png` or similar.
 */
function findRenderedPng(tmpOut, jobId, action, frame, legacy) {
  const id = String(jobId);
  const ordered = legacy
    ? [
        path.join(tmpOut, `${jobId}_${action}_${frame}.png`),
        path.join(tmpOut, `${id}_${action}_${frame}.png`),
        path.join(tmpOut, id, `${action}-${frame}.png`),
        path.join(tmpOut, id, `${action}_${frame}.png`),
      ]
    : [
        path.join(tmpOut, id, `${action}-${frame}.png`),
        path.join(tmpOut, id, `${action}_${frame}.png`),
        path.join(tmpOut, `${jobId}_${action}_${frame}.png`),
        path.join(tmpOut, `${id}_${action}_${frame}.png`),
      ];
  for (const p of ordered) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).size > 800) return p;
    } catch {
      /* ignore */
    }
  }
  let fallback = null;
  let fallbackSize = 0;
  for (const p of walkFiles(tmpOut)) {
    if (!p.toLowerCase().endsWith(".png")) continue;
    const sz = fs.statSync(p).size;
    if (sz < 800) continue;
    const base = path.basename(p);
    if (base.startsWith(`${id}_`) && sz > fallbackSize) {
      fallback = p;
      fallbackSize = sz;
    }
  }
  if (fallback) return fallback;
  for (const p of walkFiles(tmpOut)) {
    if (!p.toLowerCase().endsWith(".png")) continue;
    const sz = fs.statSync(p).size;
    if (sz > fallbackSize) {
      fallback = p;
      fallbackSize = sz;
    }
  }
  return fallback;
}

function runZrenderer(cmd, resourcePath, tmpOut, jobId, gender, headId) {
  const args = [
    `--resourcepath=${resourcePath}`,
    `--job=${jobId}`,
    `--action=${ACTION}`,
    `--gender=${gender}`,
    `--head=${headId}`,
    `--outdir=${tmpOut}`,
    `--enableShadow=false`,
    `--loglevel=warning`,
  ];
  if (SIT_LEGACY) {
    args.push(`--frame=${SIT_PICK_FRAME}`, `--headdir=${HEAD_DIR}`);
  } else {
    args.push(`--frame=-1`, `--headdir=all`, `--singleframes=true`);
  }
  const res = spawnSync(cmd, args, {
    stdio: "inherit",
    cwd: zrendererCwd(cmd),
    env: process.env,
    shell: false,
  });
  return res.status === 0;
}

if (PRINT_ONLY) {
  console.log(
    "# Set RO_ZRENDERER_RESOURCES, then run each line (or run this script without --print-only).\n",
  );
  for (const [key, jobId] of JOBS) {
    const dest = path.join("public", "job-sit", `${key}.png`);
    console.log(
      `# ${key} (job ${jobId}) → ${dest}\n` +
        `# Multi export (head matches sit direction): --frame=-1 --headdir=all --singleframes=true, then keep <action>-<n>.png (see ZRENDERER_SIT_FRAME).\n` +
        `zrenderer --resourcepath="$RO_ZRENDERER_RESOURCES" --job=${jobId} --action=${ACTION} --frame=-1 --headdir=all --singleframes=true --gender=${DEFAULT_GENDER} --head=<id> --outdir=./tmp-zrender-one --enableShadow=false\n` +
        `# then copy the generated PNG to ${dest}\n`,
    );
  }
  process.exit(0);
}

const resourcePath = process.env.RO_ZRENDERER_RESOURCES?.trim();
if (!resourcePath) {
  console.error(
    "Missing RO_ZRENDERER_RESOURCES (path to unpacked RO client data for zrenderer).\n" +
      "See: https://github.com/zhad3/zrenderer/blob/main/RESOURCES.md\n" +
      "Example: RO_ZRENDERER_RESOURCES=C:\\\\ro\\\\extracted\\\\data node scripts/render-job-sit-sprites.mjs\n" +
      "Or run with --print-only to only print commands.",
  );
  process.exit(1);
}

if (!fs.existsSync(resourcePath)) {
  console.error(`RO_ZRENDERER_RESOURCES does not exist: ${resourcePath}`);
  process.exit(1);
}

const absRes = path.resolve(resourcePath);
assertRoDataRoot(absRes);
const zrendererPath = zrendererResourceRoot(absRes);

const zCmd = resolveZrendererCmd();
const looksLikeExplicitPath =
  zCmd.includes(path.sep) || zCmd.endsWith(".exe") || path.isAbsolute(zCmd);
if (looksLikeExplicitPath && !fs.existsSync(zCmd)) {
  console.error(`zrenderer executable not found: ${zCmd}\nRun: npm run setup:zrenderer`);
  process.exit(1);
}
if (fs.existsSync(bundledZrendererExe()) && path.resolve(zCmd) === path.resolve(bundledZrendererExe())) {
  console.log(`Using bundled zrenderer: ${zCmd}\n`);
}
if (zrendererPath !== absRes) {
  console.log(`zrenderer --resourcepath: ${zrendererPath} (inner data: ${absRes})\n`);
}
if (SIT_LEGACY) {
  const lf = Number.isFinite(SIT_PICK_FRAME_MANUAL) ? SIT_PICK_FRAME_MANUAL : 2;
  console.log(`Sit export: LEGACY (--frame=${lf}, --headdir=${HEAD_DIR}) — head may not match body.\n`);
} else if (SIT_FRAME_AUTO) {
  console.log(
    `Sit export: multi-frame; auto-pick sit PNG (head dir group "${SIT_HEAD_DIR_GROUP}": left|right|straight). ` +
      `Override slice: ZRENDERER_SIT_FRAME=<n>\n`,
  );
} else {
  console.log(
    `Sit export: multi-frame; fixed slice ZRENDERER_SIT_FRAME=${SIT_PICK_FRAME_MANUAL} → ${ACTION}-${SIT_PICK_FRAME_MANUAL}.png.\n`,
  );
}
if (HEAD_FIXED !== undefined && HEAD_FIXED !== "") {
  console.log(`Using fixed head id for all jobs: ${HEAD_FIXED}\n`);
} else {
  console.log(
    `Heads: ${HEAD_ID_MIN}–${HEAD_ID_MAX} per job (seed "${HEAD_SEED}"). Set ZRENDERER_HEAD= for one style.\n`,
  );
}

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(TMP_ROOT, { recursive: true });

let ok = 0;
let fail = 0;
let skipped = 0;

for (const [key, jobId] of JOBS) {
  const dest = path.join(OUT_DIR, `${key}.png`);
  if (SKIP_EXISTING && !FORCE && fs.existsSync(dest) && fs.statSync(dest).size > 800) {
    console.log(`skip (exists): ${key}`);
    skipped++;
    continue;
  }

  const tmpOut = path.join(TMP_ROOT, key);
  fs.rmSync(tmpOut, { recursive: true, force: true });
  fs.mkdirSync(tmpOut, { recursive: true });

  const gender = GENDER_FOR_JOB_KEY[key] ?? DEFAULT_GENDER;
  const headId = pickHeadId(key, gender);
  console.log(`render ${key} (job ${jobId}, head ${headId}${SIT_LEGACY ? `, headdir ${HEAD_DIR}` : ""})…`);
  if (!runZrenderer(zCmd, zrendererPath, tmpOut, jobId, gender, headId)) {
    console.error(`  ✗ zrenderer failed for ${key}`);
    fail++;
    continue;
  }

  const pickFrame = resolveSitPickFrame(tmpOut, jobId, ACTION, SIT_LEGACY);
  if (!SIT_LEGACY && SIT_FRAME_AUTO) {
    const idxs = listSitOutputIndices(tmpOut, jobId, ACTION);
    console.log(`  → sit output ${ACTION}-${pickFrame}.png (${idxs.length} frames, auto / ${SIT_HEAD_DIR_GROUP})`);
  }

  const png = findRenderedPng(tmpOut, jobId, ACTION, pickFrame, SIT_LEGACY);
  if (!png) {
    console.error(`  ✗ no PNG found in ${tmpOut}`);
    fail++;
    continue;
  }

  fs.copyFileSync(png, dest);
  console.log(`  ✓ ${dest}  (${fs.statSync(dest).size} bytes)`);
  ok++;
}

if (fail === 0) {
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
} else {
  console.error(`\nLeft ${TMP_ROOT} on disk for debugging failed renders.`);
}

console.log(`\nDone: ${ok} rendered, ${skipped} skipped, ${fail} failed.`);
process.exit(fail > 0 ? 1 : 0);
