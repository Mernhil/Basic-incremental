import { setCardSkin } from '../../../game';
import { COPY } from '../copy';
import { ITEM_VIEWBOX } from '../art/items';
import { frame, h } from '../shell/shell';
import { createCard } from '../ui/card';
import { fitCard } from '../ui/pixelFit';
import { cardSkinsSignature, skinCards, skinPickerView, type SkinTileView } from './cardSkinsModel';
import { loadoutProps, skinTileMarkup } from './loadoutCards';
import type { PageContext } from './production';
import './weaponSkinsTab.css';

const t = COPY.weaponSkins;
const S = COPY.cardSkins;

/**
 * The Wardrobe "Weapon skins" tab (DESIGN.md §8 Card skins): the weapon types you have cards for,
 * your cards of that type, then the skins that card can wear (Original, the card skins and legacy
 * skins you own, and the locked card skins greyed), with a large preview and Apply. Previewing never
 * changes the save; Apply goes through `ctx.apply` (which saves).
 */
export function createWeaponSkinsTab(
  root: HTMLElement,
  ctx: PageContext,
  /** The page's tab bar; it sits at the top of the picker panel while this tab shows. */
  tabs?: HTMLElement,
): { render(): void; reveal(): void } {
  const { content } = ctx;
  /** What the player has picked so far (view state only); `skin` undefined = the worn one. */
  const selection: { kind?: string; card?: string; skin?: string | null } = {};
  let last = '';
  let message = '';
  const status = h('p', 'ws-status');
  status.setAttribute('role', 'status');

  function thumb(art: string): HTMLElement {
    const box = h('span', 'ws-thumb');
    box.innerHTML = `<svg viewBox="${ITEM_VIEWBOX}" aria-hidden="true" focusable="false">${art}</svg>`;
    return box;
  }

  function build(focusKey?: string): void {
    const state = ctx.state();
    last = cardSkinsSignature(state);
    const cards = skinCards(state, content);
    const { el: pickEl, body: pickBody } = frame(t.title, t.note);
    pickEl.classList.add('ws-picker');
    if (tabs) pickEl.prepend(tabs);
    if (cards.length === 0) {
      pickBody.append(h('p', 'frame__muted', t.none));
      root.replaceChildren(pickEl);
      return;
    }

    // 1. the weapon type, 2. the card
    const kinds = [...new Map(cards.map((c) => [c.kind, c.weapon])).entries()];
    const kind = kinds.find(([k]) => k === selection.kind)?.[0] ?? kinds[0]![0];
    if (kinds.length > 1) {
      const chips = h('div', 'cp-chips');
      chips.setAttribute('role', 'group');
      chips.setAttribute('aria-label', t.weaponLabel);
      for (const [k, noun] of kinds) {
        const b = h('button', 'cp-chip', noun);
        b.type = 'button';
        b.dataset.key = `weapon-${k}`;
        b.setAttribute('aria-pressed', String(k === kind));
        b.addEventListener('click', () => {
          selection.kind = k;
          delete selection.card;
          delete selection.skin;
          message = '';
          build(`weapon-${k}`);
        });
        chips.append(b);
      }
      pickBody.append(chips);
    }
    const ofKind = cards.filter((c) => c.kind === kind);
    const cardId = ofKind.find((c) => c.id === selection.card)?.id ?? ofKind[0]!.id;
    const list = h('ul', 'ws-cardlist');
    list.setAttribute('aria-label', t.cardsGroup);
    for (const c of ofKind) {
      const li = h('li');
      const b = h('button', 'ws-cardbtn');
      b.type = 'button';
      b.dataset.key = `card-${c.id}`;
      b.setAttribute('aria-pressed', String(c.id === cardId));
      b.setAttribute('aria-label', t.cardLabel(c.name, c.wornName));
      b.append(h('span', 'ws-cardbtn__name', c.name), h('span', 'ws-cardbtn__worn', c.wornName));
      b.addEventListener('click', () => {
        selection.kind = kind;
        selection.card = c.id;
        delete selection.skin;
        message = '';
        build(`card-${c.id}`);
      });
      li.append(b);
      list.append(li);
    }
    pickBody.append(list);

    // 3. the skin of that card
    const view = skinPickerView(state, content, cardId)!;
    const wornTile = view.tiles.find((x) => x.worn) ?? view.tiles[0]!;
    const picked: SkinTileView =
      selection.skin === undefined
        ? wornTile
        : (view.tiles.find((x) => !x.locked && x.id === selection.skin) ?? wornTile);
    const grid = h('ul', 'ws-grid');
    grid.setAttribute('aria-label', t.skinsGroup);
    for (const tile of view.tiles) {
      const li = h('li');
      const key = `skin-${tile.id ?? 'original'}`;
      const b = h(
        'button',
        `ws-tile${tile.worn ? ' is-worn' : ''}${tile.locked ? ' is-locked' : ''}`,
      );
      b.type = 'button';
      b.dataset.key = key;
      b.setAttribute('aria-pressed', String(tile === picked));
      b.setAttribute('aria-label', S.tileLabel(tile.name, tile.worn, tile.lockedNote));
      if (tile.locked) b.setAttribute('aria-disabled', 'true');
      b.append(
        thumb(skinTileMarkup(content, cardId, state.cards.owned[cardId], tile.pic)),
        h('span', 'ws-tile__name', tile.name),
      );
      if (tile.lockedNote) b.append(h('span', 'ws-tile__lock', tile.lockedNote));
      if (tile.worn) b.append(h('span', 'ws-tile__on', '✓'));
      b.addEventListener('click', () => {
        if (tile.locked) return;
        selection.kind = kind;
        selection.card = cardId;
        selection.skin = tile.id;
        message = '';
        build(key);
      });
      li.append(b);
      grid.append(li);
    }
    pickBody.append(grid);

    // preview side: the card as it is now, with the picked skin's picture
    const { el: viewEl, body: viewBody } = frame(t.previewTitle, picked.name);
    viewEl.classList.add('ws-preview');
    const host = h('div', 'ws-stage');
    fitCard(host, { want: 218 });
    const props = loadoutProps(content, state, cardId, 'main', []);
    if (props) {
      const fit = h('div', 'ws-card');
      fit.append(
        createCard({
          ...props,
          item: skinTileMarkup(content, cardId, state.cards.owned[cardId], picked.pic),
        }).el,
      );
      host.append(fit);
    }
    viewBody.append(host);
    viewBody.append(h('p', 'frame__muted ws-note', t.previewCard(view.cardName)));
    viewBody.append(h('p', 'frame__muted ws-note', t.previewOnly));

    const apply = h('button', 'button ws-apply', picked.worn ? t.equipped : t.apply(picked.name));
    apply.type = 'button';
    apply.dataset.key = 'apply';
    apply.disabled = picked.worn;
    apply.addEventListener('click', () => {
      const r = setCardSkin(ctx.state(), content, cardId, picked.id);
      if (r.ok) {
        message = t.applied(picked.name);
        delete selection.skin;
        ctx.apply(r.state);
        build('apply');
      } else {
        message = S.failed;
        status.textContent = message;
      }
    });
    viewBody.append(apply);
    status.textContent = message;
    root.replaceChildren(pickEl, viewEl, status);
    if (focusKey)
      root.querySelector<HTMLElement>(`[data-key="${focusKey}"]`)?.focus({ preventScroll: true });
  }

  return {
    render() {
      if (cardSkinsSignature(ctx.state()) !== last || root.childElementCount === 0) {
        const active = (document.activeElement as HTMLElement | null)?.dataset?.key;
        build(root.contains(document.activeElement) ? active : undefined);
      }
    },
    reveal() {
      build();
    },
  };
}
