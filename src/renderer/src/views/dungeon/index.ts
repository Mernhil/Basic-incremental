import { floorPosition, setAutoChallenge, startFloorChallenge } from '../../../../game';
import { COPY } from '../../copy';
import { createDungeonPanels, type DungeonPanels } from '../../pages/dungeons';
import { h } from '../../shell/shell';
import { createArena, type Arena } from '../../stage/arena';
import type { TableContext, ViewPackage } from '../../table/contract';
import { dealTokens, reducedMotion, stopMotion } from '../../table/motion';
import { DUEL_COPY } from './copy';
import { DUEL_PANELS, togglePanel, type DuelPanel } from './duelModel';
import './dungeon.css';

/**
 * The dungeon window (UI_RULES.md §2 The duel's layout): the one dungeon view. The duel
 * (`stage/arena.ts`) fills it with its own controls (Challenge, auto, speed), and the Dungeons,
 * Weapon and Training buttons sit at its top left; each opens its panel as a framed sheet over the
 * fight, which keeps running. There is no second, full-screen view of the dungeon.
 */

let arena: Arena | null = null;

function ensureArena(ctx: TableContext): Arena {
  if (arena) return arena;
  const a = createArena({
    content: ctx.content,
    state: ctx.state,
    director: ctx.director,
    coins: ctx.coins,
    // the fight is on screen while no view covers the table
    active: () => ctx.current() === null && !document.hidden,
    sound: ctx.sound,
    speed: ctx.duelSpeed,
    challenge: () => {
      const r = startFloorChallenge(ctx.state(), ctx.content);
      if (r.ok) ctx.apply(r.state);
      a.update();
    },
    toggleAuto: () => {
      const s = ctx.state();
      const d = s.activeDungeonId ? ctx.content.dungeonById.get(s.activeDungeonId) : undefined;
      if (!d) return;
      const r = setAutoChallenge(s, ctx.content, d.id, !floorPosition(s, d).autoChallenge);
      if (r.ok) ctx.apply(r.state);
      a.update();
    },
  });
  a.el.classList.add('dv-duel');
  arena = a;
  return a;
}

export const dungeonViews: ViewPackage = {
  pieces: [
    {
      slot: 'centre',
      view: null,
      label: COPY.view.titles.dungeon,
      mount(host, ctx) {
        host.classList.add('dv-window');
        const a = ensureArena(ctx);
        host.append(a.el);

        // ---- the panels: one framed sheet over the fight ----
        let panels: DungeonPanels | null = null;
        const sheet = h('section', 'dv-sheet px-panel');
        sheet.hidden = true;
        sheet.id = 'dv-sheet';
        const sheetHead = h('header', 'dv-sheet__head');
        const sheetTitle = h('h2', 'dv-sheet__title px-display');
        const back = h('button', 'px-btn px-btn--dark dv-sheet__back', DUEL_COPY.backToFight);
        (back as HTMLButtonElement).type = 'button';
        sheetHead.append(back, sheetTitle);
        const sheetBody = h('div', 'dv-sheet__body');
        sheet.append(sheetHead, sheetBody);

        const bar = h('div', 'dv-buttons');
        bar.setAttribute('role', 'group');
        bar.setAttribute('aria-label', DUEL_COPY.panelsLabel);
        const buttons = new Map<DuelPanel, HTMLButtonElement>();
        for (const id of DUEL_PANELS) {
          const b = h(
            'button',
            'px-btn dv-button',
            DUEL_COPY.panels[id] ?? id,
          ) as HTMLButtonElement;
          b.type = 'button';
          b.dataset.key = `panel-${id}`;
          b.setAttribute('aria-controls', 'dv-sheet');
          b.setAttribute('aria-expanded', 'false');
          b.addEventListener('click', () => show(togglePanel(open, id)));
          buttons.set(id, b);
          bar.append(b);
        }
        host.append(bar, sheet);

        let open: DuelPanel | null = null;
        function show(next: DuelPanel | null): void {
          const was = open;
          open = next;
          for (const [id, b] of buttons) {
            const on = id === next;
            b.setAttribute('aria-expanded', String(on));
            b.classList.toggle('px-btn--gold', on);
          }
          if (!next) {
            sheet.hidden = true;
            stopMotion(sheet);
            if (was) buttons.get(was)?.focus();
            return;
          }
          panels ??= createDungeonPanels({
            content: ctx.content,
            state: ctx.state,
            apply: ctx.apply,
            cards: ctx.cards,
            sound: ctx.sound,
            onTierUps: ctx.onTierUps,
          });
          sheetTitle.textContent = DUEL_COPY.panels[next] ?? next;
          sheet.dataset.panel = next;
          sheetBody.replaceChildren(panels[next]);
          panels.render();
          const first = sheet.hidden;
          sheet.hidden = false;
          sheetBody.scrollTop = 0;
          // dealt in from its button (motion E); a switch between panels just swaps
          if (first && !reducedMotion()) {
            const t = dealTokens();
            const from = buttons.get(next)!.getBoundingClientRect();
            const to = sheet.getBoundingClientRect();
            const dx = (from.left + from.width / 2 - (to.left + to.width / 2)) * t.reach;
            const dy = (from.top + from.height / 2 - (to.top + to.height / 2)) * t.reach;
            stopMotion(sheet);
            sheet.animate(
              [
                { transform: `translate(${dx}px, ${dy}px) scale(${t.scale})`, opacity: 0 },
                { transform: 'none', opacity: 1 },
              ],
              { duration: t.dur, easing: t.ease },
            );
          }
          back.focus();
        }
        back.addEventListener('click', () => show(null));
        // Esc closes the panel first (the hub button comes after)
        document.addEventListener(
          'keydown',
          (e) => {
            if (e.key !== 'Escape' || !open || ctx.current() !== null) return;
            e.preventDefault();
            show(null);
          },
          true,
        );

        return {
          render: () => {
            a.update();
            if (open) panels?.render();
          },
        };
      },
    },
  ],
  views: [],
};
