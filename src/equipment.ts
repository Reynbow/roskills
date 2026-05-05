import "./style.css";
import { inject } from "@vercel/analytics";
import { initPlannerGameModeFromUrlOrStorage } from "./game-mode";
import { getPlannerGameMode } from "./game-mode";
import { getMsqItemTooltipPayload } from "./msq-item-tooltip-lookup";
import type { F2pScrapedItemTooltip } from "./ro-item-tooltip-html";
import {
  roFallbackItemTooltipHtml,
  roItemTooltipHtml,
  roScrapedItemTooltipHtml,
  roWeaponTooltipHtml,
} from "./ro-item-tooltip-html";
import { setupRoTooltipFloater } from "./ro-tooltip-floater";
import { siteHeaderRowHtml, wireSiteGameModeToggle } from "./site-header";
import wikiBodyHtml from "./data/free-to-play-equipment-snapshot.html?raw";
import f2pTooltipsRaw from "./data/f2p-item-tooltips.json";

try {
  inject();
} catch {
  /* ignore */
}

const ITEM_DB_HREF_RE = /\/(?:db\/item-info|database\/item)\/(\d+)/i;
const F2P_TOOLTIPS_BY_ID = f2pTooltipsRaw as Record<string, F2pScrapedItemTooltip | undefined>;
const F2P_NAVI_TOAST_MS = 950;

function sanitizeWikiHtml(html: string): string {
  return html
    .replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/href\s*=\s*(["'])\s*javascript:[^"']*\1/gi, 'href="#"');
}

/** Wrap wiki NPC name + naviBlock so map previews can tooltip on hover of the label or coords. */
function enhanceF2pNaviMaps(host: HTMLElement): void {
  const blocks = Array.from(host.querySelectorAll(".naviBlock"));
  for (const block of blocks) {
    if (!(block instanceof HTMLElement)) continue;
    if (block.closest(".f2p-navi-wrap")) continue;
    const b = block.previousElementSibling;
    if (b?.tagName !== "B") continue;
    const parent = b.parentNode;
    if (!parent) continue;

     // Remove the original whitespace text node between <b> and .naviBlock (we'll re-insert exact spacing).
     const between = b.nextSibling;
     if (between && between.nodeType === Node.TEXT_NODE) {
       const t = (between.textContent ?? "").replace(/\u00a0/g, " ");
       if (!t || /^\s+$/.test(t)) between.parentNode?.removeChild(between);
     }

    const wrap = document.createElement("span");
    wrap.className = "f2p-navi-wrap";
    parent.insertBefore(wrap, b);
    wrap.appendChild(b);

     const npcName = (b.textContent || "").trim();
     const spacer =
       npcName === "Blacksmith Cineson" ? "" : " ";
     if (spacer) wrap.appendChild(document.createTextNode(spacer));

    wrap.appendChild(block);
    const clickable = block.querySelector(".naviClickable");
    if (clickable instanceof HTMLElement && !clickable.hasAttribute("tabindex")) {
      clickable.setAttribute("tabindex", "0");
    }
     if (clickable instanceof HTMLElement) {
       clickable.classList.add("f2p-navi-click");
       clickable.setAttribute("role", "button");
       clickable.setAttribute("aria-label", `Copy /navi ${clickable.textContent || ""}`);
     }
  }
}

/** Mark iRO DB / Divine Pride item links for MSQ-style hover tooltips. */
function enhanceF2pItemLinks(host: HTMLElement): void {
  for (const a of host.querySelectorAll("a[href]")) {
    if (!(a instanceof HTMLAnchorElement)) continue;
    const href = a.getAttribute("href") || "";
    const m = href.match(ITEM_DB_HREF_RE);
    if (!m) continue;
    const id = parseInt(m[1], 10);
    if (!Number.isFinite(id)) continue;
    a.classList.add("f2p-item-hit");
    a.setAttribute("data-f2p-item-id", String(id));
  }
}

function f2pEquipmentItemTooltipHtml(anchor: HTMLElement): string | null {
  const id = parseInt((anchor.getAttribute("data-f2p-item-id") || "").trim(), 10);
  if (!Number.isFinite(id)) return null;
  const label = (anchor.textContent || "").trim() || `Item #${id}`;
  const payload = getMsqItemTooltipPayload(id);
  if (payload?.kind === "armour") return roItemTooltipHtml(payload.piece);
  if (payload?.kind === "weapon") return roWeaponTooltipHtml(payload.piece);
  const scraped = F2P_TOOLTIPS_BY_ID[String(id)];
  if (scraped?.lines?.length) return roScrapedItemTooltipHtml(scraped);
  return roFallbackItemTooltipHtml(id, label);
}

function copyTextToClipboard(text: string): Promise<void> {
  const s = String(text || "");
  if (!s) return Promise.resolve();
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(s);
  // Fallback for older/blocked clipboard APIs.
  return new Promise((resolve, reject) => {
    try {
      const ta = document.createElement("textarea");
      ta.value = s;
      ta.setAttribute("readonly", "true");
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      ta.style.top = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      resolve();
    } catch (e) {
      reject(e);
    }
  });
}

function setupF2pNaviCopy(root: HTMLElement, host: HTMLElement): void {
  const toast = root.querySelector("#f2p-navi-toast") as HTMLElement;
  if (!toast) return;
  let toastTimer: number | null = null;

  const hide = (): void => {
    toast.classList.remove("cards-filter-tooltip--visible");
    toast.classList.remove("cards-filter-tooltip--below");
    toast.setAttribute("aria-hidden", "true");
    toast.innerHTML = "";
  };

  const show = (target: HTMLElement, label: string): void => {
    if (toastTimer != null) window.clearTimeout(toastTimer);
    toast.innerHTML = `<div class="cards-filter-tooltip__inner"><strong class="cards-filter-tooltip__label">${label}</strong></div>`;
    toast.setAttribute("aria-hidden", "false");
    toast.classList.remove("cards-filter-tooltip--visible");
    toast.classList.remove("cards-filter-tooltip--below");
    void toast.offsetWidth;

    const r = target.getBoundingClientRect();
    const gap = 10;
    const cx = r.left + r.width / 2;
    toast.style.left = `${cx}px`;
    toast.style.top = `${r.top - gap}px`;

    requestAnimationFrame(() => {
      const tr = toast.getBoundingClientRect();
      if (tr.top < 8) {
        toast.classList.add("cards-filter-tooltip--below");
        toast.style.top = `${r.bottom + gap}px`;
      }
      toast.classList.add("cards-filter-tooltip--visible");
      toastTimer = window.setTimeout(hide, F2P_NAVI_TOAST_MS);
    });
  };

  host.addEventListener("click", (e) => {
    const hit = (e.target as HTMLElement | null)?.closest(".naviClickable") as HTMLElement | null;
    if (!hit || !host.contains(hit)) return;
    e.preventDefault();
    e.stopPropagation();

    const raw = (hit.getAttribute("data-navi") || hit.textContent || "").trim();
    const text = raw.startsWith("/navi") ? raw : `/navi ${raw.replace(/^\(|\)$/g, "").trim()}`;

    void copyTextToClipboard(text)
      .then(() => show(hit, "Copied to clipboard"))
      .catch(() => show(hit, "Copy failed"));
  });

  hide();
}

function mount(root: HTMLElement): void {
  if (getPlannerGameMode() !== "renewal") {
    window.location.assign("/skills");
    return;
  }
  root.innerHTML = `
    ${siteHeaderRowHtml("equipment")}

    <section class="page f2p-equipment-page">
      <div class="cards-windowhead" role="banner">
        <div class="cards-windowhead__left">
          <h1 class="cards-windowhead__title">Free-to-play Equipment</h1>
        </div>
      </div>

      <div class="f2p-equipment__toolbar" role="search">
        <label class="cards-search f2p-equipment__search">
          <span class="cards-search__label">Find on page</span>
          <input id="f2p-q" class="cards-search__input" type="search" placeholder="Filter sections by heading text…" autocomplete="off" />
        </label>
      </div>

      <div class="f2p-wiki-host" id="f2p-host"></div>
      <div id="f2p-item-tooltip" class="ro-tooltip-floater" role="tooltip" aria-hidden="true"></div>
      <div id="f2p-navi-toast" class="cards-filter-tooltip f2p-navi-toast" role="status" aria-live="polite" aria-hidden="true"></div>
    </section>
  `;

  wireSiteGameModeToggle(root);

  const host = root.querySelector("#f2p-host") as HTMLElement;
  host.innerHTML = sanitizeWikiHtml(wikiBodyHtml);
  enhanceF2pNaviMaps(host);
  enhanceF2pItemLinks(host);
  setupF2pNaviCopy(root, host);

  const tipEl = root.querySelector("#f2p-item-tooltip") as HTMLElement;
  setupRoTooltipFloater(host, tipEl, {
    hitSelector: "a.f2p-item-hit",
    renderTip: (target) => f2pEquipmentItemTooltipHtml(target),
  });

  const qEl = root.querySelector("#f2p-q") as HTMLInputElement;
  const normalize = (s: string) => s.trim().toLowerCase();

  const applyFilter = (): void => {
    const q = normalize(qEl.value);
    const out = host.querySelector(".mw-parser-output");
    if (!out) return;
    const children = Array.from(out.children);
    const sections: Element[][] = [];
    let cur: Element[] = [];
    for (const ch of children) {
      const isNew =
        ch.classList.contains("mw-heading") && ch.querySelector("h4") !== null;
      if (isNew) {
        if (cur.length) sections.push(cur);
        cur = [ch];
      } else {
        cur.push(ch);
      }
    }
    if (cur.length) sections.push(cur);

    for (const group of sections) {
      const h4root = group[0]?.querySelector("h4");
      const isLevelSection = Boolean(h4root);
      if (!isLevelSection) {
        for (const el of group) (el as HTMLElement).style.removeProperty("display");
        continue;
      }
      const show = !q || normalize(h4root!.textContent ?? "").includes(q);
      for (const el of group) {
        (el as HTMLElement).style.display = show ? "" : "none";
      }
    }
  };

  qEl.addEventListener("input", applyFilter);
}

initPlannerGameModeFromUrlOrStorage();
mount(document.querySelector("#app") as HTMLElement);
