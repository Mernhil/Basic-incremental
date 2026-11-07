import type { Content } from '../../../data';
import {
  PRODUCTION_JOBS,
  collectModifiers,
  formatDecimal,
  jobProductionPerSecond,
  plots,
  producersOf,
  stageReadout,
  trialStatus,
  type GameState,
  type ProductionJob,
} from '../../../game';
import { COPY } from '../copy';
import { bossArt, sentinelLevel } from '../art/bosses';
import { mineTile, treeTile } from '../art/gems';
import { h } from '../shell/shell';
import type { Director } from '../stage/director';
import { jitter, replay } from '../stage/motion';
import { popText } from '../stage/math';
import { popGain, popNumber } from '../stage/numbers';
import './home.css';

/**
 * Home (DESIGN.md 14, A3 A command centre): three live mini-stages (fight, logging, mining) with
 * their rates; clicking one opens its page. The goal tracker joins on top in Phase 2 (E8).
 */

export interface HomeContext {
  content: Content;
  state: () => GameState;
  director: Director;
  visible: () => boolean;
  open: (page: 'dungeons' | 'production') => void;
}

/** Tiles drawn per mini-stage at most. */
const MAX_TILES = 5;

export function createHomePage(page: HTMLElement, ctx: HomeContext): { render(): void } {
  const { content } = ctx;
  const grid = h('div', 'hm-grid');
  page.append(grid);

  const mini = (
    kind: 'fight' | ProductionJob,
    title: string,
    target: 'dungeons' | 'production',
  ) => {
    const btn = h('button', `hm-stage hm-stage--${kind}`);
    btn.type = 'button';
    const scene = h('div', 'hm-stage__scene');
    const label = h('span', 'hm-stage__title', title);
    const where = h('span', 'hm-stage__where');
    const rate = h('span', 'hm-stage__rate bi-num');
    const info = h('span', 'hm-stage__info');
    info.append(label, where, rate);
    btn.append(scene, info);
    btn.addEventListener('click', () => ctx.open(target));
    grid.append(btn);
    return { btn, scene, where, rate };
  };

  const fight = mini('fight', COPY.home.fight, 'dungeons');
  const jobs = {
    logging: mini('logging', COPY.production.logging.title, 'production'),
    mining: mini('mining', COPY.production.mining.title, 'production'),
  } as const;

  let fightKey = '';
  const tileKeys: Record<ProductionJob, string> = { logging: '', mining: '' };
  /** Plot index -> tile element, per job (only the first MAX_TILES plots are drawn). */
  const tileAt: Record<ProductionJob, Map<number, HTMLElement>> = {
    logging: new Map(),
    mining: new Map(),
  };

  function renderFight(s: GameState): void {
    const id = s.activeDungeonId;
    const dungeon = id ? content.dungeonById.get(id) : undefined;
    const trial = id ? content.trialById.get(id) : undefined;
    const level = trial ? sentinelLevel(Math.min(trialStatus(s, content)?.score ?? 0, 1)) : 0;
    const art = dungeon?.boss.art ?? trial?.target.art;
    const key = `${art ?? ''}:${level}`;
    if (key !== fightKey) {
      fightKey = key;
      fight.scene.innerHTML = art
        ? `<div class="hm-boss"><svg viewBox="-8 -10 116 116" aria-hidden="true" focusable="false">${bossArt(art, level)}</svg></div>`
        : '';
      fight.scene.append(h('i', 'hm-floor'));
    }
    const where = dungeon?.name ?? trial?.name ?? COPY.home.nothingFought;
    set(fight.where, where);
    const r = stageReadout(s, content);
    set(fight.rate, art ? COPY.home.dps(formatDecimal(r.averageDps)) : '');
    fight.btn.setAttribute('aria-label', `${COPY.home.fight}: ${where}. ${COPY.home.openDungeons}`);
  }

  function renderJob(s: GameState, job: ProductionJob): void {
    const ui = jobs[job];
    const mods = collectModifiers(s, content);
    const list = plots(s, content, job, mods);
    const key = JSON.stringify(list.slice(0, MAX_TILES));
    if (key !== tileKeys[job]) {
      tileKeys[job] = key;
      tileAt[job].clear();
      const row = h('div', 'hm-tiles');
      list.slice(0, MAX_TILES).forEach((id, index) => {
        const p = id ? producersOf(content, job).find((x) => x.id === id) : undefined;
        const gem = p ? content.resourceById.get(p.resource)?.gem : undefined;
        if (!p || !gem) return;
        const tile = h('span', 'hm-tile');
        tile.style.setProperty('--d', `${(index * 0.37).toFixed(2)}s`);
        const tree = job === 'logging' ? content.treeById.get(p.id) : undefined;
        tile.innerHTML = `<svg viewBox="-6 -6 112 112" aria-hidden="true" focusable="false">${tree ? treeTile(tree, gem) : mineTile(gem)}</svg>`;
        row.append(tile);
        tileAt[job].set(index, tile);
      });
      ui.scene.replaceChildren(row, h('i', 'hm-floor'));
      if (tileAt[job].size === 0) ui.scene.append(h('span', 'hm-empty', COPY.home.idleJob));
    }
    const rates = Object.entries(jobProductionPerSecond(s, content, job, mods)).map(([res, v]) =>
      COPY.table.perSecond(`${formatDecimal(v)} ${content.resourceById.get(res)?.name ?? res}`),
    );
    const total = list.filter(Boolean).length;
    set(ui.where, job === 'logging' ? COPY.table.plots(total) : COPY.table.slots(total));
    set(ui.rate, rates.join(' · '));
    ui.btn.setAttribute(
      'aria-label',
      `${COPY.production[job].title}: ${rates.join(', ') || COPY.home.idleJob}. ${COPY.home.openProduction}`,
    );
  }

  ctx.director.on('hit', (e) => {
    if (!ctx.visible()) return;
    const boss = fight.scene.querySelector('.hm-boss');
    replay(boss, 'is-hit', 220);
    popNumber(fight.scene, {
      kind: e.crit ? 'crit' : 'hit',
      text: popText(e.damage),
      x: jitter(0.35, 0.65),
      y: jitter(0.25, 0.45),
      scale: Math.min(1.4, e.scale * 0.8),
    });
  });
  ctx.director.on('kill', () => {
    if (ctx.visible()) replay(fight.scene.querySelector('.hm-boss'), 'is-popping', 700);
  });
  ctx.director.on('harvest', (e) => {
    if (!ctx.visible()) return;
    const scene = jobs[e.job].scene;
    const box = scene.getBoundingClientRect();
    for (const p of e.plots) {
      const tile = tileAt[e.job].get(p.index);
      if (!tile || box.width === 0) continue;
      const t = tile.getBoundingClientRect();
      popGain(
        scene,
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
      renderFight(s);
      for (const job of PRODUCTION_JOBS) renderJob(s, job);
    },
  };
}

function set(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}
