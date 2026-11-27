// Adds the arena and raid shop Heirlooms (DESIGN.md Arena and raids) to cards.json, moves.json and
// enhancements.json, each cloned from the Wildwood Heirloom of its weapon type (stats, ability, team
// bonus, enhancement options, moves), with its own id, name, element, side and move names.
// Usage: node design/pixel/shop-heirlooms/build-content.mjs   (then prettier --write on the three files)
// Run once; running it again changes nothing (ids already there are skipped).
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', '..', '..');
const dir = join(root, 'src/data/content');
const read = (f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));
const cards = read('cards.json');
const moves = read('moves.json');
const enh = read('enhancements.json');

// [id, name, kind, element, shop kind, set, skill, ult]
const SPECS = [
  ['victors_longbow', "Victor's Longbow", 'bow', 'light', 'arena', 'arena_s1', 'Volley Opener', "Victor's Salvo"],
  ['pit_piercer', 'Pit Piercer', 'spear', 'fire', 'arena', 'arena_s1', 'Pit Thrust', 'Arena Impale'],
  ['laurel_staff', 'Laurel Staff', 'staff', 'light', 'arena', 'arena_s2', 'Laurel Ward', 'Crown of Laurels'],
  ['champion_greatsword', 'Champion Greatsword', 'greatsword', 'fire', 'arena', 'arena_s2', "Champion's Swing", "Gladiator's Verdict"],
  ['titans_rootblade', "Titan's Rootblade", 'greatsword', 'earth', 'raid', 'raid_rootstone', 'Root Cleave', "Titan's Fall"],
  ['stonehewer', 'Stonehewer', 'hammer', 'earth', 'raid', 'raid_rootstone', 'Stone Hew', 'Quarry Quake'],
  ['mossbreaker', 'Mossbreaker', 'lance', 'earth', 'raid', 'raid_rootstone', 'Moss Charge', 'Bark Rush'],
  ['rootstone_pick', 'Rootstone Pick', 'pickaxe', 'earth', 'raid', 'raid_rootstone'],
  ['emberhew', 'Emberhew', 'logging_axe', 'fire', 'raid', 'raid_ember'],
  ['tyrants_cinder', "Tyrant's Cinder", 'dagger', 'fire', 'raid', 'raid_ember', 'Cinder Flick', "Tyrant's Ash"],
  ['pyre_reaper', 'Pyre Reaper', 'scythe', 'fire', 'raid', 'raid_ember', 'Ash Reap', 'Pyre Harvest'],
  ['pyre_scepter', 'Pyre Scepter', 'staff', 'fire', 'raid', 'raid_ember', 'Pyre Ward', "Tyrant's Blaze"],
  ['queens_tidebow', "Queen's Tidebow", 'bow', 'water', 'raid', 'raid_tide', 'Tide Shot', "Queen's Flood"],
  ['queens_trident', "Queen's Trident", 'spear', 'water', 'raid', 'raid_tide', 'Trident Jab', 'Tidal Spear'],
  ['brineblade', 'Brineblade', 'sword', 'water', 'raid', 'raid_tide', 'Brine Rend', 'Riptide Cut'],
  ['drowners_maul', "Drowner's Maul", 'hammer', 'water', 'raid', 'raid_tide', 'Drown Smash', 'Sunken Toll'],
  ['lichfang', 'Lichfang', 'dagger', 'dark', 'raid', 'raid_lich', 'Lich Prick', 'Soul Bite'],
  ['dread_cleaver', 'Dread Cleaver', 'greatsword', 'dark', 'raid', 'raid_lich', 'Dread Chop', "Lich's Verdict"],
  ['grave_harvest', 'Grave Harvest', 'scythe', 'dark', 'raid', 'raid_lich', 'Grave Reap', 'Soul Harvest'],
  ['dragonbone_staff', 'Dragonbone Staff', 'staff', 'dark', 'raid', 'raid_lich', 'Bone Mend', 'Lich Dirge'],
  ['dawnspear', 'Dawnspear', 'lance', 'light', 'raid', 'raid_seraph', 'Dawnlight Thrust', 'Halo Charge'],
  ['seraphs_edge', "Seraph's Edge", 'sword', 'light', 'raid', 'raid_seraph', 'Seraph Slash', 'Sunrise Cut'],
  ['sunfeather_bow', 'Sunfeather Bow', 'bow', 'light', 'raid', 'raid_seraph', 'Feather Shot', 'Dawn Volley'],
  ['halo_hewer', 'Halo Hewer', 'logging_axe', 'light', 'raid', 'raid_seraph'],
];
const SIDE = { light: 'mythic', water: 'mythic', earth: 'mythic', fire: 'void', dark: 'void' };
// the Wildwood Heirloom of each weapon type is the model
const MODEL = {
  sword: 'antlerblade', greatsword: 'elderbark', lance: 'alicorn', hammer: 'toadmaul', bow: 'owlwing',
  logging_axe: 'beetlejaw', dagger: 'phoenixquill', spear: 'bloodrose', scythe: 'emberscale',
  staff: 'emberblossom', pickaxe: 'drumbeak',
};

let added = 0;
for (const [id, name, kind, element, shopKind, set, skill, ult] of SPECS) {
  if (cards.some((c) => c.id === id)) continue;
  const model = cards.find((c) => c.id === MODEL[kind]);
  const card = structuredClone(model);
  delete card.batch;
  delete card.heirloomName;
  delete card.pictureAlt;
  const { id: _a, name: _b, ...rest } = card;
  const out = { id, name, ...rest, side: SIDE[element], element, shop: { kind: shopKind, set } };
  cards.push(out);
  enh.cards[id] = structuredClone(enh.cards[model.id]);
  if (skill) {
    const m = structuredClone(moves.cards[model.id]);
    m.skill = skill;
    m.ult = ult;
    delete m.note;
    moves.cards[id] = m;
  }
  added++;
}
writeFileSync(join(dir, 'cards.json'), JSON.stringify(cards, null, 2));
writeFileSync(join(dir, 'moves.json'), JSON.stringify(moves, null, 2));
writeFileSync(join(dir, 'enhancements.json'), JSON.stringify(enh, null, 2));
console.log('added', added, 'Heirloom cards');
