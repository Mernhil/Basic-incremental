import type { Content, PerkLine, PerkMilestone } from '../../../data';
import { pickPerk, waitingPicks, type GameState } from '../../../game';
import { COPY } from '../copy';
import { upgradeLineName } from '../pages/upgradeRowModel';
import { h } from '../shell/shell';
import './upgradeRow.css';

/**
 * A waiting milestone pick (DESIGN.md §4 Milestone picks): the first pick waiting on the given
 * lines as two cards, "1 of n" when more wait; a click on a card picks that perk. Hidden while
 * nothing waits.
 */

export interface PerkPickOptions {
  content: Content;
  /** The lines this panel shows picks for. */
  lines: () => readonly PerkLine[];
  state: () => GameState;
  apply: (next: GameState) => void;
  sound?: (id: string) => void;
}

export interface PerkPickPanel {
  el: HTMLElement;
  update(): void;
}

const onLines = (lines: readonly PerkLine[], m: PerkMilestone): boolean =>
  lines.some((l) => l.kind === m.line.kind && l.id === m.line.id);

/** Two cards for one milestone, used here and by the Upgrades view. */
export function pickCards(
  content: Content,
  milestone: PerkMilestone,
  onPick: (optionId: string) => void,
): HTMLElement {
  const cards = h('div', 'pk__cards');
  for (const option of milestone.options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'px-panel px-panel--raised pk__card';
    b.dataset.key = `pick-${option.id}`;
    b.setAttribute('aria-label', COPY.picks.pickLabel(option.name, option.description));
    b.append(h('b', '', option.name), h('span', '', option.description));
    b.addEventListener('click', () => onPick(option.id));
    cards.append(b);
  }
  return cards;
}

export function createPerkPick(opts: PerkPickOptions): PerkPickPanel {
  const { content } = opts;
  const el = h('section', 'pk');
  el.hidden = true;
  let shown = '';

  function update(): void {
    const s = opts.state();
    const lines = opts.lines();
    const waiting = waitingPicks(s, content).filter((m) => onLines(lines, m));
    const first = waiting[0];
    const key = first ? `${first.id}:${waiting.length}` : '';
    if (key === shown) return;
    shown = key;
    el.hidden = !first;
    if (!first) {
      el.replaceChildren();
      return;
    }
    const head = h('header', 'pk__head');
    head.append(
      h('h3', 'pk__title', COPY.picks.title(upgradeLineName(content, first.line), first.level)),
      h('span', 'pk__of bi-num', waiting.length > 1 ? COPY.picks.of(1, waiting.length) : ''),
    );
    const cards = pickCards(content, first, (optionId) => {
      const r = pickPerk(opts.state(), content, first.id, optionId);
      if (!r.ok) return;
      opts.sound?.('buy');
      opts.apply(r.state);
      update();
    });
    el.replaceChildren(head, cards, h('p', 'pk__hint', COPY.picks.hint));
  }

  update();
  return { el, update };
}
