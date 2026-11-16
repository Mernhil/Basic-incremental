// One seed: the card XP per second a loadout card earns while it stands at each old level cap,
// just below the next tier's power step. For step k the walls before it are off (x1) and the wall
// at it (and after) cannot be passed, so the team stands where it would before that step.
import { loadContent } from './src/data';
import { Decimal } from './src/game';
import { runSim } from './scripts/sim/sim';

const seed = Number(process.argv[2] ?? 1);
const hours = Number(process.argv[3] ?? 12);
const base = loadContent();
const TIERS = ['wood', 'bronze', 'silver', 'gold', 'prismatic'] as const;
const out: Record<string, unknown> = { seed };
for (let k = 0; k < TIERS.length; k++) {
  const stepWall = Object.fromEntries(
    TIERS.map((t, i) => [t, new Decimal(i < k ? 1 : 1e15)]),
  ) as typeof base.cardRules.xpCurve.stepWall;
  const content = {
    ...base,
    cardRules: { ...base.cardRules, xpCurve: { ...base.cardRules.xpCurve, stepWall } },
  };
  const cap = base.cardRules.levelCaps[TIERS[k]!];
  let last: Record<string, number> = {};
  const rates: number[] = [];
  let firstAt: number | null = null;
  let dungeon = '';
  runSim(content, {
    hours,
    seed,
    profile: 'active',
    probeSeconds: 1800,
    probe: (state, t) => {
      const now: Record<string, number> = {};
      for (const id of state.cards.loadouts.fighting.slots) {
        if (!id) continue;
        const owned = state.cards.owned[id];
        if (!owned || owned.level !== cap) continue;
        const card = content.cardById.get(id)!;
        // only a card that has a step to gain here stands at the wall
        if (content.cardRules.levelCaps[card.tier] <= cap) continue;
        now[id] = owned.xp.toNumber();
      }
      let best = 0;
      for (const [id, xp] of Object.entries(now)) {
        if (last[id] !== undefined && xp > last[id]!) best = Math.max(best, (xp - last[id]!) / 1800);
      }
      if (best > 0) {
        rates.push(best);
        if (firstAt === null) firstAt = t / 3600;
        dungeon = state.activeDungeonId ?? '';
      }
      last = now;
    },
  });
  rates.sort((a, b) => a - b);
  out[TIERS[k]!] = {
    cap,
    samples: rates.length,
    firstAt,
    median: rates.length ? rates[Math.floor(rates.length / 2)] : null,
    min: rates[0] ?? null,
    max: rates[rates.length - 1] ?? null,
    dungeon,
  };
}
console.log(JSON.stringify(out));
