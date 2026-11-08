import type { Dungeon, Trial } from '../../../data';
import {
  bossStatus,
  Decimal,
  clearUnlocks,
  collectModifiers,
  effectiveDrops,
  formatDuration,
  isDungeonCleared,
  isDungeonUnlocked,
  secondsPerKill,
  setActiveDungeon,
  trialRewards,
  bossMastery,
  type GameState,
  type TierUp,
} from '../../../game';
import { fmt } from '../settings/numberFormat';
import { COPY } from '../copy';
import { h } from '../shell/shell';
import { attachTooltip, hide as hideTip } from '../shell/tooltip';
import { createArena, type CoinTarget } from '../stage/arena';
import type { Director } from '../stage/director';
import { bossArt } from '../art/bosses';
import { MEDAL_VIEWBOX, masteryMedal, svg } from '../art/gems';
import { createShelf } from '../ui/shelf';
import { createWeaponPanel, type WeaponPanel } from '../ui/weaponPanel';
import type { CardsModel } from './cardsModel';
import { medalTip } from './progressionModel';
import type { PageContext } from './production';
import './dungeons.css';

/**
 * Dungeons page (DESIGN.md §11, A1 D): the arena fills the page; floors, the damage readout, the
 * weapon panel (the main card's level, XP, stars and tier-up, DESIGN.md §5), the upgrade shelf and
 * drops live in a drawer that slides up from the bottom. Damage comes from the main card.
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
  bar.append(handle);
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

  const shelf = createShelf({
    content,
    state: ctx.state,
    apply: ctx.apply,
    scope: 'fighting',
    sound: ctx.sound,
  });

  // ---- drawer columns ----
  const floorsCol = h('section', 'dp-col dp-col--floors');
  const weaponCol = h('section', 'dp-col dp-col--weapon');
  const lootCol = h('section', 'dp-col dp-col--loot');
  body.append(floorsCol, weaponCol, lootCol);

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
      weaponCol.replaceChildren(head, h('p', 'dp-note', COPY.weapon.noMain), shelf.el);
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
    weaponCol.replaceChildren(head, weapon.el, weaponNote, shelf.el);
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
      const drops = effectiveDrops(d, collectModifiers(state, content), content);
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
              ? fmt(new Decimal(c.min))
              : `${fmt(new Decimal(c.min))}–${fmt(new Decimal(c.max))}`,
          ),
        ),
        ...(drops.wage
          ? [
              row(
                COPY.dungeons.wage(resName(drops.wage.resource)),
                COPY.production.rate(fmt(drops.wage.perSecond)),
              ),
            ]
          : []),
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
        const threshold = effectiveDrops(d, collectModifiers(s, content), content).rare
          .pityThreshold;
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

  function refresh(): void {
    for (const u of updates) u();
    updateWeapon();
    shelf.update();
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
    refresh();
  }

  setOpen(open);

  return { render };
}
