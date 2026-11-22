import type { Content } from '../../../data';
import {
  cardDisplayName,
  pickStarter,
  skipStarter,
  starterChoices,
  type GameState,
} from '../../../game';
import { COPY } from '../copy';
import { cardFaceProps } from '../pages/loadoutCards';
import { h } from '../shell/shell';
import { createCard } from '../ui/card';
import './starterPick.css';

/**
 * The starter pick (DESIGN.md §2 Starter weapon): at the start of a new game the four T6 starter
 * weapons are laid out as cards with their name, element and role, and one is taken. It cannot be
 * closed without a pick, except on a save that began before the starter existed, which may turn it
 * down. The card shown is the weapon's own; it arrives sealed (`pickStarter`).
 */

export interface StarterPickHost {
  state: () => GameState;
  /** Applies the state the pick produced (the app saves it). */
  apply: (state: GameState) => void;
}

export function showStarterPick(content: Content, host: StarterPickHost, sound?: () => void): void {
  const state = host.state();
  const choices = starterChoices(state, content);
  if (choices.length === 0) return;

  const overlay = h('div', 'sp');
  const dialog = h('section', 'sp__dialog px-panel');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'sp-title');
  const title = h('h2', 'sp__title', COPY.starter.title);
  title.id = 'sp-title';
  const lead = h('p', 'sp__lead', COPY.starter.lead);
  const row = h('ul', 'sp__row');

  const close = (): void => {
    overlay.classList.add('is-leaving');
    window.setTimeout(() => overlay.remove(), 260);
    document.removeEventListener('keydown', onKey, true);
  };

  for (const card of choices) {
    const r = pickStarter(state, content, card.id);
    if (!r.ok) continue;
    const props = cardFaceProps(content, r.state, card.id);
    if (!props) continue;
    const item = h('li', 'sp-choice');
    const view = createCard(props);
    view.el.removeAttribute('aria-label');
    view.el.setAttribute('aria-hidden', 'true');
    const fit = h('span', 'cp-fit sp-choice__card');
    fit.append(view.el);
    const name = cardDisplayName(content, card);
    const kind = content.itemTypeByKind.get(card.item.kind)?.noun.toLowerCase() ?? card.item.kind;
    const role = card.job === 'fighting' ? COPY.cards.combatRoles[card.role] : '';
    const element = card.element ? COPY.starter.elements[card.element] : '';
    const info = h('p', 'sp-choice__kind', COPY.starter.kindLine(element, kind, role));
    const button = h('button', 'button sp-choice__button', COPY.starter.choose);
    button.type = 'button';
    button.setAttribute('aria-label', COPY.starter.chooseLabel(name));
    button.addEventListener('click', () => {
      const picked = pickStarter(host.state(), content, card.id);
      if (!picked.ok) return;
      sound?.();
      host.apply(picked.state);
      close();
    });
    item.append(fit, info, button);
    row.append(item);
  }

  dialog.append(title, lead, row);
  if (state.starter.skippable) {
    const later = h('button', 'button sp__later', COPY.starter.later);
    later.type = 'button';
    later.addEventListener('click', () => {
      const r = skipStarter(host.state());
      if (r.ok) host.apply(r.state);
      close();
    });
    dialog.append(later);
  }
  overlay.append(dialog);
  document.body.append(overlay);

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') e.preventDefault(); // the pick is not closed by Esc
  };
  document.addEventListener('keydown', onKey, true);
}
