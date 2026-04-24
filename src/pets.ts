import "./style.css";
import { inject } from "@vercel/analytics";
import petsRaw from "./data/pets.json";

// Initialize Vercel Web Analytics (never block app shell if script fails)
try {
  inject();
} catch {
  /* ignore */
}

type PetEntry = {
  mobAegis: string;
  mobId: number | null;
  mobLevel: number;
  name: string;
  tameItem: { aegis: string; id: number | null; name: string; icon: string };
  tameItemSources: Array<{ monster: string; level: number; rate: number }>;
  tameItemNpcSources: Array<{
    npc: string;
    map?: string;
    x?: number;
    y?: number;
    zeny?: number;
    requires: Array<{ item: string; amount: number }>;
  }>;
  eggItem: { aegis: string; id: number | null; name: string; icon: string };
  accessoryItem: { aegis: string; id: number | null; name: string; icon: string };
  foodItem: { aegis: string; id: number | null; name: string; icon: string };
  captureRate: number | null;
  fullness: number | null;
  hungryDelaySeconds: number;
  intimacyFed: number | null;
  bonuses: string[];
  supportBonuses: string[];
};

const petsAll: PetEntry[] = (petsRaw as unknown as PetEntry[])
  .slice()
  .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));

function escapeHtml(s: string): string {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalize(s: string): string {
  return String(s || "").trim().toLowerCase();
}

function joinLines(lines: string[] | undefined): string {
  const xs = Array.isArray(lines) ? lines.map((x) => String(x || "").trim()).filter(Boolean) : [];
  if (!xs.length) return "-";
  return `<div class="desc-block desc-block--plain">${xs.map((x) => escapeHtml(x)).join("<br />")}</div>`;
}

function itemCellHtml(
  item: { name: string; icon: string; id: number | null } | null | undefined,
): string {
  if (!item || (!item.name && !item.icon)) return `<span class="pets-itemcell__name">-</span>`;
  const name = item.name ? escapeHtml(item.name) : "-";
  const icon = item.icon ? escapeHtml(item.icon) : "";
  const alt = item.name ? escapeHtml(item.name) : "Item";
  const img = icon
    ? `<img class="pets-itemcell__icon" src="${icon}" alt="${alt}" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-id="${escapeHtml(
        String(item.id ?? ""),
      )}" />`
    : "";
  return `<div class="pets-itemcell">${img}<span class="pets-itemcell__name">${name}</span></div>`;
}

function itemIconOnlyHtml(
  item: { name: string; icon: string; id: number | null } | null | undefined,
): string {
  if (!item?.icon) return "";
  const icon = escapeHtml(item.icon);
  const alt = item.name ? escapeHtml(item.name) : "Egg";
  return `<img class="pets-egg-icon" src="${icon}" alt="${alt}" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-id="${escapeHtml(
    String(item.id ?? ""),
  )}" />`;
}

function mobSpriteCandidates(mobId: number): string[] {
  // Divine Pride is the best general source if available; keep multiple patterns as fallbacks.
  // (Some hosts reject server-side fetch but allow browser image loads.)
  return [
    `https://static.divine-pride.net/images/mobs/png/${mobId}.png`,
    `https://static.divine-pride.net/images/mobs/${mobId}.png`,
  ];
}

function cardHtml(p: PetEntry): string {
  const effects = joinLines([...(p.bonuses ?? []), ...(p.supportBonuses ?? [])]);
  const tame = itemCellHtml(p.tameItem);
  const eggIcon = itemIconOnlyHtml(p.eggItem);
  const acc = itemCellHtml(p.accessoryItem);
  const food = itemCellHtml(p.foodItem);
  const level = Number.isFinite(p.mobLevel) ? p.mobLevel : 1;
  const capture = typeof p.captureRate === "number" ? `${(p.captureRate / 100).toFixed(2)}%` : "-";
  const hungryDelay = typeof p.hungryDelaySeconds === "number" && p.hungryDelaySeconds > 0 ? p.hungryDelaySeconds : 60;
  const fullness = typeof p.fullness === "number" ? p.fullness : null;
  const hungerPerMin =
    fullness == null ? "-" : (fullness * (60 / hungryDelay)).toFixed(2).replace(/\\.00$/, "");
  const intimacy = typeof p.intimacyFed === "number" ? `${p.intimacyFed}` : "-";

  const mobId = typeof p.mobId === "number" && Number.isFinite(p.mobId) ? p.mobId : null;
  const bgSpriteUrl = mobId ? mobSpriteCandidates(mobId)[0] : "";
  const bgSprite = bgSpriteUrl
    ? `<img class="pets-card__bg" src="${escapeHtml(bgSpriteUrl)}" alt="" loading="lazy" decoding="async" />`
    : "";

  const dropSources =
    Array.isArray(p.tameItemSources) && p.tameItemSources.length
      ? `<div class="pets-sources">${p.tameItemSources
          .slice(0, 6)
          .map(
            (s) =>
              `<div class="pets-source">${escapeHtml(s.monster)} <span class="pets-source__meta">Lv ${escapeHtml(
                String(s.level),
              )} · ${(s.rate / 100).toFixed(2)}%</span></div>`,
          )
          .join("")}</div>`
      : `<span class="pets-itemcell__name">-</span>`;

  const npcSources =
    Array.isArray(p.tameItemNpcSources) && p.tameItemNpcSources.length
      ? `<div class="pets-sources">${p.tameItemNpcSources
          .slice(0, 3)
          .map((s) => {
            const where = s.map
              ? `${escapeHtml(s.map)}${Number.isFinite(s.x) && Number.isFinite(s.y) ? ` ${s.x}/${s.y}` : ""}`
              : "";
            const z = typeof s.zeny === "number" && s.zeny > 0 ? ` · ${s.zeny.toLocaleString()}z` : "";
            const req =
              Array.isArray(s.requires) && s.requires.length
                ? `<br/>${s.requires
                    .slice(0, 4)
                    .map((r) => `${escapeHtml(r.item)} × ${escapeHtml(String(r.amount ?? 1))}`)
                    .join("<br/>")}`
                : "";
            return `<div class="pets-source">NPC: ${escapeHtml(s.npc)}${where ? ` <span class="pets-source__meta">${where}${z}</span>` : ""}${req}</div>`;
          })
          .join("")}</div>`
      : `<span class="pets-itemcell__name">-</span>`;

  return `<article class="pets-card">
    ${bgSprite}
    <header class="pets-card__head">
      <div class="pets-monster pets-card__monster">
        <div class="pets-monster__top">
          ${eggIcon}
          <button type="button" class="pets-monster__name" data-mob-id="${escapeHtml(String(p.mobId ?? ""))}" aria-label="Preview sprite: ${escapeHtml(p.name)}">
            ${escapeHtml(p.name)}
          </button>
        </div>
        <div class="pets-monster__meta">Lv ${escapeHtml(String(level))}</div>
      </div>
      <div class="pets-card__rates">
        <div class="pets-item"><span class="pets-item__k">Hunger</span> ${escapeHtml(String(hungerPerMin))}/min</div>
        <div class="pets-item"><span class="pets-item__k">Intimacy</span> +${escapeHtml(String(intimacy))}/feed</div>
        <div class="pets-item"><span class="pets-item__k">Capture</span> ${escapeHtml(String(capture))}</div>
      </div>
    </header>

    <div class="pets-card__grid">
      <div class="pets-card__cell">
        <div class="pets-card__k">Tame item</div>
        ${tame}
      </div>
      <div class="pets-card__cell">
        <div class="pets-card__k">Food</div>
        ${food}
      </div>
      <div class="pets-card__cell pets-card__cell--wide">
        <div class="pets-card__k">Accessory</div>
        ${acc}
      </div>
      <div class="pets-card__cell pets-card__cell--sources">
        <div class="pets-card__k">Sources</div>
        <div class="pets-source-groups">
          <div class="pets-source-group">
            <div class="pets-source-group__title">Drops</div>
            ${dropSources}
          </div>
          <div class="pets-source-group">
            <div class="pets-source-group__title">NPC</div>
            ${npcSources}
          </div>
        </div>
      </div>
    </div>

    <div class="pets-card__bonuses">
      <div class="pets-card__k">Bonuses</div>
      ${effects}
    </div>
  </article>`;
}

function renderCards(rows: PetEntry[]): string {
  if (!rows.length) return `<div class="cards-empty">No matches.</div>`;
  return rows.map(cardHtml).join("");
}

function syncPetCardSpriteAnchors(root: HTMLElement): void {
  const cards = Array.from(root.querySelectorAll<HTMLElement>(".pets-card"));
  for (const card of cards) {
    const bonuses = card.querySelector<HTMLElement>(".pets-card__bonuses");
    if (!bonuses) continue;
    card.style.setProperty("--pets-card-bonuses-h", `${bonuses.offsetHeight}px`);
  }
}

function mount(root: HTMLElement): void {
  root.innerHTML = `
    <header class="site-header">
      <div class="site-header__left">
        <a class="site-brand" href="/">RO Pre-Renewal</a>
        <nav class="site-nav" aria-label="Site">
          <a class="site-nav__link" href="/skills">Skill Planner</a>
          <a class="site-nav__link" href="/cards">Card Library</a>
          <a class="site-nav__link site-nav__link--active" href="/pets" aria-current="page">Pets</a>
        </nav>
      </div>
    </header>

    <section class="page">
      <div class="cards-windowhead" role="banner" aria-label="Pet Library header">
        <div class="cards-windowhead__left">
          <h1 class="cards-windowhead__title">Pet Library</h1>
        </div>
      </div>

      <div class="cards-toolbar" role="search">
        <label class="cards-search">
          <span class="cards-search__label">Search</span>
          <input id="q" class="cards-search__input" type="search" placeholder="search..." autocomplete="off" />
        </label>
        <div class="cards-count" id="count" role="status" aria-live="polite"></div>
      </div>

      <div class="pets-cards-wrap" id="pets-cards-wrap">
        <div class="pets-cards" id="pets-cards"></div>
      </div>
    </section>
  `;

  const q = root.querySelector("#q") as HTMLInputElement;
  const cardsEl = root.querySelector("#pets-cards") as HTMLElement;
  const countEl = root.querySelector("#count") as HTMLElement;

  const apply = (): void => {
    const query = normalize(q.value);
    const filtered = petsAll.filter((p) => {
      const hay = [
        p.name,
        p.tameItem?.name ?? "",
        p.eggItem?.name ?? "",
        p.accessoryItem?.name ?? "",
        p.foodItem?.name ?? "",
        ...(p.bonuses ?? []),
        ...(p.supportBonuses ?? []),
        ...(p.tameItemSources ?? []).flatMap((s) => [s.monster]),
        ...(p.tameItemNpcSources ?? []).flatMap((s) => [s.npc, s.map ?? "", ...s.requires.map((r) => r.item)]),
      ]
        .join(" ")
        .toLowerCase();
      if (query && !hay.includes(query)) return false;
      return true;
    });
    cardsEl.innerHTML = renderCards(filtered);
    syncPetCardSpriteAnchors(root);
    countEl.textContent = `${filtered.length.toLocaleString()} / ${petsAll.length.toLocaleString()} pets`;
  };

  q.addEventListener("input", apply);
  apply();
}

mount(document.querySelector("#app") as HTMLElement);

// --- Sprite tooltip (Pets) ---------------------------------------------------

function ensurePetsSpriteTooltip(): HTMLElement {
  const existing = document.querySelector("#pets-sprite-tooltip") as HTMLElement | null;
  if (existing) return existing;
  const el = document.createElement("div");
  el.id = "pets-sprite-tooltip";
  el.className = "cards-map-tooltip pets-sprite-tooltip";
  el.innerHTML = `
    <div class="cards-map-tooltip__inner">
      <div class="pets-sprite-tooltip__spinner" id="pets-sprite-tooltip-spinner" aria-hidden="true"></div>
      <div class="pets-sprite-tooltip__imgwrap" aria-hidden="true">
        <img class="cards-map-tooltip__img" id="pets-sprite-tooltip-img" alt="" loading="eager" decoding="async" referrerpolicy="no-referrer" />
      </div>
      <p class="cards-map-tooltip__missing" id="pets-sprite-tooltip-missing" hidden>Sprite not available.</p>
    </div>
  `;
  document.body.appendChild(el);
  return el;
}

function setupPetsSpriteTooltip(root: HTMLElement): void {
  // Don’t attach hover-only UI on touch devices.
  if (!window.matchMedia("(hover: hover)").matches) return;

  const tip = ensurePetsSpriteTooltip();
  const img = tip.querySelector("#pets-sprite-tooltip-img") as HTMLImageElement;
  const missing = tip.querySelector("#pets-sprite-tooltip-missing") as HTMLParagraphElement;
  const spinner = tip.querySelector("#pets-sprite-tooltip-spinner") as HTMLElement;
  let currentKey = "";
  let currentUrls: string[] = [];
  let urlIdx = 0;

  const hide = (): void => {
    tip.classList.remove("cards-map-tooltip--visible");
    tip.classList.remove("pets-sprite-tooltip--loading");
    currentKey = "";
  };

  const setPos = (clientX: number, clientY: number): void => {
    const pad = 14;
    const x = Math.max(pad, Math.min(window.innerWidth - pad, clientX));
    const y = Math.max(pad, Math.min(window.innerHeight - pad, clientY));
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
    const below = y < 160;
    tip.classList.toggle("cards-map-tooltip--below", below);
  };

  const loadNext = (): void => {
    if (urlIdx >= currentUrls.length) {
      img.hidden = true;
      spinner.hidden = true;
      missing.hidden = false;
      tip.classList.remove("pets-sprite-tooltip--loading");
      return;
    }
    img.hidden = false;
    spinner.hidden = false;
    missing.hidden = true;
    tip.classList.add("pets-sprite-tooltip--loading");
    // Clear previous sizing so we don't flash a stale box while the new image loads.
    img.style.removeProperty("width");
    img.style.removeProperty("height");
    img.src = currentUrls[urlIdx++];
  };

  img.addEventListener("error", () => loadNext());
  img.addEventListener("load", () => {
    // True 2x sizing (avoid transform scale clipping).
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      img.style.width = `${img.naturalWidth * 2}px`;
      img.style.height = `${img.naturalHeight * 2}px`;
    }
    tip.classList.remove("pets-sprite-tooltip--loading");
    spinner.hidden = true;
    img.hidden = false;
    missing.hidden = true;
  });

  root.addEventListener("mouseleave", hide);
  root.addEventListener("pointerdown", hide);
  root.addEventListener("scroll", hide, { capture: true });

  root.addEventListener("pointermove", (e) => {
    if (!tip.classList.contains("cards-map-tooltip--visible")) return;
    setPos(e.clientX, e.clientY);
  });

  root.addEventListener("pointerover", (e) => {
    const t = (e.target as HTMLElement | null)?.closest?.(".pets-monster__name") as HTMLElement | null;
    if (!t) return;
    const mobId = Number(t.dataset.mobId);
    if (!Number.isFinite(mobId) || mobId <= 0) return;
    const key = `${mobId}`;
    if (key !== currentKey) {
      currentKey = key;
      currentUrls = mobSpriteCandidates(mobId);
      urlIdx = 0;
      // Start from a clean state so we never show the previous mob while loading the next.
      img.removeAttribute("src");
      img.hidden = true;
      missing.hidden = true;
      spinner.hidden = false;
      tip.classList.add("pets-sprite-tooltip--loading");
      loadNext();
    }
    setPos((e as PointerEvent).clientX, (e as PointerEvent).clientY);
    tip.classList.add("cards-map-tooltip--visible");
  });

  root.addEventListener("pointerout", (e) => {
    const from = e.target as HTMLElement | null;
    const to = (e as PointerEvent).relatedTarget as HTMLElement | null;
    if (!from?.closest?.(".pets-monster__name")) return;
    if (to && to.closest?.(".pets-monster__name")) return;
    hide();
  });
}

setupPetsSpriteTooltip(document.querySelector("#app") as HTMLElement);

