import { join } from 'node:path';
import { app, ipcMain, type BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../preload/api';
import { createFileLogger } from './fileLogger';
import { createSaveStore } from './saveStore';

/** How long to wait for the renderer's final save before closing anyway. */
const FLUSH_TIMEOUT_MS = 3000;

/** Registers the save IPC handlers. Saves live in `<userData>/saves`. */
export function setupSaveIpc(options: { devTools?: boolean } = {}): void {
  const store = createSaveStore(join(app.getPath('userData'), 'saves'));
  const log = createFileLogger(join(app.getPath('userData'), 'logs', 'saves.log'));

  ipcMain.handle(IPC_CHANNELS.readSave, () => store.read());
  ipcMain.handle(IPC_CHANNELS.keepUnreadableSave, () => store.keepUnreadable(new Date()));
  // Only where the dev cheats exist (a public release has no such handler at all).
  if (options.devTools) {
    ipcMain.handle(IPC_CHANNELS.devBackupSave, () => store.backupBeforeReset(new Date()));
    ipcMain.on(IPC_CHANNELS.devReloadView, (event) => event.sender.reloadIgnoringCache());
  }
  ipcMain.handle(IPC_CHANNELS.writeSave, (_event, text: unknown) => {
    if (typeof text !== 'string') throw new TypeError('Save text must be a string.');
    try {
      store.write(text);
    } catch (error) {
      log.error(error);
      throw error;
    }
  });
}

/**
 * Before a window closes, asks the renderer to write one last save. The close is held until
 * the renderer confirms (or the timeout passes), so quitting never loses recent progress.
 */
export function saveBeforeClose(win: BrowserWindow): void {
  let waiting = false;
  let allowClose = false;

  win.on('close', (event) => {
    if (allowClose) return;
    event.preventDefault();
    if (waiting) return;
    waiting = true;

    const finish = (): void => {
      ipcMain.removeListener(IPC_CHANNELS.flushDone, finish);
      clearTimeout(timer);
      allowClose = true;
      if (!win.isDestroyed()) win.close();
    };
    const timer = setTimeout(finish, FLUSH_TIMEOUT_MS);
    ipcMain.once(IPC_CHANNELS.flushDone, finish);
    try {
      win.webContents.send(IPC_CHANNELS.flushRequest);
    } catch {
      finish(); // renderer is gone; nothing to wait for
    }
  });
}
