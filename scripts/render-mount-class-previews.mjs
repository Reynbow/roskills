/**
 * Renders **five standing Riding views** per planner class under `public/mount-on-class/<JOB_KEY>/`:
 * `forward.png`, `angled-front.png`, `left.png`, `back.png`, `angled-back.png`.
 * zrenderer `--headdir=all` exports frames in thirds (straight / right-head / left-head); slices pick
 * “front”, “¾ front”, profile/side-ish “back”, “¾ back”, and “left”.
 *
 * When boarding lists a Riding costume (+ `mounts.json`), renders that `--outfit` with riding-capable `--job` ids.
 * When boarding has **no** slot (many 1st/2nd/trans rows), borrows the same riding costume + client ids as the
 * line’s canonical high job (see `LINE_MOUNT_PREVIEW_LEADER`) so swordman/acolyte/sniper/etc. still show on mounts.
 * Novice/expansion outliers with no line leader stay idle `--outfit=1`.
 *
 * Prerequisites: zrenderer CLI + unpacked RO Renewal `data`.
 *
 * Env:
 *   RO_ZRENDERER_RESOURCES — required
 *   RENDER_MOUNT_JOBS — omit or `all` = every planner class (base + Renewal); `sample` = preview keys only; or comma keys
 *   ZRENDERER_MOUNT_CLASS_GENDER — `male` (default) or `female` — one gender per batch; five angle PNGs per class
 *   ZRENDERER_MOUNT_NO_RIDING_STEMS — if `1`, only planner job ids even when boarding has a mount
 *
 * Flags:
 *   --print-only — hints, no renders
 *   --skip-existing — skip classes when **every** angle PNG exists and is ≥800 bytes (`--force` overrides)
 *   --force — with --skip-existing, overwrite stale files
 *   --no-clean — do NOT delete `public/mount-on-class` before batch (default wipes that folder once)
 *
 * Usage:
 *   RO_ZRENDERER_RESOURCES="…/data" node scripts/render-mount-class-previews.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { buildPlannerJobsList } from "./planner-zrenderer-jobs.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT_ROOT = path.join(ROOT, "public", "mount-on-class");
/** Outputs per job after one `--headdir=all` stand export (paths under `<JOB>/`). */
const MOUNT_ANGLE_FILES = Object.freeze([
  { key: "forward", file: "forward.png" },
  { key: "angledFront", file: "angled-front.png" },
  { key: "left", file: "left.png" },
  { key: "back", file: "back.png" },
  { key: "angledBack", file: "angled-back.png" },
]);
const TMP_ROOT = path.join(ROOT, ".tmp-zrender-mount-class");
const MOUNTS_JSON = path.join(ROOT, "src", "data", "mounts.json");
const BOARDING_JSON = path.join(ROOT, "src", "data", "boarding-mount-by-job-renewal.json");
const JOB_NAMES_TXT = path.join(ROOT, "third_party", "zrenderer-win", "resolver_data", "job_names.txt");

const PRINT_ONLY = process.argv.includes("--print-only");
const SKIP_EXISTING = process.argv.includes("--skip-existing");
const FORCE = process.argv.includes("--force");
const NO_CLEAN = process.argv.includes("--no-clean");

const ACTION = Number(process.env.ZRENDERER_MOUNT_ACTION ?? process.env.ZRENDERER_STAND_ACTION ?? 0);
const STAND_FRAME_RAW = process.env.ZRENDERER_STAND_FRAME?.trim() ?? "";
const STAND_FRAME_AUTO = STAND_FRAME_RAW === "" || /^auto$/i.test(STAND_FRAME_RAW);
const STAND_PICK_FRAME_MANUAL = STAND_FRAME_AUTO ? NaN : Number(STAND_FRAME_RAW);
const STAND_LEGACY = /^(1|true|yes)$/i.test(process.env.ZRENDERER_STAND_LEGACY?.trim() ?? "");
const HEAD_DIR = process.env.ZRENDERER_HEAD_DIR ?? "left";
const HEAD_FIXED = process.env.ZRENDERER_HEAD?.trim();
const HEAD_ID_MIN = Number(process.env.ZRENDERER_HEAD_MIN ?? 1);
const HEAD_ID_MAX = Number(process.env.ZRENDERER_HEAD_MAX ?? 24);
const HEAD_SEED = process.env.ZRENDERER_MOUNT_HEAD_SEED ?? "ro-mount-class-previews";

const NO_RIDING_STEMS_GLOBAL = /^(1|true|yes)$/i.test(process.env.ZRENDERER_MOUNT_NO_RIDING_STEMS?.trim() ?? "");

const CLASS_RENDER_GENDER =
  (process.env.ZRENDERER_MOUNT_CLASS_GENDER ?? "male").trim().toLowerCase() === "female" ? "female" : "male";

/** Fallback when mounts.json has no previewJobKey values (`RENDER_MOUNT_JOBS=sample` only). */
const SAMPLE_JOBS_FALLBACK = [
  "JT_KNIGHT",
  "JT_RUNE_KNIGHT_H",
  "JT_DRAGON_KNIGHT",
  "JT_ARCHBISHOP",
  "JT_RANGER_H",
];

// --- Shared resolver stems (Korean strings match bundled resolver_data/job_names.txt) ---
const STEM_KNIGHT_LINE = ["페코페코_기사", "기사"];
const STEM_GRANDPECO_LINE = ["신페코크루세이더", "구페코크루세이더", "페코팔라딘"];
const STEM_GRYPHON_LINE = ["그리폰가드", "사자로얄가드", "imperial_guard_riding"];
const STEM_WARG_LINE = ["레인져늑대", "wolf_windhawk", "windhawk_riding", "타조레인져"];
const STEM_GX_LINE = ["켈베로스길로틴크로스"];
const STEM_MECH_LINE = ["마도기어", "meister_riding", "meister_madogear1", "미케닉멧돼지"];
const STEM_DRAGON_RK_LINE = ["dragon_knight_riding", "dragon_knight_chicken", "dragon_knight"];
const STEM_WARLOCK_LINE = ["여우워록", "arch_mage_riding", "워록"];
const STEM_SORC_LINE = ["여우소서러", "elemetal_master_riding", "소서러"];
const STEM_AB_LINE = ["아크비숍알파카", "아크비숍"];
const STEM_PERFORMER_LINE = ["타조민스트럴", "troubadour_riding", "민스트럴"];
const STEM_SURA_LINE = ["슈라알파카", "inquisitor_riding", "슈라"];
const STEM_SC_LINE = ["켈베로스쉐도우체이서", "shadow_cross_riding", "쉐도우체이서"];
const STEM_GEN_LINE = ["제네릭멧돼지", "biolo_riding", "제네릭"];
const STEM_STAR_LINE = ["sky_emperor_riding", "sky_emperor"];
const STEM_SOUL_LINE = ["soul_ascetic_riding", "해태소울리퍼", "소울리퍼"];
const STEM_SUMMON_LINE = ["spirit_handler_riding", "cart_summoner", "summoner"];
const STEM_REB_LINE = ["peco_rebellion", "rebellion"];
const STEM_RUNEK_TRANS_LINE = ["dragon_knight_riding", "dragon_knight_chicken", "사자룬나이트", "룬나이트쁘띠", "룬나이트"];

/**
 * Planner job key → stems to resolve before default planner `--job` ids.
 */
const MOUNT_PREVIEW_STEMS = {
  JT_KNIGHT: STEM_KNIGHT_LINE,
  JT_KNIGHT_H: STEM_KNIGHT_LINE,
  JT_CRUSADER: STEM_GRANDPECO_LINE,
  JT_CRUSADER_H: STEM_GRANDPECO_LINE,
  JT_RUNE_KNIGHT: STEM_DRAGON_RK_LINE,
  JT_RUNE_KNIGHT_H: STEM_RUNEK_TRANS_LINE,
  JT_DRAGON_KNIGHT: STEM_DRAGON_RK_LINE,
  JT_WARLOCK: STEM_WARLOCK_LINE,
  JT_WARLOCK_H: STEM_WARLOCK_LINE,
  JT_ARCH_MAGE: STEM_WARLOCK_LINE,
  JT_RANGER: STEM_WARG_LINE,
  JT_RANGER_H: STEM_WARG_LINE,
  JT_WINDHAWK: STEM_WARG_LINE,
  JT_ARCHBISHOP: STEM_AB_LINE,
  JT_ARCHBISHOP_H: STEM_AB_LINE,
  JT_CARDINAL: STEM_AB_LINE,
  JT_MECHANIC: STEM_MECH_LINE,
  JT_MECHANIC_H: STEM_MECH_LINE,
  JT_MEISTER: STEM_MECH_LINE,
  JT_GUILLOTINE_CROSS: STEM_GX_LINE,
  JT_GUILLOTINE_CROSS_H: STEM_GX_LINE,
  JT_SHADOW_CROSS: STEM_GX_LINE,
  JT_ROYAL_GUARD: STEM_GRYPHON_LINE,
  JT_ROYAL_GUARD_H: STEM_GRYPHON_LINE,
  JT_IMPERIAL_GUARD: STEM_GRYPHON_LINE,
  JT_SORCERER: STEM_SORC_LINE,
  JT_SORCERER_H: STEM_SORC_LINE,
  JT_ELEMENTAL_MASTER: STEM_SORC_LINE,
  JT_MINSTREL: STEM_PERFORMER_LINE,
  JT_MINSTREL_H: STEM_PERFORMER_LINE,
  JT_WANDERER: STEM_PERFORMER_LINE,
  JT_WANDERER_H: STEM_PERFORMER_LINE,
  JT_TROUBADOUR: STEM_PERFORMER_LINE,
  JT_TROUVERE: STEM_PERFORMER_LINE,
  JT_SURA: STEM_SURA_LINE,
  JT_SURA_H: STEM_SURA_LINE,
  JT_INQUISITOR: STEM_SURA_LINE,
  JT_GENETIC: STEM_GEN_LINE,
  JT_GENETIC_H: STEM_GEN_LINE,
  JT_BIOLO: STEM_GEN_LINE,
  JT_SHADOW_CHASER: STEM_SC_LINE,
  JT_SHADOW_CHASER_H: STEM_SC_LINE,
  JT_ABYSS_CHASER: STEM_SC_LINE,
  JT_REBELLION: STEM_REB_LINE,
  JT_DO_SUMMONER: STEM_SUMMON_LINE,
  JT_SPIRIT_HANDLER: STEM_SUMMON_LINE,
  JT_STAR_EMPEROR: STEM_STAR_LINE,
  JT_SKY_EMPEROR: STEM_STAR_LINE,
  JT_SOUL_REAPER: STEM_SOUL_LINE,
  JT_SOUL_ASCETIC: STEM_SOUL_LINE,
};

/**
 * Boarding rows with `mountId: null` (base / 2nd / trans) borrow this planner key’s costume + resolver stems
 * and its Renewal client `--job` try-order—the same costume_* Riding body the client uses after job-up.
 */
const LINE_MOUNT_PREVIEW_LEADER = {
  JT_SWORDMAN: "JT_KNIGHT",
  JT_MAGICIAN: "JT_ARCH_MAGE",
  JT_ACOLYTE: "JT_CARDINAL",
  JT_ARCHER: "JT_WINDHAWK",
  JT_MERCHANT: "JT_MEISTER",
  JT_THIEF: "JT_GUILLOTINE_CROSS",
  JT_PRIEST: "JT_CARDINAL",
  JT_WIZARD: "JT_ARCH_MAGE",
  JT_BLACKSMITH: "JT_MEISTER",
  JT_HUNTER: "JT_WINDHAWK",
  JT_ASSASSIN: "JT_SHADOW_CROSS",
  JT_MONK: "JT_INQUISITOR",
  JT_SAGE: "JT_ELEMENTAL_MASTER",
  JT_ROGUE: "JT_ABYSS_CHASER",
  JT_ALCHEMIST: "JT_BIOLO",
  JT_BARD: "JT_TROUBADOUR",
  JT_DANCER: "JT_WANDERER",
  JT_PRIEST_H: "JT_CARDINAL",
  JT_WIZARD_H: "JT_ARCH_MAGE",
  JT_BLACKSMITH_H: "JT_MEISTER",
  JT_HUNTER_H: "JT_WINDHAWK",
  JT_ASSASSIN_H: "JT_SHADOW_CROSS",
  JT_MONK_H: "JT_INQUISITOR",
  JT_SAGE_H: "JT_ELEMENTAL_MASTER",
  JT_ROGUE_H: "JT_ABYSS_CHASER",
  JT_ALCHEMIST_H: "JT_BIOLO",
  JT_BARD_H: "JT_TROUBADOUR",
  JT_DANCER_H: "JT_WANDERER",
};

function boardingMountSlotId(boardingRow) {
  if (!boardingRow || boardingRow.mountId == null) return "";
  const s = String(boardingRow.mountId).trim();
  if (!s || /^null$/i.test(s)) return "";
  return s;
}

/**
 * @returns {{ mountId: string, stemJobKey: string, plannerJobKeyForIds: string, linePreviewFrom: string | null }}
 */
function resolveMountRenderRouting(jobKey, byBoard) {
  const row = byBoard[jobKey];
  let slot = boardingMountSlotId(row);
  let stemJobKey = jobKey;
  let plannerJobKeyForIds = jobKey;
  let linePreviewFrom = null;

  if (!slot) {
    const leader = LINE_MOUNT_PREVIEW_LEADER[jobKey];
    if (leader) {
      const leadRow = byBoard[leader];
      slot = boardingMountSlotId(leadRow);
      if (slot) {
        stemJobKey = leader;
        plannerJobKeyForIds = leader;
        linePreviewFrom = leader;
      }
    }
  }

  return { mountId: slot, stemJobKey, plannerJobKeyForIds, linePreviewFrom };
}

function readPreviewJobKeysFromMountsFile() {
  try {
    const raw = JSON.parse(fs.readFileSync(MOUNTS_JSON, "utf8"));
    const mounts = raw.mounts;
    if (!Array.isArray(mounts)) return [];
    const keys = new Set();
    for (const m of mounts) {
      const k = String(m.previewJobKey ?? "").trim();
      if (k) keys.add(k);
    }
    return [...keys].sort();
  } catch {
    return [];
  }
}

function samplePlannerJobKeys() {
  const fromMounts = readPreviewJobKeysFromMountsFile();
  return fromMounts.length ? fromMounts : [...SAMPLE_JOBS_FALLBACK];
}

function loadMountsById() {
  const raw = JSON.parse(fs.readFileSync(MOUNTS_JSON, "utf8"));
  const mounts = raw.mounts;
  if (!Array.isArray(mounts)) throw new Error(`${MOUNTS_JSON} missing mounts[]`);
  const m = new Map();
  for (const row of mounts) {
    const id = String(row?.id ?? "").trim();
    if (id) m.set(id, row);
  }
  return m;
}

function loadBoardingByJob() {
  try {
    const raw = JSON.parse(fs.readFileSync(BOARDING_JSON, "utf8"));
    return raw.byJob && typeof raw.byJob === "object" ? raw.byJob : {};
  } catch {
    return {};
  }
}

function defaultJobKeys() {
  const env = process.env.RENDER_MOUNT_JOBS?.trim();
  if (env && env.toLowerCase() !== "all") {
    if (env.toLowerCase() === "sample") return samplePlannerJobKeys();
    return env
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return buildPlannerJobsList({ withRenewal: true }).map(([k]) => k).sort((a, b) => a.localeCompare(b));
}

function tryLoadJobNamesLowerLines() {
  try {
    return fs.readFileSync(JOB_NAMES_TXT, "utf8").split(/\r?\n/).map((l) => l.trim().toLowerCase());
  } catch {
    return [];
  }
}

/** @param {string} stem */
function clientIdsForStemLine(stem, jobLinesLower) {
  const s = String(stem || "")
    .trim()
    .toLowerCase();
  if (!s || !jobLinesLower.length) return [];
  const out = [];
  for (let i = 0; i < jobLinesLower.length; i++) {
    if (jobLinesLower[i] !== s) continue;
    const renewal = i + 3950;
    if (renewal > 4000) out.push(renewal);
    else out.push(i);
  }
  return dedupeIds(out);
}

function dedupeIds(ids) {
  const seen = new Set();
  const out = [];
  for (const n of ids) {
    if (!Number.isFinite(n) || seen.has(n)) continue;
    seen.add(n);
    out.push(n);
  }
  return out;
}

function fourthJobRidingPeer(jid) {
  if (jid >= 4252 && jid <= 4264) return jid + 13;
  return null;
}

/**
 * @param {string} jobKey
 * @param {readonly number[]} baseIds
 * @param {string[]} jobLinesLower
 */
function expandTryIdsForMountPreview(jobKey, baseIds, jobLinesLower) {
  if (NO_RIDING_STEMS_GLOBAL) return dedupeIds([...baseIds]);
  const acc = [];
  const stems = MOUNT_PREVIEW_STEMS[jobKey];
  if (stems && jobLinesLower.length) {
    for (const st of stems) acc.push(...clientIdsForStemLine(st, jobLinesLower));
  }
  for (const jid of baseIds) {
    const peer = fourthJobRidingPeer(jid);
    if (peer != null) acc.push(peer);
    acc.push(jid);
  }
  return dedupeIds(acc);
}

function idsForStandingOnly(baseIds) {
  const acc = [];
  for (const jid of baseIds) {
    const peer = fourthJobRidingPeer(jid);
    if (peer != null) acc.push(peer);
    acc.push(jid);
  }
  return dedupeIds(acc);
}

function resolveOutfitForMountJob(mountRow, jobKey) {
  const by = mountRow.outfitByJob?.[jobKey];
  if (typeof by === "number" && Number.isFinite(by) && by > 0) return by;
  const d = mountRow.outfit;
  if (typeof d === "number" && Number.isFinite(d) && d > 0) return d;
  return 1;
}

function fnv1a32(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function pickHeadId(jobKey, gender) {
  if (HEAD_FIXED !== undefined && HEAD_FIXED !== "") return String(Number(HEAD_FIXED));
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

function assertRoDataRoot(dir) {
  const datainfo = path.join(dir, "luafiles514", "lua files", "datainfo");
  if (!fs.existsSync(datainfo)) {
    console.error(
      "RO_ZRENDERER_RESOURCES does not look like an RO client data folder.\n" + `Missing: ${datainfo}`,
    );
    process.exit(1);
  }
}

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

function segmentStandThirds(maxIdx) {
  const maxframes = maxIdx + 1;
  const third = Math.floor(maxframes / 3);
  if (third < 1) return null;
  return {
    s0: { start: 0, end: Math.min(maxIdx, 1 * third - 1) },
    s1: { start: Math.min(maxIdx, 1 * third), end: Math.min(maxIdx, 2 * third - 1) },
    s2: { start: Math.min(maxIdx, 2 * third), end: maxIdx },
    maxIdx,
  };
}

function midpointFloor(a, b) {
  return Math.floor((a + b) / 2);
}

function nearestIndex(indices, target) {
  let best = indices[0];
  let bestD = Infinity;
  for (const ix of indices) {
    const d = Math.abs(ix - target);
    if (d < bestD) {
      bestD = d;
      best = ix;
    }
  }
  return best;
}

function safeMid(a, b) {
  return a <= b ? midpointFloor(a, b) : a;
}

/** Pick slice from zrenderer `--headdir=all` thirds: straight / right / left (renderer order). */
function pickStandFrameForView(indices, viewKey) {
  if (indices.length === 0) return 2;
  const maxIdx = indices[indices.length - 1];
  const maxframes = maxIdx + 1;
  if (maxframes < 3) {
    const i = Math.min(indices.length - 1, Math.max(0, Math.floor(indices.length / 2)));
    return indices[i];
  }
  const thirds = segmentStandThirds(maxIdx);
  if (!thirds) {
    const i = Math.min(indices.length - 1, Math.max(0, Math.floor(indices.length / 2)));
    return indices[i];
  }
  const { s0, s1, s2 } = thirds;
  let target = safeMid(s0.start, s0.end);
  if (viewKey === "angledFront") {
    const c0 = safeMid(s0.start, s0.end);
    target = safeMid(c0, s0.end);
  } else if (viewKey === "back") {
    target = safeMid(s1.start, s1.end);
  } else if (viewKey === "angledBack") {
    if (s2.start <= s2.end) {
      target = safeMid(s1.end, s2.start);
    } else {
      target = safeMid(s1.start, s1.end);
    }
  } else if (viewKey === "left") {
    target = safeMid(s2.start, s2.end);
  } else if (viewKey === "forward") {
    target = safeMid(s0.start, s0.end);
  }
  target = Math.min(maxIdx, Math.max(0, target));
  return nearestIndex(indices, target);
}

function resolveStandPickFrame(tmpOut, jobId, legacy, viewKey) {
  if (legacy) {
    return Number.isFinite(STAND_PICK_FRAME_MANUAL) ? STAND_PICK_FRAME_MANUAL : 2;
  }
  if (Number.isFinite(STAND_PICK_FRAME_MANUAL)) return STAND_PICK_FRAME_MANUAL;
  const indices = listSitOutputIndices(tmpOut, jobId, ACTION);
  return pickStandFrameForView(indices, viewKey);
}

function findRenderedPng(tmpOut, jobId, action, frame, legacy) {
  const id = String(jobId);
  const ordered = legacy
    ? [
        path.join(tmpOut, `${jobId}_${action}_${frame}.png`),
        path.join(tmpOut, `${id}_${action}_${frame}.png`),
        path.join(tmpOut, id, `${action}-${frame}.png`),
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
  return fallbackSize > 800 ? fallback : null;
}

function runZrendererMount(cmd, resourcePath, tmpOut, jobId, gender, headId, outfit) {
  const args = [
    `--resourcepath=${resourcePath}`,
    `--job=${jobId}`,
    `--outfit=${outfit}`,
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
  if (res.error) {
    console.error(`  spawn error: ${res.error.message}`);
  }
  return res.status === 0;
}

/** @returns {Map<string, number | readonly number[]>} */
function jobIdMapRenewalPlusBase() {
  const m = new Map();
  for (const pair of buildPlannerJobsList({ withRenewal: true })) {
    m.set(pair[0], pair[1]);
  }
  return m;
}

function flatPlannerJobIds(jobKey, idmap) {
  const raw = idmap.get(jobKey);
  if (Array.isArray(raw)) return dedupeIds([...raw]);
  if (typeof raw === "number") return [raw];
  return [];
}

if (PRINT_ONLY) {
  const jobs = defaultJobKeys();
  const idmap = jobIdMapRenewalPlusBase();
  const jl = tryLoadJobNamesLowerLines();
  const byBoard = loadBoardingByJob();

  console.log(`# Riding stand angles per class:\n  ${OUT_ROOT.replace(/\\/g, "/")}/<JOB_KEY>/{`);
  console.log(`#   ${MOUNT_ANGLE_FILES.map((x) => x.file).join(", ")}\n# }\n`);
  console.log(`# Default job scope: ALL planner classes (${buildPlannerJobsList({ withRenewal: true }).length} keys).\n`);
  console.log(`# Gender: ${CLASS_RENDER_GENDER} (override with ZRENDERER_MOUNT_CLASS_GENDER).\n`);

  const exJob =
    jobs.find((j) => boardingMountSlotId(byBoard[j])) ?? jobs.find((k) => k.startsWith("JT_RUNE")) ?? jobs[0] ?? "JT_KNIGHT";

  console.log("# Base/2nd/trans jobs with boarding mountId null reuse LINE_MOUNT_PREVIEW_LEADER (borrow high-job costume + stems).\n");

  const exPriest =
    jobs.find((j) => LINE_MOUNT_PREVIEW_LEADER[j]) ?? jobs.find((k) => k === "JT_PRIEST") ?? "JT_PRIEST";
  const rte = resolveMountRenderRouting(exPriest, byBoard);

  const baseIdsKnight = flatPlannerJobIds(exJob, idmap);
  const boarding = byBoard[exJob];
  const tryIdsMountKnight = expandTryIdsForMountPreview(exJob, baseIdsKnight, jl);
  const exWithMount =
    boarding?.mountId && typeof boarding.mountId === "string" ? boarding.mountId : boardingMountSlotId(boarding);
  console.log(`\n# Example directly mounted (${exJob}) boarding costume slot: ${exWithMount || "(none)"}`);
  console.log(`#   Riding try-order: ${JSON.stringify(tryIdsMountKnight)}`);

  const baseIdsPriestRoute = flatPlannerJobIds(rte.plannerJobKeyForIds, idmap);
  const tryLine = expandTryIdsForMountPreview(rte.stemJobKey, baseIdsPriestRoute, jl);
  console.log(`\n# Example line-preview (${exPriest}) → stems/id order from ${rte.stemJobKey}, costume slot "${rte.mountId}":`);
  console.log(`#   Riding try-order: ${JSON.stringify(tryLine)}`);
  const exIdleJob = jobs.includes("JT_NOVICE")
    ? "JT_NOVICE"
    : (jobs.find((j) => !resolveMountRenderRouting(j, byBoard).mountId) ?? "JT_NOVICE");
  const idleBase = flatPlannerJobIds(exIdleJob, idmap);

  console.log(`# Idle/no-mount (${exIdleJob}): ${JSON.stringify(idsForStandingOnly(idleBase))}`);
  process.exit(0);
}

const resourcePath = process.env.RO_ZRENDERER_RESOURCES?.trim();
if (!resourcePath) {
  console.error(
    "Set RO_ZRENDERER_RESOURCES (RO client data for zrenderer). Run with --print-only for hints.",
  );
  process.exit(1);
}
if (!fs.existsSync(resourcePath)) {
  console.error(`RO_ZRENDERER_RESOURCES does not exist:\n  ${resourcePath}`);
  process.exit(1);
}
const absRes = path.resolve(resourcePath);
assertRoDataRoot(absRes);
const zrendererPath = zrendererResourceRoot(absRes);
const zCmd = resolveZrendererCmd();

const looksLikeExplicitPath =
  zCmd.includes(path.sep) || zCmd.endsWith(".exe") || path.isAbsolute(zCmd);
if (looksLikeExplicitPath && !fs.existsSync(zCmd)) {
  console.error(`zrenderer executable not found:\n  ${zCmd}\nRun: npm run setup:zrenderer`);
  process.exit(1);
}
if (fs.existsSync(bundledZrendererExe()) && path.resolve(zCmd) === path.resolve(bundledZrendererExe())) {
  console.log(`Using bundled zrenderer: ${zCmd}\n`);
}
if (zrendererPath !== absRes) {
  console.log(`zrenderer --resourcepath: ${zrendererPath}\n(inner RO data folder: ${absRes})\n`);
}

const mountsById = loadMountsById();
const byBoard = loadBoardingByJob();
const idmap = jobIdMapRenewalPlusBase();
const jobNamesLower = tryLoadJobNamesLowerLines();

const jobKeys = defaultJobKeys();

function sleepBusySync(ms) {
  const stop = Date.now() + ms;
  while (Date.now() < stop) {
    /* sync delay for Windows EBUSY/EPERM retries */
  }
}

/** Windows often returns EBUSY if Explorer/PDF viewer/IDE has a file inside `mount-on-class` open. */
function rmTreeWithRetry(absPath, { attempts = 8, gapMs = 550 } = {}) {
  let lastErr = null;
  for (let i = 0; i < attempts; i++) {
    try {
      if (fs.existsSync(absPath)) fs.rmSync(absPath, { recursive: true, force: true });
      return true;
    } catch (e) {
      lastErr = e;
      const code = e && typeof e === "object" && "code" in e ? e.code : "";
      if (
        i < attempts - 1 &&
        (code === "EBUSY" || code === "EPERM" || code === "ENOTEMPTY" || code === "EACCES")
      ) {
        console.warn(`  clean retry ${i + 1}/${attempts - 1} (${String(code)})…`);
        sleepBusySync(gapMs);
        continue;
      }
      console.warn(
        `Could not remove ${absPath}: ${lastErr?.message ?? lastErr}\n` +
          `Close programs locking files under mount-on-class, or use --no-clean. Old PNGs may be overwritten.`,
      );
      return false;
    }
  }
  return false;
}

if (!NO_CLEAN && fs.existsSync(OUT_ROOT)) {
  console.log(`Wiping existing output folder:\n  ${OUT_ROOT}`);
  rmTreeWithRetry(OUT_ROOT);
}
fs.mkdirSync(OUT_ROOT, { recursive: true });
fs.mkdirSync(TMP_ROOT, { recursive: true });

console.log(
  `Jobs: ${jobKeys.length}; gender (single): ${CLASS_RENDER_GENDER}\n→ mount-on-class/<JOB>/{ ${MOUNT_ANGLE_FILES.map((x) => x.file).join(", ")} }\n`,
);

let ok = 0,
  skip = 0,
  fail = 0;

for (const jobKey of jobKeys) {
  const destDir = path.join(OUT_ROOT, jobKey);
  const angleDestPaths = MOUNT_ANGLE_FILES.map((x) => path.join(destDir, x.file));

  const routing = resolveMountRenderRouting(jobKey, byBoard);

  const baseIds = flatPlannerJobIds(jobKey, idmap);
  if (!baseIds.length) {
    console.error(`Skip unknown planner key (not in job map): ${jobKey}`);
    fail++;
    continue;
  }

  let outfit = 1;
  let outfitLabel = "idle (--outfit=1)";
  if (routing.mountId) {
    const mr = mountsById.get(routing.mountId);
    if (mr) {
      outfit = resolveOutfitForMountJob(mr, jobKey);
      if (routing.linePreviewFrom && typeof mr.outfitByJob?.[jobKey] !== "number") {
        const leadOut = resolveOutfitForMountJob(mr, routing.stemJobKey);
        if (leadOut > 0) outfit = leadOut;
      }
      if (routing.linePreviewFrom) {
        outfitLabel = `riding ${mr.name ?? routing.mountId} (line→${routing.stemJobKey}; --outfit=${outfit})`;
      } else {
        outfitLabel = `riding ${mr.name ?? routing.mountId} (--outfit=${outfit})`;
      }
    } else {
      console.warn(`  ! mounts.json missing mount "${routing.mountId}" for ${jobKey} — outfit 1`);
    }
  }

  const leaderIds = flatPlannerJobIds(routing.plannerJobKeyForIds, idmap);
  const tryIds = !routing.mountId
    ? idsForStandingOnly(baseIds)
    : NO_RIDING_STEMS_GLOBAL
      ? idsForStandingOnly(leaderIds.length ? leaderIds : baseIds)
      : expandTryIdsForMountPreview(routing.stemJobKey, leaderIds.length ? leaderIds : baseIds, jobNamesLower);

  if (
    SKIP_EXISTING &&
    !FORCE &&
    angleDestPaths.length > 0 &&
    angleDestPaths.every((p) => fs.existsSync(p) && fs.statSync(p).size >= 800)
  ) {
    skip++;
    continue;
  }

  const tmpOut = path.join(TMP_ROOT, jobKey.replace(/[^a-zA-Z0-9._-]+/g, "_"));
  fs.rmSync(tmpOut, { recursive: true, force: true });
  fs.mkdirSync(tmpOut, { recursive: true });
  fs.mkdirSync(destDir, { recursive: true });

  const headId = pickHeadId(jobKey, CLASS_RENDER_GENDER);
  let renderedId = null;
  for (const jid of tryIds) {
    console.log(`render · ${jobKey} · ${outfitLabel} · ${CLASS_RENDER_GENDER} · jobId ${jid}…`);
    if (runZrendererMount(zCmd, zrendererPath, tmpOut, jid, CLASS_RENDER_GENDER, headId, outfit)) {
      renderedId = jid;
      break;
    }
  }

  if (renderedId === null) {
    console.error(`  ✗ failed zrenderer (${jobKey})`);
    fail++;
    try {
      fs.rmSync(tmpOut, { recursive: true, force: true });
      fs.rmSync(destDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    continue;
  }

  let copyFail = false;
  for (const { key, file } of MOUNT_ANGLE_FILES) {
    const frame = resolveStandPickFrame(tmpOut, renderedId, STAND_LEGACY, key);
    const png = findRenderedPng(tmpOut, renderedId, ACTION, frame, STAND_LEGACY);
    if (!png) {
      console.error(`  ✗ no png (${jobKey}; view ${key}; frame ${frame})`);
      copyFail = true;
      break;
    }
    fs.copyFileSync(png, path.join(destDir, file));
  }
  if (copyFail) {
    fail++;
    try {
      fs.rmSync(tmpOut, { recursive: true, force: true });
      fs.rmSync(destDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
    continue;
  }

  console.log(`  ✓ ${destDir} (${MOUNT_ANGLE_FILES.length} views)`);
  ok++;

  try {
    fs.rmSync(tmpOut, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

console.log(`\nMount class previews (${MOUNT_ANGLE_FILES.length} angles each): ok ${ok}, skip ${skip}, fail ${fail}`);
console.log(`Output root: ${OUT_ROOT}`);
process.exit(fail > 0 ? 1 : 0);
