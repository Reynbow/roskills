import plannerJson from "./data/skill-planner.json" with { type: "json" };
import plannerRenewalJson from "./data/skill-planner-renewal.json" with { type: "json" };

export type SkillColumn = number;

export type GameMode = "pre" | "renewal";

let activeGameMode: GameMode = "pre";

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

type PlannerRoot = {
  generated: string;
  source: string;
  gameMode?: string;
  jobs: Record<string, JobData>;
};

function plannerRoot(): PlannerRoot {
  return (activeGameMode === "renewal" ? plannerRenewalJson : plannerJson) as PlannerRoot;
}

const ADVANCED_SUMMONER_KEY = "JT_ADVANCED_SUMMONER";
const ADVANCED_SUMMONER_LABEL = "Advanced Summoner";

/**
 * Renewal Summoner (not Advanced): in-game tree stops after Power of Sea/Land/Life; everything from
 * Grooming onward is the Advanced Summoner continuation (incl. capstone Spirit of * passives).
 * Matches `skilltreeview.lub` slot layout (grid indices ≥ 43).
 */
function isRenewalSummonerBaseHiddenSkill(sk: { gridIndex?: number }): boolean {
  return (sk.gridIndex ?? 0) >= 43;
}

function advancedSummonerJobData(): JobData | undefined {
  if (activeGameMode !== "renewal") return undefined;
  const summoner = plannerRoot().jobs.JT_DO_SUMMONER;
  if (!summoner) return undefined;
  return {
    ...summoner,
    key: ADVANCED_SUMMONER_KEY,
    label: ADVANCED_SUMMONER_LABEL,
    columns: summoner.columns.map((c) => ({
      ...c,
      title: ADVANCED_SUMMONER_LABEL,
      skillIds: [...c.skillIds],
    })),
    edges: [...summoner.edges],
  };
}

function resolveJobData(jobKey: string): JobData | undefined {
  if (jobKey === ADVANCED_SUMMONER_KEY) return advancedSummonerJobData();
  return plannerRoot().jobs[jobKey];
}

/** Switch dataset for listJobs / getJobData / trees (home page only). */
export function setPlannerGameMode(mode: GameMode): void {
  activeGameMode = mode;
}

export function getPlannerGameMode(): GameMode {
  return activeGameMode;
}

export const PLANNER_META = {
  get generated() {
    return plannerRoot().generated;
  },
  get source() {
    return plannerRoot().source;
  },
} as const;

export function listJobs(): { key: string; label: string }[] {
  const jobs = Object.values(plannerRoot().jobs).map((j) => ({ key: j.key, label: j.label }));
  const advancedSummoner = advancedSummonerJobData();
  if (advancedSummoner) jobs.push({ key: advancedSummoner.key, label: advancedSummoner.label });
  return jobs;
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

/** Shown in the Expanded tab when game mode is renewal (extra branches). */
const RENEWAL_EXPANDED_BRANCH_KEYS = new Set([
  "JT_SUPERNOVICE2",
  "JT_HYPER_NOVICE",
  "JT_KAGEROU",
  "JT_OBORO",
  "JT_REBELLION",
  "JT_DO_SUMMONER",
  ADVANCED_SUMMONER_KEY,
  "JT_SPIRIT_HANDLER",
  "JT_STAR_EMPEROR",
  "JT_SOUL_REAPER",
  "JT_SKY_EMPEROR",
  "JT_SOUL_ASCETIC",
  "JT_NIGHT_WATCH",
  "JT_SHIRANUI",
  "JT_SHINKIRO",
]);

const THIRD_CLASS_KEYS = new Set([
  "JT_RUNE_KNIGHT",
  "JT_RUNE_KNIGHT_H",
  "JT_ROYAL_GUARD",
  "JT_ROYAL_GUARD_H",
  "JT_WARLOCK",
  "JT_WARLOCK_H",
  "JT_SORCERER",
  "JT_SORCERER_H",
  "JT_RANGER",
  "JT_RANGER_H",
  "JT_MECHANIC",
  "JT_MECHANIC_H",
  "JT_GUILLOTINE_CROSS",
  "JT_GUILLOTINE_CROSS_H",
  "JT_ARCHBISHOP",
  "JT_ARCHBISHOP_H",
  "JT_GENETIC",
  "JT_GENETIC_H",
  "JT_SHADOW_CHASER",
  "JT_SHADOW_CHASER_H",
  "JT_MINSTREL",
  "JT_MINSTREL_H",
  "JT_WANDERER",
  "JT_WANDERER_H",
  "JT_SURA",
  "JT_SURA_H",
]);

/** In renewal, third job pickers: `…_H` = played through transcendent 2nd (e.g. Lord Knight → Rune Knight). */
export function isThirdClassKey(jobKey: string): boolean {
  return getPlannerGameMode() === "renewal" && THIRD_CLASS_KEYS.has(jobKey);
}

/** Data often uses a trailing "(Trans.)" on Renewal third jobs; hide that in the class picker and toolbar. */
const THIRD_CLASS_LABEL_TRAN_SUFFIX = /\s*\(\s*Trans\.?\s*\)\s*$/i;

export function jobPickerDisplayLabel(jobKey: string, rawLabel: string): string {
  if (!isThirdClassKey(jobKey)) return rawLabel;
  return rawLabel.replace(THIRD_CLASS_LABEL_TRAN_SUFFIX, "").trimEnd();
}

const FOURTH_CLASS_KEYS = new Set([
  "JT_DRAGON_KNIGHT",
  "JT_IMPERIAL_GUARD",
  "JT_ARCH_MAGE",
  "JT_ELEMENTAL_MASTER",
  "JT_WINDHAWK",
  "JT_MEISTER",
  "JT_SHADOW_CROSS",
  "JT_CARDINAL",
  "JT_BIOLO",
  "JT_ABYSS_CHASER",
  "JT_INQUISITOR",
  "JT_TROUBADOUR",
  "JT_TROUVERE",
]);

const RENEWAL_OTHER_KEYS = new Set([
  "JT_DO_SUMMONER",
  "JT_SPIRIT_HANDLER",
]);

function expandedClassKeys(): Set<string> {
  const s = new Set(EXPANDED_CLASS_KEYS);
  if (getPlannerGameMode() === "renewal") {
    for (const k of RENEWAL_EXPANDED_BRANCH_KEYS) s.add(k);
  }
  return s;
}

/** Row in the class picker tier (from number of non-quest skill columns, plus renewal buckets). */
export function jobPickerGroup(
  jobKey: string,
):
  | "novice"
  | "expandedClass"
  | "firstClass"
  | "secondClass"
  | "transcendent"
  | "thirdClass"
  | "fourthClass"
  | "renewalOther" {
  if (jobKey === "JT_NOVICE") return "novice";
  if (expandedClassKeys().has(jobKey)) return "expandedClass";
  if (getPlannerGameMode() === "renewal") {
    if (THIRD_CLASS_KEYS.has(jobKey)) return "thirdClass";
    if (FOURTH_CLASS_KEYS.has(jobKey)) return "fourthClass";
    if (RENEWAL_OTHER_KEYS.has(jobKey)) return "renewalOther";
  }
  const j = plannerRoot().jobs[jobKey];
  if (!j) return "secondClass";
  const n = j.columns.filter((c) => !isQuestColumnTitle(c.title)).length;
  if (n >= 3) return "transcendent";
  if (n === 2) return "secondClass";
  return "firstClass";
}

const THIRD_CLASS_PICKER_ROWS = [
  [
    "JT_RUNE_KNIGHT_H",
    "JT_WARLOCK_H",
    "JT_MECHANIC_H",
    "JT_ARCHBISHOP_H",
    "JT_GUILLOTINE_CROSS_H",
    "JT_RANGER_H",
  ],
  [
    "JT_ROYAL_GUARD_H",
    "JT_SORCERER_H",
    "JT_GENETIC_H",
    "JT_SURA_H",
    "JT_SHADOW_CHASER_H",
    "JT_MINSTREL_H",
    "JT_WANDERER_H",
  ],
] as const;

const FOURTH_CLASS_PICKER_ROWS = [
  [
    "JT_DRAGON_KNIGHT",
    "JT_ARCH_MAGE",
    "JT_MEISTER",
    "JT_CARDINAL",
    "JT_SHADOW_CROSS",
    "JT_WINDHAWK",
  ],
  [
    "JT_IMPERIAL_GUARD",
    "JT_ELEMENTAL_MASTER",
    "JT_BIOLO",
    "JT_INQUISITOR",
    "JT_ABYSS_CHASER",
    "JT_TROUBADOUR",
    "JT_TROUVERE",
  ],
] as const;

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

/** One cell in the renewal Expanded tab alignment grid (`expandedMatrix` layout). */
export type JobPickerMatrixCell =
  | { readonly jobs: readonly string[]; readonly colSpan?: number }
  | { readonly empty: true; readonly colSpan?: number };

export type JobPickerSection = {
  heading: string;
  /** Single grid (Novice / first class). */
  jobs?: { key: string; label: string }[];
  /** Stacked grids (second class / transcendent rows). */
  jobRows?: { key: string; label: string }[][];
  /** When set, interpret `jobRows` as left→right progression stages (rendered horizontally). */
  jobRowsLayout?: "progressionLine" | "expandedMatrix";
  /**
   * Renewal expanded: fixed-column rows so starters / 2nd / 3rd / 4th tiers line up across class lines.
   * Used when `jobRowsLayout === "expandedMatrix"` (ignore `jobRows`).
   */
  expandedMatrixRows?: JobPickerMatrixCell[][];
};

function sectionHasJobs(g: JobPickerSection): boolean {
  return (
    (g.jobs != null && g.jobs.length > 0) ||
    (g.jobRows != null && g.jobRows.some((r) => r.length > 0)) ||
    (g.expandedMatrixRows != null &&
      g.expandedMatrixRows.some((row) => row.some((c) => "jobs" in c && c.jobs.length > 0)))
  );
}

function jobKeysForPickerSections(sections: JobPickerSection[]): string[] {
  const keys: string[] = [];
  for (const s of sections) {
    if (s.jobs) for (const j of s.jobs) keys.push(j.key);
    if (s.jobRows)
      for (const row of s.jobRows) for (const j of row) if (j) keys.push(j.key);
    if (s.expandedMatrixRows) {
      for (const row of s.expandedMatrixRows) {
        for (const c of row) {
          if ("jobs" in c) for (const k of c.jobs) keys.push(k);
        }
      }
    }
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
  /**
   * Third class tab (renewal): optionally split grids (legacy). Prefer normal `sections` when possible.
   * When set, `sections` is typically only the tail after the path-specific grids.
   */
  thirdPathSplit?: {
    trans: JobPickerSection;
    base: JobPickerSection;
    after?: JobPickerSection[];
  };
};

/**
 * Class picker modal: base (novice + 1st + 2nd), transcendent, expanded; in renewal mode also
 * third class, fourth class (separate tabs), and Summoner/misc. under the third-class tab.
 * Tabs with no content are omitted.
 */
export function listJobPickerTabs(): JobPickerTabDef[] {
  const all = listJobs();
  const byKey = new Map(all.map((j) => [j.key, j] as const));
  const row = (keys: readonly string[]): { key: string; label: string }[] =>
    keys.map((k) => byKey.get(k)).filter((j): j is (typeof all)[number] => j != null);
  const novice = all.filter((j) => jobPickerGroup(j.key) === "novice");
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

  const renewalExpandedMatrix: JobPickerMatrixCell[][] = [
    [
      { jobs: ["JT_SUPERNOVICE"] },
      { jobs: ["JT_TAEKWON"], colSpan: 2 },
      { jobs: ["JT_NINJA"] },
      { jobs: ["JT_GUNSLINGER"] },
      { jobs: ["JT_DO_SUMMONER"] },
    ],
    [
      { jobs: ["JT_SUPERNOVICE2"] },
      { jobs: ["JT_STAR"] },
      { jobs: ["JT_LINKER"] },
      { jobs: ["JT_KAGEROU", "JT_OBORO"] },
      { jobs: ["JT_REBELLION"] },
      { jobs: [ADVANCED_SUMMONER_KEY] },
    ],
    [
      { empty: true },
      { jobs: ["JT_STAR_EMPEROR"] },
      { jobs: ["JT_SOUL_REAPER"] },
      { empty: true },
      { empty: true },
      { empty: true },
    ],
    [
      { jobs: ["JT_HYPER_NOVICE"] },
      { jobs: ["JT_SKY_EMPEROR"] },
      { jobs: ["JT_SOUL_ASCETIC"] },
      { jobs: ["JT_SHINKIRO", "JT_SHIRANUI"] },
      { jobs: ["JT_NIGHT_WATCH"] },
      { jobs: ["JT_SPIRIT_HANDLER"] },
    ],
  ];

  /** Same column layout as renewal expanded matrix; only jobs that exist in pre-renewal are shown. */
  const preExpandedMatrix: JobPickerMatrixCell[][] = [
    [
      { jobs: ["JT_SUPERNOVICE"] },
      { jobs: ["JT_TAEKWON"], colSpan: 2 },
      { jobs: ["JT_NINJA"] },
      { jobs: ["JT_GUNSLINGER"] },
      { empty: true },
    ],
    [
      { empty: true },
      { jobs: ["JT_STAR"] },
      { jobs: ["JT_LINKER"] },
      { empty: true },
      { empty: true },
      { empty: true },
    ],
  ];

  const expandedSections: JobPickerSection[] = (
    getPlannerGameMode() === "renewal"
      ? ([
          {
            heading: "Expanded classes",
            jobRowsLayout: "expandedMatrix",
            expandedMatrixRows: renewalExpandedMatrix,
          },
        ] satisfies JobPickerSection[])
      : ([
          {
            heading: "Expanded classes",
            jobRowsLayout: "expandedMatrix",
            expandedMatrixRows: preExpandedMatrix,
          },
        ] satisfies JobPickerSection[])
  ).filter(sectionHasJobs);

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
  ];

  if (getPlannerGameMode() === "renewal") {
    const thirdRows = THIRD_CLASS_PICKER_ROWS.map((keys) => row(keys)).filter((r) => r.length > 0);
    const fourthRows = FOURTH_CLASS_PICKER_ROWS.map((keys) => row(keys)).filter((r) => r.length > 0);

    const thirdSections: JobPickerSection[] = [
      { heading: "Third class", jobRows: thirdRows },
    ].filter(sectionHasJobs);

    const thirdTabKeys: string[] = jobKeysForPickerSections(thirdSections);
    const fourthSections: JobPickerSection[] = [
      { heading: "Fourth class", jobRows: fourthRows },
    ].filter(sectionHasJobs);

    if (thirdTabKeys.length > 0) {
      tabs.push({
        id: "third",
        label: "Third class",
        sections: thirdSections,
        jobKeys: thirdTabKeys,
      });
    }
    if (fourthSections.length > 0) {
      tabs.push({
        id: "fourth",
        label: "Fourth class",
        sections: fourthSections,
        jobKeys: jobKeysForPickerSections(fourthSections),
      });
    }
  }

  tabs.push({
    id: "expanded",
    label: "Expanded",
    sections: expandedSections,
    jobKeys: jobKeysForPickerSections(expandedSections),
  });

  return tabs.filter(
    (t) => t.sections.length > 0 || t.thirdPathSplit != null,
  );
}

/**
 * Progression rows for the per-line class picker modal (renewal-oriented; pre-renewal omits missing keys).
 * Each row is one horizontal stage; pairs use the same job keys as the main picker (joined cards where applicable).
 */
const CLASS_LINE_MODAL_STAGES: Record<string, readonly (readonly string[])[]> = {
  JT_SWORDMAN: [
    ["JT_SWORDMAN"],
    ["JT_KNIGHT", "JT_CRUSADER"],
    ["JT_KNIGHT_H", "JT_CRUSADER_H"],
    ["JT_RUNE_KNIGHT_H", "JT_ROYAL_GUARD_H"],
    ["JT_DRAGON_KNIGHT", "JT_IMPERIAL_GUARD"],
  ],
  JT_MAGICIAN: [
    ["JT_MAGICIAN"],
    ["JT_WIZARD", "JT_SAGE"],
    ["JT_WIZARD_H", "JT_SAGE_H"],
    ["JT_WARLOCK_H", "JT_SORCERER_H"],
    ["JT_ARCH_MAGE", "JT_ELEMENTAL_MASTER"],
  ],
  JT_MERCHANT: [
    ["JT_MERCHANT"],
    ["JT_BLACKSMITH", "JT_ALCHEMIST"],
    ["JT_BLACKSMITH_H", "JT_ALCHEMIST_H"],
    ["JT_MECHANIC_H", "JT_GENETIC_H"],
    ["JT_MEISTER", "JT_BIOLO"],
  ],
  JT_ACOLYTE: [
    ["JT_ACOLYTE"],
    ["JT_PRIEST", "JT_MONK"],
    ["JT_PRIEST_H", "JT_MONK_H"],
    ["JT_ARCHBISHOP_H", "JT_SURA_H"],
    ["JT_CARDINAL", "JT_INQUISITOR"],
  ],
  JT_THIEF: [
    ["JT_THIEF"],
    ["JT_ASSASSIN", "JT_ROGUE"],
    ["JT_ASSASSIN_H", "JT_ROGUE_H"],
    ["JT_GUILLOTINE_CROSS_H", "JT_SHADOW_CHASER_H"],
    ["JT_SHADOW_CROSS", "JT_ABYSS_CHASER"],
  ],
  JT_ARCHER: [
    ["JT_ARCHER"],
    ["JT_HUNTER", "JT_BARD", "JT_DANCER"],
    ["JT_HUNTER_H", "JT_BARD_H", "JT_DANCER_H"],
    ["JT_RANGER_H", "JT_MINSTREL_H", "JT_WANDERER_H"],
    ["JT_WINDHAWK", "JT_TROUBADOUR", "JT_TROUVERE"],
  ],
  JT_TAEKWON: [
    ["JT_TAEKWON"],
    ["JT_STAR", "JT_LINKER"],
    ["JT_STAR_EMPEROR", "JT_SOUL_REAPER"],
    ["JT_SKY_EMPEROR", "JT_SOUL_ASCETIC"],
  ],
  JT_NINJA: [
    ["JT_NINJA"],
    ["JT_KAGEROU", "JT_OBORO"],
    ["JT_SHINKIRO", "JT_SHIRANUI"],
  ],
  JT_GUNSLINGER: [["JT_GUNSLINGER"], ["JT_REBELLION"], ["JT_NIGHT_WATCH"]],
  JT_SUPERNOVICE: [["JT_SUPERNOVICE"], ["JT_SUPERNOVICE2"], ["JT_HYPER_NOVICE"]],
  JT_DO_SUMMONER: [
    ["JT_DO_SUMMONER"],
    [ADVANCED_SUMMONER_KEY],
    ["JT_SPIRIT_HANDLER"],
  ],
};

const CLASS_LINE_SHORTCUT_ORDER: readonly string[] = [
  "JT_SWORDMAN",
  "JT_MAGICIAN",
  "JT_MERCHANT",
  "JT_ACOLYTE",
  "JT_THIEF",
  "JT_ARCHER",
  "JT_TAEKWON",
  "JT_NINJA",
  "JT_GUNSLINGER",
  "JT_SUPERNOVICE",
  "JT_DO_SUMMONER",
];

/** Optional toolbar labels (otherwise uses `JobData.label`). */
const CLASS_LINE_SHORTCUT_LABEL: Partial<Record<string, string>> = {
  JT_MAGICIAN: "Mage",
  JT_DO_SUMMONER: "Summoner",
};

/** Job keys per stage row for the line-specific class modal, omitting keys not in the current game mode. */
export function classLineModalJobRows(anchorKey: string): string[][] {
  const raw = CLASS_LINE_MODAL_STAGES[anchorKey];
  if (!raw) return [];
  const available = new Set(listJobs().map((j) => j.key));
  const out: string[][] = [];
  for (const row of raw) {
    const keys = row.filter((k) => available.has(k));
    if (keys.length > 0) out.push([...keys]);
  }
  return out;
}

export function listClassLineShortcuts(): { anchorKey: string; label: string }[] {
  const out: { anchorKey: string; label: string }[] = [];
  for (const anchorKey of CLASS_LINE_SHORTCUT_ORDER) {
    if (classLineModalJobRows(anchorKey).length === 0) continue;
    const override = CLASS_LINE_SHORTCUT_LABEL[anchorKey];
    const job = resolveJobData(anchorKey);
    out.push({ anchorKey, label: override ?? job?.label ?? anchorKey });
  }
  return out;
}

export function getJobData(jobKey: string): JobData | undefined {
  return resolveJobData(jobKey);
}

/**
 * Lord Knight / High Priest / … : exactly three content columns where the last is the transcendent 2nd job.
 * Renewal trans-path 3rd/4th layouts are handled separately via `shouldMergeRenewalTransPathSkillPanel`.
 */
const CLASSIC_TRANSCENDENT_SECOND_JOB_KEYS = new Set([
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
]);

/** First merged column + second job + transcendent (three content columns; transcendent merges into second in UI). */
export function shouldMergeTranscendentIntoSecondPanel(job: JobData): boolean {
  if (!CLASSIC_TRANSCENDENT_SECOND_JOB_KEYS.has(job.key)) return false;
  const q = job.columns.findIndex((c) => isQuestColumnTitle(c.title));
  const content = job.columns.map((_, i) => i).filter((i) => q < 0 || i !== q);
  return content.length === 3;
}

/**
 * Renewal "trans path" 3rd jobs: 1st line + 2nd + trans-2nd + 3rd job (4 non-quest cols).
 * Renewal 4th jobs: 1st line + 2nd + trans-2nd + 3rd job (Trans.) + 4th job (5 non-quest cols).
 *
 * UI: **base** | **second + trans (one merged grid)** | **third** [| **fourth**], same idea as pre-renewal transcendent mid panel.
 */
export function shouldMergeRenewalTransPathSkillPanel(job: JobData): boolean {
  if (getPlannerGameMode() !== "renewal") return false;
  const q = job.columns.findIndex((c) => isQuestColumnTitle(c.title));
  const content = job.columns.map((_, i) => i).filter((i) => q < 0 || i !== q);
  if (content.length === 4) return THIRD_CLASS_KEYS.has(job.key) && job.key.endsWith("_H");
  if (content.length === 5) return FOURTH_CLASS_KEYS.has(job.key);
  return false;
}

export function buildSkillsForJob(jobKey: string): SkillDef[] {
  const j = resolveJobData(jobKey);
  if (!j) return [];
  const hideRenewalSummonerAdvSkills =
    getPlannerGameMode() === "renewal" && jobKey === "JT_DO_SUMMONER";
  const questCol = j.columns.findIndex((c) => isQuestColumnTitle(c.title));
  const contentCols = j.columns.map((_, i) => i).filter((i) => questCol < 0 || i !== questCol);
  const transcendentCol =
    contentCols.length === 3 && shouldMergeTranscendentIntoSecondPanel(j)
      ? contentCols[2]!
      : (contentCols.length === 4 || contentCols.length === 5) &&
          shouldMergeRenewalTransPathSkillPanel(j)
        ? contentCols[2]!
        : -1;
  const out: SkillDef[] = [];
  j.columns.forEach((col, column) => {
    const quest = isQuestColumnTitle(col.title);
    col.skillIds.forEach((id, row) => {
      const s = j.skills[id];
      if (!s) return;
      if (hideRenewalSummonerAdvSkills && isRenewalSummonerBaseHiddenSkill(s)) return;
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
  const j = resolveJobData(jobKey);
  if (!j) return [];
  const raw = j.edges ?? [];
  if (getPlannerGameMode() !== "renewal" || jobKey !== "JT_DO_SUMMONER") return raw;
  const hidden = (id: string): boolean => {
    const sk = j.skills[id];
    return sk ? isRenewalSummonerBaseHiddenSkill(sk) : false;
  };
  return raw.filter((e) => !hidden(e.fromId) && !hidden(e.toId));
}

export function makeSkillMap(skills: SkillDef[]): Map<string, SkillDef> {
  return new Map(skills.map((s) => [s.id, s]));
}
