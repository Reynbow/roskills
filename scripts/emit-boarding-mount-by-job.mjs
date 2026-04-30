/**
 * One-off generator: writes src/data/boarding-mount-by-job-renewal.json from planner job keys.
 * Run: node scripts/emit-boarding-mount-by-job.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPlannerJobsList } from "./planner-zrenderer-jobs.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "src", "data", "boarding-mount-by-job-renewal.json");

const M = (mountId, note = "") => ({ mountId, note });
const N = (note) => ({ mountId: null, note });

/** @type {Record<string, { mountId: string | null; note: string }>} */
const MAP = {
  JT_NOVICE: N("Novice — no class mount."),
  JT_SUPERNOVICE: N("Super Novice — no standard costume mount."),
  JT_TAEKWON: N("Taekwon — no standard costume mount."),
  JT_STAR: N("Taekwon Master — no standard boarding-halter costume mount."),
  JT_LINKER: N("Soul Linker — no riding costume."),
  JT_NINJA: N("Ninja — advance to Kagerou/Oboro; no classic halter costume in table."),
  JT_GUNSLINGER: N("Gunslinger — Rebellion provides the firearm-riding costume."),
  JT_SWORDMAN: N("Swordman — become Knight/Crusader (or Renewal 3rd) for a riding costume."),
  JT_MAGICIAN: N("Magician — no mount; advance for job-specific sprites."),
  JT_ARCHER: N("Archer — no mount; Ranger/Windhawk use the Warg costume."),
  JT_ACOLYTE: N("Acolyte — no mount; Archbishop/Cardinal use the pedestal/wing costume."),
  JT_MERCHANT: N("Merchant — no mount; Mechanic uses Madogear, Genetic/Biolo the cart."),
  JT_THIEF: N("Thief — no mount; assassin GX line uses leopard, Rogue SC line uses cloak mount."),
  JT_KNIGHT: M("peco-peco", "Knight/Lord Knight classic Peco."),
  JT_PRIEST: N("Priest — no Riding costume yet; Archbishop/Cardinal use wing pedestal."),
  JT_WIZARD: N("Wizard — no mount; Warlock/Arch Mage use flight/cloud costume."),
  JT_BLACKSMITH: N("Blacksmith — no mount; Mechanic/Meister use Madogear."),
  JT_HUNTER: N("Hunter — no mount; Ranger/Windhawk use Warg."),
  JT_ASSASSIN: N("Assassin — no mount; Guillotine Cross / Shadow Cross use leopard costume."),
  JT_CRUSADER: M("grand-peco", "Crusader/Paladin Grand Peco."),
  JT_MONK: N("Monk — no mount; Sura/Inquisitor use tiger riding costume."),
  JT_SAGE: N("Sage — no mount; Sorcerer/Elemental Master use elemental ride."),
  JT_ROGUE: N("Rogue — no mount; Shadow Chaser / Abyss Chaser use cloak rider."),
  JT_ALCHEMIST: N("Alchemist — no mount; Genetic/Biolo use cart body."),
  JT_BARD: N("Bard — no mount; Minstrel/Troubadour share performer mount."),
  JT_DANCER: N("Dancer — no mount; Wanderer/Trouvere share performer mount."),
  JT_KNIGHT_H: M("peco-peco", "Lord Knight — Peco."),
  JT_PRIEST_H: N("High Priest — advance to Archbishop for wing pedestal mount."),
  JT_WIZARD_H: N("High Wizard — advance to Warlock/Arch Mage for flight mount."),
  JT_BLACKSMITH_H: N("Mastersmith — advance to Mechanic/Meister for Madogear."),
  JT_HUNTER_H: N("Sniper — advance to Ranger/Windhawk for Warg."),
  JT_ASSASSIN_H: N("Assassin Cross — advance to GX/Shadow Cross for leopard."),
  JT_CRUSADER_H: M("grand-peco", "Paladin — Grand Peco."),
  JT_MONK_H: N("Champion — advance to Sura/Inquisitor for tiger mount."),
  JT_SAGE_H: N("Scholar — advance to Sorcerer/Elemental Master for elemental ride."),
  JT_ROGUE_H: N("Stalker — advance to Shadow Chaser/Abyss Chaser for cloak mount."),
  JT_ALCHEMIST_H: N("Biochemist — advance to Genetic/Biolo for cart mount."),
  JT_BARD_H: N("Clown — advance to Minstrel/Troubadour for performer mount."),
  JT_DANCER_H: N("Gypsy — advance to Wanderer/Trouvere for performer mount."),
  JT_RUNE_KNIGHT: M("dragon-rk", "Rune Knight — dragon."),
  JT_WARLOCK: M("cloud-warlock", "Warlock — flight cloud."),
  JT_RANGER: M("warg", "Ranger — Warg."),
  JT_ARCHBISHOP: M("wings-ab", "Archbishop — wing pedestal."),
  JT_MECHANIC: M("madogear", "Mechanic — Madogear."),
  JT_GUILLOTINE_CROSS: M("leopard", "Guillotine Cross — leopard."),
  JT_RUNE_KNIGHT_H: M("dragon-rk", "Rune Knight (trans) — dragon."),
  JT_WARLOCK_H: M("cloud-warlock", "Warlock (trans) — flight."),
  JT_RANGER_H: M("warg", "Ranger (trans) — Warg."),
  JT_ARCHBISHOP_H: M("wings-ab", "Archbishop (trans) — wing pedestal."),
  JT_MECHANIC_H: M("madogear", "Mechanic (trans) — Madogear."),
  JT_GUILLOTINE_CROSS_H: M("leopard", "Guillotine Cross (trans) — leopard."),
  JT_ROYAL_GUARD: M("gryphon", "Royal Guard — gryphon."),
  JT_SORCERER: M("summon-sorcerer", "Sorcerer — elemental ride."),
  JT_MINSTREL: M("stage-bard", "Minstrel — performer/stage mount."),
  JT_WANDERER: M("stage-bard", "Wanderer — performer/stage mount."),
  JT_SURA: M("tiger-sura", "Sura — tiger."),
  JT_GENETIC: M("cart-genetic", "Genetic — cart body."),
  JT_SHADOW_CHASER: M("cloak-sc", "Shadow Chaser — cloak rider."),
  JT_ROYAL_GUARD_H: M("gryphon", "Royal Guard (trans) — gryphon."),
  JT_SORCERER_H: M("summon-sorcerer", "Sorcerer (trans) — elemental ride."),
  JT_MINSTREL_H: M("stage-bard", "Minstrel (trans) — performer mount."),
  JT_WANDERER_H: M("stage-bard", "Wanderer (trans) — performer mount."),
  JT_SURA_H: M("tiger-sura", "Sura (trans) — tiger."),
  JT_GENETIC_H: M("cart-genetic", "Genetic (trans) — cart."),
  JT_SHADOW_CHASER_H: M("cloak-sc", "Shadow Chaser (trans) — cloak."),
  JT_SUPERNOVICE2: N("Expanded Super Novice — no standard costume mount."),
  JT_KAGEROU: N("Kagerou — costume mount varies by client; not in default table."),
  JT_OBORO: N("Oboro — costume mount varies by client; not in default table."),
  JT_REBELLION: M("rebellion-ride", "Rebellion — bike/vehicle riding costume."),
  JT_DO_SUMMONER: M("summoner-mount", "Summoner — spirit mount."),
  JT_STAR_EMPEROR: M("star-mount", "Star Emperor — celestial mount."),
  JT_SOUL_REAPER: M("soul-mount", "Soul Reaper — soul tether mount."),
  JT_DRAGON_KNIGHT: M("dragon-rk", "Dragon Knight (4th) — dragon."),
  JT_MEISTER: M("madogear", "Meister (4th) — Madogear."),
  JT_SHADOW_CROSS: M("leopard", "Shadow Cross (4th) — leopard."),
  JT_ARCH_MAGE: M("cloud-warlock", "Arch Mage (4th) — flight/cloud."),
  JT_CARDINAL: M("wings-ab", "Cardinal (4th) — pedestal/wings."),
  JT_WINDHAWK: M("warg", "Windhawk (4th) — Warg."),
  JT_IMPERIAL_GUARD: M("gryphon", "Imperial Guard (4th) — gryphon."),
  JT_BIOLO: M("cart-genetic", "Biolo (4th) — cart."),
  JT_ABYSS_CHASER: M("cloak-sc", "Abyss Chaser (4th) — cloak."),
  JT_ELEMENTAL_MASTER: M("summon-sorcerer", "Elemental Master (4th) — elemental ride."),
  JT_INQUISITOR: M("tiger-sura", "Inquisitor (4th) — tiger."),
  JT_TROUBADOUR: M("stage-bard", "Troubadour (4th) — performer mount."),
  JT_TROUVERE: M("stage-bard", "Trouvere (4th) — performer mount."),
  JT_SHINKIRO: N("Shinkiro (4th ninja) — no entry in costume_1–20 table here."),
  JT_SHIRANUI: N("Shiranui (4th ninja) — no entry in costume_1–20 table here."),
  JT_NIGHT_WATCH: N(
    "Night Watch (4th Gunslinger) — no dedicated costume-slot mount in default client list.",
  ),
  JT_HYPER_NOVICE: N("Hyper Novice — no standard costume mount."),
  JT_SPIRIT_HANDLER: M("summoner-mount", "Spirit Handler (4th) — spirit mount."),
  JT_SKY_EMPEROR: M("star-mount", "Sky Emperor (4th) — celestial/star mount."),
  JT_SOUL_ASCETIC: M("soul-mount", "Soul Ascetic (4th) — soul tether mount."),
};

const keys = buildPlannerJobsList({ withRenewal: true }).map(([k]) => k);
const missing = keys.filter((k) => MAP[k] == null);
if (missing.length) {
  console.error("Missing mappings:", missing.join(", "));
  process.exit(1);
}

const extra = Object.keys(MAP).filter((k) => !keys.includes(k));
if (extra.length) {
  console.error("Unknown job keys in MAP:", extra.join(", "));
  process.exit(1);
}

const payload = {
  aboutBoardingHalter:
    "In Renewal, the Boarding Halter is an accessory that grants Riding: when active, your character uses the riding body sprite that belongs to your class (often referred to via client costume/outfit folders). Exact item wording and NPC availability vary by server; pick your class below to see which riding appearance applies when you have Riding.",
  byJob: Object.fromEntries(keys.map((k) => [k, MAP[k]])),
};

fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + "\n", "utf8");
console.log(`Wrote ${OUT}`);
