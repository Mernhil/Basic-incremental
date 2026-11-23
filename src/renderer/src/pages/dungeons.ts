import { cardDisplayName, loadoutCards, type GameState, type TierUp } from '../../../game';
import { COPY } from '../copy';
import { h } from '../shell/shell';
import { createTrainingPanel } from '../ui/training';
import { createSealBlock, type SealBlock } from '../ui/sealBlock';
import { createWeaponPanel, type WeaponPanel } from '../ui/weaponPanel';
import { cardItemArt } from './loadoutCards';
import { ITEM_VIEWBOX } from '../art/items';
import type { CardsModel } from './cardsModel';
import { createDungeonMap } from './dungeonMap';
import type { PageContext } from './production';
import './dungeons.css';

/**
 * The panels of the dungeon window (UI_RULES.md §2 The dungeon full view): Dungeons (the winding
 * map, `dungeonMap.ts`), Weapon (the weapon panel of any of the four
 * loadout cards, switched by tabs, DESIGN.md §5 Weapon panel) and Training (a waiting milestone
 * pick, then the training lines, DESIGN.md §6).
 */

export interface DungeonPanelsContext extends PageContext {
  cards: CardsModel;
  sound?: (id: string) => void;
  onTierUps?: (list: TierUp[]) => void;
}

export interface DungeonPanels {
  dungeons: HTMLElement;
  weapon: HTMLElement;
  training: HTMLElement;
  /** Keeps the panels current (call while the view is open). */
  render(): void;
}

/** The card the Weapon panel last showed, kept for the session (DESIGN.md §5 Weapon panel). */
let lastWeaponCard: string | null = null;

export function createDungeonPanels(ctx: DungeonPanelsContext): DungeonPanels {
  const { content } = ctx;

  // ---- Dungeons: the winding map ----
  const map = createDungeonMap(ctx);
  const dungeons = map.el;

  // ---- Weapon: any of the four loadout cards, switched by the tabs on top (DESIGN.md §5) ----
  const weapon = h('div', 'dp-weapon');
  const weaponTabs = h('div', 'dp-wtabs');
  weaponTabs.setAttribute('role', 'tablist');
  weaponTabs.setAttribute('aria-label', COPY.weapon.tabsLabel);
  const weaponBody = h('div', 'dp-weapon__body');
  weapon.append(weaponTabs, weaponBody);
  let weaponId: string | null | undefined;
  let weaponPanel: WeaponPanel | null = null;
  let sealBlock: SealBlock | null = null;
  /** The tabs as built: the loadout's cards in order; they rebuild only when it changes. */
  let tabsKey: string | null = null;
  let tabLevels: Array<{ id: string; level: HTMLElement; tab: HTMLButtonElement }> = [];
  const weaponNote = h('p', 'dp-note');
  weaponNote.setAttribute('role', 'status');

  /** The card the panel shows: the last one chosen this session while it is still in the
   *  loadout, else the first card. */
  function weaponChoice(s: GameState): string | null {
    const ids = loadoutCards(s.cards.loadouts.fighting).filter((id) => s.cards.owned[id]);
    return lastWeaponCard !== null && ids.includes(lastWeaponCard)
      ? lastWeaponCard
      : (ids[0] ?? null);
  }

  function buildTabs(s: GameState): void {
    const ids = loadoutCards(s.cards.loadouts.fighting).filter((id) => s.cards.owned[id]);
    tabsKey = ids.join(',');
    tabLevels = [];
    weaponTabs.replaceChildren();
    const slots = s.cards.loadouts.fighting.slots;
    for (const id of ids) {
      const card = content.cardById.get(id);
      if (!card) continue;
      const tab = h('button', 'dp-wtab px-tile') as HTMLButtonElement;
      tab.type = 'button';
      tab.setAttribute('role', 'tab');
      tab.dataset.key = `wtab-${id}`;
      tab.title = COPY.weapon.tabTitle(cardDisplayName(content, card), slots.indexOf(id) + 1);
      const art = h('span', 'dp-wtab__art');
      art.innerHTML = `<svg viewBox="${ITEM_VIEWBOX}" aria-hidden="true" focusable="false">${cardItemArt(content, id, s.cards.owned[id], s)}</svg>`;
      const name = h('span', 'dp-wtab__name', cardDisplayName(content, card));
      const level = h('span', 'dp-wtab__level bi-num');
      tab.append(art, name, level);
      tab.addEventListener('click', () => {
        lastWeaponCard = id;
        render();
      });
      tabLevels.push({ id, level, tab });
      weaponTabs.append(tab);
    }
  }

  function buildWeapon(mainId: string | null): void {
    weaponId = mainId;
    weaponPanel = null;
    sealBlock = null;
    weaponNote.textContent = '';
    if (!mainId) {
      weaponBody.replaceChildren(h('p', 'dp-note', COPY.weapon.noMain));
      return;
    }
    weaponPanel = createWeaponPanel({
      variant: 'drawer',
      content,
      state: ctx.state,
      act(kind) {
        const result = ctx.cards.upgrade(ctx.state(), mainId, kind);
        if (!result.ok) {
          weaponNote.textContent = result.reason;
          return;
        }
        weaponNote.textContent = '';
        ctx.apply(result.state);
        if (result.tierUps?.length) ctx.onTierUps?.(result.tierUps);
        render();
      },
    });
    sealBlock = createSealBlock({
      content,
      state: ctx.state,
      apply: (next) => {
        ctx.apply(next);
        render();
      },
    });
    weaponBody.replaceChildren(weaponPanel.el, sealBlock.el, weaponNote);
  }

  // ---- Training: a waiting pick, then the repeatable lines (DESIGN.md §4 Milestone picks) ----
  const training = h('div', 'dp-training');
  const trainingPanel = createTrainingPanel({
    content,
    state: ctx.state,
    apply: ctx.apply,
    sound: ctx.sound,
  });
  training.append(trainingPanel.el);

  function render(): void {
    const s = ctx.state();
    map.render();
    const chosen = weaponChoice(s);
    const key = loadoutCards(s.cards.loadouts.fighting)
      .filter((id) => s.cards.owned[id])
      .join(',');
    if (key !== tabsKey) buildTabs(s);
    if (chosen !== weaponId) buildWeapon(chosen);
    for (const t of tabLevels) {
      const selected = t.id === chosen;
      t.tab.setAttribute('aria-selected', String(selected));
      t.tab.tabIndex = selected ? 0 : -1;
      t.tab.classList.toggle('is-selected', selected);
      const text = COPY.weapon.tabLevel(s.cards.owned[t.id]?.level ?? 1);
      if (t.level.textContent !== text) t.level.textContent = text;
    }
    const entry = weaponId ? ctx.cards.entry(s, weaponId) : null;
    if (entry) weaponPanel?.update(entry);
    if (weaponId) sealBlock?.update(weaponId);
    trainingPanel.update();
  }

  return {
    dungeons,
    weapon,
    training,
    render,
  };
}
