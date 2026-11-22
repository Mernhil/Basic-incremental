import type { Content, Skill } from '../data';
import { cardBaseDamage, cardEffectModifiers, cardHealth } from './cards';
import { lethalBossAttack, type BossPattern } from './bossAttacks';
import { burstStats, critFactor, critStats, type CritStats } from './combat';
import { challengeExcludedCards } from './challenges';
import { computeStat, type Modifier, type StatContext } from './modifiers';
import { Decimal } from './num';
import { isFrontSlot, type GameState } from './state';
import type { BossAbility } from './bossAttacks';
import { heirloomSkill } from './heirlooms';
import { elementDamagePercent } from './elements';
import { applyMoves, cardMoves, type CardMoves, type HealShare, type MoveFighter } from './moves';
import type { MoveEffectKind } from '../data';

/**
 * The card duel's rules (DESIGN.md §6 "The fight is a first-person card duel", "The team of 4 in
 * numbers"): the fighting team is the loadout's four equal cards, left to right.
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
  /** Position in the team, 0 (leftmost) to 3. */
  slot: number;
  /** The loadout slot it stands in (0 to 3, left to right) and its row (DESIGN.md §5 Loadouts). */
  position: number;
  row: 'front' | 'back';
  skill: Skill;
  /** Seconds between hits, gauge points a hit and points to fire (burstStats with its own
   *  ability). */
  interval: number;
  fill: number;
  size: number;
  /** Damage of one normal hit (crits at their expected value, the skill's damage factor in). */
  hit: Decimal;
  /** Extra damage of a signature attack on top of its hit; 0 when the signature heals. */
  signature: Decimal;
  /** Share of each standing card's max health its ultimate heals (the team heal of `heals`). */
  heal: number;
  /** What its ultimate heals each time it fires (DESIGN.md §2 Three attacks per card). */
  heals: HealShare[];
  /** Share the enemy's attacks lose while it stands, from its moves (Weaken and Stagger). */
  weaken: number;
  /** Its moves (null for bare hands), and seconds between its skills (0 with none open). */
  moves: CardMoves | null;
  skillEvery: number;
  /** Max health (its card health, the team's `combat.health` modifiers, the skill's factor). 0
   *  for bare hands, which nothing targets. */
  maxHealth: Decimal;
  crit: CritStats;
}

/** The team's cards with the loadout slot each stands in, left to right: owned fighting cards
 *  only, each once, without the cards a challenge rule leaves out. */
export function teamPlacements(
  state: GameState,
  content: Content,
): { id: string; position: number }[] {
  const excluded = challengeExcludedCards(state, content);
  const out: { id: string; position: number }[] = [];
  state.cards.loadouts.fighting.slots.forEach((id, position) => {
    if (!id || out.some((p) => p.id === id) || excluded.includes(id)) return;
    if (!state.cards.owned[id] || content.cardById.get(id)?.job !== 'fighting') return;
    out.push({ id, position });
  });
  return out;
}

/** The team's cards in order: the fighting loadout's cards left to right. */
export function teamCardIds(state: GameState, content: Content): string[] {
  return teamPlacements(state, content).map((p) => p.id);
}

/** The passive a card fights with (guard, damage, health): an Heirloom's tree capstone's (with
 *  `state`), else its weapon type's (skills.json). What it fires is its moves (moves.ts). */
export function cardSkill(content: Content, cardId: string, state?: GameState): Skill {
  const fromTree = state ? heirloomSkill(state, content, cardId) : null;
  if (fromTree) return fromTree;
  const card = content.cardById.get(cardId);
  const kind = card?.item.kind as keyof Content['skills']['weapons'] | undefined;
  const id = (kind ? content.skills.weapons[kind] : undefined) ?? content.skills.weapons.sword;
  return content.skillById.get(id) ?? content.skills.skills[0]!;
}

/** The card a modifier belongs to alone, or null when it is the team's: an element bonus
 *  (source id `<dungeon>:<card>`) or an Heirloom's signature power (`<card>:signature`). */
function ownerOf(m: Modifier): string | null {
  if (m.source.kind === 'element' && m.stat === 'combat.damage') {
    return m.source.id.slice(m.source.id.lastIndexOf(':') + 1);
  }
  if (m.source.kind === 'heirloom' && m.source.id.endsWith(':signature')) {
    return m.source.id.slice(0, m.source.id.indexOf(':'));
  }
  return null;
}

/**
 * What the team and each card fight with: `shared` is every modifier that is the team's (team
 * bonuses, tree, mastery, Training...), and `forCard` adds what is the card's own on top of it: its
 * Ability, then its element bonus and its Heirloom signature power (last, so a signature `set`
 * lands on the ability's). Every card fights with its own and none leaks to another (DESIGN.md §5
 * Loadouts).
 */
export function teamModifiers(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[],
): { shared: Modifier[]; forCard: (id: string) => Modifier[] } {
  const shared: Modifier[] = [];
  const own = new Map<string, Modifier[]>();
  for (const m of modifiers) {
    const owner = ownerOf(m);
    if (owner === null) shared.push(m);
    else if (own.has(owner)) own.get(owner)!.push(m);
    else own.set(owner, [m]);
  }
  return {
    shared,
    forCard: (id) => {
      const owned = state.cards.owned[id];
      const ability = owned ? cardEffectModifiers(content, id, 'ability', owned) : [];
      return [...shared, ...ability, ...(own.get(id) ?? [])];
    },
  };
}

/**
 * The team as the fight uses it, after `modifiers` (collectModifiers: the cards' team bonuses are
 * in it; each card adds only its own ability, element and signature power). Bare hands stand in
 * for an empty loadout: the unarmed damage, no health.
 */
export function buildTeam(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[],
  dungeonId: string | null,
): TeamCard[] {
  const placed = teamPlacements(state, content);
  const ids = placed.map((p) => p.id);
  const { shared, forCard } = teamModifiers(state, content, modifiers);
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
        position: 1,
        row: 'front',
        skill,
        interval: burst.interval,
        fill: burst.fill,
        size: burst.size,
        hit,
        signature: hit.mul(burst.power),
        heal: 0,
        heals: [],
        weaken: 0,
        moves: null,
        skillEvery: 0,
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
  const base = ids.map((id, slot): TeamCard => {
    const owned = state.cards.owned[id]!;
    const skill = cardSkill(content, id, state);
    const mods = forCard(id);
    const burst = burstStats(content, 'fighting', mods);
    const crit = critStats(content, mods, dungeonId);
    const dps = Decimal.max(
      computeStat('combat.damage', cardBaseDamage(content, id, owned), mods, ctx).value,
      0,
    )
      .mul(skill.damage)
      .mul(critFactor(crit));
    const hit = dps.mul(burst.interval);
    const position = placed[slot]!.position;
    // A tree skill that heals with the signature still does, with the ultimate.
    const tree = heirloomSkill(state, content, id);
    const treeHeal = tree?.signature.kind === 'heal' ? tree.signature.share : 0;
    return {
      id,
      slot,
      position,
      row: isFrontSlot(position) ? 'front' : 'back',
      skill,
      interval: burst.interval,
      fill: burst.fill,
      size: burst.size,
      hit,
      signature: hit.mul(burst.power),
      heal: treeHeal,
      heals: treeHeal > 0 ? [{ on: 'team', share: treeHeal }] : [],
      weaken: 0,
      moves: cardMoves(content, id, owned, mods),
      skillEvery: 0,
      maxHealth: healths[slot]!.mul(healthFactor).mul(skill.health),
      crit,
    };
  });
  return withMoves(content, base, dungeonId);
}

/** The team after its moves (moves.ts `applyMoves`): the skills, the ultimates and their effects. */
function withMoves(content: Content, team: TeamCard[], dungeonId: string | null): TeamCard[] {
  const fighters = team.map((c): MoveFighter => {
    const element = c.moves?.element ?? null;
    const percent =
      element && dungeonId ? elementDamagePercent(content, dungeonId, element).toNumber() : 0;
    return {
      row: c.row,
      interval: c.interval,
      fill: c.fill,
      size: c.size,
      hit: c.hit,
      signature: c.signature,
      maxHealth: c.maxHealth,
      critChance: c.crit.chance,
      critDamage: c.crit.damage,
      element,
      resisted: percent < 0 && percent > -100 ? 1 / (1 + percent / 100) - 1 : 0,
      moves: c.moves,
    };
  });
  const out = applyMoves(fighters);
  return team.map((c, i) => {
    const o = out[i]!;
    const heals = [...c.heals];
    for (const h of o.heals) {
      const same = heals.find((x) => x.on === h.on);
      if (same) same.share += h.share;
      else heals.push({ ...h });
    }
    return {
      ...c,
      interval: o.interval,
      fill: o.fill,
      hit: o.hit,
      signature: o.signature,
      heals,
      heal: heals.filter((h) => h.on === 'team').reduce((a, h) => a + h.share, 0),
      weaken: o.weaken,
      skillEvery: o.skillEvery,
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
    if (card.heals.length === 0 || card.fill <= 0) continue;
    const g = signaturesBy(card, t);
    let k = Math.max(hitsBy(card, t) + 1, Math.ceil(((g + 1) * card.size) / card.fill - EPSILON));
    while (signaturesIn(card, k) < g + 1) k++;
    while (k - 1 > hitsBy(card, t) && signaturesIn(card, k - 1) >= g + 1) k--;
    at = Math.min(at, k * card.interval);
  }
  return at;
}

// ---- health ----------------------------------------------------------------------------------

/** Anything holding the team cards' damage and who is out: a state, or a view of one. */
export interface Damaged {
  combat: { cardDamage: Record<string, Decimal>; cardsOut: string[]; enemyIndex?: number };
}

/** Damage a card's health has taken (0 = full). */
export function damageTaken(state: Damaged, id: string): Decimal {
  return state.combat.cardDamage[id] ?? new Decimal(0);
}

/**
 * Whether a card still fights: bare hands always; a card until it is knocked out. Being out is
 * the saved list `combat.cardsOut`, not the damage against the max health, so a card whose max
 * health rises while it is out (a level-up from fighting XP) stays out until the floor is won
 * (DESIGN.md §6 card duel).
 */
export function isStanding(state: Damaged, card: TeamCard): boolean {
  if (card.maxHealth.lte(0)) return true;
  if (state.combat.cardsOut.includes(card.id)) return false;
  return damageTaken(state, card.id).lt(card.maxHealth);
}

/** Knocks a card out (a state being built): its health is empty and it stays out until the floor
 *  is won. */
export function knockOut(next: Damaged, card: TeamCard): void {
  next.combat.cardDamage[card.id] = card.maxHealth;
  if (!next.combat.cardsOut.includes(card.id)) next.combat.cardsOut.push(card.id);
}

/** Every card back at full health and standing (a state being built): a cleared floor, a new
 *  Challenge, the end of a knockout. */
export function reviveTeam(next: Damaged): void {
  next.combat.cardDamage = {};
  next.combat.cardsOut = [];
}

/** The cards still fighting. */
export function standingCards(state: Damaged, team: readonly TeamCard[]): TeamCard[] {
  return team.filter((c) => isStanding(state, c));
}

/** A repeatable pick in `0 .. n - 1` from a seed (a hash, so neighbours differ). */
function seededIndex(seed: number, n: number): number {
  return (Math.imul((seed | 0) + 1, 2654435761) >>> 16) % n;
}

/**
 * The card an enemy's direct attack hits next (DESIGN.md §6 team of 4): in the front row, the
 * standing guard first, else one of the standing cards picked at random (a pick seeded by the
 * fight's own state: the enemy being fought and how many cards are out, so it repeats exactly);
 * only when no front card stands, the back row the same way. An empty front slot is out, so it
 * has no card here. Bare hands are never hit; null when none can be hit.
 */
export function enemyTarget(state: Damaged, team: readonly TeamCard[]): TeamCard | null {
  const hittable = team.filter((c) => c.maxHealth.gt(0) && isStanding(state, c));
  const front = hittable.filter((c) => c.row === 'front');
  const pool = front.length > 0 ? front : hittable;
  const guard = pool.find((c) => c.skill.guard);
  if (guard) return guard;
  if (pool.length === 0) return null;
  return pool[
    seededIndex((state.combat.enemyIndex ?? 0) + state.combat.cardsOut.length * 7, pool.length)
  ]!;
}

/**
 * The cards a boss ability hits when attack `k` lands (DESIGN.md §6 Boss abilities): the row it
 * names (every standing card of it, the back row's lone card for one back card), falling to the
 * other row when none of that one stands; a guard redirects nothing.
 */
export function abilityTargets(
  state: Damaged,
  team: readonly TeamCard[],
  ability: BossAbility,
  k: number,
): TeamCard[] {
  const hittable = team.filter((c) => c.maxHealth.gt(0) && isStanding(state, c));
  const front = hittable.filter((c) => c.row === 'front');
  const back = hittable.filter((c) => c.row === 'back');
  switch (ability.target) {
    case 'front':
      return front.length > 0 ? front : back;
    case 'back':
      return back.length > 0 ? back : front;
    case 'back-one': {
      const pool = back.length > 0 ? back : front;
      return pool.length > 0 ? [pool[seededIndex(k, pool.length)]!] : [];
    }
    case 'all':
      return hittable;
    case 'lowest': {
      const left = (c: TeamCard): Decimal =>
        Decimal.max(c.maxHealth.sub(damageTaken(state, c.id)), 0);
      const lowest = hittable.reduce<TeamCard | null>(
        (m, c) => (m === null || left(c).lt(left(m)) ? c : m),
        null,
      );
      return lowest ? [lowest] : [];
    }
  }
}

/** What the enemy's attacks are multiplied by: each standing card's weaken (its passive and its
 *  moves' Weaken and Stagger) takes its share off. */
export function weakenFactor(state: Damaged, team: readonly TeamCard[]): number {
  let f = 1;
  for (const c of team) {
    if (!isStanding(state, c)) continue;
    if (c.skill.weaken > 0) f *= 1 - c.skill.weaken;
    if (c.weaken > 0) f *= 1 - c.weaken;
  }
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

/**
 * What a card's ultimate heals, `times` times (a state being built): each share lands on its
 * target among the standing cards (the card itself, a row, the team, or the card with the least
 * health left).
 */
export function healFromMoves(
  next: GameState,
  team: readonly TeamCard[],
  source: TeamCard,
  times: number,
): void {
  if (times <= 0) return;
  const standing = team.filter((c) => c.maxHealth.gt(0) && isStanding(next, c));
  for (const h of source.heals) {
    let targets: TeamCard[];
    switch (h.on) {
      case 'self':
        targets = standing.filter((c) => c.id === source.id);
        break;
      case 'front':
      case 'back':
        targets = standing.filter((c) => c.row === h.on);
        break;
      case 'lowest': {
        const left = (c: TeamCard): Decimal => c.maxHealth.sub(damageTaken(next, c.id));
        const low = standing.reduce<TeamCard | null>(
          (m, c) => (m === null || left(c).lt(left(m)) ? c : m),
          null,
        );
        targets = low ? [low] : [];
        break;
      }
      default:
        targets = standing;
    }
    healTeam(next, targets, h.share, times);
  }
}

/** What each card and the enemy are under at `t` seconds of play time, from the skills and
 *  ultimates that fired, for the stage's labels (show only: the fight deals the averages). */
export interface ActiveEffects {
  cards: Record<string, MoveEffectKind[]>;
  enemy: MoveEffectKind[];
}

/** One-off effects (a heal, a shield) show this long on the stage. */
const SHOW_ONE_OFF_SECONDS = 1.5;

export function activeEffects(team: readonly TeamCard[], t: number): ActiveEffects {
  const out: ActiveEffects = { cards: {}, enemy: [] };
  const add = (list: MoveEffectKind[], k: MoveEffectKind): void => {
    if (!list.includes(k)) list.push(k);
  };
  const on = (source: TeamCard, target: string): TeamCard[] => {
    switch (target) {
      case 'self':
        return [source];
      case 'front':
      case 'back':
        return team.filter((c) => c.row === target);
      case 'row':
        return team.filter((c) => c.row === source.row);
      case 'enemy':
        return [];
      case 'emptiest':
        return team.length > 1 ? [team.find((c) => c.id !== source.id)!] : [source];
      default:
        return [...team];
    }
  };
  for (const card of team) {
    const m = card.moves;
    if (!m) continue;
    const fired: { at: number; effects: typeof m.ult.effects }[] = [];
    if (m.skill?.open && card.skillEvery > 0 && t >= card.skillEvery) {
      fired.push({
        at: Math.floor(t / card.skillEvery + EPSILON) * card.skillEvery,
        effects: m.skill.effects,
      });
    }
    const ults = signaturesBy(card, t);
    if (ults > 0 && card.fill > 0) {
      const k = Math.ceil((ults * card.size) / card.fill - EPSILON);
      fired.push({ at: k * card.interval, effects: m.ult.effects });
    }
    for (const f of fired) {
      for (const e of f.effects) {
        const lasts =
          e.seconds === undefined ? SHOW_ONE_OFF_SECONDS : e.seconds === 0 ? Infinity : e.seconds;
        if (t - f.at > lasts) continue;
        if (e.on === 'enemy') add(out.enemy, e.kind);
        else for (const c of on(card, e.on)) add((out.cards[c.id] ??= []), e.kind);
      }
    }
  }
  return out;
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
  state: Damaged,
  team: readonly TeamCard[],
  normal: Decimal,
  after: number,
  pattern: BossPattern,
  abilities: readonly BossAbility[] = [],
): number {
  const view: Damaged = {
    combat: {
      cardDamage: { ...state.combat.cardDamage },
      cardsOut: [...state.combat.cardsOut],
      ...(state.combat.enemyIndex !== undefined ? { enemyIndex: state.combat.enemyIndex } : {}),
    },
  };
  let k = after;
  for (let target = enemyTarget(view, team); target; target = enemyTarget(view, team)) {
    const hit = normal.mul(weakenFactor(view, team));
    if (hit.lte(0)) return Number.MAX_SAFE_INTEGER;
    const pool = Decimal.max(target.maxHealth.sub(damageTaken(view, target.id)), 0);
    k = lethalBossAttack(pool, hit, k, pattern, abilities);
    if (k >= Number.MAX_SAFE_INTEGER) return k;
    knockOut(view, target);
  }
  return k;
}
