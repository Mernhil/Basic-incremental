import type { CardElement, Content, Dungeon } from '../data';
import { teamAverageDps, activeEffects, buildTeam, teamMaxHealth } from './duel';
import { collectModifiers } from './modifiers';
import { EFFECT_WORDS } from './moves';
import { Decimal } from './num';
import { initialProgress } from './floors';
import type { TickReport } from './report';
import type { Rng } from './rng';
import { fightClock } from './speed';
import { cloneState, type GameState } from './state';
import { advance } from './tick';
import type { MoveEffectKind } from '../data';

/**
 * The Training ground's battle (DESIGN.md section 2 Test dummies): the player's chosen team fights
 * a dummy with endless health in the real duel, the same engine as a dungeon (`advance`, hits,
 * skills, ultimates, effects, elements), and the dummy hits back as hard as the player set.
 *
 * How it stays out of the game: the battle runs on a throwaway copy of the state, in a content
 * copy that holds one more dungeon, the dummy's (`TRAINING_DUNGEON`: one floor, a boss with endless
 * health, no drops, no wages). The real state, loadout and fight are never touched, and nothing the
 * copy earns is carried back: no rewards, no XP, no drops. Nothing here is saved.
 */

export const TRAINING_DUNGEON = 'training_dummy';

/** The dummy's health: far more than any team deals, so it is never beaten. */
const ENDLESS_HP = '1e1000';

/** The seconds the rolling damage per second looks back over. */
export const ROLLING_SECONDS = 10;

/** What the player sets before a battle. */
export interface TrainingSettings {
  /** The cards on trial, one per loadout slot (null = empty). */
  team: readonly (string | null)[];
  /** Damage of one dummy attack (before the team's defence). */
  damage: Decimal;
  /** The dummy's element, or null for none. */
  element: CardElement | null;
}

/** How hard the dummy hits, as a share of the trial team's health per attack (the buttons). */
export const DUMMY_STEPS = [
  { id: 'none', share: 0 },
  { id: 'light', share: 0.01 },
  { id: 'medium', share: 0.03 },
  { id: 'heavy', share: 0.1 },
  { id: 'brutal', share: 0.3 },
] as const;
export type DummyStep = (typeof DUMMY_STEPS)[number]['id'];

/** The attack damage a step means for a team: its share of the team's health together. */
export function stepDamage(
  state: GameState,
  content: Content,
  team: readonly (string | null)[],
  step: DummyStep,
): Decimal {
  const share = DUMMY_STEPS.find((s) => s.id === step)?.share ?? 0;
  if (share <= 0) return new Decimal(0);
  const trial = cloneState(state);
  trial.cards.loadouts.fighting.slots = [...team];
  const health = teamMaxHealth(
    buildTeam(trial, content, collectModifiers(trial, content), null).filter((c) => c.id),
  );
  return health.mul(share);
}

/** The content with the dummy's dungeon added: endless health, hits as set, pays nothing. */
export function trainingContent(content: Content, settings: TrainingSettings): Content {
  const dungeon: Dungeon = {
    id: TRAINING_DUNGEON,
    name: 'Training dummy',
    tier: 1,
    enabled: true,
    unlockedBy: null,
    floors: 1,
    enemies: [{ id: 'training_dummy_foe', name: 'Training dummy', hpWeight: 1 }],
    miniBosses: [],
    boss: {
      id: 'training_dummy_boss',
      name: 'Training dummy',
      // an existing picture: there is no dummy art, and none is made here
      art: 'root_warden',
      // no element is a plain boss: the circle treats a missing element as neutral
      element: (settings.element ?? undefined) as unknown as CardElement,
      hp: new Decimal(ENDLESS_HP),
      hpBars: 1,
      attack: {
        // an attack of 0 would not pass the schema; the engine reads 0 as no hit
        damage: Decimal.max(settings.damage, 0),
        intervalSeconds: content.dummy.hitIntervalSeconds,
      },
    },
    drops: {
      rare: { itemId: 'none', chance: 1e-9, pityThreshold: 1_000_000_000 },
      currencies: [],
      wages: [],
      firstClear: [],
      extraMaterials: [],
      material: { resource: 'none', chance: 1e-9, amount: 1 },
    },
  };
  const dungeons = [...content.dungeons, dungeon];
  return {
    ...content,
    dungeons,
    dungeonById: new Map(dungeons.map((d) => [d.id, d])),
  };
}

/** Sets the dummy's hit and element in a content copy made by `trainingContent`. */
export function tuneTrainingContent(tc: Content, settings: TrainingSettings): void {
  const boss = tc.dungeonById.get(TRAINING_DUNGEON)?.boss;
  if (!boss) return;
  boss.attack.damage = Decimal.max(settings.damage, 0);
  boss.element = (settings.element ?? undefined) as unknown as CardElement;
}

/** One row of the effects panel. */
export interface EffectRow {
  kind: MoveEffectKind;
  word: string;
  /** Where it acts: on the dummy, or on our team. */
  on: 'enemy' | 'team';
  /** Share of the battle's seconds it was on, 0..1. */
  uptime: number;
}

/** The numbers the live panel and the summary show. */
export interface TrainingPanel {
  seconds: number;
  total: Decimal;
  /** Damage per second over the last `ROLLING_SECONDS` of the battle. */
  rolling: Decimal;
  /** Damage per second over the whole battle. */
  overall: Decimal;
  best: Decimal;
  /** Each card's damage and its share of the total, in team order. */
  cards: { cardId: string; damage: Decimal; share: number }[];
  /** The damage the dummy dealt to the team, and how many of its attacks landed. */
  taken: Decimal;
  attacks: number;
  /** Cards knocked out, in the order they fell. */
  fallen: string[];
  effects: EffectRow[];
}

/** A battle in progress or over. Mutated by `stepTraining`. */
export interface TrainingRun {
  settings: TrainingSettings;
  /** The content copy with the dummy's dungeon, and the throwaway state fighting in it. */
  content: Content;
  state: GameState;
  /** The cards fighting, in hand order. */
  cardIds: string[];
  /** 'fallen' once the whole team is knocked out; 'stopped' after `stopTraining`; null while it runs. */
  ended: 'fallen' | 'stopped' | null;
  seconds: number;
  total: Decimal;
  best: Decimal;
  perCard: Record<string, Decimal>;
  taken: Decimal;
  attacks: number;
  fallen: string[];
  /** Damage per step, newest last, for the rolling number. */
  recent: { seconds: number; damage: Decimal }[];
  /** Seconds each effect was on, keyed `enemy:kind` or `team:kind`. */
  uptime: Record<string, number>;
}

/** Cards that can be put on trial: the fighting cards owned, once each, one starter at most. */
export function trainingTeam(team: readonly (string | null)[]): string[] {
  return team.filter((id): id is string => id !== null);
}

/** Starts a battle on a copy of `state` with the chosen team. */
export function startTraining(
  state: GameState,
  content: Content,
  settings: TrainingSettings,
  /** A content copy kept by the screen, so one stage serves every restart; its dummy is retuned. */
  shared?: Content,
): TrainingRun {
  const tc = shared ?? trainingContent(content, settings);
  if (shared) tuneTrainingContent(shared, settings);
  const sandbox = cloneState(state);
  sandbox.cards.loadouts.fighting.slots = [...settings.team];
  // no Ascension challenge rule applies to a test; the dummy's floor is the only one fought
  sandbox.ascensionChallenges.active = null;
  sandbox.activeDungeonId = TRAINING_DUNGEON;
  sandbox.combat.challenge = null;
  sandbox.combat.knockoutSeconds = 0;
  sandbox.combat.cardsOut = [];
  sandbox.combat.cardDamage = {};
  sandbox.combat.challengeWaitSeconds = 0;
  sandbox.combat.floors[TRAINING_DUNGEON] = { ...initialProgress(), autoChallenge: false };
  const mods = collectModifiers(sandbox, tc);
  const cardIds = buildTeam(sandbox, tc, mods, TRAINING_DUNGEON)
    .filter((c) => c.id)
    .map((c) => c.id);
  return {
    settings,
    content: tc,
    state: sandbox,
    cardIds,
    ended: null,
    seconds: 0,
    total: new Decimal(0),
    best: new Decimal(0),
    perCard: {},
    taken: new Decimal(0),
    attacks: 0,
    fallen: [],
    recent: [],
    uptime: {},
  };
}

/** What one step of the battle did, for the stage. */
export interface TrainingStep {
  report: TickReport;
  before: GameState;
  after: GameState;
  /** Play-time seconds the step covered. */
  seconds: number;
}

/**
 * Fights `seconds` of play time (the speed button's pace is the caller's: it passes the seconds
 * already multiplied). Does nothing once the battle is over. The dummy cannot be killed: its health
 * is `ENDLESS_HP`, so there are no kills, no drops and no clears to pay.
 */
export function stepTraining(run: TrainingRun, seconds: number, rng: Rng): TrainingStep | null {
  if (run.ended || !(seconds > 0)) return null;
  const before = run.state;
  const { state, report } = advance(before, run.content, seconds * 1000, rng);
  run.state = state;
  run.seconds += seconds;
  let dealt = new Decimal(0);
  for (const hit of report.playerHits) {
    if (hit.hits <= 0) continue;
    const amount = hit.damage.mul(hit.hits);
    dealt = dealt.add(amount);
    run.perCard[hit.cardId] = (run.perCard[hit.cardId] ?? new Decimal(0)).add(amount);
    if (hit.damage.gt(run.best)) run.best = hit.damage;
  }
  run.total = run.total.add(dealt);
  run.recent.push({ seconds, damage: dealt });
  let window = 0;
  let cut = run.recent.length;
  while (cut > 1 && window + run.recent[cut - 1]!.seconds <= ROLLING_SECONDS) {
    window += run.recent[cut - 1]!.seconds;
    cut -= 1;
  }
  run.recent = run.recent.slice(Math.max(0, cut - 1));
  for (const attack of report.bossAttacks) {
    run.taken = run.taken.add(attack.damage);
    run.attacks += attack.attacks;
  }
  for (const id of report.cardKnockouts) if (!run.fallen.includes(id)) run.fallen.push(id);
  // effect uptime: sampled at the end of the step, counted for the whole step
  const mods = collectModifiers(state, run.content);
  const team = buildTeam(state, run.content, mods, TRAINING_DUNGEON).filter((c) => c.id);
  const fx = activeEffects(team, fightClock(state));
  const mark = (key: string): void => {
    run.uptime[key] = (run.uptime[key] ?? 0) + seconds;
  };
  for (const kind of new Set(fx.enemy)) mark(`enemy:${kind}`);
  for (const kind of new Set(Object.values(fx.cards).flat())) mark(`team:${kind}`);
  if (report.knockouts > 0 || run.fallen.length >= run.cardIds.length) {
    if (run.cardIds.length > 0) run.ended = 'fallen';
  }
  return { report, before, after: state, seconds };
}

/** Ends the battle where it stands (the stop button): the summary reads what was gathered. */
export function stopTraining(run: TrainingRun): void {
  if (run.ended) return;
  run.ended = 'stopped';
}

/** The numbers of the live panel and the summary. */
export function trainingPanel(run: TrainingRun): TrainingPanel {
  const spanSeconds = run.recent.reduce((sum, r) => sum + r.seconds, 0);
  const spanDamage = run.recent.reduce((sum, r) => sum.add(r.damage), new Decimal(0));
  const rolling = spanSeconds > 0 ? spanDamage.div(spanSeconds) : new Decimal(0);
  const overall = run.seconds > 0 ? run.total.div(run.seconds) : new Decimal(0);
  const cards = run.cardIds.map((cardId) => {
    const damage = run.perCard[cardId] ?? new Decimal(0);
    return { cardId, damage, share: run.total.gt(0) ? damage.div(run.total).toNumber() : 0 };
  });
  const effects: EffectRow[] = Object.entries(run.uptime)
    .map(([key, secs]): EffectRow => {
      const [on, kind] = key.split(':') as ['enemy' | 'team', MoveEffectKind];
      return {
        kind,
        word: EFFECT_WORDS[kind],
        on,
        uptime: run.seconds > 0 ? secs / run.seconds : 0,
      };
    })
    .sort((a, b) => b.uptime - a.uptime);
  return {
    seconds: run.seconds,
    total: run.total,
    rolling,
    overall,
    best: run.best,
    cards,
    taken: run.taken,
    attacks: run.attacks,
    fallen: [...run.fallen],
    effects,
  };
}

/** The team's average damage per second as the engine reckons it (for a "should be about" check). */
export function trainingAverageDps(run: TrainingRun): Decimal {
  const mods = collectModifiers(run.state, run.content);
  return teamAverageDps(buildTeam(run.state, run.content, mods, TRAINING_DUNGEON));
}
