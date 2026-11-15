import { join } from 'node:path';
import { app, BrowserWindow, ipcMain } from 'electron';
import { autoUpdater } from 'electron-updater';
import { IPC_CHANNELS } from '../preload/api';
import { createFileLogger } from './fileLogger';
import { DEV_BUILD } from './buildFlag';

let updateReady = false;

function broadcastUpdateReady(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(IPC_CHANNELS.updateReady);
  }
}

/**
 * Registers the update IPC handlers (always) and, in packaged builds only, checks for
 * updates in the background. Every failure is logged and swallowed: being offline or
 * hitting a bad release must never crash or block the game.
 */
export function setupAutoUpdates(): void {
  const log = createFileLogger(join(app.getPath('userData'), 'logs', 'updater.log'));

  ipcMain.handle(IPC_CHANNELS.isUpdateReady, () => updateReady);
  ipcMain.on(IPC_CHANNELS.restartToInstall, () => {
    if (!updateReady) return;
    try {
      autoUpdater.quitAndInstall();
    } catch (error) {
      log.error(error);
    }
  });

  if (!app.isPackaged || DEV_BUILD) {
    log.info('Dev build: update checks are disabled.');
    return;
  }

  autoUpdater.logger = log;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => log.info('Checking for update'));
  autoUpdater.on('update-available', (info) => log.info(`Update available: ${info.version}`));
  autoUpdater.on('update-not-available', (info) =>
    log.info(`No update available (latest: ${info.version})`),
  );
  autoUpdater.on('download-progress', (p) =>
    log.debug(`Download progress: ${Math.round(p.percent)}%`),
  );
  autoUpdater.on('error', (error) => log.error(error));
  autoUpdater.on('update-downloaded', (info) => {
    log.info(`Update downloaded: ${info.version}`);
    updateReady = true;
    broadcastUpdateReady();
  });

  log.info(`App ${app.getVersion()} started; checking for updates`);
  // Fire and forget: the promise rejects when offline, which is expected.
  autoUpdater.checkForUpdates().catch((error: unknown) => log.error(error));
}
