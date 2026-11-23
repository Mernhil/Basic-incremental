/**
 * The six stat icons of the weapon panel (art/stat-icons/, 32 x 32, from the art controller, used
 * byte for byte): damage, speed, dps, health, crit and crit damage. Shown at whole pixel scales
 * (`.wst-icon` in ui/weaponStats.css).
 */
const URLS = import.meta.glob<string>('./stat-icons/*.png', {
  eager: true,
  query: '?url',
  import: 'default',
});

export type StatIcon = 'damage' | 'speed' | 'dps' | 'health' | 'crit' | 'crit_damage';

export function statIconUrl(name: StatIcon): string {
  return URLS[`./stat-icons/stat-${name}.png`] ?? '';
}
