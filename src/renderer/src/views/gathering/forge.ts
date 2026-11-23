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
import { cardItemArt } from '../../pages/loadoutCards';
import { forgeView } from '../../pages/forgeModel';
import { COPY } from '../../copy';
import { fmt } from '../../settings/numberFormat';
import { workerPickList, workerPickTile } from './workerPick';
import { h } from '../../shell/shell';
import type { TableContext, ViewHandle } from '../../table/contract';
import { resourceIconMarkup } from '../../ui/resourceIcons';
import { GATHERING_COPY as T } from './copy';
import { craftsPerMinute, itemSvg } from './jobModel';
import {
  craftFinished,
  emptyTray,
  SCENE_H,
  SCENE_W,
  sceneUnit,
  trayAdd,
  TRAY_TILES,
  type Tray,
} from './forgeStage';
import sceneUrl from './forge-scene-640x360.png';
import { reducedMotion } from '../../art/pixel/live';
import './forge.css';

/**
 * The Forge view, the anvil stage (picker 2026-11-23, Forge A): the recipes on the left, the worker
 * hammering at the centre of the approved forge picture with the fire flickering, the out tray as a
 * strip along the bottom; the worker card sits under the recipes (the furnace stays visible). The
 * rules are untouched: `setForgeRecipe`, `assignForgeWorker`, `advanceForge`.
 */

const set = (node: HTMLElement, text: string): void => {
  if (node.textContent !== text) node.textContent = text;
};

/** A resource's picture: its kept icon, else Money's coin. */
function resourceArt(content: Content, id: string): string {
  const res = content.resourceById.get(id);
  if (!res) return '';
  return resourceIconMarkup(res) ?? '';
}

export function createForgeView(host: HTMLElement, ctx: TableContext): ViewHandle {
  const { content } = ctx;
  host.classList.add('gv-forge');

  host.classList.add('shell-page--stage');
  const stage = h('div', 'fv-stage');

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

  // ---- the centre: the plate with progress, and the scene ----
  const mid = h('section', 'fv-mid');
  const plate = h('div', 'fv-plate px-panel');
  const forgingTitle = h('h2', 'fv-title px-display');
  const bar = h('div', 'fv-bar');
  const fill = h('i');
  bar.append(fill);
  bar.setAttribute('aria-hidden', 'true');
  const progressRow = h('div', 'fv-progress');
  const progressText = h('span', 'bi-num');
  const crafts = h('span', 'bi-num fv-progress__crafts');
  progressRow.append(progressText, crafts);
  const emptyHint = h('p', 'fv-hint', T.forgingNothingHint);
  plate.append(forgingTitle, bar, progressRow, emptyHint);

  const scene = h('div', 'fv-scene');
  scene.setAttribute('aria-hidden', 'true');
  const sceneBox = h('div', 'fv-scene__box');
  sceneBox.style.backgroundImage = `url(${sceneUrl})`;
  const fire = h('div', 'fv-fire');
  const ingot = h('span', 'fv-ingot');
  const hammer = h('span', 'fv-hammer');
  const sparks = h('div', 'fv-sparks');
  sceneBox.append(fire, ingot, hammer, sparks);
  scene.append(sceneBox);

  // ---- the right: the out tray and the worker ----
  const trayPanel = h('div', 'fv-panel fv-tray px-panel');
  const trayTiles = h('div', 'fv-tray__tiles');
  trayTiles.setAttribute('role', 'list');
  const trayNote = h('p', 'fv-hint fv-tray__note bi-num');
  const stock = h('p', 'fv-stock');
  const stockLabel = h('span', 'fv-hint', T.inStock);
  const stockValue = h('span', 'fv-stock__value bi-num');
  stock.append(stockLabel, stockValue);
  trayPanel.append(h('h2', 'fv-title px-display', T.outTray), trayTiles, trayNote, stock);

  const workerPanel = h('div', 'fv-panel fv-workerpanel px-panel');
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
  workerPanel.append(
    h('h2', 'fv-title px-display', T.forgeWorkerTitle),
    workerBox,
    pickList,
    slotNote,
  );
  mid.append(plate, trayPanel);
  const left = h('section', 'fv-left');
  left.append(recipesPanel, workerPanel);
  const ui = h('div', 'fv-ui');
  ui.append(left, mid);

  stage.append(scene, ui);
  host.append(stage);
  recipesPanel.dataset['deal'] = '';

  // the approved picture at the smallest whole scale that covers the stage, centred; the props are
  // laid out in its 640 x 360 pixels
  const fitScene = (): void => {
    const r = scene.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const u = sceneUnit(r.width, r.height);
    sceneBox.style.setProperty('--u', String(u));
    // the hit sheet's pictures are 160 x 152: shown at a whole scale of their own (1x at 2x and 3x)
    sceneBox.style.setProperty('--k', String(Math.max(1, Math.floor(u / 2))));
    sceneBox.style.left = `${Math.floor((r.width - SCENE_W * u) / 2)}px`;
    sceneBox.style.top = `${Math.floor((r.height - SCENE_H * u) / 2)}px`;
  };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fitScene).observe(scene);

  // ---- state ----
  let recipeSig = '';
  let tray: Tray = emptyTray();
  let traySig = '';
  let last: { recipe: string; fraction: number } | null = null;
  let trayHopId = 0;
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
          b.setAttribute('aria-label', `${r.name}: ${r.text}`);
          b.title = r.name;
          const def = content.production.forge.recipes.find((x) => x.id === r.id);
          const row = h('span', 'fv-recipe__row');
          const amounts = h('span', 'fv-recipe__amounts bi-num');
          if (def) {
            def.inputs.forEach((i, n) => {
              if (n > 0) row.append(h('span', 'fv-recipe__op', '+'));
              row.append(iconBox(i.resource));
            });
            row.append(h('span', 'fv-recipe__op', '→'), iconBox(def.output.resource));
            amounts.textContent = `${def.inputs.map((i) => fmt(i.amount)).join('+')}→${fmt(def.output.amount)}`;
          }
          b.append(row, amounts);
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
    bar.hidden = !active;
    progressRow.hidden = !active;
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
    if (hammer.innerHTML !== art) hammer.innerHTML = art;
    workerArt.dataset['rarity'] = card ? cardStyle(card) : '';
    workerArt.classList.toggle('is-empty', !card);
    drawPick(v.workers, id ?? '');

    // the scene: the worker hammers and the fire burns while a craft is being made
    const working = Boolean(
      st.recipe && st.worker && !st.waitingForGems && st.secondsToCraft !== null,
    );
    sceneBox.classList.toggle('is-working', working);
    sceneBox.classList.toggle('has-worker', Boolean(card && owned));
    sceneBox.classList.toggle('has-recipe', Boolean(st.recipe));
    ingot.innerHTML = st.recipe ? resourceArt(content, st.recipe.output.resource) : '';

    // the out tray: a finished craft hops in
    const now = st.recipe ? { recipe: st.recipe.id, fraction: v.fraction } : null;
    if (st.recipe && craftFinished(last, now)) {
      tray = trayAdd(tray, st.recipe.output.resource);
      trayHopId = tray.next - 1;
    }
    last = now;
    drawTray();

    // stock of the recipe's output
    const out = active ? content.production.forge.recipes.find((r) => r.id === active.id) : null;
    stock.hidden = !out;
    if (out) {
      const have = s.resources[out.output.resource] ?? new Decimal(0);
      set(stockValue, `${fmt(have)} ${content.resourceById.get(out.output.resource)?.name ?? ''}`);
    }
  }

  /** A resource's pixel icon in a box. */
  function iconBox(resource: string): HTMLElement {
    const icon = h('span', 'fv-icon');
    icon.setAttribute('aria-hidden', 'true');
    icon.innerHTML = resourceArt(content, resource);
    return icon;
  }

  /** The tray: one tile per finished item (the newest few), the newest one hops in from the anvil. */
  function drawTray(): void {
    const sig = `${tray.next}:${trayHopId}`;
    if (sig !== traySig) {
      traySig = sig;
      const tiles = tray.items.map((it) => {
        const t = h('div', 'fv-tray__tile');
        t.setAttribute('role', 'listitem');
        t.append(iconBox(it.resource));
        return t;
      });
      const empties = Math.max(0, TRAY_TILES - tiles.length);
      for (let i = 0; i < empties; i++) tiles.push(h('div', 'fv-tray__tile is-empty'));
      trayTiles.replaceChildren(...tiles);
      const newest = tray.items.length ? tiles[tray.items.length - 1] : undefined;
      if (newest && trayHopId === tray.next - 1 && !reducedMotion()) hop(newest);
    }
    set(trayNote, tray.total > 0 ? T.trayMade(tray.total) : T.trayEmpty);
  }

  function hop(tile: HTMLElement): void {
    const from = ingot.getBoundingClientRect();
    const to = tile.getBoundingClientRect();
    if (!from.width || !to.width) return;
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    tile.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(1.4)`, opacity: 0.9, offset: 0 },
        {
          transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 40}px) scale(1.2)`,
          opacity: 1,
          offset: 0.5,
        },
        { transform: 'translate(0, 0) scale(1)', opacity: 1, offset: 1 },
      ],
      { duration: 480, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' },
    );
  }

  return {
    render: update,
    opened() {
      picking = false;
      fitScene();
    },
  };
}
