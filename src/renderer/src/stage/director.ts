import type { Content } from '../../../data';
import {
  Decimal,
  PRODUCTION_JOBS,
  burstStats,
  collectModifiers,
  critFactor,
  critStats,
  defaultRng,
  effectiveDamage,
  hitDamage,
  isProducerUnlocked,
  jobProductionPerSecond,
  loadoutMaxHealth,
  producerLevel,
  producerRate,
  producersOf,
  rollHitForShow,
  signatureDamage,
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
  };
  knockout: { seconds: number };
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

  // the main card's rhythm: one hit per burst interval
  const hitLoop = (): void => {
    const s = state();
    const mods = collectModifiers(s, content);
    const stats = burstStats(content, 'fighting', mods);
    if (!document.hidden && fighting(s)) {
      const crit = critStats(content, mods, s.activeDungeonId);
      const hit = hitDamage(effectiveDamage(s, content, undefined, mods), stats);
      const shown = rollHitForShow(hit, crit, defaultRng);
      average = nextAverage(average, hit.mul(critFactor(crit)), 0.1);
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
    const filled = [l.main, ...l.supports].map((c, i) => (c ? i : -1)).filter((i) => i >= 0);
    if (filled.length === 0) return;
    const max = loadoutMaxHealth(after, content, mods, id);
    // a fight that resumes after a knockout starts from a full pool
    const poolBefore =
      before.combat.knockoutSeconds > 0 ? max : max.sub(before.combat.loadoutDamage);
    for (const { event, span } of bossHitShows(report.bossAttacks, poolBefore, max)) {
      const target = filled[Math.floor(Math.random() * filled.length)]!;
      emit('bossAttack', {
        damage: event.damage,
        target,
        slam: event.slam,
        attacks: event.attacks,
        knockout: event.knockout,
        span,
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
      if (document.hidden) return;
      const mods = collectModifiers(after, content);
      if (report.bursts.fighting > 0 && after.activeDungeonId) {
        const stats = burstStats(content, 'fighting', mods);
        const sig = signatureDamage(effectiveDamage(after, content, undefined, mods), stats);
        const shown = rollHitForShow(
          sig,
          critStats(content, mods, after.activeDungeonId),
          defaultRng,
        );
        emit('signature', { damage: shown.damage, crit: shown.crit });
      }
      if (report.harvests.length > 0) emit('harvests', { events: report.harvests });
      if (report.bossAttacks.length > 0) emitBossAttacks(report, before, after, mods);
      if (report.knockouts > 0) emit('knockout', { seconds: after.combat.knockoutSeconds });
      if (report.bossKills > 0) {
        const loot: Loot[] = [];
        for (const r of content.resources) {
          if (r.kind !== 'crystal' && r.kind !== 'currency' && r.kind !== 'material') continue;
          const gained = (after.resources[r.id] ?? new Decimal(0)).sub(
            before.resources[r.id] ?? new Decimal(0),
          );
          if (gained.gt(0)) loot.push({ resource: r.id, amount: gained });
        }
        const rare = [
          ...Object.keys(report.drops).map(
            (id) => content.cosmeticById.get(id)?.name ?? content.cardById.get(id)?.name ?? id,
          ),
          ...report.cardDrops.map((d) => content.cardById.get(d.cardId)?.name ?? d.cardId),
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
