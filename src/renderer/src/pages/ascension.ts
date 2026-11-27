import {
  ascend,
  ascensionPreview,
  buyStarlightItem,
  collectModifiers,
  Decimal,
  starlightShop,
} from '../../../game';
import { fmt } from '../settings/numberFormat';
import { COPY } from '../copy';
import { animatedSpriteHtml, sprite } from '../art/pixel/sprites';
import { h } from '../shell/shell';
import { hide as hideTip } from '../shell/tooltip';
import { skinStyle, starlightSvg } from '../ui/skins';
import { keptIconMarkup } from '../ui/resourceIcons';
import { reducedMotion } from '../stage/motion';
import { toast } from '../stage/toast';
import { gateView, rewardView, starlightViews, type RewardView } from './ascensionModel';
import { createChallengesPanel } from './challengesPanel';
import type { PageContext } from './production';
import './ascension.css';

/**
 * The Ascension screen (DESIGN.md Ascension), opened from the hub's Shrine. Three panels under the
 * header: what this Ascension gives (Starlight, the permanent multiplier, the guaranteed prizes
 * and how much faster the next run is) with the button; what changes (what starts over, what
 * stays, the Ascension challenges); and the Starlight shop of unlocks. The rules and prices come
 * from game; this file only draws them.
 */

export interface AscensionContext extends PageContext {
  sound?: (id: string) => void;
}

type Mode = 'ready' | 'confirm' | 'walking' | 'done';

export function createAscensionPage(page: HTMLElement, ctx: AscensionContext): { render(): void } {
  const { content } = ctx;
  const t = COPY.ascension;
  let mode: Mode = 'ready';

  const table = h('div', 'asc');
  page.append(table);

  const column = (cls: string, title: string): { el: HTMLElement; body: HTMLElement } => {
    const el = h('section', `asc-col px-panel ${cls}`);
    el.dataset.deal = '';
    const head = h('h2', 'asc-head px-display', title);
    head.id = `asc-head-${cls}`;
    el.setAttribute('aria-labelledby', head.id);
    const body = h('div', 'asc-body');
    el.append(head, body);
    table.append(el);
    return { el, body };
  };

  // =====================================================================================
  // Column 1: what this Ascension gives
  // =====================================================================================
  const give = column('asc-col--give', t.previewHead);
  const nth = h('p', 'asc-nth px-display');

  // the ring with the Starlight coin, at 1x, beside the number
  const top = h('div', 'asc-top');
  const ringWrap = h('div', 'shop-ring');
  ringWrap.setAttribute('aria-hidden', 'true');
  const ringSprite = sprite('shop-ring');
  if (ringSprite) {
    ringWrap.classList.add('shop-spr');
    ringWrap.style.cssText = `--nw:${ringSprite.w};--nh:${ringSprite.h}`;
  }
  const ring = h('span', 'shop-ring__sprite');
  ring.innerHTML = animatedSpriteHtml('shop-ring', 1);
  const ringCoin = h('span', 'shop-ring__coin');
  let coinStyle = skinStyle('starlight');
  ringCoin.innerHTML = starlightSvg();
  ringWrap.append(ring, ringCoin);
  const gainBox = h('div', 'asc-gainbox');
  const gainValue = h('p', 'asc-gain px-display bi-num');
  const gainUnit = h('p', 'asc-unit', t.starlightUnit);
  gainBox.append(gainValue, gainUnit);
  top.append(ringWrap, gainBox);

  const parts = h('ul', 'asc-parts');
  const materialsLi = h('li');
  const progressLi = h('li');
  parts.append(materialsLi, progressLi);

  const multBox = h('div', 'asc-mult px-tile');
  const multHead = h('p', 'asc-label', t.multiplierHead);
  const multValue = h('p', 'asc-multvalue px-display bi-num');
  const multNote = h('p', 'asc-note');
  multBox.append(multHead, multValue, multNote);

  const fasterEl = h('p', 'asc-faster');

  const prizesHead = h('h3', 'asc-sub', t.prizesHead);
  const prizeList = h('ul', 'asc-list asc-list--prizes');
  const rewardsEl = h('p', 'asc-note');
  const lockedEl = h('p', 'asc-locked');
  const needs = h('p', 'asc-note');

  const ready = h('div', 'asc-actions');
  const ascendBtn = h('button', 'asc-go px-display');
  ascendBtn.type = 'button';
  ascendBtn.addEventListener('click', () => {
    if (ascendBtn.getAttribute('aria-disabled') === 'true') return;
    setMode('confirm');
  });
  ready.append(ascendBtn);

  const confirm = h('div', 'asc-actions');
  confirm.setAttribute('role', 'group');
  const confirmTitle = h('h3', 'asc-sub', t.confirmTitle);
  confirmTitle.id = 'asc-confirm-title';
  confirm.setAttribute('aria-labelledby', confirmTitle.id);
  const confirmBody = h('p', 'asc-note');
  const goBtn = h('button', 'asc-go px-display', t.confirm);
  goBtn.type = 'button';
  const cancelBtn = h('button', 'px-btn', t.cancel);
  cancelBtn.type = 'button';
  confirm.append(confirmTitle, confirmBody, goBtn, cancelBtn);
  goBtn.addEventListener('click', walkThrough);
  cancelBtn.addEventListener('click', () => setMode('ready', true));
  confirm.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setMode('ready', true);
    }
  });

  const done = h('div', 'asc-actions');
  done.setAttribute('aria-live', 'polite');
  const doneTitle = h('h3', 'asc-sub');
  const doneGain = h('p', 'asc-gain px-display bi-num');
  const doneLabel = h('p', 'asc-note', t.doneGainLabel);
  const doneRewardsHead = h('h3', 'asc-sub', t.doneRewards);
  const doneRewards = h('ul', 'asc-list');
  const nextBtn = h('button', 'asc-go px-display', t.doneNext);
  nextBtn.type = 'button';
  nextBtn.addEventListener('click', () => setMode('ready', true));
  done.append(doneTitle, doneGain, doneLabel, doneRewardsHead, doneRewards, nextBtn);

  give.body.append(
    nth,
    top,
    parts,
    multBox,
    fasterEl,
    prizesHead,
    prizeList,
    rewardsEl,
    lockedEl,
    needs,
    ready,
    confirm,
    done,
  );

  // =====================================================================================
  // Column 2: what changes
  // =====================================================================================
  const changes = column('asc-col--changes', t.changesHead);
  const keptList = h('ul', 'asc-list asc-list--kept');
  const resetLine = h('p', 'asc-reset');
  const keptTile = h('section', 'asc-keep px-tile');
  keptTile.append(h('h3', 'asc-sub', t.kept), keptList);
  const lists = h('div', 'asc-lists');
  lists.append(resetLine, keptTile);
  const upgradesNote = h('p', 'asc-note', t.upgradesNote);
  const challenges = createChallengesPanel(ctx, content, () => {
    mode = 'ready';
    render();
  });
  changes.body.append(lists, upgradesNote, challenges.el);

  // =====================================================================================
  // Column 3: the Starlight shop of unlocks
  // =====================================================================================
  const shop = column('asc-col--shop', t.shopHead);
  const have = h('p', 'asc-have');
  const haveValue = h('b', 'bi-num px-display');
  have.append(haveValue, document.createTextNode(` ${t.starlightUnit}`));
  const shopNote = h('p', 'asc-note', t.shopNote);
  const offers = h('ul', 'asc-list asc-shop');
  shop.body.append(have, shopNote, offers);

  type OfferUi = {
    li: HTMLElement;
    level: HTMLElement;
    effect: HTMLElement;
    fill: HTMLElement;
    price: HTMLButtonElement;
    priceText: HTMLElement;
  };
  const offerUis = new Map<string, OfferUi>();
  for (const item of content.prestige.shop) {
    const li = h('li', 'asc-it');
    li.dataset.item = item.id;
    const name = h('b', 'asc-it__name', item.name);
    const level = h('span', 'asc-it__level bi-num');
    const desc = h('span', 'asc-it__desc', item.description);
    const effect = h('span', 'asc-it__effect');
    const track = h('i', 'asc-lv');
    track.setAttribute('aria-hidden', 'true');
    const fill = h('u');
    track.append(fill);
    const price = h('button', 'px-btn asc-price bi-num');
    price.type = 'button';
    const ico = h('span', 'asc-price__ico');
    ico.setAttribute('aria-hidden', 'true');
    ico.innerHTML = keptIconMarkup('starlight') ?? '';
    const priceText = h('span', 'asc-price__txt');
    price.append(ico, priceText);
    price.addEventListener('click', () => {
      if (price.getAttribute('aria-disabled') === 'true') return;
      buy(item.id);
    });
    li.append(name, level, desc, effect, track, price);
    offers.append(li);
    offerUis.set(item.id, { li, level, effect, fill, price, priceText });
  }

  function buy(id: string): void {
    const result = buyStarlightItem(ctx.state(), content, id);
    if (!result.ok) return;
    hideTip();
    ctx.apply(result.state);
    ctx.sound?.('buy');
  }

  // =====================================================================================
  // Modes
  // =====================================================================================
  function setMode(next: Mode, focus = false): void {
    mode = next;
    table.dataset.mode = next;
    ready.hidden = next !== 'ready' && next !== 'walking';
    confirm.hidden = next !== 'confirm';
    done.hidden = next !== 'done';
    render();
    if (next === 'confirm') goBtn.focus({ preventScroll: true });
    else if (focus && next === 'ready') ascendBtn.focus({ preventScroll: true });
    else if (focus && next === 'done') nextBtn.focus({ preventScroll: true });
  }

  const rewardLi = (r: RewardView): HTMLElement => {
    const li = h('li', '', r.text);
    li.dataset.rarity = String(r.rarity);
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
    mode = reducedMotion() ? 'done' : 'walking';
    ctx.apply(result.state);
    const gainText = fmt(result.gained);
    const rewards = result.cosmetics.map((id) => rewardView(content, id));
    doneTitle.textContent = t.doneTitle(result.state.prestigeCount);
    doneGain.textContent = t.doneGain(gainText);
    doneRewards.replaceChildren(...rewards.map(rewardLi));
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
    table.classList.add('is-walking');
    window.setTimeout(() => {
      sweep();
      window.setTimeout(() => {
        table.classList.remove('is-walking');
        setMode('done', true);
      }, 700);
    }, 650);
  }

  // =====================================================================================
  // Render
  // =====================================================================================
  let keptKey = '';
  let prizeKey = '';
  function render(): void {
    const s = ctx.state();
    const mods = collectModifiers(s, content);
    const worn = skinStyle('starlight');
    if (worn !== coinStyle) {
      coinStyle = worn;
      ringCoin.innerHTML = starlightSvg();
    }
    challenges.render();

    if (mode !== 'walking') {
      const view = gateView(ascensionPreview(s, content, mods), s, content);
      table.dataset.ready = String(view.canAscend);
      set(nth, view.nth);
      if (mode === 'ready' || mode === 'confirm') {
        set(gainValue, view.gain);
        set(materialsLi, view.materialsLine);
        set(progressLi, view.progressLine);
        set(multValue, `x${view.multiplierNow} → x${view.multiplierAfter}`);
        set(multNote, t.multiplierLine(view.multiplierNow, view.multiplierAfter));
        set(fasterEl, view.fasterLine);
        const pk = view.prizes.map((p) => p.id).join(',');
        if (pk !== prizeKey) {
          prizeKey = pk;
          prizeList.replaceChildren(...view.prizes.map((p) => h('li', '', p.text)));
        }
        const extra = view.rewards.map((r) => r.text).join('; ');
        set(rewardsEl, extra ? `${t.rewardsLabel}: ${extra}` : '');
        rewardsEl.hidden = extra === '';
        set(lockedEl, view.lockedText);
        lockedEl.hidden = view.lockedText === '';
        set(needs, view.canAscend || view.lockedText ? '' : view.needs);
        needs.hidden = needs.textContent === '';
        set(
          ascendBtn,
          view.canAscend
            ? t.ascendHero(view.multiplierNow, view.multiplierAfter, view.gain)
            : view.button,
        );
        ascendBtn.setAttribute('aria-disabled', String(!view.canAscend));
        ascendBtn.classList.toggle('is-no', !view.canAscend);
        set(confirmBody, t.confirmBody(view.gain));
        if (mode === 'confirm' && !view.canAscend) setMode('ready');
      }
      const kk = view.kept.map((k) => k.id).join(',');
      if (kk !== keptKey) {
        keptKey = kk;
        keptList.replaceChildren(
          ...view.kept.map((k) => {
            const li = h('li', '', k.label);
            li.title = k.detail;
            return li;
          }),
        );
      }
      set(resetLine, t.resetsLine(view.resets.map((r) => r.label.toLowerCase()).join(', ')));
    }

    // ---- the Starlight shop ----
    set(haveValue, fmt(s.resources[content.prestige.currency] ?? new Decimal(0)));
    for (const v of starlightViews(starlightShop(s, content, mods), s, content)) {
      const ui = offerUis.get(v.id);
      if (!ui) continue;
      set(ui.effect, v.buy.preview);
      ui.effect.classList.toggle('is-off', v.buy.preview === COPY.ascension.notUnlocked);
      set(ui.level, v.levelText);
      ui.fill.style.width = `${((v.level / Math.max(1, v.maxLevel)) * 100).toFixed(1)}%`;
      ui.li.classList.toggle('is-maxed', v.maxed);
      const affordable = !v.maxed && v.buy.offer.affordable;
      ui.price.setAttribute('aria-disabled', String(!affordable));
      ui.price.classList.toggle('is-no', !affordable);
      ui.price.classList.toggle('no-ico', v.maxed);
      set(ui.priceText, v.maxed ? t.maxed : fmt(v.buy.offer.price.amount));
      ui.price.setAttribute(
        'aria-label',
        v.maxed
          ? `${v.name}: ${t.maxed}`
          : `${v.name}: ${v.buy.label}, ${v.buy.price}. ${v.buy.preview}`,
      );
    }
  }

  setMode('ready');
  return { render };
}

/** The prismatic sweep across the window when walking through the gate. */
function sweep(): void {
  const el = h('div', 'shop-sweep');
  el.setAttribute('aria-hidden', 'true');
  document.body.append(el);
  window.setTimeout(() => el.remove(), 1300);
}

function set(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}
