/**
 * Reads skillinfo/*.lua (+ optional skilldescript.lub) and emits src/data/skill-planner.json
 * — multi-class trees, prerequisites per job, English descriptions from client .lub when present,
 *   names / fallback blurbs from rAthena skill_db.yml.
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
const RATHENA_URL =
  "https://raw.githubusercontent.com/rathena/rathena/master/db/pre-re/skill_db.yml";

/** Jobs shown in the planner (1st / 2nd / transcendent 2nd from client skilltree + inherit list) */
const EXPORT_JOB_KEYS = [
  "JT_NOVICE",
  "JT_SUPERNOVICE",
  "JT_TAEKWON",
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
  JT_NINJA: "Ninja",
  JT_GUNSLINGER: "Gunslinger",
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

function parseJobInherit(text) {
  const map = {};
  const re = /\[JOBID\.(JT_[A-Z0-9_]+)\]\s*=\s*JOBID\.(JT_[A-Z0-9_]+)/g;
  let m;
  while ((m = re.exec(text))) {
    map[m[1]] = m[2];
  }
  return map;
}

function extractJobTreePairs(skilltreeText, jobKey) {
  const marker = `[JOBID.${jobKey}] = `;
  const i = skilltreeText.indexOf(marker);
  if (i === -1) return [];
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

async function fetchRathenaYaml() {
  const local = path.join(SKILLINFO, "skill_db.yml");
  if (fs.existsSync(local)) {
    return readText(local);
  }
  if (process.env.SKIP_RATHENA_FETCH === "1") {
    return "";
  }
  const res = await fetch(RATHENA_URL, {
    headers: { "User-Agent": "ro-skill-planner-import" },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

function parseRathenaSkillDb(text) {
  /** @type {Record<string, { name: string; blurb: string }>} */
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
    map[skid] = { name: display, blurb: bits.join(" · ") };
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

  if (chain[0] !== "JT_NOVICE") {
    console.warn(`[${jobKey}] inherit chain does not start at Novice:`, chain);
  }

  if (chain.length === 1) {
    const sk = extractJobTree(skilltreeText, "JT_NOVICE");
    cols.push({ title: "Novice", jobTreeKey: "JT_NOVICE", skillKeys: sk });
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

async function main() {
  const jobLua = readText(path.join(SKILLINFO, "jobinheritlist.lua"));
  const infoText = readText(path.join(SKILLINFO, "skillinfolist.txt"));
  const skillIdText = readText(path.join(SKILLINFO, "skillid.lua"));
  const skilltreeText = readText(path.join(SKILLINFO, "skilltree.lua"));
  const skidEnum = parseSkidEnum(skillIdText);
  const jobInherit = parseJobInherit(jobLua);

  let rathenaText = "";
  try {
    rathenaText = await fetchRathenaYaml();
  } catch (e) {
    console.warn("rAthena skill_db fetch failed:", e.message);
  }
  const rathena = parseRathenaSkillDb(rathenaText);

  const descriptLubPath = path.join(SKILLINFO, "skilldescript.lub");
  let skillDescripts = {};
  if (fs.existsSync(descriptLubPath)) {
    skillDescripts = parseSkillDescriptLub(readText(descriptLubPath));
    console.log(
      `Loaded ${Object.keys(skillDescripts).length} skill descriptions from skilldescript.lub`,
    );
  } else {
    console.warn("skilldescript.lub not found — using rAthena blurbs only for descriptions");
  }

  /** @type {Record<string, unknown>} */
  const jobsOut = {};

  for (const jobKey of EXPORT_JOB_KEYS) {
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
      const description =
        lubDesc ??
        ra?.blurb ??
        "No English description: add skillinfo/skilldescript.lub or skillinfo/skill_db.yml.";

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

  const out = {
    generated: new Date().toISOString(),
    source:
      "skillinfo/*.lua + skilldescript.lub (English descriptions) + rAthena skill_db.yml (names / fallback)",
    jobs: jobsOut,
  };

  const outDir = path.join(ROOT, "src", "data");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "skill-planner.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), "utf8");

  const totalSkills = Object.values(jobsOut).reduce(
    (n, j) => n + Object.keys(j.skills).length,
    0,
  );
  console.log(
    `Wrote ${outPath} (${EXPORT_JOB_KEYS.length} jobs, ~${totalSkills} skill rows total)`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
