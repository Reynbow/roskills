/** Pre-renewal vs renewal client — shared across pages without importing planner JSON. */
export type GameMode = "pre" | "renewal";

let activeGameMode: GameMode = "pre";

export const GAME_MODE_STORAGE_KEY = "ro-planner-game-mode";

/** Read `?mode=` from the URL, else localStorage; updates in-memory mode. */
export function initPlannerGameModeFromUrlOrStorage(): void {
  initSkillDataFromUrlOrStorage();
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
  try {
    const s = localStorage.getItem(GAME_MODE_STORAGE_KEY);
    if (s === "renewal" || s === "pre") setPlannerGameMode(s);
  } catch {
    /* ignore */
  }
}

export function persistPlannerGameMode(mode: GameMode): void {
  try {
    localStorage.setItem(GAME_MODE_STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

export function setPlannerGameMode(mode: GameMode): void {
  activeGameMode = mode;
}

export function getPlannerGameMode(): GameMode {
  return activeGameMode;
}

/** Convenience for pages that want to change mode and persist it. */
export function setAndPersistPlannerGameMode(mode: GameMode): void {
  persistPlannerGameMode(mode);
  setPlannerGameMode(mode);
}

/**
 * Pre-renewal skill data: "server" = RO Classic Plus (roclassicplus.com) trees, names and
 * descriptions; "default" = the stock pre-renewal client data.
 */
export type SkillDataSource = "server" | "default";

let activeSkillData: SkillDataSource = "server";

export const SKILL_DATA_STORAGE_KEY = "ro-planner-skill-data";

/** Read `?data=` from the URL, else localStorage. */
export function initSkillDataFromUrlOrStorage(): void {
  try {
    const d = new URL(window.location.href).searchParams.get("data");
    if (d === "server" || d === "default") {
      activeSkillData = d;
      return;
    }
  } catch {
    /* ignore */
  }
  try {
    const s = localStorage.getItem(SKILL_DATA_STORAGE_KEY);
    if (s === "server" || s === "default") activeSkillData = s;
  } catch {
    /* ignore */
  }
}

export function getSkillDataSource(): SkillDataSource {
  return activeSkillData;
}

export function setSkillDataSource(src: SkillDataSource): void {
  activeSkillData = src;
}

export function setAndPersistSkillDataSource(src: SkillDataSource): void {
  try {
    localStorage.setItem(SKILL_DATA_STORAGE_KEY, src);
  } catch {
    /* ignore */
  }
  activeSkillData = src;
}

/** True when the planner shows RO Classic Plus data (pre-renewal only). */
export function usingServerSkillData(): boolean {
  return activeGameMode === "pre" && activeSkillData === "server";
}

/** Skill planner layout: the current planner or the opt-in beta. */
export type PlannerLayout = "current" | "beta";

export const PLANNER_LAYOUT_STORAGE_KEY = "ro-planner-layout";

/** `?layout=beta|current` wins (and is remembered), else the saved choice, else current. */
export function getPlannerLayout(): PlannerLayout {
  try {
    const q = new URL(window.location.href).searchParams.get("layout");
    if (q === "beta" || q === "current") {
      localStorage.setItem(PLANNER_LAYOUT_STORAGE_KEY, q);
      return q;
    }
    return localStorage.getItem(PLANNER_LAYOUT_STORAGE_KEY) === "beta" ? "beta" : "current";
  } catch {
    return "current";
  }
}

/** Save the layout and reload the planner in it (builds live in shared storage). */
export function switchPlannerLayout(layout: PlannerLayout): void {
  try {
    localStorage.setItem(PLANNER_LAYOUT_STORAGE_KEY, layout);
  } catch {
    /* ignore */
  }
  const u = new URL(window.location.href);
  u.searchParams.delete("layout");
  window.location.assign(u.toString());
}
