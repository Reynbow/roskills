/**
 * Planner job keys ↔ client job ids for zrenderer batch scripts (sit, stand picker, …).
 * Keep in sync with `skillinfo/jobinheritlist.lua` / importer job lists.
 */

/** @type {readonly [string, number | readonly number[]][]} */
export const JOBS_BASE = [
  ["JT_NOVICE", 0],
  ["JT_SUPERNOVICE", 23],
  ["JT_TAEKWON", 4046],
  ["JT_STAR", [4047, 4048]],
  ["JT_LINKER", 4049],
  ["JT_NINJA", 25],
  ["JT_GUNSLINGER", 24],
  ["JT_SWORDMAN", 1],
  ["JT_MAGICIAN", 2],
  ["JT_ARCHER", 3],
  ["JT_ACOLYTE", 4],
  ["JT_MERCHANT", 5],
  ["JT_THIEF", 6],
  ["JT_KNIGHT", 7],
  ["JT_PRIEST", 8],
  ["JT_WIZARD", 9],
  ["JT_BLACKSMITH", 10],
  ["JT_HUNTER", 11],
  ["JT_ASSASSIN", 12],
  ["JT_CRUSADER", 14],
  ["JT_MONK", 15],
  ["JT_SAGE", 16],
  ["JT_ROGUE", 17],
  ["JT_ALCHEMIST", 18],
  ["JT_BARD", 19],
  ["JT_DANCER", 20],
  ["JT_KNIGHT_H", 4008],
  ["JT_PRIEST_H", 4009],
  ["JT_WIZARD_H", 4010],
  ["JT_BLACKSMITH_H", 4011],
  ["JT_HUNTER_H", 4012],
  ["JT_ASSASSIN_H", 4013],
  ["JT_CRUSADER_H", 4015],
  ["JT_MONK_H", 4016],
  ["JT_SAGE_H", 4017],
  ["JT_ROGUE_H", 4018],
  ["JT_ALCHEMIST_H", 4019],
  ["JT_BARD_H", 4020],
  ["JT_DANCER_H", 4021],
];

/** @type {readonly [string, number | readonly number[]][]} */
export const JOBS_RENEWAL_EXTRA = [
  ["JT_RUNE_KNIGHT", 4054],
  ["JT_WARLOCK", 4055],
  ["JT_RANGER", 4056],
  ["JT_ARCHBISHOP", 4057],
  ["JT_MECHANIC", 4058],
  ["JT_GUILLOTINE_CROSS", 4059],
  ["JT_RUNE_KNIGHT_H", 4060],
  ["JT_WARLOCK_H", 4061],
  ["JT_RANGER_H", 4062],
  ["JT_ARCHBISHOP_H", 4063],
  ["JT_MECHANIC_H", 4064],
  ["JT_GUILLOTINE_CROSS_H", 4065],
  ["JT_ROYAL_GUARD", 4066],
  ["JT_SORCERER", 4067],
  ["JT_MINSTREL", 4068],
  ["JT_WANDERER", 4069],
  ["JT_SURA", 4070],
  ["JT_GENETIC", 4071],
  ["JT_SHADOW_CHASER", 4072],
  ["JT_ROYAL_GUARD_H", 4073],
  ["JT_SORCERER_H", 4074],
  ["JT_MINSTREL_H", 4075],
  ["JT_WANDERER_H", 4076],
  ["JT_SURA_H", 4077],
  ["JT_GENETIC_H", 4078],
  ["JT_SHADOW_CHASER_H", 4079],
  ["JT_SUPERNOVICE2", 4190],
  ["JT_KAGEROU", 4211],
  ["JT_OBORO", 4212],
  ["JT_REBELLION", 4215],
  ["JT_DO_SUMMONER", 4218],
  ["JT_STAR_EMPEROR", [4239, 4243, 4245]],
  ["JT_SOUL_REAPER", [4240, 4246]],
  ["JT_DRAGON_KNIGHT", 4252],
  ["JT_MEISTER", 4253],
  ["JT_SHADOW_CROSS", 4254],
  ["JT_ARCH_MAGE", 4255],
  ["JT_CARDINAL", 4256],
  ["JT_WINDHAWK", 4257],
  ["JT_IMPERIAL_GUARD", 4258],
  ["JT_BIOLO", 4259],
  ["JT_ABYSS_CHASER", 4260],
  ["JT_ELEMENTAL_MASTER", 4261],
  ["JT_INQUISITOR", 4262],
  ["JT_TROUBADOUR", 4263],
  ["JT_TROUVERE", 4264],
  ["JT_SHINKIRO", 4304],
  ["JT_SHIRANUI", 4305],
  ["JT_NIGHT_WATCH", 4306],
  ["JT_HYPER_NOVICE", 4307],
  ["JT_SPIRIT_HANDLER", 4308],
  ["JT_SKY_EMPEROR", [4302, 4316]],
  ["JT_SOUL_ASCETIC", 4303],
];

/**
 * @param {{ renewalOnly?: boolean; withRenewal?: boolean }} o
 * @returns {readonly [string, number | readonly number[]][]}
 */
export function buildPlannerJobsList(o) {
  if (o.renewalOnly) return JOBS_RENEWAL_EXTRA;
  if (o.withRenewal) return [...JOBS_BASE, ...JOBS_RENEWAL_EXTRA];
  return JOBS_BASE;
}
