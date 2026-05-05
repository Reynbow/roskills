/** Tooltip payload — stats paraphrased from Divine Pride (iRO) item pages. */
export type RoArmourPiece = {
  id: number;
  name: string;
  flavor: string;
  effects: readonly string[];
  equipType: string;
  subtype?: string;
  defense: string;
  weight: string;
  property?: string;
  slots: string;
  refineable: string;
  requiredLevel: string;
  jobs: string;
  location: string;
  armorLevel?: string;
  upgradeTicket?: string;
};

/** Tooltip payload — weapon stats from rAthena / Divine Pride (iRO), paraphrased for the MSQ card. */
export type RoWeaponPiece = {
  id: number;
  name: string;
  flavor: string;
  effects: readonly string[];
  equipType: "Weapon";
  subtype: string;
  attack: string;
  /** Omitted for purely physical bow/gun lines when source data has no MATK. */
  matk?: string;
  weight: string;
  weaponLevel: string;
  range: string;
  slots: string;
  refineable: string;
  requiredLevel: string;
  jobs: string;
  location: string;
};

/** Optional extra armour line on one episode card (e.g. Glacier + Snow Flower for Issgard). */
export type MsqArmourSegment = {
  segmentName: string;
  pieces: readonly RoArmourPiece[];
};

export type MsqWeaponSegment = {
  segmentName: string;
  pieces: readonly RoWeaponPiece[];
};

/** Segment of a wiki infobox cell: plain text or a link to an iRO Wiki article path (after `/wiki/`). */
export type MsqWikiPart =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "link"; readonly text: string; readonly wikiPath: string };

/** One row from the iRO Wiki quest infobox (Requirements / Rewards tables). */
export type MsqWikiRow = {
  readonly label: string;
  readonly value: readonly MsqWikiPart[];
};

export type MsqEpisode = {
  id: string;
  episode: string;
  title: string;
  url: string;
  /** Rows under the wiki infobox “Requirements” section (first main-quest box where applicable). */
  wikiRequirements?: readonly MsqWikiRow[];
  /** Rows under the wiki infobox “Rewards” section. */
  wikiRewards?: readonly MsqWikiRow[];
  synopsis: string;
  armourSetName: string;
  /** Flat list for tooltips / search; use `[]` when only `armourSegments` is populated. */
  armourPieces: readonly RoArmourPiece[];
  armourSegments?: readonly MsqArmourSegment[];
  armourIconNote?: string;
  /** Episode weapon lines (e.g. Issgard Glacier shop + Dim Glacier drops). */
  weaponSetName?: string;
  weaponPieces?: readonly RoWeaponPiece[];
  weaponSegments?: readonly MsqWeaponSegment[];
  weaponIconNote?: string;
};
