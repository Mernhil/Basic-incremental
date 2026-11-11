// Writes a mid-game save that has Ascended twice (Starlight, shop levels, skill ranks, achievements)
// from the 0.6.0 fixture, for the 9d screenshots: `npx tsx scripts/make-meta-save.ts <out>`.
import { readFileSync, writeFileSync } from 'node:fs';
import { loadContent } from '../src/data';
import { buySkill, createSaveText, Decimal, readSave, type GameState } from '../src/game';

const content = loadContent();
const text = readFileSync('tests/fixtures/saves/v26-0.6.0.save.txt', 'utf8');
const { state } = readSave(text, content);
state.prestigeCount = 2;
for (const t of content.trees) state.production.treeLevels[t.id] = 60;
for (const m of content.mines) state.production.mineLevels[m.id] = 60;
state.resources[content.upgrades.currency] = new Decimal('5e12');
state.upgrades.owned = content.upgrades.upgrades
  .filter((u) => u.permanent)
  .slice(0, 2)
  .map((u) => u.id);
const cur = content.prestige.currency;
state.resources[cur] = new Decimal(64);
state.prestige.starlightEarned = new Decimal(140);
state.prestige.shop = {
  starlit_groves: 3,
  starlit_veins: 2,
  starforged_edge: 1,
  second_hands: 1,
  timber_steward: 1,
};
state.account.level = 14;
const now = Date.now();
content.achievements.slice(0, 18).forEach((a, i) => (state.achievements[a.id] = now - i * 1000));
let cur2: GameState = state;
for (let i = 0; i < 22; i++) {
  const next = cur2.account;
  void next;
  const pick = content.account.tree.find((n) => buySkill(cur2, content, n.id).ok);
  if (!pick) break;
  const r = buySkill(cur2, content, pick.id);
  if (r.ok) cur2 = r.state;
}
state.account.skills = cur2.account.skills;
state.upgrades.moneyEarned = new Decimal('1.2e9');
writeFileSync(process.argv[2]!, createSaveText(state, now));
console.log(String(readSave(createSaveText(state, now), content).state.upgrades.moneyEarned));
console.log('ok');
