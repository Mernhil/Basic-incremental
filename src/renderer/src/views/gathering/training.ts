import { ELEMENTS, type CardElement } from '../../../../data';
import {
  cardDisplayName,
  copyLoadoutToDummy,
  Decimal,
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

  const settings = (): TrainingSettings => {
    const s = ctx.state();
    const e = prefs().trainingElement;
    return {
      team: s.dummy.team,
      damage: s.dummy.damage,
      element: (ELEMENTS as readonly string[]).includes(e) ? (e as CardElement) : null,
    };
  };

  // ---- the setup ----
  const setup = h('div', 'trb-setup');
  const head = h('section', 'trg__head px-panel');
  const upgrades = h('button', 'px-btn', T.trainingUpgrades);
  upgrades.type = 'button';
  upgrades.dataset['key'] = 'training-upgrades';
  upgrades.addEventListener('click', () => ctx.open('upgrades'));
  head.append(h('h2', 'px-display', T.dummyTitle), h('p', 'trg__note', T.dummyNote), upgrades);

  const team = h('section', 'trg__team px-panel');
  const slotRow = h('div', 'trg__slots');
  const copyBtn = h('button', 'px-btn', T.copyLoadout);
  copyBtn.type = 'button';
  copyBtn.dataset['key'] = 'dummy-copy-loadout';
  copyBtn.addEventListener('click', () => ctx.apply(copyLoadoutToDummy(ctx.state())));
  team.append(h('h3', 'px-display', T.dummyTeam), slotRow, copyBtn);

  const hit = h('section', 'trg__damage px-panel');
  const stepRow = h('div', 'trb-steps');
  stepRow.setAttribute('role', 'group');
  for (const step of DUMMY_STEPS) {
    const b = h('button', 'px-btn', T.dummySteps[step.id]!);
    b.type = 'button';
    b.dataset['key'] = `dummy-step-${step.id}`;
    b.title = T.dummyStepTip;
    b.addEventListener('click', () => {
      const s = ctx.state();
      const r = setDummyDamage(s, content, stepDamage(s, content, s.dummy.team, step.id));
      if (r.ok) ctx.apply(r.state);
    });
    stepRow.append(b);
  }
  const damageIn = h('input', 'trg__damage-in bi-num') as HTMLInputElement;
  damageIn.type = 'text';
  damageIn.inputMode = 'decimal';
  damageIn.setAttribute('aria-label', T.dummyNumber);
  damageIn.dataset['key'] = 'dummy-damage';
  damageIn.addEventListener('change', () => {
    const value = new Decimal(damageIn.value.trim() || '0');
    const r = setDummyDamage(ctx.state(), content, value);
    if (r.ok) ctx.apply(r.state);
    damageIn.value = '';
  });
  const elementSel = h('select', 'trg__card') as HTMLSelectElement;
  elementSel.setAttribute('aria-label', T.dummyElement);
  elementSel.dataset['key'] = 'dummy-element';
  for (const id of ['none', ...ELEMENTS]) {
    const o = h('option', '', id === 'none' ? T.noElement : T.elements[id]!) as HTMLOptionElement;
    o.value = id;
    elementSel.append(o);
  }
  elementSel.value = prefs().trainingElement;
  elementSel.addEventListener('change', () => setPrefs({ trainingElement: elementSel.value }));
  const hitNow = h('p', 'trb-now bi-num');
  hit.append(
    h('h3', 'px-display', T.dummyDamage),
    stepRow,
    damageIn,
    hitNow,
    h('h3', 'px-display', T.dummyElement),
    elementSel,
  );

  const startBtn = h('button', 'px-btn px-btn--gold trb-start', T.start);
  startBtn.type = 'button';
  startBtn.dataset['key'] = 'training-start';
  startBtn.addEventListener('click', () => begin());
  setup.append(head, startBtn, team, hit);

  // ---- the battle screen: the stage and a side panel ----
  const battle = h('div', 'trb-battle');
  battle.hidden = true;
  const stage = h('div', 'trb-stage dv-stage');
  const side = h('aside', 'trb-side px-panel');
  const sideTitle = h('h3', 'px-display', T.panelTitle);
  const verdict = h('p', 'trb-verdict');
  const totalEl = h('p', 'trb-line bi-num');
  const rollingEl = h('p', 'trb-line bi-num');
  const overallEl = h('p', 'trb-line bi-num');
  const bestEl = h('p', 'trb-line bi-num');
  const timeEl = h('p', 'trb-line bi-num');
  const takenEl = h('p', 'trb-line bi-num');
  const fallenEl = h('p', 'trb-line');
  const shares = h('div', 'trb-shares');
  const effects = h('div', 'trb-effects');
  const controls = h('div', 'trb-controls');
  const resetBtn = h('button', 'px-btn', T.reset);
  resetBtn.type = 'button';
  resetBtn.dataset['key'] = 'training-reset';
  const stopBtn = h('button', 'px-btn', T.stop);
  stopBtn.type = 'button';
  stopBtn.dataset['key'] = 'training-stop';
  const backBtn = h('button', 'px-btn', T.backToSetup);
  backBtn.type = 'button';
  backBtn.dataset['key'] = 'training-back';
  controls.append(resetBtn, stopBtn, backBtn);
  side.append(
    sideTitle,
    controls,
    verdict,
    totalEl,
    rollingEl,
    overallEl,
    bestEl,
    timeEl,
    takenEl,
    fallenEl,
    h('h4', 'px-display', T.panelShares),
    shares,
    h('h4', 'px-display', T.panelEffects),
    effects,
  );
  // the result card over the stage once the battle is over (the numbers stay in the side panel)
  const summary = h('div', 'trb-summary px-panel');
  summary.hidden = true;
  const summaryTitle = h('h3', 'px-display', T.summaryTitle);
  const summaryText = h('p', 'trb-summary__text');
  const summaryReset = h('button', 'px-btn px-btn--gold', T.reset);
  summaryReset.type = 'button';
  summaryReset.dataset['key'] = 'training-summary-reset';
  summaryReset.addEventListener('click', () => begin());
  summary.append(summaryTitle, summaryText, summaryReset);
  stage.append(summary);
  battle.append(stage, side);
  host.append(setup, battle);

  resetBtn.addEventListener('click', () => begin());
  stopBtn.addEventListener('click', () => {
    if (run) stopTraining(run);
    render();
  });
  backBtn.addEventListener('click', () => {
    if (run) stopTraining(run);
    run = null;
    showBattle(false);
    render();
  });

  function showBattle(on: boolean): void {
    battle.hidden = !on;
    setup.hidden = on;
    host.classList.toggle('shell-page--stage', on);
    host.classList.toggle('trg--battle', on);
    if (on) arena?.refit();
  }

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
    showBattle(true);
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
  }, 50);

  // ---- drawing ----
  let setupSig = '';
  function buildSetup(): void {
    const s = ctx.state();
    slotRow.replaceChildren();
    for (let i = 0; i < LOADOUT_SLOTS; i += 1) {
      const sel = h('select', 'trg__card') as HTMLSelectElement;
      sel.setAttribute('aria-label', T.dummySlot(i + 1));
      const none = h('option', '', T.noCard) as HTMLOptionElement;
      none.value = '';
      sel.append(none);
      for (const c of content.cards) {
        if (c.job !== 'fighting' || !s.cards.owned[c.id]) continue;
        const o = h('option', '', cardDisplayName(content, c)) as HTMLOptionElement;
        o.value = c.id;
        sel.append(o);
      }
      sel.value = s.dummy.team[i] ?? '';
      sel.addEventListener('change', () => {
        const r = setDummyCard(ctx.state(), content, i, sel.value || null);
        if (r.ok) ctx.apply(r.state);
        else sel.value = ctx.state().dummy.team[i] ?? '';
      });
      slotRow.append(sel);
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
    set(totalEl, `${T.panelTotal}: ${fmt(p.total)}`);
    set(rollingEl, `${T.panelRolling(ROLLING_SECONDS)}: ${fmt(p.rolling)}`);
    set(overallEl, `${T.panelOverall}: ${fmt(p.overall)}`);
    set(bestEl, `${T.panelBest}: ${fmt(p.best)}`);
    set(timeEl, `${T.panelTime}: ${seconds(p.seconds)}`);
    set(takenEl, `${T.panelTaken}: ${fmt(p.taken)} (${p.attacks})`);
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
        const name = h('span', 'trb-share__name', card ? cardDisplayName(content, card) : c.cardId);
        const bar = h('span', 'trb-share__bar');
        bar.append(h('i'));
        row.append(name, bar, h('span', 'trb-share__num bi-num'));
        shares.append(row);
      }
    }
    for (const c of p.cards) {
      const row = shares.querySelector<HTMLElement>(`[data-card="${c.cardId}"]`);
      if (!row) continue;
      set(row.querySelector<HTMLElement>('.trb-share__num')!, `${pct(c.share)} · ${fmt(c.damage)}`);
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
    if (document.activeElement !== damageIn) damageIn.placeholder = fmt(s.dummy.damage);
    set(hitNow, `${T.dummyDamage}: ${fmt(s.dummy.damage)}`);
    if (document.activeElement !== elementSel) elementSel.value = prefs().trainingElement;
    if (run) {
      if (!run.ended) setDuelPace(usableSpeed(run.state, prefs().duelSpeed));
      drawPanel(run);
      arena?.update();
    }
  }

  return {
    render,
    opened: () => arena?.refit(),
    closed: () => setDuelPace(1),
  };
}
