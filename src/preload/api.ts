/** Shape of the API exposed to the renderer as `window.api`. Keep this minimal and typed. */
export interface SaveFiles {
  /** Raw text of the main save, or null if there is none. */
  primary: string | null;
  /** Raw text of the previous save, or null. */
  backup: string | null;
}

export interface AppApi {
  getVersion(): Promise<string>;
  /** Whether an update has already been downloaded and is waiting for a restart. */
  isUpdateReady(): Promise<boolean>;
  /** Called when an update finishes downloading. Returns an unsubscribe function. */
  onUpdateReady(callback: () => void): () => void;
  /** Quits the app and installs the downloaded update. No-op if none is ready. */
  restartToInstall(): void;
  /** Reads the save files from the userData folder. */
  readSave(): Promise<SaveFiles>;
  /** Writes the save (backing up the previous one). Rejects if the write fails. */
  writeSave(text: string): Promise<void>;
  /** Called when the window is about to close: save now, then call `flushDone`. */
  onFlushRequest(callback: () => void): () => void;
  /** Tell the main process the final save is written, so the window can close. */
  flushDone(): void;
  /** Whether the dev cheats panel may show (dev builds only; always false in a release). */
  devCheatsEnabled(): Promise<boolean>;
  /** The last `lines` lines of main's logs (main.log + updater.log by time), oldest first. */
  readLogTail(lines: number): Promise<string[]>;
  /** OS, OS release, CPU architecture and the Electron / Chrome versions (for issue reports). */
  getSystemInfo(): Promise<SystemInfo>;
}

/** What `getSystemInfo` returns. */
export interface SystemInfo {
  /** `process.platform`, e.g. "win32". */
  os: string;
  /** `os.release()`, e.g. "10.0.26300". */
  osRelease: string;
  /** `process.arch`, e.g. "x64". */
  arch: string;
  electron: string;
  chrome: string;
}

export const IPC_CHANNELS = {
  getVersion: 'app:get-version',
  isUpdateReady: 'update:is-ready',
  updateReady: 'update:ready',
  restartToInstall: 'update:restart-to-install',
  readSave: 'save:read',
  writeSave: 'save:write',
  flushRequest: 'save:flush-request',
  flushDone: 'save:flush-done',
  devCheatsEnabled: 'dev:cheats-enabled',
  readLogTail: 'app:read-log-tail',
  getSystemInfo: 'app:get-system-info',
} as const;
