import {
  CARD_SLOTS,
  COSMETIC_SLOTS,
  RANK_TIERS,
  RARITIES,
  loadContent,
  type Content,
  type CosmeticSlot,
  type Rank,
  type Rarity,
  type CardElement,
} from '../../../data';
import {
  detectSets,
  emptyLoadout,
  equip,
  resolveCard,
  unequipCard,
  type CosmeticLoadout,
} from '../../../game';
import { applyGlobalTheme, assertVisualsImplemented, configureCardLevels } from '../theme/apply';
import { createCard, type CardView } from '../ui/card';
import { itemArt } from '../art/items';
import { COPY } from '../copy';
import { installArtDefs } from '../art/defs';
import { playHit, showTick } from '../theme/effects';
import { defaultRng, resolveGlobal } from '../../../game';
import './gallery.css';

/**
 * Dev-only card gallery: every tier and star count, star 5 vs 6 per tier, the 5 -> 6
 * transition, and a picker to equip any cosmetic per slot (with levels and the exclusive).
 * Open with #gallery in a dev build (Ctrl+Shift+G).
 */

const SLOT_LABELS: Record<CosmeticSlot, string> = {
  border: 'Card border',
  finish: 'Card finish',
  attack: 'Attack',
  tick: 'Tick damage',
  number: 'Numbers',
  table: 'Table',
  cursor: 'Cursor',
  starlight: 'Starlight coin',
  sticker: 'Sticker style',
  nodes: 'Skill nodes',
  wardrobe: 'Wardrobe style',
};
const EXCLUSIVE_CARD = 'dawnblade_regent';

interface Shown {
  view: CardView;
  id: string;
  rank: Rank;
  name: string;
  emblem: string;
}

export function renderGallery(root: HTMLElement = document.body): void {
  const content = loadContent();
  assertVisualsImplemented(content);
  configureCardLevels(content);
  installArtDefs();

  let loadout: CosmeticLoadout = emptyLoadout();
  let rarity: Rarity = 'epic';
  const shown: Shown[] = [];

  root.innerHTML = '';
  root.classList.add('gallery');
  const page = el('main', 'gallery__page');
  root.append(page);

  page.append(el('h1', 'gallery__title', 'Card gallery'));
  const controls = el('section', 'gallery__controls');
  const setsLine = el('p', 'gallery__sets');
  page.append(controls, setsLine);

  // ---- pickers ----
  for (const slot of COSMETIC_SLOTS) {
    const items = content.cosmetics.filter((c) => c.slot === slot && !c.exclusiveCard);
    const field = el('label', 'gallery__field');
    field.append(el('span', '', SLOT_LABELS[slot]));
    const item = select(
      items.map((c) => [c.id, `${c.name}${c.set ? ` (${c.set.replace(/_/g, ' ')})` : ''}`]),
    );
    const level = select([['1', 'Level 1']]);
    item.dataset['testid'] = `pick-${slot}`;
    level.dataset['testid'] = `level-${slot}`;
    const syncLevels = () => {
      const cosmetic = content.cosmeticById.get(item.value)!;
      level.replaceChildren(
        ...cosmetic.levels.map((_, i) => option(String(i + 1), `Level ${i + 1}`)),
      );
      level.disabled = cosmetic.levels.length === 1;
    };
    item.value = content.starterBySlot[slot].id;
    syncLevels();
    item.addEventListener('change', () => {
      syncLevels();
      loadout = equip(content, loadout, slot, { id: item.value, level: 1 });
      refresh();
    });
    level.addEventListener('change', () => {
      loadout = equip(content, loadout, slot, { id: item.value, level: Number(level.value) });
      refresh();
    });
    field.append(item, level);
    controls.append(field);
  }

  const exclusive = el('label', 'gallery__field');
  exclusive.append(el('span', '', 'Exclusive on Ember Warden'));
  const exclusiveSelect = select([
    ['', 'None'],
    ...content.cosmetics
      .filter((c) => c.exclusiveCard === EXCLUSIVE_CARD)
      .map((c): [string, string] => [c.id, c.name]),
  ]);
  exclusiveSelect.dataset['testid'] = 'pick-exclusive';
  exclusiveSelect.addEventListener('change', () => {
    const cosmetic = content.cosmeticById.get(exclusiveSelect.value);
    loadout = cosmetic
      ? equip(
          content,
          loadout,
          cosmetic.slot as (typeof CARD_SLOTS)[number],
          { id: cosmetic.id, level: 1 },
          EXCLUSIVE_CARD,
        )
      : CARD_SLOTS.reduce((acc, slot) => unequipCard(acc, EXCLUSIVE_CARD, slot), loadout);
    refresh();
  });
  exclusive.append(exclusiveSelect);

  const rarityField = el('label', 'gallery__field');
  rarityField.append(el('span', '', 'Card rarity'));
  const raritySelect = select(
    RARITIES.map((r): [string, string] => [r, content.rarityById.get(r)!.name]),
  );
  raritySelect.dataset['testid'] = 'pick-rarity';
  raritySelect.value = rarity;
  raritySelect.addEventListener('change', () => {
    rarity = raritySelect.value as Rarity;
    refresh();
  });
  rarityField.append(raritySelect);
  controls.append(exclusive, rarityField);

  const rules = content.wearRules;
  controls.append(
    el(
      'p',
      'gallery__note',
      `Wear rules: border from ${fmt(rules.border)}, finish from ${fmt(rules.finish)}, exclusives from ${fmt(rules.exclusive)}. Below that a card shows the starter look.`,
    ),
  );

  // ---- sections ----
  const add = (
    title: string,
    cards: Array<[string, Rank, string, string]>,
    extra?: HTMLElement,
  ) => {
    const section = el('section', 'gallery__section');
    section.append(el('h2', 'gallery__h2', title));
    const row = el('div', 'gallery__row');
    for (const [id, rank, name, emblem] of cards) {
      const view = createCard(cardProps(content, loadout, id, rank, name, emblem, rarity));
      const fig = el('figure', 'gallery__fig');
      fig.append(view.el, el('figcaption', '', `${cap(rank.tier)} ${rank.stars}`));
      row.append(fig);
      shown.push({ view, id, rank, name, emblem });
    }
    section.append(row);
    if (extra) section.append(extra);
    page.append(section);
  };

  add(
    'Star 6 evolution: Bronze, Silver, Gold, Prismatic',
    RANK_TIERS.map((tier) => [EXCLUSIVE_CARD, { tier, stars: 6 }, 'Ember Warden', 'blade']),
  );
  for (const tier of RANK_TIERS) {
    add(
      `${cap(tier)}: star 1 to 6`,
      [1, 2, 3, 4, 5, 6].map((stars) => ['shield_warden', { tier, stars }, 'Whetstone', 'gem']),
    );
  }

  // every beta card's signature item at its own rarity, then the Ember Blade at every rarity
  const items = el('section', 'gallery__section');
  items.append(el('h2', 'gallery__h2', 'Signature items (each card at its own rarity)'));
  const itemRow = el('div', 'gallery__row');
  for (const card of content.cards) {
    const view = createCard({
      ...cardProps(
        content,
        loadout,
        card.id,
        { tier: 'bronze', stars: 1 },
        card.name,
        'blade',
        card.rarity,
      ),
      item: itemArt(card.item.kind, card.rarity),
      label: cap(card.rarity),
    });
    const fig = el('figure', 'gallery__fig');
    fig.append(view.el, el('figcaption', '', card.item.name));
    itemRow.append(fig);
  }
  items.append(itemRow, el('h2', 'gallery__h2', 'Ember Blade at every rarity'));
  const ladder = el('div', 'gallery__row');
  for (const r of RARITIES) {
    const view = createCard({
      ...cardProps(
        content,
        loadout,
        'ember_squire',
        { tier: 'bronze', stars: 1 },
        cap(r),
        'blade',
        r,
      ),
      item: itemArt('sword', r),
    });
    const fig = el('figure', 'gallery__fig');
    fig.append(view.el, el('figcaption', '', cap(r)));
    ladder.append(fig);
  }
  items.append(ladder);
  // element effects at Gold and Prismatic, one representative card per element
  items.append(el('h2', 'gallery__h2', 'Element effects (Gold, then Prismatic)'));
  const elementRow = el('div', 'gallery__row');
  const picks: Array<[string, string]> = [
    ['ember_squire', 'Fire'],
    ['storm_duelist', 'Storm'],
    ['shield_warden', 'Light'],
    ['grove_keeper', 'Nature'],
    ['cave_digger', 'Earth'],
    ['gem_cutter', 'Crystal'],
    ['core_titan', 'Void'],
  ];
  for (const tier of ['gold', 'prismatic'] as const)
    for (const [id, label] of picks) {
      const card = content.cardById.get(id)!;
      const view = createCard({
        ...cardProps(content, loadout, id, { tier, stars: 1 }, card.name, 'blade', card.rarity),
        item: itemArt(card.item.kind, card.rarity),
        element: card.element,
      });
      const fig = el('figure', 'gallery__fig');
      fig.append(view.el, el('figcaption', '', `${label}, ${cap(tier)}`));
      elementRow.append(fig);
    }
  items.append(elementRow);
  page.append(items);

  // star 5 -> 6 transition demo
  const demoRank: Rank = { tier: 'gold', stars: 5 };
  const button = el('button', 'gallery__button', 'Raise to star 6') as HTMLButtonElement;
  add('Star 5 to 6 transition', [[EXCLUSIVE_CARD, demoRank, 'Gilded Edge', 'blade']], button);
  const demo = shown[shown.length - 1]!;
  button.addEventListener('click', () => {
    demo.rank = { ...demo.rank, stars: demo.rank.stars === 6 ? 5 : 6 };
    demo.view.update(
      cardProps(content, loadout, demo.id, demo.rank, demo.name, demo.emblem, rarity),
    );
    if (demo.rank.stars === 6) demo.view.levelUp();
    button.textContent = demo.rank.stars === 6 ? 'Back to star 5' : 'Raise to star 6';
  });

  // attack effects of the equipped attack item, one stage per job
  const fxSection = el('section', 'gallery__section');
  fxSection.append(el('h2', 'gallery__h2', 'Attack effects (equipped attack item, one per job)'));
  const fxRow = el('div', 'gallery__row');
  const stages = (['fighting', 'mining', 'logging'] as const).map((job) => {
    const fig = el('figure', 'gallery__fig');
    const stage = el('div', 'prod__stage gallery__stage');
    stage.innerHTML = `<svg class="bi-card__emblem" viewBox="0 0 100 100" aria-hidden="true">${
      job === 'mining'
        ? '<path d="M14 70 26 38 46 26 70 30 86 52 82 76 54 86 28 84Z"/>'
        : job === 'logging'
          ? '<path d="M50 10 76 46H62L82 70H18L38 46H24Z"/><path d="M44 70H56V90H44Z"/>'
          : '<rect x="22" y="20" width="56" height="48" rx="8"/><rect x="34" y="72" width="12" height="18" rx="3"/><rect x="54" y="72" width="12" height="18" rx="3"/>'
    }</svg>`;
    fig.append(stage, el('figcaption', '', cap(job)));
    fxRow.append(fig);
    return { job, stage };
  });
  fxSection.append(fxRow);
  page.append(fxSection);
  window.setInterval(() => {
    const effects = resolveGlobal(content, loadout).attack.visual.effects;
    for (const { job, stage } of stages) {
      if (effects)
        playHit(effects[job], stage, { rng: defaultRng, target: stage.querySelector('svg') });
      showTick(stage, job === 'fighting' ? '12.4K' : '+3', {
        rng: defaultRng,
        crit: defaultRng() < 0.2,
      });
    }
  }, 700);

  function refresh(): void {
    applyGlobalTheme(content, loadout);
    for (const s of shown)
      s.view.update(cardProps(content, loadout, s.id, s.rank, s.name, s.emblem, rarity));
    setsLine.textContent = detectSets(content, loadout)
      .map(
        (s) =>
          `${s.set.replace(/_/g, ' ')}: ${s.equipped}/${s.total}${s.complete ? ', set bonus active' : ''}`,
      )
      .join('  |  ');
  }
  refresh();
}

function cardProps(
  content: Content,
  loadout: CosmeticLoadout,
  id: string,
  rank: Rank,
  name: string,
  emblem: string,
  rarity: Rarity,
) {
  return {
    name,
    label: 'Fighting',
    job: 'fighting',
    emblem,
    item: itemArt(emblem === 'gem' ? 'shield' : 'sword', rarity),
    element: (emblem === 'gem' ? 'light' : 'fire') as CardElement,
    rank,
    rarity,
    face: {
      ability: emblem === 'gem' ? 'Bulwark' : 'Ember Blade',
      speed: COPY.card.hitsEvery('1s'),
      level: { value: 12, cap: 20 },
      progress: 0.6,
    },
    theme: resolveCard(content, loadout, { id, rank, rarity }),
  };
}

function el(tag: string, cls: string, text?: string): HTMLElement {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}
function option(value: string, label: string): HTMLOptionElement {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = label;
  return o;
}
function select(options: Array<[string, string]>): HTMLSelectElement {
  const s = document.createElement('select');
  s.append(...options.map(([v, l]) => option(v, l)));
  return s;
}
const cap = (s: string) => s[0]!.toUpperCase() + s.slice(1);
const fmt = (r: Rank) => `${cap(r.tier)} ${r.stars}`;
