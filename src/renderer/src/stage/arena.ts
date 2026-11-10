import type { Content } from '../../../data';
import {
  Decimal,
  bossStatus,
  burstView,
  collectModifiers,
  defaultRng,
  formatDuration,
  loadoutHealth,
  resolveGlobal,
  stageReadout,
  trialStatus,
  type GameState,
  bossMastery,
  bossAttackView,
} from '../../../game';
import { fmt } from '../settings/numberFormat';
import { COPY } from '../copy';
import { bossArt, sentinelLevel } from '../art/bosses';
import { floorParts, type FloorPart } from '../pages/dungeonsModel';
import { MEDAL_VIEWBOX, masteryMedal, svg } from '../art/gems';
import { medalTip } from '../pages/progressionModel';
import { barsGone, healthPercent, signatureCount } from '../pages/dungeonsModel';
import { playHit } from '../theme/effects';
import type { CardProps } from '../ui/card';
import { createLoadoutFan, type FanCard } from '../ui/loadoutFan';
import { isCrystal } from '../ui/resourceIcons';
import { createHpStack, type HpStackView } from '../ui/hpStack';
import { formatRate } from '../pages/buyModel';
import { refitCards } from '../ui/pixelFit';
import { loadoutKey, loadoutProps } from '../pages/loadoutCards';
import { attachTooltip } from '../shell/tooltip';
import { backgroundFor } from './arenaBackground';
import { flyCoins } from './fly';
import type { Director } from './director';
import { flash, jitter, onFrame, reducedMotion, replay, shake, slowDown } from './motion';
import {
  edgeStrength,
  fallBanner,
  windupProgress,
  windupSeconds,
  type ChunkSpan,
} from './bossHitModel';
import { popText } from './math';
import { popNumber } from './numbers';
import { toast } from './toast';
import './arena.css';

/**
 * The dungeon arena (DESIGN.md §6, §11; UI_RULES.md §2 "Dungeons arena layout", option "Hero fan").
 * It fills the page under the goals strip. The dungeon's background (a room drawn in CSS, picked by
 * the dungeon's `background` id) is behind everything. The party fan stands on the left with the
 * signature gauge and the party health bar under it; the boss stands right of centre with its name,
 * stacked HP bar and ×N count above it; three readout chips stack in the top-right corner.
 * Reacts to the director's show events while it is on screen. Boss hits (DESIGN.md §6): before a
 * slam the screen edges pulse harder as the game's wind-up runs, each hit drops a chunk off the
 * health bar, and a "You fall in" banner shows when the loadout would fall before the boss does.
 */

/** What the arena needs from the header: where coins land, and the pulse when they do. */
export interface CoinTarget {
  currencyGlyph(id: string): HTMLElement | null;
  pulseCurrency(id: string): void;
}

export interface ArenaContext {
  content: Content;
  state: () => GameState;
  director: Director;
  coins: CoinTarget;
  /** True while the arena is on screen. */
  active: () => boolean;
  /** Plays a named sound (stage/sound wiring); optional. */
  sound?: (id: string) => void;
}

interface Slot {
  wrap: HTMLElement;
  /** The card's props, null for an empty slot. */
  card: object | null;
}

const SUPPORTS = 3;

/** CSS px the arena keeps for the bars under the fan and the card frame's bleed. */
const FAN_RESERVE = 170;
/** Art pixels the whole fan is wide (the main card plus three peeks) and the card is tall. */
const FAN_ART = { w: 180, h: 186 } as const;

/** One part of the interim floor line as text ("Floor 3 / 10", "Enemy 2 / 4", "Boss", "best 5"). */
export function floorPartText(part: FloorPart): string {
  switch (part.kind) {
    case 'floor':
      return COPY.dungeons.floorOf(part.floor, part.floors);
    case 'depth':
      return COPY.dungeons.depthOf(part.depth);
    case 'enemy':
      return COPY.dungeons.enemyOf(part.index, part.size);
    case 'miniboss':
      return COPY.dungeons.miniBoss;
    case 'boss':
      return COPY.dungeons.bossFloor;
    case 'best':
      return COPY.dungeons.bestFloor(part.best);
  }
}

export function createArena(ctx: ArenaContext): { el: HTMLElement; update(): void } {
  const { content } = ctx;
  const play = (id: string): void => ctx.sound?.(id);

  const el = document.createElement('section');
  el.className = 'ar';
  const flashEl = div('ar__flash');

  // ---- the room: wall, bricks, two torches and the plank floor, all drawn in CSS ----
  const scene = div('ar__scene');
  scene.setAttribute('aria-hidden', 'true');
  const torch = (side: 'l' | 'r'): HTMLElement => {
    const t = div(`ar__torch ar__torch--${side}`);
    for (const part of ['glow', 'stick', 'cup', 'flame']) {
      t.append(div(`ar__torch-${part}`));
    }
    return t;
  };
  scene.append(div('ar__wall'), div('ar__bricks'), torch('l'), torch('r'), div('ar__floor'));

  // ---- the three readout chips, top-right ----
  const readouts = document.createElement('dl');
  readouts.className = 'ar__readouts';
  const readout = (label: string, tip: string): HTMLElement => {
    const box = div('ar__readout');
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.className = 'bi-num';
    box.append(dt, dd);
    box.tabIndex = 0;
    attachTooltip(box, tip);
    readouts.append(box);
    return dd;
  };
  const dpsOut = readout(COPY.arena.dps, COPY.arena.dpsTip);
  const kpmOut = readout(COPY.arena.kpm, COPY.arena.kpmTip);
  const ttkOut = readout(COPY.arena.ttk, COPY.dungeons.perKillTip);

  // ---- the boss: its name, stacked HP bar and small line above it, then the boss itself ----
  const bossBox = div('ar__boss');
  const head = div('ar__head');
  const name = document.createElement('h2');
  name.className = 'ar__name px-display';
  // the boss mastery medal beside the name (DESIGN.md §6)
  const medal = div('ar__medal');
  medal.tabIndex = 0;
  medal.setAttribute('role', 'img');
  let medalTier = -1;
  attachTooltip(medal, () => {
    const id = ctx.state().activeDungeonId;
    const info = id ? bossMastery(ctx.state(), content, id) : null;
    return info ? medalTip(info) : '';
  });
  const nameRow = div('ar__name-row');
  nameRow.append(name, medal);
  const hp: HpStackView = createHpStack();
  hp.el.classList.add('ar__hp');
  hp.el.tabIndex = 0;
  let hpTip = '';
  attachTooltip(hp.el, () => hpTip);
  const line = div('ar__line');
  const lineWhere = document.createElement('span');
  lineWhere.className = 'ar__line-where';
  const lineGone = document.createElement('span');
  lineGone.className = 'ar__line-gone';
  line.append(lineWhere, lineGone);
  const trial = div('ar__trial');
  trial.hidden = true;
  // "You fall in": only while the loadout would fall before it kills the boss
  const fall = div('ar__fall');
  fall.hidden = true;
  fall.tabIndex = 0;
  let fallNow: string | null = null;
  attachTooltip(fall, () => COPY.arena.fallTip(fallNow));
  head.append(nameRow, hp.el, trial, line, fall);

  const boss = div('ar-boss');
  const bob = div('ar-boss__bob');
  const body = div('ar-boss__body');
  const fxBox = div('ar-boss__fx');
  const shadow = div('ar-boss__shadow');
  bob.append(body);
  boss.append(shadow, bob, fxBox);
  bossBox.append(head, boss);

  // ---- the party: the fan on the left, the signature gauge and the party health under it ----
  const party = div('ar__party');
  // the party as a fan: the main card in front, the supports behind it (ui/loadoutFan.ts)
  const arenaHeight = (): number => el.clientHeight || window.innerHeight - 160;
  const fan = createLoadoutFan({
    // 2x wherever the arena has room for it: the cards matter as much as the enemy
    // (UI_RULES.md §2). `max` below steps it down to the grid size only on a window too small.
    want: () => 264,
    // the fan may take a third of the window, and no more height than the arena has to give
    max: () =>
      Math.min(
        window.innerWidth * 0.34,
        Math.max(0, arenaHeight() - FAN_RESERVE) * (FAN_ART.w / FAN_ART.h),
      ),
    popWant: 264,
    popMax: () => (window.innerHeight >= 700 ? 300 : 200),
    label: COPY.arena.partyLabel,
    popLabel: COPY.production.showCard,
    emptyLabel: COPY.table.emptySlot,
  });
  fan.el.classList.add('ar__fan');
  // the bars read the fan's card scale (one art pixel in CSS px) to line up under the main card
  const syncScale = (): void => {
    for (const v of ['--card-n', '--card-k']) {
      const value = fan.el.style.getPropertyValue(v);
      if (value && party.style.getPropertyValue(v) !== value) party.style.setProperty(v, value);
    }
  };
  new MutationObserver(syncScale).observe(fan.el, { attributes: true, attributeFilter: ['style'] });
  syncScale();
  // the arena's height decides how big the fan can stand: refit when it changes (first layout, resize)
  new ResizeObserver(() => refitCards()).observe(el);

  const meters = div('ar__meters');
  const gauge = div('ar-gauge');
  const gaugeText = div('ar-gauge__text');
  const gaugeLabel = document.createElement('span');
  gaugeLabel.textContent = COPY.dungeons.burst;
  const gaugeCount = document.createElement('b');
  gaugeCount.className = 'bi-num';
  gaugeText.append(gaugeLabel, gaugeCount);
  const gaugeTrack = div('ar-gauge__track');
  gaugeTrack.setAttribute('role', 'meter');
  gaugeTrack.setAttribute('aria-valuemin', '0');
  gaugeTrack.setAttribute('aria-valuemax', '100');
  const gaugeFill = document.createElement('i');
  gaugeTrack.append(gaugeFill);
  gauge.append(gaugeTrack, gaugeText);

  const health = div('ar__health');
  const healthText = div('ar-gauge__text');
  const healthLabel = document.createElement('span');
  healthLabel.textContent = COPY.arena.partyHealth;
  const healthPct = document.createElement('b');
  healthPct.className = 'bi-num';
  healthText.append(healthLabel, healthPct);
  const healthTrack = div('ar-bar');
  healthTrack.setAttribute('role', 'meter');
  healthTrack.setAttribute('aria-valuemin', '0');
  healthTrack.setAttribute('aria-valuemax', '100');
  const healthFill = document.createElement('i');
  healthTrack.append(healthFill);
  health.append(healthTrack, healthText);
  let healthTip = '';
  health.tabIndex = 0;
  attachTooltip(health, () => healthTip);
  meters.append(gauge, health);

  const ko = div('ar__ko');
  ko.setAttribute('role', 'status');
  ko.hidden = true;
  party.append(fan.el, meters, ko);

  // boss hits: the screen edges pulse before a slam, and flash once when it lands
  const edge = div('ar__edge');
  edge.setAttribute('aria-hidden', 'true');
  const slamFlash = div('ar__slam-flash');
  slamFlash.setAttribute('aria-hidden', 'true');

  const empty = div('ar__empty');
  empty.textContent = COPY.arena.idle;

  el.append(scene, readouts, bossBox, party, empty, flashEl, edge, slamFlash);

  let slots: Slot[] = [];
  let builtFor: string | null | undefined;
  let builtParty = '';
  let lastBars = -1;
  let lastBarIndex = -1;
  let lastFraction = 1;
  let bossArtKey = '';

  // The wind-up follows the game's attack clock: each update() takes the time to the next attack
  // from bossAttackView and the frame loop counts down from there, so the pulse stays smooth
  // between the game's steps and lines up with the hit that arrives in the report.
  let windup: { at: number; nextAttack: number; nextIsSlam: boolean; interval: number } | null =
    null;
  let edgeShown = 0;
  const setEdge = (value: number): void => {
    const v = Math.round(value * 100) / 100;
    if (v === edgeShown) return;
    edgeShown = v;
    edge.style.opacity = String(v);
  };
  onFrame((_dt, now) => {
    if (!windup || !ctx.active()) {
      setEdge(0);
      return;
    }
    const remaining = windup.nextAttack - (now - windup.at) / 1000;
    const progress = windupProgress(windup.nextIsSlam, remaining, windup.interval);
    setEdge(edgeStrength(progress, windupSeconds(windup.interval), reducedMotion()));
  });

  function buildParty(s: GameState): void {
    builtParty = loadoutKey(s);
    const mods = collectModifiers(s, content);
    const { main, supports } = s.cards.loadouts.fighting;
    const card = (id: string | null, role: 'main' | 'support'): FanCard | undefined => {
      const base = id ? loadoutProps(content, s, id, role, mods) : null;
      const def = id ? content.cardById.get(id) : undefined;
      if (!id || !base || !def) return undefined;
      // in the fan a support's effect is read in the pop-out, not on the card face
      const props: CardProps = base;
      return { id, name: def.name, effect: def.support.description, props };
    };
    const cards = [
      card(main, 'main'),
      ...supports.slice(0, SUPPORTS).map((c) => card(c, 'support')),
    ];
    fan.setCards(cards[0] ?? null, cards.slice(1));
    slots = cards.map((c, i) => ({
      wrap: i === 0 ? fan.mainEl : ((c && fan.supportSlot(c.id)) ?? div('ar-slot--none')),
      card: c ? c.props : null,
    }));
    gauge.hidden = !cards[0];
  }

  function setBossArt(s: GameState): void {
    const id = s.activeDungeonId;
    const dungeon = id ? content.dungeonById.get(id) : undefined;
    const t = id ? content.trialById.get(id) : undefined;
    let key = '';
    let markup = '';
    if (dungeon) {
      // The dungeon's boss has its drawing; normal enemies and mini-bosses show a plain labelled
      // placeholder until their art is made (DESIGN.md §6 Normal enemies).
      const enemy = bossStatus(s, content)?.enemy;
      // A boss without a drawing (a dungeon whose theme is not decided) gets the same box.
      const art = dungeon.boss.art;
      if (enemy && (enemy.kind !== 'boss' || !art)) {
        const key_ = `enemy:${enemy.kind}:${enemy.id}`;
        if (key_ === bossArtKey) return;
        bossArtKey = key_;
        body.replaceChildren(enemyPlaceholder(enemy.name, enemy.kind));
        return;
      }
      if (art) {
        key = art;
        markup = bossArt(art);
      }
    } else if (t) {
      const status = trialStatus(s, content);
      const level = sentinelLevel(Math.min(status?.score ?? 0, 1));
      key = `${t.target.art}:${level}`;
      markup = bossArt(t.target.art, level);
    }
    if (key === bossArtKey) return;
    bossArtKey = key;
    body.innerHTML = markup
      ? `<svg viewBox="-6 -8 112 112" aria-hidden="true" focusable="false">${markup}</svg>`
      : '';
  }

  /** A normal enemy or mini-boss without art: a plain box with its name. */
  function enemyPlaceholder(label: string, kind: string): HTMLElement {
    const box = div(`ar-enemy ar-enemy--${kind}`);
    const text = document.createElement('span');
    text.className = 'ar-enemy__name';
    text.textContent = label;
    box.append(text);
    return box;
  }

  function build(s: GameState): void {
    builtFor = s.activeDungeonId;
    bossArtKey = '';
    lastBars = -1;
    lastBarIndex = -1;
    const id = s.activeDungeonId;
    const dungeon = id ? content.dungeonById.get(id) : undefined;
    const t = id ? content.trialById.get(id) : undefined;
    const fighting = Boolean(dungeon ?? t);
    el.classList.toggle('ar--idle', !fighting);
    el.classList.toggle('ar--trial', Boolean(t));
    // the room behind the fight: the dungeon names it, unknown ids get the default
    scene.className = `ar__scene ${backgroundFor(dungeon?.background).cls}`;
    bossBox.hidden = !fighting;
    party.hidden = !fighting;
    readouts.hidden = !fighting;
    hp.el.hidden = !dungeon; // a special dungeon shows its time and score instead
    line.classList.toggle('ar__line--solo', !dungeon);
    empty.hidden = fighting;
    trial.hidden = !t;
    const foe = dungeon ? bossStatus(s, content)?.enemy.name : undefined;
    name.textContent = foe ?? dungeon?.boss.name ?? t?.target.name ?? COPY.arena.idleTitle;
    lineWhere.textContent = '';
    lineGone.textContent = '';
    medalTier = -1;
    el.setAttribute('aria-label', dungeon?.name ?? t?.name ?? COPY.arena.idleTitle);
    boss.setAttribute('aria-label', foe ?? dungeon?.boss.name ?? t?.target.name ?? '');
    boss.setAttribute('role', 'img');
    trial.replaceChildren();
    if (t) {
      trial.append(meterRow(COPY.dungeons.attempt, 'time'), meterRow(COPY.dungeons.score, 'score'));
    }
    setBossArt(s);
    buildParty(s);
  }

  function meterRow(label: string, kind: string): HTMLElement {
    const row = div(`ar-meter ar-meter--${kind}`);
    const l = document.createElement('span');
    l.textContent = label;
    const v = document.createElement('b');
    v.className = 'bi-num';
    const track = div('ar-meter__track');
    track.append(document.createElement('i'));
    row.append(l, v, track);
    return row;
  }

  function setMeter(kind: string, fraction: number, text: string): void {
    const row = trial.querySelector<HTMLElement>(`.ar-meter--${kind}`);
    if (!row) return;
    row.querySelector('b')!.textContent = text;
    row.querySelector<HTMLElement>('i')!.style.width =
      `${(Math.min(1, Math.max(0, fraction)) * 100).toFixed(1)}%`;
  }

  function update(): void {
    const s = ctx.state();
    el.classList.toggle('ar--calm', reducedMotion());
    if (s.activeDungeonId !== builtFor) build(s);
    else if (loadoutKey(s) !== builtParty) buildParty(s);
    const id = s.activeDungeonId;
    if (!id) return;
    const mods = collectModifiers(s, content);
    const dungeon = content.dungeonById.get(id);
    const trialDef = content.trialById.get(id);
    const r = stageReadout(s, content, mods);
    const view = dungeon ? bossAttackView(s, content, mods) : null;
    windup = view
      ? {
          at: performance.now(),
          nextAttack: view.nextAttackSeconds,
          nextIsSlam: view.nextIsSlam,
          interval: view.intervalSeconds,
        }
      : null;
    const banner = dungeon ? fallBanner(r) : null;
    fall.hidden = !banner;
    if (banner) {
      const fallText = formatDuration(banner.fallSeconds * 1000);
      const earlyText = COPY.arena.fallEarly(formatDuration(banner.earlySeconds * 1000));
      fallNow = banner.nowSeconds === null ? null : formatDuration(banner.nowSeconds * 1000);
      if (fall.dataset['text'] !== fallText + earlyText) {
        fall.dataset['text'] = fallText + earlyText;
        const b = document.createElement('b');
        b.textContent = fallText;
        fall.replaceChildren(`${COPY.arena.fallIn} `, b, `, ${earlyText}`);
      }
    }
    setText(dpsOut, fmt(r.averageDps));
    setText(kpmOut, formatRate(r.killsPerMinute));
    setText(ttkOut, r.secondsPerKill === null ? '—' : formatDuration(r.secondsPerKill * 1000));
    const mastery = bossMastery(s, content, id);
    medal.hidden = !mastery;
    if (mastery && mastery.tier !== medalTier) {
      medalTier = mastery.tier;
      medal.innerHTML = svg(masteryMedal(mastery.tier), MEDAL_VIEWBOX);
      medal.dataset['tier'] = String(mastery.tier);
      medal.setAttribute('aria-label', medalTip(mastery));
    }

    if (dungeon) {
      const status = bossStatus(s, content, mods);
      // the interim floor readout (UI_RULES §2): dungeon, difficulty, floor, what stands on it
      setText(
        lineWhere,
        [
          dungeon.name,
          ...(status
            ? [
                COPY.dungeons.difficulty[status.difficulty] ?? status.difficulty,
                ...floorParts(status).map(floorPartText),
              ]
            : []),
        ].join(' · '),
      );
      if (status) {
        // the enemy our hits are on: its name and picture follow the wave
        setText(name, status.enemy.name);
        if (boss.getAttribute('aria-label') !== status.enemy.name) {
          boss.setAttribute('aria-label', status.enemy.name);
        }
        setBossArt(s);
        const fraction = status.bars.fraction;
        hp.update(
          status.bars,
          fmt(status.hp),
          fmt(status.maxHp),
          status.hp.div(status.maxHp).toNumber(),
        );
        hpTip = COPY.arena.bossTip(fmt(status.hp), fmt(status.maxHp));
        const gone = barsGone(status.enemy.hpBars, status.bars.remaining);
        setText(lineGone, COPY.arena.barsGone(gone.gone, gone.total));
        // a hit took a piece of the bar: it comes away pale, holds, then falls off
        if (status.bars.index === lastBarIndex && fraction < lastFraction - 0.002) {
          dropChunk(hp.el, { from: lastFraction, to: fraction }, false);
        }
        lastBarIndex = status.bars.index;
        lastFraction = fraction;
        // a bar ran out: it shatters and the counter ticks down
        if (lastBars > status.bars.remaining && status.bars.remaining > 0) shatter();
        lastBars = status.bars.remaining;
      }
    } else if (trialDef) {
      setText(lineWhere, [trialDef.name, COPY.dungeons.special].join(' · '));
      const t = trialStatus(s, content);
      if (t) {
        setMeter(
          'time',
          1 - t.elapsedSeconds / t.durationSeconds,
          COPY.dungeons.timeLeft(formatDuration((t.durationSeconds - t.elapsedSeconds) * 1000)),
        );
        setMeter('score', t.score, `${Math.round(t.score * 100)}%`);
      }
      setBossArt(s);
    }

    // shared health and knockout
    const lh = loadoutHealth(s, content, mods);
    const max = Decimal.max(lh.max, 1e-9);
    const hpFraction = Math.min(1, Math.max(0, lh.current.div(max).toNumber()));
    const pct = healthPercent(hpFraction);
    healthFill.style.width = `${(hpFraction * 100).toFixed(2)}%`;
    healthTrack.dataset['level'] = hpFraction < 0.25 ? 'low' : hpFraction < 0.5 ? 'mid' : 'high';
    healthTrack.setAttribute('aria-valuenow', String(pct));
    healthTrack.setAttribute('aria-label', COPY.arena.partyHealthLabel(pct));
    setText(healthPct, `${pct}%`);
    healthTip = COPY.hp.value(fmt(lh.current), fmt(lh.max));
    const out = lh.knockoutSeconds > 0;
    party.classList.toggle('is-ko', out);
    ko.hidden = !out;
    if (out) {
      const secs = Math.ceil(lh.knockoutSeconds);
      ko.innerHTML = '';
      const big = document.createElement('b');
      big.className = 'bi-num';
      big.textContent = String(secs);
      const small = document.createElement('span');
      small.textContent = COPY.arena.knockedOut;
      ko.append(small, big);
    }

    // signature gauge under the main card: whole points of the gauge, "n / 20"
    const gv = burstView(s, content, 'fighting', mods);
    const sig = signatureCount(gv.gauge, gv.size);
    gaugeFill.style.width = `${(gv.fraction * 100).toFixed(1)}%`;
    gaugeTrack.style.setProperty('--segments', String(sig.size));
    gauge.classList.toggle('is-full', gv.fraction > 0.92);
    setText(gaugeCount, COPY.arena.signatureCount(sig.n, sig.size));
    gaugeTrack.setAttribute('aria-valuenow', String(Math.round(gv.fraction * 100)));
    gaugeTrack.setAttribute(
      'aria-label',
      `${COPY.dungeons.burst}: ${COPY.arena.signatureCount(sig.n, sig.size)}`,
    );
  }

  function shatter(): void {
    if (!ctx.active()) return;
    const track = hp.el.querySelector<HTMLElement>('.bi-hpstack__track');
    replay(hp.el.querySelector('.bi-hpstack__count'), 'is-ticking', 500);
    if (!track || reducedMotion()) return;
    const shards = div('ar-shards');
    for (let i = 0; i < 9; i++) {
      const shard = document.createElement('i');
      shard.style.setProperty('--sx', `${jitter(-60, 60).toFixed(0)}px`);
      shard.style.setProperty('--sy', `${jitter(-40, 30).toFixed(0)}px`);
      shard.style.setProperty('--sr', `${jitter(-180, 180).toFixed(0)}deg`);
      shard.style.left = `${(i / 8) * 100}%`;
      shards.append(shard);
    }
    track.append(shards);
    window.setTimeout(() => shards.remove(), 700);
  }

  // ---- show events ----
  /** A point on the boss, as 0..1 of the arena (for floating numbers); the right of centre by default. */
  const bossPoint = (xs: [number, number], ys: [number, number]): { x: number; y: number } => {
    const a = el.getBoundingClientRect();
    const b = body.getBoundingClientRect();
    if (a.width === 0 || b.width === 0) return { x: jitter(0.58, 0.72), y: jitter(0.3, 0.45) };
    return {
      x: (b.left + b.width * jitter(xs[0], xs[1]) - a.left) / a.width,
      y: (b.top + b.height * jitter(ys[0], ys[1]) - a.top) / a.height,
    };
  };
  const live = (): boolean => ctx.active() && builtFor !== null && builtFor !== undefined;

  ctx.director.on('hit', (e) => {
    if (!live()) return;
    const effect = resolveGlobal(content, ctx.state().cosmetics.loadout).attack.visual.effects
      ?.fighting;
    if (effect)
      playHit(effect, fxBox, { rng: defaultRng, target: null, intervalSeconds: e.interval });
    replay(body, 'is-hit', 220);
    replay(slots[0]?.wrap, 'is-lunging', 360);
    if (e.big) shake(el);
    const p = bossPoint([0.3, 0.7], [0.12, 0.4]);
    popNumber(el, {
      kind: e.crit ? 'crit' : 'hit',
      text: popText(e.damage),
      ...p,
      scale: e.scale * (e.crit ? 1.25 : 1),
    });
    play(e.crit ? 'crit' : 'hit');
  });

  ctx.director.on('signature', (e) => {
    if (!live()) return;
    flash(flashEl);
    shake(el, true);
    slowDown(el);
    replay(body, 'is-hit', 220);
    for (const s of slots) if (s.card) replay(s.wrap, 'is-lunging', 420);
    const p = bossPoint([0.5, 0.5], [0.02, 0.08]);
    popNumber(el, { kind: 'signature', text: popText(e.damage), ...p, scale: 2.4 });
    play('signature');
  });

  // A hit's piece of a health bar comes away pale where the fill closed over it, holds a moment
  // like a trailing segment, then falls off (DESIGN.md §6). The fill itself closes at once.
  function dropChunk(bar: HTMLElement, span: ChunkSpan, slam: boolean): void {
    const track = bar.querySelector<HTMLElement>('.bi-hpstack__track, .ar-bar');
    if (!track || span.from <= span.to) return;
    const chunk = document.createElement('i');
    chunk.className = `ar-chunk${slam ? ' ar-chunk--slam' : ''}`;
    chunk.style.setProperty('--to', (span.to * 100).toFixed(3));
    chunk.style.setProperty('--size', ((span.from - span.to) * 100).toFixed(3));
    track.append(chunk);
    for (const old of Array.from(track.querySelectorAll('.ar-chunk')).slice(0, -12)) old.remove();
    window.setTimeout(() => chunk.remove(), slam ? 1200 : 700);
  }

  ctx.director.on('bossAttack', (e) => {
    if (!live()) return;
    dropChunk(health, e.span, e.slam);
    if (e.slam && !reducedMotion()) {
      replay(slamFlash, 'is-hit', 460);
      shake(el, true);
    }
    const slot = slots[e.target];
    replay(boss, e.slam ? 'is-slamming' : 'is-attacking', 480);
    window.setTimeout(
      () => {
        // a slam hits the whole party; a light hit one card: the card goes red for a moment
        const hurt = e.slam ? slots.filter((x) => x.card) : slot?.card ? [slot] : [];
        for (const x of hurt) replay(x.wrap, 'is-hurt', 400);
        play('bossHit');
        if (!slot?.card) return;
        const a = el.getBoundingClientRect();
        const b = slot.wrap.getBoundingClientRect();
        if (a.width === 0) return;
        popNumber(el, {
          kind: 'hurt',
          text: `-${popText(e.damage)}`,
          x: (b.left + b.width / 2 - a.left) / a.width,
          y: (b.top + b.height * 0.3 - a.top) / a.height,
          scale: e.slam ? 1.9 : 1,
        });
      },
      e.slam ? 200 : 160,
    );
  });

  ctx.director.on('knockout', () => {
    if (!live()) return;
    shake(el, true);
    replay(party, 'is-knocked', 700);
    play('knockout');
  });

  ctx.director.on('kill', (e) => {
    if (!live()) return;
    replay(boss, 'is-popping', 700);
    play('kill');
    // the drops burst out low on the boss and settle on the floor in front of it
    const b = body.getBoundingClientRect();
    const from = { x: b.left + b.width / 2, y: b.top + b.height * 0.72 };
    for (const loot of e.loot) {
      const n = Math.max(1, Math.min(6, Math.round(loot.amount.toNumber())));
      // crystal pickups get a bigger moment: larger, brighter pieces and their own chime
      const crystal = isCrystal(ctx.content.resourceById.get(loot.resource));
      flyCoins({
        from,
        target: ctx.coins.currencyGlyph(loot.resource),
        count: crystal ? Math.min(n, 3) : n,
        spill: true,
        ...(crystal ? { cls: 'st-coin--crystal' } : {}),
        onLand: () => {
          ctx.coins.pulseCurrency(loot.resource);
          play(crystal ? 'crystal' : 'coin');
        },
      });
    }
    for (const item of e.rare) {
      const beam = div('ar-beam');
      boss.append(beam);
      window.setTimeout(() => beam.remove(), 1600);
      slowDown(el, 700, 0.25);
      toast(COPY.arena.rareDrop, item, 'rare');
      play('rare');
    }
  });

  return { el, update };
}

function div(cls: string): HTMLElement {
  const d = document.createElement('div');
  d.className = cls;
  return d;
}

function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}
