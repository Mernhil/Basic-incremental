import { loadContent } from '../../src/data';
import { Decimal, createInitialState } from '../../src/game';
import { buyerCandidates, greedyBuy } from './sim';

const content = loadContent();
const base = createInitialState(content);
base.cards.owned['ember_squire']!.level = 20;
base.clearedDungeons = ['mossy_cellar'];
base.production.unlockedTrees = ['ironbark', 'moonwillow'];
base.resources['moss_core'] = new Decimal(10);
base.resources['money'] = new Decimal(1e5);
console.log(
  buyerCandidates(base, content)
    .filter((c) => c.kind === 'card' || c.kind === 'economy')
    .map((c) => `${c.id} eta=${c.eta} hold=${c.hold} ${c.prices.map((p) => p.resource + ':' + p.amount.toString()).join(',')}`)
    .join('\n'),
);
const r = greedyBuy(base, content);
console.log(r.bought, r.state.resources['money']!.toString());
