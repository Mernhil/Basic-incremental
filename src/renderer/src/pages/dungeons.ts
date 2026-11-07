import type { Dungeon, Trial } from '../../../data';
import {
  bossStatus,
  buyDamageLevels,
  clearUnlocks,
  collectModifiers,
  damageLevel,
  damageStat,
  effectiveDrops,
  formatDecimal,
  formatDuration,
  isDungeonCleared,
  isDungeonUnlocked,
  milestonesCrossed,
  secondsPerKill,
  setActiveDungeon,
  trialRewards,
  type GameState,
} from '../../../game';
import { COPY } from '../copy';
import { h } from '../shell/shell';
import { statTip } from '../shell/stats';
import { attachTooltip, hide as hideTip } from '../shell/tooltip';
import { createArena, type CoinTarget } from '../stage/arena';
import type { Director } from '../stage/director';
import { replay } from '../stage/motion';
import { toast } from '../stage/toast';
import { bossArt } from '../art/bosses';
import { buyCount, createBuyButton, createBuyToggle, onBuyCount, type BuyButton } from '../ui/buy';
import { bestLine, damageLineViews, type BuyLineView } from './buyModel';
import type { PageContext } from './production';
import './dungeons.css';

/**
 * Dungeons page (DESIGN.md 14, A1 D): the arena fills the page; floors, damage lines and drops
 * live in a drawer that slides up from the bottom. Collapsed, the drawer shows one buy button for
 * the best damage line.
 */

export interface StagePageContext extends PageContext {
  director: Director;
  coins: CoinTarget;
  /** True while this page is on screen. */
  visible: () => boolean;
  sound?: (id: string) => void;
}

const pct = (x: number): string => {
  const v = x * 100;
  return `${v >= 10 || Number.isInteger(v) ? Math.round(v) : v.toFixed(1)}%`;
};

const DRAWER_KEY = 'bi.dungeonDrawer';

function floorsSignature(state: GameState): string {
  return JSON.stringify([state.activeDungeonId, state.clearedDungeons, state.prestigeCount]);
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

  // ---- drawer ----
  const drawer = h('section', 'dp-drawer');
  drawer.setAttribute('aria-label', COPY.arena.drawer);
  const bar = h('div', 'dp-drawer__bar');
  const handle = h('button', 'dp-drawer__handle');
  handle.type = 'button';
  handle.setAttribute('aria-controls', 'dp-drawer-body');
  const handleText = h('span', '', COPY.arena.drawer);
  handle.append(h('i', 'dp-drawer__chev'), handleText);
  const best = h('div', 'dp-best');
  const bestName = h('span', 'dp-best__name');
  let bestId: string | null = null;
  const bestBtn = createBuyButton(() => {
    if (bestId) buy(bestId);
  });
  best.append(bestName, bestBtn.el);
  bar.append(handle, best);
  const body = h('div', 'dp-drawer__body');
  body.id = 'dp-drawer-body';
  drawer.append(bar, body);

  let open = false;
  try {
    open = localStorage.getItem(DRAWER_KEY) === 'open';
  } catch {
    /* stays closed */
  }
  const setOpen = (value: boolean): void => {
    open = value;
    drawer.classList.toggle('is-open', open);
    handle.setAttribute('aria-expanded', String(open));
    handle.setAttribute('aria-label', open ? COPY.arena.drawerClose : COPY.arena.drawerOpen);
    body.inert = !open;
    try {
      localStorage.setItem(DRAWER_KEY, open ? 'open' : 'closed');
    } catch {
      /* not remembered */
    }
  };
  handle.addEventListener('click', () => setOpen(!open));

  const wrap = h('div', 'dp-stage');
  wrap.append(arena.el, drawer);
  page.append(wrap);

  // ---- drawer columns ----
  const floorsCol = h('section', 'dp-col dp-col--floors');
  const damageCol = h('section', 'dp-col dp-col--damage');
  const lootCol = h('section', 'dp-col dp-col--loot');
  body.append(floorsCol, damageCol, lootCol);

  type LineUi = { li: HTMLElement; level: HTMLElement; tag: HTMLElement; btn: BuyButton };
  const lineUis = new Map<string, LineUi>();
  let views: BuyLineView[] = [];
  let floorsSig = '';
  let updates: Array<() => void> = [];

  function buy(id: string): void {
    const s = ctx.state();
    const from = damageLevel(s, id);
    const result = buyDamageLevels(s, content, id, buyCount());
    if (!result.ok) return;
    ctx.apply(result.state);
    const upgrade = content.combat.damageUpgrades.find((u) => u.id === id)!;
    const to = damageLevel(result.state, id);
    lineUis.get(id)?.btn.celebrate();
    if (bestId === id) bestBtn.celebrate();
    ctx.sound?.('buy');
    const crossed = milestonesCrossed(upgrade.milestones, from, to);
    if (crossed.length > 0) {
      const level = crossed[crossed.length - 1]!;
      replay(lineUis.get(id)?.li, 'is-milestone', 1100);
      replay(best, 'is-milestone', 1100);
      toast(
        COPY.buy.reached(upgrade.name, level),
        COPY.buy.reachedDetail(
          COPY.buy.damage,
          formatDecimal(upgrade.milestones.multiplier.pow(crossed.length)),
        ),
        'milestone',
      );
      ctx.sound?.('milestone');
    }
    refresh();
  }

  function buildDamage(): void {
    damageCol.replaceChildren();
    lineUis.clear();
    const head = h('header', 'dp-col__head');
    head.append(h('h3', 'dp-col__title', COPY.arena.damage), createBuyToggle());
    const total = h('p', 'dp-dps bi-num has-tip');
    total.tabIndex = 0;
    attachTooltip(total, () =>
      statTip(content, COPY.home.damageTip, damageStat(ctx.state(), content), '/s'),
    );
    updates.push(() => {
      const text = COPY.dungeons.damageNote(formatDecimal(damageStat(ctx.state(), content).value));
      if (total.textContent !== text) total.textContent = text;
    });
    const list = h('ul', 'dp-lines');
    for (const u of content.combat.damageUpgrades) {
      const li = h('li', 'dp-line');
      li.dataset.ore = u.cost.resource;
      const info = h('div', 'dp-line__info');
      const name = h('span', 'dp-line__name', u.name);
      const level = h('span', 'dp-line__level bi-num');
      const tag = h('span', 'ms-tag bi-num');
      tag.tabIndex = 0;
      attachTooltip(tag, () => {
        const v = views.find((x) => x.id === u.id);
        return v?.milestoneInfo ? COPY.buy.milestoneTip(v.milestoneInfo.levelsToNext) : '';
      });
      info.append(name, level, tag);
      const btn = createBuyButton(() => buy(u.id));
      btn.el.dataset.key = `up-${u.id}`;
      li.append(info, btn.el);
      list.append(li);
      lineUis.set(u.id, { li, level, tag, btn });
    }
    damageCol.append(head, total, list, h('p', 'dp-note', COPY.dungeons.damageKept));
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
    floorsCol.replaceChildren(head, list);
    buildLoot(state);
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
      portrait.innerHTML = `<svg viewBox="-6 -8 112 112" aria-hidden="true" focusable="false">${bossArt(foe.art)}</svg>`;
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
        const parts = [COPY.dungeons.kills(s.combat.kills[d.id] ?? 0)];
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

  function buildLoot(state: GameState): void {
    lootCol.replaceChildren(h('header', 'dp-col__head', ''));
    lootCol.firstElementChild!.append(h('h3', 'dp-col__title', COPY.arena.loot));
    const id = state.activeDungeonId;
    const d = id ? content.dungeonById.get(id) : undefined;
    const t = id ? content.trialById.get(id) : undefined;
    const list = h('ul', 'dp-drops');
    if (d) {
      const drops = effectiveDrops(d, collectModifiers(state, content));
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
        row(
          resName(drops.portalResource.resource),
          drops.portalResource.min === drops.portalResource.max
            ? String(drops.portalResource.min)
            : `${drops.portalResource.min}–${drops.portalResource.max}`,
        ),
        row(
          resName(drops.material.resource),
          drops.material.amount > 1
            ? `${pct(drops.material.chance)} ×${drops.material.amount}`
            : pct(drops.material.chance),
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
        const threshold = effectiveDrops(d, collectModifiers(s, content)).rare.pityThreshold;
        value.textContent = COPY.dungeons.pityKills(Math.max(1, threshold - status.pity));
        fill.style.width = `${Math.min(100, (status.pity / threshold) * 100).toFixed(1)}%`;
      });
      lootCol.append(list, pity);
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
                  `${formatDecimal(r.amount)} ${content.resourceById.get(r.resource)?.name ?? r.resource}`,
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

  function refresh(): void {
    const s = ctx.state();
    const mods = collectModifiers(s, content);
    views = damageLineViews(s, content, buyCount(), mods);
    for (const v of views) {
      const ui = lineUis.get(v.id);
      if (!ui) continue;
      ui.btn.update(v);
      const lv = COPY.dungeons.upgradeLevel(v.level);
      if (ui.level.textContent !== lv) ui.level.textContent = lv;
      if (ui.tag.textContent !== v.milestone) ui.tag.textContent = v.milestone;
      ui.tag.style.setProperty('--p', String(v.milestoneInfo?.progress ?? 0));
      ui.li.classList.toggle('dp-line--locked', !v.available);
    }
    const top = bestLine(views);
    bestId = top?.id ?? null;
    best.hidden = !top;
    if (top) {
      if (bestName.textContent !== top.name) bestName.textContent = top.name;
      bestBtn.update(top);
    }
    for (const u of updates) u();
  }

  function render(): void {
    const s = ctx.state();
    if (floorsSignature(s) !== floorsSig) {
      hideTip();
      updates = [];
      buildDamage();
      buildFloors(s);
    }
    arena.update();
    refresh();
  }

  onBuyCount(() => {
    if (ctx.visible()) refresh();
  });
  setOpen(open);

  return { render };
}
