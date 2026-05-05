import {
  getPlannerGameMode,
  setPlannerGameMode,
  persistPlannerGameMode,
  type GameMode,
} from "./game-mode";

export type SiteNavId =
  | "skills"
  | "cards"
  | "pets"
  | "msq"
  | "mounts"
  | "monsters"
  | "armour"
  | "weapons"
  | "equipment";

type NavItem = { id: SiteNavId; href: string; label: string; renewalOnly?: boolean };

const NAV_ITEMS: NavItem[] = [
  { id: "skills", href: "/skills", label: "Skill Planner" },
  { id: "cards", href: "/cards", label: "Card Library" },
  { id: "pets", href: "/pets", label: "Pets" },
  { id: "mounts", href: "/mounts", label: "Mounts" },
  { id: "monsters", href: "/monsters", label: "Monsters" },
  { id: "armour", href: "/armour", label: "Armour" },
  { id: "weapons", href: "/weapons", label: "Weapons" },
  // Renewal-only links are intentionally last so they're always rightmost in the nav.
  { id: "msq", href: "/msq", label: "MSQ", renewalOnly: true },
  { id: "equipment", href: "/equipment", label: "Equipment", renewalOnly: true },
];

function escapeHtml(s: string): string {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function gameModeToggleHtml(): string {
  const mode = getPlannerGameMode();
  const dataActive = mode === "renewal" ? "renewal" : "pre";
  return `<div class="game-mode-toggle game-mode-toggle--header" data-active="${dataActive}" role="group" aria-label="Game client version">
    <span class="game-mode-toggle__slider" aria-hidden="true"></span>
    <button type="button" class="game-mode-toggle__btn" data-set-game-mode="pre">
      <span class="game-mode-toggle__text">Pre-Renewal</span>
    </button>
    <button type="button" class="game-mode-toggle__btn" data-set-game-mode="renewal">
      <span class="game-mode-toggle__text">Renewal</span>
    </button>
  </div>`;
}

function navLinkHtml(item: NavItem, active: SiteNavId): string {
  const isActive = item.id === active;
  const mode = getPlannerGameMode();
  const hidden = item.renewalOnly && mode !== "renewal";
  const cls = `site-nav__link${isActive ? " site-nav__link--active" : ""}`;
  const current = isActive ? ` aria-current="page"` : "";
  const hiddenAttr = hidden ? " hidden" : "";
  const ariaH = hidden ? ` aria-hidden="true"` : "";
  const tab = hidden ? ` tabindex="-1"` : "";
  return `<a class="${cls}" href="${item.href}" data-site-nav="${item.id}"${current}${hiddenAttr}${ariaH}${tab}>${escapeHtml(item.label)}</a>`;
}

export function siteNavHtml(active: SiteNavId): string {
  return NAV_ITEMS.map((item) => navLinkHtml(item, active)).join("\n          ");
}

/** Header row for library pages (brand + toggle + nav). */
export function siteHeaderRowHtml(active: SiteNavId): string {
  return `<header class="site-header">
      <div class="site-header__left">
        <a class="site-brand" href="/">roskills.com</a>
        ${gameModeToggleHtml()}
        <nav class="site-nav" aria-label="Site">
          ${siteNavHtml(active)}
        </nav>
      </div>
    </header>`;
}

/** Header row for the skill planner (title + toggle + nav). */
export function plannerHeaderInnerHtml(active: SiteNavId): string {
  return `<header class="planner-header">
      <div class="planner-header__left">
        <h1 class="planner-header__title" id="planner-page-title">roskills.com</h1>
        ${gameModeToggleHtml()}
        <nav class="site-nav" aria-label="Site">
          ${siteNavHtml(active)}
        </nav>
      </div>
    </header>`;
}

export function syncGameModeToggleChrome(
  root: HTMLElement,
): void {
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
  // Planner title is fixed to brand (`roskills.com`) and doesn't change per mode anymore.
  root.querySelectorAll<HTMLAnchorElement>("a[data-site-nav='msq']").forEach((a) => {
    const hide = mode !== "renewal";
    if (hide) {
      a.setAttribute("hidden", "");
      a.setAttribute("aria-hidden", "true");
      a.setAttribute("tabindex", "-1");
    } else {
      a.removeAttribute("hidden");
      a.removeAttribute("aria-hidden");
      a.removeAttribute("tabindex");
    }
  });

  root.querySelectorAll<HTMLAnchorElement>("a[data-site-nav='equipment']").forEach((a) => {
    const hide = mode !== "renewal";
    if (hide) {
      a.setAttribute("hidden", "");
      a.setAttribute("aria-hidden", "true");
      a.setAttribute("tabindex", "-1");
    } else {
      a.removeAttribute("hidden");
      a.removeAttribute("aria-hidden");
      a.removeAttribute("tabindex");
    }
  });
}

/** Game mode toggle on non–skill-planner pages: persist, sync chrome, redirect off MSQ when switching to pre. */
export function wireSiteGameModeToggle(root: HTMLElement): void {
  root.querySelector(".game-mode-toggle--header")?.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest("[data-set-game-mode]") as HTMLButtonElement | null;
    const m = btn?.dataset.setGameMode as GameMode | undefined;
    if (!m || m === getPlannerGameMode()) return;
    persistPlannerGameMode(m);
    setPlannerGameMode(m);
    syncGameModeToggleChrome(root);
    if (m !== "renewal" && /\/msq\/?$/i.test(window.location.pathname)) {
      window.location.assign("/skills");
    }
  });
}
