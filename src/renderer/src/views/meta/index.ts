import { accountInfo, ascensionPreview, Decimal, waitingPicks } from '../../../../game';
import { COPY } from '../../copy';
import { levelBadge } from '../../pages/accountModel';
import { createAchievementsPage } from '../../pages/achievements';
import { shardsText } from '../../pages/achievementsModel';
import { createSettingsPage } from '../../pages/settings';
import { createAscensionPage } from '../../pages/ascension';
import { createShopPage } from '../../pages/shop';
import { createSkillsPage } from '../../pages/skills';
import { h } from '../../shell/shell';
import { fmt } from '../../settings/numberFormat';
import type { ViewApi, ViewPackage } from '../../table/contract';
import { META_COPY as T } from './copy';
import { mountUpgrades } from './upgradesView';
import './meta.css';

/**
 * Package 9d: the Skill Tree, Achievements, Shop, Upgrades and Settings piles and their views
 * (mockups 4j, 4k, 4l, 4m, 4n; UI_RULES.md §2). Each view keeps the screen of its page, takes the
 * table's view look (its count as a subtitle at the right end of the title bar, the page filling
 * the view, its main blocks marked `data-deal` for motion E); Upgrades is its own two-panel view.
 */

/** The muted subtitle at the right end of the title bar; `set` rewrites it only when it changes. */
function subtitle(api: ViewApi): (text: string) => void {
  const el = h('span', 'mv-subtitle');
  api.setTools(el);
  return (text) => {
    if (el.textContent !== text) el.textContent = text;
  };
}

export const metaViews: ViewPackage = {
  views: [
    {
      id: 'skills',
      title: COPY.view.titles.skills,
      pile: {
        glyph: 'skills',
        hint: (ctx) => {
          const points = levelBadge(accountInfo(ctx.state(), ctx.content)).points;
          return points > 0 ? { text: T.points(points), ready: true } : null;
        },
      },
      mount(host, ctx, api) {
        host.classList.add('mv-fit', 'mv-skills');
        const set = subtitle(api);
        return createSkillsPage(host, {
          content: ctx.content,
          state: ctx.state,
          apply: ctx.apply,
          sound: ctx.sound,
          subtitle: (learned, total) => set(T.skills.subtitle(learned, total)),
          subtitleText: set,
        });
      },
    },
    {
      id: 'achievements',
      title: COPY.view.titles.achievements,
      pile: {
        glyph: 'achievements',
        hint: (ctx) => ({
          text: T.of(Object.keys(ctx.state().achievements).length, ctx.content.achievements.length),
        }),
      },
      mount(host, ctx, api) {
        host.classList.add('mv-fit', 'mv-achievements');
        const set = subtitle(api);
        const page = createAchievementsPage(host, {
          content: ctx.content,
          state: ctx.state,
          apply: ctx.apply,
          sound: ctx.sound,
        });
        const sync = (): void =>
          set(
            T.achievements.subtitle(
              Object.keys(ctx.state().achievements).length,
              ctx.content.achievements.length,
            ),
          );
        sync();
        return {
          render() {
            page.render();
            sync();
          },
        };
      },
    },
    {
      id: 'shop',
      title: COPY.view.titles.shop,
      pile: {
        glyph: 'shop',
        hint: (ctx) => ({ text: T.amount(shardsText(ctx.state()), 'Shards') }),
      },
      mount(host, ctx, api) {
        host.classList.add('mv-fit', 'mv-shop');
        const set = subtitle(api);
        const page = createShopPage(host, {
          content: ctx.content,
          state: ctx.state,
          apply: ctx.apply,
          sound: ctx.sound,
        });
        const sync = (): void => {
          set(T.shop.subtitle(shardsText(ctx.state())));
        };
        sync();
        return {
          render() {
            page.render();
            sync();
          },
        };
      },
    },
    {
      id: 'ascension',
      title: COPY.view.titles.ascension,
      pile: {
        glyph: 'shop',
        hint: (ctx) => {
          const p = ascensionPreview(ctx.state(), ctx.content);
          return p.canAscend ? { text: T.ascension.ready, ready: true } : null;
        },
      },
      mount(host, ctx, api) {
        host.classList.add('mv-fit', 'mv-ascension');
        const set = subtitle(api);
        const page = createAscensionPage(host, {
          content: ctx.content,
          state: ctx.state,
          apply: ctx.apply,
          sound: ctx.sound,
        });
        const sync = (): void => {
          const s = ctx.state();
          const starlight = s.resources[ctx.content.prestige.currency] ?? new Decimal(0);
          set(T.ascension.subtitle(s.prestigeCount, fmt(starlight)));
        };
        sync();
        return {
          render() {
            page.render();
            sync();
          },
        };
      },
    },
    {
      id: 'upgrades',
      title: COPY.view.titles.upgrades,
      pile: {
        glyph: 'settings',
        hint: (ctx) => {
          const n = waitingPicks(ctx.state(), ctx.content).length;
          return n > 0 ? { text: COPY.picks.toChoose(n), ready: true } : null;
        },
      },
      mount: (host, ctx, api) => mountUpgrades(host, ctx, api),
    },
    {
      id: 'settings',
      title: COPY.view.titles.settings,
      pile: { glyph: 'settings' },
      mount(host, ctx, api) {
        host.classList.add('mv-fit');
        subtitle(api)(T.settings.subtitle(ctx.version));
        return createSettingsPage(host, {
          content: ctx.content,
          state: ctx.state,
          version: ctx.version,
          exportText: ctx.save.exportText,
          replace: ctx.save.replace,
          lastSavedAt: ctx.save.lastSavedAt,
        });
      },
    },
  ],
};
