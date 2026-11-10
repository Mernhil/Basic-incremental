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
  slotViews,
  tryOnLoadout,
  upgradeMetal,
  upgradeToast,
  type ItemDetail,
  type SlotView,
} from './wardrobeModel';
import { fitCard } from '../ui/pixelFit';
import { createWeaponSkinsTab } from './weaponSkinsTab';
import './wardrobe.css';

/**
 * Wardrobe page (DESIGN.md §8; UI_RULES.md §2, "Shell look" and the Wardrobe screen pick): the
 * Mannequin panel holds the preview card at 2x wearing the selection, the slots on its two sides
 * as plates (four on the left, three on the right, the four interface styles under them), and the
 * selected slot's items as a row of tiles below; the selected item's panel sits beside it (owned
 * buff, set count, upgrade ladder and cost, Upgrade and Equip). All rules come from game.
 */

export interface WardrobeContext extends PageContext {
  sound?: (id: string) => void;
  /** Re-applies the global theme after the loadout changed. */
  onLoadoutChange?: () => void;
}

/** The slots drawn as plates around the card, left and right; the rest are interface styles. */
const LEFT: readonly CosmeticSlot[] = ['border', 'finish', 'attack', 'tick'];
const RIGHT: readonly CosmeticSlot[] = ['number', 'table', 'cursor'];
const t = COPY.wardrobe;

export function createWardrobePage(page: HTMLElement, ctx: WardrobeContext): { render(): void } {
  const { content } = ctx;
  let slot: CosmeticSlot = 'border';
  let selected: string | null = null;
  let previewCard: string | null = null;
  let last = '';
  let message = '';

  page.querySelector<HTMLElement>('.shell-page__title')?.classList.add('sr-only');
  const wrap = h('div', 'wd');
  const status = h('p', 'wd-status');
  status.setAttribute('role', 'status');
  // tabs: the cosmetics (everything below) and the weapon skins test; the bar moves into the top
  // row of whichever panel is showing
  const tabs = h('div', 'cp-tabs wd-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', COPY.weaponSkins.tabsLabel);
  const skinsRoot = h('div', 'ws');
  skinsRoot.setAttribute('role', 'tabpanel');
  skinsRoot.id = 'wd-panel-skins';
  wrap.setAttribute('role', 'tabpanel');
  wrap.id = 'wd-panel-cosmetics';
  const skinsTab = createWeaponSkinsTab(skinsRoot, ctx, tabs);
  type Tab = 'cosmetics' | 'skins';
  let tab: Tab = 'cosmetics';
  const tabButtons = new Map<Tab, HTMLElement>();
  function showTab(next: Tab): void {
    tab = next;
    for (const [k, b] of tabButtons) {
      b.setAttribute('aria-selected', String(k === tab));
      b.tabIndex = k === tab ? 0 : -1;
    }
    wrap.hidden = tab !== 'cosmetics';
    skinsRoot.hidden = tab !== 'skins';
    if (tab === 'skins') skinsTab.reveal();
    else build();
    tabButtons.get(tab)?.focus({ preventScroll: true });
  }
  const tabIds: Tab[] = ['cosmetics', 'skins'];
  for (const [i, id] of tabIds.entries()) {
    const b = h('button', 'cp-tab', id === 'cosmetics' ? t.mannequin : COPY.weaponSkins.tabSkins);
    b.type = 'button';
    b.dataset.key = `tab-${id}`;
    b.id = `wd-tab-${id}`;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', `wd-panel-${id}`);
    b.addEventListener('click', () => showTab(id));
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      e.preventDefault();
      showTab(tabIds[(i + 1) % tabIds.length]!);
    });
    tabButtons.set(id, b);
    tabs.append(b);
  }
  skinsRoot.hidden = true;
  page.append(wrap, status, skinsRoot);
  tabButtons.get('cosmetics')?.setAttribute('aria-selected', 'true');
  tabButtons.get('skins')?.setAttribute('aria-selected', 'false');
  tabButtons.get('skins')!.tabIndex = -1;
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
    const inSlot = (id: string | null): boolean =>
      id !== null && items.some((i) => i.cosmetic.id === id && i.cosmetic.slot === slot);
    if (!inSlot(selected)) selected = slots.find((s) => s.slot === slot)?.itemId ?? null;
    const item = items.find((i) => i.cosmetic.id === selected) ?? null;

    // the stage and the item row share one panel
    const main = mannequin(state, slots, item);
    main.querySelector('.frame__body')?.append(grid(items));
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
    // the tab bar and the preview picker take the title row
    const title = el.querySelector<HTMLElement>('.frame__title')!;
    el.removeAttribute('aria-labelledby');
    el.setAttribute('aria-label', t.mannequin);

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
      // the new card's own item of this slot is selected, so it is not shown as a try-on
      selected = null;
      message = '';
      build('preview');
    });
    pick.append(select);
    title.replaceChildren(tabs, pick);

    // the stage: global slots of the try-on loadout apply only here
    const trying =
      item && !isEquippedHere(item) && item.cosmetic.id === selected ? item.cosmetic : null;
    const loadout = tryOnLoadout(state, content, trying?.id ?? null, previewCard);
    const stage = h('div', 'wd-stage');
    applyScopedGlobalTheme(content, loadout, stage);

    const left = h('ul', 'wd-slots wd-slots--left');
    const right = h('ul', 'wd-slots wd-slots--right');
    const ui = h('ul', 'wd-slots wd-slots--ui');
    ui.setAttribute('aria-label', t.interfaceStyle);
    for (const s of slots) {
      if (LEFT.includes(s.slot)) left.append(slotButton(s));
      else if (RIGHT.includes(s.slot)) right.append(slotButton(s));
      else ui.append(slotButton(s, true));
    }

    const centre = h('div', 'wd-centre');
    fitCard(centre, {
      want: 264,
      max: () => (stage.clientWidth > 0 ? Math.max(132, stage.clientWidth - 2 * 196 - 64) : 1e6),
    });
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

    const play = h('button', 'button button--ghost wd-play', t.playAttack);
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

    const leftCol = h('div', 'wd-col wd-col--left');
    leftCol.append(left);
    const rightCol = h('div', 'wd-col wd-col--right');
    rightCol.append(right);
    if (ui.childElementCount) rightCol.append(h('p', 'wd-col__head', t.interfaceStyle), ui);
    const tools = h('div', 'wd-tools');
    tools.append(play);
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
      tools.append(note);
    }
    leftCol.append(tools);
    stage.append(leftCol, centre, rightCol);
    if (playOnBuild && art) {
      playOnBuild = false;
      window.setTimeout(playAttack, 120);
    }
    body.append(stage);
    return el;
  }
  let playOnBuild = false;

  function setChips(state: GameState): HTMLElement {
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
    return sets;
  }

  function isEquippedHere(item: WardrobeItem): boolean {
    const s = item.cosmetic.slot;
    if (isCardSlot(s) && previewCard) {
      // what the preview card has chosen (worn, or blocked by its rank) counts as equipped here
      const r = resolvedFor(ctx.state(), previewCard)?.slots[s];
      return (r?.blocked ?? r?.cosmetic)?.id === item.cosmetic.id;
    }
    return item.equippedGlobally;
  }

  function slotButton(s: SlotView, compact = false): HTMLElement {
    const li = h('li');
    const on = slot === s.slot;
    const b = h('button', `wd-slot${on ? ' is-on' : ''}${compact ? ' wd-slot--mini' : ''}`);
    b.type = 'button';
    b.dataset.key = `slot-${s.slot}`;
    b.dataset.rarity = s.rarity;
    b.setAttribute('aria-pressed', String(on));
    b.setAttribute('aria-label', t.slotLabel(s.label, s.name, s.level));
    const sw = cosmeticSwatch(content, s.itemId, s.level);
    sw.style.setProperty('--cs', '38px');
    sw.style.setProperty('--cs-scale', '0.19');
    if (compact) {
      sw.style.setProperty('--cs', '28px');
      sw.style.setProperty('--cs-scale', '0.14');
      // an interface style is a swatch on a small plate; its name is in the label and the tip
      b.title = `${s.label}: ${s.name}`;
      b.append(sw);
      b.addEventListener('click', () => {
        slot = s.slot;
        selected = s.itemId;
        message = '';
        build(`slot-${s.slot}`);
      });
      li.append(b);
      return li;
    }
    const text = h('span', 'wd-slot__text');
    text.append(h('span', 'wd-slot__label', s.label), h('span', 'wd-slot__name', s.name));
    if (s.perCard) text.append(h('span', 'wd-slot__tag', t.onThisCard));
    if (s.blocked) {
      text.append(h('span', 'wd-slot__warn', s.blocked));
      b.title = s.blocked;
    }
    b.append(sw, text, h('span', 'wd-slot__lv bi-num', `L${s.level}`));
    b.addEventListener('click', () => {
      slot = s.slot;
      selected = s.itemId;
      message = '';
      build(`slot-${s.slot}`);
    });
    li.append(b);
    return li;
  }

  // ---- item row --------------------------------------------------------------------------------
  function grid(items: WardrobeItem[]): HTMLElement {
    const inSlot = items.filter((i) => i.cosmetic.slot === slot);
    const owned = inSlot.filter((i) => i.owned).length;
    const el = h('section', 'wd-items');
    const head = h('div', 'wd-items__head');
    const heading = h('h3', 'px-display wd-items__title', t.slotItems[slot]);
    heading.id = 'wd-items-title';
    head.append(heading, h('span', 'wd-items__count', t.ownedOf(owned, inSlot.length)));

    const list = h('ul', 'wd-grid');
    list.setAttribute('aria-labelledby', heading.id);
    for (const tile of itemTiles(items, content, slot, previewCard)) {
      const li = h('li');
      const b = h(
        'button',
        `wd-tile${tile.owned ? '' : ' is-locked'}${tile.maxed ? ' is-maxed' : ''}${
          tile.id === selected ? ' is-on' : ''
        }`,
      );
      b.type = 'button';
      b.dataset.key = `tile-${tile.id}`;
      b.dataset.rarity = tile.rarity;
      b.setAttribute('aria-pressed', String(tile.id === selected));
      b.setAttribute('aria-label', tile.aria);
      const sw = cosmeticSwatch(content, tile.id, Math.max(1, tile.level));
      sw.style.setProperty('--cs', '56px');
      sw.style.setProperty('--cs-scale', '0.26');
      b.append(sw);
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
    el.append(head, list);
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

    // the large preview, at a whole pixel scale for the card slots (--card-k from fitCard)
    const view = h('div', 'wd-view');
    view.setAttribute('role', 'img');
    view.setAttribute('aria-label', t.previewOfItem(d.tile.name));
    fitCard(view, { want: 132 });
    const sw = cosmeticSwatch(content, d.tile.id, Math.max(1, d.tile.level));
    if (isCardSlot(item.cosmetic.slot) && ['border', 'finish'].includes(item.cosmetic.slot)) {
      sw.classList.add('wd-view__card');
    } else {
      sw.style.setProperty('--cs', '150px');
    }
    view.append(sw);
    body.append(view);

    // upgrade ladder: rungs done / next / off, the next step named
    const ladderRow = h('div', 'wd-ladderrow');
    const ladder = h('ol', 'wd-ladder');
    ladder.setAttribute('aria-label', t.levels);
    ladder.style.setProperty('--n', String(d.ladder.length));
    for (const r of d.ladder) {
      const li = h('li', `wd-rung is-${r.state} wd-rung--${r.step}`);
      li.append(h('span', 'wd-rung__lv bi-num', String(r.level)), h('span', 'sr-only', r.name));
      li.title = r.name;
      li.setAttribute('aria-label', `${r.level}: ${r.name}${r.state === 'done' ? ', ✓' : ''}`);
      ladder.append(li);
    }
    ladderRow.append(ladder);
    if (d.nextStep) ladderRow.append(h('span', 'wd-ladderrow__next', t.nextStepLine(d.nextStep)));
    body.append(ladderRow);

    // lines: owned buff (with the breakdown of all cosmetic bonuses), set, copies, source, cost
    const lines = h('dl', 'wd-lines');
    const line = (label: string, value: string | HTMLElement, cls = ''): HTMLElement => {
      const row = h('div', `wd-line ${cls}`.trim());
      const dd = h('dd');
      dd.append(value);
      row.append(h('dt', '', label), dd);
      lines.append(row);
      return row;
    };
    if (d.buffs.length) {
      const row = line(
        t.ownedBuff,
        h('b', 'bi-num', d.buffs.join(', ')),
        `wd-line--buff${d.buffActive ? ' is-on' : ''}`,
      );
      row.tabIndex = 0;
      row.title = d.buffActive ? t.buffActive : t.buffInactive;
      attachTooltip(row, () => {
        const box = h('div');
        for (const stat of new Set(item.ownedModifiers.map((m) => m.stat))) {
          const b = buffBreakdown(content, mods, stat);
          box.append(tipTable(b.title, b.rows, b.total));
        }
        return box;
      });
    }
    if (d.set) line(t.setOf(d.set.name), t.wornOf(d.set.count), 'wd-line--set');
    if (d.tile.owned && d.tile.copies > 0) line(t.copiesLabel, String(d.tile.copies));
    line(t.sourceLabel, d.source);
    if (d.upgrade) {
      const row = line(t.nextLevelLine, d.upgrade.price, 'wd-line--cost');
      if (d.upgrade.missing.length) {
        row.classList.add('is-short');
        row.append(h('p', 'wd-line__missing', t.missingPrice(d.upgrade.missing.join(', '))));
      }
    }
    body.append(lines);
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
    if (!d.upgrade && d.maxedNote) body.append(h('p', 'wd-maxed', d.maxedNote));

    // actions: Upgrade, then Equip
    const actions = h('div', 'wd-actions');
    const up = h('button', 'button wd-upgrade', t.upgrade);
    up.type = 'button';
    up.dataset.key = 'upgrade';
    up.disabled = !d.upgrade?.ready;
    up.addEventListener('click', () => upgrade(d.tile.id));
    actions.append(up);
    const btn = (
      label: string,
      key: string,
      run: () => void,
      opts: { disabled?: boolean; quiet?: boolean } = {},
    ): HTMLElement => {
      const b = h('button', `button${opts.quiet ? ' button--ghost' : ''}`, label);
      b.type = 'button';
      b.dataset.key = key;
      b.disabled = opts.disabled ?? false;
      b.addEventListener('click', run);
      actions.append(b);
      return b;
    };
    const slotId = item.cosmetic.slot;
    const cardName = previewCard ? (content.cardById.get(previewCard)?.name ?? '') : '';
    if (d.equip.global === 'equip') {
      btn(isCardSlot(slotId) ? t.equipAll : t.equip, 'equip', () =>
        equipResult(equipCosmetic(ctx.state(), content, item.cosmetic.id), 'equip'),
      );
    } else if (d.equip.global === 'equipped' && !item.cosmetic.starter) {
      btn(t.unequip, 'unequip', () =>
        changed(unequipCosmetic(ctx.state(), content, slotId), 'unequip'),
      );
    } else if (d.equip.global === 'starter') {
      btn(t.starterBack, 'equip', () =>
        changed(unequipCosmetic(ctx.state(), content, slotId), 'equip'),
      );
    } else if (d.equip.global === 'equipped') {
      btn(t.isEquipped, 'equip', () => undefined, { disabled: true });
    } else {
      btn(t.equip, 'equip', () => undefined, { disabled: true });
    }
    if (d.equip.card === 'equip' && previewCard) {
      const card = previewCard;
      const b = btn(
        t.equipCard(cardName),
        'equip-card',
        () =>
          equipResult(equipCosmetic(ctx.state(), content, item.cosmetic.id, card), 'equip-card'),
        { quiet: true },
      );
      b.classList.add('wd-actions__wide');
    } else if (d.equip.card === 'equipped' && previewCard) {
      const card = previewCard;
      const b = btn(
        t.unequipCard(cardName),
        'equip-card',
        () => changed(unequipCosmetic(ctx.state(), content, slotId, card), 'equip-card'),
        { quiet: true },
      );
      b.classList.add('wd-actions__wide');
    }
    body.append(actions);
    if (d.equip.note) body.append(h('p', 'frame__muted', d.equip.note));
    body.append(h('h3', 'wd-h', t.sets), setChips(ctx.state()));
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
      if (tab === 'skins') {
        skinsTab.render();
        return;
      }
      const state = ctx.state();
      if (signature(state) !== last || wrap.childElementCount === 0) {
        const active = (document.activeElement as HTMLElement | null)?.dataset?.key;
        build(wrap.contains(document.activeElement) ? active : undefined);
      }
    },
  };
}
