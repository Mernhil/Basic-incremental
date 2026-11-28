// Writes a mid-game demo save (a team, cleared dungeons, arena coins, Starlight) for the phone
// screenshots: `npx tsx scripts/make-phone-save.ts <out>`. Used by scripts/shoot-phone.mjs.
import { writeFileSync } from 'node:fs';
import { loadContent } from '../src/data';
import { createInitialState, createSaveText, Decimal, newOwnedCard } from '../src/game';

const content = loadContent();
const s = createInitialState(content);
for (const dg of content.dungeons) s.clearedDungeons.push(dg.id);
const team = ['gilded_knight', 'golden_tilter', 'golden_sharpshot', 'golden_sage'];
for (const id of team) {
  s.cards.owned[id] = { ...newOwnedCard(content.cardById.get(id)!.tier), level: 70, stars: 3 };
}
for (const id of ['dawnblade_regent', 'ember_squire', 'shield_warden'])
  s.cards.owned[id] = { ...newOwnedCard(), tier: 'bronze', stars: 1, level: 5 };
s.cards.loadouts.fighting.slots = team;
s.starter.done = true;
s.cards.shards = 87;
s.resources['starlight'] = new Decimal(23);
s.prestigeCount = 1;
s.arena.coins = 1240;
s.arena.season = 2;
s.arena.points = 1500;
s.arena.wins = 12;
s.arena.losses = 5;
writeFileSync(process.argv[2] ?? 'phone-save.txt', createSaveText(s, Date.now()));
