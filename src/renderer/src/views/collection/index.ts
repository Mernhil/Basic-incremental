import { Decimal } from '../../../../game';
import { COPY } from '../../copy';
import { createCardsPage } from '../../pages/cards';
import { createSummonPage } from '../../pages/summon';
import { createWardrobePage } from '../../pages/wardrobe';
import type { ViewPackage } from '../../table/contract';
import { COLLECTION_COPY as T } from './copy';

/**
 * Package 9c: the Cards, Summon and Wardrobe piles and their views (mockups 4d, 4h, 4i;
 * UI_RULES.md §2). Today each view holds its old page as it was; the reveal show plays over the
 * whole window (stage/reveal.ts) and weapon skins stay a Wardrobe chip.
 */

export const collectionViews: ViewPackage = {
  views: [
    {
      id: 'cards',
      title: COPY.view.titles.cards,
      pile: {
        glyph: 'cards',
        hint: (ctx) => {
          const owned = Object.keys(ctx.state().cards.owned).length;
          return { text: T.owned(owned, ctx.content.cards.length) };
        },
      },
      mount: (host, ctx, api) =>
        createCardsPage(host, {
          content: ctx.content,
          model: ctx.cards,
          state: ctx.state,
          apply: ctx.apply,
          onTierUps: ctx.onTierUps,
          setTools: api.setTools,
        }),
    },
    {
      id: 'summon',
      title: COPY.view.titles.summon,
      pile: {
        glyph: 'summon',
        hint: (ctx) => {
          const scrolls = ctx.state().resources['summon_scroll'] ?? new Decimal(0);
          const n = Math.floor(scrolls.toNumber());
          return { text: T.pulls(n), ready: n > 0 };
        },
      },
      mount: (host, ctx) =>
        createSummonPage(host, {
          content: ctx.content,
          state: ctx.state,
          apply: ctx.apply,
          sound: ctx.sound,
        }),
    },
    {
      id: 'wardrobe',
      title: COPY.view.titles.wardrobe,
      pile: {
        glyph: 'wardrobe',
        hint: (ctx) => {
          const owned = Object.keys(ctx.state().cosmetics.owned).length;
          return { text: T.owned(owned, ctx.content.cosmetics.length) };
        },
      },
      mount: (host, ctx) =>
        createWardrobePage(host, {
          content: ctx.content,
          state: ctx.state,
          apply: ctx.apply,
          sound: ctx.sound,
          onLoadoutChange: ctx.applyTheme,
        }),
    },
  ],
};
