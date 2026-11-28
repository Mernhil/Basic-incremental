import {
  buyShopHeirloom,
  cardDisplayName,
  claimSeasonChest,
  collectModifiers,
  localDay,
  raidSeasonRank,
  raidShop,
  seasonEndsIn,
  syncSeason,
  raidBossHp,
  raidLevel,
  raidsOpen,
  tryRaid,
  type RaidTry,
} from '../../../../game';
import { foeHtml } from '../../art/foes';
import { fmt } from '../../settings/numberFormat';
import { h } from '../../shell/shell';
import type { TableContext, ViewApi, ViewHandle } from '../../table/contract';
import { coinHtml, shopCards } from '../../ui/shopCards';
import { durationText } from '../arena/arenaModel';
import { RAIDS_COPY as T } from './copy';
import {
  bossRows,
  clockText,
  damageAt,
  ending,
  frameAt,
  ladderLines,
  rewardLines,
  shareText,
  type BossRow,
} from './raidsModel';

/**
 * The Raids view (DESIGN.md section 2 Raid bosses): the five bosses with their picture, element,
 * weakness, trick, tries left today and your best score and rank; the fight itself, played back
 * second by second with its timer and running damage; the ladder with the AI teams and your place;
 * and the rank rewards. A try is spent and saved the moment the fight starts (the fight is the
 * same average maths as the duel, so it is already decided); the stage plays it back and a skip
 * button jumps to the end.
 */

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

const set = (node: HTMLElement, text: string): void => {
  if (node.textContent !== text) node.textContent = text;
};

type Mode =
  | { kind: 'list' }
  | { kind: 'ladder'; boss: string }
  | { kind: 'fight'; boss: string }
  | { kind: 'shop'; boss: string };

/** The raid coin sprite of a boss's element. */
const coinSprite = (element: string): string => `coin-raid-${element}`;

export function createRaidsView(host: HTMLElement, ctx: TableContext, api: ViewApi): ViewHandle {
  const { content } = ctx;
  host.classList.add('rd');
  const tabs = h('nav', 'rd-tabs');
  const body = h('div', 'rd__body');
  host.append(body);
  api.setTools(tabs);
  let notice = '';
  let tabsSig = '';
  let mode: Mode = { kind: 'list' };
  let sig = '';

  // the fight being played
  let played: { try: RaidTry; startedAt: number; skipped: boolean } | null = null;
  let live: {
    hp: HTMLElement;
    timer: HTMLElement;
    damage: HTMLElement;
    down: HTMLElement;
    cards: HTMLElement[];
    result: HTMLElement;
    skip: HTMLButtonElement;
    out: string[];
  } | null = null;

  const today = (): string => localDay(new Date());
  const rowOf = (id: string): BossRow =>
    bossRows(ctx.state(), content, today()).find((r) => r.id === id)!;
  const resourceName = (id: string): string => content.resourceById.get(id)?.name ?? id;

  function go(next: Mode): void {
    mode = next;
    notice = '';
    tabsSig = '';
    sig = '';
    if (next.kind !== 'fight') {
      played = null;
      live = null;
    }
    render();
  }

  function start(bossId: string): void {
    const state = ctx.state();
    const r = tryRaid(state, content, collectModifiers(state, content), bossId, today());
    if (!r.ok) return;
    ctx.apply(r.state);
    played = { try: r.result, startedAt: performance.now(), skipped: false };
    go({ kind: 'fight', boss: bossId });
  }

  // ---- the boss list ---------------------------------------------------------------------------

  function bossCard(row: BossRow): HTMLElement {
    const card = h('article', 'rd-boss px-panel');
    card.dataset['boss'] = row.id;
    const pic = h('div', 'rd-boss__pic');
    pic.innerHTML = foeHtml(row.art, 1);
    const info = h('div', 'rd-boss__info');
    const title = h('h3', 'px-display rd-boss__name', row.name);
    const chips = h('p', 'rd-boss__chips');
    chips.append(
      h('span', `rd-chip rd-chip--${row.element}`, cap(row.element)),
      h('span', 'rd-chip', T.weakTo(row.weakTo)),
      h('span', 'rd-chip rd-chip--level', T.level(row.level)),
    );
    const trick = h('p', 'rd-boss__trick');
    trick.append(
      h('b', '', `${T.trickNames[row.trickKind]}. `),
      document.createTextNode(row.trickLine),
    );
    const answer = h('p', 'rd-boss__answer', T.answer(row.answer));
    const tries = h('p', 'rd-boss__tries bi-num', T.tries(row.triesLeft, row.triesMax));
    const boss = content.raidById.get(row.id)!;
    const coins = h('p', 'rd-boss__coins bi-num');
    coins.innerHTML = `${coinHtml(coinSprite(boss.element), 1)}<span>${fmt(ctx.state().arena.raidCoins[row.id] ?? 0)}</span>`;
    const best = h(
      'p',
      'rd-boss__best bi-num',
      row.best === null || row.rank === null
        ? T.noBest
        : T.best(
            fmt(
              raidBossHp(
                content,
                content.raidById.get(row.id)!,
                collectModifiers(ctx.state(), content),
                row.level,
              ).mul(row.best),
            ),
            shareText(row.best),
            row.rank,
            row.of,
          ),
    );
    const open = raidsOpen(ctx.state(), content);
    const fight = h('button', 'px-btn', row.best === null ? T.fight : T.fightAgain);
    fight.type = 'button';
    fight.dataset['key'] = `raid-fight-${row.id}`;
    fight.disabled = !open || row.triesLeft <= 0;
    fight.addEventListener('click', () => start(row.id));
    const ladder = h('button', 'px-btn', T.ladder);
    ladder.type = 'button';
    ladder.dataset['key'] = `raid-ladder-${row.id}`;
    ladder.addEventListener('click', () => go({ kind: 'ladder', boss: row.id }));
    const buttons = h('div', 'rd-boss__buttons');
    buttons.append(fight, ladder);
    info.append(title, chips, trick, answer, tries, coins, best, buttons);
    card.append(pic, info);
    return card;
  }

  function buildList(): void {
    const state = ctx.state();
    const head = h('section', 'rd-head px-panel');
    head.append(h('h2', 'px-display', T.title), h('p', 'rd-note', T.note));
    const season = state.arena.season;
    if (season > 0) {
      const place = raidSeasonRank(state, content, Date.now());
      head.append(
        h(
          'p',
          'rd-gold bi-num',
          T.season(season, durationText(seasonEndsIn(content, season, Date.now())), place),
        ),
      );
    }
    const waiting = state.arena.chests.filter((c) => c.mode === 'raid').length;
    if (waiting > 0) {
      const open = h('button', 'px-btn px-btn--primary', T.openChest(waiting));
      open.type = 'button';
      open.dataset['key'] = 'raid-chest';
      open.addEventListener('click', () => {
        // chests open in order: the ones before the first raid chest are opened with it
        let s = ctx.state();
        for (;;) {
          const first = s.arena.chests[0];
          const r = claimSeasonChest(s, content);
          if (!r || !first) break;
          s = r.state;
          if (first.mode === 'raid') {
            notice = T.chestOpened(r.rank.name, first.season, r.rank.frame);
            break;
          }
        }
        ctx.apply(s);
        sig = '';
        render();
      });
      head.append(open);
    }
    if (notice) head.append(h('p', 'rd-gold', notice));
    if (!raidsOpen(state, content)) head.append(h('p', 'rd-warn', T.sealed));
    else if (!state.cards.loadouts.fighting.slots.some((id) => id !== null))
      head.append(h('p', 'rd-warn', T.noTeam));
    const list = h('div', 'rd-list');
    list.append(...bossRows(state, content, today()).map(bossCard));
    body.replaceChildren(head, list);
  }

  // ---- the fight -------------------------------------------------------------------------------

  function buildFight(bossId: string): void {
    if (!played) return go({ kind: 'list' });
    const boss = content.raidById.get(bossId)!;
    const fight = played.try.fight;
    const stage = h('section', 'rd-stage px-panel');
    stage.append(h('h2', 'px-display', boss.name));
    const top = h('div', 'rd-stage__top');
    const timer = h('span', 'rd-timer bi-num');
    const damage = h('span', 'rd-damage bi-num');
    top.append(timer, damage);
    const pic = h('div', 'rd-stage__pic');
    pic.innerHTML = foeHtml(boss.art, 2);
    const bar = h('div', 'rd-hp');
    bar.setAttribute('role', 'img');
    bar.setAttribute('aria-label', boss.name);
    const hp = h('i');
    bar.append(hp);
    const trick = h('p', 'rd-stage__trick');
    trick.append(
      h('b', '', `${T.trickNames[boss.trick.kind]}. `),
      document.createTextNode(boss.trick.line),
    );
    const team = h('div', 'rd-team');
    const state = ctx.state();
    const ids = state.cards.loadouts.fighting.slots.filter((id): id is string => id !== null);
    const cards = ids.map((id) => {
      const card = content.cardById.get(id);
      const el = h('div', 'rd-card px-panel', card ? cardDisplayName(content, card) : id);
      el.dataset['card'] = id;
      if (card?.element)
        el.append(h('small', `rd-chip rd-chip--${card.element}`, cap(card.element)));
      return el;
    });
    team.append(...cards);
    const down = h('p', 'rd-down bi-num');
    const result = h('div', 'rd-result');
    result.hidden = true;
    const skip = h('button', 'px-btn', T.skip) as HTMLButtonElement;
    skip.type = 'button';
    skip.dataset['key'] = 'raid-skip';
    skip.addEventListener('click', () => {
      if (played) played.skipped = true;
    });
    stage.append(top, result, pic, bar, trick, team, down, skip);
    body.replaceChildren(stage);
    live = { hp, timer, damage, down, cards, result, skip, out: fight.out };
    renderFight();
  }

  function renderFight(): void {
    if (!played || !live || mode.kind !== 'fight') return;
    const fight = played.try.fight;
    const elapsed = played.skipped ? Infinity : (performance.now() - played.startedAt) / 1000;
    const frame = frameAt(fight, elapsed);
    live.hp.style.width = `${Math.round((1 - frame.dealt) * 1000) / 10}%`;
    set(
      live.timer,
      T.timer(
        clockText(content.raids.durationSeconds - frame.t),
        clockText(content.raids.durationSeconds),
      ),
    );
    set(live.damage, T.damage(fmt(damageAt(fight, frame)), shareText(frame.dealt)));
    set(live.down, T.teamDown(frame.down));
    live.cards.forEach((el) => {
      const id = el.dataset['card']!;
      el.classList.toggle('is-down', live!.out.slice(0, frame.down).includes(id));
    });
    live.skip.hidden = frame.done;
    if (frame.done && live.result.hidden) showResult();
  }

  function showResult(): void {
    if (!played || !live || mode.kind !== 'fight') return;
    const { fight, rank, newBest, rewards } = played.try;
    const boss = content.raidById.get(mode.boss)!;
    const result = live.result;
    const end = ending(fight, content.raids.durationSeconds);
    result.dataset['ending'] = end;
    const head = h(
      'h3',
      'px-display',
      end === 'victory' ? T.victory : end === 'timeUp' ? T.timeUp : T.wiped,
    );
    const score = h('p', 'bi-num', T.score(fmt(fight.score), shareText(fight.share)));
    result.replaceChildren(head, score);
    if (newBest) result.append(h('p', 'rd-gold', T.newBest));
    if (played.try.levelUp !== null)
      result.append(h('p', 'rd-gold', T.levelUp(played.try.levelUp)));
    if (rank !== null)
      result.append(h('p', 'bi-num', T.rank(rank, content.raids.ladder.teams.length + 1)));
    result.append(
      h(
        'p',
        '',
        rewards.length > 0
          ? `${T.rewardsPaid}: ${rewards.map((r) => `${fmt(r.amount)} ${resourceName(r.resource)}`).join(', ')}`
          : T.noRewards,
      ),
    );
    const buttons = h('div', 'rd-boss__buttons');
    const again = h('button', 'px-btn', T.fightAgain);
    again.type = 'button';
    again.disabled = rowOf(boss.id).triesLeft <= 0;
    again.addEventListener('click', () => start(boss.id));
    const ladder = h('button', 'px-btn', T.ladder);
    ladder.type = 'button';
    ladder.addEventListener('click', () => go({ kind: 'ladder', boss: boss.id }));
    const back = h('button', 'px-btn', T.back);
    back.type = 'button';
    back.addEventListener('click', () => go({ kind: 'list' }));
    buttons.append(again, ladder, back);
    result.append(buttons);
    result.hidden = false;
  }

  // ---- the raid shops ------------------------------------------------------------------------------

  function buildShop(bossId: string): void {
    const state = ctx.state();
    const boss = content.raidById.get(bossId)!;
    const shop = content.arena.raid.shops[bossId]!;
    const bar = h('section', 'rd-shopbar px-panel');
    const coins = h('div', 'rd-shopbar__coins');
    coins.innerHTML = `${coinHtml(coinSprite(boss.element), 1)}<div><b class="rd-shopbar__label">${shop.coin}s</b><p class="px-display bi-num rd-shopbar__n">${fmt(state.arena.raidCoins[bossId] ?? 0)}</p></div>`;
    bar.append(coins, h('p', 'rd-note', T.shopNote(boss.name)));
    const strip = h('div', 'rd-bosstabs');
    for (const b of content.raids.bosses) {
      const tab = h('button', `px-btn rd-bosstab${b.id === bossId ? ' px-btn--gold is-on' : ''}`);
      tab.type = 'button';
      tab.dataset['key'] = `raid-shop-${b.id}`;
      tab.innerHTML = `${coinHtml(coinSprite(b.element), 0.5)}<span>${b.name}</span>`;
      tab.addEventListener('click', () => go({ kind: 'shop', boss: b.id }));
      strip.append(tab);
    }
    const parts: HTMLElement[] = [bar, strip];
    if (notice) parts.push(h('p', 'rd-gold', notice));
    parts.push(
      shopCards(
        raidShop(state, content, bossId),
        coinSprite(boss.element),
        'raid',
        content,
        (id) => {
          const r = buyShopHeirloom(ctx.state(), content, id);
          if (!r.ok) return;
          ctx.apply(r.state);
          notice = T.bought(content.cardById.get(id)!.name);
          sig = '';
          render();
        },
      ),
    );
    body.replaceChildren(...parts);
  }

  function buildTabs(): void {
    const raidTab = h(
      'button',
      `px-btn vh-back rd-tab${mode.kind !== 'shop' ? ' px-btn--gold is-on' : ''}`,
      T.tabRaid,
    );
    raidTab.type = 'button';
    raidTab.dataset['key'] = 'raid-tab';
    raidTab.addEventListener('click', () => go({ kind: 'list' }));
    const shopTab = h(
      'button',
      `px-btn vh-back rd-tab${mode.kind === 'shop' ? ' px-btn--gold is-on' : ''}`,
      T.tabShop,
    );
    shopTab.type = 'button';
    shopTab.dataset['key'] = 'raid-shop-tab';
    shopTab.addEventListener('click', () =>
      go({ kind: 'shop', boss: mode.kind === 'shop' ? mode.boss : content.raids.bosses[0]!.id }),
    );
    tabs.replaceChildren(raidTab, shopTab);
  }

  // ---- the ladder ------------------------------------------------------------------------------

  function buildLadder(bossId: string): void {
    const state = ctx.state();
    const boss = content.raidById.get(bossId)!;
    const hp = raidBossHp(
      content,
      boss,
      collectModifiers(state, content),
      raidLevel(state, bossId),
    );
    const panel = h('section', 'rd-ladder px-panel');
    panel.append(h('h2', 'px-display', T.ladderTitle(boss.name)), h('p', 'rd-note', T.ladderNote));
    const table = h('ol', 'rd-ladder__rows');
    for (const line of ladderLines(state, content, bossId, hp)) {
      const row = h('li', 'rd-ladder__row');
      row.classList.toggle('is-you', line.you);
      const names = line.cards
        ? line.cards.map((id) => cardDisplayName(content, content.cardById.get(id)!)).join(', ')
        : '';
      row.append(
        h('span', 'rd-ladder__rank bi-num', String(line.rank)),
        h('span', 'rd-ladder__name', line.you ? T.you : line.name),
        h('span', 'rd-ladder__cards', names),
        h('span', 'rd-ladder__score bi-num', `${fmt(line.score)} (${shareText(line.share)})`),
      );
      table.append(row);
    }
    const rewards = h('ul', 'rd-ladder__rewards');
    for (const r of rewardLines(state, content, bossId, resourceName, fmt)) {
      const li = h('li', r.paid ? 'is-paid' : '', `${T.rewardRow(r.rank)}: ${r.text}`);
      if (r.paid) li.append(h('small', '', ` (${T.paid})`));
      rewards.append(li);
    }
    const back = h('button', 'px-btn', T.back);
    back.type = 'button';
    back.dataset['key'] = 'raid-back';
    back.addEventListener('click', () => go({ kind: 'list' }));
    panel.append(table, rewards, back);
    body.replaceChildren(panel);
  }

  function render(): void {
    const synced = syncSeason(ctx.state(), content, Date.now());
    if (synced !== ctx.state()) {
      ctx.apply(synced);
      sig = '';
    }
    if (tabsSig !== mode.kind) {
      tabsSig = mode.kind;
      buildTabs();
    }
    if (mode.kind === 'fight') {
      if (sig !== 'fight') {
        sig = 'fight';
        buildFight(mode.boss);
      }
      renderFight();
      return;
    }
    const s = ctx.state();
    const now = JSON.stringify([
      mode,
      s.raids,
      s.prestigeCount,
      s.cards.loadouts.fighting.slots,
      s.arena,
      notice,
      today(),
      Math.floor(Date.now() / 60_000),
    ]);
    if (now === sig) return;
    sig = now;
    if (mode.kind === 'shop') buildShop(mode.boss);
    else if (mode.kind === 'ladder') buildLadder(mode.boss);
    else buildList();
  }

  return {
    render,
    opened() {
      if (mode.kind !== 'fight') go({ kind: 'list' });
    },
  };
}
