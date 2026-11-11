import { buyUpgrade, collectModifiers } from '../../../../game';
import { replay } from '../../stage/motion';
import { h } from '../../shell/shell';
import type { TableContext, ViewApi, ViewHandle } from '../../table/contract';
import { META_COPY as T } from './copy';
import { upgradeBoard, type UpgradeTile } from './upgradesModel';

/**
 * The Upgrades view (UI_RULES §2 "The Upgrades view", mockup 4m): two framed panels, This run and
 * Permanent, each a grid of upgrade tiles, and a foot bar with the lifetime Money earned. A lit
 * tile buys the upgrade; the board comes from `upgradeBoard`.
 */

interface Panel {
  list: HTMLUListElement;
  sig: string;
  tiles: Map<string, HTMLElement>;
}

export function mountUpgrades(host: HTMLElement, ctx: TableContext, api: ViewApi): ViewHandle {
  host.classList.add('mv-upgrades');
  const subtitle = h('span', 'mv-subtitle');
  api.setTools(subtitle);

  const make = (title: string, note: string, key: string): Panel & { el: HTMLElement } => {
    const el = h('section', `px-panel mv-up-panel mv-up-panel--${key}`);
    el.dataset.deal = '';
    const head = h('header', 'mv-up-head');
    head.append(h('h2', 'px-display mv-up-title', title), h('span', 'mv-up-note', note));
    const list = h('ul', 'mv-up-grid');
    el.append(head, list);
    return { el, list, sig: '', tiles: new Map() };
  };
  const run = make(T.upgrades.run, T.upgrades.runNote, 'run');
  const permanent = make(T.upgrades.permanent, T.upgrades.permanentNote, 'permanent');
  const foot = h('footer', 'px-panel mv-up-foot');
  foot.dataset.deal = '';
  const lifetime = h('strong', 'mv-up-lifetime bi-num');
  foot.append(h('span', 'mv-up-foot__label', T.upgrades.lifetime), lifetime);
  host.append(run.el, permanent.el, foot);

  const buy = (panel: Panel, id: string): void => {
    const result = buyUpgrade(ctx.state(), ctx.content, id);
    if (!result.ok) return;
    ctx.apply(result.state);
    ctx.sound('buy');
    render();
    replay(panel.tiles.get(id), 'is-bought', 600);
  };

  const tile = (panel: Panel, t: UpgradeTile): HTMLElement => {
    const li = h('li', `mv-up-tile mv-up-tile--${t.status}`);
    const body = h(t.status === 'available' ? 'button' : 'div', 'mv-up-body');
    const text = h('span', 'mv-up-text');
    text.append(h('span', 'mv-up-name', t.name), h('span', 'mv-up-effect', t.effect));
    if (body instanceof HTMLButtonElement) {
      body.type = 'button';
      body.dataset.key = `upgrade-${t.id}`;
      body.classList.add('px-btn');
      if (t.preview) body.title = t.preview;
      body.addEventListener('click', () => {
        if (body.getAttribute('aria-disabled') !== 'true') buy(panel, t.id);
      });
      body.append(text, h('span', 'mv-up-price bi-num', t.price));
    } else {
      body.classList.add('px-tile');
      body.append(text, h('span', 'mv-up-bought', T.upgrades.bought));
    }
    li.append(body);
    panel.tiles.set(t.id, li);
    return li;
  };

  const fill = (panel: Panel, tiles: UpgradeTile[], empty: string): void => {
    const sig = JSON.stringify(tiles.map((t) => [t.id, t.status]));
    if (sig !== panel.sig) {
      panel.sig = sig;
      panel.tiles.clear();
      panel.list.replaceChildren(
        ...(tiles.length > 0 ? tiles.map((t) => tile(panel, t)) : [h('li', 'mv-up-empty', empty)]),
      );
    }
    // only the lit state changes between rebuilds
    for (const t of tiles) {
      const li = panel.tiles.get(t.id);
      if (!li || t.status !== 'available') continue;
      const body = li.firstElementChild!;
      body.classList.toggle('px-btn--gold', t.affordable);
      body.classList.toggle('px-btn--dark', !t.affordable);
      body.setAttribute('aria-disabled', String(!t.affordable));
    }
  };

  function render(): void {
    const s = ctx.state();
    const board = upgradeBoard(s, ctx.content, collectModifiers(s, ctx.content));
    fill(run, board.run, T.upgrades.emptyRun);
    fill(permanent, board.permanent, T.upgrades.emptyPermanent);
    const text = T.ready(board.ready);
    if (subtitle.textContent !== text)
      subtitle.textContent = board.ready > 0 ? text : T.upgrades.noneReady;
    if (lifetime.textContent !== board.lifetime) lifetime.textContent = board.lifetime;
  }
  render();
  return { render };
}
