/** A small ring of timestamped log lines (Report an issue, DESIGN.md 12.5). */

export const LOG_KEEP = 200;

export interface LogRing {
  push(level: string, parts: readonly unknown[]): void;
  /** The last `n` lines, oldest first. */
  tail(n: number): string[];
}

function text(value: unknown): string {
  if (value instanceof Error) return value.stack ?? `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

export function createLogRing(keep = LOG_KEEP, now: () => Date = () => new Date()): LogRing {
  const lines: string[] = [];
  return {
    push(level, parts) {
      const message = parts.map(text).join(' ').replace(/\s+/g, ' ').trim();
      lines.push(`${now().toISOString()} [${level}] ${message}`);
      if (lines.length > keep) lines.splice(0, lines.length - keep);
    },
    tail(n) {
      return n <= 0 ? [] : lines.slice(-n);
    },
  };
}
