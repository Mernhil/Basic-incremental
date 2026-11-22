import { COPY } from '../../copy';
import type { ViewDef, ViewPackage } from '../../table/contract';
import { GATHERING_COPY as T } from './copy';
import { createForgeView } from './forge';
import { createCampView } from './camp';
import './camp.css';
import './gathering.css';

/**
 * Package 9b: the Logging and Mining wings and their full views, and the Forge view (mockups 4a,
 * 4c, 4e, 4f; UI_RULES.md §2). `job.ts` is the Logging and Mining view, `forge.ts` the Forge.
 */

const campView = (id: 'logging' | 'mining', place: 'forest' | 'cave'): ViewDef => ({
  id,
  title: COPY.view.titles[id],
  mount: (host, ctx) => createCampView(host, ctx, place),
});

const forgeView: ViewDef = {
  id: 'forge',
  title: COPY.view.titles.forge,
  pile: { glyph: 'production', hint: () => ({ text: T.forgeHint }) },
  mount: (host, ctx) => createForgeView(host, ctx),
};

export const gatheringViews: ViewPackage = {
  views: [campView('logging', 'forest'), campView('mining', 'cave'), forgeView],
};
