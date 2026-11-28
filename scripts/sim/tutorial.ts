/**
 * `npx tsx scripts/sim/tutorial.ts [--hours 2] [--seed 1] [--starter geodefall]`: one short sim of
 * a new game (DESIGN.md section 2, A tutorial area before Mossy Cellar): when each tutorial card
 * is handed out, when the farm's boss falls, and when Mossy Cellar is cleared after it, next to a
 * game that starts as before (Ember Squire, straight into Mossy Cellar).
 */
import { loadContent } from '../../src/data';
import { runSim } from './sim';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : (process.argv[i + 1] ?? fallback);
}

const content = loadContent();
const hours = Number(arg('hours', '2'));
const seed = Number(arg('seed', '1'));
const starter = arg('starter', 'geodefall');
const min = (s: number | null | undefined): string =>
  s == null ? 'never' : `${(s / 60).toFixed(1)} min`;

const fresh = runSim(content, { hours, seed, starter, newGame: true });
const before = process.argv.includes('--no-before')
  ? fresh
  : runSim(content, { hours, seed, starter });
const tut = fresh.log.tutorial!;
console.log(`starter ${starter}, seed ${seed}, ${hours} h`);
console.log(
  `hand-outs at ${tut.handouts.map(min).join(', ')}; area cleared at ${min(tut.clearedAt)}`,
);
const row = (name: string, id: string): string =>
  `${name} cleared: new game ${min(fresh.hits[id])} (${min(
    fresh.hits[id] == null || tut.clearedAt == null ? null : fresh.hits[id]! - tut.clearedAt,
  )} after the area), as before ${min(before.hits[id])}`;
console.log(row('Mossy Cellar', 'clear_d1'));
console.log(row('Ember Crypt', 'clear_d2'));
