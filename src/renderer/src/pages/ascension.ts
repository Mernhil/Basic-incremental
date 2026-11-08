import {
  ascend,
  ascensionPreview,
  buyStarlightItem,
  collectModifiers,
  starlightShop,
  type GameState,
} from '../../../game';
import { fmt } from '../settings/numberFormat';
import { COPY } from '../copy';
import {
  EDGE_VIEWBOX,
  MEDAL_VIEWBOX,
  PLAQUE_VIEWBOX,
  forgedEdge,
  gemCoin,
  masteryMedal,
  navPlaque,
  svg,
} from '../art/gems';
import { ITEM_VIEWBOX } from '../art/items';
import { frame, h } from '../shell/shell';
import { skinStyle, starlightSvg } from '../ui/skins';
import { attachTooltip, hide as hideTip } from '../shell/tooltip';
import { reducedMotion } from '../stage/motion';
import { toast } from '../stage/toast';
import { createBuyButton, type BuyButton } from '../ui/buy';
import {
  gateView,
  rewardView,
  starlightViews,
  type GateView,
  type KeptArt,
  type RewardView,
} from './ascensionModel';
import { cardItemArt } from './loadoutCards';
import type { PageContext } from './production';
import './ascension.css';

/**
 * Ascension (DESIGN.md §9, §11 "portal gate", A9 E). Lives on the Shop page: DESIGN §11 has no
 * Ascension slot in the sidebar and the shard shop moves to Achievements (DESIGN §11), so the Shop
 * page holds the gate and the Starlight shop (DESIGN §11).
 *
 * A large prismatic gate; what an ascension keeps floats around it and drifts into it; what starts
 * over is listed on the left; the Starlight gain sits on the right in big type. Ascend opens an
 * in-page confirm; confirming walks through: the kept things fly into the gate and a prismatic
 * sweep crosses the screen (reduced motion: no flight, no sweep), then the new cosmetics show.
 */

export interface AscensionContext extends PageContext {
  sound?: (id: string) => void;
}

/** Where the kept tokens sit around the gate, in % of the stage: two arcs, left then right. */
const SPOTS: ReadonlyArray<readonly [number, number]> = [
  [18, 20],
  [10, 40],
  [10, 61],
  [18, 81],
  [82, 20],
  [90, 40],
  [90, 61],
  [82, 81],
];

type Mode = 'ready' | 'confirm' | 'walking' | 'done';

export function createAscensionPage(page: HTMLElement, ctx: AscensionContext): { render(): void } {
  const { content } = ctx;
  const t = COPY.ascension;
  let mode: Mode = 'ready';

  // ---- the gate ----
  const gate = h('section', 'as-gate');
  gate.setAttribute('aria-labelledby', 'as-gate-title');
  const title = h('h2', 'as-gate__title', t.gate);
  title.id = 'as-gate-title';

  // what starts over (left)
  const resets = h('div', 'as-resets');
  const resetsHead = h('h3', 'as-col__head', t.resets);
  const resetList = h('ul', 'as-resets__list');
  resets.append(resetsHead, resetList, h('p', 'as-hint as-resets__note', t.upgradesNote));

  // the gate and the kept tokens (centre)
  const stage = h('div', 'as-stage');
  const trails = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  trails.setAttribute('class', 'as-trails');
  trails.setAttribute('viewBox', '0 0 100 100');
  trails.setAttribute('preserveAspectRatio', 'none');
  trails.setAttribute('aria-hidden', 'true');
  const portal = h('div', 'as-portal');
  portal.setAttribute('aria-hidden', 'true');
  portal.append(
    h('i', 'as-portal__rim'),
    h('i', 'as-portal__void'),
    h('i', 'as-portal__swirl'),
    h('i', 'as-portal__glow'),
  );
  const keptHead = h('h3', 'as-col__head as-stage__head', t.kept);
  keptHead.id = 'as-kept-head';
  const keptList = h('ul', 'as-kept');
  keptList.setAttribute('aria-labelledby', keptHead.id);
  stage.append(trails, portal, keptList, keptHead);

  // the gain, confirm and result (right)
  const side = h('div', 'as-side');
  side.setAttribute('aria-live', 'polite');

  gate.append(title, resets, stage, side);

  // ---- the Starlight shop ----
  const shop = frame(t.shop, t.shopNote);
  shop.el.classList.add('as-shop');
  const offers = h('ul', 'as-offers');
  shop.body.append(offers);

  page.append(gate, shop.el);

  // ---- kept tokens ----
  type TokenUi = { li: HTMLElement; art: HTMLElement; key: string; detail: string };
  const tokens = new Map<string, TokenUi>();
  const artMarkup = (a: KeptArt, s: GameState): string => {
    switch (a.kind) {
      case 'edge': {
        const gem = content.resourceById.get(a.gem)?.gem;
        return gem ? svg(forgedEdge(gem, a.step), EDGE_VIEWBOX) : '';
      }
      case 'card':
        return svg(cardItemArt(content, a.cardId, s.cards.owned[a.cardId]), ITEM_VIEWBOX);
      case 'coin': {
        const gem = content.resourceById.get(a.gem)?.gem;
        return gem ? svg(gemCoin(gem, a.tier)) : '';
      }
      case 'medal':
        return svg(masteryMedal(a.tier), MEDAL_VIEWBOX);
      case 'plaque':
        return svg(navPlaque(a.glyph), PLAQUE_VIEWBOX);
      case 'starlight':
        return starlightSvg();
    }
  };

  function syncTokens(view: GateView, s: GameState): void {
    view.kept.forEach((k, i) => {
      let ui = tokens.get(k.id);
      if (!ui) {
        const li = h('li', 'as-token');
        li.dataset.kept = k.id;
        li.tabIndex = 0;
        const [x, y] = SPOTS[i % SPOTS.length] ?? [50, 50];
        li.style.setProperty('--x', `${x.toFixed(1)}%`);
        li.style.setProperty('--y', `${y.toFixed(1)}%`);
        li.style.setProperty('--i', String(i));
        const art = h('span', 'as-token__art');
        art.dataset.art = k.art.kind;
        li.append(art, h('span', 'as-token__label', k.label));
        const created: TokenUi = { li, art, key: '', detail: k.detail };
        attachTooltip(li, () => {
          const box = h('div', 'as-tip');
          box.append(h('strong', '', k.label), h('span', '', created.detail));
          return box;
        });
        keptList.append(li);
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('x1', x.toFixed(1));
        line.setAttribute('y1', y.toFixed(1));
        line.setAttribute('x2', '50');
        line.setAttribute('y2', '50');
        line.setAttribute('class', 'as-trail');
        line.style.setProperty('--i', String(i));
        trails.append(line);
        ui = created;
        tokens.set(k.id, ui);
      }
      ui.detail = k.detail;
      ui.li.setAttribute('aria-label', `${k.label}: ${k.detail}`);
      const key = `${JSON.stringify(k.art)}|${skinStyle('starlight')}`;
      if (ui.key !== key) {
        ui.key = key;
        ui.art.innerHTML = artMarkup(k.art, s);
      }
    });
  }

  // ---- side panel ----
  const ready = h('div', 'as-panel as-panel--ready');
  const gainLabel = h('p', 'as-gain__label', t.gainLabel);
  const gainValue = h('p', 'as-gain bi-num');
  const meter = h('div', 'as-meter');
  const meterFill = h('i');
  meter.append(meterFill);
  meter.setAttribute('aria-hidden', 'true');
  const needs = h('p', 'as-needs bi-num');
  const hint = h('p', 'as-hint', t.gainHint);
  const nth = h('p', 'as-nth');
  const rewardsBox = h('div', 'as-rewards');
  const ascendBtn = h('button', 'as-ascend');
  ascendBtn.type = 'button';
  ascendBtn.addEventListener('click', () => {
    if (ascendBtn.getAttribute('aria-disabled') === 'true') return;
    setMode('confirm');
  });
  ready.append(gainLabel, gainValue, meter, needs, hint, nth, rewardsBox, ascendBtn);

  const confirm = h('div', 'as-panel as-panel--confirm');
  confirm.setAttribute('role', 'group');
  const confirmTitle = h('h3', 'as-confirm__title', t.confirmTitle);
  confirmTitle.id = 'as-confirm-title';
  confirm.setAttribute('aria-labelledby', confirmTitle.id);
  const confirmBody = h('p', 'as-confirm__body');
  const confirmBtns = h('div', 'as-confirm__buttons');
  const goBtn = h('button', 'as-ascend', t.confirm);
  goBtn.type = 'button';
  const cancelBtn = h('button', 'button as-cancel', t.cancel);
  cancelBtn.type = 'button';
  confirmBtns.append(goBtn, cancelBtn);
  confirm.append(confirmTitle, confirmBody, confirmBtns);
  goBtn.addEventListener('click', walkThrough);
  cancelBtn.addEventListener('click', () => setMode('ready', true));
  confirm.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setMode('ready', true);
    }
  });

  const done = h('div', 'as-panel as-panel--done');
  const doneTitle = h('h3', 'as-done__title');
  const doneGain = h('p', 'as-gain as-gain--done bi-num');
  const doneRewardsHead = h('p', 'as-gain__label', t.doneRewards);
  const doneRewards = h('ul', 'as-done__rewards');
  const nextBtn = h('button', 'button as-next', t.doneNext);
  nextBtn.type = 'button';
  nextBtn.addEventListener('click', () => setMode('ready', true));
  done.append(
    doneTitle,
    doneGain,
    h('p', 'as-gain__label', t.doneGainLabel),
    doneRewardsHead,
    doneRewards,
    nextBtn,
  );

  side.append(ready, confirm, done);

  function setMode(next: Mode, focus = false): void {
    mode = next;
    gate.dataset.mode = next;
    ready.hidden = next !== 'ready';
    confirm.hidden = next !== 'confirm';
    done.hidden = next !== 'done';
    render();
    if (next === 'confirm') goBtn.focus();
    else if (focus && next === 'ready') ascendBtn.focus();
    else if (focus && next === 'done') nextBtn.focus();
  }

  const rewardItem = (r: RewardView): HTMLElement => {
    const li = h('li', 'as-reward');
    li.dataset.rarity = String(r.rarity);
    li.append(h('i', 'as-reward__gem'), h('span', '', r.text));
    return li;
  };

  function walkThrough(): void {
    if (mode !== 'confirm') return;
    const result = ascend(ctx.state(), content);
    if (!result.ok) {
      setMode('ready', true);
      return;
    }
    hideTip();
    // the gate keeps its pre-ascension look while the walk plays (render skips 'walking')
    mode = reducedMotion() ? 'done' : 'walking';
    ctx.apply(result.state);
    const ascension = result.state.prestigeCount;
    const gainText = fmt(result.gained);
    const rewards = result.cosmetics.map((id) => rewardView(content, id));
    doneTitle.textContent = t.doneTitle(ascension);
    doneGain.textContent = t.doneGain(gainText);
    doneRewards.replaceChildren(...rewards.map(rewardItem));
    doneRewardsHead.hidden = rewards.length === 0;
    doneRewards.hidden = rewards.length === 0;
    ctx.sound?.('ascend');
    toast(
      t.toast,
      t.toastDetail(
        gainText,
        rewards.map((r) => r.name),
      ),
      'milestone',
      'prismatic',
    );

    if (reducedMotion()) {
      setMode('done', true);
      return;
    }
    setMode('walking');
    window.setTimeout(() => {
      sweep();
      window.setTimeout(() => setMode('done', true), 700);
    }, 650);
  }

  // ---- shop ----
  type OfferUi = { btn: BuyButton; level: HTMLElement; fill: HTMLElement; li: HTMLElement };
  const offerUis = new Map<string, OfferUi>();
  for (const item of content.prestige.shop) {
    const li = h('li', 'as-offer');
    li.dataset.item = item.id;
    const head = h('div', 'as-offer__head');
    const level = h('span', 'as-offer__level bi-num');
    head.append(h('h3', 'as-offer__name', item.name), level);
    const track = h('div', 'as-offer__track');
    const fill = h('i');
    track.append(fill);
    track.setAttribute('aria-hidden', 'true');
    const btn = createBuyButton(() => buyItem(item.id), true);
    li.append(head, h('p', 'as-offer__desc', item.description), track, btn.el);
    offers.append(li);
    offerUis.set(item.id, { btn, level, fill, li });
  }

  function buyItem(id: string): void {
    const result = buyStarlightItem(ctx.state(), content, id);
    if (!result.ok) return;
    ctx.apply(result.state);
    ctx.sound?.('buy');
    offerUis.get(id)?.btn.celebrate();
  }

  // ---- render ----
  function render(): void {
    const s = ctx.state();
    const mods = collectModifiers(s, content);
    if (mode !== 'walking') {
      const view = gateView(ascensionPreview(s, content, mods), s, content);
      gate.dataset.ready = String(view.canAscend);
      syncTokens(view, s);
      syncResets(view);
      if (mode === 'ready' || mode === 'confirm') {
        set(gainValue, view.gain);
        meterFill.style.width = `${(view.progress * 100).toFixed(1)}%`;
        meter.hidden = view.canAscend;
        set(needs, view.needs);
        needs.hidden = view.canAscend;
        set(nth, view.nth);
        const key = view.rewards.map((r) => r.id).join(',');
        if (rewardsBox.dataset.key !== key) {
          rewardsBox.dataset.key = key;
          const list = h('ul', 'as-rewards__list');
          list.append(...view.rewards.map(rewardItem));
          rewardsBox.replaceChildren(h('p', 'as-gain__label', t.rewardsLabel), list);
          rewardsBox.hidden = view.rewards.length === 0;
        }
        set(ascendBtn, view.button);
        ascendBtn.setAttribute('aria-disabled', String(!view.canAscend));
        set(confirmBody, t.confirmBody(view.gain));
        if (mode === 'confirm' && !view.canAscend) setMode('ready');
      }
    }
    for (const v of starlightViews(starlightShop(s, content, mods), s, content)) {
      const ui = offerUis.get(v.id);
      if (!ui) continue;
      set(ui.level, v.levelText);
      ui.fill.style.width = `${((v.level / Math.max(1, v.maxLevel)) * 100).toFixed(1)}%`;
      ui.li.classList.toggle('is-maxed', v.maxed);
      ui.btn.update(v.buy);
      ui.btn.el.setAttribute(
        'aria-label',
        `${v.name}: ${v.buy.label}, ${v.buy.price}. ${v.buy.preview}`,
      );
    }
  }

  let resetKey = '';
  function syncResets(view: GateView): void {
    const key = view.resets.map((r) => r.id).join(',');
    if (key === resetKey) return;
    resetKey = key;
    resetList.replaceChildren(
      ...view.resets.map((r) => {
        const li = h('li', 'as-reset');
        li.append(h('span', 'as-reset__name', r.label), h('span', 'as-reset__detail', r.detail));
        return li;
      }),
    );
  }

  setMode('ready');
  return { render };
}

/** The prismatic sweep across the window when walking through the gate. */
function sweep(): void {
  const el = h('div', 'as-sweep');
  el.setAttribute('aria-hidden', 'true');
  document.body.append(el);
  window.setTimeout(() => el.remove(), 1300);
}

function set(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}
