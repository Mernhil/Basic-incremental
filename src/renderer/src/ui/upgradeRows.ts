import type { Content, PerkLine } from '../../../data';
import {
  buyMineLevels,
  buyTool,
  buyTraining,
  buyTreeLevels,
  collectModifiers,
  type GameState,
} from '../../../game';
import { COPY } from '../copy';
import { heldResources, upgradeRows, type UpgradeRowView } from '../pages/upgradeRowModel';
import { replay } from '../stage/motion';
import { h } from '../shell/shell';
import { buyCount, onBuyCount } from './buy';
import { resourceArt } from './resourceArt';
import './upgradeRow.css';

/**
 * A list of upgrade rows (DESIGN.md §4 The upgrade row), shared by the Training panel and the
 * tool lines: the "You hold" strip, then one row per line with its name and level, what buying
 * changes now -> after with the multiplier small beside it, the buy button (the price with its
 * resource, or "need N more"), the segmented bar to the next milestone with what it gives, and
 * the badges of its picks. The ×1 / ×10 / ×100 / Max toggle lives in the panel's head.
 */

export interface UpgradeRowsOptions {
  content: Content;
  lines: () => readonly PerkLine[];
  state: () => GameState;
  apply: (next: GameState) => void;
  sound?: (id: string) => void;
  /** Show the "You hold" strip (default true). */
  hold?: boolean;
}

export interface UpgradeRowsPanel {
  el: HTMLElement;
  update(): void;
}

interface RowRef {
  li: HTMLElement;
  level: HTMLElement;
  label: HTMLElement;
  now: HTMLElement;
  after: HTMLElement;
  mult: HTMLElement;
  button: HTMLButtonElement;
  btnLabel: HTMLElement;
  btnArt: HTMLElement;
  btnPrice: HTMLElement;
  fill: HTMLElement;
  track: HTMLElement;
  pips: HTMLElement[];
  next: HTMLElement;
  toGo: HTMLElement;
  badges: HTMLElement;
  badgeKey: string;
  artKey: string;
}

const set = (node: HTMLElement, text: string): void => {
  if (node.textContent !== text) node.textContent = text;
};

function buyLine(state: GameState, content: Content, line: PerkLine): GameState | null {
  const count = buyCount();
  switch (line.kind) {
    case 'tree': {
      const r = buyTreeLevels(state, content, line.id, count);
      return r.ok ? r.state : null;
    }
    case 'mine': {
      const r = buyMineLevels(state, content, line.id, count);
      return r.ok ? r.state : null;
    }
    case 'tool': {
      const r = buyTool(state, content, line.id, count);
      return r.ok ? r.state : null;
    }
    case 'training': {
      const r = buyTraining(state, content, line.id, count);
      return r.ok ? r.state : null;
    }
  }
}

export function createUpgradeRows(opts: UpgradeRowsOptions): UpgradeRowsPanel {
  const { content } = opts;
  const el = h('div', 'ur');
  const hold = h('div', 'ur__hold');
  hold.append(h('span', 'ur__hold-label', COPY.row.hold));
  const holdItems = h('span', 'ur__hold-items');
  hold.append(holdItems);
  const list = h('ul', 'ur__list');
  if (opts.hold !== false) el.append(hold);
  el.append(list);
  const refs = new Map<string, RowRef>();
  let holdKey = '';

  function build(row: UpgradeRowView): RowRef {
    const li = h('li', 'ur__row');
    li.dataset.key = `row-${row.key}`;
    const head = h('div', 'ur__head');
    const level = h('span', 'ur__level bi-num');
    head.append(h('span', 'ur__name', row.name), level);
    const what = h('div', 'ur__what');
    const label = h('span', 'ur__label');
    const now = h('b', 'ur__now bi-num');
    const after = h('b', 'ur__after bi-num');
    const arrow = h('span', 'ur__arrow', '→');
    arrow.setAttribute('aria-hidden', 'true');
    const mult = h('small', 'ur__mult bi-num');
    what.append(label, now, arrow, after, mult);
    const main = h('div', 'ur__main');
    main.append(head, what);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'buy-btn buy-btn--compact ur__buy';
    const btnLabel = h('span', 'ur__buy-label');
    const btnArt = h('span', 'ur__art');
    btnArt.setAttribute('aria-hidden', 'true');
    const btnPrice = h('span', 'ur__price bi-num');
    const fill = document.createElement('i');
    fill.className = 'buy-btn__fill';
    fill.setAttribute('aria-hidden', 'true');
    button.append(btnLabel, btnArt, btnPrice, fill);
    button.addEventListener('click', () => {
      if (button.getAttribute('aria-disabled') === 'true') return;
      const next = buyLine(opts.state(), content, row.line);
      if (!next) return;
      opts.sound?.('buy');
      opts.apply(next);
      replay(button, 'is-bought', 500);
      update();
    });
    const foot = h('div', 'ur__foot');
    const track = h('div', 'ur__track');
    track.setAttribute('aria-hidden', 'true');
    const next = h('span', 'ur__next');
    const toGo = h('span', 'ur__togo bi-num');
    const nextLine = h('div', 'ur__nextline');
    nextLine.append(next, toGo);
    const badges = h('div', 'ur__badges');
    foot.append(track, nextLine, badges);
    li.append(main, button, foot);
    list.append(li);
    return {
      li,
      level,
      label,
      now,
      after,
      mult,
      button,
      btnLabel,
      btnArt,
      btnPrice,
      fill,
      track,
      pips: [],
      next,
      toGo,
      badges,
      badgeKey: '',
      artKey: '',
    };
  }

  function update(): void {
    const s = opts.state();
    const rows = upgradeRows(s, content, opts.lines(), buyCount(), collectModifiers(s, content));
    const keys = new Set(rows.map((r) => r.key));
    for (const [key, ref] of refs) {
      if (!keys.has(key)) {
        ref.li.remove();
        refs.delete(key);
      }
    }
    for (const row of rows) {
      let ref = refs.get(row.key);
      if (!ref) refs.set(row.key, (ref = build(row)));
      set(ref.level, row.levelText);
      set(ref.label, row.effectLabel);
      set(ref.now, row.now);
      set(ref.after, row.after);
      set(ref.mult, row.mult);
      const ok = row.buy.affordable;
      ref.li.classList.toggle('is-ready', ok);
      ref.button.setAttribute('aria-disabled', String(!ok));
      ref.button.classList.toggle('is-affordable', ok);
      set(ref.btnLabel, ok ? row.buy.label : '');
      set(ref.btnPrice, ok ? row.buy.price : (row.buy.short ?? row.buy.price));
      const artKey = `${row.buy.resource}:${row.buy.amount.toString()}`;
      if (ref.artKey !== artKey) {
        ref.artKey = artKey;
        ref.btnArt.innerHTML = resourceArt(content, s, row.buy.resource, row.buy.amount);
      }
      ref.fill.style.transform = `scaleX(${ok ? 1 : Math.min(1, Math.max(0, row.buy.progress)).toFixed(3)})`;
      ref.button.setAttribute(
        'aria-label',
        ok
          ? `${row.name}: ${row.buy.label}, ${row.buy.price}`
          : `${row.name}: ${row.buy.short ?? ''}`,
      );
      if (ref.pips.length !== row.segments.total) {
        ref.pips = Array.from({ length: row.segments.total }, () => document.createElement('i'));
        ref.track.replaceChildren(...ref.pips);
      }
      ref.pips.forEach((p, i) => p.classList.toggle('is-on', i < row.segments.filled));
      set(ref.next, row.next);
      set(ref.toGo, row.toGo);
      const badgeKey = row.badges.map((b) => b.name).join('|');
      if (ref.badgeKey !== badgeKey) {
        ref.badgeKey = badgeKey;
        ref.badges.replaceChildren(
          ...row.badges.map((b) => {
            const chip = h('span', 'ur__badge', b.name);
            chip.title = b.description;
            return chip;
          }),
        );
      }
    }
    // keep the DOM order the lines' order
    rows.forEach((row) => {
      const ref = refs.get(row.key);
      if (ref && ref.li.parentElement === list) list.append(ref.li);
    });
    if (opts.hold !== false) {
      const held = heldResources(s, content, rows);
      const key = held.map((x) => `${x.resource}:${x.text}`).join('|');
      if (key !== holdKey) {
        holdKey = key;
        holdItems.replaceChildren(
          ...held.map((x) => {
            const item = h('span', 'ur__hold-item');
            const art = h('span', 'ur__art');
            art.setAttribute('aria-hidden', 'true');
            art.innerHTML = resourceArt(content, s, x.resource, x.amount);
            item.title = content.resourceById.get(x.resource)?.name ?? x.resource;
            item.append(art, h('b', 'bi-num', x.text));
            return item;
          }),
        );
      }
    }
  }

  onBuyCount(() => update());
  update();
  return { el, update };
}
