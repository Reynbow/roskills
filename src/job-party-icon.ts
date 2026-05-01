/**
 * Party-frame job icons (`public/job-icons/Icon_jobs_*.png`), same assets as armour / weapons rows.
 * Classic jobs use the small frame ids (armour filter); expanded / renewal fall back to client job ids.
 */
import { jobArtKey } from "./job-previews";

const JOB_ICON_ID: Record<string, number> = {
  Novice: 0,
  Swordsman: 1,
  Magician: 2,
  Archer: 3,
  Acolyte: 4,
  Merchant: 5,
  Thief: 6,
  Knight: 7,
  Priest: 8,
  Wizard: 9,
  Blacksmith: 10,
  Hunter: 11,
  Assassin: 12,
  Crusader: 14,
  Monk: 15,
  Sage: 16,
  Rogue: 17,
  Alchemist: 18,
  Bard: 19,
  Dancer: 20,
  SuperNovice: 23,
};

const JOB_SECONDARY = new Set([
  "Knight",
  "Crusader",
  "Wizard",
  "Sage",
  "Hunter",
  "Bard",
  "Dancer",
  "Priest",
  "Monk",
  "Rogue",
  "Assassin",
  "Blacksmith",
  "Alchemist",
]);

const JOB_REBIRTH = new Set([
  "LordKnight",
  "Paladin",
  "HighWizard",
  "Professor",
  "Sniper",
  "Clown",
  "Gypsy",
  "HighPriest",
  "Champion",
  "Whitesmith",
  "Creator",
  "AssassinCross",
  "Stalker",
]);

const JOB_REBIRTH_ICON_PARENT: Record<string, string> = {
  LordKnight: "Knight",
  Paladin: "Crusader",
  HighWizard: "Wizard",
  Professor: "Sage",
  Sniper: "Hunter",
  Clown: "Bard",
  Gypsy: "Dancer",
  HighPriest: "Priest",
  Champion: "Monk",
  Whitesmith: "Blacksmith",
  Creator: "Alchemist",
  AssassinCross: "Assassin",
  Stalker: "Rogue",
};

function armourJobPartyIconId(armourKey: string): number | null {
  const direct = JOB_ICON_ID[armourKey];
  if (typeof direct === "number") return direct;
  const parent = JOB_REBIRTH_ICON_PARENT[armourKey];
  if (parent) {
    const id = JOB_ICON_ID[parent];
    if (typeof id === "number") return id;
  }
  return null;
}

/** Planner `JT_*` → armour / filter job keys (for classic + transcendent 2nd icons). */
const JT_TO_ARMOUR_PARTY: Record<string, string> = {
  JT_NOVICE: "Novice",
  JT_SUPERNOVICE: "SuperNovice",
  JT_SWORDMAN: "Swordsman",
  JT_MAGICIAN: "Magician",
  JT_ARCHER: "Archer",
  JT_ACOLYTE: "Acolyte",
  JT_MERCHANT: "Merchant",
  JT_THIEF: "Thief",
  JT_KNIGHT: "Knight",
  JT_PRIEST: "Priest",
  JT_WIZARD: "Wizard",
  JT_BLACKSMITH: "Blacksmith",
  JT_HUNTER: "Hunter",
  JT_ASSASSIN: "Assassin",
  JT_CRUSADER: "Crusader",
  JT_MONK: "Monk",
  JT_SAGE: "Sage",
  JT_ROGUE: "Rogue",
  JT_ALCHEMIST: "Alchemist",
  JT_BARD: "Bard",
  JT_DANCER: "Dancer",
  JT_KNIGHT_H: "LordKnight",
  JT_PRIEST_H: "HighPriest",
  JT_WIZARD_H: "HighWizard",
  JT_BLACKSMITH_H: "Whitesmith",
  JT_HUNTER_H: "Sniper",
  JT_ASSASSIN_H: "AssassinCross",
  JT_CRUSADER_H: "Paladin",
  JT_MONK_H: "Champion",
  JT_SAGE_H: "Professor",
  JT_ROGUE_H: "Stalker",
  JT_ALCHEMIST_H: "Creator",
  JT_BARD_H: "Clown",
  JT_DANCER_H: "Gypsy",
};

/**
 * Client job ids when not covered by classic party frames (expanded + renewal).
 * Mirrors `scripts/planner-zrenderer-jobs.mjs` (first id when an entry is an array).
 */
const CLIENT_JOB_ICON_FALLBACK: Record<string, number> = {
  JT_TAEKWON: 4046,
  JT_STAR: 4047,
  JT_LINKER: 4049,
  JT_NINJA: 25,
  JT_GUNSLINGER: 24,
  JT_RUNE_KNIGHT: 4054,
  JT_WARLOCK: 4055,
  JT_RANGER: 4056,
  JT_ARCHBISHOP: 4057,
  JT_MECHANIC: 4058,
  JT_GUILLOTINE_CROSS: 4059,
  JT_RUNE_KNIGHT_H: 4060,
  JT_WARLOCK_H: 4061,
  JT_RANGER_H: 4062,
  JT_ARCHBISHOP_H: 4063,
  JT_MECHANIC_H: 4064,
  JT_GUILLOTINE_CROSS_H: 4065,
  JT_ROYAL_GUARD: 4066,
  JT_SORCERER: 4067,
  JT_MINSTREL: 4068,
  JT_WANDERER: 4069,
  JT_SURA: 4070,
  JT_GENETIC: 4071,
  JT_SHADOW_CHASER: 4072,
  JT_ROYAL_GUARD_H: 4073,
  JT_SORCERER_H: 4074,
  JT_MINSTREL_H: 4075,
  JT_WANDERER_H: 4076,
  JT_SURA_H: 4077,
  JT_GENETIC_H: 4078,
  JT_SHADOW_CHASER_H: 4079,
  JT_SUPERNOVICE2: 4190,
  JT_KAGEROU: 4211,
  JT_OBORO: 4212,
  JT_REBELLION: 4215,
  JT_DO_SUMMONER: 4218,
  JT_ADVANCED_SUMMONER: 4218,
  JT_STAR_EMPEROR: 4239,
  JT_SOUL_REAPER: 4240,
  JT_DRAGON_KNIGHT: 4252,
  JT_MEISTER: 4253,
  JT_SHADOW_CROSS: 4254,
  JT_ARCH_MAGE: 4255,
  JT_CARDINAL: 4256,
  JT_WINDHAWK: 4257,
  JT_IMPERIAL_GUARD: 4258,
  JT_BIOLO: 4259,
  JT_ABYSS_CHASER: 4260,
  JT_ELEMENTAL_MASTER: 4261,
  JT_INQUISITOR: 4262,
  JT_TROUBADOUR: 4263,
  JT_TROUVERE: 4264,
  JT_SHINKIRO: 4304,
  JT_SHIRANUI: 4305,
  JT_NIGHT_WATCH: 4306,
  JT_HYPER_NOVICE: 4307,
  JT_SPIRIT_HANDLER: 4308,
  JT_SKY_EMPEROR: 4302,
  JT_SOUL_ASCETIC: 4303,
};

export function jobPartyFrameIconIdForPlannerKey(plannerKey: string): number | null {
  const key = jobArtKey(plannerKey);
  const armour = JT_TO_ARMOUR_PARTY[key];
  if (armour) {
    const id = armourJobPartyIconId(armour);
    if (id != null) return id;
  }
  const fb = CLIENT_JOB_ICON_FALLBACK[key];
  return typeof fb === "number" ? fb : null;
}

export function jobPartyFrameIconUrl(plannerKey: string): string | null {
  const id = jobPartyFrameIconIdForPlannerKey(plannerKey);
  if (id == null) return null;
  return `${import.meta.env.BASE_URL}job-icons/Icon_jobs_${id}.png`;
}

/** Glow tier matching armour class-filter chips (classic / trans 2nd jobs only). */
export function jobPartyFrameIconTier(plannerKey: string): "secondary" | "rebirth" | null {
  const key = jobArtKey(plannerKey);
  const armour = JT_TO_ARMOUR_PARTY[key];
  if (!armour) return null;
  if (JOB_REBIRTH.has(armour)) return "rebirth";
  if (JOB_SECONDARY.has(armour)) return "secondary";
  return null;
}

/** `<img>` classes: armour-style chip rendering + optional tier glow. */
export function jobPartyFrameIconImgClass(plannerKey: string): string {
  const tier = jobPartyFrameIconTier(plannerKey);
  const parts = ["job-picker-party-icon", "equip-filter-jobicon"];
  if (tier === "rebirth") parts.push("job-picker-party-icon--rebirth");
  else if (tier === "secondary") parts.push("job-picker-party-icon--secondary");
  return parts.join(" ");
}
