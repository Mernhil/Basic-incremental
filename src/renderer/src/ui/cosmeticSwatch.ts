import type { Content } from '../../../data';
import { cssVars, emptyLoadout, equip, resolveCard, slotVisual } from '../../../game';
import { applyCardTheme } from '../theme/apply';
import './cosmeticSwatch.css';

/**
 * A small picture of one cosmetic at a level, for the Wardrobe grid, its slots and the summon
 * reveal. Card slots (border, finish) draw a blank mini card wearing the item through the real
 * theme layer (recipes, level marks, ambient); global slots draw a sample of what they change:
 * a slash, a tick number, a number, a patch of table, a pointer (hover shows the real cursor).
 */
export function cosmeticSwatch(content: Content, cosmeticId: string, level: number): HTMLElement {
  const cosmetic = content.cosmeticById.get(cosmeticId);
  const el = document.createElement('span');
  el.className = 'cs';
  el.setAttribute('aria-hidden', 'true');
  if (!cosmetic) return el;
  el.dataset['slot'] = cosmetic.slot;
  el.dataset['rarity'] = cosmetic.rarity;
  const lv = Math.max(1, level);

  if (cosmetic.slot === 'border' || cosmetic.slot === 'finish') {
    const cardId = cosmetic.exclusiveCard ?? content.cards[0]?.id ?? '';
    const loadout = equip(
      content,
      emptyLoadout(),
      cosmetic.slot,
      { id: cosmetic.id, level: lv },
      cosmetic.exclusiveCard ? cardId : undefined,
    );
    // a showcase rank that can wear anything, so the swatch always shows the item itself
    const mini = document.createElement('span');
    mini.className = 'bi-card cs-card';
    mini.innerHTML = `
      <span class="bi-card__rarity"></span>
      <span class="bi-card__finish"></span>
      <span class="bi-card__deco"><i class="bi-gem"></i></span>
      <span class="bi-card__flourish"></span>
      <span class="bi-amb bi-amb--finish"><i></i><i></i><i></i></span>
      <span class="bi-amb bi-amb--border"><i></i><i></i><i></i></span>
      <span class="cs-card__plate"></span><span class="cs-card__window"></span>`;
    applyCardTheme(
      mini,
      resolveCard(content, loadout, {
        id: cardId,
        rank: { tier: 'prismatic', stars: 6 },
        rarity: cosmetic.rarity,
      }),
    );
    el.append(mini);
    return el;
  }

  const visual = slotVisual(content, cosmetic, lv);
  for (const [k, v] of Object.entries(cssVars(visual.tokens))) el.style.setProperty(k, v);
  for (const r of visual.recipes) el.classList.add(`r-${r}`);
  switch (cosmetic.slot) {
    case 'attack':
      el.innerHTML =
        '<svg class="cs-slash" viewBox="0 0 60 60"><path d="M10 50 Q30 34 52 8" /><path class="cs-slash__core" d="M10 50 Q30 34 52 8" /></svg>';
      break;
    case 'tick':
      el.innerHTML = '<b class="cs-tick">128</b>';
      break;
    case 'number':
      el.innerHTML = '<b class="cs-number bi-num">1,234</b>';
      break;
    case 'table':
      el.innerHTML =
        '<span class="cs-table"><i class="cs-table__chrome"></i><i class="cs-table__frame"></i></span>';
      break;
    case 'cursor':
      el.innerHTML =
        '<svg class="cs-pointer" viewBox="0 0 32 32"><path d="M4 3 L25 15 L15 17 L11 27 Z" /></svg>';
      break;
  }
  return el;
}
