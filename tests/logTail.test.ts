import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readLogTail, systemInfo } from '../src/main/logTail';
import { IPC_CHANNELS } from '../src/preload/api';

describe('readLogTail', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bi-tail-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns the last N lines of main.log and updater.log merged by time, oldest first', () => {
    writeFileSync(
      join(dir, 'main.log'),
      '2026-01-01T00:00:01.000Z [info] main a\n2026-01-01T00:00:03.000Z [error] main b\n',
    );
    writeFileSync(
      join(dir, 'updater.log'),
      '2026-01-01T00:00:02.000Z [info] up a\n2026-01-01T00:00:04.000Z [info] up b\n',
    );
    expect(readLogTail(dir, 3)).toEqual([
      '2026-01-01T00:00:02.000Z [info] up a',
      '2026-01-01T00:00:03.000Z [error] main b',
      '2026-01-01T00:00:04.000Z [info] up b',
    ]);
  });

  it('keeps a stack trace with its entry and reads the rotated .old file first', () => {
    writeFileSync(join(dir, 'main.log.old'), '2026-01-01T00:00:00.000Z [info] old\n');
    writeFileSync(
      join(dir, 'main.log'),
      '2026-01-01T00:00:05.000Z [error] Error: boom\n    at x (y.js:1)\n',
    );
    writeFileSync(join(dir, 'updater.log'), '2026-01-01T00:00:01.000Z [info] up\n');
    expect(readLogTail(dir, 10)).toEqual([
      '2026-01-01T00:00:00.000Z [info] old',
      '2026-01-01T00:00:01.000Z [info] up',
      '2026-01-01T00:00:05.000Z [error] Error: boom',
      '    at x (y.js:1)',
    ]);
  });

  it('is empty without logs, and for a bad count', () => {
    expect(readLogTail(join(dir, 'missing'), 50)).toEqual([]);
    writeFileSync(join(dir, 'main.log'), '2026-01-01T00:00:00.000Z [info] x\n');
    expect(readLogTail(dir, 0)).toEqual([]);
    expect(readLogTail(dir, Number.NaN)).toEqual([]);
  });
});

describe('systemInfo', () => {
  it('reports the OS, release, architecture and Electron / Chrome versions', () => {
    expect(
      systemInfo({
        platform: 'win32',
        release: '10.0.26300',
        arch: 'x64',
        versions: { electron: '45.2.3', chrome: '142.0.0.0' },
      }),
    ).toEqual({
      os: 'win32',
      osRelease: '10.0.26300',
      arch: 'x64',
      electron: '45.2.3',
      chrome: '142.0.0.0',
    });
  });

  it('has IPC channels for the log tail and the system info', () => {
    expect(IPC_CHANNELS.readLogTail).toBe('app:read-log-tail');
    expect(IPC_CHANNELS.getSystemInfo).toBe('app:get-system-info');
  });
});
