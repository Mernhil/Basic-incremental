import type { Content } from '../../../data';
import { MAX_STARS } from '../../../data';
import {
  bondActive,
  bondJob,
  cardNameById,
  cardSkill,
  cardStatsFor,
  isFrontSlot,
  type CardInfo,
  type CardStats,
  type GameState,
  type OwnedCard,
} from '../../../game';
import { COPY } from '../copy';
import { fmt } from '../settings/numberFormat';
import { effectText } from '../shell/modifierText';
import type { DetailEntry, DetailNext, DetailStat, WeaponDetail } from './cardsModel';

/**
 * The weapon panel's detail (stats, what the card does, what comes next). Read-only: every number
 * comes from `cardStatsFor` (the same numbers as the Cards detail's tiles and the star "now →
 * after"), the card's own data and the bonds; nothing here is a rule.
 */

const cap1 = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

function statRows(info: CardInfo, now: CardStats, fighting: boolean): DetailStat[] {
  const t = COPY.weapon.detail;
  const rows: DetailStat[] = [];
  if (fighting) {
    rows.push(
      { label: t.hitDamage, value: fmt(now.hit) },
      { label: t.hitsPerSecond, value: t.perSecond(1 / now.hitSeconds) },
      { label: t.damagePerSecond, value: fmt(now.output), title: COPY.cards.stats.damageTip },
    );
  } else {
    rows.push(
      { label: t.output, value: t.outputValue(fmt(now.output)), title: COPY.cards.stats.outputTip },
      { label: t.strikesPerSecond, value: t.perSecond(1 / now.hitSeconds) },
    );
  }
  rows.push(
    { label: t.critChance, value: t.percent(now.critChance) },
    { label: t.critDamage, value: t.times(fmt(now.critDamage)) },
  );
  if (now.health) rows.push({ label: t.health, value: fmt(now.health) });
  const { card } = info;
  if (card.job === 'fighting') {
    rows.push({ label: t.role, value: COPY.cards.combatRoles[card.role] });
    rows.push({
      label: t.position,
      value: info.slot
        ? `${COPY.cards.slotName(info.slot.slot)}, ${isFrontSlot(info.slot.slot) ? t.front : t.back}`
        : t.notInLoadout,
    });
  } else {
    rows.push({ label: t.worksAt, value: info.workplace ? cap1(info.workplace) : t.notWorking });
  }
  rows.push({ label: t.element, value: cap1(card.element) });
  if (card.job === 'fighting') rows.push({ label: t.cost, value: String(info.cost) });
  return rows;
}

function doEntries(
  content: Content,
  state: GameState,
  info: CardInfo,
  now: CardStats,
): DetailEntry[] {
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
    const skill = cardSkill(content, card.id, state);
    const heal = skill.signature.kind === 'heal' ? skill.signature : null;
    const never = now.hitsPerSignature <= 0;
    const pct = heal ? Math.round(heal.share * 100) : 0;
    out.push({
      kind: 'signature',
      kindLabel: t.kinds.signature,
      name: skill.name,
      text: never ? t.sigNone : heal ? t.sigHeal(pct) : t.sigStrike(fmt(now.signature)),
      values: never
        ? []
        : [
            heal ? t.sigHealValue(pct) : t.sigDamage(fmt(now.signature)),
            t.sigEvery(now.hitsPerSignature),
          ],
      title: skill.description,
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

/** "+12%" for a number that grows; empty when nothing grows. */
function growth(from: { toNumber(): number }, to: { toNumber(): number }): string {
  const a = from.toNumber();
  if (!(a > 0)) return '';
  const pct = Math.round((to.toNumber() / a - 1) * 100);
  return pct > 0 ? `+${pct}%` : '';
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

  return {
    stats: statRows(info, now, fighting),
    does: doEntries(content, state, info, now),
    nextLevel: step(
      t.nextLevel,
      now,
      atCap ? null : cardStatsFor(content, card.id, levelAfter),
      fighting,
      t.levelCap,
      '',
    ),
    nextStar: step(
      t.nextStar,
      now,
      owned.stars >= MAX_STARS ? null : cardStatsFor(content, card.id, starAfter),
      fighting,
      COPY.weapon.allStars,
      bar ? COPY.weapon.starTitle(bar.fill, bar.need, owned.stars + 1) : '',
    ),
  };
}
