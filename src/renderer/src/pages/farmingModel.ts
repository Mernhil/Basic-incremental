import type { Content } from '../../../data';
import {
  collectModifiers,
  farmPostView,
  farmTotals,
  type FarmPostView,
  type GameState,
  type Modifier,
} from '../../../game';
import { fmt } from '../settings/numberFormat';
import { moneyText } from '../settings/coins';

/**
 * The Farming tab of the dungeon window as plain data (DESIGN.md §2 A team farms a finished
 * dungeon; UI_RULES.md §2): one card per dungeon, what each earns an hour, and the totals across
 * the top. No DOM: unit tested.
 */

export const FARM_COPY = {
  title: 'Farming posts',
  closed: 'Finish the whole path to open its post',
  team: 'Team',
  traits: 'Traits',
  empty: 'Empty',
  perHour: '/h',
  farmOnly: 'FARM ONLY',
  level: (n: number) => `Lv ${n}`,
  levelMax: (n: number) => `Lv ${n} (top)`,
  traitReady: 'Trait ready: pick 1 of 2',
  nextTrait: (level: number) => `Next trait at Lv ${level}`,
  noMoreTraits: 'Every trait picked',
  noTeam: 'Put a team here to start farming',
  difficulty: { normal: 'Normal', hard: 'Hard', nightmare: 'Nightmare' } as Record<string, string>,
  finishedOn: (d: string) => `Whole path beaten on ${d}`,
  totalsPosts: (n: number) => (n === 1 ? '1 post' : `${n} posts`),
  noPosts: 'No post open yet',
  // the dialogs
  teamTitle: (dungeon: string) => `${dungeon}: the post's team`,
  teamCost: (cost: number, cap: number) => `Team cost ${cost} / ${cap}`,
  teamHelp:
    'A card sits in one team at a time. Click a card to put it here, click it again to take it out.',
  noCards: 'You own no fighting card that is free.',
  inLoadout: 'In your fighting team',
  atPost: (dungeon: string) => `At ${dungeon}`,
  overCap: (over: number) => `Over the cost cap by ${over}`,
  full: 'The team is full',
  away: 'Away on a trip',
  close: 'Close',
  remove: 'Take out',
  traitsTitle: (dungeon: string) => `${dungeon}: the post's traits`,
  pickOne: 'Pick 1 of 2',
  pick: 'Pick',
  reroll: 'Reroll the pair',
  chosen: 'Picked traits',
  noneChosen: 'None yet. The first opens at the next milestone.',
  upgrade: 'Post upgrade',
  upgradeLine: (level: number, max: number, percent: number) =>
    `Level ${level} of ${max}: every level adds ${percent}% to everything the post earns`,
  buy: 'Buy',
  atTop: 'At the top',
  herbs: (n: string) => `You hold ${n} herb bundles`,
  needHerbs: 'Not enough herb bundles',
  levelHelp: (hours: string) => `A level takes about ${hours} hours of a full team.`,
  heirloomShards: 'Heirloom shards',
  scrollFragments: 'Scroll fragments',
  herbBundles: 'Herb bundles',
} as const;

export interface FarmLine {
  /** Stable key: a resource id, or `shards`. */
  key: string;
  label: string;
  /** "9,400 Copper/h", "2/h". */
  value: string;
  farmOnly: boolean;
  /** The resource whose icon to draw (`heirloom_shard` for the shards). */
  icon: string;
}

export interface FarmPostCard {
  dungeonId: string;
  name: string;
  open: boolean;
  background: string | undefined;
  view: FarmPostView;
  levelText: string;
  traitText: string;
  traitReady: boolean;
  lines: FarmLine[];
  teamCount: number;
  /** Everything that changes the card's look, bar width aside: the card rebuilds only when it moves. */
  key: string;
}

export interface FarmingModel {
  totalsText: string;
  posts: FarmPostCard[];
}

const perHour = (n: number): string => `${fmt(n)}${FARM_COPY.perHour}`;

export function farmingModel(
  state: GameState,
  content: Content,
  modifiers: readonly Modifier[] = collectModifiers(state, content),
): FarmingModel {
  const posts = content.dungeons.map((dungeon): FarmPostCard => {
    const view = farmPostView(state, content, dungeon.id, modifiers);
    const lines: FarmLine[] = [];
    if (view.open) {
      lines.push({
        key: 'money',
        label: content.resourceById.get(content.perks.currency)?.name ?? 'Money',
        value: moneyText(content, view.rates.money) + FARM_COPY.perHour,
        farmOnly: false,
        icon: content.perks.currency,
      });
      for (const [resource, rate] of Object.entries(view.rates.materials)) {
        lines.push({
          key: resource,
          label: content.resourceById.get(resource)?.name ?? resource,
          value: perHour(rate.toNumber()),
          farmOnly: false,
          icon: resource,
        });
      }
      lines.push(
        {
          key: 'shards',
          label: FARM_COPY.heirloomShards,
          value: perHour(view.rates.shards),
          farmOnly: true,
          icon: 'heirloom_shard',
        },
        {
          key: 'scroll_fragment',
          label: FARM_COPY.scrollFragments,
          value: perHour(view.rates.fragments),
          farmOnly: true,
          icon: 'scroll_fragment',
        },
        {
          key: 'herb_bundle',
          label: FARM_COPY.herbBundles,
          value: perHour(view.rates.herbs),
          farmOnly: true,
          icon: 'herb_bundle',
        },
      );
    }
    const levelText =
      view.level >= view.maxLevel ? FARM_COPY.levelMax(view.level) : FARM_COPY.level(view.level);
    const traitText = view.traitReady
      ? FARM_COPY.traitReady
      : view.nextTraitLevel === null
        ? FARM_COPY.noMoreTraits
        : FARM_COPY.nextTrait(view.nextTraitLevel);
    const key = JSON.stringify([
      view.open,
      view.difficulty,
      view.team,
      levelText,
      traitText,
      lines.map((l) => `${l.key}:${l.value}`),
    ]);
    return {
      dungeonId: dungeon.id,
      name: dungeon.name,
      open: view.open,
      background: dungeon.background,
      view,
      levelText,
      traitText,
      traitReady: view.traitReady,
      lines,
      teamCount: view.team.filter((id) => id !== null).length,
      key,
    };
  });
  const totals = farmTotals(state, content, modifiers);
  const totalsText =
    totals.posts === 0
      ? FARM_COPY.noPosts
      : [
          FARM_COPY.totalsPosts(totals.posts),
          moneyText(content, totals.money) + FARM_COPY.perHour,
          `${FARM_COPY.heirloomShards} ${perHour(totals.shards)}`,
          `${FARM_COPY.scrollFragments} ${perHour(totals.fragments)}`,
          `${FARM_COPY.herbBundles} ${perHour(totals.herbs)}`,
        ].join(' · ');
  return { totalsText, posts };
}
