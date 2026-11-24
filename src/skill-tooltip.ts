/**
 * Skill tooltip in the layout of RO Classic Plus's in-game tooltip
 * (5_Legacy/src/UI/Components/SkillDescription): header with icon, SP, cast and
 * range; labelled facts; the description split into its labelled parts; what
 * the skill needs and unlocks; then a per-level grid with the planned level lit.
 *
 * skilldescript.lub text is written for the old beige box, with one "[Lv N]"
 * dump per rank. The parser below is a port of the in-game one, so both read
 * the same text the same way.
 */

export type SkillTooltipInput = {
  name: string;
  description: string;
  maxLevel: number;
  /** Planned level in the planner (0 = not learned). */
  level: number;
  iconUrl?: string | null;
  /** Server per-level values: one number for every level, or one per level. */
  sp?: number | number[];
  cast?: number | number[];
  range?: number | number[];
  requires: { name: string; level: number }[];
  unlocks: { name: string; level: number }[];
};

const VALUE_TOKEN = String.raw`[+\-]?\d+(?:\.\d+)?%?`;
const LV_LINE = /^\[Lv\.?\s*(\d+)\]\s*:?\s*(.*)$/i;
const HEADER_PREFIX = /^(Requirement|Skill Form|Type|Target|Max Level|Description|Comments?|Element)\s*:/i;
// A short "Word:" line after the level dumps ("Spurt:", "Soul Link:") starts a
// trailing paragraph, not more level text.
const HEADING_LINE = /^[A-Za-z][A-Za-z '/]{0,18}:/;
// A bracketed name that is not a rank ("[Break Fall]:") annotates a modifier.
const NAMED_LINE = /^\[([A-Za-z][A-Za-z0-9 '/-]{0,23})\]\s*:?\s*(.*)$/;
// Longest value that still reads in a grid cell.
const GRID_VALUE_MAX = 9;
// A labelled part this short reads as one "label  text" row.
const COMPACT_PART_MAX = 70;

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function cleanLine(raw: string): string {
  return String(raw || "")
    .replace(/\r/g, "")
    .replace(/\\n/g, " ")
    .replace(/\^[a-fA-F0-9]{6}/g, "")
    // A class id before a header ("4190Requirement: ...") marks a one-class line.
    .replace(/^\d{1,5}(?=(?:Requirement|Skill Form|Type|Target|Description|\[))/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function formatReadable(value: string): string {
  const plain = cleanLine(value);
  if (!plain) return "";
  return escapeHtml(plain).replace(/(\d+(?:\.\d+)?%?)/g, '<span class="sd-num">$1</span>');
}

function humanize(value: string): string {
  return String(value || "")
    .replace(/\b1 Character\b/gi, "Single target")
    .replace(/\bCaster\b/gi, "Self")
    .replace(/\bSkill Form\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function splitTopLevelCommas(text: string): string[] {
  const parts: string[] = [];
  let buf = "";
  let depth = 0;
  for (const ch of text) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      parts.push(buf.trim());
      buf = "";
      continue;
    }
    buf += ch;
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts;
}

function cleanLabel(label: string): string {
  let s = String(label || "")
    .replace(/[:.\s]+$/g, "")
    .replace(/^\s+/, "");
  s = s.replace(/\bdamage\b/i, "Damage");
  s = s.replace(/\bhit\b/i, "HIT");
  s = s.replace(/\bsuccess\b/i, "Success");
  s = s.replace(/\bduration\b/i, "Duration");
  // "100 SP" in the text and the server's SP table merge into one row.
  if (/^sp$/i.test(s)) return "SP Cost";
  if (!s) return "Effect";
  return s.replace(/^\w/, (c) => c.toUpperCase());
}

type LevelStat = { label: string; value: string; prose?: boolean };

function parseLevelChunk(chunk: string): LevelStat | null {
  const text = chunk.trim();
  if (!text) return null;

  let m = text.match(new RegExp(`^(${VALUE_TOKEN}(?:\\s*\\+\\s*\\([^)]+\\))?)\\s+(.+)$`));
  if (m && /[a-zA-Z]/.test(m[2]!)) {
    // A label longer than a couple of words is a sentence; it would crush the grid.
    if (m[2]!.trim().length >= 24) return { label: "Effect", value: text, prose: true };
    // "6 seconds cast time": the unit belongs to the value, so the row is "Cast Time"
    // and merges with the server's cast row.
    const unit = m[2]!.match(/^(?:seconds?|secs?)\s+(.+)$/i);
    if (unit && !m[1]!.endsWith("%")) return { label: cleanLabel(unit[1]!), value: `${m[1]}s` };
    // A bare unit ("30 seconds", "5 minutes") is a duration.
    if (!m[1]!.endsWith("%")) {
      const bare = m[2]!.trim().replace(/\.$/, "");
      if (/^(?:seconds?|secs?)$/i.test(bare)) return { label: "Duration", value: `${m[1]}s` };
      if (/^(?:minutes?|mins?)$/i.test(bare)) return { label: "Duration", value: `${m[1]} min` };
    }
    // A label that carries its own numbers ("+15 ATK", "+[(1*MaxHP)/500]") differs at
    // every level and would make one row per level: keep the line whole instead.
    if (/[\d\[\]]|^\//.test(m[2]!)) return { label: "Effect", value: text, prose: true };
    return { label: cleanLabel(m[2]!), value: m[1]! };
  }
  m = text.match(/^([\d.]+)\s+(sec(?:onds?)?(?:\s+duration)?)$/i);
  if (m) return { label: "Duration", value: `${m[1]} sec` };
  m = text.match(/^lasts\s+(.+)$/i);
  if (m) return { label: "Duration", value: m[1]! };
  m = text.match(new RegExp(`^([A-Za-z][A-Za-z0-9 ./%+-]*?)\\s*:?\\s+(${VALUE_TOKEN}\\b.*)$`));
  if (m && m[1]!.trim().length < 24) return { label: cleanLabel(m[1]!), value: m[2]!.trim() };
  m = text.match(new RegExp(`^([A-Za-z][A-Za-z ]*?)(${VALUE_TOKEN}\\s*.*)$`));
  if (m && m[1]!.trim() && m[1]!.trim().length < 24) return { label: cleanLabel(m[1]!), value: m[2]!.trim() };
  return { label: "Effect", value: text, prose: true };
}

function looksLikeCode(line: string): boolean {
  if (!line) return true;
  if (/^[\d\s\\/^#._-]+$/.test(line)) return true;
  if (/SKID\.|[A-Z]{2,}_[A-Z0-9_]+/.test(line) && line.length < 40) return true;
  return false;
}

function namesMatch(a: string, b: string): boolean {
  const norm = (v: string) => String(v || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  const collapse = (v: string) => v.replace(/(.)\1+/g, "$1");
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  if (x === y || x.startsWith(y) || y.startsWith(x)) return true;
  return collapse(x) === collapse(y);
}

function looksLikeReqPart(line: string): boolean {
  return /^[A-Za-z][A-Za-z0-9 '\/+-]*(?:\s+\d+)?[.,]?$/.test(line) && /\d/.test(line);
}

type Meta = { form: string; type: string; target: string; element: string; range: string; requirement: string[] };
type Section = { label: string; text: string; items: { name: string; text: string }[]; after: boolean };
type Parsed = {
  meta: Meta;
  description: string;
  comments: string;
  levels: { lv: number; text: string }[];
  sections: Section[];
};

function parseSkillText(raw: string, skillName: string): Parsed {
  // A blank line ends a paragraph, so a "Word:" line after one starts a new part.
  const lines: string[] = [];
  const afterBlank = new Set<number>();
  let blank = false;
  String(raw || "")
    .replace(/\r\n/g, "\n")
    .replace(/\\n/g, "\n")
    .split("\n")
    .map(cleanLine)
    .forEach((line) => {
      if (!line) {
        blank = true;
        return;
      }
      if (blank) afterBlank.add(lines.length);
      blank = false;
      lines.push(line);
    });

  const meta: Meta = { form: "", type: "", target: "", element: "", range: "", requirement: [] };
  const descLines: string[] = [];
  const commentLines: string[] = [];
  const levels: { lv: number; text: string }[] = [];
  type Part = { label: string; text: string[]; items: { name: string; text: string }[]; after: boolean; inItem: boolean };
  const sections: Part[] = [];
  let section: "head" | "levels" | "desc" | "comments" = "head";
  let currentLevel: { lv: number; text: string } | null = null;
  let skippedName = false;

  const openSection = (label: string): Part => {
    const part: Part = { label, text: [], items: [], after: levels.length > 0, inItem: false };
    sections.push(part);
    return part;
  };
  const lastSection = () => sections[sections.length - 1] || openSection("");
  const sentenceEnded = () => {
    const part = sections[sections.length - 1];
    if (!part) return true;
    const last = part.inItem ? part.items[part.items.length - 1]?.text : part.text[part.text.length - 1];
    return !last || /[.!?)]$/.test(last);
  };
  let lineIndex = -1;
  const pushDesc = (text: string) => {
    descLines.push(text);
    const item = text.match(/^[-•]\s+(.*)$/);
    if (item) {
      const part = lastSection();
      const row = item[1]!.match(/^([^:]{1,28}):\s*(.*)$/);
      part.items.push(row ? { name: row[1]!, text: row[2]! } : { name: "", text: item[1]! });
      part.inItem = true;
      return;
    }
    const titleHead =
      sections.length && sections[sections.length - 1]!.label && /^[A-Z][a-z']*(?: [A-Z][a-z']*)*:/.test(text);
    const head = afterBlank.has(lineIndex) || titleHead || sentenceEnded() ? text.match(HEADING_LINE) : null;
    if (head) {
      const part = openSection(head[0].slice(0, -1).trim());
      const rest = text.slice(head[0].length).trim();
      if (rest) part.text.push(rest);
      return;
    }
    const part = lastSection();
    if (part.inItem && part.items.length) {
      const row = part.items[part.items.length - 1]!;
      row.text = `${row.text} ${text}`.trim();
      return;
    }
    part.text.push(text);
  };

  for (const plain of lines) {
    lineIndex++;
    const lvMatch = plain.match(LV_LINE);
    if (lvMatch) {
      section = "levels";
      currentLevel = { lv: parseInt(lvMatch[1]!, 10), text: lvMatch[2] || "" };
      levels.push(currentLevel);
      continue;
    }

    const named = plain.match(NAMED_LINE);
    if (named && !/^Lv\b/i.test(named[1]!)) {
      section = "desc";
      currentLevel = null;
      descLines.push(named[2] ? `${named[1]}: ${named[2]}` : `${named[1]}:`);
      const part = openSection(named[1]!);
      if (named[2]) part.text.push(named[2]);
      continue;
    }

    if (/^Comments?\s*:/i.test(plain)) {
      section = "comments";
      currentLevel = null;
      const rest = plain.replace(/^Comments?\s*:\s*/i, "");
      if (rest && !looksLikeCode(rest)) commentLines.push(rest);
      continue;
    }

    if (section === "levels" && currentLevel && !HEADER_PREFIX.test(plain)) {
      // Trailing paragraphs ("Spurt: STR +10. ...") belong to the description.
      if (HEADING_LINE.test(plain) || /^[-•]\s/.test(plain)) {
        section = "desc";
        currentLevel = null;
        pushDesc(plain);
        continue;
      }
      currentLevel.text = `${currentLevel.text} ${plain}`.trim();
      continue;
    }

    if (section === "comments") {
      if (!looksLikeCode(plain)) commentLines.push(plain);
      continue;
    }

    const req = plain.match(/^Requirement:\s*(.*)/i);
    if (req) {
      if (req[1] && !looksLikeCode(req[1])) meta.requirement.push(req[1]);
      continue;
    }

    if (
      section === "head" &&
      meta.requirement.length &&
      !HEADER_PREFIX.test(plain) &&
      (looksLikeReqPart(plain) || /,\s*$/.test(meta.requirement[meta.requirement.length - 1]!))
    ) {
      const last = meta.requirement.length - 1;
      meta.requirement[last] = `${meta.requirement[last]} ${plain}`.replace(/\s+/g, " ").trim();
      continue;
    }

    if (/^Max Level:/i.test(plain)) continue;
    const form = plain.match(/^Skill Form:\s*(.*)/i);
    if (form) {
      meta.form = humanize(form[1]!);
      continue;
    }
    const type = plain.match(/^Type:\s*(.*)/i);
    if (type) {
      meta.type = humanize(type[1]!);
      continue;
    }
    const target = plain.match(/^Target:\s*(.*)/i);
    if (target) {
      meta.target = humanize(target[1]!);
      continue;
    }
    const element = plain.match(/^Element:\s*(.*)/i);
    if (element) {
      meta.element = humanize(element[1]!);
      continue;
    }
    const area = section === "head" ? plain.match(/^Range:\s*(.*)/i) : null;
    if (area) {
      meta.range = area[1]!;
      continue;
    }

    const desc = plain.match(/^Description:\s*(.*)/i);
    if (desc) {
      section = "desc";
      if (desc[1] && !looksLikeCode(desc[1])) pushDesc(desc[1]);
      continue;
    }

    if (section === "head" && !skippedName && !HEADER_PREFIX.test(plain) && !plain.includes(":")) {
      if (!skillName || namesMatch(plain, skillName) || plain.length < 48) {
        skippedName = true;
        continue;
      }
    }

    if (looksLikeCode(plain) || HEADER_PREFIX.test(plain)) continue;

    section = "desc";
    pushDesc(plain);
  }

  const join = (list: string[]) => list.join(" ").replace(/\s+/g, " ").trim();
  return {
    meta,
    description: join(descLines),
    comments: join(commentLines),
    levels,
    sections: sections
      .map((part) => ({
        label: part.label,
        text: join(part.text),
        items: part.items.map((row) => ({ name: row.name.trim(), text: join([row.text]) })),
        after: part.after,
      }))
      .filter((part) => part.text || part.items.length),
  };
}

/** Sentences of `text` not already in `against`: the comments often restate the description. */
function novelSentences(text: string, against: string): string {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const split = (v: string) =>
    String(v || "")
      .split(/(?<=[.!?])\s+(?=[A-Z0-9])/)
      .map((s) => s.trim())
      .filter(Boolean);
  const seen = new Set(split(against).map(norm));
  const out: string[] = [];
  for (const sentence of split(text)) {
    const key = norm(sentence);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(sentence);
  }
  return out.join(" ");
}

function perLevel(field: number | number[] | undefined, count: number): number[] | null {
  if (field == null) return null;
  const src = Array.isArray(field) ? field : [field];
  if (!src.length) return null;
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(src[Math.min(i, src.length - 1)]!);
  return out;
}

function atLevel(field: number | number[] | undefined, level: number): number | null {
  const v = perLevel(field, Math.max(1, level));
  return v ? v[v.length - 1]! : null;
}

/** Milliseconds as a short seconds value: 1500 -> "1.5s". */
function formatSeconds(ms: number): string {
  const n = Number(ms) || 0;
  if (n <= 0) return "0";
  return `${Number((n / 1000).toFixed(2))}s`;
}

/** Server ranges: negative = weapon range ("-1" melee), 1 = melee. */
function formatRange(n: number): string {
  const cells = Math.abs(n);
  return cells <= 1 ? "Melee" : String(cells);
}

type ScaleRow = { label: string; values: (string | null)[] };

function collectScaleRows(parsed: Parsed, input: SkillTooltipInput): ScaleRow[] {
  const maxLv = input.maxLevel || parsed.levels.reduce((m, row) => Math.max(m, row.lv), 0) || 0;
  const rows: ScaleRow[] = [];
  // "Petal" / "Petals", "HIT" / "HITs" are one row.
  const keyOf = (label: string) => label.toLowerCase().replace(/s$/, "");
  const byLabel = new Map<string, number>();
  const indexByLabel = {
    get: (label: string) => byLabel.get(keyOf(label)),
    has: (label: string) => byLabel.has(keyOf(label)),
    set: (label: string, i: number) => byLabel.set(keyOf(label), i),
  };
  const fromServer = new Set<number>();

  const addRow = (label: string, values: (string | null)[], server = false) => {
    if (!label) return;
    const existing = indexByLabel.get(label.toLowerCase());
    if (existing != null) {
      // The server's numbers win over the text's.
      if (fromServer.has(existing)) return;
      values.forEach((value, i) => {
        if (value != null && value !== "" && rows[existing]!.values[i] == null) rows[existing]!.values[i] = value;
      });
      return;
    }
    indexByLabel.set(label.toLowerCase(), rows.length);
    if (server) fromServer.add(rows.length);
    rows.push({ label, values });
  };

  const sp = perLevel(input.sp, maxLv);
  if (sp && sp.some((n) => n > 0)) addRow("SP Cost", sp.map((n) => (n ? String(n) : null)), true);
  const cast = perLevel(input.cast, maxLv);
  if (cast && cast.some((n) => n > 0)) addRow("Cast Time", cast.map(formatSeconds), true);
  const range = perLevel(input.range, maxLv);
  if (range && new Set(range.map((n) => Math.abs(n))).size > 1) addRow("Range", range.map(formatRange), true);

  const proseByLevel: (string | null)[] = [];
  for (const entry of parsed.levels) {
    const stats = splitTopLevelCommas(entry.text).map(parseLevelChunk).filter((s): s is LevelStat => !!s);
    const numeric = stats.filter((s) => !s.prose);
    const prose = stats.filter((s) => s.prose);
    for (const stat of numeric) {
      if (!indexByLabel.has(stat.label.toLowerCase())) addRow(stat.label, Array(maxLv).fill(null));
      const idx = indexByLabel.get(stat.label.toLowerCase());
      if (idx != null && !fromServer.has(idx) && entry.lv >= 1 && entry.lv <= maxLv) rows[idx]!.values[entry.lv - 1] = stat.value;
    }
    if (prose.length) proseByLevel[entry.lv - 1] = prose.map((s) => s.value).join(", ");
    else if (!numeric.length && entry.text) proseByLevel[entry.lv - 1] = entry.text;
  }
  if (proseByLevel.some(Boolean)) {
    const padded: (string | null)[] = [];
    for (let i = 0; i < maxLv; i++) padded[i] = proseByLevel[i] || null;
    addRow("Effect", padded);
  }

  return rows.filter((row) => row.values.some((v) => v != null && v !== ""));
}

function renderScaleHead(count: number, current: number): string {
  const cells: string[] = [];
  for (let i = 1; i <= count; i++) {
    cells.push(`<span class="sd-scale-val sd-scale-lv${i === current ? " is-current" : ""}">${i}</span>`);
  }
  return `<div class="sd-scale sd-scale-head"><span class="sd-scale-label"></span>${cells.join("")}</div>`;
}

function renderScaleRow(row: ScaleRow, current: number): string {
  const cells = row.values.map((value, i) => {
    const text = value == null || value === "" ? "-" : escapeHtml(cleanLine(value));
    return `<span class="sd-scale-val${current > 0 && i === current - 1 ? " is-current" : ""}">${text}</span>`;
  });
  return `<div class="sd-scale"><span class="sd-scale-label">${escapeHtml(row.label)}</span>${cells.join("")}</div>`;
}

function levelLineClass(current: boolean, unlocked: boolean): string {
  return `sd-level-line${current ? " is-current" : unlocked ? " is-unlocked" : ""}`;
}

/** Values too long for grid cells, as per-level lines; equal runs collapse to "Lv 2-5". */
function renderScaleStack(row: ScaleRow, current: number): string {
  const lines: string[] = [];
  let start = -1;
  const flush = (end: number) => {
    if (start < 0) return;
    const value = row.values[start]!;
    const label = start === end ? `Lv ${start + 1}` : `Lv ${start + 1}–${end + 1}`;
    const isCurrent = current > 0 && current - 1 >= start && current - 1 <= end;
    const unlocked = current > 0 && start < current;
    lines.push(
      `<div class="${levelLineClass(isCurrent, unlocked)}"><span class="sd-level-num">${label}</span>` +
        `<span class="sd-level-text">${formatReadable(value)}</span></div>`,
    );
    start = -1;
  };
  for (let i = 0; i < row.values.length; i++) {
    const value = row.values[i];
    if (value == null || value === "") {
      flush(i - 1);
      continue;
    }
    if (start >= 0 && value !== row.values[start]) flush(i - 1);
    if (start < 0) start = i;
  }
  flush(row.values.length - 1);
  const heading = row.label && row.label !== "Effect" ? `<div class="sd-stack-label">${escapeHtml(row.label)}</div>` : "";
  return `<div class="sd-scale-stack">${heading}${lines.join("")}</div>`;
}

function renderLevelList(levels: { lv: number; text: string }[], current: number): string {
  return levels
    .slice()
    .sort((a, b) => a.lv - b.lv)
    .map(
      (entry) =>
        `<div class="${levelLineClass(current > 0 && entry.lv === current, current > 0 && entry.lv <= current)}">` +
        `<span class="sd-level-num">Lv ${entry.lv}</span><span class="sd-level-text">${formatReadable(entry.text)}</span></div>`,
    )
    .join("");
}

function renderRows(items: { name: string; text: string }[]): string {
  if (!items.length) return "";
  const rows = items
    .map((row) =>
      row.name
        ? `<span class="sd-sect-name">${escapeHtml(row.name)}</span><span class="sd-sect-value">${formatReadable(row.text)}</span>`
        : `<span class="sd-sect-value is-wide">${formatReadable(row.text)}</span>`,
    )
    .join("");
  return `<div class="sd-sect-rows">${rows}</div>`;
}

function renderSections(parts: Section[]): string {
  const blocks: string[] = [];
  let run: { name: string; text: string }[] = [];
  const flush = () => {
    if (run.length) {
      blocks.push(`<div class="sd-sect">${renderRows(run)}</div>`);
      run = [];
    }
  };
  for (const part of parts) {
    if (part.label && !part.items.length && part.text.length <= COMPACT_PART_MAX) {
      run.push({ name: part.label, text: part.text });
      continue;
    }
    flush();
    const label = part.label ? `<div class="sd-sect-label">${escapeHtml(part.label)}</div>` : "";
    const text = part.text ? `<div class="sd-sect-text">${formatReadable(part.text)}</div>` : "";
    blocks.push(`<div class="sd-sect">${label}${text}${renderRows(part.items)}</div>`);
  }
  flush();
  return blocks.join("");
}

function renderFacts(meta: Meta): string {
  const rows: [string, string][] = [];
  const typeBits = [meta.form, meta.type].filter(Boolean);
  if (typeBits.length) rows.push(["Type", typeBits.join(" · ")]);
  if (meta.target) rows.push(["Target", meta.target]);
  if (meta.element) rows.push(["Element", meta.element]);
  if (meta.range) rows.push(["Area", meta.range]);
  return rows
    .map(
      ([label, value]) =>
        `<div class="sd-fact"><span class="sd-fact-label">${escapeHtml(label)}</span><span class="sd-fact-value">${escapeHtml(value)}</span></div>`,
    )
    .join("");
}

function skillList(list: { name: string; level: number }[], unlocks = false): string {
  // "Musical Lesson 3" needed; "Encore at 1" for what this skill opens up.
  return list.map((s) => escapeHtml(unlocks ? `${s.name} at ${s.level}` : `${s.name} ${s.level}`)).join(", ");
}

export function skillTooltipHtml(input: SkillTooltipInput): string {
  const parsed = parseSkillText(input.description, input.name);
  const level = Math.max(0, Math.min(input.level || 0, input.maxLevel));
  const shown = level || 1;

  // Header: icon, name, SP and cast at the planned level, range, planned / max.
  const sp = atLevel(input.sp, shown);
  const cast = atLevel(input.cast, shown);
  const range = atLevel(input.range, shown);
  const meta = [sp ? `${sp} SP` : "", cast ? `${formatSeconds(cast)} cast` : ""].filter(Boolean);
  const icon = input.iconUrl
    ? `<img class="sd-icon" src="${escapeHtml(input.iconUrl)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()" />`
    : "";
  const head = `<div class="sd-head">
      ${icon}
      <div class="sd-title">
        <span class="sd-name">${escapeHtml(input.name)}</span>
        ${meta.length ? `<span class="sd-meta">${meta.map(escapeHtml).join(" · ")}</span>` : ""}
      </div>
      <div class="sd-head-right">
        <span class="sd-lv">Lv <strong>${level}</strong> / ${input.maxLevel}</span>
        ${range != null ? `<span class="sd-range">${range === 1 || range === -1 ? "Melee" : `${Math.abs(range)} cells`}</span>` : ""}
      </div>
    </div>`;

  // The opening unlabelled part is the main text; labelled parts get blocks under it.
  const parts = parsed.sections;
  const lead = parts.length && !parts[0]!.label && !parts[0]!.items.length && !parts[0]!.after ? parts[0]! : null;
  const mainText = lead ? lead.text : parts.length ? "" : parsed.comments;
  const extraText = parsed.description ? novelSentences(parsed.comments, parsed.description) : "";

  const requires = input.requires.length
    ? `<div class="sd-req"><span class="sd-block-label">Requires</span><span>${skillList(input.requires)}</span></div>`
    : "";
  const unlocks = input.unlocks.length
    ? `<div class="sd-req sd-req--unlocks"><span class="sd-block-label">Unlocks</span><span>${skillList(input.unlocks, true)}</span></div>`
    : "";

  // Basic Skill lists one unlock per level; everything else gets the grid.
  let scales = "";
  if (/^basic skill$/i.test(input.name)) {
    const list = renderLevelList(parsed.levels, level);
    if (list) scales = `<div class="sd-level-list">${list}</div>`;
  } else {
    const rows = collectScaleRows(parsed, input);
    const ranks = rows.reduce((max, row) => Math.max(max, row.values.length), 0);
    rows.forEach((row) => {
      while (row.values.length < ranks) row.values.push(null);
    });
    // Short values line up as columns; longer ones become stacked per-level lines.
    const cellBudget = ranks >= 8 ? 5 : ranks >= 6 ? 7 : GRID_VALUE_MAX;
    const gridRows = rows.filter((row) => row.values.every((v) => v == null || cleanLine(v).length <= cellBudget));
    const stackRows = rows.filter((row) => !gridRows.includes(row));
    if (rows.length) {
      const cls = ["sd-scales", ranks >= 8 ? "is-dense" : "", ranks <= 2 ? "is-sparse" : ""].filter(Boolean).join(" ");
      scales =
        `<div class="${cls}" style="--sd-ranks:${Math.max(1, ranks)}">` +
        (gridRows.length ? renderScaleHead(ranks, level) + gridRows.map((r) => renderScaleRow(r, level)).join("") : "") +
        stackRows.map((r) => renderScaleStack(r, level)).join("") +
        `</div>`;
    }
  }

  const notes = extraText
    ? `<details class="sd-notes"><summary>More notes</summary><div class="sd-notes-text">${formatReadable(extraText)}</div></details>`
    : "";

  return `<div class="sd">
    ${head}
    <div class="sd-body">
      ${(() => {
        const facts = renderFacts(parsed.meta);
        return facts ? `<div class="sd-facts">${facts}</div>` : "";
      })()}
      ${mainText ? `<div class="sd-desc">${formatReadable(mainText)}</div>` : ""}
      ${(() => {
        const sects = renderSections(parts.filter((p) => p !== lead));
        return sects ? `<div class="sd-sects">${sects}</div>` : "";
      })()}
      ${notes}
      ${requires}
      ${unlocks}
      ${scales}
    </div>
  </div>`;
}
