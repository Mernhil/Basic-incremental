import { accountInfo, collectModifiers, Decimal } from '../../../../game';
import { COPY } from '../../copy';
import { levelBadge } from '../../pages/accountModel';
import { createAchievementsPage } from '../../pages/achievements';
import { createSettingsPage } from '../../pages/settings';
import { shelfChips } from '../../pages/shelfModel';
import { createShopPage } from '../../pages/shop';
import { createSkillsPage } from '../../pages/skills';
import { fmt } from '../../settings/numberFormat';
import type { ViewPackage } from '../../table/contract';
import { createShelf } from '../../ui/shelf';
import { META_COPY as T } from './copy';
import './meta.css';

/**
 * Package 9d: the Skill Tree, Achievements, Shop, Upgrades and Settings piles and their views
 * (mockups 4j, 4k, 4l, 4m, 4n; UI_RULES.md §2). Today each view holds its old page as it was; the
 * Upgrades view holds the two upgrade shelves (production and fighting) side by side.
 */

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
      mount: (host, ctx) =>
        createSkillsPage(host, {
          content: ctx.content,
          state: ctx.state,
          apply: ctx.apply,
          sound: ctx.sound,
        }),
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
      mount: (host, ctx) =>
        createAchievementsPage(host, {
          content: ctx.content,
          state: ctx.state,
          apply: ctx.apply,
          sound: ctx.sound,
        }),
    },
    {
      id: 'shop',
      title: COPY.view.titles.shop,
      pile: {
        glyph: 'shop',
        hint: (ctx) => {
          const res = ctx.content.resources.find((r) => r.kind === 'prestige');
          if (!res) return null;
          const amount = ctx.state().resources[res.id] ?? new Decimal(0);
          return { text: T.amount(fmt(amount), res.name) };
        },
      },
      mount: (host, ctx) =>
        createShopPage(host, {
          content: ctx.content,
          state: ctx.state,
          apply: ctx.apply,
          sound: ctx.sound,
        }),
    },
    {
      id: 'upgrades',
      title: COPY.view.titles.upgrades,
      pile: {
        glyph: 'settings',
        hint: (ctx) => {
          const s = ctx.state();
          const mods = collectModifiers(s, ctx.content);
          const n = shelfChips(s, ctx.content, mods, null).filter(
            (c) => c.status === 'available' && c.affordable,
          ).length;
          return n > 0 ? { text: T.ready(n), ready: true } : null;
        },
      },
      mount(host, ctx) {
        host.classList.add('mv-upgrades');
        const shelves = (['production', 'fighting'] as const).map((scope) =>
          createShelf({
            content: ctx.content,
            state: ctx.state,
            apply: ctx.apply,
            scope,
            sound: ctx.sound,
          }),
        );
        host.append(...shelves.map((s) => s.el));
        return {
          render() {
            for (const s of shelves) s.update();
          },
        };
      },
    },
    {
      id: 'settings',
      title: COPY.view.titles.settings,
      pile: { glyph: 'settings' },
      mount: (host, ctx) =>
        createSettingsPage(host, {
          content: ctx.content,
          state: ctx.state,
          version: ctx.version,
          exportText: ctx.save.exportText,
          replace: ctx.save.replace,
          lastSavedAt: ctx.save.lastSavedAt,
        }),
    },
  ],
};
