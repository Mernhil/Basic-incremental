/**
 * Heirloom backdrops (DESIGN.md §5 Heirloom backdrops): each Heirloom card shows a picture of its
 * own in the art window of its kit, under the kit (the windowed kit has a transparent window) and
 * under the weapon. The Leviathan one moves: big and small fish swim across, bubbles rise, and a
 * front layer (rocks, kelp, coral) hides the fish where they pass behind it. Everything animated
 * stays inside the backdrop's 136 x 160 box and under the frame.
 *
 * `SeaSim` is the pure simulation (timings from the approved preview); `mountBackdrop` draws it
 * with DOM elements on whole art pixels, on one shared loop that only runs for cards on screen
 * while the window is visible, and not at all under reduced motion.
 */
import type { Backdrop } from '../../../game';
import { sprite } from './pixel/sprites';
import { BACKDROP, SeaSim, bubbleWobble, fishBob, type SeaBubble, type SeaFish } from './seaSim';

export { BACKDROP };

// ---- drawing ----

const FPS = 30;
interface Mounted {
  stage: HTMLElement;
  sim: SeaSim;
  fishEls: Map<SeaFish, HTMLElement>;
  bubbleEls: Map<SeaBubble, HTMLElement>;
  visible: boolean;
  seenConnected: boolean;
}
const mounted = new Map<HTMLElement, Mounted>();
let raf = 0;
let last = 0;
let observer: IntersectionObserver | null = null;

const reduced = (): boolean =>
  typeof window !== 'undefined' &&
  (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);

/** A sprite with a strip (`<name>-anim.png`, manifest `animated.frames`) is played at 8 fps by CSS (theme/base.css); frame 0 is the still. */
const STRIP_FPS = 8;

function pic(name: string, z: number): string {
  const s = sprite(name);
  if (!s) return '';
  const strip = s.animated ? sprite(`${name}-anim`) : undefined;
  if (s.animated && strip) {
    const n = s.animated.frames;
    return `<div class="bi-bd__strip" style="background-image:url(${strip.url});background-size:${n * 100}% 100%;width:${s.w}px;height:${s.h}px;z-index:${z};--bd-steps:${n};animation-duration:${n / STRIP_FPS}s"></div>`;
  }
  return `<img src="${s.url}" alt="" draggable="false" style="left:0;top:0;width:${s.w}px;height:${s.h}px;z-index:${z}">`;
}

function draw(m: Mounted): void {
  const { sim } = m;
  for (const f of sim.fish) {
    let el = m.fishEls.get(f);
    if (!el) {
      const s = sprite(f.sprite);
      if (!s) continue;
      const img = document.createElement('img');
      img.src = s.url;
      img.alt = '';
      img.draggable = false;
      el = img;
      el.className = 'bi-bd__fish';
      el.style.width = `${f.size}px`;
      el.style.top = `${f.y}px`;
      el.style.zIndex = f.big ? '1' : '2';
      m.stage.append(el);
      m.fishEls.set(f, el);
    }
    el.style.transform = `translate(${Math.round(f.x)}px,${fishBob(f, sim.t)}px)`;
  }
  for (const [f, el] of m.fishEls)
    if (!sim.fish.includes(f)) {
      el.remove();
      m.fishEls.delete(f);
    }
  for (const b of sim.bubbles) {
    let el = m.bubbleEls.get(b);
    if (!el) {
      el = document.createElement('i');
      el.className = 'bi-bd__bubble';
      el.style.width = el.style.height = `${b.size}px`;
      m.stage.append(el);
      m.bubbleEls.set(b, el);
    }
    el.style.transform = `translate(${Math.round(b.x) + bubbleWobble(b, sim.t)}px,${Math.round(b.y)}px)`;
  }
  for (const [b, el] of m.bubbleEls)
    if (!sim.bubbles.includes(b)) {
      el.remove();
      m.bubbleEls.delete(b);
    }
}

function unmount(host: HTMLElement): void {
  if (!mounted.has(host)) return;
  observer?.unobserve(host);
  mounted.delete(host);
}

function tick(now: number): void {
  raf = 0;
  if (typeof document === 'undefined' || mounted.size === 0) return;
  if (document.hidden) {
    last = 0;
    return; // resumed by the visibilitychange listener
  }
  if (now - last >= 1000 / FPS) {
    const dt = Math.min(0.25, (now - last) / 1000 || 1 / FPS);
    last = now;
    const still = reduced();
    for (const [host, m] of [...mounted]) {
      if (host.isConnected) m.seenConnected = true;
      else if (m.seenConnected) {
        unmount(host);
        continue;
      }
      if (still || !m.visible) continue;
      m.sim.step(dt);
      draw(m);
    }
  }
  if (mounted.size) raf = requestAnimationFrame(tick);
}

function ensureLoop(): void {
  if (typeof requestAnimationFrame === 'undefined' || raf) return;
  raf = requestAnimationFrame(tick);
}
if (typeof document !== 'undefined')
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) ensureLoop();
  });

/**
 * Fills `host` (the card's backdrop layer, sized to the 136 x 160 box) with the backdrop's pictures
 * and, for a moving one, starts its motion. Calling it again replaces what was there; null clears.
 */
export function mountBackdrop(host: HTMLElement, spec: Backdrop | null): void {
  unmount(host);
  host.replaceChildren();
  if (!spec) return;
  host.innerHTML = `<div class="bi-bd__stage">${pic(spec.bg, 0)}${spec.front ? pic(spec.front, 5) : ''}</div>`;
  if (!spec.motion || typeof document === 'undefined') return;
  const m: Mounted = {
    stage: host.firstElementChild as HTMLElement,
    sim: new SeaSim(),
    fishEls: new Map(),
    bubbleEls: new Map(),
    visible: typeof IntersectionObserver === 'undefined',
    seenConnected: false,
  };
  mounted.set(host, m);
  if (typeof IntersectionObserver !== 'undefined') {
    observer ??= new IntersectionObserver((entries) => {
      for (const e of entries) {
        const s = mounted.get(e.target as HTMLElement);
        if (s) s.visible = e.isIntersecting;
      }
    });
    observer.observe(host);
  }
  ensureLoop();
}
