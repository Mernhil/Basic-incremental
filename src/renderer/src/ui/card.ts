import type { Rank } from '../../../data';
import type { ResolvedCard } from '../../../game';
import { cardFrame } from '../art/frame';
import { ITEM_VIEWBOX } from '../art/items';
import { attachElementFx, type CardElement } from '../art/fx';
import { effectStrength } from '../art/fxGeometry';
import { applyCardTheme } from '../theme/apply';

/** Placeholder emblems until real card art exists. */
const EMBLEMS: Record<string, string> = {
  blade:
    '<path d="M50 8 62 60 50 70 38 60Z"/><path d="M30 64H70V71H30Z"/><path d="M45 70H55V92H45Z"/>',
  gem: '<path d="M30 16H70L90 40 50 90 10 40Z"/>',
  shield: '<path d="M50 8 84 20V48C84 70 68 84 50 92 32 84 16 70 16 48V20Z"/>',
  pick: '<path d="M12 40C30 14 70 14 88 40 70 30 30 30 12 40Z"/><path d="M46 30H54V92H46Z"/>',
  axe: '<path d="M30 20C62 8 84 26 76 52 60 44 44 42 30 50Z"/><path d="M26 20H34V92H26Z"/>',
  golem:
    '<rect x="22" y="20" width="56" height="48" rx="8"/><rect x="34" y="72" width="12" height="18" rx="3"/><rect x="54" y="72" width="12" height="18" rx="3"/>',
  rock: '<path d="M14 70 26 38 46 26 70 30 86 52 82 76 54 86 28 84Z"/>',
  tree: '<path d="M50 10 76 46H62L82 70H18L38 46H24Z"/><path d="M44 70H56V90H44Z"/>',
};

const TIER_NAMES: Record<Rank['tier'], string> = {
  bronze: 'Bronze',
  silver: 'Silver',
  gold: 'Gold',
  prismatic: 'Prismatic',
};

export interface CardStat {
  label: string;
  value: string;
}

export interface CardProps {
  name: string;
  /** Short role or job label shown on the name plate. */
  label: string;
  job: string;
  emblem: keyof typeof EMBLEMS | string;
  /** The signature item (art/items.ts). Replaces the emblem when set. */
  item?: string;
  /** The card's element: its effect plays from Gold (DESIGN.md 13). */
  element?: CardElement;
  rank: Rank;
  stats: [CardStat, CardStat];
  theme: ResolvedCard;
  boss?: boolean;
}

export interface CardView {
  el: HTMLElement;
  update(props: CardProps): void;
  /** Where a boss card shows its HP (empty on other cards). */
  hpSlot: HTMLElement;
  /** The art window, used as the stage for hit effects and tick numbers. */
  art: HTMLElement;
  /** Plays the one-time star 5 -> 6 flash (skipped with reduced motion by CSS). */
  levelUp(): void;
}

function starsHtml(rank: Rank): string {
  const on = '★'.repeat(rank.stars);
  const off = '★'.repeat(6 - rank.stars);
  return (
    `<span class="bi-stars__on" aria-hidden="true">${on}</span>` +
    `<span class="bi-stars__sheen" aria-hidden="true">${on}</span>` +
    `<span class="bi-stars__off" aria-hidden="true">${off}</span>`
  );
}

/**
 * A card. Structure is fixed; every visual comes from the theme (CSS variables and recipe
 * classes) and the rank (data attributes read by rank.css).
 */
export function createCard(initial: CardProps): CardView {
  const el = document.createElement('article');
  el.className = 'bi-card';
  el.innerHTML = `
    <span class="bi-card__rarity" aria-hidden="true"></span>
    <span class="bi-card__rankfx" aria-hidden="true"><i class="bi-mote"></i><i class="bi-mote"></i><i class="bi-mote"></i><i class="bi-mote"></i></span>
    <span class="bi-card__finish" aria-hidden="true"></span>
    <span class="bi-card__deco" aria-hidden="true"><i class="bi-gem"></i></span>
    <span class="bi-card__flourish" aria-hidden="true"></span>
    <span class="bi-amb bi-amb--finish" aria-hidden="true"><i></i><i></i><i></i></span>
    <span class="bi-amb bi-amb--border" aria-hidden="true"><i></i><i></i><i></i></span>
    <svg class="bi-card__frame" viewBox="0 0 176 248" aria-hidden="true" focusable="false"></svg>
    <header class="bi-card__head"><h3 class="bi-card__name"></h3><span class="bi-card__job"></span></header>
    <div class="bi-card__art"><svg class="bi-card__emblem" viewBox="0 0 100 100" aria-hidden="true"></svg><svg class="bi-card__item" viewBox="${ITEM_VIEWBOX}" aria-hidden="true" focusable="false"></svg></div>
    <dl class="bi-card__stats">
      <div><dt></dt><dd class="bi-num"></dd></div>
      <div><dt></dt><dd class="bi-num"></dd></div>
    </dl>
    <div class="bi-card__hp"></div>
    <footer class="bi-card__rank"><span class="bi-rank-name"></span><span class="bi-stars" role="img"></span></footer>`;

  const q = <T extends Element>(sel: string) => el.querySelector(sel) as T;
  const name = q<HTMLElement>('.bi-card__name');
  const job = q<HTMLElement>('.bi-card__job');
  const emblem = q<SVGElement>('.bi-card__emblem');
  const itemSvg = q<SVGElement>('.bi-card__item');
  const artBox = q<HTMLElement>('.bi-card__art');
  let itemMarkup: string | undefined;
  const dts = el.querySelectorAll('dt');
  const dds = el.querySelectorAll('dd');
  const rankName = q<HTMLElement>('.bi-rank-name');
  const stars = q<HTMLElement>('.bi-stars');
  const frameSvg = q<SVGElement>('.bi-card__frame');
  let frameTier = '';

  const update = (p: CardProps): void => {
    el.classList.toggle('bi-card--boss', Boolean(p.boss));
    // Bosses have no rank: no tier/stars data, so the rank layer stays off.
    if (p.boss) {
      delete el.dataset['tier'];
      delete el.dataset['stars'];
    } else {
      el.dataset['tier'] = p.rank.tier;
      el.dataset['stars'] = String(p.rank.stars);
    }
    el.dataset['job'] = p.job;
    el.setAttribute(
      'aria-label',
      p.boss
        ? `${p.name}, ${p.label}`
        : `${p.name}, ${p.label}, ${TIER_NAMES[p.rank.tier]} ${p.rank.stars} of 6 stars`,
    );
    name.textContent = p.name;
    job.textContent = p.label;
    const itemChanged = p.item !== itemMarkup;
    if (itemChanged) {
      itemMarkup = p.item;
      itemSvg.innerHTML = p.item ?? '';
      el.classList.toggle('bi-card--item', Boolean(p.item));
    }
    if (!p.item) emblem.innerHTML = EMBLEMS[p.emblem] ?? EMBLEMS['gem']!;
    p.stats.forEach((s, i) => {
      dts[i]!.textContent = s.label;
      dds[i]!.textContent = s.value;
    });
    rankName.textContent = TIER_NAMES[p.rank.tier];
    stars.setAttribute('aria-label', `${TIER_NAMES[p.rank.tier]}, ${p.rank.stars} of 6 stars`);
    stars.innerHTML = starsHtml(p.rank);
    // the tier is the frame (DESIGN.md 5); bosses have no rank and so no frame
    const tier = p.boss ? '' : p.rank.tier;
    if (tier !== frameTier) {
      frameTier = tier;
      frameSvg.innerHTML = p.boss ? '' : cardFrame(p.rank.tier);
    }
    attachElementFx(
      artBox,
      p.boss || !p.item ? null : (p.element ?? null),
      p.boss ? 0 : effectStrength(p.rank.tier),
      itemChanged,
    );
    applyCardTheme(el, p.theme);
  };

  update(initial);

  return {
    el,
    update,
    hpSlot: q<HTMLElement>('.bi-card__hp'),
    art: q<HTMLElement>('.bi-card__art'),
    levelUp() {
      el.classList.remove('is-levelup');
      void el.offsetWidth; // restart the animation
      el.classList.add('is-levelup');
      window.setTimeout(() => el.classList.remove('is-levelup'), 1200);
    },
  };
}
