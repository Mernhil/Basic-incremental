import { release } from 'node:os';
import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { GAME_TITLE } from '../game/meta';
import { IPC_CHANNELS } from '../preload/api';
import { setupSaveIpc, saveBeforeClose } from './saves';
import { setupAutoUpdates } from './updater';
import { devUserDataDir } from './devPaths';
import { devCheatsEnabled } from './devMode';
import { createFileLogger } from './fileLogger';
import { readLogTail, systemInfo } from './logTail';

// Dev builds keep their own saves and settings, so running from source never touches the
// installed game's save (which may be an older version that cannot read a newer save format).
// BI_PROFILE / --bi-profile / BI_USER_DATA_DIR give parallel dev apps separate saves.
if (!app.isPackaged) {
  app.setPath('userData', devUserDataDir(app.getPath('appData'), process.env, process.argv));
}

/** Where main's logs live (main.log, updater.log, saves.log). */
const logDir = (): string => join(app.getPath('userData'), 'logs');
const log = createFileLogger(join(logDir(), 'main.log'));

/** Most log lines the renderer can ask for at once. */
const MAX_TAIL_LINES = 1000;

// Observe only: the monitor logs without changing how Electron handles the crash.
process.on('uncaughtExceptionMonitor', (error) => log.error(error));
process.on('unhandledRejection', (reason) => {
  log.error(reason);
  console.error('Unhandled rejection:', reason);
});

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    title: GAME_TITLE,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.on('ready-to-show', () => win.show());
  saveBeforeClose(win);
  win.webContents.on('render-process-gone', (_event, details) =>
    log.error(`Renderer gone: ${details.reason} (exit code ${details.exitCode})`),
  );
  win.webContents.on('preload-error', (_event, path, error) =>
    log.error(`Preload error in ${path}: ${error.stack ?? error.message}`),
  );

  // Never open new Electron windows; send external links to the default browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event) => event.preventDefault());

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (!app.isPackaged && devUrl) {
    void win.loadURL(devUrl);
  } else {
    void win.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

void app.whenReady().then(() => {
  log.info(`App ${app.getVersion()} started (${app.isPackaged ? 'release' : 'dev'} build)`);
  ipcMain.handle(IPC_CHANNELS.getVersion, () => app.getVersion());
  ipcMain.handle(IPC_CHANNELS.devCheatsEnabled, () => devCheatsEnabled(app, process.env));
  ipcMain.handle(IPC_CHANNELS.readLogTail, (_event, lines: unknown) =>
    readLogTail(logDir(), Math.min(MAX_TAIL_LINES, typeof lines === 'number' ? lines : 0)),
  );
  ipcMain.handle(IPC_CHANNELS.getSystemInfo, () =>
    systemInfo({
      platform: process.platform,
      release: release(),
      arch: process.arch,
      versions: process.versions,
    }),
  );
  setupSaveIpc();
  createWindow();

  try {
    setupAutoUpdates();
  } catch (error) {
    log.error(error);
    console.error('Auto-update setup failed:', error);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
