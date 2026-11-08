import type { Content } from '../../../data';
import {
  PRODUCTION_JOBS,
  collectModifiers,
  defaultRng,
  buyMineLevels,
  buyTreeLevels,
  unlockTree,
  type GameState,
  type Modifier,
  type Producer,
  type ProductionJob,
  type TierUp,
  producersOf,
} from '../../../game';
import { COPY } from '../copy';
import { mineTile, svg, treeTile } from '../art/gems';
import { h } from '../shell/shell';
import { hide as hideTip } from '../shell/tooltip';
import type { CoinTarget } from '../stage/arena';
import { createHarvestParty, type HarvestParty } from '../stage/harvestParty';
import { playHit } from '../theme/effects';
import { flash, reducedMotion, shake, slowDown } from '../stage/motion';
import {
  harvestMoments,
  lungeVector,
  strikeLook,
  strikeNumberKind,
  type BurstMoment,
  type StrikeMoment,
} from './productionStageModel';
import type { Director } from '../stage/director';
import { centreOf, flyCoins } from '../stage/fly';
import { createThrottle, popText } from '../stage/math';
import { replay } from '../stage/motion';
import { popGain, popNumber } from '../stage/numbers';
import { buyCount, createBuyButton, createBuyToggle, onBuyCount, type BuyButton } from '../ui/buy';
import { createShelf, type Shelf } from '../ui/shelf';
import { fmt } from '../settings/numberFormat';
import {
  allRateText,
  jobRateText,
  productionRows,
  shelfSummary,
  type ProductionRow,
} from './productionModel';
import { shelfChips } from './shelfModel';
import './production.css';

/**
 * Production page (DESIGN.md §4, §11), "side stage": one row per tree kind or mine type on the left
 * (tile, name, level, output, a bar to the next ×2 milestone, the buy button on the row; a locked
 * kind is a greyed row with its unlock), a sticky stage on the right with the main card of the
 * chosen job at about 2x, its gauge and supports, and the upgrade shelf in a drawer that slides up
 * from the bottom. Every strike lunges the card toward the row it hit and pops "+n" on that row;
 * a harvest burst runs a wave down the rows with one big total.
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
}

/** Coins flown to the header per resource per second at most. */
const COINS_PER_SECOND = 3;
const DRAWER_KEY = 'bi.productionDrawer';
const STAGE_KEY = 'bi.productionStage';

/** What one row keeps so a refresh only touches text and state, not the DOM tree. */
interface RowRef {
  row: ProductionRow;
  li: HTMLElement;
  tile: HTMLElement;
  art: HTMLElement;
  level: HTMLElement;
  output: HTMLElement;
  msLabel: HTMLElement;
  msToGo: HTMLElement;
  msFill: HTMLElement;
  buy?: BuyButton;
  unlock?: { btn: HTMLButtonElement; label: HTMLElement; price: HTMLElement; have: HTMLElement };
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
  const resName = (id: string): string => content.resourceById.get(id)?.name ?? id;
  const visible = (): boolean => ctx.visible?.() ?? true;
  const coinThrottle = createThrottle(COINS_PER_SECOND, 1000);

  const tileArt = (job: ProductionJob, p: Producer, stage: number): string => {
    const gem = content.resourceById.get(p.resource)?.gem;
    if (!gem) return '';
    const tree = job === 'logging' ? content.treeById.get(p.id) : undefined;
    return svg(tree ? treeTile(tree, gem, stage) : mineTile(gem, stage));
  };

  // ---- skeleton: a scrolling screen (title, rows, stage) with the shelf drawer over its bottom ----
  page.classList.add('shell-page--stage', 'pp-page');
  const screen = h('div', 'pp-screen');
  const scroll = h('div', 'pp-scroll');
  const top = h('header', 'pp-top');
  const title = page.querySelector<HTMLElement>('.shell-page__title');
  if (title) top.append(title);
  const total = h('span', 'pp-top__rate bi-num');
  top.append(total, createBuyToggle());
  const split = h('div', 'pp-split');
  const rowsEl = h('div', 'pp-rows');
  const stageEl = h('aside', 'pp-stage');
  split.append(rowsEl, stageEl);
  scroll.append(top, split);

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
  handle.append(h('i', 'pp-drawer__chev'), h('b', '', COPY.shelf.title), summary, readyDot);
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
  /** The rows scroll clear of the drawer: its bar when closed, the whole drawer when open. */
  function padForDrawer(): void {
    const barH = bar.offsetHeight || 46;
    const shown = open ? drawer.offsetHeight || barH : barH;
    scroll.style.setProperty('--pp-pad', `${shown + 18}px`);
  }
  handle.addEventListener('click', () => setOpen(!open));
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(padForDrawer).observe(drawer);

  // ---- the stage: one job at a time, chosen by its tab ----
  const parties: Record<ProductionJob, HarvestParty> = {
    logging: createHarvestParty(content, ctx.state, 'logging', { side: true }),
    mining: createHarvestParty(content, ctx.state, 'mining', { side: true }),
  };
  let stageJob: ProductionJob = readStored(STAGE_KEY) === 'mining' ? 'mining' : 'logging';
  const tabs = h('div', 'pp-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', COPY.production.stageTabs);
  const tabEls = new Map<ProductionJob, HTMLButtonElement>();
  for (const job of PRODUCTION_JOBS) {
    const b = h('button', 'pp-tab', COPY.production[job].title);
    b.type = 'button';
    b.setAttribute('role', 'tab');
    b.id = `pp-tab-${job}`;
    b.setAttribute('aria-controls', `pp-panel-${job}`);
    b.addEventListener('click', () => showStage(job));
    b.addEventListener('keydown', (e) => {
      const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      const next = PRODUCTION_JOBS[(PRODUCTION_JOBS.indexOf(job) + step + 2) % 2]!;
      showStage(next);
      tabEls.get(next)?.focus();
    });
    tabEls.set(job, b);
    tabs.append(b);
  }
  const flashEl = h('div', 'pp-flash');
  flashEl.setAttribute('aria-hidden', 'true');
  stageEl.append(tabs);
  for (const job of PRODUCTION_JOBS) {
    const panel = parties[job].el;
    panel.id = `pp-panel-${job}`;
    panel.setAttribute('role', 'tabpanel');
    panel.setAttribute('aria-labelledby', `pp-tab-${job}`);
    stageEl.append(panel);
  }
  stageEl.append(flashEl);
  function showStage(job: ProductionJob): void {
    stageJob = job;
    writeStored(STAGE_KEY, job);
    stageEl.dataset.job = job;
    for (const j of PRODUCTION_JOBS) {
      const on = j === job;
      tabEls.get(j)!.setAttribute('aria-selected', String(on));
      tabEls.get(j)!.tabIndex = on ? 0 : -1;
      parties[j].el.hidden = !on;
    }
  }
  showStage(stageJob);

  // ---- rows ----
  let last = '';
  const refs = new Map<string, RowRef>();
  const panels: Partial<Record<ProductionJob, { rate: HTMLElement }>> = {};

  const refKey = (job: ProductionJob, kind: number): string => `${job}:${kind}`;

  function priceOf(v: {
    offer: { price: { amount: import('../../../game').Decimal; resource: string } };
  }): string {
    const p = v.offer.price;
    return p.resource === 'money' ? fmt(p.amount) : `${fmt(p.amount)} ${resName(p.resource)}`;
  }

  function buildRow(row: ProductionRow, p: Producer): RowRef {
    const locked = row.kind !== 'active';
    const li = h('li', `pp-row${locked ? ' pp-row--locked' : ''}`);
    li.dataset.key = row.key;
    const tile = h('div', 'pp-row__tile');
    const art = h('span', 'pp-tile__art');
    art.setAttribute('aria-hidden', 'true');
    art.innerHTML = tileArt(row.job, p, row.stage);
    art.style.setProperty('--d', `${((row.kindIndex * 0.37) % 3).toFixed(2)}s`);
    // the hit effect plays on the tile, so the fx layer is the tile's size
    tile.append(art, h('span', 'pp-fx'));
    const id = h('div', 'pp-row__id');
    const level = h('span', 'pp-row__lv', row.levelText);
    const output = h('span', 'pp-row__out bi-num');
    id.append(h('span', 'pp-row__name', row.name), level, output);
    const mid = h('div', 'pp-row__ms');
    const msLabel = h('span', 'bi-num');
    const msToGo = h('span', 'bi-num');
    const msFill = h('i');
    if (locked) {
      mid.append(h('span', 'pp-row__note', row.note));
    } else {
      const line = h('span', 'pp-row__msline');
      line.append(msLabel, msToGo);
      const track = h('div', 'pp-bar');
      track.setAttribute('aria-hidden', 'true');
      track.append(msFill);
      mid.append(line, track);
    }
    const ref: RowRef = { row, li, tile, art, level, output, msLabel, msToGo, msFill };
    const cell = h('div', 'pp-row__buy');
    if (row.kind === 'active') {
      const isTree = row.job === 'logging';
      const btn = createBuyButton(() => (isTree ? buyTree(row.id) : buyMine(row.id)), true);
      btn.el.classList.add('pp-buy');
      btn.el.dataset.key = isTree ? `tree-${row.id}` : `level-${row.id}`;
      ref.buy = btn;
      cell.append(btn.el);
    } else {
      const btn = h('button', 'buy-btn buy-btn--compact pp-buy pp-buy--locked');
      btn.type = 'button';
      btn.dataset.key = `unlock-${row.id}`;
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
    li.append(tile, id, mid, cell);
    return ref;
  }

  function build(rowsByJob: Record<ProductionJob, ProductionRow[]>, focusKey?: string): void {
    hideTip();
    refs.clear();
    rowsEl.replaceChildren(
      ...PRODUCTION_JOBS.map((job) => {
        const t = COPY.production[job];
        const panel = h('section', `pp-panel pp-panel--${job}`);
        panel.setAttribute('aria-label', t.title);
        const head = h('header', 'pp-panel__head');
        const rate = h('span', 'pp-panel__rate bi-num');
        head.append(h('h2', 'pp-panel__title', t.title), rate);
        panels[job] = { rate };
        const list = h('ul', 'pp-list');
        list.setAttribute('aria-label', t.tilesLabel);
        const all = producersOf(content, job);
        for (const row of rowsByJob[job]) {
          const ref = buildRow(row, all[row.kindIndex]!);
          refs.set(refKey(job, row.kindIndex), ref);
          list.append(ref.li);
        }
        panel.append(head, list);
        return panel;
      }),
    );
    if (focusKey) page.querySelector<HTMLElement>(`[data-key="${focusKey}"]`)?.focus();
  }

  function refreshRows(
    rowsByJob: Record<ProductionJob, ProductionRow[]>,
    mods: readonly Modifier[],
  ): void {
    const s = ctx.state();
    const count = buyCount();
    for (const job of PRODUCTION_JOBS) {
      set(panels[job]!.rate, jobRateText(s, content, job, mods));
      for (const row of rowsByJob[job]) {
        const ref = refs.get(refKey(job, row.kindIndex));
        if (!ref) continue;
        ref.row = row;
        set(ref.level, row.levelText);
        if (row.kind === 'active') {
          set(ref.output, row.output);
          if (row.milestone) {
            set(ref.msLabel, row.milestone.label);
            set(ref.msToGo, row.milestone.toGo);
            ref.msFill.style.width = `${(row.milestone.progress * 100).toFixed(1)}%`;
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
            });
          }
        } else if (ref.unlock) {
          const u = ref.unlock;
          if (row.kind === 'locked-tree' && row.unlock) {
            set(u.label, COPY.production.unlockLabel);
            set(u.price, row.unlock.price);
            set(u.have, row.unlock.have);
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
    const sig = signature(rowsByJob);
    if (sig !== last) {
      last = sig;
      build(rowsByJob, focusKey);
    }
    refreshRows(rowsByJob, mods);
    set(total, allRateText(s, content, mods));
    for (const job of PRODUCTION_JOBS) parties[job].update();
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

  // ---- show events ----

  /** One strike: the card lunges toward the row, the row is hit, "+n" pops on it. */
  function strike(job: ProductionJob, m: StrikeMoment): void {
    const ref = refs.get(refKey(job, m.kind));
    const party = parties[job];
    if (!ref) return;
    const box = rowsEl.getBoundingClientRect();
    if (box.width === 0) return;
    const view = party.view();
    const look = strikeLook(view.pattern);
    const slot = party.mainSlot();
    if (slot && stageJob === job) {
      const v = lungeVector(centreOf(slot), centreOf(ref.tile), look, 56);
      party.lunge(look, v.dx, v.dy);
    }
    party.pulse(m.supports);
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
    if ((look.shake || m.crit) && stageJob === job) shake(stageEl);
    const t = ref.tile.getBoundingClientRect();
    const x = (t.left + t.width / 2 - box.left) / box.width;
    const y = (t.top + 8 - box.top) / box.height;
    if (strikeNumberKind(m) === 'crit') {
      popNumber(rowsEl, {
        kind: 'crit',
        text: `+${popText(m.amount)}`,
        x,
        y,
        scale: look.numberScale * 1.25,
      });
    } else {
      popGain(rowsEl, `pp-${job}-${m.kind}`, m.amount, x, y, look.numberScale);
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

  /** The burst: a wave down the rows, a flash on the stage, one big total over the card. */
  function burst(job: ProductionJob, b: BurstMoment): void {
    parties[job].burst();
    parties[job].pulse(b.supports);
    for (const p of b.kinds) {
      const ref = refs.get(refKey(job, p.kind));
      if (ref) window.setTimeout(() => replay(ref.li, 'is-wave', 500), p.kind * 70);
    }
    if (stageJob === job) {
      flash(flashEl);
      slowDown(stageEl, 450, 0.4);
      const text = b.totals.map((t) => `+${popText(t.amount)}`).join('  ');
      popNumber(stageEl, { kind: 'total', text, x: 0.5, y: 0.42, scale: 1.9 });
    }
    ctx.sound?.('harvestBurst');
    for (const t of b.totals) {
      flyCoins({
        from: centreOf(stageJob === job ? stageEl : rowsEl),
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
      const look = strikeLook(parties[job].view().pattern);
      moments.strikes.forEach((m, i) =>
        window.setTimeout(() => strike(job, m), i * look.staggerMs),
      );
      if (moments.burst) {
        const b = moments.burst;
        window.setTimeout(() => burst(job, b), moments.strikes.length * look.staggerMs);
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
