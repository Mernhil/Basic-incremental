import type { AppApi, SystemInfo } from '../../../preload/api';
import { createWebSaveStore, type KeyValueStorage } from './webSaveStore';

/** The page events the flush-on-quit path listens to (a `window` and its `document`). */
export interface PageEvents {
  onHide(callback: () => void): void;
}

export interface BrowserApiOptions {
  storage: KeyValueStorage;
  version: string;
  /** Fires when the page is hidden or being closed (`visibilitychange` / `pagehide`). */
  pageEvents: PageEvents;
  logTail: (lines: number) => string[];
  system: SystemInfo;
}

/**
 * `window.api` for a plain browser (the phone build): saves in browser storage, no updater, no
 * dev cheats. Quitting has no "about to close", so the flush request fires when the page is
 * hidden or being closed instead. No DOM globals here, so tests can run it in Node.
 */
export function createBrowserApi(options: BrowserApiOptions): AppApi {
  const store = createWebSaveStore(options.storage);
  const flushListeners = new Set<() => void>();
  options.pageEvents.onHide(() => flushListeners.forEach((callback) => callback()));

  return {
    getVersion: () => Promise.resolve(options.version),
    isUpdateReady: () => Promise.resolve(false),
    onUpdateReady: () => () => undefined,
    restartToInstall: () => undefined,
    readSave: () => Promise.resolve(store.read()),
    writeSave: (text) => {
      try {
        store.write(text);
        return Promise.resolve();
      } catch (error) {
        return Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
    },
    onFlushRequest: (callback) => {
      flushListeners.add(callback);
      return () => {
        flushListeners.delete(callback);
      };
    },
    flushDone: () => undefined,
    devCheatsEnabled: () => Promise.resolve(false),
    devBackupSave: () => Promise.reject(new Error('Dev tools are not available in the web build')),
    devReloadView: () => undefined,
    readLogTail: (lines) => Promise.resolve(options.logTail(lines)),
    getSystemInfo: () => Promise.resolve(options.system),
  };
}
