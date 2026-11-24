/**
 * Beta skill planner: the board where you click, and a build ledger beside it that keeps the
 * running account (points left per class, every skill taken, the job level each point lands
 * on). Opt-in from the planner's tab row; the current planner stays as it is.
 *
 * Rules (prerequisite auto-fill, caps, saved builds, share links) come from the planner core
 * in main.ts through `PlannerApi`; this file only draws and handles input.
 */

import "./beta-planner.css";
import type { PlannerApi } from "./main";
import { GRID_COLS, classLineModalJobRows, listClassLineShortcuts, listJobs, type SkillDef } from "./planner-data";
import {
  getPlannerGameMode,
  getSkillDataSource,
  setAndPersistPlannerGameMode,
  setAndPersistSkillDataSource,
  switchPlannerLayout,
  type GameMode,
  type PlannerLayout,
  type SkillDataSource,
} from "./game-mode";
import { plannerHeaderInnerHtml, syncGameModeToggleChrome } from "./site-header";
import { ICON } from "./icons";

type Board = ReturnType<PlannerApi["boards"]>[number];
type Snapshot = { levels: Record<string, number>; order: string[] };

const ORDER_STORAGE_KEY = "ro-planner-beta-order";
const UNDO_LIMIT = 200;

let api: PlannerApi;
let root: HTMLElement;
let boards: Board[] = [];
let selectedId: string | null = null;
let hoverId: string | null = null;
let order: string[] = [];
let tappedId: string | null = null;
let undoStack: Snapshot[] = [];
let statusTimer: number | undefined;
/** Touch screens have no hover: the first tap on a skill selects it, the next tap raises it. */
const coarsePointer = window.matchMedia("(pointer: coarse)");

function esc(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const lv = (id: string): number => api.getLevels()[id] ?? 0;

// ---------------------------------------------------------------- learn order

function orderKey(): string {
  return `${getPlannerGameMode()}:${getSkillDataSource()}:${api.getJobKey()}`;
}

function loadOrder(): string[] {
  try {
    const all = JSON.parse(localStorage.getItem(ORDER_STORAGE_KEY) || "{}") as Record<string, string[]>;
    return Array.isArray(all[orderKey()]) ? all[orderKey()]! : [];
  } catch {
    return [];
  }
}

function saveOrder(): void {
  try {
    const all = JSON.parse(localStorage.getItem(ORDER_STORAGE_KEY) || "{}") as Record<string, string[]>;
    all[orderKey()] = order;
    localStorage.setItem(ORDER_STORAGE_KEY, JSON.stringify(all));
  } catch {
    /* ignore */
  }
}

function isQuestSkill(id: string): boolean {
  return boards.some((b) => b.quest && b.skills.some((s) => s.id === id));
}

/**
 * Bring the recorded order in line with the levels: drop points that no longer exist (from the
 * end), then add any missing points in an order the game allows (prerequisites first, board
 * order otherwise). Builds from share links or the current planner get a sensible order.
 */
function reconcileOrder(): void {
  const levels = api.getLevels();
  const counts: Record<string, number> = {};
  const kept: string[] = [];
  for (const id of order) {
    if ((counts[id] ?? 0) < (levels[id] ?? 0) && !isQuestSkill(id)) {
      kept.push(id);
      counts[id] = (counts[id] ?? 0) + 1;
    }
  }
  const pool = boards.filter((b) => !b.quest).flatMap((b) => b.skills);
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const s of pool) {
      if ((counts[s.id] ?? 0) >= (levels[s.id] ?? 0)) continue;
      const ready = api.prereqsFor(s.id).every((e) => (counts[e.fromId] ?? 0) >= e.requiredLevel);
      if (!ready) continue;
      kept.push(s.id);
      counts[s.id] = (counts[s.id] ?? 0) + 1;
      progressed = true;
      break;
    }
  }
  for (const s of pool) {
    while ((counts[s.id] ?? 0) < (levels[s.id] ?? 0)) {
      kept.push(s.id);
      counts[s.id] = (counts[s.id] ?? 0) + 1;
    }
  }
  order = kept;
}

/** After a change: points that were added go on the end in the order they were taken. */
function recordOrderChange(before: Record<string, number>, raisedId: string | null): void {
  const after = api.getLevels();
  // Removals: take the latest points of each skill that dropped.
  for (const id of Object.keys(before)) {
    let drop = (before[id] ?? 0) - (after[id] ?? 0);
    for (let i = order.length - 1; drop > 0 && i >= 0; i--) {
      if (order[i] === id) {
        order.splice(i, 1);
        drop--;
      }
    }
  }
  // Additions: prerequisites the game made you take first, then the skill itself.
  const added: string[] = [];
  for (const id of Object.keys(after)) {
    const gain = (after[id] ?? 0) - (before[id] ?? 0);
    if (gain > 0 && id !== raisedId && !isQuestSkill(id)) for (let i = 0; i < gain; i++) added.push(id);
  }
  added.sort((a, b) => depth(a) - depth(b));
  if (raisedId && !isQuestSkill(raisedId)) {
    const gain = (after[raisedId] ?? 0) - (before[raisedId] ?? 0);
    for (let i = 0; i < gain; i++) added.push(raisedId);
  }
  order.push(...added);
  saveOrder();
}

function depth(id: string, seen = new Set<string>()): number {
  if (seen.has(id)) return 0;
  seen.add(id);
  const pre = api.prereqsFor(id);
  return pre.length ? 1 + Math.max(...pre.map((e) => depth(e.fromId, seen))) : 0;
}

// ---------------------------------------------------------------- changes

function snapshot(): Snapshot {
  return { levels: { ...api.getLevels() }, order: [...order] };
}

function commit(change: () => boolean, raisedId: string | null): void {
  const before = snapshot();
  if (!change()) return;
  undoStack.push(before);
  if (undoStack.length > UNDO_LIMIT) undoStack.shift();
  recordOrderChange(before.levels, raisedId);
  api.save();
  announceAutofill(before.levels, raisedId);
  refresh();
}

function raise(id: string): void {
  commit(() => api.changeLevel(id, 1), id);
}

function lower(id: string): void {
  commit(() => api.changeLevel(id, -1), null);
}

function setLevel(id: string, n: number): void {
  commit(() => api.setLevel(id, n), n > lv(id) ? id : null);
}

function undo(): void {
  const prev = undoStack.pop();
  if (!prev) return;
  api.setLevels(prev.levels);
  order = prev.order;
  saveOrder();
  api.save();
  refresh();
}

function resetBuild(): void {
  commit(() => {
    const zero: Record<string, number> = {};
    let any = false;
    for (const s of api.getSkills()) {
      if (lv(s.id) > 0) any = true;
      zero[s.id] = 0;
    }
    api.setLevels(zero);
    return any;
  }, null);
}

/** Prerequisites the planner raised for you are named, and their tiles flash once. */
function announceAutofill(before: Record<string, number>, raisedId: string | null): void {
  if (!raisedId) return;
  const after = api.getLevels();
  const extra = Object.keys(after).filter((id) => id !== raisedId && (after[id] ?? 0) > (before[id] ?? 0));
  if (!extra.length) return;
  const names = extra.map((id) => `${api.getSkill(id)?.name ?? id} to ${after[id]}`);
  const raised = api.getSkill(raisedId)?.name ?? raisedId;
  showStatus(`Raised ${joinList(names)} so ${raised} can be learned.`);
  requestAnimationFrame(() => {
    for (const id of extra) {
      const el = root.querySelector<HTMLElement>(`.bp-tile[data-id="${CSS.escape(id)}"]`);
      if (!el) continue;
      el.classList.remove("bp-tile--filled");
      void el.offsetWidth;
      el.classList.add("bp-tile--filled");
    }
  });
}

function joinList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function showStatus(msg: string): void {
  const el = root.querySelector<HTMLElement>("#bp-status");
  if (!el) return;
  el.textContent = msg;
  window.clearTimeout(statusTimer);
  statusTimer = window.setTimeout(() => {
    el.textContent = "";
  }, 6000);
}

// ---------------------------------------------------------------- points

type TierInfo = { label: string; used: number; cap: number };

function tiers(): TierInfo[] {
  const labels = api.tierLabels();
  const used = api.tierUsed();
  return labels.map((label, t) => ({ label, used: used[t] ?? 0, cap: api.tierCap(t) }));
}

/** The points tier a skill spends from, or null (quest skills, Basic Skill). */
function tierOf(id: string): number | null {
  if (api.exemptFromCap(id)) return null;
  for (const b of boards) {
    if (b.quest) continue;
    if (b.skills.some((s) => s.id === id)) return b.tier ?? 0;
  }
  return null;
}

// ---------------------------------------------------------------- markup

function shellHtml(): string {
  return `
    ${plannerHeaderInnerHtml("skills")}
    <section class="bp" aria-label="Skill planner (beta)">
      <div class="bp-strip">
        <button type="button" class="bp-classbtn" id="bp-classbtn" aria-haspopup="dialog">
          <span class="bp-classbtn__sprite"><img alt="" id="bp-class-sprite" /></span>
          <span class="bp-classbtn__text"><span class="bp-classbtn__cap">Class</span><span class="bp-classbtn__name" id="bp-class-name"></span></span>
          <span class="bp-classbtn__chev">${ICON.caretDown}</span>
        </button>
        <div class="bp-meters" id="bp-meters" role="group" aria-label="Skill points left per class"></div>
        <div class="bp-actions">
          <button type="button" class="bp-btn" id="bp-undo" title="Undo (Ctrl+Z)">Undo</button>
          <button type="button" class="bp-btn" id="bp-reset">Reset</button>
          <button type="button" class="bp-btn bp-btn--primary" id="bp-share">Share build</button>
        </div>
      </div>
      <div class="bp-main">
        <section class="bp-board" aria-label="Skill board">
          <div class="bp-boards" id="bp-grid"></div>
          <p class="bp-status" id="bp-status" role="status" aria-live="polite"></p>
        </section>
        <aside class="bp-ledger" aria-label="Build">
          <div class="bp-ledger__head"><h2>Build</h2><span class="bp-ledger__total" id="bp-total"></span></div>
          <div class="bp-ledger__list" id="bp-ledger-list"></div>
          <div class="bp-inspector" id="bp-inspector"></div>
        </aside>
      </div>
    </section>
    <dialog class="bp-picker" id="bp-picker" aria-label="Choose a class"></dialog>`;
}

function tileHtml(s: SkillDef): string {
  const icon = s.iconId ?? s.skidId;
  const img = icon ? `<img class="bp-tile__img" src="${esc(api.skillIconUrl(icon))}" alt="" loading="lazy" referrerpolicy="no-referrer" />` : "";
  return `<button type="button" class="bp-tile" data-id="${esc(s.id)}" style="grid-column:${s.gridCol};grid-row:${s.gridRow}">
      <span class="bp-tile__icon">${img}</span>
      <span class="bp-tile__name">${esc(s.name)}</span>
      <span class="bp-tile__lv"><span class="bp-tile__cur">0</span><span class="bp-tile__max">/${s.maxLevel}</span></span>
      <span class="bp-tile__need" aria-hidden="true"></span>
      <span class="bp-tile__minus" data-minus aria-hidden="true">${ICON.minus}</span>
    </button>`;
}

/** Every class's board at once (base and second class together), then the quest skills. */
function renderBoards(): void {
  const host = root.querySelector<HTMLElement>("#bp-grid")!;
  host.innerHTML = boards
    .map((board, i) => {
      let cells: string;
      let rowsStyle = "";
      if (board.quest) {
        cells = board.skills
          .map((s, k) => tileHtml({ ...s, gridCol: (k % GRID_COLS) + 1, gridRow: Math.floor(k / GRID_COLS) + 1 }))
          .join("");
      } else {
        const rows = Math.max(1, ...board.skills.map((s) => s.gridRow));
        const taken = new Set(board.skills.map((s) => `${s.gridCol},${s.gridRow}`));
        const empties: string[] = [];
        for (let r = 1; r <= rows; r++) {
          for (let c = 1; c <= GRID_COLS; c++) {
            if (!taken.has(`${c},${r}`)) empties.push(`<span class="bp-empty" style="grid-column:${c};grid-row:${r}" aria-hidden="true"></span>`);
          }
        }
        rowsStyle = ` style="grid-template-rows:repeat(${rows}, minmax(var(--bp-tile-h), auto))"`;
        cells = board.skills.map(tileHtml).join("") + empties.join("");
      }
      return `<section class="bp-boardsec${board.quest ? " bp-boardsec--quest" : ""}" data-board="${i}" aria-label="${esc(board.title)}">
          <h2 class="bp-boardsec__head"><span>${esc(board.title)}</span><span class="bp-boardsec__count" data-count="${i}"></span></h2>
          <div class="bp-boardsec__scroll"><div class="bp-grid${board.quest ? " bp-grid--quest" : ""}"${rowsStyle}>${cells}</div></div>
        </section>`;
    })
    .join("");
  host.querySelectorAll<HTMLImageElement>(".bp-tile__img").forEach((img) => {
    img.addEventListener("error", () => img.remove(), { once: true });
  });
  renderCounts();
}

/** Each board's heading carries its class's points used of the cap. */
function renderCounts(): void {
  const info = tiers();
  boards.forEach((b, i) => {
    const el = root.querySelector<HTMLElement>(`[data-count="${i}"]`);
    if (!el) return;
    const t = b.tier != null ? info[b.tier] : undefined;
    el.textContent = t ? `${t.used} of ${t.cap}` : "";
    el.classList.toggle("is-over", !!t && t.used > t.cap);
  });
}

function renderMeters(): void {
  const host = root.querySelector<HTMLElement>("#bp-meters")!;
  host.innerHTML = tiers()
    .map((t) => {
      const left = t.cap - t.used;
      const over = left < 0;
      const pct = Math.min(100, t.cap ? (t.used / t.cap) * 100 : 0);
      const value = over ? `<b>${-left}</b> over` : `<b>${left}</b> left`;
      return `<div class="bp-meter${over ? " is-over" : ""}" aria-label="${esc(t.label)}: ${over ? `${-left} over` : `${left} left`} of ${t.cap}">
          <div class="bp-meter__top"><span class="bp-meter__label">${esc(t.label)}</span><span class="bp-meter__value">${value} <span class="bp-meter__cap">of ${t.cap}</span></span></div>
          <div class="bp-meter__track"><div class="bp-meter__fill" style="width:${pct}%"></div></div>
        </div>`;
    })
    .join("");
}

type LedgerRow = { from: number; to: number; id: string; lvFrom: number; lvTo: number };

function ledgerRows(ids: string[]): LedgerRow[] {
  const rows: LedgerRow[] = [];
  const seen: Record<string, number> = {};
  ids.forEach((id, i) => {
    seen[id] = (seen[id] ?? 0) + 1;
    const last = rows[rows.length - 1];
    if (last && last.id === id) {
      last.to = i;
      last.lvTo = seen[id]!;
    } else {
      rows.push({ from: i, to: i, id, lvFrom: seen[id]!, lvTo: seen[id]! });
    }
  });
  return rows;
}

function renderLedger(): void {
  const host = root.querySelector<HTMLElement>("#bp-ledger-list")!;
  const info = tiers();
  const groups: string[] = [];
  const range = (a: number, b: number) => (a === b ? `${a}` : `${a}–${b}`);

  // Basic Skill rides on Novice job levels.
  const basic = api.getSkills().find((s) => api.exemptFromCap(s.id));
  if (basic && lv(basic.id) > 0) {
    groups.push(`<section class="bp-group"><h3 class="bp-group__head"><span>Novice</span></h3>
      <ol class="bp-rows">${rowHtml("Job " + range(2, lv(basic.id) + 1), basic.id, range(1, lv(basic.id)), false)}</ol></section>`);
  }

  info.forEach((t, ti) => {
    const ids = order.filter((id) => tierOf(id) === ti);
    if (!ids.length) return;
    const rows = ledgerRows(ids)
      .map((r) => {
        const jobFrom = r.from + 2;
        const jobTo = r.to + 2;
        const over = r.to + 1 > t.cap;
        const job = r.from + 1 > t.cap ? "Over" : `Job ${range(jobFrom, Math.min(jobTo, t.cap + 1))}`;
        return rowHtml(job, r.id, range(r.lvFrom, r.lvTo), over);
      })
      .join("");
    const left = t.cap - t.used;
    groups.push(`<section class="bp-group" data-tier="${ti}"><h3 class="bp-group__head"><span>${esc(t.label)}</span><span class="${left < 0 ? "is-over" : ""}">${t.used} of ${t.cap}</span></h3><ol class="bp-rows">${rows}</ol></section>`);
  });

  const quest = boards.find((b) => b.quest);
  const questTaken = quest?.skills.filter((s) => lv(s.id) > 0) ?? [];
  if (questTaken.length) {
    groups.push(`<section class="bp-group"><h3 class="bp-group__head"><span>Quest skills</span></h3><ol class="bp-rows">${questTaken
      .map((s) => rowHtml("Quest", s.id, String(lv(s.id)), false))
      .join("")}</ol></section>`);
  }

  host.innerHTML = groups.length
    ? groups.join("")
    : `<p class="bp-ledger__empty">No skills yet. Every point you spend is listed here with the job level it is learned at.</p>`;
  const total = Object.values(api.getLevels()).reduce((a, b) => a + b, 0);
  root.querySelector("#bp-total")!.textContent = total ? `${total} points` : "";
}

function rowHtml(job: string, id: string, levels: string, over: boolean): string {
  const s = api.getSkill(id);
  const on = id === selectedId ? " is-selected" : "";
  return `<li><button type="button" class="bp-row${on}${over ? " is-over" : ""}" data-select="${esc(id)}">
      <span class="bp-row__job">${esc(job)}</span><span class="bp-row__name">${esc(s?.name ?? id)}</span><span class="bp-row__lv">${esc(levels)}</span>
    </button></li>`;
}

/** The inspector shows the skill under the pointer, else the selected one; its controls act on what it shows. */
function renderInspector(): void {
  const host = root.querySelector<HTMLElement>("#bp-inspector")!;
  const shownId = hoverId ?? selectedId;
  const s = shownId ? api.getSkill(shownId) : undefined;
  host.dataset.skill = s?.id ?? "";
  if (!s) {
    host.innerHTML = `<p class="bp-inspector__empty">Select a skill to see its levels and requirements here.</p>`;
    return;
  }
  const cur = lv(s.id);
  const icon = s.iconId ?? s.skidId;
  const req = api.prereqsFor(s.id);
  const unlocks = api.postreqsFor(s.id);
  const cells = Array.from({ length: s.maxLevel }, (_, i) => {
    const n = i + 1;
    return `<button type="button" class="bp-lvcell${n <= cur ? " is-on" : ""}" data-set="${n}" aria-label="Set ${esc(s.name)} to level ${n}">${n}</button>`;
  }).join("");
  const reqHtml = req.length
    ? `<p class="bp-req"><span class="bp-req__k">Requires</span><span>${req
        .map((e) => `<span class="bp-req__item${lv(e.fromId) >= e.requiredLevel ? " is-met" : ""}">${esc(api.getSkill(e.fromId)?.name ?? e.fromId)} ${e.requiredLevel}</span>`)
        .join(", ")}</span></p>`
    : "";
  const unlockHtml = unlocks.length
    ? `<p class="bp-req bp-req--unlocks"><span class="bp-req__k">Unlocks</span><span>${unlocks
        .map((e) => `<span class="bp-req__item">${esc(api.getSkill(e.toId)?.name ?? e.toId)} at ${e.requiredLevel}</span>`)
        .join(", ")}</span></p>`
    : "";
  host.innerHTML = `
    <div class="bp-inspector__head">
      <span class="bp-inspector__icon">${icon ? `<img src="${esc(api.skillIconUrl(icon))}" alt="" referrerpolicy="no-referrer" />` : ""}</span>
      <div class="bp-inspector__title"><h3>${esc(s.name)}</h3><span>Level ${cur} of ${s.maxLevel}</span></div>
      <div class="bp-stepper" role="group" aria-label="${esc(s.name)} level">
        <button type="button" class="bp-btn bp-stepper__btn" data-step="-1" aria-label="Lower ${esc(s.name)}" ${cur <= 0 ? "disabled" : ""}>${ICON.minus}</button>
        <button type="button" class="bp-btn bp-stepper__btn" data-step="1" aria-label="Raise ${esc(s.name)}" ${cur >= s.maxLevel ? "disabled" : ""}>${ICON.plus}</button>
      </div>
    </div>
    <div class="bp-lvcells" role="group" aria-label="Set level">${cells}</div>
    ${reqHtml}${unlockHtml}
    <button type="button" class="bp-btn bp-inspector__details" id="bp-details" aria-expanded="false">Skill details</button>`;
}

function renderClassButton(): void {
  const job = api.getJob();
  root.querySelector("#bp-class-name")!.textContent = job?.label ?? "";
  const img = root.querySelector<HTMLImageElement>("#bp-class-sprite")!;
  img.hidden = false;
  img.onerror = () => {
    img.hidden = true;
  };
  img.src = api.standSpriteUrl(api.getJobKey());
}

/** Update every live number and state without rebuilding the board. */
function refresh(): void {
  renderCounts();
  renderMeters();
  const info = tiers();
  root.querySelectorAll<HTMLElement>(".bp-tile").forEach((el) => {
    const id = el.dataset.id!;
    const s = api.getSkill(id);
    if (!s) return;
    const cur = lv(id);
    el.querySelector(".bp-tile__cur")!.textContent = String(cur);
    el.classList.toggle("bp-tile--spent", cur > 0);
    el.classList.toggle("bp-tile--max", cur >= s.maxLevel);
    el.classList.toggle("bp-tile--locked", cur === 0 && api.prereqsFor(id).some((e) => lv(e.fromId) < e.requiredLevel));
    el.classList.toggle("bp-tile--selected", id === selectedId);
    const t = tierOf(id);
    el.classList.toggle("bp-tile--over", cur > 0 && t != null && (info[t]?.used ?? 0) > (info[t]?.cap ?? 0));
    el.setAttribute(
      "aria-label",
      `${s.name}, level ${cur} of ${s.maxLevel}. Click to raise, right-click to lower.`,
    );
  });
  applyHover();
  renderLedger();
  revealInLedger();
  renderInspector();
  fitLedger();
  const undoBtn = root.querySelector<HTMLButtonElement>("#bp-undo")!;
  undoBtn.disabled = undoStack.length === 0;
}

/** Pointing at a skill marks what it needs (gold, with the level) and what it opens (blue). */
function applyHover(): void {
  const focus = hoverId ?? selectedId;
  const needs = new Map<string, number>();
  const opens = new Map<string, number>();
  if (focus) {
    for (const e of api.prereqsFor(focus)) needs.set(e.fromId, e.requiredLevel);
    for (const e of api.postreqsFor(focus)) opens.set(e.toId, e.requiredLevel);
  }
  root.querySelectorAll<HTMLElement>(".bp-tile").forEach((el) => {
    const id = el.dataset.id!;
    const need = needs.get(id);
    el.classList.toggle("bp-tile--need", need != null);
    el.classList.toggle("bp-tile--need-met", need != null && lv(id) >= need);
    el.classList.toggle("bp-tile--opens", opens.has(id));
    const badge = el.querySelector<HTMLElement>(".bp-tile__need")!;
    const at = opens.get(id);
    badge.textContent = need != null ? `Needs ${need}` : at != null ? `Opens at ${at}` : "";
  });
}

/** Scroll the ledger list (not the page) to the selected skill's row. */
function revealInLedger(): void {
  const list = root.querySelector<HTMLElement>("#bp-ledger-list");
  if (!list) return;
  const target = list.querySelector<HTMLElement>(".bp-row.is-selected");
  if (!target) return;
  const lr = list.getBoundingClientRect();
  const tr = target.getBoundingClientRect();
  if (tr.top < lr.top || tr.bottom > lr.bottom) {
    list.scrollTop += tr.top - lr.top - 8;
  }
}

/** The ledger is as tall as the window allows from wherever it currently sits. */
function fitLedger(): void {
  const ledger = root.querySelector<HTMLElement>(".bp-ledger");
  if (!ledger || window.matchMedia("(max-width: 1180px)").matches) {
    ledger?.style.removeProperty("max-height");
    return;
  }
  const top = Math.max(ledger.getBoundingClientRect().top, 0);
  ledger.style.maxHeight = `${Math.max(420, window.innerHeight - top - 20)}px`;
}

// ---------------------------------------------------------------- class picker

const EXTRA_LINES: { anchor: string; label: string }[] = [
  { anchor: "JT_NOVICE", label: "Novice" },
  { anchor: "JT_DRUID", label: "Druid" },
];

function pickerLines(): { label: string; rows: string[][] }[] {
  const available = new Set(listJobs().map((j) => j.key));
  const lines = listClassLineShortcuts().map((l) => ({ label: l.label, rows: classLineModalJobRows(l.anchorKey) }));
  for (const x of EXTRA_LINES) if (available.has(x.anchor)) lines.push({ label: x.label, rows: [[x.anchor]] });
  return lines.filter((l) => l.rows.length);
}

function renderPicker(): void {
  const dlg = root.querySelector<HTMLDialogElement>("#bp-picker")!;
  const labels = new Map(listJobs().map((j) => [j.key, j.label]));
  const current = api.getJobKey();
  const lines = pickerLines()
    .map((line) => {
      const stages = line.rows
        .map(
          (row) => `<div class="bp-pick-stage">${row
            .map((key) => {
              const label = labels.get(key) ?? key;
              const on = key === current;
              return `<button type="button" class="bp-pick${on ? " is-current" : ""}" data-job="${esc(key)}" data-name="${esc(label.toLowerCase())}">
                  <img src="${esc(api.standSpriteUrl(key))}" alt="" loading="lazy" />
                  <span>${esc(label)}</span>
                </button>`;
            })
            .join("")}</div>`,
        )
        .join("");
      return `<section class="bp-pick-line"><h3>${esc(line.label)}</h3>${stages}</section>`;
    })
    .join("");
  dlg.innerHTML = `
    <div class="bp-picker__head">
      <h2>Choose a class</h2>
      <input type="search" class="bp-picker__search" id="bp-picker-search" placeholder="Find a class" aria-label="Find a class" autocomplete="off" />
      <button type="button" class="bp-btn bp-picker__close" id="bp-picker-close" aria-label="Close">${ICON.close}</button>
    </div>
    <div class="bp-picker__body" id="bp-picker-body">${lines}</div>
    <p class="bp-picker__none" id="bp-picker-none" hidden>No class matches that name.</p>`;
  dlg.querySelectorAll<HTMLImageElement>(".bp-pick img").forEach((img) => {
    img.addEventListener("error", () => img.remove(), { once: true });
  });
}

function openPicker(): void {
  renderPicker();
  const dlg = root.querySelector<HTMLDialogElement>("#bp-picker")!;
  dlg.showModal();
  dlg.querySelector<HTMLInputElement>("#bp-picker-search")!.focus();
}

function filterPicker(q: string): void {
  const term = q.trim().toLowerCase();
  const dlg = root.querySelector<HTMLDialogElement>("#bp-picker")!;
  let shown = 0;
  dlg.querySelectorAll<HTMLElement>(".bp-pick-line").forEach((line) => {
    let lineShown = 0;
    line.querySelectorAll<HTMLElement>(".bp-pick").forEach((btn) => {
      const hit = !term || (btn.dataset.name ?? "").includes(term);
      btn.hidden = !hit;
      if (hit) lineShown++;
    });
    line.querySelectorAll<HTMLElement>(".bp-pick-stage").forEach((st) => {
      st.hidden = ![...st.querySelectorAll<HTMLElement>(".bp-pick")].some((b) => !b.hidden);
    });
    line.hidden = lineShown === 0;
    shown += lineShown;
  });
  dlg.querySelector<HTMLElement>("#bp-picker-none")!.hidden = shown > 0;
}

function pickJob(key: string): void {
  root.querySelector<HTMLDialogElement>("#bp-picker")!.close();
  if (key === api.getJobKey()) return;
  api.applyJob(key);
  startJob();
}

// ---------------------------------------------------------------- tooltip

function showDetails(anchor: HTMLElement): void {
  const tip = document.querySelector<HTMLElement>("#tooltip");
  const shown = root.querySelector<HTMLElement>("#bp-inspector")?.dataset.skill || selectedId;
  if (!tip || !shown) return;
  const html = api.tooltipHtml(shown);
  if (!html) return;
  tip.innerHTML = html;
  tip.hidden = false;
  tip.classList.add("tooltip--locked");
  const a = anchor.closest(".bp-ledger")!.getBoundingClientRect();
  const r = tip.getBoundingClientRect();
  const left = Math.max(12, a.left - r.width - 12);
  const top = Math.max(12, Math.min(window.innerHeight - r.height - 12, a.bottom - r.height));
  tip.style.left = `${left}px`;
  tip.style.top = `${top}px`;
  anchor.setAttribute("aria-expanded", "true");
}

function hideDetails(): void {
  const tip = document.querySelector<HTMLElement>("#tooltip");
  if (!tip || tip.hidden) return;
  tip.hidden = true;
  tip.classList.remove("tooltip--locked");
  root.querySelector("#bp-details")?.setAttribute("aria-expanded", "false");
}

// ---------------------------------------------------------------- wiring

function select(id: string | null, opts: { switchBoard?: boolean } = {}): void {
  selectedId = id;
  hideDetails();
  refresh();
  if (id && opts.switchBoard) {
    const tile = root.querySelector<HTMLElement>(`.bp-tile[data-id="${CSS.escape(id)}"]`);
    tile?.scrollIntoView({ block: "nearest" });
    tile?.focus({ preventScroll: true });
  }
}

function moveFocus(from: HTMLElement, dx: number, dy: number): void {
  const tiles = [...(from.parentElement ?? root).querySelectorAll<HTMLElement>(".bp-tile")];
  const pos = (el: HTMLElement) => ({ c: Number(el.style.gridColumnStart || el.style.gridColumn), r: Number(el.style.gridRowStart || el.style.gridRow) });
  const p = pos(from);
  let best: HTMLElement | null = null;
  let bestScore = Infinity;
  for (const t of tiles) {
    if (t === from) continue;
    const q = pos(t);
    const ddx = q.c - p.c;
    const ddy = q.r - p.r;
    if (dx && Math.sign(ddx) !== dx) continue;
    if (dy && Math.sign(ddy) !== dy) continue;
    const score = dx ? Math.abs(ddx) * 2 + Math.abs(ddy) * 3 : Math.abs(ddy) * 2 + Math.abs(ddx) * 3;
    if (score < bestScore) {
      bestScore = score;
      best = t;
    }
  }
  best?.focus();
}

function wire(): void {
  const grid = root.querySelector<HTMLElement>("#bp-grid")!;
  grid.addEventListener("click", (e) => {
    const tile = (e.target as HTMLElement).closest<HTMLElement>(".bp-tile");
    if (!tile) return;
    const id = tile.dataset.id!;
    const minus = (e.target as HTMLElement).closest("[data-minus]");
    if (coarsePointer.matches && !minus && id !== tappedId) {
      tappedId = id;
      selectedId = id;
      refresh();
      return;
    }
    tappedId = id;
    selectedId = id;
    if (minus || e.shiftKey) lower(id);
    else raise(id);
    refresh();
  });
  grid.addEventListener("contextmenu", (e) => {
    const tile = (e.target as HTMLElement).closest<HTMLElement>(".bp-tile");
    if (!tile) return;
    e.preventDefault();
    selectedId = tile.dataset.id!;
    lower(tile.dataset.id!);
    refresh();
  });
  grid.addEventListener("pointerover", (e) => {
    const tile = (e.target as HTMLElement).closest<HTMLElement>(".bp-tile");
    const id = tile?.dataset.id ?? null;
    if (id === hoverId) return;
    hoverId = id;
    applyHover();
    renderInspector();
  });
  grid.addEventListener("pointerleave", () => {
    hoverId = null;
    applyHover();
    renderInspector();
  });
  grid.addEventListener("keydown", (e) => {
    const tile = (e.target as HTMLElement).closest<HTMLElement>(".bp-tile");
    if (!tile) return;
    const id = tile.dataset.id!;
    if (e.key === "-" || e.key === "Backspace" || e.key === "Delete") {
      e.preventDefault();
      selectedId = id;
      lower(id);
      refresh();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      moveFocus(tile, -1, 0);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      moveFocus(tile, 1, 0);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveFocus(tile, 0, -1);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      moveFocus(tile, 0, 1);
    }
  });
  grid.addEventListener("focusin", (e) => {
    const tile = (e.target as HTMLElement).closest<HTMLElement>(".bp-tile");
    if (tile && tile.dataset.id !== selectedId) {
      selectedId = tile.dataset.id!;
      refresh();
    }
  });

  root.querySelector("#bp-ledger-list")!.addEventListener("click", (e) => {
    const row = (e.target as HTMLElement).closest<HTMLElement>("[data-select]");
    if (row) select(row.dataset.select!, { switchBoard: true });
  });

  root.querySelector("#bp-inspector")!.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    const shown = (e.currentTarget as HTMLElement).dataset.skill;
    if (!shown) return;
    selectedId = shown;
    const step = t.closest<HTMLElement>("[data-step]");
    if (step) {
      if (Number(step.dataset.step) > 0) raise(shown);
      else lower(shown);
      return;
    }
    const cell = t.closest<HTMLElement>("[data-set]");
    if (cell) {
      const n = Number(cell.dataset.set);
      // Clicking the current top level clears down to the one below it.
      setLevel(shown, n === lv(shown) ? n - 1 : n);
      return;
    }
    const details = t.closest<HTMLElement>("#bp-details");
    if (details) {
      if (details.getAttribute("aria-expanded") === "true") hideDetails();
      else showDetails(details);
    }
  });

  root.querySelector("#bp-undo")!.addEventListener("click", undo);
  root.querySelector("#bp-reset")!.addEventListener("click", resetBuild);
  root.querySelector("#bp-share")!.addEventListener("click", () => {
    const url = api.shareUrl();
    void navigator.clipboard.writeText(url).then(
      () => showStatus("Link copied. Paste it anywhere to share this build."),
      () => window.prompt("Copy this link to share your build:", url),
    );
  });

  root.querySelector("#bp-classbtn")!.addEventListener("click", openPicker);
  const dlg = root.querySelector<HTMLDialogElement>("#bp-picker")!;
  dlg.addEventListener("click", (e) => {
    const t = e.target as HTMLElement;
    if (t === dlg || t.closest("#bp-picker-close")) {
      dlg.close();
      return;
    }
    const pick = t.closest<HTMLElement>("[data-job]");
    if (pick) pickJob(pick.dataset.job!);
  });
  dlg.addEventListener("input", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id === "bp-picker-search") filterPicker(t.value);
  });
  dlg.addEventListener("keydown", (e) => {
    const t = e.target as HTMLElement;
    if (e.key === "Enter" && t.id === "bp-picker-search") {
      const first = dlg.querySelector<HTMLElement>(".bp-pick:not([hidden])");
      if (first) pickJob(first.dataset.job!);
    }
  });

  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea")) return;
      e.preventDefault();
      undo();
    } else if (e.key === "Escape") {
      hideDetails();
    }
  });
  document.addEventListener("pointerdown", (e) => {
    const t = e.target as HTMLElement;
    if (t.closest("#tooltip, #bp-details")) return;
    hideDetails();
  });

  // Site header switches.
  root.querySelector("#game-mode-toggle")?.addEventListener("click", (e) => {
    const m = (e.target as HTMLElement).closest<HTMLElement>("[data-set-game-mode]")?.dataset.setGameMode as GameMode | undefined;
    if (!m || m === getPlannerGameMode()) return;
    setAndPersistPlannerGameMode(m);
    api.reload();
    syncGameModeToggleChrome(root);
    startJob();
  });
  root.querySelector("#skill-data-toggle")?.addEventListener("click", (e) => {
    const src = (e.target as HTMLElement).closest<HTMLElement>("[data-set-skill-data]")?.dataset.setSkillData as SkillDataSource | undefined;
    if (!src || src === getSkillDataSource()) return;
    setAndPersistSkillDataSource(src);
    api.reload();
    syncGameModeToggleChrome(root);
    startJob();
  });
  root.querySelector("#planner-layout-toggle")?.addEventListener("click", (e) => {
    const layout = (e.target as HTMLElement).closest<HTMLElement>("[data-set-layout]")?.dataset.setLayout as PlannerLayout | undefined;
    if (layout && layout !== "beta") switchPlannerLayout(layout);
  });
}

/** (Re)start on the current job: boards, recorded order, a fresh undo history. */
function startJob(): void {
  boards = api.boards();
  selectedId = null;
  hoverId = null;
  undoStack = [];
  order = loadOrder();
  reconcileOrder();
  saveOrder();
  renderClassButton();
  renderBoards();
  refresh();
}

export function mountBetaPlanner(appRoot: HTMLElement, plannerApi: PlannerApi): void {
  api = plannerApi;
  root = appRoot;
  root.classList.add("bp-root");
  root.innerHTML = shellHtml();
  wire();
  startJob();
  let raf = 0;
  const onViewport = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(fitLedger);
  };
  window.addEventListener("scroll", onViewport, { passive: true });
  window.addEventListener("resize", onViewport);
}
