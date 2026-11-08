import type { Content } from '../../../data';
import {
  Decimal,
  bossStatus,
  burstView,
  collectModifiers,
  defaultRng,
  formatDuration,
  hpBarState,
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
import { MEDAL_VIEWBOX, masteryMedal, svg } from '../art/gems';
import { medalTip } from '../pages/progressionModel';
import { playHit } from '../theme/effects';
import type { CardProps } from '../ui/card';
import { createLoadoutFan, type FanCard } from '../ui/loadoutFan';
import { isCrystal } from '../ui/resourceIcons';
import { createHpStack, type HpStackView } from '../ui/hpStack';
import { formatRate } from '../pages/buyModel';
import { loadoutKey, loadoutProps } from '../pages/loadoutCards';
import { attachTooltip } from '../shell/tooltip';
import { centreOf, flyCoins } from './fly';
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
 * The dungeon arena (DESIGN.md §11, A1 D full-bleed stage): the boss large and centred with an
 * idle bob and stacked HP bars, the fighting loadout facing it with its shared health bar, the
 * burst gauge on the main card and live readouts in the top-right corner. Reacts to the
 * director's show events while it is on screen. Boss hits (DESIGN.md §6): before a slam the
 * screen edges pulse harder as the game's wind-up runs, each hit drops a chunk off the health
 * bar, and a "You fall in" banner shows when the loadout would fall before the boss does.
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

export function createArena(ctx: ArenaContext): { el: HTMLElement; update(): void } {
  const { content } = ctx;
  const play = (id: string): void => ctx.sound?.(id);

  const el = document.createElement('section');
  el.className = 'ar';
  const flashEl = div('ar__flash');
  const top = div('ar__top');
  const where = div('ar__where');
  const name = document.createElement('h2');
  name.className = 'ar__name';
  const tags = div('ar__tags');
  // the boss mastery medal next to the name (DESIGN.md §6)
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
  where.append(nameRow, tags);
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
  // "You fall in": only while the loadout would fall before it kills the boss
  const fall = div('ar__fall');
  fall.hidden = true;
  fall.tabIndex = 0;
  let fallNow: string | null = null;
  attachTooltip(fall, () => COPY.arena.fallTip(fallNow));
  top.append(where, fall, readouts);

  // the boss
  const bossBox = div('ar__boss');
  const hp: HpStackView = createHpStack();
  hp.el.classList.add('ar__hp');
  const boss = div('ar-boss');
  const bob = div('ar-boss__bob');
  const body = div('ar-boss__body');
  const fxBox = div('ar-boss__fx');
  const shadow = div('ar-boss__shadow');
  bob.append(body);
  boss.append(shadow, bob, fxBox);
  bossBox.append(hp.el, boss);

  // the party, facing the boss
  const party = div('ar__party');
  // the party as a fan: the main card in front, the supports behind it (ui/loadoutFan.ts)
  const fan = createLoadoutFan({
    // a big fan (about 2x) when the window has the room, the grid size otherwise
    want: () => (window.innerWidth >= 1200 && window.innerHeight >= 760 ? 264 : 132),
    max: () => window.innerWidth * 0.34,
    popWant: 264,
    popMax: () => (window.innerHeight >= 700 ? 300 : 200),
    label: COPY.arena.partyLabel,
    popLabel: COPY.production.showCard,
    emptyLabel: COPY.table.emptySlot,
  });
  fan.el.classList.add('ar__fan');
  const health = div('ar__health');
  const healthLabel = document.createElement('span');
  healthLabel.className = 'ar__health-label';
  healthLabel.textContent = COPY.table.health;
  const healthBar = createHpStack();
  health.append(healthLabel, healthBar.el);
  party.append(fan.el, health);
  const gauge = div('ar-gauge');
  const gaugeFill = document.createElement('i');
  const gaugeLabel = document.createElement('span');
  gaugeLabel.textContent = COPY.dungeons.burst;
  gauge.append(gaugeLabel, gaugeFill);
  gauge.setAttribute('role', 'meter');
  gauge.setAttribute('aria-valuemin', '0');
  gauge.setAttribute('aria-valuemax', '100');

  // boss hits: the screen edges pulse before a slam, and flash once when it lands
  const edge = div('ar__edge');
  edge.setAttribute('aria-hidden', 'true');
  const slamFlash = div('ar__slam-flash');
  slamFlash.setAttribute('aria-hidden', 'true');

  const ko = div('ar__ko');
  ko.setAttribute('role', 'status');
  ko.hidden = true;

  const trial = div('ar__trial');
  trial.hidden = true;
  const empty = div('ar__empty');
  empty.textContent = COPY.arena.idle;

  el.append(top, bossBox, party, ko, trial, empty, flashEl, edge, slamFlash);

  let slots: Slot[] = [];
  let builtFor: string | null | undefined;
  let builtParty = '';
  let lastBars = -1;
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
      // in the fan a support's effect is read in the pop-out, not on the plate (as on Production)
      const props: CardProps =
        role === 'support'
          ? {
              ...base,
              stats: [
                base.stats[0],
                { label: COPY.production.supportRole, value: COPY.table.support },
              ],
            }
          : base;
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
    // the burst gauge hangs under the main card (a rebuilt main slot drops it)
    if (cards[0]) fan.mainEl.append(gauge);
    gauge.hidden = !cards[0];
  }

  function setBossArt(s: GameState): void {
    const id = s.activeDungeonId;
    const dungeon = id ? content.dungeonById.get(id) : undefined;
    const t = id ? content.trialById.get(id) : undefined;
    let key = '';
    let markup = '';
    if (dungeon) {
      key = dungeon.boss.art;
      markup = bossArt(dungeon.boss.art);
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

  function build(s: GameState): void {
    builtFor = s.activeDungeonId;
    bossArtKey = '';
    lastBars = -1;
    const id = s.activeDungeonId;
    const dungeon = id ? content.dungeonById.get(id) : undefined;
    const t = id ? content.trialById.get(id) : undefined;
    const fighting = Boolean(dungeon ?? t);
    el.classList.toggle('ar--idle', !fighting);
    el.classList.toggle('ar--trial', Boolean(t));
    bossBox.hidden = !fighting;
    party.hidden = !fighting;
    readouts.hidden = !fighting;
    hp.el.hidden = !dungeon; // a special dungeon shows its time and score instead
    empty.hidden = fighting;
    trial.hidden = !t;
    name.textContent = dungeon?.name ?? t?.name ?? COPY.arena.idleTitle;
    tags.replaceChildren();
    if (dungeon) tags.append(tag(COPY.dungeons.tier(dungeon.tier)), tag('', 'ar__kills'));
    if (t) tags.append(tag(COPY.dungeons.special));
    medalTier = -1;
    el.setAttribute('aria-label', name.textContent);
    boss.setAttribute('aria-label', dungeon?.boss.name ?? t?.target.name ?? '');
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
    if (s.activeDungeonId !== builtFor) build(s);
    else if (loadoutKey(s) !== builtParty) buildParty(s);
    const id = s.activeDungeonId;
    if (!id) return;
    const mods = collectModifiers(s, content);
    const dungeon = content.dungeonById.get(id);
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
    const kills = tags.querySelector<HTMLElement>('.ar__kills');
    if (kills) setText(kills, COPY.dungeons.kills(s.combat.kills[id] ?? 0));

    if (dungeon) {
      const status = bossStatus(s, content, mods);
      if (status) {
        hp.update(
          status.bars,
          fmt(status.hp),
          fmt(status.maxHp),
          status.hp.div(status.maxHp).toNumber(),
        );
        // a bar ran out: it shatters and the counter ticks down
        if (lastBars > status.bars.remaining && status.bars.remaining > 0) shatter();
        lastBars = status.bars.remaining;
      }
    } else {
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
    healthBar.update(
      hpBarState(lh.current, max, 1),
      fmt(lh.current),
      fmt(lh.max),
      lh.current.div(max).toNumber(),
    );
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

    // burst gauge on the main card
    const gv = burstView(s, content, 'fighting', mods);
    gaugeFill.style.width = `${(gv.fraction * 100).toFixed(1)}%`;
    gauge.classList.toggle('is-full', gv.fraction > 0.92);
    gauge.setAttribute('aria-valuenow', String(Math.round(gv.fraction * 100)));
    gauge.setAttribute('aria-label', `${COPY.dungeons.burst}: ${Math.round(gv.fraction * 100)}%`);
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
  const bossPoint = (): { x: number; y: number } => ({
    x: jitter(0.58, 0.78),
    y: jitter(0.26, 0.42),
  });
  const live = (): boolean => ctx.active() && builtFor !== null && builtFor !== undefined;

  ctx.director.on('hit', (e) => {
    if (!live()) return;
    const effect = resolveGlobal(content, ctx.state().cosmetics.loadout).attack.visual.effects
      ?.fighting;
    if (effect) playHit(effect, fxBox, { rng: defaultRng, target: null });
    replay(body, 'is-hit', 220);
    replay(slots[0]?.wrap, 'is-lunging', 360);
    if (e.big) shake(el);
    const p = bossPoint();
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
    popNumber(el, { kind: 'signature', text: popText(e.damage), x: 0.66, y: 0.3, scale: 2.4 });
    play('signature');
  });

  // A hit's piece of the health bar comes away pale where the fill closed over it, holds a moment
  // like a trailing segment, then falls off (DESIGN.md §6). The fill itself closes at once.
  function dropChunk(span: ChunkSpan, slam: boolean): void {
    const track = healthBar.el.querySelector<HTMLElement>('.bi-hpstack__track');
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
    dropChunk(e.span, e.slam);
    if (e.slam && !reducedMotion()) {
      replay(slamFlash, 'is-hit', 460);
      shake(el, true);
    }
    const slot = slots[e.target];
    replay(boss, e.slam ? 'is-slamming' : 'is-attacking', 480);
    window.setTimeout(
      () => {
        // a slam hits the whole party; a light hit one card
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
    const from = centreOf(body);
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

function tag(text: string, extra = ''): HTMLElement {
  const t = document.createElement('span');
  t.className = `ar__tag ${extra}`.trim();
  t.textContent = text;
  return t;
}

function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}
