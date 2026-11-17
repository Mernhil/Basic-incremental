import type { Content } from '../../../data';
import {
  cardNameById,
  Decimal,
  PRODUCTION_JOBS,
  buildTeam,
  burstStats,
  collectModifiers,
  critFactor,
  defaultRng,
  isProducerUnlocked,
  jobProductionPerSecond,
  loadoutHealth,
  loadoutMaxHealth,
  producerLevel,
  producerRate,
  producersOf,
  rollHitForShow,
  type ChallengeEvent,
  type GameState,
  type HarvestEvent,
  type ProductionJob,
  type TickReport,
} from '../../../game';
import { bossHitShows, type ChunkSpan } from './bossHitModel';
import { nextAverage, popupScale } from './math';

/**
 * The stage director (DESIGN.md §11): turns the game loop's reports and the cards' rhythm into
 * show events (hits, signature attacks, boss attacks, knockouts, kills with loot, harvest ticks
 * and bursts). Pages and Home listen and draw them. Show only: it never changes the state.
 */

export interface Loot {
  resource: string;
  amount: Decimal;
}

export interface ShowEvents {
  /** `interval`: seconds between the main card's hits; the attack animation follows it. */
  hit: { damage: Decimal; crit: boolean; scale: number; big: boolean; interval: number };
  signature: { damage: Decimal; crit: boolean };
  /**
   * The boss hits the loadout, as the game reported the attack (DESIGN.md §6): `target` is the
   * loadout position that shows the number (0 = main), `span` where the chunk sat on the health
   * bar. `attacks` is above 1 for a span of merged attacks; `knockout` for the hit that emptied it.
   */
  bossAttack: {
    damage: Decimal;
    target: number;
    slam: boolean;
    attacks: number;
    knockout: boolean;
    span: ChunkSpan;
    /** The boss ability that made the hit ("Back Strike"), '' for a plain attack. */
    ability: string;
  };
  knockout: { seconds: number };
  /** A Challenge ended (DESIGN.md §6 Farming and Challenge): won, or lost with why. */
  challenge: ChallengeEvent;
  /** A boss died: its resource drops, and the names of rare drops (items and cards). */
  kill: { loot: Loot[]; rare: string[] };
  /** One production tick: what each unlocked tree or mine gave. */
  harvest: {
    job: ProductionJob;
    plots: Array<{ index: number; resource: string; amount: Decimal }>;
  };
  harvestBurst: { job: ProductionJob; totals: Loot[] };
  /** The main cards' strikes and harvest bursts of one game step (DESIGN.md §4), as reported. */
  harvests: { events: HarvestEvent[] };
  /**
   * One game step as reported, with the play time it covered: the duel keeps its fight log from it
   * (`recordDuel`) and plays each card's hits, skills and knockouts (DESIGN.md §6 What the duel shows).
   */
  duel: { report: TickReport; seconds: number; before: GameState; after: GameState };
}

type Listener<K extends keyof ShowEvents> = (event: ShowEvents[K]) => void;

/** Seconds between production ticks on the stage. */
export const HARVEST_TICK_S = 1;

export function createDirector(content: Content, state: () => GameState) {
  const listeners = new Map<keyof ShowEvents, Array<(event: never) => void>>();
  const emit = <K extends keyof ShowEvents>(type: K, event: ShowEvents[K]): void => {
    for (const fn of listeners.get(type) ?? []) (fn as Listener<K>)(event);
  };
  let average: Decimal | null = null;

  const fighting = (s: GameState): boolean =>
    s.activeDungeonId !== null && s.combat.knockoutSeconds <= 0;

  // the stage's rhythm is the first card's (left to right): one hit per its interval
  const hitLoop = (): void => {
    const s = state();
    const mods = collectModifiers(s, content);
    const lead = buildTeam(s, content, mods, s.activeDungeonId)[0]!;
    const stats = { interval: lead.interval };
    if (!document.hidden && fighting(s)) {
      const crit = lead.crit;
      const factor = critFactor(crit);
      const hit = factor.gt(0) ? lead.hit.div(factor) : lead.hit;
      const shown = rollHitForShow(hit, crit, defaultRng);
      average = nextAverage(average, lead.hit, 0.1);
      const scale = popupScale(shown.damage, average);
      emit('hit', {
        damage: shown.damage,
        crit: shown.crit,
        scale,
        big: scale >= 1.3,
        interval: stats.interval,
      });
    }
    window.setTimeout(hitLoop, stats.interval * 1000);
  };

  // The boss's attacks come from the game's own schedule on the play-time clock (DESIGN.md §6),
  // so what the stage shows is what was dealt; a knocked-out loadout takes none.
  const emitBossAttacks = (
    report: TickReport,
    before: GameState,
    after: GameState,
    mods: ReturnType<typeof collectModifiers>,
  ): void => {
    const id = after.activeDungeonId;
    if (!id) return;
    const l = after.cards.loadouts.fighting;
    const slots = l.slots.filter((c): c is string => c !== null);
    if (slots.length === 0) return;
    const max = loadoutMaxHealth(after, content, mods, id);
    // a fight that resumes after a knockout starts from a full team; the pool is the team's
    // health left, every card summed (DESIGN.md §6 card duel)
    const poolBefore =
      before.combat.knockoutSeconds > 0 ? max : loadoutHealth(before, content, mods).current;
    for (const { event, span } of bossHitShows(report.bossAttacks, poolBefore, max)) {
      // the card the game says was hit (DESIGN.md §6 card duel)
      const hit = event.cardId ? slots.indexOf(event.cardId) : -1;
      const target = hit >= 0 ? hit : 0;
      emit('bossAttack', {
        damage: event.damage,
        target,
        slam: event.slam,
        attacks: event.attacks,
        knockout: event.knockout,
        span,
        ability: event.ability ?? '',
      });
    }
  };

  const harvestLoop = (): void => {
    if (!document.hidden) {
      const s = state();
      const mods = collectModifiers(s, content);
      for (const job of PRODUCTION_JOBS) {
        const out: ShowEvents['harvest']['plots'] = [];
        producersOf(content, job).forEach((p, index) => {
          if (!isProducerUnlocked(s, content, job, p.id)) return;
          const level = producerLevel(s, job, p.id);
          const amount = producerRate(p, job, mods, level).mul(HARVEST_TICK_S);
          if (amount.gt(0)) out.push({ index, resource: p.resource, amount });
        });
        if (out.length > 0) emit('harvest', { job, plots: out });
      }
    }
    window.setTimeout(harvestLoop, HARVEST_TICK_S * 1000);
  };

  return {
    on<K extends keyof ShowEvents>(type: K, fn: Listener<K>): void {
      const list = listeners.get(type) ?? [];
      list.push(fn as (event: never) => void);
      listeners.set(type, list);
    },
    start(): void {
      hitLoop();
      harvestLoop();
    },
    /** Reads one game-loop step: kills, drops, knockouts and bursts. */
    afterStep(report: TickReport, before: GameState, after: GameState): void {
      // the duel's log counts every step, seen or not
      emit('duel', {
        report,
        seconds: Math.max(0, (after.stats.playTimeMs - before.stats.playTimeMs) / 1000),
        before,
        after,
      });
      if (document.hidden) return;
      const mods = collectModifiers(after, content);
      if (report.bursts.fighting > 0 && after.activeDungeonId) {
        const lead = buildTeam(after, content, mods, after.activeDungeonId)[0]!;
        const factor = critFactor(lead.crit);
        const sig = factor.gt(0) ? lead.signature.div(factor) : lead.signature;
        const shown = rollHitForShow(sig, lead.crit, defaultRng);
        emit('signature', { damage: shown.damage, crit: shown.crit });
      }
      if (report.harvests.length > 0) emit('harvests', { events: report.harvests });
      if (report.bossAttacks.length > 0) emitBossAttacks(report, before, after, mods);
      if (report.knockouts > 0) emit('knockout', { seconds: after.combat.knockoutSeconds });
      for (const event of report.challenges) emit('challenge', event);
      if (report.bossKills + report.enemyKills > 0) {
        const loot: Loot[] = [];
        for (const r of content.resources) {
          if (r.kind !== 'scroll' && r.kind !== 'currency' && r.kind !== 'material') continue;
          const gained = (after.resources[r.id] ?? new Decimal(0)).sub(
            before.resources[r.id] ?? new Decimal(0),
          );
          if (gained.gt(0)) loot.push({ resource: r.id, amount: gained });
        }
        const rare = [
          ...Object.keys(report.drops).map(
            (id) => content.cosmeticById.get(id)?.name ?? cardNameById(content, id) ?? id,
          ),
          ...report.cardDrops.map((d) => cardNameById(content, d.cardId) ?? d.cardId),
        ];
        emit('kill', { loot, rare });
      }
      for (const job of PRODUCTION_JOBS) {
        const n = report.bursts[job];
        if (n <= 0) continue;
        const power = burstStats(content, job, mods).power;
        const totals = Object.entries(jobProductionPerSecond(after, content, job, mods)).map(
          ([resource, perSecond]) => ({ resource, amount: perSecond.mul(power).mul(n) }),
        );
        if (totals.length > 0) emit('harvestBurst', { job, totals });
      }
    },
  };
}

export type Director = ReturnType<typeof createDirector>;
