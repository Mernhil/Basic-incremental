import { describe, expect, it } from 'vitest';
import { loadBestSave } from '../src/game';
import {
  createWebSaveStore,
  WEB_SAVE_KEYS,
  type KeyValueStorage,
} from '../src/renderer/src/web/webSaveStore';
import { createBrowserApi } from '../src/renderer/src/web/browserApi';
import { createSaveText, createInitialState } from '../src/game';
import { plainContent } from './helpers';

function memoryStorage(): KeyValueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
}

describe('createWebSaveStore', () => {
  it('returns nulls when nothing was saved yet', () => {
    expect(createWebSaveStore(memoryStorage()).read()).toEqual({ primary: null, backup: null });
  });

  it('round-trips text', () => {
    const store = createWebSaveStore(memoryStorage());
    store.write('{"a":1}');
    expect(store.read()).toEqual({ primary: '{"a":1}', backup: null });
  });

  it('keeps the previous valid save as the backup', () => {
    const store = createWebSaveStore(memoryStorage());
    store.write('{"n":1}');
    store.write('{"n":2}');
    expect(store.read()).toEqual({ primary: '{"n":2}', backup: '{"n":1}' });
  });

  it('never replaces a good backup with a corrupted save, and keeps the damaged one aside', () => {
    const storage = memoryStorage();
    const store = createWebSaveStore(storage);
    store.write('{"n":1}');
    store.write('{"n":2}');
    storage.data.set(WEB_SAVE_KEYS.primary, '{broken');
    store.write('{"n":3}');
    expect(store.read()).toEqual({ primary: '{"n":3}', backup: '{"n":1}' });
    expect(storage.data.get(WEB_SAVE_KEYS.corrupt)).toBe('{broken');
  });

  it('falls back to the backup when the main save is corrupted, like desktop', () => {
    const content = plainContent;
    const good = createSaveText(createInitialState(content), 1000);
    const storage = memoryStorage();
    storage.data.set(WEB_SAVE_KEYS.primary, '{broken');
    storage.data.set(WEB_SAVE_KEYS.backup, good);
    const files = createWebSaveStore(storage).read();
    const best = loadBestSave(files.primary, files.backup, content);
    expect(best.save).not.toBeNull();
  });

  it('rejects the write when the storage refuses it', async () => {
    const api = createBrowserApi({
      storage: {
        getItem: () => null,
        setItem: () => {
          throw new Error('quota');
        },
      },
      version: '1.2.3',
      pageEvents: { onHide: () => undefined },
      logTail: () => [],
      system: { os: 'web', osRelease: '', arch: 'web', electron: '', chrome: '' },
    });
    await expect(api.writeSave('{}')).rejects.toThrow('quota');
    await expect(api.getVersion()).resolves.toBe('1.2.3');
    await expect(api.devCheatsEnabled()).resolves.toBe(false);
  });
});
