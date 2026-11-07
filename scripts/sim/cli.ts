/**
 * `npm run sim -- --hours 40 [--seed 1] [--step 5]`: runs the balance sim and prints the
 * milestone table (milestone, sim time, DESIGN.md 11.7 target) and a short end-state summary.
 */
import { loadContent } from '../../src/data';
import { formatSummary, formatTable, runSim } from './sim';

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const value = Number(process.argv[i + 1]);
  if (!Number.isFinite(value) || value <= 0) {
    console.error(`--${name} needs a positive number`);
    process.exit(1);
  }
  return value;
}

const hours = arg('hours', 40);
const seed = arg('seed', 1);
const step = arg('step', 5);
const started = Date.now();
const content = loadContent();
const result = runSim(content, { hours, seed, stepSeconds: step });
console.log(formatTable(result));
console.log('');
console.log(formatSummary(result, content));
console.log(
  `\n(${hours} h simulated with seed ${seed}, step ${step} s, in ${((Date.now() - started) / 1000).toFixed(1)} s)`,
);
