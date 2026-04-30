/**
 * Class picker uses bundled standing renders (`jobPickerStandSpriteUrl` → `public/job-stand-pick/`).
 * `jobPreviewSpriteUrl` remains for the sit-dock fallback (iRO Wiki + Divine Pride where mapped).
 * @see https://irowiki.org/
 */
const JOB_PREVIEW_BY_KEY: Record<string, string> = {
  JT_NOVICE: "https://irowiki.org/w/images/f/f4/Novice.png",
  JT_SUPERNOVICE: "https://irowiki.org/w/images/4/49/Super_Novice.png",
  JT_TAEKWON: "https://irowiki.org/w/images/8/8a/TaeKwon_Kid.png",
  JT_STAR: "https://irowiki.org/w/images/1/12/TaeKwon_Master.png",
  JT_LINKER: "https://irowiki.org/w/images/6/6f/Soul_Linker.png",
  JT_NINJA: "https://irowiki.org/w/images/2/21/Ninja.png",
  JT_GUNSLINGER: "https://irowiki.org/w/images/c/c2/Gunslinger.png",
  JT_SWORDMAN: "https://irowiki.org/w/images/9/9b/Swordman.png",
  JT_MAGICIAN: "https://irowiki.org/w/images/2/20/Mage.png",
  JT_ARCHER: "https://irowiki.org/w/images/2/29/Archer.png",
  JT_ACOLYTE: "https://irowiki.org/w/images/c/c2/Acolyte.png",
  JT_MERCHANT: "https://irowiki.org/w/images/1/19/Merchant.png",
  JT_THIEF: "https://irowiki.org/w/images/f/fc/Thief.png",
  JT_KNIGHT: "https://irowiki.org/w/images/6/6b/Knight.png",
  JT_PRIEST: "https://irowiki.org/w/images/1/14/Priest.png",
  JT_WIZARD: "https://irowiki.org/w/images/c/c7/Wizard.png",
  JT_BLACKSMITH: "https://irowiki.org/w/images/b/be/Blacksmith.png",
  JT_HUNTER: "https://irowiki.org/w/images/4/4b/Hunter.png",
  JT_ASSASSIN: "https://irowiki.org/w/images/6/69/Assassin.png",
  JT_CRUSADER: "https://irowiki.org/w/images/e/eb/Crusader.png",
  JT_MONK: "https://irowiki.org/w/images/4/44/Monk.png",
  JT_SAGE: "https://irowiki.org/w/images/f/f8/Sage.png",
  JT_ROGUE: "https://irowiki.org/w/images/5/59/Rogue.png",
  JT_ALCHEMIST: "https://irowiki.org/w/images/5/5b/Alchemist.png",
  JT_BARD: "https://irowiki.org/w/images/8/82/Bard.png",
  JT_DANCER: "https://irowiki.org/w/images/4/41/Dancer.png",
  JT_KNIGHT_H: "https://irowiki.org/w/images/e/ef/Lord_Knight.png",
  JT_WIZARD_H: "https://irowiki.org/w/images/5/58/High_Wizard.png",
  JT_BLACKSMITH_H: "https://irowiki.org/w/images/7/71/Mastersmith.png",
  JT_PRIEST_H: "https://irowiki.org/w/images/a/ab/High_Priest.png",
  JT_ASSASSIN_H: "https://irowiki.org/w/images/1/18/Assassin_Cross.png",
  JT_HUNTER_H: "https://irowiki.org/w/images/8/8f/Sniper.png",
  JT_CRUSADER_H: "https://irowiki.org/w/images/b/b2/Paladin.png",
  JT_MONK_H: "https://irowiki.org/w/images/d/d7/Champion.png",
  JT_SAGE_H: "https://irowiki.org/w/images/c/c5/Scholar.png",
  JT_ROGUE_H: "https://irowiki.org/w/images/4/4b/Stalker.png",
  JT_ALCHEMIST_H: "https://irowiki.org/w/images/9/94/Biochemist.png",
  JT_BARD_H:
    "https://static.wikia.nocookie.net/ragnarok_gamepedia_en/images/a/a9/RO_Clown%28player%29.gif/revision/latest",
  JT_DANCER_H: "https://irowiki.org/w/images/e/e5/Gypsy.png",
};

const JOB_ART_KEY_ALIAS: Record<string, string> = {
  JT_ADVANCED_SUMMONER: "JT_DO_SUMMONER",
};

export function jobArtKey(jobKey: string): string {
  return JOB_ART_KEY_ALIAS[jobKey] ?? jobKey;
}

export function doramMaleSpriteArtKey(jobKey: string, gender: "male" | "female"): string {
  const key = jobArtKey(jobKey);
  return key === "JT_DO_SUMMONER" && gender === "male" ? "JT_SPIRIT_HANDLER" : key;
}

/** rAthena / client job ids → Divine Pride portraits (`/images/job/{id}.png`). */
const JOB_PREVIEW_DIVINE_PRIDE_ID: Record<string, number> = {
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

function divinePrideJobImageUrl(jobId: number): string {
  return `https://static.divine-pride.net/images/job/${jobId}.png`;
}

export function jobPreviewSpriteUrl(jobKey: string): string | undefined {
  const key = jobArtKey(jobKey);
  const wiki = JOB_PREVIEW_BY_KEY[key];
  if (wiki) return wiki;
  const id = JOB_PREVIEW_DIVINE_PRIDE_ID[key];
  if (id != null) return divinePrideJobImageUrl(id);
  return undefined;
}

/**
 * Local standing renders for the class picker (`npm run render:job-stand-picker*`).
 * Male + female are shown side-by-side in each card; see `public/job-stand-pick/`.
 */
export function jobPickerStandSpriteUrl(jobKey: string, gender: "male" | "female"): string {
  const base = import.meta.env.BASE_URL;
  return `${base}job-stand-pick/${doramMaleSpriteArtKey(jobKey, gender)}--${gender}.png`;
}
