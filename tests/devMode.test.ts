import { describe, expect, it } from 'vitest';
import { devCheatsEnabled, hiddenTestWindow } from '../src/main/devMode';
import { IPC_CHANNELS } from '../src/preload/api';

describe('dev cheats gating in the main process', () => {
  it('allows the cheats only when the app is not packaged', () => {
    expect(devCheatsEnabled({ isPackaged: false }, {})).toBe(true);
    expect(devCheatsEnabled({ isPackaged: true }, {})).toBe(false);
  });

  it('can be switched off in a dev build with BI_NO_CHEATS=1, never on in a packaged one', () => {
    expect(devCheatsEnabled({ isPackaged: false }, { BI_NO_CHEATS: '1' })).toBe(false);
    expect(devCheatsEnabled({ isPackaged: true }, { BI_NO_CHEATS: '0' })).toBe(false);
  });

  it('public packaged build = off, whatever the environment says', () => {
    expect(devCheatsEnabled({ isPackaged: true }, {}, false)).toBe(false);
    expect(devCheatsEnabled({ isPackaged: true }, { BI_DEV_BUILD: '1' }, false)).toBe(false);
  });

  it('dev packaged build = on (a build-time flag), BI_NO_CHEATS does not matter there', () => {
    expect(devCheatsEnabled({ isPackaged: true }, {}, true)).toBe(true);
  });

  it('unpackaged = on, with or without the build flag', () => {
    expect(devCheatsEnabled({ isPackaged: false }, {}, false)).toBe(true);
    expect(devCheatsEnabled({ isPackaged: false }, {}, true)).toBe(true);
  });

  it('the build flag is false outside the dev build script', async () => {
    const { DEV_BUILD } = await import('../src/main/buildFlag');
    expect(DEV_BUILD).toBe(false);
  });

  it('has an IPC channel the preload asks', () => {
    expect(IPC_CHANNELS.devCheatsEnabled).toBe('dev:cheats-enabled');
    expect(IPC_CHANNELS.devBackupSave).toBe('dev:backup-save');
    expect(IPC_CHANNELS.devReloadView).toBe('dev:reload-view');
  });
});

describe('off-screen test window', () => {
  it('is on only with BI_HIDDEN_WINDOW=1 in an unpackaged run', () => {
    expect(hiddenTestWindow({ isPackaged: false }, { BI_HIDDEN_WINDOW: '1' })).toBe(true);
    expect(hiddenTestWindow({ isPackaged: false }, {})).toBe(false);
    expect(hiddenTestWindow({ isPackaged: false }, { BI_HIDDEN_WINDOW: '0' })).toBe(false);
  });

  it('is ignored by a packaged build', () => {
    expect(hiddenTestWindow({ isPackaged: true }, { BI_HIDDEN_WINDOW: '1' })).toBe(false);
  });
});
