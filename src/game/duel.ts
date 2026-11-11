import type { Content, Skill } from '../data';
import { cardBaseDamage, cardEffectModifiers, cardHealth } from './cards';
import { lethalBossAttack, type BossPattern } from './bossAttacks';
import { burstStats, critFactor, critStats, type CritStats } from './combat';
import { computeStat, type Modifier, type StatContext } from './modifiers';
import { Decimal } from './num';
import type { GameState } from './state';

/**
 * The card duel's rules (DESIGN.md §6 "The fight is a first-person card duel", "The team of 4 in
 * numbers"): the fighting team is the loadout's cards (main, then the supports, left to right).
 * Each card fights on its own: it hits at its own interval with its own damage, fills its own
 * signature gauge and fires its own skill (skills.json: the weapon type's leaning, or the card's
 * own), and has its own health (`combat.cardDamage`). The enemy hits one card at a time: the first
 * standing guard, else the first standing card from the left. A knocked-out card stops attacking
 * until the floor is won; the fight is lost when every card is out.
 *
 * Hits sit on the play-time clock like the enemy's attacks (bossAttacks.ts): card hit `k` lands
 * at `k × interval` seconds of play time and its signature fires on the hits where its gauge
 * (`fill` a hit, `size` to fire) fills. So no timer is saved and online, offline and any split of
 * time land the same hits. Pure maths over the state; the fight loop is `fightDungeon`
 * (combat.ts).
 */

/** Slack that keeps a boundary exactly on a hit from flipping with rounding. */
const EPSILON = 1e-9;
/** The least time a fight event takes (a hit already due lands after this). */
export const DUE_HIT_SECONDS = 1e-6;

/** One card of the fighting team as the fight uses it (after modifiers). */
export interface TeamCard {
  /** Card id; '' for bare hands (no card in the loadout). */
  id: string;
  /** Position in the team, 0 (the main card, leftmost) to 3. */
  slot: number;
  skill: Skill;
  /** Seconds between hits, gauge points a hit and points to fire (burstStats with its own main
   *  ability). */
  interval: number;
  fill: number;
  size: number;
  /** Damage of one normal hit (crits at their expected value, the skill's damage factor in). */
  hit: Decimal;
  /** Extra damage of a signature attack on top of its hit; 0 when the signature heals. */
  signature: Decimal;
  /** Share of each standing card's max health its signature heals; 0 when it strikes. */
  heal: number;
  /** Max health (its card health, the team's `combat.health` modifiers, the skill's factor). 0
   *  for bare hands, which nothing targets. */
  maxHealth: Decimal;
  crit: CritStats;
}

/** The team's cards in order: the fighting loadout's main then supports, owned fighting cards
 *  only, each once. */
export function teamCardIds(state: GameState, content: Content): string[] {
  const l = state.cards.loadouts.fighting;
  const out: string[] = [];
  for (const id of [l.main, ...l.supports]) {
    if (!id || out.includes(id) || !state.cards.owned[id]) continue;
    if (content.cardById.get(id)?.job !== 'fighting') continue;
    out.push(id);
  }
  return out;
}

/** The skill a card fights with: its own (a unique), else its weapon type's (skills.json). */
export function cardSkill(content: Content, cardId: string): Skill {
  const own = content.skills.cards[cardId];
  const card = content.cardById.get(cardId);
  const kind = card?.item.kind as keyof Content['skills']['weapons'] | undefined;
  const id =
    own ?? (kind ? content.skills.weapons[kind] : undefined) ?? content.skills.weapons.sword;
  return content.skillById.get(id) ?? content.skills.skills[0]!;
}

/**
 * The team as the fight uses it, after `modifiers` (collectModifiers: the main card's main ability
 * is in it, which is taken out so each card adds only its own). Bare hands stand in for an empty
 * loadout: the unarmed damage, no health.
 */
export function buildTeam(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[],
  dungeonId: string | null,
): TeamCard[] {
  const ids = teamCardIds(state, content);
  const main = state.cards.loadouts.fighting.main;
  const shared = modifiers.filter(
    (m) => !(main && m.source.kind === 'card' && m.source.id === main),
  );
  const ctx: StatContext = dungeonId
    ? { job: 'fighting', dungeon: dungeonId }
    : { job: 'fighting' };
  if (ids.length === 0) {
    const burst = burstStats(content, 'fighting', shared);
    const crit = critStats(content, shared, dungeonId);
    const dps = Decimal.max(
      computeStat('combat.damage', content.combat.unarmedDamage, shared, ctx).value,
      0,
    ).mul(critFactor(crit));
    const hit = dps.mul(burst.interval);
    const skill = content.skillById.get(content.skills.weapons.sword)!;
    return [
      {
        id: '',
        slot: 0,
        skill,
        interval: burst.interval,
        fill: burst.fill,
        size: burst.size,
        hit,
        signature: hit.mul(burst.power),
        heal: 0,
        maxHealth: new Decimal(0),
        crit,
      },
    ];
  }
  // The team's health modifiers act on the sum of its cards' health; each card keeps its share.
  const healthCtx: StatContext = dungeonId ? { dungeon: dungeonId } : {};
  const healths = ids.map((id) => cardHealth(content, id, state.cards.owned[id]!));
  const sum = healths.reduce((a, b) => a.add(b), new Decimal(0));
  const total = Decimal.max(computeStat('combat.health', sum, modifiers, healthCtx).value, 0);
  const healthFactor = sum.gt(0) ? total.div(sum) : new Decimal(0);
  return ids.map((id, slot): TeamCard => {
    const owned = state.cards.owned[id]!;
    const skill = cardSkill(content, id);
    const mods = [...shared, ...cardEffectModifiers(content, id, 'main', owned)];
    const burst = burstStats(content, 'fighting', mods);
    const crit = critStats(content, mods, dungeonId);
    const dps = Decimal.max(
      computeStat('combat.damage', cardBaseDamage(content, id, owned), mods, ctx).value,
      0,
    )
      .mul(skill.damage)
      .mul(critFactor(crit));
    const hit = dps.mul(burst.interval);
    const heals = skill.signature.kind === 'heal';
    return {
      id,
      slot,
      skill,
      interval: burst.interval,
      fill: burst.fill,
      size: burst.size,
      hit,
      signature: heals ? new Decimal(0) : hit.mul(burst.power),
      heal: skill.signature.kind === 'heal' ? skill.signature.share : 0,
      maxHealth: healths[slot]!.mul(healthFactor).mul(skill.health),
      crit,
    };
  });
}

// ---- hits on the clock -----------------------------------------------------------------------

/** Hits a card has landed by `t` seconds of play time (hit k lands at k × interval). */
export function hitsBy(card: TeamCard, t: number): number {
  return Math.max(0, Math.floor(t / card.interval + EPSILON));
}

/** Signatures fired within a card's first `hits` hits. */
function signaturesIn(card: TeamCard, hits: number): number {
  if (card.fill <= 0) return 0;
  return Math.floor((hits * card.fill) / card.size + EPSILON);
}

/** Signatures a card fired by `t` seconds of play time. */
export function signaturesBy(card: TeamCard, t: number): number {
  return signaturesIn(card, hitsBy(card, t));
}

/** How full a card's gauge is at `t`, 0..1 (for the UI). */
export function gaugeAt(card: TeamCard, t: number): number {
  if (card.fill <= 0) return 0;
  const points = hitsBy(card, t) * card.fill;
  const left = points - signaturesIn(card, hitsBy(card, t)) * card.size;
  return Math.min(1, Math.max(0, left / card.size));
}

/** The hits and signatures of one card in (t0, t1]. */
export function cardRun(card: TeamCard, t0: number, t1: number): { hits: number; bursts: number } {
  if (!(t1 > t0)) return { hits: 0, bursts: 0 };
  const h0 = hitsBy(card, t0);
  const h1 = hitsBy(card, t1);
  return { hits: h1 - h0, bursts: signaturesIn(card, h1) - signaturesIn(card, h0) };
}

/** Damage the cards deal in (t0, t1], times `factor` (the stage's star damage). */
export function teamDealt(cards: readonly TeamCard[], t0: number, t1: number, factor = 1): Decimal {
  let dealt = new Decimal(0);
  for (const card of cards) {
    const run = cardRun(card, t0, t1);
    if (run.hits > 0) dealt = dealt.add(card.hit.mul(run.hits));
    if (run.bursts > 0 && card.signature.gt(0)) dealt = dealt.add(card.signature.mul(run.bursts));
  }
  return factor === 1 ? dealt : dealt.mul(factor);
}

/** Hits the cards land in (t0, t1]. */
export function teamHits(cards: readonly TeamCard[], t0: number, t1: number): number {
  let n = 0;
  for (const card of cards) n += cardRun(card, t0, t1).hits;
  return n;
}

/** The latest hit time of any card at or before `t`, above `t0`; `t0` when none. */
function lastHitAt(cards: readonly TeamCard[], t0: number, t: number): number {
  let at = t0;
  for (const card of cards) {
    const h = hitsBy(card, t);
    if (h > hitsBy(card, t0)) at = Math.max(at, h * card.interval);
  }
  return at;
}

/**
 * Seconds from `t0` until `measure(t)` (counted over (t0, t]) reaches `goal`, landing on the hit
 * that gets there, or null when the hits within `maxSeconds` do not. `measure` must grow with t
 * and change only on the cards' hits.
 */
export function secondsUntil(
  cards: readonly TeamCard[],
  t0: number,
  maxSeconds: number,
  measure: (t: number) => Decimal | number,
  goal: Decimal | number,
): number | null {
  if (!(maxSeconds > 0)) return null;
  const reached = (t: number): boolean => {
    const m = measure(t);
    return typeof m === 'number' ? m >= Number(goal) : m.gte(goal);
  };
  let hi = t0 + maxSeconds;
  if (!reached(hi)) return null;
  let lo = t0;
  for (let i = 0; i < 200 && hi - lo > 1e-12 * Math.max(1, hi); i++) {
    const mid = (lo + hi) / 2;
    if (reached(mid)) hi = mid;
    else lo = mid;
  }
  // Land on the hit that got there (the measure only changes on hits).
  const snapped = lastHitAt(cards, t0, hi);
  const at = snapped > t0 && reached(snapped) ? snapped : hi;
  return Math.min(maxSeconds, Math.max(DUE_HIT_SECONDS, at - t0));
}

/** Seconds from `t0` until the cards have dealt `hp` (times `factor`), or null past `maxSeconds`. */
export function secondsToDealTeam(
  cards: readonly TeamCard[],
  t0: number,
  hp: Decimal,
  maxSeconds: number,
  factor = 1,
): number | null {
  return secondsUntil(cards, t0, maxSeconds, (t) => teamDealt(cards, t0, t, factor), hp);
}

/** Seconds from `t0` until the cards have landed `hits` hits, or null past `maxSeconds`. */
export function secondsToHits(
  cards: readonly TeamCard[],
  t0: number,
  hits: number,
  maxSeconds: number,
): number | null {
  return secondsUntil(cards, t0, maxSeconds, (t) => teamHits(cards, t0, t), hits);
}

/** Play-time second of the next heal after `t` among the healers, or Infinity. */
export function nextHealAt(cards: readonly TeamCard[], t: number): number {
  let at = Infinity;
  for (const card of cards) {
    if (card.heal <= 0 || card.fill <= 0) continue;
    const g = signaturesBy(card, t);
    let k = Math.max(hitsBy(card, t) + 1, Math.ceil(((g + 1) * card.size) / card.fill - EPSILON));
    while (signaturesIn(card, k) < g + 1) k++;
    while (k - 1 > hitsBy(card, t) && signaturesIn(card, k - 1) >= g + 1) k--;
    at = Math.min(at, k * card.interval);
  }
  return at;
}

// ---- health ----------------------------------------------------------------------------------

/** Anything holding the team cards' damage: a state, or a view of one. */
export interface Damaged {
  combat: { cardDamage: Record<string, Decimal> };
}

/** Damage a card's health has taken (0 = full). */
export function damageTaken(state: Damaged, id: string): Decimal {
  return state.combat.cardDamage[id] ?? new Decimal(0);
}

/** Whether a card still fights: bare hands always; a card while its health is above 0. */
export function isStanding(state: Damaged, card: TeamCard): boolean {
  if (card.maxHealth.lte(0)) return true;
  return damageTaken(state, card.id).lt(card.maxHealth);
}

/** The cards still fighting. */
export function standingCards(state: Damaged, team: readonly TeamCard[]): TeamCard[] {
  return team.filter((c) => isStanding(state, c));
}

/** The card the enemy hits next: the first standing guard, else the first standing card from the
 *  left (bare hands are never hit); null when none can be hit. */
export function enemyTarget(state: Damaged, team: readonly TeamCard[]): TeamCard | null {
  const hittable = team.filter((c) => c.maxHealth.gt(0) && isStanding(state, c));
  return hittable.find((c) => c.skill.guard) ?? hittable[0] ?? null;
}

/** What the enemy's attacks are multiplied by: each standing card's weaken takes its share off. */
export function weakenFactor(state: Damaged, team: readonly TeamCard[]): number {
  let f = 1;
  for (const c of team) if (c.skill.weaken > 0 && isStanding(state, c)) f *= 1 - c.skill.weaken;
  return f;
}

/** The team's max health, every card summed. */
export function teamMaxHealth(team: readonly TeamCard[]): Decimal {
  return team.reduce((a, c) => a.add(c.maxHealth), new Decimal(0));
}

/** The team's health left, every standing card summed. */
export function teamHealthLeft(state: Damaged, team: readonly TeamCard[]): Decimal {
  return team.reduce(
    (a, c) => a.add(Decimal.max(c.maxHealth.sub(damageTaken(state, c.id)), 0)),
    new Decimal(0),
  );
}

/** Heals every standing card by `share` of its max health, `times` times (a state being built). */
export function healTeam(
  next: GameState,
  team: readonly TeamCard[],
  share: number,
  times: number,
): void {
  if (share <= 0 || times <= 0) return;
  for (const c of team) {
    if (c.maxHealth.lte(0) || !isStanding(next, c)) continue;
    const taken = damageTaken(next, c.id);
    if (taken.lte(0)) continue;
    const left = taken.sub(c.maxHealth.mul(share * times));
    if (left.lte(0)) delete next.combat.cardDamage[c.id];
    else next.combat.cardDamage[c.id] = left;
  }
}

/** Average damage per second of one card: hits, signature attacks and crits at their expected
 *  value (before the stage's star damage). */
export function cardAverageDps(card: TeamCard): Decimal {
  const perHit = card.fill > 0 ? card.signature.mul(card.fill / card.size) : new Decimal(0);
  return card.hit.add(perHit).div(card.interval);
}

/** The team's average damage per second. */
export function teamAverageDps(team: readonly TeamCard[]): Decimal {
  return team.reduce((a, c) => a.add(cardAverageDps(c)), new Decimal(0));
}

/** Hits the team lands per second. */
export function teamHitRate(team: readonly TeamCard[]): number {
  return team.reduce((a, c) => a + 1 / c.interval, 0);
}

/**
 * Number of the enemy attack that knocks out the last standing card, when attacks `after + 1` on
 * land on the team from `damage` (one card at a time, `enemyTarget`, with the weaken of the cards
 * still standing). `normal` is the floor's normal attack before weaken; heals are left out.
 */
export function teamLethalAttack(
  damage: Record<string, Decimal>,
  team: readonly TeamCard[],
  normal: Decimal,
  after: number,
  pattern: BossPattern,
): number {
  const view: Damaged = { combat: { cardDamage: { ...damage } } };
  let k = after;
  for (let target = enemyTarget(view, team); target; target = enemyTarget(view, team)) {
    const hit = normal.mul(weakenFactor(view, team));
    if (hit.lte(0)) return Number.MAX_SAFE_INTEGER;
    const pool = Decimal.max(target.maxHealth.sub(damageTaken(view, target.id)), 0);
    k = lethalBossAttack(pool, hit, k, pattern);
    if (k >= Number.MAX_SAFE_INTEGER) return k;
    view.combat.cardDamage[target.id] = target.maxHealth;
  }
  return k;
}
