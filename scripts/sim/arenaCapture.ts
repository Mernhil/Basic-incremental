/**
 * `npx tsx scripts/sim/arenaCapture.ts [--hours 24] [--seed 1] [--out dir]`: plays the balance sim
 * (the short sim: the first hours of play, one seed) and writes the state as a save file when the
 * arena opens (Frostspire Vault Normal cleared) and 2, 6 and 12 hours later, for `arenaSearch.ts`
 * and `arenaCheck.ts` to fight the rival bands with.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadContent } from '../../src/data';
import { arenaOpen, cloneState, createSaveText, type GameState } from '../../src/game';
import { runSim } from './sim';

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : process.argv[i + 1]!;
}

const hours = Number(arg('hours', '24'));
const seed = Number(arg('seed', '1'));
const out = arg('out', 'arena-sim');
mkdirSync(out, { recursive: true });
const content = loadContent();

let openAt: number | null = null;
const marks = [0, 2, 6, 12].map((h) => h * 3600);
const done = new Set<number>();
runSim(content, {
  hours,
  seed,
  probeSeconds: 600,
  probe: (state: GameState, t: number) => {
    if (!arenaOpen(state, content)) return;
    openAt ??= t;
    for (const m of marks) {
      if (t - openAt >= m && !done.has(m)) {
        done.add(m);
        const name = `seed${seed}-open-plus${m / 3600}h.save`;
        writeFileSync(join(out, name), createSaveText(cloneState(state), 0));
        console.log(`wrote ${name} at ${(t / 3600).toFixed(1)} h`);
      }
    }
  },
});
console.log(`arena opens at ${openAt === null ? 'never' : (openAt / 3600).toFixed(1) + ' h'}`);
