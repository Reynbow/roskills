---
version: 1
slug: "index-html"
primary_target: "index.html"
related_targets: ["cards.html","pets.html","mounts.html","monsters.html","armour.html","weapons.html","msq.html","equipment.html","re-monsters.html"]
---

# roskills.com site redesign

Scope: every page (skill planner, Cards, Pets, Mounts, Monsters, Armour, Weapons, MSQ, Equipment, Re-Monsters). Mode: Operate. Build path: code-led (working tool pages; no image generation).

Audience and job: RO Classic Plus players planning a build or looking up a value with the game open. Must keep: the planner grid layout (tree grids, point counters, class sprite placement), the darker dashed empty blocks where a tree has no skill (they match the in-game skill window; the owner asked for them back after a review removed them), and prominent class and monster sprites. Pages stay full width. Mode switches (Pre-renewal / Renewal, RO Classic Plus / Default data) move out of the top bar into a tab row under it.

Pinned by the user: match roclassicplus.com (`RO_PreRenewal/1_Database/www/themes/roclassicplus-dark`). No direction roll: the world is the partner's.

## Direction contract

THESIS: roskills becomes the sibling tool of roclassicplus.com, built from the same parts, and stops looking like a generated dashboard: no uppercase tracked labels, no pill-button nav, no boxes inside boxes, no glossy toggles.

OWN-WORLD: slate ground #1a1f28, panels rgba(45,53,68,.78) with a 1px blue-grey border at 12px radius and no shadow, everything inside a panel at 6px radius separated by rules and spacing, RO blue #8ec5ff as the one accent (filled primary buttons, active tab tint, the current-page bar), gold #f0d78c for requirements, Galmuri11 throughout in sentence case.

STORY: a player lands on the planner, sees the class tree laid out like the game's skill window, spends points, reads a tooltip that matches the game, shares a link. Library pages answer a lookup with a filter panel and one ruled, striped list panel with a caption row.

FIRST VIEWPORT: sticky top bar (blue roskills.com wordmark left; plain text links Skill planner to Weapons with an accent bar under the current page; RO Classic + link with an external-link icon at right). Under it a tab row: Pre-renewal / Renewal, then RO Classic Plus data / Default data. Then the class strip (class selector, point counters, Share build as the page's one filled button, Reset as a plain outline that turns red only on hover) and the tree panels with the sprite column at right.

FORM: the partner site's own component grammar (topbar, rcp-db-tab rows, rcp-card panels, flat btn-default / btn-primary, ruled zebra tables), first and only on the list because the user pinned it. Signature move: skill tiles read like the in-game skill window, the tree is the hero of the planner. seed: none (direction pinned by the user to roclassicplus.com; no roll was run)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
