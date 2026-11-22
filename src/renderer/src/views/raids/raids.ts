import {
  cardDisplayName,
  collectModifiers,
  localDay,
  raidBossHp,
  raidsOpen,
  tryRaid,
  type RaidTry,
} from '../../../../game';
import { foeHtml } from '../../art/foes';
import { fmt } from '../../settings/numberFormat';
import { h } from '../../shell/shell';
import type { TableContext, ViewHandle } from '../../table/contract';
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

type Mode = { kind: 'list' } | { kind: 'ladder'; boss: string } | { kind: 'fight'; boss: string };

export function createRaidsView(host: HTMLElement, ctx: TableContext): ViewHandle {
  const { content } = ctx;
  host.classList.add('rd');
  const body = h('div', 'rd__body');
  host.append(body);
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
    );
    const trick = h('p', 'rd-boss__trick');
    trick.append(
      h('b', '', `${T.trickNames[row.trickKind]}. `),
      document.createTextNode(row.trickLine),
    );
    const answer = h('p', 'rd-boss__answer', T.answer(row.answer));
    const tries = h('p', 'rd-boss__tries bi-num', T.tries(row.triesLeft, row.triesMax));
    const best = h(
      'p',
      'rd-boss__best bi-num',
      row.best === null || row.rank === null
        ? T.noBest
        : T.best(
            fmt(
              raidBossHp(content.raidById.get(row.id)!, collectModifiers(ctx.state(), content)).mul(
                row.best,
              ),
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
    info.append(title, chips, trick, answer, tries, best, buttons);
    card.append(pic, info);
    return card;
  }

  function buildList(): void {
    const state = ctx.state();
    const head = h('section', 'rd-head px-panel');
    head.append(h('h2', 'px-display', T.title), h('p', 'rd-note', T.note));
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

  // ---- the ladder ------------------------------------------------------------------------------

  function buildLadder(bossId: string): void {
    const state = ctx.state();
    const boss = content.raidById.get(bossId)!;
    const hp = raidBossHp(boss, collectModifiers(state, content));
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
      today(),
    ]);
    if (now === sig) return;
    sig = now;
    if (mode.kind === 'ladder') buildLadder(mode.boss);
    else buildList();
  }

  return {
    render,
    opened() {
      if (mode.kind !== 'fight') go({ kind: 'list' });
    },
  };
}
