import type { Content, PerkLine } from '../../../data';
import {
  Decimal,
  lineBadges,
  lineEffect,
  lineLevel,
  mineLevelOffer,
  nextLineStep,
  toolLines,
  trainingLines,
  treeLevelOffer,
  type BuyCount,
  type BuyOffer,
  type GameState,
  type LineEffect,
  type Modifier,
} from '../../../game';
import { COPY } from '../copy';
import { fmt } from '../settings/numberFormat';
import { amountText, isMoney, moneyText } from '../settings/coins';
import { costText } from '../settings/cost';
import { buyLabel } from './buyModel';

/**
 * The upgrade row (DESIGN.md §4 The upgrade row): one repeatable line (a tree's or mine's level, a
 * tool line, a Training line) as the panels show it. What buying changes in real numbers now ->
 * after, its multiplier small beside it, the price with its resource or "need N more", the bar to
 * the next milestone with what it gives, and the badges of the perks picked on it. Pure: the
 * numbers come from game (`lineEffect`, `nextLineStep`, the line's offer).
 */

export interface UpgradeRowView {
  /** `kind:id`, stable for the DOM. */
  key: string;
  line: PerkLine;
  name: string;
  levelText: string;
  /** "Team damage". */
  effectLabel: string;
  /** "412/s" and "417/s". */
  now: string;
  after: string;
  /** What the purchase adds, signed ("+5/s", "−5 s", "+5%"); empty when it has no simple size. */
  delta: string;
  /** "after this level" or "after 10 levels": what `after` and the price are for. */
  scope: string;
  /** The whole effect as one sentence, for the tooltip and the accessible label. */
  says: string;
  /** "×2.26 → ×2.29" (small). */
  mult: string;
  /** Pips from the last milestone to the next. */
  segments: { filled: number; total: number };
  /** "In 13 levels (Lv 50): damage ×1.8, and you pick War Drums or Elemental Edge". */
  next: string;
  /** "13 levels". */
  toGo: string;
  /** What each pick of the next milestone does, one per line; empty when it has no pick. */
  nextTip: string;
  /** Perks picked on this line that apply now. */
  badges: { name: string; description: string }[];
  buy: {
    label: string;
    resource: string;
    /** "13.2k Copper Gem" or "1.03 Silver". */
    price: string;
    /** The price in words ("5.12 Silver"), for the tooltip and the accessible label. */
    priceLabel: string;
    affordable: boolean;
    /** "need 239 more" when short. */
    short: string | null;
    progress: number;
    count: number;
    /** The price amount, for the coin of a Money price. */
    amount: Decimal;
  };
}

const MAX_SEGMENTS = 25;

/** A multiplier as text: two decimals while small ("1.60"), the number format above that. */
const times = (d: Decimal): string => (d.lt(100) ? d.toNumber().toFixed(2) : fmt(d));
const percent = (d: Decimal): string => `${+d.mul(100).toNumber().toFixed(2)}%`;
const small = (d: Decimal): string => {
  const n = d.toNumber();
  if (Math.abs(n) < 100) return String(+n.toFixed(n < 10 ? 2 : 1));
  return fmt(d);
};

function effectText(content: Content, e: LineEffect, d: Decimal): string {
  switch (e.kind) {
    case 'placeOutput':
    case 'jobOutput':
    case 'teamDps':
      return `${small(d)}/s`;
    case 'teamHealth':
      return small(d);
    case 'burstEvery':
      return `${small(d)} s`;
    case 'critChance':
      return percent(d);
    case 'critDamage':
    case 'moneyPerKill':
      return `×${times(d)}`;
    case 'hitsPerSignature':
      return `${small(d)} hits`;
  }
}

/** A change as text with its sign; empty when nothing changes. */
function deltaText(e: LineEffect, d: Decimal): string {
  if (d.eq(0)) return '';
  const sign = d.gt(0) ? '+' : '−';
  const a = d.abs();
  switch (e.kind) {
    case 'placeOutput':
    case 'jobOutput':
    case 'teamDps':
      return `${sign}${small(a)}/s`;
    case 'teamHealth':
      return `${sign}${small(a)}`;
    case 'burstEvery':
      return `${sign}${small(a)} s`;
    case 'critChance':
      return `${sign}${percent(a)}`;
    case 'hitsPerSignature':
      return `${sign}${small(a)} hits`;
    default:
      return '';
  }
}

function lineName(content: Content, line: PerkLine): string {
  switch (line.kind) {
    case 'tree':
      return content.treeById.get(line.id)?.name ?? line.id;
    case 'mine':
      return content.mineById.get(line.id)?.name ?? line.id;
    case 'tool':
      return content.production.tools.find((t) => t.id === line.id)?.name ?? line.id;
    case 'training':
      return content.trainingById.get(line.id)?.name ?? line.id;
  }
}

/** The name of a line, for the pick cards and the Upgrades view. */
export const upgradeLineName = lineName;

function effectLabel(content: Content, line: PerkLine, e: LineEffect): string {
  const L = COPY.row.effect;
  switch (e.kind) {
    case 'placeOutput':
      return L.placeOutput(lineName(content, line));
    case 'jobOutput': {
      const job = content.production.tools.find((t) => t.id === line.id)?.job ?? 'logging';
      return L.jobOutput(COPY.production[job].title);
    }
    default:
      return L[e.kind];
  }
}

/** What the line's ring multiplies: "output", "yield", "damage". */
function ringWhat(content: Content, line: PerkLine): string {
  if (line.kind === 'tree' || line.kind === 'mine') return 'output';
  if (line.kind === 'tool')
    return content.production.tools.find((t) => t.id === line.id)?.effect ?? '';
  return content.trainingById.get(line.id)?.effect ?? '';
}

interface Offered {
  offer: BuyOffer;
  /** The line's own multiplier now and after the offer, when it has one. */
  multNow: Decimal | null;
  multAfter: Decimal | null;
}

function offerOf(
  state: GameState,
  content: Content,
  line: PerkLine,
  count: BuyCount,
  mods: readonly Modifier[],
): Offered | null {
  switch (line.kind) {
    case 'tree': {
      const offer = treeLevelOffer(state, content, line.id, count, mods);
      return offer ? { offer, multNow: null, multAfter: null } : null;
    }
    case 'mine': {
      const offer = mineLevelOffer(state, content, line.id, count, mods);
      return offer ? { offer, multNow: null, multAfter: null } : null;
    }
    case 'tool': {
      const tool = content.production.tools.find((t) => t.id === line.id);
      const t = tool
        ? toolLines(state, content, tool.job, count, mods).find((x) => x.line.id === line.id)
        : undefined;
      if (!t) return null;
      return t.line.milestones
        ? { offer: t.offer, multNow: t.now, multAfter: t.after }
        : { offer: t.offer, multNow: null, multAfter: null };
    }
    case 'training': {
      const t = trainingLines(state, content, count, mods).find((x) => x.line.id === line.id);
      return t ? { offer: t.offer, multNow: t.now, multAfter: t.after } : null;
    }
  }
}

function shortText(content: Content, resource: string, short: Decimal): string {
  return COPY.row.need(isMoney(content, resource) ? moneyText(content, short) : fmt(short));
}

/** One upgrade row; null for a line that cannot be bought (an unknown or locked one). */
export function upgradeRow(
  state: GameState,
  content: Content,
  line: PerkLine,
  count: BuyCount,
  mods: readonly Modifier[],
): UpgradeRowView | null {
  const offered = offerOf(state, content, line, count, mods);
  if (!offered) return null;
  const { offer } = offered;
  const level = lineLevel(state, line);
  const effect = lineEffect(state, content, line, offer.count, mods);
  const mult =
    offered.multNow && offered.multAfter
      ? `×${times(offered.multNow)} → ×${times(offered.multAfter)}`
      : effect.now.gt(0)
        ? `×${times(effect.after.div(effect.now))}`
        : '';
  const step = nextLineStep(state, content, line);
  let next: string = COPY.row.done;
  let toGo = '';
  let nextTip = '';
  let segments = { filled: 0, total: 0 };
  if (step) {
    const parts: string[] = [];
    if (step.ring)
      parts.push(COPY.row.ring(ringWhat(content, line), fmt(step.ring.nextMultiplier)));
    if (step.pick) {
      parts.push(COPY.row.pick(step.pick.options[0].name, step.pick.options[1].name));
      nextTip = step.pick.options
        .map((o) => `${o.name}: ${o.description}`)
        .join(String.fromCharCode(10));
    }
    toGo = COPY.row.toGo(step.levelsToGo);
    next = COPY.row.next(toGo, step.level, parts.join(COPY.row.and));
    const span = step.level - step.fromLevel;
    const done = level - step.fromLevel;
    const scale = span > MAX_SEGMENTS ? MAX_SEGMENTS / span : 1;
    segments = { filled: Math.floor(done * scale), total: Math.round(span * scale) };
  }
  const scope = COPY.row.scope(offer.count);
  const nowText = effectText(content, effect, effect.now);
  const afterText = effectText(content, effect, effect.after);
  const delta = deltaText(effect, effect.after.sub(effect.now));
  const label = effectLabel(content, line, effect);
  const resource = offer.price.resource;
  const held = state.resources[resource] ?? new Decimal(0);
  const short = offer.affordable ? null : Decimal.max(offer.price.amount.sub(held), 0);
  return {
    key: `${line.kind}:${line.id}`,
    line,
    name: lineName(content, line),
    levelText: COPY.row.level(level),
    effectLabel: label,
    now: nowText,
    after: afterText,
    delta,
    scope,
    says: COPY.row.says(label, nowText, afterText, scope, delta),
    mult,
    segments,
    next,
    toGo,
    nextTip,
    badges: lineBadges(state, content, line).map((b) => ({
      name: b.option.name,
      description: b.option.description,
    })),
    buy: {
      label: buyLabel(offer, count),
      resource,
      price: costText(content, resource, offer.price.amount),
      priceLabel: amountText(content, resource, offer.price.amount),
      affordable: offer.affordable,
      short: short ? shortText(content, resource, short) : null,
      progress: offer.progress,
      count: offer.count,
      amount: offer.price.amount,
    },
  };
}

/** The rows of several lines, skipping those that cannot be bought. */
export function upgradeRows(
  state: GameState,
  content: Content,
  lines: readonly PerkLine[],
  count: BuyCount,
  mods: readonly Modifier[],
): UpgradeRowView[] {
  return lines.flatMap((line) => upgradeRow(state, content, line, count, mods) ?? []);
}

/** The resources a set of lines spends, in order, for the "You hold" strip. */
export function heldResources(
  state: GameState,
  content: Content,
  rows: readonly UpgradeRowView[],
): { resource: string; text: string; amount: Decimal }[] {
  const seen = new Set<string>();
  const out: { resource: string; text: string; amount: Decimal }[] = [];
  for (const r of rows) {
    if (seen.has(r.buy.resource)) continue;
    seen.add(r.buy.resource);
    const amount = state.resources[r.buy.resource] ?? new Decimal(0);
    out.push({
      resource: r.buy.resource,
      amount,
      text: isMoney(content, r.buy.resource) ? moneyText(content, amount) : fmt(amount),
    });
  }
  return out;
}
