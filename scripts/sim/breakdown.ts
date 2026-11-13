/**
 * `npx tsx scripts/sim/breakdown.ts [--hours 40] [--every 4] [--seed 1]`: one sim run that prints,
 * every `--every` hours, where the fighting damage comes from: the lead's base damage (rarity,
 * level, stars, tier) and the `combat.damage` modifiers summed by source, to see which system
 * carries the power curve (DESIGN §14).
 */
import { loadContent } from '../../src/data';
import {
  averageDps,
  burstStats,
  critFactor,
  critStats,
  effectiveDamage,
  cardBaseDamage,
  collectModifiers,
  computeStat,
  type GameState,
  formatShort,
} from '../../src/game';
import { runSim } from './sim';

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : Number(process.argv[i + 1]);
}

const content = loadContent();
const hours = arg('hours', 40);
const every = arg('every', 4);
const seed = arg('seed', 1);

function row(state: GameState, t: number): string {
  const modifiers = collectModifiers(state, content);
  const main = state.cards.loadouts.fighting.main;
  const owned = main ? state.cards.owned[main] : undefined;
  const base = main && owned ? cardBaseDamage(content, main, owned).toNumber() : 0;
  const ctx = { job: 'fighting' as const, dungeonId: state.activeDungeonId ?? 'mossy_cellar' };
  const stat = computeStat('combat.damage', 1, modifiers, ctx);
  const bySource = new Map<string, { pct: number; mult: number }>();
  for (const m of stat.applied) {
    const key = m.source.kind;
    const entry = bySource.get(key) ?? { pct: 0, mult: 1 };
    if (m.kind === 'percent') entry.pct += m.value.toNumber();
    else if (m.kind === 'mult') entry.mult *= m.value.toNumber();
    bySource.set(key, entry);
  }
  const parts = [...bySource.entries()]
    .map(([k, v]) => `${k} +${v.pct.toFixed(0)}%${v.mult !== 1 ? ` x${v.mult.toFixed(2)}` : ''}`)
    .join(', ');
  const dps = averageDps(state, content, 'mossy_cellar', modifiers).toNumber();
  const eff = effectiveDamage(state, content, 'mossy_cellar', modifiers).toNumber();
  const b = burstStats(content, 'fighting', modifiers);
  const sig = b.power.toNumber() * (b.fill / b.size) + 1;
  const crit = critFactor(critStats(content, modifiers, 'mossy_cellar')).toNumber();
  const cm = computeStat('drops.crystalMultiplier', 1, modifiers, {
    ...ctx,
    resource: 'summon_scroll',
  });
  const cmParts = [...new Set(cm.applied.map((m) => m.source.kind))].join('/');
  const extra = ` crystals=x${cm.value.toNumber().toFixed(2)}(${cmParts}) eff/base=x${(eff / Math.max(base, 1)).toFixed(1)} sig=x${sig.toFixed(2)} (power ${b.power.toFixed(1)} fill ${b.fill.toFixed(2)}) crit=x${crit.toFixed(2)}`;
  return `${(t / 3600).toFixed(1)}h dps=${formatShort(dps)} lead=${main} ${owned?.tier} ★${owned?.stars} Lv${owned?.level} base=${formatShort(base)} mult=x${stat.value.toNumber().toFixed(1)} [${parts}] asc=${state.prestigeCount} acct=${state.account.level}${extra}`;
}

runSim(content, {
  hours,
  seed,
  probeSeconds: Math.round(every * 3600),
  probe: (state, t) => console.log(row(state, t)),
});
