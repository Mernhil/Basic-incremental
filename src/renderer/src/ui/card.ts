import type { Rank, Rarity } from '../../../data';
import { TIER_LABELS, type ResolvedCard } from '../../../game';
import { cardFrame } from '../art/frame';
import type { FrameTier } from '../art/vector/frame';
import { FULL_ART_VIEWBOX, ITEM_VIEWBOX } from '../art/items';
import { attachElementFx, type CardElement } from '../art/fx';
import { effectStrength } from '../art/fxGeometry';
import { applyCardTheme } from '../theme/apply';
import { COPY } from '../copy';
import type { CardFace } from './cardFace';

/** Placeholder emblems until real card art exists. */
const EMBLEMS: Record<string, string> = {
  blade:
    '<path d="M50 8 62 60 50 70 38 60Z"/><path d="M30 64H70V71H30Z"/><path d="M45 70H55V92H45Z"/>',
  gem: '<path d="M30 16H70L90 40 50 90 10 40Z"/>',
  pick: '<path d="M12 40C30 14 70 14 88 40 70 30 30 30 12 40Z"/><path d="M46 30H54V92H46Z"/>',
  axe: '<path d="M30 20C62 8 84 26 76 52 60 44 44 42 30 50Z"/><path d="M26 20H34V92H26Z"/>',
  golem:
    '<rect x="22" y="20" width="56" height="48" rx="8"/><rect x="34" y="72" width="12" height="18" rx="3"/><rect x="54" y="72" width="12" height="18" rx="3"/>',
  rock: '<path d="M14 70 26 38 46 26 70 30 86 52 82 76 54 86 28 84Z"/>',
  tree: '<path d="M50 10 76 46H62L82 70H18L38 46H24Z"/><path d="M44 70H56V90H44Z"/>',
};

/** The tier the card's effects and rank layer follow: Wood still reads as Bronze, and Mythic and
 *  the Heirloom as Prismatic (the frame pictures themselves are each tier's own, art/frame.ts). */
const frameTierOf = (tier: Rank['tier']): FrameTier =>
  tier === 'wood' ? 'bronze' : tier === 'mythic' || tier === 'heirloom' ? 'prismatic' : tier;

const TIER_NAMES: Record<Rank['tier'], string> = TIER_LABELS;

export type { CardFace };

export interface CardProps {
  name: string;
  /** Short role or job label: the aria label, and the boss card's name plate. */
  label: string;
  job: string;
  emblem: keyof typeof EMBLEMS | string;
  /** The signature item (art/items.ts). Replaces the emblem when set. */
  item?: string;
  /** The card's element: its effect plays from Gold (DESIGN.md §12). */
  element?: CardElement;
  rank: Rank;
  /** The card's rarity: the word on the bottom plate and the colour of its progress bar. */
  rarity?: Rarity;
  /** The bottom plate. Without it (bosses, placeholders) the plate stays empty. */
  face?: CardFace;
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
    <span class="bi-card__backdrop" aria-hidden="true"></span>
    <div class="bi-card__art"><svg class="bi-card__emblem" viewBox="0 0 100 100" aria-hidden="true"></svg><svg class="bi-card__item" viewBox="${ITEM_VIEWBOX}" aria-hidden="true" focusable="false"></svg></div>
    <svg class="bi-card__frame" viewBox="0 0 176 248" aria-hidden="true" focusable="false"></svg>
    <header class="bi-card__head"><h3 class="bi-card__name"></h3><span class="bi-card__job"></span><span class="bi-stars" role="img"></span></header>
    <div class="bi-card__hp"></div>
    <footer class="bi-card__info">
      <div class="bi-info__line"><span class="bi-info__ability"></span><span class="bi-info__speed"></span></div>
      <div class="bi-info__line bi-info__line--meta"><span class="bi-info__level"></span><span class="bi-info__rarity"></span></div>
      <div class="bi-info__bar" aria-hidden="true"><i></i></div>
    </footer>`;

  const q = <T extends Element>(sel: string) => el.querySelector(sel) as T;
  const name = q<HTMLElement>('.bi-card__name');
  const job = q<HTMLElement>('.bi-card__job');
  const emblem = q<SVGElement>('.bi-card__emblem');
  const itemSvg = q<SVGElement>('.bi-card__item');
  const artBox = q<HTMLElement>('.bi-card__art');
  let itemMarkup: string | undefined;
  const ability = q<HTMLElement>('.bi-info__ability');
  const speed = q<HTMLElement>('.bi-info__speed');
  const levelText = q<HTMLElement>('.bi-info__level');
  const rarityWord = q<HTMLElement>('.bi-info__rarity');
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
      el.dataset['tier'] = frameTierOf(p.rank.tier);
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
      // a straight picture is a whole-card canvas (full art, DESIGN.md §5): the item layer covers the card
      const full = Boolean(p.item?.includes('bi-item--full'));
      el.classList.toggle('bi-card--fullart', full);
      itemSvg.setAttribute('viewBox', full ? FULL_ART_VIEWBOX : ITEM_VIEWBOX);
    }
    if (!p.item) emblem.innerHTML = EMBLEMS[p.emblem] ?? EMBLEMS['gem']!;
    // the bottom plate (DESIGN.md §5 full-art layout): ability and speed, level and rarity, bar
    const face = p.face;
    ability.textContent = face?.ability ?? '';
    speed.textContent = face?.speed ?? '';
    levelText.textContent = face?.level ? COPY.card.level(face.level.value, face.level.cap) : '';
    rarityWord.textContent = p.rarity ? COPY.card.rarity[p.rarity] : '';
    if (p.rarity) el.dataset['rarity'] = p.rarity;
    else delete el.dataset['rarity'];
    el.classList.toggle('bi-card--face', Boolean(face) && !p.boss);
    el.style.setProperty('--bi-xp', String(face ? Math.min(1, Math.max(0, face.progress)) : 0));
    stars.setAttribute('aria-label', `${TIER_NAMES[p.rank.tier]}, ${p.rank.stars} of 6 stars`);
    stars.innerHTML = starsHtml(p.rank);
    // the tier is the frame (DESIGN.md §5); bosses have no rank and so no frame
    const tier = p.boss ? '' : `${p.rank.tier}/${p.rarity === 'void' ? 'void' : 'mythic'}`;
    if (tier !== frameTier) {
      frameTier = tier;
      frameSvg.innerHTML = p.boss ? '' : cardFrame(p.rank.tier, p.rarity);
    }
    attachElementFx(
      artBox,
      p.boss || !p.item ? null : (p.element ?? null),
      p.boss ? 0 : effectStrength(frameTierOf(p.rank.tier)),
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
