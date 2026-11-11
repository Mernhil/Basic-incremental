import type { Content } from '../../../data';
import { assignForgeWorker, setForgeRecipe, type GameState } from '../../../game';
import { COPY } from '../copy';
import { forgeView } from '../pages/forgeModel';
import { h } from '../shell/shell';

/**
 * The forge on the Production page (DESIGN.md §4 The forge): a plain panel under the two bands.
 * The recipe buttons, a worker pick, and a bar to the next craft with one status line.
 */

export interface ForgeOptions {
  content: Content;
  state: () => GameState;
  apply: (next: GameState) => void;
  sound?: (id: string) => void;
}

export interface ForgePanel {
  el: HTMLElement;
  update(): void;
}

export function createForgePanel(opts: ForgeOptions): ForgePanel {
  const { content } = opts;
  const t = COPY.forge;
  const el = h('section', 'pp-band px-panel pp-forge');
  el.setAttribute('aria-label', t.title);
  const top = h('div', 'pp-band__top');
  const status = h('span', 'pp-band__slots bi-num');
  top.append(h('h2', 'pp-band__title pp-panel__title px-display', t.title), status);
  const recipes = h('div', 'pp-forge__recipes');
  recipes.setAttribute('role', 'group');
  recipes.setAttribute('aria-label', t.recipes);
  const workerLabel = h('label', 'pp-forge__worker');
  const select = h('select', 'cp-select');
  select.dataset.key = 'forge-worker';
  workerLabel.append(h('span', '', t.workerLabel), select);
  const bar = h('div', 'pp-dep pp-forge__bar');
  const fill = h('i');
  bar.append(fill);
  const speed = h('span', 'pp-forge__speed bi-num');
  const controls = h('div', 'pp-forge__row');
  controls.append(workerLabel, speed);
  el.append(top, recipes, controls, bar);

  let built = '';
  function update(): void {
    const s = opts.state();
    const v = forgeView(s, content);
    const sig = JSON.stringify([v.recipes.map((r) => r.id), v.workers.map((w) => w.cardId)]);
    if (sig !== built) {
      built = sig;
      recipes.replaceChildren(
        ...v.recipes.map((r) => {
          const b = h('button', 'pp-forge__recipe');
          b.type = 'button';
          b.dataset.key = `forge-recipe-${r.id}`;
          b.dataset.recipe = r.id;
          b.append(h('b', '', r.name), h('span', 'bi-num', r.text));
          b.addEventListener('click', () => {
            const on = b.classList.contains('is-on');
            const result = setForgeRecipe(opts.state(), content, on ? null : r.id);
            if (!result.ok) return;
            opts.sound?.('buy');
            opts.apply(result.state);
            update();
          });
          return b;
        }),
      );
      const none = h('option', '', t.noneWorker);
      none.value = '';
      select.replaceChildren(
        none,
        ...v.workers.map((w) => {
          const o = h('option', '', w.label);
          o.value = w.cardId;
          return o;
        }),
      );
      select.onchange = () => {
        const result = assignForgeWorker(opts.state(), content, select.value || null);
        if (!result.ok) {
          select.value = forgeView(opts.state(), content).worker;
          return;
        }
        opts.sound?.('buy');
        opts.apply(result.state);
        update();
      };
    }
    for (const b of recipes.querySelectorAll<HTMLButtonElement>('.pp-forge__recipe'))
      b.classList.toggle('is-on', b.dataset.recipe === v.recipes.find((r) => r.active)?.id);
    if (select.value !== v.worker) select.value = v.worker;
    if (status.textContent !== v.status) status.textContent = v.status;
    if (speed.textContent !== v.speed) speed.textContent = v.speed;
    fill.style.width = `${Math.round(v.fraction * 100)}%`;
  }
  update();
  return { el, update };
}
