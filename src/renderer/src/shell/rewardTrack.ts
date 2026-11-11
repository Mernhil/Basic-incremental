import type { Content } from '../../../data';
import { COPY } from '../copy';
import type { RewardView, TrackTileView } from '../pages/accountModel';
import { cosmeticSwatch } from '../ui/cosmeticSwatch';
import { icon } from './icons';
import { h } from './shell';

/**
 * The reward track (DESIGN.md §10, A16 B): the quest scroll unrolls under the header with every
 * account level as a stop on a path. Plain levels (a skill point) are small stones; levels with
 * crystals, a cosmetic or a cost cap bump are signposts. Opens from the account level badge.
 */

/** Crystal and material tints until they get their own coins (pixel-art request). */
const RESOURCE_TINT: Record<string, string> = {
  summon_crystal: '#6fbf5a',
  glamour_crystal: '#e2773e',
  frost_sigil: '#6cb8e8',
};
const DEFAULT_TINT = '#c9a14a';

export interface RewardTrack {
  open(tiles: TrackTileView[], level: number): void;
  /** Refreshes an open track (after a level-up); does nothing when closed. */
  update(tiles: TrackTileView[], level: number): void;
  close(): void;
  isOpen(): boolean;
}

export function createRewardTrack(
  panel: HTMLElement,
  ctx: { content: Content; setOpen: (open: boolean) => void; returnFocus: () => void },
): RewardTrack {
  const t = COPY.account;
  let open = false;
  let key = '';

  const art = (r: RewardView): HTMLElement => {
    const box = h('span', 'shell-track__art');
    if (r.kind === 'cosmetic') box.append(cosmeticSwatch(ctx.content, r.id, 1));
    else if (r.kind === 'resource') {
      const g = h('span', 'shell-track__glyph shell-track__glyph--resource');
      g.style.background = RESOURCE_TINT[r.id] ?? DEFAULT_TINT;
      g.append(icon('portal', 'shell-icon'));
      box.append(g);
    } else if (r.kind === 'cap') {
      box.append(h('span', 'shell-track__glyph shell-track__glyph--cap', r.short));
    } else {
      box.append(h('span', 'shell-track__glyph', r.short));
    }
    return box;
  };

  function draw(tiles: TrackTileView[], level: number): void {
    const next = JSON.stringify([level, tiles.map((x) => x.reached)]);
    if (next === key && panel.childElementCount > 0) return;
    key = next;
    const head = h('div', 'shell-track__head');
    const title = h('h2', 'shell-track__title', t.track);
    title.id = 'shell-track-title';
    const close = h('button', 'shell-track__close', t.close);
    close.type = 'button';
    close.addEventListener('click', () => hide(true));
    head.append(title, h('span', 'shell-track__note', t.trackNote(level)), close);

    const row = h('ol', 'shell-track__row');
    row.tabIndex = 0;
    row.setAttribute('aria-labelledby', title.id);
    let nextEl: HTMLElement | null = null;
    for (const tile of tiles) {
      const li = h(
        'li',
        `shell-track__stop${tile.reached ? ' is-reached' : ''}${tile.next ? ' is-next' : ''}${
          tile.milestone ? ' is-milestone' : ''
        }`,
      );
      li.setAttribute('aria-label', tile.label);
      const card = h('div', 'shell-track__card');
      card.setAttribute('aria-hidden', 'true');
      card.append(h('span', 'shell-track__lv bi-num', t.level(tile.level)));
      const lead = tile.rewards[0];
      if (lead) card.append(art(lead));
      if (tile.milestone) {
        const extras = tile.rewards.filter((r) => r !== lead && r.kind !== 'points');
        const words = [
          lead && lead.kind !== 'points' ? lead.text : '',
          ...extras.map((r) => r.text),
        ];
        card.append(h('span', 'shell-track__extra', words.filter(Boolean).join(', ')));
      }
      const dot = h('span', 'shell-track__dot', tile.reached ? '✓' : '');
      dot.setAttribute('aria-hidden', 'true');
      li.append(card, dot);
      if (tile.next) nextEl = li;
      row.append(li);
    }
    panel.replaceChildren(head, row);
    panel.setAttribute('role', 'region');
    panel.setAttribute('aria-labelledby', title.id);
    // start at the last level reached, so the next ones fill the view
    requestAnimationFrame(() => {
      const target = nextEl ?? row.lastElementChild;
      if (target instanceof HTMLElement) row.scrollLeft = Math.max(0, target.offsetLeft - 140);
    });
  }

  function hide(focusBack: boolean): void {
    if (!open) return;
    open = false;
    ctx.setOpen(false);
    if (focusBack) ctx.returnFocus();
  }

  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide(true);
  });
  // a click anywhere outside the scroll and the badge rolls it back up
  document.addEventListener('pointerdown', (e) => {
    if (!open) return;
    const target = e.target as Element | null;
    if (target?.closest('.shell-track, .shell-level')) return;
    hide(false);
  });

  return {
    open(tiles, level) {
      key = '';
      draw(tiles, level);
      open = true;
      ctx.setOpen(true);
      panel.querySelector<HTMLElement>('.shell-track__row')?.focus({ preventScroll: true });
    },
    update(tiles, level) {
      if (open) draw(tiles, level);
    },
    close: () => hide(false),
    isOpen: () => open,
  };
}
