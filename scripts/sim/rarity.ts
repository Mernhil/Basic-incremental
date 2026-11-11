/**
 * `npx tsx scripts/sim/rarity.ts`: the rarity gaps (DESIGN.md §5 Rarity matters, Base damage). For
 * every rarity: base damage and health, a fresh card (Wood ★1 Lv 1, how every card starts) and the
 * card at its top tier, ★6, level cap. Prints a markdown table and fails when a higher rarity does
 * not beat a lower one at either point, when the base numbers miss the 1 / 1.6 / 2.5 / 4 / 7 / 12
 * ratios, or when a fresh Legendary does not beat a maxed Common.
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
const RATIO = { common: 1, uncommon: 1.6, rare: 2.5, epic: 4, legendary: 7, mythic: 12, void: 12 };
const card = (tier: OwnedCard['tier'], stars: number, level: number): OwnedCard =>
  ({ tier, stars, level, xp: 0, starFill: 0, duplicates: 0 }) as unknown as OwnedCard;

const rows: Array<{ rarity: string; fresh: number[]; top: number[] }> = [];
let ok = true;
console.log(
  '| Rarity | Base damage | Base health | Fresh (Wood ★1 Lv 1) dmg / hp | Top tier ★6 at cap dmg / hp |',
);
console.log('|---|---|---|---|---|');
for (const r of RARITIES) {
  const dmg = rules.baseDamage[r].toNumber();
  const hp = rules.health[r].toNumber();
  const fresh = cardStatPower(content, card('wood', 1, 1));
  const tier = TOP_TIER[r];
  const cap = levelCap(content, { tier, stars: 6 });
  const top = cardStatPower(content, card(tier, 6, cap));
  rows.push({ rarity: r, fresh: [dmg * fresh, hp * fresh], top: [dmg * top, hp * top] });
  const f = (n: number) => Math.round(n).toLocaleString('en-US');
  console.log(
    `| ${r} | ${f(dmg)} | ${f(hp)} | ${f(dmg * fresh)} / ${f(hp * fresh)} | ${tier} Lv ${cap}: ${f(dmg * top)} / ${f(hp * top)} |`,
  );
  const wantDmg = rules.baseDamage.common.toNumber() * RATIO[r];
  const wantHp = rules.health.common.toNumber() * RATIO[r];
  if (Math.abs(dmg - wantDmg) > 1e-6 || Math.abs(hp - wantHp) > 1e-6) {
    ok = false;
    console.log(
      `RATIO BROKEN: ${r} should be ×${RATIO[r]} of Common (damage ${wantDmg}, health ${wantHp})`,
    );
  }
}
for (let i = 1; i < rows.length; i++) {
  const [a, b] = [rows[i - 1]!, rows[i]!];
  if (b.rarity === 'void' && a.rarity === 'mythic') continue; // one rarity, two sides
  for (const k of ['fresh', 'top'] as const) {
    if (!(b[k][0]! > a[k][0]! && b[k][1]! > a[k][1]!)) {
      ok = false;
      console.log(`GAP BROKEN: ${b.rarity} does not beat ${a.rarity} (${k})`);
    }
  }
}
const maxedCommon = rows[0]!.top;
const freshLegendary = rows.find((r) => r.rarity === 'legendary')!.fresh;
console.log(
  `\nMaxed Common (Wood ★6 Lv cap) ${Math.round(maxedCommon[0]!)} / ${Math.round(maxedCommon[1]!)} vs fresh Legendary (★1) ${Math.round(freshLegendary[0]!)} / ${Math.round(freshLegendary[1]!)}`,
);
if (!(freshLegendary[0]! > maxedCommon[0]! && freshLegendary[1]! > maxedCommon[1]!)) {
  ok = false;
  console.log('GAP BROKEN: a fresh Legendary does not beat a maxed Common');
}
if (!ok) process.exit(1);
