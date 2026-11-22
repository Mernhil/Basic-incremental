import type { Content } from '../../../data';
import {
  breakSeal,
  canAfford,
  nextSealCost,
  sealsBroken,
  strengthTier,
  tierLabel,
  type GameState,
} from '../../../game';
import { COPY } from '../copy';
import { h } from '../shell/shell';
import { costMarkup } from './costMarkup';
import './sealBlock.css';

/**
 * The starter weapon's seals (DESIGN.md §2 Starter weapon): a small block that sits beside the
 * weapon panel, in the Cards detail and the dungeon's Weapon tab. It shows how strong the sealed
 * weapon fights now, the next seal with its Cores and one button to break it. Hidden for every
 * card that is not a sealed starter. The game action is `breakSeal` (src/game/starters.ts).
 */

export interface SealBlockOptions {
  content: Content;
  state: () => GameState;
  /** Applies the state the seal break produced (the page re-renders and saves). */
  apply: (state: GameState) => void;
}

export interface SealBlock {
  el: HTMLElement;
  /** Re-reads the card; cheap every tick (it only rebuilds when the seal or the Cores change). */
  update(cardId: string): void;
}

export function createSealBlock(opts: SealBlockOptions): SealBlock {
  const { content } = opts;
  const root = h('section', 'sealblock px-tile');
  root.hidden = true;
  let key = '';

  function build(cardId: string, state: GameState): void {
    const broken = sealsBroken(state, cardId) ?? 0;
    const total = content.starters.seals.length;
    const owned = state.cards.owned[cardId]!;
    const cost = nextSealCost(state, content, cardId) ?? [];
    const nextTier = content.starters.seals[broken]?.tier;
    const fights = tierLabel(strengthTier(content, owned));
    const parts = cost.map((p) => ({ resource: p.resource, amount: p.amount }));
    const can = canAfford(state, cost);

    const head = h('div', 'sealblock__head');
    head.append(
      h('strong', 'sealblock__title', COPY.starter.sealTitle),
      h('span', 'sealblock__step bi-num', COPY.starter.sealStep(broken, total)),
    );
    const pips = h('span', 'sealblock__pips');
    pips.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < total; i++) {
      pips.append(h('i', i < broken ? 'sealblock__pip is-broken' : 'sealblock__pip'));
    }
    const now = h('p', 'sealblock__now', COPY.starter.fightsAs(fights));
    const next = h('p', 'sealblock__next');
    if (nextTier) next.textContent = COPY.starter.nextAs(tierLabel(nextTier));
    const price = h('div', 'sealblock__cost');
    price.innerHTML = costMarkup(content, state, parts, (p) =>
      (state.resources[p.resource] ?? p.amount.mul(0)).lt(p.amount),
    );
    const button = h('button', 'button sealblock__button', COPY.starter.breakSeal);
    button.type = 'button';
    button.disabled = !can;
    if (!can) button.title = COPY.starter.missing;
    button.addEventListener('click', () => {
      const r = breakSeal(opts.state(), content, cardId);
      if (r.ok) opts.apply(r.state);
    });
    root.replaceChildren(head, pips, now, next, price, button);
  }

  return {
    el: root,
    update(cardId) {
      const state = opts.state();
      const broken = sealsBroken(state, cardId);
      if (broken === null) {
        root.hidden = true;
        key = '';
        return;
      }
      const cost = nextSealCost(state, content, cardId) ?? [];
      const next = `${cardId}|${broken}|${canAfford(state, cost)}|${cost
        .map((p) => (state.resources[p.resource] ?? p.amount.mul(0)).lt(p.amount))
        .join()}`;
      root.hidden = false;
      if (next === key) return;
      key = next;
      build(cardId, state);
    },
  };
}
