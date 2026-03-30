/**
 * Class preview artwork for the job picker (mostly iRO Wiki; Mage + Clown use alternate portraits).
 * @see https://irowiki.org/
 */
const JOB_PREVIEW_BY_KEY: Record<string, string> = {
  JT_NOVICE: "https://irowiki.org/w/images/f/f4/Novice.png",
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

export function jobPreviewSpriteUrl(jobKey: string): string | undefined {
  return JOB_PREVIEW_BY_KEY[jobKey];
}
