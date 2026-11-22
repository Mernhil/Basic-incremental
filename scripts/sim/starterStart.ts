/**
 * `npx tsx scripts/sim/starterStart.ts [hours] [seed]`: one short sim from a new game per starter
 * weapon (DESIGN.md §2 Starter weapon) and one without, only to catch a broken start (rule 4.4):
 * prints when the first dungeons are cleared and when each seal breaks.
 */
import { loadContent } from '../../src/data';
import { cardBaseDamage, strengthTier } from '../../src/game';
import { runSim } from './sim';

const hours = Number(process.argv[2] ?? 6);
const seed = Number(process.argv[3] ?? 1);
const content = loadContent();
const mins = (s: number | null | undefined): string =>
  s == null ? '-' : `${(s / 60).toFixed(1)}m`;

for (const starter of [undefined, ...content.starters.base]) {
  const seals: string[] = [];
  let last = -1;
  const result = runSim(content, {
    hours,
    seed,
    stepSeconds: 5,
    ...(starter ? { starter } : {}),
    probeSeconds: 30,
    probe: (state, t) => {
      if (!starter) return;
      const owned = state.cards.owned[starter]!;
      const at = owned.seal ?? content.starters.seals.length;
      if (at !== last) {
        if (at > 0) seals.push(`${at}@${mins(t)}`);
        last = at;
      }
    },
  });
  const h = result.hits;
  const dmg = starter
    ? cardBaseDamage(content, starter, result.state.cards.owned[starter]!).toExponential(2)
    : '';
  const tier = starter ? strengthTier(content, result.state.cards.owned[starter]!) : '';
  console.log(
    `${(starter ?? 'no starter').padEnd(14)} clear_d1 ${mins(h['clear_d1'])}  first_summon ${mins(h['first_summon'])}  clear_d2 ${mins(h['clear_d2'])}  seals ${seals.join(' ') || '-'}  ends ${tier} ${dmg}`,
  );
}
