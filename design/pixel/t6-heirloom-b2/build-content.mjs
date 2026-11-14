// Adds batch 2 (Leviathan) cards to the content data (DESIGN.md §5 Art batches; names, elements and
// numbers are Claude's [Default]s): 22 T6 cards (one Mythic, one Void per type, cloned from the type's
// base Mythic and Void card) and 11 Heirloom cards (cloned from the type's Dragon Heirloom), with their
// portal pool entries, shard shop copies, enhancement options and Heirloom trees.
// Run once: node design/pixel/t6-heirloom-b2/build-content.mjs, then npx prettier --write src/data/content
import { readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('../../../src/data/content/', import.meta.url);
const read = (f) => JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
const write = (f, d) => writeFileSync(new URL(f, dir), JSON.stringify(d, null, 2) + '\n');
const clone = (x) => JSON.parse(JSON.stringify(x));

const cards = read('cards.json');
const portals = read('portals.json');
const ach = read('achievements.json');
const enh = read('enhancements.json');
const heir = read('heirlooms.json');

// type: [Mythic card, Mythic weapon, Mythic element, Void card, Void weapon, Void element]
const T6 = {
  sword: ['Pearl Duelist', 'Pearlbrand', 'crystal', 'Brine Corsair', 'Saltcutter', 'void'],
  greatsword: ['Surf Crusader', 'Wavecleaver', 'light', 'Maelstrom Tyrant', 'Drowncleaver', 'void'],
  dagger: ['Silver Minnow', 'Glimmerfin', 'crystal', 'Reef Assassin', 'Urchin Fang', 'nature'],
  spear: ['Coral Hoplite', 'Coralspire', 'storm', 'Kraken Impaler', 'Krakenthorn', 'void'],
  lance: ['Foam Cavalier', 'Surfpiercer', 'light', 'Sunken Horseman', 'Sunkenlance', 'storm'],
  hammer: ['Anchor Smith', 'Anchorfall', 'earth', 'Barnacle Crusher', 'Barnaclemaul', 'earth'],
  bow: ['Moonlit Angler', 'Moonscale', 'storm', 'Siren Huntress', 'Sirensong', 'void'],
  staff: ['Tide Oracle', 'Tideseer', 'light', 'Murk Warlock', 'Murkwand', 'void'],
  scythe: ['Kelp Harvester', 'Kelpreap', 'nature', 'Deep Sovereign', 'Deepreap', 'void'],
  pickaxe: ['Reef Prospector', 'Reefpick', 'light', 'Trench Burrower', 'Trenchpick', 'void'],
  logging_axe: [
    'Driftwood Keeper',
    'Driftfeller',
    'light',
    'Mangrove Tyrant',
    'Mangrovebite',
    'void',
  ],
};
// type: [Heirloom name, element, rarity of its lean side, tree name, capstone name]
const HEIRLOOM = {
  sword: ['Auroratusk', 'crystal', 'mythic', 'Polar Spiral', 'Narwhal Dawn'],
  greatsword: ['Maelfang', 'void', 'void', 'Bloodwater', 'Feeding Frenzy'],
  dagger: ['Venomplume', 'nature', 'void', 'Spined Mane', 'Lethal Bloom'],
  spear: ['Bluestrike', 'storm', 'mythic', 'Open Water', 'Sailfin Rush'],
  lance: ['Pearlrider', 'light', 'mythic', 'Tidal Charger', 'Seahorse Gallop'],
  hammer: ['Clawbreaker', 'earth', 'void', 'Hard Shell', 'Crushing Pincer'],
  bow: ['Mantaglide', 'storm', 'mythic', 'Wing Beat', 'Glide of Ages'],
  staff: ['Dreadbloom', 'void', 'void', 'Drifting Veil', 'Stinging Tide'],
  scythe: ['Coilreaper', 'void', 'void', 'Reef Lurker', 'Second Jaw'],
  pickaxe: ['Prismstrike', 'crystal', 'mythic', 'Spectrum Fist', 'Shatter Spectrum'],
  logging_axe: ['Eldershell', 'nature', 'mythic', 'Slow Currents', 'Century Tide'],
};

const snake = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z]+/g, '_')
    .replace(/^_|_$/g, '');
const base = (kind, side) =>
  cards.find((c) => c.item.kind === kind && c.rarity === side && !c.heirloomArt && !c.heirloom);
const dragon = (kind) => cards.find((c) => c.item.kind === kind && c.heirloom && !c.batch);

const added = [];
for (const [kind, v] of Object.entries(T6)) {
  for (const [i, side] of [
    [0, 'mythic'],
    [3, 'void'],
  ]) {
    const c = clone(base(kind, side));
    c.id = snake(v[i]);
    c.name = v[i];
    c.element = v[i + 2];
    c.batch = 'leviathan';
    c.heirloomName = v[i + 1];
    added.push(c);
  }
}
for (const [kind, v] of Object.entries(HEIRLOOM)) {
  const c = clone(dragon(kind));
  c.id = snake(v[0]);
  c.name = v[0];
  c.rarity = v[2];
  c.element = v[1];
  c.batch = 'leviathan';
  c.heirloomName = v[0];
  added.push(c);
}
if (cards.some((c) => added.some((a) => a.id === c.id))) throw new Error('already added');
// key order as the other cards
const order = (c) => {
  const { id, name, heirloom, job, rarity, element, item, batch, heirloomName, ...rest } = c;
  return {
    id,
    name,
    ...(heirloom ? { heirloom } : {}),
    job,
    rarity,
    element,
    item,
    batch,
    heirloomName,
    ...rest,
  };
};
cards.push(...added.map(order));
write('cards.json', cards);

// portal pool: the new Mythic and Void cards share their rarity's chance equally with the old ones
const pool = portals.find((p) => p.id === 'card_portal').pool;
const newT6 = added.filter((c) => !c.heirloom);
for (const side of ['mythic', 'void']) {
  const old = pool.filter((e) => e.rarity === side);
  const mine = newT6.filter((c) => c.rarity === side);
  const factor = old.length / (old.length + mine.length);
  const w = old[0].weight;
  for (const e of old) e.weight = Number((e.weight * factor).toPrecision(7));
  for (const c of mine) {
    pool.push({ itemId: c.id, rarity: side, weight: Number((w * factor).toPrecision(7)) });
  }
}
write('portals.json', portals);

// shard shop: a copy of each new T6 card at the Mythic and Void price
for (const c of newT6) {
  const ref = ach.shardShop.find((e) => e.id === `copy_${base(c.item.kind, c.rarity).id}`);
  ach.shardShop.splice(
    ach.shardShop.findIndex((e) => e.reward.kind !== 'card'),
    0,
    { id: `copy_${c.id}`, reward: { kind: 'card', card: c.id }, price: ref.price, stock: ref.stock },
  );
}
write('achievements.json', ach);

// enhancements: the options of the card each was cloned from
for (const c of added) {
  const from = c.heirloom ? dragon(c.item.kind) : base(c.item.kind, c.rarity);
  enh.cards[c.id] = clone(enh.cards[from.id]);
}
write('enhancements.json', enh);

// Heirloom trees: the type's Dragon tree under its own names
for (const c of added.filter((x) => x.heirloom)) {
  const v = HEIRLOOM[c.item.kind];
  const t = clone(heir.trees.find((x) => x.card === dragon(c.item.kind).id));
  t.card = c.id;
  t.name = v[3];
  t.nodes.find((n) => n.id === 'capstone').name = v[4];
  heir.trees.push(t);
}
write('heirlooms.json', heir);
console.log('added', added.length);
