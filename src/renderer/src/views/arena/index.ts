import { COPY } from '../../copy';
import type { ViewPackage } from '../../table/contract';
import { createArenaView } from './arena';
import './arena.css';

/** The Arena view (DESIGN.md Arena and raids), opened from the hub's colosseum. */
export const arenaViews: ViewPackage = {
  views: [
    {
      id: 'arena',
      title: COPY.view.titles.arena,
      mount: (host, ctx) => createArenaView(host, ctx),
    },
  ],
};
