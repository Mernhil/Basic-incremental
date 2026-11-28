import {
  arenaOpen,
  buyShopHeirloom,
  claimSeasonChest,
  collectModifiers,
  localDay,
  otherRival,
  syncSeason,
  teamPower,
  tryArena,
  youForArena,
  type ArenaTry,
} from '../../../../game';
import { cardTierArt, ITEM_VIEWBOX } from '../../art/items';
import { animatedSpriteHtml } from '../../art/pixel/sprites';
import { fmt } from '../../settings/numberFormat';
import { h } from '../../shell/shell';
import type { TableContext, ViewHandle } from '../../table/contract';
import { coinHtml, shopCards } from '../../ui/shopCards';
import { ARENA_COPY as T } from './copy';
import {
  arenaScreen,
  arenaShop,
  chestTrack,
  frameText,
  teamSlots,
  type ArenaScreen,
  type TeamSlot,
} from './arenaModel';

/**
 * The Arena view (DESIGN.md Arena and raids), opened from the hub's colosseum: sub-tabs
 * ← Hub / Arena / Shop. The Arena tab has the duel floor on top (you, VS with Fight and Other rival,
 * the rival), the ladder and the season chest track below; the Shop tab has the coin bar and the arena
 * Heirlooms as big cards. A fight is decided when it starts (the duel is the same average maths as the
 * dungeon's, so one pair of teams always gives one result); the floor plays it back second by second
 * and a skip button jumps to the end. A season's end leaves a chest, opened from the top of the tab.
 */

type Tab = 'arena' | 'shop';

const set = (node: HTMLElement, text: string): void => {
  if (node.textContent !== text) node.textContent = text;
};

/** The frame of a rank with its top number and the season written into its medallion. */
export function frameHtml(
  mode: 'arena' | 'raid',
  rankId: string,
  top: string,
  season: string,
  scale = 1,
): string {
  return `<div class="col-frame" style="--fs:${scale}">${animatedSpriteHtml(`frame-${mode}-${rankId}`, scale)}<span class="col-frame__top">${top}</span><span class="col-frame__season">${season}</span></div>`;
}

export function weaponBox(slot: TeamSlot, down = false): HTMLElement {
  const box = h('div', 'col-box');
  box.title = slot.card.name;
  box.dataset['card'] = slot.id;
  box.classList.toggle('is-down', down);
  box.innerHTML = `<svg viewBox="${ITEM_VIEWBOX}" class="col-box__art" aria-hidden="true">${cardTierArt(slot.card)}</svg>`;
  return box;
}

export function createArenaView(host: HTMLElement, ctx: TableContext): ViewHandle {
  const { content } = ctx;
  host.classList.add('col');
  const tabs = h('nav', 'col-tabs');
  const body = h('div', 'col-body');
  host.append(tabs, body);
  let tab: Tab = 'arena';
  let whole = false;
  let sig = '';
  let played: { try: ArenaTry; startedAt: number; skipped: boolean } | null = null;
  let claimed: {
    text: string;
    mode: 'arena' | 'raid';
    rank: string;
    season: number;
    frame: boolean;
  } | null = null;
  let notice = '';
  let live: {
    you: HTMLElement[];
    rival: HTMLElement[];
    youBar: HTMLElement;
    rivalBar: HTMLElement;
    timer: HTMLElement;
    result: HTMLElement;
    skip: HTMLButtonElement;
  } | null = null;

  const today = (): string => localDay(new Date());
  const resourceName = (id: string): string => content.resourceById.get(id)?.name ?? id;

  function tabButton(label: string, on: boolean, click: () => void, key: string): HTMLElement {
    const b = h('button', `px-btn col-tab${on ? ' is-on' : ''}`, label);
    b.type = 'button';
    b.dataset['key'] = key;
    b.addEventListener('click', click);
    return b;
  }

  function go(next: Tab): void {
    tab = next;
    notice = '';
    sig = '';
    render();
  }

  // ---- the Arena tab ---------------------------------------------------------------------------

  function teamColumn(
    name: string,
    sub: string,
    slots: TeamSlot[],
    power: number,
    side: 'you' | 'rival',
  ): HTMLElement {
    const col = h('section', `col-side col-side--${side}`);
    col.append(h('h2', 'px-display col-side__name', name), h('p', 'col-side__sub bi-num', sub));
    col.append(h('p', 'col-side__power bi-num', T.power(fmt(power))));
    const boxes = h('div', 'col-boxes');
    boxes.append(...slots.map((s) => weaponBox(s)));
    const bar = h('div', 'col-hp');
    bar.append(h('i'));
    col.append(boxes, bar);
    return col;
  }

  function start(): void {
    const state = ctx.state();
    const r = tryArena(state, content, Date.now(), today());
    if (!r.ok) return;
    ctx.apply(r.state);
    played = { try: r.result, startedAt: performance.now(), skipped: false };
    notice = '';
    sig = '';
    render();
  }

  function claim(): void {
    const r = claimSeasonChest(ctx.state(), content);
    if (!r) return;
    ctx.apply(r.state);
    claimed = {
      text: `${r.chest.mode === 'arena' ? T.arenaChest : T.raidChest} · ${r.rank.name}`,
      mode: r.chest.mode,
      rank: r.rank.id,
      season: r.chest.season,
      frame: r.rank.frame,
    };
    sig = '';
    render();
  }

  function chestPanel(s: ArenaScreen): HTMLElement | null {
    const state = ctx.state();
    const first = state.arena.chests[0];
    if (!first && !claimed) return null;
    const panel = h('section', 'col-season px-panel');
    if (claimed) {
      panel.append(h('h2', 'px-display', T.claimed), h('p', '', claimed.text));
      if (claimed.frame) {
        const f = frameText(content, claimed.rank, claimed.season);
        const wrap = h('div', 'col-season__frame');
        wrap.innerHTML = frameHtml(claimed.mode, claimed.rank, f.top, f.season, 2);
        panel.append(
          wrap,
          h(
            'p',
            'col-gold',
            T.frameEarned(
              content.arena.ranks.find((r) => r.id === claimed!.rank)!.name,
              claimed.season,
            ),
          ),
        );
      }
      const ok = h('button', 'px-btn', T.close);
      ok.type = 'button';
      ok.addEventListener('click', () => {
        claimed = null;
        sig = '';
        render();
      });
      panel.append(ok);
      return panel;
    }
    const rank = content.arena.ranks.find((r) => r.id === first!.rank)!;
    panel.append(
      h('h2', 'px-display', T.seasonOver(first!.season)),
      h(
        'p',
        '',
        `${first!.mode === 'arena' ? T.arenaChest : T.raidChest}: ${T.finalPlace(first!.place, rank.name)}`,
      ),
    );
    const icon = h('div', 'col-season__icon');
    icon.innerHTML = animatedSpriteHtml(`rank-${first!.mode}-${rank.id}`, 2);
    const steps = chestTrack(content, first!.place, resourceName, first!.mode);
    const mine = steps.find((x) => x.rank.id === rank.id)!;
    panel.append(icon, h('p', 'bi-num', `${mine.rewards}${mine.frame ? ` ${T.frameNote}` : ''}`));
    const open = h('button', 'px-btn px-btn--primary', T.claim);
    open.type = 'button';
    open.dataset['key'] = 'arena-claim';
    open.addEventListener('click', claim);
    panel.append(open);
    void s;
    return panel;
  }

  function buildArena(s: ArenaScreen): void {
    const parts: HTMLElement[] = [];
    const chest = chestPanel(s);
    if (chest) parts.push(chest);
    const floor = h('section', 'col-floor px-panel');
    const head = h('div', 'col-floor__head');
    const title = h('h2', 'px-display col-floor__title', T.header(s.season, s.endsIn));
    const coins = h('p', 'col-coins bi-num');
    coins.innerHTML = `${coinHtml('coin-arena', 1)}<span>${fmt(s.coins)}</span>`;
    head.append(title, coins);
    const mid = h('div', 'col-mid');
    mid.append(h('p', 'col-vs px-display', T.vs));
    const fight = h('button', 'px-btn px-btn--primary col-fight', T.fight);
    fight.type = 'button';
    fight.dataset['key'] = 'arena-fight';
    fight.disabled =
      !s.open || s.you.length === 0 || s.triesLeft <= 0 || !s.rival || played !== null;
    fight.addEventListener('click', start);
    const other = h('button', 'px-btn col-other', T.otherRival);
    other.type = 'button';
    other.dataset['key'] = 'arena-other';
    other.disabled = !s.open || played !== null;
    other.addEventListener('click', () => {
      ctx.apply(otherRival(ctx.state()));
      sig = '';
      render();
    });
    mid.append(fight, other, h('p', 'col-tries bi-num', T.tries(s.triesLeft, s.triesMax)));
    const warn = !s.open ? T.sealed : s.you.length === 0 ? T.noTeam : !s.rival ? T.noRival : '';
    if (warn) mid.append(h('p', 'col-warn', warn));
    if (notice) mid.append(h('p', 'col-warn', notice));
    const youCol = teamColumn(T.you, T.rankLine(s.rank, fmt(s.points)), s.you, s.yourPower, 'you');
    youCol.querySelector('.col-side__name')!.append(h('small', 'col-rankname', ` ${s.rankName}`));
    const rivalCol = s.rival
      ? teamColumn(
          s.rival.row.name,
          `${T.rankLine(s.rival.row.rank, fmt(s.rival.row.points))}${s.rival.row.archetype ? ` · ${s.rival.row.archetype.name}` : ''}`,
          s.rival.slots,
          s.rival.power,
          'rival',
        )
      : h('section', 'col-side col-side--rival');
    const stage = h('div', 'col-stage');
    stage.append(youCol, mid, rivalCol);
    const timer = h('p', 'col-timer bi-num');
    const result = h('div', 'col-result');
    result.hidden = true;
    const skip = h('button', 'px-btn col-skip', T.skip);
    skip.type = 'button';
    skip.dataset['key'] = 'arena-skip';
    skip.hidden = played === null;
    skip.addEventListener('click', () => {
      if (played) played.skipped = true;
    });
    floor.append(head, stage, timer, result, skip);
    parts.push(floor);
    if (played) {
      live = {
        you: [...youCol.querySelectorAll<HTMLElement>('.col-box')],
        rival: [...rivalCol.querySelectorAll<HTMLElement>('.col-box')],
        youBar: youCol.querySelector<HTMLElement>('.col-hp i')!,
        rivalBar: rivalCol.querySelector<HTMLElement>('.col-hp i')!,
        timer,
        result,
        skip,
      };
    } else live = null;

    const lower = h('div', 'col-lower');
    const ladder = h('section', 'col-ladder');
    const lh = h('div', 'col-ladder__head');
    lh.append(h('h3', 'col-h3', T.ladder), h('span', 'col-note', T.ladderNote));
    const rows = h('ol', 'col-rows');
    for (const line of s.ladder) {
      const li = h('li', `col-row${line.you ? ' is-you' : ''}`);
      const weapons = h('span', 'col-row__weapons');
      for (const slot of teamSlots(content, line.cards ?? s.you.map((x) => x.id)))
        weapons.append(weaponMini(slot));
      li.append(
        h('span', 'col-row__rank bi-num', `#${line.rank}`),
        h('span', 'col-row__name', line.you ? T.you : line.name),
        weapons,
        h(
          'span',
          'col-row__power bi-num',
          line.you ? fmt(s.yourPower) : line.power > 0 ? fmt(line.power) : '',
        ),
        h('span', 'col-row__points bi-num', fmt(line.points)),
      );
      rows.append(li);
    }
    const toggle = h('button', 'px-btn col-whole', whole ? T.nearLadder : T.wholeLadder);
    toggle.type = 'button';
    toggle.dataset['key'] = 'arena-whole';
    toggle.addEventListener('click', () => {
      whole = !whole;
      sig = '';
      render();
    });
    ladder.append(lh, rows, toggle);
    ladder.classList.toggle('is-whole', whole);

    const track = h('section', 'col-chests');
    track.append(h('h3', 'col-h3', T.chestTitle));
    const steps = h('div', 'col-steps');
    for (const step of chestTrack(content, s.rank, resourceName, 'arena')) {
      const card = h('div', `col-step${step.current ? ' is-current' : ''}`);
      const icon = h('div', 'col-step__icon');
      icon.innerHTML = animatedSpriteHtml(`rank-arena-${step.rank.id}`, 2);
      card.append(
        icon,
        h('b', 'col-step__name', step.label),
        h('span', 'col-step__what', step.rewards),
        ...(step.frame ? [h('span', 'col-step__frame', T.frameNote)] : []),
      );
      steps.append(card);
    }
    track.append(steps, h('p', 'col-note', T.chestNote));
    lower.append(ladder, track);
    parts.push(lower);
    body.replaceChildren(...parts);
    renderFight();
  }

  function weaponMini(slot: TeamSlot): HTMLElement {
    const box = h('span', 'col-mini');
    box.title = slot.card.name;
    box.innerHTML = `<svg viewBox="${ITEM_VIEWBOX}" aria-hidden="true">${cardTierArt(slot.card)}</svg>`;
    return box;
  }

  // ---- the fight, played back ---------------------------------------------------------------------

  function renderFight(): void {
    if (!played || !live) return;
    const fight = played.try.fight;
    const elapsed = played.skipped ? Infinity : (performance.now() - played.startedAt) / 1000;
    const done = elapsed >= fight.seconds;
    const idx = Math.min(fight.samples.length - 1, Math.floor(Math.min(elapsed, fight.seconds)));
    const sample = done ? fight.samples[fight.samples.length - 1]! : fight.samples[idx]!;
    live.youBar.style.width = `${Math.round(sample.you * 1000) / 10}%`;
    live.rivalBar.style.width = `${Math.round(sample.rival * 1000) / 10}%`;
    set(live.timer, T.fightEnds(done ? fight.seconds : Math.min(elapsed, fight.seconds)));
    live.you.forEach((el) => {
      const id = el.dataset['card']!;
      el.classList.toggle('is-down', fight.youOut.slice(0, sample.youDown).includes(id));
    });
    live.rival.forEach((el) => {
      const id = el.dataset['card']!;
      el.classList.toggle('is-down', fight.rivalOut.slice(0, sample.rivalDown).includes(id));
    });
    live.skip.hidden = done;
    if (done && live.result.hidden) showResult();
  }

  function showResult(): void {
    if (!played || !live) return;
    const r = played.try;
    const result = live.result;
    result.dataset['ending'] = r.fight.won ? 'victory' : 'defeat';
    result.replaceChildren(
      h('h3', 'px-display', r.fight.won ? T.victory : T.defeat),
      h('p', 'bi-num', `${T.points(r.pointsDelta)} · ${T.coins(r.coins)}`),
      h('p', 'bi-num', T.rankMove(r.rankBefore, r.rankAfter)),
    );
    const again = h('button', 'px-btn', T.again);
    again.type = 'button';
    again.addEventListener('click', () => {
      played = null;
      live = null;
      sig = '';
      render();
      start();
    });
    const close = h('button', 'px-btn', T.close);
    close.type = 'button';
    close.addEventListener('click', () => {
      played = null;
      live = null;
      sig = '';
      render();
    });
    result.append(h('div', 'col-result__buttons'));
    result.lastElementChild!.append(again, close);
    result.hidden = false;
  }

  // ---- the Shop tab --------------------------------------------------------------------------------

  function buildShop(): void {
    const state = ctx.state();
    const bar = h('section', 'col-shopbar px-panel');
    const coins = h('div', 'col-shopbar__coins');
    coins.innerHTML = `${coinHtml('coin-arena', 1)}<div><b class="col-shopbar__label">${T.coinsName}</b><p class="px-display bi-num col-shopbar__n">${fmt(state.arena.coins)}</p></div>`;
    bar.append(coins, h('p', 'col-note', T.shopNote));
    const parts: HTMLElement[] = [bar];
    if (notice) parts.push(h('p', 'col-gold', notice));
    const entries = arenaShop(state, content);
    parts.push(
      entries.length === 0
        ? h('p', 'col-note', T.shopEmpty)
        : shopCards(entries, 'coin-arena', 'arena', content, (id) => {
            const r = buyShopHeirloom(ctx.state(), content, id);
            if (!r.ok) return;
            ctx.apply(r.state);
            notice = T.bought(content.cardById.get(id)!.name);
            sig = '';
            render();
          }),
    );
    body.replaceChildren(...parts);
  }

  // ---- tabs and the tick -------------------------------------------------------------------------

  function buildTabs(): void {
    const back = h('button', 'px-btn col-tab', T.hub);
    back.type = 'button';
    back.dataset['key'] = 'arena-hub';
    back.addEventListener('click', () => ctx.close());
    tabs.replaceChildren(
      back,
      tabButton(T.tabArena, tab === 'arena', () => go('arena'), 'arena-tab'),
      tabButton(T.tabShop, tab === 'shop', () => go('shop'), 'arena-shop-tab'),
    );
  }

  function render(): void {
    const now = Date.now();
    const state0 = ctx.state();
    const synced = syncSeason(state0, content, now);
    if (synced !== state0) {
      ctx.apply(synced);
      sig = '';
    }
    const state = ctx.state();
    if (played) {
      renderFight();
      if (live) return;
    }
    const minute = Math.floor(now / 60_000);
    const key = JSON.stringify([
      tab,
      whole,
      state.arena,
      state.cards.loadouts.fighting.slots,
      state.prestigeCount,
      state.clearedDungeons.length,
      today(),
      minute,
      played !== null,
      claimed,
      notice,
    ]);
    if (key === sig) return;
    sig = key;
    buildTabs();
    if (tab === 'shop') buildShop();
    else {
      const team = youForArena(state, content, []).team;
      buildArena(
        arenaScreen(
          state,
          content,
          now,
          today(),
          whole,
          team.some((c) => c.maxHealth.gt(0)) ? teamPower(team) : 0,
        ),
      );
    }
  }

  void arenaOpen;
  void collectModifiers;
  return {
    render,
    opened() {
      if (!played) {
        tab = 'arena';
        sig = '';
      }
    },
  };
}
