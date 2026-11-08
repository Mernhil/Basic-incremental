/**
 * `npx tsx scripts/sim/timeline.ts [--hours 10] [--every 0.5] [--seed 1] [--step 5]`: one sim run
 * that prints a row of the player's state every `--every` hours (fighting card, seconds per kill
 * and survival per dungeon, production rates, Money, levels), to see why a milestone is late.
 */
import { loadContent } from '../../src/data';
import {
  averageDps,
  ascensionPreview,
  collectModifiers,
  tierUpCheck,
  Decimal,
  productionPerSecond,
  secondsPerKill,
  survivalSeconds,
  type GameState,
} from '../../src/game';
import { holdAscension, runSim } from './sim';

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : Number(process.argv[i + 1]);
}

const hours = arg('hours', 10);
const every = arg('every', 0.5);
const seed = arg('seed', 1);
const step = arg('step', 5);
const content = loadContent();

const sci = (d: Decimal | number): string => {
  const n = typeof d === 'number' ? d : d.toNumber();
  return n >= 1e4 || (n > 0 && n < 0.1) ? n.toExponential(1) : n.toFixed(n < 10 ? 2 : 0);
};

function row(state: GameState, t: number): string {
  const modifiers = collectModifiers(state, content);
  const main = state.cards.loadouts.fighting.main;
  const card = main ? state.cards.owned[main] : undefined;
  const lead = card ? `${main} ${card.tier} ★${card.stars} Lv${card.level}` : 'none';
  const dungeons = content.dungeons
    .map((d) => {
      const spk = secondsPerKill(state, content, d.id, modifiers);
      const surv = survivalSeconds(state, content, d.id, modifiers);
      return `${d.id.slice(0, 5)} ${spk === null ? '-' : sci(spk)}s/${surv === null ? '-' : sci(surv)}s`;
    })
    .join(' | ');
  const prod = Object.entries(productionPerSecond(state, content, modifiers))
    .map(([id, rate]) => `${id.replace('_gem', '')} ${sci(rate)}`)
    .join(', ');
  const levels = [
    ...content.trees.map((x) => state.production.treeLevels[x.id] ?? 0),
    ...content.mines.map((x) => state.production.mineLevels[x.id] ?? 0),
  ].join('/');
  const cards = Object.values(state.cards.owned);
  const best = (job: string): string => {
    const c = Object.entries(state.cards.owned)
      .filter(([id]) => content.cardById.get(id)?.job === job)
      .sort((a, b) => b[1].level - a[1].level)[0];
    return c ? `${c[1].tier[0]}${c[1].stars}L${c[1].level}` : '-';
  };
  const unmet = main
    ? (tierUpCheck(state, content, main, modifiers)?.requirements ?? [])
        .filter((r) => !r.met)
        .map((r) => `${r.resource ?? r.kind} ${sci(r.have)}/${sci(r.need)}`)
        .join(', ')
    : '';
  return [
    `${(t / 3600).toFixed(2)}h`,
    `fight=${state.activeDungeonId?.slice(0, 5) ?? '-'}`,
    `lead=${lead} [next tier-up lacks: ${unmet || 'nothing'}]`,
    `dps=${sci(averageDps(state, content, 'mossy_cellar', modifiers))}`,
    dungeons,
    `money=${sci(state.resources['money'] ?? 0)} crystals=${sci(state.resources['summon_crystal'] ?? 0)}/${sci(state.resources['glamour_crystal'] ?? 0)} kills=${state.stats.bossKills}`,
    `prod/s[${prod}]`,
    `lv(tree/mine)=${levels}`,
    `cards=${cards.length} best(f/l/m)=${best('fighting')}/${best('logging')}/${best('mining')}`,
    `starlight+${sci(ascensionPreview(state, content).gain)} hold=${holdAscension(state, content)}`,
    `acct=${state.account.level} asc=${state.prestigeCount} pulls=${Object.values(state.portals).reduce((a, p) => a + p.pulls, 0)} top=${cards
      .sort((a, b) => b.stars - a.stars || b.level - a.level)
      .slice(0, 4)
      .map((c) => `${c.tier[0]}${c.stars}`)
      .join(',')}`,
  ].join('  ');
}

const result = runSim(content, {
  hours,
  seed,
  stepSeconds: step,
  probeSeconds: Math.round(every * 3600),
  probe: (state, t) => console.log(row(state, t)),
});
console.log(
  `\nmilestones (h): ${JSON.stringify(Object.fromEntries(Object.entries(result.hits).map(([k, v]) => [k, v === null ? null : Number((v / 3600).toFixed(2))])))}`,
);
