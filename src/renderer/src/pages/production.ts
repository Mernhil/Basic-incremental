import type { Content } from '../../../data';
import {
  PRODUCTION_JOBS,
  assignPlot,
  buyExpansions,
  buyMineLevels,
  buyTreeLevels,
  canAfford,
  collectModifiers,
  computeStat,
  isProducerUnlocked,
  jobProductionPerSecond,
  producerLevel,
  plotCapacity,
  plots,
  producerRate,
  producersOf,
  tileStage,
  treeUnlockCost,
  unlockTree,
  type GameState,
  type Modifier,
  type Price,
  type Producer,
  type ProductionJob,
  type TierUp,
} from '../../../game';
import { fmt } from '../settings/numberFormat';
import { COPY } from '../copy';
import { mineTile, svg, treeTile } from '../art/gems';
import { h } from '../shell/shell';
import { statTip } from '../shell/stats';
import { attachTooltip, hide as hideTip } from '../shell/tooltip';
import type { CoinTarget } from '../stage/arena';
import type { Director } from '../stage/director';
import { centreOf, flyCoins } from '../stage/fly';
import { createThrottle, popText } from '../stage/math';
import { replay } from '../stage/motion';
import { popGain, popNumber } from '../stage/numbers';
import { buyCount, createBuyButton, createBuyToggle, onBuyCount, type BuyButton } from '../ui/buy';
import { createShelf, type Shelf } from '../ui/shelf';
import { expansionView, mineLevelViews, treeLevelViews, type BuyLineView } from './buyModel';
import './production.css';

/**
 * Production page (DESIGN.md 14, A2 A): the logging field above the mining field, each a wide
 * strip of faceted tiles at their growth stage; upgrade lines (tree kinds, mine levels, plots
 * and slots) in a side rail. Every tick floats a "+n" off each tile and flies coins to the
 * header; a harvest burst runs a wave across the field with one big total.
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

function signature(state: GameState, content: Content, mods: readonly Modifier[]): string {
  return JSON.stringify([
    PRODUCTION_JOBS.map((job) => plots(state, content, job, mods)),
    PRODUCTION_JOBS.map((job) =>
      producersOf(content, job).map((p) => tileStage(state, content, job, p.id)),
    ),
    state.production.unlockedTrees,
    state.clearedDungeons,
  ]);
}

export function createProductionPage(
  page: HTMLElement,
  ctx: ProductionContext,
): { render(): void } {
  const { content } = ctx;
  const resName = (id: string): string => content.resourceById.get(id)?.name ?? id;
  const priceText = (p: Price): string => `${fmt(p.amount)} ${resName(p.resource)}`;
  const visible = (): boolean => ctx.visible?.() ?? true;
  const coinThrottle = createThrottle(COINS_PER_SECOND, 1000);

  const tileArt = (job: ProductionJob, p: Producer, stage: number): string => {
    const gem = content.resourceById.get(p.resource)?.gem;
    if (!gem) return '';
    const tree = job === 'logging' ? content.treeById.get(p.id) : undefined;
    return svg(tree ? treeTile(tree, gem, stage) : mineTile(gem, stage));
  };

  const layout = h('div', 'pp-layout');
  const fields = h('div', 'pp-fields');
  const rail = h('aside', 'pp-rail');
  const shelf: Shelf = createShelf({
    content,
    state: ctx.state,
    apply: ctx.apply,
    scope: 'production',
    sound: ctx.sound,
  });
  layout.append(fields, rail);
  page.append(layout);

  let last = '';
  let openMenu: { close(): void } | null = null;
  let notes: Array<() => void> = [];
  let priced: Array<{ btn: HTMLButtonElement; prices: () => Price[] }> = [];
  const fieldEls: Partial<Record<ProductionJob, HTMLElement>> = {};
  /** Plot index -> tile button, per job. */
  const tiles: Record<ProductionJob, Map<number, HTMLElement>> = {
    logging: new Map(),
    mining: new Map(),
  };
  const lines = new Map<string, { li: HTMLElement; btn: BuyButton; tag?: HTMLElement }>();

  function build(focusKey?: string): void {
    openMenu?.close();
    hideTip();
    const state = ctx.state();
    const mods = collectModifiers(state, content);
    last = signature(state, content, mods);
    notes = [];
    priced = [];
    lines.clear();
    fields.replaceChildren(...PRODUCTION_JOBS.map((job) => field(job, state, mods)));
    rail.replaceChildren(
      railHead(),
      ...PRODUCTION_JOBS.map((job) => railJob(job, state, mods)),
      shelf.el,
    );
    if (focusKey) page.querySelector<HTMLElement>(`[data-key="${focusKey}"]`)?.focus();
    refresh();
  }

  const act = (next: GameState | null, focusKey?: string): void => {
    if (!next) return;
    ctx.apply(next);
    build(focusKey);
  };

  // ---- fields ----

  function field(job: ProductionJob, state: GameState, mods: readonly Modifier[]): HTMLElement {
    const t = COPY.production[job];
    const list = plots(state, content, job, mods);
    const used = list.filter((id) => id !== null).length;
    const capacity = plotCapacity(state, content, job, mods);
    const section = h('section', `pp-field pp-field--${job}`);
    section.setAttribute('aria-label', t.title);
    const head = h('header', 'pp-field__head');
    const summary = h('span', 'pp-field__rate bi-num');
    notes.push(() => {
      const s = ctx.state();
      const rates = Object.entries(
        jobProductionPerSecond(s, content, job, collectModifiers(s, content)),
      ).map(([res, v]) => COPY.production.perSecond(fmt(v), resName(res)));
      set(summary, rates.length ? rates.join(' · ') : t.idle);
    });
    head.append(
      h('h2', 'pp-field__title', t.title),
      h('span', 'pp-field__cap', t.capacity(used, capacity)),
      summary,
    );
    const strip = h('ul', 'pp-strip');
    strip.setAttribute('aria-label', t.plotsLabel);
    tiles[job].clear();
    list.forEach((id, index) => strip.append(plotTile(job, index, id, state, mods)));
    section.append(head, strip);
    fieldEls[job] = section;
    return section;
  }

  function plotTile(
    job: ProductionJob,
    index: number,
    id: string | null,
    state: GameState,
    mods: readonly Modifier[],
  ): HTMLElement {
    const t = COPY.production[job];
    const li = h('li', 'pp-plot');
    const btn = h('button', 'pp-tile');
    btn.type = 'button';
    btn.dataset.key = `${job}-plot-${index}`;
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');
    const p = id ? producersOf(content, job).find((x) => x.id === id) : undefined;
    if (p) {
      const art = h('span', 'pp-tile__art');
      art.innerHTML = tileArt(job, p, tileStage(state, content, job, p.id));
      art.style.setProperty('--d', `${((index * 0.37) % 3).toFixed(2)}s`);
      const level = producerLevel(state, job, p.id);
      btn.append(
        art,
        h('span', 'pp-tile__name', p.name),
        h(
          'span',
          'pp-tile__rate bi-num',
          COPY.production.rate(fmt(producerRate(p, job, mods, level))),
        ),
      );
      btn.setAttribute('aria-label', t.plotLabel(index + 1, p.name));
      tiles[job].set(index, btn);
    } else {
      btn.classList.add('pp-tile--empty');
      btn.append(h('span', 'pp-tile__plus', '+'), h('span', 'pp-tile__name', t.empty));
      btn.setAttribute('aria-label', t.plotLabel(index + 1, t.empty));
    }
    btn.addEventListener('click', () => openPicker(li, btn, job, index, id));
    li.append(btn);
    return li;
  }

  function openPicker(
    li: HTMLElement,
    btn: HTMLButtonElement,
    job: ProductionJob,
    index: number,
    current: string | null,
  ): void {
    openMenu?.close();
    hideTip();
    const t = COPY.production[job];
    const state = ctx.state();
    const mods = collectModifiers(state, content);
    const menu = h('div', 'pp-menu');
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', t.plotLabel(index + 1, ''));
    const items: HTMLButtonElement[] = [];
    const choose = (pid: string | null): void => {
      close();
      const result = assignPlot(ctx.state(), content, job, index, pid);
      act(result.ok ? result.state : null, `${job}-plot-${index}`);
    };
    for (const p of producersOf(content, job)) {
      const unlocked = isProducerUnlocked(state, content, job, p.id);
      const item = h('button', 'pp-menu__item');
      item.type = 'button';
      item.setAttribute('role', 'menuitemradio');
      item.setAttribute('aria-checked', String(p.id === current));
      const level = producerLevel(state, job, p.id);
      item.append(
        h('span', '', p.name),
        h(
          'span',
          'pp-menu__meta bi-num',
          unlocked
            ? COPY.production.rate(fmt(producerRate(p, job, mods, level)))
            : COPY.production.locked,
        ),
      );
      if (!unlocked) item.disabled = true;
      else item.addEventListener('click', () => choose(p.id));
      items.push(item);
      menu.append(item);
    }
    const empty = h('button', 'pp-menu__item');
    empty.type = 'button';
    empty.setAttribute('role', 'menuitemradio');
    empty.setAttribute('aria-checked', String(current === null));
    empty.append(h('span', '', t.emptyAction));
    empty.addEventListener('click', () => choose(null));
    items.push(empty);
    menu.append(empty);

    const enabled = items.filter((i) => !i.disabled);
    const onKey = (e: KeyboardEvent): void => {
      const at = enabled.indexOf(document.activeElement as HTMLButtonElement);
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
        btn.focus();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const step = e.key === 'ArrowDown' ? 1 : -1;
        enabled[(at + step + enabled.length) % enabled.length]?.focus();
      } else if (e.key === 'Tab') {
        close();
      }
    };
    const onOutside = (e: PointerEvent): void => {
      if (!li.contains(e.target as Node)) close();
    };
    function close(): void {
      menu.remove();
      btn.setAttribute('aria-expanded', 'false');
      menu.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onOutside, true);
      openMenu = null;
    }
    menu.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onOutside, true);
    li.append(menu);
    btn.setAttribute('aria-expanded', 'true');
    openMenu = { close };
    (enabled.find((i) => i.getAttribute('aria-checked') === 'true') ?? enabled[0])?.focus();
  }

  // ---- rail ----

  function railHead(): HTMLElement {
    const head = h('header', 'pp-rail__head');
    head.append(h('h2', 'pp-rail__title', COPY.production.upgrades), createBuyToggle());
    return head;
  }

  function buyLine(key: string, onBuy: () => void, withTag: boolean): HTMLElement {
    const li = h('li', 'pp-line');
    const info = h('div', 'pp-line__info');
    const name = h('span', 'pp-line__name');
    const meta = h('span', 'pp-line__meta bi-num');
    info.append(name, meta);
    let tag: HTMLElement | undefined;
    if (withTag) {
      tag = h('span', 'ms-tag bi-num');
      info.append(tag);
    }
    const btn = createBuyButton(onBuy);
    btn.el.dataset.key = key;
    li.append(info, btn.el);
    lines.set(key, { li, btn, ...(tag ? { tag } : {}) });
    return li;
  }

  function railJob(job: ProductionJob, state: GameState, mods: readonly Modifier[]): HTMLElement {
    const t = COPY.production[job];
    const section = h('section', 'pp-rail__group');
    section.append(h('h3', 'pp-rail__sub', t.title));
    const list = h('ul', 'pp-lines');
    list.append(buyLine(`${job}-expansion`, () => buyExpansion(job), false));
    if (job === 'logging') {
      for (const tree of content.trees) {
        if (!isProducerUnlocked(state, content, 'logging', tree.id)) continue;
        list.append(buyLine(`tree-${tree.id}`, () => buyTreeLevel(tree.id), true));
      }
    }
    if (job === 'mining') {
      for (const mine of content.mines) {
        if (!isProducerUnlocked(state, content, 'mining', mine.id)) continue;
        list.append(buyLine(`level-${mine.id}`, () => buyLevels(mine.id), true));
      }
    }
    section.append(list);
    // kinds: tree unlocks, locked mines
    const kinds = h('ul', 'pp-kinds');
    kinds.setAttribute('aria-label', t.kindsLabel);
    for (const p of producersOf(content, job)) {
      const unlocked = isProducerUnlocked(state, content, job, p.id);
      if (unlocked) continue; // unlocked kinds are shown as a level line above
      kinds.append(kindRow(job, p, unlocked, state, mods));
    }
    if (kinds.childElementCount > 0) section.append(kinds);
    return section;
  }

  function kindRow(
    job: ProductionJob,
    p: Producer,
    unlocked: boolean,
    state: GameState,
    mods: readonly Modifier[],
  ): HTMLElement {
    const t = COPY.production[job];
    const li = h('li', `pp-kind${unlocked ? '' : ' pp-kind--locked'}`);
    const art = h('span', 'pp-kind__art');
    art.innerHTML = tileArt(job, p, 0);
    const info = h('div', 'pp-kind__info');
    const name = h('span', 'pp-kind__name', p.name);
    name.append(h('span', 'pp-tier', COPY.production.tier(p.tier)));
    const meta = h('span', 'pp-kind__meta bi-num');
    if (unlocked) {
      const rate = h(
        'span',
        'has-tip',
        COPY.production.perPlot(fmt(producerRate(p, job, mods, 0)), resName(p.resource), t.unit),
      );
      rate.tabIndex = 0;
      attachTooltip(rate, () => {
        const m = collectModifiers(ctx.state(), content);
        const result = computeStat('production.rate', producerRate(p, job, [], 0), m, {
          job,
          producer: p.id,
          resource: p.resource,
        });
        return statTip(content, t.rateTip(p.name, 0), result, '/s');
      });
      meta.append(rate);
    } else if (job === 'logging') {
      meta.textContent = COPY.production.yields(resName(p.resource));
    } else {
      const dungeon =
        'unlockedByDungeon' in p && p.unlockedByDungeon
          ? content.dungeonById.get(p.unlockedByDungeon)?.name
          : null;
      meta.textContent = dungeon ? COPY.production.clearToUnlock(dungeon) : COPY.production.locked;
    }
    info.append(name, meta);
    li.append(art, info);
    if (job === 'logging' && !unlocked) {
      const btn = h('button', 'button pp-kind__action');
      btn.type = 'button';
      btn.dataset.key = `unlock-${p.id}`;
      const prices = () => treeUnlockCost(content, p.id, collectModifiers(ctx.state(), content));
      priced.push({ btn, prices });
      notes.push(() => set(btn, COPY.production.unlock(prices().map(priceText).join(', '))));
      btn.addEventListener('click', () => {
        const result = unlockTree(ctx.state(), content, p.id);
        if (result.ok) ctx.sound?.('buy');
        act(result.ok ? result.state : null);
      });
      li.append(btn);
    }
    return li;
  }

  function bought(key: string, next: GameState, tierUps: TierUp[]): void {
    act(next, key);
    const line = lines.get(key);
    line?.btn.celebrate();
    if (tierUps.some((u) => u.kind === 'mine_milestone' || u.kind === 'tree_milestone'))
      replay(line?.li, 'is-milestone', 1100);
    if (tierUps.length > 0) ctx.onTierUps?.(tierUps);
    else ctx.sound?.('buy');
  }

  function buyExpansion(job: ProductionJob): void {
    const result = buyExpansions(ctx.state(), content, job, buyCount());
    if (result.ok) bought(job + '-expansion', result.state, result.tierUps);
  }

  function buyLevels(mineId: string): void {
    const result = buyMineLevels(ctx.state(), content, mineId, buyCount());
    if (result.ok) bought('level-' + mineId, result.state, result.tierUps);
  }

  function buyTreeLevel(treeId: string): void {
    const result = buyTreeLevels(ctx.state(), content, treeId, buyCount());
    if (result.ok) bought('tree-' + treeId, result.state, result.tierUps);
  }

  function refresh(): void {
    const s = ctx.state();
    const mods = collectModifiers(s, content);
    const count = buyCount();
    const views: Array<[string, BuyLineView | null]> = [
      ...PRODUCTION_JOBS.map(
        (job) =>
          [`${job}-expansion`, expansionView(s, content, job, count, mods)] as [
            string,
            BuyLineView | null,
          ],
      ),
      ...treeLevelViews(s, content, count, mods).map(
        (v) => [`tree-${v.id}`, v] as [string, BuyLineView],
      ),
      ...mineLevelViews(s, content, count, mods).map(
        (v) => [`level-${v.id}`, v] as [string, BuyLineView],
      ),
    ];
    for (const [key, v] of views) {
      const line = lines.get(key);
      if (!line || !v) continue;
      line.btn.update(v);
      const [name, meta] = line.li.querySelectorAll<HTMLElement>('.pp-line__name, .pp-line__meta');
      set(name!, v.name);
      set(
        meta!,
        key.endsWith('expansion') ? COPY.production.owned(v.level) : COPY.production.level(v.level),
      );
      if (line.tag) {
        set(line.tag, v.milestone);
        line.tag.style.setProperty('--p', String(v.milestoneInfo?.progress ?? 0));
      }
    }
    for (const { btn, prices } of priced) {
      const ok = canAfford(s, prices());
      if (btn.disabled === ok) btn.disabled = !ok;
    }
    for (const note of notes) note();
    shelf.update();
  }

  // ---- show events ----

  ctx.director?.on('harvest', (e) => {
    const area = fieldEls[e.job];
    if (!visible() || !area) return;
    const box = area.getBoundingClientRect();
    if (box.width === 0) return;
    const now = performance.now();
    for (const p of e.plots) {
      const tile = tiles[e.job].get(p.index);
      if (!tile) continue;
      const t = tile.getBoundingClientRect();
      popGain(
        area,
        `pp-${e.job}-${p.index}`,
        p.amount,
        (t.left + t.width / 2 - box.left) / box.width,
        (t.top + 8 - box.top) / box.height,
      );
      replay(tile.querySelector('.pp-tile__art'), 'is-harvest', 400);
      if (coinThrottle.allow(p.resource, now)) {
        flyCoins({
          from: centreOf(tile),
          target: ctx.coins?.currencyGlyph(p.resource) ?? null,
          count: 1,
          onLand: () => ctx.coins?.pulseCurrency(p.resource),
        });
      }
    }
  });

  ctx.director?.on('harvestBurst', (e) => {
    const area = fieldEls[e.job];
    if (!visible() || !area) return;
    // a wave across the plots, then one big total
    [...tiles[e.job].values()].forEach((tile, i) => {
      window.setTimeout(() => replay(tile, 'is-wave', 500), i * 70);
    });
    const text = e.totals.map((t) => `+${popText(t.amount)}`).join('  ');
    popNumber(area, { kind: 'total', text, x: 0.5, y: 0.45, scale: 1.9 });
    ctx.sound?.('harvestBurst');
    for (const t of e.totals) {
      flyCoins({
        from: centreOf(area),
        target: ctx.coins?.currencyGlyph(t.resource) ?? null,
        count: 6,
        spill: true,
        onLand: () => ctx.coins?.pulseCurrency(t.resource),
      });
    }
  });

  onBuyCount(() => {
    if (visible()) refresh();
  });

  return {
    render() {
      const state = ctx.state();
      if (signature(state, content, collectModifiers(state, content)) !== last) build();
      else refresh();
    },
  };
}

function set(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}
