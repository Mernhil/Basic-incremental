import {
  collectModifiers,
  defaultRng,
  portalInfo,
  pull,
  type GameState,
  type PullCount,
} from '../../../game';
import { COPY } from '../copy';
import { h } from '../shell/shell';
import { attachTooltip, hide as hideTip } from '../shell/tooltip';
import { showReveal } from '../stage/reveal';
import { cardFaceProps } from './loadoutCards';
import type { PageContext } from './production';
import { portalView, revealViews } from './summonModel';
import './summon.css';

/**
 * Summon page (DESIGN.md 6 Beta portals, A6 E shelf of portals): the portals side by side as
 * cards, each with its pity bar, rates in a hover tooltip and ×1 / ×10 buttons; the reveal opens
 * in a modal over the shelf. The Wardrobe Gate waits for the Wardrobe (Phase 5).
 */

export interface SummonContext extends PageContext {
  sound?: (id: string) => void;
}

export function createSummonPage(page: HTMLElement, ctx: SummonContext): { render(): void } {
  const { content } = ctx;
  const shelf = h('div', 'sm-shelf');
  page.append(shelf);

  type PortalUi = {
    single: HTMLButtonElement;
    ten: HTMLButtonElement;
    pity: HTMLElement;
    pityFill: HTMLElement;
    guarantee: HTMLElement;
  };
  const uis = new Map<string, PortalUi>();
  let busy = false;

  function doPull(portalId: string, count: PullCount): void {
    if (busy) return;
    const result = pull(ctx.state(), content, portalId, count, defaultRng);
    if (!result.ok) return;
    busy = true;
    hideTip();
    ctx.apply(result.state);
    const portal = content.portals.find((p) => p.id === portalId)!;
    const after = result.state;
    showReveal({
      portalName: portal.name,
      views: revealViews(result.results, content),
      face: (id) => (content.cardById.has(id) ? cardFaceProps(content, after, id) : null),
      ...(ctx.sound ? { sound: ctx.sound } : {}),
      onClose: () => {
        busy = false;
        uis.get(portalId)?.single.focus();
      },
    });
  }

  function portalCard(portalId: string): HTMLElement {
    const card = h('article', 'sm-portal');
    card.dataset.portal = portalId;
    const ring = h('div', 'sm-portal__ring');
    ring.setAttribute('aria-hidden', 'true');
    const name = h('h2', 'sm-portal__name');
    const rates = h('button', 'sm-portal__rates', COPY.summon.rates);
    rates.type = 'button';
    attachTooltip(rates, () => {
      const info = portalInfo(ctx.state(), content, portalId);
      if (!info) return '';
      const v = portalView(info, content);
      const box = h('div', 'sm-rates');
      box.append(h('strong', '', COPY.summon.ratesTitle));
      const list = h('ul');
      for (const line of v.rates) list.append(h('li', 'bi-num', line));
      box.append(list, h('p', '', v.guarantee));
      return box;
    });
    const pity = h('p', 'sm-portal__pity bi-num');
    const track = h('div', 'sm-portal__track');
    const pityFill = h('i');
    track.append(pityFill);
    track.setAttribute('aria-hidden', 'true');
    const guarantee = h('p', 'sm-portal__note');
    const buttons = h('div', 'sm-portal__buttons');
    const button = (count: PullCount): HTMLButtonElement => {
      const b = h('button', 'sm-pull');
      b.type = 'button';
      b.addEventListener('click', () => doPull(portalId, count));
      buttons.append(b);
      return b;
    };
    const single = button(1);
    const ten = button(10);
    card.append(ring, name, rates, pity, track, guarantee, buttons);
    uis.set(portalId, { single, ten, pity, pityFill, guarantee });
    name.textContent = content.portals.find((p) => p.id === portalId)?.name ?? portalId;
    return card;
  }

  function gateCard(): HTMLElement {
    const card = h('article', 'sm-portal sm-portal--locked');
    const ring = h('div', 'sm-portal__ring');
    ring.setAttribute('aria-hidden', 'true');
    card.append(
      ring,
      h('h2', 'sm-portal__name', COPY.summon.gate),
      h('p', 'sm-portal__pity', COPY.summon.gateLocked),
      h('p', 'sm-portal__note', COPY.summon.gateAbout),
    );
    return card;
  }

  shelf.append(...content.portals.map((p) => portalCard(p.id)), gateCard());

  function render(): void {
    const s: GameState = ctx.state();
    const mods = collectModifiers(s, content);
    for (const [id, ui] of uis) {
      const info = portalInfo(s, content, id, mods);
      if (!info) continue;
      const v = portalView(info, content);
      set(ui.pity, v.pity);
      ui.pityFill.style.width = `${(v.pityProgress * 100).toFixed(1)}%`;
      set(ui.guarantee, v.guarantee);
      for (const [b, o, n] of [
        [ui.single, v.single, 1],
        [ui.ten, v.ten, 10],
      ] as const) {
        const label = `${o.label} · ${o.price}`;
        set(b, label);
        b.disabled = !o.affordable || busy;
        b.classList.toggle('is-affordable', o.affordable);
        b.setAttribute('aria-label', COPY.summon.pullLabel(v.name, n, o.price));
      }
    }
  }

  return { render };
}

function set(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}
