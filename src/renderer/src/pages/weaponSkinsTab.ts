import { equipWeaponSkin, resolveCard, type GameState } from '../../../game';
import { COPY } from '../copy';
import { ITEM_VIEWBOX } from '../art/items';
import { frame, h } from '../shell/shell';
import { createCard, type CardProps } from '../ui/card';
import { fitCard } from '../ui/pixelFit';
import { weaponArtMarkup } from './loadoutCards';
import type { PageContext } from './production';
import {
  weaponSkinsSignature,
  weaponSkinsView,
  type SkinSelection,
  type WeaponSkinsView,
} from './weaponSkinsModel';
import './weaponSkinsTab.css';

const t = COPY.weaponSkins;

/**
 * The Wardrobe "Weapon skins" tab (a test): a weapon picker, a grid of its skins plus the
 * Original, a large preview on the weapon's card at the Unique tier, and Apply. Previewing never
 * changes the save; Apply goes through `ctx.apply` (which saves).
 */
export function createWeaponSkinsTab(
  root: HTMLElement,
  ctx: PageContext,
): { render(): void; reveal(): void } {
  const { content } = ctx;
  const selection: SkinSelection = {};
  let last = '';
  let message = '';
  const status = h('p', 'ws-status');
  status.setAttribute('role', 'status');

  function previewProps(state: GameState, v: WeaponSkinsView): CardProps | null {
    const card = v.previewCardId ? content.cardById.get(v.previewCardId) : undefined;
    if (!card || !v.weapon) return null;
    const rank = { tier: 'unique', stars: 6 } as const;
    return {
      name: card.name,
      label: card.job.charAt(0).toUpperCase() + card.job.slice(1),
      job: card.job,
      emblem: 'blade',
      item: weaponArtMarkup(v.weapon, v.previewArt),
      element: card.element,
      rank,
      rarity: card.rarity,
      face: {
        ability: card.name,
        speed: `${t.hitsEvery.toLowerCase()} 1s`,
        level: { value: 1, cap: 20 },
        progress: 0,
      },
      theme: resolveCard(content, state.cosmetics.loadout, {
        id: card.id,
        rank,
        rarity: card.rarity,
      }),
    };
  }

  function thumb(weapon: string, art: string | null): HTMLElement {
    const box = h('span', 'ws-thumb');
    box.innerHTML = `<svg viewBox="${ITEM_VIEWBOX}" aria-hidden="true" focusable="false">${weaponArtMarkup(weapon, art)}</svg>`;
    return box;
  }

  function build(focusKey?: string): void {
    const state = ctx.state();
    last = weaponSkinsSignature(state);
    const v = weaponSkinsView(state, content, selection, t.original);
    if (!v.weapon) {
      root.replaceChildren(h('p', 'frame__muted', t.none));
      return;
    }
    const weapon = v.weapon;

    // picker side
    const { el: pickEl, body: pickBody } = frame(t.title, t.testNote);
    pickEl.classList.add('ws-picker');
    const badge = h('span', 'ws-badge', t.testBadge);
    pickEl.querySelector('.frame__heading')?.after(badge);

    if (v.weapons.length > 1) {
      const chips = h('div', 'cp-chips');
      chips.setAttribute('role', 'group');
      chips.setAttribute('aria-label', t.weaponLabel);
      for (const w of v.weapons) {
        const b = h('button', 'cp-chip', w.name);
        b.type = 'button';
        b.dataset.key = `weapon-${w.kind}`;
        b.setAttribute('aria-pressed', String(w.kind === weapon));
        b.addEventListener('click', () => {
          selection.weapon = w.kind;
          selection.skin = undefined;
          message = '';
          build(`weapon-${w.kind}`);
        });
        chips.append(b);
      }
      pickBody.append(chips);
    } else {
      pickBody.append(h('p', 'ws-weapon', v.weapons[0]!.name));
    }

    const grid = h('ul', 'ws-grid');
    grid.setAttribute('aria-label', t.skinsGroup);
    for (const tile of v.tiles) {
      const li = h('li');
      const key = `skin-${tile.id ?? 'original'}`;
      const b = h('button', `ws-tile${tile.worn ? ' is-worn' : ''}`);
      b.type = 'button';
      b.dataset.key = key;
      b.setAttribute('aria-pressed', String(tile.picked));
      b.setAttribute('aria-label', t.tileLabel(tile.name, tile.worn, tile.picked));
      b.append(thumb(weapon, tile.art), h('span', 'ws-tile__name', tile.name));
      if (tile.worn) b.append(h('span', 'ws-tile__on', '✓'));
      b.addEventListener('click', () => {
        selection.skin = tile.id;
        message = '';
        build(key);
      });
      li.append(b);
      grid.append(li);
    }
    pickBody.append(grid);

    // preview side
    const { el: viewEl, body: viewBody } = frame(t.previewTitle, v.pickedName);
    viewEl.classList.add('ws-preview');
    const host = h('div', 'ws-stage');
    fitCard(host, { want: 218 });
    const props = previewProps(state, v);
    if (props) {
      const fit = h('div', 'ws-card');
      fit.append(createCard(props).el);
      host.append(fit);
    }
    viewBody.append(host);
    const cardName = v.previewCardName;
    viewBody.append(
      h(
        'p',
        'frame__muted ws-note',
        v.ownsPreviewCard ? t.previewCard(cardName) : t.notOwned(cardName),
      ),
    );
    viewBody.append(h('p', 'frame__muted ws-note', t.previewOnly));

    const apply = h('button', 'button ws-apply', v.isWorn ? t.equipped : t.apply(v.pickedName));
    apply.type = 'button';
    apply.dataset.key = 'apply';
    apply.disabled = !v.canApply;
    apply.addEventListener('click', () => {
      const r = equipWeaponSkin(ctx.state(), content, weapon, v.pickedId);
      if (r.ok) {
        message = t.applied(v.pickedName);
        ctx.apply(r.state);
        build('apply');
      } else {
        message = t.failed;
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
      if (weaponSkinsSignature(ctx.state()) !== last || root.childElementCount === 0) {
        const active = (document.activeElement as HTMLElement | null)?.dataset?.key;
        build(root.contains(document.activeElement) ? active : undefined);
      }
    },
    reveal() {
      build();
    },
  };
}
