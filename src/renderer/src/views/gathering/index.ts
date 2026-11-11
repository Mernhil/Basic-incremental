import { COPY } from '../../copy';
import type { ViewDef, ViewPackage } from '../../table/contract';
import { GATHERING_COPY as T } from './copy';
import { createForgeView } from './forge';
import { createJobView } from './job';
import { createWing } from './wing';
import './gathering.css';

/**
 * Package 9b: the Logging and Mining wings and their full views, and the Forge view (mockups 4a,
 * 4c, 4e, 4f; UI_RULES.md §2). `job.ts` is the Logging and Mining view, `forge.ts` the Forge.
 */

const jobView = (job: 'logging' | 'mining'): ViewDef => ({
  id: job,
  title: COPY.view.titles[job],
  mount: (host, ctx, api) => createJobView(host, ctx, api, job),
});

const forgeView: ViewDef = {
  id: 'forge',
  title: COPY.view.titles.forge,
  pile: { glyph: 'production', hint: () => ({ text: T.forgeHint }) },
  mount: (host, ctx, api) => createForgeView(host, ctx, api),
};

export const gatheringViews: ViewPackage = {
  pieces: [
    {
      slot: 'left',
      view: 'logging',
      label: COPY.table.open(COPY.view.titles.logging),
      mount: (host, ctx) => createWing(host, ctx, 'logging'),
    },
    {
      slot: 'right',
      view: 'mining',
      label: COPY.table.open(COPY.view.titles.mining),
      mount: (host, ctx) => createWing(host, ctx, 'mining'),
    },
  ],
  views: [jobView('logging'), jobView('mining'), forgeView],
};
