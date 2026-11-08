import type { Content } from '../../../data';
import { weaponSkinChoices, weaponSkinFor, type GameState } from '../../../game';

/**
 * View model of the Wardrobe "Weapon skins" tab (a test). Built generically over
 * `Content.weaponSkins`: any weapon kind with a skin set shows up as a weapon to pick. All rules
 * (what can be worn, what is worn) come from game; this only shapes them for the screen.
 */

export interface SkinTileView {
  /** Skin id, or null for the Original (unskinned) option. */
  id: string | null;
  name: string;
  /** Art id of the skin; null for Original (drawn with its animated sprite). */
  art: string | null;
  worn: boolean;
  picked: boolean;
  available: boolean;
  cost: number;
}

export interface WeaponOption {
  kind: string;
  name: string;
}

export interface WeaponSkinsView {
  weapons: WeaponOption[];
  weapon: string | null;
  tiles: SkinTileView[];
  /** The skin being previewed (null = Original). */
  pickedId: string | null;
  pickedName: string;
  /** Art id to draw in the preview (null = the animated original). */
  previewArt: string | null;
  /** Card the preview is drawn on (first card whose unique item is this weapon). */
  previewCardId: string | null;
  previewCardName: string;
  ownsPreviewCard: boolean;
  /** The preview is the worn skin already. */
  isWorn: boolean;
  /** Apply is possible (not worn, and available). */
  canApply: boolean;
}

export interface SkinSelection {
  weapon?: string | null;
  /** undefined = the worn skin; null = Original; string = that skin. */
  skin?: string | null | undefined;
}

export function weaponOptions(content: Content): WeaponOption[] {
  // Generic kinds with legacy skins only (no base art) wait for the Legacy group of the new tab (ui agent).
  return [...content.weaponSkinsByWeapon.values()]
    .filter((set) => set.baseArt !== undefined)
    .map(({ weapon: kind }) => ({
      kind,
      name: content.progression.evolutions.items.find((i) => i.kind === kind)?.name ?? kind,
    }));
}

export function weaponSkinsView(
  state: GameState,
  content: Content,
  selection: SkinSelection,
  originalName: string,
): WeaponSkinsView {
  const weapons = weaponOptions(content);
  const weapon = weapons.find((w) => w.kind === selection.weapon)?.kind ?? weapons[0]?.kind ?? null;
  const worn = weapon ? weaponSkinFor(state, weapon) : null;
  const choices = weapon ? weaponSkinChoices(state, content, weapon) : [];
  const wanted = selection.skin === undefined ? worn : selection.skin;
  const pickedId = choices.some((c) => c.id === wanted) ? wanted : null;
  const tiles: SkinTileView[] = [
    {
      id: null,
      name: originalName,
      art: null,
      worn: worn === null,
      picked: pickedId === null,
      available: true,
      cost: 0,
    },
    ...choices.map((c) => ({
      id: c.id,
      name: c.name,
      art: c.art,
      worn: c.equipped,
      picked: c.id === pickedId,
      available: c.available,
      cost: c.cost,
    })),
  ];
  const picked = tiles.find((t) => t.picked) ?? tiles[0]!;
  const card = weapon ? content.cards.find((c) => c.evolution === weapon) : undefined;
  return {
    weapons,
    weapon,
    tiles,
    pickedId,
    pickedName: picked.name,
    previewArt: picked.art,
    previewCardId: card?.id ?? null,
    previewCardName: card?.name ?? '',
    ownsPreviewCard: card ? state.cards.owned[card.id] !== undefined : false,
    isWorn: picked.worn,
    canApply: !picked.worn && picked.available,
  };
}

/** Changes whenever the tab has to be rebuilt. */
export function weaponSkinsSignature(state: GameState): string {
  return JSON.stringify([state.weaponSkins, Object.keys(state.cards.owned).length]);
}
