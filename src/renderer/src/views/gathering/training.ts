import {
  cardDisplayName,
  copyLoadoutToDummy,
  Decimal,
  dummyReadout,
  LOADOUT_SLOTS,
  setDummyCard,
  setDummyDamage,
} from '../../../../game';
import { fmt } from '../../settings/numberFormat';
import { h } from '../../shell/shell';
import type { TableContext, ViewHandle } from '../../table/contract';
import { GATHERING_COPY as T } from './copy';

/**
 * The Training ground (DESIGN.md section 2 Test dummies): a dummy with endless health that deals
 * the damage you set. Pick a team of up to four fighting cards and read its damage per second and
 * how long it stands. Nothing here pays a reward or touches the real fight. The Training upgrades
 * (the fighting upgrade lines) open from the button at the top.
 */

const set = (node: HTMLElement, text: string): void => {
  if (node.textContent !== text) node.textContent = text;
};

export function createTrainingView(host: HTMLElement, ctx: TableContext): ViewHandle {
  const { content } = ctx;
  host.classList.add('trg');
  const head = h('section', 'trg__head px-panel');
  const upgrades = h('button', 'px-btn', T.trainingUpgrades);
  upgrades.type = 'button';
  upgrades.dataset['key'] = 'training-upgrades';
  upgrades.addEventListener('click', () => ctx.open('upgrades'));
  head.append(h('h2', 'px-display', T.dummyTitle), h('p', 'trg__note', T.dummyNote), upgrades);

  const team = h('section', 'trg__team px-panel');
  const slotRow = h('div', 'trg__slots');
  const selects: HTMLSelectElement[] = [];
  const copyBtn = h('button', 'px-btn', T.copyLoadout);
  copyBtn.type = 'button';
  copyBtn.dataset['key'] = 'dummy-copy-loadout';
  copyBtn.addEventListener('click', () => ctx.apply(copyLoadoutToDummy(ctx.state())));
  team.append(h('h3', 'px-display', T.dummyTeam), slotRow, copyBtn);

  const damage = h('section', 'trg__damage px-panel');
  const damageIn = h('input', 'trg__damage-in bi-num') as HTMLInputElement;
  damageIn.type = 'text';
  damageIn.inputMode = 'decimal';
  damageIn.setAttribute('aria-label', T.dummyDamage);
  damageIn.dataset['key'] = 'dummy-damage';
  damageIn.addEventListener('change', () => {
    const value = new Decimal(damageIn.value.trim() || '0');
    const r = setDummyDamage(ctx.state(), content, value);
    if (r.ok) ctx.apply(r.state);
    damageIn.value = '';
  });
  damage.append(h('h3', 'px-display', T.dummyDamage), damageIn);

  const read = h('section', 'trg__read px-panel');
  const dpsEl = h('p', 'trg__dps bi-num');
  const incomingEl = h('p', 'trg__incoming bi-num');
  const standEl = h('p', 'trg__stand bi-num');
  read.append(h('h3', 'px-display', T.dummyReadout), dpsEl, incomingEl, standEl);
  host.append(head, team, damage, read);

  let sig = '';
  function build(): void {
    const s = ctx.state();
    slotRow.replaceChildren();
    selects.length = 0;
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
      });
      selects.push(sel);
      slotRow.append(sel);
    }
  }

  function update(): void {
    const s = ctx.state();
    const now = JSON.stringify([s.dummy.team, Object.keys(s.cards.owned).length]);
    if (now !== sig) {
      sig = now;
      build();
    }
    const r = dummyReadout(s, content);
    set(dpsEl, T.dummyDps(fmt(r.dps)));
    set(incomingEl, T.dummyIncoming(fmt(r.incoming)));
    set(
      standEl,
      r.secondsStanding === null ? T.dummyNeverFalls : T.dummyStands(fmt(r.secondsStanding)),
    );
    if (document.activeElement !== damageIn) damageIn.placeholder = fmt(s.dummy.damage);
  }

  return { render: update };
}
