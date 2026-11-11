import { RARITIES, type Rarity } from '../../../data';
import type { RevealPlan } from '../../../game';
import { COPY } from '../copy';
import { revealSound, type RevealView } from '../pages/summonModel';
import { createCard, type CardProps } from '../ui/card';
import { fitCard } from '../ui/pixelFit';
import { reducedMotion } from './motion';
import './reveal.css';

/**
 * The summon reveal show (DESIGN.md §7 Reveal; the plain version, its look is still to be picked):
 * a modal over the shelf. The portal swirls, then all the cards lie out face down at once; the
 * rare ones glow in their rarity colour (`plan.glow`) before they flip, an upgrade-flash card
 * jumps to its real colour, and each flips inside its frame. Click (or Space / Enter) reveals the
 * next in `plan.order`; the best card of a pull of several comes last with a full-screen
 * entrance first. Skip all reveals the rest at once; Done closes. Reduced motion keeps the same
 * steps with no animation.
 */

export interface RevealOptions {
  portalName: string;
  /** The portal's kind (`cards`, `cosmetics`): picks the colour of the card backs. */
  kind?: string;
  views: RevealView[];
  /** Which cards glow, which one gets the entrance and the order they flip in (default: none glow, in pull order). */
  plan?: RevealPlan;
  /** The card face of an item (null for items without one, e.g. cosmetics). */
  face: (itemId: string) => CardProps | null;
  /** A picture for items without a card face (a cosmetic swatch), shown above the name. */
  picture?: (itemId: string) => HTMLElement | null;
  sound?: (id: string) => void;
  onClose?: () => void;
}

export function showReveal(opts: RevealOptions): void {
  const { views } = opts;
  const plan: RevealPlan = opts.plan ?? {
    glow: views.map(() => null),
    best: null,
    order: views.map((_, i) => i),
  };
  const overlay = document.createElement('div');
  overlay.className = 'rv';
  if (opts.kind) overlay.dataset['kind'] = opts.kind;
  const dialog = document.createElement('section');
  dialog.className = `rv__dialog${views.length > 1 ? ' rv__dialog--ten' : ''}`;
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', COPY.summon.revealTitle(opts.portalName));
  const swirl = document.createElement('div');
  swirl.className = 'rv__swirl';
  swirl.setAttribute('aria-hidden', 'true');
  const row = document.createElement('ol');
  row.className = 'rv__row';
  const status = document.createElement('p');
  status.className = 'rv__status';
  status.setAttribute('role', 'status');
  const hint = document.createElement('p');
  hint.className = 'rv__hint';
  hint.textContent = COPY.summon.next;
  const actions = document.createElement('div');
  actions.className = 'rv__actions';
  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'button rv__skip';
  skip.textContent = COPY.summon.skipAll;
  const done = document.createElement('button');
  done.type = 'button';
  done.className = 'button rv__done';
  done.textContent = COPY.summon.done;
  done.hidden = true;
  actions.append(skip, done);
  dialog.append(swirl, row, status, hint, actions);
  overlay.append(dialog);
  document.body.append(overlay);

  // A new card that arrives at ★6 (its stars are free, DESIGN.md §5) plays the star flash once.
  const flashes: Array<(() => void) | null> = views.map(() => null);
  const slots = views.map((v, i) => {
    const li = document.createElement('li');
    li.className = 'rv-slot';
    // a ten-pull deals small cards, a single pull one big card; both whole pixel scales (§12)
    fitCard(li, { want: views.length > 1 ? 132 : 264 });
    li.dataset['orb'] = v.orb;
    li.dataset['rarity'] = v.rarity;
    // a rare card glows in its own rarity colour while it lies face down
    const glow = plan.glow[i];
    if (glow) {
      li.dataset['glow'] = glow;
      li.classList.add('is-glowing');
    }
    li.style.setProperty('--i', String(i));
    const inner = document.createElement('div');
    inner.className = 'rv-slot__inner';
    const back = document.createElement('div');
    back.className = 'rv-slot__back';
    back.innerHTML = '<i class="rv-orb"></i>';
    const front = document.createElement('div');
    front.className = 'rv-slot__front';
    const props = opts.face(v.itemId);
    if (props) {
      const card = createCard(props);
      front.append(card.el);
      if (props.rank.stars === 6 && v.tags.includes(COPY.summon.isNew)) {
        flashes[i] = () => card.levelUp();
      }
    } else {
      const plain = document.createElement('div');
      plain.className = 'rv-slot__plain';
      const pic = opts.picture?.(v.itemId);
      if (pic) {
        plain.classList.add('rv-slot__plain--pic');
        const name = document.createElement('span');
        name.textContent = v.name;
        plain.append(pic, name);
      } else plain.textContent = v.name;
      front.append(plain);
    }
    const tags = document.createElement('div');
    tags.className = 'rv-slot__tags';
    for (const t of v.tags) {
      const tag = document.createElement('span');
      tag.textContent = t;
      tags.append(tag);
    }
    inner.append(back, front);
    li.append(inner, tags);
    li.setAttribute('aria-label', COPY.summon.hidden);
    row.append(li);
    return li;
  });

  let next = 0;
  const still = reducedMotion();
  /** The full-screen entrance of the best card, while it is up. */
  let entrance: HTMLElement | null = null;
  const closeEntrance = (): void => {
    entrance?.remove();
    entrance = null;
  };
  const flip = (i: number, quiet = false): void => {
    const li = slots[i];
    const v = views[i];
    if (!li || !v || li.classList.contains('is-open')) return;
    const open = (): void => {
      li.classList.add('is-open');
      li.classList.remove('is-glowing');
      li.setAttribute('aria-label', COPY.summon.shown(v.name, v.rarityName, v.tags.join(', ')));
      const flash = flashes[i];
      if (flash && !quiet) window.setTimeout(flash, 450);
      if (!quiet) {
        status.textContent = li.getAttribute('aria-label');
        opts.sound?.(revealSound(v.rarity));
      }
    };
    if (v.upgrade && !quiet && !still) {
      // the upgrade flash: the orb jumps to its real colour, then the card flips
      li.dataset['orb'] = v.rarity;
      li.classList.add('is-upgrading');
      window.setTimeout(open, 450);
    } else {
      li.dataset['orb'] = v.rarity;
      open();
    }
  };
  const finish = (): void => {
    skip.hidden = true;
    hint.hidden = true;
    done.hidden = false;
    done.focus();
  };
  /** Flips the card at `plan.order[next]` and moves on. */
  const flipNext = (): void => {
    flip(plan.order[next++]!);
    if (next >= views.length) window.setTimeout(finish, 500);
  };
  /** The best card's entrance: it fills the screen, tinted in its rarity colour, until a click. */
  const showEntrance = (index: number): void => {
    const v = views[index]!;
    const box = document.createElement('div');
    box.className = 'rv-entrance';
    box.dataset['rarity'] = v.rarity;
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', COPY.summon.entranceLabel(v.name, v.rarityName));
    const stage = document.createElement('div');
    stage.className = 'rv-entrance__card';
    fitCard(stage, { want: 264 });
    const props = opts.face(v.itemId);
    if (props) stage.append(createCard(props).el);
    else {
      const plain = document.createElement('div');
      plain.className = 'rv-slot__plain';
      const pic = opts.picture?.(v.itemId);
      if (pic) plain.append(pic);
      const label = document.createElement('span');
      label.textContent = v.name;
      plain.append(label);
      stage.append(plain);
    }
    const name = document.createElement('p');
    name.className = 'rv-entrance__name';
    name.textContent = `${v.name} · ${v.rarityName}`;
    const go = document.createElement('p');
    go.className = 'rv-entrance__hint';
    go.textContent = COPY.summon.entranceHint;
    box.append(stage, name, go);
    box.addEventListener('click', (e) => {
      e.stopPropagation();
      closeEntrance();
      flipNext();
    });
    entrance = box;
    overlay.append(box);
    opts.sound?.(revealSound(v.rarity));
    status.textContent = box.getAttribute('aria-label');
  };
  const advance = (): void => {
    if (next >= views.length || entrance) return;
    // the best card of a pull of several gets its entrance before it flips
    if (plan.best !== null && plan.order[next] === plan.best) showEntrance(plan.best);
    else flipNext();
  };
  const skipAll = (): void => {
    closeEntrance();
    const best = views
      .slice(0)
      .filter((_, i) => !slots[i]?.classList.contains('is-open'))
      .reduce<RevealView | null>((b, v) => (b && rank(b.rarity) >= rank(v.rarity) ? b : v), null);
    while (next < views.length) flip(plan.order[next++]!, true);
    if (best) opts.sound?.(revealSound(best.rarity));
    status.textContent = views.map((v) => `${v.name} (${v.rarityName})`).join(', ');
    finish();
  };
  const close = (): void => {
    overlay.classList.add('is-leaving');
    window.setTimeout(() => overlay.remove(), 250);
    document.removeEventListener('keydown', onKey, true);
    opts.onClose?.();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (entrance) {
        // leaving the entrance reveals the best card and goes on
        closeEntrance();
        flipNext();
      } else if (next < views.length) skipAll();
      else close();
    } else if ((e.key === ' ' || e.key === 'Enter') && (next < views.length || entrance)) {
      if (document.activeElement === skip) return;
      e.preventDefault();
      if (entrance) {
        closeEntrance();
        flipNext();
      } else advance();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      (next < views.length ? skip : done).focus();
    }
  };
  document.addEventListener('keydown', onKey, true);
  row.addEventListener('click', advance);
  skip.addEventListener('click', skipAll);
  done.addEventListener('click', close);
  // the portal swirls first, then the first card can be revealed
  window.setTimeout(() => overlay.classList.add('is-ready'), still ? 0 : 700);
  queueMicrotask(() => skip.focus());
}

const rank = (r: Rarity): number => RARITIES.indexOf(r);
