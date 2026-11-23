import { contextBridge, ipcRenderer, webFrame } from 'electron';
import { IPC_CHANNELS, type AppApi } from './api';

function subscribe(channel: string, callback: () => void): () => void {
  const listener = (): void => callback();
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const api: AppApi = {
  getVersion: () => ipcRenderer.invoke(IPC_CHANNELS.getVersion) as Promise<string>,
  isUpdateReady: () => ipcRenderer.invoke(IPC_CHANNELS.isUpdateReady) as Promise<boolean>,
  onUpdateReady: (callback) => subscribe(IPC_CHANNELS.updateReady, callback),
  restartToInstall: () => ipcRenderer.send(IPC_CHANNELS.restartToInstall),
  readSave: () => ipcRenderer.invoke(IPC_CHANNELS.readSave) as ReturnType<AppApi['readSave']>,
  writeSave: (text) => ipcRenderer.invoke(IPC_CHANNELS.writeSave, text) as Promise<void>,
  onFlushRequest: (callback) => subscribe(IPC_CHANNELS.flushRequest, callback),
  flushDone: () => ipcRenderer.send(IPC_CHANNELS.flushDone),
  devCheatsEnabled: () => ipcRenderer.invoke(IPC_CHANNELS.devCheatsEnabled) as Promise<boolean>,
  devBackupSave: () => ipcRenderer.invoke(IPC_CHANNELS.devBackupSave) as Promise<string | null>,
  devReloadView: () => ipcRenderer.send(IPC_CHANNELS.devReloadView),
  readLogTail: (lines) => ipcRenderer.invoke(IPC_CHANNELS.readLogTail, lines) as Promise<string[]>,
  // the page zoom that scales the whole UI to the window (renderer/ui/designScale.ts)
  getUiZoom: () => webFrame.getZoomFactor(),
  setUiZoom: (factor) => webFrame.setZoomFactor(factor),
  getSystemInfo: () =>
    ipcRenderer.invoke(IPC_CHANNELS.getSystemInfo) as ReturnType<AppApi['getSystemInfo']>,
};

// the user never zooms by hand: the game fits the window by itself
webFrame.setVisualZoomLevelLimits(1, 1);

contextBridge.exposeInMainWorld('api', api);
