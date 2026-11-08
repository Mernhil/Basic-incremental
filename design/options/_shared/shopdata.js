/* Placeholder Shop content, copied from src/data/content/prestige.json and achievements.json. */
const SHOP = {
  starlight: 23, shards: 87, ascGain: 14, ascNum: 2,
  ups: [
    { id: 'groves', n: 'Starlit Groves', d: '+10% logging output per level', lv: 3, max: 25, p: 7, a: '+30%', b: '+40%', coin: 'cos-starlight-a' },
    { id: 'veins', n: 'Starlit Veins', d: '+10% mining output per level', lv: 0, max: 25, p: 2, a: '+0%', b: '+10%' },
    { id: 'edge', n: 'Starforged Edge', d: '+15% damage per level', lv: 0, max: 25, p: 3, a: '+0%', b: '+15%' },
    { id: 'ward', n: 'Celestial Ward', d: '+20% card health per level', lv: 0, max: 10, p: 3, a: '+0%', b: '+20%' },
    { id: 'const', n: 'Constellation Crystals', d: '+10% crystals from bosses per level', lv: 0, max: 10, p: 5, a: '+0%', b: '+10%' },
    { id: 'skies', n: 'Wide Skies', d: 'Tree and mine prices grow 1% slower per level', lv: 0, max: 5, p: 8, a: '0%', b: '-1%' },
    { id: 'night', n: 'Long Night', d: '+1 h offline cap per level', lv: 4, max: 4, p: 0, a: '+4 h', b: '+4 h' },
  ],
  copies: [
    ['ember_squire', 5], ['apprentice_feller', 5], ['cave_digger', 5], ['shield_warden', 10], ['grove_keeper', 10], ['gem_cutter', 10],
    ['storm_duelist', 20], ['elder_treant', 20], ['dawnblade_regent', 40], ['geode_golem', 40], ['moonwood_dryad', 75], ['core_titan', 120],
  ],
  supplies: [
    ['Summon Crystals', '×100', 10, 'drop'], ['Glamour Crystals', '×100', 15, 'pentagon'], ['Frost Cores', '×10', 20, 'hexagon'], ['Glimmer Dust', '×500', 10, 'round'], ['Facet Shards', '×300', 15, 'square'],
  ],
  cosmetics: [['Ember Crown', 150, 'Card exclusive'], ['Starlight coin D', 100, 'Starlight coin'], ['Starlight coin E', 160, 'Starlight coin'], ['Sticker style D', 100, 'Sticker style'], ['Skill nodes E', 160, 'Skill nodes'], ['Wardrobe style E', 160, 'Wardrobe style']],
  kept: ['Cards and loadouts', 'Cosmetics', 'Crystals and Starlight', 'Portal pity', 'Medals and mastery'],
  reset: ['Money and gems', 'Tree and mine levels', 'Cores and materials', 'Run shelf upgrades'],
};
