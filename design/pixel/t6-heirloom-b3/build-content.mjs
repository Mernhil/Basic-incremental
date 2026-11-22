// Adds batch 3 (Wildwood) to the content data (DESIGN.md §2 The Wildwood batch; the shown names and
// Heirloom elements are the user-approved design/wildwood-names-2026-11-22.json, local; ids, the
// invisible `name`s, tree names and numbers are Claude's [Default]s): 22 T6 cards (hero earth,
// villain fire, cloned from the type's base Dragon-batch Mythic and Void card, so the same
// strength), 12 Heirlooms (cloned from the type's Dragon Heirloom), with their portal pool entries,
// shard shop copies, enhancement options and Heirloom trees.
// Run once: node design/pixel/t6-heirloom-b3/build-content.mjs, then npx prettier --write src/data/content
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
const batches = read('batches.json');

const names = JSON.parse(
  readFileSync(
    process.argv[2] ?? 'C:/Basic Incremental/design/wildwood-names-2026-11-22.json',
    'utf8',
  ),
);
const KINDS = [
  'sword',
  'greatsword',
  'dagger',
  'spear',
  'lance',
  'hammer',
  'bow',
  'staff',
  'scythe',
  'pickaxe',
  'logging_axe',
];
// Heirloom: [file, tree name, capstone name] (tree and capstone names are Claude's)
const TREES = {
  'h-sword': ['Antlered Crown', 'Rut of the Elder Stag'],
  'h-greatsword': ['Heartwood', 'Ring of Ages'],
  'h-lance': ['Lone Horn', 'Alicorn Charge'],
  'h-hammer': ['Spore Cap', 'Toadstool Ring'],
  'h-bow': ['Silent Flight', 'Eyes of the Night'],
  'h-logging_axe': ['Hardened Chitin', 'Titan Bite'],
  'h-dagger-alt': ['Nine Tails', 'Trickster Dance'],
  'h-dagger': ['Ashen Plume', 'Rebirth Flame'],
  'h-spear': ['Thorned Stem', 'Bloom of Blood'],
  'h-scythe': ['Cinder Scales', 'Flame Shed'],
  'h-staff': ['Smouldering Petal', 'Ember Bloom'],
  'h-pickaxe': ['Drumming', 'Hammerbeak Rhythm'],
};

const snake = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z]+/g, '_')
    .replace(/^_|_$/g, '');
const base = (kind, side) =>
  cards.find((c) => c.item.kind === kind && c.side === side && !c.heirloomArt && !c.heirloom && !c.batch);
const dragon = (kind) => cards.find((c) => c.item.kind === kind && c.heirloom && !c.batch);

const added = [];
const T6_PREFIX = { mythic: 'Wild', void: 'Ash' };
for (const kind of KINDS) {
  for (const [suffix, side, element] of [
    ['m', 'mythic', 'earth'],
    ['v', 'void', 'fire'],
  ]) {
    const shown = names[side === 'mythic' ? 'heroT6_earth' : 'villainT6_fire'][`${kind}-${suffix}`];
    const c = clone(base(kind, side));
    c.id = snake(shown);
    c.name = `${T6_PREFIX[side]} ${shown}`; // shown nowhere (a placeholder, never a second weapon name)
    c.element = element;
    c.batch = 'wildwood';
    c.heirloomName = shown;
    added.push(c);
  }
}
const order = [];
// the fox tail dagger (-alt) goes after the phoenix one, so `wildwood#2` is the second
for (const [file, v] of Object.entries(names.heirlooms).sort(
  (a, b) => Number(a[0].endsWith('-alt')) - Number(b[0].endsWith('-alt')),
)) {
  const kind = KINDS.find((k) => file === `h-${k}` || file === `h-${k}-alt`);
  if (!kind) throw new Error(file);
  const c = clone(dragon(kind));
  c.id = snake(v.name);
  c.name = v.name;
  // the side only picks the grade colour: earth leans Mythic (hero), fire leans Void
  c.side = v.element === 'earth' ? 'mythic' : 'void';
  c.element = v.element;
  c.batch = 'wildwood';
  c.heirloomName = v.name;
  if (file.endsWith('-alt')) c.pictureAlt = true;
  added.push(c);
  order.push([c, file]);
}
const allIds = new Set(cards.map((c) => c.id));
for (const a of added) if (allIds.has(a.id)) throw new Error(`id ${a.id} exists`);
if (new Set(added.map((a) => a.id)).size !== added.length) throw new Error('duplicate ids');

// key order as the other cards
const keyOrder = (c) => {
  const { id, name, heirloom, job, tier, side, element, role, item, batch, heirloomName, pictureAlt, ...rest } = c;
  return {
    id,
    name,
    ...(heirloom ? { heirloom } : {}),
    job,
    tier,
    side,
    element,
    ...(role ? { role } : {}),
    item,
    batch,
    heirloomName,
    ...(pictureAlt ? { pictureAlt } : {}),
    ...rest,
  };
};
cards.push(...added.map(keyOrder));
write('cards.json', cards);

batches.push({ id: 'wildwood', name: 'Wildwood', kit: 'kit-t6-wildwood' });
write('batches.json', batches);

// portal pool: the new Mythic and Void cards share their tier's chance equally with the old ones
const pool = portals.find((p) => p.id === 'card_portal').pool;
const newT6 = added.filter((c) => !c.heirloom);
const report = {};
for (const side of ['mythic', 'void']) {
  const old = pool.filter((e) => e.tier === side);
  const mine = newT6.filter((c) => c.side === side);
  const factor = old.length / (old.length + mine.length);
  const w = old[0].weight;
  for (const e of old) e.weight = Number((e.weight * factor).toPrecision(7));
  for (const c of mine) {
    pool.push({ itemId: c.id, tier: side, weight: Number((w * factor).toPrecision(7)) });
  }
  report[side] = `${old.length} -> ${old.length + mine.length}`;
}
write('portals.json', portals);

// shard shop: a copy of each new T6 card at the Mythic and Void price
for (const c of newT6) {
  const ref = ach.shardShop.find((e) => e.id === `copy_${base(c.item.kind, c.side).id}`);
  ach.shardShop.splice(
    ach.shardShop.findIndex((e) => e.reward.kind !== 'card'),
    0,
    { id: `copy_${c.id}`, reward: { kind: 'card', card: c.id }, price: ref.price, stock: ref.stock },
  );
}
write('achievements.json', ach);

// enhancements: the options of the card each was cloned from
for (const c of added) {
  const from = c.heirloom ? dragon(c.item.kind) : base(c.item.kind, c.side);
  enh.cards[c.id] = clone(enh.cards[from.id]);
}
write('enhancements.json', enh);

// Heirloom trees: the type's Dragon tree under its own names
for (const [c, file] of order) {
  const t = clone(heir.trees.find((x) => x.card === dragon(c.item.kind).id));
  t.card = c.id;
  t.name = TREES[file][0];
  t.nodes.find((n) => n.id === 'capstone').name = TREES[file][1];
  heir.trees.push(t);
}
write('heirlooms.json', heir);
console.log('added', added.length, report);
