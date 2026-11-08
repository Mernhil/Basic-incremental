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
import { createLoadoutFan, type FanCard } from '../ui/loadoutFan';
import { fitCard } from '../ui/pixelFit';
import { reducedMotion, replay } from './motion';
import './harvestParty.css';

/**
 * The cards of a production field (DESIGN.md §4, §11): the main logging / mining card with its
 * harvest gauge (the same meter as Brave Burst in the arena) and its three supports, drawn with
 * the cosmetics of the fighting cards (`look`). The page tells it when to lunge and which
 * supports to pulse; it only owns the card DOM.
 *
 * `side` is the Production screen's stage (DESIGN.md §4): the main card large (about 2x), its gauge
 * as a wide bar with the count beside it, the strike pattern in words and the supports as a list
 * of lines instead of cards.
 */

const SUPPORTS = 3;
/** The side stage's main card: about twice the grid; the whole fan fits the stage column. */
const SIDE_MAIN_WANT = 264;
const SIDE_FAN_MAX = 362;
/** CSS px wide the main card and the supports want; the screen scale rounds each to whole pixels. */
const MAIN_WANT = 132;
const SUPPORT_WANT = 74;
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

export interface HarvestPartyOptions {
  /** The stage beside the Production rows: big card, gauge bar, supports as a list. */
  side?: boolean;
}

export function createHarvestParty(
  content: Content,
  state: () => GameState,
  job: ProductionJob,
  opts: HarvestPartyOptions = {},
): HarvestParty {
  const side = Boolean(opts.side);
  const el = document.createElement('div');
  el.className = `pp-party pp-party--${job}${side ? ' pp-party--side' : ''}`;
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', COPY.production.partyLabel(COPY.production[job].title));

  // side stage: the main card with the supports fanned behind it (ui/loadoutFan.ts)
  const fan = side
    ? createLoadoutFan({
        want: SIDE_MAIN_WANT,
        max: () => SIDE_FAN_MAX,
        label: COPY.production.partyLabel(COPY.production[job].title),
        popLabel: COPY.production.showCard,
        emptyLabel: COPY.table.emptySlot,
      })
    : null;
  const mainWrap = fan ? fan.mainEl : document.createElement('div');
  mainWrap.classList.add('pp-slot', 'pp-slot--main');
  if (!fan) mainWrap.classList.add('ar-slot');
  // cards are always a whole number of device pixels per art pixel (DESIGN.md §12)
  if (!fan) fitCard(mainWrap, { want: MAIN_WANT });
  const gauge = document.createElement('div');
  gauge.className = 'ar-gauge pp-gauge';
  gauge.setAttribute('role', 'meter');
  gauge.setAttribute('aria-valuemin', '0');
  gauge.setAttribute('aria-valuemax', '100');
  const gaugeLabel = document.createElement('span');
  gaugeLabel.textContent = COPY.production.harvestBurst;
  const gaugeFill = document.createElement('i');
  const gaugeCount = document.createElement('b');
  if (side) {
    // a wide bar with its count beside it (the arena meter has its label under the bar)
    gauge.className = 'pp-gauge pp-gauge--side';
    const track = document.createElement('div');
    track.className = 'pp-gauge__track';
    track.append(gaugeFill);
    gaugeCount.className = 'bi-num';
    gauge.append(track, gaugeCount);
  } else {
    gauge.append(gaugeLabel, gaugeFill);
  }
  const supportRow = document.createElement(side ? 'ul' : 'div');
  supportRow.className = side ? 'pp-sups' : 'pp-supports';
  const supportWraps: HTMLElement[] = [];
  for (let i = 0; i < SUPPORTS; i++) {
    const w = document.createElement(side ? 'li' : 'div');
    if (side) {
      w.className = 'pp-sup';
    } else {
      w.className = 'ar-slot pp-slot pp-slot--support';
      fitCard(w, { want: SUPPORT_WANT });
    }
    supportWraps.push(w);
    supportRow.append(w);
  }
  const pattern = document.createElement('p');
  pattern.className = 'pp-pattern';
  if (fan) {
    const meta = document.createElement('div');
    meta.className = 'pp-meta';
    meta.append(gauge, pattern, supportRow);
    el.append(fan.el, meta);
  } else {
    el.append(mainWrap, supportRow);
  }

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
              {
                // the stage card is drawn large: a short label keeps the plate on one line
                label: side ? COPY.production.every : COPY.production.strikesEvery,
                value: `${Number(every.toFixed(2))}s`,
              },
            ]
          : [
              { label: 'Level', value: String(c.level) },
              // in the fan the effect is read in the pop-out and in the list, not on the plate
              side
                ? { label: COPY.production.supportRole, value: COPY.table.support }
                : { label: 'Bonus', value: c.abilityText },
            ],
      theme: c.look,
    };
  };

  /**
   * One support line of the side stage: a rarity swatch, its name and what it does. A click on it
   * pops the same card out of the fan.
   */
  function fillLine(wrap: HTMLElement, card: StageCard | undefined): void {
    wrap.replaceChildren();
    wrap.classList.toggle('pp-sup--empty', !card);
    wrap.classList.toggle('pp-sup--helps', Boolean(card?.helpsHarvest));
    wrap.removeAttribute('role');
    wrap.removeAttribute('tabindex');
    wrap.removeAttribute('data-lf-toggle');
    if (!card) {
      wrap.textContent = COPY.production.emptySupport;
      return;
    }
    wrap.dataset.lfToggle = '';
    wrap.setAttribute('role', 'button');
    wrap.tabIndex = 0;
    wrap.onclick = () => fan?.pop(fan.popped() === card.cardId ? null : card.cardId);
    wrap.onkeydown = (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      wrap.click();
    };
    const swatch = document.createElement('i');
    swatch.dataset.rarity = card.rarity;
    swatch.setAttribute('aria-hidden', 'true');
    const name = document.createElement('b');
    name.textContent = card.name;
    const text = document.createElement('span');
    text.textContent = card.abilityText;
    wrap.append(swatch, name, text);
    byCard.set(card.cardId, wrap);
  }

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

  /** "Steady · strikes every 1 s", then what a full gauge does. */
  function sidePattern(v: ProductionStageView): string {
    const every = Number((v.pattern.intervalSeconds / v.pattern.strikes).toFixed(2));
    const style = COPY.production.patterns[v.pattern.style];
    const burst = COPY.production.stageBurst(
      v.burst.size,
      `${Number(v.burst.power.toNumber().toFixed(1))} s`,
    );
    return `${COPY.production.stageStrikes(style, `${every} s`)} · ${burst}`;
  }

  function update(): ProductionStageView {
    const v = productionStageView(state(), content, job);
    last = v;
    const k = stageKey(v);
    if (k !== key) {
      key = k;
      byCard.clear();
      mainHas = Boolean(v.main);
      if (fan) {
        const card = (c: StageCard, role: 'main' | 'support'): FanCard => ({
          id: c.cardId,
          name: c.name,
          effect: c.abilityText,
          props: props(c, role, v),
          helps: c.helpsHarvest,
        });
        fan.setCards(
          v.main ? card(v.main, 'main') : null,
          v.supports.slice(0, SUPPORTS).map((c) => (c ? card(c, 'support') : undefined)),
        );
        v.supports.slice(0, SUPPORTS).forEach((c, i) => fillLine(supportWraps[i]!, c));
        pattern.textContent = sidePattern(v);
      } else {
        fill(mainWrap, v.main ?? undefined, 'main', v);
        v.supports.slice(0, SUPPORTS).forEach((c, i) => fill(supportWraps[i]!, c, 'support', v));
        mainWrap.append(gauge);
      }
    }
    const pct = gaugePercent(v.gauge);
    gaugeFill.style.width = `${pct}%`;
    gauge.classList.toggle('is-full', v.gauge > 0.92);
    gauge.setAttribute('aria-valuenow', String(pct));
    gauge.setAttribute('aria-label', `${COPY.production.harvestBurst}: ${pct}%`);
    if (side) gaugeCount.textContent = `${Math.round(v.gauge * v.burst.size)}/${v.burst.size}`;
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
      fan?.pulse(ids);
    },
    burst() {
      if (mainHas && !reducedMotion()) replay(mainWrap, 'is-bursting', 800);
    },
  };
}
