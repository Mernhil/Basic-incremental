import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSaveStore } from '../src/main/saveStore';

describe('createSaveStore', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bi-save-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns nulls when nothing was saved yet', () => {
    expect(createSaveStore(join(dir, 'nested')).read()).toEqual({ primary: null, backup: null });
  });

  it('round-trips text and creates the folder', () => {
    const store = createSaveStore(join(dir, 'nested', 'saves'));
    store.write('{"a":1}');
    expect(store.read().primary).toBe('{"a":1}');
    expect(store.read().backup).toBeNull();
  });

  it('keeps the previous save as a backup before overwriting', () => {
    const store = createSaveStore(dir);
    store.write('{"n":1}');
    store.write('{"n":2}');
    store.write('{"n":3}');
    expect(store.read()).toEqual({ primary: '{"n":3}', backup: '{"n":2}' });
    expect(existsSync(join(dir, 'save.json.tmp'))).toBe(false);
  });

  it('does not let a corrupted main file overwrite a good backup', () => {
    const store = createSaveStore(dir);
    store.write('{"n":1}');
    store.write('{"n":2}'); // backup = n1
    writeFileSync(join(dir, 'save.json'), '{"n":2', 'utf8'); // corrupt the main file
    store.write('{"n":3}');
    expect(readFileSync(join(dir, 'save.bak.json'), 'utf8')).toBe('{"n":1}');
    expect(store.read().primary).toBe('{"n":3}');
    // the damaged file is preserved for manual recovery rather than destroyed
    expect(readFileSync(join(dir, 'save.corrupt.json'), 'utf8')).toBe('{"n":2');
  });
});

describe('createSaveStore.keepUnreadable', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'bi-keep-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('copies both files aside, so the first write of a new game cannot destroy them', () => {
    const store = createSaveStore(dir);
    store.write('{"version":999}');
    store.write('{"version":999,"n":2}'); // main = n2, backup = the first
    const name = store.keepUnreadable(new Date(2026, 10, 27, 12, 0, 0));
    expect(name).toBe('save.unreadable-2026-11-27_12-00-00.json');
    // the new game writes twice: the main file and the backup are both replaced
    store.write('{"version":47}');
    store.write('{"version":47,"fresh":true}');
    expect(readFileSync(join(dir, name!), 'utf8')).toBe('{"version":999,"n":2}');
    expect(readFileSync(join(dir, 'save.unreadable-2026-11-27_12-00-00.bak.json'), 'utf8')).toBe(
      '{"version":999}',
    );
  });

  it('keeps nothing when there is no file', () => {
    expect(createSaveStore(dir).keepUnreadable(new Date())).toBeNull();
  });
});
