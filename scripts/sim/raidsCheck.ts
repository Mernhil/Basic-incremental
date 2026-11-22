/**
 * `npx tsx scripts/sim/raidsCheck.ts <save file>... [--top 14]`: fights every raid boss with a save
 * from `raidsCapture.ts` and prints, for each boss, the best team the player owns (searched among
 * its strongest cards), an average team (cards from the middle of the roster) and the loadout it
 * has, with the score as a share of the boss's HP and the ladder rank it reaches.
 */
import { readFileSync } from 'node:fs';
import { loadContent } from '../../src/data';
import {
  cardAverageDps,
  cloneState,
  collectModifiers,
  fightRaid,
  raidRank,
  readSave,
  soloCard,
  type GameState,
  type RaidFight,
} from '../../src/game';

const content = loadContent();
const files = process.argv.slice(2).filter((a) => !a.startsWith('--') && a.endsWith('.save'));
const topIdx = process.argv.indexOf('--top');
const TOP = topIdx < 0 ? 14 : Number(process.argv[topIdx + 1]);

function withTeam(state: GameState, ids: string[]): GameState {
  const s = cloneState(state);
  s.cards.loadouts.fighting = {
    slots: [ids[0] ?? null, ids[1] ?? null, ids[2] ?? null, ids[3] ?? null],
  };
  return s;
}

function line(label: string, f: RaidFight, bossId: string): string {
  const rank = raidRank(content, bossId, f.share) ?? '-';
  return `    ${label.padEnd(8)} ${f.killed ? 'KILL' : 'no  '} share ${f.share.toFixed(2).padStart(5)}  rank ${String(rank).padStart(2)}  ${f.seconds.toFixed(0).padStart(3)}s  out ${f.out.length}  trick left ${f.trick.left.toFixed(2)}`;
}

function combos(n: number, k: number): number[][] {
  const out: number[][] = [];
  const rec = (start: number, cur: number[]): void => {
    if (cur.length === k) {
      out.push([...cur]);
      return;
    }
    for (let i = start; i < n; i++) rec(i + 1, [...cur, i]);
  };
  rec(0, []);
  return out;
}

for (const file of files) {
  const state = readSave(readFileSync(file, 'utf8'), content).state;
  const mods = collectModifiers(state, content);
  const fighters = Object.keys(state.cards.owned)
    .filter((id) => content.cardById.get(id)?.job === 'fighting')
    .map((id) => ({ id, dps: soloCard(state, content, mods, id) }))
    .filter((c) => c.dps !== null)
    .map((c) => ({ id: c.id, dps: cardAverageDps(c.dps!).toNumber() }))
    .sort((a, b) => b.dps - a.dps);
  const mid = Math.floor(fighters.length / 2);
  const average = fighters.slice(Math.max(0, mid - 2), mid + 2).map((c) => c.id);
  const pool = fighters.slice(0, TOP).map((c) => c.id);
  console.log(
    `\n${file.split(/[\\/]/).pop()}: ${fighters.length} fighting cards, ascended ${state.prestigeCount}x, top dps ${fighters[0]?.dps.toExponential(2)}, median ${fighters[mid]?.dps.toExponential(2)}`,
  );
  console.log(`  loadout: ${state.cards.loadouts.fighting.slots.join(', ')}`);
  console.log(`  average team: ${average.join(', ')}`);
  for (const boss of content.raids.bosses) {
    console.log(`  ${boss.name} (${boss.element}, ${boss.trick.kind})`);
    let best: { f: RaidFight; ids: string[] } | null = null;
    for (const c of combos(pool.length, Math.min(4, pool.length))) {
      const ids = c.map((i) => pool[i]!);
      const f = fightRaid(withTeam(state, ids), content, mods, boss.id)!;
      if (!best || f.share > best.f.share) best = { f, ids };
    }
    if (best) {
      console.log(line('best', best.f, boss.id) + `   [${best.ids.join(', ')}]`);
    }
    const loadout = fightRaid(state, content, mods, boss.id);
    if (loadout) console.log(line('loadout', loadout, boss.id));
    const avg = fightRaid(withTeam(state, average), content, mods, boss.id);
    if (avg) console.log(line('average', avg, boss.id));
  }
}
