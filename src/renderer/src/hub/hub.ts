import { h } from '../shell/shell';
import type { PileHint, TableContext, ViewDef } from '../table/contract';
import type { ViewId } from '../table/viewIds';
import mapUrl from './hub-wide-640x360.png';
import { glowImage, loadMapPixels, loadMask, maskFileFor, maskHit, type Mask } from './hubMasks';
import {
  HUB_BUILDINGS,
  HUB_MAP_H,
  HUB_MAP_W,
  hubScale,
  scaled,
  type HubBuilding,
} from './hubModel';
import './hub.css';

/**
 * The hub screen (DESIGN.md section 2 Base camp): the painted map at a whole scale, centred, never
 * scrolled. Each place is its mask: the click area is a pixel test on the mask at the map's scale.
 * On mouseover (or the keyboard on it) the place is brightened a little and outlined by one gold
 * map pixel, and its name plate shows (about 120 ms fade in and out); a gold "!" shows where
 * something waits, and a lock plate on a place that does not exist yet. Selecting a place opens
 * the screen the dock opened before, or goes to the dungeon.
 */

export interface Hub {
  el: HTMLElement;
  /** The app tick: marks and the scale. */
  render(): void;
}

interface Place {
  def: HubBuilding;
  /** The place's mask once it is read. */
  mask: Mask | null;
  /** A button over the mask's box: the keyboard's way in (Tab, Enter) and the plate's anchor. */
  spot: HTMLButtonElement;
  mark: HTMLElement;
}

export function createHub(
  ctx: TableContext,
  views: readonly ViewDef[],
  actions: { goDungeon(): void; open(id: ViewId, from: HTMLElement): void },
): Hub {
  const el = h('div', 'hub');
  const scroller = h('div', 'hub__view');
  const stage = h('div', 'hub__stage');
  const img = h('img', 'hub__map') as HTMLImageElement;
  img.src = mapUrl;
  img.alt = '';
  img.draggable = false;
  img.setAttribute('aria-hidden', 'true');
  // the hover picture: drawn at the map's own pixels, scaled by CSS with nearest neighbour
  const glow = h('canvas', 'hub__glow') as HTMLCanvasElement;
  glow.width = HUB_MAP_W;
  glow.height = HUB_MAP_H;
  glow.setAttribute('aria-hidden', 'true');
  stage.append(img, glow);
  scroller.append(stage);

  const menu = h('div', 'hub__menu px-panel');
  menu.hidden = true;
  menu.setAttribute('role', 'menu');
  el.append(scroller, menu);

  const settings = h('button', 'px-btn hub__settings', 'Settings');
  settings.type = 'button';
  settings.dataset['open'] = 'settings';
  settings.addEventListener('click', () => actions.open('settings', settings));
  el.append(settings);

  const hintOf = (id: ViewId): PileHint | null =>
    views.find((v) => v.id === id)?.pile?.hint?.(ctx) ?? null;

  let scale = 0;
  let area = '';
  let mapPixels: ImageData | null = null;
  let hovered: Place | null = null;

  const places: Place[] = HUB_BUILDINGS.map((def) => {
    const spot = h('button', 'hub__spot') as HTMLButtonElement;
    spot.type = 'button';
    spot.dataset['building'] = def.id;
    const why = def.action.kind === 'locked' ? def.action.why : null;
    spot.classList.toggle('is-locked', why !== null);
    spot.setAttribute('aria-label', why !== null ? `${def.name}: ${why}` : def.name);
    const plate = h('span', 'hub__plate px-display', def.name);
    plate.setAttribute('aria-hidden', 'true');
    spot.append(plate);
    if (why !== null) {
      const lock = h('span', 'hub__lock', why);
      lock.setAttribute('aria-hidden', 'true');
      spot.append(lock);
    }
    const mark = h('span', 'hub__mark', '!');
    mark.hidden = true;
    mark.setAttribute('aria-hidden', 'true');
    spot.append(mark);
    const place: Place = { def, mask: null, spot, mark };
    spot.addEventListener('click', () => select(def, spot));
    spot.addEventListener('focus', () => light(place));
    spot.addEventListener('blur', () => {
      if (hovered === place) light(null);
    });
    stage.append(spot);
    return place;
  });

  // read the masks and the map's pixels; the picture still shows, the places answer once they are read
  void (async () => {
    mapPixels = await loadMapPixels(mapUrl);
    await Promise.all(
      places.map(async (p) => {
        const url = maskFileFor(p.def.id);
        p.mask = url ? await loadMask(url) : null;
      }),
    );
    area = '';
    layout();
  })();

  /** Lights one place (brightened, gold outline, name plate) or none. */
  function light(place: Place | null): void {
    if (place === hovered && place !== null) return;
    if (hovered) hovered.spot.classList.remove('is-on');
    hovered = place;
    if (!place) {
      glow.classList.remove('is-on');
      stage.style.cursor = '';
      return;
    }
    place.spot.classList.add('is-on');
    if (place.mask && mapPixels) {
      const g = glow.getContext('2d');
      if (g) {
        g.clearRect(0, 0, HUB_MAP_W, HUB_MAP_H);
        g.putImageData(glowImage(place.mask, mapPixels), 0, 0);
      }
      glow.classList.add('is-on');
    }
    stage.style.cursor = place.def.action.kind === 'locked' ? 'not-allowed' : 'pointer';
  }

  /** The place whose mask is under a point of the screen, if any. */
  function placeAt(clientX: number, clientY: number): Place | null {
    if (scale === 0) return null;
    const r = stage.getBoundingClientRect();
    const x = Math.floor((clientX - r.left) / scale);
    const y = Math.floor((clientY - r.top) / scale);
    return places.find((p) => p.mask && maskHit(p.mask, x, y)) ?? null;
  }

  stage.addEventListener('pointermove', (e) => light(placeAt(e.clientX, e.clientY)));
  stage.addEventListener('pointerleave', () => light(null));
  stage.addEventListener('click', (e) => {
    if ((e.target as Element).closest('.hub__spot')) return;
    const p = placeAt(e.clientX, e.clientY);
    if (p) select(p.def, p.spot);
  });

  function closeMenu(): void {
    menu.hidden = true;
    menu.replaceChildren();
  }

  function select(def: HubBuilding, from: HTMLElement): void {
    const a = def.action;
    if (a.kind === 'locked') return;
    closeMenu();
    if (a.kind === 'dungeon') actions.goDungeon();
    else if (a.kind === 'view') actions.open(a.view, from);
    else {
      const r = from.getBoundingClientRect();
      const host = el.getBoundingClientRect();
      menu.replaceChildren(
        ...a.choices.map((c) => {
          const b = h('button', 'px-btn hub__choice', c.label);
          b.type = 'button';
          b.setAttribute('role', 'menuitem');
          b.dataset['open'] = c.view;
          b.addEventListener('click', () => {
            closeMenu();
            actions.open(c.view, from);
          });
          return b;
        }),
      );
      menu.hidden = false;
      menu.style.left = `${Math.max(8, Math.min(r.left - host.left, host.width - 280))}px`;
      menu.style.top = `${Math.max(8, r.top - host.top + Math.min(r.height, 40))}px`;
      (menu.querySelector('button') as HTMLElement | null)?.focus();
    }
  }

  el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !menu.hidden) {
      closeMenu();
      e.stopPropagation();
    }
  });
  el.addEventListener('pointerdown', (e) => {
    if (!menu.hidden && !(e.target as Element).closest('.hub__menu, .hub__spot')) closeMenu();
  });

  function layout(): void {
    const w = scroller.clientWidth;
    const hh = scroller.clientHeight;
    const key = `${w}x${hh}`;
    if (key === area) return;
    area = key;
    scale = hubScale(w, hh);
    // centred: the stage may be taller than the window, then the top and bottom edge are cut
    stage.style.left = `${Math.floor((w - HUB_MAP_W * scale) / 2)}px`;
    stage.style.top = `${Math.floor((hh - HUB_MAP_H * scale) / 2)}px`;
    for (const node of [stage, img, glow]) {
      node.style.width = `${HUB_MAP_W * scale}px`;
      node.style.height = `${HUB_MAP_H * scale}px`;
    }
    for (const p of places) {
      if (!p.mask) {
        p.spot.hidden = true;
        continue;
      }
      p.spot.hidden = false;
      const r = scaled(p.mask.bounds, scale);
      p.spot.style.left = `${r.x}px`;
      p.spot.style.top = `${r.y}px`;
      p.spot.style.width = `${r.w}px`;
      p.spot.style.height = `${r.h}px`;
    }
    el.dataset['scale'] = String(scale);
  }

  return {
    el,
    render() {
      layout();
      for (const p of places) {
        const ready = p.def.marks.some((id) => hintOf(id)?.ready);
        if (p.mark.hidden === ready) p.mark.hidden = !ready;
      }
    },
  };
}
