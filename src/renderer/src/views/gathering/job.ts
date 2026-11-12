import {
  assignWorker,
  buyMineLevels,
  buyTreeLevels,
  buyUpgrade,
  collectModifiers,
  producersOf,
  productionStageView,
  unlockTree,
  workerChoices,
  type GameState,
  type Modifier,
  type Producer,
  type ProductionJob,
  type ProductionStageView,
  type StageTarget,
  type TierUp,
} from '../../../../game';
import { mineTile, svg, treeTile } from '../../art/gems';
import { COPY } from '../../copy';
import { cardItemArt } from '../../pages/loadoutCards';
import {
  jobRateValue,
  productionRows,
  type MilestoneSegments,
  type ProductionRow,
} from '../../pages/productionModel';
import {
  harvestMoments,
  pickOptions,
  powerText,
  strikeLook,
  strikeNumberKind,
  type BurstMoment,
  type StrikeMoment,
} from '../../pages/productionStageModel';
import { createPresetsPanel, type Panel } from '../../pages/tablePanels';
import { amountText } from '../../settings/coins';
import { fmt } from '../../settings/numberFormat';
import { h } from '../../shell/shell';
import { hide as hideTip } from '../../shell/tooltip';
import { centreOf, flyCoins } from '../../stage/fly';
import { createWorkerCell, type WorkerCell } from '../../stage/harvestParty';
import { createThrottle, popText } from '../../stage/math';
import { flash, replay, shake, slowDown } from '../../stage/motion';
import { popGain, popNumber } from '../../stage/numbers';
import type { TableContext, ViewApi, ViewHandle } from '../../table/contract';
import {
  buyCount,
  createBuyButton,
  createBuyToggle,
  onBuyCount,
  type BuyButton,
} from '../../ui/buy';
import { createToolLinesPanel, type ToolLinesPanel } from '../../ui/toolLines';
import { GATHERING_COPY as T } from './copy';
import {
  gaugeLine,
  itemSvg,
  jobUpgradeChips,
  slotsLine,
  strikeSeconds,
  toolsReady,
  workerLine,
} from './jobModel';
import './job.css';

/**
 * The Logging and Mining views (UI_RULES.md §2 "The Logging and Mining views"; mockups 4c, 4e):
 * a large plate per tree kind or mine type (art, output, the bar to the next ×2, age or layer,
 * lucky strike, the worker block that opens the picker, the buy button), and the job's side
 * column (tool lines, workers with presets, the job's upgrades). The ×1 / ×10 / ×100 / Max toggle
 * sits in the title bar. Every strike nudges the worker block and pops "+n" on its plate.
 */

/** Coins flown to the header per resource per second at most. */
const COINS_PER_SECOND = 3;

const set = (node: HTMLElement, text: string): void => {
  if (node.textContent !== text) node.textContent = text;
};

interface PlateRef {
  row: ProductionRow;
  li: HTMLElement;
  worker: WorkerCell;
  tile: HTMLElement;
  art: HTMLElement;
  level: HTMLElement;
  value: HTMLElement;
  unit: HTMLElement;
  pips: HTMLElement[];
  track: HTMLElement;
  x2: HTMLElement;
  lucky: HTMLElement;
  depthName: HTMLElement;
  depthFill: HTMLElement;
  depthText: HTMLElement;
  buy?: BuyButton;
  unlock?: { btn: HTMLButtonElement; price: HTMLElement; have: HTMLElement };
}

export function createJobView(
  host: HTMLElement,
  ctx: TableContext,
  api: ViewApi,
  job: ProductionJob,
): ViewHandle {
  const { content } = ctx;
  const jobCopy = COPY.production[job];
  const coinThrottle = createThrottle(COINS_PER_SECOND, 1000);
  host.classList.add('gv-job', `gv-job--${job}`);
  api.setTools(createBuyToggle());

  const tileArt = (p: Producer, stage: number): string => {
    const gem = content.resourceById.get(p.resource)?.gem;
    if (!gem) return '';
    const tree = job === 'logging' ? content.treeById.get(p.id) : undefined;
    return svg(tree ? treeTile(tree, gem, stage) : mineTile(gem, stage));
  };

  // ---- skeleton: the places on the left, the side column on the right ----
  const layout = h('div', 'gv-layout');
  const places = h('section', 'gv-places');
  places.setAttribute('aria-label', jobCopy.tilesLabel);
  const total = h('p', 'gv-total bi-num');
  const pickEl = h('div', 'gv-pick px-panel');
  pickEl.hidden = true;
  const list = h('ul', 'gv-list');
  const flashEl = h('div', 'pp-flash');
  flashEl.setAttribute('aria-hidden', 'true');
  places.append(total, pickEl, list, flashEl);

  const side = h('aside', 'gv-side');
  const tools: ToolLinesPanel = createToolLinesPanel({
    content,
    job,
    state: ctx.state,
    apply: ctx.apply,
    sound: ctx.sound,
  });
  tools.el.classList.add('gv-panel', 'px-panel');
  const toolsReadyEl = h('span', 'gv-ready bi-num');
  tools.el.querySelector('.tr__head')?.append(toolsReadyEl);

  const workers = h('section', 'gv-panel gv-workers px-panel');
  workers.setAttribute('aria-label', T.workersTitle);
  const slots = h('p', 'gv-slots');
  const slotsRow = h('div', 'gv-slots__row');
  slotsRow.append(slots, h('span', 'gv-slots__rule bi-num', T.slotsRule));
  const presets: Panel = createPresetsPanel(ctx, job);
  const links = h('div', 'gv-links');
  const forgeBtn = h('button', 'px-btn px-btn--dark', T.openForge);
  forgeBtn.type = 'button';
  forgeBtn.addEventListener('click', () => ctx.open('forge'));
  const shopBtn = h('button', 'px-btn px-btn--dark', T.secondSlots);
  shopBtn.type = 'button';
  shopBtn.addEventListener('click', () => ctx.open('shop'));
  links.append(forgeBtn, shopBtn);
  workers.append(
    h('h2', 'gv-panel__title px-display', T.workersTitle),
    slotsRow,
    h('p', 'gv-hint', T.workersHint(job)),
    presets.el,
    links,
  );

  const upgrades = h('section', 'gv-panel gv-upgrades px-panel');
  upgrades.setAttribute('aria-label', T.upgradesTitle(jobCopy.title));
  const upgradeList = h('ul', 'gv-chips');
  const upgradeNote = h('p', 'gv-hint', T.upgradesNone);
  upgradeNote.hidden = true;
  const upgradeOwned = h('p', 'gv-hint bi-num');
  upgrades.append(
    h('h2', 'gv-panel__title px-display', T.upgradesTitle(jobCopy.title)),
    upgradeList,
    upgradeNote,
    upgradeOwned,
  );
  side.append(tools.el, workers, upgrades);
  layout.append(places, side);
  host.append(layout);
  // the host deals the title bar, then these blocks, in reading order
  places.dataset['deal'] = '';
  for (const el of [tools.el, workers, upgrades]) el.dataset['deal'] = '';

  // ---- plates ----
  let last = '';
  const refs = new Map<number, PlateRef>();
  let view: ProductionStageView = productionStageView(ctx.state(), content, job);
  let picking: string | null = null;

  function buildPlate(row: ProductionRow, p: Producer): PlateRef {
    const locked = row.kind !== 'active';
    const li = h('li', `gv-plate px-panel${locked ? ' is-locked' : ''}`);
    li.dataset['key'] = row.key;
    const head = h('div', 'gv-plate__head');
    const tile = h('div', 'gv-tile');
    const art = h('span', 'gv-tile__art');
    art.setAttribute('aria-hidden', 'true');
    art.innerHTML = tileArt(p, row.stage);
    art.style.setProperty('--d', `${((row.kindIndex * 0.37) % 3).toFixed(2)}s`);
    tile.append(art, h('span', 'pp-fx'));
    const id = h('div', 'gv-plate__id');
    const level = h('span', 'gv-plate__level', row.levelText);
    const value = h('span', 'gv-plate__value px-display');
    const unit = h('span', 'gv-plate__unit', '/s');
    const rate = h('div', 'gv-plate__rate');
    rate.append(value, unit);
    id.append(h('b', 'gv-plate__name', row.name), level, ...(locked ? [] : [rate]));
    head.append(tile, id);
    const lucky = h('span', 'gv-plate__lucky bi-num');
    lucky.hidden = true;
    const track = h('div', 'pp-seg');
    track.setAttribute('aria-hidden', 'true');
    const x2 = h('span', 'gv-plate__x2 bi-num');
    const depth = h('div', 'gv-depth');
    const depthName = h('span', 'gv-depth__name bi-num');
    const depthText = h('span', 'gv-depth__text bi-num');
    const depthBar = h('div', 'pp-dep');
    depthBar.setAttribute('aria-hidden', 'true');
    const depthFill = h('i');
    depthBar.append(depthFill);
    depth.append(depthName, depthText, depthBar);
    const worker = createWorkerCell(row.name, () => togglePick(row.id));
    worker.el.dataset['key'] = `worker-${row.id}`;
    worker.el.classList.add('gv-worker');
    const ref: PlateRef = {
      row,
      li,
      worker,
      tile,
      art,
      level,
      value,
      unit,
      pips: [],
      track,
      x2,
      lucky,
      depthName,
      depthFill,
      depthText,
    };
    if (locked) {
      li.append(head, h('p', 'gv-plate__note', row.note));
      const btn = h('button', 'buy-btn gv-buy gv-buy--locked');
      btn.type = 'button';
      btn.dataset['key'] = `unlock-${row.id}`;
      const top = h('span', 'buy-btn__top');
      const label = h('span', 'buy-btn__label', T.unlock);
      const price = h('span', 'buy-btn__price bi-num');
      top.append(label, price);
      const have = h('span', 'buy-btn__preview bi-num');
      btn.append(top, have);
      if (row.kind === 'locked-tree') {
        btn.addEventListener('click', () => {
          if (btn.getAttribute('aria-disabled') === 'true') return;
          const result = unlockTree(ctx.state(), content, row.id);
          if (!result.ok) return;
          ctx.sound('buy');
          ctx.apply(result.state);
          update();
        });
      } else {
        label.textContent = T.lockedTag;
      }
      ref.unlock = { btn, price, have };
      li.append(btn);
    } else {
      const isTree = job === 'logging';
      const buy = createBuyButton(() => (isTree ? buyTree(row.id) : buyMine(row.id)));
      buy.el.classList.add('gv-buy');
      buy.el.dataset['key'] = isTree ? `tree-${row.id}` : `level-${row.id}`;
      ref.buy = buy;
      li.append(lucky, head, track, x2, depth, worker.el, buy.el);
    }
    return ref;
  }

  function build(rows: ProductionRow[]): void {
    hideTip();
    refs.clear();
    const all = producersOf(content, job);
    list.replaceChildren(
      ...rows.map((row) => {
        const ref = buildPlate(row, all[row.kindIndex]!);
        refs.set(row.kindIndex, ref);
        return ref.li;
      }),
    );
  }

  // ---- the worker picker: a panel over the plates ----
  function togglePick(placeId: string): void {
    picking = picking === placeId ? null : placeId;
    drawPicker();
    update();
    if (picking) pickEl.scrollIntoView({ block: 'nearest' });
  }

  function drawPicker(): void {
    if (!picking) {
      pickEl.hidden = true;
      pickEl.replaceChildren();
      return;
    }
    const placeId = picking;
    const ref = [...refs.values()].find((r) => r.row.id === placeId);
    const options = pickOptions(workerChoices(ctx.state(), content, placeId));
    const head = h('div', 'gv-pick__head');
    const actions = h('span', 'gv-pick__actions');
    if (options.some((o) => o.current)) {
      const away = h('button', 'px-btn px-btn--dark', COPY.production.pickRemove);
      away.type = 'button';
      away.dataset['key'] = `pick-away-${placeId}`;
      away.addEventListener('click', () => place(placeId, null));
      actions.append(away);
    }
    const close = h('button', 'px-btn px-btn--dark', COPY.production.pickClose);
    close.type = 'button';
    close.dataset['key'] = `pick-close-${placeId}`;
    close.addEventListener('click', () => togglePick(placeId));
    actions.append(close);
    head.append(
      h('h2', 'gv-panel__title px-display', COPY.production.pickTitle(ref?.row.name ?? placeId)),
      actions,
    );
    const ul = h('ul', 'pp-pick__list');
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
      ul.append(li);
    }
    pickEl.hidden = false;
    pickEl.replaceChildren(
      head,
      options.length > 0 ? ul : h('p', 'pp-pick__empty', COPY.production.pickNone),
    );
  }

  function place(placeId: string, cardId: string | null): void {
    const result = assignWorker(ctx.state(), content, placeId, cardId);
    if (!result.ok) return;
    ctx.sound('buy');
    ctx.apply(result.state);
    picking = null;
    drawPicker();
    update();
  }

  // ---- refresh ----
  function setSegments(ref: PlateRef, seg: MilestoneSegments): void {
    if (ref.pips.length !== seg.total) {
      ref.pips = Array.from({ length: seg.total }, () => document.createElement('i'));
      ref.track.replaceChildren(...ref.pips);
    }
    ref.pips.forEach((p, i) => p.classList.toggle('is-on', i < seg.filled));
  }

  function refreshPlates(rows: ProductionRow[], mods: readonly Modifier[]): void {
    const s = ctx.state();
    const count = buyCount();
    const byKind = new Map<number, StageTarget>(view.targets.map((x) => [x.kind, x]));
    const canAdd = view.slots.used < view.slots.total;
    set(slots, slotsLine(view.slots.used, view.slots.total));
    set(total, T.rate(jobRateValue(s, content, job, mods)));
    for (const row of rows) {
      const ref = refs.get(row.kindIndex);
      if (!ref) continue;
      ref.row = row;
      const target = row.kind === 'active' ? (byKind.get(row.kindIndex) ?? null) : null;
      if (target) {
        const w = target.worker;
        const owned = w ? s.cards.owned[w.cardId] : undefined;
        ref.worker.update(
          target,
          picking === row.id,
          canAdd,
          w && owned ? itemSvg(cardItemArt(content, w.cardId, owned, s)) : '',
        );
        const sub = ref.worker.el.querySelector<HTMLElement>('.pp-w__sub');
        const every = strikeSeconds(target);
        if (every !== null) strikeEvery.set(row.kindIndex, every);
        if (sub && w)
          set(sub, workerLine(powerText(w.power), strikeEvery.get(row.kindIndex) ?? null));
        const gl = ref.worker.el.querySelector<HTMLElement>('.pp-w__gl');
        if (gl) set(gl, gaugeLine(target.gauge, target.burst.size));
        const lucky = target.lucky;
        ref.lucky.hidden = !lucky;
        if (lucky) set(ref.lucky, T.luckyTag(lucky.name, Math.ceil(lucky.secondsLeft)));
        const d = target.depth;
        set(
          ref.depthName,
          job === 'logging' ? T.ageLine(d.layer, d.max) : T.layerLine(d.layer, d.max),
        );
        ref.depthFill.style.width = `${Math.round(d.fraction * 100)}%`;
        ref.depthFill.parentElement!.title = d.atMax
          ? COPY.production.depth.deepest
          : target.dig.gt(0)
            ? COPY.production.depth.tip(fmt(d.progress), fmt(d.hardness))
            : COPY.production.depth.noWorker;
        set(
          ref.depthText,
          d.nextYieldMultiplier
            ? T.nextYield(fmt(d.nextYieldMultiplier.div(d.yieldMultiplier)))
            : T.deepest,
        );
      }
      if (row.kind === 'active') {
        set(ref.level, T.levelLine(row.buy?.level ?? 0));
        set(ref.value, row.outputValue);
        if (row.milestone) {
          setSegments(ref, row.milestone.segments);
          set(ref.x2, T.x2In(row.milestone.segments.total - row.milestone.segments.filled));
          ref.track.title = row.milestone.label;
        }
        if (row.buy && ref.buy) {
          const v = row.buy;
          ref.buy.update({
            ...v,
            label: T.levelUp(v.offer.count, count === 'max'),
            price: amountText(content, v.offer.price.resource, v.offer.price.amount),
            preview: row.previewText || v.preview,
          });
        }
      } else if (ref.unlock) {
        const u = ref.unlock;
        if (row.kind === 'locked-tree' && row.unlock) {
          set(u.price, row.unlock.amount);
          set(u.have, row.unlock.resources);
          u.btn.title = row.unlock.have;
          u.btn.setAttribute('aria-disabled', String(!row.unlock.affordable));
          u.btn.classList.toggle('is-affordable', row.unlock.affordable);
        } else {
          set(u.price, '');
          set(u.have, '');
          u.btn.setAttribute('aria-disabled', 'true');
        }
      }
    }
  }

  const strikeEvery = new Map<number, number>();
  let upgradeSig = '';
  const chipEls = new Map<string, HTMLElement>();

  function refreshSide(mods: readonly Modifier[]): void {
    const s = ctx.state();
    tools.update();
    presets.update();
    const ready = toolsReady(s, content, job, mods);
    set(toolsReadyEl, ready > 0 ? T.toolsReadyTag(ready) : '');
    const chips = jobUpgradeChips(s, content, mods, job);
    const avail = chips.filter((c) => c.status === 'available');
    const sig = JSON.stringify(avail.map((c) => c.id));
    if (sig !== upgradeSig) {
      upgradeSig = sig;
      chipEls.clear();
      upgradeList.replaceChildren(
        ...avail.map((c) => {
          const li = h('li');
          const b = h('button', 'px-btn gv-chip');
          b.type = 'button';
          b.dataset['key'] = `upgrade-${c.id}`;
          b.title = c.effect;
          b.append(h('b', '', c.name), h('span', 'bi-num', c.price));
          b.addEventListener('click', () => {
            if (b.getAttribute('aria-disabled') === 'true') return;
            const r = buyUpgrade(ctx.state(), content, c.id);
            if (!r.ok) return;
            ctx.sound('buy');
            ctx.apply(r.state);
            update();
          });
          li.append(b);
          chipEls.set(c.id, b);
          return li;
        }),
      );
    }
    for (const c of avail) {
      const b = chipEls.get(c.id);
      if (!b) continue;
      b.classList.toggle('px-btn--gold', c.affordable);
      b.classList.toggle('px-btn--dark', !c.affordable);
      b.setAttribute('aria-disabled', String(!c.affordable));
    }
    upgradeNote.hidden = chips.length > 0;
    const owned = chips.length - avail.length;
    upgradeOwned.hidden = owned === 0;
    set(upgradeOwned, T.upgradesOwned(owned));
  }

  const signature = (rows: ProductionRow[]): string =>
    JSON.stringify(rows.map((r) => [r.key, r.kind, r.stage]));

  function update(): void {
    const s = ctx.state();
    const mods = collectModifiers(s, content);
    const rows = productionRows(s, content, job, buyCount(), mods);
    view = productionStageView(s, content, job, mods);
    const sig = signature(rows);
    if (sig !== last) {
      last = sig;
      build(rows);
    }
    refreshPlates(rows, mods);
    refreshSide(mods);
  }

  function bought(id: string, next: GameState, tierUps: TierUp[]): void {
    ctx.apply(next);
    update();
    const ref = [...refs.values()].find((r) => r.row.id === id);
    ref?.buy?.celebrate();
    if (tierUps.some((u) => u.kind === 'mine_milestone' || u.kind === 'tree_milestone'))
      replay(ref?.li, 'is-milestone', 1100);
    if (tierUps.length > 0) ctx.onTierUps(tierUps);
    else ctx.sound('buy');
  }
  function buyMine(id: string): void {
    const r = buyMineLevels(ctx.state(), content, id, buyCount());
    if (r.ok) bought(id, r.state, r.tierUps);
  }
  function buyTree(id: string): void {
    const r = buyTreeLevels(ctx.state(), content, id, buyCount());
    if (r.ok) bought(id, r.state, r.tierUps);
  }

  // ---- show events ----
  const lookAt = (kind: number) =>
    strikeLook(view.targets.find((x) => x.kind === kind)?.pattern ?? { style: 'steady' });

  function strike(m: StrikeMoment): void {
    const ref = refs.get(m.kind);
    if (!ref) return;
    const box = places.getBoundingClientRect();
    if (box.width === 0) return;
    const look = lookAt(m.kind);
    ref.worker.strike(look);
    replay(ref.art, 'is-harvest', 400);
    if (look.shake || m.crit) shake(places);
    const r = ref.tile.getBoundingClientRect();
    const x = (r.left + r.width / 2 - box.left) / box.width;
    const y = (r.top + 8 - box.top) / box.height;
    if (strikeNumberKind(m) === 'crit') {
      popNumber(places, {
        kind: 'crit',
        text: `+${popText(m.amount)}`,
        x,
        y,
        scale: look.numberScale * 1.25,
      });
    } else {
      popGain(places, `gv-${job}-${m.kind}`, m.amount, x, y, look.numberScale);
    }
    if (coinThrottle.allow(m.resource, performance.now())) {
      flyCoins({
        from: centreOf(ref.tile),
        target: ctx.coins.currencyGlyph(m.resource) ?? null,
        count: 1,
        onLand: () => ctx.coins.pulseCurrency(m.resource),
      });
    }
  }

  function burst(b: BurstMoment): void {
    for (const p of b.kinds) {
      const ref = refs.get(p.kind);
      if (!ref) continue;
      ref.worker.burst();
      window.setTimeout(() => replay(ref.li, 'is-wave', 500), p.kind * 70);
    }
    flash(flashEl);
    slowDown(places, 450, 0.4);
    const box = places.getBoundingClientRect();
    const rows = list.getBoundingClientRect();
    if (box.width > 0) {
      popNumber(places, {
        kind: 'total',
        text: b.totals.map((x) => `+${popText(x.amount)}`).join('  '),
        x: (rows.left + rows.width / 2 - box.left) / box.width,
        y: (rows.top + Math.min(rows.height, 240) / 2 - box.top) / box.height,
        scale: 1.9,
      });
    }
    ctx.sound('harvestBurst');
    for (const x of b.totals) {
      flyCoins({
        from: centreOf(places),
        target: ctx.coins.currencyGlyph(x.resource) ?? null,
        count: 6,
        spill: true,
        onLand: () => ctx.coins.pulseCurrency(x.resource),
      });
    }
  }

  ctx.director.on('harvests', ({ events }) => {
    if (!api.visible()) return;
    const moments = harvestMoments(events, job);
    let at = 0;
    for (const m of moments.strikes) {
      window.setTimeout(() => strike(m), at);
      at += lookAt(m.kind).staggerMs;
    }
    if (moments.burst) {
      const b = moments.burst;
      window.setTimeout(() => burst(b), at);
    }
  });
  onBuyCount(() => {
    if (api.visible()) update();
  });

  return {
    render: update,
    opened() {
      picking = null;
      drawPicker();
    },
  };
}
