/**
 * Batch-render **standing** (idle) class sprites for the job picker: zrenderer default action 0, body/head
 * facing **forward** (straight head-direction group). Writes `public/job-stand-pick/{JT_*}-(male|female).png`.
 *
 * Same prerequisites as `render-job-sit-sprites.mjs` (zrenderer + `RO_ZRENDERER_RESOURCES`).
 *
 * Env (defaults tuned for forward-facing idle):
 *   ZRENDERER_STAND_ACTION=0       Idle / stand action (client-dependent; 0 is usual)
 *   ZRENDERER_STAND_FRAME=auto   Same as sit: omit or "auto", or a numeric slice index
 *   ZRENDERER_STAND_HEAD_DIR=straight   left | right | straight (default straight = first third / toward camera)
 *   ZRENDERER_STAND_LEGACY=1     Old single --frame mode
 *   ZRENDERER_HEAD, ZRENDERER_HEAD_MIN/MAX/SEED  — same as sit script
 *
 * Usage:
 *   RO_ZRENDERER_RESOURCES="C:\path\to\data" node scripts/render-job-stand-picker-sprites.mjs
 *   RO_ZRENDERER_RESOURCES="C:\path\to\renewal\data" node scripts/render-job-stand-picker-sprites.mjs --renewal-only
 *   RO_ZRENDERER_RESOURCES="C:\path\to\data" node scripts/render-job-stand-picker-sprites.mjs --with-renewal
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { buildPlannerJobsList } from "./planner-zrenderer-jobs.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "public", "job-stand-pick");
const TMP_ROOT = path.join(ROOT, ".tmp-zrender-stand-pick");

const PRINT_ONLY = process.argv.includes("--print-only");
const SKIP_EXISTING = process.argv.includes("--skip-existing");
const FORCE = process.argv.includes("--force");
const RENEWAL_ONLY = process.argv.includes("--renewal-only");
const WITH_RENEWAL = process.argv.includes("--with-renewal");

const JOBS = buildPlannerJobsList({
  renewalOnly: RENEWAL_ONLY,
  withRenewal: WITH_RENEWAL,
});

/** Idle / standing (RO clients typically use action 0 for neutral stand). */
const ACTION = Number(process.env.ZRENDERER_STAND_ACTION ?? 0);
const STAND_FRAME_RAW = process.env.ZRENDERER_STAND_FRAME?.trim() ?? "";
const STAND_FRAME_AUTO = STAND_FRAME_RAW === "" || /^auto$/i.test(STAND_FRAME_RAW);
const STAND_PICK_FRAME_MANUAL = STAND_FRAME_AUTO ? NaN : Number(STAND_FRAME_RAW);
const STAND_HEAD_DIR_GROUP = (process.env.ZRENDERER_STAND_HEAD_DIR ?? "straight").trim().toLowerCase();
const STAND_LEGACY = /^(1|true|yes)$/i.test(process.env.ZRENDERER_STAND_LEGACY?.trim() ?? "");
const DEFAULT_GENDER = process.env.ZRENDERER_GENDER ?? "male";
const HEAD_FIXED = process.env.ZRENDERER_HEAD?.trim();
const HEAD_DIR = process.env.ZRENDERER_HEAD_DIR ?? "left";
const HEAD_ID_MIN = Number(process.env.ZRENDERER_HEAD_MIN ?? 1);
const HEAD_ID_MAX = Number(process.env.ZRENDERER_HEAD_MAX ?? 24);
const HEAD_SEED = process.env.ZRENDERER_HEAD_SEED ?? "ro-stand-picker-sprites";

const GENDERS = ["male", "female"];

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
function pickAutoStandOutputIndex(indices) {
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
  if (STAND_HEAD_DIR_GROUP === "right" || STAND_HEAD_DIR_GROUP === "1") dir = 1;
  else if (
    STAND_HEAD_DIR_GROUP === "straight" ||
    STAND_HEAD_DIR_GROUP === "front" ||
    STAND_HEAD_DIR_GROUP === "0"
  ) {
    dir = 0;
  }
  const start = dir * third;
  const end = Math.min(maxIdx, (dir + 1) * third - 1);
  if (start > end) return indices[Math.floor(indices.length / 2)];
  return start + Math.floor((end - start) / 2);
}

function resolveStandPickFrame(tmpOut, jobId, action, legacy) {
  if (legacy) {
    return Number.isFinite(STAND_PICK_FRAME_MANUAL) ? STAND_PICK_FRAME_MANUAL : 2;
  }
  if (Number.isFinite(STAND_PICK_FRAME_MANUAL)) return STAND_PICK_FRAME_MANUAL;
  const indices = listSitOutputIndices(tmpOut, jobId, action);
  return pickAutoStandOutputIndex(indices);
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
  if (STAND_LEGACY) {
    const lf = Number.isFinite(STAND_PICK_FRAME_MANUAL) ? STAND_PICK_FRAME_MANUAL : 2;
    args.push(`--frame=${lf}`, `--headdir=${HEAD_DIR}`);
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
  for (const [key, jobIdOrIds] of JOBS) {
    const jobIds = Array.isArray(jobIdOrIds) ? jobIdOrIds : [jobIdOrIds];
    console.log(
      `# ${key} (job ${jobIds.join(" | ")}) → public\\job-stand-pick\\${key}--(male|female).png\n` +
        `# Multi export: --frame=-1 --headdir=all --singleframes=true, then keep <action>-<n>.png (see ZRENDERER_STAND_FRAME).\n` +
        `# Run once for each gender (male + female):\n` +
        `zrenderer --resourcepath="$RO_ZRENDERER_RESOURCES" --job=<one of: ${jobIds.join(", ")}> --action=${ACTION} --frame=-1 --headdir=all --singleframes=true --gender=male --head=<id> --outdir=./tmp-zrender-one --enableShadow=false\n` +
        `zrenderer --resourcepath="$RO_ZRENDERER_RESOURCES" --job=<one of: ${jobIds.join(", ")}> --action=${ACTION} --frame=-1 --headdir=all --singleframes=true --gender=female --head=<id> --outdir=./tmp-zrender-one --enableShadow=false\n` +
        `# then copy the generated PNG(s) to public\\job-stand-pick\\${key}--male.png and public\\job-stand-pick\\${key}--female.png\n`,
    );
  }
  process.exit(0);
}

const resourcePath = process.env.RO_ZRENDERER_RESOURCES?.trim();
if (!resourcePath) {
  console.error(
    "Missing RO_ZRENDERER_RESOURCES (path to unpacked RO client data for zrenderer).\n" +
      "See: https://github.com/zhad3/zrenderer/blob/main/RESOURCES.md\n" +
      "Example: RO_ZRENDERER_RESOURCES=C:\\\\ro\\\\extracted\\\\data node scripts/render-job-stand-picker-sprites.mjs\n" +
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
if (STAND_LEGACY) {
  const lf = Number.isFinite(STAND_PICK_FRAME_MANUAL) ? STAND_PICK_FRAME_MANUAL : 2;
  console.log(`Stand export: LEGACY (--frame=${lf}, --headdir=${HEAD_DIR}) — head may not match body.\n`);
} else if (STAND_FRAME_AUTO) {
  console.log(
    `Stand export: multi-frame; auto-pick PNG (head dir group "${STAND_HEAD_DIR_GROUP}": left|right|straight). ` +
      `Override slice: ZRENDERER_STAND_FRAME=<n>\n`,
  );
} else {
  console.log(
    `Stand export: multi-frame; fixed slice ZRENDERER_STAND_FRAME=${STAND_PICK_FRAME_MANUAL} → ${ACTION}-${STAND_PICK_FRAME_MANUAL}.png.\n`,
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
  const jobIds = Array.isArray(jobId) ? jobId : [jobId];
  let anyOkForJob = false;

  for (const gender of GENDERS) {
    const dest = path.join(OUT_DIR, `${key}--${gender}.png`);
    if (SKIP_EXISTING && !FORCE && fs.existsSync(dest) && fs.statSync(dest).size > 800) {
      console.log(`skip (exists): ${key} (${gender})`);
      skipped++;
      anyOkForJob = true;
      continue;
    }

    const tmpOut = path.join(TMP_ROOT, `${key}--${gender}`);
    fs.rmSync(tmpOut, { recursive: true, force: true });
    fs.mkdirSync(tmpOut, { recursive: true });

    const headId = pickHeadId(key, gender);
    let renderedJobId = null;
    for (const tryId of jobIds) {
      console.log(
        `render ${key} (${gender}) (job ${tryId}${jobIds.length > 1 ? `/${jobIds.join("|")}` : ""}, head ${headId}${STAND_LEGACY ? `, headdir ${HEAD_DIR}` : ""})…`,
      );
      if (runZrenderer(zCmd, zrendererPath, tmpOut, tryId, gender, headId)) {
        renderedJobId = tryId;
        break;
      }
      console.error(`  ✗ zrenderer failed for ${key} (${gender}) (job ${tryId})`);
    }
    if (renderedJobId === null) {
      fail++;
      continue;
    }

    const pickFrame = resolveStandPickFrame(tmpOut, renderedJobId, ACTION, STAND_LEGACY);
    if (!STAND_LEGACY && STAND_FRAME_AUTO) {
      const idxs = listSitOutputIndices(tmpOut, renderedJobId, ACTION);
      console.log(
        `  → stand output ${ACTION}-${pickFrame}.png (${idxs.length} frames, auto / ${STAND_HEAD_DIR_GROUP})`,
      );
    }

    const png = findRenderedPng(tmpOut, renderedJobId, ACTION, pickFrame, STAND_LEGACY);
    if (!png) {
      console.error(`  ✗ no PNG found in ${tmpOut}`);
      fail++;
      continue;
    }

    fs.copyFileSync(png, dest);
    console.log(`  ✓ ${dest}  (${fs.statSync(dest).size} bytes)`);
    ok++;
    anyOkForJob = true;
  }

  // If one gender fails but the other succeeded, keep the UI functional by copying.
  // (This happens on some client dumps where only one gender has a full sprite set for a given job.)
  if (anyOkForJob) {
    const male = path.join(OUT_DIR, `${key}--male.png`);
    const female = path.join(OUT_DIR, `${key}--female.png`);
    const maleOk = fs.existsSync(male) && fs.statSync(male).size > 800;
    const femaleOk = fs.existsSync(female) && fs.statSync(female).size > 800;
    if (maleOk && !femaleOk) {
      fs.copyFileSync(male, female);
      console.log(`  ↺ copied ${key}: male → female (fallback)`);
    } else if (femaleOk && !maleOk) {
      fs.copyFileSync(female, male);
      console.log(`  ↺ copied ${key}: female → male (fallback)`);
    }
  }
}

const missingJobs = [];
for (const [key] of JOBS) {
  const male = path.join(OUT_DIR, `${key}--male.png`);
  const female = path.join(OUT_DIR, `${key}--female.png`);
  const mOk = fs.existsSync(male) && fs.statSync(male).size > 800;
  const fOk = fs.existsSync(female) && fs.statSync(female).size > 800;
  if (!mOk && !fOk) missingJobs.push(key);
}

if (fail === 0 && missingJobs.length === 0) {
  fs.rmSync(TMP_ROOT, { recursive: true, force: true });
} else {
  console.error(`\nLeft ${TMP_ROOT} on disk for debugging failed renders.`);
}

console.log(`\nDone: ${ok} rendered, ${skipped} skipped, ${fail} gender-pass failures (some recovered via male↔female copy).`);
if (missingJobs.length) {
  console.error(
    `\nNo valid stand PNG for these job keys (both genders missing or <800 bytes): ${missingJobs.join(", ")}`,
  );
}
process.exit(missingJobs.length > 0 ? 1 : 0);
