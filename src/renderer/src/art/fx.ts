/**
 * Element effects (DESIGN.md 13). Each effect is generated from the card's own item drawing: the
 * outline is sampled from the item's largest path, so flames run along the real edges, arcs jump
 * between real points and auras follow the real shape. Effects wrap around the item: most is drawn
 * on a canvas behind it, about a fifth on a canvas in front. They stay slow and secondary.
 *
 * Performance: one shared animation loop for every card, capped at 30 fps, running only for cards
 * on screen and with the window visible. Under reduced motion a single still frame is drawn.
 */
import type { ELEMENTS } from '../../../data';
import { INK } from './kit';
import { centroid, outward, resample, zigzag, type Pt } from './fxGeometry';

export type CardElement = (typeof ELEMENTS)[number];

const FRONT_SHARE = 0.22;
const FPS = 30;
const FIRE = ['#ff3b2e', '#ff8a1f', '#ffd23a', '#fff6c8'];
const CRACK: Record<string, string> = { earth: '#ffb347', crystal: '#9fe8ff', void: '#b47cff' };

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  t: number;
  life: number;
  front: boolean;
  a?: number;
}

interface Bolt {
  pts: Pt[];
  t: number;
  life: number;
  front: boolean;
}

class Fx {
  readonly back: HTMLCanvasElement;
  readonly front: HTMLCanvasElement;
  element: CardElement;
  strength: 1 | 2;
  visible = true;
  private outline: Pt[] = [];
  private center: Pt = { x: 0, y: 0 };
  private radius = 0;
  private stale = true;
  private sizeKey = '';
  private since = 0;
  private ps: Particle[] = [];
  private bolts: Bolt[] = [];
  private cracks: Pt[][] = [];
  private clock = 0;

  constructor(
    readonly art: HTMLElement,
    element: CardElement,
    strength: 1 | 2,
  ) {
    this.element = element;
    this.strength = strength;
    this.back = canvas('bi-fx bi-fx--back');
    this.front = canvas('bi-fx bi-fx--front');
    art.prepend(this.back);
    art.append(this.front);
  }

  invalidate(): void {
    this.stale = true;
    this.ps = [];
    this.bolts = [];
    this.cracks = [];
  }

  destroy(): void {
    this.back.remove();
    this.front.remove();
  }

  /** Samples the item outline into canvas pixels. Returns false when there is nothing to trace. */
  private measure(): boolean {
    const w = this.art.clientWidth;
    const h = this.art.clientHeight;
    const key = `${w}x${h}`;
    if (!this.stale && key === this.sizeKey && this.outline.length) return true;
    if (!w || !h) return false;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    for (const c of [this.back, this.front]) {
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
    }
    const paths = [...this.art.querySelectorAll<SVGPathElement>('.bi-card__item .bi-item path')];
    let best: SVGPathElement | null = null;
    let bestArea = 0;
    for (const p of paths) {
      const b = p.getBBox();
      const area = b.width * b.height;
      if (area > bestArea && p.getTotalLength() > 0) {
        best = p;
        bestArea = area;
      }
    }
    if (!best) return false;
    const m = best.getScreenCTM();
    const box = this.back.getBoundingClientRect();
    if (!m || !box.width) return false;
    const len = best.getTotalLength();
    const raw: Pt[] = [];
    for (let i = 0; i < 96; i++) {
      const q = best.getPointAtLength((len * i) / 96);
      raw.push({
        x: (m.a * q.x + m.c * q.y + m.e - box.left) * dpr,
        y: (m.b * q.x + m.d * q.y + m.f - box.top) * dpr,
      });
    }
    this.outline = resample(raw, 72);
    this.center = centroid(this.outline);
    this.radius = Math.max(
      ...this.outline.map((p) => Math.hypot(p.x - this.center.x, p.y - this.center.y)),
    );
    this.sizeKey = key;
    this.stale = false;
    return true;
  }

  step(dt: number): void {
    if (!this.measure()) return;
    this.clock += dt;
    this.since += dt;
    const k = this.strength;
    const s = this.radius / 60; // effects scale with how big the item is drawn
    const o = this.outline;
    const pick = (): number => Math.floor(Math.random() * o.length);
    switch (this.element) {
      case 'fire': {
        // flame tongues along the upper edges, drifting up
        const rate = 7 * k;
        while (this.since > 1 / rate) {
          this.since -= 1 / rate;
          let i = pick();
          for (let n = 0; n < 2; n++) {
            const j = pick();
            if (o[j]!.y < o[i]!.y) i = j;
          }
          const nrm = outward(o, i, this.center);
          this.ps.push({
            x: o[i]!.x,
            y: o[i]!.y,
            vx: nrm.x * 6 * s + (Math.random() - 0.5) * 6 * s,
            vy: (-16 - Math.random() * 12) * s,
            r: (3 + Math.random() * 2.4) * s * (k > 1 ? 1.25 : 1),
            t: 0,
            life: 0.9 + Math.random() * 0.6,
            front: Math.random() < FRONT_SHARE,
          });
        }
        break;
      }
      case 'storm': {
        const every = 0.8 / k;
        if (this.since > every) {
          this.since = 0;
          const i = pick();
          const offItem = Math.random() < 0.45;
          const a = o[i]!;
          let b: Pt;
          if (offItem) {
            const nrm = outward(o, i, this.center);
            b = { x: a.x + nrm.x * 22 * s, y: a.y + nrm.y * 22 * s };
          } else {
            b = o[(i + Math.floor(o.length / 3) + Math.floor(Math.random() * 8)) % o.length]!;
          }
          this.bolts.push({
            pts: zigzag(a, b, 7, 6 * s, Math.random),
            t: 0,
            life: 0.36,
            front: Math.random() < 0.3,
          });
        }
        break;
      }
      case 'light': {
        const rate = 3 * k;
        while (this.since > 1 / rate) {
          this.since -= 1 / rate;
          const i = pick();
          const nrm = outward(o, i, this.center);
          this.ps.push({
            x: o[i]!.x,
            y: o[i]!.y,
            vx: nrm.x * 10 * s,
            vy: nrm.y * 10 * s - 4 * s,
            r: 3 * s,
            t: 0,
            life: 1.1,
            front: Math.random() < FRONT_SHARE,
          });
        }
        break;
      }
      case 'nature': {
        const n = 5 * k;
        while (this.ps.length < n)
          this.ps.push({
            x: 0,
            y: 0,
            vx: 0,
            vy: 0,
            r: 4 * s,
            t: 0,
            life: 1e9,
            front: false,
            a: (this.ps.length / n) * Math.PI * 2,
          });
        break;
      }
      default: {
        // earth, crystal, void: power cracks inside the item, renewed every few seconds
        if (!this.cracks.length || this.since > 4) {
          this.since = 0;
          this.cracks = Array.from({ length: 2 + k }, () => {
            const a = o[pick()]!;
            const mid = {
              x: this.center.x + (a.x - this.center.x) * 0.15,
              y: this.center.y + (a.y - this.center.y) * 0.15,
            };
            return zigzag(a, mid, 6, 5 * s, Math.random);
          });
        }
      }
    }
    for (const p of this.ps) {
      p.t += dt / p.life;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.a !== undefined) p.a += dt * 0.6;
    }
    this.ps = this.ps.filter((p) => p.t < 1);
    for (const b of this.bolts) b.t += dt / b.life;
    this.bolts = this.bolts.filter((b) => b.t < 1);
  }

  draw(): void {
    const bc = this.back.getContext('2d');
    const fc = this.front.getContext('2d');
    if (!bc || !fc || !this.outline.length) return;
    bc.clearRect(0, 0, this.back.width, this.back.height);
    fc.clearRect(0, 0, this.front.width, this.front.height);
    const s = this.radius / 60;
    switch (this.element) {
      case 'fire':
        for (const p of this.ps) flame(p.front ? fc : bc, p, s);
        break;
      case 'storm':
        for (const b of this.bolts)
          bolt(b.front ? fc : bc, b.pts, s * (this.strength > 1 ? 1.25 : 1), 1 - b.t);
        break;
      case 'light': {
        const pulse = 0.5 + 0.5 * Math.sin(this.clock * 2.2);
        aura(bc, this.outline, this.center, 1 + 0.06 * pulse * this.strength, 0.35 + 0.3 * pulse);
        for (const p of this.ps) spark(p.front ? fc : bc, p.x, p.y, p.r * (1 - p.t), 1 - p.t);
        break;
      }
      case 'nature':
        for (const p of this.ps) {
          const a = p.a ?? 0;
          const x = this.center.x + Math.cos(a) * this.radius * 0.95;
          const y = this.center.y + Math.sin(a) * this.radius * 0.32 + Math.sin(a * 2) * 4 * s;
          leaf(Math.sin(a) > 0 ? fc : bc, x, y, p.r, a);
        }
        break;
      default: {
        const col = CRACK[this.element] ?? '#ffffff';
        const pulse = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(this.clock * 3.1));
        fc.save();
        fc.beginPath();
        this.outline.forEach((p, i) => (i ? fc.lineTo(p.x, p.y) : fc.moveTo(p.x, p.y)));
        fc.closePath();
        fc.clip();
        for (const c of this.cracks) crack(fc, c, col, pulse, s);
        fc.restore();
      }
    }
  }
}

function canvas(cls: string): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.className = cls;
  c.setAttribute('aria-hidden', 'true');
  return c;
}

/** A cel flame tongue: outlined orange body, yellow core, shrinking as it fades. */
function flame(ctx: CanvasRenderingContext2D, p: Particle, s: number): void {
  const k = 1 - p.t;
  const r = p.r * (0.4 + 0.6 * k);
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(Math.atan2(p.vy, p.vx) + Math.PI / 2);
  ctx.globalAlpha = Math.min(1, k * 1.6);
  const shape = (rr: number): void => {
    ctx.beginPath();
    ctx.moveTo(0, -rr * 2.2);
    ctx.bezierCurveTo(rr * 1.1, -rr, rr, rr * 0.9, 0, rr);
    ctx.bezierCurveTo(-rr, rr * 0.9, -rr * 1.1, -rr, 0, -rr * 2.2);
    ctx.closePath();
  };
  shape(r);
  ctx.fillStyle = FIRE[1]!;
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.4 * s;
  ctx.fill();
  ctx.stroke();
  shape(r * 0.55);
  ctx.fillStyle = FIRE[2]!;
  ctx.fill();
  ctx.restore();
}

/** A jagged cel lightning bolt: ink, cyan body, white core, with a soft glow. */
function bolt(ctx: CanvasRenderingContext2D, pts: Pt[], s: number, alpha: number): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'round';
  for (const [w, c, blur] of [
    [5.4, INK, 0],
    [3, '#3fd8ff', 10],
    [1.1, '#ffffff', 0],
  ] as const) {
    ctx.strokeStyle = c;
    ctx.lineWidth = w * s;
    ctx.shadowColor = '#3fd8ff';
    ctx.shadowBlur = blur * s;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  }
  ctx.restore();
}

/** The item's outline scaled out from its centre: an aura shell that follows the shape. */
function aura(ctx: CanvasRenderingContext2D, o: Pt[], c: Pt, scale: number, alpha: number): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = '#ffe27a';
  ctx.shadowColor = '#ffe27a';
  ctx.shadowBlur = 12;
  ctx.lineWidth = 3;
  ctx.beginPath();
  o.forEach((p, i) => {
    const x = c.x + (p.x - c.x) * scale;
    const y = c.y + (p.y - c.y) * scale;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  });
  ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

function spark(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#fff6c8';
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r * 0.3, y - r * 0.3);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x + r * 0.3, y + r * 0.3);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r * 0.3, y + r * 0.3);
  ctx.lineTo(x - r, y);
  ctx.lineTo(x - r * 0.3, y - r * 0.3);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function leaf(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, a: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a * 1.7);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 1.5, r * 0.7, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#5fd35a';
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.3;
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = '#2a7a2e';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-r * 1.2, 0);
  ctx.lineTo(r * 1.2, 0);
  ctx.stroke();
  ctx.restore();
}

function crack(
  ctx: CanvasRenderingContext2D,
  pts: Pt[],
  col: string,
  alpha: number,
  s: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.lineJoin = 'miter';
  ctx.lineCap = 'round';
  for (const [w, c, blur] of [
    [3.6, col, 10],
    [1.2, '#ffffff', 0],
  ] as const) {
    ctx.strokeStyle = c;
    ctx.shadowColor = col;
    ctx.shadowBlur = blur * s;
    ctx.lineWidth = w * s;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.stroke();
  }
  ctx.restore();
}

// ---- the shared loop ----

const live = new Map<HTMLElement, Fx>();
let raf = 0;
let last = 0;
let observer: IntersectionObserver | null = null;
const reduced = (): boolean =>
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

function tick(now: number): void {
  raf = 0;
  if (live.size === 0) return;
  if (now - last >= 1000 / FPS && !document.hidden) {
    const dt = Math.min(0.1, (now - last) / 1000 || 1 / FPS);
    last = now;
    for (const [art, fx] of live) {
      if (!art.isConnected) {
        fx.destroy();
        live.delete(art);
        observer?.unobserve(art);
        continue;
      }
      if (!fx.visible) continue;
      fx.step(dt);
      fx.draw();
    }
  }
  raf = requestAnimationFrame(tick);
}

function still(fx: Fx): void {
  // reduced motion: let the effect build up for a moment, then draw it once
  for (let i = 0; i < 40; i++) fx.step(1 / FPS);
  fx.draw();
}

/**
 * Starts, changes or stops the element effect on a card's art window. Strength 0 (below Gold) or
 * no element stops it. Call `itemChanged` when the item drawing changes so the outline is re-read.
 */
export function attachElementFx(
  art: HTMLElement,
  element: CardElement | null,
  strength: 0 | 1 | 2,
  itemChanged = false,
): void {
  const current = live.get(art);
  if (!element || strength === 0) {
    if (current) {
      current.destroy();
      live.delete(art);
      observer?.unobserve(art);
    }
    return;
  }
  if (current && current.element === element && current.strength === strength) {
    if (itemChanged) current.invalidate();
    return;
  }
  current?.destroy();
  const fx = new Fx(art, element, strength);
  live.set(art, fx);
  if (typeof IntersectionObserver !== 'undefined') {
    observer ??= new IntersectionObserver((entries) => {
      for (const e of entries) {
        const f = live.get(e.target as HTMLElement);
        if (f) f.visible = e.isIntersecting;
      }
    });
    observer.observe(art);
  }
  if (reduced()) {
    requestAnimationFrame(() => still(fx));
    return;
  }
  if (!raf) raf = requestAnimationFrame(tick);
}
