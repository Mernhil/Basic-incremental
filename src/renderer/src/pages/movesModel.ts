import type { Content, MoveEffect } from '../../../data';
import {
  cardMoves,
  collectModifiers,
  Decimal,
  skillUnlockCost,
  tierLabel,
  soloCard,
  type GameState,
  type Modifier,
} from '../../../game';
import { COPY } from '../copy';
import type { CostPart } from '../settings/cost';
import { fmt } from '../settings/numberFormat';

/**
 * A card's three attacks as the card screens show them (DESIGN.md §2 Three attacks per card): the
 * normal hit, the skill and the ultimate, each with its name, what it does and its numbers now (the
 * card fighting alone, before team effects), and the Cores that open the skill. Pure; the weapon
 * panel draws it.
 */

export interface AttackRow {
  kind: 'hit' | 'skill' | 'ult';
  /** "Hit", "Skill", "Ultimate". */
  label: string;
  /** The move's name ('' for the hit). */
  name: string;
  /** When it fires and how hard it hits, as one line. */
  text: string;
  /** What its effects do, one line each. */
  effects: string[];
  /** Why a skill does not fire yet (its tier has none, or it is not opened), else null. */
  note: string | null;
  /** Open (fires now), locked (a skill slot not opened yet: Cores open it) or none (no slot at this tier). */
  state: 'open' | 'locked' | 'none';
}

export interface SkillUnlockView {
  cost: CostPart[];
  affordable: boolean;
}

export interface MovesView {
  rows: AttackRow[];
  /** Shown while the skill can be opened (owned, a skill slot, not open yet). */
  unlock: SkillUnlockView | null;
}

const pct = (v: number): string => `${Math.round(v * 100)}%`;
const secs = (v: number): string => `${Math.round(v * 10) / 10} s`;

/** What one effect does, in a line. */
export function effectText(e: MoveEffect, element: string | null): string {
  const c = COPY.moves;
  const who = c.who[e.on];
  const lasts =
    e.seconds === undefined ? '' : e.seconds === 0 ? c.wholeFight : c.forSeconds(secs(e.seconds));
  switch (e.kind) {
    case 'wound':
      return c.effect.wound(pct(e.value), lasts);
    case 'expose':
      return c.effect.expose(pct(e.value), lasts);
    case 'weaken':
      return c.effect.weaken(pct(e.value), lasts);
    case 'stagger':
      return c.effect.stagger(secs(e.value));
    case 'mark':
      return c.effect.mark(element ?? '', pct(e.value), lasts);
    case 'execute':
      return c.effect.execute(pct(e.value), pct(e.below ?? 0));
    case 'rally':
      return c.effect.rally(who, pct(e.value), lasts);
    case 'haste':
      return c.effect.haste(who, pct(e.value), lasts);
    case 'focus':
      return e.on === 'self' && (e.seconds ?? 0) <= 1
        ? c.effect.sureCrit
        : c.effect.focus(who, pct(e.value), lasts);
    case 'charge':
      return c.effect.charge(who, String(Math.round(e.value * 10) / 10));
    case 'heal':
      return c.effect.heal(who, pct(e.value));
    case 'regen':
      return c.effect.regen(who, pct(e.value), lasts);
    case 'shield':
      return c.effect.shield(who, pct(e.value));
    case 'drain':
      return c.effect.drain(who, pct(e.value));
  }
}

/** The tier that first has a skill slot, for the note on a card without one. */
function firstSkillTier(content: Content): string {
  const tier = (Object.keys(content.moves.tiers) as (keyof Content['moves']['tiers'])[]).find(
    (t) => content.moves.tiers[t].skill,
  );
  return tier ? tierLabel(tier) : '';
}

export function movesView(
  state: GameState,
  content: Content,
  cardId: string,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): MovesView | null {
  const card = content.cardById.get(cardId);
  if (!card || card.job !== 'fighting') return null;
  const owned = state.cards.owned[cardId];
  const moves = cardMoves(content, cardId, owned ?? { skillOpen: false }, modifiers);
  if (!moves) return null;
  const solo = owned ? soloCard(state, content, modifiers, cardId) : null;
  const c = COPY.moves;
  const num = (d: Decimal): string => fmt(d);
  const rows: AttackRow[] = [];

  rows.push({
    kind: 'hit',
    label: c.hit,
    name: '',
    text: solo ? c.hitText(num(solo.hit), secs(solo.interval)) : c.hitPlain,
    effects: [],
    note: null,
    state: 'open',
  });

  if (moves.skill) {
    const s = moves.skill;
    rows.push({
      kind: 'skill',
      label: c.skill,
      name: s.name,
      text: solo
        ? c.skillText(secs(s.every), num(solo.hit.mul(s.strike)))
        : c.skillPlain(secs(s.every), pct(s.strike)),
      effects: s.effects.map((e) => effectText(e, moves.element)),
      note: s.open ? null : c.closed,
      state: s.open ? 'open' : 'locked',
    });
  } else {
    const kit = content.moves.kits[moves.kind].skill;
    rows.push({
      kind: 'skill',
      label: c.skill,
      name: kit.name,
      text: '',
      effects: [],
      note: c.noSlot(firstSkillTier(content)),
      state: 'none',
    });
  }

  const u = moves.ult;
  const hits = solo && solo.fill > 0 ? Math.ceil(solo.size / solo.fill) : null;
  const strike = solo ? solo.signature.mul(u.strike) : new Decimal(0);
  rows.push({
    kind: 'ult',
    label: c.ult,
    name: u.name,
    text:
      u.strike <= 0
        ? hits === null
          ? c.ultSupportPlain
          : c.ultSupport(String(hits))
        : hits === null
          ? c.ultPlain(pct(u.strike))
          : c.ultText(String(hits), num(strike)),
    effects: u.effects.map((e) => effectText(e, moves.element)),
    note:
      u.effects.length === 0 && u.strike > 0 && !content.moves.tiers[card.tier].ultEffects
        ? c.ultEffectsLater
        : null,
    state: 'open',
  });

  let unlock: SkillUnlockView | null = null;
  const cost = skillUnlockCost(content, cardId);
  if (owned && moves.skill && !moves.skill.open && cost) {
    const have = state.resources[cost.resource] ?? new Decimal(0);
    unlock = {
      cost: [{ resource: cost.resource, amount: new Decimal(cost.amount) }],
      affordable: have.gte(cost.amount),
    };
  }
  return { rows, unlock };
}
