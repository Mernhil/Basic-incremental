import { ContentValidationError, loadContent, type Content } from '../../data';
import {
  Decimal,
  GameLoop,
  SaveError,
  createInitialState,
  createSaveText,
  defaultRng,
  exportSaveString,
  formatDecimal,
  importSaveString,
  loadBestSave,
  collectModifiers,
  gemMastery,
  nextGoals,
  productionPerSecond,
  resolveGlobal,
  simulateOffline,
  type GameState,
  type OfflineSummary,
  type TickReport,
  type TierUp,
} from '../../game';
import { COPY } from './copy';
import { applyGlobalTheme, assertVisualsImplemented } from './theme/apply';
import { createShell, frame, h, PAGES, placeholderPage, type Currency } from './shell/shell';
import { createProductionPage } from './pages/production';
import { createDungeonsPage } from './pages/dungeons';
import { createHomePage } from './pages/home';
import { createSummonPage } from './pages/summon';
import { createAscensionPage } from './pages/ascension';
import { createCardsPage } from './pages/cards';
import { createCardsModel } from './pages/cardsAdapter';
import { cardItemArt, loadoutProps } from './pages/loadoutCards';
import { goalRows } from './pages/progressionModel';
import { createQuestScroll } from './shell/quest';
import { playTierUps } from './stage/tierUp';
import { gemCoin, svg } from './art/gems';
import { installArtDefs } from './art/defs';
import { createDirector } from './stage/director';
import { setNumberMotion } from './stage/numbers';
import { showWelcomeBack } from './stage/welcome';
import { initSound, playSound } from './sound/engine';
import { createMuteToggle, soundSettingsFrame } from './sound/controls';

const TICK_INTERVAL_MS = 100;
const AUTOSAVE_INTERVAL_MS = 30_000;
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

/** Loads content and the save, applies offline progress, builds the pages and runs the loop. */
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
  const applyTheme = (): void => {
    applyGlobalTheme(content, loop.state.cosmetics.loadout);
    setNumberMotion(resolveGlobal(content, loop.state.cosmetics.loadout).tick.visual.effect);
  };
  applyTheme();

  // ---- layout ----
  const KIND_ICON = {
    tree_gem: 'wood',
    mine_gem: 'ore',
    material: 'material',
    portal: 'portal',
    prestige: 'starlight', // placeholder line star until the pixel Starlight coin is drawn
  } as const;
  installArtDefs();
  // Starlight (the prestige currency) leads the header row: it is kept forever and would
  // otherwise sit past the right edge behind every gem and material
  const headerOrder = [
    ...content.resources.filter((r) => r.kind === 'prestige'),
    ...content.resources.filter((r) => r.kind !== 'prestige'),
  ];
  const currencies: Currency[] = headerOrder.map((r) => ({
    id: r.id,
    name: r.name,
    icon: KIND_ICON[r.kind],
    ...(r.gem ? { art: svg(gemCoin(r.gem, gemMastery(loop.state, content, r.id).tier)) } : {}),
    tip: () => `${r.name}: ${formatDecimal(loop.state.resources[r.id] ?? new Decimal(0))}`,
  }));
  const pages: Partial<Record<string, { render(): void }>> = {};
  const shell = createShell({
    version,
    currencies,
    levelTip: COPY.shell.levelTip,
    onShow: (id) => pages[id]?.render(),
  });
  shell.setLevel(1, 0, '');
  for (const p of PAGES) {
    if (!['home', 'settings', 'production', 'dungeons', 'cards', 'summon', 'shop'].includes(p.id))
      placeholderPage(shell.page(p.id as Exclude<typeof p.id, 'home'>), p.id as never);
  }
  const app = shell.notices;
  const director = createDirector(content, () => loop.state);
  const visible = (id: string) => () => shell.current() === id && !document.hidden;

  if (best.errors.length > 0) {
    const warning = h(
      'p',
      'notice notice--warning',
      best.source === 'backup' ? COPY.load.usedBackup : COPY.load.startedFresh,
    );
    warning.setAttribute('role', 'alert');
    app.append(warning);
  }

  initSound();
  shell.tools.append(createMuteToggle());
  // UI click for plain buttons; buy buttons and stage moments play their own sounds
  document.addEventListener('click', (e) => {
    const btn = (e.target as Element | null)?.closest?.('button');
    if (btn && !btn.classList.contains('buy-btn')) playSound('click');
  });
  if (summary) showWelcomeBack(summary, content, shell, playSound);

  // tier-up moments from the loop, purchases and card upgrades (DESIGN.md 16, E1)
  const onTierUps = (list: TierUp[]): void =>
    playTierUps(list, {
      content,
      sound: playSound,
      cardProps: (id) =>
        loadoutProps(content, loop.state, id, 'main', collectModifiers(loop.state, content)),
    });

  // the quest scroll under the header (E8); goals are worked out once a second
  const quest = createQuestScroll(shell.quest, (page) => shell.show(page));
  let questAt = 0;
  const renderQuest = (now: number): void => {
    if (now - questAt < 1000) return;
    questAt = now;
    quest.update(goalRows(nextGoals(loop.state, content, 3)));
  };

  const applyAndSave = (next: GameState): void => {
    loop.state = next;
    rendered();
    void save(); // purchases are saved right away, not at the next autosave
  };

  pages['home'] = createHomePage(shell.page('home'), {
    content,
    state: () => loop.state,
    director,
    visible: visible('home'),
    open: (id) => shell.show(id),
  });
  pages['production'] = createProductionPage(shell.page('production'), {
    content,
    state: () => loop.state,
    apply: applyAndSave,
    director,
    coins: shell,
    visible: visible('production'),
    sound: playSound,
    onTierUps,
  });
  pages['cards'] = createCardsPage(shell.page('cards'), {
    content,
    model: createCardsModel(content, (id, owned) => cardItemArt(content, id, owned)),
    state: () => loop.state,
    apply: applyAndSave,
    onTierUps,
  });
  pages['summon'] = createSummonPage(shell.page('summon'), {
    content,
    state: () => loop.state,
    apply: applyAndSave,
    sound: playSound,
  });
  // Ascension lives on the Shop page (DESIGN.md 12.18): the gate and the Starlight shop
  pages['shop'] = createAscensionPage(shell.page('shop'), {
    content,
    state: () => loop.state,
    apply: applyAndSave,
    sound: playSound,
  });
  pages['dungeons'] = createDungeonsPage(shell.page('dungeons'), {
    content,
    state: () => loop.state,
    apply: applyAndSave,
    director,
    coins: shell,
    visible: visible('dungeons'),
    sound: playSound,
    onTierUps,
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
  shell.page('settings').append(soundSettingsFrame(), toolsFrame.el);

  root.replaceChildren(shell.el);

  // ---- behaviour ----
  const rendered = (): void => {
    const s = loop.state;
    const rates = productionPerSecond(s, content);
    for (const r of content.resources) {
      shell.setCurrency(r.id, s.resources[r.id] ?? new Decimal(0), rates[r.id] ?? null);
      // the coin shows the gem's mastery metal (E2)
      if (r.gem) shell.setCurrencyArt(r.id, svg(gemCoin(r.gem, gemMastery(s, content, r.id).tier)));
    }
    renderQuest(performance.now());
    pages[shell.current()]?.render();
  };

  /** Steps the loop, announces first clears and hands the report to the stage director. */
  const step = (): void => {
    const before = loop.state;
    const report = loop.step(Date.now());
    announce(report);
    director.afterStep(report, before, loop.state);
    if (report.tierUps.length > 0 && !document.hidden) onTierUps(report.tierUps);
  };
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
  director.start();

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
      applyTheme();
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
