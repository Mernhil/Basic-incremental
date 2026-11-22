import { h } from '../../shell/shell';
import type { TableContext, ViewHandle } from '../../table/contract';
import { createExpeditionsPanel } from '../../pages/tablePanels';

/**
 * The Expedition board (DESIGN.md section 2 Base camp): today's expeditions, opened from their
 * building on the hub instead of a tab of the Cards screen. The rules are in game
 * (`expeditions.ts`); the panel is the one the Cards tab used.
 */
export function createExpeditionBoard(host: HTMLElement, ctx: TableContext): ViewHandle {
  host.classList.add('trg');
  const panel = createExpeditionsPanel({
    content: ctx.content,
    state: ctx.state,
    apply: ctx.apply,
  });
  const wrap = h('div', 'cp-loadouts');
  wrap.append(panel.el);
  host.append(wrap);
  return { render: () => panel.update() };
}
