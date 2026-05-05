/** Pre-renewal vs renewal client — shared across pages without importing planner JSON. */
export type GameMode = "pre" | "renewal";

let activeGameMode: GameMode = "pre";

export const GAME_MODE_STORAGE_KEY = "ro-planner-game-mode";

/** Read `?mode=` from the URL, else localStorage; updates in-memory mode. */
export function initPlannerGameModeFromUrlOrStorage(): void {
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
