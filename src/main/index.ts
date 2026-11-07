import { join } from 'node:path';
import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { GAME_TITLE } from '../game/meta';
import { IPC_CHANNELS } from '../preload/api';
import { setupSaveIpc, saveBeforeClose } from './saves';
import { setupAutoUpdates } from './updater';
import { devUserDataDir } from './devPaths';
import { devCheatsEnabled } from './devMode';

// Dev builds keep their own saves and settings, so running from source never touches the
// installed game's save (which may be an older version that cannot read a newer save format).
// BI_PROFILE / --bi-profile / BI_USER_DATA_DIR give parallel dev apps separate saves.
if (!app.isPackaged) {
  app.setPath('userData', devUserDataDir(app.getPath('appData'), process.env, process.argv));
}

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
  ipcMain.handle(IPC_CHANNELS.getVersion, () => app.getVersion());
  ipcMain.handle(IPC_CHANNELS.devCheatsEnabled, () => devCheatsEnabled(app, process.env));
  setupSaveIpc();
  createWindow();

  try {
    setupAutoUpdates();
  } catch (error) {
    console.error('Auto-update setup failed:', error);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
