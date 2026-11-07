import { describe, expect, it } from 'vitest';
import { CURRENT_SAVE_VERSION, Decimal, formatDecimal } from '../src/game';
import {
  buildIssueUrl,
  ISSUE_URL,
  issueBody,
  LOG_LINES,
  systemFromUserAgent,
  type IssueInfo,
} from '../src/renderer/src/settings/issueReport';
import { createLogRing } from '../src/renderer/src/settings/logRing';
import { overrideMatches, overrideMediaText } from '../src/renderer/src/settings/motionRules';
import { formatNumber } from '../src/renderer/src/settings/numberFormat';
import { DEFAULT_PREFS, parsePrefs } from '../src/renderer/src/settings/prefs';
import {
  autosaveLabel,
  numberChoices,
  saveSummary,
  summaryLine,
} from '../src/renderer/src/pages/settingsModel';
import { content, freshState } from './helpers';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) basic-incremental/0.3.0 Chrome/142.0.7444.59 Electron/45.2.3 Safari/537.36';

describe('settings preferences', () => {
  it('falls back to the defaults for missing or broken data', () => {
    expect(parsePrefs(null)).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('not json')).toEqual(DEFAULT_PREFS);
    expect(parsePrefs('{"motion":"wild","numbers":7,"autosaveSeconds":13}')).toEqual(DEFAULT_PREFS);
  });

  it('keeps valid choices', () => {
    expect(
      parsePrefs('{"motion":"reduced","numbers":"engineering","autosaveSeconds":300}'),
    ).toEqual({ motion: 'reduced', numbers: 'engineering', autosaveSeconds: 300 });
  });

  it('labels autosave intervals', () => {
    expect([10, 30, 60, 120, 300].map(autosaveLabel)).toEqual([
      '10 s',
      '30 s',
      '1 min',
      '2 min',
      '5 min',
    ]);
  });
});

describe('number styles', () => {
  const d = (v: string | number) => new Decimal(v);

  it('match the game format below a million in every style', () => {
    for (const v of [0, 12.5, 999.999, 1234, 999_999]) {
      for (const style of ['suffix', 'scientific', 'engineering'] as const) {
        expect(formatNumber(d(v), style)).toBe(formatDecimal(d(v)));
      }
    }
  });

  it('scientific is exactly the game format', () => {
    for (const v of ['1e6', '12345678', '1e100', '1e1000', 'ee20']) {
      expect(formatNumber(d(v), 'scientific')).toBe(formatDecimal(d(v)));
    }
  });

  it('writes suffixes from a million up, then falls back to scientific', () => {
    expect(formatNumber(d(1e6), 'suffix')).toBe('1M');
    expect(formatNumber(d(12_345_678), 'suffix')).toBe('12.3M');
    expect(formatNumber(d(4.567e9), 'suffix')).toBe('4.57B');
    expect(formatNumber(d(999_999_999), 'suffix')).toBe('1B');
    expect(formatNumber(d(1e33), 'suffix')).toBe('1Dc');
    expect(formatNumber(d(1e36), 'suffix')).toBe(formatDecimal(d(1e36)));
    expect(formatNumber(d(-2.5e6), 'suffix')).toBe('-2.5M');
  });

  it('writes engineering exponents in steps of three', () => {
    expect(formatNumber(d(12_345_678), 'engineering')).toBe('12.3e6');
    expect(formatNumber(d(123_456_789), 'engineering')).toBe('123e6');
    expect(formatNumber(d(999_999_999), 'engineering')).toBe('1e9');
    expect(formatNumber(d('1.5e400'), 'engineering')).toBe('15e399');
    expect(formatNumber(d('2.5e401'), 'engineering')).toBe('250e399');
    expect(formatNumber(d('ee20'), 'engineering')).toBe(formatDecimal(d('ee20')));
  });

  it('shows one example per choice', () => {
    expect(numberChoices().map((c) => c.example)).toEqual(['12.3M', '1.23e7', '12.3e6']);
  });
});

describe('reduced-motion override', () => {
  it('switches reduced-motion media blocks on or off', () => {
    expect(overrideMediaText('(prefers-reduced-motion: reduce)', 'reduced')).toBe('all');
    expect(overrideMediaText('(prefers-reduced-motion: reduce)', 'full')).toBe('not all');
    expect(overrideMediaText('(prefers-reduced-motion: no-preference)', 'full')).toBe('all');
    expect(overrideMediaText('(prefers-reduced-motion: no-preference)', 'reduced')).toBe('not all');
    expect(overrideMediaText('(prefers-reduced-motion: reduce)', 'system')).toBe(
      '(prefers-reduced-motion: reduce)',
    );
    expect(overrideMediaText('(max-width: 1100px)', 'reduced')).toBeNull();
  });

  it('answers script queries with the override', () => {
    expect(overrideMatches('(prefers-reduced-motion: reduce)', 'reduced')).toBe(true);
    expect(overrideMatches('(prefers-reduced-motion: reduce)', 'full')).toBe(false);
    expect(overrideMatches('(prefers-reduced-motion: no-preference)', 'full')).toBe(true);
    expect(overrideMatches('(prefers-reduced-motion: reduce)', 'system')).toBeNull();
    expect(overrideMatches('(max-width: 1120px)', 'reduced')).toBeNull();
  });
});

describe('log ring', () => {
  it('keeps the newest lines with a timestamp and level', () => {
    const ring = createLogRing(3, () => new Date('2026-11-07T10:00:00Z'));
    for (let i = 1; i <= 5; i++) ring.push('info', [`line ${i}`]);
    ring.push('error', [new Error('boom'), { a: 1 }]);
    const tail = ring.tail(10);
    expect(tail).toHaveLength(3);
    expect(tail[0]).toBe('2026-11-07T10:00:00.000Z [info] line 4');
    expect(tail[2]).toMatch(/^2026-11-07T10:00:00.000Z \[error\] Error: boom .*\{"a":1\}$/);
    expect(ring.tail(1)).toEqual([tail[2]]);
    expect(ring.tail(0)).toEqual([]);
  });
});

describe('save summary', () => {
  it('reads play time, ascensions, the hardest cleared dungeon and the save version', () => {
    const state = freshState();
    expect(saveSummary(state, content)).toEqual({
      playTime: '0s',
      prestigeCount: 0,
      highestDungeon: null,
      saveVersion: CURRENT_SAVE_VERSION,
    });
    const [first, second] = content.dungeons;
    const later = {
      ...state,
      prestigeCount: 2,
      clearedDungeons: [second!.id, first!.id],
      stats: { ...state.stats, playTimeMs: (14 * 60 + 3) * 60_000 },
    };
    const s = saveSummary(later, content);
    expect(s.highestDungeon).toBe(second!.name);
    expect(s.playTime).toBe('14h 3m');
    expect(summaryLine(s)).toBe(`14h 3m played, 2 ascensions, furthest dungeon ${second!.name}`);
  });
});

describe('report an issue', () => {
  const info = (log: string[]): IssueInfo => ({
    appVersion: 'v0.3.0',
    save: { playTime: '14h 3m', prestigeCount: 2, highestDungeon: 'Ember Crypt', saveVersion: 13 },
    system: systemFromUserAgent(UA),
    log,
  });

  it('reads OS, Electron and Chrome from the user agent', () => {
    expect(systemFromUserAgent(UA)).toEqual({
      os: 'Windows NT 10.0 (x64)',
      electron: '45.2.3',
      chrome: '142.0.7444.59',
    });
    expect(systemFromUserAgent('something else').electron).toBe('unknown');
  });

  it('pre-fills title and body on the repo new-issue page', () => {
    const url = new URL(buildIssueUrl(info(['a', 'b'])));
    expect(`${url.origin}${url.pathname}`).toBe(ISSUE_URL);
    expect(url.searchParams.get('title')).toBe('Bug report (v0.3.0): ');
    const body = url.searchParams.get('body')!;
    for (const part of [
      'App version: v0.3.0',
      'OS: Windows NT 10.0 (x64)',
      'Electron: 45.2.3 (Chrome 142.0.7444.59)',
      'Save version: 13',
      'Play time: 14h 3m',
      'Ascensions: 2',
      'Highest dungeon cleared: Ember Crypt',
      'Recent log (last 2 lines)',
      '```text\na\nb\n```',
    ]) {
      expect(body).toContain(part);
    }
  });

  it('uses only the last 50 log lines', () => {
    const log = Array.from({ length: 80 }, (_, i) => `line ${i}`);
    const body = new URL(buildIssueUrl(info(log), 100_000)).searchParams.get('body')!;
    expect(body).toContain(`last ${LOG_LINES} lines)`);
    expect(body).not.toContain('line 29\n');
    expect(body).toContain('line 30\n');
    expect(body).toContain('line 79\n');
  });

  it('drops the oldest log lines to stay under the URL limit', () => {
    const log = Array.from({ length: 50 }, (_, i) => `${i} ${'x'.repeat(250)}`);
    const url = buildIssueUrl(info(log));
    expect(url.length).toBeLessThanOrEqual(7500);
    const body = new URL(url).searchParams.get('body')!;
    expect(body).toMatch(/older left out to fit the link/);
    expect(body).toContain(`49 ${'x'.repeat(250)}`);
    expect(body).not.toContain(`\n0 ${'x'}`);
  });

  it('shortens very long log lines', () => {
    const body = issueBody(info([]), []);
    expect(body).toContain('Recent log (last 0 lines)');
    const url = buildIssueUrl(info(['y'.repeat(2000)]), 100_000);
    const text = new URL(url).searchParams.get('body')!;
    expect(text).toContain(`${'y'.repeat(299)}…`);
    expect(text).not.toContain('y'.repeat(300));
  });
});
