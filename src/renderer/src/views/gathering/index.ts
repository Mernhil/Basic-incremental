import { COPY } from '../../copy';
import { createProductionPage } from '../../pages/production';
import { h } from '../../shell/shell';
import type { TableContext, ViewDef, ViewPackage } from '../../table/contract';
import { createForgePanel } from '../../ui/forge';
import { createToolLinesPanel } from '../../ui/toolLines';
import { GATHERING_COPY as T } from './copy';
import { createWing } from './wing';
import './gathering.css';

/**
 * Package 9b: the Logging and Mining wings and their views, and the Forge (mockups 4a, 4c, 4e,
 * 4f; UI_RULES.md §2). Today the Logging and Mining views both show the Production page as it was
 * (the pixel ledger with both bands), moved into whichever view opens and scrolled to that job's
 * band; its ×1 / ×10 / ×100 / Max toggle sits in their title bars. The Forge view holds the forge
 * panel and both jobs' tool lines.
 */

interface Ledger {
  el: HTMLElement;
  render(): void;
  toggle: HTMLElement | null;
}

let ledger: Ledger | null = null;

function ensureLedger(ctx: TableContext): Ledger {
  if (ledger) return ledger;
  const el = h('div', 'shell-page gv-ledger');
  el.dataset.page = 'production';
  el.append(h('h1', 'shell-page__title sr-only', COPY.pages.production.label));
  const made: Ledger = { el, render: () => undefined, toggle: null };
  const page = createProductionPage(el, {
    content: ctx.content,
    state: ctx.state,
    apply: ctx.apply,
    director: ctx.director,
    coins: ctx.coins,
    visible: () => {
      const open = ctx.current();
      return (open === 'logging' || open === 'mining') && !document.hidden;
    },
    sound: ctx.sound,
    onTierUps: ctx.onTierUps,
    setBuySlot: (toggle) => (made.toggle = toggle),
  });
  made.render = page.render;
  ledger = made;
  return made;
}

function jobView(job: 'logging' | 'mining'): ViewDef {
  return {
    id: job,
    title: COPY.view.titles[job],
    mount(host, ctx, api) {
      const l = ensureLedger(ctx);
      host.classList.add('gv-job');
      api.setTools(l.toggle);
      return {
        render: () => l.render(),
        opened() {
          host.append(l.el);
          l.render();
          // the job's band at the top of the ledger's own scroll
          const band = l.el.querySelector<HTMLElement>(`.pp-band[data-job="${job}"]`);
          const scroller = l.el.querySelector<HTMLElement>('.pp-scroll');
          if (band && scroller) scroller.scrollTop = Math.max(0, band.offsetTop - 12);
        },
      };
    },
  };
}

const forgeView: ViewDef = {
  id: 'forge',
  title: COPY.view.titles.forge,
  pile: { glyph: 'production', hint: () => ({ text: T.forgeHint }) },
  mount(host, ctx) {
    host.classList.add('gv-forge');
    const forge = createForgePanel({
      content: ctx.content,
      state: ctx.state,
      apply: ctx.apply,
      sound: ctx.sound,
    });
    const tools = (['logging', 'mining'] as const).map((job) =>
      createToolLinesPanel({
        content: ctx.content,
        job,
        state: ctx.state,
        apply: ctx.apply,
        sound: ctx.sound,
      }),
    );
    host.append(forge.el, ...tools.map((t) => t.el));
    return {
      render() {
        forge.update();
        for (const t of tools) t.update();
      },
    };
  },
};

export const gatheringViews: ViewPackage = {
  pieces: [
    {
      slot: 'left',
      view: 'logging',
      label: COPY.table.open(COPY.view.titles.logging),
      mount: (host, ctx) => createWing(host, ctx, 'logging'),
    },
    {
      slot: 'right',
      view: 'mining',
      label: COPY.table.open(COPY.view.titles.mining),
      mount: (host, ctx) => createWing(host, ctx, 'mining'),
    },
  ],
  views: [jobView('logging'), jobView('mining'), forgeView],
};
