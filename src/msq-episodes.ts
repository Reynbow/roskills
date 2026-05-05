import type { MsqEpisode, MsqWikiPart, RoArmourPiece, RoWeaponPiece } from "./msq-types";
import { AUTOMATIC_ARMOUR_PIECES } from "./msq-automatic-pieces";
import { GLACIER_WEAPON_SEGMENTS } from "./msq-glacier-weapons-pieces";
import { GLACIER_ARMOUR_PIECES } from "./msq-glacier-pieces";
import { GRACE_ARMOUR_PIECES } from "./msq-grace-pieces";
import { GRAY_WOLF_ARMOUR_PIECES } from "./msq-gray-wolf-pieces";
import { IMPERIAL_ARMOUR_PIECES } from "./msq-imperial-pieces";
import { NOBLESSE_ARMOUR_PIECES } from "./msq-noblesse-pieces";
import { SNOW_FLOWER_ARMOUR_PIECES } from "./msq-snow-flower-pieces";

function T(text: string): MsqWikiPart {
  return { kind: "text", text };
}

function L(text: string, wikiPath: string): MsqWikiPart {
  return { kind: "link", text, wikiPath };
}

export const EPISODES: MsqEpisode[] = [
  {
    id: "16.1",
    episode: "Episode 16.1",
    title: "The Royal Banquet",
    url: "https://irowiki.org/wiki/The_Royal_Banquet",
    wikiRequirements: [
      { label: "Base Level", value: [T("100")] },
      {
        label: "Quest Prerequisite(s)",
        value: [L("New World Access Quest", "Cat_Hand_Services#New_World_Access_Quest")],
      },
    ],
    wikiRewards: [
      { label: "Base Experience", value: [T("1,000,000 Base EXP")] },
      { label: "Job Experience", value: [T("1,000,000 Job EXP")] },
      { label: "Item(s)", value: [T("10 "), L("Honor Token", "Honor_Token")] },
      {
        label: "Quest Reward(s)",
        value: [
          T("Access to "),
          L("Terra Gloria", "Terra_Gloria"),
          T(", "),
          L("Royal Banquet Daily Quests", "Royal_Banquet_Daily_Quests"),
          T(", "),
          L("Room of Consciousness Instance", "The_Royal_Banquet#Room_of_Consciousness_Instance"),
          T(", "),
          L("Royal Family Sidequest", "The_Royal_Banquet#Sidequests"),
        ],
      },
    ],
    synopsis:
      "Royal court storyline in Rune-Midgarts that opens Episode 16: banquet events, allied NPCs, and the first major MSQ beats of the arc.",
    armourSetName: "Noblesse",
    armourPieces: NOBLESSE_ARMOUR_PIECES,
    armourIconNote:
      "Noblesse armour is exchanged from Noblesse Trader in Prontera Castle for Honor Tokens. iRO Wiki notes this shop does not require completing The Royal Banquet questline.",
  },
  {
    id: "16.2",
    episode: "Episode 16.2",
    title: "Terra Gloria",
    url: "https://irowiki.org/wiki/Terra_Gloria",
    wikiRequirements: [
      { label: "Base Level", value: [T("100")] },
      {
        label: "Quest Prerequisite(s)",
        value: [L("The Royal Banquet (Main Quest)", "The_Royal_Banquet#Learning_About_the_Families")],
      },
    ],
    wikiRewards: [
      {
        label: "Item(s)",
        value: [
          T("50 "),
          L("Schwartz's Honor Token", "Schwartz%27s_Honor_Token"),
          T(", 10 "),
          L("Honor Token", "Honor_Token"),
        ],
      },
      { label: "Quest Reward(s)", value: [L("Illusion", "Illusion")] },
    ],
    synopsis:
      "Episode 16 continues as the narrative leaves the capital—new areas, allies, and chained quests that finish the Terra Gloria arc.",
    armourSetName: "Imperial",
    armourPieces: IMPERIAL_ARMOUR_PIECES,
    armourIconNote:
      "Imperial equipment is exchanged from Imperial trader in the Clana Nemieri Rebellion Base (reached during Terra Gloria) for Schwartz's Honor Tokens—10 tokens per piece, level 125, character bound. Class-specific body armor; shared Attack/Magic manteau, boots, and ring. See iRO Wiki: Imperial Equipment.",
  },
  {
    id: "17.1",
    episode: "Episode 17.1",
    title: "Illusion",
    url: "https://irowiki.org/wiki/Illusion",
    wikiRequirements: [
      { label: "Base Level", value: [T("110")] },
      { label: "Quest Prerequisite(s)", value: [L("Terra Gloria", "Terra_Gloria")] },
    ],
    wikiRewards: [
      { label: "Base Experience", value: [T("Multiple")] },
      { label: "Job Experience", value: [T("Multiple")] },
      { label: "Item(s)", value: [T("Multiple")] },
      {
        label: "Quest Reward(s)",
        value: [
          L("Legacy of the Wise One", "Legacy_of_the_Wise_One"),
          T(", "),
          L("Illusion Daily Quests", "Illusion_Daily_Quests"),
        ],
      },
    ],
    synopsis:
      "Episode 17.1 MSQ content built around illusion-themed fields and instances, tying dungeon progression to the main plot.",
    armourSetName: "Grace",
    armourPieces: GRACE_ARMOUR_PIECES,
    armourIconNote:
      "Grace equipment is the level 150 set exchanged from Grace Trader in Cor (sp_cor) with Mysterious Components after completing the full Illusion questline. Class-specific body armor; shared Attack/Magic manteau, boots, and ring. Cor Cores are used for the Grace Upgrade Ticket (+9). See iRO Wiki: Grace Equipment.",
  },
  {
    id: "17.2",
    episode: "Episode 17.2",
    title: "Legacy of the Wise One",
    url: "https://irowiki.org/wiki/Legacy_of_the_Wise_One_(17.2)_Equipment_and_Enchants",
    wikiRequirements: [
      { label: "Base Level", value: [T("130")] },
      {
        label: "Item(s) (Consumed)",
        value: [
          T("1 "),
          L("Yggdrasil Leaf", "Yggdrasil_Leaf"),
          T(", 10 "),
          L("Broken Sword", "Broken_Sword"),
          T(", 10 "),
          L("Fluorescent Liquid", "Fluorescent_Liquid"),
        ],
      },
      { label: "Quest Prerequisite(s)", value: [L("Illusion", "Illusion")] },
    ],
    wikiRewards: [
      { label: "Base Experience", value: [T("Multiple")] },
      { label: "Job Experience", value: [T("Multiple")] },
      { label: "Item(s)", value: [T("105 "), L("Barmeal Ticket", "Barmeal_Ticket")] },
      { label: "Quest Reward(s)", value: [L("Direction of Prayer", "Direction_of_Prayer")] },
    ],
    synopsis:
      "Episode 17.2 picks up core threads around the Wise One and related world-building, closing out the Episode 17 storyline.",
    armourSetName: "Automatic",
    armourPieces: AUTOMATIC_ARMOUR_PIECES,
    armourIconNote:
      "Automatic equipment is exchanged from Yeonchung (ba_in01) in Varmundt Mansion Dining with Barmeal Tickets and matching +9 Illusion gear. Cubrain sells Illusion / Automatic Upgrade Cubes; Ryza applies Automatic Modules. See iRO Wiki: Legacy of the Wise One (17.2) Equipment and Enchants.",
  },
  {
    id: "18",
    episode: "Episode 18",
    title: "Direction of Prayer",
    url: "https://irowiki.org/wiki/Direction_of_Prayer",
    wikiRequirements: [
      { label: "Base Level", value: [T("170")] },
      {
        label: "Quest Prerequisite(s)",
        value: [
          L("Legacy of the Wise One", "Legacy_of_the_Wise_One"),
          T("; "),
          L("Rachel Sanctuary Quest", "Rachel_Sanctuary_Quest"),
          T(" step 4 (two bypass options on iRO Wiki)"),
        ],
      },
    ],
    wikiRewards: [
      { label: "Base Experience", value: [T("TBD")] },
      { label: "Job Experience", value: [T("TBD")] },
      {
        label: "Item(s)",
        value: [
          T("700 "),
          L("Amethyst Fragment", "Amethyst_Fragment"),
          T(" (main quest: 460; side quest: 240); "),
          L("Costume Mini Elly", "Costume_Mini_Elly"),
        ],
      },
      {
        label: "Quest Reward(s)",
        value: [L("Issgard Land of Snow Flowers", "Issgard_Land_of_Snow_Flowers")],
      },
    ],
    synopsis:
      "Episode 18 focuses on prayer, faith, and the next major story beats as the MSQ advances toward later regions.",
    armourSetName: "Gray Wolf",
    armourPieces: GRAY_WOLF_ARMOUR_PIECES,
    armourIconNote:
      "Gray Wolf is the Episode 18 ten-piece set (Suit/Robe bodies, Muffler/Manteau, Boots/Shoes, physical Pendant+Ring and magic Earring+Necklace). Tooltip stats match Divine Pride (iRO) for the listed item IDs.",
  },
  {
    id: "19",
    episode: "Episode 19",
    title: "Issgard, Land of Snow Flowers",
    url: "https://irowiki.org/wiki/Issgard_Land_of_Snow_Flowers",
    wikiRequirements: [
      { label: "Base Level", value: [T("200")] },
      { label: "Quest Prerequisite(s)", value: [L("Direction of Prayer", "Direction_of_Prayer")] },
    ],
    wikiRewards: [
      {
        label: "Item(s)",
        value: [T("244 "), L("Snow Flower Petal", "Snow_Flower_Petal")],
      },
    ],
    synopsis:
      "Episode 19 takes the main quest to Issgard’s snowflower regions, with a full chain of field and story quests on iRO Wiki.",
    armourSetName: "Glacier & Snow Flower",
    armourPieces: [],
    armourSegments: [
      { segmentName: "Glacier", pieces: GLACIER_ARMOUR_PIECES },
      { segmentName: "Snow Flower", pieces: SNOW_FLOWER_ARMOUR_PIECES },
    ],
    armourIconNote:
      "Per iRO Wiki Free-to-play Equipment (Issgard 19 — Glacier weapon, Snow Flower armour): https://irowiki.org/wiki/Free-to-play_Equipment#Lv_210._Issgard_19_-_Glacier_Weapon,_Snow_Flower_Armor — Snow Flower is the level 210 ten-piece petal exchange at the Ice Castle (100 Snow Flower Petals each). Glacier is the level 230 ten-piece armour set paired with the Glacier weapon line. See Issgard Land of Snow Flowers and Divine Pride (iRO) for full stats.",
    weaponSetName: "Glacier & Dim Glacier",
    weaponSegments: GLACIER_WEAPON_SEGMENTS,
    weaponIconNote:
      "Glacier shop weapons cost 150,000 zeny each and have no card slot. Dim Glacier [1] weapons are level 230 drops (Abandoned Pit or Serpent God maps) with a different enchant layout — see iRO Wiki Issgard enchants and Free-to-play Equipment (Lv 230 Dim Glacier).",
  },
  {
    id: "20",
    episode: "Episode 20",
    title: "Undying",
    url: "https://irowiki.org/wiki/Undying",
    synopsis:
      "Episode 20 is the newest arc; iRO Wiki may still be filling in walkthrough details as the episode evolves.",
    armourSetName: "Undying",
    armourPieces: [],
    armourIconNote:
      "Representative icons not listed yet—see iRO Wiki and patch notes as this episode’s gear is finalized.",
  },
];

export const EPISODE_TOTAL = EPISODES.length;

export function episodeArmourPiecesFlat(ep: MsqEpisode): readonly RoArmourPiece[] {
  if (ep.armourSegments?.length) {
    return ep.armourSegments.flatMap((s) => s.pieces);
  }
  return ep.armourPieces;
}

export function episodeWeaponPiecesFlat(ep: MsqEpisode): readonly RoWeaponPiece[] {
  if (ep.weaponSegments?.length) {
    return ep.weaponSegments.flatMap((s) => s.pieces);
  }
  return ep.weaponPieces ?? [];
}
