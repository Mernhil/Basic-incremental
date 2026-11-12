import type { Dungeon, Trial } from '../../../data';
import {
  Decimal,
  DIFFICULTIES,
  STAGE_STAR_NAMES,
  STAR_DIFFICULTIES,
  bossMastery,
  bossStatus,
  clearUnlocks,
  collectModifiers,
  difficultyDrops,
  effectiveDrops,
  fightStage,
  floorPosition,
  isDifficultyUnlocked,
  isDungeonCleared,
  isDungeonUnlocked,
  pickDungeon,
  setDifficulty,
  setOverflow,
  stageMap,
  trialRewards,
  type Difficulty,
  type GameState,
  type TierUp,
} from '../../../game';
import { fmt } from '../settings/numberFormat';
import { amountText } from '../settings/coins';
import { COPY } from '../copy';
import { h } from '../shell/shell';
import { attachTooltip, hide as hideTip } from '../shell/tooltip';
import { MEDAL_VIEWBOX, masteryMedal, svg } from '../art/gems';
import { createShelf } from '../ui/shelf';
import { createTrainingPanel } from '../ui/training';
import { createWeaponPanel, type WeaponPanel } from '../ui/weaponPanel';
import { DUEL_COPY } from '../views/dungeon/copy';
import type { CardsModel } from './cardsModel';
import { stageCell, starTotal } from './dungeonsModel';
import { medalTip } from './progressionModel';
import type { PageContext } from './production';
import './dungeons.css';

/**
 * The panels of the dungeon full view (UI_RULES.md §2 The dungeon full view, The duel in detail;
 * mockups 4b and 4g): Dungeons (the dungeon list with star totals on the left; on the right, for
 * the dungeon picked in it, its tiers, Fight here, the stage map with stars, kills and the Overflow
 * switches, and the drops of the dungeon being fought), Weapon (the main card's weapon panel,
 * DESIGN.md §5) and Training (the training lines, then the one-time upgrades, DESIGN.md §6).
 */

export interface DungeonPanelsContext extends PageContext {
  cards: CardsModel;
  sound?: (id: string) => void;
  onTierUps?: (list: TierUp[]) => void;
}

export interface DungeonPanels {
  dungeons: HTMLElement;
  weapon: HTMLElement;
  training: HTMLElement;
  /** Keeps the panels current (call while the view is open). */
  render(): void;
}

const pct = (x: number): string => {
  const v = x * 100;
  return `${v >= 10 || Number.isInteger(v) ? Math.round(v) : v.toFixed(1)}%`;
};

export function createDungeonPanels(ctx: DungeonPanelsContext): DungeonPanels {
  const { content } = ctx;

  // ---- Dungeons (4g) ----
  const dungeons = h('div', 'dp-dun');
  const list = h('ol', 'dp-list');
  list.setAttribute('aria-label', DUEL_COPY.listLabel);
  const trials = h('ol', 'dp-list dp-list--trials');
  const listCol = h('nav', 'dp-dun__list px-panel');
  listCol.append(list, trials);
  const map = h('section', 'dp-dun__map px-panel');
  dungeons.append(listCol, map);

  // the dungeon picked in the list: the one being fought until another is clicked
  let picked: string | null = null;
  let sig = '';
  let updates: Array<() => void> = [];

  const act = (next: GameState | null, focusKey?: string): void => {
    if (!next) return;
    ctx.apply(next);
    render();
    if (focusKey) dungeons.querySelector<HTMLElement>(`[data-key="${focusKey}"]`)?.focus();
  };

  function signature(s: GameState): string {
    const id = picked ?? s.activeDungeonId;
    const d = id ? content.dungeonById.get(id) : undefined;
    return JSON.stringify([
      s.activeDungeonId,
      id,
      s.clearedDungeons,
      s.prestigeCount,
      d ? DIFFICULTIES.map((x) => isDifficultyUnlocked(s, d, x)) : null,
      d ? floorPosition(s, d).difficulty : null,
    ]);
  }

  function listRow(entry: Dungeon | Trial, special: boolean, s: GameState): HTMLElement {
    const unlocked = isDungeonUnlocked(s, content, entry.id);
    const active = s.activeDungeonId === entry.id;
    const chosen = (picked ?? s.activeDungeonId) === entry.id;
    const li = h('li', 'dp-row-wrap');
    const row = h(
      'button',
      `dp-row px-tile${chosen ? ' is-picked' : ''}${active ? ' is-active' : ''}`,
    ) as HTMLButtonElement;
    row.type = 'button';
    row.dataset.key = `row-${entry.id}`;
    row.setAttribute('aria-pressed', String(chosen));
    if (!unlocked) row.classList.add('is-locked');
    const name = h('span', 'dp-row__name', entry.name);
    const meta = h('span', 'dp-row__meta');
    const stars = h('span', 'dp-row__stars');
    row.append(name, stars, meta);
    const foe = special ? (entry as Trial).target.name : (entry as Dungeon).boss.name;
    if (!unlocked) {
      meta.textContent = DUEL_COPY.rowMeta(foe, [
        COPY.dungeons.clearToUnlock(
          entry.unlockedBy ? (content.dungeonById.get(entry.unlockedBy)?.name ?? '') : '',
        ),
      ]);
    } else if (special) {
      const best = s.combat.trialBest[entry.id] ?? 0;
      meta.textContent = DUEL_COPY.rowMeta(foe, [
        best > 0 ? COPY.dungeons.best(pct(best)) : COPY.dungeons.special,
      ]);
      stars.append(medal(entry.id));
    } else {
      const d = entry as Dungeon;
      updates.push(() => {
        const now = ctx.state();
        const at = floorPosition(now, d);
        const parts = [
          COPY.dungeons.difficulty[at.difficulty] ?? at.difficulty,
          Number.isFinite(at.floors)
            ? COPY.dungeons.floorOf(at.floor, at.floors).toLowerCase()
            : COPY.dungeons.depthOf(at.floor).toLowerCase(),
          ...(now.activeDungeonId === d.id ? [COPY.dungeons.fighting.toLowerCase()] : []),
        ];
        const text = DUEL_COPY.rowMeta(foe, parts);
        if (meta.textContent !== text) meta.textContent = text;
        const m = stageMap(now, content).find((x) => x.dungeon.id === d.id);
        const total = starTotal(m?.levels ?? 0, m?.maxLevels ?? 0);
        const st = COPY.dungeons.stars(total.levels, total.max);
        if (stars.textContent !== st) stars.textContent = st;
      });
    }
    row.disabled = !unlocked;
    row.addEventListener('click', () => {
      picked = entry.id;
      render();
      dungeons.querySelector<HTMLElement>(`[data-key="row-${entry.id}"]`)?.focus();
    });
    li.append(row);
    return li;
  }

  function medal(id: string): HTMLElement {
    const box = h('span', 'dp-medal');
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

  function buildList(s: GameState): void {
    list.replaceChildren(...content.dungeons.map((d) => listRow(d, false, s)));
    trials.replaceChildren(...content.trials.map((t) => listRow(t, true, s)));
  }

  /** The right side: the picked dungeon's tiers, Fight here, its stage map and the drops. */
  function buildMap(s: GameState): void {
    const id = picked ?? s.activeDungeonId;
    const d = id ? content.dungeonById.get(id) : undefined;
    const t = id ? content.trialById.get(id) : undefined;
    const head = h('header', 'dp-map__head');
    const title = h('h3', 'dp-map__title px-display', d?.name ?? t?.name ?? COPY.arena.idleTitle);
    head.append(title);
    if (!d && !t) {
      map.replaceChildren(head, h('p', 'dp-note', COPY.arena.idle));
      return;
    }
    const entry = (d ?? t)!;
    if (d) {
      const tiers = h('div', 'dp-tiers');
      tiers.setAttribute('role', 'group');
      tiers.setAttribute('aria-label', COPY.dungeons.difficultyLabel);
      const at = floorPosition(s, d).difficulty;
      DIFFICULTIES.forEach((difficulty: Difficulty, i) => {
        const name = COPY.dungeons.difficulty[difficulty] ?? difficulty;
        const b = h('button', 'px-btn dp-tier', name) as HTMLButtonElement;
        b.type = 'button';
        b.dataset.key = `difficulty-${difficulty}`;
        const open = isDifficultyUnlocked(s, d, difficulty);
        b.disabled = !open;
        b.setAttribute('aria-pressed', String(at === difficulty));
        if (at === difficulty) b.classList.add('px-btn--gold');
        attachTooltip(b, () =>
          !open && i > 0
            ? COPY.dungeons.difficultyLocked(
                COPY.dungeons.difficulty[DIFFICULTIES[i - 1]!] ?? DIFFICULTIES[i - 1]!,
              )
            : (COPY.dungeons.difficultyTip[difficulty] ?? ''),
        );
        b.addEventListener('click', () => {
          const r = setDifficulty(ctx.state(), content, d.id, difficulty);
          act(r.ok ? r.state : null, `difficulty-${difficulty}`);
        });
        tiers.append(b);
      });
      head.append(tiers);
    }
    const active = s.activeDungeonId === entry.id;
    const fight = h(
      'button',
      `px-btn ${active ? 'px-btn--dark' : 'px-btn--gold'} dp-fight`,
      active ? DUEL_COPY.fightingHere : DUEL_COPY.fightHere,
    ) as HTMLButtonElement;
    fight.type = 'button';
    fight.dataset.key = `fight-${entry.id}`;
    fight.disabled = active;
    fight.setAttribute('aria-label', COPY.dungeons.fightLabel(entry.name));
    fight.addEventListener('click', () => {
      const r = pickDungeon(ctx.state(), content, entry.id);
      act(r.ok ? r.state : null, `fight-${entry.id}`);
    });
    head.append(fight);

    const body: HTMLElement[] = [head];
    if (d) body.push(stageGrid(d));
    else if (t) body.push(trialInfo(t, s));
    const opens = clearUnlocks(content, entry.id);
    const opened = [...opens.dungeons, ...opens.mines].map(
      (x) =>
        content.dungeonById.get(x)?.name ??
        content.trialById.get(x)?.name ??
        content.mineById.get(x)?.name ??
        x,
    );
    if (opened.length > 0 && !isDungeonCleared(s, entry.id))
      body.push(h('p', 'dp-note', COPY.dungeons.opens(COPY.dungeons.and(opened))));
    body.push(loot(s));
    map.replaceChildren(...body);
  }

  /** The stage map of one dungeon: a row per stage, a column per tier (4g). */
  function stageGrid(d: Dungeon): HTMLElement {
    const box = h('div', 'dp-grid');
    box.setAttribute('role', 'table');
    box.setAttribute('aria-label', DUEL_COPY.mapOf(d.name));
    const headRow = h('div', 'dp-grid__row dp-grid__row--head');
    headRow.setAttribute('role', 'row');
    headRow.append(h('span', 'dp-grid__corner'));
    for (const tier of STAR_DIFFICULTIES) {
      const th = h('span', 'dp-grid__th px-display', COPY.dungeons.difficulty[tier] ?? tier);
      th.setAttribute('role', 'columnheader');
      headRow.append(th);
    }
    box.append(headRow);
    const now = stageMap(ctx.state(), content).find((m) => m.dungeon.id === d.id);
    const floors = now?.tiers[0]?.stages.map((x) => ({ floor: x.floor, kind: x.kind })) ?? [];
    for (const stage of floors) {
      const row = h('div', 'dp-grid__row');
      row.setAttribute('role', 'row');
      const label = h('span', 'dp-grid__label');
      label.setAttribute('role', 'rowheader');
      label.append(
        h('b', '', DUEL_COPY.stageFloor(stage.floor)),
        h('span', '', stage.kind === 'boss' ? d.boss.name : d.miniBoss.name),
      );
      row.append(label);
      for (const tier of STAR_DIFFICULTIES) row.append(cell(d, tier, stage.floor));
      box.append(row);
    }
    const legend = h('p', 'dp-grid__legend');
    legend.append(h('span', '', `${DUEL_COPY.starLegend}:`));
    for (let lv = 1; lv < STAGE_STAR_NAMES.length; lv++) {
      const item = h('span', 'dp-legend');
      const sw = h('i', 'dp-pip is-on');
      sw.dataset.level = String(lv);
      item.append(sw, h('span', '', STAGE_STAR_NAMES[lv] ?? ''));
      legend.append(item);
    }
    legend.append(h('span', 'dp-grid__note', DUEL_COPY.starNote));
    attachTooltip(legend, () => COPY.dungeons.stageTip);
    box.append(legend);
    return box;
  }

  function cell(d: Dungeon, tier: (typeof STAR_DIFFICULTIES)[number], floor: number): HTMLElement {
    const box = h('div', 'dp-cell px-well');
    box.setAttribute('role', 'cell');
    const pips = h('span', 'dp-pips');
    pips.setAttribute('role', 'img');
    const pipEls = Array.from({ length: 6 }, (_, i) => {
      const p = h('i', 'dp-pip');
      p.dataset.level = String(i + 1);
      return p;
    });
    pips.append(...pipEls);
    const kills = h('span', 'dp-cell__kills');
    const flow = h('div', 'dp-cell__flow');
    const flowLabel = h('span', '', COPY.dungeons.overflowLabel);
    const flowBtn = h('button', 'dp-switch') as HTMLButtonElement;
    flowBtn.type = 'button';
    flowBtn.setAttribute('role', 'switch');
    const key = `${d.id}:${tier}:${floor}`;
    flowBtn.dataset.key = `overflow-${key}`;
    flowBtn.setAttribute('aria-label', `${COPY.dungeons.overflowLabel}, ${d.name} floor ${floor}`);
    const flowNote = h('span', 'dp-cell__note');
    flow.append(flowLabel, flowBtn);
    box.append(pips, kills, flow, flowNote);
    let stageKeyNow = '';
    let state: 'locked' | 'off' | 'on' = 'locked';
    attachTooltip(flowBtn, () =>
      state === 'on' ? COPY.dungeons.overflowTipOn : COPY.dungeons.overflowTipOff,
    );
    flowBtn.addEventListener('click', () => {
      if (!stageKeyNow || state === 'locked') return;
      const r = setOverflow(ctx.state(), content, stageKeyNow, state !== 'on');
      act(r.ok ? r.state : null, `overflow-${key}`);
    });
    const sync = (): void => {
      const s = ctx.state();
      const m = stageMap(s, content).find((x) => x.dungeon.id === d.id);
      const info = m?.tiers
        .find((x) => x.difficulty === tier)
        ?.stages.find((x) => x.floor === floor);
      if (!info) return;
      const c = stageCell(info, isDifficultyUnlocked(s, d, tier));
      stageKeyNow = info.key;
      state = c.overflow;
      box.classList.toggle('is-locked', c.locked);
      pipEls.forEach((p, i) => p.classList.toggle('is-on', i < c.level));
      pips.setAttribute(
        'aria-label',
        COPY.dungeons.starLevel(c.level, STAGE_STAR_NAMES[c.level] ?? ''),
      );
      const text = c.locked ? DUEL_COPY.locked : DUEL_COPY.stageKills(c.kills, c.toNext);
      if (kills.textContent !== text) kills.textContent = text;
      flow.hidden = c.locked || c.overflow === 'locked';
      const note =
        !c.locked && c.overflow === 'locked'
          ? DUEL_COPY.overflowOpens(
              STAGE_STAR_NAMES[content.combat.stageStars.overflowFromLevel] ?? '',
            )
          : '';
      if (flowNote.textContent !== note) flowNote.textContent = note;
      flowBtn.setAttribute('aria-checked', String(c.overflow === 'on'));
    };
    sync();
    updates.push(sync);
    return box;
  }

  function trialInfo(t: Trial, s: GameState): HTMLElement {
    const box = h('div', 'dp-trial');
    const rows = h('ul', 'dp-drops');
    rows.setAttribute('aria-label', COPY.dungeons.tiers);
    for (const tier of t.tiers) {
      const li = h('li', 'dp-drop px-tile');
      li.append(
        h('span', '', pct(tier.score)),
        h(
          'span',
          '',
          trialRewards({ ...t, tiers: [tier] }, tier.score, collectModifiers(s, content))
            .map(
              (r) => `${fmt(r.amount)} ${content.resourceById.get(r.resource)?.name ?? r.resource}`,
            )
            .join(', '),
        ),
      );
      rows.append(li);
    }
    box.append(h('p', 'dp-note', COPY.dungeons.trialAbout(t.durationSeconds)), rows);
    return box;
  }

  /** The drops of the dungeon being fought, with the rare item's pity (DESIGN.md §6). */
  function loot(s: GameState): HTMLElement {
    const box = h('section', 'dp-loot');
    const id = s.activeDungeonId;
    const d = id ? content.dungeonById.get(id) : undefined;
    if (!d) return box;
    box.append(h('h4', 'dp-loot__title', `${COPY.arena.loot} · ${d.name}`));
    const mods = collectModifiers(s, content);
    const table = effectiveDrops(d, mods, content);
    const stage = fightStage(s, content, d.id, mods);
    const drops = stage ? difficultyDrops(table, stage.scale) : table;
    const boss =
      stage && Number.isFinite(stage.floors)
        ? fightStage(s, content, d.id, mods, stage.floors)?.enemies[0]
        : undefined;
    const purse = (n: number, multiplier = 1): Decimal =>
      new Decimal(n).mul(multiplier).mul(boss?.purseScale ?? 1);
    const rareName = content.cosmeticById.get(d.drops.rare.itemId)?.name ?? d.drops.rare.itemId;
    const resName = (r: string): string => content.resourceById.get(r)?.name ?? r;
    const row = (label: string, value: string, cls = ''): HTMLElement => {
      const li = h('li', `dp-drop px-tile ${cls}`.trim());
      li.append(h('span', '', label), h('span', 'bi-num', value));
      return li;
    };
    const owned = s.inventory[d.drops.rare.itemId] ?? 0;
    const rows = h('ul', 'dp-drops');
    rows.append(
      row(
        owned > 0 ? `${rareName} (${COPY.dungeons.owned(owned)})` : rareName,
        pct(drops.rare.chance),
        'dp-drop--rare',
      ),
      ...drops.currencies.map((c) =>
        row(
          COPY.dungeons.perKillDrop(resName(c.resource)),
          c.min === c.max
            ? amountText(content, c.resource, purse(c.min, c.multiplier))
            : `${amountText(content, c.resource, purse(c.min, c.multiplier))} – ${amountText(content, c.resource, purse(c.max, c.multiplier))}`,
        ),
      ),
      ...drops.wages.map((w) =>
        row(COPY.dungeons.wage(resName(w.resource)), COPY.production.rate(fmt(w.perSecond))),
      ),
      ...(isDungeonCleared(s, d.id)
        ? []
        : d.drops.firstClear.map((p) =>
            row(COPY.dungeons.firstClear(resName(p.resource)), fmt(p.amount)),
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
    const value = h('b', 'bi-num');
    const track = h('div', 'dp-pity__track');
    const fill = h('i');
    track.append(fill);
    pity.append(h('span', '', COPY.dungeons.pityIn(rareName)), value, track);
    updates.push(() => {
      const now = ctx.state();
      const status = bossStatus(now, content);
      if (!status) return;
      const threshold = effectiveDrops(d, collectModifiers(now, content), content).rare
        .pityThreshold;
      const text = COPY.dungeons.pityKills(Math.max(1, threshold - status.pity));
      if (value.textContent !== text) value.textContent = text;
      fill.style.transform = `scaleX(${Math.min(1, status.pity / threshold).toFixed(3)})`;
    });
    box.append(rows, pity, h('p', 'dp-note', COPY.dungeons.dropsNote));
    return box;
  }

  // ---- Weapon: follows the main fighting card ----
  const weapon = h('div', 'dp-weapon');
  let weaponId: string | null | undefined;
  let weaponPanel: WeaponPanel | null = null;
  const weaponNote = h('p', 'dp-note');
  weaponNote.setAttribute('role', 'status');
  function buildWeapon(mainId: string | null): void {
    weaponId = mainId;
    weaponPanel = null;
    weaponNote.textContent = '';
    if (!mainId) {
      weapon.replaceChildren(h('p', 'dp-note', COPY.weapon.noMain));
      return;
    }
    weaponPanel = createWeaponPanel({
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
    weapon.replaceChildren(weaponPanel.el, weaponNote);
  }

  // ---- Training: the repeatable lines first, the one-time upgrades under them ----
  const training = h('div', 'dp-training');
  const trainingPanel = createTrainingPanel({
    content,
    state: ctx.state,
    apply: ctx.apply,
    sound: ctx.sound,
  });
  const shelf = createShelf({
    content,
    state: ctx.state,
    apply: ctx.apply,
    scope: 'fighting',
    sound: ctx.sound,
  });
  training.append(trainingPanel.el, h('h3', 'dp-sub px-display', COPY.training.oneTime), shelf.el);

  function render(): void {
    const s = ctx.state();
    if (picked && !content.dungeonById.has(picked) && !content.trialById.has(picked)) picked = null;
    const next = signature(s);
    if (next !== sig) {
      sig = next;
      hideTip();
      updates = [];
      buildList(s);
      buildMap(s);
    }
    for (const u of updates) u();
    const mainId = s.cards.loadouts.fighting.main;
    if (mainId !== weaponId) buildWeapon(mainId);
    const entry = weaponId ? ctx.cards.entry(s, weaponId) : null;
    if (entry) weaponPanel?.update(entry);
    trainingPanel.update();
    shelf.update();
  }

  return {
    dungeons,
    weapon,
    training,
    render,
  };
}
