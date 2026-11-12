import { ContentValidationError, loadContent, type Content } from '../../data';
import {
  Decimal,
  GameLoop,
  createInitialState,
  createSaveText,
  defaultRng,
  exportSaveString,
  loadBestSave,
  accountInfo,
  checkAchievements,
  collectModifiers,
  rewardTrack,
  gemMastery,
  incomePerSecond,
  nextGoals,
  resolveGlobal,
  simulateOffline,
  type GameState,
  type OfflineSummary,
  type TickReport,
  type TierUp,
} from '../../game';
import { fmt } from './settings/numberFormat';
import { COPY } from './copy';
import { coinAmount, isMoney } from './settings/coins';
import { applyGlobalTheme, assertVisualsImplemented, configureCardLevels } from './theme/apply';
import { createDetailsPanel } from './shell/details';
import {
  iconMarkup,
  isCrystal,
  isHeaderResource,
  moneyCoinArt,
  resourceIconId,
} from './ui/resourceIcons';
import { createShell, h, type Currency } from './shell/shell';
import { createTable } from './table/table';
import { allPieces, allViews } from './table/registry';
import type { TableContext, ViewId } from './table/contract';
import { levelBadge, levelUpView, trackView } from './pages/accountModel';
import { createRewardTrack } from './shell/rewardTrack';
import { tipTable } from './shell/tooltip';
import { unlockToast } from './pages/achievementsModel';
import { toast } from './stage/toast';
import { createCardsModel } from './pages/cardsAdapter';
import { cardItemArt, loadoutProps } from './pages/loadoutCards';
import { goalRows, type GoalRow } from './pages/progressionModel';
import { createQuestScroll } from './shell/quest';
import { playTierUps } from './stage/tierUp';
import { gemCoin, svg } from './art/gems';
import { installArtDefs } from './art/defs';
import { createDirector } from './stage/director';
import { setNumberMotion, setPixelTick } from './stage/numbers';
import { starlightSvg } from './ui/skins';
import { installPixelNumbers, refreshPixelNumbers } from './ui/pixelNumbers';
import { showWelcomeBack } from './stage/welcome';
import { initSound, playSound } from './sound/engine';
import { createMuteToggle } from './sound/controls';
import { onPrefs, prefs } from './settings/prefs';

const TICK_INTERVAL_MS = 100;
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
    configureCardLevels(content);
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
    setNumberMotion(resolveGlobal(content, loop.state.cosmetics.loadout).tick?.visual.effect);
    setPixelTick(getComputedStyle(document.documentElement).getPropertyValue('--bi-tick-px'));
    refreshPixelNumbers();
    shellRef?.setCurrencyArt(prestigeId, starlightSvg());
  };
  let shellRef: { setCurrencyArt(id: string, art: string): void } | null = null;
  const prestigeId = content.resources.find((r) => r.kind === 'prestige')?.id ?? '';
  applyTheme();

  // ---- layout ----
  const KIND_ICON = {
    tree_gem: 'wood',
    mine_gem: 'ore',
    material: 'material',
    currency: 'material',
    scroll: 'portal',
    prestige: 'starlight', // swapped for the equipped Starlight coin through `art`
  } as const;
  installArtDefs();
  // The header shows only Money and the two crystals (DESIGN.md §11); every other resource lives
  // behind the Details button, where its coins fly. Icons are swappable ids (ui/resourceIcons).
  const currencies: Currency[] = content.resources.map((r) => {
    const iconId = resourceIconId(r);
    const placeholder = iconMarkup(iconId);
    return {
      id: r.id,
      name: r.name,
      icon: KIND_ICON[r.kind],
      iconId,
      inDetails: !isHeaderResource(r),
      crystal: isCrystal(r),
      ...(r.gem ? { art: svg(gemCoin(r.gem, gemMastery(loop.state, content, r.id).tier)) } : {}),
      ...(r.kind === 'prestige' ? { art: starlightSvg() } : {}),
      ...(!r.gem && r.kind !== 'prestige' && placeholder ? { art: placeholder } : {}),
      tip: () => `${r.name}: ${fmt(loop.state.resources[r.id] ?? new Decimal(0))}`,
    };
  });
  // the account level tooltip: XP, points to spend, and what the badge opens
  const levelTip = (): HTMLElement => {
    const v = levelBadge(accountInfo(loop.state, content));
    const box = tipTable(COPY.shell.level(v.level), [
      ['XP', v.xpText],
      ['Skill points', String(v.points)],
    ]);
    const p = (text: string) => {
      const el = document.createElement('p');
      el.className = 'shell-tip__note';
      el.textContent = text;
      box.append(el);
    };
    p(COPY.account.tipXp);
    p(COPY.account.tipOpen);
    return box;
  };
  const shell = createShell({
    version,
    currencies,
    coins: (id, amount) => (isMoney(content, id) ? coinAmount(content.coins, amount) : null),
    coinArt: moneyCoinArt,
    levelTip,
    onLevel: () => {
      if (track.isOpen()) track.close();
      else track.open(trackView(content, rewardTrack(loop.state, content)), levelOf());
    },
  });
  const levelOf = (): number => {
    const info = accountInfo(loop.state, content);
    return info.level;
  };
  const track = createRewardTrack(shell.track, {
    content,
    setOpen: (open) => shell.setTrackOpen(open),
    returnFocus: () => shell.levelButton.focus(),
  });
  shell.setLevel(levelBadge(accountInfo(loop.state, content)));
  shellRef = shell;
  installPixelNumbers(shell.el);
  // the one table (UI_RULES.md §2, "The table"): the window, the wings, the dock and the views
  const table = createTable();
  shell.main.append(table.el);
  const app = shell.notices;
  const director = createDirector(content, () => loop.state);

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

  // tier-up moments from the loop, purchases and card upgrades (DESIGN.md §12)
  const onTierUps = (list: TierUp[]): void =>
    playTierUps(list, {
      content,
      sound: playSound,
      cardProps: (id) =>
        loadoutProps(content, loop.state, id, 'main', collectModifiers(loop.state, content)),
    });

  // the goal list under the header's Goals button (DESIGN.md §10); a goal opens its view.
  // Goals worked out once a second.
  const goalView = (row: GoalRow): ViewId | null => {
    switch (row.page) {
      case 'production':
        return content.mineById.has(row.id.slice(row.id.indexOf(':') + 1)) ? 'mining' : 'logging';
      case 'dungeons':
        return 'dungeon';
      case 'home':
        return null;
      default:
        return row.page;
    }
  };
  const quest = createQuestScroll(shell.goals, (row) => {
    const id = goalView(row);
    if (id) table.open(id, shell.goalsButton);
    else table.host.close();
  });
  let questAt = 0;
  const renderQuest = (now: number): void => {
    if (now - questAt < 1000) return;
    questAt = now;
    const rows = goalRows(nextGoals(loop.state, content, 3));
    quest.update(rows);
    shell.setGoals(rows.length);
  };

  // achievement unlocks (DESIGN.md §11): a toast and the sticker sound wherever they happen;
  // the sticker itself is slapped into the book when the page next shows it
  const celebrateAchievements = (ids: readonly string[]): void => {
    if (ids.length === 0) return;
    playSound('achievement');
    for (const id of ids) {
      const t = unlockToast(content, id);
      if (t) toast(t.title, t.detail, 'milestone', 'gold');
    }
  };

  // account level-ups (DESIGN.md §10): the badge rings, a fanfare, and a toast listing what
  // the new levels gave (skill points, crystals, a cosmetic, cost cap)
  const celebrateLevel = (from: number, to: number): void => {
    if (to <= from) return;
    const v = levelUpView(content, rewardTrack(loop.state, content), from, to);
    playSound('levelUp');
    shell.flashLevel();
    toast(v.title, v.lines, 'milestone', v.big ? 'prismatic' : 'gold');
    track.update(trackView(content, rewardTrack(loop.state, content)), levelOf());
  };

  const applyAndSave = (next: GameState): void => {
    // actions (buys, pulls, star-ups, equips, ascensions) unlock what they earned right away
    const before = loop.state.account.level;
    const checked = checkAchievements(next, content);
    loop.state = checked.state;
    celebrateLevel(before, loop.state.account.level);
    celebrateAchievements(checked.unlocked);
    rendered();
    void save(); // purchases are saved right away, not at the next autosave
  };

  // one card view model for the Cards view and the dungeon's weapon panel
  const cardsModel = createCardsModel(content, (id, owned) =>
    cardItemArt(content, id, owned, loop.state),
  );
  let lastSavedAt: number | null = null;
  const tableCtx: TableContext = {
    content,
    state: () => loop.state,
    apply: applyAndSave,
    director,
    coins: shell,
    sound: playSound,
    onTierUps,
    cards: cardsModel,
    applyTheme,
    version,
    save: {
      exportText: () => {
        step();
        return exportSaveString(loop.state, Date.now());
      },
      replace: (imported) => {
        loop.reset(imported, Date.now());
        applyTheme();
        rendered();
        void save();
      },
      lastSavedAt: () => lastSavedAt,
    },
    open: (id) => table.open(id),
    close: () => table.host.close(),
    current: () => table.host.current(),
  };
  table.build(allViews(), allPieces(), tableCtx);

  const details = createDetailsPanel({
    content,
    state: () => loop.state,
    masteryTier: (id) => gemMastery(loop.state, content, id).tier,
    returnFocus: () => shell.detailsButton,
    onToggle: (open) => shell.detailsButton.setAttribute('aria-expanded', String(open)),
  });
  shell.detailsButton.addEventListener('click', () => {
    if (details.isOpen()) details.close();
    else details.open();
  });

  root.replaceChildren(shell.el, details.el);

  // ---- behaviour ----
  const rendered = (): void => {
    const s = loop.state;
    const mods = collectModifiers(s, content);
    for (const r of content.resources) {
      const header = isHeaderResource(r);
      // only the header chips show a rate, worked out for Money and the crystals too
      shell.setCurrency(
        r.id,
        s.resources[r.id] ?? new Decimal(0),
        header ? incomePerSecond(s, content, r.id, mods) : null,
      );
      // the coin shows the gem's mastery metal (E2)
      if (r.gem) shell.setCurrencyArt(r.id, svg(gemCoin(r.gem, gemMastery(s, content, r.id).tier)));
    }
    shell.setLevel(levelBadge(accountInfo(s, content)));
    details.update();
    renderQuest(performance.now());
    table.render(performance.now());
  };

  /** Steps the loop, announces first clears and hands the report to the stage director. */
  const step = (): void => {
    const before = loop.state;
    const report = loop.step(Date.now());
    announce(report);
    if (report.accountLevel) {
      if (document.hidden) {
        track.update(trackView(content, rewardTrack(loop.state, content)), levelOf());
      } else celebrateLevel(report.accountLevel.from, report.accountLevel.to);
    }
    if (!document.hidden) celebrateAchievements(report.achievements);
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
      lastSavedAt = Date.now();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      console.error('Save failed:', reason);
      toast(COPY.save.heading, COPY.save.writeFailed(reason));
    }
  };

  window.setInterval(() => {
    step();
    rendered();
  }, TICK_INTERVAL_MS);
  director.start();

  // autosave on the interval chosen in Settings
  let autosaveTimer = 0;
  let autosaveEvery = 0;
  const scheduleAutosave = (seconds: number): void => {
    if (seconds === autosaveEvery) return;
    autosaveEvery = seconds;
    window.clearInterval(autosaveTimer);
    autosaveTimer = window.setInterval(() => void save(), seconds * 1000);
  };
  scheduleAutosave(prefs().autosaveSeconds);
  onPrefs((p) => scheduleAutosave(p.autosaveSeconds));
  window.api.onFlushRequest(() => {
    void save().finally(() => window.api.flushDone());
  });

  // The dev cheats panel (DESIGN.md §2): dev builds only. Vite drops this import from a release
  // build, and the main process says no in a packaged app.
  if (import.meta.env.DEV) {
    void window.api.devCheatsEnabled().then(async (enabled) => {
      if (!enabled) return;
      const { installDevPanel } = await import('./dev/devPanel');
      installDevPanel({ content, state: () => loop.state, apply: applyAndSave });
    });
  }

  rendered();
  table.enter();
  await save(); // a fresh game gets a save file right away
}
