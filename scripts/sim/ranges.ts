/**
 * `npx tsx scripts/sim/ranges.ts [--hours 40] [--seeds 5] [--seed 1]`: the range of every number
 * family the player sees (DESIGN.md §14 Readable numbers): damage per hit, DPS, team health,
 * enemy HP and attack, purses, Money, prices, production, gems and card XP. It prints the content
 * ladder (every dungeon and tier: first enemy, mini-boss, boss), the median of several sim runs at
 * set hours, and an end-of-content state: the last sim state with a team of four Mythic and Void
 * cards at the Heirloom, ★6 and level 140, and the Starlight shop bought out, against the last
 * dungeon's Nightmare boss. Every number goes through the game's one short format.
 */
import { loadContent, type Content } from '../../src/data';
import {
  ascensionPreview,
  buildTeam,
  xpToNextAccountLevel,
  cloneState,
  collectModifiers,
  Decimal,
  difficultyScale,
  floorSpec,
  formatShort,
  mineLevelCost,
  productionPerSecond,
  teamAverageDps,
  treeLevelCost,
  xpToNextLevel,
  type Difficulty,
  type GameState,
} from '../../src/game';
import { runSim } from './sim';

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? fallback : Number(process.argv[i + 1]);
}

const hours = arg('hours', 40);
const seeds = Math.floor(arg('seeds', 5));
const firstSeed = arg('seed', 1);
const content = loadContent();
const f = (d: Decimal | number): string => formatShort(new Decimal(d));
const DIFFS: Difficulty[] = ['normal', 'hard', 'nightmare'];

/** Average Money purse of an enemy (before modifiers): the dungeon's purse × its purse share. */
function purse(
  content: Content,
  dungeonId: string,
  difficulty: Difficulty,
  floor: number,
  i: number,
): Decimal {
  const dungeon = content.dungeonById.get(dungeonId)!;
  const spec = floorSpec(content, dungeon, difficulty, floor);
  const enemy = spec.enemies[i] ?? spec.enemies[0]!;
  const money = dungeon.drops.currencies.find((c) => c.resource === 'money');
  if (!money) return new Decimal(0);
  return new Decimal((money.min + money.max) / 2)
    .mul(enemy.purseScale)
    .mul(difficultyScale(content, difficulty).purse);
}

export function ladderTable(content: Content): string[] {
  const rows = [
    '| Dungeon | Tier | First enemy HP | Mini-boss HP | Boss HP | Boss attack | Boss purse |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const d of content.dungeons) {
    for (const diff of DIFFS) {
      const first = floorSpec(content, d, diff, 1);
      const mini = floorSpec(content, d, diff, Math.min(10, d.floors));
      const boss = floorSpec(content, d, diff, d.floors);
      rows.push(
        `| ${d.name} | ${diff} | ${f(first.enemies[0]!.hp)} | ${f(mini.hp)} | ${f(boss.hp)} | ${f(boss.attack)} | ${f(purse(content, d.id, diff, d.floors, 0))} |`,
      );
    }
  }
  for (const t of content.trials)
    rows.push(`| ${t.name} | - | - | - | ${f(t.target.hp)} | - | - |`);
  return rows;
}

interface Sample {
  hit: number;
  bestHit: number;
  dps: number;
  health: number;
  enemyHp: number;
  enemyAttack: number;
  purse: number;
  money: number;
  price: number;
  gemRate: number;
  gems: number;
  xp: number;
  accountXp: number;
  accountLevel: number;
  sharpen: number;
  starlight: number;
  harvested: number;
}

const max = (xs: number[]): number => xs.reduce((a, b) => Math.max(a, b), 0);

export function sample(state: GameState, content: Content): Sample {
  const modifiers = collectModifiers(state, content);
  const team = buildTeam(state, content, modifiers, state.activeDungeonId);
  // The frontier: the hardest floor the player has beaten, over every dungeon and tier.
  let enemyHp = 0;
  let enemyAttack = 0;
  let bestPurse = 0;
  for (const d of content.dungeons) {
    const progress = state.combat.floors[d.id];
    if (!progress) continue;
    for (const diff of [...DIFFS, 'endless' as Difficulty]) {
      const best = progress.tiers[diff]?.best ?? 0;
      if (best < 1) continue;
      const spec = floorSpec(content, d, diff, best);
      enemyHp = Math.max(enemyHp, spec.hp.toNumber());
      enemyAttack = Math.max(enemyAttack, spec.attack.toNumber());
      bestPurse = Math.max(
        bestPurse,
        purse(content, d.id, diff, best, spec.enemies.length - 1).toNumber(),
      );
    }
  }
  const prices = [
    ...content.trees.map((t) => treeLevelCost(state, content, t.id, modifiers)?.amount),
    ...content.mines.map((m) => mineLevelCost(state, content, m.id, modifiers)?.amount),
  ].map((d) => (d ? d.toNumber() : 0));
  const rates = Object.values(productionPerSecond(state, content, modifiers)).map((d) =>
    d.toNumber(),
  );
  const gems = Object.entries(state.resources)
    .filter(([id]) => id.endsWith('_gem'))
    .map(([, d]) => new Decimal(d).toNumber());
  const lead = state.cards.loadouts.fighting.main;
  const level = lead ? (state.cards.owned[lead]?.level ?? 1) : 1;
  return {
    hit: max(team.map((c) => c.hit.toNumber())),
    bestHit: max(team.map((c) => c.hit.add(c.signature).toNumber())),
    dps: teamAverageDps(team).toNumber(),
    health: team.reduce((a, c) => a + c.maxHealth.toNumber(), 0),
    enemyHp,
    enemyAttack,
    purse: bestPurse,
    money: new Decimal(state.resources['money'] ?? 0).toNumber(),
    price: max(prices),
    gemRate: max(rates),
    gems: max(gems),
    xp: xpToNextLevel(content, level).toNumber(),
    accountXp: xpToNextAccountLevel(content, state.account.level).toNumber(),
    accountLevel: state.account.level,
    sharpen: state.combat.training?.['sharpen'] ?? 0,
    starlight: ascensionPreview(state, content).gain.toNumber(),
    harvested: max(Object.values(state.mastery.harvested).map((d) => new Decimal(d).toNumber())),
  };
}

/** The last sim state with a maxed team of four Mythic and Void Heirlooms and the shop bought out. */
export function endOfContent(state: GameState, content: Content): GameState {
  const next = cloneState(state);
  next.cards.owned = { ...next.cards.owned };
  next.prestige.shop = { ...next.prestige.shop };
  // four fighting Heirloom cards (DESIGN.md §5 Heirlooms)
  const tops = content.cards
    .filter((c) => c.job === 'fighting' && c.heirloom)
    .slice(0, 4)
    .map((c) => c.id);
  for (const id of tops) {
    next.cards.owned[id] = {
      tier: 'heirloom',
      stars: 6,
      level: 140,
      xp: new Decimal(0),
      starFill: 0,
      enhancements: [],
    };
  }
  next.cards.loadouts.fighting.main = tops[0]!;
  next.cards.loadouts.fighting.supports = tops.slice(1);
  for (const item of content.prestige.shop) next.prestige.shop[item.id] = item.maxLevel;
  const last = content.dungeons[content.dungeons.length - 1]!;
  next.activeDungeonId = last.id;
  return next;
}

const HOURS = [0.05, 0.25, 1, 2, 4, 8, 12, 16, 24, 32, 40].filter((h) => h <= hours);
const FAMILIES: [keyof Sample, string][] = [
  ['hit', 'Damage per hit (hardest card)'],
  ['bestHit', 'Best hit (hit + signature)'],
  ['dps', 'Team DPS'],
  ['health', 'Team health'],
  ['enemyHp', 'Enemy floor HP (best floor beaten)'],
  ['enemyAttack', 'Enemy attack'],
  ['purse', 'Purse per kill (base)'],
  ['money', 'Money in hand'],
  ['price', 'Next tree / mine level price'],
  ['gemRate', 'Gems per second (best place)'],
  ['gems', 'Gems in hand (most of one kind)'],
  ['xp', 'Card XP to next level (lead)'],
  ['accountXp', 'Account XP to next level'],
  ['accountLevel', 'Account level'],
  ['sharpen', 'Sharpen training level'],
  ['starlight', 'Starlight an Ascension would give'],
  ['harvested', 'Lifetime harvest (most of one gem)'],
];

if (process.argv[1]?.endsWith('ranges.ts')) {
  console.log('Content ladder (before modifiers):\n');
  console.log(ladderTable(content).join('\n'));
  const samples = new Map<number, Sample[]>();
  let last: GameState | null = null;
  for (let s = firstSeed; s < firstSeed + seeds; s++) {
    runSim(content, {
      hours,
      seed: s,
      stepSeconds: 5,
      probeSeconds: 180,
      probe: (state, t) => {
        const h = HOURS.find((x) => Math.abs(x * 3600 - t) < 90);
        if (h !== undefined) samples.set(h, [...(samples.get(h) ?? []), sample(state, content)]);
        last = state;
      },
    });
  }
  const med = (xs: number[]): number =>
    [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0;
  console.log(`\nMedian of ${seeds} sim runs at set hours:\n`);
  console.log(`| Family | ${HOURS.map((h) => `${h} h`).join(' | ')} |`);
  console.log(`|---|${HOURS.map(() => '---').join('|')}|`);
  for (const [key, name] of FAMILIES) {
    console.log(
      `| ${name} | ${HOURS.map((h) => f(med((samples.get(h) ?? []).map((x) => x[key])))).join(' | ')} |`,
    );
  }
  if (last) {
    const end = sample(endOfContent(last, content), content);
    console.log(
      '\nEnd of content (last state, four Heirloom ★6 Lv 140 Mythic / Void cards, Starlight shop maxed):\n',
    );
    for (const [key, name] of FAMILIES) console.log(`- ${name}: ${f(end[key])}`);
  }
}
