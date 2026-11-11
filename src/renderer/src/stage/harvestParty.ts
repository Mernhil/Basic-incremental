import type { StageTarget } from '../../../game';
import { gaugePercent, workerCellText, type StrikeLook } from '../pages/productionStageModel';
import { COPY } from '../copy';
import { reducedMotion, replay } from './motion';
import './harvestParty.css';

/**
 * The worker cell of one Production row (DESIGN.md §4 Workers, §11): the card working that tree
 * or mine as a chip (rarity swatch, name, level and power) with its harvest gauge under it, or an
 * empty cell to put a card to work. A click asks the page to open the worker picker for the row.
 * The page tells it when to strike and burst; it owns only this DOM. Plain working UI in the
 * block style: the item's art on the rarity's colour, a mini card (UI_RULES.md §2 Worker blocks).
 */

const STRIKE_CLASSES = [
  'is-strike-steady',
  'is-strike-chop',
  'is-strike-flurry',
  'is-strike-volley',
];

export interface WorkerCell {
  el: HTMLElement;
  /** Redraws from the row's stage target (null for a locked row: the cell stays empty). */
  update(target: StageTarget | null, picking: boolean, canAdd: boolean, art?: string): void;
  /** A strike: the chip nudges toward the tile with the pattern's look. */
  strike(look: StrikeLook): void;
  /** The burst moment on the chip. */
  burst(): void;
}

export function createWorkerCell(placeName: string, onPick: () => void): WorkerCell {
  const el = document.createElement('div');
  el.className = 'pp-w';

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'pp-w__btn';
  const swatch = document.createElement('span');
  swatch.className = 'pp-w__art';
  swatch.setAttribute('aria-hidden', 'true');
  const name = document.createElement('b');
  name.className = 'pp-w__name';
  const sub = document.createElement('span');
  sub.className = 'pp-w__sub bi-num';
  btn.append(swatch, name, sub);
  btn.addEventListener('click', onPick);

  // the worker's harvest gauge: the same segmented meter as before, one per worker
  const gauge = document.createElement('div');
  gauge.className = 'pp-gauge';
  gauge.setAttribute('role', 'meter');
  gauge.setAttribute('aria-valuemin', '0');
  gauge.setAttribute('aria-valuemax', '100');
  const fill = document.createElement('i');
  gauge.append(fill);
  const gaugeText = document.createElement('span');
  gaugeText.className = 'pp-w__gl bi-num';
  el.append(btn, gauge, gaugeText);

  let has = false;
  let artShown = '';
  const set = (node: HTMLElement, text: string): void => {
    if (node.textContent !== text) node.textContent = text;
  };

  return {
    el,
    update(target, picking, canAdd, art = '') {
      const w = target?.worker ?? null;
      has = Boolean(w);
      // a locked row keeps the cell's column, empty
      el.style.visibility = target === null ? 'hidden' : '';
      el.classList.toggle('is-empty', !w);
      btn.setAttribute('aria-expanded', String(picking));
      const text = workerCellText(target, canAdd);
      set(name, text.name);
      set(sub, text.sub);
      swatch.dataset['rarity'] = w?.rarity ?? '';
      if (artShown !== art) {
        artShown = art;
        swatch.innerHTML = art;
      }
      btn.setAttribute(
        'aria-label',
        w
          ? COPY.production.workerLabel(placeName, w.name, text.sub)
          : COPY.production.noWorkerLabel(placeName),
      );
      gauge.hidden = !w;
      gaugeText.hidden = !w;
      if (w && target) {
        const pct = gaugePercent(target.gauge);
        fill.style.width = `${pct}%`;
        gauge.classList.toggle('is-full', target.gauge > 0.92);
        gauge.setAttribute('aria-valuenow', String(pct));
        gauge.setAttribute('aria-label', `${COPY.production.harvestBurst}: ${pct}%`);
      }
    },
    strike(look) {
      if (!has || reducedMotion()) return;
      for (const cls of STRIKE_CLASSES) if (cls !== look.lungeClass) btn.classList.remove(cls);
      replay(btn, look.lungeClass, look.ms);
    },
    burst() {
      if (has && !reducedMotion()) replay(btn, 'is-bursting', 800);
    },
  };
}
