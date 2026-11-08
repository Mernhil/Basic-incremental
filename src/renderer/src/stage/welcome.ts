import type { Content } from '../../../data';
import type { OfflineSummary } from '../../../game';
import { COPY } from '../copy';
import { welcomeCards } from '../pages/welcomeModel';
import type { CoinTarget } from './arena';
import { centreOf, flyCoins } from './fly';
import './welcome.css';

/**
 * Welcome back (DESIGN.md §11, A11 B card fan): each category is a small card dealt onto the table
 * one after another; Collect sends the coins to the header. Until then the header counters hold
 * the offline gains back, so they visibly roll up when the coins land.
 */

export interface WelcomeHost extends CoinTarget {
  holdCurrency(id: string, amount: import('../../../game').Decimal | null): void;
}

export function showWelcomeBack(
  summary: OfflineSummary,
  content: Content,
  host: WelcomeHost,
  sound?: (id: string) => void,
): void {
  const cards = welcomeCards(summary, content);
  const overlay = document.createElement('div');
  overlay.className = 'wb';
  const dialog = document.createElement('section');
  dialog.className = 'wb__dialog';
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-labelledby', 'wb-title');
  const title = document.createElement('h2');
  title.id = 'wb-title';
  title.className = 'wb__title';
  title.textContent = COPY.welcome.title;
  const fan = document.createElement('ol');
  fan.className = 'wb__fan';
  const mid = (cards.length - 1) / 2;
  const resourceCards: Array<{ el: HTMLElement; resource: string }> = [];
  cards.forEach((card, i) => {
    const li = document.createElement('li');
    li.className = `wb-card wb-card--${card.kind}`;
    if (card.lines.some((l) => l.rare)) li.classList.add('wb-card--rare');
    li.style.setProperty('--i', String(i));
    li.style.setProperty('--tilt', `${((i - mid) * 5).toFixed(1)}deg`);
    li.style.setProperty('--lift', `${(Math.abs(i - mid) * 8).toFixed(0)}px`);
    const head = document.createElement('span');
    head.className = 'wb-card__title';
    head.textContent = card.title;
    const big = document.createElement('strong');
    big.className = 'wb-card__headline bi-num';
    big.textContent = card.headline;
    const list = document.createElement('ul');
    list.className = 'wb-card__lines';
    for (const line of card.lines) {
      const item = document.createElement('li');
      item.textContent = line.text;
      if (line.rare) item.className = 'is-rare';
      list.append(item);
      if (line.resource) resourceCards.push({ el: item, resource: line.resource });
    }
    li.append(head, big, list);
    fan.append(li);
  });
  const collect = document.createElement('button');
  collect.type = 'button';
  collect.className = 'button wb__collect';
  collect.textContent = COPY.welcome.collect;
  collect.style.setProperty('--i', String(cards.length));
  dialog.append(title, fan, collect);
  overlay.append(dialog);
  document.body.append(overlay);

  // the header holds the gains back until Collect
  for (const [id, amount] of Object.entries(summary.gains)) host.holdCurrency(id, amount);

  const previous = document.activeElement as HTMLElement | null;
  const close = (): void => {
    overlay.classList.add('is-leaving');
    window.setTimeout(() => overlay.remove(), 260);
    document.removeEventListener('keydown', onKey, true);
    previous?.focus?.();
  };
  const doCollect = (): void => {
    collect.disabled = true;
    sound?.('coin');
    for (const { el, resource } of resourceCards) {
      flyCoins({
        from: centreOf(el),
        target: host.currencyGlyph(resource),
        count: 8,
        spill: true,
        onLand: () => {
          host.holdCurrency(resource, null);
          host.pulseCurrency(resource);
        },
      });
    }
    // anything without a visible chip is released right away
    for (const id of Object.keys(summary.gains)) {
      if (!host.currencyGlyph(id)) host.holdCurrency(id, null);
    }
    window.setTimeout(() => {
      for (const id of Object.keys(summary.gains)) host.holdCurrency(id, null);
    }, 2500);
    close();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      doCollect();
    } else if (e.key === 'Tab') {
      e.preventDefault(); // one control: keep focus on Collect
      collect.focus();
    }
  };
  document.addEventListener('keydown', onKey, true);
  collect.addEventListener('click', doCollect);
  queueMicrotask(() => collect.focus());
}
