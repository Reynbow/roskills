import "./style.css";
import { inject } from "@vercel/analytics";
import { getPlannerGameMode, initPlannerGameModeFromUrlOrStorage } from "./game-mode";
import { EPISODE_TOTAL, EPISODES, episodeArmourPiecesFlat, episodeWeaponPiecesFlat } from "./msq-episodes";
import { getMsqItemTooltipPayload } from "./msq-item-tooltip-lookup";
import type { MsqEpisode, MsqWikiPart, MsqWikiRow, RoArmourPiece, RoWeaponPiece } from "./msq-types";
import { divinePrideItemIconUrl, roItemTooltipHtml, roWeaponTooltipHtml } from "./ro-item-tooltip-html";
import { setupRoTooltipFloater } from "./ro-tooltip-floater";
import { siteHeaderRowHtml, wireSiteGameModeToggle } from "./site-header";

try {
  inject();
} catch {
  /* ignore */
}

function escapeHtml(s: string): string {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function wikiArticleUrl(wikiPath: string): string {
  return `https://irowiki.org/wiki/${wikiPath}`;
}

function wikiPartsHtml(parts: readonly MsqWikiPart[]): string {
  return parts
    .map((p) => {
      if (p.kind === "text") return escapeHtml(p.text);
      const href = wikiArticleUrl(p.wikiPath);
      return `<a class="msq-step-card__wiki-a" href="${escapeHtml(href)}" target="_blank" rel="noreferrer noopener">${escapeHtml(p.text)}</a>`;
    })
    .join("");
}

function wikiRowPlain(r: MsqWikiRow): string {
  return r.value.map((p) => p.text).join("");
}

function normalize(s: string): string {
  return String(s || "").trim().toLowerCase();
}

function wikiArticleLabel(url: string): string {
  try {
    const u = new URL(url);
    const seg = u.pathname.split("/").filter(Boolean).pop() ?? "";
    return decodeURIComponent(seg.replace(/_/g, " ")) || "—";
  } catch {
    return "—";
  }
}

const ARMOUR_SUBTYPE_GROUP_ORDER = ["Garment", "Shoes", "Accessory", "Armor"] as const;

function armourEpisodesUseSubtypeGroups(armourSetName: string): boolean {
  return (
    armourSetName === "Noblesse" ||
    armourSetName === "Imperial" ||
    armourSetName === "Grace" ||
    armourSetName === "Automatic" ||
    armourSetName === "Gray Wolf" ||
    armourSetName === "Glacier" ||
    armourSetName === "Snow Flower"
  );
}

function armourSubtypeGroupSortKey(subtype: string): number {
  const i = (ARMOUR_SUBTYPE_GROUP_ORDER as readonly string[]).indexOf(subtype);
  return i === -1 ? 99 : i;
}

function armourIconHitHtml(p: RoArmourPiece | RoWeaponPiece): string {
  return `<span class="msq-episode-card__armour-icon-hit" role="listitem" data-piece-id="${p.id}"><span class="msq-episode-card__armour-icon-wrap"><img src="${escapeHtml(
    divinePrideItemIconUrl(p.id),
  )}" alt="" width="32" height="32" loading="lazy" decoding="async" referrerpolicy="no-referrer" /></span></span>`;
}

function armourIconsListHtml(pieces: readonly RoArmourPiece[]): string {
  return `<div class="msq-episode-card__armour-icons" role="list">${pieces.map(armourIconHitHtml).join("")}</div>`;
}

function weaponIconsListHtml(pieces: readonly RoWeaponPiece[]): string {
  return `<div class="msq-episode-card__armour-icons" role="list">${pieces.map(armourIconHitHtml).join("")}</div>`;
}

/** Same bordered panel as armour subtype groups (Armor, Garment, …). */
function weaponEquipmentBlockHtml(pieces: readonly RoWeaponPiece[]): string {
  if (!pieces.length) return "";
  const sorted = pieces.slice().sort((a, b) => a.name.localeCompare(b.name));
  return `<div class="msq-episode-card__armour-group msq-episode-card__weapon-block" role="group" aria-label="Weapon">
      <span class="msq-episode-card__armour-group-label">Weapon</span>
      ${weaponIconsListHtml(sorted)}
    </div>`;
}

function armourSubtypeGroupedIconsHtml(pieces: readonly RoArmourPiece[]): string {
  const bySubtype = new Map<string, RoArmourPiece[]>();
  for (const p of pieces) {
    const key = p.subtype?.trim() || "Other";
    const arr = bySubtype.get(key);
    if (arr) arr.push(p);
    else bySubtype.set(key, [p]);
  }
  const keys = [...bySubtype.keys()].sort((a, b) => armourSubtypeGroupSortKey(a) - armourSubtypeGroupSortKey(b));
  return `<div class="msq-episode-card__armour-icon-groups">
    ${keys
      .map((key) => {
        const sorted = bySubtype.get(key)!.slice().sort((a, b) => a.name.localeCompare(b.name));
        return `<div class="msq-episode-card__armour-group" role="group" aria-label="${escapeHtml(key)}">
      <span class="msq-episode-card__armour-group-label">${escapeHtml(key)}</span>
      ${armourIconsListHtml(sorted)}
    </div>`;
      })
      .join("")}
  </div>`;
}

function armourStripHtml(ep: MsqEpisode, opts?: { omitOuterSetTitle?: boolean }): string {
  const nameHtml = opts?.omitOuterSetTitle
    ? ""
    : `<div class="msq-episode-card__armour-set-name">${escapeHtml(ep.armourSetName)}</div>`;
  const flat = episodeArmourPiecesFlat(ep);

  const renderPieces = (pieces: readonly RoArmourPiece[], groupKey: string): string => {
    if (!pieces.length) return "";
    return armourEpisodesUseSubtypeGroups(groupKey) ?
        armourSubtypeGroupedIconsHtml(pieces)
      : armourIconsListHtml(pieces);
  };

  let iconsHtml = "";
  if (ep.armourSegments?.length) {
    const segs = ep.armourSegments
      .map(
        (seg) => `<div class="msq-episode-card__armour-segment">
      <div class="msq-episode-card__armour-segment-name">${escapeHtml(seg.segmentName)}</div>
      ${renderPieces(seg.pieces, seg.segmentName)}
    </div>`,
      )
      .join("");
    const glacierSnowTwoCol =
      ep.armourSegments.length === 2 &&
      ep.armourSegments.some((s) => s.segmentName === "Glacier") &&
      ep.armourSegments.some((s) => s.segmentName === "Snow Flower");
    iconsHtml = glacierSnowTwoCol
      ? `<div class="msq-episode-card__armour-segments msq-episode-card__armour-segments--glacier-snowflower">${segs}</div>`
      : segs;
  } else if (flat.length) {
    iconsHtml = renderPieces(ep.armourPieces, ep.armourSetName);
  }

  const noteHtml = ep.armourIconNote
    ? `<p class="msq-episode-card__armour-note">${escapeHtml(ep.armourIconNote)}</p>`
    : "";

  if (!flat.length && !ep.armourIconNote) {
    return `<div class="msq-episode-card__armour">${nameHtml}<p class="msq-episode-card__armour-note">—</p></div>`;
  }

  return `<div class="msq-episode-card__armour">${nameHtml}${iconsHtml}${noteHtml}</div>`;
}

function weaponStripHtml(ep: MsqEpisode, opts?: { omitOuterSetTitle?: boolean }): string {
  const flat = episodeWeaponPiecesFlat(ep);
  const weaponSetName = ep.weaponSetName ?? "";
  if (!weaponSetName && !flat.length && !ep.weaponIconNote) return "";

  const nameHtml =
    opts?.omitOuterSetTitle || !weaponSetName
      ? ""
      : `<div class="msq-episode-card__armour-set-name">${escapeHtml(weaponSetName)}</div>`;

  let iconsHtml = "";
  if (ep.weaponSegments?.length && weaponSetName) {
    const segs = ep.weaponSegments
      .map(
        (seg) => `<div class="msq-episode-card__armour-segment msq-episode-card__weapon-segment">
      <div class="msq-episode-card__armour-segment-name">${escapeHtml(seg.segmentName)}</div>
      ${weaponEquipmentBlockHtml(seg.pieces)}
    </div>`,
      )
      .join("");
    iconsHtml =
      ep.weaponSegments.length > 1 ?
        `<div class="msq-episode-card__weapon-segments msq-episode-card__weapon-segments--row">${segs}</div>`
      : segs;
  } else if (flat.length && weaponSetName) {
    iconsHtml = weaponEquipmentBlockHtml(flat);
  }

  const noteHtml = ep.weaponIconNote
    ? `<p class="msq-episode-card__armour-note">${escapeHtml(ep.weaponIconNote)}</p>`
    : "";

  if (!flat.length && !ep.weaponIconNote) {
    return `<div class="msq-episode-card__weapons">${nameHtml}<p class="msq-episode-card__armour-note">—</p></div>`;
  }

  return `<div class="msq-episode-card__weapons">${nameHtml}${iconsHtml}${noteHtml}</div>`;
}

/** Right-hand equipment card: armour + optional weapons (stacked). */
function episodeEquipmentPanelHtml(ep: MsqEpisode): string {
  const stripOpts = { omitOuterSetTitle: true } as const;
  const weapons = weaponStripHtml(ep, stripOpts);
  return `<div class="msq-step-card__equip-stack">
      <div class="msq-step-card__equip-section">
        <div class="pets-card__k">Armour</div>
        ${armourStripHtml(ep, stripOpts)}
      </div>
      ${
        weapons ?
          `<div class="msq-step-card__equip-section">
        <div class="pets-card__k">Weapons</div>
        ${weapons}
      </div>`
        : ""
      }
    </div>`;
}

function setupMsqArmourTooltips(root: HTMLElement, gridEl: HTMLElement): () => void {
  const tipEl = root.querySelector("#msq-armour-tooltip") as HTMLElement;
  if (!tipEl) return () => {};
  return setupRoTooltipFloater(gridEl, tipEl, {
    hitSelector: ".msq-episode-card__armour-icon-hit",
    renderTip: (target) => {
      const id = parseInt((target.getAttribute("data-piece-id") || "").trim(), 10);
      if (!Number.isFinite(id)) return null;
      const payload = getMsqItemTooltipPayload(id);
      if (!payload) return null;
      return payload.kind === "armour" ? roItemTooltipHtml(payload.piece) : roWeaponTooltipHtml(payload.piece);
    },
  });
}

function wikiKvTableHtml(rows: readonly MsqWikiRow[]): string {
  const body = rows
    .map(
      (r) =>
        `<tr><th scope="row" class="msq-step-card__wiki-k">${escapeHtml(r.label)}</th><td class="msq-step-card__wiki-v">${wikiPartsHtml(r.value)}</td></tr>`,
    )
    .join("");
  return `<table class="msq-step-card__wiki-kv"><tbody>${body}</tbody></table>`;
}

function wikiQuestMetaHtml(ep: MsqEpisode): string {
  const req = ep.wikiRequirements;
  const rew = ep.wikiRewards;
  if (!req?.length && !rew?.length) return "";
  const blocks: string[] = [];
  if (req?.length) {
    blocks.push(`<div class="msq-step-card__wiki-block">
        <div class="pets-card__k">Requirements</div>
        ${wikiKvTableHtml(req)}
      </div>`);
  }
  if (rew?.length) {
    blocks.push(`<div class="msq-step-card__wiki-block">
        <div class="pets-card__k">Rewards</div>
        ${wikiKvTableHtml(rew)}
      </div>`);
  }
  return blocks.join("");
}

function cardHtml(ep: MsqEpisode, index: number, query: string): string {
  const slug = wikiArticleLabel(ep.url);
  const hay = normalize(
    [
      ep.episode,
      ep.title,
      ep.synopsis,
      slug,
      ep.armourSetName,
      ep.armourIconNote ?? "",
      ep.weaponSetName ?? "",
      ep.weaponIconNote ?? "",
      ...(ep.wikiRequirements ?? []).flatMap((r) => [r.label, wikiRowPlain(r)]),
      ...(ep.wikiRewards ?? []).flatMap((r) => [r.label, wikiRowPlain(r)]),
      ...(ep.armourSegments?.map((s) => s.segmentName) ?? []),
      ...(ep.weaponSegments?.map((s) => s.segmentName) ?? []),
      ...episodeArmourPiecesFlat(ep).flatMap((p) => [p.name, p.flavor, ...p.effects, p.jobs]),
      ...episodeWeaponPiecesFlat(ep).flatMap((w) => [w.name, w.flavor, ...w.effects, w.jobs]),
    ].join(" "),
  );
  if (query && !hay.includes(query)) return "";

  const order = index + 1;

  const ariaStory = escapeHtml(`Open iRO Wiki walkthrough: ${ep.title}`);
  const ariaEquip = escapeHtml(`Open iRO Wiki (${ep.title} — equipment notes)`);

  return `<div class="msq-step-row" role="group" aria-label="${escapeHtml(`${ep.episode}: ${ep.title}`)}">
    <div class="pets-card msq-episode-card msq-step-card msq-step-card--story">
      <div class="msq-episode-card__bg" aria-hidden="true">ep ${escapeHtml(ep.id)}</div>

      <a class="msq-episode-card__step-bar msq-episode-card__step-bar--link" href="${escapeHtml(ep.url)}" target="_blank" rel="noreferrer noopener" aria-label="${ariaStory}">
        <div class="msq-episode-card__step-bar-main">
          <div class="pets-card__k msq-episode-card__step-bar-ep">${escapeHtml(ep.episode)}</div>
          <div class="msq-episode-card__step-bar-title">${escapeHtml(ep.title)}</div>
        </div>
        <div class="msq-episode-card__step-bar-nums" aria-hidden="true">
          <span class="msq-episode-card__step-n">${order}</span>
          <span class="msq-episode-card__step-slash">/</span>
          <span class="msq-episode-card__step-denom">${EPISODE_TOTAL}</span>
        </div>
      </a>

      <div class="msq-step-card__story-body">
        <div class="pets-card__k">About this chapter</div>
        <p class="msq-episode-card__text">${escapeHtml(ep.synopsis)}</p>
      </div>

      ${wikiQuestMetaHtml(ep)}

      <a class="msq-step-card__wiki-cta" href="${escapeHtml(ep.url)}" target="_blank" rel="noreferrer noopener">iRO Wiki →</a>
    </div>

    <a class="pets-card msq-episode-card msq-step-card msq-step-card--equip" href="${escapeHtml(ep.url)}" target="_blank" rel="noreferrer noopener" aria-label="${ariaEquip}">
      <div class="msq-episode-card__bg msq-step-card__equip-bg" aria-hidden="true">gear</div>
      <header class="pets-card__head msq-step-card__equip-head">
        <div class="pets-monster msq-episode-card__lead">
          <div class="pets-card__k">Episode equipment</div>
          <div class="msq-episode-card__title msq-step-card__equip-title">${escapeHtml(ep.armourSetName)}${ep.weaponSetName ? ` · ${escapeHtml(ep.weaponSetName)}` : ""}</div>
          <div class="pets-monster__meta">Hover icons for stats · same walkthrough link</div>
        </div>
      </header>
      ${episodeEquipmentPanelHtml(ep)}
    </a>
  </div>`;
}

function mount(root: HTMLElement): void {
  if (getPlannerGameMode() !== "renewal") {
    window.location.assign("/skills");
    return;
  }

  root.innerHTML = `
    ${siteHeaderRowHtml("msq")}

    <section class="page">
      <div class="cards-windowhead" role="banner" aria-label="Main story quests">
        <div class="cards-windowhead__left">
          <h1 class="cards-windowhead__title">MSQ</h1>
        </div>
      </div>

      <div class="cards-toolbar" role="search">
        <label class="cards-search">
          <span class="cards-search__label">Search</span>
          <input id="q" class="cards-search__input" type="search" placeholder="search episodes…" autocomplete="off" />
        </label>
        <div class="cards-count" id="count" role="status" aria-live="polite"></div>
      </div>

      <div class="pets-cards-wrap msq-episode-page__cards">
        <div class="pets-cards msq-episode-rows" id="msq-cards"></div>
      </div>

      <div id="msq-armour-tooltip" class="ro-tooltip-floater" role="tooltip" aria-hidden="true"></div>

      <p class="msq-footnote">
        Item stats and flavor text follow Divine Pride (iRO). Requirements and Rewards on each story card copy the first main-quest infobox on the linked iRO Wiki page (same labels and values as plain text). The wiki may show VIP amounts in tooltips or list different numbers on later quest boxes; always verify in-game.
      </p>
    </section>
  `;

  wireSiteGameModeToggle(root);

  const q = root.querySelector("#q") as HTMLInputElement;
  const grid = root.querySelector("#msq-cards") as HTMLElement;
  const countEl = root.querySelector("#count") as HTMLElement;

  const hideArmourTip = setupMsqArmourTooltips(root, grid);

  const apply = (): void => {
    hideArmourTip();

    const query = normalize(q.value);
    const items = EPISODES.map((ep, i) => cardHtml(ep, i, query)).filter(Boolean);
    grid.innerHTML = items.join("") || `<div class="cards-empty">No matches.</div>`;
    countEl.textContent = `${items.length.toLocaleString()} / ${EPISODES.length.toLocaleString()} episodes`;
  };

  q.addEventListener("input", apply);
  apply();
}

initPlannerGameModeFromUrlOrStorage();
mount(document.querySelector("#app") as HTMLElement);
