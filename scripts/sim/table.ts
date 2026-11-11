/**
 * The sim player's choices for the systems of the table update (DESIGN.md §14 The sim player's
 * choices): floor Challenges and auto-challenge, the team of four, scrolls and the Focus Portal,
 * expeditions and Ascension challenges. Pure functions over the real game rules; `sim.ts` calls
 * them from its buyer and its run loop.
 */
import { RARITIES, type Content, type Portal } from '../../src/data';
import {
  buildTeam,
  cardSkill,
  challengeById,
  challengeCompletions,
  challengeSeconds,
  challengeTarget,
  collectModifiers,
  collectTrip,
  Decimal,
  expeditionSlots,
  fightStage,
  floorPosition,
  floorSpec,
  forgeWorker,
  FOCUS_PORTAL_ID,
  isOnTrip,
  isRestricted,
  isTripDone,
  activeWorkers,
  loadoutCards,
  openPlaces,
  resolvePortal,
  secondsPerKill,
  setLoadout,
  startChallengeProblem,
  startTrip,
  survivalSeconds,
  teamMaxHealth,
  workerSlots,
  workersUsed,
  type CardLoadout,
  type Difficulty,
  type GameState,
  type Modifier,
} from '../../src/game';

const num = (d: Decimal): number => d.toNumber();

// ---- floor Challenges (DESIGN.md §6 Farming and Challenge) -------------------------------------

/**
 * The share of the lost health a healer gives back is capped here: the estimate below never more
 * than quadruples the time the team lasts.
 */
const HEAL_FLOOR = 0.25;

/**
 * Seconds the team lasts on a floor from full health: the game's own `survivalSeconds` (guards
 * first, debuffers' weaken, no heals), stretched by the healers' signature heals. A healer's
 * signature heals every standing card by its share of that card's health once every `size / fill`
 * hits, so against an enemy that takes `incoming` of the team's health a second, the team loses
 * health `1 - healing / incoming` times as fast (at least HEAL_FLOOR).
 */
export function teamSurvival(
  state: GameState,
  content: Content,
  dungeonId: string,
  modifiers: readonly Modifier[],
  floor?: number,
  difficulty?: Difficulty,
): number | null {
  const base = survivalSeconds(state, content, dungeonId, modifiers, floor, difficulty);
  if (base === null) return null;
  const stage = fightStage(state, content, dungeonId, modifiers, floor, difficulty);
  if (!stage) return base;
  const team = buildTeam(state, content, modifiers, dungeonId);
  const health = teamMaxHealth(team);
  if (health.lte(0) || stage.attack.lte(0)) return base;
  const weaken = team.reduce((f, c) => f * (1 - c.skill.weaken), 1);
  const incoming = num(stage.attack.mul(weaken).div(stage.intervalSeconds).div(health));
  const healing = team.reduce(
    (sum, c) => sum + (c.heal > 0 ? (c.heal * c.fill) / (c.size * c.interval) : 0),
    0,
  );
  if (!(incoming > 0) || healing <= 0) return base;
  return base / Math.max(HEAL_FLOOR, 1 - healing / incoming);
}

/**
 * How well the team does in the next Challenge of a dungeon (on its chosen difficulty, or
 * `difficulty`): the time it has, the shorter of its timer and the time the team lasts, over the
 * time the floor takes. 1 or more wins it; null when there is nothing to challenge (the last floor
 * of a tier); 0 when the team deals no damage.
 */
export function challengeMargin(
  state: GameState,
  content: Content,
  dungeonId: string,
  modifiers: readonly Modifier[],
  difficulty?: Difficulty,
): number | null {
  const dungeon = content.dungeonById.get(dungeonId);
  if (!dungeon) return null;
  const position = floorPosition(state, dungeon, difficulty);
  const floor = position.challengeFloor;
  if (floor === null) return null;
  const at = position.difficulty;
  const spk = secondsPerKill(state, content, dungeonId, modifiers, floor, at);
  if (spk === null || !Number.isFinite(spk) || spk <= 0) return 0;
  const timer = challengeSeconds(content, floorSpec(content, dungeon, at, floor).kind);
  const lasts = teamSurvival(state, content, dungeonId, modifiers, floor, at) ?? Infinity;
  return Math.min(lasts, timer) / spk;
}

/** A Challenge is counted as won when its margin is at least this (a little room for crits). */
export const CHALLENGE_WIN = 1.1;
/** Below this margin a Challenge is not worth trying by hand (`chooseAutoChallenge`). */
export const CHALLENGE_TRY_MARGIN = 0.7;

/** What stops the team at the next Challenge: its health, its damage (the timer), or nothing. */
export function challengeWall(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): 'health' | 'damage' | null {
  const id = state.activeDungeonId;
  const dungeon = id ? content.dungeonById.get(id) : undefined;
  if (!id || !dungeon) return null;
  const margin = challengeMargin(state, content, id, modifiers);
  if (margin === null || margin >= CHALLENGE_WIN) return null;
  const position = floorPosition(state, dungeon);
  const floor = position.challengeFloor!;
  const timer = challengeSeconds(
    content,
    floorSpec(content, dungeon, position.difficulty, floor).kind,
  );
  const lasts = teamSurvival(state, content, id, modifiers, floor, position.difficulty) ?? Infinity;
  return lasts < timer ? 'health' : 'damage';
}

// ---- the team of four (DESIGN.md §6 The team of 4) ---------------------------------------------

/** Fighting cards the team may use now: owned, at home, allowed by the run's challenge rule. */
export function teamPool(state: GameState, content: Content): string[] {
  const commonsOnly = isRestricted(state, content, 'commons_only');
  return content.cards
    .filter(
      (c) =>
        c.job === 'fighting' &&
        state.cards.owned[c.id] &&
        !isOnTrip(state, c.id) &&
        (!commonsOnly || c.rarity === 'common'),
    )
    .map((c) => c.id);
}

/** Most rounds of single-slot swaps the team search makes. */
const TEAM_SWAP_ROUNDS = 3;

/**
 * The team for the wall it is at (DESIGN.md §6 card duel): when the team the player picked for
 * damage (`state`'s loadout) loses the next Challenge of the active dungeon, the player tries
 * other supports, one slot at a time (guards, healers, debuffers, bonds and the element all count,
 * through the game's own team and modifiers), keeping the lead it builds, and takes the swaps that
 * bring the Challenge closest. The new team is kept when it wins that Challenge (CHALLENGE_WIN),
 * or when it at least comes close enough to be worth a try by hand (CHALLENGE_TRY_MARGIN, see
 * `chooseAutoChallenge`); otherwise the damage team farms on. Under Lone Wolf the supports count
 * for nothing, so nothing is searched.
 */
export function teamForChallenge(state: GameState, content: Content): GameState {
  const id = state.activeDungeonId;
  if (!id || !content.dungeonById.has(id)) return state;
  if (isRestricted(state, content, 'no_supports')) return state;
  const margin = (s: GameState): number =>
    challengeMargin(s, content, id, collectModifiers(s, content)) ?? Infinity;
  const start = margin(state);
  if (start >= CHALLENGE_WIN) return state;
  const pool = teamPool(state, content);
  let best = state;
  let bestMargin = start;
  for (let round = 0; round < TEAM_SWAP_ROUNDS; round++) {
    let improved = false;
    const loadout = best.cards.loadouts.fighting;
    for (let slot = 0; slot < loadout.supports.length; slot++) {
      for (const card of pool) {
        if (card === loadout.main || loadout.supports.includes(card)) continue;
        const next: CardLoadout = {
          main: loadout.main,
          supports: loadout.supports.map((s, i) => (i === slot ? card : s)),
        };
        const result = setLoadout(best, content, 'fighting', next);
        if (!result.ok) continue;
        const m = margin(result.state);
        if (m > bestMargin * 1.001) {
          bestMargin = m;
          best = result.state;
          improved = true;
        }
      }
    }
    if (!improved || bestMargin >= CHALLENGE_WIN) break;
  }
  return bestMargin >= CHALLENGE_TRY_MARGIN ? best : state;
}

/** The roles of the fighting team, as "striker 2, tank 1, healer 1" (for the report). */
export function teamRoles(state: GameState, content: Content): string {
  const counts = new Map<string, number>();
  for (const id of loadoutCards(state.cards.loadouts.fighting)) {
    const role = cardSkill(content, id).role;
    counts.set(role, (counts.get(role) ?? 0) + 1);
  }
  return (
    [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([role, n]) => `${role} ${n}`)
      .join(', ') || 'none'
  );
}

// ---- scrolls and the Focus Portal (DESIGN.md §7) -----------------------------------------------

/**
 * Whether the player wants cards now, one pull at a time: a slot of the fighting team or a worker
 * slot is still empty. Otherwise it saves its scrolls for 10-pulls, which carry the Rare guarantee
 * at the same price per pull.
 */
export function wantsCardsNow(state: GameState, content: Content): boolean {
  const team = state.cards.loadouts.fighting;
  if (team.main === null || team.supports.some((s) => s === null)) return true;
  return workersUsed(state, content) < workerSlots(state, content);
}

/**
 * What a card from a pull is worth to the player, in units of a new Common fighting card: rarer
 * cards are worth three times the rarity below. A card it does not own counts in full (a worker
 * card 0.6), a copy of the lead it builds in full, of another card it builds 0.6, of a card that
 * still has stars to fill 0.1, and a copy that only becomes shards 0.05.
 */
export function pullCardValue(
  state: GameState,
  content: Content,
  cardId: string,
  building: ReadonlySet<string>,
): number {
  const card = content.cardById.get(cardId);
  if (!card) return 0;
  const worth = 3 ** RARITIES.indexOf(card.rarity);
  const owned = state.cards.owned[cardId];
  if (!owned) return worth * (card.job === 'fighting' ? 1 : 0.6);
  if (owned.stars >= 6) return worth * 0.05;
  if (cardId === state.cards.loadouts.fighting.main) return worth;
  return worth * (building.has(cardId) ? 0.6 : 0.1);
}

/**
 * The expected worth of one pull from a portal's pool (`pullCardValue`): each rarity at its share
 * of the pool's weight; inside a rarity, the wishlisted cards of that rarity take every pull
 * (DESIGN.md §7 wishlist), else each card its weight.
 */
export function pullValue(
  state: GameState,
  content: Content,
  portal: Portal,
  building: ReadonlySet<string>,
): number {
  const total = portal.pool.reduce((a, e) => a + e.weight, 0);
  if (total <= 0) return 0;
  const wish = new Set(state.cards.wishlist);
  let value = 0;
  for (const rarity of RARITIES) {
    const entries = portal.pool.filter((e) => e.rarity === rarity);
    if (entries.length === 0) continue;
    const share = entries.reduce((a, e) => a + e.weight, 0) / total;
    const marked = entries.filter((e) => wish.has(e.itemId));
    const from = marked.length > 0 ? marked : entries;
    const weight = from.reduce((a, e) => a + e.weight, 0);
    const worth = from.reduce(
      (a, e) => a + e.weight * pullCardValue(state, content, e.itemId, building),
      0,
    );
    value += share * (weight > 0 ? worth / weight : 0);
  }
  return value;
}

/** The Focus Portal is used only when a pull there is worth this much more than a Card Portal pull. */
export const FOCUS_MARGIN = 1.1;

/**
 * Which portal the Summon Scrolls go to (DESIGN.md §7 Focus Portal): the Card Portal with its
 * wishlist, or the Focus Portal aimed at the item type whose pulls are worth the most
 * (`pullValue`), when that beats the Card Portal by FOCUS_MARGIN. Null kind = the Card Portal.
 */
export function focusChoice(
  state: GameState,
  content: Content,
  building: ReadonlySet<string>,
): { kind: string | null; value: number; cardValue: number } {
  const card = resolvePortal(state, content, 'card_portal');
  const cardValue = card ? pullValue(state, content, card.portal, building) : 0;
  let best: { kind: string | null; value: number } = { kind: null, value: cardValue };
  for (const type of content.items.types) {
    const aimed = { ...state, summon: { ...state.summon, focusKind: type.kind } };
    const focus = resolvePortal(aimed, content, FOCUS_PORTAL_ID);
    if (!focus || focus.portal.pool.length === 0) continue;
    const value = pullValue(aimed, content, focus.portal, building);
    if (value > best.value) best = { kind: type.kind, value };
  }
  return best.kind !== null && best.value >= cardValue * FOCUS_MARGIN
    ? { ...best, cardValue }
    : { kind: null, value: cardValue, cardValue };
}

// ---- expeditions (DESIGN.md §15 Expeditions) ----------------------------------------------------

/** What collected trips brought back: Core units, gems weighted by tier, card XP. */
export interface TripIncome {
  materials: number;
  gems: number;
  trips: number;
}

/** Roles a player keeps on the bench for the team search instead of sending them away. */
const BENCH_ROLES = new Set(['tank', 'healer', 'debuffer']);

/**
 * Collects every finished trip, then sends idle cards on trips while a slot is free: cards in no
 * loadout, at no work and not away, except the guards, healers and debuffers it may need for a
 * Challenge (`teamForChallenge`). Each goes to an open place of its own element when there is one
 * (double rewards), else to the place of the furthest dungeon (its Core is the rarest); the rarest
 * cards go first. Trips last `hours`.
 */
export function runExpeditions(
  state: GameState,
  content: Content,
  hours: number,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): { state: GameState; income: TripIncome } {
  const income: TripIncome = { materials: 0, gems: 0, trips: 0 };
  let current = state;
  for (const trip of state.expeditions.trips) {
    if (!isTripDone(trip)) continue;
    const result = collectTrip(current, content, trip.cardId);
    if (!result.ok) continue;
    current = result.state;
    income.trips++;
    for (const units of Object.values(result.rewards.materials)) income.materials += units;
    for (const [id, amount] of Object.entries(result.rewards.gems)) {
      income.gems += num(amount) * gemWeight(content, id);
    }
  }
  const places = openPlaces(current, content);
  if (places.length === 0) return { state: current, income };
  const slots = expeditionSlots(current, content, modifiers);
  if (current.expeditions.trips.length >= slots) return { state: current, income };
  const busy = new Set<string>([
    ...loadoutCards(current.cards.loadouts.fighting),
    ...Object.values(activeWorkers(current, content)).flat(),
  ]);
  const forge = forgeWorker(current, content);
  if (forge) busy.add(forge);
  const idle = content.cards
    .filter(
      (c) =>
        current.cards.owned[c.id] &&
        !busy.has(c.id) &&
        !isOnTrip(current, c.id) &&
        !(c.job === 'fighting' && BENCH_ROLES.has(cardSkill(content, c.id).role)),
    )
    .sort((a, b) => RARITIES.indexOf(b.rarity) - RARITIES.indexOf(a.rarity));
  const furthest = places[places.length - 1]!;
  const length = content.expeditions.durationsHours.includes(hours)
    ? hours
    : content.expeditions.durationsHours[0]!;
  for (const card of idle) {
    if (current.expeditions.trips.length >= slots) break;
    const place = places.find((p) => p.element === card.element) ?? furthest;
    const result = startTrip(current, content, card.id, place.id, length);
    if (result.ok) current = result.state;
  }
  return { state: current, income };
}

/** A gem's Starlight tier weight (1, 10, 100), the common measure of gems of different tiers. */
export function gemWeight(content: Content, resource: string): number {
  const weights = content.prestige.gain.tierWeights;
  const tier = content.resourceById.get(resource)?.tier ?? 1;
  return num(weights[Math.min(tier, weights.length) - 1]!);
}

// ---- Ascension challenges (DESIGN.md §15) --------------------------------------------------------

/** A challenge run that has not reached its target after this long is left (seconds). */
export const CHALLENGE_GIVE_UP_SECONDS = 3 * 3600;

/**
 * Whether a challenge run's target looks quick from a run's first state (`startChallenge`'s
 * result, the rule in force): its target floor wins as a Challenge with the team the run starts
 * with. The run's economy only grows from there, so the climb to it is short.
 */
export function challengeLooksQuick(started: GameState, content: Content): boolean {
  const challenge = started.ascensionChallenges.active
    ? challengeById(content, started.ascensionChallenges.active)
    : undefined;
  if (!challenge) return false;
  // The target as it stood before the run: completions have not moved.
  const target = challengeTarget(started, challenge);
  if (!target) return false;
  const dungeon = content.dungeonById.get(target.dungeon);
  if (!dungeon) return false;
  const modifiers = collectModifiers(started, content);
  const spk = secondsPerKill(
    started,
    content,
    target.dungeon,
    modifiers,
    target.floor,
    target.difficulty,
  );
  if (spk === null || !Number.isFinite(spk)) return false;
  const timer = challengeSeconds(
    content,
    floorSpec(content, dungeon, target.difficulty, target.floor).kind,
  );
  const lasts =
    teamSurvival(started, content, target.dungeon, modifiers, target.floor, target.difficulty) ??
    Infinity;
  return Math.min(lasts, timer) >= spk * CHALLENGE_WIN;
}

/** The challenges that can be started now, fewest completions first, then content order. */
export function challengeOrder(state: GameState, content: Content): string[] {
  return content.challenges
    .filter((c) => startChallengeProblem(state, content, c.id) === null)
    .sort((a, b) => challengeCompletions(state, a.id) - challengeCompletions(state, b.id))
    .map((c) => c.id);
}
