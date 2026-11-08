import type { Content } from '../../../data';
import {
  productionStageView,
  type GameState,
  type ProductionJob,
  type ProductionStageView,
  type StageCard,
} from '../../../game';
import { cardItemArt } from '../pages/loadoutCards';
import { gaugePercent, stageKey, type StrikeLook } from '../pages/productionStageModel';
import { COPY } from '../copy';
import { createCard, type CardProps } from '../ui/card';
import { reducedMotion, replay } from './motion';
import './harvestParty.css';

/**
 * The cards of a production field (DESIGN.md §4, §11): the main logging / mining card with its
 * harvest gauge (the same meter as Brave Burst in the arena) and its three supports, drawn with
 * the cosmetics of the fighting cards (`look`). The page tells it when to lunge and which
 * supports to pulse; it only owns the card DOM.
 */

const SUPPORTS = 3;
const STRIKE_CLASSES = [
  'is-strike-steady',
  'is-strike-chop',
  'is-strike-flurry',
  'is-strike-volley',
];

export interface HarvestParty {
  el: HTMLElement;
  /** Re-reads the stage view, redraws changed cards and the gauge. Returns the view. */
  update(): ProductionStageView;
  /** The last view `update` read. */
  view(): ProductionStageView;
  /** The main card's slot (null when there is no main card), for aiming strikes. */
  mainSlot(): HTMLElement | null;
  /** Lunges the main card by (dx, dy) px with a strike look. */
  lunge(look: StrikeLook, dx: number, dy: number): void;
  /** Pulses the listed support cards. */
  pulse(ids: readonly string[]): void;
  /** The burst moment on the main card. */
  burst(): void;
}

export function createHarvestParty(
  content: Content,
  state: () => GameState,
  job: ProductionJob,
): HarvestParty {
  const el = document.createElement('div');
  el.className = `pp-party pp-party--${job}`;
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', COPY.production.partyLabel(COPY.production[job].title));

  const mainWrap = document.createElement('div');
  mainWrap.className = 'ar-slot pp-slot pp-slot--main';
  const gauge = document.createElement('div');
  gauge.className = 'ar-gauge pp-gauge';
  gauge.setAttribute('role', 'meter');
  gauge.setAttribute('aria-valuemin', '0');
  gauge.setAttribute('aria-valuemax', '100');
  const gaugeLabel = document.createElement('span');
  gaugeLabel.textContent = COPY.production.harvestBurst;
  const gaugeFill = document.createElement('i');
  gauge.append(gaugeLabel, gaugeFill);
  const supportRow = document.createElement('div');
  supportRow.className = 'pp-supports';
  const supportWraps: HTMLElement[] = [];
  for (let i = 0; i < SUPPORTS; i++) {
    const w = document.createElement('div');
    w.className = 'ar-slot pp-slot pp-slot--support';
    supportWraps.push(w);
    supportRow.append(w);
  }
  el.append(mainWrap, supportRow);

  let key = '';
  let last: ProductionStageView = productionStageView(state(), content, job);
  const byCard = new Map<string, HTMLElement>();
  let mainHas = false;

  const props = (c: StageCard, role: 'main' | 'support', v: ProductionStageView): CardProps => {
    const owned = state().cards.owned[c.cardId];
    const every = v.pattern.intervalSeconds / v.pattern.strikes;
    return {
      name: c.name,
      label: role === 'main' ? COPY.table.main : COPY.table.support,
      job,
      emblem: role === 'main' ? 'blade' : 'gem',
      ...(owned ? { item: cardItemArt(content, c.cardId, owned) } : {}),
      element: c.element,
      rank: c.rank,
      stats:
        role === 'main'
          ? [
              { label: 'Level', value: String(c.level) },
              { label: COPY.production.strikesEvery, value: `${Number(every.toFixed(2))}s` },
            ]
          : [
              { label: 'Level', value: String(c.level) },
              { label: 'Bonus', value: c.abilityText },
            ],
      theme: c.look,
    };
  };

  function fill(
    wrap: HTMLElement,
    card: StageCard | undefined,
    role: 'main' | 'support',
    v: ProductionStageView,
  ): void {
    wrap.replaceChildren();
    wrap.classList.toggle('ar-slot--empty', !card);
    wrap.classList.toggle('pp-slot--helps', Boolean(card?.helpsHarvest));
    if (!card) {
      wrap.setAttribute(
        'aria-label',
        role === 'main' ? COPY.table.emptyMain : COPY.table.emptySlot,
      );
      return;
    }
    wrap.removeAttribute('aria-label');
    wrap.append(createCard(props(card, role, v)).el);
    byCard.set(card.cardId, wrap);
  }

  function update(): ProductionStageView {
    const v = productionStageView(state(), content, job);
    last = v;
    const k = stageKey(v);
    if (k !== key) {
      key = k;
      byCard.clear();
      fill(mainWrap, v.main ?? undefined, 'main', v);
      mainHas = Boolean(v.main);
      v.supports.slice(0, SUPPORTS).forEach((c, i) => fill(supportWraps[i]!, c, 'support', v));
      mainWrap.append(gauge);
    }
    const pct = gaugePercent(v.gauge);
    gaugeFill.style.width = `${pct}%`;
    gauge.classList.toggle('is-full', v.gauge > 0.92);
    gauge.setAttribute('aria-valuenow', String(pct));
    gauge.setAttribute('aria-label', `${COPY.production.harvestBurst}: ${pct}%`);
    gauge.hidden = !mainHas;
    return v;
  }
  update();

  return {
    el,
    update,
    view: () => last,
    mainSlot: () => (mainHas ? mainWrap : null),
    lunge(look, dx, dy) {
      if (!mainHas || reducedMotion()) return;
      mainWrap.style.setProperty('--lx', `${dx}px`);
      mainWrap.style.setProperty('--ly', `${dy}px`);
      for (const cls of STRIKE_CLASSES) if (cls !== look.lungeClass) mainWrap.classList.remove(cls);
      replay(mainWrap, look.lungeClass, look.ms);
    },
    pulse(ids) {
      if (reducedMotion()) return;
      for (const id of ids) replay(byCard.get(id), 'is-pulse', 520);
    },
    burst() {
      if (mainHas && !reducedMotion()) replay(mainWrap, 'is-bursting', 800);
    },
  };
}
