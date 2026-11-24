---
version: 1
slug: "src-beta-planner-ts"
primary_target: "src/beta-planner.ts"
related_targets: []
---

# Beta skill planner (home page) and class picker

Scope: the skill planner home page and its class picker, as an opt-in beta beside the current planner (a Current / Beta switch in the planner's tab row; the current page stays untouched). Mode: Operate. Build path: code-led. Chosen in a surface round: "Board and build ledger" (sketch `.impeccable/mocks/decision/ledger.html`).

Audience and job: RO Classic Plus players planning a full build from first job to max, and players exploring a class to play next. Desktop first; phones must work. Prerequisites auto-fill when raising a skill; going over a class's points is allowed but flagged.

Must keep: the skill board layout exactly (every skill at its client grid position, dashed darker blocks in the gaps). Everything else about usability is open.

## Direction contract

THESIS: the planner is a skill window plus a running account. You click skills on the board; the ledger beside it keeps the build's account in the game's own terms (points left per class, every skill taken, and the job level each was learned at). It refuses the incumbent's arrangement: tiers stacked down a long page, three controls per tile, prerequisite labels on every tile, used/cap counters and whole-board dimming.

OWN-WORLD: the established roskills world (DESIGN.md): slate ground, 12px panels with a 1px blue-grey border, 6px inside, #8ec5ff the one accent and the one filled button (Share build), invested green #4af0b8 for spent points, gold #f0d78c for requirements, danger #f08088 only for over-budget, Galmuri11 in sentence case. Every board shows at once (the owner asked to see base and second class together rather than in tabs).

STORY: pick a class in one click from a searchable family tree; read points left per class at a glance; click a skill to raise it (prerequisites fill in and briefly mark themselves), right-click or the inspector's minus to lower; undo any step; read the learn order in the ledger; share the link.

FIRST VIEWPORT: under the site bar and tab row, a strip: class button (sprite, "Class", class name) opening the picker; one meter per class tier reading "N left of cap" with a bar (red with "N over" when over); Undo, Reset, Share build at right. Below, two columns: left (flexible) a panel holding every class board at once (base and second class together, each headed with its points used of the cap; side by side when the column is 1240px or wider, otherwise stacked; quest skills underneath), each at the client grid; right (about 400px, sticky) the ledger panel: "Build", sections per class tier listing job-level ranges and skill levels in ruled rows, and the selected skill's inspector pinned at its foot (icon, name, level stepper, SP, requires/unlocks, a "Skill details" button for the full tooltip).

FORM: surface structure 3 of 7 on my ordered list (build ledger), dealt by the roll as the lead and locked by the user. Signature move: the learn-order ledger, every point recorded in the order spent and shown as job-level ranges ("Job 2 to 11, Heal 1 to 10"), so a plan reads as instructions for leveling in game. seed: 1a8dcd4fb1b92922

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
