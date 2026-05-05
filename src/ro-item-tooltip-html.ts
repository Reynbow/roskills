import type { RoArmourPiece, RoWeaponPiece } from "./msq-types";

export function escapeHtmlRoItem(s: string): string {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function divinePrideItemIconUrl(itemId: number): string {
  return `https://static.divine-pride.net/images/items/item/${itemId}.png`;
}

export type RoItemTooltipOptions = {
  /** Override default Divine Pride item icon URL (e.g. cards). */
  iconUrl?: string;
};

export type F2pScrapedItemTooltip = {
  id: number;
  name: string;
  /** Plain text lines, typically from Divine Pride page description. */
  lines: readonly string[];
  /** Optional image URL from source page (not always consistent). */
  image?: string;
};

export function roItemTooltipHtml(p: RoArmourPiece, options?: RoItemTooltipOptions): string {
  const esc = escapeHtmlRoItem;
  const icon = options?.iconUrl ?? divinePrideItemIconUrl(p.id);
  const effectsLi = p.effects.map((e) => `<li>${esc(e)}</li>`).join("");

  const metaParts: string[] = [];
  const typeLabel = p.subtype?.trim() || p.equipType.trim();
  metaParts.push(
    `<div class="ro-item-tooltip__meta-row"><span class="ro-item-tooltip__meta-k">Type</span><span class="ro-item-tooltip__meta-v">${esc(
      typeLabel,
    )}</span></div>`,
  );
  metaParts.push(
    `<div class="ro-item-tooltip__meta-row"><span class="ro-item-tooltip__meta-k">Defense</span><span class="ro-item-tooltip__meta-v">${esc(
      p.defense,
    )}</span></div>`,
    `<div class="ro-item-tooltip__meta-row"><span class="ro-item-tooltip__meta-k">Weight</span><span class="ro-item-tooltip__meta-v">${esc(
      p.weight,
    )}</span></div>`,
    `<div class="ro-item-tooltip__meta-row"><span class="ro-item-tooltip__meta-k">Possible Slots</span><span class="ro-item-tooltip__meta-v">${esc(
      p.slots,
    )}</span></div>`,
    `<div class="ro-item-tooltip__meta-row"><span class="ro-item-tooltip__meta-k">Required Level</span><span class="ro-item-tooltip__meta-v">${esc(
      p.requiredLevel,
    )}</span></div>`,
    `<div class="ro-item-tooltip__meta-row"><span class="ro-item-tooltip__meta-k">Job</span><span class="ro-item-tooltip__meta-v">${esc(
      p.jobs,
    )}</span></div>`,
  );

  const upgradeHtml = p.upgradeTicket
    ? `<div class="ro-item-tooltip__upgrade"><span class="ro-item-tooltip__upgrade-k">Can be upgraded with</span> <span class="ro-item-tooltip__link">${esc(
        p.upgradeTicket,
      )}</span></div>`
    : "";

  return `<div class="ro-item-tooltip">
    <div class="ro-item-tooltip__chrome-top" aria-hidden="true">
      <span class="ro-item-tooltip__stripes"></span>
      <span class="ro-item-tooltip__chrome-spacer"></span>
      <span class="ro-item-tooltip__chrome-x">×</span>
    </div>
    <div class="ro-item-tooltip__scroll">
      <div class="ro-item-tooltip__head">
        <div class="ro-item-tooltip__iconbox">
          <img class="ro-item-tooltip__iconimg" src="${esc(icon)}" alt="" width="36" height="36" loading="eager" decoding="async" referrerpolicy="no-referrer" />
        </div>
        <div class="ro-item-tooltip__headmain">
          <div class="ro-item-tooltip__itemname">${esc(p.name)}</div>
          <p class="ro-item-tooltip__flavor">${esc(p.flavor)}</p>
        </div>
      </div>
      <div class="ro-item-tooltip__hr" aria-hidden="true"></div>
      <ul class="ro-item-tooltip__effects">${effectsLi}</ul>
      <div class="ro-item-tooltip__hr" aria-hidden="true"></div>
      <div class="ro-item-tooltip__meta">${metaParts.join("")}${upgradeHtml}</div>
      <p class="ro-item-tooltip__source">Divine Pride · iRO item database</p>
    </div>
    <div class="ro-item-tooltip__grip" aria-hidden="true"></div>
    <div class="ro-item-tooltip__slotbar" aria-hidden="true">
      <span class="ro-item-tooltip__diamond"></span><span class="ro-item-tooltip__diamond"></span><span class="ro-item-tooltip__diamond"></span><span class="ro-item-tooltip__diamond"></span>
    </div>
  </div>`;
}

export function roWeaponTooltipHtml(w: RoWeaponPiece, options?: RoItemTooltipOptions): string {
  const esc = escapeHtmlRoItem;
  const icon = options?.iconUrl ?? divinePrideItemIconUrl(w.id);
  const effectsLi = w.effects.map((e) => `<li>${esc(e)}</li>`).join("");

  const metaParts: string[] = [];
  metaParts.push(
    `<div class="ro-item-tooltip__meta-row"><span class="ro-item-tooltip__meta-k">Type</span><span class="ro-item-tooltip__meta-v">${esc(
      w.subtype.trim(),
    )}</span></div>`,
    `<div class="ro-item-tooltip__meta-row"><span class="ro-item-tooltip__meta-k">Attack</span><span class="ro-item-tooltip__meta-v">${esc(
      w.attack,
    )}</span></div>`,
  );
  if (w.matk?.trim()) {
    metaParts.push(
      `<div class="ro-item-tooltip__meta-row"><span class="ro-item-tooltip__meta-k">MATK</span><span class="ro-item-tooltip__meta-v">${esc(
        w.matk,
      )}</span></div>`,
    );
  }
  metaParts.push(
    `<div class="ro-item-tooltip__meta-row"><span class="ro-item-tooltip__meta-k">Weight</span><span class="ro-item-tooltip__meta-v">${esc(
      w.weight,
    )}</span></div>`,
    `<div class="ro-item-tooltip__meta-row"><span class="ro-item-tooltip__meta-k">Weapon Level</span><span class="ro-item-tooltip__meta-v">${esc(
      w.weaponLevel,
    )}</span></div>`,
    `<div class="ro-item-tooltip__meta-row"><span class="ro-item-tooltip__meta-k">Range</span><span class="ro-item-tooltip__meta-v">${esc(
      w.range,
    )}</span></div>`,
    `<div class="ro-item-tooltip__meta-row"><span class="ro-item-tooltip__meta-k">Slots</span><span class="ro-item-tooltip__meta-v">${esc(
      w.slots,
    )}</span></div>`,
    `<div class="ro-item-tooltip__meta-row"><span class="ro-item-tooltip__meta-k">Required Level</span><span class="ro-item-tooltip__meta-v">${esc(
      w.requiredLevel,
    )}</span></div>`,
    `<div class="ro-item-tooltip__meta-row"><span class="ro-item-tooltip__meta-k">Job</span><span class="ro-item-tooltip__meta-v">${esc(
      w.jobs,
    )}</span></div>`,
    `<div class="ro-item-tooltip__meta-row"><span class="ro-item-tooltip__meta-k">Equip</span><span class="ro-item-tooltip__meta-v">${esc(
      w.location,
    )}</span></div>`,
  );

  return `<div class="ro-item-tooltip">
    <div class="ro-item-tooltip__chrome-top" aria-hidden="true">
      <span class="ro-item-tooltip__stripes"></span>
      <span class="ro-item-tooltip__chrome-spacer"></span>
      <span class="ro-item-tooltip__chrome-x">×</span>
    </div>
    <div class="ro-item-tooltip__scroll">
      <div class="ro-item-tooltip__head">
        <div class="ro-item-tooltip__iconbox">
          <img class="ro-item-tooltip__iconimg" src="${esc(icon)}" alt="" width="36" height="36" loading="eager" decoding="async" referrerpolicy="no-referrer" />
        </div>
        <div class="ro-item-tooltip__headmain">
          <div class="ro-item-tooltip__itemname">${esc(w.name)}</div>
          <p class="ro-item-tooltip__flavor">${esc(w.flavor)}</p>
        </div>
      </div>
      <div class="ro-item-tooltip__hr" aria-hidden="true"></div>
      <ul class="ro-item-tooltip__effects">${effectsLi}</ul>
      <div class="ro-item-tooltip__hr" aria-hidden="true"></div>
      <div class="ro-item-tooltip__meta">${metaParts.join("")}</div>
      <p class="ro-item-tooltip__source">Divine Pride · iRO item database</p>
    </div>
    <div class="ro-item-tooltip__grip" aria-hidden="true"></div>
    <div class="ro-item-tooltip__slotbar" aria-hidden="true">
      <span class="ro-item-tooltip__diamond"></span><span class="ro-item-tooltip__diamond"></span><span class="ro-item-tooltip__diamond"></span><span class="ro-item-tooltip__diamond"></span>
    </div>
  </div>`;
}

export function roScrapedItemTooltipHtml(p: F2pScrapedItemTooltip): string {
  const esc = escapeHtmlRoItem;
  const icon = divinePrideItemIconUrl(p.id);
  const lines = (p.lines ?? []).map((x) => String(x || "").trim()).filter(Boolean);

  const meta: Array<{ k: string; v: string }> = [];
  const effects: string[] = [];

  for (const line of lines) {
    const m = line.match(/^([A-Za-z][A-Za-z /.-]{0,30}?)\s*:\s*(.+)$/);
    if (m) meta.push({ k: m[1].trim(), v: m[2].trim() });
    else effects.push(line);
  }

  const flavor = effects.shift() ?? "";
  const effectsLi = effects.map((e) => `<li>${esc(e)}</li>`).join("");
  const metaRows = meta
    .map(
      (r) =>
        `<div class="ro-item-tooltip__meta-row"><span class="ro-item-tooltip__meta-k">${esc(r.k)}</span><span class="ro-item-tooltip__meta-v">${esc(
          r.v,
        )}</span></div>`,
    )
    .join("");

  return `<div class="ro-item-tooltip">
    <div class="ro-item-tooltip__chrome-top" aria-hidden="true">
      <span class="ro-item-tooltip__stripes"></span>
      <span class="ro-item-tooltip__chrome-spacer"></span>
      <span class="ro-item-tooltip__chrome-x">×</span>
    </div>
    <div class="ro-item-tooltip__scroll">
      <div class="ro-item-tooltip__head">
        <div class="ro-item-tooltip__iconbox">
          <img class="ro-item-tooltip__iconimg" src="${esc(icon)}" alt="" width="36" height="36" loading="eager" decoding="async" referrerpolicy="no-referrer" />
        </div>
        <div class="ro-item-tooltip__headmain">
          <div class="ro-item-tooltip__itemname">${esc(p.name || `Item #${p.id}`)}</div>
          <p class="ro-item-tooltip__flavor">${esc(flavor)}</p>
        </div>
      </div>
      <div class="ro-item-tooltip__hr" aria-hidden="true"></div>
      <ul class="ro-item-tooltip__effects">${effectsLi || `<li>${esc("Open the link for full details.")}</li>`}</ul>
      <div class="ro-item-tooltip__hr" aria-hidden="true"></div>
      <div class="ro-item-tooltip__meta">${metaRows}</div>
      <p class="ro-item-tooltip__source">Divine Pride · iRO item database</p>
    </div>
    <div class="ro-item-tooltip__grip" aria-hidden="true"></div>
    <div class="ro-item-tooltip__slotbar" aria-hidden="true">
      <span class="ro-item-tooltip__diamond"></span><span class="ro-item-tooltip__diamond"></span><span class="ro-item-tooltip__diamond"></span><span class="ro-item-tooltip__diamond"></span>
    </div>
  </div>`;
}

/** Same chrome as MSQ tooltips when we only have id + link label (renewal gear not in MSQ curated lists). */
export function roFallbackItemTooltipHtml(id: number, displayName: string): string {
  const esc = escapeHtmlRoItem;
  const icon = divinePrideItemIconUrl(id);
  const metaParts = [
    `<div class="ro-item-tooltip__meta-row"><span class="ro-item-tooltip__meta-k">Item ID</span><span class="ro-item-tooltip__meta-v">${esc(
      String(id),
    )}</span></div>`,
  ];
  return `<div class="ro-item-tooltip">
    <div class="ro-item-tooltip__chrome-top" aria-hidden="true">
      <span class="ro-item-tooltip__stripes"></span>
      <span class="ro-item-tooltip__chrome-spacer"></span>
      <span class="ro-item-tooltip__chrome-x">×</span>
    </div>
    <div class="ro-item-tooltip__scroll">
      <div class="ro-item-tooltip__head">
        <div class="ro-item-tooltip__iconbox">
          <img class="ro-item-tooltip__iconimg" src="${esc(icon)}" alt="" width="36" height="36" loading="eager" decoding="async" referrerpolicy="no-referrer" />
        </div>
        <div class="ro-item-tooltip__headmain">
          <div class="ro-item-tooltip__itemname">${esc(displayName)}</div>
          <p class="ro-item-tooltip__flavor">Full stats: open the link (Divine Pride / iRO DB).</p>
        </div>
      </div>
      <div class="ro-item-tooltip__hr" aria-hidden="true"></div>
      <ul class="ro-item-tooltip__effects"><li>MSQ episode gear uses the same curated stats as the MSQ page when the item ID matches.</li></ul>
      <div class="ro-item-tooltip__hr" aria-hidden="true"></div>
      <div class="ro-item-tooltip__meta">${metaParts.join("")}</div>
      <p class="ro-item-tooltip__source">Divine Pride · iRO item database</p>
    </div>
    <div class="ro-item-tooltip__grip" aria-hidden="true"></div>
    <div class="ro-item-tooltip__slotbar" aria-hidden="true">
      <span class="ro-item-tooltip__diamond"></span><span class="ro-item-tooltip__diamond"></span><span class="ro-item-tooltip__diamond"></span><span class="ro-item-tooltip__diamond"></span>
    </div>
  </div>`;
}
