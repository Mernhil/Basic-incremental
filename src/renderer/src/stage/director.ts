import type { Content } from '../../../data';
import {
  Decimal,
  PRODUCTION_JOBS,
  bossAttackDps,
  burstStats,
  collectModifiers,
  critFactor,
  critStats,
  defaultRng,
  effectiveDamage,
  hitDamage,
  jobProductionPerSecond,
  producerLevel,
  plots,
  producerRate,
  producersOf,
  rollHitForShow,
  signatureDamage,
  type GameState,
  type HarvestEvent,
  type ProductionJob,
  type TickReport,
} from '../../../game';
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
  hit: { damage: Decimal; crit: boolean; scale: number; big: boolean };
  signature: { damage: Decimal; crit: boolean };
  /** The boss hits the loadout: `target` is the loadout position (0 = main). */
  bossAttack: { damage: Decimal; target: number };
  knockout: { seconds: number };
  /** A boss died: its resource drops, and the names of rare drops (items and cards). */
  kill: { loot: Loot[]; rare: string[] };
  /** One production tick: what each plot / slot gave. */
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
      emit('hit', { damage: shown.damage, crit: shown.crit, scale, big: scale >= 1.3 });
    }
    window.setTimeout(hitLoop, stats.interval * 1000);
  };

  // the boss hits back on its own interval (DESIGN.md §6)
  const bossLoop = (): void => {
    const s = state();
    const dungeon = s.activeDungeonId ? content.dungeonById.get(s.activeDungeonId) : undefined;
    const interval = dungeon?.boss.attack.intervalSeconds ?? 2;
    if (!document.hidden && dungeon && fighting(s)) {
      const mods = collectModifiers(s, content);
      const l = s.cards.loadouts.fighting;
      const filled = [l.main, ...l.supports].map((id, i) => (id ? i : -1)).filter((i) => i >= 0);
      if (filled.length > 0) {
        const damage = bossAttackDps(dungeon, s.prestigeCount, mods).mul(interval);
        const target = filled[Math.floor(Math.random() * filled.length)]!;
        emit('bossAttack', { damage, target });
      }
    }
    window.setTimeout(bossLoop, interval * 1000);
  };

  const harvestLoop = (): void => {
    if (!document.hidden) {
      const s = state();
      const mods = collectModifiers(s, content);
      for (const job of PRODUCTION_JOBS) {
        const out: ShowEvents['harvest']['plots'] = [];
        plots(s, content, job, mods).forEach((id, index) => {
          const p = id ? producersOf(content, job).find((x) => x.id === id) : undefined;
          if (!p) return;
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
      bossLoop();
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
