import { reducedMotion } from '../art/pixel/live';

/**
 * Drag a card between the four fighting slots with pointer events (UI_RULES Cards, Loadouts).
 * Elements carrying `data-drag-card="<id>"` are draggable; each slot carries `data-slot="<n>"`, and a
 * draggable inside a slot also tells where it comes from. The renderer only asks: `check` says
 * whether the game would take a drop (null = yes, else the game's own reason), `drop` and `refuse`
 * report the outcome. Nothing here knows a rule.
 */
export interface LoadoutDragOptions {
  /** The loadout frame: a card dropped from a slot outside it empties that slot. */
  root: HTMLElement;
  /** Null when the card would be accepted in `slot`, else the reason it would not. */
  check(cardId: string, slot: number): string | null;
  /** The card was dropped on a slot the game accepts. */
  drop(cardId: string, slot: number): void;
  /** The card was dropped on a slot the game refuses. */
  refuse(reason: string): void;
  /** A card taken out of `slot` was dropped outside the frame. */
  dropOut(cardId: string, slot: number): void;
}

const THRESHOLD = 6;
const SNAP_MS = 140;
const SCALE_VARS = [
  '--card-n',
  '--card-k',
  '--card-full',
  '--kit-side',
  '--kit-top',
  '--kit-bottom',
  '--kit-gutter',
];

export function enableLoadoutDrag(opts: LoadoutDragOptions): void {
  const { root } = opts;
  const slotEls = (): HTMLElement[] => [...root.querySelectorAll<HTMLElement>('[data-slot]')];
  const slotNumber = (el: HTMLElement): number => Number(el.dataset['slot']);

  root.addEventListener('pointerdown', (down) => {
    if (down.button !== 0 || !down.isPrimary) return;
    const source = (down.target as HTMLElement).closest<HTMLElement>('[data-drag-card]');
    if (!source || !root.contains(source)) return;
    const cardId = source.dataset['dragCard'] ?? '';
    const fromEl = source.closest<HTMLElement>('[data-slot]');
    const from = fromEl ? slotNumber(fromEl) : null;
    const startX = down.clientX;
    const startY = down.clientY;
    let ghost: HTMLElement | null = null;
    let offX = 0;
    let offY = 0;
    let over: HTMLElement | null = null;

    const verdicts = new Map<HTMLElement, string | null>();
    const place = (x: number, y: number): void => {
      if (ghost)
        ghost.style.transform = `translate(${Math.round(x - offX)}px, ${Math.round(y - offY)}px)`;
    };
    const hover = (x: number, y: number): void => {
      const under = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-slot]') ?? null;
      const next = under && root.contains(under) ? under : null;
      if (next === over) return;
      over?.classList.remove('is-drop-over');
      over = next;
      over?.classList.add('is-drop-over');
    };
    const clean = (): void => {
      for (const li of slotEls()) {
        li.classList.remove('is-drop-ok', 'is-drop-no', 'is-drop-over', 'is-drag-from');
      }
      root.classList.remove('is-dragging');
      document.removeEventListener('selectstart', noSelect);
    };
    const noSelect = (e: Event): void => e.preventDefault();

    const begin = (): void => {
      const rect = source.getBoundingClientRect();
      offX = startX - rect.left;
      offY = startY - rect.top;
      ghost = document.createElement('div');
      ghost.className = 'cp-drag-ghost';
      // the card-scale variables live on the nearest fitted list; the ghost keeps the same scale
      let host: HTMLElement | null = source;
      while (host && !host.style.getPropertyValue('--card-k')) host = host.parentElement;
      for (const name of SCALE_VARS) {
        const v = host?.style.getPropertyValue(name) ?? '';
        if (v) ghost.style.setProperty(name, v);
      }
      ghost.style.width = `${rect.width}px`;
      ghost.style.height = `${rect.height}px`;
      const copy = source.cloneNode(true) as HTMLElement;
      copy.removeAttribute('data-drag-card');
      copy.removeAttribute('data-key');
      ghost.append(copy);
      document.body.append(ghost);
      root.classList.add('is-dragging');
      document.addEventListener('selectstart', noSelect);
      for (const li of slotEls()) {
        const n = slotNumber(li);
        if (n === from) {
          li.classList.add('is-drag-from');
          continue;
        }
        const reason = opts.check(cardId, n);
        verdicts.set(li, reason);
        li.classList.add(reason === null ? 'is-drop-ok' : 'is-drop-no');
      }
    };

    const move = (e: PointerEvent): void => {
      if (!ghost) {
        if (Math.hypot(e.clientX - startX, e.clientY - startY) < THRESHOLD) return;
        begin();
      }
      place(e.clientX, e.clientY);
      hover(e.clientX, e.clientY);
    };

    const finish = (e: PointerEvent | null): void => {
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', finish);
      document.removeEventListener('pointercancel', cancel);
      document.removeEventListener('keydown', key);
      if (!ghost) return;
      // the click that follows a drag must not open the picker
      const swallow = (ev: Event): void => ev.stopPropagation();
      document.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => document.removeEventListener('click', swallow, true), 0);

      const g = ghost;
      ghost = null;
      const target = e ? over : null;
      const outside = e
        ? !root.contains(document.elementFromPoint(e.clientX, e.clientY)) &&
          !g.contains(document.elementFromPoint(e.clientX, e.clientY))
        : false;
      const land = (run: () => void): void => {
        clean();
        g.remove();
        run();
      };
      let refused: string | null = null;
      if (target && slotNumber(target) !== from) {
        const reason = verdicts.get(target) ?? null;
        if (reason === null) return land(() => opts.drop(cardId, slotNumber(target)));
        refused = reason;
      } else if (e && outside && from !== null) {
        return land(() => opts.dropOut(cardId, from));
      }
      // refused or cancelled: the card flies back to where it came from
      clean();
      const rect = source.isConnected ? source.getBoundingClientRect() : null;
      if (rect && !reducedMotion()) {
        g.style.transition = `transform ${SNAP_MS}ms ease-out`;
        g.style.transform = `translate(${Math.round(rect.left)}px, ${Math.round(rect.top)}px)`;
        setTimeout(() => g.remove(), SNAP_MS + 20);
      } else {
        g.remove();
      }
      if (refused !== null) opts.refuse(refused);
    };
    const cancel = (): void => finish(null);
    const key = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') cancel();
    };

    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', finish);
    document.addEventListener('pointercancel', cancel);
    document.addEventListener('keydown', key);
  });
}
