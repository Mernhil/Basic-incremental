import { animatedSpriteHtml } from '../art/pixel/sprites';
import { jitter, reducedMotion, stageHidden } from './motion';
import './fly.css';

/**
 * Coins flying to the header counters (DESIGN.md §11): production coins fly straight up; the loot
 * shower (A5 B) spills them out with small bounces, rests a beat, then vacuums them in. The coin
 * is a copy of the header chip's own glyph, so it always matches the counter it lands on.
 */

/* Clean pixels (DESIGN.md §12): a coin never changes size in flight (a scale would break the whole
   pixel scale), it fades in at the start instead. */

/** Coins in flight at once; extra ones are skipped (the counter still rolls). */
export const MAX_FLYING = 24;

let flying = 0;
let layer: HTMLElement | null = null;

function flyLayer(): HTMLElement {
  if (!layer?.isConnected) {
    layer = document.createElement('div');
    layer.className = 'st-fly-layer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.append(layer);
  }
  return layer;
}

export interface FlyOptions {
  /** Where the coins start, in viewport pixels. */
  from: { x: number; y: number };
  /** The header glyph to land on (null when the chip is not shown). */
  target: HTMLElement | null;
  count: number;
  /** Loot shower: spill, bounce, rest, then vacuum. Otherwise a straight flight. */
  spill?: boolean;
  /** Called once when the first coin lands (pulse, sound). */
  onLand?: () => void;
  /** Extra class for a coin (a rare drop's glow). */
  cls?: string;
}

export function flyCoins(opts: FlyOptions): void {
  const { target } = opts;
  if (!target || stageHidden() || reducedMotion()) {
    if (opts.onLand) window.setTimeout(opts.onLand, reducedMotion() ? 200 : 0);
    return;
  }
  const end = target.getBoundingClientRect();
  const to = { x: end.left + end.width / 2, y: end.top + end.height / 2 };
  let landed = false;
  const land = (): void => {
    if (landed) return;
    landed = true;
    opts.onLand?.();
  };
  const n = Math.min(opts.count, MAX_FLYING - flying);
  if (n <= 0) {
    land();
    return;
  }
  for (let i = 0; i < n; i++) {
    const coin = document.createElement('span');
    coin.className = `st-coin${opts.cls ? ` ${opts.cls}` : ''}`;
    const spin = target.dataset['spin'];
    coin.innerHTML = (spin && animatedSpriteHtml(spin, 2)) || target.innerHTML;
    coin.style.left = `${opts.from.x}px`;
    coin.style.top = `${opts.from.y}px`;
    flyLayer().append(coin);
    flying++;
    const dx = to.x - opts.from.x;
    const dy = to.y - opts.from.y;
    let frames: Keyframe[];
    let duration: number;
    if (opts.spill) {
      // spill out sideways, two small bounces on the floor, rest, then vacuum to the header
      const sx = jitter(-90, 90);
      const floor = jitter(28, 52);
      frames = [
        { transform: 'translate(0, 0)', opacity: 0, offset: 0 },
        { transform: `translate(${sx * 0.5}px, ${-floor * 1.6}px)`, opacity: 1, offset: 0.12 },
        { transform: `translate(${sx * 0.85}px, ${floor}px)`, offset: 0.24 },
        { transform: `translate(${sx * 0.95}px, ${floor - 16}px)`, offset: 0.31 },
        { transform: `translate(${sx}px, ${floor}px)`, offset: 0.37 },
        { transform: `translate(${sx}px, ${floor}px)`, offset: 0.62, easing: 'ease-in' },
        { transform: `translate(${dx}px, ${dy}px)`, offset: 1 },
      ];
      duration = 1500 + i * 45;
    } else {
      const arc = jitter(-40, 40);
      frames = [
        { transform: 'translate(0, 0)', opacity: 0, offset: 0 },
        {
          transform: `translate(${dx * 0.3 + arc}px, ${dy * 0.15 - 30}px)`,
          opacity: 1,
          offset: 0.3,
        },
        { transform: `translate(${dx}px, ${dy}px)`, offset: 1 },
      ];
      duration = 700 + i * 40;
    }
    const anim = coin.animate(frames, { duration, easing: 'ease-in-out', fill: 'forwards' });
    anim.onfinish = () => {
      coin.remove();
      flying--;
      land();
    };
  }
}

/** The centre of an element in viewport pixels. */
export function centreOf(el: Element): { x: number; y: number } {
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}
