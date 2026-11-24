---
name: roskills.com
description: Ragnarok Online skill planner and reference library, the sibling tool of roclassicplus.com.
colors:
  slate-ground: "#1a1f28"
  bar-slate: "#252b36"
  panel-glass: "rgba(45, 53, 68, 0.78)"
  panel-solid: "#2a3140"
  well-deep: "#252d3a"
  node-slate: "#363e4e"
  panel-rule: "rgba(120, 165, 220, 0.22)"
  control-rule: "rgba(140, 170, 210, 0.34)"
  control-rule-hover: "rgba(160, 195, 240, 0.55)"
  text: "#f4f6fa"
  text-muted: "#b4bdd0"
  ro-blue: "#8ec5ff"
  ro-blue-light: "#a9d3ff"
  on-ro-blue: "#14202f"
  requirement-gold: "#f0d78c"
  tooltip-number: "#ffc078"
  danger: "#f08088"
  invested-node: "#3a4758"
  invested-rule: "rgba(90, 210, 165, 0.42)"
  invested-pip: "#4af0b8"
  prereq-node: "#354a42"
  postreq-node: "#4a4238"
  empty-slot: "rgba(0, 0, 0, 0.22)"
  tooltip-top: "#3a414d"
  tooltip-bottom: "#313741"
  maxed-cream: "#fff8d8"
  dialog-scrim: "rgba(10, 12, 18, 0.72)"
typography:
  display:
    fontFamily: "Galmuri11, Source Sans 3, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    lineHeight: 1.2
  headline:
    fontFamily: "Galmuri11, Source Sans 3, system-ui, sans-serif"
    fontSize: "1.3rem"
    fontWeight: 700
  title:
    fontFamily: "Galmuri11, Source Sans 3, system-ui, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 700
  tooltip-name:
    fontFamily: "Galmuri11, Source Sans 3, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.2
  body:
    fontFamily: "Galmuri11, Source Sans 3, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.5
  chip:
    fontFamily: "Galmuri11, Source Sans 3, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
  label:
    fontFamily: "Galmuri11, Source Sans 3, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
rounded:
  panel: "12px"
  control: "6px"
  slot: "4px"
  pip: "50%"
spacing:
  page: "20px"
  bar-y: "14px"
  panel-y: "12px"
  panel-x: "14px"
  row-y: "12px"
  row-x: "14px"
  control-gap: "8px"
components:
  button-default:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "6px 12px"
  button-default-hover:
    backgroundColor: "rgba(255, 255, 255, 0.05)"
    textColor: "{colors.text}"
  button-primary:
    backgroundColor: "{colors.ro-blue}"
    textColor: "{colors.on-ro-blue}"
    rounded: "{rounded.control}"
    padding: "6px 12px"
  button-primary-hover:
    backgroundColor: "{colors.ro-blue-light}"
    textColor: "{colors.on-ro-blue}"
  mode-tab:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "7px 14px"
  mode-tab-active:
    backgroundColor: "rgba(142, 197, 255, 0.12)"
    textColor: "{colors.text}"
  chip:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    typography: "{typography.chip}"
    rounded: "{rounded.control}"
    padding: "5px 10px"
  chip-on:
    backgroundColor: "rgba(142, 197, 255, 0.12)"
    textColor: "{colors.text}"
  panel:
    backgroundColor: "{colors.panel-glass}"
    rounded: "{rounded.panel}"
    padding: "12px 14px 16px"
  toolbar:
    backgroundColor: "{colors.panel-solid}"
    rounded: "{rounded.panel}"
    padding: "12px 16px"
  list-row:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    padding: "12px 14px"
  list-row-head:
    backgroundColor: "rgba(0, 0, 0, 0.12)"
    textColor: "{colors.text-muted}"
    typography: "{typography.label}"
    padding: "10px 14px"
  input-search:
    backgroundColor: "{colors.well-deep}"
    textColor: "{colors.text}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "8px 12px"
  skill-node:
    backgroundColor: "{colors.node-slate}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "0.45rem 0.5rem"
    height: "4.5rem"
  skill-node-invested:
    backgroundColor: "{colors.invested-node}"
    textColor: "#ffffff"
  skill-node-prereq:
    backgroundColor: "{colors.prereq-node}"
  skill-node-postreq:
    backgroundColor: "{colors.postreq-node}"
  skill-slot-empty:
    backgroundColor: "{colors.empty-slot}"
    rounded: "{rounded.slot}"
    height: "4.5rem"
  tooltip:
    backgroundColor: "{colors.tooltip-top}"
    textColor: "#f2f4f8"
    rounded: "{rounded.control}"
    width: "680px"
  nav-link:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    typography: "{typography.body}"
    padding: "6px 0"
  nav-link-active:
    textColor: "{colors.text}"
  class-strip:
    backgroundColor: "{colors.panel-solid}"
    rounded: "{rounded.panel}"
    padding: "12px 16px"
  class-button:
    backgroundColor: "{colors.well-deep}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "6px 14px 6px 6px"
  points-meter:
    backgroundColor: "rgba(0, 0, 0, 0.3)"
    rounded: "3px"
    height: "6px"
  points-meter-fill:
    backgroundColor: "{colors.ro-blue}"
  points-meter-fill-over:
    backgroundColor: "{colors.danger}"
  tier-tab:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    typography: "{typography.body}"
    rounded: "{rounded.control}"
    padding: "7px 14px"
  tier-tab-active:
    backgroundColor: "rgba(142, 197, 255, 0.12)"
    textColor: "{colors.text}"
  board-tile:
    backgroundColor: "{colors.node-slate}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "8px"
  board-tile-spent:
    backgroundColor: "{colors.invested-node}"
    textColor: "{colors.invested-pip}"
  board-tile-max:
    textColor: "{colors.maxed-cream}"
  requirement-pill:
    backgroundColor: "{colors.requirement-gold}"
    textColor: "{colors.slate-ground}"
    typography: "{typography.label}"
    rounded: "{rounded.slot}"
    padding: "1px 6px"
  requirement-pill-met:
    backgroundColor: "{colors.invested-pip}"
  opens-pill:
    backgroundColor: "{colors.ro-blue}"
    textColor: "{colors.slate-ground}"
  tile-minus-badge:
    backgroundColor: "{colors.well-deep}"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.slot}"
    size: "20px"
  tile-minus-badge-coarse:
    size: "32px"
  ledger-row:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    padding: "6px 6px"
  ledger-row-selected:
    backgroundColor: "rgba(142, 197, 255, 0.12)"
  inspector:
    backgroundColor: "rgba(0, 0, 0, 0.14)"
    padding: "14px 16px 16px"
  level-cell:
    backgroundColor: "transparent"
    textColor: "{colors.text-muted}"
    rounded: "{rounded.slot}"
    padding: "6px 0"
  level-cell-on:
    backgroundColor: "rgba(74, 240, 184, 0.16)"
    textColor: "{colors.text}"
  picker-dialog:
    backgroundColor: "{colors.panel-solid}"
    textColor: "{colors.text}"
    rounded: "{rounded.panel}"
    width: "min(1180px, calc(100vw - 32px))"
  class-card:
    backgroundColor: "transparent"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "6px 4px 8px"
  class-card-current:
    backgroundColor: "rgba(142, 197, 255, 0.14)"
---

# Design System: roskills.com

## Overview

**Creative North Star: "The Sibling Window"**

roskills.com is built from roclassicplus.com's own parts so a player crossing between the two sites never feels a seam: a slate ground, glassy blue-grey panels with one hairline border, RO blue as the single accent, and the Galmuri11 pixel font that the game client itself uses. Inside that frame, the skill planner borrows the game's skill window: a 7-column tree of tiles, darker dashed slots where a tree has no skill, and a tooltip laid out like the in-game one. The tree is the hero; everything around it stays quiet.

The system is dense and flat. Depth comes from tone and hairline rules, not from shadows. One level of boxing: a page is a set of 12px panels on the ground, and everything inside a panel sits at 6px and is separated by rules and spacing, never by another box. Library pages answer a lookup with a filter panel and one ruled, lightly striped list panel with a caption row, the partner site's table look.

The voice is the server team's plain voice: sentence case everywhere, words instead of decoration. The rejected look is the generated dashboard the redesign replaced: uppercase tracked labels, pill-button navigation, boxes inside boxes, glossy toggles, glow halos.

**Key Characteristics:**
- Slate ground, translucent slate panels, 1px blue-grey borders, no panel shadows.
- RO blue (#8ec5ff) is the only accent: the filled primary button, the active tab tint, the current-page bar, focus rings.
- Gold for requirements, green for invested points, amber for what a skill unlocks.
- Galmuri11 throughout, 400 and 700 only, sentence case.
- Skill tiles and empty slots mirror the in-game skill window.
- Inline SVG icons on a 12px grid with a 1.4 stroke, in currentColor.

## Colors

A cool slate world with one clear blue accent and a small set of game-meaning colours that only appear where the game itself would use them.

### Primary
- **RO Blue** (#8ec5ff): the one accent. Fills the page's single primary button, tints the active mode tab and filter chip (at 12% alpha with a full-strength border), draws the 2px bar under the current nav link, colours the wordmark, checkbox ticks and every focus outline.
- **RO Blue Light** (#a9d3ff): hover state of the filled button and the wordmark.
- **Ink on Blue** (#14202f): text on the filled button.

### Secondary
- **Requirement Gold** (#f0d78c): requirements in tooltips and prerequisite text. Never decorative.
- **Tooltip Number Amber** (#ffc078): per-level numbers inside the skill tooltip.

### Tertiary
- **Invested Green** (node #3a4758, border rgba(90, 210, 165, 0.42), pips #4af0b8): a skill with points in it. Green means "spent".
- **Prerequisite Moss** (#354a42): the chain a hovered skill needs.
- **Unlock Umber** (#4a4238): the skills a hovered skill opens up.
- **Danger Rose** (#f08088): over-cap point counts and Reset on hover only. In the beta planner it also marks everything over budget (the meter bar and its "N over", a tier tab's count, a tile's border, ledger rows) and the tile minus badge on hover.
- **Maxed Cream** (#fff8d8): the level numerals of a beta board tile at its maximum level. A maxed tile keeps this colour on phones, where the maximum is hidden.

### Neutral
- **Slate Ground** (#1a1f28): page background.
- **Bar Slate** (#252b36): the sticky top bar, at 92% with a backdrop blur.
- **Panel Glass** (rgba(45, 53, 68, 0.78)): every content panel.
- **Panel Solid** (#2a3140): the sticky class toolbar, which must stay opaque over scrolling content.
- **Deep Well** (#252d3a): text inputs.
- **Node Slate** (#363e4e): resting skill tiles.
- **Panel Rule** (rgba(120, 165, 220, 0.22)): panel borders and the caption-row underline.
- **Control Rule** (rgba(140, 170, 210, 0.34), hover rgba(160, 195, 240, 0.55)): outline buttons and the partner link.
- **Text** (#f4f6fa) and **Muted Text** (#b4bdd0): body copy and secondary copy, nav links, caption rows.
- **Empty Slot** (rgba(0, 0, 0, 0.22)): the darker dashed blocks in the skill tree. The same wash fills the small wells behind the class sprite and the inspector icon.
- **Dialog Scrim** (rgba(10, 12, 18, 0.72)): the backdrop behind the class picker dialog.

### Named Rules
**The One Blue Rule.** RO blue is the only accent hue for interface state. Green, moss, umber and gold carry game meaning (invested, needs, unlocks, requirement) and never stand in for "selected" or "primary".

**The One Filled Button Rule.** Each page has at most one filled button. On the planner it is Share build; everything else is a transparent outline.

**The Met Turns Green Rule.** A requirement is gold while it is owed and turns Invested Green once it is met, on the tile pill and in the inspector's requires list alike.

## Typography

**Display Font:** Galmuri11 (with Source Sans 3, system-ui)
**Body Font:** Galmuri11 (same stack)

**Character:** one pixel face for everything, matching the game client's font so labels, tooltips and skill names read as the game does. Hierarchy comes from size and the 700 weight, never from case or tracking.

### Hierarchy
- **Display** (700, 20px, 1.2): the roskills.com wordmark in the top bar, in RO blue.
- **Headline** (700, 1.3rem): the library page title (Monsters, Card library).
- **Title** (700, 0.95rem): panel titles such as a class tier name, with its point count at the right and a rule under it.
- **Tooltip name** (700, 16px, 1.2): the skill name in the tooltip header.
- **Body** (400, 14px, 1.5): nav links, tabs, buttons, inputs, tooltip text.
- **Chip** (400, 13px): filter chips.
- **Label** (700, 12px): list caption rows and small group labels, sentence case.

### Named Rules
**The Sentence Case Rule.** Every label, heading, tab and button is sentence case. No uppercase, no letter-spacing on labels, no eyebrow line above a heading.

**The One Face Rule.** Galmuri11 throughout, in its two cut weights (400, 700). No second display face.

## Layout

Pages are full width up to a 1760px column with 20px page padding. The top bar is sticky and full bleed (64px tall, 14px vertical padding): wordmark left, plain text links, the RO Classic + link pushed right. Under it a mode-tab row (16px above, 14px below, 8px between tabs, 20px between groups) holds Pre-renewal / Renewal and, on the planner, RO Classic Plus data / Default data.

The planner stacks a sticky class toolbar (pinned under the header) above the tier panels; each tier is a 7-column client grid, and a narrow column at right holds the class sprite panel and the Quest / special panel. Panels in a column are 20px apart. Library pages stack a title row, a search row, a filter panel and one list panel.

Responsive changes are by breakpoint (820px is the main one): list rows reflow and the caption row hides below 820px, split grids drop to one column below 980px, and the planner tree is replaced by a skill list on small screens.

The opt-in beta planner (Current planner / Beta planner tabs at the right end of the tab row) stacks a sticky class strip over two columns 20px apart: a flexible board panel and a build ledger panel of clamp(320px, 26vw, 400px), sticky and capped to the window height so the inspector at its foot is never cut off; the ledger's list scrolls inside it. Below 1180px the ledger drops under the board and stops sticking. Below 760px the strip stops sticking, its actions wrap to the left, and the board keeps the full 7-column client grid at a 640px minimum, scrolling sideways inside its panel rather than reflowing; phone tiles show the level alone. The class picker grid runs 6 columns, 3 below 1180px and 2 below 760px.

## Elevation & Depth

Flat by default. Panels and rows have no shadow; depth is tonal (ground, then translucent panel, then node slate or a striped row) and drawn with 1px rules. The top bar is set apart by its blur and bottom border. The only cast shadow belongs to layers that genuinely float above the page.

### Shadow Vocabulary
- **Floating tooltip** (`box-shadow: 0 10px 36px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05)`): the skill tooltip, which floats over the tree.

The class picker dialog carries no shadow: Panel Solid with the 1px Panel Rule border, set apart by the Dialog Scrim behind it.

### Named Rules
**The No Halo Rule.** No glow halos and no coloured outer shadows on any element. State shows through fill, border colour and text colour.

**The Still Surface Rule.** No hover lifts, no hover scaling, no shimmer sweeps. Hover changes colour only, over about 150ms.

## Shapes

Two radii carry the system. Panels (content, filters, list, toolbar) round at 12px; everything inside a panel (buttons, tabs, chips, inputs, skill tiles, the tooltip) rounds at 6px. Empty skill slots are 4px with a 2px dashed edge, as the game draws them. Prerequisite labels sit on tiles as small folder tabs rounded only on top (8px 8px 0 0). Level pips are 9px circles. The 4px radius also serves small marks and wells inside a 6px control: icon and sprite wells, requirement pills, the tile minus badge and the inspector's level cells. Points meters are 6px bars rounded at 3px.

**The One Box Rule.** One level of boxing. A panel never contains another bordered panel; inside it, groups are separated by a 1px rule and spacing.

**The Dashes Mean Gaps Rule.** A dashed edge means an empty slot in the skill grid and nothing else. Every state edge (spent, over, needs, opens, selected) is solid.

## Components

### Buttons
Quiet outlines, with one filled exception.
- **Shape:** gently rounded (6px), 1px Control Rule border, 6px 12px padding, 14px text.
- **Default:** transparent fill, Text colour. Hover adds a 5% white wash and the lighter Control Rule.
- **Primary:** RO blue fill and border, Ink on Blue text, 700 weight; hover goes to RO Blue Light. One per page.
- **Danger:** Reset is a default outline that turns Danger Rose (text and border) only on hover.
- **Focus:** 2px RO blue outline, 2px offset.

### Chips
- **Style:** transparent, 1px border rgba(140, 170, 210, 0.26), Muted Text, 13px, 5px 10px, 6px radius.
- **State:** hover lightens border and text; on is RO blue border with a 12% blue fill and Text colour. Slot chips hold a 24px item icon.

### Cards / Containers
- **Corner Style:** 12px.
- **Background:** Panel Glass; the sticky toolbar uses Panel Solid.
- **Shadow Strategy:** none (see Elevation & Depth).
- **Border:** 1px Panel Rule.
- **Internal Padding:** 12px 14px (16px bottom on tree panels); filter panel 0.75rem 0.9rem.
- **Titles:** a title line with a 1px rule beneath, stats right aligned.

### Inputs / Fields
- **Style:** Deep Well fill, 1px border rgba(140, 170, 210, 0.26), 6px radius, 8px 12px, 14px.
- **Focus:** 2px RO blue outline at 2px offset.
- **Settings:** on/off settings are plain 16px checkboxes tinted RO blue with a text label, never toggle switches.

### Navigation
- **Top bar links:** plain 14px text in Muted Text, 18px apart; hover goes to Text. The current page is Text with a 2px RO blue bar on the bar's bottom edge.
- **Partner link:** RO Classic + as a 6px outline button with an external-link icon at 70% opacity.
- **Mode tabs:** 6px outline tabs (7px 14px, Muted Text); active is RO blue border, 12% blue fill, Text colour.
- **Planner layout tabs:** on the skill planner only, a Current planner / Beta planner pair in the same mode-tab style, pushed to the right end of the tab row.

### Library list
One panel, overflow hidden, holding ruled rows: rows are 12px 14px on a shared grid, separated by 1px rgba(140, 170, 210, 0.14) rules, with every even row striped at 2.5% white. A caption row at the top uses the same grid in the 12px 700 label style, Muted Text, on a 12% black wash with a Panel Rule underline; it hides below 820px.

### Skill tiles
The in-game skill window, translated. Tiles are Node Slate with a 1px border rgba(140, 170, 210, 0.28), 6px radius, at least 4.5rem tall, holding a 2.25rem icon, the name, level pips and a level display with minus and plus buttons.
- **Hover:** #434a58 fill, bluer border.
- **Invested:** #3a4758 fill, green border, bright green pips, the level shown in a green pill.
- **Needs (prerequisite chain):** Prerequisite Moss fill with a green border.
- **Unlocks:** Unlock Umber fill with an amber border.
- **Transcendent:** violet border.
- **Focus dimming:** while a skill is hovered, unrelated tiles fade to 48% (empty slots to 28%), a setting the player can turn off.
- **Prerequisite tab:** a small folder tab above the tile naming the needed skill and level, its fill tracking the tile's state.

### Empty skill slots
Darker blocks (Empty Slot fill) with a 2px dashed white edge at 14%, 4px radius, the height of a tile. They mirror the empty cells of the in-game skill window and are an owner must-keep.

### Skill tooltip
In-game layout at up to 680px wide: a vertical slate gradient (#3a414d to #313741), 6px radius, the one floating shadow. A header with a 48px pixelated icon, the 16px name, meta line and the level and range at right, ruled off; a body of blocks with Tooltip Number Amber values and Requirement Gold requirements.

### Icons
Inline SVG on a 12px viewBox, 1.4 stroke, round caps and joins, currentColor, sized 1em so they sit in text: close, minus, plus, chevrons, carets, arrows, external, male, female. Minus and plus are the only marks on stepper buttons and the tile minus badge.

### Class strip (beta planner)
The sticky strip under the tab row: Panel Solid, 12px, 12px 16px, pinned under the header.
- **Class button:** a Deep Well outline control (6px, 6px 14px 6px 6px) holding the class sprite in a 44 by 52px Empty Slot well, a 12px Muted Text "Class" caption over the class name (20px, 700), and a chevron. It opens the class picker. The caption labels the button's value; it is not an eyebrow over a heading.
- **Points meters:** one per class tier, at least 180px wide: the tier name in Muted Text, then "N left of cap" with N in 18px 700 tabular numerals, over a 6px track (30% black, 3px radius) filled in RO blue. Over budget, the value reads "N over" and value and bar turn Danger Rose. The fill eases its width over 200ms.
- **Actions:** Undo and Reset as outlines, Share build as the one filled button, pushed right.

### Tier tabs (beta planner)
The mode-tab grammar inside the board panel, ruled off beneath (1px Panel Rule, 12px below). Each tab carries its used/cap count in 12px Muted Text tabular numerals, Danger Rose when over. Quest skills is a tab of its own.

### Board tiles (beta planner)
The client grid as a 7-column board, 10px gaps, empty cells drawn as the dashed Empty Slot. A tile is Node Slate, 6px, 8px padding: a 36px icon well at top left, the level at top right (large 700 numerals at 21px with "/max" after them in a dimmer grey), the 12px 700 name under them clamped to two lines. Hover brightens fill and border over 120ms. Clicking raises, right-click or Shift-click lowers.
- **Spent:** Invested Slate fill, green border, the level in Invested Pip Green.
- **Max:** level and maximum in Maxed Cream.
- **Locked (not learnable yet):** the icon at 50% opacity and the name in Muted Text; still clickable, since raising fills its requirements.
- **Over budget:** a Danger Rose border at 60%.
- **Selected:** a 2px RO blue outline at 1px offset.
- **Needs:** while a skill is pointed at or selected, each tile it requires takes a gold border and a "Needs N" pill (11px 700, Slate Ground text, 4px) centred on its bottom edge; the pill turns Invested Pip Green once met.
- **Opens:** each skill it unlocks takes a solid RO blue border at 70% and an RO blue "Opens at N" pill.
- **Minus badge:** a 20px Deep Well square (4px, Control Rule border) at the top right corner holding the minus icon, shown on a spent tile when hovered, focused or selected; Danger Rose on hover. 32px on coarse pointers.
- **Filled:** prerequisites the planner raised on its own light once, gold border and a 22% gold wash settling to the spent look over 0.9s on cubic-bezier(0.16, 1, 0.3, 1). Colour only, no movement; off under reduced motion.
- **Phone:** below 760px the level drops to 16px and the maximum hides, so the tile shows the level alone.

### Status line (beta planner)
One 13px line in Requirement Gold under the board, naming the prerequisites just raised ("Raised Aqua Benedicta to 1 and Impositio Manus to 3 so Aspersio can be learned."). It holds its height when empty and is announced politely.

### Build ledger (beta planner)
A sticky panel: a "Build" heading with the point total at right, ruled off, then the learn order grouped by class tier. Each group heads with the tier name and "used of cap" in 13px Requirement Gold (Danger Rose when over). Rows are 13px on a 6.5rem / flexible / auto grid: job range in Muted Text tabular numerals ("Job 2-6"), skill name ellipsed on one line, levels in 700 Invested Pip Green; 1px rules at 12% between rows, 4% white on hover, the selected row in the 12% RO blue tint, over-budget rows with job and levels in Danger Rose.

### Inspector (beta planner)
The selected skill, pinned at the ledger's foot behind a Panel Rule and a 14% black wash (not a box). A 44px icon well, the 16px name and "Level N of M", and a stepper of two 36px outline buttons with the minus and plus icons. A row of level cells (4px, 1px rule at 22%, 12px tabular numerals; hover RO blue border; on cells green-tinted at 16% with the green rule) sets a level directly. Requires and Unlocks read as 12px Muted Text keys over 13px items that never break mid-item: requires in gold, met items green, unlocks in Muted Text. A "Skill details" outline button opens the full tooltip.

### Class picker (beta planner)
A modal dialog up to 1180px: Panel Solid, 12px, Panel Rule border, over the Dialog Scrim. Its head holds "Choose a class" (20px), a Deep Well search field up to 360px, and a 36px close button, ruled off. The body is a family tree: one column per class line under a 13px Muted Text heading, each job stage a row of sprite cards. A card is a 6px outline (1px rule at 22%) holding a 52px pixelated sprite over a 12px name, at least 86px tall so cards without a sprite keep the row's height. Hover is the RO blue border with an 8% blue wash; the current class holds the RO blue border at 14%.

## Do's and Don'ts

### Do:
- **Do** put every surface on Slate Ground in a 12px Panel Glass panel with a 1px Panel Rule border, and everything inside it at 6px.
- **Do** separate groups inside a panel with a 1px rule and spacing.
- **Do** keep one filled RO blue button per page; every other button is a transparent outline.
- **Do** show selection with the RO blue border and 12% blue fill, the same on tabs and chips.
- **Do** build library pages as a filter panel plus one ruled, striped list panel with a caption row.
- **Do** keep the dashed dark empty slots in skill trees.
- **Do** keep the skill board at the client grid on every screen; on phones it scrolls inside its panel at a 640px minimum.
- **Do** draw icons as inline SVG on the 12px grid with a 1.4 stroke in currentColor.
- **Do** write every label in sentence case in Galmuri11.

### Don't:
- **Don't** use uppercase or letter-spaced labels, or eyebrow labels above headings.
- **Don't** nest a bordered box inside a panel.
- **Don't** use glow halos or coloured outer shadows.
- **Don't** add shimmer sweeps, hover lifts or hover scaling.
- **Don't** use pill-shaped navigation buttons or glossy toggle switches; settings are plain checkboxes.
- **Don't** use unicode glyphs as icons.
- **Don't** draw a dashed edge on anything but an empty skill slot.
- **Don't** use em dashes in any copy.
- **Don't** introduce a second font or a second accent hue for interface state.
