import type { Content } from '../../../data';
import { formatDecimal, formatDuration, type Decimal, type OfflineSummary } from '../../../game';
import { COPY } from '../copy';

/**
 * Welcome back view model (DESIGN.md 14, A11 B card fan): one small card per category of what
 * happened while away, in deal order. Empty categories are left out.
 */

export type WelcomeCardKind =
  'time' | 'resources' | 'fights' | 'drops' | 'cards' | 'mastery' | 'achievements';

export interface WelcomeLine {
  text: string;
  /** Rare drops and big moments are highlighted. */
  rare?: boolean;
  /** For resource lines: the resource and amount, so Collect can fly its coins. */
  resource?: string;
  amount?: Decimal;
}

export interface WelcomeCard {
  kind: WelcomeCardKind;
  title: string;
  /** The big number or word on the card. */
  headline: string;
  lines: WelcomeLine[];
}

const name = (content: Content, id: string): string =>
  content.resourceById.get(id)?.name ??
  content.cosmeticById.get(id)?.name ??
  content.cardById.get(id)?.name ??
  content.dungeonById.get(id)?.name ??
  content.trialById.get(id)?.name ??
  content.mineById.get(id)?.name ??
  content.treeById.get(id)?.name ??
  content.combat.damageUpgrades.find((u) => u.id === id)?.name ??
  id;

export function welcomeCards(summary: OfflineSummary, content: Content): WelcomeCard[] {
  const t = COPY.welcome;
  const cards: WelcomeCard[] = [];
  cards.push({
    kind: 'time',
    title: t.away,
    headline: formatDuration(summary.elapsedMs),
    lines: summary.capped ? [{ text: t.capped(formatDuration(summary.capMs)) }] : [],
  });

  const gains = Object.entries(summary.gains)
    .filter(([, v]) => v.gt(0))
    .sort(([, a], [, b]) => b.cmp(a));
  if (gains.length > 0) {
    cards.push({
      kind: 'resources',
      title: t.resources,
      headline: `+${formatDecimal(gains[0]![1])}`,
      lines: gains.map(([id, amount]) => ({
        text: t.gain(formatDecimal(amount), name(content, id)),
        resource: id,
        amount,
      })),
    });
  }

  if (summary.bossKills > 0 || summary.knockouts > 0) {
    const lines: WelcomeLine[] = [];
    if (summary.knockouts > 0) lines.push({ text: t.knockouts(summary.knockouts) });
    cards.push({
      kind: 'fights',
      title: t.fights,
      headline: t.kills(summary.bossKills),
      lines,
    });
  }

  const drops: WelcomeLine[] = [
    ...Object.entries(summary.drops).map(([id, n]) => ({
      text: t.drop(name(content, id), n),
      rare: true,
    })),
    ...summary.cardDrops.map((d) => ({ text: t.drop(name(content, d.cardId), 1), rare: true })),
    ...Object.entries(summary.materials)
      .filter(([, n]) => n > 0)
      .map(([id, n]) => ({ text: t.material(name(content, id), n) })),
  ];
  if (drops.length > 0) {
    const rare = drops.filter((d) => d.rare).length;
    cards.push({
      kind: 'drops',
      title: t.drops,
      headline: rare > 0 ? t.rare(rare) : String(drops.length),
      lines: drops,
    });
  }

  const levels = Object.entries(summary.cardLevels);
  const xp = Object.entries(summary.cardXp).filter(([, v]) => v.gt(0));
  if (levels.length > 0 || xp.length > 0) {
    const lines: WelcomeLine[] = levels.map(([id, l]) => ({
      text: t.level(name(content, id), l.from, l.to),
    }));
    for (const [id, v] of xp) {
      if (!summary.cardLevels[id]) lines.push({ text: t.xp(name(content, id), formatDecimal(v)) });
    }
    const gained = levels.reduce((n, [, l]) => n + (l.to - l.from), 0);
    cards.push({
      kind: 'cards',
      title: t.cards,
      headline: gained > 0 ? t.levelsUp(gained) : t.xpHeadline,
      lines,
    });
  }

  const tiers = (summary.tierUps ?? []).filter(
    (u) => u.kind === 'gem_mastery' || u.kind === 'boss_mastery',
  );
  if (tiers.length > 0) {
    cards.push({
      kind: 'mastery',
      title: t.mastery,
      headline: String(tiers.length),
      lines: tiers.map((u) => ({ text: t.tierUp(name(content, u.id), u.metal), rare: true })),
    });
  }

  // stickers earned while away (DESIGN.md 17): their names, all highlighted
  const stickers = summary.achievements
    .map((id) => content.achievements.find((a) => a.id === id)?.name)
    .filter((n): n is string => !!n);
  if (stickers.length > 0) {
    cards.push({
      kind: 'achievements',
      title: t.achievements,
      headline: String(stickers.length),
      lines: stickers.map((text) => ({ text, rare: true })),
    });
  }
  return cards;
}
