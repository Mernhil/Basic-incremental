import { ELEMENTS, type CardElement } from '../../../../data';
import {
  cardDisplayName,
  copyLoadoutToDummy,
  DUMMY_STEPS,
  LOADOUT_SLOTS,
  ROLLING_SECONDS,
  setDummyCard,
  setDummyDamage,
  startTraining,
  stepDamage,
  stepTraining,
  stopTraining,
  trainingContent,
  trainingPanel,
  usableSpeed,
  defaultRng,
  type TrainingRun,
  type TrainingSettings,
} from '../../../../game';
import { prefs, setPrefs } from '../../settings/prefs';
import { fmt } from '../../settings/numberFormat';
import { h } from '../../shell/shell';
import { FULL_ART_VIEWBOX } from '../../art/items';
import { cardItemArt } from '../../pages/loadoutCards';
import { createArena, type Arena } from '../../stage/arena';
import { createDirector, type Director } from '../../stage/director';
import { setDuelPace } from '../../stage/duelPace';
import type { Content } from '../../../../data';
import type { TableContext, ViewHandle } from '../../table/contract';
import { GATHERING_COPY as T } from './copy';
import './training.css';

/**
 * The Training ground (DESIGN.md section 2 Test dummies): pick a team, set how hard the dummy hits
 * and its element, then fight it in the real duel stage. The dummy never falls (its health is
 * endless, so its bar stays full and the panel counts the damage in a running total); cards can
 * fall. Everything runs on a throwaway copy of the game (`game/trainingBattle.ts`): no reward, no
 * XP, no drop. Only the settings are kept: the team and the damage in the save, the element in the
 * display preferences. The screen around the fight is two plain blocks (`.trb-stage` and
 * `.trb-side`) so it can be restyled without touching the fight.
 */

const set = (node: HTMLElement, text: string): void => {
  if (node.textContent !== text) node.textContent = text;
};
const pct = (x: number): string => `${Math.round(x * 100)} %`;
const seconds = (s: number): string =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

export function createTrainingView(host: HTMLElement, ctx: TableContext): ViewHandle {
  const { content } = ctx;
  host.classList.add('trg');

  // ---- the battle, once started ----
  let run: TrainingRun | null = null;
  let tc: Content | null = null;
  let arena: Arena | null = null;
  let director: Director | null = null;
  let last = 0;
  let drawn = 0;

  const settings = (): TrainingSettings => {
    const s = ctx.state();
    const e = prefs().trainingElement;
    return {
      team: s.dummy.team,
      damage: s.dummy.damage,
      element: (ELEMENTS as readonly string[]).includes(e) ? (e as CardElement) : null,
    };
  };

  // ---- the setup strip: team on trial, dummy hits, dummy element, Restart / Stop ----
  const strip = h('section', 'trs px-panel');
  const teamBox = h('div', 'trs__box trs__team');
  const slotRow = h('div', 'trs__slots');
  const copyBtn = h('button', 'px-btn trs__copy', T.copyLoadout);
  copyBtn.type = 'button';
  copyBtn.dataset['key'] = 'dummy-copy-loadout';
  copyBtn.addEventListener('click', () => {
    ctx.apply(copyLoadoutToDummy(ctx.state()));
    begin();
  });
  const slotMenu = h('div', 'trs__menu px-panel');
  slotMenu.hidden = true;
  const teamHead = h('div', 'trs__head');
  teamHead.append(h('h3', 'trs__label', T.dummyTeam), copyBtn);
  teamBox.append(teamHead, slotRow);

  const hitBox = h('div', 'trs__box trs__hits');
  const stepRow = h('div', 'trs__row');
  stepRow.setAttribute('role', 'group');
  stepRow.setAttribute('aria-label', T.dummyHits);
  const stepBtns = new Map<string, HTMLButtonElement>();
  for (const step of DUMMY_STEPS) {
    const b = h('button', 'px-btn trs__chip', T.dummySteps[step.id]!);
    b.type = 'button';
    b.dataset['key'] = `dummy-step-${step.id}`;
    b.title = T.dummyStepTip;
    b.addEventListener('click', () => {
      const s = ctx.state();
      const r = setDummyDamage(s, content, stepDamage(s, content, s.dummy.team, step.id));
      if (r.ok) {
        ctx.apply(r.state);
        begin();
      }
    });
    stepBtns.set(step.id, b);
    stepRow.append(b);
  }
  const hitNow = h('span', 'trs__value bi-num');
  const hitHead = h('div', 'trs__head');
  hitHead.append(h('h3', 'trs__label', T.dummyHits), hitNow);
  hitBox.append(hitHead, stepRow);

  const elBox = h('div', 'trs__box trs__elements');
  const elRow = h('div', 'trs__row');
  elRow.setAttribute('role', 'group');
  elRow.setAttribute('aria-label', T.dummyElement);
  const elBtns = new Map<string, HTMLButtonElement>();
  for (const id of ['none', ...ELEMENTS]) {
    const b = h(
      'button',
      'px-btn trs__chip trs__el',
      id === 'none' ? T.noElement : T.elements[id]!,
    );
    b.type = 'button';
    b.dataset['key'] = `dummy-element-${id}`;
    b.dataset['element'] = id;
    b.addEventListener('click', () => {
      setPrefs({ trainingElement: id });
      begin();
    });
    elBtns.set(id, b);
    elRow.append(b);
  }
  elBox.append(h('h3', 'trs__label', T.dummyElement), elRow);

  const ctrlBox = h('div', 'trs__box trs__ctrl');
  const startBtn = h('button', 'px-btn px-btn--gold trs__restart', T.restart);
  startBtn.type = 'button';
  startBtn.dataset['key'] = 'training-start';
  startBtn.addEventListener('click', () => begin());
  const stopBtn = h('button', 'px-btn trs__stop', T.stop);
  stopBtn.type = 'button';
  stopBtn.dataset['key'] = 'training-stop';
  stopBtn.addEventListener('click', () => {
    if (run) stopTraining(run);
    render();
  });
  ctrlBox.append(startBtn, stopBtn);
  strip.append(teamBox, hitBox, elBox, ctrlBox, slotMenu);

  // ---- the battle screen: the stage and a side panel ----
  const battle = h('div', 'trb-battle');
  const stage = h('div', 'trb-stage dv-stage');
  const side = h('aside', 'trb-side px-panel');
  const sideTitle = h('h3', 'px-display', T.panelTitle);
  const verdict = h('p', 'trb-verdict');
  // the four big numbers: DPS over the last 10 s, time, best hit, damage the dummy dealt
  const big = h('div', 'trb-big');
  const tile = (label: string, cls = ''): HTMLElement => {
    const t = h('p', 'trb-tile');
    const v = h('span', `trb-tile__v bi-num ${cls}`);
    t.append(h('span', 'trb-tile__l', label), v);
    big.append(t);
    return v;
  };
  const rollingEl = tile(T.panelRolling(ROLLING_SECONDS));
  const timeEl = tile(T.panelTime);
  const bestEl = tile(T.panelBest);
  const takenEl = tile(T.panelTaken, 'trb-tile__v--hurt');
  const fallenEl = h('p', 'trb-line');
  const shares = h('div', 'trb-shares');
  const effects = h('div', 'trb-effects');
  side.append(
    sideTitle,
    verdict,
    big,
    fallenEl,
    h('h4', 'trb-sub', T.panelShares),
    shares,
    h('h4', 'trb-sub', T.panelEffects),
    effects,
  );
  // the result card over the stage once the battle is over (the numbers stay in the side panel)
  const summary = h('div', 'trb-summary px-panel');
  summary.hidden = true;
  const summaryTitle = h('h3', 'px-display', T.summaryTitle);
  const summaryText = h('p', 'trb-summary__text');
  const summaryReset = h('button', 'px-btn px-btn--gold', T.restart);
  summaryReset.type = 'button';
  summaryReset.dataset['key'] = 'training-summary-reset';
  summaryReset.addEventListener('click', () => begin());
  summary.append(summaryTitle, summaryText, summaryReset);
  stage.append(summary);
  battle.append(stage, side);
  host.append(strip, battle);
  host.classList.add('shell-page--stage', 'trg--battle');

  function ensureStage(s: TrainingSettings): void {
    if (arena) return;
    tc = trainingContent(content, s);
    const stateOf = (): ReturnType<typeof ctx.state> => run?.state ?? ctx.state();
    director = createDirector(tc, stateOf);
    director.start();
    arena = createArena({
      content: tc,
      state: stateOf,
      director,
      coins: ctx.coins,
      active: () => run !== null && ctx.current() === 'training' && !document.hidden,
      sound: ctx.sound,
      // the speed button works as in a Challenge: the same open speeds, remembered in the same place
      speed: ctx.duelSpeed,
    });
    arena.el.classList.add('dv-duel', 'trb-duel');
    stage.prepend(arena.el);
  }

  function begin(): void {
    const s = settings();
    ensureStage(s);
    run = startTraining(ctx.state(), content, s, tc!);
    last = performance.now();
    sig = '';
    closeMenu();
    arena?.resetLog();
    arena?.refit();
    render();
  }

  // the fight advances on its own clock, at the open duel speed (x1 / x2 / x4 as in a Challenge)
  window.setInterval(() => {
    const now = performance.now();
    const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
    last = now;
    if (!run || run.ended || ctx.current() !== 'training' || document.hidden) return;
    const speed = usableSpeed(run.state, prefs().duelSpeed);
    setDuelPace(speed);
    const step = stepTraining(run, dt * speed, defaultRng);
    if (step) director?.afterStep(step.report, step.before, step.after);
    if (now - drawn > 250) {
      drawn = now;
      render();
    }
  }, 50);

  // ---- drawing ----
  let setupSig = '';
  function closeMenu(): void {
    slotMenu.hidden = true;
  }
  const iconOf = (cardId: string): string => {
    const art = cardItemArt(content, cardId, ctx.state().cards.owned[cardId], ctx.state());
    const box = art.includes('bi-item--full') ? FULL_ART_VIEWBOX : '10 36 180 180';
    return `<svg viewBox="${box}" aria-hidden="true" focusable="false">${art}</svg>`;
  };
  function openMenu(i: number, anchor: HTMLElement): void {
    const s = ctx.state();
    slotMenu.replaceChildren();
    const choose = (id: string | null, label: string, icon = ''): void => {
      const b = h('button', 'px-btn trs__opt');
      b.type = 'button';
      const ic = h('span', 'trs__icon');
      ic.innerHTML = icon;
      b.append(ic, h('span', 'trs__optname', label));
      b.addEventListener('click', () => {
        closeMenu();
        const r = setDummyCard(ctx.state(), content, i, id);
        if (r.ok) {
          ctx.apply(r.state);
          begin();
        }
      });
      slotMenu.append(b);
    };
    choose(null, T.noCard);
    for (const c of content.cards) {
      if (c.job !== 'fighting' || !s.cards.owned[c.id]) continue;
      if (s.dummy.team.includes(c.id) && s.dummy.team[i] !== c.id) continue;
      choose(c.id, cardDisplayName(content, c), iconOf(c.id));
    }
    slotMenu.hidden = false;
    const box = strip.getBoundingClientRect();
    const at = anchor.getBoundingClientRect();
    const scale = box.width / strip.offsetWidth || 1;
    slotMenu.style.left = `${(at.left - box.left) / scale}px`;
  }
  document.addEventListener('pointerdown', (e) => {
    if (!slotMenu.hidden && !strip.contains(e.target as Node)) closeMenu();
  });
  function buildSetup(): void {
    const s = ctx.state();
    slotRow.replaceChildren();
    for (let i = 0; i < LOADOUT_SLOTS; i += 1) {
      const id = s.dummy.team[i] ?? null;
      const card = id ? content.cardById.get(id) : undefined;
      const b = h('button', 'px-btn trs__slot');
      b.type = 'button';
      b.setAttribute('aria-label', T.dummySlot(i + 1));
      b.dataset['key'] = `dummy-slot-${i + 1}`;
      const ic = h('span', 'trs__icon');
      if (id) ic.innerHTML = iconOf(id);
      b.append(ic, h('span', 'trs__slotname', card ? cardDisplayName(content, card) : T.noCard));
      b.addEventListener('click', () => (slotMenu.hidden ? openMenu(i, b) : closeMenu()));
      slotRow.append(b);
    }
  }

  let sig = '';
  function drawPanel(r: TrainingRun): void {
    const p = trainingPanel(r);
    set(
      verdict,
      r.ended === 'fallen' ? T.summaryFallen : r.ended === 'stopped' ? T.summaryStopped : '',
    );
    verdict.hidden = !r.ended;
    set(sideTitle, r.ended ? T.summaryTitle : T.panelTitle);
    set(rollingEl, fmt(p.rolling));
    set(timeEl, seconds(p.seconds));
    set(bestEl, fmt(p.best));
    set(takenEl, fmt(p.taken));
    takenEl.title = `${p.attacks} ${T.panelAttacks}`;
    const names = p.fallen.map((id) => content.cardById.get(id)?.name ?? id);
    set(fallenEl, names.length > 0 ? `${T.panelFallen}: ${names.join(', ')}` : '');
    fallenEl.hidden = names.length === 0;
    const now = JSON.stringify(p.cards.map((c) => c.cardId));
    if (now !== sig) {
      sig = now;
      shares.replaceChildren();
      for (const c of p.cards) {
        const card = content.cardById.get(c.cardId);
        const row = h('div', 'trb-share');
        row.dataset['card'] = c.cardId;
        const ic = h('span', 'trs__icon');
        ic.innerHTML = iconOf(c.cardId);
        const name = h('span', 'trb-share__name', card ? cardDisplayName(content, card) : c.cardId);
        const bar = h('span', 'trb-share__bar');
        bar.append(h('i'));
        row.append(
          ic,
          name,
          h('span', 'trb-share__dmg bi-num'),
          bar,
          h('span', 'trb-share__pct bi-num'),
        );
        shares.append(row);
      }
    }
    for (const c of p.cards) {
      const row = shares.querySelector<HTMLElement>(`[data-card="${c.cardId}"]`);
      if (!row) continue;
      set(row.querySelector<HTMLElement>('.trb-share__dmg')!, fmt(c.damage));
      set(row.querySelector<HTMLElement>('.trb-share__pct')!, pct(c.share));
      row.querySelector<HTMLElement>('i')!.style.width = `${Math.round(c.share * 100)}%`;
    }
    const lines =
      p.effects.length === 0
        ? [T.panelNoEffects]
        : p.effects.map(
            (e) =>
              `${e.word} ${e.on === 'enemy' ? T.effectOnEnemy : T.effectOnTeam}: ${pct(e.uptime)}`,
          );
    const text = lines.join('\n');
    if (effects.dataset['text'] !== text) {
      effects.dataset['text'] = text;
      effects.replaceChildren(...lines.map((l) => h('p', 'trb-effect', l)));
    }
    stopBtn.disabled = r.ended !== null;
    summary.hidden = !r.ended;
    set(
      summaryText,
      `${r.ended === 'fallen' ? T.summaryFallen : T.summaryStopped} ${T.panelTotal}: ${fmt(p.total)} · ${fmt(p.overall)}/s · ${seconds(p.seconds)}`,
    );
  }

  function render(): void {
    const s = ctx.state();
    const now = JSON.stringify([s.dummy.team, Object.keys(s.cards.owned).length]);
    if (now !== setupSig) {
      setupSig = now;
      buildSetup();
    }
    set(hitNow, `${fmt(s.dummy.damage)} ${T.perAttack}`);
    for (const step of DUMMY_STEPS) {
      // the team's health moves a little with buffs, so a step counts as chosen within 5 %
      const want = stepDamage(s, content, s.dummy.team, step.id);
      const on = want.eq(0)
        ? s.dummy.damage.eq(0)
        : s.dummy.damage.sub(want).abs().div(want).lt(0.05);
      stepBtns.get(step.id)?.setAttribute('aria-pressed', String(on));
    }
    const el = prefs().trainingElement;
    for (const [id, b] of elBtns) b.classList.toggle('is-on', id === el);
    if (run) {
      if (!run.ended) setDuelPace(usableSpeed(run.state, prefs().duelSpeed));
      drawPanel(run);
      arena?.update();
    }
  }

  return {
    render,
    opened: () => {
      if (!run) {
        // a first visit with nobody on trial starts with the player's own fighting loadout
        const s = ctx.state();
        if (s.dummy.team.every((id) => id === null)) ctx.apply(copyLoadoutToDummy(s));
        begin();
      }
      arena?.refit();
    },
    closed: () => setDuelPace(1),
  };
}
