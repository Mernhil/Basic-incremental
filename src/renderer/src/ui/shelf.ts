import type { Content } from '../../../data';
import { buyUpgrade, collectModifiers, type GameState } from '../../../game';
import { COPY } from '../copy';
import { shelfChips, type ShelfChip, type ShelfScope } from '../pages/shelfModel';
import { h } from '../shell/shell';
import { replay } from '../stage/motion';
import './shelf.css';

/**
 * The upgrade shelf panel (DESIGN.md 11.14, 14): card-like chips for the one-time upgrades,
 * available ones first (glowing when affordable), owned ones folded below. One component, shown
 * on Production and (fighting upgrades) in the Dungeons drawer. The look lives in shelf.css
 * tokens; the chip art slot is `data-icon`, set to the upgrade id for the graphics pass.
 */

export interface ShelfOptions {
  content: Content;
  state: () => GameState;
  apply: (state: GameState) => void;
  scope: ShelfScope;
  sound?: (id: string) => void;
}

export interface Shelf {
  el: HTMLElement;
  /** Re-reads the state; rebuilds only when an upgrade appears or is bought. */
  update(): void;
}

export function createShelf(opts: ShelfOptions): Shelf {
  const { content } = opts;
  const el = h('section', `shelf shelf--${opts.scope}`);
  el.setAttribute('aria-label', COPY.shelf.title);
  const head = h('header', 'shelf__head');
  const count = h('span', 'shelf__count bi-num');
  head.append(h('h3', 'shelf__title', COPY.shelf.title), count);
  const note = h('p', 'shelf__note');
  const list = h('ul', 'shelf__list');
  const ownedBox = h('details', 'shelf__owned');
  const ownedSum = h('summary', 'shelf__owned-sum');
  const ownedList = h('ul', 'shelf__list shelf__list--owned');
  ownedBox.append(ownedSum, ownedList);
  el.append(head, note, list, ownedBox);

  let sig = '';
  const chipEls = new Map<string, HTMLElement>();

  function chip(c: ShelfChip): HTMLElement {
    const li = h('li', `shelf-chip shelf-chip--${c.status}`);
    const body = h(c.status === 'available' ? 'button' : 'div', 'shelf-chip__body');
    if (body instanceof HTMLButtonElement) {
      body.type = 'button';
      body.dataset.key = `upgrade-${c.id}`;
      body.addEventListener('click', () => {
        if (body.getAttribute('aria-disabled') !== 'true') buy(c.id);
      });
    }
    const art = h('span', 'shelf-chip__art');
    art.dataset.icon = c.id;
    art.setAttribute('aria-hidden', 'true');
    const text = h('span', 'shelf-chip__text');
    const name = h('span', 'shelf-chip__name', c.name);
    if (c.permanent) {
      const tag = h('span', 'shelf-chip__perm', COPY.shelf.permanent);
      tag.title = COPY.shelf.permanentTip;
      name.append(tag);
    }
    text.append(name, h('span', 'shelf-chip__effect', c.effect));
    if (c.status === 'available') {
      if (c.preview) text.append(h('span', 'shelf-chip__preview bi-num', c.preview));
      body.append(art, text, h('span', 'shelf-chip__price bi-num', c.price));
    } else {
      text.append(h('span', 'shelf-chip__unlock', COPY.shelf.unlocked(c.unlockText)));
      body.append(art, text, h('span', 'shelf-chip__mark', COPY.shelf.owned));
    }
    li.append(body);
    chipEls.set(c.id, li);
    return li;
  }

  function buy(id: string): void {
    const result = buyUpgrade(opts.state(), content, id);
    if (!result.ok) return;
    opts.apply(result.state);
    opts.sound?.('buy');
    update();
    replay(chipEls.get(id), 'is-bought', 600);
  }

  function update(): void {
    const s = opts.state();
    const chips = shelfChips(s, content, collectModifiers(s, content), opts.scope);
    const next = JSON.stringify(chips.map((c) => [c.id, c.status]));
    if (next !== sig) {
      sig = next;
      chipEls.clear();
      const avail = chips.filter((c) => c.status === 'available');
      const owned = chips.filter((c) => c.status === 'owned');
      list.replaceChildren(...avail.map(chip));
      ownedList.replaceChildren(...owned.map(chip));
      ownedSum.textContent = COPY.shelf.ownedCount(owned.length);
      ownedBox.hidden = owned.length === 0;
      note.textContent = COPY.shelf.empty;
      note.hidden = avail.length > 0;
      count.textContent = COPY.shelf.counts(avail.length, owned.length);
    }
    // only the glow changes between rebuilds
    for (const c of chips) {
      const li = chipEls.get(c.id);
      if (!li || c.status !== 'available') continue;
      li.classList.toggle('is-affordable', c.affordable);
      li.firstElementChild?.setAttribute('aria-disabled', String(!c.affordable));
    }
  }

  update();
  return { el, update };
}
