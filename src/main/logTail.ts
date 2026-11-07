import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { SystemInfo } from '../preload/api';

/** The log files main writes in `userData/logs` (each may have a rotated `.old`). */
export const LOG_FILES = ['main.log', 'updater.log', 'saves.log'] as const;

const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;

interface Entry {
  stamp: string;
  order: number;
  lines: string[];
}

function readEntries(path: string, startOrder: number, out: Entry[]): number {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return startOrder;
  }
  let order = startOrder;
  for (const line of text.split(/\r?\n/)) {
    if (line === '') continue;
    const stamp = STAMP.exec(line)?.[0];
    const last = out[out.length - 1];
    // A line without a timestamp (a stack trace) belongs to the entry before it.
    if (!stamp && last && last.order >= startOrder) last.lines.push(line);
    else out.push({ stamp: stamp ?? '', order: order++, lines: [line] });
  }
  return order;
}

/**
 * The last `count` lines of main's logs (main, updater and saves, rotated files first), merged
 * by timestamp, oldest first. A multi-line entry stays in one piece and in order. Never throws.
 */
export function readLogTail(dir: string, count: number): string[] {
  if (!Number.isFinite(count) || count <= 0) return [];
  const entries: Entry[] = [];
  let order = 0;
  for (const file of LOG_FILES) {
    order = readEntries(join(dir, `${file}.old`), order, entries);
    order = readEntries(join(dir, file), order, entries);
  }
  entries.sort((a, b) => (a.stamp < b.stamp ? -1 : a.stamp > b.stamp ? 1 : a.order - b.order));
  const lines = entries.flatMap((e) => e.lines);
  return lines.slice(Math.max(0, lines.length - Math.floor(count)));
}

/** Builds the system info from `process.platform`, `os.release()`, `process.arch` and
 *  `process.versions`. */
export function systemInfo(source: {
  platform: string;
  release: string;
  arch: string;
  versions: Record<string, string | undefined>;
}): SystemInfo {
  return {
    os: source.platform,
    osRelease: source.release,
    arch: source.arch,
    electron: source.versions['electron'] ?? 'unknown',
    chrome: source.versions['chrome'] ?? 'unknown',
  };
}
