import plannerJson from "./data/skill-planner.json" with { type: "json" };

export type SkillColumn = number;

/** Client SKILL_TREEVIEW_FOR_JOB uses a 7-wide grid (see Novice slots 0, 7, 14). */
export const GRID_COLS = 7;

export interface SkillDef {
  id: string;
  name: string;
  column: SkillColumn;
  row: number;
  maxLevel: number;
  description: string;
  skidKey?: string;
  skidId?: number | null;
  /** Client skilltree slot index → row/col via GRID_COLS (7). */
  gridIndex: number;
  gridCol: number;
  gridRow: number;
  /** True when this skill belongs to the transcendent column (merged into second-class panel in the UI). */
  transcendent?: boolean;
}

export interface PrereqEdge {
  fromId: string;
  toId: string;
  requiredLevel: number;
}

export interface JobColumn {
  title: string;
  skillIds: string[];
}

export interface JobData {
  key: string;
  label: string;
  columns: JobColumn[];
  skills: Record<
    string,
    {
      id: string;
      skidKey: string;
      skidId: number | null;
      name: string;
      maxLevel: number;
      description: string;
      gridIndex?: number;
    }
  >;
  edges: PrereqEdge[];
}

const DATA = plannerJson as {
  generated: string;
  source: string;
  jobs: Record<string, JobData>;
};

export const PLANNER_META = {
  generated: DATA.generated,
  source: DATA.source,
} as const;

export function listJobs(): { key: string; label: string }[] {
  return Object.values(DATA.jobs).map((j) => ({ key: j.key, label: j.label }));
}

export function isQuestColumnTitle(title: string): boolean {
  return /quest|special/i.test(title);
}

/** Novice → expanded (SN / TK / Ninja / GS) → standard 1st / 2nd / transcendent lines. */
const EXPANDED_CLASS_KEYS = new Set([
  "JT_SUPERNOVICE",
  "JT_TAEKWON",
  "JT_STAR",
  "JT_LINKER",
  "JT_NINJA",
  "JT_GUNSLINGER",
]);

/** Row in the class picker tier (from number of non-quest skill columns). */
export function jobPickerGroup(
  jobKey: string,
): "novice" | "expandedClass" | "firstClass" | "secondClass" | "transcendent" {
  if (jobKey === "JT_NOVICE") return "novice";
  if (EXPANDED_CLASS_KEYS.has(jobKey)) return "expandedClass";
  const j = DATA.jobs[jobKey];
  if (!j) return "secondClass";
  const n = j.columns.filter((c) => !isQuestColumnTitle(c.title)).length;
  if (n >= 3) return "transcendent";
  if (n === 2) return "secondClass";
  return "firstClass";
}

/** First class: one row of 6 in a 7-col grid (last column empty). */
const EXPANDED_CLASS_PICKER_ORDER = [
  "JT_SUPERNOVICE",
  "JT_TAEKWON",
  "JT_STAR",
  "JT_LINKER",
  "JT_NINJA",
  "JT_GUNSLINGER",
] as const;

/** Taekwon Master + Soul Linker: second row under Taekwon Kid in the expanded picker. */
const EXPANDED_TAEKWON_ADVANCED_KEYS = new Set(["JT_STAR", "JT_LINKER"]);

const FIRST_CLASS_PICKER_ORDER = [
  "JT_SWORDMAN",
  "JT_MAGICIAN",
  "JT_MERCHANT",
  "JT_ACOLYTE",
  "JT_THIEF",
  "JT_ARCHER",
] as const;

/**
 * Second class: two rows in one block — row 1 (6) then row 2 (7) so Crusader aligns under Knight.
 * Rendered as separate grids so a 7-wide layout does not pull the 7th job onto row 1.
 */
const SECOND_CLASS_PICKER_ROWS: readonly (readonly string[])[] = [
  [
    "JT_KNIGHT",
    "JT_WIZARD",
    "JT_BLACKSMITH",
    "JT_PRIEST",
    "JT_ASSASSIN",
    "JT_HUNTER",
  ],
  [
    "JT_CRUSADER",
    "JT_SAGE",
    "JT_ALCHEMIST",
    "JT_MONK",
    "JT_ROGUE",
    "JT_BARD",
    "JT_DANCER",
  ],
];

/**
 * Transcendent second jobs: same 6 + 7 row layout as base second class
 * (Clown | Gypsy joined in UI like Bard | Dancer).
 */
const TRANSCENDENT_PICKER_ROWS: readonly (readonly string[])[] = [
  [
    "JT_KNIGHT_H",
    "JT_WIZARD_H",
    "JT_BLACKSMITH_H",
    "JT_PRIEST_H",
    "JT_ASSASSIN_H",
    "JT_HUNTER_H",
  ],
  [
    "JT_CRUSADER_H",
    "JT_SAGE_H",
    "JT_ALCHEMIST_H",
    "JT_MONK_H",
    "JT_ROGUE_H",
    "JT_BARD_H",
    "JT_DANCER_H",
  ],
];

function sortJobsByKeyOrder(
  jobs: { key: string; label: string }[],
  order: readonly string[],
): { key: string; label: string }[] {
  const rank = (k: string) => {
    const i = order.indexOf(k);
    return i === -1 ? 999 : i;
  };
  return [...jobs].sort((a, b) => {
    const d = rank(a.key) - rank(b.key);
    return d !== 0 ? d : a.label.localeCompare(b.label);
  });
}

export type JobPickerSection = {
  heading: string;
  /** Single grid (Novice / first class). */
  jobs?: { key: string; label: string }[];
  /** Stacked grids (second class / transcendent rows). */
  jobRows?: { key: string; label: string }[][];
  /**
   * Expanded tab: align row 2 (Taekwon Master + Soul Linker) under Taekwon Kid via a 7-column grid.
   */
  jobRowsLayout?: "expandedTaekwon";
};

function sectionHasJobs(g: JobPickerSection): boolean {
  return (
    (g.jobs != null && g.jobs.length > 0) ||
    (g.jobRows != null && g.jobRows.some((r) => r.length > 0))
  );
}

function jobKeysForPickerSections(sections: JobPickerSection[]): string[] {
  const keys: string[] = [];
  for (const s of sections) {
    if (s.jobs) for (const j of s.jobs) keys.push(j.key);
    if (s.jobRows)
      for (const row of s.jobRows) for (const j of row) if (j) keys.push(j.key);
  }
  return keys;
}

export type JobPickerTabDef = {
  id: string;
  label: string;
  /** Subsections inside this tab (Novice / First class / …). */
  sections: JobPickerSection[];
  /** Job keys in this tab (used to open the tab that contains the current class). */
  jobKeys: readonly string[];
};

/**
 * Class picker modal: three tabs — base (novice + 1st + 2nd), transcendent, expanded classes.
 * Tabs with no content are omitted.
 */
export function listJobPickerTabs(): JobPickerTabDef[] {
  const all = listJobs();
  const novice = all.filter((j) => jobPickerGroup(j.key) === "novice");
  const expandedClass = sortJobsByKeyOrder(
    all.filter((j) => jobPickerGroup(j.key) === "expandedClass"),
    EXPANDED_CLASS_PICKER_ORDER,
  );
  const expandedTkAdvancedRow = expandedClass.filter((j) =>
    EXPANDED_TAEKWON_ADVANCED_KEYS.has(j.key),
  );
  const expandedTopRow = expandedClass.filter(
    (j) => !EXPANDED_TAEKWON_ADVANCED_KEYS.has(j.key),
  );
  const expandedPickerRows: { key: string; label: string }[][] = [
    expandedTopRow,
  ];
  if (expandedTkAdvancedRow.length > 0)
    expandedPickerRows.push(expandedTkAdvancedRow);
  const firstClass = sortJobsByKeyOrder(
    all.filter((j) => jobPickerGroup(j.key) === "firstClass"),
    FIRST_CLASS_PICKER_ORDER,
  );
  const secondByKey = new Map(
    all.filter((j) => jobPickerGroup(j.key) === "secondClass").map((j) => [j.key, j]),
  );
  const secondRows = SECOND_CLASS_PICKER_ROWS.map((row) =>
    row.map((k) => secondByKey.get(k)).filter((j): j is (typeof all)[number] => j != null),
  );
  const transByKey = new Map(
    all.filter((j) => jobPickerGroup(j.key) === "transcendent").map((j) => [j.key, j]),
  );
  const transRows = TRANSCENDENT_PICKER_ROWS.map((row) =>
    row.map((k) => transByKey.get(k)).filter((j): j is (typeof all)[number] => j != null),
  );

  const baseSections: JobPickerSection[] = [
    { heading: "Novice", jobs: novice },
    { heading: "First class", jobs: firstClass },
    { heading: "Second class", jobRows: secondRows },
  ].filter(sectionHasJobs);

  const transcendentSections: JobPickerSection[] = [
    { heading: "Transcendent", jobRows: transRows },
  ].filter(sectionHasJobs);

  const expandedSections: JobPickerSection[] = [
    {
      heading: "Expanded class",
      jobRows: expandedPickerRows,
      ...(expandedTkAdvancedRow.length > 0
        ? { jobRowsLayout: "expandedTaekwon" as const }
        : {}),
    },
  ].filter(sectionHasJobs);

  const tabs: JobPickerTabDef[] = [
    {
      id: "base",
      label: "Base classes",
      sections: baseSections,
      jobKeys: jobKeysForPickerSections(baseSections),
    },
    {
      id: "transcendent",
      label: "Transcendent",
      sections: transcendentSections,
      jobKeys: jobKeysForPickerSections(transcendentSections),
    },
    {
      id: "expanded",
      label: "Expanded",
      sections: expandedSections,
      jobKeys: jobKeysForPickerSections(expandedSections),
    },
  ];

  return tabs.filter((t) => t.sections.length > 0);
}

export function getJobData(jobKey: string): JobData | undefined {
  return DATA.jobs[jobKey];
}

/** First merged column + second job + transcendent (three content columns; transcendent merges into second in UI). */
export function shouldMergeTranscendentIntoSecondPanel(job: JobData): boolean {
  const q = job.columns.findIndex((c) => isQuestColumnTitle(c.title));
  const content = job.columns.map((_, i) => i).filter((i) => q < 0 || i !== q);
  return content.length === 3;
}

export function buildSkillsForJob(jobKey: string): SkillDef[] {
  const j = DATA.jobs[jobKey];
  if (!j) return [];
  const questCol = j.columns.findIndex((c) => isQuestColumnTitle(c.title));
  const contentCols = j.columns.map((_, i) => i).filter((i) => questCol < 0 || i !== questCol);
  const transcendentCol =
    contentCols.length === 3 ? contentCols[2]! : -1;
  const out: SkillDef[] = [];
  j.columns.forEach((col, column) => {
    const quest = isQuestColumnTitle(col.title);
    col.skillIds.forEach((id, row) => {
      const s = j.skills[id];
      if (!s) return;
      const gi = s.gridIndex ?? 0;
      let gridCol: number;
      let gridRow: number;
      if (quest) {
        gridCol = 1;
        gridRow = row + 1;
      } else {
        gridCol = (gi % GRID_COLS) + 1;
        gridRow = Math.floor(gi / GRID_COLS) + 1;
      }
      out.push({
        id: s.id,
        name: s.name,
        column,
        row,
        maxLevel: s.maxLevel,
        description: s.description,
        skidKey: s.skidKey,
        skidId: s.skidId,
        gridIndex: gi,
        gridCol,
        gridRow,
        transcendent: !quest && column === transcendentCol,
      });
    });
  });
  return out;
}

export function getEdgesForJob(jobKey: string): PrereqEdge[] {
  return DATA.jobs[jobKey]?.edges ?? [];
}

export function makeSkillMap(skills: SkillDef[]): Map<string, SkillDef> {
  return new Map(skills.map((s) => [s.id, s]));
}
