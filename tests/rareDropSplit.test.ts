import { describe, expect, it } from 'vitest';
import { advance, Decimal, emptyCardLoadout, setActiveDungeon, type GameState } from '../src/game';
import { constantRng, freshState, withBossHp, withDps } from './helpers';

/** A rare drop's cosmetic damage bonus applies at once, so splitting time changes nothing. */
const base = withBossHp(withDps(1000), 'mossy_cellar', 500);
const dungeons = base.dungeons.map((d) =>
  d.id === 'mossy_cellar'
    ? { ...d, drops: { ...d.drops, rare: { ...d.drops.rare, chance: 1 } } }
    : d,
);
const content = { ...base, dungeons, dungeonById: new Map(dungeons.map((d) => [d.id, d])) };
const rng = constantRng(0.5);

function start(): GameState {
  const r = setActiveDungeon(freshState(), content, 'mossy_cellar');
  if (!r.ok) throw new Error(r.reason);
  r.state.cards.loadouts.fighting = emptyCardLoadout();
  return r.state;
}
const total = (reports: { playerHits: { damage: Decimal; hits: number }[] }[]): Decimal =>
  reports.reduce(
    (sum, r) => r.playerHits.reduce((s, e) => s.add(e.damage.mul(e.hits)), sum),
    new Decimal(0),
  );

describe('rare drop damage bonus is split-invariant', () => {
  it('one long advance deals what many short ones do', () => {
    const long = advance(start(), content, 30_000, rng);
    let s = start();
    const reports = [];
    for (let i = 0; i < 30; i++) {
      const step = advance(s, content, 1000, rng);
      s = step.state;
      reports.push(step.report);
    }
    expect(s.inventory['holo_hex'] ?? 0).toBeGreaterThan(1);
    const longTotal = total([long.report]);
    const shortTotal = total(reports);
    expect(longTotal.sub(shortTotal).abs().div(shortTotal).toNumber()).toBeLessThan(1e-9);
  });
});
