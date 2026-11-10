/**
 * `npx tsx scripts/sim/rarity.ts`: the rarity gaps (DESIGN.md §5 Rarity matters). For every rarity:
 * base damage and health, a fresh card (Wood ★1 Lv 1), the same card once its free stars are taken
 * (★6 where the star bar needs no copies) and the card at its top tier, ★6, level cap. Prints a
 * markdown table and fails when a higher rarity does not beat a lower one at the same point.
 */
import { RARITIES, loadContent } from '../../src/data';
import { cardStatPower, levelCap, type OwnedCard } from '../../src/game';

const content = loadContent();
const rules = content.cardRules;
const TOP_TIER = {
  common: 'wood',
  uncommon: 'bronze',
  rare: 'silver',
  epic: 'gold',
  legendary: 'prismatic',
  mythic: 'mythic',
  void: 'mythic',
} as const;
const card = (tier: OwnedCard['tier'], stars: number, level: number): OwnedCard =>
  ({ tier, stars, level, xp: 0, starFill: 0, duplicates: 0 }) as unknown as OwnedCard;
const free = (r: (typeof RARITIES)[number]): number => {
  const needs = rules.starBar.needs[r];
  let stars = 1;
  while (stars < 6 && needs[stars - 1] === 0) stars++;
  return stars;
};

const rows: Array<{ rarity: string; fresh: number[]; freeStars: number[]; top: number[] }> = [];
console.log(
  '| Rarity | Base damage | Base health | Fresh (Wood ★1 Lv 1) dmg / hp | Fresh with free stars | Top tier ★6 at cap dmg / hp |',
);
console.log('|---|---|---|---|---|---|');
for (const r of RARITIES) {
  const dmg = rules.baseDamage[r].toNumber();
  const hp = rules.health[r].toNumber();
  const fresh = cardStatPower(content, card('wood', 1, 1));
  const freeStar = free(r);
  const withFree = cardStatPower(content, card('wood', freeStar, 1));
  const tier = TOP_TIER[r];
  const cap = levelCap(content, { tier, stars: 6 });
  const top = cardStatPower(content, card(tier, 6, cap));
  rows.push({
    rarity: r,
    fresh: [dmg * fresh, hp * fresh],
    freeStars: [dmg * withFree, hp * withFree],
    top: [dmg * top, hp * top],
  });
  const f = (n: number) => Math.round(n).toLocaleString('en-US');
  console.log(
    `| ${r} | ${f(dmg)} | ${f(hp)} | ${f(dmg * fresh)} / ${f(hp * fresh)} | ★${freeStar}: ${f(dmg * withFree)} / ${f(hp * withFree)} | ${tier} Lv ${cap}: ${f(dmg * top)} / ${f(hp * top)} |`,
  );
}
let ok = true;
for (let i = 1; i < rows.length; i++) {
  const [a, b] = [rows[i - 1]!, rows[i]!];
  if (b.rarity === 'void' && a.rarity === 'mythic') continue; // one rarity, two sides
  for (const k of ['fresh', 'freeStars', 'top'] as const) {
    if (!(b[k][0]! > a[k][0]! && b[k][1]! > a[k][1]!)) {
      ok = false;
      console.log(`GAP BROKEN: ${b.rarity} does not beat ${a.rarity} (${k})`);
    }
  }
}
const common = rows[0]!.top[0]!;
const legendary = rows.find((r) => r.rarity === 'legendary')!.fresh[0]!;
console.log(
  `\nMaxed Common (Wood ★6 Lv cap) ${Math.round(common)} vs fresh Legendary (★1) ${Math.round(legendary)}: ×${(common / legendary).toFixed(2)}`,
);
if (!ok) process.exit(1);
