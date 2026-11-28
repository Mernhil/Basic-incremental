// Sets the shop prices and perks in arena.json (DESIGN.md Arena and raids): each arena perk enables
// or counters one combo archetype the search found (`vs` names its tag), the raid perks are plain
// strength against the raid bosses, and the prices are set so an average player earns one Heirloom
// every 2 to 3 seasons (about 2,600 arena coins a season at 10 fights a day, about 1,700 coins of
// one boss a season at 3 tries a day). Usage: node design/pixel/shop-heirlooms/set-shop.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const path = join(import.meta.dirname, '..', '..', '..', 'src/data/content/arena.json');
const a = JSON.parse(readFileSync(path, 'utf8'));
const mod = (stat, kind, value) => ({ stat, kind, value: String(value) });
const perk = (line, modifiers, vs) => ({ line, ...(vs ? { vs } : {}), modifiers });

const ARENA = {
  victors_longbow: [
    6000,
    perk('Opens every arena fight with a volley: its gauge fills 60% faster', [mod('burst.fill', 'percent', 60)]),
  ],
  pit_piercer: [
    6500,
    perk('Pierces Wall teams: +35% damage against rivals with two tanks', [mod('combat.damage', 'percent', 35)], 'wall'),
  ],
  laurel_staff: [
    6000,
    perk('Steadies the team against Rush teams: +12% defence', [mod('combat.defence', 'flat', 12)], 'rush'),
  ],
  champion_greatsword: [
    7500,
    perk('Hits harder against any rival with an Heirloom: +30% damage', [mod('combat.damage', 'percent', 30)], 'heirloom'),
  ],
};
for (const s of a.shop.seasons)
  for (const item of s.items) {
    const [price, p] = ARENA[item.card];
    item.price = price;
    item.perk = p;
  }

const RAID = {
  titans_rootblade: [4500, perk('+20% damage against raid bosses', [mod('combat.damage', 'percent', 20)])],
  stonehewer: [4500, perk('+25% health against raid bosses', [mod('combat.health', 'percent', 25)])],
  mossbreaker: [4000, perk('+10% defence against raid bosses', [mod('combat.defence', 'flat', 10)])],
  rootstone_pick: [4000, null],
  emberhew: [4000, null],
  tyrants_cinder: [4500, perk('+18% damage against raid bosses', [mod('combat.damage', 'percent', 18)])],
  pyre_reaper: [4500, perk('+10% crit chance against raid bosses', [mod('combat.critChance', 'flat', 0.1)])],
  pyre_scepter: [4000, perk('+10% defence against raid bosses', [mod('combat.defence', 'flat', 10)])],
  queens_tidebow: [4500, perk('Opens every raid fight with a burst: gauge fills 40% faster', [mod('burst.fill', 'percent', 40)])],
  queens_trident: [4500, perk('+18% damage against raid bosses', [mod('combat.damage', 'percent', 18)])],
  brineblade: [4000, perk('+10% crit chance against raid bosses', [mod('combat.critChance', 'flat', 0.1)])],
  drowners_maul: [4500, perk('+20% health against raid bosses', [mod('combat.health', 'percent', 20)])],
  lichfang: [4500, perk('+15% damage against raid bosses', [mod('combat.damage', 'percent', 15)])],
  dread_cleaver: [4500, perk('+20% health against raid bosses', [mod('combat.health', 'percent', 20)])],
  grave_harvest: [4000, perk('+12% damage against raid bosses', [mod('combat.damage', 'percent', 12)])],
  dragonbone_staff: [4000, perk('+10% defence against raid bosses', [mod('combat.defence', 'flat', 10)])],
  dawnspear: [4000, perk('+10% defence against raid bosses', [mod('combat.defence', 'flat', 10)])],
  seraphs_edge: [4500, perk('+18% damage against raid bosses', [mod('combat.damage', 'percent', 18)])],
  sunfeather_bow: [4500, perk('Opens every raid fight with a burst: gauge fills 40% faster', [mod('burst.fill', 'percent', 40)])],
  halo_hewer: [4000, null],
};
for (const shop of Object.values(a.raid.shops))
  for (const item of shop.items) {
    const [price, p] = RAID[item.card];
    item.price = price;
    if (p) item.perk = p;
    else delete item.perk;
  }
writeFileSync(path, JSON.stringify(a, null, 2) + '\n');
console.log('shop prices and perks set');
