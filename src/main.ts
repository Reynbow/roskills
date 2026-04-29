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
  setPlannerGameMode,
  getPlannerGameMode,
  isThirdClassKey,
  type GameMode,
  type JobData,
  type JobPickerSection,
  type JobPickerTabDef,
  type SkillDef,
  type PrereqEdge,
} from "./planner-data";
import { jobPickerStandSpriteUrl } from "./job-previews";
import { jobSitLocalPngUrl, jobSitPortraitFallbackUrl } from "./job-sit-sprite";

// Initialize Vercel Web Analytics (never block app shell if script fails)
try {
  inject();
} catch {
  /* ignore */
}

const STORAGE_KEY = "ro-planner-state-v2";
const GAME_MODE_STORAGE_KEY = "ro-planner-game-mode";
const THIRD_CLASS_PATH_STORAGE_KEY = "ro-planner-third-class-path";
type ThirdClassPathKey = "trans" | "base";

function getDefaultThirdPathForJobPicker(jobKey: string): ThirdClassPathKey {
  if (isThirdClassKey(jobKey)) {
    return jobKey.endsWith("_H") ? "trans" : "base";
  }
  const s = localStorage.getItem(THIRD_CLASS_PATH_STORAGE_KEY);
  if (s === "base" || s === "trans") return s;
  return "trans";
}

function applyThirdClassPathPanel(root: HTMLElement, path: ThirdClassPathKey): void {
  const panel = root.querySelector("#job-picker-panel-third");
  if (!panel) return;
  panel.querySelectorAll<HTMLElement>(".job-picker-thirdclass-path[data-third-path]").forEach((el) => {
    const k = el.dataset.thirdPath as ThirdClassPathKey;
    if (k === path) el.removeAttribute("hidden");
    else el.setAttribute("hidden", "");
  });
  panel.querySelectorAll<HTMLButtonElement>(".job-picker-thirdclass-toggle button[data-third-path]").forEach(
    (btn) => {
      const k = btn.dataset.thirdPath as ThirdClassPathKey;
      const on = k === path;
      btn.classList.toggle("game-mode-toggle__btn--active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    },
  );
}

function alignThirdClassPathToCurrentJobIfApplicable(root: HTMLElement, jobKey: string): void {
  if (isThirdClassKey(jobKey)) {
    applyThirdClassPathPanel(root, jobKey.endsWith("_H") ? "trans" : "base");
  }
}
const DEFAULT_JOB = "JT_PRIEST";
const DEFAULT_JOB_RENEWAL = "JT_RUNE_KNIGHT";

function defaultJobForMode(): string {
  return getPlannerGameMode() === "renewal" ? DEFAULT_JOB_RENEWAL : DEFAULT_JOB;
}

/** If stored or default job key is missing from bundled data, fall back so the tree can render. */
function ensureCurrentJobInData(): void {
  if (getJobData(currentJob)) return;
  currentJob = defaultJobForMode();
  if (getJobData(currentJob)) return;
  const first = listJobs()[0]?.key;
  if (first) currentJob = first;
}

/** Client skill icons by SKID (same numeric id as rAthena / planner `skidId`). Divine Pride: singular `skill`, not `skills`. */
function skillIconUrl(skidId: number): string {
  return `https://static.divine-pride.net/images/skill/${skidId}.png`;
}

/**
 * Skill point caps per class tier (per-column).
 *
 * RO skill points are earned per job level-up: job level N implies N-1 points earned in that tier.
 * (Novice Basic Skill is exempt from the per-class cap in this planner.)
 *
 * Pre-renewal tiers here map to: 1st (49), 2nd (49), transcendent/3rd-style tiers (69).
 */
const CLASS_SKILL_CAPS: readonly number[] = [49, 49, 69];

/**
 * Renewal: tiers include 3rd job (max job level 70 → 69 points) and 4th job (max job level 50 → 49 points).
 * Extra content columns beyond these reuse the last cap.
 */
const CLASS_SKILL_CAPS_RENEWAL: readonly number[] = [49, 49, 69, 49, 49, 49, 49, 49, 49];

function classSkillCaps(): readonly number[] {
  return getPlannerGameMode() === "renewal" ? CLASS_SKILL_CAPS_RENEWAL : CLASS_SKILL_CAPS;
}

/** Single merged-column jobs that use a non-default tier-0 class point cap (rest use CLASS_SKILL_CAPS[0]). */
const TIER0_CLASS_CAP_OVERRIDE: Partial<Record<string, number>> = {
  /** Super Novice: total class pool is 99 (server rule). */
  JT_SUPERNOVICE: 99,
  /** Expanded classes: max job level 70 → 69 class skill points (Basic Skill still exempt). */
  JT_TAEKWON: 69,
  JT_STAR: 69,
  JT_LINKER: 69,
  JT_NINJA: 69,
  JT_GUNSLINGER: 69,
};

/** Transcendent jobs: second + transcendent columns share one pool (high 2nd max job level 70 → 69 points). */
const TRANSCENDENT_COMBINED_SECOND_CAP = 69;

/** Basic Skill does not consume the per-class skill point budget (matches common planner / in-game treatment). */
const BASIC_SKILL_ID = "nv_basic";

function exemptFromClassSkillCap(skillId: string): boolean {
  return skillId === BASIC_SKILL_ID;
}

type PlannerSlot = {
  lastJob?: string;
  jobs: Record<string, { levels: Record<string, number>; budget?: number }>;
};

type Stored = {
  lastJob?: string;
  jobs?: Record<string, { levels: Record<string, number>; budget?: number }>;
  /** Per game version: class builds and last-opened job. */
  plannerSlots?: Record<GameMode, PlannerSlot>;
  /** When true, prereq ring on hover stays but unrelated skills are not dimmed. */
  disableHoverSkillDimming?: boolean;
};

function normalizePlannerSlots(raw: Stored): Record<GameMode, PlannerSlot> {
  if (!raw.plannerSlots) {
    raw.plannerSlots = {
      pre: {
        lastJob: raw.lastJob ?? DEFAULT_JOB,
        jobs: raw.jobs ?? {},
      },
      renewal: {
        lastJob: DEFAULT_JOB_RENEWAL,
        jobs: {},
      },
    };
  }
  for (const mode of ["pre", "renewal"] as const) {
    if (!raw.plannerSlots[mode].jobs) raw.plannerSlots[mode].jobs = {};
  }
  return raw.plannerSlots;
}

function currentPlannerSlot(raw: Stored): PlannerSlot {
  return normalizePlannerSlots(raw)[getPlannerGameMode()];
}

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
    const slot = currentPlannerSlot(data);
    if (slot.lastJob && getJobData(slot.lastJob)) currentJob = slot.lastJob;
    if (data.disableHoverSkillDimming === true) disableHoverSkillDimming = true;
  } catch {
    /* ignore */
  }
}

function persistDisableHoverSkillDimming(): void {
  let raw: Stored = {};
  try {
    raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Stored;
  } catch {
    raw = {};
  }
  normalizePlannerSlots(raw);
  if (disableHoverSkillDimming) raw.disableHoverSkillDimming = true;
  else delete raw.disableHoverSkillDimming;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(raw));
}

function saveState(): void {
  let raw: Stored = {};
  try {
    raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Stored;
  } catch {
    raw = {};
  }
  const slot = currentPlannerSlot(raw);
  slot.lastJob = currentJob;
  slot.jobs[currentJob] = { levels };
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
      const slot = currentPlannerSlot(data).jobs[jobKey];
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
const SHARE_JSON_VERSION = 2;

function encodeSharePayload(): string {
  const l: Record<string, number> = {};
  for (const [id, n] of Object.entries(levels)) {
    if (n > 0) l[id] = n;
  }
  const payload: {
    v: number;
    j: string;
    l: Record<string, number>;
    game?: GameMode;
  } = { v: SHARE_JSON_VERSION, j: currentJob, l };
  if (getPlannerGameMode() === "renewal") payload.game = "renewal";
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeSharePayload(token: string): { j: string; l: Record<string, number>; game?: GameMode } | null {
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
      game?: string;
    };
    if (!o || typeof o.j !== "string") return null;
    if (!o.l || typeof o.l !== "object") return null;
    const l: Record<string, number> = {};
    for (const [k, v] of Object.entries(o.l)) {
      const n = typeof v === "number" ? v : Number.parseInt(String(v), 10);
      if (Number.isFinite(n) && n > 0) l[k] = Math.floor(n);
    }
    const game: GameMode | undefined =
      o.game === "renewal" ? "renewal" : o.game === "pre" ? "pre" : undefined;
    return { j: o.j, l, game };
  } catch {
    return null;
  }
}

function readShareFromUrl(): { j: string; l: Record<string, number>; game?: GameMode } | null {
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
  const caps = classSkillCaps();
  const job = getJobData(currentJob);
  if (job && shouldMergeTranscendentIntoSecondPanel(job)) {
    if (tierIndex === 0) {
      return TIER0_CLASS_CAP_OVERRIDE[job.key] ?? caps[0]!;
    }
    return TRANSCENDENT_COMBINED_SECOND_CAP;
  }
  if (tierIndex === 0 && job && TIER0_CLASS_CAP_OVERRIDE[job.key] != null) {
    return TIER0_CLASS_CAP_OVERRIDE[job.key]!;
  }
  return caps[Math.min(tierIndex, caps.length - 1)]!;
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

function loadJobPickerStandHalf(cell: HTMLElement, url: string): void {
  cell.querySelectorAll(".job-picker-sprite-img").forEach((n) => n.remove());
  const fb = cell.querySelector(".job-picker-sprite-fallback") as HTMLSpanElement | null;
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
  if (fb) cell.insertBefore(img, fb);
  else cell.appendChild(img);
  if (img.complete && img.naturalHeight > 0) onLoad();
  else if (img.complete && img.naturalHeight === 0) img.remove();
}

/** Bard/Dancer line jobs: gender-locked in RO — one stand in the class picker, not a male+female pair. */
const JOB_PICKER_STAND_MALE_ONLY = new Set<string>([
  "JT_BARD",
  "JT_BARD_H",
  "JT_MINSTREL",
  "JT_MINSTREL_H",
  "JT_TROUBADOUR",
]);
const JOB_PICKER_STAND_FEMALE_ONLY = new Set<string>([
  "JT_DANCER",
  "JT_DANCER_H",
  "JT_WANDERER",
  "JT_WANDERER_H",
  "JT_TROUVERE",
]);

type JobPickerStandSpriteMode = "dual" | "male" | "female";

function jobPickerStandSpriteMode(jobKey: string): JobPickerStandSpriteMode {
  if (JOB_PICKER_STAND_MALE_ONLY.has(jobKey)) return "male";
  if (JOB_PICKER_STAND_FEMALE_ONLY.has(jobKey)) return "female";
  return "dual";
}

function jobPickerDualStandPairInnerHtml(): string {
  return `<span class="job-picker-stand-pair">
            <span class="job-picker-stand-pair__cell" data-stand-gender="male" title="Male">
              <span class="job-picker-sprite-fallback" aria-hidden="true">♂</span>
            </span>
            <span class="job-picker-stand-pair__cell" data-stand-gender="female" title="Female">
              <span class="job-picker-sprite-fallback" aria-hidden="true">♀</span>
            </span>
          </span>`;
}

function jobPickerSoloStandPairInnerHtml(g: "male" | "female"): string {
  const title = g === "male" ? "Male" : "Female";
  const sym = g === "male" ? "♂" : "♀";
  return `<span class="job-picker-stand-pair job-picker-stand-pair--solo" data-stand-top="${g}">
            <span class="job-picker-stand-pair__cell" data-stand-gender="${g}" title="${title}">
              <span class="job-picker-sprite-fallback" aria-hidden="true">${sym}</span>
            </span>
          </span>`;
}

function jobPickerCardSpriteHtml(jobKey: string): string {
  const m = jobPickerStandSpriteMode(jobKey);
  const dual = m === "dual";
  const cls = `job-picker-sprite job-picker-sprite--card${dual ? " job-picker-sprite--dual" : ""}`;
  const inner = dual ? jobPickerDualStandPairInnerHtml() : jobPickerSoloStandPairInnerHtml(m);
  return `<span class="${cls}" aria-hidden="true">${inner}</span>`;
}

/** Class picker cards / modal: load bundled stand art (dual male+female, or a single cell for gender-locked jobs). */
function setJobPickerStandArt(spriteEl: HTMLElement, jobKey: string): void {
  const male = spriteEl.querySelector('[data-stand-gender="male"]') as HTMLElement | null;
  const female = spriteEl.querySelector('[data-stand-gender="female"]') as HTMLElement | null;
  if (male) loadJobPickerStandHalf(male, jobPickerStandSpriteUrl(jobKey, "male"));
  if (female) loadJobPickerStandHalf(female, jobPickerStandSpriteUrl(jobKey, "female"));
}

/** Which gender layer is in front — matches sit-dock gender toggle (`data-stand-top` on `.job-picker-stand-pair`). */
function updateJobPickerStandStacking(root: HTMLElement): void {
  const top = sitGender;
  root.querySelectorAll(".job-picker-stand-pair").forEach((el) => {
    (el as HTMLElement).setAttribute("data-stand-top", top);
  });
}

const GENDER_STORAGE_KEY = "ro-sit-gender";
type SitGender = "male" | "female";
let sitGender: SitGender = (localStorage.getItem(GENDER_STORAGE_KEY) as SitGender) || "male";
if (sitGender !== "male" && sitGender !== "female") sitGender = "male";

function syncJobPickerUi(root: HTMLElement): void {
  const label = getJobData(currentJob)?.label ?? currentJob;
  const labEl = root.querySelector("#job-picker-current-label");
  if (labEl) labEl.textContent = label;
  const trig = root.querySelector("#job-picker-trigger") as HTMLButtonElement | null;
  if (trig) trig.setAttribute("aria-label", `Class: ${label}. Open class picker`);
  root.querySelectorAll(".job-picker-card").forEach((btn) => {
    const key = (btn as HTMLButtonElement).dataset.jobKey;
    if (!key) return;
    const sp = btn.querySelector(".job-picker-sprite") as HTMLElement | null;
    if (sp) setJobPickerStandArt(sp, key);
    const on = key === currentJob;
    btn.classList.toggle("job-picker-card--current", on);
    if (on) btn.setAttribute("aria-current", "true");
    else btn.removeAttribute("aria-current");
  });
  updateJobPickerStandStacking(root);

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
        ${jobPickerCardSpriteHtml(key)}
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

function jobPickerJobRowsStackFromSection(g: JobPickerSection, stackAriaLabel: string): string {
  const labelEsc = escapeHtml(g.heading);
  if (!g.jobRows?.length) return "";
  const grids = g.jobRows
    .map((row, ri) => {
      if (row.length === 0) return "";
      const cards = jobPickerRowHtml(row);
      return `<div class="job-picker-grid" role="group" aria-label="${labelEsc}, row ${ri + 1}">${cards}</div>`;
    })
    .join("");
  return `<div class="job-picker-row-stack" role="group" aria-label="${escapeHtml(stackAriaLabel)}">${grids}</div>`;
}

function jobPickerThirdClassTabHtml(
  split: NonNullable<JobPickerTabDef["thirdPathSplit"]>,
  idPrefix: string,
  initialPath: ThirdClassPathKey,
): string {
  const transStack = jobPickerJobRowsStackFromSection(
    split.trans,
    "Third class, transcendent second path (e.g. Lord Knight, Clown, Arch Bishop (Trans.))",
  );
  const baseStack = jobPickerJobRowsStackFromSection(
    split.base,
    "Third class, base second job only (no transcendent 2nd column in tree)",
  );
  const transHidden = initialPath === "trans" ? "" : " hidden";
  const baseHidden = initialPath === "base" ? "" : " hidden";
  const transAct = initialPath === "trans" ? " game-mode-toggle__btn--active" : "";
  const baseAct = initialPath === "base" ? " game-mode-toggle__btn--active" : "";
  const transPressed = initialPath === "trans" ? "true" : "false";
  const basePressed = initialPath === "base" ? "true" : "false";
  const tail = split.after?.length
    ? jobPickerSectionsHtml(split.after, `${idPrefix}-after`)
    : "";
  return `<div class="job-picker-thirdclass">
    <h3 class="job-picker-section-title" id="${idPrefix}-third-title">Third class</h3>
    <div class="job-picker-thirdclass-pathbar" role="group" aria-labelledby="${idPrefix}-path-lbl">
      <span class="job-picker-thirdclass-pathbar-label" id="${idPrefix}-path-lbl">2nd job before 3rd</span>
      <div class="game-mode-toggle job-picker-thirdclass-toggle" role="group" aria-label="Second job type for the third class list">
        <button type="button" class="game-mode-toggle__btn${transAct}" data-third-path="trans" aria-pressed="${transPressed}">Transcendent</button>
        <button type="button" class="game-mode-toggle__btn${baseAct}" data-third-path="base" aria-pressed="${basePressed}">Base 2nd</button>
      </div>
    </div>
    <div class="job-picker-thirdclass-path"${transHidden} data-third-path="trans" role="group" aria-label="Transcendent second, third class">${transStack}</div>
    <div class="job-picker-thirdclass-path"${baseHidden} data-third-path="base" role="group" aria-label="Base second only, third class">${baseStack}</div>
  </div>${tail}`;
}

function jobPickerSectionHtml(g: JobPickerSection, sid: string): string {
  const labelEsc = escapeHtml(g.heading);
  if (g.jobRows?.length) {
    if (g.jobRowsLayout === "progressionLine") {
      const stages = g.jobRows
        .map((row, ri) => {
          if (row.length === 0) return "";
          const cards = jobPickerRowHtml(row);
          const arrow =
            ri === 0 ? "" : `<div class="job-picker-stage-arrow" aria-hidden="true">→</div>`;
          return `${arrow}<div class="job-picker-stage" role="group" aria-label="${labelEsc}, stage ${ri + 1}">
            <div class="job-picker-grid job-picker-grid--stage">${cards}</div>
          </div>`;
        })
        .join("");
      return `<section class="job-picker-section" aria-labelledby="${sid}">
        <h3 class="job-picker-section-title" id="${sid}">${labelEsc}</h3>
        <div class="job-picker-stage-line" role="group" aria-label="${labelEsc} progression">${stages}</div>
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
  if (activeId === "third") {
    alignThirdClassPathToCurrentJobIfApplicable(root, currentJob);
  }
}

function closeJobPickerDialog(root: HTMLElement): void {
  (root.querySelector("#job-picker-dialog") as HTMLDialogElement | null)?.close();
}

function pickJobFromDialog(root: HTMLElement, jobKey: string): void {
  if (!getJobData(jobKey)) return;
  applyJob(jobKey);
  saveState();
  renderColumns(root);
  refreshAll(root);
  syncJobPickerUi(root);
  alignThirdClassPathToCurrentJobIfApplicable(root, currentJob);
  closeJobPickerDialog(root);
}

function syncGameModeToggleUi(root: HTMLElement): void {
  const mode = getPlannerGameMode();
  const headerT = root.querySelector(".game-mode-toggle--header");
  if (headerT) {
    headerT.setAttribute("data-active", mode === "renewal" ? "renewal" : "pre");
  }
  root.querySelectorAll("[data-set-game-mode]").forEach((el) => {
    const btn = el as HTMLButtonElement;
    const m = btn.dataset.setGameMode as GameMode | undefined;
    const on = m === mode;
    btn.classList.toggle("game-mode-toggle__btn--active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
  const title = root.querySelector("#planner-page-title");
  if (title) {
    title.textContent =
      mode === "renewal" ? "RO Renewal Skill Planner" : "RO Pre-Renewal Skill Planner";
  }
}

function buildJobPickerTablistHtml(pickerTabs: JobPickerTabDef[], initialTabId: string): string {
  if (pickerTabs.length <= 1) return "";
  return `<div class="job-picker-tablist" role="tablist" aria-label="Class category">${pickerTabs
    .map((t) => {
      const active = t.id === initialTabId;
      const baseAria =
        t.id === "base"
          ? ` aria-label="Novice, first class, and second class"`
          : t.id === "third"
            ? ` aria-label="Third job classes"`
            : t.id === "fourth"
              ? ` aria-label="Fourth job classes"`
              : "";
      return `<button type="button" class="job-picker-tab${active ? " job-picker-tab--active" : ""}" role="tab"
            id="job-picker-tab-${t.id}" data-job-picker-tab="${escapeHtml(t.id)}"
            aria-selected="${active ? "true" : "false"}"
            aria-controls="job-picker-panel-${escapeHtml(t.id)}"
            tabindex="${active ? "0" : "-1"}"${baseAria}>${escapeHtml(t.label)}</button>`;
    })
    .join("")}</div>`;
}

function buildJobPickerPanelsHtml(pickerTabs: JobPickerTabDef[], initialTabId: string): string {
  return pickerTabs
    .map((t) => {
      const active = t.id === initialTabId;
      const pfx = `job-picker-${t.id}`;
      const inner = t.thirdPathSplit
        ? jobPickerThirdClassTabHtml(t.thirdPathSplit, pfx, getDefaultThirdPathForJobPicker(currentJob))
        : jobPickerSectionsHtml(t.sections, pfx);
      const labelled =
        pickerTabs.length > 1
          ? `aria-labelledby="job-picker-tab-${escapeHtml(t.id)}"`
          : `aria-labelledby="job-picker-dialog-title"`;
      return `<div class="job-picker-tabpanel job-picker-body" role="tabpanel" id="job-picker-panel-${escapeHtml(
        t.id,
      )}" ${labelled}${active ? "" : " hidden"}>${inner}</div>`;
    })
    .join("");
}

function buildJobPickerDialogInnerMarkup(pickerTabs: JobPickerTabDef[], initialTabId: string): string {
  const tablistHtml = buildJobPickerTablistHtml(pickerTabs, initialTabId);
  const panelsHtml = buildJobPickerPanelsHtml(pickerTabs, initialTabId);
  return `${pickerTabs.length > 1 ? `<aside class="job-picker-tabrail">${tablistHtml}</aside>` : ""}
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
      </div>`;
}

function wireJobPickerInteractions(root: HTMLElement, opts: { skipDialogShell?: boolean } = {}): void {
  const dialog = root.querySelector("#job-picker-dialog") as HTMLDialogElement;
  const trigger = root.querySelector("#job-picker-trigger") as HTMLButtonElement;

  for (const btn of root.querySelectorAll(".job-picker-card")) {
    const key = (btn as HTMLButtonElement).dataset.jobKey;
    if (!key) continue;
    const sp = btn.querySelector(".job-picker-sprite") as HTMLElement;
    setJobPickerStandArt(sp, key);
  }
  updateJobPickerStandStacking(root);

  if (!opts.skipDialogShell) {
    trigger.addEventListener("click", () => {
      applyJobPickerTab(root, jobPickerTabIdForJob(listJobPickerTabs(), currentJob));
      dialog.showModal();
      trigger.setAttribute("aria-expanded", "true");
      requestAnimationFrame(() => {
        const cur = root.querySelector(".job-picker-card--current") as HTMLElement | null;
        (cur ?? root.querySelector(".job-picker-close"))?.focus();
      });
    });

    dialog.addEventListener("close", () => {
      trigger.setAttribute("aria-expanded", "false");
      trigger.focus();
    });

    dialog.addEventListener("click", (e) => {
      if (e.target === dialog) closeJobPickerDialog(root);
    });
  }

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

  root.querySelector(".job-picker-close")?.addEventListener("click", () => closeJobPickerDialog(root));

  root.querySelector("#job-picker-body")?.addEventListener("click", (e) => {
    const pathBtn = (e.target as HTMLElement).closest("button[data-third-path]") as
      | HTMLButtonElement
      | null;
    if (pathBtn?.closest("#job-picker-panel-third") && !pathBtn.closest(".job-picker-card")) {
      const p = pathBtn.dataset.thirdPath;
      if (p === "trans" || p === "base") {
        localStorage.setItem(THIRD_CLASS_PATH_STORAGE_KEY, p);
        applyThirdClassPathPanel(root, p);
      }
      return;
    }
    const t = (e.target as HTMLElement).closest(".job-picker-card") as HTMLButtonElement | null;
    if (!t?.dataset.jobKey) return;
    pickJobFromDialog(root, t.dataset.jobKey);
  });
}

function applyGameModeFromUi(root: HTMLElement, mode: GameMode): void {
  localStorage.setItem(GAME_MODE_STORAGE_KEY, mode);
  setPlannerGameMode(mode);
  loadState();
  ensureCurrentJobInData();
  applyJob(currentJob);
  saveState();
  syncGameModeToggleUi(root);
  const dialog = root.querySelector("#job-picker-dialog") as HTMLDialogElement | null;
  const pickerTabs = listJobPickerTabs();
  const initialTabId = jobPickerTabIdForJob(pickerTabs, currentJob);
  if (dialog) {
    dialog.innerHTML = buildJobPickerDialogInnerMarkup(pickerTabs, initialTabId);
  }
  wireJobPickerInteractions(root, { skipDialogShell: true });
  renderColumns(root);
  refreshAll(root);
  syncJobPickerUi(root);
}

function renderApp(root: HTMLElement): void {
  plannerAppRoot = root;
  ensureTooltipUnlockClickListener();

  const pickerTabs = listJobPickerTabs();
  const initialTabId = jobPickerTabIdForJob(pickerTabs, currentJob);
  const jobPickerDialogInner = buildJobPickerDialogInnerMarkup(pickerTabs, initialTabId);

  const initialGameMode = getPlannerGameMode();
  const initialDataActive = initialGameMode === "renewal" ? "renewal" : "pre";

  root.innerHTML = `
    <header class="planner-header">
      <div class="planner-header__left">
        <h1 class="planner-header__title" id="planner-page-title">RO Pre-Renewal Skill Planner</h1>
        <div class="planner-header__center">
          <div class="game-mode-toggle game-mode-toggle--header" data-active="${initialDataActive}" role="group" aria-label="Game client version">
            <span class="game-mode-toggle__slider" aria-hidden="true"></span>
            <button type="button" class="game-mode-toggle__btn" data-set-game-mode="pre">
              <span class="game-mode-toggle__text">Pre-Renewal</span>
            </button>
            <button type="button" class="game-mode-toggle__btn" data-set-game-mode="renewal">
              <span class="game-mode-toggle__text">Renewal</span>
            </button>
          </div>
        </div>
        <nav class="site-nav" aria-label="Site">
          <a class="site-nav__link site-nav__link--active" href="/skills" aria-current="page">Skill Planner</a>
          <a class="site-nav__link" href="/cards">Card Library</a>
          <a class="site-nav__link" href="/pets">Pets</a>
          <a class="site-nav__link" href="/monsters">Monsters</a>
          <a class="site-nav__link" href="/armour">Armour</a>
          <a class="site-nav__link" href="/weapons">Weapons</a>
        </nav>
      </div>
    </header>
    <div class="toolbar">
      <div class="job-picker-field">
        <span class="job-picker-field-label" id="job-picker-field-label">Class</span>
        <button type="button" class="job-picker-trigger" id="job-picker-trigger"
          aria-haspopup="dialog" aria-expanded="false" aria-controls="job-picker-dialog"
          aria-describedby="job-picker-field-label">
          <span class="job-picker-current-name" id="job-picker-current-label"></span>
        </button>
      </div>
      <div class="toolbar-class-stats" role="group" aria-label="Skill points by class">
        <div id="toolbar-tier-stats" class="toolbar-tier-stats"></div>
        <span class="stat" id="stat-quest">Quest / special: <strong id="used-quest">0</strong></span>
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
      ${jobPickerDialogInner}
    </dialog>
  `;

  wireJobPickerInteractions(root, {});

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

  root.querySelector(".game-mode-toggle--header")?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest("[data-set-game-mode]") as HTMLButtonElement | null;
    const m = btn?.dataset.setGameMode as GameMode | undefined;
    if (!m || m === getPlannerGameMode()) return;
    applyGameModeFromUi(root, m);
  });

  renderColumns(root);
  refreshAll(root);
  syncJobPickerUi(root);
  syncGameModeToggleUi(root);
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
  used: number,
  cap: number,
  ariaTierName: string,
): void {
  if (!usedEl || !capEl) return;
  usedEl.textContent = String(used);
  capEl.textContent = String(cap);
  const over = used > cap;
  wrap?.classList.toggle("stat--over-cap", over);
  if (wrap instanceof HTMLElement) {
    wrap.setAttribute("aria-invalid", over ? "true" : "false");
    const base = `${ariaTierName}: ${used} of ${cap} class skill points`;
    wrap.setAttribute(
      "aria-label",
      over ? `${base}, over budget by ${used - cap}` : `${base}, ${cap - used} remaining`,
    );
    if (over) wrap.setAttribute("title", "Over class skill point budget");
    else wrap.removeAttribute("title");
  }
}

function updateToolbarClassStats(root: HTMLElement): void {
  const job = getJobData(currentJob);
  const perTier = pointsUsedPerClassTier(levels);
  const unifiedTrans = job !== undefined && shouldMergeTranscendentIntoSecondPanel(job);
  const contentCols = job ? getContentColumnIndices(job) : [];

  const tierHost = root.querySelector("#toolbar-tier-stats") as HTMLElement | null;
  if (tierHost) {
    tierHost.innerHTML = "";
    for (let t = 0; t < perTier.length; t++) {
      const wrap = document.createElement("span");
      wrap.className = "stat";
      wrap.id = `stat-tier-${t}`;
      const badge = document.createElement("span");
      badge.className = "stat-over-badge";
      badge.id = `badge-tier-${t}`;
      badge.setAttribute("aria-hidden", "true");
      badge.textContent = "!";
      const label = document.createElement("span");
      label.id = `label-tier-${t}`;
      const used = document.createElement("strong");
      used.id = `used-tier-${t}`;
      const cap = document.createElement("strong");
      cap.id = `cap-tier-${t}`;
      wrap.appendChild(badge);
      wrap.appendChild(label);
      wrap.appendChild(document.createTextNode(": "));
      wrap.appendChild(used);
      wrap.appendChild(document.createTextNode(" / "));
      wrap.appendChild(cap);
      tierHost.appendChild(wrap);

      const capN = capForClassTier(t);
      const uN = perTier[t] ?? 0;
      let colTitle = `Column ${t + 1}`;
      if (job && unifiedTrans && t === 1) {
        colTitle = job.label;
      } else if (job) {
        const c = contentCols[t];
        if (c !== undefined) colTitle = job.columns[c]?.title ?? colTitle;
      }
      label.textContent = colTitle;
      const aria =
        unifiedTrans && t === 1
          ? `${job!.label} (combined second + transcendent pool)`
          : colTitle;
      setToolbarTierStat(wrap, used, cap, uN, capN, aria);
    }
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
    pq.setAttribute("aria-label", `${q} points in quest and special skills`);
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

function initPlannerGameModeFromUrlOrStorage(): void {
  try {
    const u = new URL(window.location.href);
    const m = u.searchParams.get("mode");
    if (m === "renewal" || m === "pre") {
      setPlannerGameMode(m);
      return;
    }
  } catch {
    /* ignore */
  }
  const s = localStorage.getItem(GAME_MODE_STORAGE_KEY);
  if (s === "renewal" || s === "pre") setPlannerGameMode(s);
}

initPlannerGameModeFromUrlOrStorage();
const fromShare = readShareFromUrl();
if (fromShare?.game) setPlannerGameMode(fromShare.game);
loadState();
ensureCurrentJobInData();
if (fromShare && getJobData(fromShare.j)) {
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
