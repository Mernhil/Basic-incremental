import { reducedMotion, replay } from '../stage/motion';
import { createCard, type CardProps } from './card';
import { fitCard } from './pixelFit';
import './loadoutFan.css';

/**
 * The loadout fan (DESIGN.md §11): the main card in front and up to three support cards behind it,
 * each peeking out at the side. A click on a support pops it out in front as a full card with its
 * effect written out; a click on it, anywhere else or Escape puts it back. One component for the
 * Production stage and, next, the Dungeons fight screen.
 *
 * Clean pixels (DESIGN.md §12): every card is a whole number of device pixels per art pixel
 * (`fitCard`), the peeks are whole art pixels, and nothing is rotated or scaled in between, so the
 * art stays crisp. The pop-out is a second card drawn at its own whole scale and only fades and
 * slides; it never grows.
 */

/** One card of the fan: the card's props plus the text to read when it is popped out. */
export interface FanCard {
  id: string;
  name: string;
  /** What the card does, one sentence ("+1 harvest-burst fill per tick"). */
  effect: string;
  props: CardProps;
  /** A support that helps right now (its slot wears a small mark). */
  helps?: boolean;
}

export interface LoadoutFanOptions {
  /** CSS px wide each card wants to be; the screen scale rounds it to whole pixels. */
  want: number;
  /** Most CSS px the whole fan (main card plus the peeks) may take. */
  max?: () => number;
  /** CSS px wide a popped-out card wants to be (default: the same as `want`). */
  popWant?: number;
  /** Most CSS px a popped-out card may take. */
  popMax?: () => number;
  /** Art pixels each support peeks out (default 16) and sits lower (default 0). Both count past the card frame, which bleeds about 11 art pixels around the card. */
  peek?: number;
  drop?: number;
  /** Accessible name of the group ("Logging cards"). */
  label: string;
  /** Text of the screen-reader hint on a support ("Show card"). */
  popLabel?: string;
  /** Text shown for an empty support slot (screen readers). */
  emptyLabel?: string;
  /** Called when a card pops out or goes back (`null`). */
  onPop?: (id: string | null) => void;
}

export interface LoadoutFan {
  el: HTMLElement;
  /** The main card's slot element: always there, empty while there is no main card. */
  mainEl: HTMLElement;
  /** Draws the cards; only changed slots are rebuilt. A missing main card shows an empty slot. */
  setCards(main: FanCard | null, supports: ReadonlyArray<FanCard | undefined>): void;
  /** The main card's slot (for lunges), null while there is no main card. */
  mainSlot(): HTMLElement | null;
  /** The slot of a support by card id. */
  supportSlot(id: string): HTMLElement | undefined;
  /** Flashes the listed supports (they helped a strike). Skipped under reduced motion. */
  pulse(ids: readonly string[]): void;
  /** Pops a support out by id, or puts it back with `null`. */
  pop(id: string | null): void;
  /** The id of the popped-out card, or null. */
  popped(): string | null;
}

const MAX_SUPPORTS = 3;
const ART_W = 132;
const ART_H = 186;

const sameCard = (a: FanCard | null | undefined, b: FanCard | null | undefined): boolean =>
  a === b ||
  JSON.stringify([a?.id, a?.props, a?.effect]) === JSON.stringify([b?.id, b?.props, b?.effect]);

export function createLoadoutFan(opts: LoadoutFanOptions): LoadoutFan {
  const peek = opts.peek ?? 16;
  const drop = opts.drop ?? 0;
  const el = document.createElement('div');
  el.className = 'lf';
  el.style.setProperty('--lf-peek', String(peek));
  el.style.setProperty('--lf-drop', String(drop));
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', opts.label);
  // the whole fan is the main card plus three peeks wide; the cards get what is left
  const span = (ART_W + 3 * peek) / ART_W;
  fitCard(el, { want: opts.want, ...(opts.max ? { max: () => opts.max!() / span } : {}) });

  const mainSlotEl = document.createElement('div');
  mainSlotEl.className = 'lf-slot lf-slot--main';
  const supportEls: HTMLElement[] = [];
  for (let i = 0; i < MAX_SUPPORTS; i++) {
    const s = document.createElement('div');
    s.className = `lf-slot lf-slot--support lf-slot--s${i}`;
    supportEls.push(s);
  }
  // supports are appended behind the main card (z-index in css), main last
  el.append(...supportEls, mainSlotEl);

  const popHost = document.createElement('div');
  popHost.className = 'lf-pop';
  popHost.hidden = true;
  const popCardSlot = document.createElement('div');
  popCardSlot.className = 'lf-slot lf-slot--pop';
  const popNote = document.createElement('div');
  popNote.className = 'lf-note';
  const popName = document.createElement('b');
  const popEffect = document.createElement('span');
  popNote.append(popName, popEffect);
  popHost.append(popCardSlot, popNote);
  fitCard(popHost, {
    want: opts.popWant ?? opts.want,
    ...(opts.popMax ? { max: opts.popMax } : opts.max ? { max: () => opts.max!() / span } : {}),
  });
  el.append(popHost);

  let main: FanCard | null = null;
  let supports: Array<FanCard | undefined> = [];
  let poppedId: string | null = null;

  function fillSlot(
    slot: HTMLElement,
    card: FanCard | null | undefined,
    role: 'main' | 'support',
  ): void {
    slot.replaceChildren();
    slot.classList.toggle('lf-slot--empty', !card);
    slot.classList.toggle('lf-slot--helps', Boolean(card?.helps));
    slot.removeAttribute('role');
    slot.removeAttribute('tabindex');
    slot.removeAttribute('aria-expanded');
    slot.removeAttribute('title');
    if (!card) {
      slot.setAttribute('aria-label', opts.emptyLabel ?? '');
      if (!opts.emptyLabel) slot.setAttribute('aria-hidden', 'true');
      return;
    }
    slot.removeAttribute('aria-hidden');
    slot.append(createCard(card.props).el);
    if (role === 'support') {
      slot.setAttribute('role', 'button');
      slot.tabIndex = 0;
      slot.setAttribute('aria-expanded', String(poppedId === card.id));
      slot.setAttribute(
        'aria-label',
        `${card.name}. ${card.effect}. ${opts.popLabel ?? 'Show card'}`,
      );
      slot.title = `${card.name}: ${card.effect}`;
    } else {
      slot.removeAttribute('aria-label');
    }
  }

  function setCards(m: FanCard | null, s: ReadonlyArray<FanCard | undefined>): void {
    if (!sameCard(m, main)) {
      main = m;
      fillSlot(mainSlotEl, m, 'main');
    }
    const next = Array.from({ length: MAX_SUPPORTS }, (_, i) => s[i]);
    next.forEach((c, i) => {
      if (!sameCard(c, supports[i])) fillSlot(supportEls[i]!, c, 'support');
    });
    supports = next;
    if (poppedId && !supports.some((c) => c?.id === poppedId)) pop(null);
    else if (poppedId) pop(poppedId); // the popped card may have levelled: redraw it
  }

  function pop(id: string | null): void {
    const card = id ? supports.find((c) => c?.id === id) : undefined;
    if (!id || !card) {
      const was = poppedId;
      poppedId = null;
      popHost.hidden = true;
      popCardSlot.replaceChildren();
      supportEls.forEach((s, i) => {
        s.classList.remove('is-lifted');
        if (supports[i]) s.setAttribute('aria-expanded', 'false');
      });
      document.removeEventListener('pointerdown', onOutside, true);
      document.removeEventListener('keydown', onKey, true);
      if (was) opts.onPop?.(null);
      return;
    }
    const first = poppedId !== id;
    poppedId = id;
    popCardSlot.replaceChildren(createCard(card.props).el);
    popName.textContent = card.name;
    popEffect.textContent = card.effect;
    popHost.hidden = false;
    supportEls.forEach((s, i) => {
      const on = supports[i]?.id === id;
      s.classList.toggle('is-lifted', on);
      if (supports[i]) s.setAttribute('aria-expanded', String(on));
    });
    if (first) {
      if (!reducedMotion()) replay(popHost, 'is-opening', 260);
      document.addEventListener('pointerdown', onOutside, true);
      document.addEventListener('keydown', onKey, true);
      opts.onPop?.(id);
    }
  }

  /** A press anywhere that is not a support of this fan puts the card back (a press on the card itself too). */
  function onOutside(e: Event): void {
    const t = e.target as Node | null;
    const onSupport = supportEls.some((s) => t && s.contains(t));
    // the support slots, and anything marked data-lf-toggle (a list line for the same card),
    // toggle themselves in their own click handler
    const marked = t instanceof Element && t.closest('[data-lf-toggle]') !== null;
    if (!onSupport && !marked) pop(null);
  }
  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.stopPropagation();
      const was = supportEls.find((s) => s.classList.contains('is-lifted'));
      pop(null);
      was?.focus();
    }
  }

  supportEls.forEach((slot, i) => {
    const toggle = (): void => {
      const c = supports[i];
      if (c) pop(poppedId === c.id ? null : c.id);
    };
    slot.addEventListener('click', toggle);
    slot.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggle();
      }
    });
  });

  return {
    el,
    mainEl: mainSlotEl,
    setCards,
    mainSlot: () => (main ? mainSlotEl : null),
    supportSlot: (id) => supportEls[supports.findIndex((c) => c?.id === id)],
    pulse(ids) {
      if (reducedMotion()) return;
      for (const id of ids)
        replay(supportEls[supports.findIndex((c) => c?.id === id)], 'is-pulse', 520);
    },
    pop,
    popped: () => poppedId,
  };
}

/** Whole art pixels of the card grid, for callers that size things around the fan. */
export const FAN_CARD_ART = { w: ART_W, h: ART_H } as const;
