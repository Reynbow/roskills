import {
  getPlannerGameMode,
  setPlannerGameMode,
  persistPlannerGameMode,
  getSkillDataSource,
  getPlannerLayout,
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
  | "equipment"
  | "re-monsters";

type NavItem = { id: SiteNavId; href: string; label: string; renewalOnly?: boolean };

const NAV_ITEMS: NavItem[] = [
  { id: "skills", href: "/skills", label: "Skill planner" },
  { id: "cards", href: "/cards", label: "Card library" },
  { id: "pets", href: "/pets", label: "Pets" },
  { id: "mounts", href: "/mounts", label: "Mounts" },
  { id: "monsters", href: "/monsters", label: "Monsters" },
  { id: "armour", href: "/armour", label: "Armour" },
  { id: "weapons", href: "/weapons", label: "Weapons" },
  // Renewal-only links are intentionally last so they're always rightmost in the nav.
  { id: "msq", href: "/msq", label: "MSQ", renewalOnly: true },
  { id: "equipment", href: "/equipment", label: "Equipment", renewalOnly: true },
  { id: "re-monsters", href: "/re-monsters", label: "Re-Monsters", renewalOnly: true },
];

function escapeHtml(s: string): string {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** A choice in the tab row under the top bar (the partner site's section tabs). */
function modeTab(attr: string, value: string, label: string, on: boolean): string {
  const cls = `mode-tab${on ? " mode-tab--active" : ""}`;
  return `<button type="button" class="${cls}" ${attr}="${value}" aria-pressed="${on}">${escapeHtml(label)}</button>`;
}

/** Game version switch: Pre-renewal / Renewal. */
export function gameModeToggleHtml(): string {
  const mode = getPlannerGameMode();
  return `<div class="mode-tabs__group" id="game-mode-toggle" role="group" aria-label="Game version">
    ${modeTab("data-set-game-mode", "pre", "Pre-renewal", mode !== "renewal")}
    ${modeTab("data-set-game-mode", "renewal", "Renewal", mode === "renewal")}
  </div>`;
}

/** Skill planner, pre-renewal: RO Classic Plus server data or the default client data. */
export function skillDataToggleHtml(): string {
  const src = getSkillDataSource();
  const hidden = getPlannerGameMode() === "renewal" ? " hidden" : "";
  return `<div class="mode-tabs__group" id="skill-data-toggle" role="group" aria-label="Skill data"${hidden}>
    ${modeTab("data-set-skill-data", "server", "RO Classic Plus data", src === "server")}
    ${modeTab("data-set-skill-data", "default", "Default data", src === "default")}
  </div>`;
}

/** Skill planner only: the new planner (default) or the classic one. */
export function plannerLayoutToggleHtml(): string {
  const layout = getPlannerLayout();
  return `<div class="mode-tabs__group mode-tabs__group--end" id="planner-layout-toggle" role="group" aria-label="Planner layout">
    ${modeTab("data-set-layout", "beta", "New planner", layout === "beta")}
    ${modeTab("data-set-layout", "current", "Classic planner", layout === "current")}
  </div>`;
}

const EXTERNAL_ICON = `<svg class="site-partner__icon" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M5 2H2v8h8V7M7 2h3v3M10 2 5.5 6.5" fill="none" stroke="currentColor" stroke-width="1.4"/></svg>`;

function navLinkHtml(item: NavItem, active: SiteNavId): string {
  const isActive = item.id === active;
  const mode = getPlannerGameMode();
  const isRenewalOnly = !!item.renewalOnly;
  const isSkills = item.id === "skills";
  const hidden = (isRenewalOnly && mode !== "renewal") || (!isRenewalOnly && !isSkills && mode === "renewal");
  const cls = `site-nav__link${isActive ? " site-nav__link--active" : ""}`;
  const current = isActive ? ` aria-current="page"` : "";
  const hiddenAttr = hidden ? " hidden" : "";
  const ariaH = hidden ? ` aria-hidden="true"` : "";
  const tab = hidden ? ` tabindex="-1"` : "";
  const renewalOnlyAttr = item.renewalOnly ? ` data-renewal-only="true"` : "";
  return `<a class="${cls}" href="${item.href}" data-site-nav="${item.id}"${renewalOnlyAttr}${current}${hiddenAttr}${ariaH}${tab}>${escapeHtml(item.label)}</a>`;
}

export function siteNavHtml(active: SiteNavId): string {
  return NAV_ITEMS.map((item) => navLinkHtml(item, active)).join("\n          ");
}

/**
 * Top bar and mode tabs, built like roclassicplus.com's: the bar holds the wordmark, the
 * site links and the way across to the partner site; choices sit in a tab row under it.
 */
function headerHtml(active: SiteNavId, brandTag: "a" | "h1"): string {
  const brand =
    brandTag === "h1"
      ? `<h1 class="site-brand" id="planner-page-title"><a href="/">roskills.com</a></h1>`
      : `<a class="site-brand" href="/">roskills.com</a>`;
  const dataTabs = active === "skills" ? skillDataToggleHtml() + plannerLayoutToggleHtml() : "";
  return `<header class="site-header">
      <div class="site-header__bar">
        ${brand}
        <nav class="site-nav" aria-label="Site">
          ${siteNavHtml(active)}
        </nav>
        <a class="site-partner" href="https://roclassicplus.com/" target="_blank" rel="noopener">RO Classic +${EXTERNAL_ICON}</a>
      </div>
    </header>
    <div class="mode-tabs">
      ${gameModeToggleHtml()}
      ${dataTabs}
    </div>`;
}

/** Header for library pages. */
export function siteHeaderRowHtml(active: SiteNavId): string {
  return headerHtml(active, "a");
}

/** Header for the skill planner (the wordmark is the page's h1). */
export function plannerHeaderInnerHtml(active: SiteNavId): string {
  return headerHtml(active, "h1");
}

export function syncGameModeToggleChrome(
  root: HTMLElement,
): void {
  const mode = getPlannerGameMode();
  root.querySelectorAll<HTMLButtonElement>("#game-mode-toggle [data-set-game-mode]").forEach((btn) => {
    const on = btn.dataset.setGameMode === mode;
    btn.classList.toggle("mode-tab--active", on);
    btn.setAttribute("aria-pressed", on ? "true" : "false");
  });
  const dataT = root.querySelector<HTMLElement>("#skill-data-toggle");
  if (dataT) {
    const src = getSkillDataSource();
    dataT.hidden = mode === "renewal";
    dataT.setAttribute("data-active", src);
    dataT.querySelectorAll<HTMLButtonElement>("[data-set-skill-data]").forEach((btn) => {
      const on = btn.dataset.setSkillData === src;
      btn.classList.toggle("mode-tab--active", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }
  // Planner title is fixed to brand (`roskills.com`) and doesn't change per mode anymore.
  root.querySelectorAll<HTMLAnchorElement>("a.site-nav__link[data-site-nav]").forEach((a) => {
    const id = (a.getAttribute("data-site-nav") || "") as SiteNavId | "";
    const renewalOnly = a.getAttribute("data-renewal-only") === "true";
    const isSkills = id === "skills";
    const hide = (renewalOnly && mode !== "renewal") || (!renewalOnly && !isSkills && mode === "renewal");
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
  root.querySelector("#game-mode-toggle")?.addEventListener("click", (e) => {
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
