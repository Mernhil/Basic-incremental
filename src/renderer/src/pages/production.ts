import type { Content } from '../../../data';
import {
  PRODUCTION_JOBS,
  assignWorker,
  collectModifiers,
  defaultRng,
  productionStageView,
  workerChoices,
  buyMineLevels,
  buyTreeLevels,
  unlockTree,
  type Decimal,
  type GameState,
  type Modifier,
  type Producer,
  type ProductionJob,
  type ProductionStageView,
  type StageTarget,
  type TierUp,
  producersOf,
} from '../../../game';
import { COPY } from '../copy';
import { mineTile, svg, treeTile } from '../art/gems';
import { h } from '../shell/shell';
import { hide as hideTip } from '../shell/tooltip';
import type { CoinTarget } from '../stage/arena';
import { createWorkerCell, type WorkerCell } from '../stage/harvestParty';
import { playHit } from '../theme/effects';
import { flash, reducedMotion, shake, slowDown } from '../stage/motion';
import {
  harvestMoments,
  pickOptions,
  strikeLook,
  strikeNumberKind,
  workerKey,
  type BurstMoment,
  type StrikeMoment,
} from './productionStageModel';
import type { Director } from '../stage/director';
import { centreOf, flyCoins } from '../stage/fly';
import { createThrottle, popText } from '../stage/math';
import { replay } from '../stage/motion';
import { popGain, popNumber } from '../stage/numbers';
import { buyCount, createBuyButton, createBuyToggle, onBuyCount, type BuyButton } from '../ui/buy';
import { fmt } from '../settings/numberFormat';
import { createShelf, type Shelf } from '../ui/shelf';
import { createForgePanel } from '../ui/forge';
import { createToolLinesPanel, type ToolLinesPanel } from '../ui/toolLines';
import { amountText } from '../settings/coins';
import {
  jobRateValue,
  productionRows,
  shelfSummary,
  type MilestoneSegments,
  type ProductionRow,
} from './productionModel';
import { shelfChips } from './shelfModel';
import { createPresetsPanel, type Panel } from './tablePanels';
import './production.css';

/**
 * Production page (DESIGN.md §4, §11), the pixel ledger: two stacked bands, Logging and Mining,
 * each a pixel frame: the title and the worker slots in use, the column headers, then one row per
 * tree kind or mine type: its worker (the card working it and its harvest gauge; a click opens the
 * worker picker under the row, DESIGN.md §4 Workers), tile, name and level, output, a segmented
 * bar to the next ×2, the next-buy wait and the buy button. A locked kind is a greyed row with its
 * unlock. The ×1 / ×10 / ×100 / Max toggle lives in the goals strip (`setBuySlot`). The upgrade
 * shelf is a drawer over the bottom: one line when closed. Every strike nudges the worker toward
 * its tile and pops "+n" on that row; a harvest burst runs a wave over the places that burst.
 */

export interface PageContext {
  content: Content;
  state: () => GameState;
  /** Applies a new state produced by a pure game function. */
  apply: (state: GameState) => void;
}

export interface ProductionContext extends PageContext {
  director?: Director;
  coins?: CoinTarget;
  visible?: () => boolean;
  sound?: (id: string) => void;
  /** Plays tier-up moments (milestones, tile stages). */
  onTierUps?: (list: TierUp[]) => void;
  /** Puts the ×1 / ×10 / ×100 / Max toggle at the right end of the goals strip. */
  setBuySlot?: (el: HTMLElement) => void;
}

/** Coins flown to the header per resource per second at most. */
const COINS_PER_SECOND = 3;
const DRAWER_KEY = 'bi.productionDrawer';

/** What one row keeps so a refresh only touches text and state, not the DOM tree. */
interface RowRef {
  row: ProductionRow;
  li: HTMLElement;
  worker: WorkerCell;
  workerKey: string;
  tile: HTMLElement;
  art: HTMLElement;
  level: HTMLElement;
  value: HTMLElement;
  unit: HTMLElement;
  pips: HTMLElement[];
  track: HTMLElement;
  x2: HTMLElement;
  next: HTMLElement;
  nextText: HTMLElement;
  nextSub: HTMLElement;
  lucky: HTMLElement;
  depthName: HTMLElement;
  depthFill: HTMLElement;
  depthText: HTMLElement;
  buy?: BuyButton;
  unlock?: { btn: HTMLButtonElement; label: HTMLElement; price: HTMLElement; have: HTMLElement };
}

interface BandRef {
  el: HTMLElement;
  rate: HTMLElement;
  slots: HTMLElement;
  list: HTMLElement;
  flash: HTMLElement;
  /** The last stage view: each place's worker, pattern and gauge. */
  view: ProductionStageView;
}

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* not remembered */
  }
}

const set = (node: HTMLElement, text: string): void => {
  if (node.textContent !== text) node.textContent = text;
};

export function createProductionPage(
  page: HTMLElement,
  ctx: ProductionContext,
): { render(): void } {
  const { content } = ctx;
  const visible = (): boolean => ctx.visible?.() ?? true;
  const coinThrottle = createThrottle(COINS_PER_SECOND, 1000);

  const tileArt = (job: ProductionJob, p: Producer, stage: number): string => {
    const gem = content.resourceById.get(p.resource)?.gem;
    if (!gem) return '';
    const tree = job === 'logging' ? content.treeById.get(p.id) : undefined;
    return svg(tree ? treeTile(tree, gem, stage) : mineTile(gem, stage));
  };

  // ---- skeleton: the two bands in a scrolling column with the shelf drawer over its bottom ----
  page.classList.add('shell-page--stage', 'pp-page');
  const screen = h('div', 'pp-screen');
  const scroll = h('div', 'pp-scroll');
  // the page name stays for screen readers; the bands carry the sighted headings
  page.querySelector<HTMLElement>('.shell-page__title')?.classList.add('sr-only');
  const bandsEl = h('div', 'pp-bands');
  scroll.append(bandsEl);
  // the buy amount sits in the goals strip, not on the page
  ctx.setBuySlot?.(createBuyToggle());

  const shelf: Shelf = createShelf({
    content,
    state: ctx.state,
    apply: ctx.apply,
    scope: 'production',
    sound: ctx.sound,
  });

  const drawer = h('section', 'pp-drawer');
  drawer.setAttribute('aria-label', COPY.shelf.title);
  const bar = h('div', 'pp-drawer__bar');
  const handle = h('button', 'pp-drawer__handle');
  handle.type = 'button';
  handle.id = 'pp-drawer-handle';
  handle.setAttribute('aria-controls', 'pp-drawer-body');
  const readyDot = h('i', 'pp-drawer__ready');
  readyDot.setAttribute('aria-hidden', 'true');
  const summary = h('span', 'pp-drawer__sum bi-num');
  handle.append(
    h('i', 'pp-drawer__chev'),
    h('b', 'pp-drawer__title px-display', COPY.shelf.title),
    summary,
    readyDot,
  );
  bar.append(handle);
  const drawerBody = h('div', 'pp-drawer__body');
  drawerBody.id = 'pp-drawer-body';
  drawerBody.append(shelf.el);
  drawer.append(bar, drawerBody);
  screen.append(scroll, drawer);
  page.append(screen);

  // open the first time on a tall window, closed on a short one; after that the player's choice
  const stored = readStored(DRAWER_KEY);
  let open = stored ? stored === 'open' : window.innerHeight >= 900;
  const setOpen = (value: boolean): void => {
    open = value;
    drawer.classList.toggle('is-open', open);
    handle.setAttribute('aria-expanded', String(open));
    handle.setAttribute(
      'aria-label',
      open ? COPY.production.shelfClose : COPY.production.shelfOpen,
    );
    drawerBody.inert = !open;
    writeStored(DRAWER_KEY, open ? 'open' : 'closed');
    padForDrawer();
  };
  /** The bands scroll clear of the drawer: its bar when closed, the whole drawer when open. */
  function padForDrawer(): void {
    const barH = bar.offsetHeight || 40;
    const shown = open ? drawer.offsetHeight || barH : barH;
    scroll.style.setProperty('--pp-pad', `${shown + 12}px`);
  }
  handle.addEventListener('click', () => setOpen(!open));
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(padForDrawer).observe(drawer);

  // ---- the bands: one per job, each with its own party, rows and supports ----
  let last = '';
  const refs = new Map<string, RowRef>();
  const bands = {} as Record<ProductionJob, BandRef>;
  const toolPanels = {} as Record<ProductionJob, ToolLinesPanel>;
  const presetPanels = {} as Record<ProductionJob, Panel>;
  const refKey = (job: ProductionJob, kind: number): string => `${job}:${kind}`;

  function buildBand(job: ProductionJob): BandRef {
    const t = COPY.production[job];
    const el = h('section', `pp-band px-panel pp-band--${job}`);
    el.dataset['job'] = job;
    el.setAttribute('aria-label', COPY.production.bandLabel(t.title));
    const top = h('div', 'pp-band__top');
    const title = h('h2', 'pp-band__title pp-panel__title px-display', t.title);
    const slots = h('span', 'pp-band__slots bi-num');
    slots.title = COPY.production.slotsHint;
    top.append(title, slots);
    const head = h('div', 'pp-head');
    head.setAttribute('aria-hidden', 'true');
    const rate = h('span', 'pp-head__rate px-display');
    const cost = h('span', 'pp-head__cost');
    cost.append(h('span', '', COPY.production.columns.cost), rate);
    head.append(
      h('span', 'pp-head__worker', COPY.production.workerColumn),
      h('span', 'pp-head__who', COPY.production.columns.producer),
      h('span', 'pp-head__mid', COPY.production.columns.output),
      h('span', 'pp-head__next', COPY.production.columns.next),
      cost,
    );
    const list = h('ul', 'pp-list');
    list.setAttribute('aria-label', t.tilesLabel);
    const flashEl = h('div', 'pp-flash');
    flashEl.setAttribute('aria-hidden', 'true');
    const tools = createToolLinesPanel({
      content,
      job,
      state: ctx.state,
      apply: ctx.apply,
      sound: ctx.sound,
    });
    toolPanels[job] = tools;
    const presets = createPresetsPanel(ctx, job);
    presetPanels[job] = presets;
    el.append(top, presets.el, head, list, tools.el, flashEl);
    const view = productionStageView(ctx.state(), content, job);
    return { el, rate, slots, list, flash: flashEl, view };
  }
  for (const job of PRODUCTION_JOBS) {
    bands[job] = buildBand(job);
    bandsEl.append(bands[job].el);
  }
  const forge = createForgePanel({
    content,
    state: ctx.state,
    apply: ctx.apply,
    sound: ctx.sound,
  });
  bandsEl.append(forge.el);

  // ---- rows ----
  function priceOf(v: { offer: { price: { amount: Decimal; resource: string } } }): string {
    const p = v.offer.price;
    return amountText(content, p.resource, p.amount);
  }

  function buildRow(row: ProductionRow, p: Producer): RowRef {
    const locked = row.kind !== 'active';
    const li = h('li', `pp-r${locked ? ' pp-r--locked' : ''}`);
    li.dataset['key'] = row.key;
    // the card working this place and its gauge; a click opens the worker picker under the row
    const worker = createWorkerCell(row.name, () => togglePick(row.id));
    worker.el.dataset['key'] = `worker-${row.id}`;
    // tile, name and level
    const who = h('div', 'pp-r__who');
    const tile = h('div', 'pp-r__tile');
    const art = h('span', 'pp-tile__art');
    art.setAttribute('aria-hidden', 'true');
    art.innerHTML = tileArt(row.job, p, row.stage);
    art.style.setProperty('--d', `${((row.kindIndex * 0.37) % 3).toFixed(2)}s`);
    // the hit effect plays on the tile, so the fx layer is the tile's size
    tile.append(art, h('span', 'pp-fx'));
    const id = h('div', 'pp-r__id');
    const level = h('span', 'pp-row__lv', row.levelText);
    id.append(h('span', 'pp-row__name', row.name), level);
    who.append(tile, id);
    // output and the bar to the next ×2 (a locked row says what it needs instead)
    const mid = h('div', 'pp-r__mid');
    const value = h('span', 'pp-r__value px-display');
    const unit = h('span', 'pp-r__unit');
    const track = h('div', 'pp-seg');
    track.setAttribute('aria-hidden', 'true');
    const x2 = h('span', 'pp-r__x2 bi-num');
    const lucky = h('span', 'pp-r__lucky bi-num');
    lucky.hidden = true;
    const depthLine = h('div', 'pp-r__depth');
    const depthName = h('span', 'pp-r__depthName bi-num');
    const depthBar = h('div', 'pp-dep');
    depthBar.setAttribute('aria-hidden', 'true');
    const depthFill = h('i');
    depthBar.append(depthFill);
    const depthText = h('span', 'pp-r__depthText bi-num');
    depthLine.append(depthName, depthBar, depthText);
    if (locked) {
      mid.append(h('span', 'pp-r__note', row.note));
    } else {
      const line = h('div', 'pp-r__line');
      line.append(value, unit, lucky);
      mid.append(line, track, x2, depthLine);
    }
    // next buy
    const next = h('div', 'pp-r__next');
    const nextText = h('span', 'pp-r__nextText px-display');
    const nextSub = h('span', 'pp-r__nextSub bi-num');
    if (!locked) next.append(nextText, nextSub);
    const ref: RowRef = {
      row,
      li,
      worker,
      workerKey: '',
      tile,
      art,
      level,
      value,
      unit,
      pips: [],
      track,
      x2,
      next,
      nextText,
      nextSub,
      lucky,
      depthName,
      depthFill,
      depthText,
    };
    // buy
    const cell = h('div', 'pp-r__buy');
    if (row.kind === 'active') {
      const isTree = row.job === 'logging';
      const btn = createBuyButton(() => (isTree ? buyTree(row.id) : buyMine(row.id)), true);
      btn.el.classList.add('pp-buy');
      btn.el.dataset['key'] = isTree ? `tree-${row.id}` : `level-${row.id}`;
      ref.buy = btn;
      cell.append(btn.el);
    } else {
      const btn = h('button', 'buy-btn buy-btn--compact pp-buy pp-buy--locked');
      btn.type = 'button';
      btn.dataset['key'] = `unlock-${row.id}`;
      const topLine = h('span', 'buy-btn__top');
      const label = h('span', 'buy-btn__label', COPY.production.lockedButton);
      const price = h('span', 'buy-btn__price bi-num');
      topLine.append(label, price);
      const have = h('span', 'buy-btn__preview bi-num');
      btn.append(topLine, have);
      if (row.kind === 'locked-tree') {
        btn.addEventListener('click', () => {
          if (btn.getAttribute('aria-disabled') === 'true') return;
          const result = unlockTree(ctx.state(), content, row.id);
          if (!result.ok) return;
          ctx.sound?.('buy');
          ctx.apply(result.state);
          update(`unlock-${row.id}`);
        });
      }
      ref.unlock = { btn, label, price, have };
      cell.append(btn);
    }
    li.append(worker.el, who, mid, ...(locked ? [] : [next]), cell);
    return ref;
  }

  function build(rowsByJob: Record<ProductionJob, ProductionRow[]>, focusKey?: string): void {
    hideTip();
    refs.clear();
    for (const job of PRODUCTION_JOBS) {
      const all = producersOf(content, job);
      bands[job].list.replaceChildren(
        ...rowsByJob[job].map((row) => {
          const ref = buildRow(row, all[row.kindIndex]!);
          refs.set(refKey(job, row.kindIndex), ref);
          return ref.li;
        }),
      );
    }
    placePicker();
    if (focusKey) page.querySelector<HTMLElement>(`[data-key="${focusKey}"]`)?.focus();
  }

  // ---- the worker picker: opens under the row whose worker cell was clicked ----
  let picking: string | null = null;
  const pickEl = h('li', 'pp-pick');

  function togglePick(producerId: string): void {
    picking = picking === producerId ? null : producerId;
    drawPicker();
    update(`worker-${producerId}`);
  }

  /** Puts the picker under its row (or takes it away). */
  function placePicker(): void {
    const ref = picking ? [...refs.values()].find((r) => r.row.id === picking) : undefined;
    if (!ref || ref.row.kind !== 'active') {
      picking = null;
      pickEl.remove();
      return;
    }
    if (pickEl.previousElementSibling !== ref.li) ref.li.after(pickEl);
  }

  function drawPicker(): void {
    if (!picking) {
      pickEl.replaceChildren();
      return;
    }
    const placeId = picking;
    const ref = [...refs.values()].find((r) => r.row.id === placeId);
    const placeName = ref?.row.name ?? placeId;
    const options = pickOptions(workerChoices(ctx.state(), content, placeId));
    const head = h('div', 'pp-pick__head');
    const actions = h('span', 'pp-pick__actions');
    const working = options.some((o) => o.current);
    if (working) {
      const away = h('button', 'button button--ghost', COPY.production.pickRemove);
      away.type = 'button';
      away.dataset['key'] = `pick-away-${placeId}`;
      away.addEventListener('click', () => place(placeId, null));
      actions.append(away);
    }
    const close = h('button', 'button button--ghost', COPY.production.pickClose);
    close.type = 'button';
    close.dataset['key'] = `pick-close-${placeId}`;
    close.addEventListener('click', () => togglePick(placeId));
    actions.append(close);
    head.append(h('span', '', COPY.production.pickTitle(placeName)), actions);
    const list = h('ul', 'pp-pick__list');
    for (const o of options) {
      const li = h('li');
      const b = h('button', 'pp-pick__opt');
      b.type = 'button';
      b.dataset['key'] = `pick-${placeId}-${o.id}`;
      if (o.current) b.setAttribute('aria-current', 'true');
      if (o.disabled) b.setAttribute('aria-disabled', 'true');
      const sw = h('i');
      sw.dataset['rarity'] = o.rarity;
      sw.setAttribute('aria-hidden', 'true');
      b.append(
        sw,
        h('b', '', o.name),
        h('span', 'pp-pick__power bi-num', o.power),
        h('span', 'pp-pick__note', o.note),
      );
      b.addEventListener('click', () => {
        if (o.disabled || o.current) return;
        place(placeId, o.id);
      });
      li.append(b);
      list.append(li);
    }
    pickEl.replaceChildren(
      head,
      options.length > 0 ? list : h('p', 'pp-pick__empty', COPY.production.pickNone),
    );
  }

  /** Puts a card to work on a place (or sends its worker away) and closes the picker. */
  function place(placeId: string, cardId: string | null): void {
    const result = assignWorker(ctx.state(), content, placeId, cardId);
    if (!result.ok) return;
    ctx.sound?.('buy');
    ctx.apply(result.state);
    picking = null;
    drawPicker();
    update(`worker-${placeId}`);
  }

  /** The bar to the next ×2: `total` segments, the first `filled` lit. */
  function setSegments(ref: RowRef, seg: MilestoneSegments): void {
    if (ref.pips.length !== seg.total) {
      ref.pips = Array.from({ length: seg.total }, () => document.createElement('i'));
      ref.track.replaceChildren(...ref.pips);
    }
    ref.pips.forEach((p, i) => p.classList.toggle('is-on', i < seg.filled));
  }

  function refreshRows(
    rowsByJob: Record<ProductionJob, ProductionRow[]>,
    mods: readonly Modifier[],
  ): void {
    const s = ctx.state();
    const count = buyCount();
    for (const job of PRODUCTION_JOBS) {
      const view = bands[job].view;
      const byKind = new Map<number, StageTarget>(view.targets.map((t) => [t.kind, t]));
      const canAdd = view.slots.used < view.slots.total;
      set(bands[job].slots, COPY.production.slots(view.slots.used, view.slots.total));
      const value = jobRateValue(s, content, job, mods);
      set(bands[job].rate, COPY.production.rate(value));
      bands[job].rate.setAttribute('aria-label', COPY.production.gemsPerSecond(value));
      for (const row of rowsByJob[job]) {
        const ref = refs.get(refKey(job, row.kindIndex));
        if (!ref) continue;
        ref.row = row;
        const target = row.kind === 'active' ? (byKind.get(row.kindIndex) ?? null) : null;
        ref.worker.update(target, picking === row.id, canAdd);
        if (target) {
          ref.workerKey = workerKey(target);
          const lucky = target.lucky;
          ref.lucky.hidden = !lucky;
          if (lucky)
            set(ref.lucky, COPY.production.lucky(lucky.name, Math.ceil(lucky.secondsLeft)));
          const d = target.depth;
          const t = COPY.production.depth;
          set(
            ref.depthName,
            row.job === 'logging' ? t.logging(d.layer, d.name) : t.mining(d.layer, d.name),
          );
          ref.depthFill.style.width = `${Math.round(d.fraction * 100)}%`;
          ref.depthFill.parentElement!.title = d.atMax
            ? t.deepest
            : target.dig.gt(0)
              ? t.tip(fmt(d.progress), fmt(d.hardness))
              : t.noWorker;
          set(
            ref.depthText,
            d.nextYieldMultiplier
              ? t.next(fmt(d.nextYieldMultiplier.div(d.yieldMultiplier)))
              : t.deepest,
          );
        }
        set(ref.level, row.levelText);
        if (row.kind === 'active') {
          set(ref.value, row.outputValue);
          set(ref.unit, row.outputUnit);
          if (row.milestone) {
            setSegments(ref, row.milestone.segments);
            set(ref.x2, row.milestone.toGo);
            ref.track.title = row.milestone.label;
          }
          if (row.nextBuy) {
            set(ref.nextText, row.nextBuy.text);
            set(ref.nextSub, row.nextBuy.sub);
            ref.next.classList.toggle('is-ready', row.nextBuy.ready);
          }
          if (row.buy && ref.buy) {
            const v = row.buy;
            ref.buy.update({
              ...v,
              label:
                count === 'max'
                  ? COPY.production.levelUpMax(v.offer.count)
                  : COPY.production.levelUpTimes(v.offer.count),
              price: priceOf(v),
              preview: row.previewText || v.preview,
            });
          }
        } else if (ref.unlock) {
          const u = ref.unlock;
          if (row.kind === 'locked-tree' && row.unlock) {
            set(u.label, COPY.production.unlockLabel);
            set(u.price, row.unlock.amount);
            set(u.have, row.unlock.resources);
            u.btn.title = row.unlock.have;
            u.btn.setAttribute('aria-disabled', String(!row.unlock.affordable));
            u.btn.classList.toggle('is-affordable', row.unlock.affordable);
          } else {
            set(u.label, COPY.production.lockedButton);
            set(u.price, '');
            set(u.have, row.dungeon ? COPY.production.clearTo(row.dungeon) : '');
            u.btn.setAttribute('aria-disabled', 'true');
          }
        }
      }
    }
  }

  const signature = (rowsByJob: Record<ProductionJob, ProductionRow[]>): string =>
    JSON.stringify(
      PRODUCTION_JOBS.map((job) => rowsByJob[job].map((r) => [r.key, r.kind, r.stage])),
    );

  /** Reads the game, rebuilds the rows only when a kind unlocks or a tile grows, else refreshes. */
  function update(focusKey?: string): void {
    const s = ctx.state();
    const mods = collectModifiers(s, content);
    const count = buyCount();
    const rowsByJob = {
      logging: productionRows(s, content, 'logging', count, mods),
      mining: productionRows(s, content, 'mining', count, mods),
    };
    for (const job of PRODUCTION_JOBS) bands[job].view = productionStageView(s, content, job, mods);
    const sig = signature(rowsByJob);
    if (sig !== last) {
      last = sig;
      build(rowsByJob, focusKey);
    }
    refreshRows(rowsByJob, mods);
    for (const job of PRODUCTION_JOBS) {
      toolPanels[job].update();
      presetPanels[job].update();
    }
    forge.update();
    placePicker();
    shelf.update();
    const chips = shelfChips(s, content, mods, 'production');
    const sum = shelfSummary(chips);
    set(summary, sum.text);
    readyDot.hidden = sum.ready === 0;
    drawer.classList.toggle('has-ready', sum.ready > 0);
    padForDrawer();
  }

  function bought(key: string, id: string, job: ProductionJob, next: GameState, tierUps: TierUp[]) {
    ctx.apply(next);
    update(key);
    const ref = [...refs.values()].find((r) => r.row.job === job && r.row.id === id);
    ref?.buy?.celebrate();
    if (tierUps.some((u) => u.kind === 'mine_milestone' || u.kind === 'tree_milestone'))
      replay(ref?.li, 'is-milestone', 1100);
    if (tierUps.length > 0) ctx.onTierUps?.(tierUps);
    else ctx.sound?.('buy');
  }

  function buyMine(mineId: string): void {
    const result = buyMineLevels(ctx.state(), content, mineId, buyCount());
    if (result.ok) bought('level-' + mineId, mineId, 'mining', result.state, result.tierUps);
  }

  function buyTree(treeId: string): void {
    const result = buyTreeLevels(ctx.state(), content, treeId, buyCount());
    if (result.ok) bought('tree-' + treeId, treeId, 'logging', result.state, result.tierUps);
  }

  // ---- show events: all of it happens in the band of the job that made it ----

  /** The pattern look of the worker on a place (steady when it has none). */
  function lookAt(job: ProductionJob, kind: number) {
    const target = bands[job].view.targets.find((t) => t.kind === kind);
    return strikeLook(target?.pattern ?? { style: 'steady' });
  }

  /** One strike: the place's worker nudges toward its tile, the row is hit, "+n" pops on it. */
  function strike(job: ProductionJob, m: StrikeMoment): void {
    const ref = refs.get(refKey(job, m.kind));
    const band = bands[job];
    if (!ref) return;
    const box = band.el.getBoundingClientRect();
    if (box.width === 0) return;
    const view = band.view;
    const look = lookAt(job, m.kind);
    ref.worker.strike(look);
    replay(ref.art, 'is-harvest', 400);
    replay(ref.li, 'is-hit', 420);
    const fx = ref.tile.querySelector<HTMLElement>('.pp-fx');
    if (fx && view.attackEffect && !reducedMotion()) {
      try {
        playHit(view.attackEffect, fx, { rng: defaultRng, target: ref.art });
      } catch {
        /* an unknown effect id must not stop the harvest */
      }
    }
    if (look.shake || m.crit) shake(band.el);
    const t = ref.tile.getBoundingClientRect();
    const x = (t.left + t.width / 2 - box.left) / box.width;
    const y = (t.top + 8 - box.top) / box.height;
    if (strikeNumberKind(m) === 'crit') {
      popNumber(band.el, {
        kind: 'crit',
        text: `+${popText(m.amount)}`,
        x,
        y,
        scale: look.numberScale * 1.25,
      });
    } else {
      popGain(band.el, `pp-${job}-${m.kind}`, m.amount, x, y, look.numberScale);
    }
    if (coinThrottle.allow(m.resource, performance.now())) {
      flyCoins({
        from: centreOf(ref.tile),
        target: ctx.coins?.currencyGlyph(m.resource) ?? null,
        count: 1,
        onLand: () => ctx.coins?.pulseCurrency(m.resource),
      });
    }
  }

  /** The burst: a wave over the places that burst, a flash on the band, one big total. */
  function burst(job: ProductionJob, b: BurstMoment): void {
    const band = bands[job];
    for (const p of b.kinds) {
      const ref = refs.get(refKey(job, p.kind));
      if (!ref) continue;
      ref.worker.burst();
      window.setTimeout(() => replay(ref.li, 'is-wave', 500), p.kind * 70);
    }
    flash(band.flash);
    slowDown(band.el, 450, 0.4);
    const box = band.el.getBoundingClientRect();
    const rows = band.list.getBoundingClientRect();
    if (box.width > 0) {
      const text = b.totals.map((t) => `+${popText(t.amount)}`).join('  ');
      popNumber(band.el, {
        kind: 'total',
        text,
        x: (rows.left + rows.width / 2 - box.left) / box.width,
        y: (rows.top + rows.height / 2 - box.top) / box.height,
        scale: 1.9,
      });
    }
    ctx.sound?.('harvestBurst');
    for (const t of b.totals) {
      flyCoins({
        from: centreOf(band.el),
        target: ctx.coins?.currencyGlyph(t.resource) ?? null,
        count: 6,
        spill: true,
        onLand: () => ctx.coins?.pulseCurrency(t.resource),
      });
    }
  }

  ctx.director?.on('harvests', ({ events }) => {
    if (!visible()) return;
    for (const job of PRODUCTION_JOBS) {
      const moments = harvestMoments(events, job);
      let at = 0;
      for (const m of moments.strikes) {
        window.setTimeout(() => strike(job, m), at);
        at += lookAt(job, m.kind).staggerMs;
      }
      if (moments.burst) {
        const b = moments.burst;
        window.setTimeout(() => burst(job, b), at);
      }
    }
  });

  onBuyCount(() => {
    if (visible()) update();
  });

  setOpen(open);

  return {
    render() {
      update();
    },
  };
}
