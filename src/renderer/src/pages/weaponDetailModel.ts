import type { Content } from '../../../data';
import { MAX_STARS } from '../../../data';
import {
  Decimal,
  bondActive,
  bondJob,
  cardNameById,
  cardStatsFor,
  isFrontSlot,
  newOwnedCard,
  type CardInfo,
  type CardStats,
  type GameState,
  type OwnedCard,
} from '../../../game';
import { COPY } from '../copy';
import { fmt } from '../settings/numberFormat';
import { effectText } from '../shell/modifierText';
import type { AttackRow, MovesView } from './movesModel';
import type {
  DetailEntry,
  DetailNext,
  DetailStat,
  GraphAxis,
  PowerView,
  WeaponDetail,
} from './cardsModel';

type Up = { level: CardStats | null; star: CardStats | null };

/**
 * The weapon panel's detail (stats, what the card does, what comes next). Read-only: every number
 * comes from `cardStatsFor` (the same numbers as the Cards detail's tiles and the star "now →
 * after"), the card's own data and the bonds; nothing here is a rule.
 */

const cap1 = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** "+12%" for a number that grows; empty when nothing grows. */
function growth(from: { toNumber(): number }, to: { toNumber(): number }): string {
  const a = from.toNumber();
  if (!(a > 0)) return '';
  const pct = Math.round((to.toNumber() / a - 1) * 100);
  return pct > 0 ? `+${pct}%` : '';
}

/** What the next level and the next star add to one number (undefined when neither does). */
function upOf(
  pick: (s: CardStats) => { toNumber(): number } | undefined,
  now: CardStats,
  next: Up,
): DetailStat['up'] {
  const base = pick(now);
  if (!base) return undefined;
  const level = next.level ? pick(next.level) : undefined;
  const star = next.star ? pick(next.star) : undefined;
  const l = level ? growth(base, level) : '';
  const st = star ? growth(base, star) : '';
  if (!l && !st) return undefined;
  return { ...(l ? { level: l } : {}), ...(st ? { star: st } : {}) };
}

function statRows(info: CardInfo, now: CardStats, fighting: boolean, next: Up): DetailStat[] {
  const t = COPY.weapon.detail;
  const rows: DetailStat[] = [];
  if (fighting) {
    rows.push(
      { key: 'hit', label: t.hitDamage, value: fmt(now.hit), up: upOf((s) => s.hit, now, next) },
      { key: 'speed', label: t.hitsPerSecond, value: t.perSecond(1 / now.hitSeconds) },
      {
        key: 'dps',
        label: t.damagePerSecond,
        value: fmt(now.output),
        title: COPY.cards.stats.damageTip,
        up: upOf((s) => s.output, now, next),
      },
    );
  } else {
    rows.push(
      {
        key: 'output',
        label: t.output,
        value: t.outputValue(fmt(now.output)),
        title: COPY.cards.stats.outputTip,
        up: upOf((s) => s.output, now, next),
      },
      { key: 'speed', label: t.strikesPerSecond, value: t.perSecond(1 / now.hitSeconds) },
    );
  }
  if (fighting) {
    rows.push(
      { key: 'crit', label: t.critChance, value: t.percent(now.critChance) },
      { key: 'critdmg', label: t.critDamage, value: t.times(fmt(now.critDamage)) },
    );
  }
  if (now.health) {
    rows.push({
      key: 'health',
      label: t.health,
      value: fmt(now.health),
      up: upOf((s) => s.health ?? undefined, now, next),
    });
  }
  const { card } = info;
  if (card.job === 'fighting') {
    rows.push({ key: 'role', label: t.role, value: COPY.cards.combatRoles[card.role] });
    rows.push({
      key: 'position',
      label: t.position,
      value: info.slot
        ? `${COPY.cards.slotName(info.slot.slot)}, ${isFrontSlot(info.slot.slot) ? t.front : t.back}`
        : t.notInLoadout,
    });
  } else {
    rows.push({
      key: 'works',
      label: t.worksAt,
      value: info.workplace ? cap1(info.workplace) : t.notWorking,
    });
  }
  if (card.element) rows.push({ key: 'element', label: t.element, value: cap1(card.element) });
  if (card.job === 'fighting') rows.push({ key: 'cost', label: t.cost, value: String(info.cost) });
  return rows;
}

function doEntries(content: Content, state: GameState, info: CardInfo): DetailEntry[] {
  const t = COPY.weapon.detail;
  const { card } = info;
  const out: DetailEntry[] = [];
  if (card.job === 'fighting') {
    out.push({
      kind: 'ability',
      kindLabel: t.kinds.ability,
      name: '',
      text: card.ability.description,
      values: [],
    });
    const team = info.teamModifiers.map((m) => effectText(m)).join(', ');
    out.push({
      kind: 'team',
      kindLabel: t.kinds.team,
      name: '',
      text: team ? t.teamText(team) : card.teamBonus.description,
      values: [],
      title: card.teamBonus.description,
    });
  } else {
    out.push({
      kind: 'ability',
      kindLabel: t.kinds.ability,
      name: '',
      text: card.worker.description,
      values: [],
    });
  }
  for (const bond of content.bonds) {
    if (!bond.cards.includes(card.id)) continue;
    const partnerId = bond.cards[0] === card.id ? bond.cards[1] : bond.cards[0];
    const partner = cardNameById(content, partnerId) ?? partnerId;
    const active = bondActive(state, content, bond);
    const needs =
      bondJob(content, bond) === 'fighting' ? t.bondNeedsTeam(partner) : t.bondNeedsWork(partner);
    out.push({
      kind: 'bond',
      kindLabel: t.kinds.bond,
      name: bond.name,
      text: t.bondText(partner, bond.modifiers.map((m) => effectText(m)).join(', ')),
      values: [active ? t.bondOn : needs],
      active,
    });
  }
  return out;
}

/** The card's three attacks (hit, skill, ultimate) as entries of the "What it does" list. */
export function attackEntries(view: MovesView | null): DetailEntry[] {
  if (!view) return [];
  return view.rows.map((r: AttackRow): DetailEntry => ({
    kind: r.kind,
    kindLabel: r.label,
    name: r.name,
    text: r.text,
    values: [],
    effects: r.effects,
    note: r.note,
    state: r.state,
  }));
}

/** The changes one step (a level or a star) makes, "damage per hit 1,200 → 1,350 (+12%)". */
function changes(now: CardStats, after: CardStats, fighting: boolean): string[] {
  const t = COPY.weapon.detail;
  const main = fighting ? now.hit : now.output;
  const mainAfter = fighting ? after.hit : after.output;
  const g = growth(main, mainAfter);
  const parts = [
    `${fighting ? t.perHit : t.outputWhat} ${fmt(main)} → ${fmt(mainAfter)}${g ? ` (${g})` : ''}`,
  ];
  if (now.health && after.health) {
    const gh = growth(now.health, after.health);
    parts.push(`${t.healthWhat} ${fmt(now.health)} → ${fmt(after.health)}${gh ? ` (${gh})` : ''}`);
  }
  return parts;
}

function step(
  label: string,
  now: CardStats,
  after: CardStats | null,
  fighting: boolean,
  end: string,
  note: string,
): DetailNext {
  if (!after) return { label, text: end, note: '', available: false };
  return { label, text: changes(now, after, fighting).join(' · '), note, available: true };
}

/**
 * The power number of the panel: damage per second plus a quarter of the health. A display sum for
 * comparing a card with its own upgrades; it is not a game rule and nothing reads it back.
 */
export function powerOf(s: CardStats): Decimal {
  return s.output.add((s.health ?? new Decimal(0)).div(4));
}

/** The six graph values of a fighting card's stats: attack, speed, damage per second, health, crit, crit damage. */
function graphValues(s: CardStats): number[] {
  // the three numbers that grow by orders of magnitude are drawn by their square root
  const root = (d: Decimal): number => {
    const n = d.toNumber();
    return Math.sqrt(Number.isFinite(n) ? n : 1e300);
  };
  return [
    root(s.hit),
    1 / s.hitSeconds,
    root(s.output),
    s.health ? root(s.health) : 0,
    s.critChance,
    s.critDamage.toNumber(),
  ];
}

const refCache = new WeakMap<Content, Map<string, number[]>>();
/** The strongest value on each graph axis among the cards of one tier at their level cap and six stars. */
function graphRefs(content: Content, tier: string): number[] {
  let byTier = refCache.get(content);
  if (!byTier) {
    byTier = new Map();
    refCache.set(content, byTier);
  }
  const hit = byTier.get(tier);
  if (hit) return hit;
  const max = [1e-9, 1e-9, 1e-9, 1e-9, 1e-9, 1e-9];
  for (const card of content.cards) {
    if (card.job !== 'fighting' || card.tier !== tier) continue;
    const owned: OwnedCard = {
      ...newOwnedCard(card.tier),
      level: content.cardRules.levelCaps[card.tier],
      stars: MAX_STARS,
    };
    const s = cardStatsFor(content, card.id, owned);
    if (!s) continue;
    graphValues(s).forEach((v, i) => {
      if (v > max[i]!) max[i] = v;
    });
  }
  byTier.set(tier, max);
  return max;
}

const GRAPH_KEYS = ['hit', 'speed', 'dps', 'health', 'crit', 'critdmg'] as const;
const FLOOR = 0.08;

function graphOf(content: Content, tier: string, now: CardStats, next: Up): GraphAxis[] {
  const refs = graphRefs(content, tier);
  const shape = (s: CardStats | null): number[] | null =>
    s ? graphValues(s).map((v, i) => Math.min(1, Math.max(FLOOR, Math.sqrt(v / refs[i]!)))) : null;
  const n = shape(now)!;
  const l = shape(next.level);
  const st = shape(next.star);
  return GRAPH_KEYS.map((key, i) => ({
    key,
    now: n[i]!,
    level: l ? l[i]! : null,
    star: st ? st[i]! : null,
  }));
}

function powerView(now: CardStats, next: Up): PowerView {
  const p = powerOf(now);
  return {
    now: fmt(p),
    withStar: next.star ? fmt(powerOf(next.star)) : null,
    levelGain: next.level ? fmt(powerOf(next.level).sub(p)) : null,
  };
}

/** The weapon panel's detail of an owned card; null when the card is not owned. */
export function weaponDetail(
  content: Content,
  state: GameState,
  info: CardInfo,
): WeaponDetail | null {
  const { owned, card } = info;
  if (!owned || !info.rank) return null;
  const now = cardStatsFor(content, card.id, owned);
  if (!now) return null;
  const fighting = card.job === 'fighting';
  const t = COPY.weapon.detail;

  const atCap = info.levelCap !== null && owned.level >= info.levelCap;
  const levelAfter: OwnedCard = { ...owned, level: owned.level + 1 };
  const starAfter: OwnedCard = { ...owned, stars: owned.stars + 1 };
  const bar = info.starBar;

  const levelStats = atCap ? null : cardStatsFor(content, card.id, levelAfter);
  const starStats = owned.stars >= MAX_STARS ? null : cardStatsFor(content, card.id, starAfter);

  return {
    stats: statRows(info, now, fighting, { level: levelStats, star: starStats }),
    power: powerView(now, { level: levelStats, star: starStats }),
    graph: fighting
      ? graphOf(content, card.tier, now, { level: levelStats, star: starStats })
      : null,
    does: doEntries(content, state, info),
    nextLevel: step(t.nextLevel, now, levelStats, fighting, t.levelCap, ''),
    nextStar: step(
      t.nextStar,
      now,
      starStats,
      fighting,
      COPY.weapon.allStars,
      bar ? COPY.weapon.starTitle(bar.fill, bar.need, owned.stars + 1) : '',
    ),
  };
}
