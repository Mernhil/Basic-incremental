/**
 * `npx tsx scripts/sim/arenaCheck.ts [dir]`: fights the sim's saved states (`arenaCapture.ts`) against
 * every archetype of every rank band, with the rivals following the player's power as in the game
 * (`strength` in arena.json), and prints who wins, the fight length and the power ratios. Used to set
 * `strength.anchorPower` (the player's power when the arena opens) and the bands' `ratio`, so that
 * the state at the opening beats the Contender band and climbs from there.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadContent } from '../../src/data';
import { duelTeams, ownPower, readSave, rivalTeam, youForArena } from '../../src/game';

const dir = process.argv[2] ?? 'arena-sim';
const content = loadContent();
for (const file of readdirSync(dir)
  .filter((f) => f.endsWith('.save'))
  .sort()) {
  const raw = JSON.parse(readFileSync(join(dir, file), 'utf8')) as {
    state: { summon: { dailyClaimedDay: string | null } };
  };
  raw.state.summon.dailyClaimedDay = null; // the sim's clock is not a calendar day
  const state = readSave(JSON.stringify(raw), content).state;
  const power = ownPower(state, content);
  const ids = state.cards.loadouts.fighting.slots.filter((x): x is string => x !== null);
  console.log(`\n${file}: power ${power.toExponential(3)}, team ${ids.join(', ')}`);
  for (const band of content.arena.bands) {
    const out: string[] = [];
    let wins = 0;
    for (const id of band.archetypes) {
      const a = content.arena.archetypes.find((x) => x.id === id)!;
      const rival = rivalTeam(content, a, band, power);
      const f = duelTeams(content, youForArena(state, content, a.tags), rival);
      if (f.won) wins++;
      out.push(
        `${f.won ? 'W' : 'L'}${f.seconds.toFixed(0)}s ${a.name}(${(f.rivalPower / f.youPower).toFixed(2)}x)`,
      );
    }
    console.log(`  ${band.id.padEnd(11)} ${wins}/${band.archetypes.length}  ${out.join('  ')}`);
  }
}
