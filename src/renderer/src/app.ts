import { ContentValidationError, loadContent, type Content } from '../../data';
import {
  Decimal,
  GameLoop,
  SaveError,
  bossMaxHp,
  burstStats,
  cardInfo,
  effectiveDamage,
  hitDamage,
  collectModifiers,
  damageStat as combatDamageStat,
  createInitialState,
  createSaveText,
  defaultRng,
  exportSaveString,
  formatDecimal,
  formatDuration,
  hpBarState,
  importSaveString,
  loadBestSave,
  PRODUCTION_JOBS,
  mineLevel,
  producerCounts,
  producerRate,
  producersOf,
  resolveCard,
  resolveGlobal,
  simulateOffline,
  type CardRole,
  type GameState,
  type Modifier,
  type Producer,
  type ProductionJob,
  type OfflineSummary,
  type TickReport,
} from '../../game';
import { COPY } from './copy';
import { applyGlobalTheme, assertVisualsImplemented } from './theme/apply';
import { playHit, showTick } from './theme/effects';
import { createCard, type CardProps, type CardView } from './ui/card';
import { createHpStack } from './ui/hpStack';
import { createShell, frame, h, PAGES, placeholderPage, type Currency } from './shell/shell';
import { statTip } from './shell/stats';
import { attachTooltip } from './shell/tooltip';
import { createProductionPage } from './pages/production';
import { createDungeonsPage } from './pages/dungeons';
import { createCardsPage } from './pages/cards';
import { createCardsModel } from './pages/cardsAdapter';
import { gemCoin, mineTile, svg, treeTile } from './art/gems';
import { installArtDefs } from './art/defs';

const TICK_INTERVAL_MS = 100;
const AUTOSAVE_INTERVAL_MS = 30_000;
const PRODUCTION_HIT_MS = 1000;
const CLEAR_NOTICE_MS = 12_000;

function showFatal(root: HTMLElement, error: unknown): void {
  const box = h('pre', 'fatal');
  box.setAttribute('role', 'alert');
  box.textContent =
    error instanceof ContentValidationError
      ? `${COPY.load.badData}\n\n${error.message}`
      : `${COPY.load.failed}\n\n${error instanceof Error ? error.message : String(error)}`;
  root.append(box);
}

function awayLines(summary: OfflineSummary, content: Content): string[] {
  const lines = [COPY.away.duration(formatDuration(summary.elapsedMs))];
  if (summary.capped) lines.push(COPY.away.capped(formatDuration(summary.capMs)));
  for (const [id, amount] of Object.entries(summary.gains)) {
    lines.push(COPY.away.gain(formatDecimal(amount), content.resourceById.get(id)?.name ?? id));
  }
  if (summary.bossKills > 0) lines.push(COPY.away.kills(summary.bossKills));
  for (const [id, count] of Object.entries(summary.drops)) {
    const name = content.cosmeticById.get(id)?.name ?? content.cardById.get(id)?.name ?? id;
    lines.push(COPY.away.drop(name, count));
  }
  for (const drop of summary.cardDrops) {
    lines.push(COPY.away.drop(content.cardById.get(drop.cardId)?.name ?? drop.cardId, 1));
  }
  return lines;
}

/** A fighting loadout card on Home. Null when the card is unknown or not owned. */
function loadoutProps(
  content: Content,
  state: GameState,
  cardId: string,
  role: CardRole,
  mods: Modifier[],
): CardProps | null {
  const info = cardInfo(state, content, cardId, mods);
  if (!info?.owned || !info.rank) return null;
  const { card, rank } = info;
  const level = { label: 'Level', value: `${info.owned.level}/${info.levelCap}` };
  const stats: CardProps['stats'] =
    role === 'main'
      ? [
          level,
          { label: 'Hits every', value: `${burstStats(content, 'fighting', mods).interval}s` },
        ]
      : [level, { label: 'Bonus', value: card.support.description }];
  return {
    name: card.name,
    label: role === 'main' ? COPY.table.main : COPY.table.support,
    job: card.job,
    emblem: role === 'main' ? 'blade' : 'gem',
    rank,
    stats,
    theme: resolveCard(content, state.cosmetics.loadout, {
      id: card.id,
      rank,
      rarity: card.rarity,
    }),
  };
}

/** Loads content and the save, applies offline progress, builds the table and runs the loop. */
export async function startGame(root: HTMLElement, version: string): Promise<void> {
  let content: Content;
  try {
    content = loadContent();
    assertVisualsImplemented(content);
  } catch (error) {
    showFatal(root, error);
    return;
  }

  // ---- load ----
  const files = await window.api.readSave();
  const best = loadBestSave(files.primary, files.backup, content);
  const startedAt = Date.now();
  let state = best.save?.state ?? createInitialState(content);
  let summary: OfflineSummary | null = null;
  if (best.save) {
    const offline = simulateOffline(state, content, best.save.savedAt, startedAt, defaultRng);
    state = offline.state;
    summary = offline.summary;
  }
  const loop = new GameLoop(state, content, defaultRng, startedAt);
  applyGlobalTheme(content, loop.state.cosmetics.loadout);

  // ---- layout ----
  const KIND_ICON = {
    tree_gem: 'wood',
    mine_gem: 'ore',
    material: 'material',
    portal: 'portal',
  } as const;
  installArtDefs();
  const currencies: Currency[] = content.resources.map((r) => ({
    id: r.id,
    name: r.name,
    icon: KIND_ICON[r.kind],
    ...(r.gem ? { art: svg(gemCoin(r.gem, r.tier)) } : {}),
    tip: () => `${r.name}: ${formatDecimal(loop.state.resources[r.id] ?? new Decimal(0))}`,
  }));
  const shell = createShell({
    version,
    currencies,
    levelTip: COPY.shell.levelTip,
    onShow: (id) => {
      if (id === 'production') productionPage?.render();
      if (id === 'dungeons') dungeonsPage?.render();
      if (id === 'cards') cardsPage?.render();
    },
  });
  shell.setLevel(1, 0, '');
  // eslint-disable-next-line prefer-const -- assigned once the Home view exists
  let productionPage: { render(): void } | undefined;
  // eslint-disable-next-line prefer-const -- assigned once the Home view exists
  let dungeonsPage: { render(): void } | undefined;
  // eslint-disable-next-line prefer-const -- assigned once the Home view exists
  let cardsPage: { render(): void } | undefined;
  const home = shell.page('home');
  for (const p of PAGES) {
    if (
      p.id !== 'home' &&
      p.id !== 'settings' &&
      p.id !== 'production' &&
      p.id !== 'dungeons' &&
      p.id !== 'cards'
    )
      placeholderPage(shell.page(p.id), p.id);
  }
  const app = shell.notices;

  if (best.errors.length > 0) {
    const warning = h(
      'p',
      'notice notice--warning',
      best.source === 'backup' ? COPY.load.usedBackup : COPY.load.startedFresh,
    );
    warning.setAttribute('role', 'alert');
    app.append(warning);
  }

  if (summary) {
    const away = frame(COPY.away.title);
    away.el.classList.add('away');
    const list = h('ul', 'away__list');
    for (const line of awayLines(summary, content)) list.append(h('li', '', line));
    const ok = h('button', 'button', COPY.away.dismiss);
    ok.type = 'button';
    ok.addEventListener('click', () => {
      away.el.remove();
      shell.scrollToTop();
    });
    away.body.append(list, ok);
    app.append(away.el);
    queueMicrotask(() => ok.focus());
  }

  const table = h('div', 'table');
  home.append(table);

  // boss: follows whatever is being fought (a dungeon's boss or a special dungeon's target)
  let boss: CardView | null = null;
  let hp = createHpStack();
  let battleEl: HTMLElement | null = null;
  let homeFor: string | null = null;
  const damageRow = h('dl', 'stat-row');
  const damageLabel = h('dt', '', COPY.home.damage);
  const damageValue = h('dd', 'bi-num');
  damageValue.tabIndex = 0;
  damageValue.classList.add('has-tip');
  damageRow.append(damageLabel, damageValue);
  const damageStat = () => combatDamageStat(loop.state, content);
  attachTooltip(damageValue, () => statTip(content, COPY.home.damageTip, damageStat(), '/s'));
  const buildHomeBoss = (): void => {
    const id = loop.state.activeDungeonId;
    homeFor = id;
    const dungeon = id ? content.dungeonById.get(id) : undefined;
    const trial = id ? content.trialById.get(id) : undefined;
    const foe = dungeon ? dungeon.boss : trial?.target;
    boss = null;
    hp = createHpStack();
    if (foe) {
      const bossRank = { tier: 'bronze', stars: 1 } as const;
      boss = createCard({
        name: foe.name,
        label: COPY.table.boss,
        job: 'fighting',
        emblem: 'golem',
        rank: bossRank,
        boss: true,
        stats: [
          { label: '', value: '' },
          { label: '', value: '' },
        ],
        theme: resolveCard(content, loop.state.cosmetics.loadout, {
          id: foe.id,
          rank: bossRank,
          rarity: 'common',
        }),
      });
      boss.hpSlot.append(hp.el);
    }
    const title = dungeon?.name ?? trial?.name ?? COPY.table.boss;
    const battle = frame(title, foe ? COPY.table.boss : undefined);
    battle.el.classList.add('table__boss');
    if (boss) battle.body.append(boss.el);
    else battle.body.append(h('p', 'frame__muted', COPY.home.nothingFought));
    battle.body.append(damageRow);
    if (battleEl) battleEl.replaceWith(battle.el);
    else table.prepend(battle.el);
    battleEl = battle.el;
  };
  buildHomeBoss();

  // loadout: 1 main + 3 supports
  const loadout = frame(COPY.table.loadout);
  loadout.el.classList.add('table__loadout');
  const slots = h('div', 'loadout');
  // Rebuilt whenever the fighting loadout or one of its cards' rank / level changes.
  let loadoutKey = '';
  const buildLoadout = (): void => {
    const s = loop.state;
    const { main, supports } = s.cards.loadouts.fighting;
    const key = JSON.stringify(
      [main, ...supports].map((id) => {
        const owned = id ? s.cards.owned[id] : undefined;
        return owned ? [id, owned.tier, owned.stars, owned.level] : null;
      }),
    );
    if (key === loadoutKey) return;
    loadoutKey = key;
    const mods = collectModifiers(s, content);
    const views = [main, ...supports].map((id, i) => {
      const props = id ? loadoutProps(content, s, id, i === 0 ? 'main' : 'support', mods) : null;
      if (props) return createCard(props).el;
      return h('div', 'slot-empty', i === 0 ? COPY.table.emptyMain : COPY.table.emptySlot);
    });
    slots.replaceChildren(...views);
  };
  buildLoadout();
  const fit = h('div', 'loadout-fit');
  fit.append(slots);
  loadout.body.append(fit);
  table.append(loadout.el);

  // production: the active plots and slots; managed on the Production page
  const production = frame(COPY.table.production);
  production.el.classList.add('production');
  const tiles = h('div', 'production__tiles');
  const manage = h('button', 'button', COPY.home.manageProduction);
  manage.type = 'button';
  manage.addEventListener('click', () => shell.show('production'));
  production.body.append(tiles, manage);
  home.append(production.el);
  type ProducerTile = {
    stage: HTMLElement;
    emblem: SVGElement;
    producer: Producer;
    job: ProductionJob;
  };
  let producerTiles: ProducerTile[] = [];
  const buildHomeProduction = (): void => {
    const s = loop.state;
    const mods = collectModifiers(s, content);
    const counts = producerCounts(s, content, mods);
    producerTiles = [];
    tiles.replaceChildren();
    for (const job of PRODUCTION_JOBS) {
      for (const p of producersOf(content, job)) {
        const count = counts[p.id] ?? 0;
        if (count === 0) continue;
        const tile = h('article', 'prod');
        const stage = h('div', 'prod__stage');
        // the faceted tree or mine tile (DESIGN.md 13); the line emblem only if it has no gem art
        const gem = content.resourceById.get(p.resource)?.gem;
        const tree = job === 'logging' ? content.treeById.get(p.id) : undefined;
        if (gem && (tree || job === 'mining')) {
          stage.classList.add('prod__stage--tile');
          stage.innerHTML = svg(tree ? treeTile(tree, gem) : mineTile(gem));
          stage.querySelector('svg')!.classList.add('prod__emblem');
        } else {
          stage.innerHTML = `<svg class="bi-card__emblem prod__emblem" viewBox="0 0 100 100" aria-hidden="true">${
            job === 'logging'
              ? '<path d="M50 10 76 46H62L82 70H18L38 46H24Z"/><path d="M44 70H56V90H44Z"/>'
              : '<path d="M14 70 26 38 46 26 70 30 86 52 82 76 54 86 28 84Z"/>'
          }</svg>`;
        }
        const info = h('div', 'prod__info');
        const resource = content.resourceById.get(p.resource)?.name ?? p.resource;
        const level = job === 'mining' ? mineLevel(s, p.id) : 0;
        const rate = producerRate(p, job, mods, level).mul(count);
        info.append(
          h('h3', 'prod__name', p.name),
          h(
            'p',
            'prod__meta',
            job === 'logging' ? COPY.table.plots(count) : COPY.table.slots(count),
          ),
          h('p', 'prod__meta bi-num', `${resource} ${COPY.table.perSecond(formatDecimal(rate))}`),
        );
        tile.append(stage, info);
        tiles.append(tile);
        producerTiles.push({ stage, emblem: stage.querySelector('svg')!, producer: p, job });
      }
    }
    if (producerTiles.length === 0)
      tiles.append(h('p', 'frame__muted', COPY.home.nothingProducing));
  };
  buildHomeProduction();

  productionPage = createProductionPage(shell.page('production'), {
    content,
    state: () => loop.state,
    apply: (next) => {
      loop.state = next;
      buildHomeProduction();
      rendered();
      void save(); // purchases are saved right away, not at the next autosave
    },
  });
  cardsPage = createCardsPage(shell.page('cards'), {
    content,
    model: createCardsModel(content),
    state: () => loop.state,
    apply: (next) => {
      loop.state = next;
      rendered();
      void save();
    },
  });
  dungeonsPage = createDungeonsPage(shell.page('dungeons'), {
    content,
    state: () => loop.state,
    apply: (next) => {
      loop.state = next;
      rendered();
      void save();
    },
  });

  // save tools (Settings page)
  const toolsFrame = frame(COPY.save.heading);
  const tools = toolsFrame.body;
  tools.classList.add('tools');
  const exportBtn = h('button', 'button', COPY.save.export);
  const importBtn = h('button', 'button', COPY.save.import);
  exportBtn.type = 'button';
  importBtn.type = 'button';
  const saveText = h('textarea', 'tools__text');
  saveText.rows = 3;
  saveText.spellcheck = false;
  saveText.placeholder = COPY.save.placeholder;
  saveText.setAttribute('aria-label', COPY.save.placeholder);
  const message = h('p', 'tools__message');
  message.setAttribute('role', 'status');
  const buttons = h('div', 'tools__buttons');
  buttons.append(exportBtn, importBtn);
  tools.append(buttons, saveText, message);
  shell.page('settings').append(toolsFrame.el);

  root.replaceChildren(shell.el);

  // ---- behaviour ----
  const rendered = (): void => {
    const s = loop.state;
    if (s.activeDungeonId !== homeFor) buildHomeBoss();
    const dungeon = s.activeDungeonId ? content.dungeonById.get(s.activeDungeonId) : undefined;
    const trial = s.activeDungeonId ? content.trialById.get(s.activeDungeonId) : undefined;
    if (dungeon && boss) {
      const max = bossMaxHp(dungeon, s.prestigeCount, collectModifiers(s, content));
      const current = Decimal.min(s.bossHp ?? max, max);
      const bars = hpBarState(current, max, dungeon.boss.hpBars);
      hp.update(bars, formatDecimal(current), formatDecimal(max), current.div(max).toNumber());
    } else if (trial && boss) {
      const max = trial.target.hp;
      const current = Decimal.max(max.sub(s.combat.trialAttempt.dealt), 0);
      const bars = hpBarState(current, max, 1);
      hp.update(bars, formatDecimal(current), formatDecimal(max), current.div(max).toNumber());
    }
    for (const r of content.resources) {
      const amount = s.resources[r.id] ?? new Decimal(0);
      shell.setCurrency(r.id, formatDecimal(amount), amount.gt(0));
    }
    damageValue.textContent = `${formatDecimal(damageStat().value)}/s`;
    buildLoadout();
    if (shell.current() === 'production') productionPage?.render();
    if (shell.current() === 'dungeons') dungeonsPage?.render();
    if (shell.current() === 'cards') cardsPage?.render();
  };

  /** Steps the loop and announces first clears. */
  const step = (): void => announce(loop.step(Date.now()));
  const announce = (report: TickReport): void => {
    for (const id of report.cleared) {
      const name = content.dungeonById.get(id)?.name ?? content.trialById.get(id)?.name ?? id;
      const opened = [
        ...report.unlockedDungeons.map(
          (d) => content.dungeonById.get(d)?.name ?? content.trialById.get(d)?.name ?? d,
        ),
        ...report.unlockedMines.map((m) => content.mineById.get(m)?.name ?? m),
      ];
      const note = h('p', 'notice', COPY.dungeons.clearedNotice(name, COPY.dungeons.and(opened)));
      note.setAttribute('role', 'status');
      app.append(note);
      window.setTimeout(() => note.remove(), CLEAR_NOTICE_MS);
    }
  };

  const save = async (): Promise<void> => {
    step();
    try {
      await window.api.writeSave(createSaveText(loop.state, Date.now()));
    } catch (error) {
      message.textContent = COPY.save.writeFailed(
        error instanceof Error ? error.message : String(error),
      );
    }
  };

  window.setInterval(() => {
    step();
    rendered();
  }, TICK_INTERVAL_MS);

  // Visual hits follow the main card's rhythm; damage itself is continuous in the game loop.
  const attack = () => resolveGlobal(content, loop.state.cosmetics.loadout).attack.visual.effects;
  const hitLoop = (): void => {
    const mods = collectModifiers(loop.state, content);
    const stats = burstStats(content, 'fighting', mods);
    const view = boss;
    if (!document.hidden && view && loop.state.activeDungeonId) {
      const effect = attack()?.fighting;
      if (effect)
        playHit(effect, view.art, { rng: defaultRng, target: view.art.querySelector('svg') });
      const dealt = hitDamage(effectiveDamage(loop.state, content, undefined, mods), stats);
      showTick(view.art, formatDecimal(dealt), { rng: defaultRng });
    }
    window.setTimeout(hitLoop, stats.interval * 1000);
  };
  hitLoop();
  window.setInterval(() => {
    if (document.hidden) return;
    const mods = collectModifiers(loop.state, content);
    const counts = producerCounts(loop.state, content, mods);
    for (const tile of producerTiles) {
      const effect = attack()?.[tile.job];
      if (effect) playHit(effect, tile.stage, { rng: defaultRng, target: tile.emblem });
      const level = tile.job === 'mining' ? mineLevel(loop.state, tile.producer.id) : 0;
      const gain = producerRate(tile.producer, tile.job, mods, level)
        .mul(counts[tile.producer.id] ?? 0)
        .mul(PRODUCTION_HIT_MS / 1000);
      showTick(tile.stage, `+${formatDecimal(gain)}`, { rng: defaultRng });
    }
  }, PRODUCTION_HIT_MS);

  window.setInterval(() => void save(), AUTOSAVE_INTERVAL_MS);
  window.api.onFlushRequest(() => {
    void save().finally(() => window.api.flushDone());
  });

  exportBtn.addEventListener('click', () => {
    step();
    saveText.value = exportSaveString(loop.state, Date.now());
    saveText.select();
    navigator.clipboard
      ?.writeText(saveText.value)
      .then(() => (message.textContent = COPY.save.exported))
      .catch(() => (message.textContent = COPY.save.exportedNoClipboard));
  });
  importBtn.addEventListener('click', () => {
    if (!saveText.value.trim()) {
      message.textContent = COPY.save.importEmpty;
      return;
    }
    try {
      const imported = importSaveString(saveText.value, content);
      if (!window.confirm(COPY.save.importConfirm)) return;
      loop.reset(imported.state, Date.now());
      applyGlobalTheme(content, loop.state.cosmetics.loadout);
      buildLoadout();
      saveText.value = '';
      message.textContent = COPY.save.imported;
      void save();
    } catch (error) {
      message.textContent = error instanceof SaveError ? error.message : COPY.save.importFailed;
    }
  });

  rendered();
  await save(); // a fresh game gets a save file right away
}
