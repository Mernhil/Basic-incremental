import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createSaveStore, stampName } from '../src/main/saveStore';

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), 'bi-backup-'));
  dirs.push(d);
  return d;
};

describe('backup before a dev reset', () => {
  it('copies the main save to a timestamped file and keeps the save', () => {
    const dir = tmp();
    const store = createSaveStore(dir);
    store.write('{"a":1}');
    const name = store.backupBeforeReset(new Date(2026, 10, 15, 16, 30, 5));
    expect(name).toBe('save.before-reset-2026-11-15_16-30-05.json');
    expect(readFileSync(join(dir, name!), 'utf8')).toBe('{"a":1}');
    expect(readFileSync(join(dir, 'save.json'), 'utf8')).toBe('{"a":1}');
  });

  it('does nothing when there is no save, and leaves older backups alone', () => {
    const dir = tmp();
    const store = createSaveStore(dir);
    expect(store.backupBeforeReset(new Date())).toBeNull();
    store.write('{"a":1}');
    const first = store.backupBeforeReset(new Date(2026, 0, 1, 0, 0, 0))!;
    writeFileSync(join(dir, 'save.json'), '{"a":2}');
    store.backupBeforeReset(new Date(2026, 0, 1, 0, 0, 1));
    expect(existsSync(join(dir, first))).toBe(true);
    expect(readFileSync(join(dir, first), 'utf8')).toBe('{"a":1}');
  });

  it('pads the timestamp', () => {
    expect(stampName(new Date(2026, 0, 2, 3, 4, 5))).toBe('2026-01-02_03-04-05');
  });
});
