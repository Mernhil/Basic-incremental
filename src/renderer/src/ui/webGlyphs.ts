/**
 * The small icons of the skill web's nodes (UI_RULES.md §2 The Skill Tree, picks 4a and 4c). One
 * shape per kind of effect, drawn as a plain filled path in a 24 x 24 box; the colour comes from the
 * node's branch. Placeholders until the node art is drawn.
 */

export type WebGlyph =
  | 'crit'
  | 'pace'
  | 'heart'
  | 'sword'
  | 'shield'
  | 'coin'
  | 'xp'
  | 'layers'
  | 'skull'
  | 'gauge'
  | 'hand'
  | 'core'
  | 'flame'
  | 'scroll'
  | 'key'
  | 'lock';

const PATHS: Record<WebGlyph, string> = {
  crit: '<path d="M12 2l2.4 7.6L22 12l-7.6 2.4L12 22l-2.4-7.6L2 12l7.6-2.4z"/>',
  pace: '<path d="M13 2L5 13h6l-1 9 8-11h-6z"/>',
  heart: '<path d="M12 21s-8-5.2-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.8-8 11-8 11z"/>',
  sword: '<path d="M14 3h7v7L10 21l-3-3 2-2-3-3-2 2-2-2 3-3 3 3 2-2z"/>',
  shield: '<path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9 10h5a2 2 0 0 1 0 4H9" fill="none" stroke="#0b0e20" stroke-width="1.8"/>',
  xp: '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.5 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z"/>',
  layers: '<path d="M12 3l9 5-9 5-9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5"/>',
  skull:
    '<path d="M12 3a8 8 0 0 0-5 14v3h3v-2h4v2h3v-3A8 8 0 0 0 12 3z"/><circle cx="9" cy="11" r="1.8" fill="#0b0e20"/><circle cx="15" cy="11" r="1.8" fill="#0b0e20"/>',
  gauge:
    '<path d="M3 17a9 9 0 1 1 18 0z"/><path d="M12 17l4-6" stroke="#0b0e20" stroke-width="2"/>',
  hand: '<rect x="4" y="9" width="3" height="10" rx="1"/><rect x="8" y="5" width="3" height="14" rx="1"/><rect x="12" y="4" width="3" height="15" rx="1"/><rect x="16" y="7" width="3" height="12" rx="1"/>',
  core: '<path d="M12 2l8 5v10l-8 5-8-5V7z"/><path d="M12 7l4 2.5v5L12 17l-4-2.5v-5z" fill="#0b0e20" opacity=".5"/>',
  flame: '<path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-4 3-7 1 1 1.5 2 2 2 1-2 1-4 1-7z"/>',
  scroll:
    '<path d="M6 3h12v14a4 4 0 0 1-4 4H6a3 3 0 0 0 3-3V6a3 3 0 0 0-3-3z"/><path d="M9 8h6M9 12h6" fill="none" stroke="#0b0e20" stroke-width="1.6"/>',
  key: '<path d="M12 1l3 6 7 1-5 5 1.5 7L12 16.5 5.5 20 7 13 2 8l7-1z"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2.4"/>',
};

/** The icon for a modifier stat id ("burst.fill", "combat.critChance", "drops.moneyMultiplier"...). */
export function statGlyph(stat: string | undefined): WebGlyph {
  const s = (stat ?? '').toLowerCase();
  if (!s) return 'key';
  if (s.includes('crit')) return 'crit';
  if (s.includes('burst') || s.includes('interval') || s.includes('speed') || s.includes('fill'))
    return 'pace';
  if (s.includes('health') || s.includes('heal') || s.includes('regen')) return 'heart';
  if (s.includes('resist') || s.includes('malus') || s.includes('guard') || s.includes('refund'))
    return 'shield';
  if (s.includes('damage') || s.includes('strength')) return 'sword';
  if (s.includes('money') || s.includes('payout') || s.includes('lucky') || s.includes('coin'))
    return 'coin';
  if (s.includes('scroll') || s.includes('summon') || s.includes('pity') || s.includes('luck'))
    return 'scroll';
  if (s.includes('xp') || s.includes('level') || s.includes('star')) return 'xp';
  if (s.includes('worker')) return 'hand';
  if (s.includes('forge') || s.includes('core') || s.includes('chest')) return 'core';
  if (s.includes('element')) return 'flame';
  if (s.includes('boss') || s.includes('depth') || s.includes('dig')) return 'layers';
  return 'layers';
}

/** The glyph as an inline SVG string, filled with `colour`. */
export function glyphSvg(glyph: WebGlyph, colour = 'currentColor'): string {
  return `<svg class="wg" viewBox="0 0 24 24" fill="${colour}" style="color:${colour}" aria-hidden="true" focusable="false">${PATHS[glyph]}</svg>`;
}
