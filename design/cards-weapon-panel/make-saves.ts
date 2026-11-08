// Builds exported-save strings for the weapon panel and Cards page screenshots (the states of the
// review mockups). Run: npx tsx design/cards-weapon-panel/make-saves.ts > saves.json
// shoot.mjs imports each one through Settings > Import save in the running dev app.
import { loadContent } from '../../src/data';
import {
  Decimal,
  createInitialState,
  exportSaveString,
  newOwnedCard,
  type GameState,
  type OwnedCard,
} from '../../src/game';

const content = loadContent();

function base(): GameState {
  const state = createInitialState(content);
  state.resources = Object.fromEntries(
    Object.entries({
      money: '12500000',
      moss_core: '12',
      cinder_core: '12',
      frost_core: '800',
      frost_sigil: '700',
      iron_gem: '90000',
      ironbark_gem: '90000',
      grotto_gem: '95000',
      moonwillow_gem: '95000',
      summon_crystal: '14',
      glamour_crystal: '3',
    }).map(([k, v]) => [k, new Decimal(v)]),
  ) as GameState['resources'];
  return state;
}

function own(state: GameState, id: string, patch: Partial<OwnedCard>): void {
  state.cards.owned[id] = { ...newOwnedCard(), ...patch };
}

/** Every card of the collection in a mix of tiers and stars (the Cards page grid). */
function collection(): GameState {
  const state = base();
  own(state, 'ember_squire', { tier: 'silver', stars: 3, level: 27, xp: new Decimal(121), starFill: 4 });
  own(state, 'storm_duelist', { tier: 'gold', stars: 4, level: 54 });
  own(state, 'dawnblade_regent', { tier: 'gold', stars: 3, level: 59, starFill: 1 });
  own(state, 'apprentice_feller', { tier: 'bronze', stars: 3, level: 11 });
  own(state, 'grove_keeper', { tier: 'silver', stars: 1, level: 40, starFill: 1 });
  own(state, 'elder_treant', { tier: 'bronze', stars: 1, level: 9 });
  own(state, 'cave_digger', { tier: 'bronze', stars: 2, level: 4 });
  own(state, 'gem_cutter', { tier: 'bronze', stars: 1, level: 3 });
  own(state, 'geode_golem', { tier: 'silver', stars: 2, level: 38 });
  state.cards.loadouts.fighting.main = 'ember_squire';
  return state;
}

/** The main fighting card in the states of the weapon panel mockups. */
function weapon(id: string, patch: Partial<OwnedCard>, resources: Record<string, string> = {}): GameState {
  const state = base();
  for (const [k, v] of Object.entries(resources)) state.resources[k] = new Decimal(v);
  own(state, id, patch);
  state.cards.loadouts.fighting.main = id;
  state.activeDungeonId = 'mossy_cellar';
  return state;
}

const states: Record<string, GameState> = {
  collection: collection(),
  mid: weapon('ember_squire', {
    tier: 'silver', stars: 3, level: 27, xp: new Decimal(121), starFill: 4,
  }),
  ok: weapon(
    'ember_squire',
    { tier: 'bronze', stars: 2, level: 20, starFill: 1 },
    { money: '1250000', moss_core: '7', iron_gem: '19000', ironbark_gem: '31000' },
  ),
  short: weapon(
    'ember_squire',
    { tier: 'silver', stars: 3, level: 40, starFill: 4 },
    { money: '4200000', cinder_core: '6', grotto_gem: '31000', moonwillow_gem: '41000' },
  ),
  sigil: weapon(
    'ember_squire',
    { tier: 'gold', stars: 4, level: 60, starFill: 3 },
    { money: '310000000', frost_core: '240', frost_sigil: '120' },
  ),
  uniq: weapon(
    'ember_squire',
    { tier: 'prismatic', stars: 5, level: 80, starFill: 9 },
    { money: '30000000000', frost_core: '2000', frost_sigil: '2000', grotto_gem: '5000000', moonwillow_gem: '5000000' },
  ),
  nouniq: weapon('storm_duelist', { tier: 'prismatic', stars: 4, level: 80, starFill: 3 }),
  done: weapon('ember_squire', { tier: 'unique', stars: 6, level: 100 }),
  fresh: createInitialState(content),
};

const out: Record<string, string> = {};
for (const [name, state] of Object.entries(states)) {
  out[name] = exportSaveString(state, Date.now());
}
console.log(JSON.stringify(out));
