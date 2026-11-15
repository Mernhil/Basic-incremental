import type { Content, PerkLine } from '../../../data';
import type { GameState, ProductionJob } from '../../../game';
import { COPY } from '../copy';
import { h } from '../shell/shell';
import { createUpgradeRows } from './upgradeRows';
import './training.css';

/**
 * A job's tool lines (DESIGN.md §4 Tool lines): one upgrade row per line (DESIGN.md §4 The upgrade
 * row) for yield, strike speed, crit chance and crit damage. The ×1 / ×10 / ×100 / Max toggle is
 * the view's own; the job's waiting pick shows where the view puts it.
 */

export interface ToolLinesOptions {
  content: Content;
  job: ProductionJob;
  state: () => GameState;
  apply: (next: GameState) => void;
  sound?: (id: string) => void;
  /** Show the "You hold" strip (default true). */
  hold?: boolean;
}

export interface ToolLinesPanel {
  el: HTMLElement;
  update(): void;
}

export function createToolLinesPanel(opts: ToolLinesOptions): ToolLinesPanel {
  const { content, job } = opts;
  const lines: PerkLine[] = content.production.tools
    .filter((t) => t.job === job)
    .map((t) => ({ kind: 'tool', id: t.id }));
  const title = COPY.tools.title(COPY.production[job].title);
  const el = h('section', 'tr pp-tools');
  el.setAttribute('aria-label', title);
  const head = h('header', 'tr__head');
  head.append(h('h3', 'dp-col__title', title), h('span', 'dp-col__note', COPY.tools.note));
  const rows = createUpgradeRows({ ...opts, lines: () => lines });
  el.append(head, rows.el);
  return { el, update: rows.update };
}
