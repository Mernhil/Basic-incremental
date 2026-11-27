import type { SaveFiles } from '../../../preload/api';

/** The part of `localStorage` the save store uses (so tests can pass a plain in-memory object). */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface WebSaveStore {
  read(): SaveFiles;
  /** Throws when the browser refuses the write (full or blocked storage). */
  write(text: string): void;
  /** Copies the saves that could not be loaded to `bi:save.unreadable-<stamp>` keys; true when
   *  something was kept. */
  keepUnreadable(stamp: string): boolean;
}

export const WEB_SAVE_KEYS = {
  primary: 'bi:save',
  backup: 'bi:save.bak',
  corrupt: 'bi:save.corrupt',
} as const;

function readOrNull(storage: KeyValueStorage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function isJson(text: string | null): boolean {
  if (text === null) return false;
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * The browser twin of the desktop `createSaveStore` (`src/main/saveStore.ts`): the same three
 * slots (save, backup, corrupt copy) and the same rule. The previous save becomes the backup
 * only when it is valid JSON, a damaged one is kept aside, so a corrupted main save can never
 * overwrite a good backup. The text is stored as it is; versions and migrations stay in the game.
 */
export function createWebSaveStore(storage: KeyValueStorage): WebSaveStore {
  return {
    read() {
      return {
        primary: readOrNull(storage, WEB_SAVE_KEYS.primary),
        backup: readOrNull(storage, WEB_SAVE_KEYS.backup),
      };
    },
    keepUnreadable(stamp) {
      let kept = false;
      for (const [key, suffix] of [
        [WEB_SAVE_KEYS.primary, ''],
        [WEB_SAVE_KEYS.backup, '.bak'],
      ] as const) {
        const text = readOrNull(storage, key);
        if (text === null) continue;
        storage.setItem(`bi:save.unreadable-${stamp}${suffix}`, text);
        kept = true;
      }
      return kept;
    },
    write(text) {
      const previous = readOrNull(storage, WEB_SAVE_KEYS.primary);
      if (previous !== null) {
        storage.setItem(isJson(previous) ? WEB_SAVE_KEYS.backup : WEB_SAVE_KEYS.corrupt, previous);
      }
      storage.setItem(WEB_SAVE_KEYS.primary, text);
    },
  };
}
