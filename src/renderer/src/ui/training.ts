import type { Content } from '../../../data';
import { buyTraining, collectModifiers, type GameState } from '../../../game';
import { COPY } from '../copy';
import { trainingRows, type TrainingRow } from '../pages/trainingModel';
import { h } from '../shell/shell';
import { buyCount, createBuyButton, createBuyToggle, onBuyCount, type BuyButton } from './buy';
import './training.css';

/**
 * The Training panel of the Dungeons drawer (DESIGN.md §6 Training): the repeatable fighting
 * upgrades. One row per line: name and level, what it gives now, a bar of pips to the next
 * milestone, and the buy button with its price and before / after. The x1 / x10 / x100 / Max
 * toggle in its head is the one the Production page uses.
 */

export interface TrainingOptions {
  content: Content;
  state: () => GameState;
  apply: (next: GameState) => void;
  sound?: (id: string) => void;
}

export interface TrainingPanel {
  el: HTMLElement;
  update(): void;
}

interface RowRef {
  level: HTMLElement;
  effect: HTMLElement;
  track: HTMLElement;
  pips: HTMLElement[];
  toGo: HTMLElement;
  button: BuyButton;
}

export function createTrainingPanel(opts: TrainingOptions): TrainingPanel {
  const { content } = opts;
  const el = h('section', 'tr');
  el.setAttribute('aria-label', COPY.training.title);
  const head = h('header', 'tr__head');
  head.append(
    h('h3', 'dp-col__title', COPY.training.title),
    h('span', 'dp-col__note', COPY.training.note),
    createBuyToggle(),
  );
  const list = h('ul', 'tr__list');
  el.append(head, list);
  const refs = new Map<string, RowRef>();
  const set = (node: HTMLElement, text: string): void => {
    if (node.textContent !== text) node.textContent = text;
  };

  function build(row: TrainingRow): RowRef {
    const li = h('li', 'tr__row');
    li.dataset.key = `training-${row.id}`;
    const who = h('div', 'tr__who');
    const level = h('span', 'tr__level bi-num');
    who.append(h('span', 'tr__name', row.name), level);
    const mid = h('div', 'tr__mid');
    const effect = h('span', 'tr__effect bi-num');
    const track = h('div', 'tr__track');
    track.setAttribute('aria-hidden', 'true');
    const toGo = h('span', 'tr__togo bi-num');
    mid.append(effect, track, toGo);
    const button = createBuyButton(() => {
      const result = buyTraining(opts.state(), content, row.id, buyCount());
      if (!result.ok) return;
      opts.sound?.('buy');
      opts.apply(result.state);
      button.celebrate();
      update();
    }, true);
    button.el.dataset.key = `train-${row.id}`;
    li.append(who, mid, button.el);
    list.append(li);
    return { level, effect, track, pips: [], toGo, button };
  }

  function update(): void {
    const s = opts.state();
    const rows = trainingRows(s, content, buyCount(), collectModifiers(s, content));
    for (const row of rows) {
      let ref = refs.get(row.id);
      if (!ref) refs.set(row.id, (ref = build(row)));
      set(ref.level, row.levelText);
      set(ref.effect, row.effectText);
      set(ref.toGo, row.toGo);
      if (ref.pips.length !== row.segments.total) {
        ref.pips = Array.from({ length: row.segments.total }, () => document.createElement('i'));
        ref.track.replaceChildren(...ref.pips);
      }
      ref.pips.forEach((p, i) => p.classList.toggle('is-on', i < row.segments.filled));
      ref.button.update(row.button);
      ref.button.el.setAttribute(
        'aria-label',
        COPY.training.buyLabel(row.name, row.button.label, row.button.price),
      );
    }
  }

  onBuyCount(() => update());
  update();
  return { el, update };
}
