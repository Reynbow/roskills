import "./style.css";
import { inject } from "@vercel/analytics";
import {
  listJobPickerTabs,
  listClassLineShortcuts,
  listJobs,
  classLineModalJobRows,
  getJobData,
  buildSkillsForJob,
  getEdgesForJob,
  makeSkillMap,
  GRID_COLS,
  isQuestColumnTitle,
  shouldMergeTranscendentIntoSecondPanel,
  shouldMergeRenewalTransPathSkillPanel,
  setPlannerGameMode,
  getPlannerGameMode,
  persistPlannerGameMode,
  isThirdClassKey,
  jobPickerDisplayLabel,
  type GameMode,
  type JobData,
  type JobPickerSection,
  type JobPickerTabDef,
  type SkillDef,
  type PrereqEdge,
} from "./planner-data";
import { jobPartyFrameIconImgClass, jobPartyFrameIconUrl } from "./job-party-icon";
import { jobPickerStandSpriteUrl } from "./job-previews";
import { jobSitLocalPngUrl, jobSitPortraitFallbackUrl, jobStandDockLocalPngUrl } from "./job-sit-sprite";
import { initPlannerGameModeFromUrlOrStorage } from "./game-mode";
import { plannerHeaderInnerHtml, syncGameModeToggleChrome } from "./site-header";

// Initialize Vercel Web Analytics (never block app shell if script fails)
try {
  inject();
} catch {
  /* ignore */
}

const STORAGE_KEY = "ro-planner-state-v2";
const THIRD_CLASS_PATH_STORAGE_KEY = "ro-planner-third-class-path";
/** Remember class-line vs category tab view between modal opens (per game mode). */
const CLASS_PICKER_VIEW_STORAGE_KEY = "ro-planner-class-picker-view";
type ThirdClassPathKey = "trans" | "base";

type StoredClassPickerView =
  | { mode: "line"; lineAnchor: string }
  | { mode: "tabs"; tabId: string };

function classPickerViewStorageKey(): string {
  return `${CLASS_PICKER_VIEW_STORAGE_KEY}:${getPlannerGameMode()}`;
}

function persistClassPickerViewFromUi(root: HTMLElement): void {
  try {
    if (jobPickerInlineLineKey) {
      localStorage.setItem(
        classPickerViewStorageKey(),
        JSON.stringify({ mode: "line", lineAnchor: jobPickerInlineLineKey } satisfies StoredClassPickerView),
      );
      return;
    }
    const activeTab = root.querySelector(
      ".job-picker-tab[aria-selected=\"true\"]",
    ) as HTMLButtonElement | null;
    const tabId = activeTab?.dataset.jobPickerTab;
    if (tabId) {
      localStorage.setItem(
        classPickerViewStorageKey(),
        JSON.stringify({ mode: "tabs", tabId } satisfies StoredClassPickerView),
      );
      return;
    }
    localStorage.removeItem(classPickerViewStorageKey());
  } catch {
    /* ignore quota / private mode */
  }
}

function applyStoredClassPickerView(root: HTMLElement): void {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(classPickerViewStorageKey());
  } catch {
    return;
  }
  if (!raw) return;
  let parsed: StoredClassPickerView;
  try {
    parsed = JSON.parse(raw) as StoredClassPickerView;
  } catch {
    return;
  }
  if (parsed.mode === "line" && parsed.lineAnchor) {
    if (classLineModalJobRows(parsed.lineAnchor).length === 0) return;
    showJobPickerInlineLineView(root, parsed.lineAnchor);
    return;
  }
  if (parsed.mode === "tabs" && parsed.tabId) {
    const tabs = listJobPickerTabs();
    if (!tabs.some((t) => t.id === parsed.tabId)) return;
    applyJobPickerTab(root, parsed.tabId);
  }
}

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
  scheduleFitJobPickerStageStarterLabels(root);
}

function alignThirdClassPathToCurrentJobIfApplicable(root: HTMLElement, jobKey: string): void {
  if (isThirdClassKey(jobKey)) {
    applyThirdClassPathPanel(root, jobKey.endsWith("_H") ? "trans" : "base");
  }
}
const DEFAULT_JOB = "JT_PRIEST";
const DEFAULT_JOB_RENEWAL = "JT_RUNE_KNIGHT_H";

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
 * Renewal: tiers include 3rd job (max job level 70 → 69 points) and 4th job (54 skill points).
 * Extra content columns beyond these reuse the last cap (fourth tier).
 */
const CLASS_SKILL_CAPS_RENEWAL: readonly number[] = [49, 49, 69, 54, 54, 54, 54, 54, 54];

function classSkillCaps(): readonly number[] {
  return getPlannerGameMode() === "renewal" ? CLASS_SKILL_CAPS_RENEWAL : CLASS_SKILL_CAPS;
}

/** Single merged-column jobs that use a non-default tier-0 class point cap (rest use CLASS_SKILL_CAPS[0]). */
const TIER0_CLASS_CAP_OVERRIDE: Partial<Record<string, number>> = {
  /** Super Novice: total class pool is 98 (server rule). */
  JT_SUPERNOVICE: 98,
  /** Expanded base job pools. */
  JT_TAEKWON: 49,
  JT_NINJA: 69,
  // Renewal expanded ninja line: base Ninja column is still a 69-point expanded pool.
  JT_KAGEROU: 69,
  JT_OBORO: 69,
  JT_SHINKIRO: 69,
  JT_SHIRANUI: 69,
  JT_GUNSLINGER: 69,
  JT_REBELLION: 69,
  JT_NIGHT_WATCH: 69,
  JT_SUPERNOVICE2: 69,
};

/** Transcendent jobs: second + transcendent columns share one pool (high 2nd max job level 70 → 69 points). */
const TRANSCENDENT_COMBINED_SECOND_CAP = 69;

/**
 * Per-job per-tier class skill point caps.
 * Tier index corresponds to content columns (excluding Quest/Special).
 */
const CLASS_TIER_CAP_OVERRIDE: Partial<Record<string, Partial<Record<number, number>>>> = {
  // Taekwon line
  JT_STAR_EMPEROR: { 0: 49, 2: 59 },
  JT_SKY_EMPEROR: { 0: 49, 2: 59, 3: 49 },
  JT_SOUL_ASCETIC: { 0: 49, 3: 49 },

  // Ninja line
  JT_KAGEROU: { 1: 59 },
  JT_SHINKIRO: { 1: 59 },
  JT_OBORO: { 1: 49 },
  JT_SHIRANUI: { 1: 49, 2: 49 },

  // Gunslinger line
  JT_REBELLION: { 1: 59 },
  JT_NIGHT_WATCH: { 1: 59, 2: 49 },

  // Super Novice line
  JT_SUPERNOVICE: { 0: 98 },
  JT_SUPERNOVICE2: { 0: 69 },
  JT_HYPER_NOVICE: { 0: 98, 1: 69, 2: 49 },
};

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

/** When set, main class picker body shows this first-job line progression instead of category tabs. */
let jobPickerInlineLineKey: string | null = null;

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
  let k = jobKey;
  if (
    getPlannerGameMode() === "renewal" &&
    isThirdClassKey(k) &&
    !k.endsWith("_H") &&
    getJobData(`${k}_H`)
  ) {
    k = `${k}_H`;
  }
  const j = getJobData(k);
  if (!j) return;
  currentJob = k;
  skills = buildSkillsForJob(k);
  edges = getEdgesForJob(k);
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
      const jobs = currentPlannerSlot(data).jobs;
      const slot = jobs[k] ?? (k !== jobKey ? jobs[jobKey] : undefined);
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
  const override = job ? CLASS_TIER_CAP_OVERRIDE[job.key]?.[tierIndex] : undefined;
  if (typeof override === "number") return override;
  if (job && shouldMergeTranscendentIntoSecondPanel(job)) {
    if (tierIndex === 0) {
      return TIER0_CLASS_CAP_OVERRIDE[job.key] ?? caps[0]!;
    }
    return TRANSCENDENT_COMBINED_SECOND_CAP;
  }
  if (job && shouldMergeRenewalTransPathSkillPanel(job)) {
    // Layout: base | (second + trans merged) | third [| fourth]. Merged 2nd + trans-2nd = one 69 SP pool.
    if (tierIndex === 0) return caps[0]!;
    if (tierIndex === 1) return TRANSCENDENT_COMBINED_SECOND_CAP;
    if (tierIndex === 2) return caps[2]!;
    return caps[Math.min(3, caps.length - 1)]!;
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
  if (shouldMergeRenewalTransPathSkillPanel(job)) {
    const c0 = content[0]!;
    const c1 = content[1]!;
    const c2 = content[2]!;
    const tail = content.slice(3);
    const u0 = skills
      .filter((s) => s.column === c0 && !exemptFromClassSkillCap(s.id))
      .reduce((a, s) => a + (lv[s.id] ?? 0), 0);
    const u12 = skills
      .filter((s) => (s.column === c1 || s.column === c2) && !exemptFromClassSkillCap(s.id))
      .reduce((a, s) => a + (lv[s.id] ?? 0), 0);
    return [u0, u12, ...tail.map((col) =>
      skills
        .filter((s) => s.column === col && !exemptFromClassSkillCap(s.id))
        .reduce((a, s) => a + (lv[s.id] ?? 0), 0),
    )];
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

/** Progression "starter" row labels sit in a narrow column; keep one line (e.g. Super Novice) via font scaling. */
function scheduleFitJobPickerStageStarterLabels(root: HTMLElement): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const rf = rootFontPx();
      const minPx = 0.52 * rf;
      const sel =
        ".job-picker-stage-line > .job-picker-stage:first-child .job-picker-card-label, .job-picker-expanded-matrix .job-picker-matrix-row:first-child .job-picker-card-label";
      root.querySelectorAll(sel).forEach((n) => {
        if (n instanceof HTMLElement) fitSingleLineNoWrap(n, minPx);
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

function clearJobPickerCategoryTabSelection(root: HTMLElement): void {
  root.querySelectorAll(".job-picker-tab").forEach((btn) => {
    const el = btn as HTMLButtonElement;
    el.setAttribute("aria-selected", "false");
    el.tabIndex = -1;
    el.classList.remove("job-picker-tab--active");
  });
}

function clearJobPickerLineShortcutSelection(root: HTMLElement): void {
  root.querySelectorAll(".job-picker-modal-line-shortcut").forEach((b) => {
    const el = b as HTMLButtonElement;
    el.classList.remove("job-picker-modal-line-shortcut--active");
    el.setAttribute("aria-pressed", "false");
  });
}

function buildJobPickerInlineLineBodyHtml(rows: string[][]): string {
  const stages = rows
    .map((keys, ri) => {
      const picks = jobPickerPicksFromKeys(keys);
      if (picks.length === 0) return "";
      const cards = jobPickerRowHtml(picks, false);
      const arrow =
        ri === 0 ? "" : `<div class="job-picker-stage-arrow" aria-hidden="true">→</div>`;
      return `${arrow}<div class="job-picker-stage" role="group" aria-label="Stage ${ri + 1}">
        <div class="job-picker-grid job-picker-grid--stage">${cards}</div>
      </div>`;
    })
    .join("");
  return `<div class="job-picker-stage-line" role="group" aria-label="Class progression">${stages}</div>`;
}

function exitJobPickerInlineLineView(root: HTMLElement): void {
  if (!jobPickerInlineLineKey) return;
  jobPickerInlineLineKey = null;
  const main = root.querySelector("#job-picker-body-main") as HTMLElement | null;
  const line = root.querySelector("#job-picker-body-line") as HTMLElement | null;
  const title = root.querySelector("#job-picker-dialog-title");
  main?.removeAttribute("hidden");
  line?.setAttribute("hidden", "");
  if (line) {
    line.removeAttribute("data-line-anchor");
    line.innerHTML = "";
  }
  if (title) title.textContent = "Choose class";
  clearJobPickerLineShortcutSelection(root);
}

function showJobPickerInlineLineView(root: HTMLElement, anchorKey: string): void {
  const rows = classLineModalJobRows(anchorKey);
  if (rows.length === 0) return;
  jobPickerInlineLineKey = anchorKey;
  const main = root.querySelector("#job-picker-body-main") as HTMLElement | null;
  const line = root.querySelector("#job-picker-body-line") as HTMLElement | null;
  const title = root.querySelector("#job-picker-dialog-title");
  if (!main || !line || !title) return;
  const def = listClassLineShortcuts().find((d) => d.anchorKey === anchorKey);
  title.textContent = `${def?.label ?? anchorKey} line`;
  /* Hide category-tab panels before swapping line HTML so tab content never stacks with the line view. */
  main.setAttribute("hidden", "");
  line.innerHTML = `<div class="job-picker-body-line-inner">${buildJobPickerInlineLineBodyHtml(rows)}</div>`;
  line.setAttribute("data-line-anchor", anchorKey);
  for (const btn of line.querySelectorAll(".job-picker-card")) {
    const key = (btn as HTMLButtonElement).dataset.jobKey;
    if (!key) continue;
    const sp = btn.querySelector(".job-picker-sprite") as HTMLElement | null;
    if (sp) setJobPickerStandArt(sp, key);
  }
  setJobPickerSplitStandArt(root);
  updateJobPickerStandStacking(root);
  syncJobPickerUi(root);
  line.removeAttribute("hidden");
  clearJobPickerCategoryTabSelection(root);
  root.querySelectorAll(".job-picker-modal-line-shortcut").forEach((b) => {
    const btn = b as HTMLButtonElement;
    const on = btn.dataset.classLineAnchor === anchorKey;
    btn.classList.toggle("job-picker-modal-line-shortcut--active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
  scheduleFitJobPickerStageStarterLabels(root);
  requestAnimationFrame(() => {
    const focusEl =
      (line.querySelector(".job-picker-card--current, .job-picker-split-hit--current") as
        | HTMLElement
        | null) ??
      (line.querySelector(".job-picker-card, .job-picker-split-hit") as HTMLElement | null) ??
      (root.querySelector(".job-picker-close") as HTMLElement | null);
    focusEl?.focus();
  });
}

function escapeHtml(s: string): string {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

/** Party-frame icon for the modal left rail only (same `/job-icons/` as armour / weapons). */
function jobPickerModalLineShortcutIconHtml(jobKey: string): string {
  const url = jobPartyFrameIconUrl(jobKey);
  const cls = jobPartyFrameIconImgClass(jobKey);
  const wrapCls = "job-picker-party-iconwrap job-picker-party-iconwrap--shortcut";
  if (!url) {
    return `<span class="${wrapCls}" aria-hidden="true"><span class="job-picker-party-icon job-picker-party-icon--shortcut job-picker-party-icon--missing" aria-hidden="true"></span></span>`;
  }
  return `<span class="${wrapCls}" aria-hidden="true"><img class="${cls} job-picker-party-icon--shortcut" src="${escapeHtml(
    url,
  )}" alt="" width="28" height="28" decoding="async" loading="lazy" referrerpolicy="no-referrer" /></span>`;
}

function buildClassLineOpenButtonsMarkup(): string {
  return listClassLineShortcuts()
    .map(
      (s) =>
        `<button type="button" class="job-picker-modal-line-shortcut" data-class-line-anchor="${escapeHtml(s.anchorKey)}" aria-pressed="false">${jobPickerModalLineShortcutIconHtml(s.anchorKey)}<span class="job-picker-modal-line-shortcut-label">${escapeHtml(s.label)}</span></button>`,
    )
    .join("");
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
  if (shouldMergeRenewalTransPathSkillPanel(job)) return false;
  const idx = getContentColumnIndices(job);
  if (idx.length < 2) return false;
  return job.columns[idx[0]]?.title === "Novice";
}

/** Transcendent jobs: second + transcendent trees use the same client grid slots; one combined panel. */
function mergeTranscendentIntoSecond(job: JobData): boolean {
  return shouldMergeTranscendentIntoSecondPanel(job);
}

/** Renewal trans-path 3rd (`…_H`) / 4th: panels are base | second+trans merged | third [| fourth]. */
function isRenewalTransPathThirdFourthLayout(job: JobData): boolean {
  return shouldMergeRenewalTransPathSkillPanel(job);
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

  const sitStackPreserve = root.querySelector("#job-sit-stack");
  sitStackPreserve?.remove();

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
  } else if (isRenewalTransPathThirdFourthLayout(job)) {
    const c0 = contentIdx[0]!;
    const c1 = contentIdx[1]!;
    const c2 = contentIdx[2]!;
    const n1 = job.columns[c1]?.title ?? "";
    const n2 = job.columns[c2]?.title ?? "";
    const mergedName = `${n1} + ${n2}`.trim() || job.label;

    const secBase = document.createElement("section");
    secBase.className = "skill-panel";
    secBase.dataset.column = String(c0);
    secBase.innerHTML = `<h2 class="panel-title"><span class="panel-title__name">${escapeHtml(job.columns[c0]?.title ?? "")}</span><span class="panel-title__stats" data-content-tier="0" aria-label="Skill points used for this class column"></span></h2>`;
    const secBaseSkills = skillsByColumn(c0);
    secBase.appendChild(renderSkillGrid(secBaseSkills));
    secBase.appendChild(renderSkillList(secBaseSkills));
    main.appendChild(secBase);

    const secMid = document.createElement("section");
    secMid.className = "skill-panel skill-panel--second-with-trans";
    secMid.dataset.column = `${c1},${c2}`;
    const midEsc = escapeHtml(mergedName);
    secMid.innerHTML = `<h2 class="panel-title"><span class="panel-title__name">${midEsc}</span><span class="panel-title__stats panel-title__stats--transcendent" data-content-tier="1" aria-label="${midEsc} skill points (second + transcendent)"></span></h2>`;
    const merged12 = [...skillsByColumn(c1), ...skillsByColumn(c2)].sort((a, b) => {
      if (a.gridRow !== b.gridRow) return a.gridRow - b.gridRow;
      if (a.gridCol !== b.gridCol) return a.gridCol - b.gridCol;
      return a.row - b.row;
    });
    secMid.appendChild(renderSkillGrid(merged12));
    secMid.appendChild(renderSkillList(merged12));
    main.appendChild(secMid);

    for (let i = 3; i < contentIdx.length; i++) {
      const c = contentIdx[i]!;
      const contentTier = i - 1;
      const sec = document.createElement("section");
      sec.className = "skill-panel";
      sec.dataset.column = String(c);
      sec.innerHTML = `<h2 class="panel-title"><span class="panel-title__name">${escapeHtml(job.columns[c]?.title ?? "")}</span><span class="panel-title__stats" data-content-tier="${contentTier}" aria-label="Skill points used for this class column"></span></h2>`;
      const secSkills = skillsByColumn(c);
      sec.appendChild(renderSkillGrid(secSkills));
      sec.appendChild(renderSkillList(secSkills));
      main.appendChild(sec);
    }
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
    const asideCol = document.createElement("div");
    asideCol.className = "tree-aside-col";

    if (sitStackPreserve) {
      sitStackPreserve.classList.remove("job-sit-stack--overlay");
      const spriteSec = document.createElement("section");
      spriteSec.className = "skill-panel skill-panel--sprite";
      spriteSec.setAttribute("aria-label", "Class sitting sprite");
      spriteSec.appendChild(sitStackPreserve);
      asideCol.appendChild(spriteSec);
    }

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
    asideCol.appendChild(aside);
    body.appendChild(asideCol);
  } else {
    const treeWrap = root.querySelector("#tree-wrap");
    if (sitStackPreserve && treeWrap) {
      treeWrap.appendChild(sitStackPreserve);
      sitStackPreserve.classList.add("job-sit-stack--overlay");
    }
  }

  board.appendChild(body);
  attachSkillInteractionHandlers(root);
  scheduleFitSkillText(root);
}

const GENDER_STORAGE_KEY = "ro-sit-gender";
const SIT_OUTFIT_ALT_STORAGE_KEY = "ro-sit-third-class-outfit-alt";
const DOCK_POSE_STORAGE_KEY = "ro-sit-dock-pose";
type SitGender = "male" | "female";
type DockPose = "sit" | "stand";
let sitGender: SitGender = (localStorage.getItem(GENDER_STORAGE_KEY) as SitGender) || "male";
if (sitGender !== "male" && sitGender !== "female") sitGender = "male";
/** Alternate body sprite (zrenderer outfit 1) for renewal 3rd classes when `*--gender--alt.png` exists. */
let sitThirdClassOutfitAlt = localStorage.getItem(SIT_OUTFIT_ALT_STORAGE_KEY) === "1";
let dockPose: DockPose = localStorage.getItem(DOCK_POSE_STORAGE_KEY) === "stand" ? "stand" : "sit";

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
  "JT_KAGEROU",
  "JT_MINSTREL",
  "JT_MINSTREL_H",
  "JT_SHINKIRO",
  "JT_TROUBADOUR",
]);
const JOB_PICKER_STAND_FEMALE_ONLY = new Set<string>([
  "JT_DANCER",
  "JT_DANCER_H",
  "JT_OBORO",
  "JT_SHIRANUI",
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
            <span class="job-picker-stand-pair__cell" data-stand-gender="male">
              <span class="job-picker-sprite-fallback" aria-hidden="true">♂</span>
            </span>
            <span class="job-picker-stand-pair__cell" data-stand-gender="female">
              <span class="job-picker-sprite-fallback" aria-hidden="true">♀</span>
            </span>
          </span>`;
}

function jobPickerSoloStandPairInnerHtml(g: "male" | "female"): string {
  const sym = g === "male" ? "♂" : "♀";
  return `<span class="job-picker-stand-pair job-picker-stand-pair--solo" data-stand-top="${g}">
            <span class="job-picker-stand-pair__cell" data-stand-gender="${g}">
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

function setJobPickerSplitStandArt(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>("[data-split-job-key][data-stand-gender]").forEach((cell) => {
    const key = cell.dataset.splitJobKey;
    const gender = cell.dataset.standGender;
    if (!key || (gender !== "male" && gender !== "female")) return;
    loadJobPickerStandHalf(cell, jobPickerStandSpriteUrl(key, gender));
  });
}

/** Which gender layer is in front — matches sit-dock gender toggle (`data-stand-top` on `.job-picker-stand-pair`). */
function updateJobPickerStandStacking(root: HTMLElement): void {
  const top = sitGender;
  root.querySelectorAll(".job-picker-stand-pair").forEach((el) => {
    (el as HTMLElement).setAttribute("data-stand-top", top);
  });
}

function syncJobPickerUi(root: HTMLElement): void {
  const jd = getJobData(currentJob);
  const label = jd ? jobPickerDisplayLabel(currentJob, jd.label) : currentJob;
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
  root.querySelectorAll(".job-picker-split-hit").forEach((btn) => {
    const key = (btn as HTMLButtonElement).dataset.jobKey;
    const on = key === currentJob;
    btn.classList.toggle("job-picker-split-hit--current", on);
    if (on) btn.setAttribute("aria-current", "true");
    else btn.removeAttribute("aria-current");
  });
  root.querySelectorAll(".job-picker-card-split").forEach((card) => {
    const left = card.querySelector(".job-picker-split-hit--left") as HTMLButtonElement | null;
    const right = card.querySelector(".job-picker-split-hit--right") as HTMLButtonElement | null;
    card.classList.toggle("job-picker-card-split--current-left", left?.dataset.jobKey === currentJob);
    card.classList.toggle("job-picker-card-split--current-right", right?.dataset.jobKey === currentJob);
  });
  setJobPickerSplitStandArt(root);
  updateJobPickerStandStacking(root);

  const sitStack = root.querySelector("#job-sit-stack") as HTMLElement | null;
  const sitDock = root.querySelector("#job-sit-dock") as HTMLElement | null;
  const sitImg = root.querySelector("#job-sit-sprite-img") as HTMLImageElement | null;
  const outfitGroup = root.querySelector("#job-sit-outfit-toggle") as HTMLElement | null;
  const poseBtn = root.querySelector("#btn-job-dock-pose") as HTMLButtonElement | null;
  const dockControlsRow = root.querySelector(".job-sit-dock-controls-row") as HTMLElement | null;
  if (sitStack && sitDock && sitImg) {
    sitStack.classList.toggle("job-sit-stack--overlay", !sitStack.closest(".tree-aside-col"));

    const showOutfitToggle = isThirdClassKey(currentJob);
    dockControlsRow?.classList.toggle("job-sit-dock-controls-row--pose-only", !showOutfitToggle);
    if (outfitGroup) {
      outfitGroup.hidden = !showOutfitToggle;
      outfitGroup.dataset.active = sitThirdClassOutfitAlt ? "alt" : "default";
      outfitGroup.querySelectorAll(".game-mode-toggle__btn").forEach((btn) => {
        const b = btn as HTMLButtonElement;
        const isAltBtn = b.dataset.sitOutfit === "1";
        const on = sitThirdClassOutfitAlt === isAltBtn;
        b.classList.toggle("game-mode-toggle__btn--active", on);
        b.setAttribute("aria-pressed", on ? "true" : "false");
      });
    }

    if (poseBtn) {
      const standing = dockPose === "stand";
      poseBtn.classList.toggle("job-dock-pose-btn--stand", standing);
      poseBtn.setAttribute("aria-pressed", standing ? "true" : "false");
      poseBtn.setAttribute(
        "aria-label",
        standing ? "Pose: standing. Click to show sitting sprite." : "Pose: sitting. Click to show standing sprite.",
      );
    }

    const sitKey = `${currentJob}::${sitGender}::${sitThirdClassOutfitAlt ? "alt" : "def"}::${dockPose}`;
    sitImg.classList.toggle("job-sit-dock__img--stand-pose", dockPose === "stand");
    if (sitImg.dataset.sitForJob === sitKey) return;
    sitImg.dataset.sitForJob = sitKey;

    const localSitDefault = jobSitLocalPngUrl(currentJob, sitGender, { outfitAlt: false });
    const localSitAlt = jobSitLocalPngUrl(currentJob, sitGender, { outfitAlt: true });
    const legacyLocalSit = `${import.meta.env.BASE_URL}job-sit/${currentJob}.png`;
    const localStandDefault = jobStandDockLocalPngUrl(currentJob, sitGender, { outfitAlt: false });
    const localStandAlt = jobStandDockLocalPngUrl(currentJob, sitGender, { outfitAlt: true });
    const legacyLocalStand = `${import.meta.env.BASE_URL}job-stand-dock/${currentJob}.png`;
    const pickerStandUrl = jobPickerStandSpriteUrl(currentJob, sitGender);
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

    const urls: string[] = [];
    if (dockPose === "sit") {
      if (showOutfitToggle && sitThirdClassOutfitAlt) {
        urls.push(localSitAlt);
      }
      urls.push(localSitDefault);
      if (legacyLocalSit !== localSitDefault) {
        urls.push(legacyLocalSit);
      }
    } else {
      if (showOutfitToggle && sitThirdClassOutfitAlt) {
        urls.push(localStandAlt);
      }
      urls.push(localStandDefault);
      if (legacyLocalStand !== localStandDefault) {
        urls.push(legacyLocalStand);
      }
      if (pickerStandUrl !== localStandDefault && pickerStandUrl !== localStandAlt) {
        urls.push(pickerStandUrl);
      }
    }

    sitDock.classList.remove("job-sit-dock--hidden");
    sitImg.classList.add("job-sit-dock__img--loading");
    sitImg.classList.remove("job-sit-dock__img--fail");
    sitImg.referrerPolicy = "no-referrer";
    sitImg.decoding = "async";

    const finishOk = (): void => {
      sitImg.onload = null;
      sitImg.onerror = null;
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

    let urlIdx = 0;
    const tryNextUrl = (): void => {
      if (urlIdx >= urls.length) {
        tryPortrait();
        return;
      }
      const nextUrl = urls[urlIdx]!;
      urlIdx++;
      sitImg.onload = (): void => {
        finishOk();
      };
      sitImg.onerror = (): void => {
        tryNextUrl();
      };
      sitImg.src = nextUrl;
    };
    tryNextUrl();
  }
}

type JobPickerPick = { key: string; label: string };

function classProgressionTabLabel(jobKey: string): string | null {
  if (jobKey === "JT_ADVANCED_SUMMONER") return "Summoner";
  if (jobKey === "JT_SPIRIT_HANDLER") return "Advanced Summoner";

  const job = getJobData(jobKey);
  if (!job) return null;

  const contentColumns = job.columns.filter((c) => !isQuestColumnTitle(c.title));
  if (contentColumns.length <= 1) return null;

  const prev = contentColumns[contentColumns.length - 2]?.title.trim();
  if (!prev || /^novice$/i.test(prev)) return null;

  return prev.replace(/\s*\(\s*Trans\.?\s*\)\s*$/i, "").trimEnd();
}

function jobPickerClassTabHtml(label: string | null): string {
  if (!label) return "";
  return `<span class="job-picker-class-tab" aria-label="Previous class: ${escapeHtml(label)}">${escapeHtml(label)}</span>`;
}

function jobPickerCardHtml(
  key: string,
  label: string,
  joined?: "start" | "end",
  showClassProgressionTab = true,
): string {
  const escKey = escapeHtml(key);
  const lab = escapeHtml(jobPickerDisplayLabel(key, label));
  const joinCls =
    joined === "start"
      ? " job-picker-card--joined job-picker-card--joined-start"
      : joined === "end"
        ? " job-picker-card--joined job-picker-card--joined-end"
        : "";
  const tab =
    showClassProgressionTab ? jobPickerClassTabHtml(classProgressionTabLabel(key)) : "";
  return `<button type="button" class="job-picker-card${joinCls}" data-job-key="${escKey}" aria-label="${lab}">
        ${tab}
        ${jobPickerCardSpriteHtml(key)}
        <span class="job-picker-card-label">${lab}</span>
      </button>`;
}

function jobPickerJoinedPairHtml(
  left: JobPickerPick,
  right: JobPickerPick,
  aria: string,
  showClassProgressionTab = true,
): string {
  const a = escapeHtml(aria);
  const leftKey = escapeHtml(left.key);
  const rightKey = escapeHtml(right.key);
  const leftLabel = escapeHtml(jobPickerDisplayLabel(left.key, left.label));
  const rightLabel = escapeHtml(jobPickerDisplayLabel(right.key, right.label));
  const pairLabel = `${leftLabel} / ${rightLabel}`;
  const leftPrev = classProgressionTabLabel(left.key);
  const rightPrev = classProgressionTabLabel(right.key);
  const prevLabel =
    leftPrev && rightPrev ? (leftPrev === rightPrev ? leftPrev : `${leftPrev} / ${rightPrev}`) : leftPrev ?? rightPrev;
  const tab = showClassProgressionTab ? jobPickerClassTabHtml(prevLabel) : "";
  return `<div class="job-picker-card-split" role="group" aria-label="${a}">
        ${tab}
        <span class="job-picker-sprite job-picker-sprite--card job-picker-sprite--split" aria-hidden="true">
          <span class="job-picker-stand-pair job-picker-stand-pair--split">
            <span class="job-picker-stand-pair__cell job-picker-split-sprite-cell" data-split-job-key="${leftKey}" data-stand-gender="male">
              <span class="job-picker-sprite-fallback" aria-hidden="true">♂</span>
            </span>
            <span class="job-picker-stand-pair__cell job-picker-split-sprite-cell" data-split-job-key="${rightKey}" data-stand-gender="female">
              <span class="job-picker-sprite-fallback" aria-hidden="true">♀</span>
            </span>
          </span>
        </span>
        <span class="job-picker-card-label">${pairLabel}</span>
        <button type="button" class="job-picker-split-hit job-picker-split-hit--left" data-job-key="${leftKey}" aria-label="${leftLabel}"></button>
        <button type="button" class="job-picker-split-hit job-picker-split-hit--right" data-job-key="${rightKey}" aria-label="${rightLabel}"></button>
      </div>`;
}

/** One flex row: centered; gender-locked archer-line pairs render as one split visual with two buttons. */
function jobPickerRowHtml(row: JobPickerPick[], showClassProgressionTab = true): string {
  const parts: string[] = [];
  for (let i = 0; i < row.length; i++) {
    const j = row[i]!;
    const next = row[i + 1];
    if (next && j.key === "JT_BARD" && next.key === "JT_DANCER") {
      parts.push(
        jobPickerJoinedPairHtml(j, next, "Bard or Dancer (same second-class line)", showClassProgressionTab),
      );
      i++;
      continue;
    }
    if (next && j.key === "JT_BARD_H" && next.key === "JT_DANCER_H") {
      parts.push(
        jobPickerJoinedPairHtml(j, next, "Clown or Gypsy (same transcendent archer line)", showClassProgressionTab),
      );
      i++;
      continue;
    }
    if (next && j.key === "JT_KAGEROU" && next.key === "JT_OBORO") {
      parts.push(
        jobPickerJoinedPairHtml(j, next, "Kagerou or Oboro (same expanded ninja line)", showClassProgressionTab),
      );
      i++;
      continue;
    }
    if (next && j.key === "JT_SHINKIRO" && next.key === "JT_SHIRANUI") {
      parts.push(
        jobPickerJoinedPairHtml(j, next, "Shinkiro or Shiranui (same expanded ninja line)", showClassProgressionTab),
      );
      i++;
      continue;
    }
    if (next && j.key === "JT_MINSTREL_H" && next.key === "JT_WANDERER_H") {
      parts.push(
        jobPickerJoinedPairHtml(j, next, "Minstrel or Wanderer (same third-class archer line)", showClassProgressionTab),
      );
      i++;
      continue;
    }
    if (next && j.key === "JT_TROUBADOUR" && next.key === "JT_TROUVERE") {
      parts.push(
        jobPickerJoinedPairHtml(j, next, "Troubadour or Trouvere (same fourth-class archer line)", showClassProgressionTab),
      );
      i++;
      continue;
    }
    parts.push(jobPickerCardHtml(j.key, j.label, undefined, showClassProgressionTab));
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
    "Third class, transcendent second path (e.g. Lord Knight, Clown, Arch Bishop)",
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

function jobPickerPicksFromKeys(keys: readonly string[]): JobPickerPick[] {
  const picks: JobPickerPick[] = [];
  for (const key of keys) {
    const job = getJobData(key);
    if (job) picks.push({ key: job.key, label: job.label });
  }
  return picks;
}

function jobPickerMatrixRowHtml(
  row: NonNullable<JobPickerSection["expandedMatrixRows"]>[number],
  ri: number,
  labelEsc: string,
): string {
  const cells = row
    .map((cell, ci) => {
      const span = "colSpan" in cell && cell.colSpan != null ? cell.colSpan : 1;
      const spanAttr = span > 1 ? ` style="grid-column: span ${span}"` : "";
      if (!("jobs" in cell)) {
        return `<div class="job-picker-matrix-cell job-picker-matrix-cell--empty"${spanAttr} aria-hidden="true"></div>`;
      }
      const picks = jobPickerPicksFromKeys(cell.jobs);
      if (picks.length === 0) {
        return `<div class="job-picker-matrix-cell job-picker-matrix-cell--empty"${spanAttr} aria-hidden="true"></div>`;
      }
      const cards = jobPickerRowHtml(picks);
      return `<div class="job-picker-matrix-cell"${spanAttr} role="group" aria-label="${labelEsc}, row ${ri + 1}, slot ${ci + 1}"><div class="job-picker-matrix-cell-inner job-picker-grid job-picker-grid--stage">${cards}</div></div>`;
    })
    .join("");
  return `<div class="job-picker-matrix-row" role="group" aria-label="${labelEsc}, tier ${ri + 1}">${cells}</div>`;
}

/** Down-arrows between tiers; grid matches the row above so arrows sit under each class column (incl. colspan). */
function jobPickerMatrixArrowRowAfter(precedingRow: NonNullable<JobPickerSection["expandedMatrixRows"]>[number]): string {
  const cells = precedingRow
    .map((cell) => {
      const span = "colSpan" in cell && cell.colSpan != null ? cell.colSpan : 1;
      const spanAttr = span > 1 ? ` style="grid-column: span ${span}"` : "";
      return `<div class="job-picker-matrix-cell job-picker-matrix-arrow-cell"${spanAttr} aria-hidden="true"><span class="job-picker-matrix-tier-arrow">↓</span></div>`;
    })
    .join("");
  return `<div class="job-picker-matrix-row job-picker-matrix-row--arrows">${cells}</div>`;
}

/** Star Emperor / Soul Reaper tier only (other columns skip this row). */
function isExpandedMatrixGapTierRow(
  row: NonNullable<JobPickerSection["expandedMatrixRows"]>[number],
): boolean {
  if (row.length !== 6) return false;
  const hasJob = (i: number) => "jobs" in row[i]! && row[i]!.jobs.length > 0;
  return (
    !hasJob(0) &&
    hasJob(1) &&
    hasJob(2) &&
    !hasJob(3) &&
    !hasJob(4) &&
    !hasJob(5)
  );
}

/**
 * Entering SE/SR-only tier: only TM → Star Emperor and Soul Linker → Soul Reaper need arrows here.
 * Skip columns (SN, ninja, gunslinger, summoner) get **no** arrow here — their ↓ appears only in the row
 * after the gap tier (`jobPickerMatrixArrowRowCompactAfterGap`) so those paths are not double-stacked.
 */
function jobPickerMatrixArrowRowCompactBeforeGap(): string {
  const down =
    '<span class="job-picker-matrix-tier-arrow" aria-hidden="true">↓</span>';
  const hold =
    '<div class="job-picker-matrix-cell job-picker-matrix-arrow-cell job-picker-matrix-arrow-cell--hold" aria-hidden="true"></div>';
  return `<div class="job-picker-matrix-row job-picker-matrix-row--arrows job-picker-matrix-row--arrows-compact-tier-skip" aria-hidden="true">
  ${hold}
  <div class="job-picker-matrix-cell job-picker-matrix-arrow-cell">${down}</div>
  <div class="job-picker-matrix-cell job-picker-matrix-arrow-cell">${down}</div>
  <div class="job-picker-matrix-cell job-picker-matrix-arrow-cell job-picker-matrix-arrow-cell--cluster job-picker-matrix-arrow-cell--hold" aria-hidden="true"></div>
</div>`;
}

/** Leaving SE/SR-only tier: full-width ↓ row so every final-tier column (incl. Shinkiro/Shiranui, Spirit Handler) aligns. */
function jobPickerMatrixArrowRowCompactAfterGap(): string {
  const down =
    '<span class="job-picker-matrix-tier-arrow" aria-hidden="true">↓</span>';
  const cells = Array.from(
    { length: 6 },
    () =>
      `<div class="job-picker-matrix-cell job-picker-matrix-arrow-cell" aria-hidden="true">${down}</div>`,
  ).join("");
  return `<div class="job-picker-matrix-row job-picker-matrix-row--arrows" aria-hidden="true">${cells}</div>`;
}

function jobPickerExpandedMatrixHtml(g: JobPickerSection, labelEsc: string): string {
  const rows = g.expandedMatrixRows!;
  const parts: string[] = [];
  for (let ri = 0; ri < rows.length; ri++) {
    parts.push(jobPickerMatrixRowHtml(rows[ri]!, ri, labelEsc));
    if (ri < rows.length - 1) {
      const pre = rows[ri]!;
      const next = rows[ri + 1]!;
      if (isExpandedMatrixGapTierRow(next)) {
        parts.push(jobPickerMatrixArrowRowCompactBeforeGap());
      } else if (isExpandedMatrixGapTierRow(pre)) {
        parts.push(jobPickerMatrixArrowRowCompactAfterGap());
      } else {
        parts.push(jobPickerMatrixArrowRowAfter(pre));
      }
    }
  }
  return `<div class="job-picker-expanded-matrix" role="group" aria-label="${labelEsc}">${parts.join("")}</div>`;
}

function jobPickerSectionHtml(g: JobPickerSection, sid: string): string {
  const labelEsc = escapeHtml(g.heading);
  if (g.jobRowsLayout === "expandedMatrix" && g.expandedMatrixRows?.length) {
    const matrix = jobPickerExpandedMatrixHtml(g, labelEsc);
    return `<section class="job-picker-section" aria-labelledby="${sid}">
        <h3 class="job-picker-section-title" id="${sid}">${labelEsc}</h3>
        ${matrix}
      </section>`;
  }
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
      (g.jobRows != null && g.jobRows.some((r) => r.length > 0)) ||
      (g.expandedMatrixRows != null &&
        g.expandedMatrixRows.some((row) => row.some((c) => "jobs" in c && c.jobs.length > 0))),
  );
  return filtered.map((g, i) => jobPickerSectionHtml(g, `${idPrefix}-sec-${i}`)).join("");
}

function jobPickerTabIdForJob(tabs: JobPickerTabDef[], jobKey: string): string {
  const hit = tabs.find((t) => t.jobKeys.includes(jobKey));
  return hit?.id ?? tabs[0]!.id;
}

function applyJobPickerTab(root: HTMLElement, activeId: string): void {
  exitJobPickerInlineLineView(root);
  clearJobPickerLineShortcutSelection(root);
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
  scheduleFitJobPickerStageStarterLabels(root);
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
  syncGameModeToggleChrome(root);
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

function remountJobPickerDialog(root: HTMLElement): void {
  const dialog = root.querySelector("#job-picker-dialog") as HTMLDialogElement | null;
  if (!dialog) return;
  jobPickerInlineLineKey = null;
  const tabs = listJobPickerTabs();
  const initialTabId = jobPickerTabIdForJob(tabs, currentJob);
  dialog.innerHTML = buildJobPickerDialogInnerMarkup(tabs, initialTabId, "Choose class");
  wireJobPickerInteractions(root, { skipDialogShell: true });
  applyJobPickerTab(root, initialTabId);
}

function buildJobPickerDialogInnerMarkup(
  pickerTabs: JobPickerTabDef[],
  initialTabId: string,
  dialogTitle = "Choose class",
): string {
  const tablistHtml =
    pickerTabs.length > 1 ? buildJobPickerTablistHtml(pickerTabs, initialTabId) : "";
  const panelsHtml = buildJobPickerPanelsHtml(pickerTabs, initialTabId);
  const lineShortcutsHtml = buildClassLineOpenButtonsMarkup();
  const categoriesBlock = tablistHtml
    ? `<div class="job-picker-tabrail-block job-picker-tabrail-block--categories">${tablistHtml}</div>`
    : "";
  const tabrailHtml = `<aside class="job-picker-tabrail">
    ${categoriesBlock}
    <div class="job-picker-tabrail-block job-picker-tabrail-block--lines">
      <div class="job-picker-modal-line-shortcuts job-picker-modal-line-shortcuts--tabrail" role="group" aria-label="Class line progression pickers">
        ${lineShortcutsHtml}
      </div>
    </div>
  </aside>`;
  return `${tabrailHtml}
      <div class="job-picker-dialog-panel">
        <div class="job-picker-dialog-head">
          <h2 class="job-picker-dialog-title" id="job-picker-dialog-title">${escapeHtml(dialogTitle)}</h2>
          <button type="button" class="job-picker-close" aria-label="Close class picker">×</button>
        </div>
        <div class="job-picker-dialog-scroll">
          <div id="job-picker-body" role="region" aria-label="Character classes">
            <div id="job-picker-body-main">${panelsHtml}</div>
            <div id="job-picker-body-line" class="job-picker-body-line" hidden></div>
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
    const sp = btn.querySelector(".job-picker-sprite") as HTMLElement | null;
    if (sp) setJobPickerStandArt(sp, key);
  }
  setJobPickerSplitStandArt(root);
  updateJobPickerStandStacking(root);

  if (!opts.skipDialogShell) {
    trigger.addEventListener("click", () => {
      remountJobPickerDialog(root);
      applyStoredClassPickerView(root);
      dialog.showModal();
      trigger.setAttribute("aria-expanded", "true");
      requestAnimationFrame(() => {
        const line = root.querySelector("#job-picker-body-line") as HTMLElement | null;
        const focusRoot =
          line && !line.hasAttribute("hidden")
            ? line
            : (root.querySelector(".job-picker-dialog-panel") as HTMLElement | null) ?? root;
        const cur = focusRoot.querySelector(
          ".job-picker-card--current, .job-picker-split-hit--current",
        ) as HTMLElement | null;
        (cur ?? root.querySelector(".job-picker-close"))?.focus();
      });
    });

    dialog.addEventListener("close", () => {
      persistClassPickerViewFromUi(root);
      jobPickerInlineLineKey = null;
      trigger.setAttribute("aria-expanded", "false");
      trigger.focus();
    });

    dialog.addEventListener("click", (e) => {
      const lineBtn = (e.target as HTMLElement).closest(
        ".job-picker-modal-line-shortcut",
      ) as HTMLButtonElement | null;
      if (lineBtn) {
        const a = lineBtn.dataset.classLineAnchor;
        if (!a) return;
        showJobPickerInlineLineView(root, a);
        return;
      }
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
    const t = (e.target as HTMLElement).closest(
      ".job-picker-split-hit, .job-picker-card",
    ) as HTMLButtonElement | null;
    if (!t?.dataset.jobKey) return;
    pickJobFromDialog(root, t.dataset.jobKey);
  });

  scheduleFitJobPickerStageStarterLabels(root);
}

function applyGameModeFromUi(root: HTMLElement, mode: GameMode): void {
  persistPlannerGameMode(mode);
  setPlannerGameMode(mode);
  loadState();
  ensureCurrentJobInData();
  applyJob(currentJob);
  saveState();
  syncGameModeToggleUi(root);
  const dialog = root.querySelector("#job-picker-dialog") as HTMLDialogElement | null;
  if (dialog) {
    remountJobPickerDialog(root);
  } else {
    wireJobPickerInteractions(root, { skipDialogShell: true });
  }
  renderColumns(root);
  refreshAll(root);
  syncJobPickerUi(root);
}

function renderApp(root: HTMLElement): void {
  plannerAppRoot = root;
  ensureTooltipUnlockClickListener();

  const pickerTabs = listJobPickerTabs();
  const initialTabId = jobPickerTabIdForJob(pickerTabs, currentJob);
  const jobPickerDialogInner = buildJobPickerDialogInnerMarkup(pickerTabs, initialTabId, "Choose class");

  root.innerHTML = `
    ${plannerHeaderInnerHtml("skills")}
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
      <div class="job-sit-stack" id="job-sit-stack" aria-hidden="true">
        <div class="job-sit-dock" id="job-sit-dock">
          <img class="job-sit-dock__img" id="job-sit-sprite-img" alt="" width="120" height="120" />
        </div>
        <div class="job-sit-dock-controls-row">
          <div
            class="game-mode-toggle game-mode-toggle--header game-mode-toggle--sit-outfit"
            id="job-sit-outfit-toggle"
            data-active="default"
            role="group"
            aria-label="Third class outfit sprite"
            hidden
          >
            <span class="game-mode-toggle__slider" aria-hidden="true"></span>
            <button type="button" class="game-mode-toggle__btn game-mode-toggle__btn--active" data-sit-outfit="0" aria-pressed="true">
              <span class="game-mode-toggle__text">Default</span>
            </button>
            <button type="button" class="game-mode-toggle__btn" data-sit-outfit="1" aria-pressed="false">
              <span class="game-mode-toggle__text">Alt</span>
            </button>
          </div>
          <button
            type="button"
            class="job-dock-pose-btn"
            id="btn-job-dock-pose"
            aria-pressed="false"
            aria-label="Pose: sitting. Click to show standing sprite."
          >
            <svg
              class="job-dock-pose-icon job-dock-pose-icon--sit"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <path
                d="M3.5 17.5H20.5"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
              <circle cx="15.25" cy="7.25" r="2.25" fill="currentColor" />
              <path
                d="M15.25 9.5 12.75 14.75 8.75 17.5"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            <svg
              class="job-dock-pose-icon job-dock-pose-icon--stand"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <circle cx="12" cy="5" r="2.25" fill="currentColor" />
              <path
                d="M12 7.5v8"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
              <path
                d="M12 15.5 8.25 21M12 15.5 15.75 21"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            <span class="job-dock-pose-caption job-dock-pose-caption--sit" aria-hidden="true">Sit</span>
            <span class="job-dock-pose-caption job-dock-pose-caption--stand" aria-hidden="true">Stand</span>
          </button>
        </div>
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

  root.querySelectorAll("#job-sit-outfit-toggle .game-mode-toggle__btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const b = btn as HTMLButtonElement;
      const v = b.dataset.sitOutfit;
      sitThirdClassOutfitAlt = v === "1";
      localStorage.setItem(SIT_OUTFIT_ALT_STORAGE_KEY, sitThirdClassOutfitAlt ? "1" : "0");
      syncJobPickerUi(root);
    });
  });

  root.querySelector("#btn-job-dock-pose")?.addEventListener("click", () => {
    dockPose = dockPose === "stand" ? "sit" : "stand";
    localStorage.setItem(DOCK_POSE_STORAGE_KEY, dockPose);
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
  const unifiedRenewalTransPath = job !== undefined && shouldMergeRenewalTransPathSkillPanel(job);
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
      } else if (job && unifiedRenewalTransPath && t === 0) {
        const c = contentCols[0];
        if (c !== undefined) colTitle = job.columns[c]?.title ?? colTitle;
      } else if (job && unifiedRenewalTransPath && t === 1) {
        const ca = contentCols[1];
        const cb = contentCols[2];
        if (ca !== undefined && cb !== undefined)
          colTitle = `${job.columns[ca]?.title ?? ""} + ${job.columns[cb]?.title ?? ""}`.trim();
      } else if (job && unifiedRenewalTransPath && t >= 2) {
        const c = contentCols[t + 1];
        if (c !== undefined) colTitle = job.columns[c]?.title ?? colTitle;
      } else if (job) {
        const c = contentCols[t];
        if (c !== undefined) colTitle = job.columns[c]?.title ?? colTitle;
      }
      label.textContent = colTitle;
      const aria =
        unifiedTrans && t === 1
          ? `${job!.label} (combined second + transcendent pool)`
          : unifiedRenewalTransPath && t === 1
            ? `${colTitle} (combined second + transcendent pool)`
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
