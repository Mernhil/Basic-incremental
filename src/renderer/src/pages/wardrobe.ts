import type { CosmeticSlot } from '../../../data';
import {
  collectModifiers,
  cosmeticLadder,
  defaultRng,
  equipCosmetic,
  resolveCard,
  resolveGlobal,
  unequipCosmetic,
  upgradeCosmetic,
  wardrobeItems,
  type GameState,
  type WardrobeItem,
} from '../../../game';
import { COPY } from '../copy';
import { frame, h } from '../shell/shell';
import { attachTooltip, hide as hideTip, tipTable } from '../shell/tooltip';
import { playUpgradeMoment } from '../stage/tierUp';
import { applyScopedGlobalTheme } from '../theme/apply';
import { playHit, showTick } from '../theme/effects';
import { createCard } from '../ui/card';
import { cosmeticSwatch } from '../ui/cosmeticSwatch';
import { skinStyle } from '../ui/skins';
import { wardrobeSkinCss } from './wardrobeSkin';
import { cardFaceProps } from './loadoutCards';
import type { PageContext } from './production';
import {
  buffBreakdown,
  defaultPreview,
  isCardSlot,
  itemDetail,
  itemTiles,
  previewChoices,
  setViews,
  SLOT_ORDER,
  slotViews,
  tryOnLoadout,
  upgradeMetal,
  upgradeToast,
  type ItemDetail,
  type SlotFilter,
  type SlotView,
} from './wardrobeModel';
import './wardrobe.css';

/**
 * Wardrobe page (DESIGN.md §8; 17 mannequin card, A7 A): a large preview card in the
 * centre wearing the selection, the seven slots around it like an equipment screen, the item
 * grid below filtered by slot, and the selected item's panel (owned buff, wear rank, level
 * ladder, upgrade checklist, equip globally or on the preview card). All rules come from game.
 */

export interface WardrobeContext extends PageContext {
  sound?: (id: string) => void;
  /** Re-applies the global theme after the loadout changed. */
  onLoadoutChange?: () => void;
}

const LEFT: readonly CosmeticSlot[] = ['border', 'finish', 'attack', 'tick'];
const t = COPY.wardrobe;

export function createWardrobePage(page: HTMLElement, ctx: WardrobeContext): { render(): void } {
  const { content } = ctx;
  let filter: SlotFilter = 'all';
  let selected: string | null = null;
  let previewCard: string | null = null;
  let last = '';
  let message = '';

  const wrap = h('div', 'wd');
  const status = h('p', 'wd-status');
  status.setAttribute('role', 'status');
  page.append(wrap, status);
  // the equipped Wardrobe style draws the plates, tiles and ladder (wardrobeSkin.ts)
  const skinSheet = document.createElement('style');
  document.head.append(skinSheet);
  let skin = '';
  function applySkin(): void {
    const style = skinStyle('wardrobe');
    if (style === skin) return;
    skin = style;
    skinSheet.textContent = wardrobeSkinCss(style);
    wrap.dataset['skin'] = style;
  }

  const materials = [
    ...new Set(Object.values(content.cosmeticRules.materials).map((m) => m.resource)),
  ];
  const signature = (s: GameState): string =>
    JSON.stringify([
      s.cosmetics,
      Object.entries(s.cards.owned).map(([id, c]) => [id, c.tier, c.stars]),
      materials.map((r) => s.resources[r]?.toString() ?? '0'),
    ]);

  function build(focusKey?: string): void {
    hideTip();
    applySkin();
    const state = ctx.state();
    last = signature(state);
    const mods = collectModifiers(state, content);
    const items = wardrobeItems(state, content, mods);
    const choices = previewChoices(state, content);
    if (!previewCard || !choices.some((c) => c.id === previewCard)) {
      previewCard = defaultPreview(state, content);
    }
    const resolved = previewCard ? resolvedFor(state, previewCard) : null;
    const slots = slotViews(state, content, previewCard, resolved);
    if (!selected || !items.some((i) => i.cosmetic.id === selected)) {
      selected = slots[0]?.itemId ?? null;
    }
    const item = items.find((i) => i.cosmetic.id === selected) ?? null;

    const main = h('div', 'wd-main');
    main.append(mannequin(state, slots, item), grid(items));
    const side = item
      ? detailPanel(
          itemDetail(item, state, content, cosmeticLadder(content, item.cosmetic), previewCard),
          item,
          mods,
        )
      : h('div');
    wrap.replaceChildren(main, side);
    status.textContent = message;
    if (focusKey)
      wrap.querySelector<HTMLElement>(`[data-key="${focusKey}"]`)?.focus({ preventScroll: true });
  }

  function resolvedFor(state: GameState, cardId: string) {
    const card = content.cardById.get(cardId);
    const owned = state.cards.owned[cardId];
    if (!card || !owned) return null;
    return resolveCard(content, state.cosmetics.loadout, {
      id: cardId,
      rank: { tier: owned.tier, stars: owned.stars },
      rarity: card.rarity,
    });
  }

  // ---- mannequin -------------------------------------------------------------------------------
  function mannequin(state: GameState, slots: SlotView[], item: WardrobeItem | null): HTMLElement {
    const { el, body } = frame(t.mannequin);
    el.classList.add('wd-mannequin');

    // preview card picker
    const choices = previewChoices(state, content);
    const pick = h('label', 'wd-pick');
    pick.append(h('span', '', t.previewOn));
    const select = h('select', 'cp-select');
    select.dataset.key = 'preview';
    for (const c of choices) {
      const o = h('option', '', c.label);
      o.value = c.id;
      o.selected = c.id === previewCard;
      select.append(o);
    }
    select.disabled = choices.length === 0;
    select.addEventListener('change', () => {
      previewCard = select.value;
      // the new card's own border is selected, so it is not shown as a try-on of the old pick
      selected = null;
      message = '';
      build('preview');
    });
    pick.append(select);
    el.querySelector('.frame__title')?.append(pick);

    // the stage: global slots of the try-on loadout apply only here
    const trying =
      item && !isEquippedHere(item) && item.cosmetic.id === selected ? item.cosmetic : null;
    const loadout = tryOnLoadout(state, content, trying?.id ?? null, previewCard);
    const stage = h('div', 'wd-stage');
    applyScopedGlobalTheme(content, loadout, stage);

    const left = h('ul', 'wd-slots wd-slots--left');
    const right = h('ul', 'wd-slots wd-slots--right');
    for (const s of slots) (LEFT.includes(s.slot) ? left : right).append(slotButton(s));

    const centre = h('div', 'wd-centre');
    let art: HTMLElement | null = null;
    const props = previewCard ? cardFaceProps(content, state, previewCard) : null;
    if (props && previewCard) {
      const card = content.cardById.get(previewCard)!;
      const view = createCard({
        ...props,
        theme: resolveCard(content, loadout, {
          id: previewCard,
          rank: props.rank,
          rarity: card.rarity,
        }),
      });
      art = view.art;
      const fit = h('div', 'wd-card');
      fit.append(view.el);
      centre.append(fit);
    } else {
      centre.append(h('p', 'frame__muted wd-nocard', t.noCards));
    }

    const play = h('button', 'button wd-play', t.playAttack);
    play.type = 'button';
    play.dataset.key = 'play';
    play.disabled = !art;
    const playAttack = (): void => {
      if (!art) return;
      const g = resolveGlobal(content, loadout);
      const effect = g.attack.visual.effects?.fighting;
      if (effect) playHit(effect, art, { rng: defaultRng });
      showTick(art, '128', { rng: defaultRng });
    };
    play.addEventListener('click', playAttack);
    centre.append(play);

    if (trying) {
      const note = h('div', 'wd-trying');
      note.append(h('strong', '', t.trying(trying.name)), h('span', '', t.tryingNote));
      const stop = h('button', 'button button--ghost', t.clearTry);
      stop.type = 'button';
      stop.dataset.key = 'stop-try';
      stop.addEventListener('click', () => {
        selected = slots.find((s) => s.slot === trying.slot)?.itemId ?? null;
        build('stop-try');
      });
      note.append(stop);
      centre.append(note);
    }
    stage.append(left, centre, right);

    // set bonuses
    const sets = h('ul', 'wd-sets');
    sets.setAttribute('aria-label', t.sets);
    const mods = collectModifiers(state, content);
    for (const s of setViews(state, content)) {
      const li = h('li');
      const chip = h('button', `wd-set${s.complete ? ' is-complete' : ''}`);
      chip.type = 'button';
      chip.append(h('span', '', s.name), h('b', 'bi-num', s.count));
      chip.setAttribute('aria-label', `${s.name}, ${s.count}`);
      attachTooltip(chip, () => {
        const rows: Array<[string, string]> = s.bonus.map((b) => [t.setOf(s.name), b]);
        const box = tipTable(
          t.setTitle(s.name, s.count),
          rows,
          s.bonus.length === 0
            ? undefined
            : [s.complete ? t.setComplete : t.setIncomplete, s.complete ? '✓' : s.count],
        );
        if (s.bonus.length === 0) box.append(h('p', '', t.setNoBonus));
        if (s.missing.length > 0) box.append(h('p', '', t.setMissing(s.missing.join(', '))));
        // what the bonus adds to, with every cosmetic bonus to that stat
        for (const stat of new Set(content.setById.get(s.id)?.modifiers.map((m) => m.stat) ?? [])) {
          const b = buffBreakdown(content, mods, stat);
          if (b.rows.length) box.append(tipTable(b.title, b.rows, b.total));
        }
        return box;
      });
      li.append(chip);
      sets.append(li);
    }
    if (playOnBuild && art) {
      playOnBuild = false;
      window.setTimeout(playAttack, 120);
    }
    body.append(stage, sets);
    return el;
  }
  let playOnBuild = false;

  function isEquippedHere(item: WardrobeItem): boolean {
    const slot = item.cosmetic.slot;
    if (isCardSlot(slot) && previewCard) {
      // what the preview card has chosen (worn, or blocked by its rank) counts as equipped here
      const r = resolvedFor(ctx.state(), previewCard)?.slots[slot];
      return (r?.blocked ?? r?.cosmetic)?.id === item.cosmetic.id;
    }
    return item.equippedGlobally;
  }

  function slotButton(s: SlotView): HTMLElement {
    const li = h('li');
    const b = h('button', `wd-slot${filter === s.slot ? ' is-on' : ''}`);
    b.type = 'button';
    b.dataset.key = `slot-${s.slot}`;
    b.dataset.rarity = s.rarity;
    b.setAttribute('aria-pressed', String(filter === s.slot));
    b.setAttribute('aria-label', t.slotLabel(s.label, s.name, s.level));
    const sw = cosmeticSwatch(content, s.itemId, s.level);
    sw.style.setProperty('--cs', '38px');
    sw.style.setProperty('--cs-scale', '0.19');
    const text = h('span', 'wd-slot__text');
    text.append(h('span', 'wd-slot__label', s.label), h('span', 'wd-slot__name', s.name));
    if (s.perCard) text.append(h('span', 'wd-slot__tag', t.onThisCard));
    if (s.blocked) text.append(h('span', 'wd-slot__warn', s.blocked));
    b.append(sw, text, h('span', 'wd-slot__lv bi-num', `L${s.level}`));
    b.addEventListener('click', () => {
      filter = s.slot;
      selected = s.itemId;
      message = '';
      build(`slot-${s.slot}`);
    });
    li.append(b);
    return li;
  }

  // ---- item grid -------------------------------------------------------------------------------
  function grid(items: WardrobeItem[]): HTMLElement {
    const owned = items.filter((i) => i.owned).length;
    const { el, body } = frame(t.items, `${owned} / ${items.length}`);
    el.classList.add('wd-items');
    const chips = h('div', 'cp-chips');
    chips.setAttribute('role', 'group');
    chips.setAttribute('aria-label', t.filters);
    const chip = (label: string, value: SlotFilter): void => {
      const b = h('button', 'cp-chip', label);
      b.type = 'button';
      b.dataset.key = `filter-${value}`;
      b.setAttribute('aria-pressed', String(filter === value));
      b.addEventListener('click', () => {
        filter = value;
        build(`filter-${value}`);
      });
      chips.append(b);
    };
    chip(t.all, 'all');
    for (const slot of SLOT_ORDER) chip(t.slots[slot], slot);

    const list = h('ul', 'wd-grid');
    list.setAttribute('aria-label', t.items);
    for (const tile of itemTiles(items, content, filter, previewCard)) {
      const li = h('li');
      const b = h(
        'button',
        `wd-tile${tile.owned ? '' : ' is-locked'}${tile.maxed ? ' is-maxed' : ''}`,
      );
      b.type = 'button';
      b.dataset.key = `tile-${tile.id}`;
      b.dataset.rarity = tile.rarity;
      b.setAttribute('aria-pressed', String(tile.id === selected));
      b.setAttribute('aria-label', tile.aria);
      b.append(cosmeticSwatch(content, tile.id, Math.max(1, tile.level)));
      b.append(h('span', 'wd-tile__name', tile.name));
      b.append(h('span', 'wd-tile__meta bi-num', tile.levelText));
      if (tile.equipped) b.append(h('span', 'wd-tile__on', '✓'));
      if (tile.copies > 0 && !tile.maxed)
        b.append(h('span', 'wd-tile__copies bi-num', `+${tile.copies}`));
      if (tile.upgradable) b.append(h('span', 'wd-tile__up', '▲'));
      b.addEventListener('click', () => {
        selected = tile.id;
        message = '';
        playOnBuild = tile.slot === 'attack' || tile.slot === 'tick' || tile.slot === 'number';
        build(`tile-${tile.id}`);
      });
      li.append(b);
      list.append(li);
    }
    body.append(chips, list);
    return el;
  }

  // ---- selected item ---------------------------------------------------------------------------
  function detailPanel(
    d: ItemDetail,
    item: WardrobeItem,
    mods: ReturnType<typeof collectModifiers>,
  ) {
    const { el, body } = frame(d.tile.name, d.subtitle);
    el.classList.add('wd-detail');
    el.dataset.rarity = d.tile.rarity;

    const top = h('div', 'wd-detail__top');
    const sw = cosmeticSwatch(content, d.tile.id, Math.max(1, d.tile.level));
    sw.style.setProperty('--cs', '110px');
    sw.style.setProperty('--cs-scale', '0.56');
    const facts = h('dl', 'wd-facts');
    const fact = (label: string, value: string | HTMLElement): HTMLElement => {
      const row = h('div');
      const dd = h('dd');
      dd.append(value);
      row.append(h('dt', '', label), dd);
      facts.append(row);
      return dd;
    };
    fact(t.levels, d.tile.levelText);
    if (d.tile.owned && d.tile.copies > 0) fact(t.copiesLabel, String(d.tile.copies));
    fact(t.sourceLabel, d.source);
    top.append(sw, facts);
    body.append(top);

    // owned buff, with the breakdown of all cosmetic bonuses to that stat
    if (d.buffs.length) {
      const buff = h('div', `wd-buff${d.buffActive ? ' is-on' : ''}`);
      buff.tabIndex = 0;
      buff.append(
        h('span', 'wd-buff__label', t.ownedBuff),
        h('b', 'bi-num', d.buffs.join(', ')),
        h('span', 'wd-buff__note', d.buffActive ? t.buffActive : t.buffInactive),
      );
      attachTooltip(buff, () => {
        const box = h('div');
        for (const stat of new Set(item.ownedModifiers.map((m) => m.stat))) {
          const b = buffBreakdown(content, mods, stat);
          box.append(tipTable(b.title, b.rows, b.total));
        }
        return box;
      });
      body.append(buff);
    }
    if (d.wear) {
      body.append(
        h(
          'p',
          `wd-wear${d.wear.met ? ' is-met' : ''}`,
          `${d.wear.text}. ${d.wear.met ? t.wearMet : t.wearUnmet}`,
        ),
      );
    }
    if (d.exclusive) body.append(h('p', 'wd-wear', d.exclusive));

    // level ladder
    const ladder = h('ol', 'wd-ladder');
    ladder.setAttribute('aria-label', t.levels);
    for (const r of d.ladder) {
      const li = h('li', `wd-rung is-${r.state} wd-rung--${r.step}`);
      li.append(h('span', 'wd-rung__lv bi-num', String(r.level)), h('span', '', r.name));
      li.setAttribute('aria-label', `${r.level}: ${r.name}${r.state === 'done' ? ', ✓' : ''}`);
      ladder.append(li);
    }
    body.append(h('h3', 'wd-h', t.levels), ladder);

    // upgrade checklist
    if (d.upgrade) {
      const box = h('section', 'cp-upgrade wd-upgrade');
      box.append(h('h3', 'cp-upgrade__title', d.upgrade.title));
      const list = h('ul', 'cp-reqs');
      for (const r of d.upgrade.requirements) {
        const li = h('li', `cp-req${r.met ? ' cp-req--met' : ''}`);
        const mark = h('span', 'cp-req__mark', r.met ? '✓' : '✗');
        mark.setAttribute('aria-label', r.met ? COPY.cards.met : COPY.cards.missing);
        li.append(mark, h('span', '', r.label), h('span', 'bi-num', r.value));
        list.append(li);
      }
      const b = h('button', 'button cp-upgrade__btn', d.upgrade.action);
      b.type = 'button';
      b.dataset.key = 'upgrade';
      b.disabled = !d.upgrade.ready;
      b.addEventListener('click', () => upgrade(d.tile.id));
      box.append(list, h('p', 'cp-upgrade__note', d.upgrade.note), b);
      body.append(box);
    } else if (d.maxedNote) {
      body.append(h('p', 'wd-maxed', d.maxedNote));
    }

    // equip
    const actions = h('div', 'cp-actions');
    const btn = (label: string, key: string, run: () => void, disabled = false): void => {
      const b = h('button', 'button button--ghost', label);
      b.type = 'button';
      b.dataset.key = key;
      b.disabled = disabled;
      b.addEventListener('click', run);
      actions.append(b);
    };
    const slot = item.cosmetic.slot;
    const cardName = previewCard ? (content.cardById.get(previewCard)?.name ?? '') : '';
    if (d.equip.global === 'equip') {
      btn(isCardSlot(slot) ? t.equipAll : t.equip, 'equip', () =>
        equipResult(equipCosmetic(ctx.state(), content, item.cosmetic.id), 'equip'),
      );
    } else if (d.equip.global === 'equipped' && !item.cosmetic.starter) {
      btn(t.unequip, 'unequip', () =>
        changed(unequipCosmetic(ctx.state(), content, slot), 'unequip'),
      );
    } else if (d.equip.global === 'starter') {
      btn(t.starterBack, 'equip', () =>
        changed(unequipCosmetic(ctx.state(), content, slot), 'equip'),
      );
    } else if (d.equip.global === 'equipped') {
      btn(t.isEquipped, 'equip', () => undefined, true);
    }
    if (d.equip.card === 'equip' && previewCard) {
      const card = previewCard;
      btn(t.equipCard(cardName), 'equip-card', () =>
        equipResult(equipCosmetic(ctx.state(), content, item.cosmetic.id, card), 'equip-card'),
      );
    } else if (d.equip.card === 'equipped' && previewCard) {
      const card = previewCard;
      btn(t.unequipCard(cardName), 'equip-card', () =>
        changed(unequipCosmetic(ctx.state(), content, slot, card), 'equip-card'),
      );
    }
    if (actions.childElementCount) body.append(actions);
    if (d.equip.note) body.append(h('p', 'frame__muted', d.equip.note));
    return el;
  }

  // ---- actions ---------------------------------------------------------------------------------
  function changed(next: GameState, key: string): void {
    message = '';
    ctx.apply(next);
    ctx.onLoadoutChange?.();
    build(key);
  }

  function equipResult(r: ReturnType<typeof equipCosmetic>, key: string): void {
    if (r.ok) changed(r.state, key);
    else {
      message = r.message ?? t.notOwnedNote;
      status.textContent = message;
    }
  }

  function upgrade(id: string): void {
    const r = upgradeCosmetic(ctx.state(), content, id);
    if (!r.ok) return;
    const name = content.cosmeticById.get(id)?.name ?? id;
    changed(r.state, 'upgrade');
    const { title, detail } = upgradeToast(name, r.level, r.step, r.maxed);
    playUpgradeMoment(
      { title, detail, metal: upgradeMetal(r.step, r.maxed), big: r.maxed },
      ctx.sound,
    );
  }

  return {
    render() {
      const state = ctx.state();
      if (signature(state) !== last || wrap.childElementCount === 0) {
        const active = (document.activeElement as HTMLElement | null)?.dataset?.key;
        build(wrap.contains(document.activeElement) ? active : undefined);
      }
    },
  };
}
