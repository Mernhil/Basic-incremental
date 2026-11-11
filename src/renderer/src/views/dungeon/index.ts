import { COPY } from '../../copy';
import { createDungeonsPage } from '../../pages/dungeons';
import { h } from '../../shell/shell';
import type { TableContext, ViewPackage } from '../../table/contract';
import './dungeon.css';

/**
 * Package 9a: the dungeon window in the centre of the table and the dungeon full view (mockups 4a
 * and 4b; UI_RULES.md §2 "The dungeon full view"). Today both show the Dungeons page as it was:
 * one arena element that sits in the window while the table shows and moves into the view when it
 * opens, so the fight never restarts. In the window the drawer is hidden (dungeon.css).
 */

let arena: { el: HTMLElement; render(): void } | null = null;
let windowBody: HTMLElement | null = null;

function ensureArena(ctx: TableContext): { el: HTMLElement; render(): void } {
  if (arena) return arena;
  const el = h('div', 'shell-page dv-arena');
  el.dataset.page = 'dungeons';
  el.append(h('h1', 'shell-page__title sr-only', COPY.pages.dungeons.label));
  const page = createDungeonsPage(el, {
    content: ctx.content,
    cards: ctx.cards,
    state: ctx.state,
    apply: ctx.apply,
    director: ctx.director,
    coins: ctx.coins,
    // the fight is on screen on the table and in its own view
    visible: () => {
      const open = ctx.current();
      return (open === null || open === 'dungeon') && !document.hidden;
    },
    sound: ctx.sound,
    onTierUps: ctx.onTierUps,
  });
  arena = { el, render: page.render };
  return arena;
}

export const dungeonViews: ViewPackage = {
  pieces: [
    {
      slot: 'centre',
      view: 'dungeon',
      label: COPY.table.open(COPY.view.titles.dungeon),
      mount(host, ctx) {
        windowBody = host;
        host.classList.add('dv-window');
        const a = ensureArena(ctx);
        host.append(a.el);
        return { render: () => a.render() };
      },
    },
  ],
  views: [
    {
      id: 'dungeon',
      title: COPY.view.titles.dungeon,
      mount(host, ctx) {
        const a = ensureArena(ctx);
        host.classList.add('dv-view');
        return {
          render: () => a.render(),
          opened: () => host.append(a.el),
          closed: () => windowBody?.append(a.el),
        };
      },
    },
  ],
};
