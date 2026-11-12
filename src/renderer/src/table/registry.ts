import { collectionViews } from '../views/collection';
import { dungeonViews } from '../views/dungeon';
import { gatheringViews } from '../views/gathering';
import { metaViews } from '../views/meta';
import type { TablePieceDef, ViewDef, ViewId, ViewPackage } from './contract';

/**
 * Which package brings which views, and the dock's order (UI_RULES.md §2, "The dock piles").
 * Owned by the shell (package 8): a view package changes only its own `views/<package>/index.ts`.
 */

export const PACKAGES: readonly ViewPackage[] = [
  dungeonViews, // 9a: the dungeon window and the dungeon view
  gatheringViews, // 9b: the Logging and Mining wings and views, Forge
  collectionViews, // 9c: Cards, Summon, Wardrobe
  metaViews, // 9d: Skill Tree, Achievements, Shop, Upgrades, Settings
];

/** The dock, left to right (user, mockup 4a). */
export const DOCK: readonly ViewId[] = [
  'cards',
  'summon',
  'wardrobe',
  'skills',
  'achievements',
  'shop',
  'forge',
  'upgrades',
  'settings',
];

export function allViews(): ViewDef[] {
  return PACKAGES.flatMap((p) => p.views);
}

export function allPieces(): TablePieceDef[] {
  return PACKAGES.flatMap((p) => p.pieces ?? []);
}
