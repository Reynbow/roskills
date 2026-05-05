import "./style.css";
import { inject } from "@vercel/analytics";
import { jobPickerStandSpriteUrl } from "./job-previews";
import boardingRaw from "./data/boarding-mount-by-job-renewal.json";
import { initPlannerGameModeFromUrlOrStorage, setPlannerGameMode } from "./game-mode";
import { listJobs } from "./planner-data";
import { siteHeaderRowHtml, wireSiteGameModeToggle } from "./site-header";
import mountsRaw from "./data/mounts.json";

try {
  inject();
} catch {
  /* ignore */
}

initPlannerGameModeFromUrlOrStorage();
setPlannerGameMode("renewal");

type MountRow = {
  id: string;
  name: string;
  outfit: number;
  previewJobKey: string;
  outfitByJob?: Record<string, number>;
};

type BoardingByJobRow = {
  mountId: string | null;
  note: string;
};

const boardingPack = boardingRaw as {
  aboutBoardingHalter: string;
  byJob: Record<string, BoardingByJobRow>;
};

const mountsPack = mountsRaw as { mounts: MountRow[] };

const mountsById = new Map<string, MountRow>(
  mountsPack.mounts.filter((x) => x?.id).map((m) => [m.id, m]),
);

const LS_JOB = "ro-boarding-mount-job";
const LS_TREE_PICKS = "ro-mount-tree-job-picks";

/** Matches `MOUNT_ANGLE_FILES` in scripts/render-mount-class-previews.mjs */
const MOUNT_CLASS_ANGLE_FILES: readonly { file: string; label: string }[] = [
  { file: "forward.png", label: "Fwd" },
  { file: "angled-front.png", label: "Ang. front" },
  { file: "left.png", label: "Left" },
  { file: "back.png", label: "Back" },
  { file: "angled-back.png", label: "Ang. back" },
];

/** One gallery column per Renewal “branch”; subclass `<select>` inside each card. */
const RENEWAL_CLASS_TREES: readonly { id: string; title: string; keys: readonly string[] }[] = [
  { id: "novice", title: "Novice", keys: ["JT_NOVICE"] },
  {
    id: "swordman",
    title: "Swordman · Knight · Crusader",
    keys: [
      "JT_SWORDMAN",
      "JT_KNIGHT",
      "JT_CRUSADER",
      "JT_KNIGHT_H",
      "JT_CRUSADER_H",
      "JT_RUNE_KNIGHT",
      "JT_ROYAL_GUARD",
      "JT_RUNE_KNIGHT_H",
      "JT_ROYAL_GUARD_H",
      "JT_DRAGON_KNIGHT",
      "JT_IMPERIAL_GUARD",
    ],
  },
  {
    id: "magician",
    title: "Magician · Wizard · Sage",
    keys: [
      "JT_MAGICIAN",
      "JT_WIZARD",
      "JT_SAGE",
      "JT_WIZARD_H",
      "JT_SAGE_H",
      "JT_WARLOCK",
      "JT_SORCERER",
      "JT_WARLOCK_H",
      "JT_SORCERER_H",
      "JT_ARCH_MAGE",
      "JT_ELEMENTAL_MASTER",
    ],
  },
  {
    id: "archer",
    title: "Archer · Hunter · Bard · Dancer",
    keys: [
      "JT_ARCHER",
      "JT_HUNTER",
      "JT_BARD",
      "JT_DANCER",
      "JT_HUNTER_H",
      "JT_BARD_H",
      "JT_DANCER_H",
      "JT_RANGER",
      "JT_MINSTREL",
      "JT_WANDERER",
      "JT_RANGER_H",
      "JT_MINSTREL_H",
      "JT_WANDERER_H",
      "JT_WINDHAWK",
      "JT_TROUBADOUR",
      "JT_TROUVERE",
    ],
  },
  {
    id: "acolyte",
    title: "Acolyte · Priest · Monk",
    keys: [
      "JT_ACOLYTE",
      "JT_PRIEST",
      "JT_MONK",
      "JT_PRIEST_H",
      "JT_MONK_H",
      "JT_ARCHBISHOP",
      "JT_SURA",
      "JT_ARCHBISHOP_H",
      "JT_SURA_H",
      "JT_CARDINAL",
      "JT_INQUISITOR",
    ],
  },
  {
    id: "merchant",
    title: "Merchant · Blacksmith · Alchemist",
    keys: [
      "JT_MERCHANT",
      "JT_BLACKSMITH",
      "JT_ALCHEMIST",
      "JT_BLACKSMITH_H",
      "JT_ALCHEMIST_H",
      "JT_MECHANIC",
      "JT_GENETIC",
      "JT_MECHANIC_H",
      "JT_GENETIC_H",
      "JT_MEISTER",
      "JT_BIOLO",
    ],
  },
  {
    id: "thief",
    title: "Thief · Assassin · Rogue",
    keys: [
      "JT_THIEF",
      "JT_ASSASSIN",
      "JT_ROGUE",
      "JT_ASSASSIN_H",
      "JT_ROGUE_H",
      "JT_GUILLOTINE_CROSS",
      "JT_SHADOW_CHASER",
      "JT_GUILLOTINE_CROSS_H",
      "JT_SHADOW_CHASER_H",
      "JT_SHADOW_CROSS",
      "JT_ABYSS_CHASER",
    ],
  },
  {
    id: "super-novice",
    title: "Super Novice",
    keys: ["JT_SUPERNOVICE", "JT_SUPERNOVICE2", "JT_HYPER_NOVICE"],
  },
  {
    id: "taekwon",
    title: "Taekwon",
    keys: [
      "JT_TAEKWON",
      "JT_STAR",
      "JT_LINKER",
      "JT_STAR_EMPEROR",
      "JT_SKY_EMPEROR",
      "JT_SOUL_REAPER",
      "JT_SOUL_ASCETIC",
    ],
  },
  {
    id: "ninja",
    title: "Ninja",
    keys: ["JT_NINJA", "JT_KAGEROU", "JT_OBORO", "JT_SHIRANUI", "JT_SHINKIRO"],
  },
  {
    id: "gunslinger",
    title: "Gunslinger",
    keys: ["JT_GUNSLINGER", "JT_REBELLION", "JT_NIGHT_WATCH"],
  },
  {
    id: "summoner",
    title: "Summoner",
    keys: ["JT_DO_SUMMONER", "JT_SPIRIT_HANDLER"],
  },
];

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

function mountClassSpriteUrl(jobKey: string, fileName: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/?$/, "/");
  return `${base}mount-on-class/${jobKey}/${fileName}`;
}

function loadMountSpritePreview(
  img: HTMLImageElement,
  previewCell: HTMLElement | null,
  jobKey: string,
  fileName: string,
  jobLabelHuman: string,
  gender: "male" | "female",
  angleHuman: string,
): void {
  loadImgSimpleChain(img, previewCell, [
    {
      src: mountClassSpriteUrl(jobKey, fileName),
      alt: `${jobLabelHuman} — Riding ${angleHuman} (${jobKey})`,
    },
    {
      src: mountClassSpriteUrl(jobKey, "forward.png"),
      alt: `${jobLabelHuman} — forward fallback (${jobKey})`,
    },
    {
      src: jobPickerStandSpriteUrl(jobKey, gender),
      alt: `${jobLabelHuman} — class stand (${gender})`,
    },
  ]);
}

function loadImgSimpleChain(
  img: HTMLImageElement,
  previewCell: HTMLElement | null,
  steps: { src: string; alt: string }[],
): void {
  const clearFb = () => previewCell?.querySelector(".mount-card__fallback, .mount-boarding__fallback")?.remove();

  const showFb = (t: string) => {
    img.removeAttribute("src");
    img.alt = "";
    img.style.display = "none";
    img.style.transform = "";
    img.style.transformOrigin = "";
    if (!previewCell) return;
    let fb = previewCell.querySelector(".mount-card__fallback, .mount-boarding__fallback") as HTMLElement | null;
    const cls = previewCell.closest(".mount-boarding-preview") ? "mount-boarding__fallback" : "mount-card__fallback";
    if (!fb) {
      fb = document.createElement("span");
      fb.className = cls;
      previewCell.appendChild(fb);
    }
    fb.textContent = t;
  };

  clearFb();

  let i = 0;
  const advance = (): void => {
    if (i >= steps.length) return showFb("No preview");
    const { src, alt } = steps[i]!;
    i += 1;
    img.style.display = "";
    const onFail = (): void => {
      img.removeEventListener("load", onLoad);
      advance();
    };
    const onLoad = (): void => {
      img.removeEventListener("error", onFail);
    };
    img.addEventListener("error", onFail, { once: true });
    img.addEventListener("load", onLoad, { once: true });
    img.alt = alt;
    img.src = src;
  };
  advance();
}

function readStoredJob(keys: string[]): string {
  try {
    const j = localStorage.getItem(LS_JOB);
    if (j && keys.includes(j)) return j;
  } catch {
    /* ignore */
  }
  return keys.find((k) => k === "JT_RUNE_KNIGHT_H") ?? keys[0] ?? "";
}

function writeStoredJob(jobKey: string): void {
  try {
    localStorage.setItem(LS_JOB, jobKey);
  } catch {
    /* ignore */
  }
}

function readTreePick(treeId: string, keys: string[]): string {
  if (!keys.length) return "";
  try {
    const raw = JSON.parse(localStorage.getItem(LS_TREE_PICKS) || "{}") as Record<string, string>;
    const j = raw[treeId];
    if (typeof j === "string" && keys.includes(j)) return j;
  } catch {
    /* ignore */
  }
  return keys[keys.length - 1]!;
}

function writeTreePick(treeId: string, jobKey: string): void {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_TREE_PICKS) || "{}") as Record<string, string>;
    raw[treeId] = jobKey;
    localStorage.setItem(LS_TREE_PICKS, JSON.stringify(raw));
  } catch {
    /* ignore */
  }
}

function attachBoardingPreview(root: HTMLElement, jobKey: string, gender: "male" | "female", jobLabelHuman: string): void {
  const cell = root.querySelector("#mount-boarding-preview-cell") as HTMLElement | null;
  if (!cell) return;
  for (const img of cell.querySelectorAll<HTMLImageElement>("[data-board-mount-file]")) {
    const fn = img.dataset.boardMountFile ?? "forward.png";
    const row = MOUNT_CLASS_ANGLE_FILES.find((x) => x.file === fn);
    const angleHuman = row?.label ?? fn.replace(/\.png$/i, "");
    const fig = img.closest("figure");
    loadMountSpritePreview(img, fig, jobKey, fn, jobLabelHuman, gender, angleHuman);
  }
}

function initMountsPage(root: HTMLElement): void {
  const jobsSorted = listJobs().sort((a, b) => a.label.localeCompare(b.label));
  const jobByKey = new Map(jobsSorted.map((j) => [j.key, j] as const));
  const plannerKeys = new Set(jobsSorted.map((j) => j.key));

  const jobOpts = jobsSorted.map((j) => `<option value="${escapeHtml(j.key)}">${escapeHtml(j.label)}</option>`);

  const treesResolved = RENEWAL_CLASS_TREES.map((t) => ({
    id: t.id,
    title: t.title,
    keys: t.keys.filter((k) => plannerKeys.has(k)),
  })).filter((t) => t.keys.length > 0);

  root.innerHTML = `
    ${siteHeaderRowHtml("mounts")}

    <section class="page">
      <div class="cards-windowhead" role="banner" aria-label="Boarding mounts">
        <div class="cards-windowhead__left">
          <h1 class="cards-windowhead__title">Mounts &amp; Riding (Renewal)</h1>
        </div>
      </div>

      <p class="mounts-intro mounts-intro--boarding">${escapeHtml(boardingPack.aboutBoardingHalter)}</p>

      <div class="mount-boarding-toolbar" aria-label="Class and preview">
        <label class="mount-boarding-field">
          <span class="mount-boarding-field__label">Class</span>
          <select id="mount-job-select" class="mount-boarding-field__select">${jobOpts.join("")}</select>
        </label>
        <fieldset class="mount-boarding-gender">
          <legend class="mount-boarding-field__label">Preview gender</legend>
          <label class="mount-boarding-gender__opt"><input type="radio" name="mount-gender" value="male" checked /> Male</label>
          <label class="mount-boarding-gender__opt"><input type="radio" name="mount-gender" value="female" /> Female</label>
        </fieldset>
      </div>

      <div class="mount-boarding-panel" id="mount-boarding-panel" aria-live="polite"></div>

      <h2 class="mount-catalog-heading">Mount preview by class tree</h2>
      <p class="mounts-intro mounts-intro--catalog">
        Each card is one progression line (e.g. Acolyte through Cardinal / Inquisitor). Choose which job in that line to preview.
        Sprites come from <code>npm run render:mount-class</code>: five angles under <code>mount-on-class/&lt;JOB&gt;/</code>
        (<code>forward.png</code>, <code>angled-front.png</code>, <code>left.png</code>, <code>back.png</code>, <code>angled-back.png</code>),
        then idle class sprites if missing.
      </p>

      <div class="cards-toolbar mount-catalog-toolbar" role="search">
        <label class="cards-search">
          <span class="cards-search__label">Filter trees</span>
          <input id="mount-tree-q" class="cards-search__input" type="search" placeholder="Tree or class name…" autocomplete="off" />
        </label>
      </div>
      <div id="mount-tree-grid" class="mount-tree-grid"></div>
    </section>
  `;

  wireSiteGameModeToggle(root);

  const sel = root.querySelector("#mount-job-select") as HTMLSelectElement;
  const panel = root.querySelector("#mount-boarding-panel") as HTMLElement;
  const treeGrid = root.querySelector("#mount-tree-grid") as HTMLElement;
  const treeQ = root.querySelector("#mount-tree-q") as HTMLInputElement;

  const jobKeysList = jobsSorted.map((j) => j.key);
  sel.value = readStoredJob(jobKeysList);
  if (!jobsSorted.some((j) => j.key === sel.value)) sel.value = jobsSorted[0]!.key;

  const genderVal = (): "male" | "female" =>
    (root.querySelector<HTMLInputElement>('input[name="mount-gender"]:checked')?.value === "female"
      ? "female"
      : "male");

  function labelForJobKey(k: string): string {
    return jobByKey.get(k)?.label ?? k;
  }

  function renderBoarding(): void {
    const jobKey = sel.value;
    const meta = boardingPack.byJob[jobKey];
    const lab = labelForJobKey(jobKey);

    if (!meta) {
      panel.innerHTML = `<p class="mount-boarding-panel__oops">No boarding data for <code>${escapeHtml(jobKey)}</code>.</p>`;
      return;
    }

    const g = genderVal();
    const mountId = meta.mountId;
    const mountDef = mountId ? mountsById.get(mountId) : undefined;
    const mountTitle = mountDef?.name ?? (mountId ? mountId : "No dedicated riding costume row in JSON");
    const outfit = mountDef && typeof mountDef.outfit === "number" ? mountDef.outfit : "—";

    const boardingAngleFigs = MOUNT_CLASS_ANGLE_FILES.map(
      (v) =>
        `<figure class="mount-boarding-preview__angle"><img class="mount-boarding-preview__angle-img mount-card__sprite" width="96" height="96" alt="" loading="eager" data-board-mount-file="${escapeHtml(v.file)}" /><figcaption class="mount-boarding-preview__angle-cap">${escapeHtml(v.label)}</figcaption></figure>`,
    ).join("");

    panel.innerHTML = `
      <div class="mount-boarding-panel__grid">
        <div class="mount-boarding-preview mount-boarding-preview--angles" id="mount-boarding-preview-cell" aria-label="Riding previews">
          <div class="mount-boarding-preview__angles">${boardingAngleFigs}</div>
        </div>
        <div class="mount-boarding-copy">
          <h2 class="mount-boarding-copy__class">${escapeHtml(lab)}</h2>
          <p class="mount-boarding-copy__note">${escapeHtml(meta.note)}</p>
          <dl class="mount-boarding-dl">
            <div><dt>Riding appearance</dt><dd>${escapeHtml(mountTitle)}</dd></div>
            <div><dt>Preview files</dt><dd><code>mount-on-class/${escapeHtml(jobKey)}/</code> — <code>forward.png</code>, <code>angled-front.png</code>, <code>left.png</code>, <code>back.png</code>, <code>angled-back.png</code></dd></div>
            ${
              mountId
                ? `<div><dt>Gallery id</dt><dd><code>${escapeHtml(mountId)}</code></dd></div>
                   <div><dt>Typical outfit index</dt><dd><strong>${escapeHtml(String(outfit))}</strong></dd></div>`
                : ""
            }
          </dl>
        </div>
      </div>
    `;
    attachBoardingPreview(panel, jobKey, g, lab);
  }

  function treeCardHtml(tree: { id: string; title: string; keys: string[] }): string {
    const pick = readTreePick(tree.id, tree.keys);
    const labelText = escapeHtml(jobByKey.get(pick)?.label ?? pick);
    const keysAttr = escapeHtml(tree.keys.join(" "));
    const treeAngleFigs = MOUNT_CLASS_ANGLE_FILES.map(
      (v) =>
        `<figure class="mount-tree-card__angle"><img class="mount-card__sprite mount-tree-card__angle-img" width="64" height="64" alt="" loading="lazy" data-mount-file="${escapeHtml(v.file)}" /><figcaption class="mount-tree-card__angle-cap">${escapeHtml(v.label)}</figcaption></figure>`,
    ).join("");
    return `<article class="mount-tree-card" data-mount-tree="${escapeHtml(tree.id)}"
               data-job-keys="${keysAttr}" data-job-key="${escapeHtml(pick)}">
      <header class="mount-tree-card__head">
        <h3 class="mount-tree-card__title">${escapeHtml(tree.title)}</h3>
      </header>
      <div class="mount-tree-card__preview">
        <div class="mount-tree-card__angles">${treeAngleFigs}</div>
      </div>
      <footer class="mount-tree-card__nav" role="group" aria-label="Subclass in this progression">
        <button type="button" class="mount-tree-card__nav-btn" data-tree-step="-1" aria-label="Previous class">◀</button>
        <span class="mount-tree-card__nav-label" data-tree-label>${labelText}</span>
        <button type="button" class="mount-tree-card__nav-btn" data-tree-step="1" aria-label="Next class">▶</button>
      </footer>
    </article>`;
  }

  function syncTreeCardPreview(article: HTMLElement, g: "male" | "female"): void {
    const keys = String(article.dataset.jobKeys ?? "")
      .split(/\s+/)
      .filter(Boolean);
    let jk = article.dataset.jobKey ?? "";
    if (!keys.includes(jk)) jk = keys[0] ?? "";
    article.dataset.jobKey = jk;
    const lbl = article.querySelector<HTMLElement>("[data-tree-label]");
    if (lbl) lbl.textContent = labelForJobKey(jk);
    const angles = article.querySelector(".mount-tree-card__angles");
    if (!angles || !jk) return;
    const human = labelForJobKey(jk);
    for (const img of angles.querySelectorAll<HTMLImageElement>("[data-mount-file]")) {
      const fn = img.dataset.mountFile ?? "forward.png";
      const row = MOUNT_CLASS_ANGLE_FILES.find((x) => x.file === fn);
      const angleHuman = row?.label ?? fn.replace(/\.png$/i, "");
      const fig = img.closest("figure");
      loadMountSpritePreview(img, fig, jk, fn, human, g, angleHuman);
    }
  }

  function stepTreeCard(article: HTMLElement, delta: number): void {
    const keys = String(article.dataset.jobKeys ?? "")
      .split(/\s+/)
      .filter(Boolean);
    if (!keys.length) return;
    let i = keys.indexOf(article.dataset.jobKey ?? "");
    if (i < 0) i = 0;
    const n = keys.length;
    const j = ((i + delta) % n + n) % n;
    const next = keys[j]!;
    article.dataset.jobKey = next;
    const tid = article.dataset.mountTree ?? "";
    if (tid) writeTreePick(tid, next);
    syncTreeCardPreview(article, genderVal());
  }

  function renderTreeGrid(): void {
    const qq = normalize(treeQ.value);
    const filtered = treesResolved.filter((t) => {
      if (!qq) return true;
      if (normalize(t.title).includes(qq)) return true;
      return t.keys.some((k) => normalize(labelForJobKey(k)).includes(qq));
    });

    treeGrid.innerHTML = filtered.map((t) => treeCardHtml(t)).join("");

    const g = genderVal();
    treeGrid.querySelectorAll<HTMLElement>(".mount-tree-card").forEach((article) => {
      syncTreeCardPreview(article, g);
    });
  }

  treeGrid.addEventListener("click", (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-tree-step]");
    if (!btn || !treeGrid.contains(btn)) return;
    const raw = btn.dataset.treeStep;
    const delta = raw === undefined ? NaN : Number(raw);
    if (!Number.isFinite(delta) || delta === 0) return;
    e.preventDefault();
    const art = btn.closest(".mount-tree-card") as HTMLElement | null;
    if (art) stepTreeCard(art, delta);
  });
  sel.addEventListener("change", () => {
    writeStoredJob(sel.value);
    renderBoarding();
  });
  for (const r of root.querySelectorAll<HTMLInputElement>('input[name="mount-gender"]')) {
    r.addEventListener("change", () => {
      renderBoarding();
      const g = genderVal();
      treeGrid.querySelectorAll<HTMLElement>(".mount-tree-card").forEach((a) => syncTreeCardPreview(a, g));
    });
  }
  treeQ.addEventListener("input", renderTreeGrid);

  writeStoredJob(sel.value);
  renderBoarding();
  renderTreeGrid();
}

const mountRoot = document.querySelector("#app");
if (mountRoot instanceof HTMLElement) initMountsPage(mountRoot);
