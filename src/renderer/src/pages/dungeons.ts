import type { Dungeon, Trial } from '../../../data';
import {
  bossStatus,
  Decimal,
  clearUnlocks,
  collectModifiers,
  DIFFICULTIES,
  difficultyDrops,
  effectiveDrops,
  fightStage,
  floorPosition,
  formatDuration,
  isDifficultyUnlocked,
  isDungeonCleared,
  isDungeonUnlocked,
  loadoutHealth,
  secondsPerKill,
  setActiveDungeon,
  setDifficulty,
  setFloorMode,
  trialRewards,
  bossMastery,
  type Difficulty,
  type GameState,
  type TierUp,
} from '../../../game';
import { fmt } from '../settings/numberFormat';
import { COPY } from '../copy';
import { h } from '../shell/shell';
import { attachTooltip, hide as hideTip } from '../shell/tooltip';
import { createArena, floorPartText, type CoinTarget } from '../stage/arena';
import type { Director } from '../stage/director';
import { bossArt } from '../art/bosses';
import { MEDAL_VIEWBOX, masteryMedal, svg } from '../art/gems';
import { createShelf } from '../ui/shelf';
import { createTrainingPanel } from '../ui/training';
import { createWeaponPanel, type WeaponPanel } from '../ui/weaponPanel';
import type { CardsModel } from './cardsModel';
import {
  DRAWER_TABS,
  drawerStatus,
  floorParts,
  parseTab,
  tabAfterKey,
  type DrawerTab,
  type DrawerStatus,
} from './dungeonsModel';
import { medalTip } from './progressionModel';
import type { PageContext } from './production';
import './dungeons.css';

/**
 * Dungeons page (DESIGN.md §11; UI_RULES.md §2 "Dungeons arena layout"): the arena fills the page
 * under the goals strip. A drawer handle runs along the bottom ("▲ <current dungeon>", the
 * Dungeons / Weapon / Upgrades tabs and a short status line); the drawer slides up from it with the
 * floors and drops, the weapon panel (the main card's level, XP, stars and tier-up, DESIGN.md §5)
 * and the upgrade shelf, one tab each. Damage comes from the main card.
 */

export interface StagePageContext extends PageContext {
  director: Director;
  coins: CoinTarget;
  /** The card view models: the weapon panel follows the main fighting card. */
  cards: CardsModel;
  /** True while this page is on screen. */
  visible: () => boolean;
  sound?: (id: string) => void;
  /** Plays tier-up moments (milestones, medals). */
  onTierUps?: (list: TierUp[]) => void;
}

const pct = (x: number): string => {
  const v = x * 100;
  return `${v >= 10 || Number.isInteger(v) ? Math.round(v) : v.toFixed(1)}%`;
};

const DRAWER_KEY = 'bi.dungeonDrawer';
const TAB_KEY = 'bi.dungeonTab';

const TAB_LABEL: Record<DrawerTab, string> = {
  dungeons: COPY.arena.tabDungeons,
  weapon: COPY.arena.tabWeapon,
  upgrades: COPY.arena.tabUpgrades,
};

function statusText(status: DrawerStatus): string {
  switch (status.kind) {
    case 'idle':
      return COPY.arena.statusIdle;
    case 'trial':
      return COPY.arena.statusTrial;
    case 'knockout':
      return COPY.arena.statusKnockout(status.seconds);
    case 'pity':
      return COPY.arena.statusPity(status.kills);
    case 'fighting':
      return COPY.arena.statusFighting;
  }
}

function floorsSignature(state: GameState): string {
  const active = state.activeDungeonId ? state.combat.floors[state.activeDungeonId] : undefined;
  return JSON.stringify([
    state.activeDungeonId,
    state.clearedDungeons,
    state.prestigeCount,
    active?.difficulty,
  ]);
}

export function createDungeonsPage(page: HTMLElement, ctx: StagePageContext): { render(): void } {
  const { content } = ctx;
  page.classList.add('shell-page--stage');
  page.querySelector('.shell-page__title')?.classList.add('sr-only');

  const arena = createArena({
    content,
    state: ctx.state,
    director: ctx.director,
    coins: ctx.coins,
    active: ctx.visible,
    sound: ctx.sound,
  });

  // ---- drawer: a handle bar along the bottom, the panes slide up above it ----
  const drawer = h('section', 'dp-drawer');
  drawer.setAttribute('aria-label', COPY.arena.drawer);
  const bar = h('div', 'dp-drawer__bar');
  const handle = h('button', 'dp-handle');
  handle.type = 'button';
  handle.setAttribute('aria-controls', 'dp-drawer-body');
  const handleText = h('span', 'dp-handle__name', COPY.arena.handleNone);
  handle.append(h('i', 'dp-handle__chev'), handleText);
  const tabs = h('div', 'dp-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', COPY.arena.tabsLabel);
  const tabButtons = new Map<DrawerTab, HTMLButtonElement>();
  for (const id of DRAWER_TABS) {
    const b = h('button', 'px-btn dp-tab', TAB_LABEL[id]);
    b.type = 'button';
    b.id = `dp-tab-${id}`;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', `dp-pane-${id}`);
    tabButtons.set(id, b);
    tabs.append(b);
  }
  const statusLine = h('span', 'dp-status');
  bar.append(handle, tabs, statusLine);
  const body = h('div', 'dp-drawer__body');
  body.id = 'dp-drawer-body';
  drawer.append(bar, body);

  let open = false;
  let tab: DrawerTab = 'dungeons';
  try {
    open = localStorage.getItem(DRAWER_KEY) === 'open';
    tab = parseTab(localStorage.getItem(TAB_KEY));
  } catch {
    /* stays closed, on the first tab */
  }
  let handleName = '';
  const syncHandle = (): void => {
    const label = open ? COPY.arena.handleClose(handleName) : COPY.arena.handleOpen(handleName);
    handle.setAttribute(
      'aria-label',
      handleName ? label : open ? COPY.arena.drawerClose : COPY.arena.drawerOpen,
    );
  };
  const setOpen = (value: boolean): void => {
    open = value;
    drawer.classList.toggle('is-open', open);
    handle.setAttribute('aria-expanded', String(open));
    syncHandle();
    body.inert = !open;
    try {
      localStorage.setItem(DRAWER_KEY, open ? 'open' : 'closed');
    } catch {
      /* not remembered */
    }
  };
  handle.addEventListener('click', () => setOpen(!open));

  // ---- drawer panes: Dungeons (floors and drops), Weapon, Upgrades ----
  const floorsCol = h('section', 'dp-col dp-col--floors');
  const lootCol = h('section', 'dp-col dp-col--loot');
  const weaponCol = h('section', 'dp-col dp-col--weapon');
  const upgradesCol = h('section', 'dp-col dp-col--upgrades');
  const panes = new Map<DrawerTab, HTMLElement>();
  const addPane = (id: DrawerTab, ...cols: HTMLElement[]): void => {
    const pane = h('div', `dp-pane dp-pane--${id}`);
    pane.id = `dp-pane-${id}`;
    pane.setAttribute('role', 'tabpanel');
    pane.setAttribute('aria-labelledby', `dp-tab-${id}`);
    pane.append(...cols);
    panes.set(id, pane);
    body.append(pane);
  };
  addPane('dungeons', floorsCol, lootCol);
  addPane('weapon', weaponCol);
  addPane('upgrades', upgradesCol);

  const setTab = (id: DrawerTab, opts: { focus?: boolean; save?: boolean } = {}): void => {
    tab = id;
    for (const [key, b] of tabButtons) {
      const on = key === id;
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      panes.get(key)!.hidden = !on;
    }
    if (opts.focus) tabButtons.get(id)?.focus();
    if (opts.save === false) return;
    try {
      localStorage.setItem(TAB_KEY, id);
    } catch {
      /* not remembered */
    }
  };
  for (const [id, b] of tabButtons) {
    // a tab opens the drawer on its own pane
    b.addEventListener('click', () => {
      setTab(id);
      if (!open) setOpen(true);
    });
    b.addEventListener('keydown', (e) => {
      const next = tabAfterKey(id, e.key);
      if (!next) return;
      e.preventDefault();
      setTab(next, { focus: true });
    });
  }

  const wrap = h('div', 'dp-stage');
  wrap.append(arena.el, drawer);
  page.append(wrap);

  const shelf = createShelf({
    content,
    state: ctx.state,
    apply: ctx.apply,
    scope: 'fighting',
    sound: ctx.sound,
  });
  // Training first: the repeatable fighting upgrades (DESIGN.md §6); the one-time shelf follows.
  const training = createTrainingPanel({
    content,
    state: ctx.state,
    apply: ctx.apply,
    sound: ctx.sound,
  });
  upgradesCol.append(
    training.el,
    h('h3', 'dp-col__title dp-col__title--sub', COPY.training.oneTime),
    shelf.el,
  );

  let floorsSig = '';
  let updates: Array<() => void> = [];

  /** The weapon panel follows the main fighting card; it is rebuilt when another card leads. */
  let weaponId: string | null | undefined;
  let weapon: WeaponPanel | null = null;
  const weaponNote = h('p', 'dp-note');
  weaponNote.setAttribute('role', 'status');

  function buildWeapon(mainId: string | null): void {
    weaponId = mainId;
    weapon = null;
    weaponNote.textContent = '';
    const head = h('header', 'dp-col__head');
    head.append(h('h3', 'dp-col__title', COPY.arena.weapon));
    if (!mainId) {
      weaponCol.replaceChildren(head, h('p', 'dp-note', COPY.weapon.noMain));
      return;
    }
    weapon = createWeaponPanel({
      variant: 'drawer',
      content,
      state: ctx.state,
      act(kind) {
        const result = ctx.cards.upgrade(ctx.state(), mainId, kind);
        if (!result.ok) {
          weaponNote.textContent = result.reason;
          return;
        }
        weaponNote.textContent = '';
        ctx.apply(result.state);
        if (result.tierUps?.length) ctx.onTierUps?.(result.tierUps);
        render();
      },
    });
    weaponCol.replaceChildren(head, weapon.el, weaponNote);
  }

  function updateWeapon(): void {
    const entry = weaponId ? ctx.cards.entry(ctx.state(), weaponId) : null;
    if (entry) weapon?.update(entry);
  }

  function buildFloors(state: GameState): void {
    floorsSig = floorsSignature(state);
    const all = [...content.dungeons, ...content.trials];
    const cleared = all.filter((d) => isDungeonCleared(state, d.id)).length;
    const head = h('header', 'dp-col__head');
    head.append(
      h('h3', 'dp-col__title', COPY.arena.floors),
      h('span', 'dp-col__note', COPY.dungeons.cleared(cleared, all.length)),
    );
    const list = h('ol', 'dp-floors');
    list.setAttribute('aria-label', COPY.dungeons.listTitle);
    for (const d of content.dungeons) {
      list.append(floor(d, false, state));
      for (const t of content.trials.filter((x) => x.unlockedBy === d.id))
        list.append(floor(t, true, state));
    }
    for (const t of content.trials.filter((x) => !content.dungeonById.has(x.unlockedBy ?? '')))
      list.append(floor(t, true, state));
    const active = state.activeDungeonId
      ? content.dungeonById.get(state.activeDungeonId)
      : undefined;
    floorsCol.replaceChildren(head, ...(active ? [floorControls(active)] : []), list);
    buildLoot(state);
  }

  /**
   * The interim floor controls of the dungeon being fought (UI_RULES §2, until the floors UI is
   * designed): the floor and difficulty as plain text, the Push / Farm toggle and the difficulty
   * selector for the unlocked tiers.
   */
  function floorControls(d: Dungeon): HTMLElement {
    const box = h('section', 'dp-fl');
    box.setAttribute('aria-label', COPY.dungeons.floorsTitle);
    const where = h('p', 'dp-fl__where bi-num');
    where.dataset.key = 'floor-readout';
    const hint = h('p', 'dp-fl__hint');
    const modes = h('div', 'dp-fl__row');
    modes.setAttribute('role', 'group');
    modes.setAttribute('aria-label', COPY.dungeons.modeLabel);
    const modeButton = (mode: 'push' | 'farm'): HTMLButtonElement => {
      const b = h('button', 'px-btn dp-fl__opt', COPY.dungeons[mode]) as HTMLButtonElement;
      b.type = 'button';
      b.dataset.key = `mode-${mode}`;
      b.addEventListener('click', () => {
        const result = setFloorMode(ctx.state(), content, d.id, mode);
        if (!result.ok) return;
        ctx.apply(result.state);
        render();
        floorsCol.querySelector<HTMLElement>(`[data-key="mode-${mode}"]`)?.focus();
      });
      return b;
    };
    const push = modeButton('push');
    const farm = modeButton('farm');
    modes.append(push, farm);
    const tiers = h('div', 'dp-fl__row');
    tiers.setAttribute('role', 'group');
    tiers.setAttribute('aria-label', COPY.dungeons.difficultyLabel);
    // Normal, Hard, Nightmare and the endless depths: a tier is locked until the boss of the one
    // before it has been beaten (DESIGN.md §6 Difficulty tiers).
    tiers.append(h('span', 'dp-fl__label', COPY.dungeons.difficultyLabel));
    const name = (difficulty: Difficulty): string =>
      COPY.dungeons.difficulty[difficulty] ?? difficulty;
    const tierButtons = DIFFICULTIES.map((difficulty, i) => {
      const b = h('button', 'px-btn dp-fl__opt', name(difficulty)) as HTMLButtonElement;
      b.type = 'button';
      b.dataset.key = `difficulty-${difficulty}`;
      attachTooltip(b, () =>
        b.disabled && i > 0
          ? COPY.dungeons.difficultyLocked(name(DIFFICULTIES[i - 1]!))
          : (COPY.dungeons.difficultyTip[difficulty] ?? ''),
      );
      b.addEventListener('click', () => {
        const result = setDifficulty(ctx.state(), content, d.id, difficulty);
        if (!result.ok) return;
        ctx.apply(result.state);
        render();
        floorsCol.querySelector<HTMLElement>(`[data-key="difficulty-${difficulty}"]`)?.focus();
      });
      tiers.append(b);
      return { difficulty, b };
    });
    box.append(where, modes, hint, tiers);
    updates.push(() => {
      const s = ctx.state();
      if (s.activeDungeonId !== d.id) return;
      const status = bossStatus(s, content);
      if (!status) return;
      const text = [
        d.name,
        COPY.dungeons.difficulty[status.difficulty] ?? status.difficulty,
        ...floorParts(status).map(floorPartText),
      ].join(' · ');
      if (where.textContent !== text) where.textContent = text;
      const pushing = status.mode === 'push';
      if (push.getAttribute('aria-pressed') !== String(pushing)) {
        push.setAttribute('aria-pressed', String(pushing));
        farm.setAttribute('aria-pressed', String(!pushing));
      }
      const tip =
        status.floor >= status.floors
          ? COPY.dungeons.lastFloorTip
          : pushing
            ? COPY.dungeons.pushTip
            : COPY.dungeons.farmTip;
      if (hint.textContent !== tip) hint.textContent = tip;
      for (const { difficulty, b } of tierButtons) {
        const open = isDifficultyUnlocked(s, d, difficulty);
        if (b.disabled === open) b.disabled = !open;
        const chosen = String(status.difficulty === difficulty);
        if (b.getAttribute('aria-pressed') !== chosen) b.setAttribute('aria-pressed', chosen);
      }
    });
    return box;
  }

  function floor(entry: Dungeon | Trial, special: boolean, state: GameState): HTMLElement {
    const unlocked = isDungeonUnlocked(state, content, entry.id);
    const active = state.activeDungeonId === entry.id;
    const li = h(
      'li',
      `dp-floor${active ? ' dp-floor--active' : ''}${unlocked ? '' : ' dp-floor--locked'}${special ? ' dp-floor--branch' : ''}`,
    );
    li.dataset.tier = special ? 'special' : String((entry as Dungeon).tier);
    const portrait = h('span', 'dp-floor__art');
    if (unlocked) {
      const foe = special ? (entry as Trial).target : (entry as Dungeon).boss;
      // A boss without a drawing yet leaves its portrait empty.
      if (foe.art) {
        portrait.innerHTML = `<svg viewBox="-6 -8 112 112" aria-hidden="true" focusable="false">${bossArt(foe.art)}</svg>`;
      }
    }
    const info = h('div', 'dp-floor__info');
    const title = h('span', 'dp-floor__name', entry.name);
    title.tabIndex = -1;
    title.dataset.key = `floor-${entry.id}`;
    const meta = h('span', 'dp-floor__meta bi-num');
    if (!unlocked) {
      meta.textContent = COPY.dungeons.clearToUnlock(
        entry.unlockedBy ? (content.dungeonById.get(entry.unlockedBy)?.name ?? '') : '',
      );
    } else if (special) {
      const bestScore = state.combat.trialBest[entry.id] ?? 0;
      meta.textContent = bestScore > 0 ? COPY.dungeons.best(pct(bestScore)) : COPY.dungeons.special;
    } else {
      const d = entry as Dungeon;
      updates.push(() => {
        const s = ctx.state();
        const sec = secondsPerKill(s, content, d.id, collectModifiers(s, content));
        const at = floorPosition(s, d);
        const parts = [
          ...(at.difficulty === 'normal'
            ? []
            : [COPY.dungeons.difficulty[at.difficulty] ?? at.difficulty]),
          Number.isFinite(at.floors)
            ? COPY.dungeons.floorOf(at.floor, at.floors)
            : COPY.dungeons.depthOf(at.floor),
          COPY.dungeons.kills(s.combat.kills[d.id] ?? 0),
        ];
        if (sec !== null) parts.push(COPY.dungeons.perKill(formatDuration(sec * 1000)));
        const text = parts.join(' · ');
        if (meta.textContent !== text) meta.textContent = text;
      });
    }
    info.append(title, meta);
    const opens = clearUnlocks(content, entry.id);
    const opened = [...opens.dungeons, ...opens.mines].map(
      (id) =>
        content.dungeonById.get(id)?.name ??
        content.trialById.get(id)?.name ??
        content.mineById.get(id)?.name ??
        id,
    );
    if (unlocked && opened.length > 0 && !isDungeonCleared(state, entry.id))
      info.append(h('span', 'dp-floor__opens', COPY.dungeons.opens(COPY.dungeons.and(opened))));
    li.append(portrait, info);
    if (unlocked) li.append(medal(entry.id));
    if (active) li.append(h('span', 'dp-tag dp-tag--fighting', COPY.dungeons.fighting));
    else if (unlocked) {
      const btn = h('button', 'button dp-floor__fight', COPY.dungeons.fight);
      btn.type = 'button';
      btn.dataset.key = `fight-${entry.id}`;
      btn.setAttribute('aria-label', COPY.dungeons.fightLabel(entry.name));
      btn.addEventListener('click', () => {
        const result = setActiveDungeon(ctx.state(), content, entry.id);
        if (!result.ok) return;
        ctx.apply(result.state);
        render();
        floorsCol.querySelector<HTMLElement>(`[data-key="floor-${entry.id}"]`)?.focus();
      });
      li.append(btn);
    }
    return li;
  }

  /** The dungeon's mastery medal (DESIGN.md §6, A12 D), updated as kills add up. */
  function medal(id: string): HTMLElement {
    const box = h('span', 'dp-medal');
    box.tabIndex = 0;
    box.setAttribute('role', 'img');
    let tier = -1;
    const sync = (): void => {
      const info = bossMastery(ctx.state(), content, id);
      if (!info || info.tier === tier) return;
      tier = info.tier;
      box.innerHTML = svg(masteryMedal(tier), MEDAL_VIEWBOX);
      box.dataset.tier = String(tier);
      box.setAttribute('aria-label', medalTip(info));
    };
    attachTooltip(box, () => {
      const info = bossMastery(ctx.state(), content, id);
      return info ? medalTip(info) : '';
    });
    sync();
    updates.push(sync);
    return box;
  }

  function buildLoot(state: GameState): void {
    lootCol.replaceChildren(h('header', 'dp-col__head', ''));
    lootCol.firstElementChild!.append(h('h3', 'dp-col__title', COPY.arena.loot));
    const id = state.activeDungeonId;
    const d = id ? content.dungeonById.get(id) : undefined;
    const t = id ? content.trialById.get(id) : undefined;
    const list = h('ul', 'dp-drops');
    if (d) {
      // The drops of the difficulty being fought: purses and material units grow with the tier.
      const mods = collectModifiers(state, content);
      const table = effectiveDrops(d, mods, content);
      const stage = fightStage(state, content, d.id, mods);
      const drops = stage ? difficultyDrops(table, stage.scale) : table;
      // The boss stands on the last floor, where the purse has grown with the floors above it.
      const boss =
        stage && Number.isFinite(stage.floors)
          ? fightStage(state, content, d.id, mods, stage.floors)?.enemies[0]
          : undefined;
      const bossPurse = boss?.purseScale ?? 1;
      const purse = (n: number, multiplier = 1): string =>
        fmt(new Decimal(n).mul(multiplier).mul(bossPurse));
      const rareName = content.cosmeticById.get(d.drops.rare.itemId)?.name ?? d.drops.rare.itemId;
      const resName = (r: string): string => content.resourceById.get(r)?.name ?? r;
      const row = (label: string, value: string, cls = ''): HTMLElement => {
        const li = h('li', `dp-drop ${cls}`.trim());
        li.append(h('span', '', label), h('span', 'bi-num', value));
        return li;
      };
      const owned = state.inventory[d.drops.rare.itemId] ?? 0;
      list.append(
        row(
          owned > 0 ? `${rareName} (${COPY.dungeons.owned(owned)})` : rareName,
          pct(drops.rare.chance),
          'dp-drop--rare',
        ),
        ...drops.currencies.map((c) =>
          row(
            COPY.dungeons.perKillDrop(resName(c.resource)),
            c.min === c.max
              ? purse(c.min, c.multiplier)
              : `${purse(c.min, c.multiplier)}–${purse(c.max, c.multiplier)}`,
          ),
        ),
        ...drops.wages.map((w) =>
          row(COPY.dungeons.wage(resName(w.resource)), COPY.production.rate(fmt(w.perSecond))),
        ),
        ...(isDungeonCleared(state, d.id)
          ? []
          : d.drops.firstClear.map((purse) =>
              row(COPY.dungeons.firstClear(resName(purse.resource)), fmt(purse.amount)),
            )),
        row(
          resName(drops.material.resource),
          drops.material.amount > 1
            ? `${pct(drops.material.chance)} ×${drops.material.amount}`
            : pct(drops.material.chance),
        ),
        ...drops.extraMaterials.map((extra) =>
          row(
            resName(extra.resource),
            extra.chance < 1
              ? pct(extra.chance)
              : extra.min === extra.max
                ? fmt(new Decimal(extra.min))
                : `${fmt(new Decimal(extra.min))}–${fmt(new Decimal(extra.max))}`,
          ),
        ),
      );
      const pity = h('div', 'dp-pity');
      const label = h('span', '', COPY.dungeons.pityIn(rareName));
      const value = h('b', 'bi-num');
      const track = h('div', 'dp-pity__track');
      const fill = h('i');
      track.append(fill);
      pity.append(label, value, track);
      updates.push(() => {
        const s = ctx.state();
        const status = bossStatus(s, content);
        if (!status) return;
        const threshold = effectiveDrops(d, collectModifiers(s, content), content).rare
          .pityThreshold;
        value.textContent = COPY.dungeons.pityKills(Math.max(1, threshold - status.pity));
        fill.style.width = `${Math.min(100, (status.pity / threshold) * 100).toFixed(1)}%`;
      });
      lootCol.append(list, pity, h('p', 'dp-note', COPY.dungeons.dropsNote));
    } else if (t) {
      list.setAttribute('aria-label', COPY.dungeons.tiers);
      for (const tier of t.tiers) {
        const li = h('li', 'dp-drop');
        li.append(
          h('span', 'bi-num', pct(tier.score)),
          h(
            'span',
            '',
            trialRewards({ ...t, tiers: [tier] }, tier.score, collectModifiers(state, content))
              .map(
                (r) =>
                  `${fmt(r.amount)} ${content.resourceById.get(r.resource)?.name ?? r.resource}`,
              )
              .join(', '),
          ),
        );
        list.append(li);
      }
      lootCol.append(h('p', 'dp-note', COPY.dungeons.trialAbout(t.durationSeconds)), list);
    } else {
      lootCol.append(h('p', 'dp-note', COPY.arena.idle));
    }
  }

  /** The handle bar: the dungeon being fought and the one line worth knowing right now. */
  function updateBar(s: GameState): void {
    const id = s.activeDungeonId;
    const d = id ? content.dungeonById.get(id) : undefined;
    const t = id ? content.trialById.get(id) : undefined;
    const name = d?.name ?? t?.name ?? '';
    if (name !== handleName) {
      handleName = name;
      handleText.textContent = name || COPY.arena.handleNone;
      syncHandle();
    }
    const mods = collectModifiers(s, content);
    const status = bossStatus(s, content, mods);
    const threshold = d ? effectiveDrops(d, mods, content).rare.pityThreshold : 0;
    const text = statusText(
      drawerStatus({
        fight: d ? 'dungeon' : t ? 'trial' : 'none',
        knockoutSeconds: d || t ? loadoutHealth(s, content, mods).knockoutSeconds : 0,
        rareKillsLeft: d && status ? threshold - status.pity : null,
      }),
    );
    if (statusLine.textContent !== text) statusLine.textContent = text;
  }

  function refresh(): void {
    for (const u of updates) u();
    updateWeapon();
    shelf.update();
    training.update();
  }

  function render(): void {
    const s = ctx.state();
    const mainId = s.cards.loadouts.fighting.main;
    if (mainId !== weaponId) buildWeapon(mainId);
    if (floorsSignature(s) !== floorsSig) {
      hideTip();
      updates = [];
      buildFloors(s);
    }
    arena.update();
    updateBar(s);
    refresh();
  }

  setTab(tab, { save: false });
  setOpen(open);

  return { render };
}
