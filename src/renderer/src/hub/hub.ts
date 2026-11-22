import { h } from '../shell/shell';
import type { PileHint, TableContext, ViewDef } from '../table/contract';
import type { ViewId } from '../table/viewIds';
import mapUrl from './hub-wide-640x360.png';
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
 * scrolled, with one small invisible click square over each place. On mouseover (or the keyboard
 * on it) the pointer shows and the place's name plate appears; a gold "!" shows where something
 * waits and a lock plate on a place that does not exist yet. Selecting a place opens the screen the
 * dock opened before, or goes to the dungeon.
 */

export interface Hub {
  el: HTMLElement;
  /** The app tick: marks and the scale. */
  render(): void;
}

interface Place {
  def: HubBuilding;
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
  stage.append(img);
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
    spot.addEventListener('click', () => select(def, spot));
    stage.append(spot);
    return { def, spot, mark };
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

  let scale = 0;
  let area = '';
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
    stage.style.width = `${HUB_MAP_W * scale}px`;
    stage.style.height = `${HUB_MAP_H * scale}px`;
    img.style.width = `${HUB_MAP_W * scale}px`;
    img.style.height = `${HUB_MAP_H * scale}px`;
    for (const p of places) {
      const r = scaled(p.def.spot, scale);
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
