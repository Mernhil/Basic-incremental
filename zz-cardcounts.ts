// One seed, 20 h of the active sim: how many Prismatic and T6 cards the run owns at set hours.
// Works on main (cards have a rarity and climb tiers) and on the roster-by-tier branch.
import { loadContent } from './src/data';
import { runSim } from './scripts/sim/sim';

const seed = Number(process.argv[2] ?? 1);
const content = loadContent();
const marks = [1, 5, 10, 20];
const out: Record<string, unknown> = { seed };
type AnyCard = { id: string; heirloom?: boolean; tier?: string; rarity?: string };
const gradeOf = (c: AnyCard): string =>
  c.tier ?? { legendary: 'prismatic', mythic: 'mythic', void: 'mythic' }[c.rarity ?? ''] ?? 'low';
runSim(content, {
  hours: 20,
  seed,
  profile: 'active',
  probeSeconds: 3600,
  probe: (state, t) => {
    const hour = Math.round(t / 3600);
    if (!marks.includes(hour) || out[`h${hour}`]) return;
    let prismatic = 0;
    let t6 = 0;
    let atPrismatic = 0;
    let atT6 = 0;
    for (const [id, owned] of Object.entries(state.cards.owned)) {
      const card = content.cardById.get(id) as AnyCard | undefined;
      if (!card || card.heirloom) continue;
      const g = gradeOf(card);
      if (g === 'prismatic') prismatic++;
      if (g === 'mythic') t6++;
      const tier = (owned as { tier?: string }).tier;
      if (tier === 'prismatic') atPrismatic++;
      if (tier === 'mythic') atT6++;
    }
    out[`h${hour}`] = { prismatic, t6, atPrismatic, atT6 };
  },
});
console.log(JSON.stringify(out));
