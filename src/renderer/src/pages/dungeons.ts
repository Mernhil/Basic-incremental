import type { Dungeon, Trial } from '../../../data';
import {
  Decimal,
  bossStatus,
  burstView,
  buyDamageUpgrade,
  canAfford,
  clearUnlocks,
  collectModifiers,
  damageLevel,
  damageStat,
  damageUpgradeCost,
  damageUpgradeGain,
  effectiveDrops,
  formatDecimal,
  formatDuration,
  isDungeonCleared,
  isDungeonUnlocked,
  secondsPerKill,
  setActiveDungeon,
  trialRewards,
  trialStatus,
  type CombatResult,
  type GameState,
  type Modifier,
  type Price,
} from '../../../game';
import { COPY } from '../copy';
import { frame, h } from '../shell/shell';
import { statTip } from '../shell/stats';
import { attachTooltip, hide as hideTip } from '../shell/tooltip';
import { createHpStack, type HpStackView } from '../ui/hpStack';
import type { PageContext } from './production';
import { bossArt } from '../art/bosses';
import './dungeons.css';

/**
 * Dungeons page, "Descent": the dungeons as a column of floors in order, the special dungeon
 * branching off the floor that opens it. The floor being fought opens up to show the live fight.
 * Damage upgrades sit in a column on the right.
 */

const EMBLEM = {
  gate: '<path d="M22 86V44a28 28 0 0 1 56 0v42Z"/><path d="M36 86V52a14 14 0 0 1 28 0v34"/><path d="M14 86h72"/>',
  trial: '<path d="M50 12 62 40 90 50 62 60 50 88 38 60 10 50 38 40Z"/>',
  lock: '<rect x="30" y="46" width="40" height="32" rx="5"/><path d="M38 46V36a12 12 0 0 1 24 0v10"/>',
  blade: '<path d="M30 74 70 22l6 6-46 52Z"/><path d="M24 70l10 10M20 84l6-6"/>',
  hex: '<path d="M50 14 80 31v38L50 86 20 69V31Z"/>',
  sigil: '<circle cx="50" cy="50" r="28"/><path d="M50 30v40M32 50h36"/>',
  core: '<circle cx="50" cy="50" r="16"/><circle cx="50" cy="50" r="30" stroke-dasharray="6 6"/>',
} as const;

function art(kind: keyof typeof EMBLEM, cls = ''): HTMLElement {
  const box = h('span', `dp-art ${cls}`.trim());
  box.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true">${EMBLEM[kind]}</svg>`;
  return box;
}

const pct = (x: number): string => {
  const v = x * 100;
  return `${v >= 10 || Number.isInteger(v) ? Math.round(v) : v.toFixed(1)}%`;
};

interface Meter {
  el: HTMLElement;
  set(fraction: number, value: string, aria: string): void;
}

/** A labelled bar with role="meter". */
function meter(label: string, cls = ''): Meter {
  const el = h('div', `dp-meter ${cls}`.trim());
  const row = h('div', 'dp-meter__row');
  const value = h('span', 'bi-num');
  row.append(h('span', '', label), value);
  const track = h('div', 'dp-meter__track');
  const fill = h('i');
  track.append(fill);
  track.setAttribute('role', 'meter');
  track.setAttribute('aria-valuemin', '0');
  track.setAttribute('aria-valuemax', '100');
  el.append(row, track);
  return {
    el,
    set(fraction, text, aria) {
      const f = Math.min(1, Math.max(0, fraction));
      fill.style.width = `${(f * 100).toFixed(2)}%`;
      if (value.textContent !== text) value.textContent = text;
      track.setAttribute('aria-valuenow', String(Math.round(f * 100)));
      track.setAttribute('aria-label', `${label}: ${aria}`);
    },
  };
}

function signature(state: GameState): string {
  return JSON.stringify([state.activeDungeonId, state.clearedDungeons, state.prestigeCount]);
}

export function createDungeonsPage(page: HTMLElement, ctx: PageContext): { render(): void } {
  const { content } = ctx;
  const nameOf = (id: string): string =>
    content.dungeonById.get(id)?.name ??
    content.trialById.get(id)?.name ??
    content.mineById.get(id)?.name ??
    id;
  const resName = (id: string): string => content.resourceById.get(id)?.name ?? id;
  const priceText = (p: Price): string => `${formatDecimal(p.amount)} ${resName(p.resource)}`;
  const opensText = (id: string): string => {
    const u = clearUnlocks(content, id);
    return COPY.dungeons.and([...u.dungeons, ...u.mines].map(nameOf));
  };

  const wrap = h('div', 'dp-wrap');
  page.append(wrap);

  let last = '';
  /** Per-tick updates of the built view. */
  let updates: Array<() => void> = [];
  let priced: Array<{ btn: HTMLButtonElement; prices: () => Price[] }> = [];

  const act = (result: CombatResult, focusKey?: string): void => {
    if (!result.ok) return;
    ctx.apply(result.state);
    build(focusKey);
  };

  function build(focusKey?: string): void {
    hideTip();
    const state = ctx.state();
    const mods = collectModifiers(state, content);
    last = signature(state);
    updates = [];
    priced = [];
    wrap.replaceChildren(listFrame(state, mods), damageFrame());
    if (focusKey) wrap.querySelector<HTMLElement>(`[data-key="${focusKey}"]`)?.focus();
    refresh();
  }

  // ---- the list of floors ----

  function listFrame(state: GameState, mods: readonly Modifier[]): HTMLElement {
    const all = [...content.dungeons, ...content.trials];
    const cleared = all.filter((d) => isDungeonCleared(state, d.id)).length;
    const { el, body } = frame(COPY.dungeons.listTitle, COPY.dungeons.cleared(cleared, all.length));
    el.classList.add('dp-list');
    const list = h('ol', 'dp-floors');
    list.setAttribute('aria-label', COPY.dungeons.listTitle);
    for (const dungeon of content.dungeons) {
      list.append(dungeonFloor(dungeon, state, mods));
      // special dungeons branch off the floor whose clear opens them
      for (const trial of content.trials.filter((t) => t.unlockedBy === dungeon.id)) {
        list.append(trialFloor(trial, state, mods));
      }
    }
    for (const trial of content.trials.filter((t) => !content.dungeonById.has(t.unlockedBy ?? '')))
      list.append(trialFloor(trial, state, mods));
    body.append(list);
    return el;
  }

  type FloorState = 'active' | 'cleared' | 'open' | 'locked';

  function floorState(state: GameState, id: string): FloorState {
    if (!isDungeonUnlocked(state, content, id)) return 'locked';
    if (state.activeDungeonId === id) return 'active';
    return isDungeonCleared(state, id) ? 'cleared' : 'open';
  }

  /** Shared floor skeleton: art, title line with tags, meta lines and the action. */
  function floorShell(
    entry: Dungeon | Trial,
    fs: FloorState,
    special: boolean,
    state: GameState,
  ): { li: HTMLElement; info: HTMLElement; title: HTMLElement } {
    const li = h('li', `dp-floor dp-floor--${fs}${special ? ' dp-floor--branch' : ''}`);
    li.dataset.tier = special ? 'special' : String((entry as Dungeon).tier);
    if (fs === 'locked') li.append(art('lock'));
    else {
      // the floor's boss in the sticker style (DESIGN.md 13)
      const portrait = h('span', 'dp-art dp-art--boss');
      const foe = special ? (entry as Trial).target : (entry as Dungeon).boss;
      portrait.innerHTML = `<svg viewBox="-6 -8 112 112" aria-hidden="true" focusable="false">${bossArt(foe.art)}</svg>`;
      li.append(portrait);
    }
    const info = h('div', 'dp-floor__info');
    const title = h('h3', 'dp-floor__name', entry.name);
    title.append(
      h(
        'span',
        'dp-tag dp-tag--tier',
        special ? COPY.dungeons.special : COPY.dungeons.tier((entry as Dungeon).tier),
      ),
    );
    if (fs === 'active') title.append(h('span', 'dp-tag dp-tag--fighting', COPY.dungeons.fighting));
    if (isDungeonCleared(state, entry.id))
      title.append(h('span', 'dp-tag dp-tag--cleared', COPY.dungeons.clearedTag));
    info.append(title);
    li.append(info);

    if (fs === 'locked') {
      const by = entry.unlockedBy ? nameOf(entry.unlockedBy) : '';
      li.append(h('span', 'dp-floor__locked', COPY.dungeons.clearToUnlock(by)));
    } else if (fs !== 'active') {
      const btn = h('button', 'button dp-floor__fight', COPY.dungeons.fight);
      btn.type = 'button';
      btn.dataset.key = `fight-${entry.id}`;
      btn.setAttribute('aria-label', COPY.dungeons.fightLabel(entry.name));
      btn.addEventListener('click', () =>
        act(setActiveDungeon(ctx.state(), content, entry.id), `floor-${entry.id}`),
      );
      li.append(btn);
    }
    title.tabIndex = -1;
    title.dataset.key = `floor-${entry.id}`;
    return { li, info, title };
  }

  function opensLine(id: string, state: GameState): HTMLElement | null {
    const text = opensText(id);
    if (!text) return null;
    return h(
      'p',
      'dp-floor__opens',
      isDungeonCleared(state, id) ? COPY.dungeons.opened(text) : COPY.dungeons.opens(text),
    );
  }

  function dungeonFloor(d: Dungeon, state: GameState, mods: readonly Modifier[]): HTMLElement {
    const fs = floorState(state, d.id);
    const { li, info } = floorShell(d, fs, false, state);
    const meta = h('p', 'dp-floor__meta bi-num');
    info.append(meta);
    const opens = opensLine(d.id, state);
    if (opens) info.append(opens);
    if (fs === 'locked') {
      meta.textContent = COPY.dungeons.boss(d.boss.name, formatDecimal(d.boss.hp), d.boss.hpBars);
      return li;
    }
    const kills = h('span');
    const perKill = h('span', 'has-tip');
    perKill.tabIndex = 0;
    attachTooltip(perKill, COPY.dungeons.perKillTip);
    meta.append(h('span', '', ''), kills, perKill);
    updates.push(() => {
      const s = ctx.state();
      const m = collectModifiers(s, content);
      const max = formatDecimal(bossStatusFor(s, d, m)?.maxHp ?? d.boss.hp);
      const head = meta.firstChild as HTMLElement;
      const headText = COPY.dungeons.boss(d.boss.name, max, d.boss.hpBars);
      if (head.textContent !== headText) head.textContent = headText;
      const k = ` · ${COPY.dungeons.kills(s.combat.kills[d.id] ?? 0)}`;
      if (kills.textContent !== k) kills.textContent = k;
      const sec = secondsPerKill(s, content, d.id, m);
      const t = sec === null ? '' : ` · ${COPY.dungeons.perKill(formatDuration(sec * 1000))}`;
      if (perKill.textContent !== t) perKill.textContent = t;
    });
    if (fs === 'active') li.append(bossLive(d, state, mods));
    return li;
  }

  function bossStatusFor(s: GameState, d: Dungeon, m: readonly Modifier[]) {
    const status = s.activeDungeonId === d.id ? bossStatus(s, content, m) : null;
    if (status) return status;
    // not being fought: show its full HP after prestige scaling and modifiers
    const probe = { ...s, activeDungeonId: d.id, bossHp: null };
    return bossStatus(probe, content, m);
  }

  function burstMeter(): HTMLElement {
    const m = meter(COPY.dungeons.burst, 'dp-meter--burst');
    updates.push(() => {
      const view = burstView(ctx.state(), content, 'fighting');
      const left = Math.max(
        1,
        Math.ceil((view.size - view.gauge) / Math.max(view.stats.fill, 1e-9)),
      );
      const text = COPY.dungeons.burstIn(left);
      m.set(view.fraction, text, text);
    });
    return m.el;
  }

  function bossLive(d: Dungeon, state: GameState, mods: readonly Modifier[]): HTMLElement {
    const live = h('div', 'dp-live');
    const fight = h('div', 'dp-live__fight');
    const hp: HpStackView = createHpStack();
    fight.append(hp.el, burstMeter());
    updates.push(() => {
      const status = bossStatus(ctx.state(), content);
      if (!status) return;
      hp.update(
        status.bars,
        formatDecimal(status.hp),
        formatDecimal(status.maxHp),
        status.hp.div(status.maxHp).toNumber(),
      );
    });

    const loot = h('div', 'dp-live__loot');
    const drops = effectiveDrops(d, mods);
    const rareName = content.cosmeticById.get(d.drops.rare.itemId)?.name ?? d.drops.rare.itemId;
    const list = h('ul', 'dp-drops');
    list.setAttribute('aria-label', COPY.dungeons.dropsLabel);
    const row = (icon: keyof typeof EMBLEM, name: string, kind: string, value: string) => {
      const li = h('li', 'dp-drop');
      const label = h('span', '', name);
      if (kind) label.append(h('span', 'dp-drop__kind', ` · ${kind}`));
      li.append(art(icon), label, h('span', 'bi-num', value));
      return li;
    };
    const owned = state.inventory[d.drops.rare.itemId] ?? 0;
    list.append(
      row(
        'hex',
        rareName,
        owned > 0 ? COPY.dungeons.owned(owned) : COPY.dungeons.rareKind,
        pct(drops.rare.chance),
      ),
      row(
        'sigil',
        resName(drops.portalResource.resource),
        '',
        drops.portalResource.min === drops.portalResource.max
          ? String(drops.portalResource.min)
          : `${drops.portalResource.min}–${drops.portalResource.max}`,
      ),
      row(
        'core',
        resName(drops.material.resource),
        '',
        drops.material.amount > 1
          ? `${pct(drops.material.chance)} ×${drops.material.amount}`
          : pct(drops.material.chance),
      ),
    );
    const pity = meter(COPY.dungeons.pityIn(rareName), 'dp-meter--pity');
    updates.push(() => {
      const status = bossStatus(ctx.state(), content);
      if (!status) return;
      const threshold = effectiveDrops(d, collectModifiers(ctx.state(), content)).rare
        .pityThreshold;
      const left = Math.max(1, threshold - status.pity);
      const text = COPY.dungeons.pityKills(left);
      pity.set(status.pity / threshold, text, text);
    });
    loot.append(list, pity.el);
    live.append(fight, loot);
    return live;
  }

  function trialFloor(t: Trial, state: GameState, mods: readonly Modifier[]): HTMLElement {
    const fs = floorState(state, t.id);
    const { li, info } = floorShell(t, fs, true, state);
    info.append(
      h('p', 'dp-floor__meta', COPY.dungeons.trialAbout(t.durationSeconds)),
      h(
        'p',
        'dp-floor__meta bi-num',
        COPY.dungeons.trialTarget(t.target.name, formatDecimal(t.target.hp)),
      ),
    );
    const best = state.combat.trialBest[t.id] ?? 0;
    if (best > 0) info.append(h('p', 'dp-floor__meta bi-num', COPY.dungeons.best(pct(best))));
    if (fs !== 'active') {
      const opens = opensLine(t.id, state);
      if (opens) info.append(opens);
      return li;
    }

    const live = h('div', 'dp-live');
    const fight = h('div', 'dp-live__fight');
    const time = meter(COPY.dungeons.attempt, 'dp-meter--time');
    const score = meter(COPY.dungeons.score, 'dp-meter--score');
    fight.append(time.el, score.el, burstMeter());
    updates.push(() => {
      const status = trialStatus(ctx.state(), content);
      if (!status) return;
      const left = COPY.dungeons.timeLeft(
        formatDuration((status.durationSeconds - status.elapsedSeconds) * 1000),
      );
      time.set(1 - status.elapsedSeconds / status.durationSeconds, left, left);
      score.set(status.score, pct(status.score), pct(status.score));
    });

    const loot = h('div', 'dp-live__loot');
    const tiers = h('ul', 'dp-drops');
    tiers.setAttribute('aria-label', COPY.dungeons.tiers);
    for (const tier of t.tiers) {
      const rewards = trialRewards({ ...t, tiers: [tier] }, tier.score, mods)
        .map(priceText)
        .join(', ');
      const li = h('li', 'dp-drop dp-drop--tier');
      li.dataset.score = String(tier.score);
      li.append(h('span', 'bi-num', pct(tier.score)), h('span', '', rewards));
      tiers.append(li);
    }
    updates.push(() => {
      const status = trialStatus(ctx.state(), content);
      if (!status) return;
      for (const li of tiers.children) {
        const reached = status.score + 1e-9 >= Number((li as HTMLElement).dataset.score);
        li.classList.toggle('dp-drop--reached', reached);
      }
    });
    loot.append(h('p', 'dp-live__heading', COPY.dungeons.tiers), tiers);
    if (!isDungeonCleared(state, t.id))
      loot.append(h('p', 'dp-floor__meta', COPY.dungeons.trialClear));
    live.append(fight, loot);
    li.append(live);
    return li;
  }

  // ---- damage column ----

  function damageFrame(): HTMLElement {
    const { el, body } = frame(COPY.dungeons.damageTitle);
    el.classList.add('dp-damage');
    const total = h('p', 'dp-dps bi-num has-tip');
    total.tabIndex = 0;
    attachTooltip(total, () =>
      statTip(content, COPY.home.damageTip, damageStat(ctx.state(), content), '/s'),
    );
    updates.push(() => {
      const text = COPY.dungeons.damageNote(formatDecimal(damageStat(ctx.state(), content).value));
      if (total.textContent !== text) total.textContent = text;
    });
    const list = h('ul', 'dp-ups');
    for (const upgrade of content.combat.damageUpgrades) {
      const li = h('li', 'dp-up');
      li.dataset.ore = upgrade.cost.resource;
      const info = h('div', 'dp-up__info');
      const name = h('span', 'dp-up__name', upgrade.name);
      const level = h('span', 'dp-tag');
      name.append(level);
      const meta = h('span', 'dp-up__meta bi-num');
      info.append(name, meta);
      const btn = h('button', 'button dp-up__buy');
      btn.type = 'button';
      btn.dataset.key = `up-${upgrade.id}`;
      const prices = (): Price[] => {
        const p = damageUpgradeCost(ctx.state(), content, upgrade.id);
        return p ? [p] : [];
      };
      priced.push({ btn, prices });
      btn.addEventListener('click', () =>
        act(buyDamageUpgrade(ctx.state(), content, upgrade.id), `up-${upgrade.id}`),
      );
      updates.push(() => {
        const s = ctx.state();
        const lv = COPY.dungeons.upgradeLevel(damageLevel(s, upgrade.id));
        if (level.textContent !== lv) level.textContent = lv;
        const have = s.resources[upgrade.cost.resource] ?? new Decimal(0);
        const gain = formatDecimal(damageUpgradeGain(upgrade, collectModifiers(s, content)));
        const m =
          have.lte(0) && damageLevel(s, upgrade.id) === 0
            ? COPY.dungeons.upgradeLocked(resName(upgrade.cost.resource))
            : COPY.dungeons.upgradeGain(gain);
        if (meta.textContent !== m) meta.textContent = m;
        const b = COPY.dungeons.buy(prices().map(priceText).join(', '));
        if (btn.textContent !== b) btn.textContent = b;
      });
      li.append(art('blade'), info, btn);
      list.append(li);
    }
    body.append(total, list, h('p', 'frame__muted dp-kept', COPY.dungeons.damageKept));
    return el;
  }

  function refresh(): void {
    const state = ctx.state();
    for (const { btn, prices } of priced) {
      const ok = canAfford(state, prices());
      if (btn.disabled === ok) btn.disabled = !ok;
    }
    for (const update of updates) update();
  }

  return {
    render() {
      if (signature(ctx.state()) !== last) build();
      else refresh();
    },
  };
}
