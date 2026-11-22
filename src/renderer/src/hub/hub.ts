import { h } from '../shell/shell';
import type { PileHint, TableContext, ViewDef } from '../table/contract';
import type { ViewId } from '../table/viewIds';
import mapUrl from './hub-wide-640x360.png';
import {
  HUB_BUILDINGS,
  HUB_MAP_H,
  HUB_MAP_W,
  hubScale,
  bounds,
  scaled,
  type HubBuilding,
} from './hubModel';
import './hub.css';

/**
 * The hub screen (DESIGN.md section 2 Base camp): the painted map, scrolled up and down, with a
 * click area over each building (hover highlight, a name plate, a gold "!" where something waits,
 * a dimmed lock plate on a place that does not exist yet). Selecting a building opens the screen
 * the dock opened before, or goes to the dungeon. The map is only ever drawn at 2x or 3x.
 */

export interface Hub {
  el: HTMLElement;
  /** The app tick: marks and the scale. */
  render(): void;
}

interface Place {
  def: HubBuilding;
  /** The building's outline: invisible until the mouse is over it (or it has the keyboard). */
  shape: SVGPolygonElement;
  /** Name plate, "!" and lock plate, placed by the box around the outline. */
  tag: HTMLElement;
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
  const NS = 'http://www.w3.org/2000/svg';
  const outlines = document.createElementNS(NS, 'svg');
  outlines.setAttribute('class', 'hub__outlines');
  outlines.setAttribute('viewBox', `0 0 ${HUB_MAP_W} ${HUB_MAP_H}`);
  const tags = h('div', 'hub__tags');
  // Hover look: the rest of the map dims and the building under the mouse lifts one picture pixel
  // and glows. Both layers are cut to the building's outline; nothing is drawn until a mouseover.
  const dim = document.createElementNS(NS, 'svg');
  dim.setAttribute('class', 'hub__dim');
  dim.setAttribute('viewBox', `0 0 ${HUB_MAP_W} ${HUB_MAP_H}`);
  dim.setAttribute('preserveAspectRatio', 'none');
  const dimPath = document.createElementNS(NS, 'path');
  dimPath.setAttribute('fill-rule', 'evenodd');
  dim.append(dimPath);
  const lift = h('div', 'hub__lift');
  const liftImg = h('img', 'hub__lift-img') as HTMLImageElement;
  liftImg.src = mapUrl;
  liftImg.alt = '';
  liftImg.draggable = false;
  liftImg.setAttribute('aria-hidden', 'true');
  lift.append(liftImg);
  stage.append(img, dim, lift, outlines, tags);
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
    const shape = document.createElementNS(NS, 'polygon');
    shape.setAttribute('points', def.shape.map((p) => p.join(',')).join(' '));
    shape.setAttribute('class', 'hub__shape');
    shape.setAttribute('role', 'button');
    shape.setAttribute('tabindex', '0');
    shape.dataset['building'] = def.id;
    const why = def.action.kind === 'locked' ? def.action.why : null;
    shape.classList.toggle('is-locked', why !== null);
    shape.setAttribute('aria-label', why !== null ? `${def.name}: ${why}` : def.name);
    outlines.append(shape);

    const tag = h('div', 'hub__tag');
    tag.dataset['building'] = def.id;
    const plate = h('span', 'hub__plate px-display', def.name);
    plate.setAttribute('aria-hidden', 'true');
    tag.append(plate);
    if (why !== null) {
      const lock = h('span', 'hub__lock', why);
      lock.setAttribute('aria-hidden', 'true');
      tag.append(lock);
    }
    const mark = h('span', 'hub__mark', '!');
    mark.hidden = true;
    mark.setAttribute('aria-hidden', 'true');
    tag.append(mark);
    tags.append(tag);

    const show = (on: boolean): void => {
      tag.classList.toggle('is-on', on);
      lit(on ? def : null);
    };
    shape.addEventListener('pointerenter', () => show(true));
    shape.addEventListener('pointerleave', () => show(false));
    shape.addEventListener('focus', () => show(true));
    shape.addEventListener('blur', () => show(false));
    shape.addEventListener('click', () => select(def, tag));
    shape.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        select(def, tag);
      }
    });
    return { def, shape, tag, mark };
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
    if (!menu.hidden && !(e.target as Element).closest('.hub__menu, .hub__shape')) closeMenu();
  });

  /** Lights one building (dims the rest, lifts it) or none. */
  function lit(def: HubBuilding | null): void {
    if (!def) {
      dim.classList.remove('is-on');
      lift.classList.remove('is-on');
      return;
    }
    const w = HUB_MAP_W * scale;
    const hh = HUB_MAP_H * scale;
    const pts = def.shape.map((p) => `${p[0] * scale}px ${p[1] * scale}px`).join(', ');
    // the whole map minus the building: two sub-paths, filled even-odd
    const hole = def.shape.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]} ${p[1]}`).join(' ');
    dimPath.setAttribute('d', `M0 0H${HUB_MAP_W}V${HUB_MAP_H}H0Z ${hole}Z`);
    dim.classList.add('is-on');
    const locked = def.action.kind === 'locked';
    lift.classList.toggle('is-on', !locked);
    if (!locked) {
      liftImg.style.clipPath = `polygon(${pts})`;
      lift.style.transform = `translateY(-${scale}px)`;
      liftImg.style.width = `${w}px`;
      liftImg.style.height = `${hh}px`;
    }
  }

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
    outlines.style.width = `${HUB_MAP_W * scale}px`;
    outlines.style.height = `${HUB_MAP_H * scale}px`;
    for (const p of places) {
      const r = scaled(bounds(p.def.shape), scale);
      p.tag.style.left = `${r.x}px`;
      p.tag.style.top = `${r.y}px`;
      p.tag.style.width = `${r.w}px`;
      p.tag.style.height = `${r.h}px`;
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
