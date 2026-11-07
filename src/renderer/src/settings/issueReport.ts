/**
 * Report an issue (DESIGN.md 12.5): a pre-filled GitHub "new issue" link with the app version,
 * a save summary, OS and Electron version and the last log lines. The player edits it on GitHub
 * before submitting. The link stays under GitHub's URL limit by leaving out the oldest log lines.
 */

export const ISSUE_URL = 'https://github.com/Mernhil/Basic-incremental/issues/new';
/** GitHub rejects much longer links (about 8 KB); keep a margin. */
export const MAX_ISSUE_URL = 7500;
export const LOG_LINES = 50;
const MAX_LINE = 300;

export interface SaveSummary {
  playTime: string;
  prestigeCount: number;
  /** Name of the hardest dungeon cleared, or null when none is. */
  highestDungeon: string | null;
  saveVersion: number;
}

export interface SystemInfo {
  os: string;
  electron: string;
  chrome: string;
}

export interface IssueInfo {
  appVersion: string;
  save: SaveSummary;
  system: SystemInfo;
  /** Recent log lines, oldest first; only the last LOG_LINES are used. */
  log: readonly string[];
}

/** OS, Electron and Chrome versions from the window's user agent. */
export function systemFromUserAgent(ua: string): SystemInfo {
  const win = /Windows NT ([\d.]+)(?:;\s*(Win64|WOW64))?(?:;\s*(x64|arm64))?/i.exec(ua);
  const mac = /Mac OS X ([\d_]+)/i.exec(ua);
  const os = win
    ? `Windows NT ${win[1]}${win[3] ? ` (${win[3]})` : win[2] ? ' (x64)' : ''}`
    : mac
      ? `macOS ${mac[1]!.replace(/_/g, '.')}`
      : /Linux/i.test(ua)
        ? 'Linux'
        : 'unknown';
  return {
    os,
    electron: /Electron\/([\d.]+)/.exec(ua)?.[1] ?? 'unknown',
    chrome: /Chrome\/([\d.]+)/.exec(ua)?.[1] ?? 'unknown',
  };
}

export function issueTitle(appVersion: string): string {
  return `Bug report (${appVersion}): `;
}

/** The issue body. `dropped` older log lines are noted as left out. */
export function issueBody(info: IssueInfo, log: readonly string[], dropped = 0): string {
  const s = info.save;
  const lines = [
    '### What happened?',
    '',
    '<!-- Describe the problem and what you expected instead. Steps to reproduce help a lot. -->',
    '',
    '',
    '### Game info',
    '',
    `- App version: ${info.appVersion}`,
    `- OS: ${info.system.os}`,
    `- Electron: ${info.system.electron} (Chrome ${info.system.chrome})`,
    `- Save version: ${s.saveVersion}`,
    `- Play time: ${s.playTime}`,
    `- Ascensions: ${s.prestigeCount}`,
    `- Highest dungeon cleared: ${s.highestDungeon ?? 'none yet'}`,
    '',
    `### Recent log (last ${log.length} lines${dropped > 0 ? `, ${dropped} older left out to fit the link` : ''})`,
    '',
    '```text',
    ...log,
    '```',
  ];
  return lines.join('\n');
}

function link(title: string, body: string): string {
  return `${ISSUE_URL}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

/** The full issue link, with as many of the last log lines as fit under `maxLength`. */
export function buildIssueUrl(info: IssueInfo, maxLength = MAX_ISSUE_URL): string {
  const title = issueTitle(info.appVersion);
  const log = info.log
    .slice(-LOG_LINES)
    .map((l) => (l.length > MAX_LINE ? `${l.slice(0, MAX_LINE - 1)}…` : l));
  // drop the oldest lines until the link fits (binary search: links grow with every line)
  let lo = 0;
  let hi = log.length;
  const fits = (drop: number): boolean =>
    link(title, issueBody(info, log.slice(drop), drop)).length <= maxLength;
  if (fits(0)) return link(title, issueBody(info, log, 0));
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (fits(mid)) hi = mid;
    else lo = mid + 1;
  }
  return link(title, issueBody(info, log.slice(lo), lo));
}
