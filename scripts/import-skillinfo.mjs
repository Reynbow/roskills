/**
 * Reads skillinfo/*.lua (+ optional skilldescript.lub) and emits src/data/skill-planner.json
 * — multi-class trees, prerequisites per job, English descriptions from client SKILL_DESCRIPT
 *   (same format as in-game / iRO wiki tooltips).
 *
 * Pre-renewal bundle: `skillinfo/skilldescript.lub` only.
 * Renewal bundle: merges `skillinfo/skilldescript_renewal.lub` (or `RENEWAL_SKILL_DESCRIPT` path)
 *   on top of the pre-renewal file so 3rd/4th-job entries and updated strings come from the
 *   renewal English client. Keys in the renewal file replace the base map. When a skill still
 *   has no substantive .lub text, rAthena skill_db.yml supplies a mechanical fallback.
 *
 * Skill grid: SKILL_TREEVIEW_FOR_JOB slot indices map to a 7-column grid
 * (col = index % 7, row = floor(index / 7)) — same layout as the in-game tree / iRO wiki.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import iconv from "iconv-lite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SKILLINFO = path.join(ROOT, "skillinfo");

/** English renewal client `skilldescript.lub` (copy or symlink). Override path with env. */
const RENEWAL_SKILL_DESCRIPT_DEFAULT = path.join(SKILLINFO, "skilldescript_renewal.lub");
const RATHENA_URL =
  "https://raw.githubusercontent.com/rathena/rathena/master/db/pre-re/skill_db.yml";
const RATHENA_URL_RENEWAL =
  "https://raw.githubusercontent.com/rathena/rathena/master/db/re/skill_db.yml";

/** Jobs shown in the planner (1st / 2nd / transcendent 2nd from client skilltree + inherit list) */
const EXPORT_JOB_KEYS = [
  "JT_NOVICE",
  "JT_SUPERNOVICE",
  "JT_TAEKWON",
  "JT_STAR",
  "JT_LINKER",
  "JT_NINJA",
  "JT_GUNSLINGER",
  "JT_SWORDMAN",
  "JT_MAGICIAN",
  "JT_ARCHER",
  "JT_ACOLYTE",
  "JT_MERCHANT",
  "JT_THIEF",
  "JT_KNIGHT",
  "JT_PRIEST",
  "JT_WIZARD",
  "JT_BLACKSMITH",
  "JT_HUNTER",
  "JT_ASSASSIN",
  "JT_CRUSADER",
  "JT_MONK",
  "JT_SAGE",
  "JT_ROGUE",
  "JT_ALCHEMIST",
  "JT_BARD",
  "JT_DANCER",
  "JT_KNIGHT_H",
  "JT_PRIEST_H",
  "JT_WIZARD_H",
  "JT_BLACKSMITH_H",
  "JT_HUNTER_H",
  "JT_ASSASSIN_H",
  "JT_CRUSADER_H",
  "JT_MONK_H",
  "JT_SAGE_H",
  "JT_ROGUE_H",
  "JT_ALCHEMIST_H",
  "JT_BARD_H",
  "JT_DANCER_H",
];

/** 3rd jobs, 4th jobs, and renewal-only branches (merged with EXPORT_JOB_KEYS for renewal bundle). */
const RENEWAL_EXTRA_JOB_KEYS = [
  "JT_RUNE_KNIGHT",
  "JT_WARLOCK",
  "JT_RANGER",
  "JT_ARCHBISHOP",
  "JT_MECHANIC",
  "JT_GUILLOTINE_CROSS",
  "JT_ROYAL_GUARD",
  "JT_SORCERER",
  "JT_MINSTREL",
  "JT_WANDERER",
  "JT_SURA",
  "JT_GENETIC",
  "JT_SHADOW_CHASER",
  "JT_RUNE_KNIGHT_H",
  "JT_WARLOCK_H",
  "JT_RANGER_H",
  "JT_ARCHBISHOP_H",
  "JT_MECHANIC_H",
  "JT_GUILLOTINE_CROSS_H",
  "JT_ROYAL_GUARD_H",
  "JT_SORCERER_H",
  "JT_MINSTREL_H",
  "JT_WANDERER_H",
  "JT_SURA_H",
  "JT_GENETIC_H",
  "JT_SHADOW_CHASER_H",
  "JT_DRAGON_KNIGHT",
  "JT_ARCH_MAGE",
  "JT_WINDHAWK",
  "JT_CARDINAL",
  "JT_MEISTER",
  "JT_SHADOW_CROSS",
  "JT_IMPERIAL_GUARD",
  "JT_BIOLO",
  "JT_ABYSS_CHASER",
  "JT_ELEMENTAL_MASTER",
  "JT_INQUISITOR",
  "JT_TROUBADOUR",
  "JT_TROUVERE",
  "JT_SUPERNOVICE2",
  "JT_KAGEROU",
  "JT_OBORO",
  "JT_REBELLION",
  "JT_DO_SUMMONER",
  "JT_STAR_EMPEROR",
  "JT_SOUL_REAPER",
  "JT_SKY_EMPEROR",
  "JT_SOUL_ASCETIC",
  "JT_NIGHT_WATCH",
  "JT_SHIRANUI",
  "JT_SHINKIRO",
  "JT_HYPER_NOVICE",
  "JT_SPIRIT_HANDLER",
];

const RENEWAL_EXPORT_JOB_KEYS = [...new Set([...EXPORT_JOB_KEYS, ...RENEWAL_EXTRA_JOB_KEYS])];

/** Client skilltree.lua often omits *_H 3rd jobs; they share the same grid as the non-trans 3rd. */
const THIRD_JOB_SKILL_TREE_FALLBACK = {
  JT_RUNE_KNIGHT_H: "JT_RUNE_KNIGHT",
  JT_WARLOCK_H: "JT_WARLOCK",
  JT_RANGER_H: "JT_RANGER",
  JT_ARCHBISHOP_H: "JT_ARCHBISHOP",
  JT_MECHANIC_H: "JT_MECHANIC",
  JT_GUILLOTINE_CROSS_H: "JT_GUILLOTINE_CROSS",
  JT_ROYAL_GUARD_H: "JT_ROYAL_GUARD",
  JT_SORCERER_H: "JT_SORCERER",
  JT_MINSTREL_H: "JT_MINSTREL",
  JT_WANDERER_H: "JT_WANDERER",
  JT_SURA_H: "JT_SURA",
  JT_GENETIC_H: "JT_GENETIC",
  JT_SHADOW_CHASER_H: "JT_SHADOW_CHASER",
};

/** In-game names for transcendent jobs (client keys end with `_H`). */
const JOB_LABEL_OVERRIDE = {
  JT_KNIGHT_H: "Lord Knight",
  JT_PRIEST_H: "High Priest",
  JT_WIZARD_H: "High Wizard",
  JT_BLACKSMITH_H: "Whitesmith",
  JT_HUNTER_H: "Sniper",
  JT_ASSASSIN_H: "Assassin Cross",
  JT_CRUSADER_H: "Paladin",
  JT_MONK_H: "Champion",
  JT_SAGE_H: "Professor",
  JT_ROGUE_H: "Stalker",
  JT_ALCHEMIST_H: "Creator",
  JT_BARD_H: "Clown",
  JT_DANCER_H: "Gypsy",
  JT_SUPERNOVICE: "Super Novice",
  JT_TAEKWON: "Taekwon Kid",
  JT_STAR: "Taekwon Master",
  JT_LINKER: "Soul Linker",
  JT_NINJA: "Ninja",
  JT_GUNSLINGER: "Gunslinger",
  JT_RUNE_KNIGHT: "Rune Knight",
  JT_RUNE_KNIGHT_H: "Rune Knight (Trans.)",
  JT_WARLOCK: "Warlock",
  JT_WARLOCK_H: "Warlock (Trans.)",
  JT_RANGER: "Ranger",
  JT_RANGER_H: "Ranger (Trans.)",
  JT_ARCHBISHOP: "Arch Bishop",
  JT_ARCHBISHOP_H: "Arch Bishop (Trans.)",
  JT_MECHANIC: "Mechanic",
  JT_MECHANIC_H: "Mechanic (Trans.)",
  JT_GUILLOTINE_CROSS: "Guillotine Cross",
  JT_GUILLOTINE_CROSS_H: "Guillotine Cross (Trans.)",
  JT_ROYAL_GUARD: "Royal Guard",
  JT_ROYAL_GUARD_H: "Royal Guard (Trans.)",
  JT_SORCERER: "Sorcerer",
  JT_SORCERER_H: "Sorcerer (Trans.)",
  JT_MINSTREL: "Minstrel",
  JT_MINSTREL_H: "Minstrel (Trans.)",
  JT_WANDERER: "Wanderer",
  JT_WANDERER_H: "Wanderer (Trans.)",
  JT_SURA: "Sura",
  JT_SURA_H: "Sura (Trans.)",
  JT_GENETIC: "Genetic",
  JT_GENETIC_H: "Genetic (Trans.)",
  JT_SHADOW_CHASER: "Shadow Chaser",
  JT_SHADOW_CHASER_H: "Shadow Chaser (Trans.)",
  JT_DRAGON_KNIGHT: "Dragon Knight",
  JT_ARCH_MAGE: "Arch Mage",
  JT_WINDHAWK: "Windhawk",
  JT_CARDINAL: "Cardinal",
  JT_MEISTER: "Meister",
  JT_SHADOW_CROSS: "Shadow Cross",
  JT_IMPERIAL_GUARD: "Imperial Guard",
  JT_BIOLO: "Biolo",
  JT_ABYSS_CHASER: "Abyss Chaser",
  JT_ELEMENTAL_MASTER: "Elemental Master",
  JT_INQUISITOR: "Inquisitor",
  JT_TROUBADOUR: "Troubadour",
  JT_TROUVERE: "Trouvere",
  JT_SUPERNOVICE2: "Super Novice (Expanded)",
  JT_KAGEROU: "Kagerou",
  JT_OBORO: "Oboro",
  JT_REBELLION: "Rebellion",
  JT_DO_SUMMONER: "Summoner",
  JT_STAR_EMPEROR: "Star Emperor",
  JT_SOUL_REAPER: "Soul Reaper",
  JT_SKY_EMPEROR: "Sky Emperor",
  JT_SOUL_ASCETIC: "Soul Ascetic",
  JT_NIGHT_WATCH: "Night Watch",
  JT_SHIRANUI: "Shiranui",
  JT_SHINKIRO: "Shinkiro",
  JT_HYPER_NOVICE: "Hyper Novice",
  JT_SPIRIT_HANDLER: "Spirit Handler",
};

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function recoverKoreanString(s) {
  if (!s) return s;
  try {
    const b = Buffer.from(s, "latin1");
    const decoded = iconv.decode(b, "cp949");
    if (/[\uAC00-\uD7AF]/.test(decoded)) return decoded;
  } catch {
    /* ignore */
  }
  return s;
}

function braceContents(str, openBraceIdx) {
  let depth = 0;
  for (let i = openBraceIdx; i < str.length; i++) {
    const c = str[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return [str.slice(openBraceIdx + 1, i), i + 1];
    }
  }
  return [null, -1];
}

function findSkillBlock(fullText, skidKey) {
  const marker = `[SKID.${skidKey}] = `;
  const start = fullText.indexOf(marker);
  if (start === -1) return null;
  let i = start + marker.length;
  while (i < fullText.length && /\s/.test(fullText[i])) i++;
  if (fullText[i] !== "{") return null;
  const [inner] = braceContents(fullText, i);
  return inner;
}

function parseMaxLv(inner) {
  const m = inner.match(/MaxLv\s*=\s*(\d+)/);
  return m ? parseInt(m[1], 10) : 1;
}

function parseSkillType(inner) {
  const m = inner.match(/Type\s*=\s*"([^"]+)"/);
  return m ? m[1] : null;
}

function parseNeedPairs(tableInner) {
  const pairs = [];
  const re = /\{\s*SKID\.([A-Z0-9_]+)\s*,\s*(\d+)\s*\}/g;
  let m;
  while ((m = re.exec(tableInner))) {
    pairs.push({ skid: m[1], level: parseInt(m[2], 10) });
  }
  return pairs;
}

function innerTableAfterKey(skillInner, key, subKey) {
  const re = new RegExp(`(?<![A-Za-z_])${key}\\s*=\\s*\\{`);
  const km = skillInner.match(re);
  if (!km) return null;
  const openIdx = skillInner.indexOf("{", km.index);
  const [needOuter] = braceContents(skillInner, openIdx);
  if (!needOuter) return null;

  if (subKey) {
    const subMarker = `[${subKey}]`;
    const si = needOuter.indexOf(subMarker);
    if (si === -1) return null;
    const eq = needOuter.indexOf("=", si);
    let j = eq + 1;
    while (j < needOuter.length && /\s/.test(needOuter[j])) j++;
    if (needOuter[j] !== "{") return null;
    const [inner] = braceContents(needOuter, j);
    return inner;
  }

  return needOuter;
}

/** Job-specific NeedSkillList branch, then _NeedSkillList */
function extractPrereqPairs(skillInner, needJobKey) {
  const branch = innerTableAfterKey(
    skillInner,
    "NeedSkillList",
    `JOBID.${needJobKey}`,
  );
  if (branch) {
    const p = parseNeedPairs(branch);
    if (p.length) return p;
  }
  const unders = innerTableAfterKey(skillInner, "_NeedSkillList", null);
  if (unders) return parseNeedPairs(unders);
  return [];
}

function parseSkidEnum(text) {
  const map = {};
  const re = /\t([A-Z0-9_]+)\s*=\s*(\d+),?/g;
  let m;
  while ((m = re.exec(text))) {
    map[m[1]] = parseInt(m[2], 10);
  }
  return map;
}

/**
 * Skill column chains must follow JOB_INHERIT_LIST only. JOB_INHERIT_LIST2 is for UI/skill-tab
 * linking and would incorrectly skip tiers (e.g. Rune Knight H → Rune Knight → Knight, dropping Lord Knight).
 */
function parseJobInherit(text) {
  const startMarker = "JOB_INHERIT_LIST = {";
  const start = text.indexOf(startMarker);
  const list2 = text.indexOf("JOB_INHERIT_LIST2 = {", start + 1);
  const block =
    start === -1
      ? text
      : list2 === -1
        ? text.slice(start)
        : text.slice(start, list2);
  const map = {};
  const re = /\[JOBID\.(JT_[A-Z0-9_]+)\]\s*=\s*JOBID\.(JT_[A-Z0-9_]+)/g;
  let m;
  while ((m = re.exec(block))) {
    map[m[1]] = m[2];
  }
  return map;
}

function extractJobTreePairs(skilltreeText, jobKey) {
  const marker = `[JOBID.${jobKey}] = `;
  const i = skilltreeText.indexOf(marker);
  if (i === -1) {
    const fb = THIRD_JOB_SKILL_TREE_FALLBACK[jobKey];
    return fb ? extractJobTreePairs(skilltreeText, fb) : [];
  }
  let j = i + marker.length;
  while (j < skilltreeText.length && skilltreeText[j] !== "{") j++;
  if (skilltreeText[j] !== "{") return [];
  const [inner] = braceContents(skilltreeText, j);
  if (!inner) return [];
  const pairs = [];
  const re = /\[\s*(\d+)\s*\]\s*=\s*SKID\.([A-Z0-9_]+)/g;
  let m;
  while ((m = re.exec(inner))) {
    pairs.push({ grid: parseInt(m[1], 10), skid: m[2] });
  }
  pairs.sort((a, b) => a.grid - b.grid);
  if (pairs.length === 0) {
    const fb = THIRD_JOB_SKILL_TREE_FALLBACK[jobKey];
    if (fb) return extractJobTreePairs(skilltreeText, fb);
  }
  return pairs;
}

function extractJobTree(skilltreeText, jobKey) {
  return extractJobTreePairs(skilltreeText, jobKey).map((p) => p.skid);
}

function plannerIdFromSkid(skidKey) {
  return skidKey.toLowerCase();
}

function jobDisplayName(jobKey) {
  if (JOB_LABEL_OVERRIDE[jobKey]) return JOB_LABEL_OVERRIDE[jobKey];
  if (jobKey === "JT_NOVICE") return "Novice";
  const rest = jobKey.replace(/^JT_/, "").replace(/_/g, " ").toLowerCase();
  return rest.replace(/\b\w/g, (c) => c.toUpperCase());
}

async function fetchRathenaYaml(url, label) {
  const local = path.join(SKILLINFO, "skill_db.yml");
  if (fs.existsSync(local) && url === RATHENA_URL) {
    return readText(local);
  }
  const localRe = path.join(SKILLINFO, "skill_db_re.yml");
  if (fs.existsSync(localRe) && url === RATHENA_URL_RENEWAL) {
    return readText(localRe);
  }
  if (process.env.SKIP_RATHENA_FETCH === "1") {
    return "";
  }
  let res;
  try {
    res = await fetch(url, {
      headers: { "User-Agent": "ro-skill-planner-import" },
      signal: AbortSignal.timeout(25_000),
    });
  } catch (e) {
    const name = e && typeof e === "object" && "name" in e ? e.name : "";
    if (name === "AbortError" || name === "TimeoutError") {
      throw new Error(
        `Timed out fetching rAthena ${label} (25s). Put a copy under skillinfo/, fix the network, or set SKIP_RATHENA_FETCH=1.`,
      );
    }
    throw e;
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

/**
 * Pull scalar `Key: value` lines from one rAthena skill_db.yml block (2-space-indented skill fields).
 */
function rathenaScalar(raw, key) {
  const m = raw.match(new RegExp(`\\n\\s*${key}:\\s*(\\S[^\\r\\n]*)\\s*(?:\\r?\\n|$)`));
  return m ? m[1].trim() : null;
}

/**
 * Parse `- Level: n` / `  ValueKey: v` tables inside a skill block (SpCost, CastTime, SplashArea, …).
 */
function rathenaLevelValueTable(raw, tableKey, valueKey) {
  const re = new RegExp(
    `\\n\\s*${tableKey}:\\s*\\n((?:\\s*-\\s*Level:\\s*\\d+\\s*\\n\\s*${valueKey}:\\s*[^\\r\\n]+\\s*\\n?)+)`,
    "m",
  );
  const m = raw.match(re);
  if (!m) return [];
  const body = m[1];
  const pairRe = new RegExp(
    `-\\s*Level:\\s*(\\d+)\\s*\\n\\s*${valueKey}:\\s*([^\\r\\n]+)`,
    "g",
  );
  const pairs = [];
  let pm;
  while ((pm = pairRe.exec(body))) {
    pairs.push({ level: parseInt(pm[1], 10), value: pm[2].trim() });
  }
  return pairs;
}

function formatMs(ms) {
  const n = parseInt(ms, 10);
  if (Number.isNaN(n)) return ms;
  if (n === 0) return "instant";
  if (n >= 1000 && n % 1000 === 0) return `${n / 1000}s`;
  return `${n}ms`;
}

/**
 * Multiline planner text from one skill_db.yml entry (used when client skilldescript.lub has no entry).
 */
function buildRathenaDetailBlurb(raw) {
  const lines = [];
  const desc = raw.match(/Description:\s*(.+?)(?:\r?\n)/)?.[1]?.trim() ?? "";
  const maxLv = rathenaScalar(raw, "MaxLevel");
  const type = rathenaScalar(raw, "Type");
  const target = rathenaScalar(raw, "TargetType");
  const element = rathenaScalar(raw, "Element");
  const range = rathenaScalar(raw, "Range");
  const hit = rathenaScalar(raw, "Hit");
  const hitCount = rathenaScalar(raw, "HitCount");
  const acd = rathenaScalar(raw, "AfterCastActDelay");
  const fct = rathenaScalar(raw, "FixedCastTime");
  const dur1 = rathenaScalar(raw, "Duration1");
  const dur2 = rathenaScalar(raw, "Duration2");
  const cooldown = rathenaScalar(raw, "Cooldown");

  if (desc) lines.push(desc);
  if (maxLv) lines.push(`Max level: ${maxLv}`);
  if (type) lines.push(`Type: ${type}`);
  if (target) lines.push(`Target: ${target}`);
  if (element) lines.push(`Element: ${element}`);
  if (range != null) {
    const r = parseInt(range, 10);
    lines.push(Number.isFinite(r) && r < 0 ? "Range: melee" : `Range: ${range} cells`);
  }
  const hc = hitCount != null ? parseInt(hitCount, 10) : NaN;
  const hcOk = Number.isFinite(hc) && hc > 0;
  if (hit) lines.push(`Hit: ${hit}${hcOk ? ` × ${hc}` : ""}`);
  else if (hcOk) lines.push(`Hit count: ${hc}`);

  const sp = rathenaLevelValueTable(raw, "SpCost", "Amount");
  if (sp.length) {
    const amounts = sp.map((p) => p.value);
    const uniq = [...new Set(amounts)];
    if (uniq.length === 1) lines.push(`SP cost (all levels): ${uniq[0]}`);
    else
      lines.push(
        `SP cost: ${amounts[0]} (Lv.1) … ${amounts[amounts.length - 1]} (Lv.${sp[sp.length - 1].level})`,
      );
  }

  const ct = rathenaLevelValueTable(raw, "CastTime", "Time");
  if (ct.length) {
    const t0 = ct[0].value;
    const t1 = ct[ct.length - 1].value;
    if (t0 === t1) lines.push(`Variable cast: ${formatMs(t0)} (all levels)`);
    else
      lines.push(
        `Variable cast: ${formatMs(t0)} (Lv.1) … ${formatMs(t1)} (Lv.${ct[ct.length - 1].level})`,
      );
  }
  if (fct != null && fct !== "0") lines.push(`Fixed cast: ${formatMs(fct)}`);
  if (acd != null && acd !== "0") lines.push(`After-cast delay: ${formatMs(acd)}`);

  const splash = rathenaLevelValueTable(raw, "SplashArea", "Area");
  if (splash.length) {
    const a0 = splash[0].value;
    const a1 = splash[splash.length - 1].value;
    if (a0 === a1) lines.push(`Splash area: ${a1} cells`);
    else lines.push(`Splash area: ${a0} (Lv.1) … ${a1} (Lv.${splash[splash.length - 1].level})`);
  }

  if (dur1 != null && dur1 !== "0") lines.push(`Duration: ${formatMs(dur1)}`);
  if (dur2 != null && dur2 !== "0" && dur2 !== dur1) lines.push(`Duration (alt): ${formatMs(dur2)}`);
  if (cooldown != null && cooldown !== "0") lines.push(`Cooldown: ${formatMs(cooldown)}`);

  const detail = lines.join("\n").trim();
  return detail || null;
}

/** Client .lub sometimes only has the skill title (one short line) — treat as missing for tooltip purposes. */
function skillDescriptIsRich(text) {
  if (!text || !String(text).trim()) return false;
  if (String(text).includes("\n")) return true;
  return String(text).trim().length >= 120;
}

function parseRathenaSkillDb(text) {
  /** @type {Record<string, { name: string; blurb: string; detail: string | null }>} */
  const map = {};
  if (!text) return map;
  const parts = text.split(/\n(?=\s*-\s*Id:\s*\d+)/);
  for (const raw of parts) {
    const skid = raw.match(/Name:\s*(\S+)/)?.[1];
    if (!skid) continue;
    const desc = raw.match(/Description:\s*(.+?)(?:\r?\n)/)?.[1]?.trim() ?? "";
    const type = raw.match(/\n\s*Type:\s*(\S+)\s*(?:\r?\n|$)/)?.[1];
    const target = raw.match(/\n\s*TargetType:\s*(\S+)\s*(?:\r?\n|$)/)?.[1];
    const display = desc || skid.replace(/_/g, " ");
    const bits = [display];
    if (type) bits.push(`Type: ${type}`);
    if (target) bits.push(`Target: ${target}`);
    const detail = buildRathenaDetailBlurb(raw);
    map[skid] = { name: display, blurb: bits.join(" · "), detail };
  }
  return map;
}

/** RO client text colour codes e.g. ^777777 … ^000000 */
function stripRoColorCodes(s) {
  return s.replace(/\^[0-9a-fA-F]{6}/g, "");
}

/** Some lines use a numeric width prefix before a colour code, e.g. 17^CC3399Requirement → Requirement */
function cleanDescriptLine(s) {
  const noColor = stripRoColorCodes(s.replace(/\r/g, ""));
  return noColor.replace(/^(\d{1,3})(?=[A-Za-z])/, "");
}

/** Extract consecutive "..." string literals from a Lua table body (handles \\ escapes). */
function parseLuaStringLiterals(inner) {
  const parts = [];
  for (let i = 0; i < inner.length; ) {
    const q = inner.indexOf('"', i);
    if (q === -1) break;
    let j = q + 1;
    let buf = "";
    while (j < inner.length) {
      const c = inner[j];
      if (c === "\\") {
        j++;
        buf += j < inner.length ? inner[j++] : "";
        continue;
      }
      if (c === '"') {
        j++;
        break;
      }
      buf += c;
      j++;
    }
    parts.push(buf);
    i = j;
  }
  return parts;
}

/**
 * Parse skillinfo/skilldescript.lub (SKILL_DESCRIPT = { [SKID.X] = { "line", ... }, ... }).
 * @returns {Record<string, string>} skidKey -> plain multiline description
 */
function parseSkillDescriptLub(text) {
  /** @type {Record<string, string>} */
  const map = {};
  if (!text || !text.includes("SKILL_DESCRIPT")) return map;
  const re = /\[SKID\.([A-Z0-9_]+)\]\s*=\s*\{/g;
  let m;
  while ((m = re.exec(text))) {
    const skidKey = m[1];
    const openIdx = m.index + m[0].length - 1;
    const [inner] = braceContents(text, openIdx);
    if (inner == null) continue;
    const lines = parseLuaStringLiterals(inner);
    const desc = lines
      .map((line) => cleanDescriptLine(line))
      .join("\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{4,}/g, "\n\n\n")
      .trim();
    if (desc) map[skidKey] = desc;
  }
  return map;
}

/** [JT_NOVICE, first, second, …, jobKey] following JOB_INHERIT_LIST (child → parent). */
function jobChainFromNovice(jobKey, jobInherit) {
  const rev = [];
  let k = jobKey;
  const seen = new Set();
  while (k && !seen.has(k)) {
    seen.add(k);
    rev.push(k);
    k = jobInherit[k];
    if (rev.length > 40) break;
  }
  return rev.reverse();
}

/**
 * One content column per job tier after Novice: merged Novice+1st grid, then 2nd, transcendent, …
 * Matches client trees (novice + first class share slot indices on one sheet).
 */
function buildColumnsForJob(jobKey, jobInherit, skilltreeText) {
  /** @type {{ title: string; jobTreeKey: string; skillKeys: string[]; gridJobs?: string[] }[]} */
  const cols = [];
  const chain = jobChainFromNovice(jobKey, jobInherit);

  if (chain.length === 0) return cols;

  /** Summoner line: client inherit starts at JT_DO_SUMMONER (no Novice). */
  if (chain[0] === "JT_DO_SUMMONER") {
    for (let i = 0; i < chain.length; i++) {
      const jk = chain[i];
      cols.push({
        title: jobDisplayName(jk),
        jobTreeKey: jk,
        skillKeys: extractJobTree(skilltreeText, jk),
      });
    }
    return cols;
  }

  if (chain[0] !== "JT_NOVICE") {
    console.warn(`[${jobKey}] inherit chain does not start at Novice:`, chain);
  }

  if (chain.length === 1) {
    if (chain[0] === "JT_NOVICE") {
      const sk = extractJobTree(skilltreeText, "JT_NOVICE");
      cols.push({ title: "Novice", jobTreeKey: "JT_NOVICE", skillKeys: sk });
      return cols;
    }
    const solo = chain[0];
    cols.push({
      title: jobDisplayName(solo),
      jobTreeKey: solo,
      skillKeys: extractJobTree(skilltreeText, solo),
    });
    return cols;
  }

  const noviceSk = extractJobTree(skilltreeText, "JT_NOVICE");
  const firstClassKey = chain[1];
  const firstSk = extractJobTree(skilltreeText, firstClassKey);
  cols.push({
    title: jobDisplayName(firstClassKey),
    jobTreeKey: firstClassKey,
    skillKeys: [...noviceSk, ...firstSk],
    gridJobs: ["JT_NOVICE", firstClassKey],
  });

  for (let i = 2; i < chain.length; i++) {
    const jk = chain[i];
    cols.push({
      title: jobDisplayName(jk),
      jobTreeKey: jk,
      skillKeys: extractJobTree(skilltreeText, jk),
    });
  }
  return cols;
}

function isQuestSkill(skillInner) {
  const t = parseSkillType(skillInner);
  return t === "Quest" || t === "Soul";
}

/**
 * @param {string[]} exportKeys
 * @param {Record<string, { name: string; blurb: string; detail: string | null }>} rathena
 */
function buildJobsOut(
  exportKeys,
  rathena,
  jobInherit,
  skilltreeText,
  infoText,
  skidEnum,
  skillDescripts,
) {
  /** @type {Record<string, unknown>} */
  const jobsOut = {};

  for (const jobKey of exportKeys) {
    const rawCols = buildColumnsForJob(jobKey, jobInherit, skilltreeText);
    const questSkids = new Set();

    for (const c of rawCols) {
      for (const skid of c.skillKeys) {
        const inner = findSkillBlock(infoText, skid);
        if (inner && isQuestSkill(inner)) questSkids.add(skid);
      }
    }

    const dataCols = [];
    const placedSkids = new Set();
    /** @type {Map<string, number>} */
    const skidGridIndex = new Map();

    for (const c of rawCols) {
      if (c.gridJobs?.length) {
        for (const jk of c.gridJobs) {
          const pairs = extractJobTreePairs(skilltreeText, jk);
          for (const { grid, skid } of pairs) {
            if (!questSkids.has(skid) && c.skillKeys.includes(skid)) {
              skidGridIndex.set(skid, grid);
            }
          }
        }
      } else {
        const pairs = extractJobTreePairs(skilltreeText, c.jobTreeKey);
        for (const { grid, skid } of pairs) {
          if (!questSkids.has(skid)) skidGridIndex.set(skid, grid);
        }
      }
      const keys = c.skillKeys.filter((sk) => !questSkids.has(sk));
      dataCols.push({
        title: c.title,
        skillIds: keys.map((sk) => plannerIdFromSkid(sk)),
      });
      keys.forEach((sk) => placedSkids.add(sk));
    }

    const questList = [...questSkids].sort();
    if (questList.length) {
      dataCols.push({
        title: "Quest / special",
        skillIds: questList.map((sk) => plannerIdFromSkid(sk)),
      });
      questList.forEach((sk, qi) => {
        placedSkids.add(sk);
        skidGridIndex.set(sk, qi);
      });
    }

    const skills = {};
    const edges = [];

    for (const skidKey of placedSkids) {
      const inner = findSkillBlock(infoText, skidKey);
      if (!inner) {
        console.warn(`[${jobKey}] missing SKILL_INFO_LIST ${skidKey}`);
        continue;
      }
      const pid = plannerIdFromSkid(skidKey);
      const ra = rathena[skidKey];
      const name = ra?.name ?? skidKey.replace(/_/g, " ");
      const lubDesc = skillDescripts[skidKey];
      const richLub = skillDescriptIsRich(lubDesc) ? lubDesc : null;
      const description =
        richLub ??
        ra?.detail ??
        lubDesc ??
        ra?.blurb ??
        "No English description: add skillinfo/skilldescript.lub (and skilldescript_renewal.lub for renewal), or skillinfo/skill_db.yml.";

      skills[pid] = {
        id: pid,
        skidKey,
        skidId: skidEnum[skidKey] ?? null,
        name,
        maxLevel: parseMaxLv(inner),
        description,
        gridIndex: skidGridIndex.get(skidKey) ?? 0,
      };

      const prereqs = extractPrereqPairs(inner, jobKey);
      for (const p of prereqs) {
        if (!placedSkids.has(p.skid)) continue;
        edges.push({
          fromId: plannerIdFromSkid(p.skid),
          toId: pid,
          requiredLevel: p.level,
        });
      }
    }

    jobsOut[jobKey] = {
      key: jobKey,
      label: jobDisplayName(jobKey),
      columns: dataCols,
      skills,
      edges,
    };
  }

  return jobsOut;
}

async function main() {
  const jobLua = readText(path.join(SKILLINFO, "jobinheritlist.lua"));
  const infoText = readText(path.join(SKILLINFO, "skillinfolist.txt"));
  const skillIdText = readText(path.join(SKILLINFO, "skillid.lua"));
  const skilltreeText = readText(path.join(SKILLINFO, "skilltree.lua"));
  const skidEnum = parseSkidEnum(skillIdText);
  const jobInherit = parseJobInherit(jobLua);

  let rathenaTextPre = "";
  try {
    rathenaTextPre = await fetchRathenaYaml(RATHENA_URL, "pre-re skill_db.yml");
  } catch (e) {
    console.warn("rAthena pre-re skill_db fetch failed:", e.message);
  }
  let rathenaTextRe = "";
  try {
    rathenaTextRe = await fetchRathenaYaml(RATHENA_URL_RENEWAL, "renewal skill_db.yml");
  } catch (e) {
    console.warn("rAthena renewal skill_db fetch failed:", e.message);
  }
  const rathenaPre = parseRathenaSkillDb(rathenaTextPre);
  const rathenaRe = parseRathenaSkillDb(rathenaTextRe);

  const descriptLubPath = path.join(SKILLINFO, "skilldescript.lub");
  let skillDescriptsPre = {};
  if (fs.existsSync(descriptLubPath)) {
    skillDescriptsPre = parseSkillDescriptLub(readText(descriptLubPath));
    console.log(
      `Loaded ${Object.keys(skillDescriptsPre).length} skill descriptions from skilldescript.lub`,
    );
  } else {
    console.warn("skilldescript.lub not found — using rAthena blurbs only for descriptions");
  }

  const renewalDescriptPath = process.env.RENEWAL_SKILL_DESCRIPT
    ? path.resolve(process.env.RENEWAL_SKILL_DESCRIPT)
    : RENEWAL_SKILL_DESCRIPT_DEFAULT;
  let skillDescriptsRenewalOverlay = {};
  if (fs.existsSync(renewalDescriptPath)) {
    skillDescriptsRenewalOverlay = parseSkillDescriptLub(readText(renewalDescriptPath));
    const n = Object.keys(skillDescriptsRenewalOverlay).length;
    console.log(
      `Loaded ${n} skill descriptions from renewal overlay (${path.relative(ROOT, renewalDescriptPath)})`,
    );
  } else {
    console.warn(
      `Renewal prose: no file at ${path.relative(ROOT, renewalDescriptPath)} — renewal tooltips use pre-renewal .lub + rAthena fallbacks. Copy the English renewal client's skilldescript.lub here (or set RENEWAL_SKILL_DESCRIPT).`,
    );
  }
  /** Renewal: renewal client strings override pre-renewal .lub per SKID. */
  const skillDescriptsForRenewal = { ...skillDescriptsPre, ...skillDescriptsRenewalOverlay };

  const jobsPre = buildJobsOut(
    EXPORT_JOB_KEYS,
    rathenaPre,
    jobInherit,
    skilltreeText,
    infoText,
    skidEnum,
    skillDescriptsPre,
  );
  const jobsRe = buildJobsOut(
    RENEWAL_EXPORT_JOB_KEYS,
    rathenaRe,
    jobInherit,
    skilltreeText,
    infoText,
    skidEnum,
    skillDescriptsForRenewal,
  );

  const outDir = path.join(ROOT, "src", "data");
  fs.mkdirSync(outDir, { recursive: true });
  const generated = new Date().toISOString();
  const baseSourcePre =
    "skillinfo/*.lua + skilldescript.lub (English descriptions) + rAthena skill_db.yml (names / fallback)";
  const baseSourceRe =
    "skillinfo/*.lua + skilldescript.lub + skilldescript_renewal.lub (merged English SKILL_DESCRIPT) + rAthena skill_db.yml (names / fallback)";

  const outPathPre = path.join(outDir, "skill-planner.json");
  fs.writeFileSync(
    outPathPre,
    JSON.stringify(
      {
        generated,
        gameMode: "pre",
        source: `${baseSourcePre} [pre-re db/pre-re/skill_db.yml]`,
        jobs: jobsPre,
      },
      null,
      2,
    ),
    "utf8",
  );

  const outPathRe = path.join(outDir, "skill-planner-renewal.json");
  fs.writeFileSync(
    outPathRe,
    JSON.stringify(
      {
        generated,
        gameMode: "renewal",
        source: `${baseSourceRe} [renewal db/re/skill_db.yml]`,
        jobs: jobsRe,
      },
      null,
      2,
    ),
    "utf8",
  );

  const totalPre = Object.values(jobsPre).reduce((n, j) => n + Object.keys(j.skills).length, 0);
  const totalRe = Object.values(jobsRe).reduce((n, j) => n + Object.keys(j.skills).length, 0);
  console.log(
    `Wrote ${outPathPre} (${EXPORT_JOB_KEYS.length} jobs, ~${totalPre} skill rows total)`,
  );
  console.log(
    `Wrote ${outPathRe} (${RENEWAL_EXPORT_JOB_KEYS.length} jobs, ~${totalRe} skill rows total)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
