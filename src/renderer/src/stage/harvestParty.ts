import type { Content } from '../../../data';
import {
  cardInfo,
  productionStageView,
  type GameState,
  type ProductionJob,
  type ProductionStageView,
  type StageCard,
} from '../../../game';
import { cardFaceOf, secondsText } from '../pages/cardFaceModel';
import { cardItemArt } from '../pages/loadoutCards';
import {
  burstCountText,
  gaugePercent,
  stageKey,
  supportChips,
  type StrikeLook,
} from '../pages/productionStageModel';
import { COPY } from '../copy';
import type { CardProps } from '../ui/card';
import { createLoadoutFan, type FanCard } from '../ui/loadoutFan';
import { reducedMotion, replay } from './motion';
import './harvestParty.css';

/**
 * The cards of one Production band (DESIGN.md §4, §11): the job's main card at 1x in its loadout
 * fan with the supports peeking out behind it, the harvest gauge under the fan, and two small
 * pieces the page places elsewhere in the band: the supports as one line of chips and the burst
 * count. The cards use the cosmetics of the fighting cards (`look`). The page tells it when to
 * lunge and which supports to pulse; it owns only this DOM.
 */

const SUPPORTS = 3;
/** The main card at 1x (132 CSS px wide at a 100 % screen); the screen scale keeps it whole. */
const MAIN_WANT = 132;
/** Most CSS px the whole fan (main card plus the peeks) may take. */
const FAN_MAX = 214;
const STRIKE_CLASSES = [
  'is-strike-steady',
  'is-strike-chop',
  'is-strike-flurry',
  'is-strike-volley',
];

export interface HarvestParty {
  /** The fan with its harvest gauge under it. */
  el: HTMLElement;
  /** The supports as one line of chips. */
  supportsEl: HTMLElement;
  /** The "Burst 21 / 30" chip. */
  burstEl: HTMLElement;
  /** Re-reads the stage view, redraws changed cards and the gauge. Returns the view. */
  update(): ProductionStageView;
  /** The last view `update` read. */
  view(): ProductionStageView;
  /** The main card's slot (null when there is no main card), for aiming strikes. */
  mainSlot(): HTMLElement | null;
  /** Lunges the main card by (dx, dy) px with a strike look (a slide only). */
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
  const label = COPY.production.partyLabel(COPY.production[job].title);
  const el = document.createElement('div');
  el.className = `pp-party pp-party--${job}`;

  const fan = createLoadoutFan({
    want: MAIN_WANT,
    max: () => FAN_MAX,
    label,
    popLabel: COPY.production.showCard,
    emptyLabel: COPY.table.emptySlot,
  });
  const mainWrap = fan.mainEl;
  mainWrap.classList.add('pp-slot', 'pp-slot--main');

  // the harvest gauge: a segmented bar under the fan, the same meter as Brave Burst in the arena
  const gauge = document.createElement('div');
  gauge.className = 'pp-gauge';
  gauge.setAttribute('role', 'meter');
  gauge.setAttribute('aria-valuemin', '0');
  gauge.setAttribute('aria-valuemax', '100');
  const gaugeFill = document.createElement('i');
  gauge.append(gaugeFill);
  el.append(fan.el, gauge);

  const burstEl = document.createElement('span');
  burstEl.className = 'pp-burst bi-num';
  const supportsEl = document.createElement('ul');
  supportsEl.className = 'pp-chips';
  supportsEl.setAttribute('aria-label', COPY.production.supportsLabel);

  let key = '';
  let last: ProductionStageView = productionStageView(state(), content, job);
  const byCard = new Map<string, HTMLElement>();
  let mainHas = false;

  const props = (c: StageCard, role: 'main' | 'support', v: ProductionStageView): CardProps => {
    const owned = state().cards.owned[c.cardId];
    const info = cardInfo(state(), content, c.cardId);
    const face = info ? cardFaceOf(content, info) : undefined;
    // the leading card shows the live strike rhythm (upgrades and supports included)
    const every = v.pattern.intervalSeconds / v.pattern.strikes;
    if (face && role === 'main') face.speed = COPY.card.hitsEvery(secondsText(every));
    return {
      name: c.name,
      label: role === 'main' ? COPY.table.main : COPY.table.support,
      job,
      emblem: role === 'main' ? 'blade' : 'gem',
      ...(owned ? { item: cardItemArt(content, c.cardId, owned, state()) } : {}),
      element: c.element,
      rank: c.rank,
      ...(info ? { rarity: info.card.rarity } : {}),
      ...(face ? { face } : {}),
      theme: c.look,
    };
  };

  /** The chips line: a rarity swatch, the name and what it does; a click pops the card out. */
  function drawChips(v: ProductionStageView): void {
    byCard.clear();
    supportsEl.replaceChildren(
      ...supportChips(v).map((c) => {
        const li = document.createElement('li');
        li.className = 'pp-chip';
        li.classList.toggle('pp-chip--empty', !c);
        li.classList.toggle('pp-chip--helps', Boolean(c?.helps));
        const swatch = document.createElement('i');
        swatch.setAttribute('aria-hidden', 'true');
        if (!c) {
          li.append(swatch, COPY.production.emptySupport);
          return li;
        }
        swatch.dataset['rarity'] = c.rarity;
        const name = document.createElement('b');
        name.textContent = c.name;
        const effect = document.createElement('span');
        effect.textContent = c.effect;
        li.append(swatch, name, effect);
        li.dataset['lfToggle'] = '';
        li.setAttribute('role', 'button');
        li.tabIndex = 0;
        li.onclick = () => fan.pop(fan.popped() === c.id ? null : c.id);
        li.onkeydown = (e) => {
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          li.click();
        };
        byCard.set(c.id, li);
        return li;
      }),
    );
  }

  function update(): ProductionStageView {
    const v = productionStageView(state(), content, job);
    last = v;
    const k = stageKey(v) + JSON.stringify(state().weaponSkins);
    if (k !== key) {
      key = k;
      mainHas = Boolean(v.main);
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
      drawChips(v);
    }
    const pct = gaugePercent(v.gauge);
    gaugeFill.style.width = `${pct}%`;
    gauge.classList.toggle('is-full', v.gauge > 0.92);
    gauge.setAttribute('aria-valuenow', String(pct));
    gauge.setAttribute('aria-label', `${COPY.production.harvestBurst}: ${pct}%`);
    const text = burstCountText(v);
    if (burstEl.textContent !== text) burstEl.textContent = text;
    gauge.hidden = !mainHas;
    return v;
  }
  update();

  return {
    el,
    supportsEl,
    burstEl,
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
      fan.pulse(ids);
    },
    burst() {
      if (mainHas && !reducedMotion()) replay(mainWrap, 'is-bursting', 800);
    },
  };
}
