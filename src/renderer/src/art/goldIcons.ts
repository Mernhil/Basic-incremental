/**
 * The sixteen gold icons of the charcoal and gold shell (art/icons-gold/, 64 x 64, from the art
 * controller's kit): the nine dock plaques and the header's goals, details, sound, money and
 * scroll icons. They replace the old icons in those places only. Shown at a whole pixel scale
 * (`.gold-icon` in theme/shellGold.css).
 */
const URLS = import.meta.glob<string>('./icons-gold/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

export const GOLD_ICONS = [
  'cards',
  'summon',
  'wardrobe',
  'skill_tree',
  'achievements',
  'shop',
  'forge',
  'upgrades',
  'settings',
  'goals',
  'details',
  'sound_on',
  'sound_off',
  'money',
  'summon_scroll',
  'glamour_scroll',
] as const;
export type GoldIcon = (typeof GOLD_ICONS)[number];

export function goldIconUrl(name: GoldIcon): string {
  return URLS[`./icons-gold/${name}.png`] ?? '';
}

/** The icon as markup: a pixelated <img>, `size` names the slot (`dock` 64 px, `head` the header's). */
export function goldIcon(name: GoldIcon, size: 'dock' | 'head' = 'head'): string {
  return `<img class="gold-icon gold-icon--${size}" src="${goldIconUrl(name)}" alt="" draggable="false">`;
}
