import type { Content } from '../../../data';
import {
  cardDisplayName,
  claimTutorialHandout,
  pendingTutorialHandout,
  type GameState,
} from '../../../game';
import { COPY } from '../copy';
import { cardFaceProps } from '../pages/loadoutCards';
import { h } from '../shell/shell';
import { createCard } from '../ui/card';
import './starterPick.css';
import './tutorialReveal.css';

/**
 * The tutorial area's card hand-out (DESIGN.md section 2, A tutorial area before Mossy Cellar):
 * when the area's best floor reaches a milestone the next card is added to the team and shown in
 * the starter pick's dialog style: the card, its role and one line on what that role does. Esc or
 * the button closes it; the card is already the player's.
 */

export interface TutorialRevealHost {
  state: () => GameState;
  /** Applies the state the hand-out produced (the app saves it). */
  apply: (state: GameState) => void;
}

let isOpen = false;

/** Takes the handout that is due, if any, and shows it. Returns whether one was shown. */
export function showTutorialHandout(
  content: Content,
  host: TutorialRevealHost,
  sound?: () => void,
): boolean {
  if (isOpen || !content.tutorialArea) return false;
  if (!pendingTutorialHandout(host.state(), content)) return false;
  const claimed = claimTutorialHandout(host.state(), content);
  if (!claimed.ok) return false;
  host.apply(claimed.state);
  const { handout } = claimed;
  if (!handout.card) return false;
  const card = content.cardById.get(handout.card);
  const props = card ? cardFaceProps(content, claimed.state, handout.card) : null;
  if (!card || !props) return false;
  isOpen = true;
  sound?.();

  const overlay = h('div', 'sp');
  const dialog = h('section', 'sp__dialog tr__dialog px-panel');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'tr-title');
  const title = h('h2', 'sp__title', COPY.tutorial.title(content.tutorialArea.name));
  title.id = 'tr-title';
  const role = COPY.tutorial.roles[handout.role];
  const view = createCard(props);
  view.el.removeAttribute('aria-label');
  view.el.setAttribute('aria-hidden', 'true');
  const fit = h('span', 'cp-fit tr__card');
  fit.append(view.el);
  const name = cardDisplayName(content, card);
  const lead = h('p', 'sp__lead', COPY.tutorial.lead(name, role.toLowerCase()));
  const roleName = h('p', 'tr__role', role);
  const line = h('p', 'tr__line', COPY.tutorial.roleLines[handout.role]);
  const ok = h('button', 'button', COPY.tutorial.ok);
  ok.type = 'button';
  dialog.append(title, fit, roleName, line, lead);
  const last = handout.index + 1 >= content.tutorialArea.tutorial!.milestones.length;
  if (last) dialog.append(h('p', 'tr__line', COPY.tutorial.team));
  dialog.append(ok);
  overlay.append(dialog);
  document.body.append(overlay);

  const close = (): void => {
    isOpen = false;
    overlay.classList.add('is-leaving');
    window.setTimeout(() => overlay.remove(), 260);
    document.removeEventListener('keydown', onKey, true);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' || e.key === 'Enter') {
      e.preventDefault();
      close();
    }
  };
  ok.addEventListener('click', close);
  document.addEventListener('keydown', onKey, true);
  ok.focus();
  return true;
}
