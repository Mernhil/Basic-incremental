import type { Content } from '../../../data';
import type { GameState } from '../../../game';
import { amountText } from '../settings/coins';
import { costAmount, hasCostArt, type CostPart } from '../settings/cost';
import { resourceArt } from './resourceArt';
import './buy.css';

const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Several costs side by side, each as the material's sprite and its number (markup for
 * innerHTML; the word is only in the tooltip). A material without a sprite shows its number and
 * name. `isShort` marks the parts the player cannot pay yet.
 */
export function costMarkup(
  content: Content,
  state: GameState,
  parts: readonly CostPart[],
  isShort: (p: CostPart) => boolean = () => false,
): string {
  return `<span class="cost">${parts
    .map((p) => {
      const art = hasCostArt(content, p.resource)
        ? resourceArt(content, state, p.resource, p.amount)
        : '';
      const label = esc(amountText(content, p.resource, p.amount));
      const text = art ? esc(costAmount(content, p.resource, p.amount)) : label;
      return `<span class="cost__item${isShort(p) ? ' is-short' : ''}" title="${label}">${
        art ? `<span class="cost__art" aria-hidden="true">${art}</span>` : ''
      }<span class="cost__amt bi-num">${text}</span></span>`;
    })
    .join('')}</span>`;
}
