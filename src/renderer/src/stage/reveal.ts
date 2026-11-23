import { COPY } from '../copy';
import { DOOR_ART, DOOR_SIZE } from '../art/summon/doors';
import { sprite } from '../art/pixel/sprites';
import {
  bestOfPull,
  doorKeyOf,
  doorPx,
  revealSound,
  revealTimeline,
  CUTIN_MS,
  FLY_MS,
  HERO_MS,
  type DoorKey,
  type RevealView,
} from '../pages/summonModel';
import { createCard, type CardProps } from '../ui/card';
import { fitCard, screenDpr } from '../ui/pixelFit';
import { reducedMotion } from './motion';
import { holdToasts } from './toast';
import { playCutIn } from './specialAttack';
import './reveal.css';

/**
 * The summon reveal (DESIGN.md §2 "The reveal is redone"; the user's pick, 2026-11-22: layout 2, the
 * three doors). A modal over the page: the pulled door opens and its best tier shows on it before
 * any card moves; ordinary cards fly through the door in about a second and line up small along the
 * bottom; a T6 or Heirloom stops everything and plays the special attack's cut-in (the slanted
 * band, the weapon large, the tier and the name; `playCutIn` in specialAttack.ts). Then the line
 * stays for a look. Skip at any moment (click, Space, Enter, Escape) shows the result at once.
 * Reduced motion shows the result straight away: the open door, the best-tier mark and the line,
 * with no flight and no cut-in. The timing is `revealTimeline` in pages/summonModel.ts. The speed
 * button's speeds do not apply here.
 */

/** What the cut-in needs to know about a card (null for an item with no special). */
export interface CutInInfo {
  kind: string;
  element: string;
  tier?: string;
  /** The sprite name of the card's weapon (`data-sprite` of its art). */
  sprite: string | null;
}

export interface RevealOptions {
  portalName: string;
  /** The gate that was pulled: picks the door that opens. */
  gateId?: string;
  /** The portal's kind (`cards`, `cosmetics`, `skins`, `heirloom`). */
  kind?: string;
  views: RevealView[];
  /** The card face of an item (null for items without one, e.g. cosmetics). */
  face: (itemId: string) => CardProps | null;
  /** A picture for items without a card face (a cosmetic swatch), shown above the name. */
  picture?: (itemId: string) => HTMLElement | null;
  /** What the cut-in plays for a T6 or Heirloom card. */
  cutin?: (itemId: string) => CutInInfo | null;
  /** "Pull again": whether it can be paid now, and what it does (the reveal closes first). */
  again?: { can: () => boolean; run: () => void };
  sound?: (id: string) => void;
  onClose?: () => void;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = cls;
  if (text !== undefined) node.textContent = text;
  return node;
}

const loadImage = (url: string): Promise<HTMLImageElement | null> =>
  new Promise((res) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => res(null);
    img.src = url;
  });

export function showReveal(opts: RevealOptions): void {
  const { views } = opts;
  const still = reducedMotion();
  const key: DoorKey = doorKeyOf(opts.gateId ?? 'card_portal');
  const art = DOOR_ART[key]!;
  const best = bestOfPull(views.map((v) => v.rarity));
  const timeline = revealTimeline(views.map((v) => v.rarity));

  const overlay = el('div', 'rv');
  if (opts.kind) overlay.dataset['kind'] = opts.kind;
  const dialog = el('section', 'rv__dialog');
  dialog.setAttribute('role', 'dialog');
  dialog.setAttribute('aria-modal', 'true');
  dialog.setAttribute('aria-label', COPY.summon.revealTitle(opts.portalName));

  // ---- the stage: the door, its best-tier mark, the cut-in ----
  const stage = el('div', 'rv__stage');
  if (best) stage.dataset['best'] = best.rarity;
  const door = el('div', 'rv__door');
  const closedImg = el('img', 'rv__door-img rv__door-img--closed');
  const openImg = el('img', 'rv__door-img rv__door-img--open');
  closedImg.src = art.closed;
  openImg.src = art.open;
  for (const img of [closedImg, openImg]) {
    img.alt = '';
    img.draggable = false;
  }
  // a solid light shape fills the doorway for two frames between the closed and the open picture
  const flash = el('i', 'rv__flash');
  door.append(closedImg, openImg, flash);
  const mark = el(
    'p',
    'rv__best',
    best ? COPY.summon.bestLabel(views[best.index]!.rarityName) : '',
  );
  mark.hidden = !best;
  const status = el('p', 'rv__status sr-only');
  status.setAttribute('role', 'status');
  const dim = el('div', 'rv__dim');
  stage.append(dim, door, mark, status);
  stage.classList.add('rv__stage--full');

  // ---- the line of small cards along the bottom ----
  const line = el('ol', 'rv__line');
  line.setAttribute('aria-label', COPY.summon.lineLabel);
  const slots: HTMLLIElement[] = [];
  const flashes: Array<(() => void) | null> = views.map(() => null);
  views.forEach((v, i) => {
    const li = el('li', 'rv-slot');
    li.dataset['rarity'] = v.rarity;
    if (best && i === best.index) li.classList.add('is-best');
    const front = el('div', 'cp-fit rv-slot__front');
    const props = opts.face(v.itemId);
    if (props) {
      const card = createCard(props);
      front.append(card.el);
      if (props.rank.stars === 6 && v.tags.includes(COPY.summon.isNew)) {
        flashes[i] = () => card.levelUp();
      }
    } else {
      const plain = el('div', 'rv-slot__plain');
      const pic = opts.picture?.(v.itemId);
      if (pic) {
        plain.classList.add('rv-slot__plain--pic');
        plain.append(pic, el('span', '', v.name));
      } else plain.textContent = v.name;
      front.append(plain);
    }
    const tags = el('div', 'rv-slot__tags');
    // only the first tag shows small under the card; all of them are in its label
    const tag = v.tags[0];
    if (tag) tags.append(el('span', '', tag));
    li.append(front, tags);
    li.setAttribute('aria-label', COPY.summon.shown(v.name, v.rarityName, v.tags.join(', ')));
    line.append(li);
    slots.push(li);
  });
  // the line's cards are 1x (132 CSS px on a 100 % screen, whole device pixels, the rule for pixel
  // art); ten of them overlap a little to fit one row, the best one on top
  const spaceLine = (): void => {
    const n = slots.length;
    const first = slots[0];
    if (n < 2 || !first) return;
    const d = screenDpr();
    const cardW = first.getBoundingClientRect().width;
    const free = line.clientWidth - n * cardW;
    const gap = Math.min(10, Math.max(-cardW * 0.62, free / (n - 1)));
    line.style.setProperty('--rv-gap', `${Math.floor(gap * d) / d}px`);
  };
  const fitLine = (): void => {
    fitCard(line, { want: 132 });
    spaceLine();
  };
  const sizeDoor = (): void => {
    const room = stage.clientHeight - line.offsetHeight - 40;
    const want = room >= DOOR_SIZE * 2 ? DOOR_SIZE * 2 : DOOR_SIZE;
    door.style.setProperty('--rv-door', `${doorPx(want, screenDpr())}px`);
  };

  // ---- the buttons ----
  const actions = el('div', 'rv__actions');
  const skip = el('button', 'px-btn rv__skip', COPY.summon.skip);
  skip.type = 'button';
  const again = el('button', 'px-btn rv__again', COPY.summon.pullAgain);
  again.type = 'button';
  again.hidden = true;
  const done = el('button', 'px-btn rv__done', COPY.summon.continue);
  done.type = 'button';
  done.hidden = true;
  actions.append(skip, again, done);
  stage.append(line, actions);
  dialog.append(stage);
  overlay.append(dialog);
  document.body.append(overlay);
  // level-up and goal toasts wait until the reveal is over
  holdToasts(true);
  fitLine();
  sizeDoor();
  const onResize = (): void => {
    fitLine();
    sizeDoor();
  };
  window.addEventListener('resize', onResize);

  // ---- the show ----
  const timers: number[] = [];
  const anims: Animation[] = [];
  let cut: { stop: () => void } | null = null;
  let over = false;
  let closed = false;

  const later = (fn: () => void, ms: number): void => {
    timers.push(window.setTimeout(fn, ms));
  };

  const finish = (): void => {
    if (over) return;
    over = true;
    for (const t of timers) window.clearTimeout(t);
    for (const a of anims) a.cancel();
    cut?.stop();
    stage.classList.remove('is-cut');
    stage.classList.add('is-open');
    mark.classList.add('is-on');
    status.textContent = views.map((v) => `${v.name} (${v.rarityName})`).join(', ');
    skip.hidden = true;
    done.hidden = false;
    if (opts.again) {
      again.hidden = false;
      again.disabled = !opts.again.can();
    }
    done.focus({ preventScroll: true });
  };

  const fly = (i: number, delay: number): void => {
    if (typeof Element.prototype.animate !== 'function') return;
    const from = door.getBoundingClientRect();
    const to = slots[i]!.getBoundingClientRect();
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height * 0.62 - (to.top + to.height / 2);
    anims.push(
      slots[i]!.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(0.5)`, opacity: 0 },
          {
            transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 36}px) scale(1.6)`,
            opacity: 1,
            offset: 0.45,
          },
          { transform: 'none', opacity: 1 },
        ],
        { duration: FLY_MS, delay, easing: 'cubic-bezier(0.2, 0.8, 0.25, 1)', fill: 'backwards' },
      ),
    );
    const flash = flashes[i];
    if (flash) later(flash, delay + FLY_MS + 150);
  };

  /** The T6 card after its cut-in: lands at the stage's centre at 2x with its tier glow, holds, then moves into its slot at 1x. */
  const hero = (i: number, delay: number): void => {
    const li = slots[i]!;
    li.classList.add('is-hero');
    if (typeof Element.prototype.animate !== 'function') return;
    const from = door.getBoundingClientRect();
    const box = stage.getBoundingClientRect();
    const to = li.getBoundingClientRect();
    const tx = to.left + to.width / 2;
    const ty = to.top + to.height / 2;
    const dx = from.left + from.width / 2 - tx;
    const dy = from.top + from.height * 0.62 - ty;
    const cx = box.left + box.width / 2 - tx;
    const cy = box.top + box.height * 0.42 - ty;
    const glow = 'drop-shadow(0 0 28px var(--rv-glow))';
    anims.push(
      li.animate(
        [
          {
            transform: `translate(${dx}px, ${dy}px) scale(0.5)`,
            opacity: 0,
            easing: 'cubic-bezier(0.2, 0.8, 0.25, 1)',
          },
          {
            transform: `translate(${cx}px, ${cy}px) scale(2)`,
            opacity: 1,
            filter: glow,
            offset: 0.22,
            easing: 'linear',
          },
          {
            transform: `translate(${cx}px, ${cy}px) scale(2)`,
            opacity: 1,
            filter: glow,
            offset: 0.72,
            easing: 'ease-in-out',
          },
          { transform: 'none', opacity: 1 },
        ],
        { duration: HERO_MS, delay, fill: 'backwards' },
      ),
    );
    const f = flashes[i];
    if (f) later(f, delay + HERO_MS + 150);
  };

  const playCut = async (i: number): Promise<void> => {
    const v = views[i]!;
    stage.classList.add('is-cut');
    opts.sound?.(revealSound(v.rarity));
    const info = opts.cutin?.(v.itemId);
    const url = info?.sprite ? sprite(info.sprite)?.url : undefined;
    const img = url ? await loadImage(url) : null;
    if (over) return;
    const played =
      info && img
        ? playCutIn(stage, {
            kind: info.kind,
            element: info.element,
            ...(info.tier ? { tier: info.tier } : {}),
            weapon: img,
            tag: info.tier === 'heirloom' ? v.rarityName : `T6 ${v.rarityName}`,
            name: v.name,
            hold: CUTIN_MS / 1000 - 0.42,
          })
        : null;
    if (played) {
      cut = played;
      void played.done.then(() => {
        if (!over) stage.classList.remove('is-cut');
      });
    } else later(() => stage.classList.remove('is-cut'), CUTIN_MS * 0.6);
  };

  if (still) {
    // reduced motion: the result at once, no flight and no cut-in
    finish();
  } else {
    // the door opens and the best tier lights on it, then the cards go through
    const OPEN_MS = 450;
    mark.classList.add('is-on');
    // the closed door holds, a two-frame flash, then a hard swap to the open picture and a small settle
    later(() => stage.classList.add('is-flash'), 150);
    later(() => {
      stage.classList.remove('is-flash');
      stage.classList.add('is-open');
      door.animate?.([{ transform: 'scale(1.03)' }, { transform: 'none' }], {
        duration: 120,
        easing: 'ease-out',
      });
    }, 234);
    for (const step of timeline.steps) {
      if (step.kind === 'fly') fly(step.index, OPEN_MS + step.at);
      else if (step.kind === 'hero') hero(step.index, OPEN_MS + step.at);
      else later(() => void playCut(step.index), OPEN_MS + step.at);
    }
    if (!best?.cutin) opts.sound?.(revealSound(best?.rarity ?? 'common'));
    later(finish, OPEN_MS + timeline.totalMs + 250);
  }

  const close = (): void => {
    if (closed) return;
    closed = true;
    holdToasts(false);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('keydown', onKey, true);
    overlay.classList.add('is-leaving');
    window.setTimeout(() => overlay.remove(), 220);
    opts.onClose?.();
  };
  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      if (over) close();
      else finish();
    } else if ((e.key === ' ' || e.key === 'Enter') && !over) {
      if (document.activeElement === skip) return;
      e.preventDefault();
      finish();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const order = [skip, again, done].filter((b) => !b.hidden && !b.disabled);
      const at = order.indexOf(document.activeElement as HTMLButtonElement);
      order[(at + 1) % Math.max(1, order.length)]?.focus({ preventScroll: true });
    }
  }
  document.addEventListener('keydown', onKey, true);
  stage.addEventListener('click', () => {
    if (!over) finish();
  });
  skip.addEventListener('click', finish);
  done.addEventListener('click', close);
  again.addEventListener('click', () => {
    if (!opts.again?.can()) return;
    close();
    opts.again.run();
  });
  queueMicrotask(() => (over ? done : skip).focus({ preventScroll: true }));
}
