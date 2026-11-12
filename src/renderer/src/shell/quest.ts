import { COPY } from '../copy';
import type { GoalRow } from '../pages/progressionModel';
import { h } from './shell';

/**
 * The goal list (DESIGN.md §10) that drops down under the header's Goals button: the next 1-3
 * goals with a check box, a progress bar and an estimate; clicking a goal opens its view.
 */
export function createQuestScroll(
  slot: HTMLElement,
  open: (row: GoalRow) => void,
): { update(rows: GoalRow[]): void } {
  const title = h('span', 'shell-quest__title', COPY.progress.goals);
  const list = h('ul', 'shell-quest__list');
  list.setAttribute('aria-label', COPY.progress.goals);
  slot.prepend(title, list);
  let key = '';
  const items = new Map<
    string,
    { btn: HTMLButtonElement; box: HTMLElement; fill: HTMLElement; eta: HTMLElement }
  >();
  return {
    update(rows) {
      slot.dataset.goals = rows.length > 0 ? '1' : '';
      slot.dispatchEvent(new Event('goals'));
      const next = rows.map((r) => r.id).join('|');
      if (next !== key) {
        key = next;
        items.clear();
        list.replaceChildren(
          ...rows.map((r) => {
            const li = h('li');
            const btn = h('button', 'shell-quest__goal');
            btn.type = 'button';
            const box = h('span', 'shell-quest__box');
            box.setAttribute('aria-hidden', 'true');
            const eta = h('span', 'shell-quest__eta bi-num');
            const bar = h('span', 'shell-quest__bar');
            const fill = h('i');
            bar.append(fill);
            btn.append(box, h('span', 'shell-quest__text', r.title), eta, bar);
            btn.addEventListener('click', () => open(r));
            li.append(btn);
            items.set(r.id, { btn, box, fill, eta });
            return li;
          }),
        );
      }
      for (const r of rows) {
        const ui = items.get(r.id);
        if (!ui) continue;
        ui.fill.style.width = `${(r.progress * 100).toFixed(1)}%`;
        if (ui.eta.textContent !== r.eta) ui.eta.textContent = r.eta;
        ui.btn.classList.toggle('is-done', r.done);
        const mark = r.done ? '✓' : '';
        if (ui.box.textContent !== mark) ui.box.textContent = mark;
        const label = COPY.progress.goalLabel(r.title, Math.round(r.progress * 100), r.eta);
        if (ui.btn.getAttribute('aria-label') !== label) ui.btn.setAttribute('aria-label', label);
      }
    },
  };
}
