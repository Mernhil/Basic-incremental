import type { ProductionJob } from '../../../data';
import {
  applyProductionPreset,
  bondCodex,
  checkAchievements,
  clearProductionPreset,
  collectTrip,
  expeditionView,
  formatDuration,
  productionPresetSlots,
  recallTrip,
  renameProductionPreset,
  saveProductionPreset,
  startTrip,
  type Decimal,
  type ExpeditionFailure,
  type TripRewards,
} from '../../../game';
import { fmt } from '../settings/numberFormat';
import { h } from '../shell/shell';
import { modifierText } from '../shell/modifierText';
import type { PageContext } from './production';

/**
 * Plain working panels of the table update's mechanics packages (DESIGN.md §15): the worker preset
 * buttons of a production band, and the Bonds codex and Expeditions tabs of the Cards page. The
 * UI rework replaces the layout; every rule is in game (presets.ts, bonds.ts, expeditions.ts).
 */

export interface Panel {
  el: HTMLElement;
  /** Called every frame: rebuilds when what it shows changed, else only moves the clocks. */
  update(): void;
}

const TEXT = {
  presets: 'Worker presets',
  save: 'Save here',
  apply: 'Use',
  clear: 'Clear',
  empty: 'Empty',
  nameLabel: (n: number) => `Preset ${n} name`,
  nothingToSave: 'Nobody is at work to save.',
  missing: (n: number) => `${n} worker${n === 1 ? '' : 's'} of the preset could not be placed.`,
  bondsHint:
    'Two cards at work together give a bonus. A bond stays a silhouette until it is first triggered.',
  undiscovered: '???',
  active: 'Active',
  jobs: { fighting: 'Fighting pair', logging: 'Logging pair', mining: 'Mining pair' },
  tripsHint:
    'Cards in no loadout and at no work can go on a trip; a matching element brings back double. Recalling early brings back nothing.',
  slots: (used: number, total: number) => `Slots ${used} / ${total}`,
  card: 'Card',
  place: 'Place',
  length: 'Length',
  go: 'Send',
  noCards: 'No card is free: take one out of a loadout or off its work.',
  locked: (dungeon: string) => `Clear ${dungeon} to open`,
  collect: 'Collect',
  recall: 'Recall',
  away: 'Away',
  done: 'Back',
  doubled: 'double',
  hours: (n: number) => `${n} h`,
  reasons: {
    'unknown-card': 'No such card.',
    'not-owned': 'You do not own that card.',
    'unknown-place': 'No such place.',
    locked: 'That place is not open yet.',
    'bad-length': 'That length is not offered.',
    'on-trip': 'That card is already away.',
    'in-loadout': 'That card is in the loadout.',
    'at-work': 'That card is at work.',
    'no-slot': 'Every expedition slot is in use.',
    'no-trip': 'No such trip.',
    'not-done': 'The trip is not finished yet.',
  } satisfies Record<ExpeditionFailure, string>,
};

function button(label: string, onClick: () => void, cls = 'button'): HTMLButtonElement {
  const b = h('button', cls, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

// ---- worker presets (a production band) -----------------------------------------------------

export function createPresetsPanel(ctx: PageContext, job: ProductionJob): Panel {
  const el = h('div', 'tp-presets');
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', TEXT.presets);
  let last = '';
  let message = '';

  const signature = (): string => JSON.stringify(ctx.state().presets.production[job]);

  function build(): void {
    last = signature();
    const slots = productionPresetSlots(ctx.state(), job);
    const status = h('p', 'tp-status', message);
    status.setAttribute('role', 'status');
    const row = h('div', 'tp-presets__row');
    row.append(h('span', 'tp-label', TEXT.presets));
    for (const slot of slots) {
      const box = h('div', 'tp-preset');
      const name = h('input', 'tp-preset__name');
      name.type = 'text';
      name.maxLength = 24;
      name.value = slot.name ?? '';
      name.placeholder = TEXT.empty;
      name.disabled = slot.name === null;
      name.setAttribute('aria-label', TEXT.nameLabel(slot.index + 1));
      name.addEventListener('change', () => {
        const r = renameProductionPreset(ctx.state(), job, slot.index, name.value);
        if (r.ok) ctx.apply(r.state);
      });
      const use = button(
        slot.name === null ? TEXT.empty : `${TEXT.apply} (${slot.count})`,
        () => {
          const r = applyProductionPreset(ctx.state(), content(), job, slot.index);
          if (!r.ok) return;
          ctx.apply(r.state);
          message = r.missing > 0 ? TEXT.missing(r.missing) : '';
          build();
        },
        'button tp-preset__use',
      );
      use.disabled = slot.name === null;
      const save = button(
        TEXT.save,
        () => {
          const r = saveProductionPreset(ctx.state(), content(), job, slot.index);
          message = r.ok ? '' : TEXT.nothingToSave;
          if (r.ok) ctx.apply(r.state);
          build();
        },
        'button button--ghost tp-preset__save',
      );
      const clear = button(
        TEXT.clear,
        () => {
          const r = clearProductionPreset(ctx.state(), job, slot.index);
          if (r.ok) ctx.apply(r.state);
          message = '';
          build();
        },
        'button button--ghost tp-preset__clear',
      );
      clear.disabled = slot.name === null;
      box.append(name, use, save, clear);
      row.append(box);
    }
    el.replaceChildren(row, status);
  }
  const content = () => ctx.content;
  build();

  return {
    el,
    update() {
      // leave an input alone while it is being typed in
      if (signature() !== last && !el.contains(document.activeElement)) build();
    },
  };
}

// ---- bonds codex --------------------------------------------------------------------------

export function createBondsPanel(ctx: PageContext): Panel {
  const el = h('section', 'tp-panel tp-bonds');
  let last = '';

  const signature = (): string => {
    const s = ctx.state();
    return JSON.stringify([s.discoveredBonds, bondCodex(s, ctx.content).map((e) => e.active)]);
  };

  function build(): void {
    last = signature();
    const s = ctx.state();
    const list = h('ul', 'tp-list');
    list.setAttribute('aria-label', 'Bonds');
    for (const e of bondCodex(s, ctx.content)) {
      const li = h(
        'li',
        `tp-bond${e.discovered ? '' : ' is-silhouette'}${e.active ? ' is-active' : ''}`,
      );
      li.append(h('strong', 'tp-bond__name', e.name ?? TEXT.undiscovered));
      if (e.job) li.append(h('span', 'tp-bond__job', TEXT.jobs[e.job]));
      if (e.discovered && e.cards && e.bonus) {
        const names = e.cards.map((id) => ctx.content.cardById.get(id)?.name ?? id).join(' + ');
        li.append(
          h('span', 'tp-bond__cards', names),
          h(
            'span',
            'tp-bond__bonus',
            e.bonus.map((m) => `${modifierText(m)} ${m.stat}`).join(', '),
          ),
        );
        if (e.active) li.append(h('span', 'tp-tag', TEXT.active));
      }
      list.append(li);
    }
    el.replaceChildren(h('p', 'tp-hint', TEXT.bondsHint), list);
  }
  build();
  return {
    el,
    update() {
      if (signature() !== last) build();
    },
  };
}

// ---- expeditions --------------------------------------------------------------------------

export function createExpeditionsPanel(
  ctx: PageContext,
  onAchievements?: (ids: string[]) => void,
): Panel {
  const el = h('section', 'tp-panel tp-trips');
  let last = '';
  let message = '';
  let pickCard = '';
  let pickPlace = '';
  let pickHours = 0;
  const clocks: Array<() => void> = [];

  const signature = (): string => {
    const v = expeditionView(ctx.state(), ctx.content);
    return JSON.stringify([
      v.slots,
      v.trips.map((t) => [t.trip.cardId, t.trip.placeId, t.trip.hours, t.done]),
      v.places.map((p) => p.open),
      v.available.map((c) => c.id),
    ]);
  };

  function rewardsText(r: TripRewards): string {
    const parts: string[] = [];
    const name = (id: string): string => ctx.content.resourceById.get(id)?.name ?? id;
    for (const [id, n] of Object.entries(r.materials)) parts.push(`${n} ${name(id)}`);
    for (const [id, n] of Object.entries(r.gems)) parts.push(`${fmt(n as Decimal)} ${name(id)}`);
    parts.push(`${fmt(r.cardXp)} card XP`);
    return parts.join(', ') + (r.doubled ? ` (${TEXT.doubled})` : '');
  }

  function build(): void {
    last = signature();
    clocks.length = 0;
    const s = ctx.state();
    const v = expeditionView(s, ctx.content);
    const status = h('p', 'tp-status', message);
    status.setAttribute('role', 'status');

    const head = h('div', 'tp-trips__head');
    head.append(
      h('span', 'tp-label bi-num', TEXT.slots(v.used, v.slots)),
      h('span', 'tp-hint', TEXT.tripsHint),
    );

    // the trips under way
    const trips = h('ul', 'tp-list');
    trips.setAttribute('aria-label', TEXT.away);
    for (const t of v.trips) {
      const li = h('li', `tp-trip${t.done ? ' is-done' : ''}`);
      const bar = h('div', 'tp-bar');
      const fill = h('i');
      bar.append(fill);
      const time = h('span', 'tp-trip__time bi-num');
      const paint = (): void => {
        const live = expeditionView(ctx.state(), ctx.content).trips.find(
          (x) => x.trip.cardId === t.trip.cardId,
        );
        if (!live) return;
        fill.style.width = `${live.progress * 100}%`;
        time.textContent = live.done ? TEXT.done : formatDuration(live.secondsLeft * 1000);
      };
      paint();
      clocks.push(paint);
      li.append(
        h('strong', 'tp-trip__card', t.cardName),
        h('span', 'tp-trip__place', `${t.placeName} · ${TEXT.hours(t.trip.hours)}`),
        time,
        bar,
        h('span', 'tp-trip__rewards', rewardsText(t.rewards)),
      );
      const act = t.done
        ? button(TEXT.collect, () => {
            const r = collectTrip(ctx.state(), ctx.content, t.trip.cardId);
            if (!r.ok) {
              message = TEXT.reasons[r.reason];
            } else {
              const checked = checkAchievements(r.state, ctx.content);
              ctx.apply(checked.state);
              if (checked.unlocked.length > 0) onAchievements?.(checked.unlocked);
              message = '';
            }
            build();
          })
        : button(
            TEXT.recall,
            () => {
              const r = recallTrip(ctx.state(), t.trip.cardId);
              if (r.ok) ctx.apply(r.state);
              message = '';
              build();
            },
            'button button--ghost',
          );
      li.append(act);
      trips.append(li);
    }

    // sending a card
    const form = h('div', 'tp-form');
    const open = v.places.filter((p) => p.open);
    if (v.available.length === 0) {
      form.append(h('p', 'tp-hint', TEXT.noCards));
    } else if (open.length > 0) {
      if (!v.available.some((c) => c.id === pickCard)) pickCard = v.available[0]!.id;
      if (!open.some((p) => p.place.id === pickPlace)) pickPlace = open[0]!.place.id;
      if (!v.durationsHours.includes(pickHours)) pickHours = v.durationsHours[0]!;
      const select = (
        label: string,
        options: { value: string; text: string }[],
        value: string,
        onChange: (value: string) => void,
      ): HTMLLabelElement => {
        const wrap = h('label', 'tp-field');
        wrap.append(h('span', 'tp-label', label));
        const sel = h('select', 'tp-select');
        for (const o of options) {
          const opt = h('option', '', o.text);
          opt.value = o.value;
          sel.append(opt);
        }
        sel.value = value;
        sel.addEventListener('change', () => {
          onChange(sel.value);
          build();
        });
        wrap.append(sel);
        return wrap;
      };
      form.append(
        select(
          TEXT.card,
          v.available.map((c) => ({ value: c.id, text: `${c.name} (${c.element})` })),
          pickCard,
          (x) => (pickCard = x),
        ),
        select(
          TEXT.place,
          open.map((p) => ({ value: p.place.id, text: `${p.place.name} (${p.place.element})` })),
          pickPlace,
          (x) => (pickPlace = x),
        ),
        select(
          TEXT.length,
          v.durationsHours.map((n) => ({ value: String(n), text: TEXT.hours(n) })),
          String(pickHours),
          (x) => (pickHours = Number(x)),
        ),
        button(TEXT.go, () => {
          const r = startTrip(ctx.state(), ctx.content, pickCard, pickPlace, pickHours);
          if (r.ok) {
            ctx.apply(r.state);
            message = '';
          } else {
            message = TEXT.reasons[r.reason];
          }
          build();
        }),
      );
    }

    // the places
    const places = h('ul', 'tp-list tp-places');
    for (const p of v.places) {
      const li = h('li', `tp-place${p.open ? '' : ' is-locked'}`);
      li.append(h('strong', '', p.place.name), h('span', 'tp-place__element', p.place.element));
      if (!p.open) li.append(h('span', 'tp-hint', TEXT.locked(p.dungeonName)));
      places.append(li);
    }
    el.replaceChildren(head, trips, form, status, places);
  }
  build();
  return {
    el,
    update() {
      if (signature() !== last && !el.contains(document.activeElement)) build();
      else for (const c of clocks) c();
    },
  };
}
