/**
 * `npx tsx scripts/sim/raidsCapture.ts [--hours 30] [--seed 1] [--out dir]`: plays the balance sim
 * and writes the state as a save file at the first Ascension and at 2, 6 and 12 hours after it, for
 * `raidsCheck.ts` to fight the raid bosses with.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadContent } from '../../src/data';
import { cloneState, createSaveText, type GameState } from '../../src/game';
import { runSim } from './sim';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : process.argv[i + 1]!;
}

const hours = Number(arg('hours', '30'));
const seed = Number(arg('seed', '1'));
const out = arg('out', 'raid-sim');
mkdirSync(out, { recursive: true });
const content = loadContent();

let firstAt: number | null = null;
const marks = [0, 2, 6, 12].map((h) => h * 3600);
const done = new Set<number>();
const result = runSim(content, {
  hours,
  seed,
  probeSeconds: 600,
  probe: (state: GameState, t: number) => {
    if (state.prestigeCount < 1) return;
    firstAt ??= t;
    for (const m of marks) {
      if (t - firstAt >= m && !done.has(m)) {
        done.add(m);
        const name = `seed${seed}-asc1-plus${m / 3600}h.save`;
        writeFileSync(join(out, name), createSaveText(cloneState(state), 0));
        console.log(`wrote ${name} at ${(t / 3600).toFixed(1)} h`);
      }
    }
  },
});
console.log(`first Ascension at ${firstAt === null ? 'never' : (firstAt / 3600).toFixed(1) + ' h'}`);
console.log(`ascensions: ${result.log.ascensions.length}`);
