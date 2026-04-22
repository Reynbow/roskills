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

function rowHtml(p: PetEntry): string {
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
    fullness == null ? "-" : (fullness * (60 / hungryDelay)).toFixed(2).replace(/\.00$/, "");
  const intimacy = typeof p.intimacyFed === "number" ? `${p.intimacyFed}` : "-";

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
            const where = s.map ? `${escapeHtml(s.map)}${Number.isFinite(s.x) && Number.isFinite(s.y) ? ` ${s.x}/${s.y}` : ""}` : "";
            const z = typeof s.zeny === "number" && s.zeny > 0 ? ` · ${s.zeny.toLocaleString()}z` : "";
            const req =
              Array.isArray(s.requires) && s.requires.length
                ? ` — ${s.requires
                    .slice(0, 4)
                    .map((r) => `${escapeHtml(r.item)}×${escapeHtml(String(r.amount ?? 1))}`)
                    .join(", ")}`
                : "";
            return `<div class="pets-source">NPC: ${escapeHtml(s.npc)}${where ? ` <span class="pets-source__meta">${where}${z}</span>` : ""}${req}</div>`;
          })
          .join("")}</div>`
      : "";

  const sources =
    dropSources === `<span class="pets-itemcell__name">-</span>` && !npcSources
      ? `<span class="pets-itemcell__name">-</span>`
      : `<div class="pets-source-groups">
          <div class="pets-source-group">
            <div class="pets-source-group__title">Drops</div>
            ${dropSources}
          </div>
          <div class="pets-source-group">
            <div class="pets-source-group__title">NPC</div>
            ${npcSources || `<span class="pets-itemcell__name">-</span>`}
          </div>
        </div>`;

  return `<tr>
    <td class="pets-col-name" data-label="Monster">
      <div class="pets-monster">
        <div class="pets-monster__top">
          ${eggIcon}
          <div class="cards-name">${escapeHtml(p.name)}</div>
        </div>
        <div class="pets-monster__meta">Lv ${escapeHtml(String(level))}</div>
      </div>
    </td>
    <td class="pets-col-tame" data-label="Tame">${tame}</td>
    <td class="pets-col-from" data-label="Sources">${sources}</td>
    <td class="pets-col-acc" data-label="Accessory">${acc}</td>
    <td class="pets-col-food" data-label="Food">${food}</td>
    <td class="pets-col-effects" data-label="Bonuses">${effects}</td>
    <td class="pets-col-rates" data-label="Rates">
      <div class="pets-items">
        <div class="pets-item"><span class="pets-item__k">Hunger</span> ${escapeHtml(String(hungerPerMin))}/min</div>
        <div class="pets-item"><span class="pets-item__k">Intimacy</span> +${escapeHtml(String(intimacy))}/feed</div>
        <div class="pets-item"><span class="pets-item__k">Capture</span> ${escapeHtml(String(capture))}</div>
      </div>
    </td>
  </tr>`;
}

function renderRows(rows: PetEntry[]): string {
  if (!rows.length) return `<tr><td class="cards-empty" colspan="3">No matches.</td></tr>`;
  return rows.map(rowHtml).join("");
}

function mount(root: HTMLElement): void {
  root.innerHTML = `
    <header class="site-header">
      <div class="site-header__left">
        <a class="site-brand" href="/index.html">RO Pre-Renewal</a>
        <nav class="site-nav" aria-label="Site">
          <a class="site-nav__link" href="/index.html">Skill Planner</a>
          <a class="site-nav__link" href="/cards.html">Card Library</a>
          <a class="site-nav__link site-nav__link--active" href="/pets.html" aria-current="page">Pets</a>
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

      <div class="cards-table-wrap">
        <table class="cards-table pets-table">
          <colgroup>
            <col class="pets-col-name" />
            <col class="pets-col-tame" />
            <col class="pets-col-from" />
            <col class="pets-col-acc" />
            <col class="pets-col-food" />
            <col class="pets-col-effects" />
            <col class="pets-col-rates" />
          </colgroup>
          <thead>
            <tr>
              <th class="pets-col-name" scope="col">Monster</th>
              <th class="pets-col-tame" scope="col">Tame item</th>
              <th class="pets-col-from" scope="col">Sources</th>
              <th class="pets-col-acc" scope="col">Accessory</th>
              <th class="pets-col-food" scope="col">Food</th>
              <th class="pets-col-effects" scope="col">Bonuses</th>
              <th class="pets-col-rates" scope="col">Rates</th>
            </tr>
          </thead>
          <tbody id="rows"></tbody>
        </table>
      </div>
    </section>
  `;

  const q = root.querySelector("#q") as HTMLInputElement;
  const rowsEl = root.querySelector("#rows") as HTMLElement;
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
    rowsEl.innerHTML = renderRows(filtered);
    countEl.textContent = `${filtered.length.toLocaleString()} / ${petsAll.length.toLocaleString()} pets`;
  };

  q.addEventListener("input", apply);
  apply();
}

mount(document.querySelector("#app") as HTMLElement);

