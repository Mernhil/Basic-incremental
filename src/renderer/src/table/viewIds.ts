/** Every full view the table can open. The dock order is fixed in `table/registry.ts`. */
export const VIEW_IDS = [
  'logging',
  'mining',
  'cards',
  'summon',
  'wardrobe',
  'skills',
  'achievements',
  'shop',
  'ascension',
  'forge',
  'training',
  'expeditions',
  'raids',
  'upgrades',
  'settings',
] as const;
export type ViewId = (typeof VIEW_IDS)[number];
