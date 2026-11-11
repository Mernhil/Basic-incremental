import type { Content } from '../../../data';
import { buyTool, collectModifiers, type GameState, type ProductionJob } from '../../../game';
import { COPY } from '../copy';
import { toolRows } from '../pages/toolLinesModel';
import { h } from '../shell/shell';
import { buyCount, createBuyButton, onBuyCount, type BuyButton } from './buy';
import './training.css';

/**
 * A job's tool lines on the Production page (DESIGN.md §4 Tool lines): the Training panel's rows
 * (name and level, effect now, pips to the next milestone, the buy button) for yield, strike
 * speed, crit chance and crit damage. The ×1 / ×10 / ×100 / Max toggle is the page's own.
 */

export interface ToolLinesOptions {
  content: Content;
  job: ProductionJob;
  state: () => GameState;
  apply: (next: GameState) => void;
  sound?: (id: string) => void;
}

export interface ToolLinesPanel {
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

export function createToolLinesPanel(opts: ToolLinesOptions): ToolLinesPanel {
  const { content, job } = opts;
  const title = COPY.tools.title(COPY.production[job].title);
  const el = h('section', 'tr pp-tools');
  el.setAttribute('aria-label', title);
  const head = h('header', 'tr__head');
  head.append(h('h3', 'dp-col__title', title), h('span', 'dp-col__note', COPY.tools.note));
  const list = h('ul', 'tr__list');
  el.append(head, list);
  const refs = new Map<string, RowRef>();
  const set = (node: HTMLElement, text: string): void => {
    if (node.textContent !== text) node.textContent = text;
  };

  function build(row: { id: string; name: string }): RowRef {
    const li = h('li', 'tr__row');
    li.dataset.key = `tool-${row.id}`;
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
      const result = buyTool(opts.state(), content, row.id, buyCount());
      if (!result.ok) return;
      opts.sound?.('buy');
      opts.apply(result.state);
      button.celebrate();
      update();
    }, true);
    button.el.dataset.key = `toolbuy-${row.id}`;
    li.append(who, mid, button.el);
    list.append(li);
    return { level, effect, track, pips: [], toGo, button };
  }

  function update(): void {
    const s = opts.state();
    for (const row of toolRows(s, content, job, buyCount(), collectModifiers(s, content))) {
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
