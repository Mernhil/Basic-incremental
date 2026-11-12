import {
  collectModifiers,
  producersOf,
  productionStageView,
  toolLines,
  type ProductionJob,
} from '../../../../game';
import { mineTile, svg, treeTile } from '../../art/gems';
import { COPY } from '../../copy';
import { jobRateValue, productionRows, type ProductionRow } from '../../pages/productionModel';
import { h } from '../../shell/shell';
import type { TableContext } from '../../table/contract';
import { buyCount } from '../../ui/buy';
import { GATHERING_COPY as T } from './copy';
import './wing.css';

/**
 * A wing of the table (UI_RULES.md §2 "What is on the table"; mockup 4a): the job's name and output
 * per second, one small plate per tree kind or mine type (art, name, output, level, the price of
 * its next level, its worker and its age or layer or lucky strike), and the Tools line. Read-only:
 * a click anywhere on the wing opens the job's view (table/table.ts).
 */

interface PlateRef {
  el: HTMLElement;
  art: HTMLElement;
  artKey: string;
  rate: HTMLElement;
  level: HTMLElement;
  price: HTMLElement;
  who: HTMLElement;
  where: HTMLElement;
}

const set = (node: HTMLElement, text: string): void => {
  if (node.textContent !== text) node.textContent = text;
};

/** Wing numbers are worked out at most this often (ms). */
const EVERY_MS = 250;

export function createWing(
  host: HTMLElement,
  ctx: TableContext,
  job: ProductionJob,
): { render(): void } {
  const { content } = ctx;
  host.classList.add('gw', `gw--${job}`);
  const head = h('h2', 'gw__title px-display');
  const name = h('span', 'gw__name', COPY.production[job].title);
  const total = h('span', 'gw__total bi-num');
  head.append(name, total);
  const list = h('ul', 'gw__list');
  const tools = h('div', 'gw__tools px-btn px-btn--quiet', T.tools);
  host.append(head, list, tools);
  const plates = new Map<string, PlateRef>();

  const tileArt = (row: ProductionRow): string => {
    const producer = producersOf(content, job).find((p) => p.id === row.id);
    const resource = producer ? content.resourceById.get(producer.resource) : undefined;
    const gem = resource?.gem;
    if (!gem) return '';
    const tree = job === 'logging' ? content.treeById.get(row.id) : undefined;
    return svg(tree ? treeTile(tree, gem, row.stage) : mineTile(gem, row.stage));
  };

  function plate(row: ProductionRow): PlateRef {
    const el = h('li', 'gw-plate px-panel');
    const art = h('span', 'gw-plate__art');
    art.setAttribute('aria-hidden', 'true');
    const text = h('div', 'gw-plate__text');
    const title = h('b', 'gw-plate__name', row.name);
    const line = h('div', 'gw-plate__line');
    const rate = h('span', 'gw-plate__rate bi-num');
    const level = h('span', 'gw-plate__level');
    line.append(rate, level);
    const price = h('span', 'gw-plate__price bi-num');
    text.append(title, line, price);
    const foot = h('div', 'gw-plate__foot');
    const who = h('span', 'gw-plate__who');
    const where = h('span', 'gw-plate__where');
    foot.append(who, where);
    el.append(art, text, foot);
    list.append(el);
    return { el, art, artKey: '', rate, level, price, who, where };
  }

  let at = -Infinity;
  return {
    render() {
      const now = performance.now();
      if (now - at < EVERY_MS) return;
      at = now;
      const s = ctx.state();
      const mods = collectModifiers(s, content);
      set(total, T.rate(jobRateValue(s, content, job, mods)));
      const rows = productionRows(s, content, job, buyCount(), mods);
      const targets = new Map(productionStageView(s, content, job).targets.map((t) => [t.kind, t]));
      for (const row of rows) {
        const ref = plates.get(row.key) ?? plate(row);
        plates.set(row.key, ref);
        const locked = row.kind !== 'active';
        ref.el.classList.toggle('is-locked', locked);
        const key = `${row.id}:${row.stage}`;
        if (ref.artKey !== key) {
          ref.artKey = key;
          ref.art.innerHTML = tileArt(row);
        }
        set(ref.rate, locked ? '–' : T.rate(row.outputValue));
        set(ref.level, locked ? T.locked : T.level(row.buy?.level ?? 0));
        const price = locked ? (row.unlock?.amount ?? '') : (row.buy?.price ?? '');
        set(ref.price, price);
        const affordable = locked
          ? Boolean(row.unlock?.affordable)
          : Boolean(row.buy?.offer.affordable);
        ref.price.classList.toggle('is-ready', affordable);
        ref.price.hidden = price === '';
        const target = locked ? null : (targets.get(row.kindIndex) ?? null);
        ref.el.querySelector('.gw-plate__foot')?.toggleAttribute('hidden', locked);
        set(ref.who, target?.worker?.name ?? T.noWorker);
        ref.who.classList.toggle('is-empty', !target?.worker);
        if (target?.lucky) {
          set(ref.where, target.lucky.name);
          ref.where.classList.add('is-lucky');
        } else {
          ref.where.classList.remove('is-lucky');
          const d = target?.depth;
          set(ref.where, d ? (job === 'logging' ? T.age : T.layer)(d.layer, d.max) : '');
        }
      }
      const ready = toolLines(s, content, job, 1, mods).filter((t) => t.offer.affordable).length;
      set(tools, ready > 0 ? T.toolsReady(ready) : T.tools);
    },
  };
}
