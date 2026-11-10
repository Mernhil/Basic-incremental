import type { Content } from '../../../data';
import { CURRENT_SAVE_VERSION, Decimal, formatDuration, type GameState } from '../../../game';
import { COPY } from '../copy';
import { formatNumber } from '../settings/numberFormat';
import type { NumberStyle } from '../settings/prefs';
import type { SaveSummary } from '../settings/issueReport';

/** Play time, ascensions, hardest dungeon cleared and save version of a game state. */
export function saveSummary(state: GameState, content: Content): SaveSummary {
  // dungeons are listed easiest first; the hardest cleared one has the highest tier, then index
  let best: { name: string; tier: number } | null = null;
  for (const d of content.dungeons) {
    if (state.clearedDungeons.includes(d.id) && (!best || d.tier >= best.tier))
      best = { name: d.name, tier: d.tier };
  }
  return {
    playTime: formatDuration(state.stats.playTimeMs),
    prestigeCount: state.prestigeCount,
    highestDungeon: best?.name ?? null,
    saveVersion: CURRENT_SAVE_VERSION,
  };
}

/** One line describing a save, for the import confirm ("14h 3m played, 2 ascensions, …"). */
export function summaryLine(s: SaveSummary): string {
  return COPY.settings.summary(s.playTime, s.prestigeCount, s.highestDungeon);
}

/** The choices of a segmented control. */
export interface Choice<T> {
  value: T;
  label: string;
  /** Extra line under the label (the number style example). */
  example?: string;
}

const EXAMPLE = new Decimal(12_345_678);

export function numberChoices(): Choice<NumberStyle>[] {
  const choices: Choice<NumberStyle>[] = [
    { value: 'suffix', label: COPY.settings.numSuffix },
    { value: 'scientific', label: COPY.settings.numScientific },
    { value: 'engineering', label: COPY.settings.numEngineering },
  ];
  return choices.map((c) => ({ ...c, example: formatNumber(EXAMPLE, c.value) }));
}

/** "10 s", "1 min", "5 min". */
export function autosaveLabel(seconds: number): string {
  return seconds < 60 ? `${seconds} s` : `${seconds / 60} min`;
}
