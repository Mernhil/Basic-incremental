/**
 * Capture harness for the graphics overhaul review (design only). Mounts one piece of real game art
 * at a time, using the renderer's own art modules unchanged, so `capture.mjs` can screenshot it at
 * controlled clock times. Nothing here is shipped or imported by the game.
 */
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import '@fontsource/outfit/700.css';
import '@fontsource/outfit/800.css';

import * as data from '../../../../src/data';
import * as game from '../../../../src/game';
import * as apply from '../../../../src/renderer/src/theme/apply';
import * as card from '../../../../src/renderer/src/ui/card';
import * as items from '../../../../src/renderer/src/art/items';
import * as frame from '../../../../src/renderer/src/art/frame';
import * as gems from '../../../../src/renderer/src/art/gems';
import * as bosses from '../../../../src/renderer/src/art/bosses';
import * as evo from '../../../../src/renderer/src/art/evolutions';
import * as cos from '../../../../src/renderer/src/art/cosmetics';
import * as defs from '../../../../src/renderer/src/art/defs';
import * as effects from '../../../../src/renderer/src/theme/effects';
import * as icons from '../../../../src/renderer/src/shell/icons';
import * as cosMeta from '../../../../src/renderer/src/art/pixel/cosmetics.gen';
import * as skill from '../../../../src/renderer/src/ui/skillArt';

// Seed Math.random before any art module runs (fx.ts uses it), so captures are stable.
let seed = 12345;
Math.random = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const reseed = (s: number): void => {
  seed = s >>> 0;
};

type Any = any; // eslint-disable-line @typescript-eslint/no-explicit-any

const mods: Record<string, Any> = {};

async function load(): Promise<void> {
  Object.assign(mods, { data, game, apply, card, items, frame, gems, bosses, evo, cos, defs, effects, icons, skill });
}

let content: Any;
const stage = document.getElementById('stage')!;

function cap(html: string, pad = 0): HTMLElement {
  stage.innerHTML = '';
  const box = document.createElement('div');
  box.dataset['cap'] = '1';
  box.style.padding = `${pad}px`;
  box.innerHTML = html;
  stage.append(box);
  return box;
}

const svgWrap = (viewBox: string, w: number, h: number, inner: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="${w}" height="${h}" overflow="visible" style="display:block;overflow:visible">${inner}</svg>`;

function rng(s: number): () => number {
  let x = s >>> 0 || 1;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

function cardProps(o: {
  cardId: string;
  tier: string;
  stars: number;
  rarity: string;
  name?: string;
  item?: string | null;
  element?: string | null;
  emblem?: string;
  loadout?: Any;
}): Any {
  const { game } = mods;
  const loadout = o.loadout ?? game.emptyLoadout();
  return {
    name: o.name ?? 'Ember Squire',
    label: 'Fighting',
    job: 'fighting',
    emblem: o.emblem ?? 'blade',
    item: o.item === null ? undefined : o.item,
    element: o.element ?? undefined,
    rank: { tier: o.tier, stars: o.stars },
    stats: [
      { label: 'Power', value: '12.4K' },
      { label: 'Tick', value: '1.0s' },
    ],
    theme: game.resolveCard(content, loadout, { id: o.cardId, rank: { tier: o.tier, stars: o.stars }, rarity: o.rarity }),
  };
}

const H = {
  async init(): Promise<Record<string, string>> {
    await load();
    const { data, game, apply, defs, cos } = mods;
    content = data.loadContent();
    apply.configureCardLevels(content);
    defs.installArtDefs();
    apply.applyGlobalTheme(content, game.emptyLoadout());
    await cos.preloadNumerals();
    // in-game background colours of the starter theme (sheet backgrounds)
    const cs = getComputedStyle(document.documentElement);
    const tok = (n: string): string => cs.getPropertyValue(n).trim();
    const names = [
      '--bi-table-bg',
      '--bi-chrome-bg',
      '--bi-chrome-active-bg',
      '--bi-chrome-accent',
      '--bi-frame-bg',
      '--bi-frame-title-bg',
      '--bi-art-bg',
      '--bi-plate-bg',
      '--bi-panel-bg',
      '--bi-tip-bg',
    ];
    const out: Record<string, string> = {};
    for (const n of names) out[n] = tok(n);
    // rarity bodies and the art window, read off real cards
    for (const r of data.RARITIES) {
      const view = mods.card.createCard(cardProps({ cardId: 'ember_squire', tier: 'bronze', stars: 1, rarity: r, item: null }));
      stage.innerHTML = '';
      stage.append(view.el);
      out[`body-${r}`] = getComputedStyle(view.el).backgroundColor;
      out[`art-${r}`] = getComputedStyle(view.art).backgroundColor;
    }
    stage.innerHTML = '';
    return out;
  },

  reseed,
  clear(): void {
    stage.innerHTML = '';
  },

  /** Raw svg markup, w x h css px. */
  svg(viewBox: string, w: number, h: number, inner: string, pad = 0): void {
    cap(svgWrap(viewBox, w, h, inner), pad);
  },

  /** A boss at 1 css px per boss pixel (outer box 172 x 172, sprite 160 x 172 centred). */
  boss(art: string, level = 0, pad = 16): void {
    cap(svgWrap('-6 -8 112 112', 172, 172, mods.bosses.bossArt(art, level)), pad);
  },
  evo(id: string, pad = 8): void {
    cap(svgWrap('0 0 200 240', 100, 120, mods.evo.evolutionArt(id)), pad);
  },
  frame(tier: string, pad = 4): void {
    cap(svgWrap('-34 -50 244 316', 183, 237, mods.frame.cardFrame(tier)), pad);
  },
  medal(tier: number, pad = 2): void {
    cap(svgWrap('0 0 48 48', 48, 48, mods.gems.masteryMedal(tier)), pad);
  },
  lineIcon(name: string, size = 24): void {
    const el = mods.icons.icon(name, 'shell-icon');
    el.setAttribute('width', String(size));
    el.setAttribute('height', String(size));
    el.style.cssText = 'display:block;fill:none;stroke:#f3dc9a;stroke-width:2;stroke-linecap:round;stroke-linejoin:round';
    cap('', 4).append(el);
  },
  lineIconNames(): string[] {
    // the names the icon() helper accepts (read from the module's own table via a probe)
    const probe = ['home', 'cards', 'production', 'dungeons', 'summon', 'skills', 'wardrobe', 'achievements', 'shop', 'settings', 'wood', 'ore', 'material', 'portal', 'starlight'];
    return probe.filter((n) => {
      try {
        return mods.icons.icon(n).innerHTML.length > 0;
      } catch {
        return false;
      }
    });
  },
  centreStar(): void {
    const box = cap(mods.skill.centreStar(), 4);
    const s = box.querySelector('svg')! as SVGElement;
    s.setAttribute('width', '68');
    s.setAttribute('height', '68');
    s.style.cssText = 'display:block;fill:#f3dc9a';
  },

  /** A whole card (176 x 248 css). `equips`: [slot, id, level][] on the card's loadout. */
  card(o: Any): void {
    const { game, card } = mods;
    let loadout = game.emptyLoadout();
    for (const [slot, id, level, cardId] of o.equips ?? [])
      loadout = game.equip(content, loadout, slot, { id, level }, cardId);
    mods.apply.applyGlobalTheme(content, loadout);
    const item =
      o.item === null
        ? null
        : o.evolution
          ? mods.evo.evolutionArt(o.evolution)
          : mods.items.itemArt(o.kind ?? 'sword', o.rarity);
    const view = card.createCard(cardProps({ ...o, item, loadout }));
    stage.innerHTML = '';
    const box = document.createElement('div');
    box.dataset[o.capArt ? 'wrap' : 'cap'] = '1';
    box.style.padding = `${o.pad ?? 14}px`;
    box.style.display = 'inline-block';
    box.append(view.el);
    stage.append(box);
    if (o.capArt) {
      view.art.dataset['cap'] = '1';
      view.art.style.overflow = 'visible';
    }
    if (o.capEmblem) {
      delete box.dataset['cap'];
      (view.el.querySelector('.bi-card__emblem') as HTMLElement).dataset['cap'] = '1';
    }
    (window as Any).__view = view;
  },
  /** Freeze every CSS animation at t ms (ambient particles, holo flows, star sheen). */
  cssTime(ms: number): void {
    for (const a of document.getAnimations()) {
      a.pause();
      a.currentTime = ms;
    }
  },
  resetTheme(): void {
    mods.apply.applyGlobalTheme(content, mods.game.emptyLoadout());
  },

  /** A hit on a square stage (size css px); starter attack colours. */
  hit(effect: string, s: number, size = 160): void {
    stage.innerHTML = '';
    const st = document.createElement('div');
    st.dataset['cap'] = '1';
    st.style.cssText = `position:relative;width:${size}px;height:${size}px;overflow:visible`;
    st.innerHTML = '<svg viewBox="0 0 100 100" style="position:absolute;inset:30%;opacity:0"></svg>';
    stage.append(st);
    mods.effects.playHit(effect, st, { rng: rng(s), target: st.querySelector('svg') });
  },
  /** The starter floating tick number (text style), crit or not. */
  textTick(text: string, crit: boolean): void {
    stage.innerHTML = '';
    const st = document.createElement('div');
    st.dataset['cap'] = '1';
    st.style.cssText = 'position:relative;width:220px;height:100px';
    stage.append(st);
    mods.effects.showTick(st, text, { rng: () => 0.4, crit });
  },

  /** Runtime-drawn pixel numerals as PNG data URLs (native grid). */
  tickPng(style: string, text: string): string | null {
    return mods.cos.pixelTick(style, text)?.toDataURL() ?? null;
  },
  numPng(style: string, text: string): string | null {
    return mods.cos.pixelNumber(style, text)?.toDataURL() ?? null;
  },
  meta(): Any {
    return JSON.parse(JSON.stringify(cosMeta.COSMETIC_META));
  },
};

(window as Any).H = H;
(window as Any).__ready = true;
