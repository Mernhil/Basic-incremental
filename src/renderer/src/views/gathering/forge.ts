import { cardStyle } from '../../../../data';
import type { Content } from '../../../../data';
import {
  cardDisplayName,
  Decimal,
  assignForgeWorker,
  forgeStatus,
  forgeWorker,
  setForgeRecipe,
  workerPower,
} from '../../../../game';
import { gemCoin, svg } from '../../art/gems';
import { cardItemArt } from '../../pages/loadoutCards';
import { forgeView } from '../../pages/forgeModel';
import { COPY } from '../../copy';
import { fmt } from '../../settings/numberFormat';
import { workerPickList, workerPickTile } from './workerPick';
import { h } from '../../shell/shell';
import type { TableContext, ViewHandle } from '../../table/contract';
import { iconMarkup, resourceIconId } from '../../ui/resourceIcons';
import { GATHERING_COPY as T } from './copy';
import { craftsPerMinute, forgeFlow, itemSvg } from './jobModel';
import './forge.css';

/**
 * The Forge view (UI_RULES.md §2 "The Forge view"; mockup 4f): the recipes, the recipe being
 * forged with its progress and worker, and the card at work.
 */

const set = (node: HTMLElement, text: string): void => {
  if (node.textContent !== text) node.textContent = text;
};

/** A resource's picture: its gem coin, else its placeholder icon, else the starlight shard. */
function resourceArt(content: Content, id: string): string {
  const res = content.resourceById.get(id);
  if (!res) return '';
  if (res.gem) return svg(gemCoin(res.gem, 0));
  return iconMarkup(resourceIconId(res)) ?? iconMarkup('starlight') ?? '';
}

export function createForgeView(host: HTMLElement, ctx: TableContext): ViewHandle {
  const { content } = ctx;
  host.classList.add('gv-forge');

  const layout = h('div', 'fv-layout');

  // ---- recipes ----
  const recipesPanel = h('section', 'fv-panel fv-recipes px-panel');
  recipesPanel.setAttribute('aria-label', T.recipesTitle);
  const recipeList = h('div', 'fv-recipes__list');
  recipeList.setAttribute('role', 'group');
  recipeList.setAttribute('aria-label', T.recipesTitle);
  recipesPanel.append(
    h('h2', 'fv-title px-display', T.recipesTitle),
    recipeList,
    h('p', 'fv-hint fv-recipes__foot', T.recipesFoot),
  );

  // ---- the recipe being forged ----
  const mid = h('section', 'fv-panel fv-mid px-panel');
  const forgingTitle = h('h2', 'fv-title px-display');
  const flow = h('div', 'fv-flow');
  flow.setAttribute('role', 'img');
  const bar = h('div', 'fv-bar');
  const fill = h('i');
  bar.append(fill);
  bar.setAttribute('aria-hidden', 'true');
  const progressRow = h('div', 'fv-progress');
  const progressText = h('span', 'bi-num');
  const crafts = h('span', 'bi-num fv-progress__crafts');
  progressRow.append(progressText, crafts);
  const emptyHint = h('p', 'fv-hint', T.forgingNothingHint);

  const workerTitle = h('h2', 'fv-title px-display', T.forgeWorkerTitle);
  const workerBox = h('div', 'fv-worker');
  const workerArt = h('span', 'fv-worker__art');
  workerArt.setAttribute('aria-hidden', 'true');
  const workerText = h('div', 'fv-worker__text');
  const workerName = h('b', 'fv-worker__name');
  const workerPowerEl = h('span', 'bi-num fv-hint');
  const workerRule = h('span', 'fv-hint', T.forgeWorkerRule);
  const changeBtn = h('button', 'px-btn px-btn--dark', T.changeWorker);
  changeBtn.type = 'button';
  changeBtn.dataset['key'] = 'forge-change-worker';
  changeBtn.setAttribute('aria-expanded', 'false');
  workerText.append(workerName, workerPowerEl, workerRule, changeBtn);
  workerBox.append(workerArt, workerText);
  const pickList = workerPickList();
  pickList.classList.add('fv-pick');
  pickList.hidden = true;
  const slotNote = h('p', 'fv-hint', T.forgeSlotNote);
  const stock = h('p', 'fv-stock');
  const stockLabel = h('span', 'fv-hint', T.inStock);
  const stockValue = h('span', 'fv-stock__value bi-num');
  stock.append(stockLabel, stockValue);
  mid.append(
    forgingTitle,
    flow,
    bar,
    progressRow,
    emptyHint,
    workerTitle,
    workerBox,
    pickList,
    slotNote,
    stock,
  );

  layout.append(recipesPanel, mid);
  host.append(layout);
  recipesPanel.dataset['deal'] = '';
  mid.dataset['deal'] = '';

  // ---- state ----
  let recipeSig = '';
  let flowSig = '';
  let artSig = '';
  let picking = false;

  const recipeButtons = new Map<string, HTMLButtonElement>();

  function drawPick(workers: { cardId: string; label: string }[], current: string): void {
    pickList.hidden = !picking;
    changeBtn.setAttribute('aria-expanded', String(picking));
    if (!picking) {
      pickList.replaceChildren();
      return;
    }
    const items: HTMLElement[] = [];
    const none = h('button', 'pp-pick__opt');
    none.type = 'button';
    none.dataset['key'] = 'forge-worker-none';
    none.append(h('b', '', T.sendAway));
    none.addEventListener('click', () => choose(null));
    items.push(h('li', 'wk-pick__bar', ''));
    items[0]!.append(none);
    if (workers.length === 0) {
      items.push(h('li', 'fv-hint', T.noWorkerCards));
    }
    const state = ctx.state();
    for (const w of workers) {
      items.push(
        workerPickTile(content, state, {
          cardId: w.cardId,
          key: `forge-worker-${w.cardId}`,
          name: w.label,
          power: '',
          note: '',
          where: w.cardId === current ? COPY.production.pickHere : '',
          current: w.cardId === current,
          disabled: false,
          onPick: () => choose(w.cardId),
        }),
      );
    }
    pickList.replaceChildren(...items);
  }

  function choose(cardId: string | null): void {
    const r = assignForgeWorker(ctx.state(), content, cardId);
    if (!r.ok) return;
    ctx.sound('buy');
    ctx.apply(r.state);
    picking = false;
    update();
  }

  changeBtn.addEventListener('click', () => {
    picking = !picking;
    update();
  });

  function update(): void {
    const s = ctx.state();
    const v = forgeView(s, content);
    const st = forgeStatus(s, content)!;

    // recipes: a button each, the lit one is being forged; a placeholder for the others
    const sig = JSON.stringify(v.recipes.map((r) => r.id));
    if (sig !== recipeSig) {
      recipeSig = sig;
      recipeButtons.clear();
      recipeList.replaceChildren(
        ...v.recipes.map((r) => {
          const b = h('button', 'fv-recipe');
          b.type = 'button';
          b.dataset['key'] = `forge-recipe-${r.id}`;
          b.dataset['recipe'] = r.id;
          b.append(h('b', '', r.name), h('span', 'bi-num', r.text));
          b.addEventListener('click', () => {
            const on = b.classList.contains('is-on');
            const result = setForgeRecipe(ctx.state(), content, on ? null : r.id);
            if (!result.ok) return;
            ctx.sound('buy');
            ctx.apply(result.state);
            update();
          });
          recipeButtons.set(r.id, b);
          return b;
        }),
        (() => {
          const more = h('div', 'fv-recipe is-placeholder');
          more.append(h('b', '', T.moreRecipes), h('span', '', T.moreRecipesNote));
          return more;
        })(),
      );
    }
    for (const r of v.recipes) {
      const b = recipeButtons.get(r.id);
      b?.classList.toggle('is-on', r.active);
      b?.setAttribute('aria-pressed', String(r.active));
    }

    // the recipe being forged
    const active = v.recipes.find((r) => r.active);
    set(forgingTitle, active ? T.forging(active.name) : T.forgingNothing);
    emptyHint.hidden = Boolean(active);
    flow.hidden = !active;
    bar.hidden = !active;
    progressRow.hidden = !active;
    const f = forgeFlow(s, content);
    const fsig = f ? JSON.stringify(f) : '';
    if (fsig !== flowSig) {
      flowSig = fsig;
      if (f) {
        const parts: HTMLElement[] = [];
        f.inputs.forEach((i, n) => {
          if (n > 0) parts.push(h('span', 'fv-flow__op', '+'));
          parts.push(flowItem(i.resource, i.amount));
        });
        parts.push(h('span', 'fv-flow__op', '→'));
        parts.push(flowItem(f.output.resource, f.output.amount));
        flow.replaceChildren(...parts);
        flow.setAttribute('aria-label', active?.text ?? '');
      } else flow.replaceChildren();
    }
    fill.style.width = `${Math.round(v.fraction * 100)}%`;
    set(progressText, T.progress(Math.round(v.fraction * 100), v.status));
    set(crafts, st.recipe && st.worker ? craftsPerMinute(st.speed, st.recipe.work) : '');

    // the worker
    const id = forgeWorker(s, content);
    const card = id ? content.cardById.get(id) : undefined;
    const owned = id ? s.cards.owned[id] : undefined;
    set(workerName, card && owned ? cardDisplayName(content, card) : COPY.forge.noneWorker);
    set(
      workerPowerEl,
      card && owned ? T.forgeWorkerPower(fmt(workerPower(content, card.id, owned))) : '',
    );
    const art = card && owned && id ? itemSvg(cardItemArt(content, id, owned, s)) : '';
    if (art !== artSig) {
      artSig = art;
      workerArt.innerHTML = art;
    }
    workerArt.dataset['rarity'] = card ? cardStyle(card) : '';
    workerArt.classList.toggle('is-empty', !card);
    drawPick(v.workers, id ?? '');

    // stock of the recipe's output
    const out = active ? content.production.forge.recipes.find((r) => r.id === active.id) : null;
    stock.hidden = !out;
    if (out) {
      const have = s.resources[out.output.resource] ?? new Decimal(0);
      set(stockValue, `${fmt(have)} ${content.resourceById.get(out.output.resource)?.name ?? ''}`);
    }
  }

  function flowItem(resource: string, amount: string): HTMLElement {
    const item = h('span', 'fv-flow__item');
    const icon = h('span', 'fv-flow__icon');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = resourceArt(content, resource);
    item.append(icon, h('span', 'bi-num', amount));
    return item;
  }

  return {
    render: update,
    opened() {
      picking = false;
    },
  };
}
