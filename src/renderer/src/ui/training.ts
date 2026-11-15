import type { Content, PerkLine } from '../../../data';
import type { GameState } from '../../../game';
import { COPY } from '../copy';
import { h } from '../shell/shell';
import { createBuyToggle } from './buy';
import { createPerkPick } from './perkPick';
import { createUpgradeRows } from './upgradeRows';
import './training.css';

/**
 * The Training panel of the dungeon view (DESIGN.md §6 Training, UI_RULES §2): a waiting milestone
 * pick of a Training line first (two cards), then the "You hold" strip of the four gems and one
 * upgrade row per line (DESIGN.md §4 The upgrade row) under the x1 / x10 / x100 / Max toggle.
 */

export interface TrainingOptions {
  content: Content;
  state: () => GameState;
  apply: (next: GameState) => void;
  sound?: (id: string) => void;
}

export interface TrainingPanel {
  el: HTMLElement;
  update(): void;
}

export function createTrainingPanel(opts: TrainingOptions): TrainingPanel {
  const { content } = opts;
  const lines: PerkLine[] = content.training.map((t) => ({ kind: 'training', id: t.id }));
  const el = h('section', 'tr');
  el.setAttribute('aria-label', COPY.training.title);
  const head = h('header', 'tr__head');
  head.append(
    h('h3', 'dp-col__title', COPY.training.title),
    h('span', 'dp-col__note', COPY.training.note),
    createBuyToggle(),
  );
  const pick = createPerkPick({ ...opts, lines: () => lines });
  const rows = createUpgradeRows({ ...opts, lines: () => lines });
  el.append(head, pick.el, rows.el);
  const update = (): void => {
    pick.update();
    rows.update();
  };
  return { el, update };
}
