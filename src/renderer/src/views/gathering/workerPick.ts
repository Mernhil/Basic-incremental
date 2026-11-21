import type { Content } from '../../../../data';
import type { GameState } from '../../../../game';
import { h } from '../../shell/shell';
import { createCard } from '../../ui/card';
import { watchFit } from '../../ui/pixelFit';
import { cardFaceProps } from '../../pages/loadoutCards';
import '../../pages/cards.css';
import './workerPick.css';

/**
 * The worker pickers' cards (Logging, Mining and the Forge): every tool is drawn with the card
 * face the Cards collection uses (sprite, frame of its tier, name, stars, level) at a whole pixel
 * scale, with its multiplier, its effect and where it stands now under it. Same shape as the
 * loadout slot picker on the Cards page.
 */

/** Card width wanted (CSS px) in a picker: the 1x card; pixelFit snaps it to a whole scale. */
const WANT = 132;

export interface WorkerTile {
  cardId: string;
  /** Test and focus key. */
  key: string;
  name: string;
  /** "×3.71", empty for none (the forge). */
  power: string;
  /** What the tool does here. */
  note: string;
  /** Where it stands: "Works here", "Works at Oak (moves here)", "No free slot". */
  where: string;
  current: boolean;
  disabled: boolean;
  onPick(): void;
}

/** The list that holds the tiles: it gives the cards inside it their whole scale. */
export function workerPickList(): HTMLElement {
  const ul = h('ul', 'cp-pick__list wk-pick__list');
  watchFit(ul, { want: WANT });
  return ul;
}

/** The card face of a tool, as the collection draws it (no label for assistive tech: the button has it). */
function face(content: Content, state: GameState, cardId: string): HTMLElement | null {
  const props = cardFaceProps(content, state, cardId);
  if (!props) return null;
  const view = createCard(props);
  view.el.removeAttribute('aria-label');
  view.el.setAttribute('aria-hidden', 'true');
  const fit = h('span', 'cp-fit cp-fit--lv');
  fit.append(view.el);
  return fit;
}

/** One tool: its card as the button, its multiplier, effect and place under it. */
export function workerPickTile(content: Content, state: GameState, t: WorkerTile): HTMLElement {
  const li = h('li', 'cp-pick__item wk-pick__item');
  const b = h('button', 'cp-tile cp-pick__card');
  b.type = 'button';
  b.dataset['key'] = t.key;
  if (t.current) b.setAttribute('aria-pressed', 'true');
  b.setAttribute('aria-disabled', String(t.disabled));
  b.setAttribute('aria-label', [t.name, t.power, t.note, t.where].filter(Boolean).join('. '));
  const art = face(content, state, t.cardId);
  if (art) b.append(art);
  else b.append(h('b', '', t.name));
  b.addEventListener('click', () => {
    if (t.disabled || t.current) return;
    t.onPick();
  });
  li.append(b);
  if (t.power) li.append(h('span', 'wk-pick__power bi-num', t.power));
  if (t.note) li.append(h('span', 'wk-pick__note', t.note));
  if (t.where) {
    li.append(
      h('span', `wk-pick__where${t.current ? ' is-here' : t.disabled ? ' is-off' : ''}`, t.where),
    );
  }
  if (t.disabled) li.classList.add('is-off');
  return li;
}
