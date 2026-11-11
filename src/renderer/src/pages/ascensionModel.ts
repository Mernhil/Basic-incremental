import { RANK_TIERS, RARITIES, type Content, type Rarity } from '../../../data';
import {
  Decimal,
  bossMastery,
  gemMastery,
  type AscensionPreview,
  type GameState,
  type Modifier,
  type StarlightOffer,
} from '../../../game';
import { fmt } from '../settings/numberFormat';
import { COPY } from '../copy';
import { modifierText } from '../shell/modifierText';
import type { BuyLineView } from './buyModel';

/**
 * Ascension view models (DESIGN.md §9, §11 "portal gate", A9 E): what starts over, what floats
 * into the gate, the Starlight gain and the Starlight shop. Display logic only; the gain, rules
 * and prices come from game.
 */

/** What a kept token is drawn with. The page turns it into art. */
export type KeptArt =
  | { kind: 'card'; cardId: string }
  | { kind: 'coin'; gem: string; tier: number }
  | { kind: 'medal'; tier: number }
  | { kind: 'plaque'; glyph: 'wardrobe' | 'dungeons' | 'summon' }
  | { kind: 'starlight' };

export interface KeptView {
  id: string;
  label: string;
  detail: string;
  art: KeptArt;
}

export interface ResetView {
  id: string;
  label: string;
  detail: string;
}

export interface RewardView {
  id: string;
  name: string;
  rarity: Rarity | string;
  /** "Gilded Plate, Rare border". */
  text: string;
}

export interface GateView {
  /** "42". */
  gain: string;
  canAscend: boolean;
  /** Gain toward the minimum, 0..1 (1 once it can ascend). */
  progress: number;
  /** "4 of 10 needed to ascend", empty once it can. */
  needs: string;
  /** "Ascension 2". */
  nth: string;
  ascension: number;
  rewards: RewardView[];
  /** Button label: "Ascend" or "Ascend at 10 Starlight". */
  button: string;
  resets: ResetView[];
  kept: KeptView[];
}

const RARITY_ORDER: readonly string[] = RARITIES;
const TIER_ORDER = ['stone', ...RANK_TIERS];

/** The reward line of a prestige cosmetic. */
export function rewardView(content: Content, id: string): RewardView {
  const c = content.cosmeticById.get(id);
  if (!c) return { id, name: id, rarity: 'common', text: id };
  const rarity = content.rarityById.get(c.rarity)?.name ?? c.rarity;
  return {
    id,
    name: c.name,
    rarity: c.rarity,
    text: COPY.ascension.reward(c.name, rarity, c.slot),
  };
}

/** The kept tokens around the gate, each with a count from the save and the art to show. */
export function keptViews(state: GameState, content: Content): KeptView[] {
  const t = COPY.ascension;
  const views: KeptView[] = [];
  for (const id of [
    'cards',
    'cosmetics',
    'unlocks',
    'mastery',
    'medals',
    'portal_pity',
    'crystals',
    'starlight',
    'workers',
    'forge',
    'star_dust',
    'stage_stars',
    'wishlist',
    'skill_tree',
  ]) {
    const label = t.keptParts[id as keyof typeof t.keptParts];
    switch (id) {
      case 'cards': {
        const owned = Object.entries(state.cards.owned);
        // the rarest card, then the highest rank tier
        let best: { id: string; score: number } | null = null;
        for (const [cardId, o] of owned) {
          const card = content.cardById.get(cardId);
          if (!card) continue;
          const score = RARITY_ORDER.indexOf(card.rarity) * 10 + TIER_ORDER.indexOf(o.tier);
          if (!best || score > best.score) best = { id: cardId, score };
        }
        if (best)
          views.push({
            id,
            label,
            detail: t.keptDetail.cards(owned.length),
            art: { kind: 'card', cardId: best.id },
          });
        break;
      }
      case 'cosmetics':
        views.push({
          id,
          label,
          detail: t.keptDetail.cosmetics(Object.keys(state.cosmetics.owned).length),
          art: { kind: 'plaque', glyph: 'wardrobe' },
        });
        break;
      case 'unlocks':
        views.push({
          id,
          label,
          detail: t.keptDetail.unlocks(state.clearedDungeons.length),
          art: { kind: 'plaque', glyph: 'dungeons' },
        });
        break;
      case 'mastery': {
        let tiers = 0;
        let best: { gem: string; tier: number } | null = null;
        for (const r of content.resources) {
          if (!r.gem || (r.kind !== 'tree_gem' && r.kind !== 'mine_gem')) continue;
          const tier = gemMastery(state, content, r.id).tier;
          tiers += tier;
          if (!best || tier > best.tier) best = { gem: r.id, tier };
        }
        if (best)
          views.push({
            id,
            label,
            detail: t.keptDetail.mastery(tiers),
            art: { kind: 'coin', ...best },
          });
        break;
      }
      case 'medals': {
        let tiers = 0;
        let top = 0;
        for (const d of [...content.dungeons, ...content.trials]) {
          const tier = bossMastery(state, content, d.id)?.tier ?? 0;
          tiers += tier;
          top = Math.max(top, tier);
        }
        views.push({
          id,
          label,
          detail: t.keptDetail.medals(tiers),
          art: { kind: 'medal', tier: top },
        });
        break;
      }
      case 'portal_pity':
        views.push({
          id,
          label,
          detail: t.keptDetail.portal_pity,
          art: { kind: 'plaque', glyph: 'summon' },
        });
        break;
      case 'crystals': {
        const have = (id: string): string => fmt(state.resources[id] ?? new Decimal(0));
        views.push({
          id,
          label,
          detail: t.keptDetail.crystals(have('summon_crystal'), have('glamour_crystal')),
          art: { kind: 'plaque', glyph: 'summon' },
        });
        break;
      }
      case 'workers': {
        const n = Object.values(state.production.workers).reduce((sum, ids) => sum + ids.length, 0);
        views.push({
          id,
          label,
          detail: t.keptDetail.workers(n),
          art: { kind: 'plaque', glyph: 'dungeons' },
        });
        break;
      }
      case 'forge':
        views.push({
          id,
          label,
          detail: t.keptDetail.forge,
          art: { kind: 'plaque', glyph: 'dungeons' },
        });
        break;
      case 'star_dust':
        views.push({
          id,
          label,
          detail: t.keptDetail.star_dust(fmt(state.resources['star_dust'] ?? new Decimal(0))),
          art: { kind: 'starlight' },
        });
        break;
      case 'stage_stars': {
        const n = Object.values(state.combat.stageKills).reduce((sum, k) => sum + k, 0);
        views.push({
          id,
          label,
          detail: t.keptDetail.stage_stars(n),
          art: { kind: 'medal', tier: 1 },
        });
        break;
      }
      case 'wishlist':
        views.push({
          id,
          label,
          detail: t.keptDetail.wishlist(state.cards.wishlist.length),
          art: { kind: 'plaque', glyph: 'summon' },
        });
        break;
      case 'skill_tree': {
        const n = Object.values(state.account.skills).reduce((sum, r) => sum + r, 0);
        views.push({
          id,
          label,
          detail: t.keptDetail.skill_tree(n),
          art: { kind: 'plaque', glyph: 'wardrobe' },
        });
        break;
      }
      case 'starlight': {
        const have = state.resources[content.prestige.currency] ?? new Decimal(0);
        views.push({
          id,
          label,
          detail: t.keptDetail.starlight(fmt(have)),
          art: { kind: 'starlight' },
        });
        break;
      }
    }
  }
  return views;
}

/** Everything the gate shows before (and while) confirming. */
export function gateView(preview: AscensionPreview, state: GameState, content: Content): GateView {
  const t = COPY.ascension;
  const gain = fmt(preview.gain);
  const progress = preview.canAscend
    ? 1
    : Math.min(1, Math.max(0, preview.gain.toNumber() / Math.max(1, preview.minimum)));
  return {
    gain,
    canAscend: preview.canAscend,
    progress,
    needs: preview.canAscend ? '' : t.needs(gain, preview.minimum),
    nth: t.nth(preview.ascension),
    ascension: preview.ascension,
    rewards: preview.rewards.map((id) => rewardView(content, id)),
    button: preview.canAscend ? t.ascend : t.ascendLocked(preview.minimum),
    resets: preview.resets.map((id) => {
      const [label, detail] = t.resetParts[id];
      return { id, label, detail };
    }),
    kept: keptViews(state, content).filter((k) =>
      (preview.persists as readonly string[]).includes(k.id),
    ),
  };
}

// ---- Starlight shop ----

export interface StarlightView {
  id: string;
  name: string;
  description: string;
  level: number;
  maxLevel: number;
  /** "Lv 3 / 25". */
  levelText: string;
  maxed: boolean;
  /** For the shared buy button: "Buy level", "5 Starlight", "+30% → +40%". */
  buy: BuyLineView;
}

/** The summed value of an item's first modifier at a level, as "+30%". */
function effectText(mods: readonly Modifier[], fallback: Modifier | undefined): string {
  const m = mods[0];
  if (m) return modifierText(m);
  if (!fallback) return '';
  return modifierText({ ...fallback, value: new Decimal(0) });
}

/** The effect line of an item that opens a rule instead of a bonus, or null for a modifier item. */
function grantText(o: StarlightOffer, state: GameState, content: Content): string | null {
  const t = COPY.ascension;
  switch (o.item.grants) {
    case 'second_worker_slots':
      return o.locked && o.level === 0
        ? t.slotsLocked
        : t.slots(o.level, content.trees.length + content.mines.length);
    case 'autobuyer_trees':
    case 'autobuyer_mines':
      return t.autobuyer(o.level > 0);
    default:
      return null;
  }
}

export function starlightViews(
  offers: readonly StarlightOffer[],
  state: GameState,
  content: Content,
): StarlightView[] {
  const t = COPY.ascension;
  const currency = content.prestige.currency;
  const have = state.resources[currency] ?? new Decimal(0);
  return offers.map((o) => {
    const maxed = o.price === null;
    const template = o.next[0] ?? o.current[0];
    const now = effectText(o.current, template);
    const preview =
      grantText(o, state, content) ??
      (maxed ? t.maxedEffect(now) : t.effect(now, effectText(o.next, template)));
    const price = o.price ?? { resource: currency, amount: new Decimal(0) };
    // a maxed line shows no fill bar
    const progress = maxed
      ? 0
      : price.amount.lte(0)
        ? 1
        : Math.min(1, have.div(price.amount).toNumber());
    return {
      id: o.item.id,
      name: o.item.name,
      description: o.item.description,
      level: o.level,
      maxLevel: o.maxLevel,
      levelText: t.level(o.level, o.maxLevel),
      maxed,
      buy: {
        id: o.item.id,
        name: o.item.name,
        resource: currency,
        level: o.level,
        available: !maxed,
        offer: { count: 1, price, affordable: o.affordable, progress },
        label: maxed ? t.maxed : t.buy,
        price: maxed ? '' : t.price(fmt(price.amount)),
        preview,
        milestone: '',
        milestoneInfo: null,
        gain: new Decimal(0),
      },
    };
  });
}
