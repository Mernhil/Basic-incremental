// Imports the approved arena and raid art (2026-11-27): coins, rank icons, rank frames and the shop
// Heirloom sprites drawn so far. Files are copied byte for byte and never altered.
// Usage: node design/pixel/shop-heirlooms/import.mjs C:/work/handoff/art
// Each goes to src/renderer/src/art/pixel/hand/ and sprites/ under the game's naming, and gets its
// line in manifest.ts (native size, no traced outline: the bake adds it when `outlines.json` has one).
// Missing Heirloom sprites are not made here: the card shows an empty picture slot until the art
// controller drops the file in (the same name) and runs the bake.
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const src = process.argv[2];
const root = join(import.meta.dirname, '..', '..', '..');
const pixel = join(root, 'src/renderer/src/art/pixel');
const manifestPath = join(pixel, 'manifest.ts');
let manifest = readFileSync(manifestPath, 'utf8');

const size = (file) => {
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};
const jobs = [];
const add = (from, name) => jobs.push([from, name]);

add('arena/coin-arena.png', 'coin-arena');
for (const el of ['earth', 'fire', 'water', 'dark', 'light']) add(`raid/coin-raid-${el}.png`, `coin-raid-${el}`);
for (const mode of ['arena', 'raid'])
  for (const band of ['contender', 'top100', 'top50', 'top10', 'champion']) {
    add(`ranks/${mode}-${band}.png`, `rank-${mode}-${band}`);
    if (band !== 'contender') add(`ranks/frame-${mode}-${band}.png`, `frame-${mode}-${band}`);
  }
// arena Heirlooms: the set (season) each type belongs to
const ARENA = { bow: 'arena_s1', spear: 'arena_s1', staff: 'arena_s2', greatsword: 'arena_s2' };
for (const [type, set] of Object.entries(ARENA)) add(`arena/heirloom-arena-${type}.png`, `item-${type}-${set}-heirloom`);
const BOSS = { rootstone: 'raid_rootstone', ember: 'raid_ember', tide: 'raid_tide', lich: 'raid_lich', seraph: 'raid_seraph' };
for (const [word, set] of Object.entries(BOSS))
  for (const type of ['sword', 'greatsword', 'spear', 'lance', 'dagger', 'hammer', 'bow', 'staff', 'scythe', 'pickaxe', 'axe'])
    add(`raid/heirloom-${word}-${type}.png`, `item-${type === 'axe' ? 'logging_axe' : type}-${set}-heirloom`);

const added = [];
for (const [from, name] of jobs) {
  const file = join(src, from);
  if (!existsSync(file)) continue;
  copyFileSync(file, join(pixel, 'hand', `${name}.png`));
  copyFileSync(file, join(pixel, 'sprites', `${name}.png`));
  const { w, h } = size(file);
  if (!manifest.includes(`  '${name}': {`)) {
    added.push(`  '${name}': { w: ${w}, h: ${h} },`);
  }
}
if (added.length > 0) manifest = manifest.replace(/\n};\n?$/, `\n${added.join('\n')}\n};\n`);
writeFileSync(manifestPath, manifest);
copyFileSync(join(src, 'ranks/font/rank-numerals.ttf'), join(root, 'src/renderer/src/art/rank-numerals.ttf'));
console.log(`imported ${added.length} sprites and the rank numerals font`);
