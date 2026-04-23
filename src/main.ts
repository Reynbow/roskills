import "./style.css";
import { inject } from "@vercel/analytics";
import {
  listJobPickerTabs,
  listJobs,
  getJobData,
  buildSkillsForJob,
  getEdgesForJob,
  makeSkillMap,
  GRID_COLS,
  isQuestColumnTitle,
  shouldMergeTranscendentIntoSecondPanel,
  type JobData,
  type JobPickerSection,
  type JobPickerTabDef,
  type SkillDef,
  type PrereqEdge,
} from "./planner-data";
import { jobPreviewSpriteUrl } from "./job-previews";
import { jobSitLocalPngUrl, jobSitPortraitFallbackUrl } from "./job-sit-sprite";

// Initialize Vercel Web Analytics (never block app shell if script fails)
try {
  inject();
} catch {
  /* ignore */
}

const STORAGE_KEY = "ro-planner-state-v2";
const DEFAULT_JOB = "JT_PRIEST";

/** If stored or default job key is missing from bundled data, fall back so the tree can render. */
function ensureCurrentJobInData(): void {
  if (getJobData(currentJob)) return;
  currentJob = DEFAULT_JOB;
  if (getJobData(currentJob)) return;
  const first = listJobs()[0]?.key;
  if (first) currentJob = first;
}

/** Client skill icons by SKID (same numeric id as rAthena / planner `skidId`). Divine Pride: singular `skill`, not `skills`. */
function skillIconUrl(skidId: number): string {
  return `https://static.divine-pride.net/images/skill/${skidId}.png`;
}

/** Skill points per tree column when tiers are separate: merged novice+1st, 2nd, third (quest/special excluded). */
const CLASS_SKILL_CAPS: readonly number[] = [49, 50, 50];

/** Single merged-column jobs that use a non-default tier-0 class point cap (rest use CLASS_SKILL_CAPS[0]). */
const TIER0_CLASS_CAP_OVERRIDE: Partial<Record<string, number>> = {
  /** Super Novice: total class pool is 99 (server rule). */
  JT_SUPERNOVICE: 99,
  /** Expanded classes: job level 70 → 70 class skill points (Basic Skill still exempt). */
  JT_TAEKWON: 70,
  JT_STAR: 70,
  JT_LINKER: 70,
  JT_NINJA: 70,
  JT_GUNSLINGER: 70,
};

/** Transcendent jobs: second + transcendent columns share one pool (replaces separate 50+50). */
const TRANSCENDENT_COMBINED_SECOND_CAP = 70;

/** Basic Skill does not consume the per-class skill point budget (matches common planner / in-game treatment). */
const BASIC_SKILL_ID = "nv_basic";

function exemptFromClassSkillCap(skillId: string): boolean {
  return skillId === BASIC_SKILL_ID;
}

type Stored = {
  lastJob?: string;
  jobs: Record<string, { levels: Record<string, number>; budget?: number }>;
  /** When true, prereq ring on hover stays but unrelated skills are not dimmed. */
  disableHoverSkillDimming?: boolean;
};

let currentJob = DEFAULT_JOB;
let levels: Record<string, number> = {};
let skills: SkillDef[] = [];
let edges: PrereqEdge[] = [];
let skillMap = new Map<string, SkillDef>();

/** While a skill is hovered: which skill, and pip fill counts for transitive prereqs (required levels). */
let focusHoverSkillId: string | null = null;
let focusPrereqDisplayLevels: Map<string, number> | null = null;

/** When true, hovering (or a pinned tooltip) still highlights the prereq chain but does not dim other skills. */
let disableHoverSkillDimming = false;

function loadState(): void {
  disableHoverSkillDimming = false;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const data = JSON.parse(raw) as Stored;
    if (data.lastJob && getJobData(data.lastJob)) currentJob = data.lastJob;
    if (data.disableHoverSkillDimming === true) disableHoverSkillDimming = true;
  } catch {
    /* ignore */
  }
}

function persistDisableHoverSkillDimming(): void {
  let raw: Stored = { jobs: {} };
  try {
    raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Stored;
  } catch {
    raw = { jobs: {} };
  }
  if (!raw.jobs) raw.jobs = {};
  if (disableHoverSkillDimming) raw.disableHoverSkillDimming = true;
  else delete raw.disableHoverSkillDimming;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
}

function saveState(): void {
  let raw: Stored = { jobs: {} };
  try {
    raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Stored;
  } catch {
    raw = { jobs: {} };
  }
  if (!raw.jobs) raw.jobs = {};
  raw.lastJob = currentJob;
  raw.jobs[currentJob] = { levels };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
}

function clampLevelToSkill(s: SkillDef, v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(Math.floor(v), s.maxLevel));
}

/**
 * @param presetLevels When set, levels come from this map (share URL). When omitted, load from localStorage for `jobKey`.
 */
function applyJob(jobKey: string, presetLevels?: Record<string, number> | null): void {
  const j = getJobData(jobKey);
  if (!j) return;
  currentJob = jobKey;
  skills = buildSkillsForJob(jobKey);
  edges = getEdgesForJob(jobKey);
  skillMap = makeSkillMap(skills);

  if (presetLevels != null) {
    levels = {};
    for (const s of skills) {
      const v = presetLevels[s.id];
      levels[s.id] = clampLevelToSkill(s, v);
    }
    return;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const data = JSON.parse(raw) as Stored;
      const slot = data.jobs?.[jobKey];
      if (slot?.levels) {
        levels = {};
        for (const s of skills) {
          const v = slot.levels[s.id];
          levels[s.id] = clampLevelToSkill(s, v);
        }
      } else levels = {};
    } else {
      levels = {};
    }
  } catch {
    levels = {};
  }

  for (const s of skills) {
    if (levels[s.id] === undefined) levels[s.id] = 0;
  }
}

const SHARE_QUERY = "share";
const SHARE_JSON_VERSION = 1;

function encodeSharePayload(): string {
  const l: Record<string, number> = {};
  for (const [id, n] of Object.entries(levels)) {
    if (n > 0) l[id] = n;
  }
  const payload = { v: SHARE_JSON_VERSION, j: currentJob, l };
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeSharePayload(token: string): { j: string; l: Record<string, number> } | null {
  try {
    let b64 = token.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    const o = JSON.parse(json) as {
      v?: number;
      j?: string;
      l?: Record<string, unknown>;
    };
    if (!o || typeof o.j !== "string" || !getJobData(o.j)) return null;
    if (!o.l || typeof o.l !== "object") return null;
    const l: Record<string, number> = {};
    for (const [k, v] of Object.entries(o.l)) {
      const n = typeof v === "number" ? v : Number.parseInt(String(v), 10);
      if (Number.isFinite(n) && n > 0) l[k] = Math.floor(n);
    }
    return { j: o.j, l };
  } catch {
    return null;
  }
}

function readShareFromUrl(): { j: string; l: Record<string, number> } | null {
  try {
    const token = new URL(window.location.href).searchParams.get(SHARE_QUERY);
    if (!token || !token.trim()) return null;
    return decodeSharePayload(token.trim());
  } catch {
    return null;
  }
}

function getSkill(id: string): SkillDef | undefined {
  return skillMap.get(id);
}

function skillsByColumn(col: number): SkillDef[] {
  return skills.filter((s) => s.column === col).sort((a, b) => a.row - b.row);
}

function totalPointsUsed(lv: Record<string, number>): number {
  return Object.values(lv).reduce((a, b) => a + b, 0);
}

function getQuestColumnIndex(job: JobData): number {
  return job.columns.findIndex((c) => isQuestColumnTitle(c.title));
}

function getContentColumnIndices(job: JobData): number[] {
  const q = getQuestColumnIndex(job);
  if (q < 0) return job.columns.map((_, i) => i);
  return job.columns.map((_, i) => i).filter((i) => i !== q);
}

function capForClassTier(tierIndex: number): number {
  const job = getJobData(currentJob);
  if (job && shouldMergeTranscendentIntoSecondPanel(job)) {
    if (tierIndex === 0) {
      return TIER0_CLASS_CAP_OVERRIDE[job.key] ?? CLASS_SKILL_CAPS[0]!;
    }
    return TRANSCENDENT_COMBINED_SECOND_CAP;
  }
  if (tierIndex === 0 && job && TIER0_CLASS_CAP_OVERRIDE[job.key] != null) {
    return TIER0_CLASS_CAP_OVERRIDE[job.key]!;
  }
  return CLASS_SKILL_CAPS[Math.min(tierIndex, CLASS_SKILL_CAPS.length - 1)]!;
}

function pointsUsedPerClassTier(lv: Record<string, number>): number[] {
  const job = getJobData(currentJob);
  if (!job) return [];
  const content = getContentColumnIndices(job);
  if (shouldMergeTranscendentIntoSecondPanel(job)) {
    const c0 = content[0]!;
    const c1 = content[1]!;
    const c2 = content[2]!;
    const u0 = skills
      .filter((s) => s.column === c0 && !exemptFromClassSkillCap(s.id))
      .reduce((a, s) => a + (lv[s.id] ?? 0), 0);
    const uCombined = skills
      .filter((s) => (s.column === c1 || s.column === c2) && !exemptFromClassSkillCap(s.id))
      .reduce((a, s) => a + (lv[s.id] ?? 0), 0);
    return [u0, uCombined];
  }
  return content.map((col) =>
    skills
      .filter((s) => s.column === col && !exemptFromClassSkillCap(s.id))
      .reduce((a, s) => a + (lv[s.id] ?? 0), 0),
  );
}

function questPointsUsed(lv: Record<string, number>): number {
  const job = getJobData(currentJob);
  if (!job) return 0;
  const q = getQuestColumnIndex(job);
  if (q < 0) return 0;
  return skills.filter((s) => s.column === q).reduce((a, s) => a + (lv[s.id] ?? 0), 0);
}

function prereqsFor(skillId: string): PrereqEdge[] {
  return edges.filter((e) => e.toId === skillId);
}

/** All skills that are (recursive) prerequisites of `skillId` (includes `skillId`). */
function transitivePrereqClosure(skillId: string): Set<string> {
  const closure = new Set<string>([skillId]);
  const queue: string[] = [skillId];
  while (queue.length) {
    const t = queue.shift()!;
    for (const e of edges) {
      if (e.toId !== t) continue;
      if (closure.has(e.fromId)) continue;
      closure.add(e.fromId);
      queue.push(e.fromId);
    }
  }
  return closure;
}

/** Skills that (transitively) depend on `skillId` — edges go from prereq → skill (includes `skillId`). */
function transitivePostreqClosure(skillId: string): Set<string> {
  const closure = new Set<string>([skillId]);
  const queue: string[] = [skillId];
  while (queue.length) {
    const t = queue.shift()!;
    for (const e of edges) {
      if (e.fromId !== t) continue;
      if (closure.has(e.toId)) continue;
      closure.add(e.toId);
      queue.push(e.toId);
    }
  }
  return closure;
}

/** Zero any skill whose prerequisites are unmet; repeat until stable (used after lowering a prereq). */
function stabilizePrereqViolations(lv: Record<string, number>): void {
  let changed = true;
  while (changed) {
    changed = false;
    for (const s of skills) {
      if ((lv[s.id] ?? 0) === 0) continue;
      for (const p of prereqsFor(s.id)) {
        if ((lv[p.fromId] ?? 0) < p.requiredLevel) {
          lv[s.id] = 0;
          changed = true;
          break;
        }
      }
    }
  }
}

/**
 * For each prereq in `closure`, the max required level on any edge from that prereq
 * into another skill also in `closure` (what you must train to satisfy the chain).
 */
function maxRequiredLevelAmongEdgesInClosure(closure: Set<string>): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of edges) {
    if (!closure.has(e.fromId) || !closure.has(e.toId)) continue;
    const prev = m.get(e.fromId) ?? 0;
    m.set(e.fromId, Math.max(prev, e.requiredLevel));
  }
  return m;
}

function canRaise(skillId: string): boolean {
  const skill = getSkill(skillId);
  if (!skill) return false;
  const current = levels[skillId] ?? 0;
  if (current >= skill.maxLevel) return false;
  for (const p of prereqsFor(skillId)) {
    if ((levels[p.fromId] ?? 0) < p.requiredLevel) return false;
  }
  return true;
}

function edgeSatisfied(edge: { fromId: string; requiredLevel: number }): boolean {
  return (levels[edge.fromId] ?? 0) >= edge.requiredLevel;
}

function prereqsAllMet(skillId: string): boolean {
  return prereqsFor(skillId).every((p) => edgeSatisfied(p));
}

const tooltip = document.querySelector("#tooltip") as HTMLElement;

/** Set in `renderApp` — used for unlock + resize while tooltip is locked. */
let plannerAppRoot: HTMLElement | null = null;

/** When set, the skill tooltip stays visible and pinned until unlock (outside click or job change). */
let tooltipLockedSkillId: string | null = null;

function buildSkillDetailHtml(skillId: string): string | null {
  const skill = getSkill(skillId);
  if (!skill) return null;
  const pre = prereqsFor(skillId);
  let preHtml = "";
  if (pre.length) {
    const items = pre
      .map((p) => {
        const sn = getSkill(p.fromId)?.name ?? p.fromId;
        return `<li>${escapeHtml(sn)} <strong>${p.requiredLevel}</strong></li>`;
      })
      .join("");
    preHtml = `<div class="prereq-hint"><div class="tooltip-hint-label">Requires</div><ul class="tooltip-skill-list">${items}</ul></div>`;
  }
  const post = edges.filter((e) => e.fromId === skillId);
  let postHtml = "";
  if (post.length) {
    const items = post
      .map((e) => {
        const sn = getSkill(e.toId)?.name ?? e.toId;
        return `<li>${escapeHtml(sn)} needs <strong>${e.requiredLevel}</strong></li>`;
      })
      .join("");
    postHtml = `<div class="postreq-hint"><div class="tooltip-hint-label">Used by</div><ul class="tooltip-skill-list">${items}</ul></div>`;
  }
  const descRaw = stripLeadingDuplicateTitle(skill.description, skill.name);
  const descHtml = skillDescriptionToHtml(descRaw);
  return `
        <h3 class="tooltip-skill-title">${escapeHtml(skill.name)}</h3>
        <div class="tooltip-desc">${descHtml}</div>
        <div class="lvl-cap">Maximum level: ${skill.maxLevel}</div>
        ${preHtml}
        ${postHtml}
      `;
}

function fillTooltipForSkill(skillId: string): boolean {
  const html = buildSkillDetailHtml(skillId);
  if (!html) return false;
  tooltip.innerHTML = html;
  return true;
}

function positionTooltipNearSkill(nodeRect: DOMRect): void {
  const margin = 10;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  let x = nodeRect.right + margin;
  let y = nodeRect.top;
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
  const tr = tooltip.getBoundingClientRect();
  if (x + tr.width > vw - margin) x = nodeRect.left - tr.width - margin;
  if (y + tr.height > vh - margin) y = nodeRect.bottom - tr.height;
  x = Math.max(margin, Math.min(x, vw - tr.width - margin));
  y = Math.max(margin, Math.min(y, vh - tr.height - margin));
  tooltip.style.left = `${x}px`;
  tooltip.style.top = `${y}px`;
}

function unlockTooltip(root: HTMLElement): void {
  tooltipLockedSkillId = null;
  tooltip.classList.remove("tooltip--locked");
  tooltip.hidden = true;
  clearPrereqHighlights(root);
}

function openSkillTooltip(root: HTMLElement, skillId: string, anchorEl: HTMLElement): void {
  tooltipLockedSkillId = skillId;
  tooltip.classList.add("tooltip--locked");
  fillTooltipForSkill(skillId);
  tooltip.hidden = false;
  positionTooltipNearSkill(anchorEl.getBoundingClientRect());
  fitTooltipDynamicText();
  applyPrereqHighlights(root, skillId);
}

let tooltipUnlockClickAttached = false;
function ensureTooltipUnlockClickListener(): void {
  if (tooltipUnlockClickAttached) return;
  tooltipUnlockClickAttached = true;
  document.addEventListener("click", (e) => {
    if (!tooltipLockedSkillId) return;
    const t = e.target as HTMLElement | null;
    if (!t) return;
    if (tooltip.contains(t)) return;
    const cell = t.closest(".skill-cell");
    const sid = cell?.querySelector(".skill-node")?.getAttribute("data-skill-id");
    if (sid === tooltipLockedSkillId) return;
    const root = plannerAppRoot;
    if (root) unlockTooltip(root);
  });
}

function rootFontPx(): number {
  const n = parseFloat(getComputedStyle(document.documentElement).fontSize);
  return Number.isFinite(n) && n > 0 ? n : 16;
}

/**
 * Keeps text on one line: uses stylesheet font-size when it fits; otherwise shrinks down to minPx.
 * At minPx, ellipsis if it still overflows. Expects a width-bounded container (e.g. max-width: 100%).
 */
function fitSingleLineNoWrap(el: HTMLElement, minPx: number): void {
  el.style.whiteSpace = "nowrap";
  el.style.textOverflow = "";
  el.style.fontSize = "";
  if (el.clientWidth <= 0) return;

  const maxPx = parseFloat(getComputedStyle(el).fontSize);
  if (!Number.isFinite(maxPx) || maxPx <= 0) return;

  const fitsAt = (px: number): boolean => {
    el.style.fontSize = `${px}px`;
    return el.scrollWidth <= el.clientWidth + 0.5;
  };

  if (fitsAt(maxPx)) {
    el.style.fontSize = "";
    return;
  }

  let lo = minPx;
  let hi = maxPx;
  if (!fitsAt(lo)) {
    el.style.fontSize = `${minPx}px`;
    el.style.textOverflow = "ellipsis";
    return;
  }

  for (let i = 0; i < 26; i++) {
    const mid = (lo + hi) / 2;
    if (fitsAt(mid)) lo = mid;
    else hi = mid;
  }
  el.style.fontSize = `${lo}px`;
}

function scheduleFitSkillText(root: HTMLElement): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const rf = rootFontPx();
      root.querySelectorAll(".skill-node .name").forEach((n) => {
        if (n instanceof HTMLElement) fitSingleLineNoWrap(n, 0.52 * rf);
      });
      root.querySelectorAll(".skill-prereq-tab-line").forEach((n) => {
        if (n instanceof HTMLElement) fitSingleLineNoWrap(n, 0.46 * rf);
      });
    });
  });
}

function fitTooltipDynamicText(): void {
  if (tooltip.hidden) return;
  const rf = rootFontPx();
  const t = tooltip.querySelector("h3.tooltip-skill-title");
  if (t instanceof HTMLElement) fitSingleLineNoWrap(t, 0.62 * rf);
  tooltip.querySelectorAll(".tooltip-skill-list li").forEach((li) => {
    if (li instanceof HTMLElement) fitSingleLineNoWrap(li, 0.54 * rf);
  });
}

function escapeHtml(s: string): string {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

const TOOLTIP_LV_LINE = /^\s*\[[Ll][Vv]\.?\s*\d+\]\s*:/i;
const TOOLTIP_COMMENTS_LINE = /^\s*Comments:/i;
const TOOLTIP_DESCRIPTION_LINE = /^\s*Description:/i;
/** Lines like `[Lv 1]:`, `[100~81% SP]:`, `[Musical Lessons]:` */
const TOOLTIP_BRACKET_LEADER = /^(\s*)(\[[^\]]+\]\s*:)(.*)$/;
/** skilldescript header lines (also Range/Duration when on their own line) */
const TOOLTIP_META_LABEL =
  /^(\s*)(Max Level:|Requirement:|Skill Form:|Type:|Target:|Description:|Comments:|Range:|Duration:)\s*(.*)$/i;

type TooltipHit = { start: number; end: number; cls: string; text: string };

function rangesOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
): boolean {
  return a.start < b.end && a.end > b.start;
}

/** Wrap stats, %, elements, etc. in spans (single pass, no nested re-matches). */
function highlightTooltipPlain(escapedLine: string): string {
  const patterns: { re: RegExp; cls: string }[] = [
    { re: /\bAfter Cast Delay\b/gi, cls: "tooltip-hl-mechanic" },
    { re: /\bCast Time\b/gi, cls: "tooltip-hl-mechanic" },
    { re: /\b(?:Fixed Cast Time|Variable Cast Time)\b/gi, cls: "tooltip-hl-mechanic" },
    { re: /\b(?:Neutral|Fire|Water|Wind|Earth|Holy|Shadow|Ghost|Poison|Undead)\b/g, cls: "tooltip-hl-elem" },
    { re: /\d+(?:\.\d+)?%/g, cls: "tooltip-hl-pct" },
    {
      re: /\b(?:MATK|MDEF|HIT|DEF|VIT|INT|DEX|LUK|AGI|ATK|ASPD|CRIT)\b/gi,
      cls: "tooltip-hl-stat",
    },
    { re: /\b(?:SP|HP)\b/g, cls: "tooltip-hl-res" },
    { re: /\b(?:Lv\.?|Level)\s*\d+\b/gi, cls: "tooltip-hl-lvref" },
    { re: /\d+(?:\.\d+)?\s+sec(?:onds?)?\b/gi, cls: "tooltip-hl-time" },
  ];

  const hits: TooltipHit[] = [];
  for (const { re, cls } of patterns) {
    const r = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
    let m: RegExpExecArray | null;
    while ((m = r.exec(escapedLine))) {
      hits.push({
        start: m.index,
        end: m.index + m[0].length,
        cls,
        text: m[0],
      });
    }
  }

  hits.sort((a, b) => {
    const la = a.end - a.start;
    const lb = b.end - b.start;
    if (lb !== la) return lb - la;
    return a.start - b.start;
  });

  const chosen: TooltipHit[] = [];
  for (const h of hits) {
    if (chosen.some((c) => rangesOverlap(h, c))) continue;
    chosen.push(h);
  }
  chosen.sort((a, b) => a.start - b.start);

  let out = "";
  let pos = 0;
  for (const h of chosen) {
    out += escapedLine.slice(pos, h.start);
    out += `<span class="${h.cls}">${h.text}</span>`;
    pos = h.end;
  }
  out += escapedLine.slice(pos);
  return out;
}

function metaLabelKey(labelWithColon: string): string {
  return labelWithColon.replace(/:\s*$/, "").trim().toLowerCase();
}

function metaValueWrapperClass(labelKey: string, rawValue: string): string | null {
  const v = rawValue.toLowerCase();
  if (labelKey === "type") {
    if (/\bmagical\b|\bmagic\b/.test(v)) return "tooltip-meta-type tooltip-meta-type--magic";
    if (/\bphysical\b/.test(v)) return "tooltip-meta-type tooltip-meta-type--phys";
    if (/\brecovery\b/.test(v)) return "tooltip-meta-type tooltip-meta-type--heal";
    if (/\bdebuff\b/.test(v)) return "tooltip-meta-type tooltip-meta-type--debuff";
    if (/\bsupportive\b/.test(v)) return "tooltip-meta-type tooltip-meta-type--support";
    if (/\bcrafting\b/.test(v)) return "tooltip-meta-type tooltip-meta-type--craft";
    if (/\boffensive\b/.test(v)) return "tooltip-meta-type tooltip-meta-type--offense";
    return null;
  }
  if (labelKey === "skill form") {
    if (/\bpassive\b/.test(v)) return "tooltip-meta-form tooltip-meta-form--passive";
    if (/\bactive\b/.test(v)) return "tooltip-meta-form tooltip-meta-form--active";
    return null;
  }
  if (labelKey === "target") {
    if (/\bcaster\b|\bself\b/.test(v)) return "tooltip-meta-target tooltip-meta-target--self";
    if (/\benemy\b|\bfoes?\b/.test(v)) return "tooltip-meta-target tooltip-meta-target--enemy";
    return null;
  }
  return null;
}

function formatMetaLineValue(labelWithColon: string, valueRaw: string): string {
  const key = metaLabelKey(labelWithColon);
  const inner = highlightTooltipPlain(escapeHtml(valueRaw));
  const wrap = metaValueWrapperClass(key, valueRaw);
  if (wrap) return `<span class="${wrap}">${inner}</span>`;
  return inner;
}

/** First line of skilldescript.lub is the skill name — same as the tooltip `<h3>`, so drop it. */
function stripLeadingDuplicateTitle(description: string, title: string): string {
  const norm = (s: string) => s.trim().toLowerCase();
  const want = norm(title);
  if (!want) return description;
  const lines = description.replace(/\r\n/g, "\n").split("\n");
  let i = 0;
  while (i < lines.length && lines[i]!.trim() === "") i++;
  if (i >= lines.length || norm(lines[i]!) !== want) return description;
  return lines
    .slice(i + 1)
    .join("\n")
    .replace(/^\n+/, "");
}

function formatSkillDescriptionLine(raw: string): string {
  const mBracket = raw.match(TOOLTIP_BRACKET_LEADER);
  if (mBracket) {
    const isLv = /^\s*\[[Ll][Vv]\.?\s*\d+\]\s*:\s*$/i.test(mBracket[2] ?? "");
    const keyClass = isLv
      ? "tooltip-desc-key tooltip-desc-key--lv"
      : "tooltip-desc-key tooltip-desc-key--tag";
    const tail = highlightTooltipPlain(escapeHtml(mBracket[3] ?? ""));
    return `${mBracket[1]}<strong class="${keyClass}">${escapeHtml(
      mBracket[2] ?? "",
    )}</strong>${tail}`;
  }
  const mMeta = raw.match(TOOLTIP_META_LABEL);
  if (mMeta) {
    const label = mMeta[2] ?? "";
    const labelKey = metaLabelKey(label);
    const keyClass =
      labelKey === "comments"
        ? "tooltip-desc-key tooltip-desc-key--comments"
        : labelKey === "description"
          ? "tooltip-desc-key tooltip-desc-key--desc"
          : "tooltip-desc-key tooltip-desc-key--meta";
    const valueHtml = formatMetaLineValue(label, mMeta[3] ?? "");
    return `${mMeta[1]}<strong class="${keyClass}">${escapeHtml(
      label,
    )}</strong>${valueHtml}`;
  }
  return highlightTooltipPlain(escapeHtml(raw));
}

/**
 * skilldescript.lub text: header, optional Description: block, [Lv n]: lines, optional Comments: footer.
 * Rules before Description (when present), before the level list, and before Comments.
 */
function skillDescriptionToHtml(description: string): string {
  const lines = description.replace(/\r\n/g, "\n").split("\n");
  const out: string[] = [];
  let i = 0;
  let beforeFirstLv = true;
  let beforeComments = true;
  let commentsDivOpen = false;
  let beforeDescriptionBlock = true;
  let proseOpen = false;

  const closeProse = (): void => {
    if (!proseOpen) return;
    out.push("</div>");
    proseOpen = false;
  };

  while (i < lines.length) {
    const raw = lines[i]!;
    const t = raw.trim();

    if (beforeComments && TOOLTIP_COMMENTS_LINE.test(t)) {
      closeProse();
      out.push('<hr class="tooltip-desc-sep" aria-hidden="true" />');
      out.push('<div class="tooltip-desc-comments">');
      commentsDivOpen = true;
      beforeComments = false;
    }

    if (beforeFirstLv && TOOLTIP_LV_LINE.test(t)) {
      closeProse();
      out.push('<hr class="tooltip-desc-sep" aria-hidden="true" />');
      beforeFirstLv = false;
    }

    if (beforeDescriptionBlock && TOOLTIP_DESCRIPTION_LINE.test(t)) {
      out.push('<hr class="tooltip-desc-sep" aria-hidden="true" />');
      out.push('<div class="tooltip-desc-prose">');
      proseOpen = true;
      beforeDescriptionBlock = false;
    }

    out.push(formatSkillDescriptionLine(raw));
    out.push("<br/>");
    i++;
  }

  closeProse();
  let html = out.join("");
  if (commentsDivOpen) html += "</div>";
  return html.replace(/(?:<br\/>)+$/, "");
}

/** Novice + first job share one 7-col client grid (unique slot indices); merge into one panel. */
function mergeNoviceWithFirstJob(job: JobData): boolean {
  const idx = getContentColumnIndices(job);
  if (idx.length < 2) return false;
  return job.columns[idx[0]]?.title === "Novice";
}

/** Transcendent jobs: second + transcendent trees use the same client grid slots; one combined panel. */
function mergeTranscendentIntoSecond(job: JobData): boolean {
  return shouldMergeTranscendentIntoSecondPanel(job);
}

/** Client trees use 7 columns; show the full width even when skills only occupy the left slots. */
/** When a class panel has no skills, still render a grid (matches ~largest trees in data). */
const SKILL_GRID_ROWS_WHEN_PANEL_EMPTY = 6;

function effectiveSkillGridRows(panelSkills: SkillDef[]): number {
  if (panelSkills.length === 0) return SKILL_GRID_ROWS_WHEN_PANEL_EMPTY;
  return Math.max(1, ...panelSkills.map((s) => s.gridRow));
}

function fillEmptyGridSlots(grid: HTMLElement, panelSkills: SkillDef[]): void {
  const occupied = new Set(panelSkills.map((s) => `${s.gridCol},${s.gridRow}`));
  const maxC = GRID_COLS;
  const maxR = effectiveSkillGridRows(panelSkills);
  for (let r = 1; r <= maxR; r++) {
    for (let c = 1; c <= maxC; c++) {
      if (occupied.has(`${c},${r}`)) continue;
      const ph = document.createElement("div");
      ph.className = "skill-slot--empty";
      ph.setAttribute("aria-hidden", "true");
      ph.style.gridColumn = String(c);
      ph.style.gridRow = String(r);
      grid.appendChild(ph);
    }
  }
}

function formatPrereqTabLines(skillId: string): { display: string; aria: string } {
  const pre = prereqsFor(skillId);
  if (!pre.length) return { display: "", aria: "" };
  const lines = pre.map((p) => {
    const n = getSkill(p.fromId)?.name ?? p.fromId;
    return `${n} ${p.requiredLevel}`;
  });
  return {
    display: lines.join("\n"),
    aria: lines.join(", "),
  };
}

/** Grid cell: optional prereq tab above the skill card. */
function skillCell(skill: SkillDef): HTMLElement {
  const cell = document.createElement("div");
  cell.className = "skill-cell";
  const tab = document.createElement("div");
  tab.className = "skill-prereq-tab";
  const { display, aria } = formatPrereqTabLines(skill.id);
  if (!display) {
    tab.classList.add("skill-prereq-tab--none");
    tab.setAttribute("aria-hidden", "true");
  } else {
    tab.textContent = "";
    for (const line of display.split("\n")) {
      const lineEl = document.createElement("span");
      lineEl.className = "skill-prereq-tab-line";
      lineEl.textContent = line;
      tab.appendChild(lineEl);
    }
    tab.setAttribute("aria-label", `Prerequisites: ${aria}`);
  }
  cell.appendChild(tab);
  cell.appendChild(skillNodeEl(skill));
  return cell;
}

function renderSkillGrid(panelSkills: SkillDef[]): HTMLElement {
  const grid = document.createElement("div");
  grid.className = "skill-grid";
  for (const skill of panelSkills) {
    const el = skillCell(skill);
    el.style.gridColumn = String(skill.gridCol);
    el.style.gridRow = String(skill.gridRow);
    grid.appendChild(el);
  }
  fillEmptyGridSlots(grid, panelSkills);
  grid.style.gridTemplateRows = `repeat(${effectiveSkillGridRows(panelSkills)}, auto)`;
  return grid;
}

function renderSkillList(panelSkills: SkillDef[]): HTMLElement {
  const list = document.createElement("div");
  list.className = "skill-list";
  const ordered = panelSkills
    .slice()
    .sort((a, b) => a.column - b.column || a.row - b.row || a.gridRow - b.gridRow || a.gridCol - b.gridCol);
  for (const s of ordered) list.appendChild(skillNodeEl(s));
  return list;
}

function renderColumns(root: HTMLElement): void {
  const board = root.querySelector("#tree-board") as HTMLElement | null;
  const job = getJobData(currentJob);
  if (!board || !job) return;

  const sitDockPreserve = root.querySelector("#job-sit-dock");
  sitDockPreserve?.remove();

  unlockTooltip(root);

  board.innerHTML = "";
  const questIdx = getQuestColumnIndex(job);
  const contentIdx = getContentColumnIndices(job);

  const body = document.createElement("div");
  body.className = "tree-body";

  const main = document.createElement("div");
  main.className = "tree-main";

  if (mergeNoviceWithFirstJob(job)) {
    const sec = document.createElement("section");
    sec.className = "skill-panel skill-panel--merged";
    sec.innerHTML = `<h2 class="panel-title"><span class="panel-title__name">${escapeHtml(job.label)}</span><span class="panel-title__stats" id="panel-class-pts-merged" aria-label="Skill points per class column"></span></h2><p class="panel-sub">Same ${GRID_COLS}-column grid as the client <code>skilltree.lua</code> / in-game window.</p>`;
    const panelSkills: SkillDef[] = [];
    for (const c of contentIdx) {
      panelSkills.push(...skillsByColumn(c));
    }
    sec.appendChild(renderSkillGrid(panelSkills));
    sec.appendChild(renderSkillList(panelSkills));
    main.appendChild(sec);
  } else if (mergeTranscendentIntoSecond(job)) {
    const c0 = contentIdx[0]!;
    const c1 = contentIdx[1]!;
    const c2 = contentIdx[2]!;
    const lab = escapeHtml(job.label);

    const sec0 = document.createElement("section");
    sec0.className = "skill-panel";
    sec0.dataset.column = String(c0);
    sec0.innerHTML = `<h2 class="panel-title"><span class="panel-title__name">${escapeHtml(job.columns[c0]?.title ?? "")}</span><span class="panel-title__stats" data-content-tier="0" aria-label="Skill points used for this class column"></span></h2>`;
    const sec0Skills = skillsByColumn(c0);
    sec0.appendChild(renderSkillGrid(sec0Skills));
    sec0.appendChild(renderSkillList(sec0Skills));
    main.appendChild(sec0);

    const sec1 = document.createElement("section");
    sec1.className = "skill-panel skill-panel--second-with-trans";
    sec1.dataset.column = `${c1},${c2}`;
    sec1.innerHTML = `<h2 class="panel-title"><span class="panel-title__name">${lab}</span><span class="panel-title__stats panel-title__stats--transcendent" data-content-tier="1" aria-label="${lab} skill points (second + transcendent)"></span></h2>`;
    const mergedSkills = [...skillsByColumn(c1), ...skillsByColumn(c2)].sort((a, b) => {
      if (a.gridRow !== b.gridRow) return a.gridRow - b.gridRow;
      if (a.gridCol !== b.gridCol) return a.gridCol - b.gridCol;
      return a.row - b.row;
    });
    sec1.appendChild(renderSkillGrid(mergedSkills));
    sec1.appendChild(renderSkillList(mergedSkills));
    main.appendChild(sec1);
  } else {
    for (let t = 0; t < contentIdx.length; t++) {
      const c = contentIdx[t]!;
      const colDef = job.columns[c];
      const sec = document.createElement("section");
      sec.className = "skill-panel";
      sec.dataset.column = String(c);
      sec.innerHTML = `<h2 class="panel-title"><span class="panel-title__name">${escapeHtml(colDef.title)}</span><span class="panel-title__stats" data-content-tier="${t}" aria-label="Skill points used for this class column"></span></h2>`;
      const secSkills = skillsByColumn(c);
      sec.appendChild(renderSkillGrid(secSkills));
      sec.appendChild(renderSkillList(secSkills));
      main.appendChild(sec);
    }
  }

  body.appendChild(main);

  if (questIdx >= 0) {
    const colDef = job.columns[questIdx];
    const aside = document.createElement("aside");
    aside.className = "skill-panel skill-panel--quest";
    aside.dataset.column = String(questIdx);
    aside.innerHTML = `<h2 class="panel-title panel-title--quest"><span class="panel-title__name">${escapeHtml(colDef.title)}</span><span class="panel-title__stats panel-title__stats--quest" id="panel-class-pts-quest" aria-label="Quest and special skills allocated"></span></h2>`;
    const stack = document.createElement("div");
    stack.className = "quest-stack";
    const questSkills = skillsByColumn(questIdx);
    for (const skill of questSkills) {
      stack.appendChild(skillCell(skill));
    }
    stack.appendChild(renderSkillList(questSkills));
    aside.appendChild(stack);
    if (sitDockPreserve) {
      sitDockPreserve.classList.remove("job-sit-dock--overlay");
      aside.appendChild(sitDockPreserve);
    }
    body.appendChild(aside);
  } else {
    const treeWrap = root.querySelector("#tree-wrap");
    if (sitDockPreserve && treeWrap) {
      treeWrap.appendChild(sitDockPreserve);
      sitDockPreserve.classList.remove("job-sit-dock--hidden");
      sitDockPreserve.classList.add("job-sit-dock--overlay");
    }
  }

  board.appendChild(body);
  attachSkillInteractionHandlers(root);
  scheduleFitSkillText(root);
}

function setJobPickerSprite(spriteEl: HTMLElement, url: string | undefined, label: string): void {
  const fb = spriteEl.querySelector(".job-picker-sprite-fallback") as HTMLSpanElement;
  fb.textContent = label.slice(0, 1).toUpperCase();
  spriteEl.querySelectorAll(".job-picker-sprite-img").forEach((n) => n.remove());
  if (!url) return;
  const img = document.createElement("img");
  img.className = "job-picker-sprite-img";
  img.alt = "";
  img.decoding = "async";
  img.referrerPolicy = "no-referrer";
  img.src = url;
  const onLoad = (): void => {
    img.classList.add("job-picker-sprite-img--show");
  };
  img.addEventListener("load", onLoad, { once: true });
  img.addEventListener("error", () => img.remove(), { once: true });
  spriteEl.insertBefore(img, fb);
  if (img.complete && img.naturalHeight > 0) onLoad();
}

const GENDER_STORAGE_KEY = "ro-sit-gender";
type SitGender = "male" | "female";
let sitGender: SitGender = (localStorage.getItem(GENDER_STORAGE_KEY) as SitGender) || "male";
if (sitGender !== "male" && sitGender !== "female") sitGender = "male";

function syncJobPickerUi(root: HTMLElement): void {
  const label = getJobData(currentJob)?.label ?? currentJob;
  const labEl = root.querySelector("#job-picker-current-label");
  if (labEl) labEl.textContent = label;
  const trigSprite = root.querySelector("#job-picker-trigger .job-picker-sprite") as HTMLElement | null;
  if (trigSprite) setJobPickerSprite(trigSprite, jobPreviewSpriteUrl(currentJob), label);
  const trig = root.querySelector("#job-picker-trigger") as HTMLButtonElement | null;
  if (trig) trig.setAttribute("aria-label", `Class: ${label}. Open class picker`);
  root.querySelectorAll(".job-picker-card").forEach((btn) => {
    const key = (btn as HTMLButtonElement).dataset.jobKey;
    const on = key === currentJob;
    btn.classList.toggle("job-picker-card--current", on);
    if (on) btn.setAttribute("aria-current", "true");
    else btn.removeAttribute("aria-current");
  });

  const sitDock = root.querySelector("#job-sit-dock") as HTMLElement | null;
  const sitImg = root.querySelector("#job-sit-sprite-img") as HTMLImageElement | null;
  if (sitDock && sitImg) {
    // Prefer anchoring in the Quest/Special panel when present; otherwise, show as a dock overlay.
    sitDock.classList.toggle("job-sit-dock--overlay", !sitDock.closest(".skill-panel--quest"));

    const sitKey = `${currentJob}::${sitGender}`;
    if (sitImg.dataset.sitForJob === sitKey) return;
    sitImg.dataset.sitForJob = sitKey;

    const localSit = jobSitLocalPngUrl(currentJob, sitGender);
    const legacyLocalSit = `${import.meta.env.BASE_URL}job-sit/${currentJob}.png`;
    const portrait = jobSitPortraitFallbackUrl(currentJob);
    const missingDataUri = (): string => {
      const esc = (s: string): string =>
        s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
      const text = esc(label);
      const key = esc(currentJob);
      const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240" viewBox="0 0 240 240">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#12141a"/>
      <stop offset="1" stop-color="#0b0d12"/>
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="240" height="240" rx="16" fill="url(#g)"/>
  <rect x="14" y="14" width="212" height="212" rx="12" fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="2"/>
  <text x="120" y="112" font-family="system-ui,Segoe UI,Arial" font-size="16" fill="rgba(255,255,255,0.86)" text-anchor="middle">${text}</text>
  <text x="120" y="140" font-family="ui-monospace,Consolas,monospace" font-size="12" fill="rgba(255,255,255,0.55)" text-anchor="middle">${key}</text>
  <text x="120" y="172" font-family="system-ui,Segoe UI,Arial" font-size="12" fill="rgba(255,255,255,0.45)" text-anchor="middle">sprite missing</text>
</svg>`;
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    };
    sitDock.classList.remove("job-sit-dock--hidden");
    sitImg.classList.add("job-sit-dock__img--loading");
    sitImg.classList.remove("job-sit-dock__img--fail");
    sitImg.referrerPolicy = "no-referrer";
    sitImg.decoding = "async";

    const finishOk = (): void => {
      sitImg.classList.remove("job-sit-dock__img--loading");
      sitDock.classList.remove("job-sit-dock--hidden");
    };
    const tryPortrait = (): void => {
      if (!portrait) {
        finishOk();
        sitImg.classList.add("job-sit-dock__img--fail");
        sitImg.src = missingDataUri();
        return;
      }
      sitImg.onload = finishOk;
      sitImg.onerror = (): void => {
        finishOk();
        sitImg.classList.add("job-sit-dock__img--fail");
        sitImg.src = missingDataUri();
      };
      sitImg.src = portrait;
    };

    let triedLegacy = false;
    sitImg.onload = finishOk;
    sitImg.onerror = (): void => {
      if (!triedLegacy && legacyLocalSit !== localSit) {
        triedLegacy = true;
        sitImg.src = legacyLocalSit;
        return;
      }
      tryPortrait();
    };
    sitImg.src = localSit;
  }
}

type JobPickerPick = { key: string; label: string };

function jobPickerCardHtml(
  key: string,
  label: string,
  joined?: "start" | "end",
): string {
  const escKey = escapeHtml(key);
  const lab = escapeHtml(label);
  const joinCls =
    joined === "start"
      ? " job-picker-card--joined job-picker-card--joined-start"
      : joined === "end"
        ? " job-picker-card--joined job-picker-card--joined-end"
        : "";
  return `<button type="button" class="job-picker-card${joinCls}" data-job-key="${escKey}" aria-label="${lab}">
        <span class="job-picker-sprite job-picker-sprite--card"><span class="job-picker-sprite-fallback"></span></span>
        <span class="job-picker-card-label">${lab}</span>
      </button>`;
}

function jobPickerJoinedPairHtml(left: JobPickerPick, right: JobPickerPick, aria: string): string {
  const a = escapeHtml(aria);
  return `<div class="job-picker-card-joined" role="group" aria-label="${a}">${jobPickerCardHtml(left.key, left.label, "start")}${jobPickerCardHtml(right.key, right.label, "end")}</div>`;
}

/** One flex row: centered; Bard/Dancer and Clown/Gypsy as joined pairs (two buttons each). */
function jobPickerRowHtml(row: JobPickerPick[]): string {
  const parts: string[] = [];
  for (let i = 0; i < row.length; i++) {
    const j = row[i]!;
    const next = row[i + 1];
    if (next && j.key === "JT_BARD" && next.key === "JT_DANCER") {
      parts.push(
        jobPickerJoinedPairHtml(j, next, "Bard or Dancer (same second-class line)"),
      );
      i++;
      continue;
    }
    if (next && j.key === "JT_BARD_H" && next.key === "JT_DANCER_H") {
      parts.push(
        jobPickerJoinedPairHtml(j, next, "Clown or Gypsy (same transcendent archer line)"),
      );
      i++;
      continue;
    }
    parts.push(jobPickerCardHtml(j.key, j.label));
  }
  return parts.join("");
}

function jobPickerSectionHtml(g: JobPickerSection, sid: string): string {
  const labelEsc = escapeHtml(g.heading);
  if (g.jobRows?.length) {
    if (
      g.jobRowsLayout === "expandedTaekwon" &&
      g.jobRows.length >= 2 &&
      (g.jobRows[1]?.length ?? 0) > 0
    ) {
      const row1 = g.jobRows[0] ?? [];
      const row2 = g.jobRows[1] ?? [];
      const row1Cards = jobPickerRowHtml(row1);
      const row2Cards = jobPickerRowHtml(row2);
      const grids = `<div class="job-picker-grid job-picker-grid--expanded-tk-row1" role="group" aria-label="${labelEsc}, row 1">${row1Cards}</div><div class="job-picker-grid job-picker-grid--expanded-tk-row2" role="group" aria-label="${labelEsc}, Taekwon Master and Soul Linker under Taekwon Kid"><div class="job-picker-tk-adv-pair-shell">${row2Cards}</div></div>`;
      return `<section class="job-picker-section" aria-labelledby="${sid}">
        <h3 class="job-picker-section-title" id="${sid}">${labelEsc}</h3>
        <div class="job-picker-row-stack job-picker-row-stack--expanded-tk">${grids}</div>
      </section>`;
    }
    const grids = g.jobRows
      .map((row, ri) => {
        if (row.length === 0) return "";
        const cards = jobPickerRowHtml(row);
        return `<div class="job-picker-grid" role="group" aria-label="${labelEsc}, row ${ri + 1}">${cards}</div>`;
      })
      .join("");
    return `<section class="job-picker-section" aria-labelledby="${sid}">
        <h3 class="job-picker-section-title" id="${sid}">${labelEsc}</h3>
        <div class="job-picker-row-stack">${grids}</div>
      </section>`;
  }
  const cards = jobPickerRowHtml(g.jobs ?? []);
  return `<section class="job-picker-section" aria-labelledby="${sid}">
        <h3 class="job-picker-section-title" id="${sid}">${labelEsc}</h3>
        <div class="job-picker-grid" role="group" aria-label="${labelEsc}">${cards}</div>
      </section>`;
}

function jobPickerSectionsHtml(sections: JobPickerSection[], idPrefix: string): string {
  const filtered = sections.filter(
    (g) =>
      (g.jobs != null && g.jobs.length > 0) ||
      (g.jobRows != null && g.jobRows.some((r) => r.length > 0)),
  );
  return filtered.map((g, i) => jobPickerSectionHtml(g, `${idPrefix}-sec-${i}`)).join("");
}

function jobPickerTabIdForJob(tabs: JobPickerTabDef[], jobKey: string): string {
  const hit = tabs.find((t) => t.jobKeys.includes(jobKey));
  return hit?.id ?? tabs[0]!.id;
}

function applyJobPickerTab(root: HTMLElement, activeId: string): void {
  root.querySelectorAll(".job-picker-tab").forEach((btn) => {
    const el = btn as HTMLButtonElement;
    const id = el.dataset.jobPickerTab;
    if (!id) return;
    const on = id === activeId;
    el.setAttribute("aria-selected", on ? "true" : "false");
    el.tabIndex = on ? 0 : -1;
    el.classList.toggle("job-picker-tab--active", on);
    const panel = root.querySelector(`#job-picker-panel-${id}`);
    if (panel instanceof HTMLElement) {
      if (on) panel.removeAttribute("hidden");
      else panel.setAttribute("hidden", "");
    }
  });
}

function renderApp(root: HTMLElement): void {
  plannerAppRoot = root;
  ensureTooltipUnlockClickListener();

  const pickerTabs = listJobPickerTabs();
  const initialTabId = jobPickerTabIdForJob(pickerTabs, currentJob);

  const tablistHtml =
    pickerTabs.length > 1
      ? `<div class="job-picker-tablist" role="tablist" aria-label="Class category">${pickerTabs
          .map((t) => {
            const active = t.id === initialTabId;
            const baseAria =
              t.id === "base"
                ? ` aria-label="Novice, first class, and second class"`
                : "";
            return `<button type="button" class="job-picker-tab${active ? " job-picker-tab--active" : ""}" role="tab"
            id="job-picker-tab-${t.id}" data-job-picker-tab="${escapeHtml(t.id)}"
            aria-selected="${active ? "true" : "false"}"
            aria-controls="job-picker-panel-${escapeHtml(t.id)}"
            tabindex="${active ? "0" : "-1"}"${baseAria}>${escapeHtml(t.label)}</button>`;
          })
          .join("")}</div>`
      : "";

  const panelsHtml = pickerTabs
    .map((t) => {
      const active = t.id === initialTabId;
      const inner = jobPickerSectionsHtml(t.sections, `job-picker-${t.id}`);
      const labelled =
        pickerTabs.length > 1
          ? `aria-labelledby="job-picker-tab-${escapeHtml(t.id)}"`
          : `aria-labelledby="job-picker-dialog-title"`;
      return `<div class="job-picker-tabpanel job-picker-body" role="tabpanel" id="job-picker-panel-${escapeHtml(
        t.id,
      )}" ${labelled}${active ? "" : " hidden"}>${inner}</div>`;
    })
    .join("");

  root.innerHTML = `
    <header class="planner-header">
      <div class="planner-header__left">
        <h1>Pre-Renewal Skill Planner</h1>
        <nav class="site-nav" aria-label="Site">
          <a class="site-nav__link site-nav__link--active" href="/index.html" aria-current="page">Skill Planner</a>
          <a class="site-nav__link" href="/cards.html">Card Library</a>
          <a class="site-nav__link" href="/pets.html">Pets</a>
        </nav>
      </div>
    </header>
    <div class="toolbar">
      <div class="job-picker-field">
        <span class="job-picker-field-label" id="job-picker-field-label">Class</span>
        <button type="button" class="job-picker-trigger" id="job-picker-trigger"
          aria-haspopup="dialog" aria-expanded="false" aria-controls="job-picker-dialog"
          aria-describedby="job-picker-field-label">
          <span class="job-picker-sprite job-picker-sprite--trigger"><span class="job-picker-sprite-fallback"></span></span>
          <span class="job-picker-current-name" id="job-picker-current-label"></span>
        </button>
      </div>
      <div class="toolbar-class-stats" role="group" aria-label="Skill points by class">
        <span class="stat" id="stat-tier0"
          ><span class="stat-over-badge" id="badge-tier0" aria-hidden="true">!</span
          ><span id="label-tier0">1st class</span>:
          <strong id="used-tier0">0</strong> / <strong id="cap-tier0">49</strong>
          · <span id="remain-word-tier0">left</span> <strong id="remain-tier0">49</strong></span
        >
        <span class="stat" id="stat-tier1"
          ><span class="stat-over-badge" id="badge-tier1" aria-hidden="true">!</span
          ><span id="label-tier1">2nd class</span>:
          <strong id="used-tier1">0</strong> / <strong id="cap-tier1">50</strong>
          · <span id="remain-word-tier1">left</span> <strong id="remain-tier1">50</strong></span
        >
        <span class="stat stat--hidden" id="stat-tier2"
          ><span class="stat-over-badge" id="badge-tier2" aria-hidden="true">!</span
          ><span id="label-tier2">Transcendent</span>:
          <strong id="used-tier2">0</strong> / <strong id="cap-tier2">50</strong>
          · <span id="remain-word-tier2">left</span> <strong id="remain-tier2">50</strong></span
        >
        <span class="stat" id="stat-quest"
          >Quest / special: <strong id="used-quest">0</strong>
          <span class="stat-note">(no class cap)</span></span
        >
        <span class="stat stat--total">Total: <strong id="used-total">0</strong></span>
      </div>
      <label class="toolbar-toggle">
        <span class="toolbar-toggle-text">Disable hover dimming</span>
        <span class="toggle-switch">
          <input type="checkbox" id="toggle-disable-hover-dim" class="toggle-switch-input" />
          <span class="toggle-switch-track" aria-hidden="true"><span class="toggle-switch-thumb"></span></span>
        </span>
      </label>
      <button type="button" class="toolbar-iconbtn" id="btn-sit-gender" aria-label="Toggle gender">
        <svg class="toolbar-gender-svg" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
          <g class="toolbar-gender-svg__male" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="10" cy="14" r="5"></circle>
            <path d="M14 10l7-7"></path>
            <path d="M16 3h5v5"></path>
          </g>
          <g class="toolbar-gender-svg__female" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="10" cy="10" r="5"></circle>
            <path d="M10 15v6"></path>
            <path d="M7 18h6"></path>
          </g>
        </svg>
      </button>
      <div class="toolbar-actions" role="group" aria-label="Build actions">
        <button type="button" id="btn-share">Share build</button>
        <span class="share-status" id="share-status" role="status" aria-live="polite"></span>
        <button type="button" id="btn-reset" class="danger">Reset</button>
      </div>
    </div>
    <div class="tree-wrap" id="tree-wrap">
      <div class="tree-board" id="tree-board"></div>
      <div class="job-sit-dock" id="job-sit-dock" aria-hidden="true">
        <img class="job-sit-dock__img" id="job-sit-sprite-img" alt="" width="120" height="120" />
      </div>
    </div>
    <dialog class="job-picker-dialog" id="job-picker-dialog" aria-labelledby="job-picker-dialog-title">
      ${
        pickerTabs.length > 1
          ? `<aside class="job-picker-tabrail">${tablistHtml}</aside>`
          : ""
      }
      <div class="job-picker-dialog-panel">
        <div class="job-picker-dialog-head">
          <h2 class="job-picker-dialog-title" id="job-picker-dialog-title">Choose class</h2>
          <button type="button" class="job-picker-close" aria-label="Close class picker">×</button>
        </div>
        <div class="job-picker-dialog-scroll">
          <div id="job-picker-body" role="region" aria-label="Character classes">
            ${panelsHtml}
          </div>
        </div>
      </div>
    </dialog>
  `;

  const dialog = root.querySelector("#job-picker-dialog") as HTMLDialogElement;
  const trigger = root.querySelector("#job-picker-trigger") as HTMLButtonElement;

  for (const btn of root.querySelectorAll(".job-picker-card")) {
    const key = (btn as HTMLButtonElement).dataset.jobKey;
    if (!key) continue;
    const lab = getJobData(key)?.label ?? key;
    const sp = btn.querySelector(".job-picker-sprite") as HTMLElement;
    setJobPickerSprite(sp, jobPreviewSpriteUrl(key), lab);
  }

  function closeJobPicker(): void {
    dialog.close();
  }

  function pickJob(jobKey: string): void {
    if (!getJobData(jobKey)) return;
    applyJob(jobKey);
    saveState();
    renderColumns(root);
    refreshAll(root);
    syncJobPickerUi(root);
    closeJobPicker();
  }

  trigger.addEventListener("click", () => {
    applyJobPickerTab(root, jobPickerTabIdForJob(listJobPickerTabs(), currentJob));
    dialog.showModal();
    trigger.setAttribute("aria-expanded", "true");
    requestAnimationFrame(() => {
      const cur = root.querySelector(".job-picker-card--current") as HTMLElement | null;
      (cur ?? root.querySelector(".job-picker-close"))?.focus();
    });
  });

  const tablist = root.querySelector(".job-picker-tablist");
  tablist?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest(".job-picker-tab") as HTMLButtonElement | null;
    const id = btn?.dataset.jobPickerTab;
    if (!id) return;
    applyJobPickerTab(root, id);
    btn.focus();
  });

  tablist?.addEventListener("keydown", (ev) => {
    const e = ev as KeyboardEvent;
    const tabs = [...root.querySelectorAll(".job-picker-tab")] as HTMLButtonElement[];
    if (tabs.length < 2) return;
    const ix = tabs.findIndex((b) => b.getAttribute("aria-selected") === "true");
    if (ix < 0) return;
    let next = ix;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      next = (ix + 1) % tabs.length;
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      next = (ix - 1 + tabs.length) % tabs.length;
    } else if (e.key === "Home") {
      e.preventDefault();
      next = 0;
    } else if (e.key === "End") {
      e.preventDefault();
      next = tabs.length - 1;
    } else {
      return;
    }
    const id = tabs[next]?.dataset.jobPickerTab;
    if (id) {
      applyJobPickerTab(root, id);
      tabs[next]?.focus();
    }
  });

  dialog.addEventListener("close", () => {
    trigger.setAttribute("aria-expanded", "false");
    trigger.focus();
  });

  dialog.addEventListener("click", (e) => {
    if (e.target === dialog) closeJobPicker();
  });

  root.querySelector(".job-picker-close")!.addEventListener("click", () => closeJobPicker());

  root.querySelector("#job-picker-body")!.addEventListener("click", (e) => {
    const t = (e.target as HTMLElement).closest(".job-picker-card") as HTMLButtonElement | null;
    if (!t?.dataset.jobKey) return;
    pickJob(t.dataset.jobKey);
  });

  let shareStatusTimer: ReturnType<typeof setTimeout> | undefined;
  root.querySelector("#btn-share")!.addEventListener("click", () => {
    const statusEl = root.querySelector("#share-status") as HTMLElement | null;
    const token = encodeSharePayload();
    const u = new URL(window.location.href);
    u.searchParams.set(SHARE_QUERY, token);
    const shareUrl = u.toString();
    const showStatus = (msg: string): void => {
      if (!statusEl) return;
      statusEl.textContent = msg;
      if (shareStatusTimer !== undefined) clearTimeout(shareStatusTimer);
      shareStatusTimer = window.setTimeout(() => {
        statusEl.textContent = "";
        shareStatusTimer = undefined;
      }, 4000);
    };
    void (async () => {
      try {
        await navigator.clipboard.writeText(shareUrl);
        showStatus("Link copied - paste it to share this build.");
      } catch {
        window.prompt("Copy this link to share your build:", shareUrl);
        showStatus("");
      }
    })();
  });

  root.querySelector("#btn-reset")!.addEventListener("click", () => {
    levels = {};
    for (const s of skills) levels[s.id] = 0;
    saveState();
    refreshAll(root);
  });

  const genderBtn = root.querySelector("#btn-sit-gender") as HTMLButtonElement;
  const syncGenderBtn = (): void => {
    const isFemale = sitGender === "female";
    genderBtn.dataset.gender = sitGender;
    genderBtn.setAttribute("aria-label", `Gender: ${isFemale ? "female" : "male"}. Toggle gender`);
  };
  syncGenderBtn();
  genderBtn.addEventListener("click", () => {
    sitGender = sitGender === "female" ? "male" : "female";
    localStorage.setItem(GENDER_STORAGE_KEY, sitGender);
    syncGenderBtn();
    syncJobPickerUi(root);
  });

  const dimToggle = root.querySelector("#toggle-disable-hover-dim") as HTMLInputElement;
  dimToggle.checked = disableHoverSkillDimming;
  dimToggle.addEventListener("change", () => {
    disableHoverSkillDimming = dimToggle.checked;
    persistDisableHoverSkillDimming();
    if (focusHoverSkillId) applyPrereqHighlights(root, focusHoverSkillId);
    else clearPrereqHighlights(root);
  });

  renderColumns(root);
  refreshAll(root);
  syncJobPickerUi(root);
}

function skillNodeEl(skill: SkillDef): HTMLElement {
  const el = document.createElement("div");
  el.className = "skill-node" + (skill.transcendent ? " skill-node--transcendent" : "");
  el.dataset.skillId = skill.id;
  el.tabIndex = 0;
  const pips = Array.from(
    { length: skill.maxLevel },
    (_, i) =>
      `<button type="button" class="pip" aria-label="Set level to ${i + 1}"></button>`,
  ).join("");
  el.innerHTML = `
    <div class="skill-node-row">
      <div class="skill-icon" aria-hidden="true"><span class="skill-icon-fallback"></span></div>
      <div class="skill-node-main">
        <span class="name">${escapeHtml(skill.name)}</span>
        <div class="level-pips" aria-label="Skill level">${pips}</div>
        <div class="lvl-row">
          <button type="button" class="lvl down" data-delta="-1" aria-label="Decrease ${escapeHtml(skill.name)}">−</button>
          <span class="lvl-disp"><span class="cur">0</span><span class="lvl-sep" aria-hidden="true">/</span><span class="lvl-max">${skill.maxLevel}</span></span>
          <button type="button" class="lvl up" data-delta="1" aria-label="Increase ${escapeHtml(skill.name)}">+</button>
        </div>
      </div>
    </div>
  `;

  el.querySelector(".down")!.addEventListener("click", () => changeLevel(skill.id, -1));
  el.querySelector(".up")!.addEventListener("click", () => changeLevel(skill.id, 1));

  el.querySelectorAll(".level-pips .pip").forEach((pip, i) => {
    const targetLevel = i + 1;
    pip.addEventListener("click", (e) => {
      e.stopPropagation();
      setSkillLevel(skill.id, targetLevel);
    });
  });

  el.addEventListener("keydown", (e) => {
    if (e.key === "ArrowUp" || e.key === "+") {
      e.preventDefault();
      changeLevel(skill.id, 1);
    } else if (e.key === "ArrowDown" || e.key === "-") {
      e.preventDefault();
      changeLevel(skill.id, -1);
    }
  });

  const icon = el.querySelector(".skill-icon") as HTMLElement;
  const fallback = icon.querySelector(".skill-icon-fallback") as HTMLSpanElement;
  fallback.textContent = skill.name.slice(0, 1).toUpperCase();

  const sid = skill.skidId;
  if (sid != null && sid > 0) {
    const img = document.createElement("img");
    img.className = "skill-icon-img";
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.referrerPolicy = "no-referrer";
    img.src = skillIconUrl(sid);
    img.addEventListener("load", () => img.classList.add("skill-icon-img--show"));
    img.addEventListener("error", () => img.remove());
    icon.insertBefore(img, fallback);
  }

  return el;
}

type AutofillBump = { id: string; target: number };

/** Prerequisite level bumps needed so `skillId` can gain +1 (transitive chain, capped by max levels). */
function computePrereqAutofillBumps(skillId: string): { cur: number; bumps: AutofillBump[] } | null {
  const skill = getSkill(skillId);
  if (!skill) return null;
  const cur = levels[skillId] ?? 0;
  if (cur >= skill.maxLevel) return null;

  const closure = transitivePrereqClosure(skillId);
  const rawReq = maxRequiredLevelAmongEdgesInClosure(closure);

  const bumps: AutofillBump[] = [];
  for (const [id, req] of rawReq) {
    if (id === skillId) continue;
    const sk = getSkill(id);
    if (!sk) continue;
    const target = Math.min(req, sk.maxLevel);
    const c = levels[id] ?? 0;
    if (c < target) {
      bumps.push({ id, target });
    }
  }
  return { cur, bumps };
}

/** +1 now, or +1 after auto-filling prereqs (per-class point budget may be exceeded; UI shows warning). */
function canRaiseWithAutofill(skillId: string): boolean {
  if (canRaise(skillId)) return true;
  return computePrereqAutofillBumps(skillId) != null;
}

/**
 * Raise `skillId` by 1, bumping transitive prerequisites to the minimum levels required by the
 * dependency chain (same rule as hover pip hints).
 */
function raiseWithPrereqAutofill(skillId: string): boolean {
  const plan = computePrereqAutofillBumps(skillId);
  if (!plan) return false;

  for (const { id, target } of plan.bumps) {
    levels[id] = target;
  }
  levels[skillId] = plan.cur + 1;
  return true;
}

function tryIncrementSkillOnce(skillId: string): boolean {
  if (canRaise(skillId)) {
    levels[skillId] = (levels[skillId] ?? 0) + 1;
    return true;
  }
  return raiseWithPrereqAutofill(skillId);
}

/** Set skill to `target` (0…max). Raising may auto-fill prereqs stepwise; stops early if blocked. */
function setSkillLevel(skillId: string, target: number): void {
  const skill = getSkill(skillId);
  if (!skill) return;
  const t = Math.max(0, Math.min(Math.floor(target), skill.maxLevel));
  const cur = levels[skillId] ?? 0;
  if (t === cur) return;

  if (t < cur) {
    const lv = { ...levels, [skillId]: t };
    stabilizePrereqViolations(lv);
    levels = lv;
  } else {
    while ((levels[skillId] ?? 0) < t) {
      if (!tryIncrementSkillOnce(skillId)) break;
    }
  }

  saveState();
  refreshAll(document.querySelector("#app")!);
}

function changeLevel(skillId: string, delta = 1): void {
  if (delta > 0) {
    if (canRaise(skillId)) {
      levels[skillId] = (levels[skillId] ?? 0) + 1;
    } else if (!raiseWithPrereqAutofill(skillId)) {
      return;
    }
  } else {
    const cur = levels[skillId] ?? 0;
    if (cur <= 0) return;
    const lv = { ...levels, [skillId]: cur - 1 };
    stabilizePrereqViolations(lv);
    levels = lv;
  }
  saveState();
  refreshAll(document.querySelector("#app")!);
}

function setToolbarTierStat(
  wrap: Element | null,
  usedEl: Element | null,
  capEl: Element | null,
  wordEl: Element | null,
  remEl: Element | null,
  used: number,
  cap: number,
  ariaTierName: string,
): void {
  if (!usedEl || !capEl || !wordEl || !remEl) return;
  usedEl.textContent = String(used);
  capEl.textContent = String(cap);
  const over = used > cap;
  wordEl.textContent = over ? "over" : "left";
  remEl.textContent = over ? String(used - cap) : String(cap - used);
  wrap?.classList.toggle("stat--over-cap", over);
  if (wrap instanceof HTMLElement) {
    wrap.setAttribute("aria-invalid", over ? "true" : "false");
    const base = `${ariaTierName}: ${used} of ${cap} class skill points`;
    wrap.setAttribute(
      "aria-label",
      over ? `${base}, over budget by ${used - cap}` : `${base}, ${cap - used} left`,
    );
    if (over) wrap.setAttribute("title", "Over class skill point budget");
    else wrap.removeAttribute("title");
  }
}

function updateToolbarClassStats(root: HTMLElement): void {
  const job = getJobData(currentJob);
  const perTier = pointsUsedPerClassTier(levels);
  const contentLen = job ? getContentColumnIndices(job).length : 0;
  const unifiedTrans = job !== undefined && shouldMergeTranscendentIntoSecondPanel(job);

  const wrap0 = root.querySelector("#stat-tier0");
  const t0Used = root.querySelector("#used-tier0");
  const t0Cap = root.querySelector("#cap-tier0");
  const t0Rem = root.querySelector("#remain-tier0");
  const word0 = root.querySelector("#remain-word-tier0");
  const label0 = root.querySelector("#label-tier0");
  const label1 = root.querySelector("#label-tier1");
  const label2 = root.querySelector("#label-tier2");
  const contentCols = job ? getContentColumnIndices(job) : [];

  if (job && contentLen >= 1 && t0Used && t0Cap && t0Rem && word0) {
    const cap0 = capForClassTier(0);
    const u0 = perTier[0] ?? 0;
    const c0 = contentCols[0];
    if (label0 && c0 !== undefined) label0.textContent = job.columns[c0]?.title ?? "Class";
    const aria0 =
      c0 !== undefined ? (job.columns[c0]?.title ?? "Class") : "First class column";
    setToolbarTierStat(wrap0, t0Used, t0Cap, word0, t0Rem, u0, cap0, aria0);
    wrap0?.classList.remove("stat--hidden");
  } else {
    wrap0?.classList.add("stat--hidden");
    wrap0?.classList.remove("stat--over-cap");
  }

  const wrap1 = root.querySelector("#stat-tier1");
  const t1Used = root.querySelector("#used-tier1");
  const t1Cap = root.querySelector("#cap-tier1");
  const t1Rem = root.querySelector("#remain-tier1");
  const word1 = root.querySelector("#remain-word-tier1");
  if (job && contentLen >= 2 && t1Used && t1Cap && t1Rem && word1) {
    const cap1 = capForClassTier(1);
    const u1 = perTier[1] ?? 0;
    let aria1 = "Second class column";
    if (label1) {
      if (unifiedTrans) {
        label1.textContent = job.label;
        aria1 = `${job.label} (combined second + transcendent pool)`;
      } else {
        const c1 = contentCols[1];
        label1.textContent = c1 !== undefined ? (job.columns[c1]?.title ?? "Class") : "Class";
        aria1 = c1 !== undefined ? (job.columns[c1]?.title ?? "Class") : aria1;
      }
    }
    setToolbarTierStat(wrap1, t1Used, t1Cap, word1, t1Rem, u1, cap1, aria1);
    wrap1?.classList.remove("stat--hidden");
  } else {
    wrap1?.classList.add("stat--hidden");
    wrap1?.classList.remove("stat--over-cap");
  }

  const wrap2 = root.querySelector("#stat-tier2");
  const t2Used = root.querySelector("#used-tier2");
  const t2Cap = root.querySelector("#cap-tier2");
  const t2Rem = root.querySelector("#remain-tier2");
  const word2 = root.querySelector("#remain-word-tier2");
  if (job && contentLen >= 3 && !unifiedTrans && t2Used && t2Cap && t2Rem && word2) {
    const cap2 = capForClassTier(2);
    const u2 = perTier[2] ?? 0;
    const c2 = contentCols[2];
    if (label2 && c2 !== undefined) label2.textContent = job.columns[c2]?.title ?? "Transcendent";
    const aria2 = c2 !== undefined ? (job.columns[c2]?.title ?? "Transcendent") : "Transcendent column";
    setToolbarTierStat(wrap2, t2Used, t2Cap, word2, t2Rem, u2, cap2, aria2);
    wrap2?.classList.remove("stat--hidden");
  } else {
    wrap2?.classList.add("stat--hidden");
    wrap2?.classList.remove("stat--over-cap");
  }

  const wrapQ = root.querySelector("#stat-quest");
  const qUsed = root.querySelector("#used-quest");
  if (job && getQuestColumnIndex(job) >= 0 && qUsed) {
    qUsed.textContent = String(questPointsUsed(levels));
    wrapQ?.classList.remove("stat--hidden");
  } else {
    wrapQ?.classList.add("stat--hidden");
  }

  const totalEl = root.querySelector("#used-total");
  if (totalEl) totalEl.textContent = String(totalPointsUsed(levels));
}

function updatePanelClassPoints(root: HTMLElement): void {
  const job = getJobData(currentJob);
  if (!job) return;
  const perTier = pointsUsedPerClassTier(levels);
  const content = getContentColumnIndices(job);

  const merged = root.querySelector("#panel-class-pts-merged");
  if (merged) {
    const parts = content.map((col, t) => {
      const title = job.columns[col]?.title ?? `Class ${t + 1}`;
      const used = perTier[t] ?? 0;
      const cap = capForClassTier(t);
      return { title, used, cap };
    });
    merged.innerHTML = parts
      .map((p, i) => {
        const over = p.used > p.cap;
        const delim =
          i > 0 ? `<span class="panel-title__stats-delim" aria-hidden="true"> · </span>` : "";
        const badge = over ? `<span class="panel-over-badge" aria-hidden="true">!</span>` : "";
        const usedCls = over ? "panel-title__stat-num panel-title__stat-num--over" : "panel-title__stat-num";
        return `${delim}${badge}<span class="${usedCls}">${p.used}</span><span class="panel-title__stat-sep"> / </span><span class="panel-title__stat-cap">${p.cap}</span>`;
      })
      .join("");
    merged.classList.toggle(
      "panel-title__stats--over-cap",
      parts.some((p) => p.used > p.cap),
    );
    merged.setAttribute(
      "aria-label",
      parts
        .map((p) =>
          p.used > p.cap
            ? `${p.title} ${p.used} of ${p.cap} skill points, over budget by ${p.used - p.cap}`
            : `${p.title} ${p.used} of ${p.cap} skill points`,
        )
        .join(". "),
    );
  }

  root.querySelectorAll(".panel-title__stats[data-content-tier]").forEach((el) => {
    const t = Number((el as HTMLElement).dataset.contentTier);
    if (!Number.isFinite(t)) return;
    const used = perTier[t] ?? 0;
    const cap = capForClassTier(t);
    const over = used > cap;
    const he = el as HTMLElement;
    he.classList.toggle("panel-title__stats--over-cap", over);
    const badge = over ? `<span class="panel-over-badge" aria-hidden="true">!</span>` : "";
    const usedCls = over ? "panel-title__stat-num panel-title__stat-num--over" : "panel-title__stat-num";
    he.innerHTML = `${badge}<span class="${usedCls}">${used}</span><span class="panel-title__stat-sep"> / </span><span class="panel-title__stat-cap">${cap}</span>`;
    const colName =
      he.closest(".panel-title")?.querySelector(".panel-title__name")?.textContent?.trim() ??
      "Class column";
    he.setAttribute(
      "aria-label",
      over
        ? `${colName}, ${used} of ${cap} skill points, over budget by ${used - cap}`
        : `${colName}, ${used} of ${cap} skill points`,
    );
  });

  const pq = root.querySelector("#panel-class-pts-quest");
  if (pq && getQuestColumnIndex(job) >= 0) {
    const q = questPointsUsed(levels);
    pq.textContent = String(q);
    pq.setAttribute("aria-label", `${q} points in quest and special skills, no class cap`);
  }
}

function refreshAll(root: HTMLElement): void {
  updateToolbarClassStats(root);
  updatePanelClassPoints(root);

  for (const skill of skills) {
    const node = root.querySelector(`[data-skill-id="${skill.id}"]`);
    if (!node) continue;
    const cur = levels[skill.id] ?? 0;
    const curEl = node.querySelector(".cur");
    if (curEl) curEl.textContent = String(cur);

    let pipFill = cur;
    if (
      focusHoverSkillId !== null &&
      focusPrereqDisplayLevels !== null &&
      skill.id !== focusHoverSkillId
    ) {
      const req = focusPrereqDisplayLevels.get(skill.id);
      if (req !== undefined) {
        pipFill = Math.min(req, skill.maxLevel);
      }
    }

    node.querySelectorAll(".level-pips .pip").forEach((pip, i) => {
      pip.classList.toggle("pip--on", i < pipFill);
      pip.classList.toggle(
        "pip--req-hint",
        focusHoverSkillId !== null &&
          skill.id !== focusHoverSkillId &&
          focusPrereqDisplayLevels?.has(skill.id) === true &&
          i < pipFill &&
          i >= cur,
      );
    });

    node.classList.toggle("skill-node--invested", cur > 0);
    node.classList.toggle("skill-node--maxed", cur > 0 && cur >= skill.maxLevel);

    const up = node.querySelector(".up") as HTMLButtonElement;
    const down = node.querySelector(".down") as HTMLButtonElement;
    up.disabled = !canRaiseWithAutofill(skill.id);
    down.disabled = (levels[skill.id] ?? 0) <= 0;

    const tab = node.closest(".skill-cell")?.querySelector(".skill-prereq-tab");
    if (tab && tab.classList.contains("skill-prereq-tab--none") === false) {
      tab.classList.toggle("skill-prereq-tab--met", prereqsAllMet(skill.id));
    }
  }
}

function clearPrereqHighlights(root: HTMLElement, skipRefresh = false): void {
  focusHoverSkillId = null;
  focusPrereqDisplayLevels = null;
  root.querySelector("#tree-board")?.classList.remove("tree-board--skill-focus");
  root.querySelectorAll(".skill-node--hover, .skill-node--prereq, .skill-node--postreq").forEach((el) => {
    el.classList.remove("skill-node--hover", "skill-node--prereq", "skill-node--postreq");
  });
  root.querySelectorAll(".skill-cell--dimmed").forEach((el) => {
    el.classList.remove("skill-cell--dimmed");
  });
  root.querySelectorAll(".skill-slot--dimmed").forEach((el) => {
    el.classList.remove("skill-slot--dimmed");
  });
  if (!skipRefresh) {
    refreshAll(root);
  }
}

function applyPrereqHighlights(root: HTMLElement, skillId: string): void {
  clearPrereqHighlights(root, true);
  if (!disableHoverSkillDimming) {
    root.querySelector("#tree-board")?.classList.add("tree-board--skill-focus");
  }

  const preClosure = transitivePrereqClosure(skillId);
  const postClosure = transitivePostreqClosure(skillId);
  const keepLit = new Set<string>([...preClosure, ...postClosure]);

  const rawReq = maxRequiredLevelAmongEdgesInClosure(preClosure);
  focusHoverSkillId = skillId;
  focusPrereqDisplayLevels = new Map<string, number>();
  for (const [id, req] of rawReq) {
    const sk = getSkill(id);
    if (sk) {
      focusPrereqDisplayLevels.set(id, Math.min(req, sk.maxLevel));
    }
  }

  const self = root.querySelector(`[data-skill-id="${skillId}"]`);
  self?.classList.add("skill-node--hover");
  for (const id of preClosure) {
    if (id === skillId) continue;
    root.querySelector(`[data-skill-id="${id}"]`)?.classList.add("skill-node--prereq");
  }
  for (const id of postClosure) {
    if (id === skillId) continue;
    root.querySelector(`[data-skill-id="${id}"]`)?.classList.add("skill-node--postreq");
  }

  if (!disableHoverSkillDimming) {
    root.querySelectorAll(".skill-cell").forEach((cell) => {
      const node = cell.querySelector(".skill-node") as HTMLElement | null;
      const sid = node?.dataset.skillId;
      if (!sid || keepLit.has(sid)) return;
      cell.classList.add("skill-cell--dimmed");
    });

    root.querySelectorAll(".skill-slot--empty").forEach((el) => {
      el.classList.add("skill-slot--dimmed");
    });
  }

  refreshAll(root);
}

function attachSkillInteractionHandlers(root: HTMLElement): void {
  root.querySelectorAll(".skill-cell").forEach((cell) => {
    const node = cell.querySelector(".skill-node") as HTMLElement | null;
    if (!node?.dataset.skillId) return;
    const id = node.dataset.skillId;
    if (!getSkill(id)) return;

    /** Skip focusin open when the same interaction will fire click (avoids open-then-close). */
    let skipNextFocusOpenFromPointer = false;
    node.addEventListener("pointerdown", () => {
      skipNextFocusOpenFromPointer = true;
      requestAnimationFrame(() => {
        skipNextFocusOpenFromPointer = false;
      });
    });

    node.addEventListener("click", (e) => {
      if ((e.target as HTMLElement).closest("button.lvl, button.pip")) return;
      if (tooltipLockedSkillId === id) {
        unlockTooltip(root);
        return;
      }
      openSkillTooltip(root, id, node);
    });

    /* Prereq / postreq highlights on hover only when no description tooltip is open. */
    node.addEventListener("mouseenter", () => {
      if (tooltipLockedSkillId != null) return;
      applyPrereqHighlights(root, id);
    });
    node.addEventListener("mouseleave", () => {
      if (tooltipLockedSkillId != null) return;
      clearPrereqHighlights(root);
    });

    cell.addEventListener("focusin", () => {
      if (skipNextFocusOpenFromPointer) return;
      if (tooltipLockedSkillId === id) return;
      if (tooltipLockedSkillId != null) unlockTooltip(root);
      openSkillTooltip(root, id, node);
    });
    cell.addEventListener("focusout", (ev) => {
      const rt = (ev as FocusEvent).relatedTarget as Node | null;
      if (cell.contains(rt) || (rt instanceof Node && tooltip.contains(rt))) return;
      if (tooltipLockedSkillId === id) unlockTooltip(root);
    });
  });
}

loadState();
ensureCurrentJobInData();
const fromShare = readShareFromUrl();
if (fromShare) {
  applyJob(fromShare.j, fromShare.l);
  saveState();
} else {
  applyJob(currentJob);
}
const appRoot = document.querySelector("#app") as HTMLElement;
renderApp(appRoot);

let textFitResizeTimer: ReturnType<typeof setTimeout> | undefined;
window.addEventListener("resize", () => {
  window.clearTimeout(textFitResizeTimer);
  textFitResizeTimer = window.setTimeout(() => {
    scheduleFitSkillText(appRoot);
    if (tooltipLockedSkillId) {
      const n = appRoot.querySelector(
        `[data-skill-id="${CSS.escape(tooltipLockedSkillId)}"]`,
      ) as HTMLElement | null;
      if (n) positionTooltipNearSkill(n.getBoundingClientRect());
    }
    fitTooltipDynamicText();
  }, 120);
});
