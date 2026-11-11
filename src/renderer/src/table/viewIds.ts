/** Every full view the table can open. The dock order is fixed in `table/registry.ts`. */
export const VIEW_IDS = [
  'dungeon',
  'logging',
  'mining',
  'cards',
  'summon',
  'wardrobe',
  'skills',
  'achievements',
  'shop',
  'forge',
  'upgrades',
  'settings',
] as const;
export type ViewId = (typeof VIEW_IDS)[number];
