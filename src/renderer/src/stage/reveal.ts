import { RARITIES, type Rarity } from '../../../data';
import { COPY } from '../copy';
import { revealSound, type RevealView } from '../pages/summonModel';
import { createCard, type CardProps } from '../ui/card';
import { fitCard } from '../ui/pixelFit';
import { reducedMotion } from './motion';
import './reveal.css';

/**
 * The summon reveal (DESIGN.md §7, A6 E): a modal over the shelf. The portal swirls, then the
 * pulls lie face down; each one glows its orb colour, upgrade-flashes to its real rarity when it
 * differs, and flips inside its frame. Click (or Space / Enter) reveals the next; Skip all
 * reveals the rest; Done closes.
 */

export interface RevealOptions {
  portalName: string;
  /** The portal's kind (`cards`, `cosmetics`): picks the colour of the card backs. */
  kind?: string;
  views: RevealView[];
  /** The card face of an item (null for items without one, e.g. cosmetics). */
  face: (itemId: string) => CardProps | null;
  /** A picture for items without a card face (a cosmetic swatch), shown above the name. */
  picture?: (itemId: string) => HTMLElement | null;
  sound?: (id: string) => void;
  onClose?: () => void;
}

export function showReveal(opts: RevealOptions): void {
  const { views } = opts;
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

  const slots = views.map((v, i) => {
    const li = document.createElement('li');
    li.className = 'rv-slot';
    // a ten-pull deals small cards, a single pull one big card; both whole pixel scales (§12)
    fitCard(li, { want: views.length > 1 ? 132 : 264 });
    li.dataset['orb'] = v.orb;
    li.dataset['rarity'] = v.rarity;
    li.style.setProperty('--i', String(i));
    const inner = document.createElement('div');
    inner.className = 'rv-slot__inner';
    const back = document.createElement('div');
    back.className = 'rv-slot__back';
    back.innerHTML = '<i class="rv-orb"></i>';
    const front = document.createElement('div');
    front.className = 'rv-slot__front';
    const props = opts.face(v.itemId);
    if (props) front.append(createCard(props).el);
    else {
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
  const flip = (i: number, quiet = false): void => {
    const li = slots[i];
    const v = views[i];
    if (!li || !v || li.classList.contains('is-open')) return;
    const open = (): void => {
      li.classList.add('is-open');
      li.setAttribute('aria-label', COPY.summon.shown(v.name, v.rarityName, v.tags.join(', ')));
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
  const advance = (): void => {
    if (next >= views.length) return;
    flip(next++);
    if (next >= views.length) window.setTimeout(finish, 500);
  };
  const skipAll = (): void => {
    const best = views
      .slice(next)
      .reduce<RevealView | null>((b, v) => (b && rank(b.rarity) >= rank(v.rarity) ? b : v), null);
    while (next < views.length) flip(next++, true);
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
      if (next < views.length) skipAll();
      else close();
    } else if ((e.key === ' ' || e.key === 'Enter') && next < views.length) {
      if (document.activeElement === skip) return;
      e.preventDefault();
      advance();
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
