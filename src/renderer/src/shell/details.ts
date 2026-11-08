import type { Content } from '../../../data';
import type { GameState } from '../../../game';
import { gemCoin, svg } from '../art/gems';
import { COPY } from '../copy';
import { detailsView, type DetailsEntry } from '../pages/detailsModel';
import { iconMarkup } from '../ui/resourceIcons';
import { icon } from './icons';
import { h } from './shell';
import './details.css';

/**
 * The Details panel (DESIGN.md 9): everything the header does not show, grouped, with amount,
 * rate, mastery and what each is used for. A modal over the page: Escape or the backdrop closes
 * it and focus goes back to the Details button. Look lives in details.css tokens (`--details-*`).
 */

export interface DetailsPanel {
  el: HTMLElement;
  open(): void;
  close(): void;
  isOpen(): boolean;
  /** Refreshes the numbers (cheap; only does work while open). */
  update(): void;
}

export function createDetailsPanel(opts: {
  content: Content;
  state: () => GameState;
  /** Gem mastery tier, for the coin metal. */
  masteryTier: (gemId: string) => number;
  /** Where focus goes back to on close. */
  returnFocus: () => HTMLElement | null;
  /** Called after open / close (the header button's aria-expanded). */
  onToggle?: (open: boolean) => void;
}): DetailsPanel {
  const { content } = opts;
  const el = h('div', 'details');
  el.hidden = true;
  const backdrop = h('div', 'details__backdrop');
  const dialog = h('section', 'details__panel');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'details-title');
  const head = h('header', 'details__head');
  const title = h('h2', 'details__title', COPY.details.title);
  title.id = 'details-title';
  const closeBtn = h('button', 'details__close', COPY.details.close);
  closeBtn.type = 'button';
  head.append(title, closeBtn);
  const body = h('div', 'details__body');
  dialog.append(head, body);
  el.append(backdrop, dialog);

  type Row = {
    amount: HTMLElement;
    rate: HTMLElement;
    mastery: HTMLElement;
    art: HTMLElement;
    tier: number;
    entry: DetailsEntry;
  };
  const rows = new Map<string, Row>();
  let built = false;

  const artFor = (entry: DetailsEntry, tier: number): string => {
    const gem = content.resourceById.get(entry.id)?.gem;
    if (gem) return svg(gemCoin(gem, Math.max(0, tier)));
    return iconMarkup(entry.icon) ?? '';
  };

  function build(): void {
    built = true;
    rows.clear();
    const groups = detailsView(opts.state(), content);
    body.replaceChildren(
      ...groups.map((g) => {
        const section = h('section', `details__group details__group--${g.id}`);
        section.append(h('h3', 'details__group-title', g.title));
        const list = h('ul', 'details__list');
        for (const entry of g.entries) {
          const li = h('li', 'details-row');
          li.dataset.resource = entry.id;
          const art = h('span', 'details-row__art');
          art.dataset.icon = entry.icon;
          const tier = opts.masteryTier(entry.id);
          const markup = artFor(entry, tier);
          if (markup) art.innerHTML = markup;
          else art.append(icon('material', 'shell-icon'));
          const text = h('div', 'details-row__text');
          const top = h('div', 'details-row__top');
          const amount = h('span', 'details-row__amount bi-num');
          const rate = h('span', 'details-row__rate bi-num');
          top.append(h('span', 'details-row__name', entry.name), amount, rate);
          const mastery = h('span', 'details-row__mastery');
          text.append(top, mastery, h('span', 'details-row__use', entry.usedFor));
          li.append(art, text);
          list.append(li);
          rows.set(entry.id, { amount, rate, mastery, art, tier, entry });
        }
        section.append(list);
        return section;
      }),
    );
  }

  const set = (node: HTMLElement, text: string): void => {
    if (node.textContent !== text) node.textContent = text;
  };

  function update(): void {
    if (el.hidden) return;
    if (!built) build();
    const groups = detailsView(opts.state(), content);
    for (const g of groups) {
      for (const entry of g.entries) {
        const row = rows.get(entry.id);
        if (!row) continue;
        set(row.amount, entry.amount);
        set(row.rate, entry.rate || COPY.details.noRate);
        row.rate.classList.toggle('is-idle', !entry.rate);
        set(row.mastery, entry.mastery);
        row.mastery.hidden = !entry.mastery;
        if (entry.masteryTier >= 0 && entry.masteryTier !== row.tier) {
          row.tier = entry.masteryTier;
          const markup = artFor(entry, entry.masteryTier);
          if (markup) row.art.innerHTML = markup;
        }
      }
    }
  }

  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Tab') {
      // keep focus inside the dialog
      const items = [...dialog.querySelectorAll<HTMLElement>('button, [tabindex="0"]')];
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  function open(): void {
    if (!el.hidden) return;
    el.hidden = false;
    build();
    update();
    document.addEventListener('keydown', onKey);
    closeBtn.focus();
    opts.onToggle?.(true);
  }

  function close(): void {
    if (el.hidden) return;
    el.hidden = true;
    built = false;
    document.removeEventListener('keydown', onKey);
    opts.returnFocus()?.focus();
    opts.onToggle?.(false);
  }

  closeBtn.addEventListener('click', close);
  backdrop.addEventListener('click', close);

  return { el, open, close, isOpen: () => !el.hidden, update };
}
