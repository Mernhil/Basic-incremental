import type { Content } from '../../../data';
import {
  Decimal,
  PRODUCTION_JOBS,
  bossStatus,
  burstView,
  collectModifiers,
  effectiveDrops,
  formatDuration,
  jobProductionPerSecond,
  loadoutHealth,
  producersOf,
  stageReadout,
  trialStatus,
  type GameState,
  type ProductionJob,
} from '../../../game';
import { fmt } from '../settings/numberFormat';
import { COPY } from '../copy';
import { bossArt, sentinelLevel } from '../art/bosses';
import { mineTile, treeTile } from '../art/gems';
import { h } from '../shell/shell';
import type { Director } from '../stage/director';
import { jitter, replay } from '../stage/motion';
import { popText } from '../stage/math';
import { popGain, popNumber } from '../stage/numbers';
import { createCard, type CardView } from '../ui/card';
import { fitCard } from '../ui/pixelFit';
import { formatRate } from './buyModel';
import { loadoutProps } from './loadoutCards';
import { productionRows } from './productionModel';
import './home.css';

/**
 * Home (UI_RULES.md §2, "Home"): a command centre of three equal pixel panels side by side, Fight,
 * Logging and Mining. Each panel has its title with a short line on the right, an inset scene
 * with a floor strip (the job's main card at 1x with the boss, or with its three tiles), one big
 * number, its gauge and its lines, and a gold button that opens the page. The goal tracker sits
 * above, in the shell.
 */

export interface HomeContext {
  content: Content;
  state: () => GameState;
  director: Director;
  visible: () => boolean;
  open: (page: 'dungeons' | 'production') => void;
}

/** Tiles drawn per job panel (every job has three kinds). */
const MAX_TILES = 3;
/** The rows and the "ready to buy" count are worked out at most this often (ms). */
const ROWS_EVERY_MS = 400;

type Mods = ReturnType<typeof collectModifiers>;

interface Meter {
  gauge: HTMLElement;
  fill: HTMLElement;
  count: HTMLElement;
}

interface Panel {
  where: HTMLElement;
  /** The scene's field: the card and the boss or tiles stand here; pops are drawn over it. */
  field: HTMLElement;
  bigNumber: HTMLElement;
  bigLabel: HTMLElement;
  meter: Meter;
  lines: HTMLElement;
  go: HTMLButtonElement;
  slot: HTMLElement;
  cardKey: string;
  card: CardView | null;
}

const set = (node: HTMLElement, text: string): void => {
  if (node.textContent !== text) node.textContent = text;
};

function line(label: string): { li: HTMLElement; value: HTMLElement } {
  const li = h('li', 'hm-line');
  const value = h('b', 'hm-line__value bi-num');
  li.append(h('span', 'hm-line__name', label), value);
  return { li, value };
}

function setMeter(m: Meter, fraction: number, count: string): void {
  const pct = Math.round(Math.min(1, Math.max(0, fraction)) * 100);
  m.fill.style.width = `${pct}%`;
  m.gauge.classList.toggle('is-full', fraction > 0.92);
  m.gauge.setAttribute('aria-valuenow', String(pct));
  set(m.count, count);
}

export function createHomePage(page: HTMLElement, ctx: HomeContext): { render(): void } {
  const { content } = ctx;
  // the panels carry the sighted headings; the page name stays for screen readers
  page.querySelector<HTMLElement>('.shell-page__title')?.classList.add('sr-only');
  const grid = h('div', 'hm-grid');
  page.append(grid);

  function buildPanel(
    kind: 'fight' | ProductionJob,
    title: string,
    meterLabel: string,
    goLabel: string,
    target: 'dungeons' | 'production',
  ): Panel & { el: HTMLElement; stats: HTMLElement } {
    const el = h('section', `hm-panel px-panel hm-panel--${kind}`);
    el.setAttribute('aria-label', title);
    const head = h('header', 'hm-panel__head');
    const where = h('span', 'hm-panel__where');
    head.append(h('h2', 'hm-panel__title px-display', title), where);

    // the scene: an inset well with the cards standing on a floor strip
    const scene = h('div', 'hm-scene px-well');
    const field = h('div', 'hm-field');
    field.setAttribute('role', 'img');
    field.setAttribute('aria-label', COPY.home.sceneLabel(title));
    // the main card stands at 1x: 132 CSS px on a 100 % screen, whole device pixels
    fitCard(field, { want: 132 });
    const slot = h('div', 'hm-slot');
    field.append(slot);
    const floor = h('i', 'hm-floor');
    floor.setAttribute('aria-hidden', 'true');
    scene.append(field, floor);

    const big = h('div', 'hm-big');
    const bigNumber = h('b', 'hm-big__n px-display bi-num');
    const bigLabel = h('span', 'hm-big__label');
    big.append(bigNumber, bigLabel);

    const stats = h('div', 'hm-stats');
    const meterEl = h('div', 'hm-meter');
    const top = h('div', 'hm-meter__top');
    const count = h('b', 'bi-num');
    top.append(h('span', '', meterLabel), count);
    const gauge = h('div', 'hm-gauge');
    gauge.setAttribute('role', 'meter');
    gauge.setAttribute('aria-label', meterLabel);
    gauge.setAttribute('aria-valuemin', '0');
    gauge.setAttribute('aria-valuemax', '100');
    const fill = h('i');
    gauge.append(fill);
    meterEl.append(top, gauge);

    const lines = h('ul', 'hm-lines');
    const go = h('button', 'hm-go px-btn px-btn--gold px-display', goLabel);
    go.type = 'button';
    go.addEventListener('click', () => ctx.open(target));

    el.append(head, scene, big, ...(kind === 'fight' ? [stats] : []), meterEl, lines, go);
    grid.append(el);
    return {
      el,
      stats,
      where,
      field,
      bigNumber,
      bigLabel,
      meter: { gauge, fill, count },
      lines,
      go,
      slot,
      cardKey: '',
      card: null,
    };
  }

  const fight = buildPanel(
    'fight',
    COPY.home.fight,
    COPY.dungeons.burst,
    COPY.home.openDungeons,
    'dungeons',
  );
  const jobs = {
    logging: buildPanel(
      'logging',
      COPY.production.logging.title,
      COPY.production.harvestBurst,
      COPY.home.openProduction,
      'production',
    ),
    mining: buildPanel(
      'mining',
      COPY.production.mining.title,
      COPY.production.harvestBurst,
      COPY.home.openProduction,
      'production',
    ),
  } as const;

  // ---- the fight panel's own pieces ----
  const stat = (label: string): HTMLElement => {
    const tile = h('div', 'hm-stat px-tile');
    const value = h('b', 'hm-stat__v px-display bi-num');
    tile.append(h('span', 'hm-stat__k', label), value);
    fight.stats.append(tile);
    return value;
  };
  const kpmOut = stat(COPY.arena.kpm);
  const ttkOut = stat(COPY.arena.ttk);
  const healthOut = stat(COPY.home.partyHealth);
  const rare = line(COPY.home.rareDrop);
  rare.li.classList.add('hm-line--rare');
  fight.lines.append(rare.li);

  // the boss column: its HP bar and bars-left caption over the boss at 1x
  const bossCol = h('div', 'hm-bosscol');
  const hpTrack = h('div', 'hm-hp');
  hpTrack.setAttribute('role', 'meter');
  hpTrack.setAttribute('aria-valuemin', '0');
  hpTrack.setAttribute('aria-valuemax', '100');
  const hpUnder = h('i', 'hm-hp__under');
  const hpFill = h('i', 'hm-hp__fill');
  hpTrack.append(hpUnder, hpFill);
  const hpCaption = h('span', 'hm-hp__caption');
  const bossSlot = h('div', 'hm-bossslot');
  bossCol.append(hpTrack, hpCaption, bossSlot);
  fight.field.append(bossCol);

  let fightKey = '';

  /** A panel's main card at 1x, redrawn only when the card or its rank changes. */
  function drawCard(panel: Panel, s: GameState, job: 'fighting' | ProductionJob, mods: Mods): void {
    const id = s.cards.loadouts[job].main;
    const owned = id ? s.cards.owned[id] : undefined;
    const key = JSON.stringify([id, owned?.tier, owned?.stars, owned?.level, s.weaponSkins]);
    if (key === panel.cardKey) return;
    panel.cardKey = key;
    const props = id ? loadoutProps(content, s, id, 'main', mods) : null;
    panel.slot.classList.toggle('is-empty', !props);
    if (!props) {
      panel.card = null;
      panel.slot.replaceChildren(h('span', 'hm-empty', COPY.table.emptyMain));
      return;
    }
    if (panel.card) panel.card.update(props);
    else {
      panel.card = createCard(props);
      panel.slot.replaceChildren(panel.card.el);
    }
  }

  function renderFight(s: GameState, mods: Mods): void {
    const id = s.activeDungeonId;
    const dungeon = id ? content.dungeonById.get(id) : undefined;
    const trial = id ? content.trialById.get(id) : undefined;
    const level = trial ? sentinelLevel(Math.min(trialStatus(s, content)?.score ?? 0, 1)) : 0;
    const art = dungeon?.boss.art ?? trial?.target.art;
    const bossName = dungeon?.boss.name ?? trial?.target.name ?? COPY.home.noBoss;
    drawCard(fight, s, 'fighting', mods);

    const key = `${art ?? ''}:${level}`;
    if (key !== fightKey) {
      fightKey = key;
      bossSlot.innerHTML = art
        ? `<div class="hm-boss"><svg viewBox="-6 -8 112 112" aria-hidden="true" focusable="false">${bossArt(art, level)}</svg></div>`
        : '';
    }
    bossCol.hidden = !art;

    const where = dungeon?.name ?? trial?.name ?? '';
    set(fight.where, where);

    // the boss's life: the bar in play over the next one, the bars left in the caption
    const status = bossStatus(s, content, mods);
    hpTrack.hidden = !status;
    hpCaption.hidden = !status;
    if (status) {
      const bars = status.bars;
      const color = (i: number): string => `var(--bi-hp-${((i % 6) + 6) % 6})`;
      hpFill.style.background = color(bars.index);
      hpFill.style.width = `${(bars.fraction * 100).toFixed(1)}%`;
      hpUnder.style.background = bars.remaining > 1 ? color(bars.index - 1) : 'transparent';
      const text = COPY.home.barsLeft(bossName, bars.remaining);
      hpTrack.setAttribute('aria-valuenow', String(Math.round(bars.fraction * 100)));
      hpTrack.setAttribute('aria-label', text);
      set(hpCaption, text);
    }

    const r = stageReadout(s, content, mods);
    set(fight.bigNumber, art ? fmt(r.averageDps) : '—');
    set(fight.bigLabel, COPY.home.damagePerSecond);
    set(kpmOut, formatRate(r.killsPerMinute));
    set(ttkOut, r.secondsPerKill === null ? '—' : formatDuration(r.secondsPerKill * 1000));
    const lh = loadoutHealth(s, content, mods);
    const pct = Math.round(lh.current.div(Decimal.max(lh.max, 1e-9)).toNumber() * 100);
    set(healthOut, art ? `${Math.min(100, Math.max(0, pct))}%` : '—');

    // the signature attack gauge with its count
    const gv = burstView(s, content, 'fighting', mods);
    const n = Math.min(gv.size, Math.floor(gv.gauge));
    setMeter(fight.meter, gv.fraction, COPY.home.gaugeCount(n, gv.size));

    // the rare drop and how close its guarantee is
    rare.li.hidden = !(dungeon && status);
    if (dungeon && status) {
      const item =
        content.cosmeticById.get(dungeon.drops.rare.itemId)?.name ?? dungeon.drops.rare.itemId;
      const threshold = effectiveDrops(dungeon, mods, content).rare.pityThreshold;
      set(rare.value, COPY.home.rarePity(item, status.pity, threshold));
    }
    fight.go.setAttribute(
      'aria-label',
      where ? `${COPY.home.openDungeons}: ${where}` : COPY.home.openDungeons,
    );
  }

  // ---- the job panels ----
  const tileKeys: Record<ProductionJob, string> = { logging: '', mining: '' };
  /** Kind index -> tile element, per job. */
  const tileAt: Record<ProductionJob, Map<number, HTMLElement>> = {
    logging: new Map(),
    mining: new Map(),
  };
  const tilesEl = {} as Record<ProductionJob, HTMLElement>;
  const rowLines = {} as Record<ProductionJob, Array<ReturnType<typeof line>>>;
  const rowCache = {} as Record<ProductionJob, ReturnType<typeof productionRows>>;
  const readyCount: Record<ProductionJob, number> = { logging: 0, mining: 0 };
  for (const job of PRODUCTION_JOBS) {
    tilesEl[job] = h('div', 'hm-tiles');
    jobs[job].field.append(tilesEl[job]);
    rowLines[job] = [];
  }
  let rowsAt = -Infinity;

  function renderJob(s: GameState, job: ProductionJob, mods: Mods, refresh: boolean): void {
    const ui = jobs[job];
    drawCard(ui, s, job, mods);
    if (refresh || !rowCache[job]) {
      const rows = productionRows(s, content, job, 1, mods);
      rowCache[job] = rows;
      readyCount[job] = rows.filter((r) =>
        r.kind === 'active' ? Boolean(r.buy?.offer.affordable) : Boolean(r.unlock?.affordable),
      ).length;
    }
    const rows = rowCache[job];
    const all = producersOf(content, job);

    // the three tiles at 1x: a locked kind is greyed
    const tileKey = JSON.stringify(
      rows.slice(0, MAX_TILES).map((r) => [r.kindIndex, r.kind === 'active', r.stage]),
    );
    if (tileKey !== tileKeys[job]) {
      tileKeys[job] = tileKey;
      tileAt[job].clear();
      const tiles: HTMLElement[] = [];
      rows.slice(0, MAX_TILES).forEach((row, index) => {
        const p = all[row.kindIndex];
        const gem = p ? content.resourceById.get(p.resource)?.gem : undefined;
        if (!p || !gem) return;
        const tile = h(
          'span',
          `hm-tile hm-tile--${index}${row.kind === 'active' ? '' : ' is-locked'}`,
        );
        tile.style.setProperty('--d', `${(index * 0.37).toFixed(2)}s`);
        const tree = job === 'logging' ? content.treeById.get(p.id) : undefined;
        tile.innerHTML = `<svg viewBox="-6 -6 112 112" aria-hidden="true" focusable="false">${tree ? treeTile(tree, gem, row.stage) : mineTile(gem, row.stage)}</svg>`;
        tiles.push(tile);
        tileAt[job].set(row.kindIndex, tile);
      });
      tilesEl[job].replaceChildren(...tiles);
    }

    // one line per kind with its rate; a locked kind says "locked"
    if (rowLines[job].length !== rows.length) {
      rowLines[job] = rows.map((r) => line(r.name));
      ui.lines.replaceChildren(...rowLines[job].map((l) => l.li));
    }
    rows.forEach((r, i) => {
      const l = rowLines[job][i]!;
      const locked = r.kind !== 'active';
      l.li.classList.toggle('is-locked', locked);
      set(l.value, locked ? COPY.home.kindLocked : COPY.table.perSecond(r.outputValue));
    });

    const total = Object.values(jobProductionPerSecond(s, content, job, mods)).reduce(
      (sum, v) => sum.add(v),
      new Decimal(0),
    );
    set(ui.where, COPY.home.readyToBuy(readyCount[job]));
    set(ui.bigNumber, fmt(total));
    set(ui.bigLabel, COPY.home.gemsPerSecond);
    const bv = burstView(s, content, job, mods);
    const n = Math.min(bv.size, Math.floor(bv.gauge));
    setMeter(ui.meter, bv.fraction, COPY.home.gaugeCount(n, bv.size));
    ui.go.setAttribute(
      'aria-label',
      `${COPY.home.openProduction}: ${COPY.production[job].title}, ${COPY.production.gemsPerSecond(fmt(total))}`,
    );
  }

  ctx.director.on('hit', (e) => {
    if (!ctx.visible()) return;
    replay(fight.field.querySelector('.hm-boss'), 'is-hit', 220);
    popNumber(fight.field, {
      kind: e.crit ? 'crit' : 'hit',
      text: popText(e.damage),
      x: jitter(0.66, 0.9),
      y: jitter(0.3, 0.45),
      scale: Math.min(1.4, e.scale * 0.8),
    });
  });
  ctx.director.on('kill', () => {
    if (ctx.visible()) replay(fight.field.querySelector('.hm-boss'), 'is-popping', 700);
  });
  ctx.director.on('harvest', (e) => {
    if (!ctx.visible()) return;
    const field = jobs[e.job].field;
    const box = field.getBoundingClientRect();
    for (const p of e.plots) {
      const tile = tileAt[e.job].get(p.index);
      if (!tile || box.width === 0) continue;
      const t = tile.getBoundingClientRect();
      popGain(
        field,
        `home-${e.job}-${p.index}`,
        p.amount,
        (t.left + t.width / 2 - box.left) / box.width,
        (t.top - box.top) / box.height + 0.05,
        0.75,
      );
      replay(tile, 'is-harvest', 400);
    }
  });

  return {
    render() {
      const s = ctx.state();
      const mods = collectModifiers(s, content);
      const now = performance.now();
      const refresh = now - rowsAt >= ROWS_EVERY_MS;
      if (refresh) rowsAt = now;
      renderFight(s, mods);
      for (const job of PRODUCTION_JOBS) renderJob(s, job, mods, refresh);
    },
  };
}
