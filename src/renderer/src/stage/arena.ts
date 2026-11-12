import type { Content } from '../../../data';
import {
  Decimal,
  barMoment,
  bossAttackView,
  bossStatus,
  collectModifiers,
  duelEnemy,
  duelFightKey,
  duelSheet,
  emptyDuelLog,
  floorChallengeView,
  formatDuration,
  loadoutHealth,
  nextFloorChallenge,
  recordDuel,
  stageReadout,
  teamView,
  trialStatus,
  type BarLook,
  type DuelLog,
  type GameState,
  type TeamCardView,
} from '../../../game';
import { fmt } from '../settings/numberFormat';
import { COPY } from '../copy';
import { bossArt, sentinelLevel } from '../art/bosses';
import { FOE_H, FOE_W, foeHtml, hasFoeSprite } from '../art/foes';
import { pixelNumberMarkup } from '../art/cosmetics';
import { barsGone, challengeButton, challengeVerdict, healthPercent } from '../pages/dungeonsModel';
import { loadoutKey, loadoutProps } from '../pages/loadoutCards';
import { formatRate } from '../pages/buyModel';
import { attachTooltip } from '../shell/tooltip';
import { dealTokens, reducedMotion as calm } from '../table/motion';
import { createCard } from '../ui/card';
import { createHpStack, type HpStackView } from '../ui/hpStack';
import { fitCard, screenDpr } from '../ui/pixelFit';
import { isCrystal } from '../ui/resourceIcons';
import { DUEL_COPY } from '../views/dungeon/copy';
import {
  HOP_ART_PX,
  clock,
  deckBacks,
  duelDoing,
  enemyDamage,
  enemyMoment,
  feedLines,
  floorPips,
  handCardWant,
  handSize,
  handSlot,
  hopMs,
  numberStyle,
  pipKind,
  queuePlates,
  sheetRows,
  showPlates,
  slotColour,
  type Plate,
} from '../views/dungeon/duelModel';
import { backgroundFor } from './arenaBackground';
import { edgeStrength, fallBanner, windupProgress, windupSeconds } from './bossHitModel';
import type { Director } from './director';
import { flyCoins } from './fly';
import { onFrame, replay, shake } from './motion';
import { popText } from './math';
import { popNumber } from './numbers';
import { toast } from './toast';
import './arena.css';

/**
 * The card duel (DESIGN.md §6 What the duel shows; UI_RULES.md §2 The duel's layout, Duel motion,
 * The duel in detail). First person: the team's hand of four cards fanned along the bottom, one
 * enemy at a time as a card ahead with the face-down deck of the wave to its right, the damage
 * tag and hit feed on the enemy's top left, the stat sheet on the right and the skill plates
 * sliding in beside the enemy. One element: the table's dungeon window and the dungeon full view
 * move it between them, so the fight never restarts. Show only: it reads the state and the
 * director's reports and never changes the game.
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
  /** True while the duel is on screen. */
  active: () => boolean;
  sound?: (id: string) => void;
  /** Starts the next Challenge (DESIGN.md §6 Farming and Challenge). */
  challenge?: () => void;
  /** Turns the dungeon's auto-challenge switch. */
  toggleAuto?: () => void;
}

export interface Arena {
  el: HTMLElement;
  update(): void;
  /** Re-reads the duel's size (after it moved between the window and the view). */
  refit(): void;
}

interface HandSlot {
  cardId: string;
  slot: number;
  el: HTMLElement;
  body: HTMLElement;
  glow: HTMLElement;
  grey: HTMLElement;
  hpFill: HTMLElement;
  hpTrack: HTMLElement;
  tag: HTMLElement;
  out: boolean;
  fraction: number;
  tip: string;
  hopMs: number;
}

const div = (cls: string): HTMLElement => {
  const d = document.createElement('div');
  d.className = cls;
  return d;
};
const span = (cls: string, text = ''): HTMLElement => {
  const s = document.createElement('span');
  s.className = cls;
  s.textContent = text;
  return s;
};
const setText = (node: HTMLElement, text: string): void => {
  if (node.textContent !== text) node.textContent = text;
};

export function createArena(ctx: ArenaContext): Arena {
  const { content } = ctx;
  const play = (id: string): void => ctx.sound?.(id);

  const el = document.createElement('section');
  el.className = 'ar du';
  el.setAttribute('aria-label', COPY.arena.idleTitle);

  // ---- the room behind the fight (the dungeon's background, CSS until art exists) ----
  const scene = div('ar__scene');
  scene.setAttribute('aria-hidden', 'true');
  const torch = (side: 'l' | 'r'): HTMLElement => {
    const t = div(`ar__torch ar__torch--${side}`);
    for (const part of ['glow', 'stick', 'cup', 'flame']) t.append(div(`ar__torch-${part}`));
    return t;
  };
  scene.append(div('ar__wall'), div('ar__bricks'), torch('l'), torch('r'), div('ar__floor'));

  // ---- top: the plate and the floor's pips ----
  const top = div('du-top');
  const plate = div('du-plate px-panel');
  const plateText = span('du-plate__text');
  plate.append(plateText);
  const pips = div('du-pips');
  pips.setAttribute('role', 'img');
  top.append(plate, pips);
  const verdict = div('du-verdict px-panel');
  verdict.setAttribute('role', 'status');
  verdict.hidden = true;
  let verdictTimer = 0;

  // ---- left column: what the team is doing, the readouts, the fall pill, the controls ----
  const left = div('du-left');
  const readout = (cls: string, tip?: string): HTMLElement => {
    const r = div(`du-read px-panel ${cls}`);
    if (tip) {
      r.tabIndex = 0;
      attachTooltip(r, tip);
    }
    left.append(r);
    return r;
  };
  const doingEl = readout('du-read--doing');
  const fpmEl = readout('du-read--fpm', COPY.arena.kpmTip);
  const dpsEl = readout('du-read--dps', COPY.arena.dpsTip);
  const teamEl = readout('du-read--team');
  let teamTip = '';
  teamEl.tabIndex = 0;
  attachTooltip(teamEl, () => teamTip);
  const fall = div('ar__fall');
  fall.hidden = true;
  fall.tabIndex = 0;
  let fallNow: string | null = null;
  attachTooltip(fall, () => COPY.arena.fallTip(fallNow));
  const ctrl = div('du-ctrl');
  const chalBtn = document.createElement('button');
  chalBtn.type = 'button';
  chalBtn.className = 'px-btn px-btn--gold du-ctrl__btn';
  chalBtn.dataset['key'] = 'arena-challenge';
  chalBtn.addEventListener('click', () => ctx.challenge?.());
  attachTooltip(chalBtn, () => {
    const id = ctx.state().activeDungeonId;
    const next = id ? nextFloorChallenge(ctx.state(), content, id) : null;
    return next ? COPY.dungeons.challengeTip(next.durationSeconds) : COPY.dungeons.lastFloorTip;
  });
  const autoBtn = document.createElement('button');
  autoBtn.type = 'button';
  autoBtn.className = 'px-btn px-btn--dark du-ctrl__btn';
  autoBtn.dataset['key'] = 'arena-auto';
  autoBtn.addEventListener('click', () => ctx.toggleAuto?.());
  attachTooltip(autoBtn, () => COPY.dungeons.autoTip);
  const chalMeter = div('du-timer');
  const chalFill = document.createElement('i');
  chalMeter.append(chalFill);
  chalMeter.setAttribute('aria-hidden', 'true');
  ctrl.append(chalBtn, autoBtn);
  left.append(fall, chalMeter, ctrl);

  // ---- the enemy ahead: the card, its tag and feed, the plates beside it, the deck ----
  const foeZone = div('du-zone');
  const foe = document.createElement('article');
  foe.className = 'du-foe';
  foe.setAttribute('aria-label', DUEL_COPY.enemy);
  const foeTag = div('du-tag du-tag--foe');
  const foeTagText = span('sr-only');
  const foeTagPx = span('du-tag__px');
  foeTagPx.setAttribute('aria-hidden', 'true');
  foeTag.append(foeTagText, foeTagPx);
  const foeHead = document.createElement('header');
  foeHead.className = 'du-foe__head';
  const foeName = document.createElement('h2');
  foeName.className = 'du-foe__name';
  const foeKind = span('du-foe__kind');
  foeHead.append(foeName, foeKind);
  const foeArt = div('du-foe__art');
  const foeBody = div('du-foe__body');
  const foeFx = div('du-foe__fx');
  foeArt.append(foeBody, foeFx);
  const hp: HpStackView = createHpStack();
  hp.el.classList.add('du-foe__hp');
  hp.el.tabIndex = 0;
  let hpTip = '';
  attachTooltip(hp.el, () => hpTip);
  const trial = div('du-foe__trial');
  trial.hidden = true;
  foe.append(foeHead, foeArt, hp.el, trial);
  const feed = document.createElement('ol');
  feed.className = 'du-feed';
  feed.setAttribute('aria-label', DUEL_COPY.feed);
  const plates = div('du-plates');
  plates.setAttribute('aria-live', 'polite');
  const deck = div('du-deck');
  const deckStack = div('du-deck__stack');
  const deckLabel = span('du-deck__label');
  deck.append(deckStack, deckLabel);
  // the damage: the hit feed, then the tag on the enemy card's top left corner
  const damage = div('du-damage');
  damage.append(feed, foeTag);
  foeZone.append(plates, foe, damage, deck);

  // ---- right: the stat sheet ----
  const sheet = document.createElement('section');
  sheet.className = 'du-sheet px-panel';
  const sheetTitle = document.createElement('h3');
  sheetTitle.className = 'du-sheet__title';
  sheetTitle.textContent = DUEL_COPY.sheet;
  const sheetRowsEl = document.createElement('ul');
  sheetRowsEl.className = 'du-sheet__rows';
  const sheetFoot = document.createElement('dl');
  sheetFoot.className = 'du-sheet__foot';
  const footRow = (label: string): HTMLElement => {
    const dt = document.createElement('dt');
    dt.textContent = label;
    const dd = document.createElement('dd');
    dd.className = 'du-sheet__num';
    sheetFoot.append(dt, dd);
    return dd;
  };
  const totalEl = footRow(DUEL_COPY.sheetTotal);
  const perSecEl = footRow(DUEL_COPY.sheetPerSecond);
  const bestEl = footRow(DUEL_COPY.sheetBest);
  sheet.append(sheetTitle, sheetRowsEl, sheetFoot);

  // ---- the hand ----
  const hand = div('du-hand');
  hand.setAttribute('role', 'list');
  hand.setAttribute('aria-label', DUEL_COPY.hand);
  const ko = div('du-ko');
  ko.setAttribute('role', 'status');
  ko.hidden = true;

  // the wind-up before a slam, a slam's flash, the screen flash
  const edge = div('ar__edge');
  edge.setAttribute('aria-hidden', 'true');
  const slamFlash = div('ar__slam-flash');
  slamFlash.setAttribute('aria-hidden', 'true');
  const empty = div('du-empty px-panel');
  empty.textContent = COPY.arena.idle;

  el.append(scene, top, verdict, left, foeZone, sheet, hand, ko, empty, edge, slamFlash);

  // ---- sizes: the hand's whole scale follows the duel's height ----
  const fitHand = (): void => {
    const h = el.clientHeight || 480;
    const { want, max } = handCardWant(h);
    fitCard(hand, { want, max: () => max });
  };
  fitHand();
  new ResizeObserver(() => fitHand()).observe(el);

  // ---- numbers: the game's pixel numerals at whole device pixels ----
  let numStyle = '';
  const readStyle = (): string => {
    const worn = getComputedStyle(document.documentElement).getPropertyValue('--bi-num-px');
    numStyle = numberStyle(worn);
    return numStyle;
  };
  /** Draws `text` as pixel numerals into `host`, `px` CSS px per numeral pixel (rounded). */
  const pxNum = (host: HTMLElement, text: string, px: number): void => {
    const dpr = screenDpr();
    const scale = Math.max(1, Math.round(px * dpr)) / dpr;
    const key = `${numStyle}|${scale}|${text}`;
    if (host.dataset['px'] === key) return;
    host.dataset['px'] = key;
    const markup = pixelNumberMarkup(numStyle || readStyle(), text, scale);
    if (markup) host.innerHTML = markup;
    else host.textContent = text;
  };

  // ---- state kept between renders ----
  let log: DuelLog = emptyDuelLog();
  let slots: HandSlot[] = [];
  let builtTeam = '';
  let builtFor: string | null | undefined;
  let foeKey: { dungeon: string; difficulty: string; key: string } | null = null;
  let lastLook: BarLook | null = null;
  let artKey = '';
  /** The pack sprite shown in the enemy card (art/foes.ts), or '' for the other pictures. */
  let foeSprite = '';
  let foeScale = 0;
  /** Draws the foe sprite at the largest whole device-pixel scale the card's art box holds. */
  function fitFoe(): void {
    if (!foeSprite) return;
    const box = foeBody.getBoundingClientRect();
    if (box.width < 1 || box.height < 1) return;
    const dpr = screenDpr();
    const device = Math.max(1, Math.floor(Math.min(box.width / FOE_W, box.height / FOE_H) * dpr));
    const key = `${foeSprite}:${device}:${dpr}`;
    if (foeBody.dataset['foe'] === key) return;
    foeBody.dataset['foe'] = key;
    foeScale = device / dpr;
    foeBody.innerHTML = foeHtml(foeSprite, foeScale);
  }
  function clearFoe(): void {
    foeSprite = '';
    delete foeBody.dataset['foe'];
  }
  new ResizeObserver(() => fitFoe()).observe(foeBody);
  let plateQueue: Plate[] = [];
  let plateId = 1;
  const plateEls = new Map<number, HTMLElement>();
  let windup: { at: number; nextAttack: number; nextIsSlam: boolean; interval: number } | null =
    null;
  let edgeShown = 0;
  let lastStep = 0;

  const live = (): boolean => ctx.active() && Boolean(builtFor);

  onFrame((_dt, now) => {
    if (!windup || !ctx.active()) {
      if (edgeShown !== 0) {
        edgeShown = 0;
        edge.style.opacity = '0';
      }
      return;
    }
    const remaining = windup.nextAttack - (now - windup.at) / 1000;
    const progress = windupProgress(windup.nextIsSlam, remaining, windup.interval);
    const v =
      Math.round(edgeStrength(progress, windupSeconds(windup.interval), calm()) * 100) / 100;
    if (v !== edgeShown) {
      edgeShown = v;
      edge.style.opacity = String(v);
    }
  });

  // ---- the hand ----
  function buildHand(s: GameState, team: TeamCardView[]): void {
    builtTeam = loadoutKey(s) + team.map((c) => c.cardId).join(',');
    const mods = collectModifiers(s, content);
    hand.replaceChildren();
    const count = team.length;
    const size = handSize(count);
    hand.style.setProperty('--hand-w', String(size.w));
    hand.style.setProperty('--hand-h', String(size.h));
    slots = team.map((c, i) => {
      const at = handSlot(i, count);
      const wrap = div('du-card');
      wrap.dataset['slot'] = String(i);
      wrap.dataset['colour'] = slotColour(i);
      wrap.style.setProperty('--x', String(at.x));
      wrap.style.setProperty('--y', String(at.y));
      wrap.setAttribute('role', 'listitem');
      wrap.tabIndex = 0;
      const body = div('du-card__body');
      const props = loadoutProps(content, s, c.cardId, i === 0 ? 'main' : 'support', mods);
      if (props) body.append(createCard(props).el);
      const glow = div('du-card__glow');
      const grey = div('du-card__grey');
      const hpTrack = div('du-card__hp');
      const hpFill = document.createElement('i');
      hpTrack.append(hpFill);
      const tag = div('du-tag du-tag--card');
      const mark = div('du-card__mark');
      mark.setAttribute('aria-hidden', 'true');
      wrap.append(glow, body, grey, hpTrack, tag, mark);
      hand.append(wrap);
      const entry: HandSlot = {
        cardId: c.cardId,
        slot: i,
        el: wrap,
        body,
        glow,
        grey,
        hpFill,
        hpTrack,
        tag,
        out: c.knockedOut,
        fraction: c.fraction,
        tip: '',
        hopMs: hopMs(c.hitSeconds),
      };
      attachTooltip(wrap, () => entry.tip);
      wrap.classList.toggle('is-out', c.knockedOut);
      grey.style.opacity = c.knockedOut ? '1' : '0';
      return entry;
    });
  }

  function updateHand(team: TeamCardView[]): void {
    for (const c of team) {
      const slot = slots.find((x) => x.cardId === c.cardId);
      if (!slot) continue;
      const name = content.cardById.get(c.cardId)?.name ?? c.cardId;
      // its own health: the bar closes at once; the piece lost comes away pale and falls off
      if (c.fraction < slot.fraction - 0.002 && !calm())
        dropChunk(slot.hpTrack, slot.fraction, c.fraction);
      slot.fraction = c.fraction;
      slot.hpFill.style.width = `${(c.fraction * 100).toFixed(1)}%`;
      slot.hpTrack.dataset['level'] = c.fraction < 0.25 ? 'low' : c.fraction < 0.5 ? 'mid' : 'high';
      slot.hopMs = hopMs(c.hitSeconds);
      slot.el.classList.toggle('is-targeted', c.targeted);
      // a knocked-out card fades to grey and stays grey until the floor is won
      if (c.knockedOut !== slot.out) {
        slot.out = c.knockedOut;
        slot.el.classList.toggle('is-out', c.knockedOut);
        fadeTo(slot.grey, c.knockedOut ? 1 : 0, c.knockedOut ? 400 : 200);
      }
      const dealt = log.perCard[c.cardId] ?? new Decimal(0);
      pxNum(slot.tag, fmt(dealt), 1);
      slot.tip = [
        DUEL_COPY.cardTip(
          name,
          c.skill.name,
          c.skill.role.replace('_', ' '),
          c.skill.description,
          fmt(c.health),
          fmt(c.maxHealth),
        ),
        ...(c.knockedOut ? [DUEL_COPY.cardOut] : []),
        ...(c.targeted ? [DUEL_COPY.targeted] : []),
      ].join(' ');
      slot.el.setAttribute('aria-label', `${name}, ${healthPercent(c.fraction)}% health`);
    }
  }

  function fadeTo(node: HTMLElement, opacity: number, ms: number): void {
    const from = getComputedStyle(node).opacity;
    node.style.opacity = String(opacity);
    if (calm() || !live()) return;
    node.animate([{ opacity: from }, { opacity }], { duration: ms, easing: 'linear' });
  }

  function dropChunk(track: HTMLElement, from: number, to: number): void {
    const chunk = document.createElement('i');
    chunk.className = 'ar-chunk';
    chunk.style.setProperty('--to', (to * 100).toFixed(3));
    chunk.style.setProperty('--size', ((from - to) * 100).toFixed(3));
    track.append(chunk);
    for (const old of Array.from(track.querySelectorAll('.ar-chunk')).slice(0, -6)) old.remove();
    window.setTimeout(() => chunk.remove(), 700);
  }

  // ---- the enemy ----
  function setFoeArt(s: GameState): void {
    const id = s.activeDungeonId;
    const dungeon = id ? content.dungeonById.get(id) : undefined;
    const t = id ? content.trialById.get(id) : undefined;
    if (dungeon) {
      const enemy = bossStatus(s, content)?.enemy;
      const art = dungeon.boss.art;
      if (enemy && (enemy.kind !== 'boss' || !art)) {
        const key = `enemy:${enemy.kind}:${enemy.id}`;
        if (key === artKey) return;
        artKey = key;
        const sprite =
          enemy.kind === 'boss'
            ? dungeon.boss.sprite
            : enemy.kind === 'miniboss'
              ? dungeon.miniBoss.sprite
              : dungeon.enemies.find((e) => e.id === enemy.id)?.sprite;
        if (hasFoeSprite(sprite)) {
          foeSprite = sprite!;
          fitFoe();
          return;
        }
        clearFoe();
        const box = div(`ar-enemy ar-enemy--${enemy.kind}`);
        box.append(span('ar-enemy__name', enemy.name));
        foeBody.replaceChildren(box);
        return;
      }
      if (art && artKey !== art) {
        artKey = art;
        clearFoe();
        foeBody.innerHTML = `<svg viewBox="-6 -8 112 112" aria-hidden="true" focusable="false">${bossArt(art)}</svg>`;
      }
      return;
    }
    if (t) {
      const level = sentinelLevel(Math.min(trialStatus(s, content)?.score ?? 0, 1));
      const key = `${t.target.art}:${level}`;
      if (key === artKey) return;
      artKey = key;
      clearFoe();
      foeBody.innerHTML = `<svg viewBox="-6 -8 112 112" aria-hidden="true" focusable="false">${bossArt(t.target.art, level)}</svg>`;
    }
  }

  function meterRow(label: string, kind: string): HTMLElement {
    const row = div(`ar-meter ar-meter--${kind}`);
    const b = document.createElement('b');
    const track = div('ar-meter__track');
    track.append(document.createElement('i'));
    row.append(span('', label), b, track);
    return row;
  }
  function setMeter(kind: string, fraction: number, text: string): void {
    const row = trial.querySelector<HTMLElement>(`.ar-meter--${kind}`);
    if (!row) return;
    setText(row.querySelector('b')!, text);
    row.querySelector<HTMLElement>('i')!.style.width =
      `${(Math.min(1, Math.max(0, fraction)) * 100).toFixed(1)}%`;
  }

  /** The kill's walk: the old card drops away, the hand steps twice, the next card is dealt. */
  function walk(kind: 'walk' | 'deal'): void {
    if (!live() || calm()) return;
    const t = dealTokens();
    // fast kills: the newest card wins; an old ghost or deal never piles up
    for (const old of Array.from(foeZone.querySelectorAll('.du-foe--ghost'))) old.remove();
    for (const a of foe.getAnimations()) a.cancel();
    const now = performance.now();
    if (kind === 'walk') {
      const ghost = foe.cloneNode(true) as HTMLElement;
      ghost.classList.add('du-foe--ghost');
      ghost.removeAttribute('aria-label');
      ghost.setAttribute('aria-hidden', 'true');
      foeZone.append(ghost);
      ghost
        .animate(
          [
            { transform: 'translateY(0)', opacity: 1 },
            { transform: 'translateY(24px)', opacity: 0 },
          ],
          { duration: t.exitDur, easing: t.exitEase, fill: 'forwards' },
        )
        .finished.then(
          () => ghost.remove(),
          () => ghost.remove(),
        );
      // the hand steps twice, at most once a second so a fast wave does not jitter it
      if (now - lastStep > 1000) {
        lastStep = now;
        hand.animate(
          [
            { transform: 'translateY(0)' },
            { transform: 'translateY(4px)' },
            { transform: 'translateY(0)' },
            { transform: 'translateY(4px)' },
            { transform: 'translateY(0)' },
          ],
          { duration: t.dur, easing: 'ease-in-out' },
        );
      }
    }
    // the next enemy comes off the deck: from the deck's place, small and clear, to its own
    const a = foe.getBoundingClientRect();
    const b = deck.getBoundingClientRect();
    const dx = b.width > 0 ? (b.left + b.width / 2 - (a.left + a.width / 2)) * t.reach : 0;
    foe.animate(
      [
        { transform: `translate(${dx}px, 0) scale(${t.scale})`, opacity: 0 },
        { transform: 'none', opacity: 1 },
      ],
      {
        duration: t.dur,
        easing: t.ease,
        delay: kind === 'walk' ? t.exitDur : 0,
        fill: 'backwards',
      },
    );
  }

  function updateFoe(s: GameState, mods: ReturnType<typeof collectModifiers>): void {
    const id = s.activeDungeonId;
    const dungeon = id ? content.dungeonById.get(id) : undefined;
    const trialDef = id ? content.trialById.get(id) : undefined;
    if (dungeon) {
      const status = bossStatus(s, content, mods);
      const view = duelEnemy(s, content, mods);
      if (!status || !view) return;
      const key = {
        dungeon: dungeon.id,
        difficulty: status.difficulty,
        key: `${status.difficulty}:${status.floor}:${status.wave.index}:${status.enemy.id}`,
      };
      const moment = enemyMoment(foeKey, key);
      foeKey = key;
      setFoeArt(s);
      foe.dataset['kind'] = view.enemy.kind;
      setText(foeName, view.enemy.name);
      setText(
        foeKind,
        view.enemy.kind === 'boss'
          ? DUEL_COPY.bossKind
          : view.enemy.kind === 'miniboss'
            ? DUEL_COPY.miniKind
            : '',
      );
      foe.setAttribute('aria-label', `${DUEL_COPY.enemy}: ${view.enemy.name}`);
      hp.update(
        status.bars,
        fmt(status.hp),
        fmt(status.maxHp),
        status.hp.div(status.maxHp).toNumber(),
      );
      const gone = barsGone(status.enemy.hpBars, status.bars.remaining);
      hpTip = `${COPY.arena.bossTip(fmt(status.hp), fmt(status.maxHp))} · ${COPY.arena.barsGone(gone.gone, gone.total)}`;
      const look = { key: key.key, remaining: status.bars.remaining };
      if (barMoment(lastLook, look, false) === 'shatter' && live() && !calm())
        replay(hp.el.querySelector('.bi-hpstack__count'), 'is-ticking', 500);
      lastLook = look;
      const dealt = enemyDamage(view.hp, view.maxHp);
      if (dealt.gt(0)) {
        foeTagText.textContent = DUEL_COPY.damageTag(fmt(dealt));
        // the table's window is smaller: its tag a size down
        pxNum(foeTagPx, fmt(dealt), el.closest('.dv-window') ? 2 : 3);
      } else if (foeTagPx.dataset['px']) {
        foeTagText.textContent = '';
        foeTagPx.replaceChildren();
        delete foeTagPx.dataset['px'];
      }
      // the deck: one back per enemy to come (the boss last)
      const backs = deckBacks(view.waiting.length);
      if (deckStack.childElementCount !== backs) {
        deckStack.replaceChildren(...Array.from({ length: backs }, () => div('du-back')));
      }
      deck.classList.toggle('is-empty', backs === 0);
      deck.dataset['boss'] = String(view.waiting.some((w) => w.kind === 'boss'));
      setText(deckLabel, view.waiting.length > 0 ? DUEL_COPY.toCome(view.waiting.length) : '');
      // the pips: every enemy of the floor
      const stage = [
        ...Array.from({ length: view.index - 1 }, () => 'enemy' as const),
        pipKind(view.enemy.kind),
        ...view.waiting.map((w) => pipKind(w.kind)),
      ];
      const list = floorPips(view.index, stage);
      const sig = list.map((p) => `${p.kind}:${p.state}`).join(',');
      if (pips.dataset['sig'] !== sig) {
        pips.dataset['sig'] = sig;
        pips.replaceChildren(
          ...list.map((p) => {
            const i = document.createElement('i');
            i.className = `du-pip du-pip--${p.kind} is-${p.state}`;
            return i;
          }),
        );
        pips.setAttribute('aria-label', DUEL_COPY.pips(view.index, view.size));
      }
      if (moment !== 'same') walk(moment);
    } else if (trialDef) {
      setFoeArt(s);
      foe.dataset['kind'] = 'boss';
      setText(foeName, trialDef.target.name);
      setText(foeKind, COPY.dungeons.special);
      const t = trialStatus(s, content);
      if (t) {
        setMeter(
          'time',
          1 - t.elapsedSeconds / t.durationSeconds,
          COPY.dungeons.timeLeft(formatDuration((t.durationSeconds - t.elapsedSeconds) * 1000)),
        );
        setMeter('score', Math.min(1, t.score), `${Math.round(t.score * 100)}%`);
      }
      foeTagText.textContent = '';
      foeTagPx.replaceChildren();
      delete foeTagPx.dataset['px'];
      deckStack.replaceChildren();
      setText(deckLabel, '');
      pips.replaceChildren();
      delete pips.dataset['sig'];
    }
  }

  // ---- the feed, the sheet, the plates ----
  function updateLog(order: string[]): void {
    const lines = feedLines(log.feed, order);
    const sig = lines
      .map((l) => `${l.slot}:${l.damage.toString()}:${l.hits}:${l.signature}`)
      .join('|');
    if (feed.dataset['sig'] !== sig) {
      feed.dataset['sig'] = sig;
      feed.replaceChildren(
        ...lines.map((l) => {
          const li = document.createElement('li');
          li.className = `du-feed__line${l.signature ? ' is-signature' : ''}`;
          li.dataset['colour'] = l.slot >= 0 ? slotColour(l.slot) : 'none';
          const text = `+${popText(l.damage)}${l.hits > 1 ? ` ${DUEL_COPY.times(l.hits)}` : ''}`;
          const sr = span('sr-only', text);
          const px = span('du-feed__px');
          px.setAttribute('aria-hidden', 'true');
          pxNum(px, `+${popText(l.damage)}`, 1);
          li.append(sr, px);
          if (l.hits > 1) li.append(span('du-feed__times', DUEL_COPY.times(l.hits)));
          return li;
        }),
      );
    }
    const rows = sheetRows(log.perCard, order);
    if (sheetRowsEl.childElementCount !== rows.length) {
      sheetRowsEl.replaceChildren(
        ...rows.map((r) => {
          const li = document.createElement('li');
          li.className = 'du-sheet__row';
          li.dataset['colour'] = slotColour(r.slot);
          const bar = document.createElement('i');
          li.append(span('du-sheet__name'), span('du-sheet__num'), bar);
          return li;
        }),
      );
    }
    rows.forEach((r, i) => {
      const li = sheetRowsEl.children[i] as HTMLElement;
      li.dataset['colour'] = slotColour(r.slot);
      setText(li.children[0] as HTMLElement, content.cardById.get(r.cardId)?.name ?? r.cardId);
      setText(li.children[1] as HTMLElement, fmt(r.damage));
      (li.children[2] as HTMLElement).style.transform = `scaleX(${r.bar.toFixed(3)})`;
    });
    const sheetNow = duelSheet(log);
    setText(totalEl, fmt(sheetNow.total));
    setText(perSecEl, fmt(sheetNow.perSecond));
    setText(bestEl, fmt(sheetNow.best));
  }

  function updatePlates(now: number): void {
    const r = showPlates(plateQueue, now);
    plateQueue = r.queue;
    const ids = new Set(r.showing.map((p) => p.id));
    for (const [id, node] of plateEls) {
      if (ids.has(id)) continue;
      plateEls.delete(id);
      if (calm() || !ctx.active()) node.remove();
      else
        node
          .animate([{ opacity: 1 }, { opacity: 0, transform: 'translateX(-12px)' }], {
            duration: 180,
            easing: 'ease-in',
            fill: 'forwards',
          })
          .finished.then(
            () => node.remove(),
            () => node.remove(),
          );
    }
    for (const p of r.showing) {
      if (plateEls.has(p.id)) continue;
      const slot = slots.find((x) => x.cardId === p.cardId)?.slot ?? -1;
      const skill = content.skillById.get(p.skillId);
      const node = div(`du-skill px-panel${p.kind === 'heal' ? ' du-skill--heal' : ''}`);
      node.dataset['colour'] = slot >= 0 ? slotColour(slot) : 'none';
      const title = document.createElement('b');
      title.textContent = skill?.name ?? (p.kind === 'heal' ? DUEL_COPY.heal : p.skillId);
      const who = span('du-skill__who', content.cardById.get(p.cardId)?.name ?? '');
      node.append(title, who);
      if (p.count > 1) node.append(span('du-skill__times', DUEL_COPY.times(p.count)));
      plates.append(node);
      plateEls.set(p.id, node);
      if (!calm() && ctx.active()) {
        const t = dealTokens();
        node.animate(
          [
            { transform: 'translateX(-40px)', opacity: 0 },
            { transform: 'none', opacity: 1 },
          ],
          { duration: t.dur * 0.7, easing: t.ease },
        );
      }
    }
  }

  // ---- the whole duel ----
  function build(s: GameState): void {
    builtFor = s.activeDungeonId;
    artKey = '';
    clearFoe();
    lastLook = null;
    foeKey = null;
    const id = s.activeDungeonId;
    const dungeon = id ? content.dungeonById.get(id) : undefined;
    const t = id ? content.trialById.get(id) : undefined;
    const fighting = Boolean(dungeon ?? t);
    el.classList.toggle('du--idle', !fighting);
    el.classList.toggle('du--trial', Boolean(t));
    scene.className = `ar__scene ${backgroundFor(dungeon?.background).cls}`;
    for (const part of [top, left, foeZone, sheet, hand]) part.hidden = !fighting;
    empty.hidden = fighting;
    hp.el.hidden = !dungeon;
    trial.hidden = !t;
    trial.replaceChildren();
    if (t)
      trial.append(meterRow(COPY.dungeons.attempt, 'time'), meterRow(COPY.dungeons.score, 'score'));
    el.setAttribute('aria-label', dungeon?.name ?? t?.name ?? COPY.arena.idleTitle);
    readStyle();
  }

  function update(): void {
    const s = ctx.state();
    el.classList.toggle('ar--calm', calm());
    if (s.activeDungeonId !== builtFor) build(s);
    const id = s.activeDungeonId;
    if (!id) return;
    const mods = collectModifiers(s, content);
    const dungeon = content.dungeonById.get(id);
    const trialDef = content.trialById.get(id);
    const team = teamView(s, content, mods);
    const teamKey = loadoutKey(s) + team.map((c) => c.cardId).join(',');
    if (teamKey !== builtTeam) buildHand(s, team);
    const r = stageReadout(s, content, mods);
    const status = dungeon ? bossStatus(s, content, mods) : null;
    const run = dungeon ? floorChallengeView(s, content) : null;
    const lh = loadoutHealth(s, content, mods);

    // the plate
    const parts: string[] = [];
    if (dungeon && status) {
      parts.push(dungeon.name);
      const floor =
        status.difficulty === 'endless'
          ? COPY.dungeons.depthOf(status.floor)
          : COPY.dungeons.floorOf(status.floor, status.floors);
      parts.push(
        status.difficulty === 'normal' || status.difficulty === 'endless'
          ? floor
          : `${COPY.dungeons.difficulty[status.difficulty] ?? status.difficulty} ${floor}`,
      );
      if (run) parts.push(clock(run.secondsLeft));
    } else if (trialDef) {
      parts.push(trialDef.name, DUEL_COPY.doing['trial']!);
    }
    setText(plateText, DUEL_COPY.plate(parts));
    plate.classList.toggle('is-challenge', Boolean(run));

    // the left column
    const doing = duelDoing({
      trial: Boolean(trialDef),
      challenge: Boolean(run),
      knockoutSeconds: lh.knockoutSeconds,
    });
    const tier = status ? (COPY.dungeons.difficulty[status.difficulty] ?? status.difficulty) : '';
    setText(doingEl, [tier, DUEL_COPY.doing[doing] ?? ''].filter(Boolean).join(' · '));
    doingEl.dataset['doing'] = doing;
    setText(fpmEl, DUEL_COPY.floorsPerMinute(formatRate(r.killsPerMinute)));
    setText(dpsEl, DUEL_COPY.dps(fmt(r.averageDps)));
    setText(teamEl, DUEL_COPY.team(fmt(lh.current), fmt(lh.max)));
    teamTip = COPY.hp.value(fmt(lh.current), fmt(lh.max));
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
    // the controls (the full view shows them): the Challenge button, its timer, the auto switch
    const next = dungeon ? nextFloorChallenge(s, content, dungeon.id) : null;
    const button = challengeButton({
      running: run !== null,
      hasNext: next !== null,
      knockoutSeconds: s.combat.knockoutSeconds,
    });
    ctrl.hidden = !dungeon;
    chalBtn.hidden = !dungeon || button === 'none' || Boolean(run);
    chalMeter.hidden = !run;
    if (run)
      chalFill.style.transform = `scaleX(${(run.secondsLeft / run.durationSeconds).toFixed(3)})`;
    if (next && !run) {
      setText(
        chalBtn,
        next.auto && next.waitSeconds > 0
          ? COPY.dungeons.autoWait(formatDuration(Math.ceil(next.waitSeconds) * 1000))
          : status?.difficulty === 'endless'
            ? COPY.dungeons.challengeDepth(next.floor)
            : COPY.dungeons.challenge(next.floor),
      );
      chalBtn.disabled = button !== 'ready';
    }
    const auto = status?.autoChallenge ?? false;
    setText(autoBtn, auto ? DUEL_COPY.autoOn : DUEL_COPY.autoOff);
    autoBtn.setAttribute('aria-pressed', String(auto));
    autoBtn.classList.toggle('px-btn--gold', auto);
    autoBtn.classList.toggle('px-btn--dark', !auto);

    // the wind-up before a slam
    const view = dungeon ? bossAttackView(s, content, mods) : null;
    windup = view
      ? {
          at: performance.now(),
          nextAttack: view.nextAttackSeconds,
          nextIsSlam: view.nextIsSlam,
          interval: view.intervalSeconds,
        }
      : null;

    updateFoe(s, mods);
    updateHand(team);
    updateLog(team.map((c) => c.cardId));
    updatePlates(performance.now());

    // a whole-team knockout: the countdown over the hand
    const out = lh.knockoutSeconds > 0;
    hand.classList.toggle('is-ko', out);
    ko.hidden = !out;
    if (out) {
      const secs = String(Math.ceil(lh.knockoutSeconds));
      if (ko.dataset['s'] !== secs) {
        ko.dataset['s'] = secs;
        const big = document.createElement('b');
        pxNum(big, secs, 4);
        ko.replaceChildren(span('', COPY.arena.knockedOut), big);
      }
    }
  }

  // ---- the director's reports ----
  const hop = (slot: HandSlot): void => {
    if (calm() || slot.out) return;
    const dpr = screenDpr();
    const n = Number(hand.style.getPropertyValue('--card-n')) || 1;
    const lift = (HOP_ART_PX * n) / dpr;
    slot.body.animate(
      [
        { transform: 'translateY(0)' },
        { transform: `translateY(${-lift}px)`, offset: 0.45 },
        { transform: 'translateY(0)' },
      ],
      { duration: slot.hopMs, easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)' },
    );
    slot.glow.animate([{ opacity: 0 }, { opacity: 1, offset: 0.35 }, { opacity: 0 }], {
      duration: slot.hopMs * 1.4,
      easing: 'ease-out',
    });
  };

  ctx.director.on('duel', (e) => {
    const key = duelFightKey(e.after, content);
    log = recordDuel(log, e.report, e.seconds, key);
    if (e.report.skills.length > 0) {
      const q = queuePlates(plateQueue, [...e.report.skills], performance.now(), plateId);
      plateQueue = q.queue.slice(-6);
      plateId = q.nextId;
    }
    if (!live()) return;
    const hitters = new Set<string>();
    for (const hit of e.report.playerHits) if (hit.hits > 0 && hit.cardId) hitters.add(hit.cardId);
    for (const id of hitters) {
      const slot = slots.find((x) => x.cardId === id);
      if (!slot) continue;
      hop(slot);
    }
    if (hitters.size > 0) play('hit');
  });

  ctx.director.on('bossAttack', (e) => {
    if (!live()) return;
    const slot = slots[e.target];
    if (!calm()) {
      // the enemy card dips toward the card it hits
      const a = foe.getBoundingClientRect();
      const b = slot?.el.getBoundingClientRect();
      const dx =
        b && a.width
          ? Math.max(-24, Math.min(24, (b.left + b.width / 2 - a.left - a.width / 2) * 0.08))
          : 0;
      foe.animate(
        [
          { transform: 'none' },
          { transform: `translate(${dx}px, ${e.slam ? 18 : 10}px)`, offset: 0.4 },
          { transform: 'none' },
        ],
        { duration: e.slam ? 420 : 300, easing: 'ease-out' },
      );
      if (e.slam) {
        replay(slamFlash, 'is-hit', 460);
        shake(el, true);
      }
    }
    window.setTimeout(
      () => {
        const hurt = e.slam ? slots : slot ? [slot] : [];
        if (!calm()) for (const x of hurt) replay(x.body, 'is-hurt', 400);
        play('bossHit');
        if (!slot) return;
        const a = el.getBoundingClientRect();
        const b = slot.el.getBoundingClientRect();
        if (a.width === 0) return;
        popNumber(el, {
          kind: 'hurt',
          text: `-${popText(e.damage)}`,
          x: (b.left + b.width / 2 - a.left) / a.width,
          y: (b.top - a.top) / a.height,
          scale: e.slam ? 1.6 : 1,
        });
      },
      e.slam ? 200 : 140,
    );
  });

  ctx.director.on('knockout', () => {
    if (!live()) return;
    if (!calm()) shake(el, true);
    play('knockout');
  });

  ctx.director.on('challenge', (e) => {
    if (!live()) return;
    const dungeon = content.dungeonById.get(e.dungeonId);
    const shown = challengeVerdict({
      won: e.won,
      reason: e.reason,
      hpLeftPositive: e.enemyHpLeft.gt(0),
    });
    const floor =
      e.difficulty === 'endless'
        ? COPY.dungeons.depthOf(e.floor)
        : COPY.dungeons.floorOf(e.floor, dungeon?.floors ?? e.floor);
    const title = document.createElement('b');
    title.className = 'px-display';
    title.textContent = shown.kind === 'victory' ? COPY.arena.victory : COPY.arena.defeat;
    const sub = span(
      '',
      shown.kind === 'victory'
        ? COPY.arena.victoryLine(floor)
        : [
            shown.reason === 'health' ? COPY.arena.defeatHealth : COPY.arena.defeatTimer,
            ...(shown.showHpLeft ? [COPY.arena.defeatLeft(fmt(e.enemyHpLeft))] : []),
          ].join(' · '),
    );
    verdict.replaceChildren(title, sub);
    verdict.dataset['kind'] = shown.kind;
    verdict.hidden = false;
    if (!calm()) {
      const t = dealTokens();
      verdict.animate(
        [
          { transform: 'translateY(-12px)', opacity: 0 },
          { transform: 'none', opacity: 1 },
        ],
        { duration: t.dur, easing: t.ease },
      );
    }
    window.clearTimeout(verdictTimer);
    verdictTimer = window.setTimeout(
      () => (verdict.hidden = true),
      shown.kind === 'victory' ? 1800 : 3200,
    );
    if (shown.kind === 'victory') play('kill');
  });

  ctx.director.on('kill', (e) => {
    if (!live()) return;
    play('kill');
    const b = foeArt.getBoundingClientRect();
    const from = { x: b.left + b.width / 2, y: b.top + b.height * 0.7 };
    for (const loot of e.loot) {
      const n = Math.max(1, Math.min(6, Math.round(loot.amount.toNumber())));
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
      foeArt.append(beam);
      window.setTimeout(() => beam.remove(), 1600);
      toast(COPY.arena.rareDrop, item, 'rare');
      play('rare');
    }
  });

  return {
    el,
    update,
    refit: () => {
      fitHand();
      readStyle();
      delete foeTagPx.dataset['px'];
    },
  };
}
