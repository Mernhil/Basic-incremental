import {
  assignSlotCard,
  campLevel,
  campLevelCost,
  canAfford,
  cardDisplayName,
  collectModifiers,
  Decimal,
  isProducerUnlocked,
  openSlots,
  placeJob,
  producersOf,
  setSlotMaterial,
  slotAt,
  slotMaterial,
  slotRates,
  upgradeCamp,
  type CampPlace,
} from '../../../../game';
import { COPY } from '../../copy';
import { fmt } from '../../settings/numberFormat';
import { costText } from '../../settings/cost';
import { h } from '../../shell/shell';
import type { TableContext, ViewHandle } from '../../table/contract';
import { GATHERING_COPY as T } from './copy';

/**
 * The forest and the cave (DESIGN.md section 2 Base camp): the camp level with its price, and one
 * row per open farming slot with the material it farms, the card on it and what it brings. This is
 * the plain working screen; the painted scene behind the slots is drawn later and goes in the
 * `.camp__scene` element (one named place for the background picture).
 */

const set = (node: HTMLElement, text: string): void => {
  if (node.textContent !== text) node.textContent = text;
};

/** The structural state of a place: what a rebuild of its controls depends on. */
function signature(ctx: TableContext, place: CampPlace): string {
  const s = ctx.state();
  const job = placeJob(place);
  const owned = Object.keys(s.cards.owned).filter(
    (id) => ctx.content.cardById.get(id)?.job === job,
  );
  return JSON.stringify([
    campLevel(s),
    openSlots(s, ctx.content, place),
    s.camp[place],
    owned,
    producersOf(ctx.content, job).map((p) => isProducerUnlocked(s, ctx.content, job, p.id)),
    s.expeditions.trips.map((t) => t.cardId),
    s.production.forge.worker,
  ]);
}

export function createCampView(host: HTMLElement, ctx: TableContext, place: CampPlace): ViewHandle {
  const { content } = ctx;
  const job = placeJob(place);
  host.classList.add('camp', `camp--${place}`);
  /** The painted forest or cave scene goes here when it exists. */
  const scene = h('div', 'camp__scene');
  scene.dataset['scene'] = place;
  const head = h('section', 'camp__head px-panel');
  const levelText = h('h2', 'camp__level px-display');
  const upgrade = h('button', 'px-btn camp__upgrade');
  upgrade.type = 'button';
  upgrade.dataset['key'] = 'camp-upgrade';
  const cost = h('span', 'camp__cost bi-num');
  const next = h('p', 'camp__next');
  head.append(levelText, upgrade, cost, next);
  const list = h('ul', 'camp__slots');
  const total = h('p', 'camp__total bi-num');
  scene.append(head, list, total);
  host.append(scene);

  const rateEls: HTMLElement[] = [];
  let sig = '';

  upgrade.addEventListener('click', () => {
    const r = upgradeCamp(ctx.state(), content);
    if (!r.ok) return;
    ctx.sound('buy');
    ctx.apply(r.state);
    update();
  });

  function build(): void {
    const s = ctx.state();
    const open = openSlots(s, content, place);
    rateEls.length = 0;
    const rows: HTMLElement[] = [];
    for (let index = 0; index < open; index += 1) {
      const slot = slotAt(s, place, index);
      const row = h('li', 'camp__slot');
      row.dataset['slot'] = String(index);
      const material = h('select', 'camp__material') as HTMLSelectElement;
      material.setAttribute('aria-label', T.slotMaterial(index + 1));
      const shown = slotMaterial(s, content, place, index)?.id ?? '';
      for (const p of producersOf(content, job)) {
        const option = h('option', '', p.name) as HTMLOptionElement;
        option.value = p.id;
        option.disabled = !isProducerUnlocked(s, content, job, p.id);
        if (option.disabled) option.textContent = `${p.name} (${T.locked})`;
        material.append(option);
      }
      material.value = shown;
      material.addEventListener('change', () => {
        const r = setSlotMaterial(ctx.state(), content, place, index, material.value);
        if (r.ok) ctx.apply(r.state);
      });
      const card = h('select', 'camp__card') as HTMLSelectElement;
      card.setAttribute('aria-label', T.slotCard(index + 1));
      const none = h('option', '', T.noCard) as HTMLOptionElement;
      none.value = '';
      card.append(none);
      for (const c of content.cards) {
        if (c.job !== job || !s.cards.owned[c.id]) continue;
        const option = h('option', '', cardDisplayName(content, c)) as HTMLOptionElement;
        option.value = c.id;
        card.append(option);
      }
      card.value = slot.card ?? '';
      card.addEventListener('change', () => {
        const r = assignSlotCard(ctx.state(), content, place, index, card.value || null);
        if (!r.ok) return;
        ctx.sound('buy');
        ctx.apply(r.state);
        update();
      });
      const rate = h('span', 'camp__rate bi-num');
      rateEls.push(rate);
      row.append(material, card, rate);
      rows.push(row);
    }
    list.replaceChildren(...rows);
  }

  function update(): void {
    const s = ctx.state();
    const now = signature(ctx, place);
    if (now !== sig) {
      sig = now;
      build();
    }
    const level = campLevel(s);
    set(levelText, T.campLevel(level));
    const prices = campLevelCost(s, content);
    set(cost, prices.map((p) => costText(content, p.resource, p.amount)).join(' · '));
    const can = canAfford(s, prices);
    upgrade.textContent = T.raiseCamp;
    upgrade.setAttribute('aria-disabled', String(!can));
    upgrade.classList.toggle('is-no', !can);
    set(next, T.slotsOpen(openSlots(s, content, place)));
    const rates = slotRates(s, content, collectModifiers(s, content));
    let sum = new Decimal(0);
    rateEls.forEach((el, index) => {
      const found = rates.find((r) => r.worker.place === place && r.worker.index === index);
      if (found) sum = sum.add(found.rate);
      set(
        el,
        found
          ? T.slotRate(found.worker.material.name, fmt(found.rate))
          : slotAt(s, place, index).card
            ? ''
            : T.emptySlot,
      );
    });
    set(total, T.placeRate(COPY.view.titles[job], fmt(sum)));
  }

  return { render: update };
}
