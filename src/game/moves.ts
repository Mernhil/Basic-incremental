import type {
  CardElement,
  Content,
  MoveEffect,
  MoveEffectKind,
  MoveTarget,
  RankTier,
} from '../data';
import { computeStat, type Modifier, type StatContext } from './modifiers';
import { Decimal } from './num';
import { cloneState, type GameState, type OwnedCard } from './state';

/**
 * Three attacks per card (DESIGN.md §2 Three attacks per card; moves.json). Every fighting card
 * has its normal hit, a skill on its own timer (damage plus effects; opened once with Cores) and an
 * ultimate on the full gauge (today's signature attack, plus effects). Wood to Prismatic share their
 * weapon type's kit and the tier opens part of it; a T6 or Heirloom card has its own named moves,
 * built from the kit, its element and its side.
 *
 * The fight deals effects as their average, the way it deals crits (combat.ts `critFactor`): an
 * effect that lasts `seconds` out of every `period` counts for that share of the time, and a one-off
 * (a heal, a shield, a charge, a stagger) counts at its rate. So the fight stays on the play-time
 * clock with no saved timer, and online, offline and any split of time give the same totals. The
 * stage shows each skill and ultimate as it fires (`activeEffects` in duel.ts), for show only.
 */

export type WeaponKit = keyof Content['moves']['kits'];

export interface ResolvedSkill {
  name: string;
  /** Seconds between two skills. */
  every: number;
  /** Its hit, as a multiple of the card's normal hit. */
  strike: number;
  effects: MoveEffect[];
  /** Opened with Cores: only an open skill fires. */
  open: boolean;
}

export interface ResolvedUlt {
  name: string;
  /** Its hit, as a multiple of the signature attack (0: a support ultimate that only heals). */
  strike: number;
  effects: MoveEffect[];
}

export interface CardMoves {
  kind: WeaponKit;
  element: CardElement | null;
  /** Null when the card's tier has no skill slot (Wood). */
  skill: ResolvedSkill | null;
  ult: ResolvedUlt;
}

const FIGHTING: StatContext = { job: 'fighting' };
const NO_LEAN = { strike: 1, every: 1, seconds: 1, skillEffect: 1 };

const isTop = (tier: RankTier): boolean => tier === 'mythic' || tier === 'heirloom';

/** Kinds that add up when one move carries them twice; the others keep the stronger and longer. */
const ADDS_UP: readonly MoveEffect['kind'][] = [
  'wound',
  'charge',
  'heal',
  'shield',
  'regen',
  'drain',
];

/** One move's effects with each kind and target once (its kit, layers and twist merged). */
export function mergeEffects(list: readonly MoveEffect[]): MoveEffect[] {
  const out: MoveEffect[] = [];
  for (const e of list) {
    const same = out.findIndex((x) => x.kind === e.kind && x.on === e.on);
    if (same < 0) {
      out.push({ ...e });
      continue;
    }
    const a = out[same]!;
    const seconds =
      a.seconds === undefined && e.seconds === undefined
        ? undefined
        : a.seconds === 0 || e.seconds === 0
          ? 0
          : Math.max(a.seconds ?? 0, e.seconds ?? 0);
    const below = Math.max(a.below ?? 0, e.below ?? 0);
    out[same] = {
      kind: a.kind,
      on: a.on,
      value: ADDS_UP.includes(a.kind) ? a.value + e.value : Math.max(a.value, e.value),
      ...(seconds !== undefined ? { seconds } : {}),
      ...(below > 0 ? { below } : {}),
    };
  }
  return out;
}

function scaled(list: readonly MoveEffect[], value: number, seconds: number): MoveEffect[] {
  return mergeEffects(list).map((e) => ({
    ...e,
    value: e.value * value,
    ...(e.seconds !== undefined && e.seconds > 0 ? { seconds: e.seconds * seconds } : {}),
  }));
}

/**
 * A card's moves as it fights them (`modifiers`: the card's own, through the `move.*` stats), or
 * null for a card that does not fight.
 */
export function cardMoves(
  content: Content,
  cardId: string,
  owned: Pick<OwnedCard, 'skillOpen'> | undefined,
  modifiers: readonly Modifier[] = [],
): CardMoves | null {
  const card = content.cardById.get(cardId);
  if (!card || card.job !== 'fighting') return null;
  const kind = card.item.kind as WeaponKit;
  const kit = content.moves.kits[kind];
  if (!kit) return null;
  const rules = content.moves;
  const tier = rules.tiers[card.tier];
  const top = isTop(card.tier);
  const own = top ? rules.cards[cardId] : undefined;
  const element = top ? (card.element ?? null) : null;
  const lean = own?.lean ? rules.leans[own.lean] : NO_LEAN;
  const stat = (s: Parameters<typeof computeStat>[0], base: number): number =>
    computeStat(s, base, modifiers, FIGHTING).value.toNumber();
  const power = Math.max(0, stat('move.effectPower', 1));
  const lasts = Math.max(0, stat('move.effectSeconds', 1));
  const seconds = tier.seconds * lean.seconds * lasts;

  let skill: ResolvedSkill | null = null;
  if (tier.skill) {
    const layer = element ? rules.elements[element].skill : [];
    skill = {
      name: own?.skill ?? kit.skill.name,
      every: Math.max(1, stat('move.skillInterval', kit.skill.every * tier.every * lean.every)),
      strike: Math.max(0, stat('move.skillPower', kit.skill.strike * lean.strike)),
      effects: scaled(
        [...kit.skill.effects, ...layer, ...(own?.extra?.skill ?? [])],
        lean.skillEffect * power,
        seconds,
      ),
      open: owned?.skillOpen === true,
    };
  }

  // A support ultimate (no hit, a Mend) always does its one job; the others gain their effects from
  // the tier that opens them.
  const support = kit.ult.strike === 0;
  let ultEffects: MoveEffect[] = [];
  if (tier.ultEffects || support) {
    const sides =
      element === null
        ? []
        : card.tier === 'heirloom'
          ? [...rules.elements[element].mythic, ...rules.elements[element].void]
          : card.side === 'void'
            ? rules.elements[element].void
            : rules.elements[element].mythic;
    const mark: MoveEffect[] =
      element === null
        ? []
        : [{ kind: 'mark', on: 'enemy', value: rules.mark.value, seconds: rules.mark.seconds }];
    const list = tier.ultEffects
      ? [...kit.ult.effects, ...mark, ...sides, ...(own?.extra?.ult ?? [])]
      : kit.ult.effects;
    ultEffects = scaled(list, (tier.ultEffects ? tier.ultEffect : 1) * power, seconds);
  }
  return {
    kind,
    element,
    skill,
    ult: {
      name: own?.ult ?? kit.ult.name,
      strike: Math.max(0, stat('move.ultPower', kit.ult.strike * lean.strike)),
      effects: ultEffects,
    },
  };
}

// ---- the team ---------------------------------------------------------------------------------

/** Where a heal lands when it fires. */
export type HealTarget = Exclude<MoveTarget, 'enemy' | 'emptiest' | 'row'>;

/** A share of the target's max health healed each time the card's ultimate fires. */
export interface HealShare {
  on: HealTarget;
  share: number;
}

/** One card as the moves need it, before any move counts. */
export interface MoveFighter {
  row: 'front' | 'back';
  interval: number;
  fill: number;
  size: number;
  /** A normal hit, crits at their average. */
  hit: Decimal;
  /** The signature attack's extra damage today (hit x burst power). */
  signature: Decimal;
  maxHealth: Decimal;
  critChance: number;
  critDamage: Decimal;
  element: CardElement | null;
  /** What a Mark of its element gives back of the enemy's resistance, as a share of its damage
   *  (0 when not resisted), for as long as the Mark lasts. */
  resisted: number;
  moves: CardMoves | null;
}

/** What the moves make of one card for the fight. */
export interface MoveOutcome {
  interval: number;
  fill: number;
  hit: Decimal;
  signature: Decimal;
  heals: HealShare[];
  /** Share the enemy's attacks lose while this card stands (Weaken and Stagger). */
  weaken: number;
  /** Seconds between its skills, 0 when it has none open. */
  skillEvery: number;
}

const critAverage = (chance: number, damage: Decimal): Decimal => damage.sub(1).mul(chance).add(1);

/** Share of the time an effect lasting `seconds` out of every `period` is on (0 = the whole fight). */
function uptime(e: MoveEffect, period: number): number {
  if (e.seconds === undefined) return 0;
  if (e.seconds === 0) return 1;
  return Math.min(1, e.seconds / period);
}

/**
 * The moves of the whole team, applied together (the same effect from two cards does not stack:
 * the stronger counts; Wounds and charges add up). Pure: one pass over the cards' own timings.
 */
export function applyMoves(cards: readonly MoveFighter[]): MoveOutcome[] {
  const n = cards.length;
  const ultPeriod = cards.map((c) => (c.fill > 0 ? (c.interval * c.size) / c.fill : Infinity));
  const rally = new Array<number>(n).fill(0);
  const haste = new Array<number>(n).fill(0);
  const focus = new Array<number>(n).fill(0);
  const charge = new Array<number>(n).fill(0);
  const wound = new Array<number>(n).fill(0);
  const weaken = new Array<number>(n).fill(0);
  const stagger = new Array<number>(n).fill(0);
  const execute = new Array<number>(n).fill(1);
  const sureCrit = new Array<boolean>(n).fill(false);
  const heals: HealShare[][] = cards.map(() => []);
  const mark = new Map<CardElement, number>();
  const markTime = new Map<CardElement, number>();
  let expose = 0;

  const receivers = (i: number, on: MoveTarget): number[] => {
    const all = cards.map((_, k) => k);
    switch (on) {
      case 'self':
        return [i];
      case 'team':
        return all;
      case 'row':
        return all.filter((k) => cards[k]!.row === cards[i]!.row);
      case 'front':
      case 'back':
        return all.filter((k) => cards[k]!.row === on);
      case 'emptiest': {
        const others = all.filter((k) => k !== i);
        if (others.length === 0) return [i];
        return [others.reduce((a, k) => (ultPeriod[k]! > ultPeriod[a]! ? k : a), others[0]!)];
      }
      case 'lowest': {
        return [all.reduce((a, k) => (cards[k]!.maxHealth.lt(cards[a]!.maxHealth) ? k : a), i)];
      }
      case 'enemy':
        return [];
    }
  };
  const addHeal = (i: number, on: MoveTarget, share: number): void => {
    if (!(share > 0) || on === 'enemy' || on === 'emptiest') return;
    const target: HealTarget = on === 'row' ? cards[i]!.row : on;
    const same = heals[i]!.find((h) => h.on === target);
    if (same) same.share += share;
    else heals[i]!.push({ on: target, share });
  };

  cards.forEach((c, i) => {
    const m = c.moves;
    if (!m) return;
    const events: { effects: MoveEffect[]; period: number; ult: boolean; strike: Decimal }[] = [];
    if (m.skill?.open) {
      events.push({
        effects: m.skill.effects,
        period: m.skill.every,
        ult: false,
        strike: c.hit.mul(m.skill.strike),
      });
    }
    events.push({
      effects: m.ult.effects,
      period: ultPeriod[i]!,
      ult: true,
      strike: c.signature.mul(m.ult.strike),
    });
    for (const ev of events) {
      if (!Number.isFinite(ev.period) || ev.period <= 0) continue;
      // A skill's heals land with the card's ultimates, as many as fit (the fight heals on them).
      const perUlt = ev.ult ? 1 : Number.isFinite(ultPeriod[i]!) ? ultPeriod[i]! / ev.period : 0;
      for (const e of ev.effects) {
        const u = uptime(e, ev.period);
        const part = e.value * u;
        switch (e.kind) {
          case 'rally':
            for (const r of receivers(i, e.on)) rally[r] = Math.max(rally[r]!, part);
            break;
          case 'haste':
            for (const r of receivers(i, e.on)) haste[r] = Math.max(haste[r]!, part);
            break;
          case 'focus':
            if (ev.ult && e.on === 'self' && (e.seconds ?? 0) <= 1) sureCrit[i] = true;
            else for (const r of receivers(i, e.on)) focus[r] = Math.max(focus[r]!, part);
            break;
          case 'expose':
            expose = Math.max(expose, part);
            break;
          case 'weaken':
            weaken[i] = Math.max(weaken[i]!, part);
            break;
          case 'stagger':
            stagger[i] = Math.max(stagger[i]!, e.value / (ev.period + e.value));
            break;
          case 'mark':
            if (m.element) {
              mark.set(m.element, Math.max(mark.get(m.element) ?? 0, part));
              markTime.set(m.element, Math.max(markTime.get(m.element) ?? 0, u));
            }
            break;
          case 'wound': {
            const lasts = e.seconds === undefined || e.seconds === 0 ? ev.period : e.seconds;
            wound[i] = wound[i]! + (e.value * Math.min(lasts, ev.period)) / ev.period;
            break;
          }
          case 'execute':
            if (ev.ult) execute[i] = execute[i]! * (1 + e.value * (e.below ?? 0));
            break;
          case 'charge':
            for (const r of receivers(i, e.on)) charge[r] = charge[r]! + e.value / ev.period;
            break;
          case 'heal':
          case 'shield':
            addHeal(i, e.on, e.value * perUlt);
            break;
          case 'regen': {
            const lasts = e.seconds === undefined || e.seconds === 0 ? ev.period : e.seconds;
            addHeal(i, e.on, e.value * lasts * perUlt);
            break;
          }
          case 'drain': {
            if (c.maxHealth.lte(0)) break;
            const share = ev.strike.mul(e.value).div(c.maxHealth).toNumber();
            addHeal(i, e.on, Math.min(1, share) * perUlt);
            break;
          }
        }
      }
    }
  });

  return cards.map((c, i): MoveOutcome => {
    const m = c.moves;
    const markUp = c.element ? (mark.get(c.element) ?? 0) : 0;
    const marked = c.element ? (markTime.get(c.element) ?? 0) : 0;
    const dmg = (1 + rally[i]!) * (1 + expose) * (1 + markUp) * (1 + c.resisted * marked);
    const old = critAverage(c.critChance, c.critDamage);
    const crit = critAverage(Math.min(1, c.critChance + focus[i]!), c.critDamage).div(old);
    const interval = c.interval / (1 + haste[i]!);
    const skillDps = m?.skill?.open ? c.hit.mul(m.skill.strike / m.skill.every) : new Decimal(0);
    const woundDps = c.hit.mul(wound[i]!);
    const hit = c.hit.mul(crit).add(skillDps.mul(crit).add(woundDps).mul(interval)).mul(dmg);
    const ultCrit = sureCrit[i] ? c.critDamage.div(old) : crit;
    const signature = c.signature
      .mul(m ? m.ult.strike : 1)
      .mul(execute[i]!)
      .mul(ultCrit)
      .mul(dmg);
    return {
      interval,
      fill: c.fill + charge[i]! * interval,
      hit,
      signature,
      heals: heals[i]!,
      weaken: 1 - (1 - weaken[i]!) * (1 - stagger[i]!),
      skillEvery: m?.skill?.open ? m.skill.every : 0,
    };
  });
}

// ---- opening a skill --------------------------------------------------------------------------

/** The Cores that open a card's skill, or null when its tier has no skill slot. */
export function skillUnlockCost(
  content: Content,
  cardId: string,
): { resource: string; amount: number } | null {
  const card = content.cardById.get(cardId);
  if (!card || card.job !== 'fighting' || !content.moves.tiers[card.tier].skill) return null;
  return content.moves.unlock[card.tier] ?? null;
}

export type SkillOpenFailure = 'not-owned' | 'no-skill' | 'open' | 'cost';
export type SkillOpenResult =
  { ok: true; state: GameState } | { ok: false; reason: SkillOpenFailure };

/** Opens a card's skill with the Cores of its tier, once (DESIGN.md §2 Three attacks per card). */
export function openCardSkill(state: GameState, content: Content, cardId: string): SkillOpenResult {
  const owned = state.cards.owned[cardId];
  if (!owned) return { ok: false, reason: 'not-owned' };
  const cost = skillUnlockCost(content, cardId);
  if (!cost) return { ok: false, reason: 'no-skill' };
  if (owned.skillOpen) return { ok: false, reason: 'open' };
  const have = state.resources[cost.resource] ?? new Decimal(0);
  if (have.lt(cost.amount)) return { ok: false, reason: 'cost' };
  const next = cloneState(state);
  next.resources[cost.resource] = have.sub(cost.amount);
  next.cards.owned[cardId] = { ...owned, skillOpen: true };
  return { ok: true, state: next };
}

/** The effect kinds a card's moves can put on the fight, for labels. */
export const EFFECT_WORDS: Readonly<Record<MoveEffectKind, string>> = {
  wound: 'Wound',
  expose: 'Exposed',
  weaken: 'Weakened',
  stagger: 'Staggered',
  mark: 'Marked',
  execute: 'Execute',
  rally: 'Rally',
  haste: 'Haste',
  focus: 'Focus',
  charge: 'Charge',
  heal: 'Heal',
  regen: 'Regen',
  shield: 'Shield',
  drain: 'Drain',
};
