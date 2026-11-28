import { COPY } from '../../copy';
import type { ViewPackage } from '../../table/contract';
import { createRaidsView } from './raids';
import './raids.css';

/** The Raids view (DESIGN.md section 2 Raid bosses), opened from the hub's Raid gate. */
export const raidsViews: ViewPackage = {
  views: [
    {
      id: 'raids',
      title: COPY.view.titles.raids,
      mount: (host, ctx, api) => createRaidsView(host, ctx, api),
    },
  ],
};
