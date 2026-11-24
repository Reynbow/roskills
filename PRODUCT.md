# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

RO Classic Plus players first: people playing on roclassicplus.com who plan a character before spending skill points, check what a skill does at each level, or look up cards, pets, mounts, monsters and gear while playing. Players of other Ragnarok Online servers (pre-renewal and renewal) are a second audience, served by the Default and Renewal data.

## Product Purpose

roskills.com is a skill planner and reference library for Ragnarok Online. The planner lays out each class's skill tree the way the game client does, counts skill points per class tier, shows prerequisites, and shares builds as links. The library pages (Cards, Pets, Mounts, Monsters, Armour, Weapons, and the Renewal-only MSQ, Equipment and Re-Monsters) answer lookup questions. Success is a player finding the right numbers for their server quickly and trusting them.

## Positioning

It is the RO Classic Plus companion planner: its default data is generated from the server's own skill trees and skill database and the client's skill text, so names, levels, requirements and per-level numbers match what players see in game. A toggle switches back to stock pre-renewal data, and a Renewal mode covers renewal servers.

## Operating Context

Players use it on a second screen or between play sessions, often with the game open. Builds are shared as URLs in Discord and in game. Skill data is regenerated from the server files with `TOOLS/build_roskills_server.py` in the RO_PreRenewal repo; the site serves committed JSON from `src/data/`. Deployed on Vercel from GitHub (Reynbow/roskills).

## Capabilities and Constraints

- Vite + TypeScript multi-page site, one shared stylesheet (`src/style.css`), no framework.
- Skill planner: class picker, 7-column client grids per tier, point caps per tier, prerequisite highlighting, skill tooltips in the in-game tooltip layout, saved builds per data set, share links.
- Data modes: Pre-Renewal (RO Classic Plus or Default data) and Renewal.
- Skill icons come from Divine Pride; class sprites are bundled renders under `public/`.

## Brand Commitments

- Name stays roskills.com, presented as a sibling of roclassicplus.com (same family look, links across).
- Galmuri11 pixel font, which matches the in-game font.
- Voice is the server team's plain voice; sentence case; no em dashes.

## Evidence on Hand

- Partner site theme: `RO_PreRenewal/1_Database/www/themes/roclassicplus-dark/` (tokens, header, panels).
- Class sprite renders in `public/job-stand-pick/`, `public/job-sit/`, `public/job-stand-dock/`; game UI art in `public/ro-ui/`.
- No Druid sprite art yet.

## Product Principles

1. The numbers must match the server. Data comes from the server files, never typed by hand.
2. Read like the game: tooltips, trees and terms follow the client so players recognise them.
3. Fast lookup over decoration: a player with the game open should find a value in seconds.
4. RO Classic Plus first, other servers still served.
