import type { Content, Resource } from '../../../data';
import {
  Decimal,
  collectModifiers,
  gemMastery,
  incomePerSecond,
  type GameState,
  type Modifier,
} from '../../../game';
import { COPY } from '../copy';
import { fmt } from '../settings/numberFormat';
import { isHeaderResource, resourceIconId, type ResourceIconId } from '../ui/resourceIcons';

/**
 * The Details panel's view model (DESIGN.md §11): every resource the header does not show,
 * grouped, with amount, per-second rate, mastery tier and what it is used for. "Used for" is
 * derived from the content data (card costs, unlocks, cosmetic costs, portals, the shop), so a
 * new cost in the data shows up here without a change.
 */

export type DetailsGroupId = 'tree' | 'mine' | 'dungeon' | 'prestige';

export interface DetailsEntry {
  id: string;
  name: string;
  /** Swappable icon id (see `ui/resourceIcons.ts`). */
  icon: ResourceIconId;
  amount: string;
  /** "+2.8/s", or empty when nothing produces it right now. */
  rate: string;
  /** "Silver mastery" for gems, empty for the rest. */
  mastery: string;
  /** Mastery tier 0..4 for gems, else -1. */
  masteryTier: number;
  /** "Used for card star-ups, unlocking Ironbark". */
  usedFor: string;
}

export interface DetailsGroup {
  id: DetailsGroupId;
  title: string;
  entries: DetailsEntry[];
}

const GROUP_OF: Partial<Record<Resource['kind'], DetailsGroupId>> = {
  tree_gem: 'tree',
  mine_gem: 'mine',
  material: 'dungeon',
  prestige: 'prestige',
};

const GROUP_ORDER: readonly DetailsGroupId[] = ['tree', 'mine', 'dungeon', 'prestige'];

/** True when a `{ resource: id }` appears anywhere inside the data node. */
export function mentionsResource(node: unknown, id: string): boolean {
  if (Array.isArray(node)) return node.some((n) => mentionsResource(n, id));
  if (node === null || typeof node !== 'object') return false;
  if (node instanceof Decimal) return false;
  const rec = node as Record<string, unknown>;
  if (rec.resource === id) return true;
  return Object.values(rec).some((v) => mentionsResource(v, id));
}

/** What a resource is spent on, read from the content data (empty when on nothing). */
export function usedFor(content: Content, resource: Resource): string[] {
  const t = COPY.details.uses;
  const uses: string[] = [];
  const id = resource.id;
  if (mentionsResource(content.cardRules.starUp, id)) uses.push(t.starUp);
  if (mentionsResource(content.cardRules.tierUp, id)) uses.push(t.tierUp);
  for (const tree of content.trees) {
    if (mentionsResource(tree.unlockCost, id)) uses.push(t.unlock(tree.name));
  }
  if (mentionsResource(content.cosmeticRules.materials, id)) uses.push(t.cosmetics);
  if (
    mentionsResource(
      content.allPortals.map((p) => p.cost),
      id,
    )
  )
    uses.push(t.portal);
  if (resource.kind === 'prestige' || content.prestige.currency === id) {
    uses.push(t.starlightShop);
  }
  return uses;
}

const metalName = (m: string): string => m.charAt(0).toUpperCase() + m.slice(1);

/** The groups of the Details panel (empty groups are left out). */
export function detailsView(
  state: GameState,
  content: Content,
  mods: readonly Modifier[] = collectModifiers(state, content),
): DetailsGroup[] {
  const groups = new Map<DetailsGroupId, DetailsEntry[]>();
  for (const r of content.resources) {
    const group = GROUP_OF[r.kind];
    if (!group || isHeaderResource(r)) continue;
    const rate = incomePerSecond(state, content, r.id, mods);
    const mastery = r.gem ? gemMastery(state, content, r.id) : null;
    const uses = usedFor(content, r);
    const entry: DetailsEntry = {
      id: r.id,
      name: r.name,
      icon: resourceIconId(r),
      amount: fmt(state.resources[r.id] ?? new Decimal(0)),
      rate: rate.gt(0) ? COPY.details.rate(fmt(rate)) : '',
      mastery: mastery ? COPY.details.mastery(metalName(mastery.metal)) : '',
      masteryTier: mastery ? mastery.tier : -1,
      usedFor: uses.length > 0 ? COPY.details.usedFor(uses.join(', ')) : COPY.details.usedNowhere,
    };
    groups.set(group, [...(groups.get(group) ?? []), entry]);
  }
  return GROUP_ORDER.flatMap((id) => {
    const entries = groups.get(id);
    return entries ? [{ id, title: COPY.details.groups[id], entries }] : [];
  });
}
