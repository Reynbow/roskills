import type { RoArmourPiece, RoWeaponPiece } from "./msq-types";
import { EPISODES, episodeArmourPiecesFlat, episodeWeaponPiecesFlat } from "./msq-episodes";

const MSQ_PIECE_BY_ID = new Map<number, RoArmourPiece>();
const MSQ_WEAPON_BY_ID = new Map<number, RoWeaponPiece>();

for (const ep of EPISODES) {
  for (const p of episodeArmourPiecesFlat(ep)) {
    MSQ_PIECE_BY_ID.set(p.id, p);
  }
  for (const w of episodeWeaponPiecesFlat(ep)) {
    MSQ_WEAPON_BY_ID.set(w.id, w);
  }
}

export function getMsqItemTooltipPayload(
  id: number,
):
  | { readonly kind: "armour"; readonly piece: RoArmourPiece }
  | { readonly kind: "weapon"; readonly piece: RoWeaponPiece }
  | null {
  const armourPiece = MSQ_PIECE_BY_ID.get(id);
  if (armourPiece) return { kind: "armour", piece: armourPiece };
  const weaponPiece = MSQ_WEAPON_BY_ID.get(id);
  if (weaponPiece) return { kind: "weapon", piece: weaponPiece };
  return null;
}
