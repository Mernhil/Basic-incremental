/**
 * `npx tsx scripts/sim/tiers.ts`: the tier gaps (DESIGN.md §5 Tier matters, Base damage). For every
 * tier a card can be pulled at: base damage and health, a fresh card (★1 Lv 1, how it arrives) and
 * the card at ★6 and its level cap. Prints a markdown table and fails when a higher tier does not
 * beat the one below at either point, when the base numbers miss the 1 / 1.49 / 2.18 / 3.24 / 5.2 /
 * 8.22 ratios, or when a fresh Prismatic card does not beat a maxed Wood card.
 */
import { loadContent } from '../../src/data';
import { cardStatPower, levelCap, type OwnedCard } from '../../src/game';

const content = loadContent();
const rules = content.cardRules;
const TIERS = ['wood', 'bronze', 'silver', 'gold', 'prismatic', 'mythic'] as const;
const RATIO = { wood: 1, bronze: 1.49, silver: 2.18, gold: 3.24, prismatic: 5.2, mythic: 8.22 };
const card = (tier: OwnedCard['tier'], stars: number, level: number): OwnedCard =>
  ({ tier, stars, level, xp: 0, starFill: 0 }) as unknown as OwnedCard;

const rows: Array<{ tier: string; fresh: number[]; top: number[] }> = [];
let ok = true;
console.log('| Tier | Base damage | Base health | Fresh (★1 Lv 1) dmg / hp | ★6 at cap dmg / hp |');
console.log('|---|---|---|---|---|');
for (const tier of TIERS) {
  const dmg = rules.baseDamage[tier].toNumber();
  const hp = rules.health[tier].toNumber();
  const fresh = cardStatPower(content, card(tier, 1, 1));
  const cap = levelCap(content, { tier, stars: 6 });
  const top = cardStatPower(content, card(tier, 6, cap));
  rows.push({ tier, fresh: [dmg * fresh, hp * fresh], top: [dmg * top, hp * top] });
  const f = (n: number) => Math.round(n).toLocaleString('en-US');
  console.log(
    `| ${tier} | ${f(dmg)} | ${f(hp)} | ${f(dmg * fresh)} / ${f(hp * fresh)} | Lv ${cap}: ${f(dmg * top)} / ${f(hp * top)} |`,
  );
  const wantDmg = rules.baseDamage.wood.toNumber() * RATIO[tier];
  const wantHp = rules.health.wood.toNumber() * RATIO[tier];
  if (Math.abs(dmg - wantDmg) > 1e-3 || Math.abs(hp - wantHp) > 0.5) {
    ok = false;
    console.log(`RATIO BROKEN: ${tier} should be ×${RATIO[tier]} of Wood (damage ${wantDmg}, health ${wantHp})`);
  }
}
for (let i = 1; i < rows.length; i++) {
  const [a, b] = [rows[i - 1]!, rows[i]!];
  for (const k of ['fresh', 'top'] as const) {
    if (!(b[k][0]! > a[k][0]! && b[k][1]! > a[k][1]!)) {
      ok = false;
      console.log(`GAP BROKEN: ${b.tier} does not beat ${a.tier} (${k})`);
    }
  }
}
const maxedWood = rows[0]!.top;
const freshPrismatic = rows.find((r) => r.tier === 'prismatic')!.fresh;
console.log(
  `\nMaxed Wood (★6 Lv cap) ${Math.round(maxedWood[0]!)} / ${Math.round(maxedWood[1]!)} vs fresh Prismatic (★1) ${Math.round(freshPrismatic[0]!)} / ${Math.round(freshPrismatic[1]!)}`,
);
if (!(freshPrismatic[0]! > maxedWood[0]! && freshPrismatic[1]! > maxedWood[1]!)) {
  ok = false;
  console.log('GAP BROKEN: a fresh Prismatic card does not beat a maxed Wood card');
}
if (!ok) process.exit(1);
