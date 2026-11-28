import type { Content } from '../../../../data';
import type { ArenaEvent } from '../../../../game';
import { cardTierArt } from '../../art/items';
import { sprite } from '../../art/pixel/sprites';
import { spriteNameOf } from '../../pages/summonModel';
import { popText } from '../../stage/math';
import { hopMotion, hurtMotion } from '../../stage/cardMotion';
import { popNumber } from '../../stage/numbers';
import { replay, shake } from '../../stage/motion';
import { createSpecialAttack, hasSpecial } from '../../stage/specialAttack';
import { reducedMotion } from '../../table/motion';
import { screenDpr } from '../../ui/pixelFit';

/**
 * The arena fight's show (DESIGN.md §2 Attack animations): the fight is decided up front
 * (`ArenaFight.events`) and this plays it back on the floor with the dungeon duel's own pieces: the
 * card hop and glow of a card that strikes, the soft rim of a card that is hit, the floating damage
 * numbers, the shake, and an ultimate's special attack (the cut-in, the weapon's lunge, the hit
 * sheet) from `stage/specialAttack.ts`. Show only: it never changes the state.
 */

export interface DuelBox {
  id: string;
  el: HTMLElement;
  /** The weapon picture; it hops, takes the rim and leaves for a special attack. */
  body: HTMLElement;
  /** The glow behind the weapon, pulsed by the hop. */
  glow: HTMLElement;
}

export interface DuelShow {
  /** Plays every event up to `elapsed` seconds into the fight that has not played yet. */
  run(elapsed: number): void;
  /** Jumps past every event, unplayed (Skip). */
  skip(): void;
  /** Stops a special attack that is playing. */
  cancel(): void;
}

/** A box's centre in the host, 0..1 of its size (where a number floats up from). */
function spot(host: HTMLElement, box: HTMLElement): { x: number; y: number } | null {
  const a = host.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  if (a.width === 0 || a.height === 0) return null;
  return {
    x: (b.left + b.width / 2 - a.left) / a.width,
    y: (b.top - a.top) / a.height,
  };
}

const rel = (r: DOMRect, host: DOMRect) => ({
  x: r.left - host.left,
  y: r.top - host.top,
  w: r.width,
  h: r.height,
});

export function createDuelShow(
  host: HTMLElement,
  content: Content,
  events: readonly ArenaEvent[],
  boxes: readonly DuelBox[],
  sound?: (id: string) => void,
): DuelShow {
  const byId = new Map(boxes.map((b) => [b.id, b]));
  const special = createSpecialAttack(host);
  const pics = new Map<string, HTMLImageElement | null>();
  const picOf = (name: string): HTMLImageElement | null => {
    if (pics.has(name)) return pics.get(name) ?? null;
    const info = sprite(name);
    if (!info) return null;
    pics.set(name, null);
    const img = new Image();
    img.onload = () => pics.set(name, img);
    img.src = info.url;
    return null;
  };
  const hurt = new Map<string, Animation[]>();
  let next = 0;
  let totalSkipped = false;

  const lift = (box: DuelBox): number => Math.max(4, box.el.getBoundingClientRect().height * 0.07);

  const hop = (box: DuelBox): void => {
    if (reducedMotion()) return;
    hopMotion(box.body, box.glow, 320, lift(box));
  };

  const struck = (box: DuelBox, big: boolean): void => {
    for (const a of hurt.get(box.id) ?? []) a.cancel();
    hurt.set(box.id, hurtMotion(box.body, box.el, big, reducedMotion()));
  };

  const number = (box: DuelBox, kind: 'hurt' | 'gain', text: string, scale = 1): void => {
    const at = spot(host, box.el);
    if (at) popNumber(host, { kind, text, ...at, scale });
  };

  const burst = (e: ArenaEvent, from: DuelBox, to: DuelBox | undefined): void => {
    const card = content.cardById.get(e.card);
    const name = card ? spriteNameOf(cardTierArt(card)) : null;
    const kind = card?.item?.kind;
    const pic = name ? picOf(name) : null;
    const h = host.getBoundingClientRect();
    const targetEl = to?.el;
    const art = from.body.querySelector<SVGElement>('svg');
    if (
      !card ||
      !to ||
      !targetEl ||
      !art ||
      !pic ||
      reducedMotion() ||
      document.hidden ||
      h.width === 0 ||
      !hasSpecial(kind, card.element, card.tier)
    )
      return fallback(e, from, to);
    const dpr = screenDpr();
    // one logical pixel is a hundredth of the weapon's box (the weapon sprite is 100 wide)
    const u = Math.max(1, Math.round((from.el.getBoundingClientRect().width / 100) * dpr));
    const unit = u / dpr;
    const ok = special.play({
      kind: kind!,
      element: card.element ?? '',
      tier: card.tier,
      weapon: pic,
      card: card.name,
      skill: e.skill ?? '',
      line: '',
      foe: rel(targetEl.getBoundingClientRect(), h),
      rest: rel(art.getBoundingClientRect(), h),
      u,
      dpr,
      calm: false,
      hooks: {
        dim: (on) => {
          host.classList.toggle('is-special', on);
          from.el.classList.toggle('is-special-src', on);
        },
        card: (o) => {
          from.body.style.translate = o.dy ? `0 ${o.dy * unit}px` : '';
          from.body.style.filter = o.flash ? 'brightness(6)' : '';
          from.body.style.visibility = o.weapon ? '' : 'hidden';
        },
        foe: (o) => {
          targetEl.style.translate = o.dx || o.dy ? `${o.dx * unit}px ${o.dy * unit}px` : '';
          targetEl.style.filter = o.flash ? 'brightness(8) saturate(0)' : '';
        },
        release: (weight) => {
          shake(host, weight > 1 ? 'heavy' : true);
          struck(to, true);
          if (e.damage) number(to, 'hurt', `-${popText(e.damage)}`, 1.6);
          sound?.('hit');
        },
        done: () => undefined,
      },
    });
    if (!ok) fallback(e, from, to);
  };

  /** A burst that cannot show its special attack: the strike's hop and the blow's number. */
  function fallback(e: ArenaEvent, from: DuelBox, to: DuelBox | undefined): void {
    hop(from);
    if (!to) return;
    window.setTimeout(() => {
      struck(to, true);
      if (e.damage) number(to, 'hurt', `-${popText(e.damage)}`, 1.4);
      sound?.('hit');
    }, 140);
  }

  const play = (e: ArenaEvent): void => {
    const from = byId.get(e.card);
    if (!from) return;
    const to = e.target ? byId.get(e.target) : undefined;
    if (e.kind === 'hit') {
      hop(from);
      if (!to) return;
      window.setTimeout(() => {
        struck(to, (e.share ?? 0) > 0.1);
        if (e.damage) number(to, 'hurt', `-${popText(e.damage)}`);
        sound?.('hit');
      }, 140);
    } else if (e.kind === 'burst') {
      burst(e, from, to);
    } else if (e.kind === 'heal') {
      hop(from);
      number(from, 'gain', '+');
      sound?.('heal');
    } else {
      // a knocked-out card shakes the floor once; the box greys through its `is-down` class
      if (!reducedMotion()) shake(host, true);
      replay(from.el, 'is-falling', 500);
      sound?.('knockout');
    }
  };

  return {
    run(elapsed) {
      if (totalSkipped) return;
      while (next < events.length && events[next]!.t <= elapsed) {
        const e = events[next++]!;
        // a tab left in the background plays nothing, it only keeps its place
        if (!document.hidden) play(e);
      }
    },
    skip() {
      totalSkipped = true;
      next = events.length;
      special.cancel();
    },
    cancel() {
      special.cancel();
    },
  };
}
