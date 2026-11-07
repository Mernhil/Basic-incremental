import type { Content } from '../../../data';
import {
  Decimal,
  PRODUCTION_JOBS,
  assignPlot,
  buyExpansion,
  buyMineLevel,
  canAfford,
  collectModifiers,
  computeStat,
  expansionCost,
  formatDecimal,
  isProducerUnlocked,
  mineLevel,
  mineLevelCost,
  plotCapacity,
  plots,
  producerRate,
  producersOf,
  treeUnlockCost,
  unlockTree,
  type GameState,
  type Modifier,
  type Price,
  type Producer,
  type ProductionJob,
  type ProductionResult,
} from '../../../game';
import { COPY } from '../copy';
import { frame, h } from '../shell/shell';
import { statTip } from '../shell/stats';
import { attachTooltip, hide as hideTip } from '../shell/tooltip';
import { mineTile, svg, treeTile } from '../art/gems';
import './production.css';

const EMBLEM = {
  logging: '<path d="M50 10 76 46H62L82 70H18L38 46H24Z"/><path d="M44 70H56V90H44Z"/>',
  mining: '<path d="M14 70 26 38 46 26 70 30 86 52 82 76 54 86 28 84Z"/>',
  empty: '<path d="M50 32v36M32 50h36"/>',
} as const;

export interface PageContext {
  content: Content;
  state: () => GameState;
  /** Applies a new state produced by a pure game function. */
  apply: (state: GameState) => void;
}

function art(kind: keyof typeof EMBLEM, cls = ''): HTMLElement {
  const box = h('span', `pp-art ${cls}`.trim());
  box.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true">${EMBLEM[kind]}</svg>`;
  return box;
}

const amount = (d: Decimal): string => formatDecimal(d);

/** Everything that changes the page's structure. Resource amounts are not in it. */
function signature(state: GameState, content: Content, mods: readonly Modifier[]): string {
  return JSON.stringify([
    PRODUCTION_JOBS.map((job) => plots(state, content, job, mods)),
    state.production.unlockedTrees,
    state.production.mineLevels,
    state.clearedDungeons,
  ]);
}

export function createProductionPage(page: HTMLElement, ctx: PageContext): { render(): void } {
  const { content } = ctx;
  const priceText = (p: Price): string =>
    `${amount(p.amount)} ${content.resourceById.get(p.resource)?.name ?? p.resource}`;

  /** The faceted tree or mine tile for a producer (DESIGN.md 13); the line emblem if it has no gem art. */
  const producerArt = (job: ProductionJob, p: Producer, cls = ''): HTMLElement => {
    const gem = content.resourceById.get(p.resource)?.gem;
    const tree = job === 'logging' ? content.treeById.get(p.id) : undefined;
    if (!gem || (job === 'logging' && !tree)) return art(job, cls);
    const box = h('span', `pp-art pp-art--tile ${cls}`.trim());
    box.innerHTML = svg(tree ? treeTile(tree, gem) : mineTile(gem));
    return box;
  };

  const cols = h('div', 'pp-cols');
  page.append(cols);

  /** Buttons whose enabled state depends on current resources; refreshed every tick. */
  let priced: Array<{ btn: HTMLButtonElement; prices: () => Price[] }> = [];
  let notes: Array<{ el: HTMLElement; text: () => string }> = [];
  let last = '';
  let openMenu: { close(): void } | null = null;

  const act = (result: ProductionResult, focusKey?: string): void => {
    if (!result.ok) return; // buttons are disabled when an action cannot succeed
    ctx.apply(result.state);
    build(focusKey);
  };

  function build(focusKey?: string): void {
    openMenu?.close();
    hideTip();
    const state = ctx.state();
    const mods = collectModifiers(state, content);
    last = signature(state, content, mods);
    priced = [];
    notes = [];
    cols.replaceChildren(...PRODUCTION_JOBS.map((job) => ledger(job, state, mods)));
    if (focusKey) cols.querySelector<HTMLElement>(`[data-key="${focusKey}"]`)?.focus();
  }

  function rateOf(p: Producer, job: ProductionJob, state: GameState, mods: readonly Modifier[]) {
    return producerRate(p, job, mods, job === 'mining' ? mineLevel(state, p.id) : 0);
  }

  function ledger(job: ProductionJob, state: GameState, mods: readonly Modifier[]): HTMLElement {
    const t = COPY.production[job];
    const list = plots(state, content, job, mods);
    const capacity = plotCapacity(state, content, job, mods);
    const used = list.filter((id) => id !== null).length;
    const { el, body } = frame(t.title, t.capacity(used, capacity));
    el.classList.add('pp-ledger');
    el.dataset.job = job;

    // output summary, refreshed every tick
    const summary = h('p', 'pp-summary bi-num');
    notes.push({
      el: summary,
      text: () => {
        const s = ctx.state();
        const m = collectModifiers(s, content);
        const parts: string[] = [];
        const totals = new Map<string, Decimal>();
        plots(s, content, job, m).forEach((id) => {
          if (!id) return;
          const p = producersOf(content, job).find((x) => x.id === id)!;
          totals.set(
            p.resource,
            (totals.get(p.resource) ?? new Decimal(0)).add(rateOf(p, job, s, m)),
          );
        });
        for (const [res, v] of totals) {
          parts.push(
            COPY.production.perSecond(amount(v), content.resourceById.get(res)?.name ?? res),
          );
        }
        return parts.length ? parts.join(' · ') : t.idle;
      },
    });

    // plot tiles
    const grid = h('ul', 'pp-plots');
    grid.setAttribute('aria-label', t.plotsLabel);
    list.forEach((id, index) => grid.append(plotTile(job, index, id, state, mods)));
    const buy = h('li', 'pp-plot');
    const buyBtn = h('button', 'pp-plot__btn pp-plot__btn--buy');
    buyBtn.type = 'button';
    buyBtn.dataset.key = `${job}-buy`;
    const buyCost = h('span', 'pp-plot__rate bi-num');
    buyBtn.append(art('empty', 'pp-art--empty'), h('span', 'pp-plot__name', t.newPlot), buyCost);
    const buyPrice = () => [expansionCost(ctx.state(), content, job)];
    priced.push({ btn: buyBtn, prices: buyPrice });
    notes.push({ el: buyCost, text: () => priceText(buyPrice()[0]!) });
    buyBtn.addEventListener('click', () =>
      act(buyExpansion(ctx.state(), content, job), `${job}-buy`),
    );
    buy.append(buyBtn);
    grid.append(buy);

    // kinds
    const kinds = h('ul', 'pp-kinds');
    kinds.setAttribute('aria-label', t.kindsLabel);
    for (const p of producersOf(content, job)) kinds.append(kindRow(job, p, list, state, mods));

    body.append(summary, grid, kinds);
    return el;
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
    const btn = h('button', 'pp-plot__btn');
    btn.type = 'button';
    btn.dataset.key = `${job}-plot-${index}`;
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');
    const p = id ? producersOf(content, job).find((x) => x.id === id) : undefined;
    if (p) {
      btn.append(
        producerArt(job, p),
        h('span', 'pp-plot__name', p.name),
        h(
          'span',
          'pp-plot__rate bi-num',
          COPY.production.rate(amount(rateOf(p, job, state, mods))),
        ),
      );
      btn.setAttribute('aria-label', t.plotLabel(index + 1, p.name));
    } else {
      btn.classList.add('pp-plot__btn--empty');
      btn.append(
        art('empty', 'pp-art--empty'),
        h('span', 'pp-plot__name', t.empty),
        h('span', 'pp-plot__rate', ''),
      );
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
      act(assignPlot(ctx.state(), content, job, index, pid), `${job}-plot-${index}`);
    };
    for (const p of producersOf(content, job)) {
      const unlocked = isProducerUnlocked(state, content, job, p.id);
      const item = h('button', 'pp-menu__item');
      item.type = 'button';
      item.setAttribute('role', 'menuitemradio');
      item.setAttribute('aria-checked', String(p.id === current));
      item.append(
        h('span', '', p.name),
        h(
          'span',
          'pp-menu__meta bi-num',
          unlocked
            ? COPY.production.rate(amount(rateOf(p, job, state, mods)))
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

  function kindRow(
    job: ProductionJob,
    p: Producer,
    list: (string | null)[],
    state: GameState,
    mods: readonly Modifier[],
  ): HTMLElement {
    const t = COPY.production[job];
    const li = h('li', 'pp-kind');
    const unlocked = isProducerUnlocked(state, content, job, p.id);
    if (!unlocked) li.classList.add('pp-kind--locked');
    const info = h('div', 'pp-kind__info');
    const name = h('span', 'pp-kind__name', p.name);
    name.append(h('span', 'pp-tier', COPY.production.tier(p.tier)));
    const level = job === 'mining' ? mineLevel(state, p.id) : 0;
    if (job === 'mining' && unlocked)
      name.append(h('span', 'pp-kind__level', COPY.production.level(level)));
    const resource = content.resourceById.get(p.resource)?.name ?? p.resource;
    const count = list.filter((x) => x === p.id).length;
    const meta = h('span', 'pp-kind__meta bi-num');
    if (unlocked) {
      const rate = h(
        'span',
        'has-tip',
        COPY.production.perPlot(amount(rateOf(p, job, state, mods)), resource, t.unit),
      );
      rate.tabIndex = 0;
      attachTooltip(rate, () => {
        const s = ctx.state();
        const m = collectModifiers(s, content);
        const lv = job === 'mining' ? mineLevel(s, p.id) : 0;
        // the level bonus is part of the base the rate modifiers apply to
        const base = producerRate(p, job, [], lv);
        const result = computeStat('production.rate', base, m, {
          job,
          producer: p.id,
          resource: p.resource,
        });
        return statTip(content, t.rateTip(p.name, lv), result, '/s');
      });
      meta.append(rate, document.createTextNode(` · ${t.inUse(count)}`));
    } else if (job === 'logging') {
      meta.textContent = COPY.production.yields(resource);
    } else {
      const dungeon =
        'unlockedByDungeon' in p && p.unlockedByDungeon
          ? content.dungeonById.get(p.unlockedByDungeon)?.name
          : null;
      meta.textContent = dungeon ? COPY.production.clearToUnlock(dungeon) : COPY.production.locked;
    }
    info.append(name, meta);
    li.append(producerArt(job, p, unlocked ? '' : 'pp-art--locked'), info);

    if (job === 'logging' && !unlocked) {
      const btn = h('button', 'button pp-kind__action');
      btn.type = 'button';
      btn.dataset.key = `unlock-${p.id}`;
      const prices = () => treeUnlockCost(content, p.id, collectModifiers(ctx.state(), content));
      priced.push({ btn, prices });
      notes.push({
        el: btn,
        text: () => COPY.production.unlock(prices().map(priceText).join(', ')),
      });
      btn.addEventListener('click', () => act(unlockTree(ctx.state(), content, p.id)));
      li.append(btn);
    } else if (job === 'mining' && unlocked) {
      const btn = h('button', 'button pp-kind__action');
      btn.type = 'button';
      btn.dataset.key = `level-${p.id}`;
      const prices = () => {
        const price = mineLevelCost(ctx.state(), content, p.id);
        return price ? [price] : [];
      };
      priced.push({ btn, prices });
      notes.push({
        el: btn,
        text: () => COPY.production.levelUp(prices().map(priceText).join(', ')),
      });
      btn.addEventListener('click', () =>
        act(buyMineLevel(ctx.state(), content, p.id), `level-${p.id}`),
      );
      li.append(btn);
    }
    return li;
  }

  function refresh(): void {
    const state = ctx.state();
    for (const { btn, prices } of priced) {
      const ok = canAfford(state, prices());
      if (btn.disabled === ok) btn.disabled = !ok;
    }
    for (const { el, text } of notes) {
      const value = text();
      if (el.textContent !== value) el.textContent = value;
    }
  }

  return {
    render() {
      const state = ctx.state();
      if (signature(state, content, collectModifiers(state, content)) !== last) build();
      refresh();
    },
  };
}
